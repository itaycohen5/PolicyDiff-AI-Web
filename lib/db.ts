import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { Pool, type PoolClient } from "pg";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface Sql {
  query<Row extends object = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{rows: Row[]}>;
}
interface Store extends Sql {
  transaction<T>(work: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function fromPg(client: Pool | PoolClient): Sql {
  return { async query<Row extends object>(sql: string, params?: unknown[]) {
    const result = await client.query<Row>(sql, params);
    return { rows: result.rows };
  } };
}

async function openStore(): Promise<Store> {
  if (process.env.POLICYDIFF_CLOUD_MODE === "1" && process.env.POLICYDIFF_STATIC_DEMO !== "1" &&
      !process.env.DATABASE_URL && process.env.POLICYDIFF_DATA_DIR !== "memory://") {
    throw new Error("Hosted workspaces require a shared DATABASE_URL. Complete the database connection before enabling uploads.");
  }
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 10_000,
      query_timeout: 65_000,
      statement_timeout: 60_000,
      idle_in_transaction_session_timeout: 60_000,
    });
    pool.on("error", (error) => {
      console.error("Idle database connection failed", error.name);
    });
    return {
      ...fromPg(pool),
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work(fromPg(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const location = process.env.POLICYDIFF_DATA_DIR || path.resolve(".data", "postgres");
  if (location !== "memory://") await mkdir(path.dirname(location), { recursive: true });
  const local = await PGlite.create(location, { extensions: { vector } });
  return {
    query: (sql, params) => local.query(sql, params),
    transaction: (work) => local.transaction(work),
    close: () => local.close(),
  };
}

async function initialize() {
  const store = await openStore();
  try {
    await store.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(872514)");
      await tx.query("CREATE TABLE IF NOT EXISTS schema_migrations (id integer PRIMARY KEY)");
      const applied = await tx.query<{ id: number }>("SELECT id FROM schema_migrations");
      const appliedIds = new Set(applied.rows.map(({ id }) => id));
      const migrations = [[1, "001_initial.sql"], [2, "002_openrouter_mode.sql"], [3, "003_ai_explanation.sql"],
        [4, "004_source_order.sql"], [5, "005_ai_context.sql"], [6, "006_unchanged_sections.sql"],
        [7, "007_hosted_workspaces.sql"]] as const;
      for (const [id, file] of migrations) {
        if (appliedIds.has(id)) continue;
        const sql = await readFile(path.resolve("db", file), "utf8");
        // Migrations contain plain DDL statements and no internal semicolons.
        for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
          await tx.query(statement);
        }
        await tx.query("INSERT INTO schema_migrations VALUES ($1)", [id]);
      }
    });
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}

const singleton = globalThis as typeof globalThis & { policyDiffStore?: Promise<Store> };
export function db() {
  singleton.policyDiffStore ??= initialize().catch((error) => {
    singleton.policyDiffStore = undefined;
    throw error;
  });
  return singleton.policyDiffStore;
}

export async function closeDb() {
  const store = await singleton.policyDiffStore;
  if (store) await store.close();
  singleton.policyDiffStore = undefined;
}
