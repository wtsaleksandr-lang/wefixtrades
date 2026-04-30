/**
 * Email Send Queue Worker
 *
 * Drains rows in `email_send_queue` whose status is 'retrying' and
 * whose `next_attempt_at` has elapsed. Retries via the raw SMTP
 * transporter (NOT the wrapped one — we'd loop on tracking + dedupe
 * if we used the wrapped path). Tracking + dedupe metadata is
 * already baked into the row's `payload`.
 *
 * Wrapped by `runJob()` in the scheduler — that wrapper provides the
 * job_logs row and retry-with-backoff for the WORKER itself (separate
 * from the email retry semantics).
 *
 * Per-row outcomes:
 *   success → markSent (status='sent')
 *   failure with attempts < MAX → markRetrying (incrementing attempts,
 *                                               setting next_attempt_at)
 *   failure with attempts >= MAX → markRetrying flips to 'dead_letter'
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit:
 *   { processed, sent, retrying, dead_letter, failed_other }
 */

import nodemailer from "nodemailer";
import { listDueRetries, markRetrying, markSent } from "../lib/emailSendQueue";

interface DrainResult {
  processed: number;
  sent: number;
  retrying: number;
  dead_letter: number;
  failed_other: number;
}

let rawCached: nodemailer.Transporter | null = null;

/** Build an UN-WRAPPED transporter for retry sends. Bypasses the queue
 *  wrapper to avoid reentrancy. */
function getRawTransporter(): nodemailer.Transporter | null {
  if (rawCached) return rawCached;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  rawCached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return rawCached;
}

export async function processEmailSendQueue(): Promise<DrainResult> {
  const result: DrainResult = {
    processed: 0,
    sent: 0,
    retrying: 0,
    dead_letter: 0,
    failed_other: 0,
  };

  const due = await listDueRetries();
  if (due.length === 0) return result;

  const transporter = getRawTransporter();
  if (!transporter) {
    console.warn("[email-send-queue-worker] SMTP not configured — leaving rows in retrying state");
    return result;
  }

  console.log(`[email-send-queue-worker] Draining ${due.length} due row(s)...`);

  for (const row of due) {
    result.processed++;
    const payload = (row.payload as any) || {};
    if (!payload.to) {
      console.warn(`[email-send-queue-worker] row #${row.id} has no 'to' in payload — marking retrying with error`);
      await markRetrying(row.id, "missing 'to' in payload").catch(() => {});
      result.failed_other++;
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: payload.from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: payload.headers,
      });
      await markSent(row.id, (info as any)?.messageId ?? null);
      result.sent++;
      console.log(`[email-send-queue-worker] retry sent · row #${row.id} · email_id=${row.email_id}`);
    } catch (err: any) {
      // markRetrying flips to 'dead_letter' once attempts hit MAX, so we
      // detect dead-letter status by re-reading. Simpler: count by attempts.
      const attemptsAfter = row.attempts + 1;
      await markRetrying(row.id, err?.message || String(err));
      // attemptsAfter >= MAX_ATTEMPTS means markRetrying just flipped to dead_letter
      // (MAX_ATTEMPTS is 4; row.attempts was 1..3 before this retry)
      if (attemptsAfter >= 4) {
        result.dead_letter++;
        console.error(`[email-send-queue-worker] DEAD LETTER · row #${row.id} · email_id=${row.email_id} · ${err.message}`);
      } else {
        result.retrying++;
        console.warn(`[email-send-queue-worker] retry failed (attempt ${attemptsAfter}) · row #${row.id} · ${err.message}`);
      }
    }
  }

  console.log(
    `[email-send-queue-worker] Complete: ${result.sent} sent, ${result.retrying} re-queued, ${result.dead_letter} dead-letter, ${result.failed_other} other (${result.processed} total)`,
  );
  return result;
}
