import { storage } from "../storage";
import type { NotificationQueue, Calculator, Lead } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildTransactionalEmail, buildPlainText } from "../lib/transactionalShell";
import { isTwilioConfigured, sendSMS, storeSmsMessage } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("NotificationWorker");

const RATE_LIMIT_PER_CALCULATOR = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBusinessNotificationEmail(calc: Calculator, lead: Lead, payload: any): { subject: string; html: string; text: string } {
  const quoteDisplay = lead.quote_amount ? `$${lead.quote_amount}` : "Quote requested";
  const answers = lead.answers as Record<string, any> | null;

  const dashboardLink = payload?.dashboard_url || "";
  const hostedLink = payload?.hosted_url || "";
  const subject = `New Quote Request — ${lead.name || "Unknown"} (${calc.trade_type})`;

  const detailRow = (label: string, value: string, accent?: boolean) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;width:80px;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${accent ? "#66E8FA" : "#F0F0F0"};font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const inputsBlock = answers
    ? `<div style="margin:16px 0 0;padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
        <p style="font-size:11px;color:#8B919A;margin:0 0 8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Key inputs</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#CDD1D6;">
          ${Object.entries(answers).slice(0, 5).map(([k, v]) =>
            `<tr><td style="padding:3px 0;color:#8B919A;">${escapeHtml(k)}</td><td style="padding:3px 0;color:#F0F0F0;text-align:right;">${escapeHtml(String(v))}</td></tr>`,
          ).join("")}
        </table>
      </div>`
    : "";

  const secondaryCta = hostedLink
    ? `<p style="font-size:12px;color:#8B919A;line-height:1.6;margin:14px 0 0;">
        Or open the calculator directly: <a href="${hostedLink}" style="color:#66E8FA;text-decoration:none;">${hostedLink}</a>
       </p>`
    : "";

  const html = buildTransactionalEmail({
    recipientEmail: calc.owner_email || undefined,
    headerTagline: `${calc.business_name} · ${calc.trade_type}`,
    eyebrow: "New quote request",
    headline: `${lead.name || "A new lead"} just requested a quote`,
    intro: `Quote: <strong style="color:#66E8FA;">${quoteDisplay}</strong>. Full details below — reply within an hour for the best conversion.`,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 14px;">
        ${detailRow("Name", lead.name || "—")}
        ${detailRow("Phone", lead.phone || "—")}
        ${detailRow("Email", lead.email || "—")}
        ${detailRow("Quote", quoteDisplay, true)}
      </table>
      ${inputsBlock}`,
    cta: dashboardLink ? { label: "View in dashboard", url: dashboardLink } : undefined,
    ctaFinePrint: secondaryCta || undefined,
  });

  const text = buildPlainText({
    headline: `${lead.name || "A new lead"} just requested a quote`,
    intro: `Quote: ${quoteDisplay}. Reply within an hour for the best conversion.`,
    bodyText: [
      `Name: ${lead.name || "—"}`,
      `Phone: ${lead.phone || "—"}`,
      `Email: ${lead.email || "—"}`,
      `Quote: ${quoteDisplay}`,
      answers ? `\nKey inputs:\n${Object.entries(answers).slice(0, 5).map(([k, v]) => `  ${k}: ${v}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),
    ctaLabel: dashboardLink ? "View in dashboard" : undefined,
    ctaUrl: dashboardLink || undefined,
    pasteLinkUrl: hostedLink || undefined,
  });

  return { subject, html, text };
}

export async function processNotificationQueue(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const pending = await storage.fetchDueNotifications(20);
  if (pending.length === 0) return { processed: 0, errors: [] };

  const mail = getEmailTransporter();

  for (const notif of pending) {
    try {
      const recentCount = await storage.getRecentNotificationCount(
        notif.calculator_id, RATE_LIMIT_WINDOW_MINUTES
      );
      if (recentCount >= RATE_LIMIT_PER_CALCULATOR) {
        continue;
      }

      if (notif.type === 'email') {
        if (!mail) {
          await storage.updateNotification(notif.id, {
            status: 'failed',
            last_error: 'SMTP not configured',
            attempts: (notif.attempts || 0) + 1,
          });
          errors.push(`Notification ${notif.id}: SMTP not configured`);
          continue;
        }

        const payload = notif.payload as any;
        const calc = await storage.getCalculatorByToken(payload?.edit_token || '');
        const lead = await storage.getLeadById(notif.lead_id);

        if (!calc || !lead) {
          await storage.updateNotification(notif.id, { status: 'failed', last_error: 'Calculator or lead not found' });
          continue;
        }

        const toEmail = calc.owner_email || payload?.delivery_email;
        if (!toEmail) {
          await storage.updateNotification(notif.id, { status: 'failed', last_error: 'No delivery email' });
          continue;
        }

        const { subject, html, text } = buildBusinessNotificationEmail(calc, lead, payload);

        await mail.sendMail({
          from: `WeFixTrades <${getFromAddress()}>`,
          to: toEmail,
          subject,
          html,
          text,
        });

        await storage.updateNotification(notif.id, {
          status: 'sent',
          processed_at: new Date(),
          attempts: (notif.attempts || 0) + 1,
        });
        processed++;
      } else if (notif.type === 'sms') {
        const payload = notif.payload as any;
        const calc = await storage.getCalculatorById(notif.calculator_id);
        const lead = await storage.getLeadById(notif.lead_id);

        if (!calc || !lead) {
          await storage.updateNotification(notif.id, { status: 'failed', last_error: 'Calculator or lead not found' });
          continue;
        }

        // Check if SMS notifications are enabled for this calculator
        const settings = (calc.calculator_settings as any) || {};
        const notifications = settings.followup?.notifications || {};
        if (!notifications.sms_enabled) {
          await storage.updateNotification(notif.id, {
            status: 'skipped',
            last_error: 'SMS notifications not enabled for this calculator',
            attempts: (notif.attempts || 0) + 1,
          });
          continue;
        }

        if (!isTwilioConfigured()) {
          await storage.updateNotification(notif.id, {
            status: 'failed',
            last_error: 'Twilio not configured',
            attempts: (notif.attempts || 0) + 1,
          });
          errors.push(`Notification ${notif.id}: Twilio not configured`);
          continue;
        }

        const toPhone = calc.owner_phone;
        if (!toPhone) {
          await storage.updateNotification(notif.id, {
            status: 'failed',
            last_error: 'No business phone number configured',
            attempts: (notif.attempts || 0) + 1,
          });
          continue;
        }

        try {
          const quoteDisplay = lead.quote_amount ? `$${lead.quote_amount}` : 'Quote requested';
          const smsBody = `New lead: ${lead.name || 'Unknown'} — ${quoteDisplay}. ${lead.phone || lead.email || ''}. Check your dashboard for details.`;

          const twilioSid = await sendSMS(toPhone, smsBody, 'sms');

          await storeSmsMessage({
            lead_id: lead.id,
            calculator_id: calc.id,
            direction: 'outbound',
            channel: 'sms',
            body: smsBody,
            to_number: toPhone,
            twilio_sid: twilioSid,
            is_ai: false,
          });

          await storage.updateNotification(notif.id, {
            status: 'sent',
            processed_at: new Date(),
            attempts: (notif.attempts || 0) + 1,
          });
          processed++;
        } catch (smsErr: any) {
          const attempts = (notif.attempts || 0) + 1;
          await storage.updateNotification(notif.id, {
            status: attempts >= (notif.max_attempts || 3) ? 'failed' : 'pending',
            last_error: smsErr.message,
            attempts,
          });
          errors.push(`Notification ${notif.id}: SMS error: ${smsErr.message}`);
          log.error("SMS notification send failed", { notifId: notif.id, error: smsErr.message });
        }
      } else if (notif.type === 'webhook') {
        const payload = notif.payload as any;
        const webhookUrl = payload?.webhook_url;
        if (!webhookUrl) {
          await storage.updateNotification(notif.id, {
            status: 'skipped',
            last_error: 'Webhook URL not configured',
            attempts: (notif.attempts || 0) + 1,
          });
          continue;
        }

        try {
          const url = new URL(webhookUrl);
          if (url.protocol !== 'https:') {
            throw new Error('Webhook URL must use HTTPS');
          }

          const dns = await import('dns');
          const lookups = await dns.promises.lookup(url.hostname, { all: true });
          const isPrivate = lookups.some((addr) => {
            const ip = addr.address;
            return (
              ip.startsWith('10.') ||
              ip.startsWith('192.168.') ||
              ip.startsWith('172.16.') ||
              ip.startsWith('172.17.') ||
              ip.startsWith('172.18.') ||
              ip.startsWith('172.19.') ||
              ip.startsWith('172.2') || // covers 172.20–172.29
              ip.startsWith('172.30.') || // covers 172.30.x.x (private)
              ip.startsWith('172.31.') || // covers 172.31.x.x (private)
              ip.startsWith('127.') ||
              ip === '0.0.0.0' ||
              ip.startsWith('169.254.') ||
              ip === '::1' ||
              ip.startsWith('fc') ||
              ip.startsWith('fd') ||
              ip.startsWith('fe80:')
            );
          });
          if (isPrivate) {
            throw new Error('Webhook host resolves to a private or loopback address');
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          try {
            const resp = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload?.webhook_payload || {}),
              signal: controller.signal,
            });
            if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`);
          } finally {
            clearTimeout(timeout);
          }

          await storage.updateNotification(notif.id, {
            status: 'sent',
            processed_at: new Date(),
            attempts: (notif.attempts || 0) + 1,
          });
          processed++;
        } catch (err: any) {
          const attempts = (notif.attempts || 0) + 1;
          await storage.updateNotification(notif.id, {
            status: attempts >= (notif.max_attempts || 3) ? 'failed' : 'pending',
            last_error: err.message,
            attempts,
          });
          errors.push(`Notification ${notif.id}: webhook error: ${err.message}`);
        }
      }
    } catch (err: any) {
      const attempts = (notif.attempts || 0) + 1;
      await storage.updateNotification(notif.id, {
        status: attempts >= (notif.max_attempts || 3) ? 'failed' : 'pending',
        last_error: err.message,
        attempts,
      });
      errors.push(`Notification ${notif.id}: ${err.message}`);
    }
  }

  return { processed, errors };
}
