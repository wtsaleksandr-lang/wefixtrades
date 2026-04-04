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

function buildHtml(body: string): string {
  const htmlBody = body.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">
    ${htmlBody}
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;
}

export async function processAuditFollowups(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const dueJobs = await storage.fetchDueAuditFollowups(20);
  if (dueJobs.length === 0) return { processed: 0, errors: [] };

  const mail = getTransporter();
  if (!mail) {
    return { processed: 0, errors: ["SMTP not configured"] };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.com";

  for (const job of dueJobs) {
    try {
      const payload = job.payload as any;
      const subject = payload?.subject || "Your WeFixTrades Audit Follow-up";
      const body = payload?.body || "";

      await mail.sendMail({
        from,
        to: job.email,
        subject,
        html: buildHtml(body),
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
