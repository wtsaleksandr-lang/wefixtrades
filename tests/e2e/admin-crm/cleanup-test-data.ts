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

  // ContentFlow + RankFlow rows referencing test clients (Sprint 3 + earlier).
  // Order matters because of FKs: approvals → drafts → tasks → plans → profile.
  await pool.query(
    `DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = ANY(${arr}))`,
    ids,
  );
  await pool.query(`DELETE FROM content_drafts WHERE client_id = ANY(${arr})`, ids);
  await pool.query(
    `DELETE FROM rankflow_qa_checks WHERE task_id IN (SELECT id FROM rankflow_tasks WHERE client_id = ANY(${arr}))`,
    ids,
  );
  await pool.query(`DELETE FROM rankflow_tasks WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_monthly_plans WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_keywords WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_pages WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_signals WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_progress WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM rankflow_profiles WHERE client_id = ANY(${arr})`, ids);
  // SocialSync posts created by Sprint 1 dev simulator (FK on client_id).
  await pool.query(`DELETE FROM socialsync_posts WHERE client_id = ANY(${arr})`, ids);

  await pool.query(`DELETE FROM fulfillment_tasks WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM client_payments WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM onboarding_submissions WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM client_services WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM internal_notes WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM orders WHERE client_id = ANY(${arr})`, ids);
  await pool.query(`DELETE FROM clients WHERE id = ANY(${arr})`, ids);

  // Sprint 6: also remove orphan portal users created by Sprint 6 tests
  // (role='client', email matches the same test-pw_*@example.com pattern).
  // Safe across sessions — only deletes users that match the test-fixture
  // email pattern, never touches real customers.
  const userResult = await pool.query(
    `DELETE FROM users WHERE email LIKE 'test-pw_%@example.com' AND role = 'client' RETURNING id`,
  );
  if (userResult.rowCount && userResult.rowCount > 0) {
    console.log(`[cleanup] Removed ${userResult.rowCount} stale portal user(s).`);
  }

  console.log(`[cleanup] Removed ${ids.length} stale test client(s).`);
  await pool.end();
}

main().catch((err) => {
  console.warn("[cleanup] Warning:", err.message);
  process.exit(0); // non-fatal
});
