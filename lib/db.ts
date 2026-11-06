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
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
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
      const applied = await tx.query("SELECT id FROM schema_migrations WHERE id = 1");
      if (applied.rows.length) return;
      const sql = await readFile(path.resolve("db/001_initial.sql"), "utf8");
      // The first migration contains plain DDL statements and no internal semicolons.
      for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
        await tx.query(statement);
      }
      await tx.query("INSERT INTO schema_migrations VALUES (1)");
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
