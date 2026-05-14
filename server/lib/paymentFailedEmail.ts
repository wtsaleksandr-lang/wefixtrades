/**
 * Payment-failed email — branded heads-up to the customer.
 *
 * Stripe handles dunning (the actual retry schedule and the "update your
 * card" flow) but their emails look generic. This email is friendlier,
 * explains what happens next, and links straight to the portal billing
 * page where they can update their card without logging into Stripe.
 *
 * Fires from the Stripe `invoice.payment_failed` webhook.
 * Idempotent on client_payments.metadata.failure_email_sent_at so we
 * don't nag the customer multiple times for the same failed invoice.
 */

import { db } from "../db";
import { clients, clientPayments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";
import { createLogger } from "./logger";

const log = createLogger("PaymentFailedEmail");

interface SendParams {
  clientId: number;
  invoiceId: string;
  amountCents: number;
  nextAttemptAt?: Date | null;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildHtml(params: {
  contactName: string;
  amount: string;
  nextAttempt: string | null;
  portalUrl: string;
  supportEmail: string;
  recipientEmail: string;
}): string {
  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Payment issue — no stress</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 10px;line-height:1.3;">
            A quick heads-up, ${params.contactName.split(" ")[0] || "there"}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 18px;">
            Your most recent WeFixTrades payment of <strong style="color:#F0F0F0;">${params.amount}</strong> didn't go through. This happens most often because a card has expired, been replaced, or hit a daily limit — nothing to do with your account standing.
          </p>

          <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 22px;">
            <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">What happens next</p>
            <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
              ${params.nextAttempt
                ? `We'll automatically retry this charge on <strong style="color:#F0F0F0;">${params.nextAttempt}</strong>. You don't need to do anything if your card is fine — just make sure there's room on it.`
                : `We'll retry this charge automatically over the next few days. If we can't get it through, your service will pause (nothing deletes — everything resumes the moment payment goes through).`}
            </p>
          </div>

          <a href="${params.portalUrl}" style="display:inline-block;background:#0d3cfc;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;">
            Update payment method
          </a>

          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:16px 0 0;">
            Updating your card takes 30 seconds — we can retry the charge immediately once it's updated, so there's no gap in service.
          </p>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 14px;"></div>
          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
            Something else going on? Reply to this email or reach us at <a href="mailto:${params.supportEmail}" style="color:#0d3cfc;text-decoration:none;">${params.supportEmail}</a> — we can pause billing, adjust your plan, or work out a payment arrangement. We'd rather talk than lose you.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: params.recipientEmail })}
      </div>
    </div>
  `;
}

/**
 * Send a friendly payment-failed email. Idempotent per invoice.
 * Safe-fails if SMTP isn't configured.
 */
export async function sendPaymentFailedEmail(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("[payment-failed] SMTP not configured — skipping");
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, params.clientId)).limit(1);
  if (!client?.contact_email) {
    log.warn(`[payment-failed] Client #${params.clientId} has no email — skipping`);
    return false;
  }

  // Idempotency — has the failure email already been sent for this invoice?
  const existing = await db.select()
    .from(clientPayments)
    .where(and(
      eq(clientPayments.stripe_invoice_id, params.invoiceId),
      eq(clientPayments.client_id, params.clientId),
    ));
  const alreadySent = existing.some(p => {
    const meta = (p.metadata as any) || {};
    return !!meta.failure_email_sent_at;
  });
  if (alreadySent) {
    log.info(`[payment-failed] Already sent for invoice ${params.invoiceId}`);
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";
  const nextAttempt = params.nextAttemptAt
    ? params.nextAttemptAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : null;

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `Heads up: your last WeFixTrades payment didn't go through`,
      html: buildHtml({
        contactName,
        amount: formatUsd(params.amountCents),
        nextAttempt,
        portalUrl: `${baseUrl}/portal/billing`,
        supportEmail,
        recipientEmail: client.contact_email,
      }),
    });

    // Mark the first matching payment row as "email sent"
    if (existing[0]) {
      const prevMeta = (existing[0].metadata as any) || {};
      await db.update(clientPayments)
        .set({
          metadata: { ...prevMeta, failure_email_sent_at: new Date().toISOString() },
          updated_at: new Date(),
        } as any)
        .where(eq(clientPayments.id, existing[0].id));
    }

    log.info(`[payment-failed] Sent to ${client.contact_email} for invoice ${params.invoiceId}`);
    return true;
  } catch (err: any) {
    log.error(`[payment-failed] Send failed:`, err.message);
    return false;
  }
}
