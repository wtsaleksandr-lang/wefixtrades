/**
 * Admin Content Pipeline Routes — Wave 20.
 *
 * Read-only admin surface listing every in-flight content request
 * (from RankFlow / SocialSync / standalone ContentFlow / manual triggers)
 * with their current pipeline stage and any errors.
 *
 * The customer portal hits the same data store (filtered by client_id)
 * via the existing portal routes; this file is admin-only.
 *
 * Endpoints:
 *   GET  /api/admin/content-pipeline             — list with filters
 *   GET  /api/admin/content-pipeline/:requestId  — single request + log
 *   POST /api/admin/content-pipeline/:requestId/retry — re-dispatch
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { contentRequests, contentPipelineLog } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { enqueueContentRequest, listPending } from "../services/contentflow/api";

const log = createLogger("AdminContentPipeline");

export function registerAdminContentPipelineRoutes(app: Express): void {
  /**
   * GET /api/admin/content-pipeline
   *
   * Query params:
   *   - source: rankflow | socialsync | contentflow | manual
   *   - stage:  requested | generating | quality_check | approved | failed
   *   - clientId: number
   *   - limit:  1-500 (default 100)
   */
  app.get(
    "/api/admin/content-pipeline",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const source = (req.query.source as string | undefined) ?? undefined;
        const stage = (req.query.stage as string | undefined) ?? undefined;
        const clientIdRaw = req.query.clientId as string | undefined;
        const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : undefined;
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));

        const items = await listPending({
          source: source as any,
          currentStage: stage as any,
          clientId: clientId,
          limit,
        });

        // Per-stage counts for the dashboard header chips.
        const counts = await db
          .select({
            stage: contentRequests.current_stage,
            count: sql<number>`count(*)::int`,
          })
          .from(contentRequests)
          .groupBy(contentRequests.current_stage);

        // Recent failure rate over the last hour for the alert banner.
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const recentRows = await db
          .select({
            total: sql<number>`count(*)::int`,
            failed: sql<number>`sum(case when current_stage = 'failed' then 1 else 0 end)::int`,
          })
          .from(contentRequests)
          .where(sql`${contentRequests.created_at} >= ${since}`);
        const recent = recentRows[0] ?? { total: 0, failed: 0 };

        res.json({
          data: items,
          counts,
          recent_hour: {
            total: recent.total ?? 0,
            failed: recent.failed ?? 0,
            failure_rate: recent.total ? (recent.failed ?? 0) / recent.total : 0,
          },
        });
      } catch (err: any) {
        log.error("Failed to list content pipeline", { error: err.message });
        res.status(500).json({ error: "Failed to list content pipeline" });
      }
    },
  );

  app.get(
    "/api/admin/content-pipeline/:requestId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const requestId = String(req.params.requestId);
        const [row] = await db
          .select()
          .from(contentRequests)
          .where(eq(contentRequests.request_id, requestId))
          .limit(1);
        if (!row) return res.status(404).json({ error: "request not found" });

        const logs = await db
          .select()
          .from(contentPipelineLog)
          .where(eq(contentPipelineLog.request_id, requestId))
          .orderBy(desc(contentPipelineLog.recorded_at))
          .limit(100);

        res.json({ request: row, log: logs });
      } catch (err: any) {
        log.error("Failed to load request", { error: err.message });
        res.status(500).json({ error: "Failed to load request" });
      }
    },
  );

  app.post(
    "/api/admin/content-pipeline/:requestId/retry",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const requestId = String(req.params.requestId);
        const [row] = await db
          .select()
          .from(contentRequests)
          .where(eq(contentRequests.request_id, requestId))
          .limit(1);
        if (!row) return res.status(404).json({ error: "request not found" });
        if (row.current_stage === "approved") {
          return res.status(409).json({ error: "request already approved — retry not applicable" });
        }
        // Re-dispatch via the existing pipeline; updates the same request row.
        enqueueContentRequest(requestId).catch((err) =>
          log.error("retry dispatch failed", { requestId, err: err?.message }),
        );
        res.json({ ok: true, requestId });
      } catch (err: any) {
        log.error("Failed to retry request", { error: err.message });
        res.status(500).json({ error: "Failed to retry request" });
      }
    },
  );
}
