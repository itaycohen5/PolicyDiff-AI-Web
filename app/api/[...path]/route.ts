import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { compare, getComparison, history } from "@/lib/comparisons";
import { comparisonInput, id, uploadInput } from "@/lib/contracts";
import { RequestError } from "@/lib/errors";
import { ingest, library, loadDemo, maxPdfBytes, pdf, renderSourcePage, uploadVersion, versionForIngest } from "@/lib/ingestion";
import { openRouterEnabled } from "@/lib/model";
import { clearWorkspace, cloudMode, demoOnly, publicBudget, purgeExpiredWorkspaces, unlockWorkspace, workspaceRequest } from "@/lib/workspace";
import { staticDemo, staticGet, staticPost } from "@/lib/static-demo";
import { readJsonBody, readRequestBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

function fail(error: unknown) {
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  console.error("PolicyDiff API error", error);
  return NextResponse.json({ error: "The request failed. Check the server log and try again." }, { status: 500 });
}

async function getResource(_request: Request, context: Context) {
  try {
    if (staticDemo()) return await staticGet((await context.params).path);
    const [resource, value, ...rest] = (await context.params).path;
    if (resource === "pdf" && value && rest.length === 1) {
      const page = Number(rest[0]);
      if (!/^\d{1,3}$/.test(rest[0]) || page < 1 || page > 160) throw new RequestError("Page not found.", 404);
      await publicBudget(_request, "source");
      return new Response(new Uint8Array(await renderSourcePage(id.parse(value), page)), { headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    if (rest.length) throw new RequestError("Resource not found.", 404);
    if (resource === "workspace" && !value) {
      const onlyDemo = demoOnly();
      const [policies, comparisons] = await Promise.all([library(), history()]);
      return NextResponse.json({
        policies: onlyDemo ? policies.filter((policy) => policy.demo) : policies,
        comparisons, demoOnly: onlyDemo, openRouter: openRouterEnabled(),
        temporary: cloudMode(), requiresAccessCode: cloudMode() && onlyDemo,
        maxPdfMb: maxPdfBytes / (1024 * 1024),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (resource === "comparisons" && value) return NextResponse.json(await getComparison(id.parse(value)));
    if (resource === "pdf" && value) {
      await publicBudget(_request, "source");
      return new Response(new Uint8Array(await pdf(id.parse(value))), { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="policy.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    throw new RequestError("Resource not found.", 404);
  } catch (error) {
    return fail(error);
  }
}

async function postResource(request: Request, context: Context) {
  try {
    const [resource, value, ...rest] = (await context.params).path;
    if (staticDemo()) return await staticPost((await context.params).path, request);
    if (rest.length) throw new RequestError("Resource not found.", 404);
    if (resource === "access" && !value) {
      const input = z.object({ code: z.string().max(128) }).parse(await readJsonBody(request, 1024));
      unlockWorkspace(input.code);
      return NextResponse.json({ unlocked: true });
    }
    if (resource === "clear" && !value) {
      await clearWorkspace();
      return NextResponse.json({ cleared: true });
    }
    if (resource === "demo" && !value) {
      await publicBudget(request, "demo");
      return NextResponse.json({ versions: await loadDemo() });
    }
    if (resource === "versions" && !value) {
      if (demoOnly()) throw new RequestError("Uploads are disabled in demo mode. Unlock the hosted workspace to use your own PDFs.", 403);
      await publicBudget(request, "upload");
      const body = await readRequestBody(request, maxPdfBytes + 65_536);
      let form: FormData;
      try {
        form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
      } catch {
        throw new RequestError("Invalid upload form. Choose the PDF and submit again.", 400);
      }
      const input = uploadInput.parse({
        policyId: form.get("policyId") || undefined, name: form.get("name") || undefined,
        label: form.get("label"), effectiveOn: form.get("effectiveOn"),
      });
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf") || file.size > maxPdfBytes) {
        throw new RequestError(`Choose a PDF of up to ${maxPdfBytes / (1024 * 1024)} MB.`);
      }
      const result = await uploadVersion(input, new Uint8Array(await file.arrayBuffer()));
      return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    }
    if (resource === "ingest" && value) {
      const versionId = id.parse(value);
      await versionForIngest(versionId);
      await publicBudget(request, "ingest");
      return NextResponse.json(await ingest(versionId));
    }
    if (resource === "comparisons" && !value) {
      await publicBudget(request, "comparison");
      return NextResponse.json(await compare(comparisonInput.parse(await readJsonBody(request, 4096))), { status: 201 });
    }
    throw new RequestError("Resource not found.", 404);
  } catch (error) {
    return fail(error);
  }
}

export function GET(request: Request, context: Context) {
  return workspaceRequest(request, () => getResource(request, context));
}

export function POST(request: Request, context: Context) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && URL.parse(origin)?.host !== request.headers.get("host"))) {
    return Promise.resolve(fail(new RequestError("Cross-origin requests are disabled.", 403)));
  }
  return workspaceRequest(request, async () => {
    if (cloudMode()) await purgeExpiredWorkspaces();
    return postResource(request, context);
  });
}
