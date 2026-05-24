/**
 * Trial expiry warning email — sent N days before a client's trial ends.
 *
 * Uses the transactional shell for branded consistency. This is
 * marketing-adjacent, so we check `isEmailUnsubscribed()` before sending.
 *
 * Triggered from the trial lifecycle worker (trialLifecycleWorker.ts)
 * for CRM clients with trial-period services, NOT for QuoteQuick
 * calculator trials (those use the existing trial email sequence in
 * that worker).
 *
 * Safe-fail: never throws — catches errors and logs.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { respectPreferences } from "./notificationPreferences";
import { createLogger } from "./logger";

const log = createLogger("trial-expiry-email");

export interface TrialExpiryData {
  businessName: string;
  daysRemaining: number;
  upgradeUrl: string;
}

function buildHtml(recipientEmail: string, data: TrialExpiryData): string {
  const dayText = data.daysRemaining === 1 ? "1 day" : `${data.daysRemaining} days`;

  return buildTransactionalEmail({
    recipientEmail,
    marketing: true,
    subjectForTitle: `Your trial ends in ${dayText}`,
    eyebrow: "Trial ending soon",
    headline: `Your trial ends in ${dayText}`,
    intro: `Hi ${data.businessName}, your free trial period is almost over. Subscribe now to keep your services running without interruption.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
        What you'll lose
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${lossRow("Active service delivery and automation")}
        ${lossRow("Portal access to reports and dashboards")}
        ${lossRow("Ongoing monitoring and optimization")}
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
        Your data and configuration are <strong style="color:#CDD1D6;">kept for 90 days</strong>. Reactivating later picks up exactly where you left off.
      </p>`,
    cta: { label: "Subscribe Now", url: data.upgradeUrl, style: "block" },
    ctaFinePrint: "No contracts. Cancel anytime.",
    pasteLinkFallback: { url: data.upgradeUrl },
    supportNote: `Not ready yet? Reply to this email and let us know — we're happy to help you decide.`,
  });
}

function lossRow(text: string): string {
  return `<tr>
    <td style="padding:5px 10px 5px 0;vertical-align:top;width:18px;">
      <span style="color:#FF6B6B;font-size:13px;font-weight:700;">&#10005;</span>
    </td>
    <td style="padding:5px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

/**
 * Send a trial expiry warning email.
 * Checks unsubscribe status before sending (marketing-adjacent).
 * Returns true if sent, false otherwise.
 * Never throws.
 */
export async function sendTrialExpiryEmail(
  recipientEmail: string,
  data: TrialExpiryData,
  clientId?: number,
): Promise<boolean> {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      log.warn("SMTP not configured — skipping trial expiry email");
      return false;
    }

    if (!recipientEmail) {
      log.warn("No recipient email — skipping trial expiry email");
      return false;
    }

    // Trial expiry is billing-adjacent — gate against billing preference.
    if (clientId != null && !(await respectPreferences(clientId, "email", "billing"))) {
      log.info(`Skipped trial expiry email — client #${clientId} disabled billing email`);
      return false;
    }

    // Marketing-adjacent: respect unsubscribe preferences
    const unsubscribed = await isEmailUnsubscribed(recipientEmail);
    if (unsubscribed) {
      log.info(`Recipient ${recipientEmail} is unsubscribed — skipping trial expiry email`);
      return false;
    }

    const dayText = data.daysRemaining === 1 ? "1 day" : `${data.daysRemaining} days`;

    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipientEmail,
      replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
      subject: `Your trial ends in ${dayText} — ${data.businessName}`,
      html: buildHtml(recipientEmail, data),
      text: buildPlainText({
        headline: `Your trial ends in ${dayText}`,
        intro: `Hi ${data.businessName}, your free trial period is almost over. Subscribe now to keep your services running without interruption.`,
        bodyText: "What you'll lose:\n  - Active service delivery and automation\n  - Portal access to reports and dashboards\n  - Ongoing monitoring and optimization\n\nYour data and configuration are kept for 90 days. Reactivating later picks up exactly where you left off.",
        ctaLabel: "Subscribe Now",
        ctaUrl: data.upgradeUrl,
        supportNote: "Not ready yet? Reply to this email and let us know — we're happy to help you decide.",
      }),
    });

    log.info(`Sent to ${recipientEmail} for ${data.businessName} (${dayText} remaining)`);
    return true;
  } catch (err: any) {
    log.error(`Send failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
