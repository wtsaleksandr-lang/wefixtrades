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
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  deletionOrder,
  keptTables,
  planFor,
  tablesWithObjects,
  type ObjectStore,
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

/** The pointers one declared source yields from one row. */
function readSource(
  source: NonNullable<TablePlan["objects"]>[number],
  row: Record<string, unknown>,
): string[] {
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

    const columns = [...new Set(entry.objects!.map((s) => s.column))];
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
}> {
  const rows = await db.execute(sql`SELECT id FROM clients WHERE user_id = ${userId}`);
  return {
    client_ids: (rows.rows as { id: number }[]).map((r) => r.id),
    retained: retentionDisclosure(),
  };
}

/** The kept-data disclosure, deduplicated by reason for display. */
export function retentionDisclosure(): { table: string; reason: string }[] {
  return keptTables().map((p) => ({ table: p.table, reason: p.reason ?? "" }));
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
