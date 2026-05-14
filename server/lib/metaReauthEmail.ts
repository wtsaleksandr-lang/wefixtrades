/**
 * Meta (Facebook/Instagram) re-authorization reminder email.
 *
 * Sent when the connection-expiry check finds a token that is
 * expiring soon or has already expired. Uses the transactional
 * email shell so it matches the brand.
 *
 * This is a transactional/operational email (not marketing),
 * so no unsubscribe link is required.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("MetaReauthEmail");

export interface MetaReauthEmailData {
  /** Admin/ops email address to receive the alert. */
  recipientEmail: string;
  /** Client business name. */
  businessName: string;
  /** Which platform: "Facebook", "Instagram", or "Facebook/Instagram". */
  platform: string;
  /** Days until the token expires (0 = already expired). */
  daysUntilExpiry: number;
  /** ISO date string when the token expires. */
  expiresAt: string;
  /** Client ID used to build the re-auth link. */
  clientId: number;
}

/**
 * Send a re-authorization reminder email to the admin.
 *
 * Fail-safe: returns false on any error so a broken email
 * never blocks the expiry-check worker.
 */
export async function sendMetaReauthEmail(data: MetaReauthEmailData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping Meta re-auth email");
    return false;
  }

  const baseUrl =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://wefixtrades.com");

  const reauthUrl = `${baseUrl}/admin/crm/clients/${data.clientId}?tab=socialsync`;

  const expiryDate = new Date(data.expiresAt);
  const expiryStr = expiryDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const isExpired = data.daysUntilExpiry <= 0;
  const urgencyWord = isExpired ? "has expired" : `expires in ${data.daysUntilExpiry} day(s)`;
  const eyebrow = isExpired ? "Expired" : "Expiring Soon";
  const eyebrowColor = isExpired ? "#EF4444" : "#F59E0B";

  const subject = isExpired
    ? `Action required: ${data.platform} connection expired for ${data.businessName}`
    : `Reminder: ${data.platform} connection for ${data.businessName} expires in ${data.daysUntilExpiry} day(s)`;

  const headline = `${data.platform} connection ${urgencyWord}`;

  const intro = `The <strong style="color:#F0F0F0;">${data.platform}</strong> connection for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong> ${urgencyWord} (${expiryStr}). Re-authorize now to avoid any disruption to scheduled posts and publishing.`;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    marketing: false,
    subjectForTitle: subject,
    eyebrow,
    eyebrowColor,
    headline,
    intro,
    cta: {
      label: "Re-authorize Connection",
      url: reauthUrl,
    },
    ctaFinePrint: "This will open the client's SocialSync settings where you can start the OAuth flow.",
    pasteLinkFallback: { url: reauthUrl },
    supportNote: `If you have questions, reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a>.`,
  });

  const text = buildPlainText({
    headline: `${data.platform} connection ${urgencyWord}`,
    intro: `The ${data.platform} connection for ${data.businessName} ${urgencyWord} (${expiryStr}). Re-authorize now to avoid disruption.`,
    ctaLabel: "Re-authorize Connection",
    ctaUrl: reauthUrl,
    pasteLinkUrl: reauthUrl,
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: data.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html,
      text,
    });

    log.info("Meta re-auth email sent", {
      recipientEmail: data.recipientEmail,
      businessName: data.businessName,
      platform: data.platform,
      daysUntilExpiry: String(data.daysUntilExpiry),
    });
    return true;
  } catch (err: any) {
    log.error("Failed to send Meta re-auth email", {
      recipientEmail: data.recipientEmail,
      error: err.message,
    });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
