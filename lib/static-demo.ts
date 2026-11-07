import { readFile } from "node:fs/promises";
import path from "node:path";
import { RequestError } from "./errors";
import { comparisonInput, type Comparison, type ComparisonSummary, type Policy } from "./contracts";
import { readJsonBody } from "./http";

type Snapshot = {
  workspace: { policies: Policy[]; comparisons: ComparisonSummary[]; demoOnly: boolean; openRouter: boolean; staticDemo: boolean; temporary: boolean; maxPdfMb: number };
  comparison: Comparison;
  aiComparison: Comparison;
  files: Record<string, { file: string; pages: number[] }>;
};
let snapshot: Promise<Snapshot> | undefined;
export const staticDemo = () => process.env.POLICYDIFF_STATIC_DEMO === "1";
async function sample() {
  snapshot ??= readFile(path.resolve("demo/web/snapshot.json"), "utf8").then((text) => JSON.parse(text) as Snapshot);
  return snapshot;
}

export async function staticGet(parts: string[]) {
  const data = await sample();
  const [resource, value, page, ...rest] = parts;
  if (rest.length) throw new RequestError("Resource not found.", 404);
  if (resource === "workspace" && !value) return Response.json(data.workspace);
  if (resource === "comparisons" && !page) {
    const result = [data.comparison, data.aiComparison].find((item) => item.id === value);
    if (result) return Response.json(result);
  }
  if (resource === "pdf" && value) {
    const file = Object.hasOwn(data.files, value) ? data.files[value] : undefined;
    if (!file) throw new RequestError("Document not found.", 404);
    if (page && !file.pages.includes(Number(page))) throw new RequestError("This page has no preview in the prepared demo. Open the original PDF.", 404);
    const filename = page ? path.join("web", "pages", file.file.replace(".pdf", "-" + Number(page) + ".png")) : file.file;
    return new Response(new Uint8Array(await readFile(path.resolve("demo", filename))), { headers: {
      "Content-Type": page ? "image/png" : "application/pdf", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff",
    } });
  }
  throw new RequestError("Resource not found.", 404);
}

export async function staticPost(parts: string[], request: Request) {
  const data = await sample();
  if (parts.length !== 1) throw new RequestError("Resource not found.", 404);
  if (parts[0] === "demo") return Response.json({ versions: [data.comparison.old_id, data.comparison.new_id] });
  if (parts[0] === "comparisons") {
    const input = comparisonInput.parse(await readJsonBody(request, 4096));
    if (input.oldId !== data.comparison.old_id || input.newId !== data.comparison.new_id ||
        input.question.toLowerCase() !== data.comparison.question.toLowerCase()) {
      throw new RequestError("This prepared demo shows the example question. Custom questions and uploads will be enabled after the database connection is complete.", 422);
    }
    return Response.json(input.mode === "openrouter" ? data.aiComparison : data.comparison, { status: 201 });
  }
  throw new RequestError("Personal uploads are awaiting the hosted database connection. You can try the prepared OAP 1 comparison.", 403);
}

