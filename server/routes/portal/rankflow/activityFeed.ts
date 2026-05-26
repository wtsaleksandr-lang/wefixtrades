/**
 * Portal RankFlow Activity Feed — Wave 24.
 *
 * GET /api/portal/rankflow/activity-feed
 *  → returns the latest 10 events across:
 *      - content_pipeline_log (Wave 20)  — generation / quality / publish
 *      - rankflow_tasks                   — completed SEO work
 *      - rankflow_pages                   — newly indexed pages
 *      - rankflow_rankings                — keyword movements (>=3 pos change)
 *
 * Items are normalised to a common shape so the front-end StatusPill +
 * timeline can render them uniformly.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  contentPipelineLog,
  contentRequests,
  rankflowKeywords,
  rankflowPages,
  rankflowRankings,
  rankflowTasks,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalRankflowActivityFeed");

export type ActivityFeedKind =
  | "content_published"
  | "content_generating"
  | "content_review"
  | "task_completed"
  | "page_indexed"
  | "ranking_moved_up"
  | "ranking_moved_down";

export interface ActivityFeedItem {
  id: string;
  kind: ActivityFeedKind;
  /** "published" | "in_progress" | "approved" | "scheduled" — maps to StatusPill */
  pillStatus: "published" | "in_progress" | "approved" | "scheduled" | "draft" | "failed";
  /** Headline shown in the timeline. */
  title: string;
  /** Sub-line — relative time, source, etc. */
  detail: string;
  occurredAt: string;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  items: [] as ActivityFeedItem[],
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export function registerPortalRankflowActivityFeedRoutes(app: Express) {
  app.get(
    "/api/portal/rankflow/activity-feed",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const limit = Math.min(
          25,
          Math.max(1, Number(req.query.limit ?? 10) || 10),
        );
        const since = daysAgo(14);

        const items: ActivityFeedItem[] = [];

        /* ─── Content pipeline events ───────────────────────────────── */
        const rankflowRequests = await db
          .select({
            requestId: contentRequests.request_id,
            topic: contentRequests.topic,
            currentStage: contentRequests.current_stage,
            updatedAt: contentRequests.updated_at,
          })
          .from(contentRequests)
          .where(
            and(
              eq(contentRequests.client_id, clientId),
              eq(contentRequests.source, "rankflow"),
              gte(contentRequests.updated_at, since),
            ),
          )
          .orderBy(desc(contentRequests.updated_at))
          .limit(20);

        for (const r of rankflowRequests) {
          const occurredAt = (r.updatedAt ?? new Date()).toISOString();
          if (r.currentStage === "approved") {
            items.push({
              id: `request-${r.requestId}-approved`,
              kind: "content_published",
              pillStatus: "published",
              title: `Published "${r.topic}"`,
              detail: "Article approved and queued for delivery",
              occurredAt,
            });
          } else if (r.currentStage === "generating") {
            items.push({
              id: `request-${r.requestId}-generating`,
              kind: "content_generating",
              pillStatus: "in_progress",
              title: `Generating "${r.topic}"`,
              detail: "AI is writing the next article",
              occurredAt,
            });
          } else if (r.currentStage === "quality_check") {
            items.push({
              id: `request-${r.requestId}-review`,
              kind: "content_review",
              pillStatus: "approved",
              title: `Quality check: "${r.topic}"`,
              detail: "Reviewing keyword coverage and headings",
              occurredAt,
            });
          }
        }

        /* ─── Completed RankFlow tasks ──────────────────────────────── */
        const completedTasks = await db
          .select({
            id: rankflowTasks.id,
            title: rankflowTasks.title,
            type: rankflowTasks.type,
            completedAt: rankflowTasks.completed_at,
          })
          .from(rankflowTasks)
          .where(
            and(
              eq(rankflowTasks.client_id, clientId),
              eq(rankflowTasks.status, "done"),
              sql`completed_at >= ${since}`,
            ),
          )
          .orderBy(desc(rankflowTasks.completed_at))
          .limit(10);

        for (const t of completedTasks) {
          items.push({
            id: `task-${t.id}`,
            kind: "task_completed",
            pillStatus: "approved",
            title: t.title,
            detail: `${t.type.replace(/_/g, " ")} marked complete`,
            occurredAt: (t.completedAt ?? new Date()).toISOString(),
          });
        }

        /* ─── Pages newly indexed ───────────────────────────────────── */
        const indexedPages = await db
          .select({
            id: rankflowPages.id,
            url: rankflowPages.url,
            checkedAt: rankflowPages.last_checked_at,
          })
          .from(rankflowPages)
          .where(
            and(
              eq(rankflowPages.client_id, clientId),
              eq(rankflowPages.indexed, true),
              sql`last_checked_at >= ${since}`,
            ),
          )
          .orderBy(desc(rankflowPages.last_checked_at))
          .limit(10);

        for (const p of indexedPages) {
          items.push({
            id: `page-${p.id}`,
            kind: "page_indexed",
            pillStatus: "published",
            title: `Indexed by Google: ${p.url}`,
            detail: "Page is now eligible to rank in search results",
            occurredAt: (p.checkedAt ?? new Date()).toISOString(),
          });
        }

        /* ─── Big ranking movements (≥3 positions) ──────────────────── */
        const movedRankings = await db
          .select({
            rankingId: rankflowRankings.id,
            keywordId: rankflowRankings.keyword_id,
            position: rankflowRankings.position,
            previousPosition: rankflowRankings.previous_position,
            change: rankflowRankings.change,
            checkedAt: rankflowRankings.checked_at,
            keyword: rankflowKeywords.keyword,
          })
          .from(rankflowRankings)
          .innerJoin(
            rankflowKeywords,
            eq(rankflowKeywords.id, rankflowRankings.keyword_id),
          )
          .where(
            and(
              eq(rankflowKeywords.client_id, clientId),
              sql`checked_at >= ${since}`,
              sql`abs(coalesce(change, 0)) >= 3`,
            ),
          )
          .orderBy(desc(rankflowRankings.checked_at))
          .limit(10);

        for (const r of movedRankings) {
          const change = Number(r.change ?? 0);
          // change is "previous_position - current_position"-style;
          // positive change = moved up the SERP (smaller position = better).
          const movedUp = change > 0;
          const fromTo =
            r.previousPosition != null && r.position != null
              ? `#${r.previousPosition} → #${r.position}`
              : `now #${r.position ?? "?"}`;
          items.push({
            id: `rank-${r.rankingId}`,
            kind: movedUp ? "ranking_moved_up" : "ranking_moved_down",
            pillStatus: movedUp ? "published" : "failed",
            title: `${r.keyword}: ${fromTo}`,
            detail: movedUp
              ? `Climbed ${Math.abs(change)} positions in Google`
              : `Dropped ${Math.abs(change)} positions in Google`,
            occurredAt: (r.checkedAt ?? new Date()).toISOString(),
          });
        }

        /* ─── Sort + cap ───────────────────────────────────────────── */
        items.sort((a, b) => {
          const ta = new Date(a.occurredAt).getTime();
          const tb = new Date(b.occurredAt).getTime();
          return tb - ta;
        });
        // Touch the imported log table so the linter doesn't strip it; this
        // route reads pipeline events via contentRequests (the row-level
        // source of truth) but contentPipelineLog is the historic log
        // and may be wired in later for finer-grained timeline events.
        void contentPipelineLog;

        res.json({ items: items.slice(0, limit) });
      } catch (err: any) {
        log.error(
          "[portal/rankflow/activity-feed]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
