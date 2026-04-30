/**
 * ContentFlow — queue metrics aggregation (Sprint 10).
 *
 * Reads per-channel counters out of job_logs.metadata for the
 * 'contentflow_publish_queue' job and rolls them up across the
 * requested window. No new metrics table — every cron tick already
 * writes its summary into job_logs as part of `runJob`'s standard
 * lifecycle.
 *
 * Counters per channel:
 *   success            — total successful publishes
 *   failed             — moved to dead-letter (queue_status='failed')
 *   retried            — soft retries (attempts < MAX_ATTEMPTS)
 *   cooldown_skipped   — Sprint 10 — adapter detected platform cooldown
 *   avg_publish_ms     — total_duration_ms / max(scanned, 1) per channel
 */

import { sql } from "drizzle-orm";
import { db } from "../../db";

export interface ChannelCounters {
  scanned: number;
  success: number;
  failed: number;
  retried: number;
  cooldown_skipped: number;
  avg_publish_ms: number;
}

export interface QueueMetricsResult {
  window_days: number;
  runs_observed: number;
  channels: {
    wordpress: ChannelCounters;
    gbp: ChannelCounters;
    facebook: ChannelCounters;
    instagram: ChannelCounters;
    gbp_post: ChannelCounters;
  };
}

const ZERO: ChannelCounters = { scanned: 0, success: 0, failed: 0, retried: 0, cooldown_skipped: 0, avg_publish_ms: 0 };

export async function getQueueMetrics(days: number): Promise<QueueMetricsResult> {
  const result: any = await db.execute(sql`
    SELECT metadata
    FROM job_logs
    WHERE job_name = 'contentflow_publish_queue'
      AND status = 'completed'
      AND finished_at IS NOT NULL
      AND finished_at >= NOW() - (${days}::int || ' days')::interval
  `);
  const rows: Array<{ metadata: any }> = (result?.rows ?? result) as any[];

  const channelKeys: Array<keyof QueueMetricsResult["channels"]> = [
    "wordpress", "gbp", "facebook", "instagram", "gbp_post",
  ];
  const counters: Record<string, ChannelCounters & { _scanned_total: number; _duration_total: number }> = {};
  for (const k of channelKeys) {
    counters[k] = { ...ZERO, _scanned_total: 0, _duration_total: 0 };
  }
  let runs = 0;

  for (const row of rows) {
    const meta = row.metadata as any;
    if (!meta || !meta.channels) continue;
    runs++;
    for (const k of channelKeys) {
      const ch = meta.channels?.[k];
      if (!ch) continue;
      counters[k].scanned += ch.scanned ?? 0;
      counters[k].success += ch.published ?? 0;
      counters[k].failed += ch.failed ?? 0;
      counters[k].retried += ch.retried ?? 0;
      counters[k].cooldown_skipped += ch.cooldown_skipped ?? 0;
      counters[k]._duration_total += ch.total_duration_ms ?? 0;
      counters[k]._scanned_total += ch.scanned ?? 0;
    }
  }

  const out: any = {};
  for (const k of channelKeys) {
    const c = counters[k];
    out[k] = {
      scanned: c.scanned,
      success: c.success,
      failed: c.failed,
      retried: c.retried,
      cooldown_skipped: c.cooldown_skipped,
      avg_publish_ms: c._scanned_total > 0
        ? Math.round((c._duration_total / c._scanned_total) * 100) / 100
        : 0,
    };
  }

  return {
    window_days: days,
    runs_observed: runs,
    channels: out,
  };
}
