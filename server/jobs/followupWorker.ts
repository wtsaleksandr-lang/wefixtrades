import nodemailer from "nodemailer";
import { storage } from "../storage";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}

function buildFollowupHtml(body: string, businessName: string): string {
  const htmlBody = body.replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">
    ${htmlBody}
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent on behalf of ${businessName}</p>
  </td></tr>
</table>
</body></html>`;
}

export async function processFollowupJobs(): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  const dueJobs = await storage.fetchDueFollowups(20);
  if (dueJobs.length === 0) return { processed: 0, skipped: 0, errors: [] };

  const mail = getTransporter();

  for (const job of dueJobs) {
    try {
      const lead = await storage.getLeadById(job.lead_id);
      if (!lead) {
        await storage.updateFollowupJob(job.id, { status: 'failed', last_error: 'Lead not found' });
        continue;
      }

      if (lead.status !== 'new') {
        await storage.updateFollowupJob(job.id, {
          status: 'cancelled',
          last_error: `Lead status is "${lead.status}" — sequence stopped`,
          processed_at: new Date(),
        });
        skipped++;
        continue;
      }

      const calculator = await storage.getCalculatorById(job.calculator_id);
      const calcSettings = (calculator?.calculator_settings as any) || {};
      const currentFollowupEnabled = calcSettings.followup?.enabled;
      if (!currentFollowupEnabled) {
        await storage.updateFollowupJob(job.id, {
          status: 'cancelled',
          last_error: 'Follow-up disabled in current calculator settings',
          processed_at: new Date(),
        });
        skipped++;
        continue;
      }

      const payload = job.payload as any;

      const templateVars: Record<string, string> = {
        name: lead.name || 'there',
        quote_amount: lead.quote_amount ? `$${lead.quote_amount}` : 'Quote requested',
        business_name: payload.personalization?.business_name || '',
        phone: payload.personalization?.phone || '',
        booking_link: payload.personalization?.booking_link || '',
        service_area: payload.personalization?.service_area || '',
      };

      if (job.channel === 'email') {
        if (!mail) {
          await storage.updateFollowupJob(job.id, {
            status: 'failed',
            last_error: 'SMTP not configured',
            attempts: (job.attempts || 0) + 1,
          });
          errors.push(`Followup ${job.id}: SMTP not configured`);
          continue;
        }

        if (!lead.email) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: 'Lead has no email address',
            processed_at: new Date(),
          });
          skipped++;
          continue;
        }

        const template = payload.template || {};
        const subject = replaceVariables(template.subject || '', templateVars);
        const body = replaceVariables(template.body || '', templateVars);
        const html = buildFollowupHtml(body, templateVars.business_name);
        const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@quickquote.app';

        await mail.sendMail({ from, to: lead.email, subject, html });

        await storage.updateFollowupJob(job.id, {
          status: 'sent',
          processed_at: new Date(),
          attempts: (job.attempts || 0) + 1,
        });
        processed++;
      } else if (job.channel === 'sms') {
        if (!lead.sms_consent) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: 'Lead did not consent to SMS',
            processed_at: new Date(),
          });
          skipped++;
          continue;
        }

        await storage.updateFollowupJob(job.id, {
          status: 'skipped',
          last_error: 'SMS is a Pro feature — not configured',
          attempts: (job.attempts || 0) + 1,
        });
        skipped++;
      }
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1;
      await storage.updateFollowupJob(job.id, {
        status: attempts >= (job.max_attempts || 3) ? 'failed' : 'pending',
        last_error: err.message,
        attempts,
      });
      errors.push(`Followup ${job.id}: ${err.message}`);
    }
  }

  return { processed, skipped, errors };
}
