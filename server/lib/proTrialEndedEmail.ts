/**
 * Pro-preview-ended email.
 *
 * Sent when a self-serve client's 14-day Pro-features preview expires and
 * trialProExpiryWorker flips trial_pro_features_enabled back to false
 * (the column keeps its legacy name — renaming would need a migration).
 *
 * Trial-truth rules: there is no "trial" — free stays free forever, only
 * PRO-only features end with the preview. One honest email, no urgency
 * copy, prices derived from @shared/pricing.
 *
 * Marketing-adjacent — respects unsubscribe.
 * Never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { respectPreferences } from "./notificationPreferences";
import { createLogger } from "./logger";
import { TRADELINE, getTier, formatPrice } from "@shared/pricing";

const log = createLogger("pro-trial-ended-email");

// Pro access = an active TradeLine Pro/Premium service (see
// server/lib/clientProAccess.ts) — quote the canonical Pro price.
const TL_PRO_PRICE = formatPrice(getTier(TRADELINE, "Pro")!.price);

export interface ProTrialEndedData {
  businessName: string;
  upgradeUrl: string;
}

function buildHtml(recipientEmail: string, data: ProTrialEndedData): string {
  return buildTransactionalEmail({
    recipientEmail,
    marketing: true,
    subjectForTitle: `Your Pro preview has ended`,
    eyebrow: "Pro preview",
    headline: `Your Pro preview has ended — you're now on the Free plan.`,
    intro: `Hi ${data.businessName}, your 14-day Pro preview just ended. Everything free stays free forever — your account, data, settings, and free tools keep working exactly as they are. Upgrade anytime to re-enable Pro features.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">What changes</p>
      <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 12px;">
        Pro-only features (advanced AI training, custom-domain email, in-chat Stripe payments, social-DM channels, priority support) are paused until you upgrade. Everything on the Free plan continues normally — nothing is deleted, nothing stops working.
      </p>
      <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 12px;">
        Want to keep what you previewed? Pro plans start at ${TL_PRO_PRICE}/mo — same dashboard, same number, same setup.
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
      log.warn("SMTP not configured — skipping pro-preview-ended email");
      return false;
    }
    if (!recipientEmail) {
      log.warn("No recipient email — skipping pro-preview-ended email");
      return false;
    }
    if (clientId != null && !(await respectPreferences(clientId, "email", "billing"))) {
      log.info(`Skipped pro-preview-ended email — client #${clientId} disabled billing email`);
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
      subject: `Your Pro preview has ended — ${data.businessName}`,
      html: buildHtml(recipientEmail, data),
      text: buildPlainText({
        headline: "Your Pro preview has ended — you're now on the Free plan",
        intro: `Hi ${data.businessName}, your 14-day Pro preview just ended. Everything free stays free forever — your account, data, settings, and free tools keep working exactly as they are.`,
        bodyText: `What changes:\n  - Pro-only features (advanced AI training, custom email domain, in-chat Stripe, social DMs, priority support) are paused until you upgrade\n  - Everything on the Free plan continues normally — nothing is deleted, nothing stops working\n  - Your number, dashboard, and history stay exactly as you left them\n\nUpgrade anytime to re-enable Pro features — plans from ${TL_PRO_PRICE}/mo, same dashboard, same number, same setup.`,
        ctaLabel: "Upgrade to Pro",
        ctaUrl: data.upgradeUrl,
        supportNote: "Questions? Reply to this email and we'll help.",
      }),
    });

    log.info(`Sent pro-preview-ended email to ${recipientEmail} for ${data.businessName}`);
    return true;
  } catch (err: any) {
    log.error(`Send failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
