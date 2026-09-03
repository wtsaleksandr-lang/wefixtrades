/**
 * Data retention worker — deletes aged-out rows from high-volume
 * logging tables to keep the database lean.
 *
 * Schedule: weekly (registered in scheduler.ts).
 *
 * Two kinds of policy live here:
 *
 *   1. HOUSEKEEPING — `integration_error_logs` (30 days),
 *      `processed_stripe_events` (90 days). Volume control, no personal data.
 *
 *   2. THE PERSONAL DATA NO DELETION CAN REACH — driven by `RETENTION_SWEEPS`
 *      in `shared/accountDeletion/plan.ts`, which is where each policy's
 *      justification is written down and reviewed beside the deletion plan
 *      itself.
 *
 * The second kind is the point. `shared/accountDeletion/plan.ts` can only act
 * on rows that name an account, and some personal data genuinely names none: a
 * member of the public who reviewed WeFixTrades' own Google listing, somebody
 * who texted HELP to the shared brand line, the IP address behind a burst of
 * bot submissions. Inventing an owner for those would be false and deleting
 * them on an unrelated customer's request would destroy a third party's data —
 * but keeping them FOREVER, which is what happened until now, is its own
 * defect. A clock is the honest answer, and this is where it runs.
 *
 * `sms_messages` used to carry a comment in the deletion plan saying its
 * unattributable rows were "governed by the retention sweep". They were not:
 * this worker covered exactly the two housekeeping tables above. That is the
 * gap `RETENTION_SWEEPS` closes, and the reason the policies are declared in
 * the plan rather than inlined here — a justification written next to the
 * mechanism that does not implement it is worse than no justification.
 *
 * SAFETY — the property that matters most: a sweep must never age out a row the
 * deletion path could have reached, because that would erase a customer's data
 * on a timer instead of on their request, and quietly. Every entry that shares
 * a table with attributable rows declares `unattributedWhen`, and this worker
 * requires EVERY probe on it to be NULL before the row is in scope. An entry
 * with no probes is asserted below to be a table no plan entry and no redaction
 * entry claims at all.
 */
import { db } from "../db";
import { integrationErrorLogs, processedStripeEvents } from "@shared/schema";
import { lt, sql, type SQL } from "drizzle-orm";
import {
  RETENTION_SWEEPS,
  planFor,
  redactionFor,
  type RetentionSweep,
} from "@shared/accountDeletion/plan";
import { createLogger } from "../lib/logger";

const log = createLogger("RetentionWorker");

/**
 * The WHERE clause for one declared sweep: old enough, AND naming nobody.
 *
 * Exported so the regression test can assert on the generated SQL without a
 * database — the same idiom `previewStatements` uses for the deletion plan, and
 * for the same reason: the dangerous failure here is a predicate that matches
 * more rows than it should, which is visible in the text and the bound values
 * long before it is visible in production.
 */
export function sweepPredicate(entry: RetentionSweep, now: Date): SQL {
  const cutoff = new Date(now.getTime() - entry.days * 24 * 60 * 60 * 1000);
  const parts: SQL[] = [sql`${sql.identifier(entry.ageColumn)} < ${cutoff.toISOString()}`];

  for (const probe of entry.unattributedWhen ?? []) {
    parts.push(
      "path" in probe
        ? /* `#>>` yields text and reads NULL both when the key is absent and
           * when its value is JSON null — which are the same thing here: the
           * blob names no owner by that route. */
          sql`${sql.identifier(probe.column)} #>> ${sql`${sql.raw(
            `ARRAY[${probe.path.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ")}]`,
          )}`} IS NULL`
        : sql`${sql.identifier(probe.column)} IS NULL`,
    );
  }

  // AND, never OR: a row is swept only when it names nobody by EVERY declared
  // route. One non-null owner column is enough to make it the deletion path's
  // to handle, not this worker's.
  return sql.join(parts, sql` AND `);
}

export interface RetentionResult {
  integration_error_logs_deleted: number;
  processed_stripe_events_deleted: number;
  /** Table → rows swept. Only tables that actually had aged rows appear. */
  swept: Record<string, number>;
}

export async function processRetention(now: Date = new Date()): Promise<RetentionResult> {
  // integration_error_logs: 30-day retention
  const errorCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const errorResult = await db
    .delete(integrationErrorLogs)
    .where(lt(integrationErrorLogs.created_at, errorCutoff));
  const errorDeleted = (errorResult as any)?.rowCount ?? 0;
  if (errorDeleted > 0) {
    log.info("Purged integration_error_logs", { deleted: errorDeleted, olderThan: errorCutoff.toISOString() });
  }

  // processed_stripe_events: 90-day retention
  const stripeCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const stripeResult = await db
    .delete(processedStripeEvents)
    .where(lt(processedStripeEvents.processed_at, stripeCutoff));
  const stripeDeleted = (stripeResult as any)?.rowCount ?? 0;
  if (stripeDeleted > 0) {
    log.info("Purged processed_stripe_events", { deleted: stripeDeleted, olderThan: stripeCutoff.toISOString() });
  }

  /* Declared personal-data sweeps. Sequential and independent: one table's
   * failure must not stop the rest, but it must be LOUD — a sweep that silently
   * stops running turns back into unbounded retention, which is the condition
   * this whole section exists to end. */
  const swept: Record<string, number> = {};
  for (const entry of RETENTION_SWEEPS) {
    try {
      const result = await db.execute(
        sql`DELETE FROM ${sql.identifier(entry.table)} WHERE ${sweepPredicate(entry, now)}`,
      );
      const n = result.rowCount ?? 0;
      if (n > 0) {
        swept[entry.table] = n;
        log.info("Swept unattributed personal data", {
          table: entry.table,
          deleted: n,
          retentionDays: entry.days,
        });
      }
    } catch (err) {
      log.error("Retention sweep FAILED — personal data is still unbounded in this table", {
        table: entry.table,
        retentionDays: entry.days,
        error: (err as Error).message,
      });
    }
  }

  return {
    integration_error_logs_deleted: errorDeleted,
    processed_stripe_events_deleted: stripeDeleted,
    swept,
  };
}

/**
 * Boot-time coherence check between the two mechanisms, run by the test rather
 * than at runtime: a table whose rows an account deletion CAN reach must not be
 * swept without `unattributedWhen` narrowing it, or the sweep would age out a
 * customer's data on a timer.
 *
 * Lives here rather than in the plan because it is a statement about what this
 * worker does with the declarations, not about the declarations themselves.
 */
export function sweepsThatCouldOutrunDeletion(): string[] {
  return RETENTION_SWEEPS.filter(
    (entry) =>
      (entry.unattributedWhen ?? []).length === 0 &&
      (planFor(entry.table) !== undefined || redactionFor(entry.table) !== undefined),
  ).map((entry) => entry.table);
}
