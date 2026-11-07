import assert from "node:assert/strict";
import { after, test } from "node:test";
import { GET, POST } from "../app/api/[...path]/route";
import { closeDb, db } from "../lib/db";
import { comparisonBudget, publicBudget, purgeExpiredWorkspaces, workspaceRequest } from "../lib/workspace";
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

async function savedComparisonWithSources(oldId: string, newId: string) {
  const store = await db();
  return store.transaction(async (tx) => {
    const { rows: [policy] } = await tx.query<{ id: string; workspace_id: string }>(
      "SELECT p.id, p.workspace_id FROM policies p JOIN versions v ON v.policy_id = p.id WHERE v.id = $1", [oldId]);
    const { rows: [comparison] } = await tx.query<{ id: string }>(
      "INSERT INTO comparisons(policy_id, old_id, new_id, question, mode, workspace_id) VALUES ($1,$2,$3,'What changed in section 2.1?','local',$4) RETURNING id",
      [policy.id, oldId, newId, policy.workspace_id]);
    const { rows: [finding] } = await tx.query<{ id: string }>(
      "INSERT INTO findings(comparison_id, position, section, kind, description) VALUES ($1,0,'2.1','changed','Synthetic wording changed.') RETURNING id", [comparison.id]);
    for (const [side, versionId] of [["old", oldId], ["new", newId]]) {
      const { rows: [chunk] } = await tx.query<{ id: string }>(
        "INSERT INTO chunks(version_id, ordinal, page, section, body, embedding) VALUES ($1,0,1,'2.1','Synthetic source wording.',$2::vector) RETURNING id",
        [versionId, JSON.stringify(Array(384).fill(0))]);
      await tx.query("INSERT INTO sources(comparison_id, finding_id, old_id, new_id, side, version_id, chunk_id, page) VALUES ($1,$2,$3,$4,$5,$6,$7,1)",
        [comparison.id, finding.id, oldId, newId, side, versionId, chunk.id]);
    }
    return { id: comparison.id, workspaceId: policy.workspace_id };
  });
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
    const second = await raced.find((result) => result.response.status === 201)!.response.json();
    const comparisonA = await savedComparisonWithSources(id, second.id);
    const bOld = await (await request("versions", b.cookie, form("B older"))).response.json();
    const bNew = await (await request("versions", b.cookie, form("B newer"))).response.json();
    const comparisonB = await savedComparisonWithSources(bOld.id, bNew.id);
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
    assert.equal((await request("comparisons/" + comparisonA.id, a.cookie)).response.status, 404);
    assert.equal((await request("comparisons/" + comparisonB.id, b.cookie)).response.status, 200);

    const store = await db();
    await store.query("UPDATE workspaces SET expires_at = now() - interval '1 minute' WHERE id = $1", [comparisonB.workspaceId]);
    assert.equal(await purgeExpiredWorkspaces(), 1);
    assert.equal((await store.query("SELECT id FROM workspaces WHERE id = $1", [comparisonB.workspaceId])).rows.length, 0);
    assert.equal((await store.query("SELECT id FROM comparisons WHERE id = $1", [comparisonB.id])).rows.length, 0);
  } finally {
    delete process.env.POLICYDIFF_CLOUD_MODE;
    delete process.env.POLICYDIFF_STATIC_DEMO;
    delete process.env.POLICYDIFF_SESSION_SECRET;
    delete process.env.POLICYDIFF_ACCESS_CODE;
  }
});

test("public visitors can upload, ingest, compare and open sources without a code while network quotas remain atomic", async () => {
  process.env.POLICYDIFF_CLOUD_MODE = "1";
  process.env.POLICYDIFF_PUBLIC_ACCESS = "1";
  process.env.POLICYDIFF_SESSION_SECRET = "test-session-secret-at-least-thirty-two-characters";
  process.env.OPENROUTER_API_KEY = "test-configuration-only";
  try {
    const a = await request("workspace");
    const state = await a.response.json();
    assert.equal(state.requiresAccessCode, false);
    assert.equal(state.demoOnly, false);
    assert.equal(state.openRouter, true);
    const ids: string[] = [];
    let policyId: string | undefined;
    for (const [index, days] of ["seven", "ten"].entries()) {
      const form = new FormData();
      if (policyId) form.set("policyId", policyId);
      else form.set("name", "Anonymous public test");
      form.set("label", `Edition ${index + 1}`);
      form.set("effectiveOn", `${2025 + index}-01-01`);
      form.set("file", new File([new Uint8Array(textPdf(["2.1 Assistance", `The policy covers documented roadside assistance expenses for the insured automobile for ${days} days following a covered event.`]))], "public.pdf", { type: "application/pdf" }));
      const upload = await request("versions", a.cookie, form);
      assert.equal(upload.response.status, 201);
      const version = await upload.response.json();
      ids.push(version.id);
      const uploadedState = await (await request("workspace", a.cookie)).response.json();
      policyId = uploadedState.policies.find((p: {demo: boolean}) => !p.demo)?.id;
      assert.ok(policyId);
      const ingested = await request(`ingest/${version.id}`, a.cookie, "");
      assert.equal(ingested.response.status, 200);
    }
    const result = await request("comparisons", a.cookie, JSON.stringify({ oldId: ids[0], newId: ids[1], question: "What changed in section 2.1 assistance?", mode: "local" }), "application/json");
    assert.equal(result.response.status, 201);
    const comparison = await result.response.json();
    assert.ok(comparison.findings.length);
    const source = comparison.findings.flatMap((f: {sources: {version_id: string; page: number}[]}) => f.sources)[0];
    assert.ok(source);
    assert.equal((await request(`pdf/${source.version_id}/${source.page}`, a.cookie)).response.headers.get("content-type"), "image/png");
    const stranger = await request("workspace");
    assert.equal((await stranger.response.json()).policies.some((p: {id: string}) => p.id === policyId), false);
    assert.equal((await request(`comparisons/${comparison.id}`, stranger.cookie)).response.status, 404);
    assert.equal((await request(`pdf/${ids[0]}`, stranger.cookie)).response.status, 404);
    const store = await db();
    const before = await store.query("SELECT id FROM workspaces");
    const crossOrigin = await POST(new Request("http://localhost/api/versions", { method: "POST", headers: { host: "localhost", origin: "https://evil.example" } }), { params: Promise.resolve({ path: ["versions"] }) });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await store.query("SELECT id FROM workspaces")).rows.length, before.rows.length);
    assert.equal((await request("clear", a.cookie, "")).response.status, 200);
    const quotaRequest = new Request("http://localhost/api/comparisons");
    const quota = await Promise.allSettled(Array.from({length: 60}, () => publicBudget(quotaRequest, "comparison")));
    // The successful comparison above already consumed one of this network's 60 requests.
    assert.equal(quota.filter((r) => r.status === "fulfilled").length, 59);
    assert.equal(quota.filter((r) => r.status === "rejected").length, 1);
    assert.equal((await request("comparisons", stranger.cookie, "{}", "application/json")).response.status, 429);
    for (let i = 0; i < 28; i++) assert.equal((await request("workspace")).response.status, 200);
    assert.equal((await request("workspace", "policydiff_workspace=tampered")).response.status, 429);
    // Existing visitors still have access when new-session creation is throttled.
    assert.equal((await request("workspace", stranger.cookie)).response.status, 200);
    process.env.POLICYDIFF_DEMO_ONLY = "1";
    assert.equal((await request("workspace", stranger.cookie).then((r) => r.response.json())).demoOnly, true);
    assert.equal((await request("versions", stranger.cookie, "")).response.status, 403);
  } finally {
    for (const key of ["POLICYDIFF_CLOUD_MODE", "POLICYDIFF_PUBLIC_ACCESS", "POLICYDIFF_SESSION_SECRET", "OPENROUTER_API_KEY", "POLICYDIFF_DEMO_ONLY"]) delete process.env[key];
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

