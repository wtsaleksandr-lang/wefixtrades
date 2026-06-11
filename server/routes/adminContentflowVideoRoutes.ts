/**
 * Admin ContentFlow video-queue routes (Phase 2 video pipeline, WP6).
 *
 * Mounted under /api/admin/contentflow/*. All routes requireAdmin (same
 * auth middleware as adminOutboundRoutes). Kill switch + the per-video
 * cost cap (max_video_cost_usd) are edited via the EXISTING ContentFlow
 * settings PATCH — no settings surface here.
 *
 * Endpoints (design §5):
 *   GET  /api/admin/contentflow/video-queue
 *        All tenants: per-status counts + recent projects with scene
 *        roll-ups, provider mix, and costs.
 *   POST /api/admin/contentflow/video-queue/:id/force-fail
 *        Operator hard-stop: project → failed (any non-terminal state);
 *        its unfinished scenes → failed so the worker drops them.
 *   POST /api/admin/contentflow/video-queue/:id/retry
 *        Operator retry: every failed scene of the project → a fresh
 *        planned cycle; project → rendering. Broader than the customer
 *        per-scene retry (works from failed AND needs_attention).
 *
 * The two mutations are admin-only operator overrides that intentionally
 * bypass the customer-facing status guards in storage/contentflowVideo.ts
 * (cancelVideoProject / retryScene), so they carry their own scoped SQL
 * here rather than widening the tenant-facing helpers.
 */

import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import type { VideoProject } from "@shared/schema";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminContentflowVideo");

function rowsOf<T>(result: unknown): T[] {
  const rows = (result as any)?.rows ?? result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export function registerAdminContentflowVideoRoutes(app: Express) {
  /** GET /api/admin/contentflow/video-queue — counts + recent projects. */
  app.get("/api/admin/contentflow/video-queue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const queue = await storage.getAdminVideoQueue({ limit });
      res.json({
        counts: queue.counts,
        projects: queue.projects.map((p) => ({
          id: p.id,
          client_id: p.client_id,
          draft_id: p.draft_id,
          title: p.title,
          status: p.status,
          stitch_status: p.stitch_status,
          aspect_ratio: p.aspect_ratio,
          scene_count: p.scene_count,
          rendered_count: p.rendered_count,
          failed_count: p.failed_count,
          providers: p.providers,
          estimated_cost_usd:
            p.estimated_cost_micro_usd != null
              ? Number(((p.estimated_cost_micro_usd as number) / 1_000_000).toFixed(2))
              : null,
          actual_cost_usd: Number((((p.actual_cost_micro_usd as number) || 0) / 1_000_000).toFixed(2)),
          cost_breakdown: p.cost_breakdown,
          video_url: p.video_url,
          error: p.error,
          created_at: p.created_at,
          updated_at: p.updated_at,
        })),
      });
    } catch (err: any) {
      log.error("[admin/video-queue][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/admin/contentflow/video-queue/:id/force-fail */
  app.post(
    "/api/admin/contentflow/video-queue/:id/force-fail",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const projectId = Number.parseInt(String(req.params.id), 10);
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "invalid project id", code: "invalid_id" });
        }
        const reason =
          typeof req.body?.reason === "string" && req.body.reason.trim()
            ? req.body.reason.trim().slice(0, 500)
            : "force-failed by admin";

        const projects = rowsOf<VideoProject>(await db.execute(sql`
          UPDATE video_projects
          SET status = 'failed',
              error = ${reason},
              locked_at = NULL,
              locked_by = NULL,
              updated_at = NOW()
          WHERE id = ${projectId}
            AND status NOT IN ('ready', 'canceled', 'failed')
          RETURNING *
        `));
        if (projects.length === 0) {
          return res.status(409).json({
            error: "Project not found or already in a terminal state.",
            code: "not_force_failable",
          });
        }
        /* Unfinished scenes → failed so worker polls/submits drop them. */
        await db.execute(sql`
          UPDATE video_scenes
          SET status = 'failed',
              last_error = ${reason},
              locked_at = NULL,
              locked_by = NULL,
              next_attempt_at = NULL,
              updated_at = NOW()
          WHERE project_id = ${projectId}
            AND status IN ('planned', 'rendering')
        `);
        writeAudit({
          actorType: "admin",
          actorId: req.user?.id ?? null,
          action: "contentflow.video_project.force_failed",
          entityType: "video_project",
          entityId: String(projectId),
          metadata: { reason },
        });
        res.json({ ok: true, status: projects[0].status });
      } catch (err: any) {
        log.error("[admin/video-queue/:id/force-fail][post]", err?.message || err);
        res.status(500).json({ error: err.message });
      }
    },
  );

  /** POST /api/admin/contentflow/video-queue/:id/retry */
  app.post(
    "/api/admin/contentflow/video-queue/:id/retry",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const projectId = Number.parseInt(String(req.params.id), 10);
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "invalid project id", code: "invalid_id" });
        }
        const scenes = rowsOf<{ id: number }>(await db.execute(sql`
          UPDATE video_scenes s
          SET status = 'planned',
              attempts = 0,
              next_attempt_at = NULL,
              last_error = NULL,
              provider_operation_ref = NULL,
              provider_request_id = NULL,
              locked_at = NULL,
              locked_by = NULL,
              updated_at = NOW()
          WHERE s.project_id = ${projectId}
            AND s.status = 'failed'
            AND EXISTS (
              SELECT 1 FROM video_projects p
              WHERE p.id = s.project_id AND p.status IN ('needs_attention', 'failed')
            )
          RETURNING s.id
        `));
        if (scenes.length === 0) {
          return res.status(409).json({
            error: "No failed scenes to retry (project must be needs_attention or failed).",
            code: "not_retryable",
          });
        }
        await db.execute(sql`
          UPDATE video_projects
          SET status = 'rendering', error = NULL, updated_at = NOW()
          WHERE id = ${projectId} AND status IN ('needs_attention', 'failed')
        `);
        writeAudit({
          actorType: "admin",
          actorId: req.user?.id ?? null,
          action: "contentflow.video_project.admin_retried",
          entityType: "video_project",
          entityId: String(projectId),
          metadata: { scenes_reset: scenes.length },
        });
        res.json({ ok: true, scenesReset: scenes.length });
      } catch (err: any) {
        log.error("[admin/video-queue/:id/retry][post]", err?.message || err);
        res.status(500).json({ error: err.message });
      }
    },
  );
}
