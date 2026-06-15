import { storage } from "../storage";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { buildUnsubscribeUrl } from "../lib/unsubscribeToken";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { sendAuditReportEmail } from "../lib/sendAuditReport";
import { createLogger } from "../lib/logger";

const log = createLogger("AuditFollowupWorker");

// P1-11: connection-class SMTP / network errors are transient — defer (keep
// the row pending, don't burn an attempt) rather than counting them toward
// max_attempts, which would permanently fail a row over a passing blip.
function isTransientSmtpError(err: any): boolean {
  const code = String(err?.code || "").toUpperCase();
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ESOCKET", "EAI_AGAIN", "EPIPE", "ECONNECTION", "ETIMEOUT", "EDNS"].includes(code)) {
    return true;
  }
  // Nodemailer surfaces transient SMTP failures (e.g. 421/451) with a numeric
  // responseCode in the 4xx range.
  const rc = Number(err?.responseCode);
  if (Number.isFinite(rc) && rc >= 400 && rc < 500) return true;
  return false;
}

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

  const mail = getEmailTransporter();
  if (!mail) {
    // P1-11 / P0-2: SMTP not configured is transient — do NOT claim rows (which
    // would flip them to 'processing' and strand them). Leave them pending so a
    // later tick with SMTP available retries them.
    return { processed: 0, errors: ["SMTP not configured"] };
  }

  // P1-11: atomically lease due rows (pending → processing, FOR UPDATE SKIP
  // LOCKED) so a second worker instance can't grab and double-send the same row.
  const dueJobs = await storage.claimDueAuditFollowups(20);
  if (dueJobs.length === 0) return { processed: 0, errors: [] };

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

      // P0-2: the Day-0 report email is enqueued as a durable step='day0' row
      // (kind='report') so a transient SMTP failure retries instead of losing
      // the report. Route it through sendAuditReportEmail (PDF attachment +
      // report template) rather than the plain follow-up text template.
      if (job.step === "day0" || payload?.kind === "report") {
        const reportId = payload?.reportId || job.audit_report_id;
        if (!reportId) {
          await storage.updateAuditFollowup(job.id, {
            status: "cancelled",
            last_error: "No reportId for day0 report email",
            processed_at: new Date(),
            attempts: (job.attempts || 0) + 1,
          });
          continue;
        }
        const origin = payload?.origin || process.env.APP_URL || "https://wefixtrades.com";
        const result = await sendAuditReportEmail({
          reportId,
          recipientEmail: job.email,
          origin,
        });
        if (result.ok) {
          await storage.updateAuditFollowup(job.id, {
            status: "sent",
            processed_at: new Date(),
            attempts: (job.attempts || 0) + 1,
          });
          processed++;
        } else {
          // Terminal {ok:false} (unsubscribed / report not found / no
          // transporter) — don't retry forever; mark and move on.
          await storage.updateAuditFollowup(job.id, {
            status: "cancelled",
            last_error: result.error || "report email not sent",
            processed_at: new Date(),
            attempts: (job.attempts || 0) + 1,
          });
        }
        continue;
      }

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
      // P1-11: connection-class SMTP errors are transient — defer (back to
      // pending, attempt NOT incremented) so a passing blip doesn't burn the
      // row's attempts toward a permanent 'failed'. Everything else counts.
      if (isTransientSmtpError(err)) {
        await storage.updateAuditFollowup(job.id, {
          status: "pending",
          last_error: `transient: ${err.message}`,
        });
        errors.push(`AuditFollowup ${job.id} (deferred): ${err.message}`);
        continue;
      }
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
