/**
 * RankFlow Monthly Report Worker
 *
 * Dispatches monthly performance reports to every active paying RankFlow
 * client. Wrapped by `runJob()` in the scheduler — that wrapper provides
 * the retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Per-client safety:
 *   - `sendAllRankflowReports()` SQL-filters to active enabled rankflow*
 *     services where the client has a non-empty `contact_email`
 *   - Each individual `sendRankflowReport()` is idempotent per period via
 *     `client_service.metadata.last_rankflow_report_period`, so re-runs
 *     within the same month are safe and skip already-sent clients
 *   - Unsubscribed recipients are skipped via isEmailUnsubscribed() check
 *     inside sendRankflowReport()
 *
 * Returns aggregate counts that flow into the job_logs metadata column,
 * giving each scheduled run a queryable audit record:
 *   { sent, skipped, errors }
 */

import { sendAllRankflowReports } from "../services/rankflowReports";

export async function processRankflowReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  console.log("[rankflow-report] Starting monthly report batch...");

  const result = await sendAllRankflowReports();

  console.log(
    `[rankflow-report] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
  };
}
