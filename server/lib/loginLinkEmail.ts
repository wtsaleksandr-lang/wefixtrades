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

const log = createLogger("login-link-email");

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

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.to,
      subject: "Your WeFixTrades sign-in link",
      html,
      text,
    });
    return true;
  } catch (err) {
    log.error("Failed to send login-link email", { to: data.to, error: String(err) });
    return false;
  }
}
