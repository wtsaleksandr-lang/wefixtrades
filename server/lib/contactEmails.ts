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
import { buildLegalFooter } from "./emailFooter";

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
  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:480px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades</span>
        </div>
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 8px;line-height:1.3;">
            Got it, ${escapeHtml(p.name.split(" ")[0] || "thanks")} — we'll be in touch
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 20px;">
            Your message is with our team. We reply within one business day, usually much sooner.
          </p>

          <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 24px;">
            <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your message${p.subject ? ` · ${escapeHtml(p.subject)}` : ""}</p>
            <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(p.message)}</p>
          </div>

          <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
            If you need us sooner, just reply to this email — it lands in the same inbox our team is watching.
          </p>
        </div>
        <p style="font-size:11px;color:#555B63;text-align:center;margin:20px 0 0;line-height:1.5;">
          Thanks for reaching out.
        </p>
        ${buildLegalFooter()}
      </div>
    </div>
  `;
}

function buildInternalHtml(p: ContactPayload, id: number): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;padding:20px;max-width:640px;">
      <h2 style="margin:0 0 8px;font-size:16px;">New contact form submission · sales_lead #${id}</h2>
      <p style="margin:0 0 20px;color:#555;font-size:13px;">Reply directly — the customer's address is the reply-to on this email.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#888;width:100px;">From</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Subject</td><td style="padding:6px 0;">${escapeHtml(p.subject || "General")}</td></tr>
      </table>
      <div style="margin-top:20px;padding:16px;background:#F6F7F9;border-radius:8px;border:1px solid #E5E7EB;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
        <pre style="margin:0;font-family:inherit;font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.5;">${escapeHtml(p.message)}</pre>
      </div>
    </div>
  `;
}

export async function sendContactAck(p: ContactPayload): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[contact-ack] SMTP not configured — skipping customer ack");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: p.email,
      replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
      subject: "We got your message — WeFixTrades",
      html: buildAckHtml(p),
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
      from: `WeFixTrades Inbox <${getFromAddress()}>`,
      to: adminEmail,
      replyTo: p.email,  // hitting reply goes straight to the customer
      subject: `[Contact · ${p.subject || "General"}] ${p.name}`,
      html: buildInternalHtml(p, leadId),
    });
    return true;
  } catch (err: any) {
    console.error("[contact-internal] send failed:", err.message);
    return false;
  }
}
