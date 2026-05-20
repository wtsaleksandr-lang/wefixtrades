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
import { fileURLToPath } from "url";
import { pool } from "../db";
import { createLogger } from "./logger";

const log = createLogger("BootstrapMigrations");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// server/lib → server → project root → migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

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

  let files: string[];
  try {
    const entries = await fs.readdir(MIGRATIONS_DIR);
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
      const sqlPath = path.join(MIGRATIONS_DIR, file);
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
  } finally {
    client.release();
  }
}
