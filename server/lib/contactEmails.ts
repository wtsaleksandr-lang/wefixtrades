/**
 * Contact form emails — sent when a prospect submits the public contact form.
 *
 *  1. Acknowledgement to the customer ("We got your message")
 *  2. Internal notification to the ops inbox with full details
 *
 * Both are safe-fails: if SMTP isn't configured they log and return false
 * rather than breaking the form submission.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME } from "./adminAlertShell";

interface ContactPayload {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAckHtml(p: ContactPayload): string {
  const firstName = escapeHtml(p.name.split(" ")[0] || "thanks");
  return buildTransactionalEmail({
    recipientEmail: p.email,
    subjectForTitle: "We got your message — WeFixTrades",
    headline: `Got it, ${firstName} — we'll be in touch`,
    intro: "Your message is with our team. We reply within one business day, usually much sooner.",
    bodyHtml: `
      <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
        <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your message${p.subject ? ` · ${escapeHtml(p.subject)}` : ""}</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(p.message)}</p>
      </div>`,
    supportNote: "If you need us sooner, just reply to this email — it lands in the same inbox our team is watching.",
    showDividerBeforeSupport: false,
  });
}

function buildInternalHtml(p: ContactPayload, id: number): string {
  return buildAdminAlertEmail({
    subjectForTitle: `New contact form submission · #${id}`,
    alertType: "New contact form submission",
    alertTone: "info",
    headline: `${escapeHtml(p.name)} sent a message`,
    summary: "Reply directly — the customer's address is the reply-to on this email.",
    detailRows: [
      { label: "From", value: `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;` },
      { label: "Subject", value: escapeHtml(p.subject || "General") },
      { label: "Lead ID", value: `#${id}` },
    ],
    bodyHtml: `
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Message</p>
        <pre style="margin:0;font-family:inherit;font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.5;">${escapeHtml(p.message)}</pre>
      </div>`,
    footerNote: "Sent by WeFixTrades contact form",
  });
}

function buildInternalPlainText(p: ContactPayload, id: number): string {
  return buildAdminAlertPlainText({
    alertType: "New contact form submission",
    headline: `${p.name} sent a message`,
    summary: "Reply directly — the customer's address is the reply-to on this email.",
    detailRows: [
      { label: "From", value: `${p.name} <${p.email}>` },
      { label: "Subject", value: p.subject || "General" },
      { label: "Lead ID", value: `#${id}` },
    ],
    bodyText: `Message:\n${p.message}`,
    footerNote: "Sent by WeFixTrades contact form",
  });
}

export async function sendContactAck(p: ContactPayload): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[contact-ack] SMTP not configured — skipping customer ack");
    return false;
  }
  try {
    const firstName = p.name.split(" ")[0] || "thanks";
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: p.email,
      replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
      subject: "We got your message — WeFixTrades",
      html: buildAckHtml(p),
      text: buildPlainText({
        headline: `Got it, ${firstName} — we'll be in touch`,
        intro: "Your message is with our team. We reply within one business day, usually much sooner.",
        bodyText: `Your message${p.subject ? ` (${p.subject})` : ""}:\n${p.message}`,
        supportNote: "If you need us sooner, just reply to this email.",
      }),
    });
    return true;
  } catch (err: any) {
    console.error("[contact-ack] send failed:", err.message);
    return false;
  }
}

export async function sendContactInternalNotification(p: ContactPayload, leadId: number): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL;
  if (!adminEmail) {
    console.warn("[contact-internal] ADMIN_EMAIL not set — skipping internal notification");
    return false;
  }
  const transporter = getEmailTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
      to: adminEmail,
      replyTo: p.email,  // hitting reply goes straight to the customer
      subject: `New contact form submission · ${p.subject || "General"} — ${p.name}`,
      html: buildInternalHtml(p, leadId),
      text: buildInternalPlainText(p, leadId),
    });
    return true;
  } catch (err: any) {
    console.error("[contact-internal] send failed:", err.message);
    return false;
  }
}
