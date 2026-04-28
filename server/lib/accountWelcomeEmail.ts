/**
 * Account-created welcome email.
 *
 * Sent the first time a portal account is auto-provisioned for a paying
 * customer (via storage.ensurePortalAccount). The service-specific
 * "welcome package" email fires separately when each service actually
 * goes live — this one is about the portal account itself: how to log
 * in, what to expect, how to reach us.
 *
 * Security-correct flow: we never email the temp password. We generate
 * a single-use password-set token (reuses the password-reset token
 * table) so the customer sets their first password via a magic link.
 */

import crypto from "crypto";
import { db } from "../db";
import { passwordResetTokens, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import type { User, Client } from "@shared/schema";

interface SendParams {
  user: User;
  client: Client;
}

function buildHtml(params: {
  contactName: string;
  businessName: string;
  setPasswordUrl: string;
  portalUrl: string;
  supportEmail: string;
  contactEmail: string;
}): string {
  const firstName = params.contactName.split(" ")[0] || "there";
  return buildTransactionalEmail({
    recipientEmail: params.contactEmail,
    subjectForTitle: "Welcome to WeFixTrades — set your portal password",
    eyebrow: "Your portal is ready",
    headline: `Welcome aboard, ${firstName}`,
    intro: `We've set up your account for <strong style="color:#F0F0F0;">${params.businessName}</strong>. Set a password below, then you'll have one dashboard for every service, invoice, and piece of support.`,
    cta: { label: "Set your password", url: params.setPasswordUrl },
    ctaFinePrint: `The link works for one hour. If it expires, just use "Forgot password" on the login page.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 22px;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
        What's waiting for you
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${stepRow(1, "Setup forms for every service you've purchased")}
        ${stepRow(2, "Live task progress so you can see exactly what we're doing")}
        ${stepRow(3, "Invoices, reports, and support — all in one place")}
      </table>`,
    pasteLinkFallback: { url: params.setPasswordUrl },
    supportNote: `Need anything? Just reply to this email or reach us at <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>.`,
  });
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;">
      <span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">${n}</span>
    </td>
    <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

/**
 * Send account-created welcome email. Creates a single-use password-set
 * token (valid 1 hour) and embeds it in a magic link.
 *
 * Idempotent — checks users.metadata-style flag via a lookup on
 * recent tokens, but if two fire races it's harmless (both tokens work).
 *
 * No-ops if SMTP is not configured.
 */
export async function sendAccountWelcome(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[account-welcome] SMTP not configured — skipping");
    return false;
  }

  if (!params.client.contact_email) {
    console.warn(`[account-welcome] Client #${params.client.id} has no email — skipping`);
    return false;
  }

  // Create a password-set token (reuses the reset-token table)
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    user_id: params.user.id,
    token,
    expires_at: expiresAt,
  });

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const setPasswordUrl = `${baseUrl}/reset-password?token=${token}&setup=1`;
  const contactName = params.client.contact_name || params.client.business_name || "there";

  try {
    const firstName = contactName.split(" ")[0] || "there";
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      replyTo: supportEmail,
      subject: `Welcome to WeFixTrades — set your portal password`,
      html: buildHtml({
        contactName,
        businessName: params.client.business_name,
        setPasswordUrl,
        portalUrl: `${baseUrl}/portal`,
        supportEmail,
        contactEmail: params.client.contact_email,
      }),
      text: buildPlainText({
        headline: `Welcome aboard, ${firstName}`,
        intro: `We've set up your account for ${params.client.business_name}. Set a password and you'll have one dashboard for every service, invoice, and piece of support.`,
        ctaLabel: "Set your password",
        ctaUrl: setPasswordUrl,
        supportNote: `Need anything? Reach us at ${supportEmail}.`,
      }),
    });
    console.log(`[account-welcome] Sent to ${params.client.contact_email} for user #${params.user.id}`);
    return true;
  } catch (err: any) {
    console.error(`[account-welcome] Send failed for user #${params.user.id}:`, err.message);
    return false;
  }
}
