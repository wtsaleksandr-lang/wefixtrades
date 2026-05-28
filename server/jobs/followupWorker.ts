import { storage } from "../storage";
import { isTwilioConfigured, checkRateLimit, sendSMS, sendSmsAsClient, storeSmsMessage } from "../twilioClient";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { buildUnsubscribeUrl } from "../lib/unsubscribeToken";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";

const log = createLogger("FollowupWorker");

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}

function buildFollowupHtml(body: string, businessName: string, discountCode?: string, discountValue?: string, unsubscribeUrl?: string): string {
  const htmlBody = body.replace(/\n/g, '<br/>');
  const discountSection = discountCode && discountValue
    ? `<tr><td style="padding:16px 28px;">
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
      <tr><td style="padding:16px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:600;">Special Offer Just For You</p>
        <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#78350f;letter-spacing:2px;">${discountCode}</p>
        <p style="margin:0;font-size:13px;color:#92400e;">Use this code to save <strong>${discountValue}</strong> on your project</p>
      </td></tr>
    </table>
  </td></tr>`
    : '';
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">
    ${htmlBody}
  </td></tr>
  ${discountSection}
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent on behalf of ${businessName}</p>
    ${unsubscribeUrl ? `<p style="font-size:11px;color:#9ca3af;margin:6px 0 0;"><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>` : ''}
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

  const mail = getEmailTransporter();

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

      // Skip remaining follow-ups if customer already replied
      if ((lead as any).replied_at) {
        await storage.updateFollowupJob(job.id, {
          status: 'cancelled',
          last_error: 'Lead already replied — sequence stopped',
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
        discount_code: '',
        discount_value: '',
      };

      if (job.type === 'last_call') {
        const reminders = calcSettings.followup?.reminders;
        if (reminders?.reminder_2_include_discount && reminders?.reminder_2_coupon_id) {
          const coupons: any[] = calcSettings.promotions?.coupons || [];
          const coupon = coupons.find((c: any) => c.id === reminders.reminder_2_coupon_id && c.active);
          if (coupon) {
            templateVars.discount_code = coupon.code;
            templateVars.discount_value = coupon.type === 'percentage'
              ? `${coupon.value}%`
              : `$${coupon.value}`;
          }
        }
      }

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

        // CAN-SPAM/CASL: skip if recipient has unsubscribed
        if (await isEmailUnsubscribed(lead.email)) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: 'Recipient unsubscribed',
            processed_at: new Date(),
          });
          log.info(`Skipping followup ${job.id} — recipient unsubscribed: ${lead.email}`);
          skipped++;
          continue;
        }

        const template = payload.template || {};
        const subject = replaceVariables(template.subject || '', templateVars);
        const body = replaceVariables(template.body || '', templateVars);
        const unsubscribeUrl = buildUnsubscribeUrl(lead.email);
        const html = buildFollowupHtml(body, templateVars.business_name, templateVars.discount_code || undefined, templateVars.discount_value || undefined, unsubscribeUrl);
        const from = getFromAddress();

        await mail.sendMail({
          from,
          to: lead.email,
          subject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        await storage.updateFollowupJob(job.id, {
          status: 'sent',
          processed_at: new Date(),
          attempts: (job.attempts || 0) + 1,
        });
        processed++;
      } else if (job.channel === 'sms' || job.channel === 'whatsapp') {
        const smsChannel = job.channel === 'whatsapp' ? 'whatsapp' : 'sms';

        if (!isTwilioConfigured()) {
          await storage.updateFollowupJob(job.id, {
            status: 'failed',
            last_error: 'Twilio not configured',
            attempts: (job.attempts || 0) + 1,
          });
          errors.push(`Followup ${job.id}: Twilio not configured`);
          continue;
        }

        if (!lead.sms_consent) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: 'No SMS consent',
            processed_at: new Date(),
          });
          skipped++;
          continue;
        }

        const rateCheck = await checkRateLimit(lead.id, job.calculator_id, smsChannel);
        if (!rateCheck.allowed) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: `Rate limit exceeded: ${rateCheck.reason}`,
            processed_at: new Date(),
          });
          skipped++;
          continue;
        }

        if (!lead.phone) {
          await storage.updateFollowupJob(job.id, {
            status: 'cancelled',
            last_error: 'No phone number',
            processed_at: new Date(),
          });
          skipped++;
          continue;
        }

        const smsTemplate = payload.template || {};
        const smsBody = replaceVariables(smsTemplate.sms || smsTemplate.body || '', templateVars);

        // Wave 77 — QuoteQuick follow-ups go to the homeowner lead. Resolve
        // the owning client via calculator.user_id → clients.user_id and
        // route through their per-tenant TradeLine number when one exists.
        // WhatsApp keeps the existing global path; per-tenant routing is
        // SMS-only for now (W-SMS-3 scope).
        let twilioSid: string;
        if (smsChannel === 'whatsapp') {
          twilioSid = await sendSMS(lead.phone, smsBody, smsChannel);
        } else {
          const ownerUserId = calculator?.user_id ?? null;
          let clientId: number | null = null;
          if (ownerUserId != null) {
            const [c] = await db
              .select({ id: clients.id })
              .from(clients)
              .where(eq(clients.user_id, ownerUserId))
              .limit(1);
            clientId = c?.id ?? null;
          }
          if (clientId != null) {
            // Wave 79 — quote follow-ups are reminder-class. Honor the
            // local quiet-hours window; the catch below treats the
            // resulting throw as a defer (worker re-runs hourly).
            twilioSid = await sendSmsAsClient({
              clientId,
              to: lead.phone,
              body: smsBody,
              channel: 'sms',
              quietHoursBypass: 'reminder',
            });
          } else {
            // Calculator has no linked client row (legacy / demo flows).
            // Fall back to the shared brand line — preserves prior behavior.
            twilioSid = await sendSMS(lead.phone, smsBody, smsChannel);
          }
        }

        await storeSmsMessage({
          lead_id: lead.id,
          calculator_id: job.calculator_id,
          direction: 'outbound',
          channel: smsChannel,
          body: smsBody,
          to_number: lead.phone,
          twilio_sid: twilioSid,
          is_ai: false,
        });

        await storage.updateFollowupJob(job.id, {
          status: 'sent',
          processed_at: new Date(),
          attempts: (job.attempts || 0) + 1,
        });
        processed++;
      }
    } catch (err: any) {
      // Wave 79 — quiet-hours block is a defer, not a failure. Keep the
      // job pending without burning an attempt; the worker re-runs hourly
      // and will pick it up when the local window reopens.
      if (err?.message === 'sms_quiet_hours_blocked') {
        await storage.updateFollowupJob(job.id, {
          status: 'pending',
          last_error: 'Deferred — recipient quiet hours',
        });
        skipped++;
        continue;
      }
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
