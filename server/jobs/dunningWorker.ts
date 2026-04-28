/**
 * Dunning Worker
 *
 * Drains pending billing_dunning_events rows whose scheduled_for has
 * elapsed. Wrapped by `runJob()` in the scheduler — that wrapper provides
 * retry-with-backoff and a job_logs row.
 *
 * Per-row safety inside sendDunningRow():
 *   - Looks up client by id, falls back to stripe_customer_id match
 *   - Skips no-email recipients (status = 'skipped', reason = 'no_client_email')
 *   - Skips unsubscribed recipients (status = 'skipped', reason = 'recipient_unsubscribed')
 *   - 24h resend guard: skips if a row of the same kind for the same
 *     subscription/customer was sent in the past 24h (status = 'skipped',
 *     reason = 'resend_guard')
 *   - Marks 'failed' on SMTP misconfiguration or sendMail exception
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit:
 *   {
 *     processed, sent, skipped, failed,
 *     skipped_no_email, skipped_unsubscribed, skipped_resend_guard,
 *     failed_smtp_not_configured, failed_send_error,
 *     by_kind: { day_2_reminder: { sent, skipped, failed }, ... }
 *   }
 */

import { listDuePending, sendDunningRow } from "../services/dunningService";

interface DunningWorkerResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  skipped_no_email: number;
  skipped_unsubscribed: number;
  skipped_resend_guard: number;
  failed_smtp_not_configured: number;
  failed_send_error: number;
  by_kind: Record<string, { sent: number; skipped: number; failed: number }>;
}

export async function processDunningQueue(): Promise<DunningWorkerResult> {
  const due = await listDuePending();

  const result: DunningWorkerResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    skipped_no_email: 0,
    skipped_unsubscribed: 0,
    skipped_resend_guard: 0,
    failed_smtp_not_configured: 0,
    failed_send_error: 0,
    by_kind: {},
  };

  if (due.length === 0) return result;

  console.log(`[dunning-worker] Draining ${due.length} due row(s)...`);

  for (const row of due) {
    result.processed++;
    const bucket = result.by_kind[row.kind] ||= { sent: 0, skipped: 0, failed: 0 };

    const { outcome, reason } = await sendDunningRow(row);
    if (outcome === "sent") {
      result.sent++;
      bucket.sent++;
    } else if (outcome === "skipped") {
      result.skipped++;
      bucket.skipped++;
      if (reason === "no_client_email") result.skipped_no_email++;
      else if (reason === "recipient_unsubscribed") result.skipped_unsubscribed++;
      else if (reason === "resend_guard") result.skipped_resend_guard++;
    } else {
      result.failed++;
      bucket.failed++;
      if (reason === "smtp_not_configured") result.failed_smtp_not_configured++;
      else result.failed_send_error++;
    }
  }

  console.log(
    `[dunning-worker] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed (${result.processed} total)`,
  );

  return result;
}
