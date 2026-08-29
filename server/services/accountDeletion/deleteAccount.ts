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
 * Irreversible. There is no undo and no grace window — see the design note at
 * the top of `shared/accountDeletion/plan.ts`.
 */
import { getTableName, is, sql, type SQL } from "drizzle-orm";
import { PgDialect, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schemaTables from "@shared/schema";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  deletionOrder,
  keptTables,
  planFor,
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

  return db.transaction(async (tx) => {
    const t = tx as unknown as Executor;

    const userRows = await t.execute(sql`SELECT id, email FROM users WHERE id = ${userId}`);
    const user = (userRows.rows as { id: number; email: string }[])[0];
    if (!user) throw new Error(`user ${userId} not found`);

    const clientRows = await t.execute(sql`SELECT id FROM clients WHERE user_id = ${userId}`);
    const clientIds = (clientRows.rows as { id: number }[]).map((r) => r.id);

    const ctx: ScopeContext = { userId, clientIds, email: user.email ?? null };
    await assertNoLegalHold(t, ctx);

    /* 1. Sessions. connect-pg-simple's table has no user column — the id sits
     *    inside the `sess` JSON blob — so a foreign key could never reach it.
     *    Revoking first means that even if a later statement throws, the
     *    rollback restores a consistent account rather than a signed-in one. */
    const sessionResult = await t.execute(sql`
      DELETE FROM session WHERE (sess->'passport'->>'user')::int = ${userId}
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
      completed_at: new Date().toISOString(),
    };

    log.info("account deleted", {
      userId,
      clients: clientIds.length,
      tables: Object.keys(deleted).length,
      rows: totalRows,
      sessions: sessionsRevoked,
    });

    return receipt;
  });
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
