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
 *   7. OBJECTS      — every column declared in STORED_OBJECTS exists, sits on a
 *                     table the plan actually erases, and is readable.
 *   8. OBJECT COVERAGE
 *                   — every column in the schema that looks like a pointer into
 *                     a store outside Postgres is either declared in
 *                     STORED_OBJECTS or exempted here with a written reason.
 *                     Deleting the row does not delete the file; this check is
 *                     what stops a new file-bearing column from shipping with
 *                     the bytes left behind.
 *
 * Run: npm run check:account-deletion
 */
import { getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  STORED_OBJECTS,
  deletedTables,
  deletionOrder,
  keptTables,
  planFor,
  tablesWithObjects,
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

/**
 * Column names that address bytes held outside Postgres.
 *
 * Anchored to the suffixes this codebase actually mints for storage pointers,
 * so a new `*_object_key` / `*_storage_key` / `*_file_path` column cannot ship
 * without a disposition. Irregularly-named pointers (`attachments`,
 * `deliverables`, `logo_url`, `video_url`, `answers`) cannot be recognised by
 * name without swamping this in false positives — those are declared in
 * STORED_OBJECTS and verified by check 7 instead.
 */
const OBJECT_POINTER_COLUMN =
  /(^|_)(object_key|object_name|storage_key|storage_path|blob_key|file_key|asset_key|attachment_key|upload_key|file_path|cache_path)$/;

/**
 * Pointer-shaped columns that hold nothing we must erase on request. Keyed
 * `table.column`, each with the reason — the same standard the `keep` entries
 * are held to, because "we looked and it was fine" has to be written down to be
 * reviewable.
 */
const NO_STORED_OBJECTS: Record<string, string> = {
  "service_area_map_configs.cache_path":
    "Regenerable render cache, not customer-supplied content. The row (and the " +
    "business address it derives from) is deleted; the cached PNG is rebuilt " +
    "from config on demand and is not reachable from any retained pointer.",
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

/* ── 7. OBJECTS ─────────────────────────────────────────────────────────── */
// A declaration that names a column which does not exist, or sits on a table we
// keep, is a purge that silently does nothing.
for (const table of Object.keys(STORED_OBJECTS)) {
  if (!planFor(table)) {
    fail(
      "OBJECTS",
      `STORED_OBJECTS declares files on ${table}, which has no entry in ` +
        `ACCOUNT_DELETION_PLAN. The declaration is never read.`,
    );
  }
}

for (const entry of tablesWithObjects()) {
  const m = meta.get(entry.table);
  if (!m) continue; // already reported by REALITY

  if (entry.action === "keep") {
    fail(
      "OBJECTS",
      `${entry.table} is kept, but declares stored objects. A kept row keeps its ` +
        `files — either delete the row or drop the declaration, rather than ` +
        `implying an erasure that never happens.`,
    );
  }

  for (const source of entry.objects!) {
    if (!m.columns.has(source.column)) {
      fail(
        "OBJECTS",
        `${entry.table}.${source.column} is declared as a file pointer but does not ` +
          `exist on that table.`,
      );
    }
    if (source.read === "jsonField" && !source.field?.trim()) {
      fail(
        "OBJECTS",
        `${entry.table}.${source.column} is read as jsonField but names no field, so ` +
          `it would yield no keys.`,
      );
    }
  }
}

/* ── 8. OBJECT COVERAGE ─────────────────────────────────────────────────── */
// The regression guard: a new pointer column must be classified, not defaulted
// into "the row goes, the bytes stay".
for (const m of meta.values()) {
  for (const column of [...m.columns].sort()) {
    if (!OBJECT_POINTER_COLUMN.test(column)) continue;
    if (NO_STORED_OBJECTS[`${m.table}.${column}`]) continue;

    const entry = planFor(m.table);
    if (!entry) {
      fail(
        "OBJECT COVERAGE",
        `${m.table}.${column} points at a file store, but ${m.table} has no entry in ` +
          `ACCOUNT_DELETION_PLAN at all.`,
      );
      continue;
    }
    if (entry.objects?.some((s) => s.column === column)) continue;

    fail(
      "OBJECT COVERAGE",
      `${m.table}.${column} points at bytes stored outside Postgres, but nothing ` +
        `erases them when the account is deleted. Deleting the row only deletes the ` +
        `pointer — and none of our stores can be listed by prefix, so the file then ` +
        `becomes unreachable forever. Add it to STORED_OBJECTS in ` +
        `shared/accountDeletion/plan.ts, or to NO_STORED_OBJECTS in this file with a ` +
        `written reason.`,
    );
  }
}

/* ── Report ─────────────────────────────────────────────────────────────── */
const covered = planned.size;
const exempt = Object.keys(NOT_CUSTOMER_DATA).length;
const objectSources = tablesWithObjects().reduce((n, p) => n + (p.objects?.length ?? 0), 0);

if (failures.length === 0) {
  console.log(
    `check:account-deletion — OK (${meta.size} tables scanned; ${covered} classified ` +
      `[${deleted.size} delete, ${keptTables().length} keep, ` +
      `${ACCOUNT_DELETION_PLAN.filter((p) => p.action === "anonymize").length} anonymize]; ` +
      `${exempt} exempt; delete order FK-safe; ${objectSources} file-pointer ` +
      `column(s) across ${tablesWithObjects().length} table(s) purged on deletion)`,
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
