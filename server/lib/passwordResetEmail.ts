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

const log = createLogger("password-reset-email");

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

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.to,
      subject: "Reset your WeFixTrades password",
      html,
      text,
    });
    return true;
  } catch (err) {
    log.error("Failed to send password-reset email", { to: data.to, error: String(err) });
    return false;
  }
}
