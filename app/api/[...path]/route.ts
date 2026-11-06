import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { compare, getComparison, history } from "@/lib/comparisons";
import { comparisonInput, id, uploadInput } from "@/lib/contracts";
import { RequestError } from "@/lib/errors";
import { ingest, library, loadDemo, maxPdfBytes, pdf, renderSourcePage, uploadVersion, versionForIngest } from "@/lib/ingestion";
import { openAiEnabled } from "@/lib/model";

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

export async function GET(_request: Request, context: Context) {
  try {
    const [resource, value, ...rest] = (await context.params).path;
    if (resource === "pdf" && value && rest.length === 1) {
      const page = Number(rest[0]);
      if (!/^\d{1,3}$/.test(rest[0]) || page < 1 || page > 160) throw new RequestError("Page not found.", 404);
      return new Response(new Uint8Array(await renderSourcePage(id.parse(value), page)), { headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      } });
    }
    if (rest.length) throw new RequestError("Resource not found.", 404);
    if (resource === "workspace" && !value) {
      const demoOnly = process.env.POLICYDIFF_DEMO_ONLY === "1";
      const [policies, comparisons] = await Promise.all([library(), history()]);
      return NextResponse.json({
        policies: demoOnly ? policies.filter((policy) => policy.demo) : policies,
        comparisons, demoOnly, openAi: openAiEnabled(),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (resource === "comparisons" && value) return NextResponse.json(await getComparison(id.parse(value)));
    if (resource === "pdf" && value) {
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

export async function POST(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin && URL.parse(origin)?.host !== request.headers.get("host"))) {
      throw new RequestError("Cross-origin requests are disabled.", 403);
    }
    const [resource, value, ...rest] = (await context.params).path;
    if (rest.length) throw new RequestError("Resource not found.", 404);
    if (resource === "demo" && !value) return NextResponse.json({ versions: await loadDemo() });
    if (resource === "versions" && !value) {
      if (process.env.POLICYDIFF_DEMO_ONLY === "1") throw new RequestError("Uploads are disabled in demo mode.", 403);
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length <= 0) throw new RequestError("The upload must include a content length.", 411);
      if (length > maxPdfBytes + 65_536) throw new RequestError("Choose a PDF of up to 12 MB.", 413);
      const form = await request.formData();
      const input = uploadInput.parse({
        policyId: form.get("policyId") || undefined, name: form.get("name") || undefined,
        label: form.get("label"), effectiveOn: form.get("effectiveOn"),
      });
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf") || file.size > maxPdfBytes) {
        throw new RequestError("Choose a PDF of up to 12 MB.");
      }
      const result = await uploadVersion(input, new Uint8Array(await file.arrayBuffer()));
      return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    }
    if (resource === "ingest" && value) {
      const versionId = id.parse(value);
      await versionForIngest(versionId);
      return NextResponse.json(await ingest(versionId));
    }
    if (resource === "comparisons" && !value) {
      const text = await request.text();
      if (text.length > 4096) throw new RequestError("Comparison request is too large.", 413);
      return NextResponse.json(await compare(comparisonInput.parse(JSON.parse(text))), { status: 201 });
    }
    throw new RequestError("Resource not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
