/**
 * Password-reset email — extracted from authRoutes.ts so it
 * matches the rest of our transactional templates (uses the
 * shared `buildTransactionalEmail` shell instead of inline HTML).
 *
 * Triggered from POST /api/auth/forgot-password. The route is
 * still responsible for creating the reset token, looking up the
 * user, rate-limiting by IP, and writing the password_reset_tokens
 * row — this module just renders + sends.
 *
 * Safe-fail: catches and logs SMTP errors, never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("password-reset-email");

/** Brief pause between the inline send and its single immediate retry. */
const RETRY_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PasswordResetEmailData {
  /** Recipient address (post-normalisation). */
  to: string;
  /** Fully qualified reset URL with the one-hour token in the query string. */
  resetUrl: string;
  /** Optional display name to personalise the greeting. */
  recipientName?: string | null;
}

export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — password reset email NOT sent", { to: data.to });
    return false;
  }

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : "Hi there,";

  const html = buildTransactionalEmail({
    subjectForTitle: "Reset your password",
    recipientEmail: data.to,
    headline: "Reset your password",
    intro: `${greeting} use the button below to set a new password. The link works for one hour, then expires.`,
    cta: {
      label: "Set a new password",
      url: data.resetUrl,
      style: "block",
    },
    pasteLinkFallback: {
      label: "Trouble with the button? Paste this link into your browser",
      url: data.resetUrl,
    },
    supportNote:
      "Didn't request this? You can safely ignore this email — your password stays the same. Reach us at <a href=\"mailto:support@wefixtrades.com\" style=\"color:inherit;text-decoration:underline;\">support@wefixtrades.com</a> if anything looks off.",
  });

  const text = buildPlainText({
    headline: "Reset your password",
    intro: "Use the link below to set a new password. The link works for one hour.",
    ctaLabel: "Set a new password",
    ctaUrl: data.resetUrl,
    supportNote: "Didn't request this? Safely ignore this email.",
  });

  const subject = "Reset your WeFixTrades password";
  const mail = {
    from: `WeFixTrades <${getFromAddress()}>`,
    to: data.to,
    subject,
    html,
    text,
  };

  /* Password-reset links are interactive — the user is waiting on the page —
   * so the minute-cadence email queue would feel laggy as the primary path.
   * Instead: send inline, retry once after a brief pause on a transient SMTP
   * blip, and only if BOTH inline attempts fail, enqueue() as a durable
   * backstop so the queue worker's 3-attempt retry + final-failure alert still
   * cover it. category=password_reset is transactional → bypasses the
   * drain-time preference gate (notificationPreferences.TRANSACTIONAL_BYPASS). */
  try {
    await transporter.sendMail(mail);
    return true;
  } catch (firstErr) {
    log.warn("password-reset email send failed — retrying once", { to: data.to, error: String(firstErr) });
    await sleep(RETRY_DELAY_MS);
    try {
      await transporter.sendMail(mail);
      return true;
    } catch (secondErr) {
      // Both inline attempts failed — enqueue as a durable backstop so the
      // queue worker retries + alerts on final failure (instead of silently
      // losing the reset link).
      log.error("password-reset email failed twice inline — enqueuing as backstop", {
        to: data.to,
        error: String(secondErr),
      });
      try {
        await queueEmail(data.to, subject, html, text, { category: "password_reset", source: "password_reset_backstop" });
        return true;
      } catch (queueErr) {
        log.error("password-reset email backstop enqueue ALSO failed — link lost", {
          to: data.to,
          error: String(queueErr),
        });
        return false;
      }
    }
  }
}
