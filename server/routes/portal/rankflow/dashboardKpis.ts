/**
 * Portal RankFlow Dashboard KPIs — Wave 24.
 *
 * GET /api/portal/rankflow/dashboard-kpis
 *
 * Returns the inputs the customer-facing RankFlow dashboard needs in one
 * round trip:
 *  - pipeline stage counts (Queued / Generating / Review / Published / Tracking)
 *  - aggregate site-wide SEO score (0..100, derived from the rankflow_signals
 *    summary — keywords_top_10 / keywords_top_20 / pages_indexed coverage)
 *  - quick numeric KPIs (keywords tracked, top-10 count, avg position, pages
 *    indexed) for the animated counter row + semi-circular gauge
 *
 * Tier-aware: stage definitions are identical across tiers, only the empty
 * preview shape changes (none — counts default to 0).
 *
 * Auth: requireClient. adminPreviewSafe-wrapped so admin preview returns
 * `{previewMode:true, …zeros}` instead of 403.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  contentRequests,
  rankflowKeywords,
  rankflowPages,
  rankflowSignals,
  rankflowTasks,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalRankflowDashboardKpis");

/* ─── Pipeline stages: 5-stage RankFlow lifecycle ────────────────────── */

const EMPTY_PIPELINE = {
  queued: 0,
  generating: 0,
  review: 0,
  published: 0,
  tracking: 0,
};

const EMPTY_KPIS = {
  keywordsTracked: 0,
  keywordsTop10: 0,
  keywordsTop20: 0,
  keywordsImproved: 0,
  avgPosition: 0,
  pagesIndexed: 0,
  pagesTotal: 0,
  seoScore: 0,
  previousSeoScore: 0,
};

const EMPTY_DASHBOARD_RESPONSE = {
  previewMode: true,
  kpis: EMPTY_KPIS,
  pipeline: EMPTY_PIPELINE,
};

function startOfThisMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

/**
 * Compute an aggregate 0..100 site-wide SEO score from rankflow_signals.
 *
 * Three sub-scores blended with simple weights:
 *  - top10 coverage  = keywords_top_10 / total          (0..1, weight 0.55)
 *  - top20 coverage  = keywords_top_20 / total          (0..1, weight 0.20)
 *  - indexing rate   = pages_indexed / pages_total      (0..1, weight 0.25)
 *
 * If `total` is 0 (no keywords yet) we return 0 so the gauge shows empty
 * rather than NaN.
 */
function computeSeoScore(input: {
  total: number;
  top10: number;
  top20: number;
  pagesIndexed: number;
  pagesTotal: number;
}): number {
  const { total, top10, top20, pagesIndexed, pagesTotal } = input;
  if (total <= 0) return 0;
  const top10Ratio = Math.min(1, top10 / total);
  const top20Ratio = Math.min(1, top20 / total);
  const indexRatio = pagesTotal > 0 ? Math.min(1, pagesIndexed / pagesTotal) : 0;
  const blended = top10Ratio * 0.55 + top20Ratio * 0.2 + indexRatio * 0.25;
  return Math.round(blended * 100);
}

export function registerPortalRankflowDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/rankflow/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_DASHBOARD_RESPONSE,
        });
        if (clientId === null) return;

        /* ─── Pipeline stage counts ──────────────────────────────────────
           Stages derive from two sources:
             1. content_requests source=rankflow → Queued/Generating/Review
             2. rankflow_pages.indexed=true → Published (page on Google)
             3. rankflow_keywords (active tracking) → Tracking
        */
        const requestStageRows = await db
          .select({
            stage: contentRequests.current_stage,
            n: sql<number>`count(*)::int`,
          })
          .from(contentRequests)
          .where(
            and(
              eq(contentRequests.client_id, clientId),
              eq(contentRequests.source, "rankflow"),
            ),
          )
          .groupBy(contentRequests.current_stage);

        const pipeline = { ...EMPTY_PIPELINE };
        for (const row of requestStageRows) {
          const s = row.stage as string;
          const n = Number(row.n) || 0;
          if (s === "requested") pipeline.queued += n;
          else if (s === "generating") pipeline.generating += n;
          else if (s === "quality_check") pipeline.review += n;
          else if (s === "approved") pipeline.published += n;
          else if (s === "failed") pipeline.review += n; // surface failures into review for action
        }

        // Pages indexed → "Published" count (already-live pages)
        const pagesRows = await db
          .select({
            indexed: sql<number>`count(*) filter (where indexed = true)::int`,
            total: sql<number>`count(*)::int`,
          })
          .from(rankflowPages)
          .where(eq(rankflowPages.client_id, clientId));
        const pagesIndexed = Number(pagesRows[0]?.indexed ?? 0);
        const pagesTotal = Number(pagesRows[0]?.total ?? 0);
        pipeline.published = Math.max(pipeline.published, pagesIndexed);

        // Tracking = active keywords being monitored
        const trackingRows = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(rankflowKeywords)
          .where(eq(rankflowKeywords.client_id, clientId));
        pipeline.tracking = Number(trackingRows[0]?.n ?? 0);

        /* ─── Signal summary (keyword + position aggregates) ─────────── */
        const [signals] = await db
          .select()
          .from(rankflowSignals)
          .where(eq(rankflowSignals.client_id, clientId))
          .limit(1);

        const keywordsTracked = Number(signals?.total_keywords ?? pipeline.tracking ?? 0);
        const keywordsTop10 = Number(signals?.keywords_top_10 ?? 0);
        const keywordsTop20 = Number(signals?.keywords_top_20 ?? 0);
        const keywordsImproved = Number(signals?.keywords_improved ?? 0);
        const avgPositionRaw = signals?.avg_position;
        const avgPosition =
          avgPositionRaw == null ? 0 : Math.round(Number(avgPositionRaw) * 10) / 10;

        const seoScore = computeSeoScore({
          total: keywordsTracked,
          top10: keywordsTop10,
          top20: keywordsTop20,
          pagesIndexed,
          pagesTotal,
        });

        // Previous score: approximate by counting rankflow tasks that
        // completed *before* the start of this month as a stand-in for
        // "where you were before this month's work". This keeps the delta
        // arrow live without a new tracking-history column.
        const monthStart = startOfThisMonth();
        const since30 = thirtyDaysAgo();
        void since30;
        const completedBeforeMonth = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(rankflowTasks)
          .where(
            and(
              eq(rankflowTasks.client_id, clientId),
              sql`completed_at < ${monthStart}`,
            ),
          );
        // Crude previous-score estimate: scale seoScore by ratio of completed
        // tasks before the month to current. If unknown, leave equal to score.
        const completedRows = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(rankflowTasks)
          .where(
            and(
              eq(rankflowTasks.client_id, clientId),
              sql`completed_at is not null`,
            ),
          );
        const totalCompleted = Number(completedRows[0]?.n ?? 0);
        const beforeCount = Number(completedBeforeMonth[0]?.n ?? 0);
        const previousSeoScore =
          totalCompleted > 0
            ? Math.round((beforeCount / totalCompleted) * seoScore)
            : seoScore;

        res.json({
          kpis: {
            keywordsTracked,
            keywordsTop10,
            keywordsTop20,
            keywordsImproved,
            avgPosition,
            pagesIndexed,
            pagesTotal,
            seoScore,
            previousSeoScore,
          },
          pipeline,
        });
      } catch (err: any) {
        log.error("[portal/rankflow/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
