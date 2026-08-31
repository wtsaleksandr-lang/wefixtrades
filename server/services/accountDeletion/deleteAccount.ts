/**
 * Account deletion — the engine behind Settings → Account → "Delete account"
 * and the promise made in the privacy policy §10.
 *
 * Everything this module does is dictated by `shared/accountDeletion/plan.ts`,
 * which classifies every account-linked table as delete / anonymize / keep.
 * `npm run check:account-deletion` proves at CI time that the plan covers the
 * whole schema and that the resulting statement order is foreign-key safe, so
 * this file stays small and generic: it turns the plan into SQL and runs it
 * inside one transaction.
 *
 * Scope safety — the property that matters most here:
 *   • The only inputs are the authenticated `users.id` and the `clients.id`
 *     values resolved from `clients.user_id = <that user>`. Nothing is taken
 *     from the request body.
 *   • Every generated statement carries a scope predicate. A table whose scope
 *     resolves to an empty id set is SKIPPED, never widened — an unscoped
 *     `DELETE FROM …` would take another tenant's data with it.
 *   • Table and column names come from the plan (a code constant) and are
 *     emitted through `sql.identifier`, so no identifier is ever interpolated
 *     from user input.
 *
 * Files, not just rows — the part that is easy to get wrong:
 *   • Rows are only half the account. Phone-bill PDFs, LOAs, call recordings,
 *     assistant uploads, lead photos and site backups live in object storage,
 *     R2 and the upload directory. `DELETE FROM …` removes the pointer, not the
 *     bytes, and none of those stores can be listed by prefix — so a pointer
 *     deleted without its file leaves a document nothing can ever find again.
 *   • Nor is "outside Postgres" the same as "outside our reach". Voicemail
 *     audio, the SMS conversation and the call records live at TWILIO, and
 *     deleting the row that names them used to be where erasure stopped. We
 *     hold the account credentials and Twilio's REST API deletes all three, so
 *     they are declared and purged by this same mechanism — see
 *     `server/lib/twilioArtefacts.ts` for how an artefact is attributed to one
 *     customer, which is the part that has to be right.
 *   • Which columns point at which store is declared in the plan
 *     (`STORED_OBJECTS`), enumerated inside the transaction, and purged after
 *     it commits.
 *   • A purge that fails is reported, never swallowed: the receipt carries
 *     `objects_failed`, the route tells the customer the erasure is
 *     incomplete, and the keys are written to `audit_log` so support can
 *     finish it by hand.
 *
 * Rows we keep are not rows we leave alone:
 *   • `audit_log` and `admin_activity_log` carried the recipient's phone
 *     number, the account holder's own email address and the FULL TEXT of the
 *     messages we sent on their behalf, inside jsonb blobs — and were in no
 *     plan at all, because neither has an owner column the coverage guard could
 *     see. Deleting them outright is not the answer: one is where a failed
 *     purge records the keys that make an orphan recoverable, and the other is
 *     the record that staff opened this account, which the account holder
 *     should not be able to erase. So the rows survive and the personal data
 *     inside them is overwritten — see `redactRetainedMetadata` below and the
 *     note above `METADATA_REDACTIONS` in the plan.
 *   • Order matters: a Twilio SID buried in one of those blobs is sometimes the
 *     only pointer at a message still held by Twilio, so the artefacts are
 *     collected before the scrub, not after.
 *
 * Irreversible. There is no undo and no grace window — see the design note at
 * the top of `shared/accountDeletion/plan.ts`.
 */
import { getTableName, is, sql, type SQL } from "drizzle-orm";
import { PgDialect, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schemaTables from "@shared/schema";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { deleteObject } from "../../lib/objectStorage";
import { deleteUploadedFile } from "../fileStorage";
import { deleteFromR2, r2KeyFromUrl } from "../../lib/r2Upload";
import { deleteTwilioArtefact, twilioArtefactKey } from "../../lib/twilioArtefacts";
import { releaseNumberArtefact } from "../twilioNumberRelease";
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  METADATA_REDACTIONS,
  PII_METADATA_KEYS,
  REDACTION_TOMBSTONE,
  deletionOrder,
  keptTables,
  planFor,
  redactedTables,
  tablesWithObjects,
  type MetadataRedaction,
  type ObjectStore,
  type RedactionMatch,
  type Scope,
  type TablePlan,
} from "@shared/accountDeletion/plan";

const log = createLogger("AccountDeletion");

/**
 * Foreign-key edges (`table` → tables it points at), read once from the live
 * Drizzle metadata. `deletionOrder` uses these to emit children before their
 * parents; `scripts/check-account-deletion-coverage.ts` asserts on exactly the
 * same graph that the resulting order can never trip a foreign key. Deriving
 * it here rather than hand-maintaining a second list is what keeps the two in
 * agreement.
 */
const FK_EDGES: Map<string, string[]> = (() => {
  const edges = new Map<string, string[]>();
  for (const value of Object.values(schemaTables)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    edges.set(
      getTableName(value as PgTable),
      cfg.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable as PgTable)),
    );
  }
  return edges;
})();

/** Anything the executor talks to: the pool or an open transaction. */
type Executor = Pick<typeof db, "execute">;

export interface DeletionReceipt {
  user_id: number;
  client_ids: number[];
  /** Table → rows removed. Only tables that actually had rows appear. */
  deleted: Record<string, number>;
  /** Anchor rows scrubbed in place. */
  anonymized: string[];
  /** Kept on a legal basis — exactly what the UI and the policy must say. */
  retained: { table: string; reason: string }[];
  /**
   * Rows KEPT but scrubbed of personal data: table → rows changed. The audit
   * trail survives; the message bodies, phone numbers, emails and names inside
   * it do not. Only tables that actually had rows appear.
   */
  metadata_redacted: Record<string, number>;
  /** The redaction disclosure — what the UI and the policy must say about it. */
  redacted: { table: string; reason: string }[];
  sessions_revoked: number;
  total_rows_deleted: number;
  /**
   * Erased from object storage / R2 / the upload directory, and from Twilio
   * (voicemail recordings, SMS history, call records).
   */
  objects_purged: number;
  /**
   * What we could NOT erase. Non-empty means the deletion is INCOMPLETE:
   * database rows are gone but some files, or some of the customer's data at
   * Twilio, remain. Callers must not report this as a finished erasure — see
   * the route in `server/routes/portal/accountDeletion.ts`.
   */
  objects_failed: StoredObject[];
  completed_at: string;
}

export class LegalHoldError extends Error {
  constructor(public readonly holds: { table: string; reason: string }[]) {
    super("Account is under a legal hold and cannot be deleted automatically.");
    this.name = "LegalHoldError";
  }
}

/* ── Scope resolution ────────────────────────────────────────────────────── */

interface ScopeContext {
  userId: number;
  clientIds: number[];
  email: string | null;
}

function idList(ids: number[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

/**
 * The WHERE clause for one plan entry, or `null` when the scope resolves to
 * nothing (no clients, no email). Returning `null` means "skip this table" —
 * it must never degrade into an unscoped delete.
 */
function predicateFor(scope: Scope, ctx: ScopeContext): SQL | null {
  switch (scope.by) {
    case "user": {
      const parts = scope.columns.map((c) => sql`${sql.identifier(c)} = ${ctx.userId}`);
      return sql.join(parts, sql` OR `);
    }
    case "client": {
      if (ctx.clientIds.length === 0) return null;
      const parts = scope.columns.map(
        (c) => sql`${sql.identifier(c)} IN (${idList(ctx.clientIds)})`,
      );
      return sql.join(parts, sql` OR `);
    }
    case "email": {
      if (!ctx.email) return null;
      const parts = scope.columns.map(
        (c) => sql`lower(${sql.identifier(c)}) = ${ctx.email!.toLowerCase()}`,
      );
      return sql.join(parts, sql` OR `);
    }
    case "parent": {
      const parent = planFor(scope.parent);
      // The coverage guard proves the parent is in the plan, so this is a
      // programming error rather than a runtime condition.
      if (!parent) throw new Error(`plan references unknown parent table ${scope.parent}`);
      const parentPredicate = predicateFor(parent.scope, ctx);
      if (!parentPredicate) return null;
      const sub = sql`SELECT ${sql.identifier(scope.parentKey)} FROM ${sql.identifier(scope.parent)} WHERE ${parentPredicate}`;
      const parts = scope.columns.map((c) => sql`${sql.identifier(c)} IN (${sub})`);
      return sql.join(parts, sql` OR `);
    }
    case "anyOf": {
      /* Branches that resolve to nothing are DROPPED, not treated as "match
       * everything" — the same rule the single-scope cases follow. If every
       * branch drops there is nothing in scope and the table is skipped, which
       * is why this returns null rather than an empty (and therefore
       * everything-matching) disjunction. */
      const parts = scope.scopes
        .map((s) => predicateFor(s, ctx))
        .filter((p): p is SQL => p !== null)
        .map((p) => sql`(${p})`);
      if (parts.length === 0) return null;
      return sql.join(parts, sql` OR `);
    }
  }
}

/* ── Anonymisation ───────────────────────────────────────────────────────── */

/**
 * The replacement value for one anonymised column.
 *
 * `"@id"` produces a synthetic, non-reversible value keyed by the row id — the
 * escape hatch for NOT NULL + UNIQUE columns (`users.email`,
 * `users.password_hash`, `affiliates.email`) where NULL is not an option.
 * `.invalid` is the RFC 2606 reserved TLD, so a scrubbed address can never
 * resolve to a real mailbox.
 */
function anonymisedValue(table: string, column: string, spec: null | string, rowId: number) {
  if (spec === null) return sql`NULL`;
  if (spec !== "@id") {
    if (spec === "true" || spec === "false") return sql.raw(spec);
    if (/^-?\d+(\.\d+)?$/.test(spec)) return sql.raw(spec);
    return sql`${spec}`;
  }
  if (column === "password_hash") {
    // Deliberately not a valid "<salt>:<hash>" pair, so verifyPassword can
    // never return true for it no matter what is submitted.
    return sql`${`deleted:${rowId}:${Date.now()}`}`;
  }
  return sql`${`deleted-${table}-${rowId}@deleted.wefixtrades.invalid`}`;
}

async function anonymiseRows(
  tx: Executor,
  entry: TablePlan,
  ctx: ScopeContext,
  deletedAtColumn: string | null,
): Promise<number> {
  const fields = ANONYMISE_FIELDS[entry.table];
  if (!fields) return 0;
  const predicate = predicateFor(entry.scope, ctx);
  if (!predicate) return 0;

  // Row ids first: the synthetic values are keyed by id, so each row needs its
  // own UPDATE. These sets are tiny (one user, one or two clients).
  const idRows = await tx.execute(
    sql`SELECT id FROM ${sql.identifier(entry.table)} WHERE ${predicate}`,
  );
  const ids = (idRows.rows as { id: number }[]).map((r) => r.id);

  for (const rowId of ids) {
    const assignments = Object.entries(fields).map(
      ([column, spec]) =>
        sql`${sql.identifier(column)} = ${anonymisedValue(entry.table, column, spec, rowId)}`,
    );
    if (deletedAtColumn) assignments.push(sql`${sql.identifier(deletedAtColumn)} = now()`);
    await tx.execute(
      sql`UPDATE ${sql.identifier(entry.table)} SET ${sql.join(assignments, sql`, `)} WHERE id = ${rowId}`,
    );
  }
  return ids.length;
}

/* ── Stored objects ──────────────────────────────────────────────────────── */

/** One piece of this account's data held outside Postgres, and where it lives. */
export interface StoredObject {
  store: ObjectStore;
  /** The plan entry that pointed at it — the breadcrumb for a manual reclaim. */
  table: string;
  /**
   * Object-storage key, R2 public URL, `/uploads/…` path, or — for `twilio` —
   * the canonical `Recordings/RE…` / `Messages/SM…` / `Calls/CA…` resource key.
   */
  key: string;
}

/**
 * Does this value address `store`, and if so, under what key?
 *
 * Returns the key to hand that store's deleter, or null for "not ours".
 *
 * Several declared columns are polymorphic — `clients.logo_url` holds our
 * `/uploads/…` path or an arbitrary URL the customer pasted;
 * `content_assets.url` holds an R2 URL or a stock-photo link;
 * `voicemails.recording_url` names a recording in OUR Twilio account, and a
 * value naming a different account is a different Twilio customer's. Anything
 * that is not ours is not ours to delete, and (just as important) must never be
 * counted as a purge that failed.
 *
 * The three byte stores return the value unchanged — the stored pointer IS the
 * key. Twilio is addressed by REST resource rather than by path, so the same
 * recording can be named as a bare SID, as a URL, or as a URL with a `.mp3`
 * format suffix; `twilioArtefactKey` folds all three into one canonical
 * `Recordings/RE…`, which is what lets the caller's dedupe see them as one
 * artefact instead of three.
 */
function ownedKey(store: ObjectStore, value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  switch (store) {
    case "uploads":
      return value.startsWith("/uploads/") ? value : null;
    case "r2":
      return r2KeyFromUrl(value) !== null ? value : null;
    case "objectStorage":
      // Bucket keys are relative paths we mint ourselves (`tradeline-ports/…`).
      // A leading slash or a scheme means the value came from somewhere else.
      return !value.startsWith("/") && !value.includes("://") ? value : null;
    case "twilio":
      return twilioArtefactKey(value);
    case "twilioNumber":
      /* An IncomingPhoneNumber SID and nothing else. Kept deliberately narrow
       * and separate from `twilio` above: this is the only key shape whose
       * deleter relinquishes a phone number, and the `twilio` deleter must stay
       * structurally unable to reach one. `PN0…0` is the placeholder
       * provisionNumber() mints in TRADELINE_SETUP_TEST_MODE — a bogus SID that
       * addresses nothing, so it is not ours to release and must not be
       * reported as an outstanding one either. */
      return /^PN[0-9a-f]{32}$/i.test(value) && !/^PN0{32}$/.test(value) ? value : null;
  }
}

/** Every string anywhere inside a JSON value. */
function* walkStrings(value: unknown): Generator<string> {
  if (typeof value === "string") {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) yield* walkStrings(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) yield* walkStrings(item);
  }
}

/** Postgres may hand a jsonb column back as a string or as parsed JSON. */
function asJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Does a declaration's `when` condition hold for this row?
 *
 * Only ever narrows. A row whose guard column matches one of the `unless`
 * values yields nothing from that source — which for
 * `tradeline_phone_setups.assigned_number_sid` is what stops a customer's own
 * ported-in number being relinquished on a data-deletion request.
 *
 * Compared as trimmed strings so a `varchar` mode reads the same whether the
 * driver hands it back padded or not. NULL matches nothing in `unless` and
 * therefore collects, which is the safe direction: the failure is a number we
 * keep paying for, not a number the customer loses.
 */
function conditionHolds(
  when: NonNullable<NonNullable<TablePlan["objects"]>[number]["when"]>,
  row: Record<string, unknown>,
): boolean {
  const raw = row[when.column];
  if (raw === null || raw === undefined) return true;
  const value = String(raw).trim();
  return !when.unless.includes(value);
}

/** The pointers one declared source yields from one row. */
function readSource(
  source: NonNullable<TablePlan["objects"]>[number],
  row: Record<string, unknown>,
): string[] {
  if (source.when && !conditionHolds(source.when, row)) return [];
  const raw = row[source.column];
  const isKey = (v: string | null): v is string => v !== null;
  switch (source.read) {
    case "text": {
      const key = ownedKey(source.store, raw);
      return isKey(key) ? [key] : [];
    }
    case "jsonField": {
      const parsed = asJson(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) =>
          item && typeof item === "object"
            ? (item as Record<string, unknown>)[source.field]
            : undefined,
        )
        .map((v) => ownedKey(source.store, v))
        .filter(isKey);
    }
    case "jsonScan":
      return [...walkStrings(asJson(raw))]
        .map((v) => ownedKey(source.store, v))
        .filter(isKey);
  }
}

/**
 * The files one row points at, per that table's declaration.
 *
 * Exported because this is where the interesting decisions live — which values
 * are ours and which are pasted foreign URLs — and the regression test drives
 * it with fixture rows to prove that filtering without needing a database, a
 * bucket, or a network.
 */
export function objectKeysFromRow(
  table: string,
  row: Record<string, unknown>,
): StoredObject[] {
  const entry = planFor(table);
  if (!entry?.objects) return [];
  const out: StoredObject[] = [];
  const seen = new Set<string>();
  for (const source of entry.objects) {
    for (const key of readSource(source, row)) {
      // One object can be named twice: `port_loa_object_key` and
      // `port_signature_object_key` both hold the signature PNG's key.
      const dedupe = `${source.store} ${key}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ store: source.store, table, key });
    }
  }
  return out;
}

/**
 * Everything this account owns outside Postgres — files, and the artefacts held
 * at Twilio — read from the rows that are about to be deleted or scrubbed.
 *
 * This is also where Twilio attribution is established: a SID only ever reaches
 * the purge because it was selected by the same tenant-scoped predicate that
 * deletes the row naming it. There is no path here that asks Twilio what it
 * holds, so no artefact can be attributed to this customer by inference.
 *
 * Runs INSIDE the deletion transaction, before any statement destroys a
 * pointer: it sees the same snapshot the deletes will, and — the reason it
 * moved in here — if enumeration fails, the transaction rolls back and the
 * customer is told nothing was changed. Enumerating outside the transaction and
 * swallowing the error (as this did while it handled only WebCare backups)
 * means a deletion that reports success while the files it never managed to
 * list stay in the bucket forever. There is no list-by-prefix on any of these
 * stores, so a pointer lost with its row is a file nothing can ever find again.
 *
 * A missing table or column here is not a runtime condition to tolerate:
 * `npm run check:account-deletion` proves at CI time that every table and
 * column named by `STORED_OBJECTS` exists in the schema, so a failure means the
 * database is behind the code and the deletion genuinely must not proceed.
 */
async function collectStoredObjects(
  tx: Executor,
  ctx: ScopeContext,
): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  const seen = new Set<string>();

  for (const entry of tablesWithObjects()) {
    const predicate = predicateFor(entry.scope, ctx);
    if (!predicate) continue; // nothing in scope — never widen to every tenant

    /* The guard columns too — a `when` condition cannot be evaluated on a row
     * that was never selected, and a missing value would read as NULL, which
     * collects. Silently releasing a customer's ported number because a column
     * was left out of a SELECT is exactly the failure the condition exists to
     * prevent. */
    const columns = [
      ...new Set(
        entry.objects!.flatMap((s) => (s.when ? [s.column, s.when.column] : [s.column])),
      ),
    ];
    const selection = sql.join(
      columns.map((c) => sql.identifier(c)),
      sql`, `,
    );
    const result = await tx.execute(
      sql`SELECT ${selection} FROM ${sql.identifier(entry.table)} WHERE ${predicate}`,
    );

    for (const row of result.rows as Record<string, unknown>[]) {
      for (const object of objectKeysFromRow(entry.table, row)) {
        // Deduplicated across the whole account, not just within one row.
        const dedupe = `${object.store} ${object.key}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        out.push(object);
      }
    }
  }
  return out;
}

/** One deleter per store. Each returns true only when the data is gone. */
const STORE_DELETERS: Record<ObjectStore, (key: string) => Promise<boolean>> = {
  objectStorage: deleteObject,
  uploads: deleteUploadedFile,
  r2: deleteFromR2,
  twilio: deleteTwilioArtefact,
  twilioNumber: releaseNumberArtefact,
};

/**
 * Erase the collected data. Runs after the commit, because none of these stores
 * is transactional — least of all Twilio, where a delete is irreversible and a
 * rolled-back transaction could not put a recording back. Deleting inside the
 * transaction would destroy a customer's data even if the deletion later failed.
 * The cost of that ordering is this function's failure mode — rows already gone,
 * data still present — which is why the caller records and reports every failure
 * instead of logging it and returning success.
 *
 * Sequential on purpose. Twilio rate-limits, has no bulk delete, and every
 * artefact here needs its own outcome recorded; a parallel fan-out would trade
 * a precise failure list for speed on the one operation that must not lose
 * track of what it could not erase.
 */
async function purgeStoredObjects(
  objects: StoredObject[],
): Promise<{ purged: number; failed: StoredObject[] }> {
  let purged = 0;
  const failed: StoredObject[] = [];
  for (const object of objects) {
    let ok = false;
    try {
      ok = await STORE_DELETERS[object.store](object.key);
    } catch (err) {
      log.error("stored-object delete threw", {
        store: object.store,
        key: object.key,
        error: (err as Error).message,
      });
    }
    if (ok) purged += 1;
    else failed.push(object);
  }
  return { purged, failed };
}

/* ── Metadata redaction ──────────────────────────────────────────────────────
 *
 * `audit_log` and `admin_activity_log` are kept — one because it is where a
 * failed purge records the keys that make an orphan recoverable at all, both
 * because an audit trail the audited party can empty is not an audit trail. See
 * the long note above `METADATA_REDACTIONS` in the plan for the full argument.
 *
 * Kept is not untouched. What survives is the skeleton — who did what, to which
 * entity, when, and the opaque identifiers support needs. What goes is the
 * message bodies, the phone numbers, the email addresses, the names, and the
 * account holder's own IP.
 * ────────────────────────────────────────────────────────────────────────── */

/** The WHERE clause selecting one account's rows, or null when nothing matches. */
function redactionPredicate(entry: MetadataRedaction, ctx: ScopeContext): SQL | null {
  const parts: SQL[] = [];
  for (const match of entry.match) {
    const part = redactionMatchPredicate(match, ctx);
    if (part) parts.push(sql`(${part})`);
  }
  // No branch resolved — nothing of this account's is in this table. Returning
  // null skips it; an empty disjunction would match every row on the platform.
  return parts.length === 0 ? null : sql.join(parts, sql` OR `);
}

function redactionMatchPredicate(match: RedactionMatch, ctx: ScopeContext): SQL | null {
  switch (match.by) {
    case "user": {
      const col = sql.identifier(match.column);
      return match.as === "text"
        ? sql`${col} = ${String(ctx.userId)}`
        : sql`${col} = ${ctx.userId}`;
    }
    case "clientJson": {
      if (ctx.clientIds.length === 0) return null;
      /* `#>>` walks the whole path in one operator and yields text, so a client
       * id stored as a JSON number and one stored as a JSON string compare
       * alike. Both shapes are in the data — the callers are hand-written
       * object literals, not a schema. */
      const path = sql`${sql.raw(`ARRAY[${match.path.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ")}]`)}`;
      return sql`${sql.identifier(match.column)} #>> ${path} IN (${sql.join(
        ctx.clientIds.map((id) => sql`${String(id)}`),
        sql`, `,
      )})`;
    }
    case "entity": {
      const ids = match.ids === "user" ? [ctx.userId] : ctx.clientIds;
      if (ids.length === 0) return null;
      const idCol = sql.identifier(match.idColumn);
      const list = sql.join(
        ids.map((id) => (match.as === "text" ? sql`${String(id)}` : sql`${id}`)),
        sql`, `,
      );
      return sql`${sql.identifier(match.typeColumn)} = ${match.entityType} AND ${idCol} IN (${list})`;
    }
  }
}

const PII_KEY_SET = new Set(PII_METADATA_KEYS.map((k) => k.toLowerCase()));

/**
 * Replace every PII-named key anywhere inside a JSON value with the tombstone.
 *
 * Key NAMES, at any depth, rather than fixed paths: the same field appears at
 * different depths across callers (`metadata.body` in `adminAgentTools`,
 * `metadata.args.message` in `adminTools`), and a path list would silently stop
 * covering a caller that nested one level deeper — the failure mode being a
 * message body that quietly survives.
 *
 * A null or absent value is left alone. Writing a tombstone over a field that
 * held nothing would ADD information — it would say a phone number was recorded
 * where none was — and the point of the tombstone is to be accurate about what
 * was erased.
 */
export function redactJson(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const r = redactJson(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: changed ? out : value, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_SET.has(key.toLowerCase())) {
        if (item === null || item === undefined || item === REDACTION_TOMBSTONE) {
          out[key] = item;
        } else {
          out[key] = REDACTION_TOMBSTONE;
          changed = true;
        }
        continue;
      }
      const r = redactJson(item);
      if (r.changed) changed = true;
      out[key] = r.value;
    }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

/**
 * Scrub one table's retained rows, and hand back the Twilio artefacts found in
 * the blobs on the way through.
 *
 * ── Order matters here, and it is the whole point ──
 *
 * `audit_log.metadata.twilio_sid` is the ONLY pointer this database holds at
 * the Twilio Message behind an admin-sent SMS — `services/adminAgentTools.ts`
 * and `services/adminTools.ts` call `sendSMS` directly and write no
 * `sms_messages` row. #2068's TWILIO COVERAGE check reads column NAMES, so a
 * SID inside a jsonb blob was invisible to it. Scrubbing the blob first would
 * therefore destroy the only route to a message that still holds the
 * customer's number and the body at Twilio, and report a clean erasure — the
 * #2067 defect, rebuilt. So the SIDs are collected BEFORE the scrub and purged
 * by the same mechanism as every other artefact.
 *
 * `twilio_sid` is deliberately NOT in PII_METADATA_KEYS, so it survives the
 * scrub: once the Message is gone the SID identifies nobody, and if the purge
 * failed it is the one thing that makes a retry possible. Same trade as
 * `objects_failed`.
 *
 * Batched by primary key. A cap would be a silent partial erasure, which is the
 * defect class this whole line of work exists to remove, so there isn't one.
 */
async function redactTable(
  tx: Executor,
  entry: MetadataRedaction,
  ctx: ScopeContext,
): Promise<{ rows: number; twilio: StoredObject[] }> {
  const predicate = redactionPredicate(entry, ctx);
  if (!predicate) return { rows: 0, twilio: [] };

  const columns = [...new Set([...entry.jsonColumns, ...entry.textColumns])];
  const selection = sql.join(
    ["id", ...columns].map((c) => sql.identifier(c)),
    sql`, `,
  );

  const twilio: StoredObject[] = [];
  const seen = new Set<string>();
  let rows = 0;
  let after: string | null = null;

  for (;;) {
    const page: SQL = after === null ? sql`` : sql` AND id > ${after}::bigint`;
    const result = await tx.execute(
      sql`SELECT ${selection} FROM ${sql.identifier(entry.table)} WHERE (${predicate})${page} ORDER BY id LIMIT 500`,
    );
    const batch = result.rows as Record<string, unknown>[];
    if (batch.length === 0) break;

    for (const row of batch) {
      after = String(row.id);
      const assignments: SQL[] = [];

      for (const column of entry.jsonColumns) {
        const parsed = asJson(row[column]);
        if (parsed === null || parsed === undefined) continue;

        /* Collect first — see the ordering note above. Only declared columns
         * are scanned, so a blob nobody scrubs can never be silently mined for
         * SIDs, and the guard proves twilioColumns ⊆ jsonColumns. */
        if (entry.twilioColumns.includes(column)) {
          for (const value of walkStrings(parsed)) {
            const key = ownedKey("twilio", value);
            if (!key) continue;
            const dedupe = `twilio ${key}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            twilio.push({ store: "twilio", table: entry.table, key });
          }
        }

        const redacted = redactJson(parsed);
        if (!redacted.changed) continue;
        assignments.push(
          sql`${sql.identifier(column)} = ${JSON.stringify(redacted.value)}::jsonb`,
        );
      }

      for (const column of entry.textColumns) {
        const current = row[column];
        if (current === null || current === undefined || current === REDACTION_TOMBSTONE) continue;
        assignments.push(sql`${sql.identifier(column)} = ${REDACTION_TOMBSTONE}`);
      }

      if (assignments.length === 0) continue;
      await tx.execute(
        sql`UPDATE ${sql.identifier(entry.table)} SET ${sql.join(assignments, sql`, `)} WHERE id = ${row.id}`,
      );
      rows += 1;
    }

    if (batch.length < 500) break;
  }

  return { rows, twilio };
}

/**
 * Scrub every declared table. Runs INSIDE the deletion transaction: a throw
 * here rolls everything back, because reporting an erasure while an SMS body
 * sits in a retained audit row is the same lie as reporting one while the file
 * sits in a bucket.
 */
async function redactRetainedMetadata(
  tx: Executor,
  ctx: ScopeContext,
): Promise<{ redacted: Record<string, number>; twilio: StoredObject[] }> {
  const redacted: Record<string, number> = {};
  const twilio: StoredObject[] = [];
  for (const entry of METADATA_REDACTIONS) {
    const result = await redactTable(tx, entry, ctx);
    if (result.rows > 0) redacted[entry.table] = result.rows;
    twilio.push(...result.twilio);
  }
  return { redacted, twilio };
}

/* ── Legal holds ─────────────────────────────────────────────────────────── */

/**
 * `retention_overrides` is the repo's legal-hold registry (see
 * `sharedFilesRetentionSweepWorker`). A live hold on this account's `users` or
 * `clients` row means a human has to release it before we may erase anything —
 * so we refuse loudly rather than deleting around it.
 */
async function assertNoLegalHold(tx: Executor, ctx: ScopeContext): Promise<void> {
  const ids = [String(ctx.userId), ...ctx.clientIds.map(String)];
  const rows = await tx.execute(sql`
    SELECT file_table, file_id, reason
    FROM retention_overrides
    WHERE ((file_table = 'users' AND file_id = ${String(ctx.userId)})
        OR (file_table = 'clients' AND file_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})))
      AND (retained_until IS NULL OR retained_until > now())
  `);
  const holds = rows.rows as { file_table: string; file_id: string; reason: string }[];
  if (holds.length > 0) {
    throw new LegalHoldError(
      holds.map((h) => ({ table: h.file_table, reason: h.reason || "no reason recorded" })),
    );
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * What the account currently owns, for the confirmation screen. Read-only.
 */
export async function summariseAccount(userId: number): Promise<{
  client_ids: number[];
  retained: { table: string; reason: string }[];
  redacted: { table: string; reason: string }[];
}> {
  const rows = await db.execute(sql`SELECT id FROM clients WHERE user_id = ${userId}`);
  return {
    client_ids: (rows.rows as { id: number }[]).map((r) => r.id),
    retained: retentionDisclosure(),
    redacted: redactionDisclosure(),
  };
}

/** The kept-data disclosure, deduplicated by reason for display. */
export function retentionDisclosure(): { table: string; reason: string }[] {
  return keptTables().map((p) => ({ table: p.table, reason: p.reason ?? "" }));
}

/**
 * The rows kept but scrubbed, and why. Separate from `retentionDisclosure`
 * because it is a different promise: those rows are kept INTACT on a legal
 * basis, these are kept with the personal data taken out of them, and telling a
 * customer the second while meaning the first would be the same kind of
 * imprecision this mechanism exists to remove.
 */
export function redactionDisclosure(): { table: string; reason: string }[] {
  return redactedTables();
}

/**
 * Erase the account. Runs as ONE transaction: either every statement lands or
 * none does, so a failure can never leave a half-deleted account that still
 * logs in.
 *
 * @param userId  The AUTHENTICATED user's id. Callers must never pass an id
 *                taken from the request body.
 */
export async function deleteAccountData(userId: number): Promise<DeletionReceipt> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`deleteAccountData called with a non-id: ${String(userId)}`);
  }

  /* Files this account owns, listed inside the transaction (below) and erased
   * after it commits. Declared in `STORED_OBJECTS`, not hard-coded here, so a
   * store added to the plan tomorrow is purged by the same mechanism. */
  let storedObjects: StoredObject[] = [];

  const receipt = await db.transaction(async (tx) => {
    const t = tx as unknown as Executor;

    const userRows = await t.execute(sql`SELECT id, email FROM users WHERE id = ${userId}`);
    const user = (userRows.rows as { id: number; email: string }[])[0];
    if (!user) throw new Error(`user ${userId} not found`);

    const clientRows = await t.execute(sql`SELECT id FROM clients WHERE user_id = ${userId}`);
    const clientIds = (clientRows.rows as { id: number }[]).map((r) => r.id);

    const ctx: ScopeContext = { userId, clientIds, email: user.email ?? null };
    await assertNoLegalHold(t, ctx);

    /* 0. List the files BEFORE anything erases the rows that name them. A
     *    throw here rolls the whole thing back, which is the honest outcome:
     *    we cannot promise erasure of files we could not even enumerate. */
    storedObjects = await collectStoredObjects(t, ctx);

    /* 1. Sessions. connect-pg-simple's table has no user column — the id sits
     *    inside the `sess` JSON blob — so a foreign key could never reach it.
     *    Revoking first means that even if a later statement throws, the
     *    rollback restores a consistent account rather than a signed-in one.
     *
     *    Compared as TEXT, not `::int`. `->>` already yields text, so this is
     *    exactly as precise — and a single malformed session blob would make
     *    the cast raise and roll back the entire deletion, which is a far worse
     *    failure than skipping one stale row. */
    const sessionResult = await t.execute(sql`
      DELETE FROM session WHERE sess->'passport'->>'user' = ${String(userId)}
    `);
    const sessionsRevoked = sessionResult.rowCount ?? 0;

    /* 2. Owned rows, children before parents. The order comes from the live
     *    foreign-key graph and is asserted FK-safe by the coverage guard. */
    const deleted: Record<string, number> = {};
    let totalRows = 0;
    for (const table of deletionOrder(FK_EDGES)) {
      const entry = planFor(table);
      if (!entry || entry.action !== "delete") continue;
      const predicate = predicateFor(entry.scope, ctx);
      if (!predicate) continue; // nothing in scope — never widen to all rows
      const result = await t.execute(
        sql`DELETE FROM ${sql.identifier(table)} WHERE ${predicate}`,
      );
      const n = result.rowCount ?? 0;
      if (n > 0) {
        deleted[table] = n;
        totalRows += n;
      }
    }

    /* 3. Anchor rows: keep the (now meaningless) primary keys so retained
     *    financial records stay referentially intact, erase everything that
     *    could identify a person. */
    const anonymized: string[] = [];
    for (const entry of ACCOUNT_DELETION_PLAN) {
      if (entry.action !== "anonymize") continue;
      const tombstone = entry.table === "users" || entry.table === "clients" ? "deleted_at" : null;
      const n = await anonymiseRows(t, entry, ctx, tombstone);
      if (n > 0) anonymized.push(entry.table);
    }

    /* 3b. Rows we KEEP, scrubbed of what identifies a person.
     *
     *     After the deletes on purpose: the SIDs this returns are collected out
     *     of blobs, and the artefacts they name are appended to the same purge
     *     list as everything else, which does not run until after the commit.
     *     Before the audit row below, so the row this deletion writes about
     *     itself is not itself a candidate for scrubbing. */
    const redaction = await redactRetainedMetadata(t, ctx);
    for (const object of redaction.twilio) {
      // The blobs can name a Message a deleted `sms_messages` row named too.
      if (storedObjects.some((o) => o.store === object.store && o.key === object.key)) continue;
      storedObjects.push(object);
    }

    /* 4. Audit row. Counts only — recording what was erased must not
     *    re-introduce the personal data we just erased. */
    await t.execute(sql`
      INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, after, metadata)
      VALUES (
        ${String(userId)}, 'user', 'delete', 'account', ${String(userId)},
        ${JSON.stringify({
          tables_cleared: Object.keys(deleted).length,
          rows_deleted: totalRows,
          clients_anonymized: clientIds.length,
          sessions_revoked: sessionsRevoked,
          files_found: storedObjects.length,
          audit_rows_redacted: Object.values(redaction.redacted).reduce((a, b) => a + b, 0),
        })}::jsonb,
        ${JSON.stringify({ source: "portal_self_service_deletion" })}::jsonb
      )
    `);

    const receipt: DeletionReceipt = {
      user_id: userId,
      client_ids: clientIds,
      deleted,
      anonymized,
      retained: retentionDisclosure(),
      metadata_redacted: redaction.redacted,
      redacted: redactionDisclosure(),
      sessions_revoked: sessionsRevoked,
      total_rows_deleted: totalRows,
      // Filled in after the commit; the transaction cannot know them yet.
      objects_purged: 0,
      objects_failed: [],
      completed_at: new Date().toISOString(),
    };

    log.info("account rows deleted", {
      userId,
      clients: clientIds.length,
      tables: Object.keys(deleted).length,
      rows: totalRows,
      sessions: sessionsRevoked,
      files: storedObjects.length,
    });

    return receipt;
  });

  /* Post-commit: erase the bytes the deleted rows referenced. */
  const { purged, failed } = await purgeStoredObjects(storedObjects);
  receipt.objects_purged = purged;
  receipt.objects_failed = failed;

  if (failed.length > 0) {
    /* The rows are gone, so these keys are now the ONLY record that this data
     * exists — none of the byte stores offers list-by-prefix, and we
     * deliberately never list Twilio to re-derive ownership, so an unrecorded
     * orphan can never be found again. Persisting them is what makes the
     * failure recoverable instead of merely noisy. It matters most for the
     * Twilio entries: a `20009` means the artefact was simply not finalised
     * yet and will delete cleanly on a retry, which is only possible if the
     * SID survived.
     *
     * Coordinates only: a bucket key, an integer id, a random file name, an
     * opaque Twilio SID. Nothing here re-introduces the personal data just
     * erased, which is the rule the audit row above follows too. */
    log.error("account deletion could not erase everything it holds", {
      userId,
      failed: failed.length,
      purged,
    });
    try {
      await db.execute(sql`
        INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, after, metadata)
        VALUES (
          ${String(userId)}, 'system', 'account_deletion_orphaned_objects', 'account',
          ${String(userId)},
          ${JSON.stringify({ purged, failed_count: failed.length })}::jsonb,
          ${JSON.stringify({
            source: "portal_self_service_deletion",
            orphans: failed.map((o) => ({ store: o.store, table: o.table, key: o.key })),
          })}::jsonb
        )
      `);
    } catch (err) {
      // Last resort: the log line above is the only remaining record.
      log.error("could not record orphaned files for manual reclaim", {
        userId,
        error: (err as Error).message,
        orphans: failed.map((o) => `${o.store}:${o.key}`),
      });
    }
  } else {
    log.info("account deleted", { userId, files_purged: purged });
  }

  return receipt;
}

/**
 * The exact DELETE statements this plan would run, as SQL text. Used by the
 * regression test to prove every statement is tenant-scoped without needing a
 * live database.
 */
export function previewStatements(ctx: {
  userId: number;
  clientIds: number[];
  email: string | null;
}): { table: string; sql: string }[] {
  const out: { table: string; sql: string }[] = [];
  for (const table of deletionOrder(FK_EDGES)) {
    const entry = planFor(table);
    if (!entry || entry.action !== "delete") continue;
    const predicate = predicateFor(entry.scope, ctx);
    if (!predicate) continue;
    const query = new PgDialect().sqlToQuery(
      sql`DELETE FROM ${sql.identifier(table)} WHERE ${predicate}`,
    );
    out.push({ table, sql: query.sql });
  }
  return out;
}

/**
 * The predicate each retained-and-scrubbed table would be selected by, as SQL
 * text. The twin of `previewStatements`, and for the same reason: this
 * predicate also selects the Twilio artefacts that are about to be DELETED at
 * Twilio, so an unscoped one would erase another customer's message. The
 * regression test asserts on it without needing a database.
 */
export function previewRedactions(ctx: {
  userId: number;
  clientIds: number[];
  email: string | null;
}): { table: string; sql: string }[] {
  const out: { table: string; sql: string }[] = [];
  for (const entry of METADATA_REDACTIONS) {
    const predicate = redactionPredicate(entry, ctx);
    if (!predicate) continue;
    out.push({
      table: entry.table,
      sql: new PgDialect().sqlToQuery(
        sql`SELECT id FROM ${sql.identifier(entry.table)} WHERE ${predicate}`,
      ).sql,
    });
  }
  return out;
}
