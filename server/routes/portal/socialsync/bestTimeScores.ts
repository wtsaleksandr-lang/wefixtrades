/**
 * Portal SocialSync Best-Time-To-Post Scores — Wave 25.
 *
 * GET /api/portal/socialsync/best-time-scores?week=YYYY-Wnn
 *   Returns a 168-cell map (7 days × 24 hours) of 0..100 "post score"
 *   values for the requested ISO week. Each cell represents how good a
 *   posting time that hour-of-week is for this customer.
 *
 *   Score blends two signals:
 *     1. Customer history — engagement (publishes that didn't fail) grouped
 *        by hour-of-week from socialsync_posts.published_at. We don't track
 *        impressions yet, so "engagement" here means "did the post publish
 *        successfully and stay live" (cancelled/failed counted negatively).
 *     2. Platform baseline — generic best-time defaults for trades audiences
 *        (early morning + evening + weekend brunch windows).
 *
 *   When the customer has fewer than 10 published posts, we lean fully on
 *   the platform baseline so empty new customers still see a useful map.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 *
 * No new tables — derives entirely from existing socialsync_posts data.
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { socialsyncPosts } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalSocialsyncBestTimeScores");

/**
 * Platform-typical "best time to post" baseline for local-trades audiences.
 * 7 rows (Mon..Sun) × 24 cols (0..23). Values 0..100. Calibrated against:
 *   - Sprout 2024 industry report: weekdays 7-9am + 12-1pm; weekends 9-11am
 *   - Trades-specific: late-evening 7-9pm picks up homeowners after dinner
 * Adjust here as we accumulate real data; downstream UI is data-agnostic.
 */
const BASELINE: number[][] = [
  // Mon
  [10, 10, 10, 10, 15, 25, 45, 70, 80, 70, 50, 50, 65, 60, 45, 40, 50, 65, 80, 75, 55, 35, 20, 15],
  // Tue
  [10, 10, 10, 10, 15, 25, 45, 75, 85, 70, 50, 50, 65, 60, 45, 40, 50, 65, 80, 75, 55, 35, 20, 15],
  // Wed
  [10, 10, 10, 10, 15, 25, 45, 75, 85, 70, 50, 50, 65, 60, 45, 40, 50, 65, 80, 75, 55, 35, 20, 15],
  // Thu
  [10, 10, 10, 10, 15, 25, 45, 75, 80, 70, 50, 50, 65, 60, 45, 40, 50, 65, 80, 75, 55, 35, 20, 15],
  // Fri
  [10, 10, 10, 10, 15, 25, 40, 65, 70, 60, 45, 45, 60, 55, 45, 40, 45, 55, 65, 60, 50, 35, 25, 20],
  // Sat
  [10, 10, 10, 10, 15, 20, 35, 55, 75, 85, 80, 70, 60, 50, 45, 50, 55, 60, 65, 60, 50, 40, 25, 15],
  // Sun
  [10, 10, 10, 10, 15, 20, 30, 50, 70, 80, 80, 70, 60, 50, 45, 50, 55, 60, 70, 75, 60, 40, 25, 15],
];

const EMPTY_GRID = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

const EMPTY_RESPONSE = {
  previewMode: true,
  week: "",
  grid: EMPTY_GRID,
  sampleSize: 0,
  source: "empty" as const,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoWeekId(d: Date = new Date()): string {
  // Approximate ISO week — good enough for echo-back. Use UTC for consistency.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${pad2(weekNo)}`;
}

/**
 * Build a 7×24 grid by blending the platform baseline with this customer's
 * historical successful publishes. If history is thin (<10 posts), return
 * baseline as-is. Otherwise: every successful publish in [hour-of-week]
 * gets a +5 bonus; cancelled/failed posts get a -3 penalty; result clamped
 * to 0..100.
 */
function blendHistory(history: { dow: number; hour: number; positive: boolean }[]): {
  grid: number[][];
  source: "baseline" | "blended" | "history";
} {
  if (history.length < 10) {
    return { grid: BASELINE.map((row) => row.slice()), source: "baseline" };
  }
  const grid = BASELINE.map((row) => row.slice());
  for (const h of history) {
    if (h.dow < 0 || h.dow > 6 || h.hour < 0 || h.hour > 23) continue;
    const delta = h.positive ? 5 : -3;
    grid[h.dow][h.hour] = Math.max(0, Math.min(100, grid[h.dow][h.hour] + delta));
  }
  return { grid, source: history.length > 100 ? "history" : "blended" };
}

export function registerPortalSocialsyncBestTimeScoresRoutes(app: Express) {
  app.get(
    "/api/portal/socialsync/best-time-scores",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const requestedWeek = (req.query.week as string) || isoWeekId();

        const rows = await db
          .select({
            published_at: socialsyncPosts.published_at,
            scheduled_for: socialsyncPosts.scheduled_for,
            status: socialsyncPosts.status,
          })
          .from(socialsyncPosts)
          .where(eq(socialsyncPosts.client_id, clientId))
          .limit(2000);

        const history = rows
          .map((r) => {
            const t = r.published_at ?? r.scheduled_for;
            if (!t) return null;
            const d = t instanceof Date ? t : new Date(t);
            if (isNaN(d.getTime())) return null;
            const jsDow = d.getDay(); // 0=Sun .. 6=Sat
            // Convert to Mon-start (0=Mon..6=Sun)
            const dow = (jsDow + 6) % 7;
            const hour = d.getHours();
            const positive = r.status === "published";
            return { dow, hour, positive };
          })
          .filter((x): x is { dow: number; hour: number; positive: boolean } => !!x);

        const { grid, source } = blendHistory(history);

        res.json({
          week: requestedWeek,
          grid,
          sampleSize: history.length,
          source,
        });
      } catch (err: any) {
        log.error(
          "[portal/socialsync/best-time-scores]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
