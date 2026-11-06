import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "./db";
import { embeddings, vectorLiteral } from "./embedding";
import { RequestError } from "./errors";
import type { Policy, Status, UploadInput, Version } from "./contracts";

export const maxPdfBytes = 12 * 1024 * 1024;
const parsed = z.object({
  pageCount: z.number().int().positive(),
  chunks: z.array(z.object({ page: z.number().int().positive(), section: z.string(), body: z.string().min(1) })).min(1),
});

function runPdfWorker(script: "extract.py" | "render_page.py", bytes: Uint8Array, args: string[], action: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const localPackages = path.resolve(".python");
    const child = spawn(/* turbopackIgnore: true */ process.env.PYTHON_BIN || "python", [path.resolve("worker", script), ...args], {
      windowsHide: true,
      timeout: 45_000,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PYTHONPATH: [localPackages, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
        PYTHONIOENCODING: "utf-8",
      },
    });
    const output: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (data: Buffer) => { output.push(data); });
    child.stderr.setEncoding("utf8").on("data", (data: string) => { errors = (errors + data).slice(-2000); });
    child.stdin.on("error", () => { /* Close status reports startup and parser failures. */ });
    child.on("error", () => reject(new Error("Python could not start. Follow the setup steps in the README.")));
    child.on("close", (code, signal) => {
      if (code !== 0) {
        const message = code === 2 ? errors.trim().split("\n").at(-1)
          : signal ? action + " timed out." : action + " failed. Check the Python setup.";
        reject(new Error(message || action + " failed."));
        return;
      }
      resolve(Buffer.concat(output));
    });
    child.stdin.end(bytes);
  });
}

export async function extractPdf(bytes: Uint8Array) {
  const output = await runPdfWorker("extract.py", bytes, [], "PDF extraction");
  try {
    return parsed.parse(JSON.parse(output.toString("utf8")));
  } catch {
    throw new Error("The PDF extractor returned invalid data.");
  }
}

export async function renderSourcePage(version: string, page: number) {
  const bytes = await pdf(version);
  try {
    return await runPdfWorker("render_page.py", bytes, [String(page)], "PDF page preview");
  } catch (error) {
    if (error instanceof Error && error.message === "Page not found in this PDF.") {
      throw new RequestError(error.message, 404);
    }
    throw error;
  }
}

export async function uploadVersion(input: UploadInput, bytes: Uint8Array, demoUrl?: string) {
  if (bytes.length < 5 || bytes.length > maxPdfBytes || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
    throw new RequestError("Choose a PDF of up to 12 MB.");
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const store = await db();
  return store.transaction(async (tx) => {
    let policyId = input.policyId;
    if (!policyId) {
      const { rows } = await tx.query<{id: string}>(`
        INSERT INTO policies (name, demo) VALUES ($1, $2)
        ON CONFLICT (name, demo) DO UPDATE SET name = EXCLUDED.name RETURNING id
      `, [input.name, Boolean(demoUrl)]);
      policyId = rows[0].id;
    }
    const { rows: [policy] } = await tx.query<{demo: boolean}>("SELECT demo FROM policies WHERE id = $1 FOR UPDATE", [policyId]);
    if (!policy) throw new RequestError("Policy not found.", 404);
    if (policy.demo !== Boolean(demoUrl)) throw new RequestError("Demo policies are read-only.", 403);

    const { rows: [duplicate] } = await tx.query<{id: string}>(
      "SELECT id FROM versions WHERE policy_id = $1 AND sha256 = $2", [policyId, sha],
    );
    if (duplicate) return { id: duplicate.id, duplicate: true };
    const { rows: [version] } = await tx.query<{id: string}>(`
      INSERT INTO versions (policy_id, label, effective_on, sha256, pdf, source_url)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (policy_id, label) DO NOTHING RETURNING id
    `, [policyId, input.label, input.effectiveOn, sha, bytes, demoUrl ?? null]);
    if (!version) throw new RequestError("A different PDF already uses this version name.", 409);
    await tx.query("INSERT INTO ingestion_jobs (version_id) VALUES ($1)", [version.id]);
    return { id: version.id, duplicate: false };
  });
}

export async function ingest(id: string): Promise<{status: Status; error?: string}> {
  const store = await db();
  const claim = randomUUID();
  const { rows: [job] } = await store.query<{version_id: string}>(`
    UPDATE ingestion_jobs SET status = 'processing', attempts = attempts + 1,
      claim = $2, lease_until = now() + interval '5 minutes', error = null, updated_at = now()
    WHERE version_id = $1 AND (
      status IN ('queued', 'failed') OR (status = 'processing' AND lease_until < now())
    ) RETURNING version_id
  `, [id, claim]);
  if (!job) {
    const { rows: [existing] } = await store.query<{status: Status}>(
      "SELECT status FROM ingestion_jobs WHERE version_id = $1", [id],
    );
    if (!existing) throw new RequestError("Version not found.", 404);
    return existing;
  }
  try {
    const { rows: [version] } = await store.query<{pdf: Uint8Array}>("SELECT pdf FROM versions WHERE id = $1", [id]);
    const result = await extractPdf(version.pdf);
    let vectors: number[][];
    try {
      vectors = await embeddings(result.chunks.map((chunk) => chunk.body));
    } catch (error) {
      console.error("Embedding failed", error);
      throw new Error("The local embedding model could not load. Run npm run setup:model and retry.");
    }
    return await store.transaction(async (tx) => {
      const { rows } = await tx.query(
        "SELECT version_id FROM ingestion_jobs WHERE version_id = $1 AND claim = $2 FOR UPDATE", [id, claim],
      );
      if (!rows.length) return { status: "processing" };
      await tx.query("DELETE FROM chunks WHERE version_id = $1", [id]);
      const records = result.chunks.map((chunk, ordinal) => ({ ...chunk, ordinal, embedding: vectorLiteral(vectors[ordinal]) }));
      await tx.query(`
        INSERT INTO chunks (version_id, ordinal, page, section, body, embedding)
        SELECT $1, ordinal, page, section, body, embedding::vector
        FROM jsonb_to_recordset($2::jsonb) AS c(ordinal integer, page integer, section text, body text, embedding text)
      `, [id, JSON.stringify(records)]);
      await tx.query("UPDATE versions SET page_count = $2 WHERE id = $1", [id, result.pageCount]);
      await tx.query(`
        UPDATE ingestion_jobs SET status = 'ready', claim = null, lease_until = null, updated_at = now()
        WHERE version_id = $1
      `, [id]);
      return { status: "ready" };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 350) : "Ingestion failed.";
    const { rows } = await store.query(`
      UPDATE ingestion_jobs SET status = 'failed', error = $3, claim = null, lease_until = null, updated_at = now()
      WHERE version_id = $1 AND claim = $2 RETURNING version_id
    `, [id, claim, message]);
    return rows.length ? { status: "failed", error: message } : { status: "processing" };
  }
}

export async function library() {
  const store = await db();
  const { rows } = await store.query<Policy>(`
    SELECT p.id, p.name, p.demo,
      coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.effective_on, v.label) FILTER (WHERE v.id IS NOT NULL), '[]') AS versions
    FROM policies p LEFT JOIN LATERAL (
      SELECT v.id, v.label, v.effective_on::text, v.page_count, v.source_url, j.status, j.attempts, j.error,
        (j.status IN ('queued','failed') OR coalesce(j.lease_until < now(), false)) AS can_resume
      FROM versions v JOIN ingestion_jobs j ON j.version_id = v.id WHERE v.policy_id = p.id
    ) v ON true
    GROUP BY p.id ORDER BY p.demo DESC, p.name
  `);
  return rows;
}

export async function pdf(id: string) {
  const store = await db();
  const { rows: [record] } = await store.query<{pdf: Uint8Array; demo: boolean}>(
    "SELECT v.pdf, p.demo FROM versions v JOIN policies p ON v.policy_id = p.id WHERE v.id = $1", [id],
  );
  if (!record || (process.env.POLICYDIFF_DEMO_ONLY === "1" && !record.demo)) {
    throw new RequestError("Document not found.", 404);
  }
  return record.pdf;
}

export async function loadDemo() {
  const name = "Ontario Automobile Policy (OAP 1)";
  const files = [
    { file: "oap-2022.pdf", label: "2022 edition", date: "2022-01-01",
      url: "https://wwmic.com/wp-content/uploads/2023/11/OAP1-2022-Ontario-Automobile-Policy.pdf" },
    { file: "oap-2026.pdf", label: "July 2026 edition", date: "2026-07-01",
      url: "https://www.kemutual.com/wp-content/uploads/2026/04/Ontario-Automobile-Policy-OAP-1-July-1-2026.pdf" },
  ];
  const versions = [];
  for (const file of files) {
    const version = await uploadVersion({ name, label: file.label, effectiveOn: file.date }, await readFile(path.resolve("demo", file.file)), file.url);
    const result = await ingest(version.id);
    if (result.status === "failed") throw new RequestError(result.error || "Demo ingestion failed.", 503);
    if (result.status !== "ready") throw new RequestError("Demo editions are still being indexed. Try again shortly.", 409);
    versions.push(version.id);
  }
  return versions;
}

export async function versionForIngest(id: string) {
  const store = await db();
  const { rows: [row] } = await store.query<{demo: boolean} & Pick<Version, "id">>(
    "SELECT v.id, p.demo FROM versions v JOIN policies p ON v.policy_id = p.id WHERE v.id = $1", [id],
  );
  if (!row || (process.env.POLICYDIFF_DEMO_ONLY === "1" && !row.demo)) throw new RequestError("Version not found.", 404);
  return row;
}
