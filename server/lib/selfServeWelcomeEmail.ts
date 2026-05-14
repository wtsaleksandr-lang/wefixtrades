/**
 * Self-serve signup welcome email.
 *
 * Sent immediately after a user creates a free WeFixTrades account via
 * the public signup form (authRoutes.ts). At this point the user has
 * already set their own password and is auto-logged-in — so this email
 * is purely orienting: confirms the account exists, names the business,
 * and points them at the dashboard.
 *
 * Distinct from sendAccountWelcome() which fires post-Stripe-payment
 * when a portal account is auto-provisioned for a paying customer (that
 * one ships a password-set magic link).
 *
 * No-ops if SMTP is not configured. Send failures are logged but never
 * throw — signup must succeed even when email is down.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import type { User, Client } from "@shared/schema";
import { createLogger } from "./logger";

const log = createLogger("SelfServeWelcome");

interface SendParams {
  user: User;
  client: Client;
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;">
      <span style="display:inline-block;width:20px;height:20px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">${n}</span>
    </td>
    <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

export async function sendSelfServeWelcome(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("[self-serve-welcome] SMTP not configured — skipping");
    return false;
  }

  if (!params.client.contact_email) {
    log.warn(`[self-serve-welcome] Client #${params.client.id} has no email — skipping`);
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const portalUrl = `${baseUrl}/portal`;
  const contactName = params.client.contact_name || params.client.business_name || "there";
  const firstName = contactName.split(" ")[0] || "there";
  const businessName = params.client.business_name;

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      replyTo: supportEmail,
      subject: `Welcome to WeFixTrades, ${firstName}`,
      html: buildTransactionalEmail({
        recipientEmail: params.client.contact_email,
        subjectForTitle: `Welcome to WeFixTrades, ${firstName}`,
        eyebrow: "Account created",
        headline: `You're in, ${firstName}`,
        intro: `Your free account for <strong style="color:#F0F0F0;">${businessName}</strong> is ready. From your dashboard you can try the free tools, pick services that fit your trade, and add team members when you're ready.`,
        cta: { label: "Open your dashboard", url: portalUrl },
        ctaFinePrint: `If you ever lose this link, just go to wefixtrades.com and log in with the email + password you just set.`,
        bodyHtml: `
          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 22px;line-height:1px;font-size:0;">&nbsp;</div>
          <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
            Three places to start
          </p>
          <table style="width:100%;border-collapse:collapse;">
            ${stepRow(1, "Run a free Google Business + website audit to see where you stand")}
            ${stepRow(2, "Try the missed-call revenue calculator for your trade")}
            ${stepRow(3, "Browse services or talk to us about what would move the needle first")}
          </table>`,
        pasteLinkFallback: { url: portalUrl },
        supportNote: `Questions? Just reply to this email or reach us at <a href="mailto:${supportEmail}" style="color:#0d3cfc;text-decoration:none;">${supportEmail}</a>.`,
      }),
      text: buildPlainText({
        headline: `You're in, ${firstName}`,
        intro: `Your free WeFixTrades account for ${businessName} is ready. Try the free tools, pick services that fit your trade, or add team members when you're ready.`,
        ctaLabel: "Open your dashboard",
        ctaUrl: portalUrl,
        supportNote: `Questions? Reach us at ${supportEmail}.`,
      }),
    });
    log.info(`[self-serve-welcome] Sent to ${params.client.contact_email} for user #${params.user.id}`);
    return true;
  } catch (err: any) {
    log.error(`[self-serve-welcome] Send failed for user #${params.user.id}:`, err.message);
    return false;
  }
}
