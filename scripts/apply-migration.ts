/**
 * Generic migration runner — applies a single .sql file via the same pg
 * connection the app uses. Used in environments where `psql` is not on
 * PATH (Windows dev boxes, Replit, etc.).
 *
 * Usage:
 *   tsx scripts/apply-migration.ts migrations/0001_contentflow.sql
 *
 * Reads DATABASE_URL from .env. Executes the file as a single multi-
 * statement query inside the pg driver, which means the BEGIN/COMMIT in
 * the file controls transactionality (same as `psql -f`).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: tsx scripts/apply-migration.ts <path-to-sql>");
    process.exit(2);
  }
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error(`Migration file not found: ${abs}`);
    process.exit(2);
  }
  const sql = fs.readFileSync(abs, "utf8");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(2);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`[apply-migration] Connected. Applying ${path.basename(abs)} ...`);
  try {
    await client.query(sql);
    console.log(`[apply-migration] OK — ${path.basename(abs)} applied successfully.`);
  } catch (err: any) {
    console.error(`[apply-migration] FAILED: ${err.message}`);
    if (err.position) console.error(`  at SQL position ${err.position}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
