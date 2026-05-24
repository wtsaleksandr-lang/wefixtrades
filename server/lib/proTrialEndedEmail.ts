/**
 * Pro-features trial-ended email.
 *
 * Sent when a self-serve client's 14-day Pro trial expires and
 * trialProExpiryWorker flips trial_pro_features_enabled back to false.
 * Distinct from sendTrialExpiryEmail (which is N-days-before-end warning
 * for per-service trials). This one fires AFTER expiry.
 *
 * Marketing-adjacent — respects unsubscribe.
 * Never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { respectPreferences } from "./notificationPreferences";
import { createLogger } from "./logger";

const log = createLogger("pro-trial-ended-email");

export interface ProTrialEndedData {
  businessName: string;
  upgradeUrl: string;
}

function buildHtml(recipientEmail: string, data: ProTrialEndedData): string {
  return buildTransactionalEmail({
    recipientEmail,
    marketing: true,
    subjectForTitle: `Your 14-day Pro trial just ended`,
    eyebrow: "Trial complete",
    headline: `Thanks for trying Pro features.`,
    intro: `Hi ${data.businessName}, your 14-day Pro trial just ended. Your account stays on Starter — all your data and settings remain intact. Upgrade any time to re-enable Pro features.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">What changes</p>
      <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 12px;">
        Pro-only features (advanced AI training, custom-domain email, in-chat Stripe payments, social-DM channels, priority support) are now paused. Your account otherwise continues normally on the Starter plan.
      </p>
      <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 12px;">
        Want to keep what you tried? Upgrade in seconds — same dashboard, same number, same setup.
      </p>
    `,
    cta: { label: "Upgrade to Pro", url: data.upgradeUrl },
  });
}

export async function sendProTrialEndedEmail(
  recipientEmail: string,
  data: ProTrialEndedData,
  clientId?: number,
): Promise<boolean> {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      log.warn("SMTP not configured — skipping pro trial ended email");
      return false;
    }
    if (!recipientEmail) {
      log.warn("No recipient email — skipping pro trial ended email");
      return false;
    }
    if (clientId != null && !(await respectPreferences(clientId, "email", "billing"))) {
      log.info(`Skipped pro trial ended email — client #${clientId} disabled billing email`);
      return false;
    }
    const unsubscribed = await isEmailUnsubscribed(recipientEmail);
    if (unsubscribed) {
      log.info(`Recipient ${recipientEmail} is unsubscribed — skipping`);
      return false;
    }

    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipientEmail,
      replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
      subject: `Your 14-day Pro trial just ended — ${data.businessName}`,
      html: buildHtml(recipientEmail, data),
      text: buildPlainText({
        headline: "Your 14-day Pro trial just ended",
        intro: `Hi ${data.businessName}, your 14-day Pro trial just ended. Your account stays on Starter — all your data and settings remain intact.`,
        bodyText: "What changes:\n  - Pro-only features (advanced AI training, custom email domain, in-chat Stripe, social DMs, priority support) are now paused\n  - The rest of your account continues normally on the Starter plan\n  - Your number, dashboard, and history stay exactly as you left them\n\nUpgrade any time to re-enable Pro features — same dashboard, same number, same setup.",
        ctaLabel: "Upgrade to Pro",
        ctaUrl: data.upgradeUrl,
        supportNote: "Questions? Reply to this email and we'll help.",
      }),
    });

    log.info(`Sent pro-trial-ended email to ${recipientEmail} for ${data.businessName}`);
    return true;
  } catch (err: any) {
    log.error(`Send failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
