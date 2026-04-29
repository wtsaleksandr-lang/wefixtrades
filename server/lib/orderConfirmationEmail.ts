/**
 * Order confirmation email — sent immediately after a successful Stripe
 * checkout, before any onboarding or fulfillment work begins.
 *
 * Distinct from:
 *   - paymentReceiptEmail: branded payment receipt (Stripe also sends its own)
 *   - onboardingEmail:     "Complete your setup" form link, sent per service
 *   - welcomeEmail:        sent after the service is delivered/active
 *
 * Purpose: kill the silent gap between "card charged" and "onboarding form".
 * Tells the buyer what they bought, what happens next, and where to look.
 *
 * Idempotent per checkout session via clients.metadata.order_confirmations[session_id].
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { db } from "../db";
import { clients, serviceCatalog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

interface OrderConfirmationParams {
  clientId: number;
  serviceIds: string[];     // service_catalog ids included in this checkout
  sessionId: string;        // stripe checkout session id (idempotency key)
  baseUrl: string;
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;">
      <span style="display:inline-block;width:22px;height:22px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">${n}</span>
    </td>
    <td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

function serviceRow(name: string, billingPeriod: string): string {
  const periodLabel = billingPeriod === "monthly" ? "monthly" : "one-time";
  return `<tr>
    <td style="padding:0 0 10px;">
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:13px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="font-size:14px;font-weight:600;color:#F0F0F0;">${name}</td>
            <td align="right" style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;">${periodLabel}</td>
          </tr>
        </table>
      </div>
    </td>
  </tr>`;
}

export async function sendOrderConfirmation(params: OrderConfirmationParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[order-confirmation] SMTP not configured — skipping email");
    return false;
  }

  if (!params.serviceIds.length) {
    console.warn("[order-confirmation] No service ids supplied — skipping");
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, params.clientId)).limit(1);
  if (!client || !client.contact_email) {
    console.warn(`[order-confirmation] Client #${params.clientId} missing email — skipping`);
    return false;
  }

  // Idempotency — never send twice for the same session
  const meta = (client.metadata as any) || {};
  const sentMap: Record<string, string> = meta.order_confirmations || {};
  if (sentMap[params.sessionId]) {
    console.log(`[order-confirmation] Already sent for session ${params.sessionId}`);
    return false;
  }

  // Resolve service names
  const services = await db
    .select({ id: serviceCatalog.id, name: serviceCatalog.name, billing_period: serviceCatalog.billing_period })
    .from(serviceCatalog)
    .where(inArray(serviceCatalog.id, params.serviceIds));

  if (!services.length) {
    console.warn(`[order-confirmation] No services resolved for ids: ${params.serviceIds.join(",")}`);
    return false;
  }

  const contactName = client.contact_name || client.business_name || "there";
  const portalUrl = `${params.baseUrl}/portal`;

  const serviceList = services.map(s => serviceRow(s.name, s.billing_period)).join("");

  const subject = services.length === 1
    ? `Order confirmed — ${services[0].name}`
    : `Order confirmed — ${services.length} services`;

  const html = buildTransactionalEmail({
    recipientEmail: client.contact_email,
    subjectForTitle: subject,
    eyebrow: "Order confirmed",
    headline: "Thanks — your order is in",
    intro: `Hi ${contactName}, payment cleared and we're good to go. Here's exactly what happens next so nothing surprises you.`,
    bodyHtml: `
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">
        What you bought
      </p>
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin:0 0 22px;">
        ${serviceList}
      </table>

      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:0 0 22px;line-height:1px;font-size:0;">&nbsp;</div>

      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">
        What happens next
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
        ${stepRow(1, "You'll get a separate onboarding email with a short form for each service. Takes 2–3 minutes.")}
        ${stepRow(2, "We start the work and track every step inside your portal.")}
        ${stepRow(3, "We email you again the moment your service is live.")}
      </table>`,
    cta: { label: "Open your portal", url: portalUrl, style: "block" },
    pasteLinkFallback: { label: "If the button doesn’t work, copy this link:", url: portalUrl },
    showDividerBeforeSupport: true,
    supportNote: "Reply to this email or message us from the portal if anything is missing or doesn't look right.",
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      subject,
      html,
      text: buildPlainText({
        headline: "Thanks — your order is in",
        intro: `Hi ${contactName}, payment cleared and we're good to go.`,
        bodyText:
          `What you bought:\n` +
          services.map(s => `  • ${s.name} (${s.billing_period === "monthly" ? "monthly" : "one-time"})`).join("\n") +
          `\n\nWhat happens next:\n` +
          `  1. You'll get a separate onboarding email with a short form for each service.\n` +
          `  2. We start the work and track every step inside your portal.\n` +
          `  3. We email you again the moment your service is live.`,
        ctaLabel: "Open your portal",
        ctaUrl: portalUrl,
        supportNote: "Reply to this email or message us from the portal if anything is missing.",
      }),
    });

    // Record idempotency
    sentMap[params.sessionId] = new Date().toISOString();
    await db.update(clients)
      .set({ metadata: { ...meta, order_confirmations: sentMap }, updated_at: new Date() })
      .where(eq(clients.id, client.id));

    console.log(`[order-confirmation] Sent to ${client.contact_email} for session ${params.sessionId} (${services.length} svc)`);
    return true;
  } catch (err: any) {
    console.error(`[order-confirmation] Failed to send for session ${params.sessionId}:`, err.message);
    return false;
  }
}
