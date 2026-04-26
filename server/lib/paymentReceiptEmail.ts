/**
 * Payment receipt email.
 *
 * Stripe sends its own receipt by default, but a branded one reinforces
 * the relationship and gives the customer a portal link + a record that
 * matches the name they actually paid (WeFixTrades, not "STRIPE*something").
 *
 * Called once per checkout session, after provisioning completes.
 * Safe-fail: if SMTP isn't configured, logs and returns false.
 */

import { db } from "../db";
import { clients, clientServices, serviceCatalog, clientPayments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";
import type Stripe from "stripe";

interface LineItem {
  service_name: string;
  amount_cents: number;
  billing_period: string | null;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildHtml(params: {
  contactName: string;
  businessName: string;
  items: LineItem[];
  total_cents: number;
  currency: string;
  sessionId: string;
  paidAt: Date;
  portalUrl: string;
  supportEmail: string;
  recipientEmail: string;
}): string {
  const rows = params.items
    .map((it) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#F0F0F0;">
          ${it.service_name}
          ${it.billing_period && it.billing_period !== "one-time" ? `<div style="font-size:11px;color:#8B919A;margin-top:2px;">Billed ${it.billing_period}</div>` : ""}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#F0F0F0;text-align:right;font-weight:600;">
          ${formatUsd(it.amount_cents)}
        </td>
      </tr>`)
    .join("");

  const paidDate = params.paidAt.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const shortRef = params.sessionId.slice(-12).toUpperCase();

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Payment received</p>
          <h1 style="font-size:24px;font-weight:700;color:#F0F0F0;margin:0 0 6px;line-height:1.25;">
            Thanks, ${params.contactName.split(" ")[0] || "there"}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 28px;">
            Your payment to WeFixTrades has been received. Full details below — keep this for your records.
          </p>

          <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin:0 0 20px;">
            ${rows}
            <tr>
              <td style="padding:14px;font-size:12px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">
                Total paid
              </td>
              <td style="padding:14px;font-size:18px;font-weight:800;color:#66E8FA;text-align:right;">
                ${formatUsd(params.total_cents)}
              </td>
            </tr>
          </table>

          <table style="width:100%;font-size:12px;color:#8B919A;margin:0 0 24px;">
            <tr>
              <td style="padding:4px 0;">Business</td>
              <td style="padding:4px 0;text-align:right;color:#CDD1D6;">${params.businessName}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;">Date</td>
              <td style="padding:4px 0;text-align:right;color:#CDD1D6;">${paidDate}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;">Reference</td>
              <td style="padding:4px 0;text-align:right;color:#CDD1D6;font-family:'DM Mono',monospace;">${shortRef}</td>
            </tr>
          </table>

          <a href="${params.portalUrl}" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:13px;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;">
            View in your portal
          </a>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 14px;"></div>
          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
            Questions about this charge? Reply to this email or reach us at <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: params.recipientEmail })}
      </div>
    </div>
  `;
}

/**
 * Send a payment receipt for a Stripe checkout session.
 * Idempotent — skips if already sent for this session_id.
 */
export async function sendPaymentReceipt(
  session: Stripe.Checkout.Session,
  clientId: number,
): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[payment-receipt] SMTP not configured — skipping receipt");
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client?.contact_email) {
    console.warn(`[payment-receipt] Client #${clientId} has no email — skipping`);
    return false;
  }

  // Idempotency — check if any payment row for this session already had a receipt
  const existingPayments = await db.select()
    .from(clientPayments)
    .where(and(
      eq(clientPayments.stripe_payment_intent_id, session.id),
      eq(clientPayments.client_id, clientId),
    ));

  const firstWithReceipt = existingPayments.find(p => {
    const meta = (p.metadata as any) || {};
    return !!meta.receipt_sent_at;
  });
  if (firstWithReceipt) {
    console.log(`[payment-receipt] Already sent for session ${session.id}`);
    return false;
  }

  // Build line items from the payments linked to this session
  const items: LineItem[] = [];
  for (const p of existingPayments) {
    const [cs] = p.client_service_id
      ? await db.select().from(clientServices).where(eq(clientServices.id, p.client_service_id)).limit(1)
      : [undefined];
    const [svc] = cs
      ? await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1)
      : [undefined];
    items.push({
      service_name: svc?.name || p.description || "Service",
      amount_cents: p.amount_cents,
      billing_period: svc?.billing_period ?? cs?.billing_period ?? null,
    });
  }

  // If no line items (rare — receipt fired before payments persisted), fall back to session totals
  if (items.length === 0) {
    items.push({
      service_name: "WeFixTrades service",
      amount_cents: session.amount_total ?? 0,
      billing_period: null,
    });
  }

  const totalCents = items.reduce((sum, it) => sum + it.amount_cents, 0);
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `Receipt · ${formatUsd(totalCents)} paid to WeFixTrades`,
      html: buildHtml({
        contactName: client.contact_name || client.business_name || "there",
        businessName: client.business_name,
        items,
        total_cents: totalCents,
        currency: session.currency || "usd",
        sessionId: session.id,
        paidAt: new Date(),
        recipientEmail: client.contact_email,
        portalUrl: `${baseUrl}/portal/billing`,
        supportEmail,
      }),
    });

    // Mark the first payment as "receipt sent" so we don't duplicate
    if (existingPayments[0]) {
      const prevMeta = (existingPayments[0].metadata as any) || {};
      await db.update(clientPayments)
        .set({
          metadata: { ...prevMeta, receipt_sent_at: new Date().toISOString() },
          updated_at: new Date(),
        } as any)
        .where(eq(clientPayments.id, existingPayments[0].id));
    }

    console.log(`[payment-receipt] Sent to ${client.contact_email} for session ${session.id} (${formatUsd(totalCents)})`);
    return true;
  } catch (err: any) {
    console.error(`[payment-receipt] Send failed for session ${session.id}:`, err.message);
    return false;
  }
}
