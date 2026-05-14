/**
 * MapGuard monthly post fan-out scheduler.
 *
 * Runs on the 1st of each month. For every active MapGuard ongoing
 * subscriber (mapguard-basic / mapguard-pro), inserts N rows into
 * mapguard_posts with status='scheduled' where N = tier quota:
 *
 *   mapguard-basic → 2 posts/month
 *   mapguard-pro   → 4 posts/month
 *
 * Posts are spaced evenly through the month. The drainer
 * (mapguardPostDrainer.ts) picks them up when scheduled_for has passed.
 *
 * Idempotent per (client_service_id, quota_period): if rows already
 * exist for this period, the fan-out is skipped for that service.
 * This means a partially-completed fan-out won't double-up next run.
 *
 * Status mapping at fan-out time is governed by reachability:
 *   - GBP-connected client            → scheduled
 *   - No GBP connection / posting off → skipped (with reason in metadata)
 *
 * Posts marked 'skipped' do not consume a publish slot — the customer
 * sees these as "not posted this month, connect Google Business" in the
 * portal calendar.
 */
import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import { mapguardPosts, MAPGUARD_POST_THEMES } from "@shared/schemas/mapguardPosts";
import { clients, clientServices } from "@shared/schemas/adminCrm";
import { createLogger } from "../../lib/logger";

const log = createLogger("MapGuardPostScheduler");

/** Posts/month per ongoing MapGuard tier. */
const TIER_QUOTA: Record<string, number> = {
  "mapguard-basic": 2,
  "mapguard-pro": 4,
};

/** YYYY-MM key for a given date in UTC. */
function quotaPeriodKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Spread N timestamps evenly across the calendar month containing
 * `monthAnchor`. Each timestamp is at 14:00 UTC (mid-business-day in
 * North America — Google rate-limits don't care, but reviewers do).
 */
function evenlySpacedTimestamps(monthAnchor: Date, count: number): Date[] {
  const year = monthAnchor.getUTCFullYear();
  const month = monthAnchor.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Skip the 1st (today, when fan-out runs) and the last 2 days (avoid
  // a publish landing after a month-boundary edge case).
  const usableStart = 2;
  const usableEnd = daysInMonth - 2;
  const usableSpan = usableEnd - usableStart;
  const step = usableSpan / count;

  return Array.from({ length: count }, (_, i) => {
    const day = Math.round(usableStart + step * (i + 0.5));
    return new Date(Date.UTC(year, month, day, 14, 0, 0));
  });
}

/**
 * Pick a theme for the i-th post in a month. Rotates through the theme
 * list deterministically so consecutive months don't repeat the same
 * intro topic.
 */
function pickTheme(index: number, monthAnchor: Date): string {
  const offset = monthAnchor.getUTCMonth();
  return MAPGUARD_POST_THEMES[(index + offset) % MAPGUARD_POST_THEMES.length];
}

interface FanoutSummary {
  [key: string]: number;
  servicesConsidered: number;
  rowsCreated: number;
  rowsSkipped: number;
  servicesAlreadyScheduled: number;
  errors: number;
}

/**
 * Main entry point — wired into the 1st-of-month cron.
 *
 * `now` defaults to current time; tests can pass a specific date.
 */
export async function fanoutMonthlyPosts(now: Date = new Date()): Promise<FanoutSummary> {
  const summary: FanoutSummary = {
    servicesConsidered: 0,
    rowsCreated: 0,
    rowsSkipped: 0,
    servicesAlreadyScheduled: 0,
    errors: 0,
  };

  const quotaPeriod = quotaPeriodKey(now);

  // Pull every active ongoing-tier client_service. Each row represents
  // one customer's monthly subscription.
  const services = await db
    .select({
      id: clientServices.id,
      client_id: clientServices.client_id,
      service_id: clientServices.service_id,
    })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
        sql`${clientServices.service_id} IN ('mapguard-basic', 'mapguard-pro')`,
      ),
    );

  summary.servicesConsidered = services.length;

  for (const svc of services) {
    try {
      // Idempotency: skip if any row already exists for this
      // (client_service_id, quota_period). Prevents double-fanout if
      // the cron re-runs mid-month or two pods race.
      const [existing] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(mapguardPosts)
        .where(
          and(
            eq(mapguardPosts.client_service_id, svc.id),
            eq(mapguardPosts.quota_period, quotaPeriod),
          ),
        );

      if ((existing?.count ?? 0) > 0) {
        summary.servicesAlreadyScheduled += 1;
        continue;
      }

      const quota = TIER_QUOTA[svc.service_id] ?? 2;
      const timestamps = evenlySpacedTimestamps(now, quota);

      // Determine reachability — does this client have a working GBP
      // connection? The drainer needs it to actually publish; if not,
      // we still fan out as 'scheduled' so the portal calendar shows
      // intent, but the drainer will mark each one 'skipped' with a
      // clear reason at drain time. This means the customer's "you
      // haven't connected Google yet" nudge is visible per-post.
      const insertRows = timestamps.map((ts, i) => ({
        client_id: svc.client_id,
        client_service_id: svc.id,
        quota_period: quotaPeriod,
        status: "scheduled" as const,
        theme: pickTheme(i, now),
        scheduled_for: ts,
      }));

      await db.insert(mapguardPosts).values(insertRows);
      summary.rowsCreated += insertRows.length;
    } catch (err: any) {
      summary.errors += 1;
      log.error("Fan-out failed for service", {
        client_service_id: svc.id,
        client_id: svc.client_id,
        error: err.message,
      });
    }
  }

  log.info("Monthly MapGuard post fan-out complete", summary);
  return summary;
}
