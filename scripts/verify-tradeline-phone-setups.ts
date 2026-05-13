// One-off verification script for the tradeline_phone_setups migration.
// Run via: npx tsx scripts/verify-tradeline-phone-setups.ts
// Safe to keep around as a smoke test for the table's existence + shape.
import "dotenv/config";
import { pool } from "../server/db";

async function main() {
  const exists = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tradeline_phone_setups') AS exists",
  );
  console.log("table_exists:", exists.rows[0].exists);
  if (!exists.rows[0].exists) {
    console.log("table not present");
    return;
  }

  const cols = await pool.query(
    "SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='tradeline_phone_setups' ORDER BY ordinal_position",
  );
  console.log(`column_count: ${cols.rows.length}`);
  console.log("--- columns ---");
  for (const r of cols.rows) {
    const len = r.character_maximum_length ? `(${r.character_maximum_length})` : "";
    const nul = r.is_nullable === "NO" ? " NOT NULL" : "";
    const def = r.column_default ? ` DEFAULT ${r.column_default}` : "";
    console.log(`${String(r.column_name).padEnd(38)} ${r.data_type}${len}${nul}${def}`);
  }

  const idx = await pool.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='tradeline_phone_setups' ORDER BY indexname",
  );
  console.log("--- indexes ---");
  for (const r of idx.rows) console.log(`${r.indexname} -> ${r.indexdef}`);

  const fk = await pool.query(
    "SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class cls ON cls.oid = con.conrelid WHERE cls.relname='tradeline_phone_setups' ORDER BY con.conname",
  );
  console.log("--- constraints ---");
  for (const r of fk.rows) console.log(`${r.conname} -> ${r.def}`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("ERR:", e.message);
    await pool.end();
    process.exit(1);
  });
