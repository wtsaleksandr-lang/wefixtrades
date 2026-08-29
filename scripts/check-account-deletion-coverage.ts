/**
 * Account-deletion coverage guard.
 *
 * The privacy policy (§10) tells customers they can delete their account and
 * the personal data we hold. `shared/accountDeletion/plan.ts` is the promise
 * made concrete: every account-linked table classified as delete / anonymize /
 * keep, with a stated legal basis for anything kept.
 *
 * A hand-maintained list of 130 tables rots. This guard reads the LIVE Drizzle
 * metadata (`getTableConfig`, not a regex over source) and fails CI when the
 * plan and the schema disagree, so the drift surfaces at PR time instead of
 * becoming a silent compliance lie.
 *
 * Checks
 *   1. COVERAGE     — every table with an owner column, or with a foreign key
 *                     into a table we delete, is classified in the plan.
 *   2. REALITY      — every table and every scope column named by the plan
 *                     actually exists in the schema.
 *   3. LEGAL BASIS  — every `keep` entry states a reason.
 *   4. FK SAFETY    — nothing we keep (or never touch) holds a blocking
 *                     NO ACTION / RESTRICT foreign key into a table we delete.
 *                     Such a pair aborts the deletion transaction at runtime.
 *   5. ORDERING     — the computed delete order emits every table before any
 *                     table it points at, so no statement trips an FK.
 *   6. SCOPING      — no `delete` entry is unscoped. A missing predicate would
 *                     delete another tenant's data.
 *
 * Run: npm run check:account-deletion
 */
import { getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  deletedTables,
  deletionOrder,
  keptTables,
  planFor,
} from "@shared/accountDeletion/plan";

/**
 * Columns that make a table "account-linked" — i.e. it holds rows belonging to
 * one customer and therefore must have an explicit disposition.
 */
const OWNER_COLUMNS =
  /^(user_id|client_id|owner_user_id|owner_client_id|customer_id|linked_user_id|referred_client_id|target_user_id|admin_user_id|scope_client_id)$/;

/**
 * Tables that carry an owner column but are NOT per-customer data — global
 * registries and admin-only tooling. Each needs a one-line justification here
 * rather than a plan entry, so the exemption is as reviewable as the plan is.
 */
const NOT_CUSTOMER_DATA: Record<string, string> = {
  // Legal-hold registry. Consulted by the executor before it deletes; a hold
  // aborts the request. `created_by_admin_id` is staff, not the customer.
  retention_overrides: "legal-hold registry, keyed by admin author not customer",
  // Admin-console audit rows keyed by the STAFF member who acted.
  alert_actions_log: "admin actor id, not customer-owned",
  ai_budget_audit_log: "admin actor id, not customer-owned",
  ai_budget_config: "admin actor id, not customer-owned",
  admin_ai_actions: "admin reviewer id, not customer-owned",
  brand_availability: "admin actor id, not customer-owned",
  product_drafts: "admin authoring workflow, not customer-owned",
  review_response_edits: "admin editor id on a review we already delete",
  // Global suppression lists keyed by phone/email, never by account. Retained
  // for the same legal reason as the plan's suppression entries.
  outbound_blocked_emails: "global suppression list keyed by email",
  outbound_blocked_phones: "global suppression list keyed by phone",
  outbound_blocked_domains: "global suppression list keyed by domain",
  email_unsubscribes: "global suppression list keyed by email",
};

interface Meta {
  table: string;
  columns: Set<string>;
  /** Outbound foreign keys: this table -> target, with its ON DELETE rule. */
  fks: { columns: string[]; target: string; onDelete: string }[];
}

function loadSchema(): Map<string, Meta> {
  const out = new Map<string, Meta>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    const table = getTableName(value as PgTable);
    out.set(table, {
      table,
      columns: new Set(cfg.columns.map((c) => c.name)),
      fks: cfg.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          columns: ref.columns.map((c) => c.name),
          target: getTableName(ref.foreignTable as PgTable),
          onDelete: ((fk as unknown as { onDelete?: string }).onDelete ?? "no action").toLowerCase(),
        };
      }),
    });
  }
  return out;
}

const failures: string[] = [];
function fail(check: string, message: string): void {
  failures.push(`[${check}] ${message}`);
}

const meta = loadSchema();
const planned = new Set(ACCOUNT_DELETION_PLAN.map((p) => p.table));
const deleted = new Set(deletedTables().map((p) => p.table));

/* ── 2. REALITY ─────────────────────────────────────────────────────────── */
const seen = new Set<string>();
for (const entry of ACCOUNT_DELETION_PLAN) {
  if (seen.has(entry.table)) fail("REALITY", `${entry.table} is classified more than once`);
  seen.add(entry.table);

  const m = meta.get(entry.table);
  if (!m) {
    fail("REALITY", `${entry.table} is in the plan but no such table exists in the schema`);
    continue;
  }
  for (const col of entry.scope.columns) {
    if (!m.columns.has(col)) {
      fail("REALITY", `${entry.table}.${col} is named by the plan's scope but does not exist`);
    }
  }
  if (entry.scope.by === "parent") {
    const parent = meta.get(entry.scope.parent);
    if (!parent) {
      fail("REALITY", `${entry.table} is scoped through unknown parent ${entry.scope.parent}`);
    } else if (!parent.columns.has(entry.scope.parentKey)) {
      fail(
        "REALITY",
        `${entry.table} is scoped through ${entry.scope.parent}.${entry.scope.parentKey}, which does not exist`,
      );
    } else if (!planned.has(entry.scope.parent)) {
      fail("REALITY", `${entry.table} is scoped through ${entry.scope.parent}, which is not in the plan`);
    }
  }
  if (entry.action === "anonymize") {
    const fields = ANONYMISE_FIELDS[entry.table];
    if (!fields || Object.keys(fields).length === 0) {
      fail("REALITY", `${entry.table} is marked anonymize but ANONYMISE_FIELDS lists no columns`);
    } else {
      for (const col of Object.keys(fields)) {
        if (!m.columns.has(col)) {
          fail("REALITY", `ANONYMISE_FIELDS.${entry.table}.${col} does not exist on that table`);
        }
      }
    }
  }
}

/* ── 3. LEGAL BASIS ─────────────────────────────────────────────────────── */
for (const entry of keptTables()) {
  if (!entry.reason || entry.reason.trim().length < 30) {
    fail(
      "LEGAL BASIS",
      `${entry.table} is kept without a stated legal basis. Retaining data the ` +
        `privacy policy says we delete is only honest if the reason is written down.`,
    );
  }
}

/* ── 6. SCOPING ─────────────────────────────────────────────────────────── */
for (const entry of ACCOUNT_DELETION_PLAN) {
  if (entry.scope.columns.length === 0) {
    fail("SCOPING", `${entry.table} has no scope column — it would match every tenant's rows`);
  }
}

/* ── 1. COVERAGE ────────────────────────────────────────────────────────── */
for (const m of meta.values()) {
  if (planned.has(m.table)) continue;
  if (NOT_CUSTOMER_DATA[m.table]) continue;
  // connect-pg-simple's table; handled explicitly by the executor.
  if (m.table === "session") continue;

  const ownerCols = [...m.columns].filter((c) => OWNER_COLUMNS.test(c));
  if (ownerCols.length > 0) {
    fail(
      "COVERAGE",
      `${m.table} holds per-account data (${ownerCols.join(", ")}) but has no entry in ` +
        `ACCOUNT_DELETION_PLAN. Classify it as delete / anonymize / keep, or add it to ` +
        `NOT_CUSTOMER_DATA with a justification.`,
    );
    continue;
  }
  const intoDeleted = m.fks.filter((f) => deleted.has(f.target));
  if (intoDeleted.length > 0) {
    fail(
      "COVERAGE",
      `${m.table} hangs off deleted data (${intoDeleted
        .map((f) => `${f.columns.join("+")} -> ${f.target}`)
        .join(", ")}) but has no entry in ACCOUNT_DELETION_PLAN.`,
    );
  }
}

/* ── 4. FK SAFETY ───────────────────────────────────────────────────────── */
// A row we keep may not point at a row we delete unless the database nulls or
// cascades it for us — otherwise Postgres raises 23503 and the whole deletion
// transaction rolls back, leaving the customer's data in place.
const SAFE_ON_DELETE = new Set(["cascade", "set null", "set default"]);
for (const m of meta.values()) {
  const entry = planFor(m.table);
  const survives = !entry || entry.action !== "delete";
  if (!survives) continue;
  for (const fk of m.fks) {
    if (!deleted.has(fk.target)) continue;
    if (SAFE_ON_DELETE.has(fk.onDelete)) continue;
    fail(
      "FK SAFETY",
      `${m.table}.${fk.columns.join("+")} -> ${fk.target} is ON DELETE ${fk.onDelete.toUpperCase()}, ` +
        `but ${fk.target} is deleted while ${m.table} survives. This aborts the deletion ` +
        `transaction. Either delete ${m.table} too, or keep ${fk.target}.`,
    );
  }
}

/* ── 5. ORDERING ────────────────────────────────────────────────────────── */
const edges = new Map<string, string[]>();
for (const m of meta.values()) edges.set(m.table, m.fks.map((f) => f.target));
const order = deletionOrder(edges);
const position = new Map(order.map((t, i) => [t, i]));

if (order.length !== deleted.size) {
  fail("ORDERING", `delete order lists ${order.length} tables but ${deleted.size} are marked delete`);
}
for (const m of meta.values()) {
  if (!deleted.has(m.table)) continue;
  for (const fk of m.fks) {
    if (!deleted.has(fk.target) || fk.target === m.table) continue;
    const self = position.get(m.table)!;
    const target = position.get(fk.target)!;
    if (self > target) {
      fail(
        "ORDERING",
        `${m.table} is deleted after ${fk.target}, which it references ` +
          `(${fk.columns.join("+")}). The parent delete would fail on a live foreign key.`,
      );
    }
  }
}

/* ── Report ─────────────────────────────────────────────────────────────── */
const covered = planned.size;
const exempt = Object.keys(NOT_CUSTOMER_DATA).length;

if (failures.length === 0) {
  console.log(
    `check:account-deletion — OK (${meta.size} tables scanned; ${covered} classified ` +
      `[${deleted.size} delete, ${keptTables().length} keep, ` +
      `${ACCOUNT_DELETION_PLAN.filter((p) => p.action === "anonymize").length} anonymize]; ` +
      `${exempt} exempt; delete order FK-safe)`,
  );
  process.exit(0);
}

console.error(`check:account-deletion — FAIL: ${failures.length} problem(s)\n`);
for (const f of failures) console.error(`  ${f}`);
console.error(
  "\nEvery table holding per-account data must be classified in " +
    "shared/accountDeletion/plan.ts. This guard exists because the privacy " +
    "policy promises deletion, and an unclassified table is data that " +
    "silently survives a deletion the customer was told completed.\n",
);
process.exit(1);
