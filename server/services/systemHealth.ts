/**
 * System health aggregator (Phase 3D).
 *
 * Read-only computation of cross-cutting integration health for the
 * admin dashboard. Reads:
 *   - integration_error_logs (Phase 3B)
 *   - job_logs (existing)
 *   - notification_queue / followup_jobs / billing_dunning_events
 *     (existing — depth counts)
 *
 * Never returns secret values. Webhook-secret presence is reported as
 * a boolean only.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import type { IntegrationErrorLog, IntegrationErrorSeverity } from "@shared/schema";

export type SystemStatus = "ok" | "degraded" | "critical";

export interface WebhookSecretStatus {
  stripe: boolean;
  vapi: boolean;
  outreach: boolean;
}

export interface ErrorsSummary {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  by_integration: Array<{
    integration_name: string;
    severity: string;
    count: number;
  }>;
}

export interface RecentError {
  id: number;
  integration_name: string;
  area: string | null;
  severity: string;
  message: string;
  error_code: string | null;
  status_code: number | null;
  request_id: string | null;
  client_id: number | null;
  created_at: string;
}

export interface WorkerStatusRow {
  job_name: string;
  last_status: "completed" | "failed" | "running" | "unknown";
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
}

export interface QueueDepths {
  notification_queue_pending: number;
  followup_jobs_pending: number;
  dunning_events_pending: number;
  content_drafts_queued: number;
  content_drafts_publishing: number;
}

export interface SystemHealthReport {
  status: SystemStatus;
  generated_at: string;
  window_hours: number;
  webhook_secrets: WebhookSecretStatus;
  is_production: boolean;
  errors: ErrorsSummary;
  recent_critical: RecentError[];
  workers: WorkerStatusRow[];
  queue_depths: QueueDepths;
  alerts: string[];
}

function isoFromNow(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Map an integration_error_logs row to the JSON-safe shape. */
function toRecentError(row: IntegrationErrorLog): RecentError {
  return {
    id: row.id,
    integration_name: row.integration_name,
    area: row.area ?? null,
    severity: row.severity,
    message: row.message,
    error_code: row.error_code ?? null,
    status_code: row.status_code ?? null,
    request_id: row.request_id ?? null,
    client_id: row.client_id ?? null,
    created_at: (row.created_at as Date).toISOString(),
  };
}

async function getQueueDepths(): Promise<QueueDepths> {
  const rows: any = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM notification_queue WHERE status = 'pending')         AS notification_queue_pending,
      (SELECT COUNT(*)::int FROM followup_jobs       WHERE status = 'pending')         AS followup_jobs_pending,
      (SELECT COUNT(*)::int FROM billing_dunning_events WHERE status = 'pending')      AS dunning_events_pending,
      (SELECT COUNT(*)::int FROM content_drafts
         WHERE EXISTS (
           SELECT 1 FROM jsonb_each(metadata) e(k,v)
           WHERE v->>'queue_status' = 'queued'
         ))                                                                            AS content_drafts_queued,
      (SELECT COUNT(*)::int FROM content_drafts
         WHERE EXISTS (
           SELECT 1 FROM jsonb_each(metadata) e(k,v)
           WHERE v->>'queue_status' = 'publishing'
         ))                                                                            AS content_drafts_publishing
  `);
  const row = (rows?.rows ?? rows)?.[0] ?? {};
  return {
    notification_queue_pending: Number(row.notification_queue_pending ?? 0),
    followup_jobs_pending: Number(row.followup_jobs_pending ?? 0),
    dunning_events_pending: Number(row.dunning_events_pending ?? 0),
    content_drafts_queued: Number(row.content_drafts_queued ?? 0),
    content_drafts_publishing: Number(row.content_drafts_publishing ?? 0),
  };
}

/**
 * For each known job_name, fetch the most recent run plus the last
 * success and last failure (if any). Reads job_logs only — no
 * secrets, no PII.
 */
async function getWorkerStatuses(jobNames: string[]): Promise<WorkerStatusRow[]> {
  if (jobNames.length === 0) return [];
  const rows: any = await db.execute(sql`
    WITH last_run AS (
      SELECT DISTINCT ON (job_name)
        job_name, status, started_at, finished_at, error_message
      FROM job_logs
      WHERE job_name = ANY(${jobNames})
      ORDER BY job_name, started_at DESC
    ),
    last_ok AS (
      SELECT DISTINCT ON (job_name)
        job_name, started_at AS success_at
      FROM job_logs
      WHERE job_name = ANY(${jobNames}) AND status = 'completed'
      ORDER BY job_name, started_at DESC
    ),
    last_fail AS (
      SELECT DISTINCT ON (job_name)
        job_name, started_at AS failure_at
      FROM job_logs
      WHERE job_name = ANY(${jobNames}) AND status = 'failed'
      ORDER BY job_name, started_at DESC
    )
    SELECT
      lr.job_name,
      lr.status,
      lr.started_at,
      lr.finished_at,
      lr.error_message,
      lo.success_at,
      lf.failure_at
    FROM last_run lr
    LEFT JOIN last_ok   lo ON lo.job_name = lr.job_name
    LEFT JOIN last_fail lf ON lf.job_name = lr.job_name
  `);

  const list: any[] = (rows?.rows ?? rows) as any[];
  const byName = new Map<string, any>();
  for (const r of list) byName.set(String(r.job_name), r);

  return jobNames.map((name) => {
    const r = byName.get(name);
    if (!r) {
      return {
        job_name: name,
        last_status: "unknown",
        last_started_at: null,
        last_finished_at: null,
        last_error: null,
        last_success_at: null,
        last_failure_at: null,
      };
    }
    return {
      job_name: name,
      last_status: (r.status as WorkerStatusRow["last_status"]) ?? "unknown",
      last_started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
      last_finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      last_error: r.error_message ? String(r.error_message).slice(0, 500) : null,
      last_success_at: r.success_at ? new Date(r.success_at).toISOString() : null,
      last_failure_at: r.failure_at ? new Date(r.failure_at).toISOString() : null,
    };
  });
}

/** Job names worth surfacing on the system-health dashboard. */
const TRACKED_JOB_NAMES = [
  // Phase 3C-i: minute-tick workers
  "notification_worker",
  "followup_worker",
  "audit_followup_worker",
  "review_followup_worker",
  // Critical-path background workers
  "contentflow_publish_queue",
  "contentflow_performance",
  "dunning_queue",
  "outbound_sync",
  "review_request_delivery",
  // Daily / weekly cadence
  "daily_aggregation",
  "weekly_email_report",
  "trial_lifecycle",
  "review_monitoring",
  "reputation_reports",
  "socialsync_expiry_check",
  "socialsync_media_cleanup",
  "ops_daily_intelligence",
  "rankflow_tracking",
  "mapguard_weekly_scan",
];

function summarize(rows: Array<{ integration_name: string; severity: string; count: number }>): ErrorsSummary {
  const summary: ErrorsSummary = {
    total: 0,
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    by_integration: rows,
  };
  for (const r of rows) {
    summary.total += r.count;
    if (r.severity === "critical") summary.critical += r.count;
    else if (r.severity === "error") summary.error += r.count;
    else if (r.severity === "warning") summary.warning += r.count;
    else if (r.severity === "info") summary.info += r.count;
  }
  return summary;
}

function deriveStatus(args: {
  isProd: boolean;
  webhookSecrets: WebhookSecretStatus;
  errors24h: ErrorsSummary;
  errors1h_critical: number;
}): { status: SystemStatus; alerts: string[] } {
  const alerts: string[] = [];
  let status: SystemStatus = "ok";

  if (args.isProd) {
    if (!args.webhookSecrets.stripe) {
      alerts.push("STRIPE_BILLING_WEBHOOK_SECRET is not set in production");
      status = "critical";
    }
    if (!args.webhookSecrets.vapi) {
      alerts.push("VAPI_WEBHOOK_SECRET is not set in production");
      status = "critical";
    }
    if (!args.webhookSecrets.outreach) {
      alerts.push("OUTREACH_WEBHOOK_SECRET is not set in production");
      status = "critical";
    }
  }

  if (args.errors1h_critical > 0) {
    alerts.push(`${args.errors1h_critical} critical integration error(s) in the last hour`);
    status = "critical";
  }

  if (status !== "critical") {
    if (args.errors24h.critical > 0) {
      alerts.push(`${args.errors24h.critical} critical integration error(s) in the last 24h`);
      status = "degraded";
    } else if (args.errors24h.error > 5) {
      alerts.push(`${args.errors24h.error} integration error(s) in the last 24h`);
      status = "degraded";
    }
  }

  return { status, alerts };
}

export async function getSystemHealth(opts: { windowHours?: number } = {}): Promise<SystemHealthReport> {
  const windowHours = Math.max(1, Math.min(168, opts.windowHours ?? 24));
  const since24 = isoFromNow(windowHours);
  const since1h = isoFromNow(1);

  const isProd = process.env.NODE_ENV === "production";
  const webhookSecrets: WebhookSecretStatus = {
    stripe: !!process.env.STRIPE_BILLING_WEBHOOK_SECRET,
    vapi: !!process.env.VAPI_WEBHOOK_SECRET,
    outreach: !!process.env.OUTREACH_WEBHOOK_SECRET,
  };

  const [byIntegration, recentCritical, errors1h_critical, workers, queueDepths] = await Promise.all([
    storage.summarizeIntegrationErrors(since24),
    storage.listIntegrationErrors({
      since: since24,
      severities: ["critical"],
      limit: 20,
    }),
    storage.countIntegrationErrors({ since: since1h, severities: ["critical"] }),
    getWorkerStatuses(TRACKED_JOB_NAMES),
    getQueueDepths(),
  ]);

  const errors24h = summarize(byIntegration);
  const { status, alerts } = deriveStatus({
    isProd,
    webhookSecrets,
    errors24h,
    errors1h_critical,
  });

  return {
    status,
    generated_at: new Date().toISOString(),
    window_hours: windowHours,
    webhook_secrets: webhookSecrets,
    is_production: isProd,
    errors: errors24h,
    recent_critical: recentCritical.map(toRecentError),
    workers,
    queue_depths: queueDepths,
    alerts,
  };
}
