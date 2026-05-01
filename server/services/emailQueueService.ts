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
