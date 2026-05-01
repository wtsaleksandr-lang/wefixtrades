/**
 * MapGuard Monthly Report Worker
 *
 * Dispatches monthly performance reports to every active paying MapGuard
 * client. Wrapped by `runJob()` in the scheduler — that wrapper provides
 * the retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Per-client safety:
 *   - `sendAllMonthlyReports()` SQL-filters to active enabled mapguard*
 *     services where the client has status 'active' and a non-empty
 *     `contact_email`
 *   - Each individual `sendMonthlyReportEmail()` is idempotent per period
 *     via `client_service.metadata.last_mapguard_report_period`, so re-runs
 *     within the same month are safe and skip already-sent clients
 *   - Unsubscribed recipients are skipped via isEmailUnsubscribed() check
 *     inside sendMonthlyReportEmail()
 *   - Services with `metadata.report_enabled === false` are skipped
 *
 * Returns aggregate counts that flow into the job_logs metadata column,
 * giving each scheduled run a queryable audit record:
 *   { sent, skipped, errors }
 */

import { sendAllMonthlyReports } from "../services/mapguardReports";
import { createLogger } from "../lib/logger";

const log = createLogger("MapGuardReportWorker");

export async function processMapguardReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  log.info("Starting monthly report batch...");

  const result = await sendAllMonthlyReports();

  log.info("Monthly report batch complete", {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
  };
}
