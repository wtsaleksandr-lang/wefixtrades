/**
 * Admin Ops Routes — serves Background AI Ops Engine snapshots to the admin dashboard.
 *
 * All routes require admin authentication.
 * These endpoints serve read-only data from opsSnapshots.
 * No mutations happen here.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { opsSnapshots } from "@shared/schema";
import { desc, eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminOps");

export function registerAdminOpsRoutes(app: Express): void {

  /**
   * GET /api/admin/ops/summary/daily
   * Returns the most recent daily_summary snapshot.
   * Used by the CRM Overview ops intelligence widget.
   */
  app.get("/api/admin/ops/summary/daily", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [latest] = await db
        .select()
        .from(opsSnapshots)
        .where(eq(opsSnapshots.snapshot_type, "daily_summary"))
        .orderBy(desc(opsSnapshots.generated_at))
        .limit(1);

      if (!latest) {
        return res.json({ snapshot: null });
      }

      res.json({ snapshot: latest });
    } catch (err) {
      log.error("[adminOps] GET /summary/daily error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load daily ops summary" });
    }
  });

  /**
   * GET /api/admin/ops/snapshots
   * Returns paginated list of all ops snapshots (all types).
   * Query params: limit, offset, type
   */
  app.get("/api/admin/ops/snapshots", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;

      const query = db
        .select({
          id: opsSnapshots.id,
          snapshot_type: opsSnapshots.snapshot_type,
          generated_at: opsSnapshots.generated_at,
          signal_count: opsSnapshots.signal_count,
          model_used: opsSnapshots.model_used,
          input_tokens: opsSnapshots.input_tokens,
          output_tokens: opsSnapshots.output_tokens,
          estimated_cost_usd: opsSnapshots.estimated_cost_usd,
          prompt_version: opsSnapshots.prompt_version,
          detector_version: opsSnapshots.detector_version,
          metadata: opsSnapshots.metadata,
          // Return summary from ai_output without full raw_signals to keep response light
          ai_output: opsSnapshots.ai_output,
        })
        .from(opsSnapshots)
        .orderBy(desc(opsSnapshots.generated_at))
        .limit(limit)
        .offset(offset);

      const snapshots = type
        ? await db
            .select({
              id: opsSnapshots.id,
              snapshot_type: opsSnapshots.snapshot_type,
              generated_at: opsSnapshots.generated_at,
              signal_count: opsSnapshots.signal_count,
              model_used: opsSnapshots.model_used,
              input_tokens: opsSnapshots.input_tokens,
              output_tokens: opsSnapshots.output_tokens,
              estimated_cost_usd: opsSnapshots.estimated_cost_usd,
              prompt_version: opsSnapshots.prompt_version,
              detector_version: opsSnapshots.detector_version,
              metadata: opsSnapshots.metadata,
              ai_output: opsSnapshots.ai_output,
            })
            .from(opsSnapshots)
            .where(eq(opsSnapshots.snapshot_type, type))
            .orderBy(desc(opsSnapshots.generated_at))
            .limit(limit)
            .offset(offset)
        : await query;

      res.json({ snapshots, limit, offset });
    } catch (err) {
      log.error("[adminOps] GET /snapshots error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load ops snapshots" });
    }
  });

  /**
   * GET /api/admin/ops/snapshots/:id
   * Returns a single snapshot including raw_signals and full ai_output.
   * Used for drill-down / audit views.
   */
  app.get("/api/admin/ops/snapshots/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid snapshot id" });
      }

      const [snapshot] = await db
        .select()
        .from(opsSnapshots)
        .where(eq(opsSnapshots.id, id))
        .limit(1);

      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot not found" });
      }

      res.json({ snapshot });
    } catch (err) {
      log.error("[adminOps] GET /snapshots/:id error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load snapshot" });
    }
  });

  /**
   * POST /api/admin/ops/run
   * Manually triggers a single ops intelligence run.
   * Admin-only. Useful for testing and immediate refresh.
   */
  app.post("/api/admin/ops/run", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { runDailyOpsIntelligence } = await import("../jobs/opsIntelligenceJob");
      const result = await runDailyOpsIntelligence();
      res.json({ ok: true, result });
    } catch (err: any) {
      log.error("[adminOps] POST /run error:", err);
      res.status(500).json({ error: "Ops run failed", detail: err.message });
    }
  });

  /* ─── Manual "Run Now" endpoint for all workers ─── */

  /**
   * Worker name → lazy-loaded function map.
   * Uses dynamic imports so we don't pull every worker into the route bundle.
   */
  const WORKER_MAP: Record<string, () => Promise<() => Promise<any>>> = {
    daily_aggregation:            () => import("../jobs/aggregation").then(m => m.runDailyAggregation),
    weekly_email_report:          () => import("../jobs/weeklyReport").then(m => m.sendWeeklyReports),
    ops_daily_intelligence:       () => import("../jobs/opsIntelligenceJob").then(m => m.runDailyOpsIntelligence),
    review_monitoring:            () => import("../jobs/reviewMonitorWorker").then(m => m.processReviewMonitoring),
    reputation_reports:           () => import("../jobs/reputationReportWorker").then(m => m.processReputationReports),
    outbound_sync:                () => import("../jobs/outboundSyncWorker").then(m => m.processOutboundSync),
    rankflow_plan_generation:     () => import("../jobs/rankflowWorker").then(m => m.processRankFlowPlans),
    rankflow_tracking:            () => import("../jobs/trackingWorker").then(m => m.processRankFlowTracking),
    rankflow_monthly_reports:     () => import("../jobs/rankflowReportWorker").then(m => m.processRankflowReports),
    mapguard_weekly_scan:         () => import("../jobs/mapguardScanWorker").then(m => m.processMapguardScans),
    mapguard_monthly_reports:     () => import("../jobs/mapguardReportWorker").then(m => m.processMapguardReports),
    mapguard_weekly_update:       () => import("../jobs/mapguardWeeklyUpdateWorker").then(m => m.processMapguardWeeklyUpdates),
    socialsync_weekly_generation: () => import("../services/socialSync/orchestrator").then(m => m.generateAllDue),
    socialsync_monthly_reports:   () => import("../jobs/socialsyncReportWorker").then(m => m.processSocialsyncReports),
    webcare_health:               () => import("../jobs/webcareHealthWorker").then(m => m.processWebcareHealthChecks),
    webcare_monthly_maintenance:  () => import("../jobs/webcareMaintenanceWorker").then(m => m.processWebcareMaintenance),
    auto_activation:              () => import("../jobs/autoActivationWorker").then(m => m.processAutoActivation),
    recurring_tasks:              () => import("../jobs/recurringTaskWorker").then(m => m.processRecurringTasks),
    upsell_emails:                () => import("../jobs/upsellWorker").then(m => m.processUpsellEmails),
    dunning_queue:                () => import("../jobs/dunningWorker").then(m => m.processDunningQueue),
    contentflow_image_retention:  () => import("../jobs/imageRetentionWorker").then(m => m.processImageRetention),
    contentflow_performance:      () => import("../jobs/performanceWorker").then(m => m.processPerformanceQueue),
    data_retention:               () => import("../jobs/retentionWorker").then(m => m.processRetention),
  };

  /**
   * POST /api/admin/system/workers/:name/run
   * Manually trigger a specific background worker.
   * Wraps execution in runJob() so it appears in jobLogs.
   */
  app.post("/api/admin/system/workers/:name/run", requireAdmin, async (req: Request, res: Response) => {
    const workerName = req.params.name;

    const loader = WORKER_MAP[workerName];
    if (!loader) {
      return res.status(404).json({
        success: false,
        error: `Unknown worker "${workerName}"`,
        available: Object.keys(WORKER_MAP),
      });
    }

    try {
      log.info(`Manual worker trigger: ${workerName}`, { triggeredBy: String((req as any).user?.id ?? "unknown") });
      const fn = await loader();
      const { runJob } = await import("../jobs/scheduler");
      const result = await runJob(`manual_${workerName}`, fn);
      res.json({ success: true, worker: workerName, result });
    } catch (err: any) {
      log.error(`Manual worker trigger failed: ${workerName}`, { error: err.message });
      res.status(500).json({ success: false, worker: workerName, error: err.message });
    }
  });

  /**
   * GET /api/admin/system/workers
   * Returns list of available workers that can be manually triggered.
   */
  app.get("/api/admin/system/workers", requireAdmin, async (_req: Request, res: Response) => {
    res.json({ workers: Object.keys(WORKER_MAP) });
  });
}
