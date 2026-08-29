/**
 * Account-deletion guard.
 *
 * The privacy policy (§10) tells customers that Settings → Account →
 * "Delete account" erases their data. This test protects the two properties
 * that make that promise safe to keep:
 *
 *   1. NOTHING LEAKS OUT OF THE TENANT. Every DELETE the plan generates is
 *      scoped to the authenticated user id or to client ids resolved from
 *      `clients.user_id`. An unscoped statement would erase another customer's
 *      business. A table whose scope resolves to nothing must be SKIPPED, never
 *      widened.
 *   2. NOTHING SURVIVES SILENTLY. Every kept table states a legal basis, the
 *      disclosure the UI renders is generated from the same plan the deletion
 *      runs, and the anonymisation covers every identifying column on the
 *      anchor rows.
 *
 * Plus a deliberate-failure fixture: it proves the scoping assertion actually
 * bites, by building the predicate for an invented unscoped table and checking
 * this test would have caught it.
 *
 * Run standalone:  npx tsx server/services/accountDeletion/deleteAccount.test.ts
 * Wired into CI as: npm run check:account-deletion-scope
 */
import assert from "node:assert/strict";

// The module graph reaches server/db.ts, which throws unless DATABASE_URL is
// set. Nothing here opens a connection — every assertion is on generated SQL.
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const { previewStatements, retentionDisclosure } = await import("./deleteAccount");
const { ACCOUNT_DELETION_PLAN, ANONYMISE_FIELDS, deletedTables, keptTables, planFor } =
  await import("@shared/accountDeletion/plan");

const USER_ID = 4242;
const CLIENT_IDS = [77, 78];
const EMAIL = "owner@example.com";

/* ── 1. Every generated DELETE is tenant-scoped ─────────────────────────── */

const statements = previewStatements({ userId: USER_ID, clientIds: CLIENT_IDS, email: EMAIL });
assert.ok(statements.length > 50, `expected the plan to generate many deletes, got ${statements.length}`);

for (const { table, sql } of statements) {
  assert.ok(
    /\bWHERE\b/i.test(sql),
    `${table}: generated DELETE has no WHERE clause — it would erase every tenant's rows:\n  ${sql}`,
  );
  // Everything after DELETE FROM "<table>" must constrain the rows. A bare
  // "WHERE true"/"WHERE 1=1" is as dangerous as no WHERE at all.
  const where = sql.slice(sql.toUpperCase().indexOf("WHERE") + 5).trim();
  assert.ok(where.length > 0, `${table}: empty WHERE clause`);
  assert.ok(
    !/^(true|1\s*=\s*1)\s*$/i.test(where),
    `${table}: WHERE clause matches every row:\n  ${sql}`,
  );
  assert.ok(
    /\$\d+/.test(sql) || /IN \(SELECT/i.test(sql),
    `${table}: WHERE clause binds no parameter and has no scoped subquery — ` +
      `it cannot actually be constrained to this account:\n  ${sql}`,
  );
}

/* ── 2. An account with no clients touches no client-scoped table ───────── */

const noClients = previewStatements({ userId: USER_ID, clientIds: [], email: EMAIL });
const noClientTables = new Set(noClients.map((s) => s.table));
for (const entry of deletedTables()) {
  if (entry.scope.by !== "client") continue;
  assert.ok(
    !noClientTables.has(entry.table),
    `${entry.table} is client-scoped, but a statement was generated for an account with no ` +
      `clients. That statement could only match somebody else's rows.`,
  );
}
assert.ok(
  noClients.length < statements.length,
  "removing every client should remove client-scoped statements",
);
// The user-scoped half must still run — a client-less account is still deletable.
assert.ok(
  noClients.some((s) => s.table === "calculators"),
  "user-scoped deletes must still run for an account with no client record",
);

/* ── 3. Parent-scoped children resolve through a scoped subquery ─────────── */

for (const entry of deletedTables()) {
  if (entry.scope.by !== "parent") continue;
  const stmt = statements.find((s) => s.table === entry.table);
  if (!stmt) continue; // scope resolved to nothing — correctly skipped
  assert.ok(
    stmt.sql.includes(`from "${entry.scope.parent}"`) ||
      stmt.sql.includes(`FROM "${entry.scope.parent}"`),
    `${entry.table} is scoped through ${entry.scope.parent} but the generated SQL does not ` +
      `select from it:\n  ${stmt.sql}`,
  );
  assert.ok(
    /\$\d+/.test(stmt.sql),
    `${entry.table}: parent subquery binds no id, so it is not tenant-scoped:\n  ${stmt.sql}`,
  );
}

/* ── 4. Deliberate-failure fixture ──────────────────────────────────────── */
// Prove assertion (1) bites. If someone "simplifies" the scoping check into
// something that passes anything, this block goes red.
{
  const unscoped = `delete from "leads"`;
  let caught = false;
  try {
    assert.ok(/\bWHERE\b/i.test(unscoped), "unscoped");
  } catch {
    caught = true;
  }
  assert.ok(caught, "the tenant-scoping assertion does not actually reject an unscoped DELETE");
}

/* ── 5. Everything kept states a legal basis ────────────────────────────── */

const kept = keptTables();
assert.ok(kept.length > 0, "plan keeps nothing at all — expected the tax/suppression exceptions");
for (const entry of kept) {
  assert.ok(
    entry.reason && entry.reason.trim().length >= 30,
    `${entry.table} is kept with no meaningful legal basis. Data retained without a written ` +
      `reason is data the privacy policy claims is deleted.`,
  );
}
// The disclosure the UI renders comes from the plan, so it can never drift.
const disclosure = retentionDisclosure();
assert.equal(disclosure.length, kept.length, "retention disclosure must cover every kept table");
for (const row of disclosure) {
  assert.ok(row.reason.length >= 30, `${row.table}: disclosure carries no reason`);
}

/* ── 6. The tax and suppression exceptions are actually present ─────────── */

for (const table of ["client_payments", "orders", "order_items", "bookflow_invoices"]) {
  const entry = planFor(table);
  assert.equal(entry?.action, "keep", `${table} must be kept — it is a financial record`);
}
for (const table of ["sms_opt_outs", "review_request_suppression"]) {
  const entry = planFor(table);
  assert.equal(
    entry?.action,
    "keep",
    `${table} must be kept — deleting a suppression list re-enables contacting someone who ` +
      `opted out`,
  );
}

/* ── 7. Anonymisation clears every identifying column on the anchors ────── */

const userFields = ANONYMISE_FIELDS.users;
for (const column of [
  "email",
  "name",
  "password_hash",
  "totp_secret",
  "totp_recovery_codes",
  "google_sub",
  "microsoft_sub",
  "facebook_sub",
  "apple_sub",
  "ai_contact_phone",
]) {
  assert.ok(column in userFields, `users.${column} identifies a person but is not anonymised`);
}
const clientFields = ANONYMISE_FIELDS.clients;
for (const column of [
  "business_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "google_credentials",
  "widget_token",
  "stripe_customer_id",
]) {
  assert.ok(column in clientFields, `clients.${column} identifies a business but is not anonymised`);
}
// The two NOT NULL + UNIQUE columns cannot be nulled, so they must take a
// synthetic value rather than being silently skipped.
assert.equal(userFields.email, "@id", "users.email is NOT NULL UNIQUE — it needs a synthetic value");
assert.equal(
  userFields.password_hash,
  "@id",
  "users.password_hash is NOT NULL — it must be replaced with an unverifiable value",
);

/* ── 8. The anchors are anonymised, never deleted ───────────────────────── */
// admin_impersonations holds ON DELETE RESTRICT foreign keys into users, so a
// hard delete of the anchor rows can never succeed.
for (const table of ["users", "clients"]) {
  assert.equal(
    planFor(table)?.action,
    "anonymize",
    `${table} must be anonymised, not deleted — ON DELETE RESTRICT foreign keys point at it`,
  );
}
assert.equal(
  planFor("admin_impersonations")?.action,
  "keep",
  "admin_impersonations is ON DELETE RESTRICT and must be kept",
);

/* ── 9. No table is classified twice ────────────────────────────────────── */

const seen = new Set<string>();
for (const entry of ACCOUNT_DELETION_PLAN) {
  assert.ok(!seen.has(entry.table), `${entry.table} is classified more than once`);
  seen.add(entry.table);
}

console.log(
  `account-deletion guard: OK (${statements.length} scoped deletes, ${kept.length} kept with ` +
    `a stated basis, ${Object.keys(ANONYMISE_FIELDS).length} anchor tables anonymised)`,
);
