/**
 * Order confirmation email — sent after a Stripe checkout session completes.
 *
 * Distinct from paymentReceiptEmail.ts (which shows line-item detail and
 * reference numbers). This email is customer-facing reassurance: "you
 * bought X, here's what happens next, here's your onboarding link."
 *
 * Idempotent via metadata stamp on the session-linked payment record.
 * Safe-fail: never throws — catches errors and logs.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";
import { queueEmail } from "../services/emailQueueService";

const log = createLogger("order-confirmation");

export interface OrderConfirmationData {
  businessName: string;
  serviceName: string;
  /** Amount in cents */
  amount: number;
  currency: string;
  onboardingUrl: string;
}

function formatCurrency(cents: number, currency: string): string {
  const value = (cents / 100).toFixed(2);
  const symbol = currency.toLowerCase() === "gbp" ? "£"
    : currency.toLowerCase() === "eur" ? "€"
    : "$";
  return `${symbol}${value}`;
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;">
      <span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">${n}</span>
    </td>
    <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

function buildHtml(recipientEmail: string, data: OrderConfirmationData): string {
  const amount = formatCurrency(data.amount, data.currency);

  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `Order confirmed — ${data.serviceName}`,
    eyebrow: "Order confirmed",
    headline: `You're in, ${data.businessName}`,
    intro: `Your purchase of <strong style="color:#F0F0F0;">${data.serviceName}</strong> (${amount}) has been confirmed. Here's what happens next.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
        What happens next
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${stepRow(1, "Complete a quick setup form (2–3 minutes)")}
        ${stepRow(2, "Our team reviews your info and configures your service")}
        ${stepRow(3, "You get a notification when everything is live")}
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0 0 4px;">
        Most services activate within <strong style="color:#CDD1D6;">24–48 hours</strong> after you submit your setup info.
      </p>`,
    cta: { label: "Start Setup", url: data.onboardingUrl, style: "block" },
    pasteLinkFallback: { url: data.onboardingUrl },
    supportNote: `Questions? Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#66E8FA;text-decoration:none;">support@wefixtrades.com</a>.`,
  });
}

/**
 * Send an order confirmation email after checkout completes.
 * Returns true if sent successfully, false otherwise.
 * Never throws.
 */
export async function sendOrderConfirmationEmail(
  recipientEmail: string,
  data: OrderConfirmationData,
): Promise<boolean> {
  try {
    if (!recipientEmail) {
      log.warn("No recipient email — skipping order confirmation");
      return false;
    }
    const amount = formatCurrency(data.amount, data.currency);
    await queueEmail(recipientEmail, `Order confirmed — ${data.serviceName}`, buildHtml(recipientEmail, data), buildPlainText({ headline: `You're in, ${data.businessName}`, intro: `Your purchase of ${data.serviceName} (${amount}) has been confirmed.`, bodyText: "What happens next:\n  1. Complete a quick setup form (2-3 minutes)\n  2. Our team reviews your info and configures your service\n  3. You get a notification when everything is live\n\nMost services activate within 24-48 hours after you submit your setup info.", ctaLabel: "Start Setup", ctaUrl: data.onboardingUrl, supportNote: "Questions? Reply to this email or reach us at support@wefixtrades.com." }), { source: "order_confirmation", entity_type: "order" });
    log.info(`Queued order confirmation to ${recipientEmail} for ${data.serviceName}`);
    return true;
  } catch (err: any) {
    log.error(`Queue failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
