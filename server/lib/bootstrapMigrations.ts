/**
 * Wave R-pre — runtime SQL migrator.
 *
 * Why this exists: the team uses `drizzle-kit push` for dev (overwrite the
 * dev DB from the schema) but ALSO has hand-rolled .sql files under
 * `migrations/` that need to apply to production. There is no
 * `migrations/meta/_journal.json`, so `drizzle-orm/node-postgres/migrator`
 * cannot run them out of the box. Without something to apply them on boot,
 * a Replit republish that lands a new column reference in the schema (Wave P
 * `updated_at`, `slug_release_warned_at`) without first running `db:push`
 * by hand causes EVERY calculator query to 500 — exactly what happened to
 * Alex post-Wave-P-deploy.
 *
 * This module is intentionally tiny:
 *   1. Ensures a `__bootstrap_migrations` ledger table exists.
 *   2. Reads `migrations/*.sql` (ASCII-sorted by name).
 *   3. For each file not in the ledger, runs it in a transaction and
 *      records it. Failure aborts the boot — better to crash loudly than
 *      serve broken queries.
 *
 * Idempotency: relies on the migration files being safe to re-run (they
 * all use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / etc.). The ledger
 * stops re-execution after the first successful apply per file.
 *
 * Trigger: server/index.ts boot path calls `bootstrapMigrations()` BEFORE
 * any route registration. If DATABASE_URL is unset (rare — only in
 * unit-test contexts), it's a no-op.
 */

import fs from "fs/promises";
import path from "path";
import { pool } from "../db";
import { createLogger } from "./logger";

const log = createLogger("BootstrapMigrations");

// Resolve migrations/ relative to the working directory. Both Vite dev
// (process.cwd() = project root) and the prod CJS bundle (process.cwd() =
// dist/) end up correct because we look for the migrations folder beside
// process.cwd() OR one level up.
const MIGRATIONS_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "migrations"),
  path.resolve(process.cwd(), "..", "migrations"),
];

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS __bootstrap_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
  )
`;

export async function bootstrapMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    log.warn("DATABASE_URL unset — skipping bootstrap migrations");
    return;
  }

  let migrationsDir: string | null = null;
  for (const candidate of MIGRATIONS_DIR_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) { migrationsDir = candidate; break; }
    } catch { /* try next */ }
  }
  if (!migrationsDir) {
    log.warn("migrations/ directory not found in any candidate path — skipping bootstrap", {
      candidates: MIGRATIONS_DIR_CANDIDATES,
    });
    return;
  }

  let files: string[];
  try {
    const entries = await fs.readdir(migrationsDir);
    files = entries
      .filter((f) => f.endsWith(".sql"))
      .sort(); // ASCII sort = 0001_ < 0002_ < ... < 0099_
  } catch (err: any) {
    log.warn("migrations/ directory unreadable — skipping bootstrap", { error: err.message });
    return;
  }

  if (files.length === 0) {
    log.info("No migration files found");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(LEDGER_DDL);

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM __bootstrap_migrations",
    );
    const applied = new Set(rows.map((r) => r.filename));

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      log.info(`All ${files.length} migrations already applied`);
      return;
    }
    log.info(`Applying ${pending.length} pending migration(s): ${pending.join(", ")}`);

    for (const file of pending) {
      const sqlPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(sqlPath, "utf-8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO __bootstrap_migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        log.info(`Applied ${file}`);
      } catch (err: any) {
        await client.query("ROLLBACK");
        // Hard fail — letting the server boot with a partially-migrated
        // schema is exactly what Wave P-deploy demonstrated is unsafe.
        log.error(`Migration ${file} FAILED — aborting boot`, { error: err.message });
        throw new Error(`Bootstrap migration failed: ${file}: ${err.message}`);
      }
    }

    // BF-1 canary — emit a one-line summary of auth-critical table sizes at
    // boot so any deploy that lands against the wrong database (or one whose
    // user rows were wiped) is grep-able in deploy logs. NOT a guard — we
    // never refuse to boot on a small users table, because that would brick
    // a freshly-provisioned environment. The goal is signal: a boot-log line
    // reading `users=0 admin_users=0` after a deploy is the smoking gun.
    try {
      const { rows: counts } = await client.query<{
        users: string;
        admin_users: string;
        sessions: string;
        database: string;
      }>(`
        SELECT
          (SELECT COUNT(*)::text FROM users)                                 AS users,
          (SELECT COUNT(*)::text FROM users WHERE role = 'admin')            AS admin_users,
          (SELECT COUNT(*)::text FROM session WHERE expire > NOW())          AS sessions,
          current_database()                                                 AS database
      `);
      const c = counts[0];
      if (c) {
        log.info("[boot-canary] auth table sizes", {
          database: c.database,
          users: Number(c.users),
          admin_users: Number(c.admin_users),
          active_sessions: Number(c.sessions),
        });
        // Loud warning if production has zero admin users — almost certainly
        // a data-loss event or a DATABASE_URL pointing at the wrong DB.
        if (process.env.NODE_ENV === "production" && Number(c.admin_users) === 0) {
          log.error(
            "[boot-canary] PRODUCTION users.role='admin' count is ZERO. " +
              "Either the database was wiped, DATABASE_URL is pointing at a " +
              "fresh DB, or the admin row was deleted. Investigate before " +
              "treating this server as healthy.",
            { database: c.database },
          );
        }
      }
    } catch (canaryErr: any) {
      // Canary failure is non-fatal — these tables exist on every healthy
      // deployment, but if they happen not to (e.g. a brand-new DB before
      // migrations land somewhere downstream), don't block the boot.
      log.warn("[boot-canary] failed to query auth-table sizes", {
        error: canaryErr?.message,
      });
    }
  } finally {
    client.release();
  }
}
