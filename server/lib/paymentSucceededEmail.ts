/**
 * Payment-succeeded email for recurring subscription invoices.
 *
 * Sent when Stripe fires `invoice.payment_succeeded` for a subscription
 * renewal (not the initial checkout — that's handled by paymentReceiptEmail).
 * Confirms the charge went through and tells the customer when to expect
 * the next one.
 *
 * Fail-safe: catches all errors and logs — never throws.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("PaymentSucceededEmail");

export interface PaymentSucceededData {
  businessName: string;
  amount: string;
  currency: string;
  serviceName: string;
  nextBillingDate: string;
  billingPortalUrl: string;
}

function formatCurrency(amount: string, currency: string): string {
  const symbol = currency.toUpperCase() === "GBP" ? "£" : "$";
  return `${symbol}${amount}`;
}

export async function sendPaymentSucceededEmail(
  recipientEmail: string,
  data: PaymentSucceededData,
): Promise<boolean> {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      log.warn("SMTP not configured — skipping payment succeeded email");
      return false;
    }

    const formatted = formatCurrency(data.amount, data.currency);
    const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

    const html = buildTransactionalEmail({
      recipientEmail,
      subjectForTitle: `Payment received — ${formatted}`,
      eyebrow: "Payment received",
      headline: `Thanks, ${data.businessName}`,
      intro: `Your subscription payment of <strong>${formatted}</strong> for <strong>${data.serviceName}</strong> has been processed successfully.`,
      bodyHtml: `
        <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin:0 0 20px;">
          <tr>
            <td style="padding:14px;font-size:13px;color:#8B919A;border-bottom:1px solid rgba(255,255,255,0.06);">Service</td>
            <td style="padding:14px;font-size:14px;color:#F0F0F0;text-align:right;border-bottom:1px solid rgba(255,255,255,0.06);">${data.serviceName}</td>
          </tr>
          <tr>
            <td style="padding:14px;font-size:13px;color:#8B919A;border-bottom:1px solid rgba(255,255,255,0.06);">Amount paid</td>
            <td style="padding:14px;font-size:14px;color:#66E8FA;text-align:right;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06);">${formatted}</td>
          </tr>
          <tr>
            <td style="padding:14px;font-size:13px;color:#8B919A;">Next billing date</td>
            <td style="padding:14px;font-size:14px;color:#F0F0F0;text-align:right;">${data.nextBillingDate}</td>
          </tr>
        </table>`,
      cta: {
        label: "Manage billing",
        url: data.billingPortalUrl,
      },
      ctaFinePrint: "View invoices, update payment method, or change your plan.",
      supportNote: `Questions? Reply to this email or reach us at <a href="mailto:${supportEmail}" style="color:#66E8FA;text-decoration:none;">${supportEmail}</a>.`,
    });

    const text = buildPlainText({
      headline: `Payment received — ${formatted}`,
      intro: `Your subscription payment of ${formatted} for ${data.serviceName} has been processed successfully.`,
      bodyText: `Service: ${data.serviceName}\nAmount: ${formatted}\nNext billing date: ${data.nextBillingDate}`,
      ctaLabel: "Manage billing",
      ctaUrl: data.billingPortalUrl,
      supportNote: `Questions? Reach us at ${supportEmail}.`,
    });

    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipientEmail,
      replyTo: supportEmail,
      subject: `Payment received — ${formatted} for ${data.serviceName}`,
      html,
      text,
    });

    log.info("Payment succeeded email sent", { to: recipientEmail, amount: formatted });
    return true;
  } catch (err: any) {
    log.error("Failed to send payment succeeded email", { to: recipientEmail, error: err.message });
    return false;
  }
}
