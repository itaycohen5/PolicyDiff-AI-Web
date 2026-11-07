import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../app/api/[...path]/route";
import { closeDb, db } from "../lib/db";
import { comparisonBudget, purgeExpiredWorkspaces, workspaceRequest } from "../lib/workspace";
import { textPdf } from "./fixtures";

delete process.env.DATABASE_URL;
process.env.POLICYDIFF_DATA_DIR = "memory://";
after(closeDb);

async function request(path: string, cookie = "", body?: BodyInit, contentType?: string) {
  const headers: Record<string, string> = { host: "localhost", cookie };
  if (contentType) headers["content-type"] = contentType;
  const input = new Request("http://localhost/api/" + path, { method: body === undefined ? "GET" : "POST", headers, body });
  const context = { params: Promise.resolve({ path: path.split("/") }) };
  const response = await (body === undefined ? GET(input, context) : POST(input, context));
  return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? cookie };
}

test("hosted workspaces gate uploads, isolate documents and delete only their own temporary data", async () => {
  process.env.POLICYDIFF_CLOUD_MODE = "1";
  process.env.POLICYDIFF_STATIC_DEMO = "0";
  process.env.POLICYDIFF_SESSION_SECRET = "test-session-secret-at-least-thirty-two-characters";
  process.env.POLICYDIFF_ACCESS_CODE = "test-private-access-code";
  try {
    let a = await request("workspace");
    assert.equal(a.response.status, 200);
    assert.equal((await a.response.json()).requiresAccessCode, true);
    assert.match(a.cookie, /^policydiff_workspace=/);
    const invalid = await request("access", a.cookie, JSON.stringify({ code: "incorrect" }), "application/json");
    assert.equal(invalid.response.status, 403);
    a = await request("access", a.cookie, JSON.stringify({ code: process.env.POLICYDIFF_ACCESS_CODE }), "application/json");
    assert.equal(a.response.status, 200);

    function form(label: string) {
      const form = new FormData();
      form.set("name", "Private synthetic policy");
      form.set("label", label);
      form.set("effectiveOn", "2026-01-01");
      form.set("file", new File([new Uint8Array(textPdf(["2.1 Assistance", "The policy covers documented roadside assistance expenses for the insured automobile. " + label]))], "private.pdf", { type: "application/pdf" }));
      return form;
    }
    const uploaded = await request("versions", a.cookie, form("First"));
    assert.equal(uploaded.response.status, 201);
    const { id } = await uploaded.response.json();
    const own = await request("workspace", a.cookie);
    assert.equal((await own.response.json()).policies.filter((p: {demo: boolean}) => !p.demo).length, 1);

    let b = await request("workspace");
    assert.notEqual(b.cookie, a.cookie);
    b = await request("access", b.cookie, JSON.stringify({ code: process.env.POLICYDIFF_ACCESS_CODE }), "application/json");
    const foreign = await request("workspace", b.cookie);
    assert.equal((await foreign.response.json()).policies.filter((p: {demo: boolean}) => !p.demo).length, 0);
    assert.equal((await request("pdf/" + id, b.cookie)).response.status, 404);
    assert.equal((await request("ingest/" + id, b.cookie, "")).response.status, 404);

    const raced = await Promise.all(["Second", "Third"].map((label) => request("versions", a.cookie, form(label))));
    assert.deepEqual(raced.map((result) => result.response.status).sort(), [201, 429]);
    const corrupted = a.cookie.slice(0, -1) + (a.cookie.endsWith("x") ? "y" : "x");
    const tampered = await request("workspace", corrupted);
    assert.equal((await tampered.response.json()).requiresAccessCode, true);
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await workspaceRequest(new Request("http://localhost/api/comparisons", { headers: { cookie: a.cookie } }), async () => {
        await comparisonBudget();
        return Response.json({ allowed: true });
      });
      assert.equal(response.status, attempt < 10 ? 200 : 429);
    }
    const cleared = await request("clear", a.cookie, "");
    assert.equal(cleared.response.status, 200);
    assert.equal((await request("pdf/" + id, a.cookie)).response.status, 404);

    const expired = randomUUID();
    const store = await db();
    await store.query("INSERT INTO workspaces(id, expires_at) VALUES ($1, now() - interval '1 minute')", [expired]);
    assert.equal(await purgeExpiredWorkspaces(), 1);
    assert.equal((await store.query("SELECT id FROM workspaces WHERE id = $1", [expired])).rows.length, 0);
  } finally {
    delete process.env.POLICYDIFF_CLOUD_MODE;
    delete process.env.POLICYDIFF_STATIC_DEMO;
    delete process.env.POLICYDIFF_SESSION_SECRET;
    delete process.env.POLICYDIFF_ACCESS_CODE;
  }
});

test("prepared public demo works without a database or live model calls and blocks personal uploads", async (t) => {
  process.env.POLICYDIFF_STATIC_DEMO = "1";
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("A prepared demo must not call an external service."); });
  try {
    const workspace = await request("workspace");
    const data = await workspace.response.json();
    assert.equal(data.staticDemo, true);
    const versions = data.policies[0].versions;
    const body = { oldId: versions[0].id, newId: versions[1].id, question: "What changed in section 4.2.1?", mode: "openrouter" };
    const result = await request("comparisons", "", JSON.stringify(body), "application/json");
    assert.equal(result.response.status, 201);
    const comparison = await result.response.json();
    assert.ok(comparison.findings.some((finding: { ai_explanation: string }) => finding.ai_explanation));
    const source = comparison.findings[0].sources[0];
    const pdf = await request("pdf/" + source.version_id);
    assert.equal(pdf.response.headers.get("content-type"), "application/pdf");
    const page = await request("pdf/" + source.version_id + "/" + source.page);
    assert.equal(page.response.headers.get("content-type"), "image/png");
    assert.equal((await request("versions", "", "invalid")).response.status, 403);
    assert.equal((await request("comparisons", "", JSON.stringify({ ...body, question: "A different question" }), "application/json")).response.status, 422);
    assert.equal(network.mock.callCount(), 0);
  } finally {
    delete process.env.POLICYDIFF_STATIC_DEMO;
  }
});

