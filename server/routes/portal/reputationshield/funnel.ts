/**
 * Portal ReputationShield Request Funnel — Wave 28.
 *
 * GET /api/portal/reputationshield/funnel?window=30
 *
 * Returns conversion at each stage of the review-request funnel within a
 * 7/30/90-day window:
 *   sent → opened (clicked_at not null) → clicked → posted (attributed_review_id)
 *
 * The existing review_requests table doesn't have a separate "opened" flag
 * (no email-open pixel wired yet), so we honestly omit that stage and
 * collapse the funnel into 3 steps: Sent → Clicked → Posted.
 * (Anti-pattern reminder per spec: "Don't fake review-request conversion
 * data if no email-tracking hooks exist.")
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { reviewRequests } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalReputationshieldFunnel");

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  pctOfPrevious: number;
}

interface FunnelResponse {
  previewMode?: boolean;
  windowDays: number;
  stages: FunnelStage[];
  /** Indicates open-tracking is not yet wired; the UI may surface a footnote. */
  hasOpenTracking: false;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  windowDays: 30,
  stages: [
    { key: "sent", label: "Sent", count: 0, pctOfPrevious: 100 },
    { key: "clicked", label: "Clicked", count: 0, pctOfPrevious: 0 },
    { key: "posted", label: "Posted", count: 0, pctOfPrevious: 0 },
  ],
  hasOpenTracking: false,
};

function parseWindow(raw: unknown): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export function registerPortalReputationshieldFunnelRoutes(app: Express) {
  app.get(
    "/api/portal/reputationshield/funnel",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const windowDays = parseWindow(req.query.window);
        const since = new Date(Date.now() - windowDays * 86_400_000);

        // Single grouped query — count by funnel stage.
        const [row] = await db
          .select({
            sent: sql<number>`count(*) filter (where ${reviewRequests.status} in ('sent','delivered'))::int`,
            clicked: sql<number>`count(*) filter (where ${reviewRequests.clicked_at} is not null)::int`,
            posted: sql<number>`count(*) filter (where ${reviewRequests.attributed_review_id} is not null)::int`,
          })
          .from(reviewRequests)
          .where(
            and(
              eq(reviewRequests.client_id, clientId),
              gte(reviewRequests.created_at, since),
            ),
          );

        const sent = Number(row?.sent ?? 0);
        const clicked = Number(row?.clicked ?? 0);
        const posted = Number(row?.posted ?? 0);

        const stages: FunnelStage[] = [
          { key: "sent", label: "Sent", count: sent, pctOfPrevious: 100 },
          {
            key: "clicked",
            label: "Clicked",
            count: clicked,
            pctOfPrevious: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          },
          {
            key: "posted",
            label: "Posted",
            count: posted,
            pctOfPrevious:
              clicked > 0
                ? Math.round((posted / clicked) * 100)
                : sent > 0
                  ? Math.round((posted / sent) * 100)
                  : 0,
          },
        ];

        const payload: FunnelResponse = {
          windowDays,
          stages,
          hasOpenTracking: false,
        };
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/funnel]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
