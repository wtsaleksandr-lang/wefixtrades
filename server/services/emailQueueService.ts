/**
 * Email Queue Service
 *
 * Provides queueEmail() for enqueueing emails and processEmailQueue()
 * for the background worker that drains the queue.
 */

import { storage } from "../storage";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";
import { fireAlert } from "./alertService";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";

const log = createLogger("EmailQueue");

/**
 * Enqueue an email for later delivery by the email queue worker.
 */
export async function queueEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await storage.enqueueEmail({
    to_email: to,
    subject,
    html,
    text_body: text ?? null,
    metadata: metadata ?? null,
  });
  log.debug(`Enqueued email to=${to} subject="${subject}"`);
}

/**
 * Process the email queue -- called by the scheduler every minute.
 * Picks up to 10 pending emails, sends them, and updates status.
 *
 * W-AX-2: re-checks isEmailUnsubscribed() at drain time to close the
 * enqueue→drain race window. If the recipient unsubscribed after
 * enqueue, the row is marked status='skipped_unsubscribed' (terminal,
 * not retried, not bounced).
 *
 * TODO: test — add a unit/integration test exercising the
 * unsubscribe-between-enqueue-and-drain scenario once a server-side
 * test framework is wired up (currently only Playwright e2e exists).
 */
export async function processEmailQueue(): Promise<{ sent: number; failed: number }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.debug("SMTP not configured -- email queue idle");
    return { sent: 0, failed: 0 };
  }

  const pending = await storage.fetchPendingEmails(10);
  if (pending.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    /* W-AX-2: re-check suppression at drain time. A recipient may have
     * unsubscribed between enqueue and now — CAN-SPAM/CASL require us
     * to honour that. Drop with audit; don't re-enqueue, don't bounce. */
    if (await isEmailUnsubscribed(item.to_email)) {
      await storage.updateEmailQueueItem(item.id, {
        status: "skipped_unsubscribed",
        attempts: (item.attempts ?? 0) + 1,
        last_error: "recipient unsubscribed at drain time",
      });
      log.info(`Email #${item.id} skipped — recipient unsubscribed: ${item.to_email}`);
      continue;
    }

    await storage.updateEmailQueueItem(item.id, { status: "sending" });

    try {
      await transporter.sendMail({
        from: `WeFixTrades <${getFromAddress()}>`,
        to: item.to_email,
        replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
        subject: item.subject,
        html: item.html,
        ...(item.text_body ? { text: item.text_body } : {}),
      });

      await storage.updateEmailQueueItem(item.id, {
        status: "sent",
        sent_at: new Date(),
        attempts: (item.attempts ?? 0) + 1,
      });
      sent++;
    } catch (err: any) {
      const attempts = (item.attempts ?? 0) + 1;
      const maxAttempts = item.max_attempts ?? 3;
      const isFinal = attempts >= maxAttempts;

      await storage.updateEmailQueueItem(item.id, {
        status: isFinal ? "failed" : "pending",
        attempts,
        last_error: err.message,
      });
      failed++;
      log.error(`Email #${item.id} send failed (attempt ${attempts}/${maxAttempts})`, { error: err.message });

      if (isFinal) {
        fireAlert({
          severity: "warning",
          category: "email_failed",
          title: `Email delivery failed after ${maxAttempts} attempts`,
          details: `To: ${item.to_email}\nSubject: ${item.subject}\nError: ${err.message}`,
          metadata: { email_queue_id: item.id, to_email: item.to_email },
        }).catch(() => {});
      }
    }
  }

  if (sent > 0 || failed > 0) {
    log.info(`Email queue: ${sent} sent, ${failed} failed (${pending.length} processed)`);
  }

  return { sent, failed };
}
