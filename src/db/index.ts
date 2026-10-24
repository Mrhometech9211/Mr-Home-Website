import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import fs from "node:fs";
import path from "node:path";

/**
 * Lazy, resilient database layer.
 *
 * - `DATABASE_URL` present → real PostgreSQL via node-postgres (production path).
 *   Schema is applied with `npx drizzle-kit migrate` (CI/deploy step).
 * - `DATABASE_URL` absent  → in-process WASM Postgres (PGlite) so the app builds,
 *   starts and self-seeds even without a local server. PGlite is a genuine Postgres
 *   engine compiled to WASM — not a mock. Its schema is applied automatically from
 *   ./drizzle on first use.
 *
 * The module never throws at import time, so `next build` page-data collection
 * cannot crash because the env var is missing. `db` is a proxy that awaits
 * initialisation on the first query and recovers the singleton after failures.
 */

/**
 * Both drivers expose the same PgDatabase surface for our queries, so we type the
 * app database as NodePgDatabase (the production driver) to keep overload
 * resolution working at every call site. The PGlite instance is cast on creation.
 */
export type AppDatabase = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __mrhPool?: import("pg").Pool;
  __mrhPglite?: import("@electric-sql/pglite").PGlite;
  __mrhDb?: AppDatabase;
  __mrhDbPromise?: Promise<AppDatabase>;
};

/** Read DATABASE_URL; empty string counts as unset. Never logged. */
export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  return url && url.trim() !== "" ? url : undefined;
}

/** Locate the generated drizzle SQL migrations (works from source and standalone builds). */
function migrationFiles(): string[] {
  const candidates = [
    path.join(process.cwd(), "drizzle"),
    path.join(process.cwd(), "..", "drizzle"),
    path.join(process.cwd(), ".next", "server", "drizzle"),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      if (files.length) return files.map((f) => path.join(dir, f));
    } catch {
      // ignore and try next candidate
    }
  }
  return [];
}

/** Split drizzle's `--> statement-breakpoint` files into individual statements. */
function splitStatements(sqlText: string): string[] {
  return sqlText
    .split(/--> statement-breakpoint\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Deterministic idempotency: decide whether a migration statement is already
 * applied by inspecting the catalog BEFORE running it. PGlite aborts with a
 * WASM panic on duplicate DDL that loses the SQLSTATE detail, so relying on
 * error text is not reliable.
 */
async function statementAlreadyApplied(exec: AppDatabase, stmt: string): Promise<boolean> {
  const q = (name: string) => name.replace(/"/g, "");
  // Leading SQL comments would defeat the "^CREATE/ALTER" matching below and
  // make DDL run again on every cold start. Ignore them for the catalog check.
  const normalized = stmt.replace(/^(?:\s*--[^\n]*(?:\r?\n|$))+/, "").trim();
  let m: RegExpMatchArray | null;

  // CREATE TABLE "x" (…)
  if ((m = normalized.match(/^CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/i))) {
    const res = await exec.execute(sql.raw(`SELECT to_regclass('${q(m[1])}') IS NOT NULL AS ok`));
    return Boolean((res.rows[0] as { ok: boolean } | undefined)?.ok);
  }
  // CREATE [UNIQUE] INDEX "idx" ON …
  if ((m = normalized.match(/^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)"/i))) {
    const res = await exec.execute(sql.raw(`SELECT 1 FROM pg_indexes WHERE indexname = '${q(m[1])}' LIMIT 1`));
    return res.rows.length > 0;
  }
  // ALTER TABLE "x" ADD COLUMN "c" …
  if ((m = normalized.match(/^ALTER TABLE "([^"]+)" ADD COLUMN (?:IF NOT EXISTS )?"([^"]+)"/i))) {
    const res = await exec.execute(
      sql.raw(`SELECT 1 FROM information_schema.columns WHERE table_name = '${q(m[1])}' AND column_name = '${q(m[2])}' LIMIT 1`),
    );
    return res.rows.length > 0;
  }
  // ALTER TABLE "x" ALTER COLUMN "c" DROP NOT NULL
  if ((m = normalized.match(/^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" DROP NOT NULL/i))) {
    const res = await exec.execute(
      sql.raw(`SELECT is_nullable FROM information_schema.columns WHERE table_name = '${q(m[1])}' AND column_name = '${q(m[2])}' LIMIT 1`),
    );
    return (res.rows[0] as { is_nullable?: string } | undefined)?.is_nullable === "YES";
  }
  // ALTER TABLE "x" ADD CONSTRAINT "k" …
  if ((m = normalized.match(/^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/i))) {
    const res = await exec.execute(
      sql.raw(`SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '${q(m[2])}' LIMIT 1`),
    );
    return res.rows.length > 0;
  }
  return false;
}

export async function ensureSchema(exec: AppDatabase): Promise<void> {
  const files = migrationFiles();
  if (!files.length) return;
  for (const file of files) {
    const sqlText = fs.readFileSync(file, "utf8");
    for (const stmt of splitStatements(sqlText)) {
      try {
        if (await statementAlreadyApplied(exec, stmt)) continue;
        await exec.execute(sql.raw(stmt));
      } catch (e) {
        // Belt-and-braces: also tolerate "already exists" errors whose detail
        // survives in the message/cause chain (non-PGlite drivers).
        let msg = String((e as Error)?.message ?? e);
        let cause = (e as Error & { cause?: unknown })?.cause;
        while (cause) {
          msg += ` ${String((cause as Error)?.message ?? cause)}`;
          cause = (cause as Error & { cause?: unknown })?.cause;
        }
        if (/already exists/i.test(msg)) continue;
        throw e;
      }
    }
  }
}

async function createDatabase(): Promise<AppDatabase> {
  const url = getDatabaseUrl();
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 10 });
    globalForDb.__mrhPool = pool;
    return drizzle(pool);
  }
  const pgliteModule = await import("@electric-sql/pglite");
  const drizzleModule = await import("drizzle-orm/pglite");
  const PGlite = pgliteModule.PGlite;
  // Persistent on-disk store so CMS/CRM data survives server restarts in local mode.
  const dataDir = path.join(process.cwd(), ".pglite-data");
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* already exists */ }
  const pg = globalForDb.__mrhPglite ?? new PGlite(dataDir);
  globalForDb.__mrhPglite = pg;
  return drizzleModule.drizzle(pg) as unknown as AppDatabase;
}

/** Creates (once) and returns the shared database instance. */
export function initDb(): Promise<AppDatabase> {
  if (!globalForDb.__mrhDbPromise) {
    globalForDb.__mrhDbPromise = (async () => {
      const db = await createDatabase();
      // Register the instance BEFORE schema/seed: the seed helpers themselves go
      // through the `db` proxy, which requires a registered instance to work.
      globalForDb.__mrhDb = db;
      try {
        // Zero-touch deploys: apply the schema and demo seed automatically on the
        // first request against ANY database (idempotent — existing data is never
        // touched). This removes the manual `drizzle-kit migrate` step entirely.
        await ensureSchema(db);
        if (process.env.MRH_AUTO_SEED !== "0") {
          const { runSeed } = await import("./seed");
          await runSeed();
        }
      } catch (e) {
        // Roll back registration so a later request can retry from scratch.
        globalForDb.__mrhDb = undefined;
        globalForDb.__mrhDbPromise = undefined;
        throw e;
      }
      return db;
    })().catch((e) => {
      // Allow a later request to retry a failed connection instead of caching the error.
      console.error("[db] initDb failed:", e);
      globalForDb.__mrhDbPromise = undefined;
      throw e;
    });
  }
  return globalForDb.__mrhDbPromise;
}

/** Synchronous accessor for code paths that are guaranteed to run after init. */
export function getDb(): AppDatabase {
  if (!globalForDb.__mrhDb) throw new Error("Database not initialised — await initDb() first.");
  return globalForDb.__mrhDb;
}

export { sql };

/** Test/diagnostic helper to inspect the active driver. */
export function getActiveDriver(): "postgres" | "pglite" | "uninitialised" {
  if (getDatabaseUrl()) return "postgres";
  if (globalForDb.__mrhDb) return "pglite";
  return "uninitialised";
}

/**
 * Drop-in replacement for the previous eager `db` export.
 *
 * Entry points (`handle()` for API routes, `ensureSeeded()` for server content)
 * await `initDb()` before the first query; every property access then resolves
 * against the real, initialised instance. A missing DATABASE_URL therefore can
 * no longer crash the build or the server at import time.
 */
export const db = new Proxy({} as AppDatabase, {
  get(_t, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as AppDatabase;
