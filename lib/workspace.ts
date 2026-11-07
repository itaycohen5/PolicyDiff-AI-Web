import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { db } from "./db";
import { RequestError } from "./errors";

export const localWorkspaceId = "00000000-0000-0000-0000-000000000000";
type Workspace = { id: string; unlocked: boolean; expires: number };
const current = new AsyncLocalStorage<Workspace>();
const cookieName = "policydiff_workspace";

export const cloudMode = () => process.env.POLICYDIFF_CLOUD_MODE === "1" && process.env.POLICYDIFF_STATIC_DEMO !== "1";
export const publicAccess = () => cloudMode() && process.env.POLICYDIFF_PUBLIC_ACCESS === "1";
export const workspaceId = () => current.getStore()?.id ?? localWorkspaceId;
export const demoOnly = () => process.env.POLICYDIFF_DEMO_ONLY === "1" || (cloudMode() && !publicAccess() && !current.getStore()?.unlocked);

function secret() {
  const value = process.env.POLICYDIFF_SESSION_SECRET;
  if (!value || value.length < 32) throw new RequestError("The hosted workspace has not finished being configured.", 503);
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function readWorkspace(request: Request): Workspace | undefined {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (token) {
    const [payload, mac, extra] = token.split(".");
    if (payload && mac && !extra) {
      const expected = Buffer.from(signature(payload));
      const supplied = Buffer.from(mac);
      if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
        try {
          const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Workspace;
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id) &&
              typeof value.unlocked === "boolean" && Number.isFinite(value.expires) && value.expires > Date.now()) {
            return value;
          }
        } catch { /* A damaged cookie starts an empty workspace. */ }
      }
    }
  }
}

const publicLimits = { workspace: 30, upload: 20, ingest: 40, comparison: 60, source: 240, demo: 10 } as const;

/** Shared atomic quotas survive new cookies, concurrent requests and server restarts. */
export async function publicBudget(request: Request, action: keyof typeof publicLimits) {
  if (!publicAccess()) return;
  // Vercel overwrites X-Forwarded-For at its trusted ingress. Other deployments
  // deliberately share a single bucket rather than trusting arbitrary headers.
  const ip = process.env.VERCEL === "1"
    ? request.headers.get("x-forwarded-for")?.split(",")[0].trim().toLowerCase()
    : "127.0.0.1";
  if (!ip || !isIP(ip)) throw new RequestError("The workspace is temporarily unavailable. Please try again.", 503);
  const hour = Math.floor(Date.now() / 3_600_000);
  const subject = createHmac("sha256", secret()).update(`${hour}:${ip}`).digest("hex");
  const store = await db();
  const { rows } = await store.query(`
    INSERT INTO request_budgets(subject, action, window_start, hits)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (subject, action, window_start) DO UPDATE
    SET hits = request_budgets.hits + 1 WHERE request_budgets.hits < $4
    RETURNING hits
  `, [subject, action, hour, publicLimits[action]]);
  if (!rows.length) throw new RequestError("This network has reached its hourly usage limit. Please try again after the next full hour.", 429);
}

export async function workspaceRequest(request: Request, handler: () => Promise<Response>) {
  if (!cloudMode()) return handler();
  try {
    secret();
    const existing = readWorkspace(request);
    if (!existing) await publicBudget(request, "workspace");
    const workspace = existing ?? { id: randomUUID(), unlocked: false, expires: Date.now() + 3_600_000 };
    workspace.expires = Date.now() + 3_600_000;
    const store = await db();
    await store.query(`
      INSERT INTO workspaces(id, expires_at) VALUES ($1, now() + interval '1 hour')
      ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at
    `, [workspace.id]);
    const response = await current.run(workspace, handler);
    const payload = Buffer.from(JSON.stringify(workspace)).toString("base64url");
    const secure = new URL(request.url).protocol === "https:" || process.env.VERCEL === "1";
    response.headers.append("Set-Cookie", `${cookieName}=${payload}.${signature(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? "; Secure" : ""}`);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 503;
    console.error("Hosted workspace failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: error instanceof RequestError ? error.message : "The workspace is temporarily unavailable. Please try again." }, { status });
  }
}

export function unlockWorkspace(code: string) {
  const expected = process.env.POLICYDIFF_ACCESS_CODE;
  if (!expected || expected.length < 16) throw new RequestError("Private uploads have not been enabled by the site owner.", 503);
  const received = Buffer.from(code);
  const target = Buffer.from(expected);
  if (received.length !== target.length || !timingSafeEqual(received, target)) {
    throw new RequestError("The access code is incorrect.", 403);
  }
  const workspace = current.getStore();
  if (!workspace) throw new RequestError("Open the hosted workspace before unlocking uploads.", 400);
  workspace.unlocked = true;
}

export async function comparisonBudget() {
  if (!cloudMode()) return;
  const store = await db();
  const { rows } = await store.query(`
    UPDATE workspaces SET comparison_count = comparison_count + 1
    WHERE id = $1 AND comparison_count < 10 RETURNING id
  `, [workspaceId()]);
  if (!rows.length) throw new RequestError("This temporary workspace has reached its comparison limit. Please try again after the session expires.", 429);
}

export async function clearWorkspace() {
  if (!cloudMode()) throw new RequestError("This action is available in temporary hosted workspaces.", 403);
  const store = await db();
  await store.transaction(async (tx) => {
    const id = workspaceId();
    await tx.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [id]);
    // Sources also have a direct composite FK to comparisons; remove them first.
    await tx.query("DELETE FROM sources WHERE comparison_id IN (SELECT id FROM comparisons WHERE workspace_id = $1)", [id]);
    await tx.query("DELETE FROM comparisons WHERE workspace_id = $1", [id]);
    await tx.query("DELETE FROM ingestion_jobs WHERE version_id IN (SELECT v.id FROM versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1)", [id]);
    await tx.query("DELETE FROM chunks WHERE version_id IN (SELECT v.id FROM versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1)", [id]);
    await tx.query("DELETE FROM versions WHERE policy_id IN (SELECT id FROM policies WHERE workspace_id = $1)", [id]);
    await tx.query("DELETE FROM policies WHERE workspace_id = $1", [id]);
  });
}

export async function purgeExpiredWorkspaces() {
  const store = await db();
  await store.query("DELETE FROM request_budgets WHERE window_start < $1", [Math.floor(Date.now() / 3_600_000) - 1]);
  return store.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>("SELECT id FROM workspaces WHERE expires_at < now() ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED");
    const ids = rows.map(({ id }) => id);
    if (!ids.length) return 0;
    await tx.query("DELETE FROM sources WHERE comparison_id IN (SELECT id FROM comparisons WHERE workspace_id = ANY($1::uuid[]))", [ids]);
    await tx.query("DELETE FROM comparisons WHERE workspace_id = ANY($1::uuid[])", [ids]);
    await tx.query("DELETE FROM ingestion_jobs WHERE version_id IN (SELECT v.id FROM versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = ANY($1::uuid[]))", [ids]);
    await tx.query("DELETE FROM chunks WHERE version_id IN (SELECT v.id FROM versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = ANY($1::uuid[]))", [ids]);
    await tx.query("DELETE FROM versions WHERE policy_id IN (SELECT id FROM policies WHERE workspace_id = ANY($1::uuid[]))", [ids]);
    await tx.query("DELETE FROM policies WHERE workspace_id = ANY($1::uuid[])", [ids]);
    await tx.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [ids]);
    return ids.length;
  });
}

