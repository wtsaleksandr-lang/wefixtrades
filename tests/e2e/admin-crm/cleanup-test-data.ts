/**
 * Removes test clients created by Playwright runs (contact_email matches test-pw_*@example.com).
 * Safe to run multiple times — no-ops if no test data exists.
 */
import { pool } from "../../../server/db.js";

async function main() {
  const { rows } = await pool.query(
    "SELECT id FROM clients WHERE contact_email LIKE 'test-pw_%@example.com'"
  );
  if (rows.length === 0) {
    console.log("[cleanup] No stale test clients found.");
    await pool.end();
    return;
  }

  const ids = rows.map((r: { id: number }) => r.id);
  const ph = ids.map((_: number, i: number) => `$${i + 1}`).join(",");
  const arr = `ARRAY[${ph}]::int[]`;

  await pool.query(`DELETE FROM fulfillment_tasks WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM client_payments WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM onboarding_submissions WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM client_services WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM internal_notes WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM orders WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM clients WHERE id = ANY(${arr})`, ids);

  console.log(`[cleanup] Removed ${ids.length} stale test client(s).`);
  await pool.end();
}

main().catch((err) => {
  console.warn("[cleanup] Warning:", err.message);
  process.exit(0); // non-fatal
});
