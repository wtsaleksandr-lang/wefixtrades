/**
 * TradeLine Notifications (Phase 2.1)
 *
 * Sends SMS + Email to the trades business when a new lead is captured
 * by the AI. Recipients come from metadata.tradeline.notifications.{sms,email}.
 *
 * Each per-recipient send is wrapped in try/catch — a notification
 * failure must never break call logging or the wider call flow.
 */

import { sendSMS } from "../twilioClient";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import type { TradelineExtractedLead, TradelineConfig } from "@shared/schema";

const MAX_SMS_LEN = 300;

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send SMS to every number in config.notifications.sms[].
 * Returns send/error counts. Per-recipient errors are logged, never thrown.
 */
export async function sendTradeLineSmsNotification(
  lead: TradelineExtractedLead,
  config: TradelineConfig,
): Promise<{ sent: number; errors: number }> {
  const recipients = (config.notifications?.sms ?? []).filter(Boolean);
  if (!recipients.length) return { sent: 0, errors: 0 };

  const name = (lead.caller_name && lead.caller_name.trim()) || "Unknown";
  const job = (lead.job_type && lead.job_type.trim()) || "(job type unclear)";
  const summary = (lead.summary && lead.summary.trim()) || "";
  const phone = (lead.caller_phone && lead.caller_phone.trim()) || "no number";

  const body = truncate(
    `New call:\n${name} - ${job}\n${summary}\nCall: ${phone}`,
    MAX_SMS_LEN,
  );

  let sent = 0;
  let errors = 0;
  for (const to of recipients) {
    try {
      await sendSMS(to, body, "sms");
      sent++;
    } catch (err: any) {
      errors++;
      console.warn(`[tradeline-notify] SMS to ${to} failed:`, err?.message);
    }
  }
  return { sent, errors };
}

/**
 * Send Email to every address in config.notifications.email[].
 * Returns send/error counts. Per-recipient errors are logged, never thrown.
 * If SMTP isn't configured, returns { sent: 0, errors: 0 }.
 */
export async function sendTradeLineEmailNotification(
  lead: TradelineExtractedLead,
  config: TradelineConfig,
  transcript: string | null,
  recordingUrl: string | null,
): Promise<{ sent: number; errors: number }> {
  const recipients = (config.notifications?.email ?? []).filter(Boolean);
  if (!recipients.length) return { sent: 0, errors: 0 };

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[tradeline-notify] SMTP not configured — skipping email notifications");
    return { sent: 0, errors: 0 };
  }

  const name = (lead.caller_name && lead.caller_name.trim()) || "Unknown";
  const job = (lead.job_type && lead.job_type.trim()) || "(job type unclear)";
  const phone = (lead.caller_phone && lead.caller_phone.trim()) || "—";
  const urgency = (lead.urgency || "low").toUpperCase();
  const summary = (lead.summary && lead.summary.trim()) || "";
  const address = (lead.address && lead.address.trim()) || null;
  const transcriptText = transcript && transcript.trim() ? transcript : "(no transcript captured)";

  const fromAddr = getFromAddress();

  const detailRows: Array<[string, string, boolean]> = [
    ["Caller name", name, false],
    ["Phone", phone, false],
    ["Job type", job, false],
    ["Urgency", urgency, false],
    ["Summary", summary, false],
  ];
  if (address) detailRows.push(["Address", address, false]);
  if (recordingUrl) {
    detailRows.push([
      "Recording",
      `<a href="${escapeHtml(recordingUrl)}">${escapeHtml(recordingUrl)}</a>`,
      true, // already HTML — do not escape again
    ]);
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="font-size:18px;margin:0 0 16px;">New Lead from TradeLine</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
        ${detailRows
          .map(
            ([label, value, isHtml]) => `
          <tr>
            <td style="padding:6px 12px 6px 0;color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;width:120px;vertical-align:top;">${escapeHtml(label)}</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;">${isHtml ? value : escapeHtml(value)}</td>
          </tr>`,
          )
          .join("")}
      </table>
      <h3 style="font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;margin:20px 0 8px;">Full transcript</h3>
      <pre style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px;font-family:'Menlo','Monaco',monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;color:#374151;">${escapeHtml(transcriptText)}</pre>
    </div>
  `;

  const textLines = [
    "New Lead from TradeLine",
    "",
    `Caller name: ${name}`,
    `Phone: ${phone}`,
    `Job type: ${job}`,
    `Urgency: ${urgency}`,
    `Summary: ${summary}`,
  ];
  if (address) textLines.push(`Address: ${address}`);
  if (recordingUrl) textLines.push(`Recording: ${recordingUrl}`);
  textLines.push("", "Full transcript:", transcriptText);
  const textBody = textLines.join("\n");

  let sent = 0;
  let errors = 0;
  for (const to of recipients) {
    try {
      await transporter.sendMail({
        from: fromAddr,
        to,
        subject: "New Lead from TradeLine",
        html,
        text: textBody,
      });
      sent++;
    } catch (err: any) {
      errors++;
      console.warn(`[tradeline-notify] Email to ${to} failed:`, err?.message);
    }
  }
  return { sent, errors };
}
