/**
 * Billing portal link email.
 *
 * Sends a customer their billing portal access link so they can view
 * invoices, update payment methods, or manage their subscription.
 *
 * Fail-safe: catches all errors and logs — never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("BillingPortalEmail");

export interface BillingPortalLinkData {
  businessName: string;
  portalUrl: string;
}

export async function sendBillingPortalLinkEmail(
  recipientEmail: string,
  data: BillingPortalLinkData,
): Promise<boolean> {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      log.warn("SMTP not configured — skipping billing portal link email");
      return false;
    }

    const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

    const html = buildTransactionalEmail({
      recipientEmail,
      subjectForTitle: "Your billing portal link",
      eyebrow: "Billing access",
      headline: `Manage your billing, ${data.businessName}`,
      intro: "Use the link below to access your billing portal. From there you can view invoices, update your payment method, or manage your subscription.",
      cta: {
        label: "Open billing portal",
        url: data.portalUrl,
        style: "block",
      },
      ctaFinePrint: "This link is valid for 30 days. Each click opens a fresh, secure session.",
      pasteLinkFallback: {
        url: data.portalUrl,
      },
      supportNote: `Need help? Reply to this email or reach us at <a href="mailto:${supportEmail}" style="color:#66E8FA;text-decoration:none;">${supportEmail}</a>.`,
    });

    const text = buildPlainText({
      headline: "Your billing portal link",
      intro: `Hi ${data.businessName}, use the link below to access your billing portal where you can view invoices, update your payment method, or manage your subscription.`,
      ctaLabel: "Open billing portal",
      ctaUrl: data.portalUrl,
      pasteLinkUrl: data.portalUrl,
      supportNote: `Need help? Reach us at ${supportEmail}.`,
    });

    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipientEmail,
      replyTo: supportEmail,
      subject: "Your WeFixTrades billing portal link",
      html,
      text,
    });

    log.info("Billing portal link email sent", { to: recipientEmail });
    return true;
  } catch (err: any) {
    log.error("Failed to send billing portal link email", { to: recipientEmail, error: err.message });
    return false;
  }
}
