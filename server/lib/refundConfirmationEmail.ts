/**
 * Refund confirmation email — Phase 2.
 *
 * Sent from the `charge.refunded` Stripe webhook handler after a refund
 * is recorded as a `client_payments(type='refund', amount_cents=-X)` row.
 *
 * Idempotent on the REFUND row's `metadata.refund_email_sent_at` (not on
 * the originating payment row). Partial refunds each get their own email
 * because each produces its own refund row.
 *
 * Safe-fails if SMTP isn't configured. Mirrors the conventions of
 * paymentFailedEmail.ts.
 */

import { db } from "../db";
import { clients, clientPayments } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";

interface SendParams {
  /** Internal id of the new client_payments row representing this refund (negative amount). */
  refundPaymentId: number;
  /** Client receiving the email. */
  clientId: number;
  /** Refund amount in cents (positive — display value). */
  refundAmountCents: number;
  /** Currency, e.g. "usd". Defaults to USD if missing. */
  currency?: string | null;
  /** Optional original-payment description to give context in the email. */
  originalDescription?: string | null;
  /** Whether this refund cancelled the linked service. Affects copy. */
  serviceCancelled: boolean;
}

function formatMoney(cents: number, currency: string): string {
  const sym =
    currency.toLowerCase() === "usd" ? "$" :
    currency.toLowerCase() === "cad" ? "$" :
    currency.toLowerCase() === "eur" ? "€" :
    currency.toLowerCase() === "gbp" ? "£" :
    "";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function buildHtml(params: {
  contactName: string;
  amount: string;
  originalDescription: string | null;
  serviceCancelled: boolean;
  supportEmail: string;
  recipientEmail: string;
}): string {
  const lineItem = params.originalDescription
    ? `<p style="font-size:13px;color:#8B919A;margin:0 0 14px;">Refund for: <span style="color:#CDD1D6;">${escapeHtml(params.originalDescription)}</span></p>`
    : "";

  const cancelBlock = params.serviceCancelled
    ? `<div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 22px;">
         <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Service status</p>
         <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
           The associated service has been cancelled. No further charges will be made.
         </p>
       </div>`
    : "";

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#22C55E;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Refund processed</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 10px;line-height:1.3;">
            We've issued your refund, ${escapeHtml(params.contactName.split(" ")[0] || "there")}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 18px;">
            A refund of <strong style="color:#F0F0F0;">${params.amount}</strong> has been processed and is on its way back to your card. It typically appears on your statement within 5–10 business days, depending on your bank.
          </p>
          ${lineItem}
          ${cancelBlock}
          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
            Need anything else? Reply to this email or reach us at <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: params.recipientEmail })}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send a refund confirmation email. Idempotent per refund row.
 * Returns true if sent, false on any non-fatal short-circuit (no SMTP,
 * already sent, no contact email).
 */
export async function sendRefundConfirmationEmail(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[refund-email] SMTP not configured — skipping");
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, params.clientId)).limit(1);
  if (!client?.contact_email) {
    console.warn(`[refund-email] Client #${params.clientId} has no email — skipping`);
    return false;
  }

  // Idempotency — read the refund row and short-circuit if email already sent.
  const [refundRow] = await db.select().from(clientPayments).where(eq(clientPayments.id, params.refundPaymentId)).limit(1);
  const prevMeta = (refundRow?.metadata as Record<string, any> | null) ?? {};
  if (prevMeta.refund_email_sent_at) {
    console.log(`[refund-email] Already sent for refund row #${params.refundPaymentId}`);
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  void baseUrl; // currently unused in body; reserved for future portal links
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";
  const amount = formatMoney(params.refundAmountCents, params.currency || "usd");

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `Refund processed — ${amount} from WeFixTrades`,
      html: buildHtml({
        contactName,
        amount,
        originalDescription: params.originalDescription ?? null,
        serviceCancelled: params.serviceCancelled,
        supportEmail,
        recipientEmail: client.contact_email,
      }),
    });

    // Mark the refund row as "email sent" — atomic on the same row,
    // so any concurrent re-run will short-circuit on the next read.
    await db.update(clientPayments)
      .set({
        metadata: { ...prevMeta, refund_email_sent_at: new Date().toISOString() },
        updated_at: new Date(),
      } as any)
      .where(eq(clientPayments.id, params.refundPaymentId));

    console.log(`[refund-email] Sent to ${client.contact_email} for refund row #${params.refundPaymentId} (${amount})`);
    return true;
  } catch (err: any) {
    console.error(`[refund-email] Send failed:`, err.message);
    return false;
  }
}
