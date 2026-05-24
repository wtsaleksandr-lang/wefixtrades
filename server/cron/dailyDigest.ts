/**
 * Daily monitoring digest cron.
 *
 * Schedule: 08:13 UTC daily (= 04:13 AM Toronto / EDT). Off-minute so it
 * doesn't pile on top of the on-the-hour crons. Registered from
 * server/jobs/scheduler.ts.
 *
 * Flow:
 *   1. Build the digest (parallel fetch of GSC, Bing, GA4, healthz,
 *      activity counts — each fault-tolerant per-source).
 *   2. Render HTML + text bodies with brand tokens inline.
 *   3. Send via the existing nodemailer transporter if SMTP is wired.
 *      Otherwise, write the HTML to a local file (`/tmp/digest-<date>.html`
 *      or `os.tmpdir()/digest-<date>.html` on Windows) and log the path.
 *
 * Recipient resolution order:
 *   1. process.env.ALEX_EMAIL
 *   2. process.env.ADMIN_EMAIL
 *   3. process.env.SMTP_FROM
 *   4. Hardcoded fallback `alex@wefixtrades.com` — never silently drops.
 *
 * The cron is single-shot per day; idempotency is not enforced because a
 * second send on the same UTC day is acceptable (rare double-fire would
 * just double-email Alex with identical content).
 */

import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildDigest } from "../lib/digest/buildDigest";
import { renderDigestEmail } from "../lib/digest/renderEmail";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";

const log = createLogger("DailyDigestCron");

const FALLBACK_RECIPIENT = "alex@wefixtrades.com";

function resolveRecipient(): string {
  return (
    process.env.ALEX_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.SMTP_FROM ||
    FALLBACK_RECIPIENT
  );
}

export interface DailyDigestResult {
  sent: boolean;
  delivery: "smtp" | "file" | "skipped";
  recipient?: string;
  filePath?: string;
  date: string;
  actionItems: number;
}

/**
 * Run one tick of the daily digest. Exported so an admin "Send now" button
 * (future) or a one-off `tsx server/cron/dailyDigest.ts` script can trigger
 * it manually.
 */
export async function runDailyDigest(now = new Date()): Promise<DailyDigestResult> {
  const digest = await buildDigest(now);
  const rendered = renderDigestEmail(digest);
  const recipient = resolveRecipient();

  const transporter = getEmailTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: getFromAddress(),
        to: recipient,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      log.info("daily digest sent via SMTP", {
        recipient,
        date: digest.yesterday.label,
        actionItems: digest.actionItems.length,
      });
      return {
        sent: true,
        delivery: "smtp",
        recipient,
        date: digest.yesterday.label,
        actionItems: digest.actionItems.length,
      };
    } catch (err) {
      log.warn("SMTP send failed — falling back to file output", {
        err: err instanceof Error ? err.message : String(err),
      });
      // fall through to file fallback
    }
  } else {
    log.info("SMTP transporter not configured — using file fallback");
  }

  const filePath = join(tmpdir(), `digest-${digest.yesterday.label}.html`);
  try {
    await fs.writeFile(filePath, rendered.html, "utf8");
    log.info("daily digest written to file", {
      path: filePath,
      date: digest.yesterday.label,
      actionItems: digest.actionItems.length,
    });
    return {
      sent: false,
      delivery: "file",
      filePath,
      date: digest.yesterday.label,
      actionItems: digest.actionItems.length,
    };
  } catch (err) {
    log.error("file fallback failed — digest dropped", {
      err: err instanceof Error ? err.message : String(err),
      path: filePath,
    });
    return {
      sent: false,
      delivery: "skipped",
      date: digest.yesterday.label,
      actionItems: digest.actionItems.length,
    };
  }
}
