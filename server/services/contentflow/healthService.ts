/**
 * ContentFlow Sprint 18 — observability + operator dashboard.
 *
 * Read-only aggregations across content_drafts, job_logs, and
 * socialsync_platform_connections. Backend visibility only — no
 * schema changes, no UI.
 *
 * Three top-level functions back the three admin endpoints:
 *   getSystemHealth()      — overall status + alerts
 *   getChannelStatus()     — per-channel deep dive
 *   getClientHealth(id)    — per-client breakdown
 *
 * All queries are window-bounded (default 24h) and channel-scoped so
 * they stay fast on a growing drafts table.
 */

import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";

/* ─── Constants ──────────────────────────────────────────────────────── */

const CHANNELS = ["wordpress", "gbp", "facebook", "instagram", "gbp_post", "email"] as const;
type Channel = typeof CHANNELS[number];

/** Channel → metadata key for the success-stamp field. Used to detect
 * "published" status for success-rate calculations. */
const SUCCESS_FIELD: Record<Channel, string> = {
  wordpress: "post_id",
  gbp: "posted_at",
  facebook: "remote_post_id",
  instagram: "remote_post_id",
  gbp_post: "remote_post_id",
  email: "message_id",
};

/** Default lookback window for "recent" stats. Keeps queries quick. */
const DEFAULT_WINDOW_HOURS = 24;

/** Alert thresholds — operator-facing. Tunable later via env. */
const THRESHOLD_DEAD_LETTERED = 5;     // > triggers alert
const THRESHOLD_FAILED_24H = 10;
const THRESHOLD_SUCCESS_RATE = 0.8;    // < triggers alert
const THRESHOLD_DISCONNECTED_PCT = 0.2;
const THRESHOLD_WORKER_STALE_MIN = 15; // worker not run for X min

/* ─── Types (operator-friendly shapes) ─────────────────────────────── */

export type SystemStatus = "ok" | "degraded" | "critical";

export interface ChannelMetrics {
  queued: number;
  publishing: number;
  published_24h: number;
  failed_24h: number;
  dead_lettered: number;
  success_rate_24h: number; /* 0..1, NaN-safe (0 when no attempts) */
}

export interface WorkerStatus {
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  minutes_since_last_run: number | null;
}

export interface SystemHealth {
  status: SystemStatus;
  generated_at: string;
  queue: {
    by_channel: Partial<Record<Channel, ChannelMetrics>>;
    total_queued: number;
    total_failed_24h: number;
    total_dead_lettered: number;
  };
  publish_success_rate_24h: {
    overall: number;
    by_channel: Partial<Record<Channel, number>>;
  };
  workers: Record<string, WorkerStatus>;
  image_generation_24h: {
    succeeded: number;
    failed: number;
    success_rate: number;
  };
  alerts: string[];
}

export interface ChannelStatus {
  generated_at: string;
  channels: Record<Channel, ChannelMetrics & {
    recent_errors: Array<{ draft_id: number; error: string; at: string | null }>;
  }>;
  connections_by_platform: Record<string, {
    connected: number;
    expired: number;
    disconnected: number;
    other: number;
  }>;
}

export interface ClientHealth {
  client_id: number;
  business_name: string | null;
  generated_at: string;
  drafts_24h: { created: number; published: number; failed: number };
  channel_health: Partial<Record<Channel, ChannelMetrics>>;
  connections: Array<{
    platform: string;
    status: string;
    token_expires_at: string | null;
    last_validated_at: string | null;
  }>;
  recent_failures: Array<{ draft_id: number; channel: string; error: string; at: string | null }>;
  performance_summary: { high_performers: number; low_performers: number; tracked: number };
}

/* ─── Internal helpers ───────────────────────────────────────────────── */

function isoFromNow(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

/** Per-channel queue + 24h metrics. One scan, six aggregates. */
async function metricsForChannel(channel: Channel, since: string, clientId?: number): Promise<ChannelMetrics> {
  const successField = SUCCESS_FIELD[channel];
  const stampField = channel === "wordpress" ? "published_at"
    : channel === "email" ? "sent_at"
    : "posted_at";
  const clientFilter = clientId ? sql`AND client_id = ${clientId}` : sql``;
  const result: any = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE metadata->${channel}::text->>'queue_status' = 'queued') AS queued,
      count(*) FILTER (WHERE metadata->${channel}::text->>'queue_status' = 'publishing') AS publishing,
      count(*) FILTER (
        WHERE metadata->${channel}::text->>${stampField} IS NOT NULL
          AND (metadata->${channel}::text->>${stampField})::timestamptz >= ${since}::timestamptz
      ) AS published_24h,
      count(*) FILTER (
        WHERE metadata->${channel}::text->>'queue_status' = 'failed'
          AND (metadata->${channel}::text->>'dead_letter_at' IS NULL
               OR (metadata->${channel}::text->>'dead_letter_at')::timestamptz >= ${since}::timestamptz)
      ) AS failed_24h,
      count(*) FILTER (WHERE metadata->${channel}::text->>'dead_letter_at' IS NOT NULL) AS dead_lettered
    FROM content_drafts
    WHERE metadata ? ${channel}::text
    ${clientFilter}
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  const row = rows?.[0] ?? {};
  const queued = Number(row.queued ?? 0);
  const publishing = Number(row.publishing ?? 0);
  const published24 = Number(row.published_24h ?? 0);
  const failed24 = Number(row.failed_24h ?? 0);
  const deadLettered = Number(row.dead_lettered ?? 0);
  const totalAttempts = published24 + failed24;
  const successRate = totalAttempts > 0 ? published24 / totalAttempts : 0;
  return {
    queued,
    publishing,
    published_24h: published24,
    failed_24h: failed24,
    dead_lettered: deadLettered,
    success_rate_24h: Number.isFinite(successRate) ? successRate : 0,
  };
}

async function recentChannelErrors(channel: Channel, limit: number = 5): Promise<Array<{ draft_id: number; error: string; at: string | null }>> {
  const result: any = await db.execute(sql`
    SELECT
      id AS draft_id,
      metadata->${channel}::text->>'last_error' AS error,
      COALESCE(
        metadata->${channel}::text->>'dead_letter_at',
        metadata->${channel}::text->>'last_attempt_at'
      ) AS at
    FROM content_drafts
    WHERE metadata->${channel}::text->>'last_error' IS NOT NULL
    ORDER BY id DESC
    LIMIT ${limit}
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  return rows.map((r) => ({
    draft_id: Number(r.draft_id),
    error: String(r.error ?? "").slice(0, 300),
    at: r.at ? String(r.at) : null,
  }));
}

async function workerStatus(jobName: string): Promise<WorkerStatus> {
  const result: any = await db.execute(sql`
    SELECT started_at, finished_at, status, error_message
    FROM job_logs
    WHERE job_name = ${jobName}
    ORDER BY id DESC
    LIMIT 1
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  if (!rows.length) {
    return { last_run_at: null, last_status: null, last_error: null, minutes_since_last_run: null };
  }
  const row = rows[0];
  const lastRun = row.finished_at ?? row.started_at;
  const lastRunIso = lastRun ? new Date(lastRun).toISOString() : null;
  const minutes = lastRun ? Math.round((Date.now() - new Date(lastRun).getTime()) / 60_000) : null;
  return {
    last_run_at: lastRunIso,
    last_status: row.status ?? null,
    last_error: row.error_message ?? null,
    minutes_since_last_run: minutes,
  };
}

async function imageGenerationStats(since: string): Promise<{ succeeded: number; failed: number; success_rate: number }> {
  const result: any = await db.execute(sql`
    SELECT
      count(*) FILTER (
        WHERE metadata->>'image_generation_status' = 'succeeded'
          AND (metadata->>'image_generation_at')::timestamptz >= ${since}::timestamptz
      ) AS succeeded,
      count(*) FILTER (
        WHERE metadata->>'image_generation_status' = 'failed'
          AND (metadata->>'image_generation_at')::timestamptz >= ${since}::timestamptz
      ) AS failed
    FROM content_drafts
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  const succeeded = Number(rows?.[0]?.succeeded ?? 0);
  const failed = Number(rows?.[0]?.failed ?? 0);
  const total = succeeded + failed;
  return {
    succeeded,
    failed,
    success_rate: total > 0 ? succeeded / total : 0,
  };
}

async function connectionRollupByPlatform(): Promise<Record<string, { connected: number; expired: number; disconnected: number; other: number }>> {
  const result: any = await db.execute(sql`
    SELECT platform, connection_status, token_expires_at
    FROM socialsync_platform_connections
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  const out: Record<string, { connected: number; expired: number; disconnected: number; other: number }> = {};
  const now = Date.now();
  for (const r of rows) {
    const platform = String(r.platform ?? "unknown");
    const status = String(r.connection_status ?? "unknown");
    const expiresAt = r.token_expires_at ? new Date(r.token_expires_at).getTime() : null;
    out[platform] ??= { connected: 0, expired: 0, disconnected: 0, other: 0 };
    if (status === "connected" && expiresAt !== null && expiresAt < now) {
      out[platform].expired++;
    } else if (status === "connected") {
      out[platform].connected++;
    } else if (status === "disconnected") {
      out[platform].disconnected++;
    } else {
      out[platform].other++;
    }
  }
  return out;
}

/* ─── Public: getSystemHealth ────────────────────────────────────────── */

export async function getSystemHealth(opts: { windowHours?: number } = {}): Promise<SystemHealth> {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const since = isoFromNow(windowHours);

  const byChannel: Partial<Record<Channel, ChannelMetrics>> = {};
  let totalQueued = 0, totalFailed = 0, totalDead = 0;
  let totalPublished = 0, totalAttempts = 0;
  for (const ch of CHANNELS) {
    const m = await metricsForChannel(ch, since);
    byChannel[ch] = m;
    totalQueued += m.queued;
    totalFailed += m.failed_24h;
    totalDead += m.dead_lettered;
    totalPublished += m.published_24h;
    totalAttempts += m.published_24h + m.failed_24h;
  }
  const overallRate = totalAttempts > 0 ? totalPublished / totalAttempts : 0;
  const byChannelRate: Partial<Record<Channel, number>> = {};
  for (const ch of CHANNELS) byChannelRate[ch] = byChannel[ch]?.success_rate_24h ?? 0;

  const [pq, perf, imgGen] = await Promise.all([
    workerStatus("contentflow_publish_queue"),
    workerStatus("contentflow_performance"),
    imageGenerationStats(since),
  ]);

  /* Alerts — humans read these. Order by severity. */
  const alerts: string[] = [];
  if (totalDead > THRESHOLD_DEAD_LETTERED) {
    alerts.push(`dead_lettered=${totalDead} exceeds threshold ${THRESHOLD_DEAD_LETTERED}`);
  }
  if (totalFailed > THRESHOLD_FAILED_24H) {
    alerts.push(`failed_24h=${totalFailed} exceeds threshold ${THRESHOLD_FAILED_24H}`);
  }
  if (totalAttempts > 0 && overallRate < THRESHOLD_SUCCESS_RATE) {
    alerts.push(`publish_success_rate_24h=${overallRate.toFixed(2)} below threshold ${THRESHOLD_SUCCESS_RATE}`);
  }
  if (pq.minutes_since_last_run !== null && pq.minutes_since_last_run > THRESHOLD_WORKER_STALE_MIN) {
    alerts.push(`contentflow_publish_queue worker stale: ${pq.minutes_since_last_run}min since last run`);
  }
  if (pq.last_status && pq.last_status !== "ok" && pq.last_status !== "success") {
    alerts.push(`contentflow_publish_queue last_status=${pq.last_status}`);
  }
  if (imgGen.failed > 0 && imgGen.succeeded + imgGen.failed > 5 && imgGen.success_rate < THRESHOLD_SUCCESS_RATE) {
    alerts.push(`image_generation_24h success_rate=${imgGen.success_rate.toFixed(2)} below threshold`);
  }

  /* Status: critical if any worker stale OR dead-letter > 2x threshold;
   * degraded if any other alert; ok otherwise. */
  let status: SystemStatus = "ok";
  if (alerts.length > 0) status = "degraded";
  if (
    totalDead > THRESHOLD_DEAD_LETTERED * 2 ||
    (pq.minutes_since_last_run !== null && pq.minutes_since_last_run > THRESHOLD_WORKER_STALE_MIN * 2)
  ) status = "critical";

  return {
    status,
    generated_at: new Date().toISOString(),
    queue: {
      by_channel: byChannel,
      total_queued: totalQueued,
      total_failed_24h: totalFailed,
      total_dead_lettered: totalDead,
    },
    publish_success_rate_24h: {
      overall: Number.isFinite(overallRate) ? overallRate : 0,
      by_channel: byChannelRate,
    },
    workers: {
      contentflow_publish_queue: pq,
      contentflow_performance: perf,
    },
    image_generation_24h: imgGen,
    alerts,
  };
}

/* ─── Public: getChannelStatus ───────────────────────────────────────── */

export async function getChannelStatus(opts: { windowHours?: number } = {}): Promise<ChannelStatus> {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const since = isoFromNow(windowHours);

  const channels: any = {};
  for (const ch of CHANNELS) {
    const [m, errs] = await Promise.all([
      metricsForChannel(ch, since),
      recentChannelErrors(ch, 5),
    ]);
    channels[ch] = { ...m, recent_errors: errs };
  }
  const connections = await connectionRollupByPlatform();

  return {
    generated_at: new Date().toISOString(),
    channels: channels as ChannelStatus["channels"],
    connections_by_platform: connections,
  };
}

/* ─── Public: getClientHealth ────────────────────────────────────────── */

export async function getClientHealth(clientId: number, opts: { windowHours?: number } = {}): Promise<ClientHealth | null> {
  const client = await storage.getClientById(clientId);
  if (!client) return null;

  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const since = isoFromNow(windowHours);

  /* Per-channel metrics scoped to this client. */
  const channelHealth: Partial<Record<Channel, ChannelMetrics>> = {};
  for (const ch of CHANNELS) {
    channelHealth[ch] = await metricsForChannel(ch, since, clientId);
  }

  /* Drafts 24h — created / published / failed. */
  const draftsResult: any = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE created_at >= ${since}::timestamptz) AS created,
      count(*) FILTER (WHERE status = 'published' AND created_at >= ${since}::timestamptz) AS published,
      count(*) FILTER (WHERE status = 'failed' AND created_at >= ${since}::timestamptz) AS failed
    FROM content_drafts
    WHERE client_id = ${clientId}
  `);
  const draftsRow = (draftsResult?.rows ?? draftsResult)?.[0] ?? {};

  /* Connections (no token leak — token_ref omitted). */
  const connsResult: any = await db.execute(sql`
    SELECT platform, connection_status, token_expires_at, last_validated_at
    FROM socialsync_platform_connections
    WHERE client_id = ${clientId}
  `);
  const connsRows: any[] = (connsResult?.rows ?? connsResult) as any[];
  const connections = connsRows.map((r) => ({
    platform: String(r.platform ?? "unknown"),
    status: String(r.connection_status ?? "unknown"),
    token_expires_at: r.token_expires_at ? new Date(r.token_expires_at).toISOString() : null,
    last_validated_at: r.last_validated_at ? new Date(r.last_validated_at).toISOString() : null,
  }));

  /* Recent failures across channels. */
  const recentFailures: Array<{ draft_id: number; channel: string; error: string; at: string | null }> = [];
  for (const ch of CHANNELS) {
    const errResult: any = await db.execute(sql`
      SELECT
        id AS draft_id,
        metadata->${ch}::text->>'last_error' AS error,
        COALESCE(
          metadata->${ch}::text->>'dead_letter_at',
          metadata->${ch}::text->>'last_attempt_at'
        ) AS at
      FROM content_drafts
      WHERE client_id = ${clientId}
        AND metadata->${ch}::text->>'last_error' IS NOT NULL
      ORDER BY id DESC
      LIMIT 3
    `);
    const errRows: any[] = (errResult?.rows ?? errResult) as any[];
    for (const e of errRows) {
      recentFailures.push({
        draft_id: Number(e.draft_id),
        channel: ch,
        error: String(e.error ?? "").slice(0, 300),
        at: e.at ? String(e.at) : null,
      });
    }
  }

  /* Performance summary. */
  const perfResult: any = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE metadata->'performance_flags'->>'high_performer' = 'true') AS high_performers,
      count(*) FILTER (WHERE metadata->'performance_flags'->>'low_performer' = 'true') AS low_performers,
      count(*) FILTER (WHERE metadata->'performance' IS NOT NULL) AS tracked
    FROM content_drafts
    WHERE client_id = ${clientId}
  `);
  const perfRow = (perfResult?.rows ?? perfResult)?.[0] ?? {};

  return {
    client_id: clientId,
    business_name: ((client as any).business_name as string | null) ?? null,
    generated_at: new Date().toISOString(),
    drafts_24h: {
      created: Number(draftsRow.created ?? 0),
      published: Number(draftsRow.published ?? 0),
      failed: Number(draftsRow.failed ?? 0),
    },
    channel_health: channelHealth,
    connections,
    recent_failures: recentFailures,
    performance_summary: {
      high_performers: Number(perfRow.high_performers ?? 0),
      low_performers: Number(perfRow.low_performers ?? 0),
      tracked: Number(perfRow.tracked ?? 0),
    },
  };
}
