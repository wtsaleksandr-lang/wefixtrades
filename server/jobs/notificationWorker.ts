import nodemailer from "nodemailer";
import { storage } from "../storage";
import type { NotificationQueue, Calculator, Lead } from "@shared/schema";

const RATE_LIMIT_PER_CALCULATOR = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function buildBusinessNotificationEmail(calc: Calculator, lead: Lead, payload: any): { subject: string; html: string } {
  const quoteDisplay = lead.quote_amount ? `$${lead.quote_amount}` : 'Quote requested';
  const answers = lead.answers as Record<string, any> | null;
  const inputsSummary = answers
    ? Object.entries(answers).slice(0, 5).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')
    : '';

  const dashboardLink = payload?.dashboard_url || '';
  const hostedLink = payload?.hosted_url || '';

  const subject = `New Quote Request — ${lead.name || 'Unknown'} (${calc.trade_type})`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:24px 28px;background:#2D6A4F;">
    <h1 style="color:#fff;font-size:18px;margin:0;">New Quote Request</h1>
    <p style="color:#d1e8d5;font-size:13px;margin:6px 0 0;">${calc.business_name} — ${calc.trade_type}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:6px 0;font-size:14px;color:#666;">Name</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${lead.name || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;">Phone</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${lead.phone || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;">Email</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${lead.email || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;">Quote</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#2D6A4F;">${quoteDisplay}</td></tr>
    </table>
    ${inputsSummary ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;"><p style="font-size:12px;color:#666;margin:0 0 8px;font-weight:600;">Key Inputs</p><ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#333;">${inputsSummary}</ul></div>` : ''}
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;">
    ${dashboardLink ? `<a href="${dashboardLink}" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px;">View in Dashboard</a>` : ''}
    ${hostedLink ? `<a href="${hostedLink}" style="display:inline-block;background:#f0f0f0;color:#333;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Open Calculator</a>` : ''}
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by QuickQuote — Instant lead notification</p>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

export async function processNotificationQueue(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const pending = await storage.fetchDueNotifications(20);
  if (pending.length === 0) return { processed: 0, errors: [] };

  const mail = getTransporter();

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

        const { subject, html } = buildBusinessNotificationEmail(calc, lead, payload);
        const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@quickquote.app';

        await mail.sendMail({ from, to: toEmail, subject, html });

        await storage.updateNotification(notif.id, {
          status: 'sent',
          processed_at: new Date(),
          attempts: (notif.attempts || 0) + 1,
        });
        processed++;
      } else if (notif.type === 'sms') {
        await storage.updateNotification(notif.id, {
          status: 'skipped',
          last_error: 'SMS is a Pro feature — not configured',
          attempts: (notif.attempts || 0) + 1,
        });
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
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload?.webhook_payload || {}),
          });
          if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`);
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
