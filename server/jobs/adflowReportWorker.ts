/**
 * AdFlow Monthly Report Worker
 *
 * Dispatches monthly performance reports to AdFlow clients whose admin
 * has already entered the previous-month metrics via the admin CRM
 * form (POST /api/admin/crm/client-services/:id/adflow-metrics).
 *
 * Wrapped by `runJob()` in the scheduler — that wrapper provides
 * the retry-with-backoff (3 attempts) and the job-log database row.
 *
 * Strict-gate model (different from RankFlow / SocialSync / MapGuard):
 *   - AdFlow metrics are admin-entered, not auto-collected.
 *   - To prevent zero-data or stale emails, this worker only sends when
 *     metadata.latest_report.period_start falls within the previous
 *     calendar month. See sendAllAdflowReports() for the full gate.
 *   - Clients with missing OR stale metrics are bucketed under
 *     skipped_missing_current_report so ops can see who still needs
 *     metrics entered for the month.
 *
 * Per-client safety:
 *   - SQL filter restricts to active enabled adflow* services with a
 *     non-empty contact_email
 *   - compileAndSendAdFlowReport() is idempotent per period via
 *     client_service.metadata.last_report_period
 *   - Unsubscribed recipients are skipped via isEmailUnsubscribed()
 *
 * Existing admin-trigger path (compileAndSendAdFlowReport called when an
 * admin marks a "Monthly performance report" task as delivered) remains
 * unchanged. This worker is a parallel sweep, not a replacement.
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit:
 *   { sent, skipped, errors, skipped_missing_current_report,
 *     skipped_already_sent, skipped_unsubscribed, skipped_other }
 */

import { sendAllAdflowReports } from "../services/adflowReports";

export async function processAdflowReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
  skipped_missing_current_report: number;
  skipped_already_sent: number;
  skipped_unsubscribed: number;
  skipped_other: number;
}> {
  console.log("[adflow-report] Starting monthly report batch (strict-gated)...");

  const result = await sendAllAdflowReports();

  console.log(
    `[adflow-report] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
    skipped_missing_current_report: result.skipped_missing_current_report,
    skipped_already_sent: result.skipped_already_sent,
    skipped_unsubscribed: result.skipped_unsubscribed,
    skipped_other: result.skipped_other,
  };
}
