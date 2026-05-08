/**
 * Admin Ops Routes — serves Background AI Ops Engine snapshots to the admin dashboard,
 * plus system monitoring endpoints for job logs and worker status.
 *
 * All routes require admin authentication.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { opsSnapshots, jobLogs } from "@shared/schema";
import { desc, eq, and, gte, lte, sql, count } from "drizzle-orm";
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

  /* ═══════════════════════════════════════════════════════════════════
     System Monitoring — Job Logs & Worker Status
     Sprint 11: admin visibility into cron health and job history.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * GET /api/admin/system/jobs
   * Paginated job logs with filters.
   * Query: job_name, status, from (ISO), to (ISO), limit (default 50), offset (default 0)
   */
  app.get("/api/admin/system/jobs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
      const jobName = typeof req.query.job_name === "string" && req.query.job_name ? req.query.job_name : undefined;
      const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
      const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;
      const to = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : undefined;

      const conditions = [];
      if (jobName) conditions.push(eq(jobLogs.job_name, jobName));
      if (status) conditions.push(eq(jobLogs.status, status));
      if (from) conditions.push(gte(jobLogs.started_at, from));
      if (to) conditions.push(lte(jobLogs.started_at, to));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(jobLogs)
        .where(where)
        .orderBy(desc(jobLogs.started_at))
        .limit(limit)
        .offset(offset);

      // Total count for pagination
      const [{ total }] = await db
        .select({ total: count() })
        .from(jobLogs)
        .where(where);

      // Distinct job names for the filter dropdown
      const names = await db
        .selectDistinct({ job_name: jobLogs.job_name })
        .from(jobLogs)
        .orderBy(jobLogs.job_name);

      res.json({
        data: rows,
        total: Number(total),
        limit,
        offset,
        job_names: names.map((n) => n.job_name),
      });
    } catch (err: any) {
      log.error("[system/jobs] GET error", { error: err.message });
      res.status(500).json({ error: "Failed to load job logs" });
    }
  });

  /**
   * GET /api/admin/system/jobs/summary
   * Per-job aggregated stats: last run, last status, last error,
   * total runs today, failure rate.
   */
  app.get("/api/admin/system/jobs/summary", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const summaryRows = await db.execute(sql`
        SELECT
          job_name,
          COUNT(*)::int AS total_runs_today,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failures_today,
          MAX(started_at) AS last_run_at,
          (SELECT status FROM job_logs j2
           WHERE j2.job_name = j1.job_name
           ORDER BY j2.started_at DESC LIMIT 1) AS last_status,
          (SELECT error_message FROM job_logs j2
           WHERE j2.job_name = j1.job_name AND j2.status = 'failed'
           ORDER BY j2.started_at DESC LIMIT 1) AS last_error,
          CASE WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*)::numeric * 100, 1)
            ELSE 0
          END AS failure_rate
        FROM job_logs j1
        WHERE started_at >= ${todayStart}
        GROUP BY job_name
        ORDER BY job_name
      `);

      // Overall stats
      const [overallRow] = await db
        .select({
          total: count(),
          failures: sql<number>`COUNT(*) FILTER (WHERE ${jobLogs.status} = 'failed')`,
        })
        .from(jobLogs)
        .where(gte(jobLogs.started_at, todayStart));

      // Longest running job today
      const longestResult = await db.execute(sql`
        SELECT job_name,
          EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::int AS duration_seconds
        FROM job_logs
        WHERE started_at >= ${todayStart}
        ORDER BY (COALESCE(finished_at, NOW()) - started_at) DESC
        LIMIT 1
      `);
      const longestRow = (longestResult.rows ?? longestResult)[0] as any;

      // Most failures today
      const mostFailResult = await db.execute(sql`
        SELECT job_name, COUNT(*)::int AS failure_count
        FROM job_logs
        WHERE status = 'failed' AND started_at >= ${todayStart}
        GROUP BY job_name
        ORDER BY failure_count DESC
        LIMIT 1
      `);
      const mostFailRow = (mostFailResult.rows ?? mostFailResult)[0] as any;

      res.json({
        jobs: summaryRows.rows ?? summaryRows,
        overall: {
          total_runs_today: Number(overallRow?.total ?? 0),
          failures_today: Number(overallRow?.failures ?? 0),
          longest_job: longestRow
            ? { job_name: longestRow.job_name, duration_seconds: longestRow.duration_seconds }
            : null,
          most_failures: mostFailRow
            ? { job_name: mostFailRow.job_name, failure_count: mostFailRow.failure_count }
            : null,
        },
      });
    } catch (err: any) {
      log.error("[system/jobs/summary] GET error", { error: err.message });
      res.status(500).json({ error: "Failed to load job summary" });
    }
  });

  /* ─── Worker registry ─── */
  const WORKER_REGISTRY: Array<{
    name: string;
    job_name: string;
    schedule: string;
    interval_minutes: number;
  }> = [
    { name: "Daily Aggregation", job_name: "daily_aggregation", schedule: "0 2 * * *", interval_minutes: 1440 },
    { name: "Weekly Email Report", job_name: "weekly_email_report", schedule: "0 13 * * 1", interval_minutes: 10080 },
    { name: "Notification Queue", job_name: "notification_worker", schedule: "* * * * *", interval_minutes: 1 },
    { name: "Follow-up Jobs", job_name: "followup_worker", schedule: "* * * * *", interval_minutes: 1 },
    { name: "Audit Follow-ups", job_name: "audit_followup_worker", schedule: "* * * * *", interval_minutes: 1 },
    { name: "Review Follow-ups", job_name: "review_followup_worker", schedule: "* * * * *", interval_minutes: 1 },
    { name: "Ops Intelligence", job_name: "ops_daily_intelligence", schedule: "0 7 * * *", interval_minutes: 1440 },
    { name: "Review Monitoring", job_name: "review_monitoring", schedule: "0 */6 * * *", interval_minutes: 360 },
    { name: "Reputation Reports", job_name: "reputation_reports", schedule: "0 9 * * *", interval_minutes: 1440 },
    { name: "Chat Memory Cleanup", job_name: "chat_memory_cleanup", schedule: "0 3 * * *", interval_minutes: 1440 },
    { name: "Outbound Sync", job_name: "outbound_sync", schedule: "*/15 * * * *", interval_minutes: 15 },
    { name: "RankFlow Plans", job_name: "rankflow_plan_generation", schedule: "0 4 * * 1", interval_minutes: 10080 },
    { name: "RankFlow Tracking", job_name: "rankflow_tracking", schedule: "0 5 * * 3", interval_minutes: 10080 },
    { name: "MapGuard Weekly Scan", job_name: "mapguard_weekly_scan", schedule: "0 4 * * 2", interval_minutes: 10080 },
    { name: "MapGuard Weekly Update", job_name: "mapguard_weekly_update", schedule: "0 9 * * 5", interval_minutes: 10080 },
    { name: "MapGuard Monthly Reports", job_name: "mapguard_monthly_reports", schedule: "0 10 2 * *", interval_minutes: 43200 },
    { name: "RankFlow Monthly Reports", job_name: "rankflow_monthly_reports", schedule: "0 11 2 * *", interval_minutes: 43200 },
    { name: "SocialSync Monthly Reports", job_name: "socialsync_monthly_reports", schedule: "0 12 2 * *", interval_minutes: 43200 },
    { name: "Trial Lifecycle", job_name: "trial_lifecycle", schedule: "0 9 * * *", interval_minutes: 1440 },
    { name: "ContentFlow Publish Queue", job_name: "contentflow_publish_queue", schedule: "*/2 * * * *", interval_minutes: 2 },
    { name: "ContentFlow Performance", job_name: "contentflow_performance", schedule: "*/30 * * * *", interval_minutes: 30 },
    { name: "SocialSync Generation", job_name: "socialsync_weekly_generation", schedule: "0 6 * * 0", interval_minutes: 10080 },
    { name: "SocialSync Expiry Check", job_name: "socialsync_expiry_check", schedule: "0 4 * * *", interval_minutes: 1440 },
    { name: "SocialSync Media Cleanup", job_name: "socialsync_media_cleanup", schedule: "0 5 * * *", interval_minutes: 1440 },
    { name: "Review Automation", job_name: "socialsync_review_automation", schedule: "0 */6 * * *", interval_minutes: 360 },
    { name: "Review Request Delivery", job_name: "review_request_delivery", schedule: "*/15 * * * *", interval_minutes: 15 },
    { name: "Dunning Queue", job_name: "dunning_queue", schedule: "*/5 * * * *", interval_minutes: 5 },
    { name: "Image Retention", job_name: "contentflow_image_retention", schedule: "30 4 * * *", interval_minutes: 1440 },
    { name: "WebCare Health", job_name: "webcare_health", schedule: "*/15 * * * *", interval_minutes: 15 },
    { name: "Recurring Tasks", job_name: "recurring_task_generation", schedule: "0 1 * * *", interval_minutes: 1440 },
    { name: "Auto Activation", job_name: "auto_activation", schedule: "*/5 * * * *", interval_minutes: 5 },
    { name: "Upsell Emails", job_name: "upsell_emails", schedule: "0 10 * * *", interval_minutes: 1440 },
    { name: "WebCare Maintenance", job_name: "webcare_monthly_maintenance", schedule: "0 3 1 * *", interval_minutes: 43200 },
    { name: "Data Retention", job_name: "data_retention", schedule: "30 2 * * 0", interval_minutes: 10080 },
  ];

  /**
   * GET /api/admin/system/workers
   * Returns the registered worker list with schedule, last run info,
   * and stale detection.
   */
  app.get("/api/admin/system/workers", requireAdmin, async (_req: Request, res: Response) => {
    try {
      // Fetch the last run for each worker in a single query
      const lastRuns = await db.execute(sql`
        SELECT DISTINCT ON (job_name)
          job_name, status, started_at, finished_at, error_message
        FROM job_logs
        ORDER BY job_name, started_at DESC
      `);

      const lastRunMap = new Map<string, any>();
      for (const row of (lastRuns.rows ?? lastRuns) as any[]) {
        lastRunMap.set(row.job_name, row);
      }

      const now = Date.now();
      const workers = WORKER_REGISTRY.map((w) => {
        const lastRun = lastRunMap.get(w.job_name);
        const lastRunAt = lastRun?.started_at ? new Date(lastRun.started_at).getTime() : null;
        const staleThreshold = w.interval_minutes * 2 * 60 * 1000;
        const isStale = lastRunAt ? (now - lastRunAt) > staleThreshold : true;

        return {
          name: w.name,
          job_name: w.job_name,
          schedule: w.schedule,
          interval_minutes: w.interval_minutes,
          last_run_at: lastRun?.started_at ?? null,
          last_finished_at: lastRun?.finished_at ?? null,
          last_status: lastRun?.status ?? "never_run",
          last_error: lastRun?.error_message ?? null,
          stale: isStale,
        };
      });

      const healthyCount = workers.filter((w) => !w.stale && w.last_status === "completed").length;
      const staleCount = workers.filter((w) => w.stale).length;
      const failedCount = workers.filter((w) => w.last_status === "failed").length;

      res.json({
        workers,
        summary: {
          total: workers.length,
          healthy: healthyCount,
          stale: staleCount,
          failed: failedCount,
        },
      });
    } catch (err: any) {
      log.error("[system/workers] GET error", { error: err.message });
      res.status(500).json({ error: "Failed to load worker status" });
    }
  });

  /**
   * GET /api/admin/system/workers/:jobName/history
   * Returns the last N runs for a specific worker.
   */
  app.get("/api/admin/system/workers/:jobName/history", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobName = String(req.params.jobName);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10));

      const rows = await db
        .select()
        .from(jobLogs)
        .where(eq(jobLogs.job_name, jobName))
        .orderBy(desc(jobLogs.started_at))
        .limit(limit);

      res.json({ data: rows });
    } catch (err: any) {
      log.error("[system/workers/history] GET error", { error: err.message });
      res.status(500).json({ error: "Failed to load worker history" });
    }
  });

  /* ─── Manual "Run Now" endpoint for workers ─── */

  /** Worker name to lazy-loaded function map. Dynamic imports avoid pulling all workers at startup. */
  const WORKER_FN_MAP: Record<string, () => Promise<() => Promise<any>>> = {
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
    recurring_task_generation:    () => import("../jobs/recurringTaskWorker").then(m => m.processRecurringTasks),
    upsell_emails:                () => import("../jobs/upsellWorker").then(m => m.processUpsellEmails),
    dunning_queue:                () => import("../jobs/dunningWorker").then(m => m.processDunningQueue),
    contentflow_image_retention:  () => import("../jobs/imageRetentionWorker").then(m => m.processImageRetention),
    contentflow_performance:      () => import("../jobs/performanceWorker").then(m => m.processPerformanceQueue),
    data_retention:               () => import("../jobs/retentionWorker").then(m => m.processRetention),
  };

  /**
   * POST /api/admin/system/workers/:name/run
   * Manually trigger a specific background worker.
   * Wraps execution in runJob() so it appears in job_logs.
   */
  app.post("/api/admin/system/workers/:name/run", requireAdmin, async (req: Request, res: Response) => {
    const workerName = String(req.params.name);
    const loader = WORKER_FN_MAP[workerName];
    if (!loader) {
      return res.status(404).json({
        success: false,
        error: `Unknown worker "${workerName}"`,
        available: Object.keys(WORKER_FN_MAP),
      });
    }

    try {
      log.info(`Manual worker trigger: ${workerName}`, {
        triggeredBy: (req.user as any)?.id ?? "unknown",
      });
      const fn = await loader();
      const { runJob: runJobFn } = await import("../jobs/scheduler");
      const result = await runJobFn(`manual_${workerName}`, fn);
      res.json({ success: true, worker: workerName, result });
    } catch (err: any) {
      log.error(`Manual worker trigger failed: ${workerName}`, { error: err.message });
      res.status(500).json({ success: false, worker: workerName, error: err.message });
    }
  });
}

/* ─── Brand availability — manual on/off toggle ────────────────────
   Used by /admin/system/availability admin page and consumed by
   server/services/vapiService.ts when assembling the operating-brand
   assistant's first-message + system prompt.
   ────────────────────────────────────────────────────────────── */

export function registerBrandAvailabilityRoutes(app: import("express").Express) {
  app.get("/api/admin/system/availability", requireAdmin, async (_req, res) => {
    try {
      const row = await storage.getBrandAvailability();
      res.json(row);
    } catch (err: any) {
      log.error("[availability] read failed", { error: err.message });
      res.status(500).json({ error: "Failed to read availability" });
    }
  });

  app.post("/api/admin/system/availability", requireAdmin, async (req, res) => {
    try {
      const { is_available, away_message } = req.body ?? {};
      if (typeof is_available !== "boolean") {
        return res.status(400).json({ error: "is_available (boolean) is required" });
      }
      const row = await storage.setBrandAvailability({
        is_available,
        away_message: typeof away_message === "string" && away_message.trim() ? away_message.trim() : undefined,
        set_by_user_id: (req.user as any)?.id ?? null,
      });
      res.json(row);
    } catch (err: any) {
      log.error("[availability] write failed", { error: err.message });
      res.status(500).json({ error: "Failed to update availability" });
    }
  });
}
