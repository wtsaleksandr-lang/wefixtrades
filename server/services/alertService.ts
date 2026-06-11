/**
 * Alert Service -- centralized alert system for critical platform issues.
 *
 * fireAlert() inserts into the systemAlerts table, sends an email to the
 * admin, and optionally POSTs to a Slack webhook. Deduplication prevents
 * the same (category + title) alert from firing more than once per hour.
 */

import { storage } from "../storage";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";
import { withTransientRetry, isTransientInfraError, describeError } from "../lib/transientInfraErrors";

const log = createLogger("AlertService");

const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/* In-memory dedupe fallback (Sentry triage 2026-06-11, NODEWEFIXTRADES-16):
 * fireAlert ran DB-dedupe → DB-insert → email → Slack in that order, so when
 * the DATABASE was the thing that was down (exactly when worker_failed
 * alerts fire), fireAlert died on the insert and the admin email was never
 * attempted — the alert channel failed precisely when it mattered. The DB
 * steps now retry through transient blips and, if they still fail, we fall
 * back to this process-local window so email + Slack go out anyway without
 * repeating every tick. Process-local is acceptable for the fallback: worst
 * case after a restart is one duplicate email, never a silent gap. */
const memoryDedupe = new Map<string, number>();

function memoryDeduped(key: string): boolean {
  const now = Date.now();
  // Opportunistic sweep so the map can't grow unbounded.
  if (memoryDedupe.size > 500) {
    for (const [k, ts] of memoryDedupe) {
      if (now - ts > DEDUPE_WINDOW_MS) memoryDedupe.delete(k);
    }
  }
  const last = memoryDedupe.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  memoryDedupe.set(key, now);
  return false;
}

interface AlertInput {
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire a system alert -- insert into DB, email admin, optional Slack.
 * Dedupes same (category + title) within 1 hour (DB window; in-memory
 * fallback when the DB is unreachable). Never throws -- catches all errors
 * and logs. Email + Slack are attempted even when the DB write fails.
 */
export async function fireAlert(alert: AlertInput): Promise<void> {
  try {
    const dedupeKey = `${alert.category}::${alert.title}`;
    let persisted = false;
    try {
      const recent = await withTransientRetry(
        () => storage.findRecentAlert(alert.category, alert.title, DEDUPE_WINDOW_MS),
        { attempts: 3, baseDelayMs: 250 },
      );
      if (recent) {
        log.debug(`Alert deduped: ${alert.category} / ${alert.title}`);
        return;
      }

      const row = await withTransientRetry(
        () =>
          storage.createSystemAlert({
            severity: alert.severity,
            category: alert.category,
            title: alert.title,
            details: alert.details ?? null,
            metadata: alert.metadata ?? null,
          }),
        { attempts: 3, baseDelayMs: 250 },
      );
      persisted = true;
      // Keep the memory window in sync so a DB blip right after this call
      // can't double-send the same alert through the fallback path.
      memoryDedupe.set(dedupeKey, Date.now());

      log.info(`Alert #${row.id} fired: [${alert.severity}] ${alert.category} -- ${alert.title}`);
    } catch (dbErr: any) {
      const detail = describeError(dbErr);
      if (isTransientInfraError(dbErr)) {
        log.warn("fireAlert DB write failed (transient) — delivering via email/Slack anyway", {
          category: alert.category,
          title: alert.title,
          ...detail,
        });
      } else {
        log.error("fireAlert DB write failed — delivering via email/Slack anyway", {
          category: alert.category,
          title: alert.title,
          ...detail,
          err: dbErr,
        });
      }
      if (memoryDeduped(dedupeKey)) {
        log.debug(`Alert deduped (memory fallback): ${dedupeKey}`);
        return;
      }
    }

    // Send email to admin (one transient retry — SMTP blips ride along with
    // infra incidents, which is exactly when these emails matter most).
    try {
      const transporter = getEmailTransporter();
      if (transporter) {
        const recipientEmail = process.env.ADMIN_EMAIL || process.env.SMTP_FROM;
        if (recipientEmail) {
          const severityColor = alert.severity === "critical" ? "#EF4444" : alert.severity === "warning" ? "#F59E0B" : "#3B82F6";
          await withTransientRetry(() => transporter.sendMail({
            from: `WeFixTrades Alerts <${getFromAddress()}>`,
            to: recipientEmail,
            subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:${severityColor};color:white;padding:12px 16px;border-radius:8px 8px 0 0;"><strong>[${alert.severity.toUpperCase()}]</strong> ${escapeHtml(alert.category)}</div><div style="border:1px solid #e5e7eb;border-top:none;padding:16px;border-radius:0 0 8px 8px;"><h3 style="margin:0 0 8px;">${escapeHtml(alert.title)}</h3>${alert.details ? `<p style="color:#6b7280;margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(alert.details)}</p>` : ""}<p style="font-size:12px;color:#9ca3af;margin:0;">Fired at ${new Date().toISOString()}</p></div></div>`,
            text: `[${alert.severity.toUpperCase()}] ${alert.title}\nCategory: ${alert.category}\n${alert.details ? `Details: ${alert.details}\n` : ""}Fired at: ${new Date().toISOString()}`,
          }), { attempts: 2, baseDelayMs: 500 });
        } else {
          // Config gap, not a runtime fault: alert emails need ADMIN_EMAIL
          // (or SMTP_FROM as fallback) to be set.
          log.warn("alert email skipped — no ADMIN_EMAIL / SMTP_FROM configured");
        }
      }
    } catch (emailErr: any) {
      const detail = describeError(emailErr);
      if (isTransientInfraError(emailErr)) {
        log.warn("sendAlertEmail failed after retry (transient, non-fatal)", { ...detail });
      } else {
        log.error("sendAlertEmail failed (non-fatal)", { ...detail, err: emailErr });
      }
    }

    // Slack webhook (if configured)
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        const severityEmoji = alert.severity === "critical" ? ":rotating_light:" : alert.severity === "warning" ? ":warning:" : ":information_source:";
        const text = `${severityEmoji} *[${alert.severity.toUpperCase()}]* ${alert.title}\n_Category:_ ${alert.category}${alert.details ? `\n${alert.details}` : ""}`;
        await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      }
    } catch (slackErr: any) {
      const detail = describeError(slackErr);
      if (isTransientInfraError(slackErr)) {
        log.warn("sendSlackAlert failed (transient, non-fatal)", { ...detail });
      } else {
        log.error("sendSlackAlert failed (non-fatal)", { ...detail, err: slackErr });
      }
    }
  } catch (err: any) {
    // Belt-and-braces: with the channel-level catches above this should be
    // unreachable, but fireAlert's contract is "never throws".
    log.error("fireAlert failed (non-fatal)", {
      ...describeError(err),
      err,
      category: alert.category,
      title: alert.title,
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
