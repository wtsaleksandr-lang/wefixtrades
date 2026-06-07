/**
 * Magic-link sign-in email — sent when a user clicks "Email me a
 * link" on the login page. The token is a short-lived (15 min)
 * HMAC-signed payload using the same loginToken.ts machinery as
 * post-checkout auto-login, so verification logic stays in one
 * place.
 *
 * Triggered from POST /api/auth/request-link. The route handles
 * rate-limiting + user lookup; this module just renders + sends.
 *
 * Safe-fail: catches and logs SMTP errors, never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("login-link-email");

/** Brief pause between the inline send and its single immediate retry. */
const RETRY_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LoginLinkEmailData {
  /** Recipient address (post-normalisation). */
  to: string;
  /** Fully-qualified sign-in URL with the 15-minute token in the query string. */
  signInUrl: string;
  /** Optional display name to personalise the greeting. */
  recipientName?: string | null;
}

export async function sendLoginLinkEmail(data: LoginLinkEmailData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — login link NOT sent", { to: data.to });
    return false;
  }

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : "Hi there,";

  const html = buildTransactionalEmail({
    subjectForTitle: "Your sign-in link",
    recipientEmail: data.to,
    headline: "Sign in to WeFixTrades",
    intro: `${greeting} click the button below to sign in. The link works for 15 minutes, then expires.`,
    cta: {
      label: "Sign in",
      url: data.signInUrl,
      style: "block",
    },
    pasteLinkFallback: {
      label: "Trouble with the button? Paste this link into your browser",
      url: data.signInUrl,
    },
    supportNote:
      "Didn't request this? Safely ignore the email — no action is needed and your account stays secure. Reach us at <a href=\"mailto:support@wefixtrades.com\" style=\"color:inherit;text-decoration:underline;\">support@wefixtrades.com</a> if anything looks off.",
  });

  const text = buildPlainText({
    headline: "Sign in to WeFixTrades",
    intro: "Use the link below to sign in. It works for 15 minutes.",
    ctaLabel: "Sign in",
    ctaUrl: data.signInUrl,
    supportNote: "Didn't request this? Safely ignore this email.",
  });

  const subject = "Your WeFixTrades sign-in link";
  const mail = {
    from: `WeFixTrades <${getFromAddress()}>`,
    to: data.to,
    subject,
    html,
    text,
  };

  /* Login links are interactive — the user is waiting on the page — so the
   * minute-cadence email queue would feel laggy as the primary path. Instead:
   * send inline, retry once after a brief pause on a transient SMTP blip, and
   * only if BOTH inline attempts fail, enqueue() as a durable backstop so the
   * queue worker's 3-attempt retry + final-failure alert still cover it.
   * category=login_link is transactional → bypasses the drain-time
   * preference gate (notificationPreferences.TRANSACTIONAL_BYPASS). */
  try {
    await transporter.sendMail(mail);
    return true;
  } catch (firstErr) {
    log.warn("login-link email send failed — retrying once", { to: data.to, error: String(firstErr) });
    await sleep(RETRY_DELAY_MS);
    try {
      await transporter.sendMail(mail);
      return true;
    } catch (secondErr) {
      // Both inline attempts failed — enqueue as a durable backstop so the
      // queue worker retries + alerts on final failure (instead of silently
      // losing the login link). noisyCatch-equivalent: we log loudly here.
      log.error("login-link email failed twice inline — enqueuing as backstop", {
        to: data.to,
        error: String(secondErr),
      });
      try {
        await queueEmail(data.to, subject, html, text, { category: "login_link", source: "login_link_backstop" });
        return true;
      } catch (queueErr) {
        log.error("login-link email backstop enqueue ALSO failed — link lost", {
          to: data.to,
          error: String(queueErr),
        });
        return false;
      }
    }
  }
}
