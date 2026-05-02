import { storage } from "../storage";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { buildUnsubscribeUrl } from "../lib/unsubscribeToken";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";

const log = createLogger("AuditFollowupWorker");

function buildHtml(body: string, unsubscribeUrl?: string): string {
  const htmlBody = body.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">
    ${htmlBody}
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by WeFixTrades</p>
    ${unsubscribeUrl ? `<p style="font-size:11px;color:#9ca3af;margin:6px 0 0;"><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>` : ''}
  </td></tr>
</table>
</body></html>`;
}

export async function processAuditFollowups(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const dueJobs = await storage.fetchDueAuditFollowups(20);
  if (dueJobs.length === 0) return { processed: 0, errors: [] };

  const mail = getEmailTransporter();
  if (!mail) {
    return { processed: 0, errors: ["SMTP not configured"] };
  }

  const from = getFromAddress();

  for (const job of dueJobs) {
    try {
      // CAN-SPAM/CASL: skip if recipient has unsubscribed
      if (await isEmailUnsubscribed(job.email)) {
        await storage.updateAuditFollowup(job.id, {
          status: "cancelled",
          last_error: "Recipient unsubscribed",
          processed_at: new Date(),
          attempts: (job.attempts || 0) + 1,
        });
        log.info(`Skipping audit followup ${job.id} — recipient unsubscribed: ${job.email}`);
        continue;
      }

      const payload = job.payload as any;
      const subject = payload?.subject || "Your WeFixTrades Audit Follow-up";
      const body = payload?.body || "";
      const unsubscribeUrl = buildUnsubscribeUrl(job.email);

      await mail.sendMail({
        from,
        to: job.email,
        subject,
        html: buildHtml(body, unsubscribeUrl),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await storage.updateAuditFollowup(job.id, {
        status: "sent",
        processed_at: new Date(),
        attempts: (job.attempts || 0) + 1,
      });
      processed++;
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1;
      await storage.updateAuditFollowup(job.id, {
        status: attempts >= (job.max_attempts || 3) ? "failed" : "pending",
        last_error: err.message,
        attempts,
      });
      errors.push(`AuditFollowup ${job.id}: ${err.message}`);
    }
  }

  return { processed, errors };
}
