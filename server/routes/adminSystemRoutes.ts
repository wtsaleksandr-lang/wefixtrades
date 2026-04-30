/**
 * Admin System Routes — observability + manual control over the
 * background job system.
 *
 * All routes require admin authentication. No mutations to product
 * data — these endpoints inspect job_logs and trigger named workers
 * via the registry.
 *
 * Email-system jobs are deliberately not manually triggerable here;
 * see registry.ts (fn: null entries).
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { jobLogs } from "@shared/schema";
import {
  JOB_REGISTRY,
  runJobByName,
  isManuallyTriggerable,
  getJobNames,
} from "../jobs/registry";

const ERROR_MESSAGE_PREVIEW = 240;

function trimError(msg: string | null): string | null {
  if (!msg) return null;
  return msg.length > ERROR_MESSAGE_PREVIEW
    ? msg.slice(0, ERROR_MESSAGE_PREVIEW) + "…"
    : msg;
}

function durationMs(started: Date | string | null, finished: Date | string | null): number | null {
  if (!started || !finished) return null;
  const s = typeof started === "string" ? new Date(started) : started;
  const f = typeof finished === "string" ? new Date(finished) : finished;
  const diff = f.getTime() - s.getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

export function registerAdminSystemRoutes(app: Express): void {

  /**
   * GET /api/admin/system/jobs
   * Paginated job_logs list. Query params:
   *   - job_name (optional)
   *   - status (running | completed | failed)
   *   - from / to (ISO dates)
   *   - limit (default 50, max 200)
   *   - offset (default 0)
   */
  app.get("/api/admin/system/jobs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
      const jobName = typeof req.query.job_name === "string" && req.query.job_name.length > 0 ? req.query.job_name : null;
      const status = typeof req.query.status === "string" && req.query.status.length > 0 ? req.query.status : null;
      const fromStr = typeof req.query.from === "string" ? req.query.from : null;
      const toStr = typeof req.query.to === "string" ? req.query.to : null;
      const fromDate = fromStr ? new Date(fromStr) : null;
      const toDate = toStr ? new Date(toStr) : null;

      const conditions: any[] = [];
      if (jobName) conditions.push(eq(jobLogs.job_name, jobName));
      if (status) conditions.push(eq(jobLogs.status, status));
      if (fromDate && !isNaN(fromDate.getTime())) conditions.push(gte(jobLogs.started_at, fromDate));
      if (toDate && !isNaN(toDate.getTime())) conditions.push(lte(jobLogs.started_at, toDate));
      const whereClause = conditions.length === 0 ? undefined : (conditions.length === 1 ? conditions[0] : and(...conditions));

      const baseSelect = db
        .select({
          id: jobLogs.id,
          job_name: jobLogs.job_name,
          status: jobLogs.status,
          started_at: jobLogs.started_at,
          finished_at: jobLogs.finished_at,
          error_message: jobLogs.error_message,
        })
        .from(jobLogs);

      const rows = await (whereClause ? baseSelect.where(whereClause) : baseSelect)
        .orderBy(desc(jobLogs.id))
        .limit(limit)
        .offset(offset);

      const baseCount = db.select({ c: sql<number>`count(*)::int` }).from(jobLogs);
      const totalRows = await (whereClause ? baseCount.where(whereClause) : baseCount);
      const total = totalRows[0]?.c ?? 0;

      const data = rows.map((r) => ({
        id: r.id,
        job_name: r.job_name,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        error_message: trimError(r.error_message),
        duration_ms: durationMs(r.started_at, r.finished_at),
      }));

      res.json({ data, total, limit, offset });
    } catch (err: any) {
      console.error("[adminSystem] GET /jobs error:", err);
      res.status(500).json({ error: "Failed to load job logs" });
    }
  });

  /**
   * GET /api/admin/system/workers
   * Per-worker health derived from job_logs. Walks every entry in
   * JOB_REGISTRY and joins on the most recent run + last successful
   * run + average duration over last 10 runs.
   *
   * is_stale = no completed run in (2 × schedule_minutes).
   */
  app.get("/api/admin/system/workers", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const names = getJobNames();
      const now = Date.now();

      const summaries = await Promise.all(names.map(async (name) => {
        const meta = (JOB_REGISTRY as any)[name];
        const scheduleMinutes = meta.schedule_minutes as number;

        const [last] = await db
          .select({
            id: jobLogs.id,
            status: jobLogs.status,
            started_at: jobLogs.started_at,
            finished_at: jobLogs.finished_at,
            error_message: jobLogs.error_message,
          })
          .from(jobLogs)
          .where(eq(jobLogs.job_name, name))
          .orderBy(desc(jobLogs.id))
          .limit(1);

        const [lastSuccess] = await db
          .select({ started_at: jobLogs.started_at, finished_at: jobLogs.finished_at })
          .from(jobLogs)
          .where(and(eq(jobLogs.job_name, name), eq(jobLogs.status, "completed")))
          .orderBy(desc(jobLogs.id))
          .limit(1);

        const recent = await db
          .select({ started_at: jobLogs.started_at, finished_at: jobLogs.finished_at })
          .from(jobLogs)
          .where(and(eq(jobLogs.job_name, name), eq(jobLogs.status, "completed")))
          .orderBy(desc(jobLogs.id))
          .limit(10);

        let avgDurationMs: number | null = null;
        if (recent.length > 0) {
          const durations = recent
            .map((r) => durationMs(r.started_at, r.finished_at))
            .filter((d): d is number => d !== null);
          if (durations.length > 0) {
            avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
          }
        }

        const lastRun = last?.started_at ?? null;
        const lastRunMs = lastRun ? new Date(lastRun).getTime() : null;
        const lastSuccessAt = lastSuccess?.finished_at ?? lastSuccess?.started_at ?? null;
        const lastSuccessMs = lastSuccessAt ? new Date(lastSuccessAt).getTime() : null;

        // Stale = no successful completion within (2 × schedule_minutes).
        // A worker that has never run is also considered stale.
        const staleThresholdMs = scheduleMinutes * 2 * 60 * 1000;
        const isStale = lastSuccessMs === null || now - lastSuccessMs > staleThresholdMs;

        return {
          job_name: name,
          label: meta.label as string,
          schedule_minutes: scheduleMinutes,
          last_run_at: lastRun,
          last_status: last?.status ?? null,
          last_error: trimError(last?.error_message ?? null),
          last_success_at: lastSuccessAt,
          minutes_since_last_run: lastRunMs ? Math.floor((now - lastRunMs) / 60000) : null,
          minutes_since_last_success: lastSuccessMs ? Math.floor((now - lastSuccessMs) / 60000) : null,
          is_stale: isStale,
          avg_duration_ms: avgDurationMs,
          manually_triggerable: isManuallyTriggerable(name),
        };
      }));

      res.json({ workers: summaries });
    } catch (err: any) {
      console.error("[adminSystem] GET /workers error:", err);
      res.status(500).json({ error: "Failed to load worker status" });
    }
  });

  /**
   * GET /api/admin/system/summary
   * Top-level health for the system dashboard card.
   *   status = critical: any stale worker OR >10% failure rate (24h)
   *   status = warning:  >3% failure rate (24h)
   *   status = healthy:  otherwise
   */
  app.get("/api/admin/system/summary", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

      const totalRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobLogs)
        .where(gte(jobLogs.started_at, dayAgo));
      const total24h = totalRows[0]?.c ?? 0;

      const failedRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobLogs)
        .where(and(gte(jobLogs.started_at, dayAgo), eq(jobLogs.status, "failed")));
      const failed24h = failedRows[0]?.c ?? 0;

      const runningRows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobLogs)
        .where(eq(jobLogs.status, "running"));
      const runningNow = runningRows[0]?.c ?? 0;

      const topFailed = await db
        .select({
          job_name: jobLogs.job_name,
          count: sql<number>`count(*)::int`,
        })
        .from(jobLogs)
        .where(and(gte(jobLogs.started_at, dayAgo), eq(jobLogs.status, "failed")))
        .groupBy(jobLogs.job_name)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      // Walk registry to count stale workers
      const names = getJobNames();
      let staleCount = 0;
      for (const name of names) {
        const meta = (JOB_REGISTRY as any)[name];
        const [last] = await db
          .select({ started_at: jobLogs.started_at })
          .from(jobLogs)
          .where(and(eq(jobLogs.job_name, name), eq(jobLogs.status, "completed")))
          .orderBy(desc(jobLogs.id))
          .limit(1);
        const lastMs = last?.started_at ? new Date(last.started_at).getTime() : null;
        const threshold = meta.schedule_minutes * 2 * 60 * 1000;
        if (lastMs === null || now - lastMs > threshold) staleCount++;
      }

      const failureRate = total24h > 0 ? failed24h / total24h : 0;
      let status: "healthy" | "warning" | "critical";
      if (staleCount > 0 || failureRate > 0.10) {
        status = "critical";
      } else if (failureRate > 0.03) {
        status = "warning";
      } else {
        status = "healthy";
      }

      res.json({
        total_jobs_last_24h: total24h,
        failed_jobs_last_24h: failed24h,
        running_jobs_now: runningNow,
        stale_workers_count: staleCount,
        top_failed_jobs: topFailed,
        failure_rate_24h: failureRate,
        system_status: status,
      });
    } catch (err: any) {
      console.error("[adminSystem] GET /summary error:", err);
      res.status(500).json({ error: "Failed to load system summary" });
    }
  });

  /**
   * POST /api/admin/system/run/:jobName
   * Manually triggers a worker by name. Fires asynchronously — the
   * job_logs lifecycle (running → completed/failed) is the source of
   * truth for outcome. Returns 202 immediately.
   */
  app.post("/api/admin/system/run/:jobName", requireAdmin, async (req: Request, res: Response) => {
    const jobName = String(req.params.jobName ?? "");
    if (!jobName || !(jobName in JOB_REGISTRY)) {
      return res.status(404).json({ error: `Unknown job: ${jobName}` });
    }
    if (!isManuallyTriggerable(jobName)) {
      return res.status(400).json({ error: `Job ${jobName} is not manually triggerable` });
    }

    // Fire-and-forget. The admin UI polls job_logs to see progress.
    runJobByName(jobName).catch((err) => {
      console.error(`[adminSystem] manual run ${jobName} failed:`, err?.message ?? err);
    });

    res.status(202).json({ started: true, job_name: jobName });
  });

  /**
   * POST /api/admin/system/retry/:jobLogId
   * Look up a job_logs row and re-run it. Refuses if a run for the
   * same job_name is currently in progress (status='running').
   */
  app.post("/api/admin/system/retry/:jobLogId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.jobLogId ?? ""), 10);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid job log id" });
      }

      const [row] = await db
        .select({ id: jobLogs.id, job_name: jobLogs.job_name })
        .from(jobLogs)
        .where(eq(jobLogs.id, id))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Job log not found" });
      if (!(row.job_name in JOB_REGISTRY)) {
        return res.status(400).json({ error: `Unknown job: ${row.job_name}` });
      }
      if (!isManuallyTriggerable(row.job_name)) {
        return res.status(400).json({ error: `Job ${row.job_name} is not manually triggerable` });
      }

      const [running] = await db
        .select({ id: jobLogs.id })
        .from(jobLogs)
        .where(and(eq(jobLogs.job_name, row.job_name), eq(jobLogs.status, "running")))
        .orderBy(desc(jobLogs.id))
        .limit(1);

      if (running) {
        return res.status(409).json({ error: `${row.job_name} is already running`, running_log_id: running.id });
      }

      runJobByName(row.job_name).catch((err) => {
        console.error(`[adminSystem] retry ${row.job_name} failed:`, err?.message ?? err);
      });

      res.status(202).json({ started: true, job_name: row.job_name });
    } catch (err: any) {
      console.error("[adminSystem] POST /retry error:", err);
      res.status(500).json({ error: "Retry failed" });
    }
  });
}
