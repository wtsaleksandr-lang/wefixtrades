/**
 * Rankflux Alert Worker — Wave 6B.
 *
 * Daily cron that drives email alerts off the public MozCast feed for
 * /tools/local-rankflux subscribers. Three dispatch lanes:
 *
 *   - urgent  → fires whenever today's MozCast score is HIGH (≥ 8.0)
 *               and we haven't sent an urgent alert to this subscriber
 *               in the past 24h. Idempotent via last_urgent_sent_at.
 *
 *   - daily   → digest of yesterday's score + 7-day mini chart, fired
 *               once per UTC day to subscribers with daily=true.
 *               Idempotent via last_daily_sent_at (date-only compare).
 *
 *   - weekly  → 7-day rollup, fired Mondays only to subscribers with
 *               weekly=true. Idempotent via last_weekly_sent_at (ISO
 *               week compare).
 *
 * Email dispatch goes through queueEmail() so unsubscribes + per-tick
 * rate limits land in the existing queue path. No SMS — this is a
 * lightweight, opt-in marketing surface.
 */
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { queueEmail } from "../services/emailQueueService";
import { fetchAlgoTemperature, type MozBand, type MozCastDay } from "../routes/freeToolsRoutes";

const log = createLogger("rankflux-alert");

interface SubscriberRow extends Record<string, unknown> {
  id: number;
  email: string;
  daily: boolean;
  weekly: boolean;
  urgent: boolean;
  last_daily_sent_at: Date | null;
  last_weekly_sent_at: Date | null;
  last_urgent_sent_at: Date | null;
  unsubscribed_at: Date | null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeek(d: Date): string {
  // YYYY-Www string for once-per-ISO-week dedupe.
  const t = new Date(d.getTime());
  t.setUTCHours(0, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function bandColor(band: MozBand): string {
  // rgb() form per PR #814 color-guard rules.
  if (band === "HIGH") return "rgb(239,68,68)";
  if (band === "MEDIUM") return "rgb(245,158,11)";
  return "rgb(34,197,94)";
}

function renderMiniChart(days: MozCastDay[]): string {
  const bars = days.map((d) => {
    const h = Math.max(8, Math.min(100, d.scorePct));
    const color = bandColor(d.band);
    return `<td style="vertical-align:bottom;padding:0 2px;text-align:center;">
      <div style="height:90px;display:flex;align-items:flex-end;justify-content:center;">
        <div style="width:18px;height:${h}%;background:${color};border-radius:4px;"></div>
      </div>
      <div style="font-size:10px;color:rgba(0,0,0,0.55);padding-top:4px;">${d.date.slice(5)}</div>
      <div style="font-size:11px;color:rgb(17,24,39);font-weight:600;">${d.score.toFixed(1)}</div>
    </td>`;
  }).join("");
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0;"><tr>${bars}</tr></table>`;
}

function renderEmail(today: MozCastDay, days: MozCastDay[], headline: string): string {
  const color = bandColor(today.band);
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:rgb(17,24,39);max-width:560px;">
      <h2 style="margin:0 0 4px;font-size:18px;">${headline}</h2>
      <p style="margin:0 0 12px;color:rgba(0,0,0,0.65);font-size:14px;">
        MozCast — the industry-standard Google algorithm volatility index.
      </p>
      <div style="display:inline-block;padding:10px 18px;border-radius:14px;background:rgba(0,0,0,0.04);border:1px solid ${color};margin-bottom:10px;">
        <span style="font-size:32px;font-weight:900;color:${color};">${today.score.toFixed(1)}</span>
        <span style="font-size:14px;color:rgba(0,0,0,0.65);margin-left:8px;">/ 10 · ${today.band}</span>
      </div>
      ${renderMiniChart(days)}
      <p style="font-size:13px;color:rgba(0,0,0,0.7);line-height:1.55;margin:14px 0 0;">
        Want this volatility data fed back into per-keyword recheck triggers for your business?
        <a href="https://wefixtrades.com/products/mapguard" style="color:rgb(13,60,252);text-decoration:underline;">MapGuard</a> uses the same MozCast signal to time daily rank rechecks.
      </p>
      <p style="font-size:12px;color:rgba(0,0,0,0.45);margin-top:18px;">
        You're getting this because you subscribed at <a href="https://wefixtrades.com/tools/local-rankflux" style="color:rgba(0,0,0,0.55);">wefixtrades.com/tools/local-rankflux</a>.
      </p>
    </div>
  `;
}

export async function runRankfluxAlertTick(): Promise<{ urgentSent: number; dailySent: number; weeklySent: number; skipped: number }> {
  // Wave 17: skip the tick when the upstream MozCast HTML scrape is
  // unavailable. We don't want to false-positive an "URGENT spike" email
  // on missing-data days, and we don't want a fallback Semrush iframe
  // value driving alert thresholds (the iframe is a visual fallback only,
  // we don't read a numeric score out of it).
  const { days, source } = await fetchAlgoTemperature();
  if (source === "semrush-embed" || source === "unavailable" || !days || days.length === 0) {
    log.info("rankflux_alert skipped — no MozCast data", { source });
    return { urgentSent: 0, dailySent: 0, weeklySent: 0, skipped: 0 };
  }
  const today = days[days.length - 1];
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const todayIso = isoDay(now);
  const thisWeek = isoWeek(now);

  // One query — fetch all live subscribers. Volume is expected to be in
  // the hundreds at launch, so a single in-memory pass is fine. We hand
  // off to queueEmail (which respects email_unsubscribes at drain time)
  // for actual send hygiene.
  const result = await db.execute<SubscriberRow>(sql`
    SELECT id, email, daily, weekly, urgent,
           last_daily_sent_at, last_weekly_sent_at, last_urgent_sent_at,
           unsubscribed_at
    FROM rankflux_subscriptions
    WHERE unsubscribed_at IS NULL
  `);
  const rows: SubscriberRow[] = (result as any).rows || [];

  let urgentSent = 0;
  let dailySent = 0;
  let weeklySent = 0;
  let skipped = 0;

  for (const row of rows) {
    let fired = false;

    // Urgent lane (only on HIGH days; once per UTC day per subscriber).
    if (row.urgent && today.band === "HIGH") {
      const last = row.last_urgent_sent_at ? isoDay(new Date(row.last_urgent_sent_at)) : null;
      if (last !== todayIso) {
        try {
          await queueEmail(
            row.email,
            `URGENT — Google local volatility spike (${today.score.toFixed(1)}/10)`,
            renderEmail(today, days, "URGENT — Google local volatility is HIGH today"),
            undefined,
            { category: "marketing", source: "rankflux_alert_urgent" },
          );
          await db.execute(sql`
            UPDATE rankflux_subscriptions SET last_urgent_sent_at = now() WHERE id = ${row.id}
          `);
          urgentSent++;
          fired = true;
        } catch (err: any) {
          log.warn("rankflux_alert urgent send failed", { id: row.id, error: err?.message });
        }
      }
    }

    // Daily lane.
    if (!fired && row.daily) {
      const last = row.last_daily_sent_at ? isoDay(new Date(row.last_daily_sent_at)) : null;
      if (last !== todayIso) {
        try {
          await queueEmail(
            row.email,
            `Today's MozCast: ${today.score.toFixed(1)}/10 (${today.band})`,
            renderEmail(today, days, "Today's Google local volatility"),
            undefined,
            { category: "marketing", source: "rankflux_alert_daily" },
          );
          await db.execute(sql`
            UPDATE rankflux_subscriptions SET last_daily_sent_at = now() WHERE id = ${row.id}
          `);
          dailySent++;
          fired = true;
        } catch (err: any) {
          log.warn("rankflux_alert daily send failed", { id: row.id, error: err?.message });
        }
      }
    }

    // Weekly lane (Mondays only).
    if (!fired && row.weekly && isMonday) {
      const last = row.last_weekly_sent_at ? isoWeek(new Date(row.last_weekly_sent_at)) : null;
      if (last !== thisWeek) {
        try {
          await queueEmail(
            row.email,
            `Last week's MozCast volatility`,
            renderEmail(today, days, "Last week's Google local volatility"),
            undefined,
            { category: "marketing", source: "rankflux_alert_weekly" },
          );
          await db.execute(sql`
            UPDATE rankflux_subscriptions SET last_weekly_sent_at = now() WHERE id = ${row.id}
          `);
          weeklySent++;
          fired = true;
        } catch (err: any) {
          log.warn("rankflux_alert weekly send failed", { id: row.id, error: err?.message });
        }
      }
    }

    if (!fired) skipped++;
  }

  log.info("rankflux_alert tick done", { urgentSent, dailySent, weeklySent, skipped });
  return { urgentSent, dailySent, weeklySent, skipped };
}
