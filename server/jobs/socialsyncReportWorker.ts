/**
 * SocialSync Monthly Report Worker
 *
 * Dispatches monthly performance reports to every active paying SocialSync
 * client. Wrapped by `runJob()` in the scheduler — that wrapper provides
 * the retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Per-client safety:
 *   - `sendAllSocialsyncReports()` SQL-filters to active enabled socialsync*
 *     services where the client has a non-empty `contact_email`
 *   - Each individual `sendSocialsyncReport()` is idempotent per period via
 *     `client_service.metadata.last_socialsync_report_period`, so re-runs
 *     within the same month are safe and skip already-sent clients
 *   - Unsubscribed recipients are skipped via isEmailUnsubscribed() check
 *     inside sendSocialsyncReport()
 *
 * Returns aggregate counts that flow into the job_logs metadata column,
 * giving each scheduled run a queryable audit record:
 *   { sent, skipped, errors }
 */

import { sendAllSocialsyncReports } from "../services/socialsyncReports";

export async function processSocialsyncReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  console.log("[socialsync-report] Starting monthly report batch...");

  const result = await sendAllSocialsyncReports();

  console.log(
    `[socialsync-report] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
  };
}
