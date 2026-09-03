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
 *   9. TWILIO COVERAGE
 *                   — the same rule for the data we do not host at all. Every
 *                     column that holds a Twilio identifier must either be
 *                     declared with `store: "twilio"` or exempted here with a
 *                     written reason. "It is a third-party API" is what left the
 *                     customer's recorded voice on Twilio's servers through a
 *                     deletion that reported success, so it is no longer an
 *                     answer a column can ship with.
 *
 * Run: npm run check:account-deletion
 */
import { getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  METADATA_REDACTIONS,
  PII_METADATA_KEYS,
  RETENTION_SWEEPS,
  STORED_OBJECTS,
  deletedTables,
  deletionOrder,
  keptTables,
  planFor,
  redactionFor,
  scopeColumns,
  scopeParents,
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
  /* `reviewed_by` is the STAFF member who approved or rejected a proposal, so
   * this table is correctly outside the owner-column sweep. That is not the
   * same as holding no customer data: `detail` carries the account holder's own
   * login address, a lead's email address and an IP, which is why the table has
   * a METADATA_REDACTIONS entry. The exemption is about the COLUMN, not the
   * blob — check 10 and check 11 cover the blob. */
  admin_ai_actions:
    "admin reviewer id, not customer-owned; the customer data in `detail` is " +
    "reached by METADATA_REDACTIONS instead",
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

/**
 * Column names that hold a Twilio identifier — a SID, or a REST URL that
 * resolves to one.
 *
 * Twilio is not a store we run, but the failure mode is identical and was
 * shipped for real: `voicemails.recording_url` holds a pointer at the caller's
 * recorded voice, the row was deleted, the audio was not, and the deletion
 * reported success. This pattern is what forces the next such column to be
 * classified instead of assumed out of scope.
 */
const TWILIO_ARTEFACT_COLUMN =
  /(^|_)(call_sid|conference_sid|recording_sid|recording_url|recording_uri|transcription_sid|transcription_url|message_sid|media_sid|media_url|number_sid|binding_sid|verification_sid)$|(^|_)twilio(_[a-z0-9]+)*_(sid|url)$/;

/**
 * Twilio-shaped columns that hold nothing we erase on request. Keyed
 * `table.column`, each with the reason.
 *
 * Two distinct kinds live here and the distinction matters, because getting it
 * wrong in the other direction — deleting something that is not this customer's
 * — is worse than the bug this mechanism fixes:
 *   • NOT AT TWILIO: the column looks Twilio-shaped but addresses somebody else.
 *   • NOT THIS CUSTOMER'S TO DELETE: it is at Twilio, but it belongs to the
 *     WeFixTrades account as infrastructure, or is evidence somebody else is
 *     required to hold.
 */
const NO_TWILIO_ARTEFACTS: Record<string, string> = {
  "tradeline_call_log.recording_url":
    "NOT AT TWILIO. This is a Vapi-hosted URL (server/services/vapiService.ts), " +
    "not api.twilio.com — the call reached Vapi through a Twilio number but the " +
    "recording is Vapi's, and Vapi expires it ~30 days after the call. The copy " +
    "we control is `mirrored_object_key`, which IS declared in STORED_OBJECTS " +
    "and erased from Replit Object Storage on deletion.",

  "mapguard_posts.media_url":
    "NOT AT TWILIO. Google Business Profile post imagery. Matched only because " +
    "the pattern has to catch a future MMS `media_url` column; this one is not " +
    "one and holds no Twilio resource.",

  /* `tradeline_phone_setups.assigned_number_sid` used to be exempted here, on
   * the grounds that in the PORT flow the number is the customer's own and
   * releasing it would destroy a phone number rather than erase personal data.
   * That reasoning was right about the port flow and wrong about the other two:
   * in `new` and `forward` we bought the number ourselves and it kept billing
   * after the deletion had destroyed the only copy of its SID. It is now
   * declared against the `twilioNumber` store with a `when` condition that
   * excludes `mode: "port"` — the distinction the exemption could not express.
   * See the store's own note in shared/accountDeletion/plan.ts. */

  "tradeline_phone_setups.port_twilio_order_sid":
    "RETAINED DELIBERATELY. The Twilio port-in order is the carrier-side record " +
    "that this subscriber authorised the transfer of their number, and it is the " +
    "record shared/accountDeletion/plan.ts already relies on when it destroys our " +
    "own copy of the signed LOA. Deleting it would leave a completed port with no " +
    "authorisation evidence behind it, and cancelling one still in flight would " +
    "strand the number mid-transfer. Narrow: the order only — the recordings, " +
    "calls and messages on the same account are erased. The deletion copy says so.",

  "mobile_devices.twilio_binding_sid":
    "NOT THIS CUSTOMER'S TO DELETE, and never written. The Binding create path is " +
    "an unimplemented TODO (server/routes/mobileVoiceRoutes.ts) — /push/register " +
    "only ever clears this column. What the read path resolves today is a " +
    "per-platform Push Credential from TWILIO_PUSH_CREDENTIAL_SID_IOS/_ANDROID, " +
    "shared by every device on that platform. Deleting it would break inbound call " +
    "push for every other customer.",
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
  // Flattened through `anyOf`, so a table reachable by two routes is checked on
  // both — a branch nobody validates is a branch that can name a dead column
  // and silently match nothing.
  for (const col of scopeColumns(entry.scope)) {
    if (!m.columns.has(col)) {
      fail("REALITY", `${entry.table}.${col} is named by the plan's scope but does not exist`);
    }
  }
  for (const { parent: parentTable, parentKey } of scopeParents(entry.scope)) {
    const parent = meta.get(parentTable);
    if (!parent) {
      fail("REALITY", `${entry.table} is scoped through unknown parent ${parentTable}`);
    } else if (!parent.columns.has(parentKey)) {
      fail(
        "REALITY",
        `${entry.table} is scoped through ${parentTable}.${parentKey}, which does not exist`,
      );
    } else if (!planned.has(parentTable)) {
      fail("REALITY", `${entry.table} is scoped through ${parentTable}, which is not in the plan`);
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
  if (scopeColumns(entry.scope).length === 0) {
    fail("SCOPING", `${entry.table} has no scope column — it would match every tenant's rows`);
  }
  // An `anyOf` with one branch is a single scope wearing a disguise; with none
  // it reads as "scoped" while constraining nothing.
  if (entry.scope.by === "anyOf" && entry.scope.scopes.length < 2) {
    fail(
      "SCOPING",
      `${entry.table} declares an anyOf scope with ${entry.scope.scopes.length} branch(es). ` +
        `Use the single scope directly, or add the route that is missing.`,
    );
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
    if (source.when) {
      // A condition on a column that does not exist reads as NULL, which
      // COLLECTS — so a typo here silently turns a guarded declaration into an
      // unguarded one, in the direction that deletes more.
      if (!m.columns.has(source.when.column)) {
        fail(
          "OBJECTS",
          `${entry.table}.${source.column} is guarded on ${entry.table}.${source.when.column}, ` +
            `which does not exist. A missing guard column reads as NULL and the artefact is ` +
            `collected anyway — the condition would protect nothing.`,
        );
      }
      if (source.when.unless.length === 0) {
        fail(
          "OBJECTS",
          `${entry.table}.${source.column} declares a \`when\` that excludes nothing, so it ` +
            `is an unconditional declaration wearing a condition.`,
        );
      }
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

/* ── 9. TWILIO COVERAGE ─────────────────────────────────────────────────── */
// Same regression guard as check 8, for the data we do not host at all. A new
// column holding a Twilio identifier must be classified — declared with
// `store: "twilio"` so the purge erases it, or exempted above with a reason.
for (const m of meta.values()) {
  for (const column of [...m.columns].sort()) {
    if (!TWILIO_ARTEFACT_COLUMN.test(column)) continue;
    if (NO_TWILIO_ARTEFACTS[`${m.table}.${column}`]) continue;

    const entry = planFor(m.table);
    if (!entry) {
      fail(
        "TWILIO COVERAGE",
        `${m.table}.${column} holds a Twilio identifier, but ${m.table} has no entry in ` +
          `ACCOUNT_DELETION_PLAN at all, so the row is never even in scope.`,
      );
      continue;
    }
    const declared = entry.objects?.find((s) => s.column === column);
    if (declared) {
      /* Which of the two Twilio stores a column belongs to is decided by what it
       * holds, not by preference. `deleteTwilioArtefact` cannot address a phone
       * number (that is the property that keeps it from reaching WeFixTrades'
       * own infrastructure) and `releaseNumberArtefact` cannot address anything
       * else. Getting the pairing wrong means a purge that fails on every row. */
      const wantsNumberStore = /(^|_)number_sid$/.test(column);
      const expected = wantsNumberStore ? "twilioNumber" : "twilio";
      if (declared.store !== expected) {
        fail(
          "TWILIO COVERAGE",
          `${m.table}.${column} is declared against store "${declared.store}", but it ` +
            `holds ${wantsNumberStore ? "an IncomingPhoneNumber SID" : "a per-customer Twilio resource"} ` +
            `and must be declared against "${expected}". The other store's deleter cannot ` +
            `address it, so the purge would report a failure for every row.`,
        );
      }
      /* A number release is irreversible and takes a phone number away from
       * whoever it belongs to. In the port flow that is the customer, which is
       * why an unconditional declaration is refused outright rather than left to
       * a reviewer to notice. */
      if (declared.store === "twilioNumber" && !declared.when) {
        fail(
          "TWILIO COVERAGE",
          `${m.table}.${column} releases a phone number unconditionally. The same column ` +
            `holds a number WE bought in the "new"/"forward" flows and is bound up with the ` +
            `customer's OWN ported-in number in the "port" flow — releasing that one would ` +
            `destroy a phone number rather than erase personal data. Declare a \`when\` ` +
            `condition that excludes it.`,
        );
      }
      continue;
    }

    fail(
      "TWILIO COVERAGE",
      `${m.table}.${column} points at data held by Twilio — a recording, a message, ` +
        `a call — and nothing erases it when the account is deleted. Deleting the row ` +
        `deletes our pointer, not Twilio's copy, and we deliberately never list Twilio ` +
        `to find it again, so the artefact becomes unreachable. Declare it in ` +
        `STORED_OBJECTS with store: "twilio" in shared/accountDeletion/plan.ts, or add ` +
        `it to NO_TWILIO_ARTEFACTS in this file with a written reason. "Third-party API, ` +
        `out of scope" is what left a customer's recorded voice on Twilio's servers ` +
        `through a deletion that reported success.`,
    );
  }
}

// An exemption that names a column which no longer exists is a reason nobody
// will ever re-read, and it silently stops covering anything.
for (const key of Object.keys(NO_TWILIO_ARTEFACTS)) {
  const [table, column] = key.split(".");
  const m = meta.get(table);
  if (!m || !m.columns.has(column)) {
    fail(
      "TWILIO COVERAGE",
      `NO_TWILIO_ARTEFACTS exempts ${key}, which does not exist in the schema. ` +
        `Remove the stale exemption rather than leaving it to cover nothing.`,
    );
  } else if (!TWILIO_ARTEFACT_COLUMN.test(column)) {
    fail(
      "TWILIO COVERAGE",
      `NO_TWILIO_ARTEFACTS exempts ${key}, but that column name is not one this ` +
        `check would ever flag — the exemption is dead weight.`,
    );
  }
}

/* ── 10. REDACTION ──────────────────────────────────────────────────────── */
// The rows we keep and scrub. Structural checks only — check 11 is the one that
// proves the scrub still covers what the callers actually write.
for (const entry of METADATA_REDACTIONS) {
  const m = meta.get(entry.table);
  if (!m) {
    fail("REDACTION", `${entry.table} is declared in METADATA_REDACTIONS but no such table exists`);
    continue;
  }
  if (!entry.reason || entry.reason.trim().length < 30) {
    fail(
      "REDACTION",
      `${entry.table} is retained-and-scrubbed without a stated reason. Keeping a row the ` +
        `customer asked us to delete needs the same written justification a \`keep\` does.`,
    );
  }
  if (entry.match.length === 0) {
    fail(
      "REDACTION",
      `${entry.table} declares no match, so no row would ever be found and the scrub is a no-op.`,
    );
  }
  if (entry.jsonColumns.length === 0 && entry.textColumns.length === 0) {
    fail("REDACTION", `${entry.table} names no column to scrub.`);
  }
  const planEntry = planFor(entry.table);
  if (planEntry?.action === "delete") {
    fail(
      "REDACTION",
      `${entry.table} is DELETED by the plan and also declared for redaction. A deleted row ` +
        `needs no scrubbing; one of the two is wrong about what happens to this table.`,
    );
  }
  for (const column of [...entry.jsonColumns, ...entry.textColumns]) {
    if (!m.columns.has(column)) {
      fail("REDACTION", `${entry.table}.${column} is declared for redaction but does not exist.`);
    }
  }
  for (const column of entry.twilioColumns) {
    if (!entry.jsonColumns.includes(column)) {
      fail(
        "REDACTION",
        `${entry.table}.${column} is mined for Twilio SIDs but is not one of the scrubbed ` +
          `jsonColumns. Collecting from a blob nothing scrubs is pointless; scrubbing a blob ` +
          `nothing collects from destroys the only pointer to data still held at Twilio.`,
      );
    }
  }
  for (const match of entry.match) {
    const cols =
      match.by === "entity" ? [match.typeColumn, match.idColumn] : [match.column];
    for (const col of cols) {
      if (!m.columns.has(col)) {
        fail(
          "REDACTION",
          `${entry.table}.${col} is named by a redaction match but does not exist — that ` +
            `branch would match nothing and the rows it was meant to find keep their PII.`,
        );
      }
    }
    /* A `parentJson` branch resolves its scope by looking the parent up in the
     * plan, so a parent that is not there throws at deletion time — inside the
     * transaction, aborting the customer's erasure. Caught here instead. */
    if (match.by === "parentJson") {
      const parent = meta.get(match.parent);
      if (!parent) {
        fail(
          "REDACTION",
          `${entry.table}.${match.column} is attributed through unknown parent table ` +
            `${match.parent}.`,
        );
      } else if (!parent.columns.has(match.parentKey)) {
        fail(
          "REDACTION",
          `${entry.table}.${match.column} is attributed through ${match.parent}.` +
            `${match.parentKey}, which does not exist.`,
        );
      }
      if (!planned.has(match.parent)) {
        fail(
          "REDACTION",
          `${entry.table}.${match.column} is attributed through ${match.parent}, which has no ` +
            `entry in ACCOUNT_DELETION_PLAN — there is no scope to resolve, so the branch ` +
            `would throw inside the deletion transaction and abort the erasure.`,
        );
      }
    }
    /* A path that names no key reads as the whole column, which for a jsonb
     * blob is never an id and so matches nothing — a branch that looks like
     * attribution and provides none. */
    if ((match.by === "clientJson" || match.by === "userJson" || match.by === "parentJson") &&
        match.path.length === 0) {
      fail(
        "REDACTION",
        `${entry.table}.${match.column} declares a JSON match with an empty path, so it would ` +
          `never resolve an id and the branch attributes nothing.`,
      );
    }
  }
}

/* ── 10b. RETENTION ─────────────────────────────────────────────────────── */
/**
 * The sweeps that bound the personal data no deletion can reach.
 *
 * Two failure directions, and the second is the dangerous one:
 *   • A sweep that names a table or column that does not exist runs forever
 *     without deleting anything, and the data it was declared to bound goes on
 *     accumulating behind a policy that reads as though it is enforced.
 *   • A sweep with no `unattributedWhen` on a table the deletion path CAN reach
 *     would age out a customer's rows on a timer rather than on their request —
 *     erasing data early and silently, which is worse than the leak it fixes.
 */
for (const entry of RETENTION_SWEEPS) {
  const m = meta.get(entry.table);
  if (!m) {
    fail("RETENTION", `${entry.table} is declared in RETENTION_SWEEPS but no such table exists`);
    continue;
  }
  if (!m.columns.has(entry.ageColumn)) {
    fail(
      "RETENTION",
      `${entry.table}.${entry.ageColumn} is the sweep's age column but does not exist, so the ` +
        `sweep would throw and the data would stay forever.`,
    );
  }
  if (!entry.reason || entry.reason.trim().length < 30) {
    fail(
      "RETENTION",
      `${entry.table} is swept on a timer without a stated reason. Keeping — and then ` +
        `destroying — personal data no customer can ask about needs the same written ` +
        `justification a \`keep\` does.`,
    );
  }
  if (!Number.isInteger(entry.days) || entry.days <= 0) {
    fail("RETENTION", `${entry.table} declares a non-positive retention window (${entry.days}).`);
  }
  for (const probe of entry.unattributedWhen ?? []) {
    if (!m.columns.has(probe.column)) {
      fail(
        "RETENTION",
        `${entry.table}.${probe.column} is an attribution probe but does not exist. A missing ` +
          `probe column would make the sweep raise, or — worse, if it were ever relaxed — ` +
          `widen it onto rows a deletion could have reached.`,
      );
    }
  }
  const reachable = planFor(entry.table) !== undefined || redactionFor(entry.table) !== undefined;
  if (reachable && (entry.unattributedWhen ?? []).length === 0) {
    fail(
      "RETENTION",
      `${entry.table} is swept unconditionally, but an account deletion can reach rows in it. ` +
        `The sweep would destroy a customer's data on a timer instead of on their request. ` +
        `Narrow it with \`unattributedWhen\` so it only takes rows that name nobody.`,
    );
  }
  if (!reachable && (entry.unattributedWhen ?? []).length > 0) {
    fail(
      "RETENTION",
      `${entry.table} narrows its sweep with \`unattributedWhen\`, but no plan entry and no ` +
        `redaction entry claims the table, so every row in it is already unattributable. ` +
        `Either the narrowing is dead weight or the table is missing its plan entry.`,
    );
  }
}

/* ── 11. METADATA PII COVERAGE ──────────────────────────────────────────── */
/**
 * The regression guard for the hole this whole check exists to close: personal
 * data written into a jsonb blob rather than a typed column.
 *
 * Checks 8 and 9 read the live schema, because a file pointer and a Twilio SID
 * each live in a column with a name. What lands INSIDE a `jsonb metadata` column
 * has no schema at all — it is whatever an object literal at a call site says it
 * is — so the only ground truth is the source, and this is the one check that
 * reads it. (`OBJECT_POINTER_COLUMN` already establishes that a name pattern
 * plus a written exemption list is an acceptable shape here.)
 *
 * Every PII-shaped key written into an audited blob must either be in
 * `PII_METADATA_KEYS`, so the scrub replaces it, or be exempted below with a
 * reason. "It is only in a log" is what left the recipient's phone number and
 * the full text of an SMS in a row nothing ever touched.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Key names that look like personal data. Deliberately broader than
 * `PII_METADATA_KEYS`: this is the net, that is the disposition. A key caught
 * here is not an accusation, it is a demand that somebody classify it.
 */
const PII_SHAPED_KEY =
  /(^|_)(body|message|msg|text|content|transcript|subject|reply|reply_text|phone|phone_number|number|recipient|email|address|street|name|note|notes|answers|summary|reviewer|ip|ip_address|user_agent)$/i;

/**
 * PII-shaped keys that hold nothing personal, keyed `key` or `file:key`, each
 * with the reason — the same standard `NO_STORED_OBJECTS` is held to.
 */
const NOT_METADATA_PII: Record<string, string> = {
  tool_name: "The NAME of an AI tool ('send_support_sms'), not its arguments.",
  template_name: "Template identifier, not content.",
  action_name: "Action identifier.",
  event_name: "Event identifier.",
  job_name:
    "Cron/worker identifier ('review_monitor'), written by the worker_failed " +
    "alert in server/jobs/scheduler.ts. Our own scheduler's name for a job, not " +
    "a person's name.",
  hasText:
    "A BOOLEAN — `!!normalized.reviewText` in server/jobs/reviewMonitorWorker.ts, " +
    "recording only WHETHER the review had a body. The body itself is never " +
    "written to the blob, and the reviewer's name beside it (`reviewer`) IS in " +
    "PII_METADATA_KEYS and is scrubbed.",
  field_name: "Schema field identifier.",
  provider_name: "Third-party provider identifier (Stripe, Twilio, Vapi).",
  supplier_name:
    "A fulfilment SUPPLIER's trading name — our vendor, not the customer, and not " +
    "erased by a customer's deletion request.",
  file_name: "Uploaded file's own name; the file itself is purged via STORED_OBJECTS.",
  step_name: "Wizard step identifier.",
  plan_name: "Subscription plan identifier.",
  status_text: "Status string from a provider API.",
  error_text: "Error message from a provider API.",
  legacy_alias: "Internal template alias.",
  brand_name: "WeFixTrades' own brand, not the customer's.",
  from_status: "Workflow status transition, not a sender.",
  to_status: "Workflow status transition, not a recipient.",
  from: "Workflow/value transition pair (`from`/`to`), not a phone number or address.",
  to: "Workflow/value transition pair (`from`/`to`), not a phone number or address.",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** The index just past the balanced `open`…`close` pair starting at `from`. */
function balancedEnd(src: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i + 1;
  }
  return src.length;
}

/**
 * Which redaction entry receives a given writer's blob. Hard-wired because the
 * mapping is a fact about a few named helpers, not a pattern to infer:
 * `writeAudit` writes `audit_log`, `logAdminActivity` writes
 * `admin_activity_log`, `fireAlert` writes `system_alerts`.
 *
 * `fireAlert` is here because it is the same shape of hole: 30-odd call sites
 * across crons, workers and routes each hand it a hand-written `metadata`
 * object literal with no schema, and several put the customer's business name
 * and contact details in it. Until the redaction entry existed there was
 * nothing to scrub them out of; now that there is, this is what stops the next
 * caller quietly adding a key it does not cover.
 */
const AUDIT_WRITERS: Record<string, string> = {
  writeAudit: "audit_log",
  logAdminActivity: "admin_activity_log",
  fireAlert: "system_alerts",
};

/**
 * Fold a key to the form the scrub compares on — lower-case, separators
 * stripped. Must stay in step with `foldKey` in
 * `server/services/accountDeletion/deleteAccount.ts`: if this guard decided a
 * key was covered on a different rule than the scrub actually uses, it would
 * pass a key the scrub then walks straight past.
 */
function foldKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Does this key LOOK like personal data?
 *
 * `PII_SHAPED_KEY` is anchored on `_` separators, so it sees `business_name`
 * and walks past `businessName` — and the callers write both spellings of the
 * same field (`services/reputation/reputationAlerts.ts` vs
 * `services/sitelaunchPaidOrderNotify.ts`). Testing the camelCase name with its
 * word boundaries restored as underscores makes the net spelling-agnostic,
 * which is what the scrub itself now is.
 */
function looksLikePii(name: string): boolean {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return PII_SHAPED_KEY.test(name) || PII_SHAPED_KEY.test(snake);
}

const redactedKeys = new Set(PII_METADATA_KEYS.map(foldKey));
const notPiiKeys = new Set(Object.keys(NOT_METADATA_PII).map(foldKey));
const WRITER_CALL = new RegExp(`\\b(${Object.keys(AUDIT_WRITERS).join("|")})\\s*\\(`, "g");
const OBJECT_KEY = /(^|[\s{,])([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
/** A key whose VALUE is a Twilio SID — the pointer that must survive the scrub. */
const SID_KEY = /(^|_)(sid|twilio_sid|call_sid|message_sid|recording_sid)$/i;

let blobKeysScanned = 0;
for (const file of sourceFiles("server")) {
  const src = readFileSync(file, "utf8");
  let call: RegExpExecArray | null;
  WRITER_CALL.lastIndex = 0;
  while ((call = WRITER_CALL.exec(src))) {
    const table = AUDIT_WRITERS[call[1]];
    const arg = src.slice(call.index, balancedEnd(src, call.index + call[0].length - 1, "(", ")"));

    // Only the blob-valued properties. A `summary:` or `action:` sitting beside
    // `metadata:` is a typed column and is dispositioned by the plan's
    // `textColumns`, not by the key scrub.
    for (const prop of ["metadata", "before", "after"]) {
      // `\b` so `after:` does not also match `sent_after:`. Only an inline
      // object literal is readable; `metadata: buildMeta(x)` is opaque to a
      // source scan and is reported by the caller-side rule below instead.
      const propAt = new RegExp(`(^|[\\s{,(])${prop}\\s*:\\s*\\{`).exec(arg);
      if (!propAt) continue;
      const brace = propAt.index + propAt[0].length - 1;
      const blob = arg.slice(brace, balancedEnd(arg, brace, "{", "}"));

      const entry = redactionFor(table);
      let key: RegExpExecArray | null;
      OBJECT_KEY.lastIndex = 0;
      while ((key = OBJECT_KEY.exec(blob))) {
        const name = key[2];
        blobKeysScanned++;
        const line = src.slice(0, call.index).split("\n").length;

        if (SID_KEY.test(name)) {
          // A SID in a blob is often the ONLY pointer at data still held by
          // Twilio (nothing writes an sms_messages row for an admin-sent SMS).
          // The blob must therefore be mined before it is scrubbed.
          if (!entry) {
            fail(
              "METADATA PII COVERAGE",
              `${file}:${line} writes a Twilio SID into ${table}.${prop}, but ${table} has no ` +
                `METADATA_REDACTIONS entry — nothing erases the resource it points at.`,
            );
          } else if (!entry.twilioColumns.includes(prop)) {
            fail(
              "METADATA PII COVERAGE",
              `${file}:${line} writes a Twilio SID (\`${name}\`) into ${table}.${prop}, which is ` +
                `not in that entry's twilioColumns. The SID is often the only pointer at a ` +
                `message or recording still held by Twilio; without it the artefact is ` +
                `unreachable forever. Add "${prop}" to twilioColumns in ` +
                `shared/accountDeletion/plan.ts.`,
            );
          }
          continue;
        }

        if (!looksLikePii(name)) continue;
        if (redactedKeys.has(foldKey(name))) continue;
        if (NOT_METADATA_PII[name] || NOT_METADATA_PII[`${file}:${name}`]) continue;
        if (notPiiKeys.has(foldKey(name))) continue;

        if (!entry) {
          fail(
            "METADATA PII COVERAGE",
            `${file}:${line} writes \`${name}\` into ${table}.${prop}, but ${table} has no ` +
              `METADATA_REDACTIONS entry at all — the blob survives the account deletion intact.`,
          );
          continue;
        }
        if (!entry.jsonColumns.includes(prop)) {
          fail(
            "METADATA PII COVERAGE",
            `${file}:${line} writes \`${name}\` into ${table}.${prop}, which nothing scrubs. ` +
              `Add "${prop}" to that entry's jsonColumns in shared/accountDeletion/plan.ts.`,
          );
          continue;
        }
        fail(
          "METADATA PII COVERAGE",
          `${file}:${line} writes \`${name}\` into ${table}.${prop} — a key name that looks ` +
            `like personal data and that nothing removes when the account is deleted. Add it ` +
            `to PII_METADATA_KEYS in shared/accountDeletion/plan.ts so the scrub replaces it, ` +
            `or to NOT_METADATA_PII in this file with a written reason. Message bodies and ` +
            `phone numbers sat in audit_log for exactly this long because a jsonb column has ` +
            `no schema for a guard to read.`,
        );
      }
    }
  }
}

// An entry in PII_METADATA_KEYS that the net would never catch is dead weight —
// it protects nothing and reads as though it does.
for (const key of PII_METADATA_KEYS) {
  if (!looksLikePii(key)) {
    fail(
      "METADATA PII COVERAGE",
      `PII_METADATA_KEYS lists "${key}", which PII_SHAPED_KEY would never flag. Either widen ` +
        `the pattern so a new caller writing that key is caught, or drop the entry.`,
    );
  }
}

/* ── Report ─────────────────────────────────────────────────────────────── */
const covered = planned.size;
const exempt = Object.keys(NOT_CUSTOMER_DATA).length;
const objectSources = tablesWithObjects().reduce((n, p) => n + (p.objects?.length ?? 0), 0);
const twilioSources = tablesWithObjects().reduce(
  (n, p) => n + (p.objects?.filter((s) => s.store === "twilio").length ?? 0),
  0,
);

if (failures.length === 0) {
  console.log(
    `check:account-deletion — OK (${meta.size} tables scanned; ${covered} classified ` +
      `[${deleted.size} delete, ${keptTables().length} keep, ` +
      `${ACCOUNT_DELETION_PLAN.filter((p) => p.action === "anonymize").length} anonymize]; ` +
      `${exempt} exempt; delete order FK-safe; ${objectSources} pointer ` +
      `column(s) across ${tablesWithObjects().length} table(s) purged on deletion, ` +
      `of which ${twilioSources} address Twilio; ` +
      `${Object.keys(NO_TWILIO_ARTEFACTS).length} Twilio-shaped column(s) exempted with a reason; ` +
      `${METADATA_REDACTIONS.length} table(s) retained-and-scrubbed across ` +
      `${PII_METADATA_KEYS.length} PII key names, ${blobKeysScanned} blob key(s) scanned at ` +
      `audit call sites; ${RETENTION_SWEEPS.length} table(s) bounded by a retention sweep)`,
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
