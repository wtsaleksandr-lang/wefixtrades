/**
 * ContentFlow Sprint 17 — performance worker.
 *
 * Cron-driven. Every tick:
 *   1. List recently-published drafts whose performance hasn't been
 *      fetched in the last FRESHNESS_MINUTES.
 *   2. For each: call the per-channel collector (safe, no-throw,
 *      gracefully no-data when no API is wired).
 *   3. Compute the engagement score and high/low flags.
 *   4. Merge into metadata.performance + metadata.performance_flags.
 *
 * Hard rules:
 *   - never throws (caller wraps for jobLogs)
 *   - batches up to MAX_PER_RUN drafts so a backlog can't blow up a tick
 *   - skips drafts with fresh metrics (avoids API re-hammering)
 */

import {
  computePerformanceScore,
  flagsForScore,
  listRecentPublishedDrafts,
  mergePerformance,
  performanceChannelForDraft,
  FRESHNESS_MINUTES,
  type PerformanceData,
} from "../services/contentflow/performanceTracker";
import { collectForDraft } from "../services/contentflow/performanceCollectors";

/* Conservative batch ceiling — keeps a tick under control if a
 * customer ramps up posting volume. Cron runs every 30 min. */
export const MAX_PER_RUN = 50;
export const WINDOW_DAYS = 7;

export interface PerformanceWorkerSummary {
  scanned: number;
  updated: number;
  skipped: number;
  errors: string[];
  byChannel: Record<string, { scanned: number; updated: number; skipped: number }>;
}

const emptyChannel = () => ({ scanned: 0, updated: 0, skipped: 0 });

export async function processPerformanceQueue(): Promise<PerformanceWorkerSummary> {
  const summary: PerformanceWorkerSummary = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    byChannel: {
      facebook: emptyChannel(),
      instagram: emptyChannel(),
      google_business: emptyChannel(),
      wordpress: emptyChannel(),
      email: emptyChannel(),
    },
  };

  let drafts;
  try {
    drafts = await listRecentPublishedDrafts({
      windowDays: WINDOW_DAYS,
      freshnessMinutes: FRESHNESS_MINUTES,
      limit: MAX_PER_RUN,
    });
  } catch (err: any) {
    summary.errors.push(`listRecentPublishedDrafts failed: ${err?.message || err}`);
    return summary;
  }

  for (const draft of drafts) {
    summary.scanned++;
    const channel = performanceChannelForDraft(draft);
    if (!channel) {
      summary.skipped++;
      continue;
    }
    summary.byChannel[channel].scanned++;
    let collectorRes;
    try {
      collectorRes = await collectForDraft(draft, channel);
    } catch (err: any) {
      /* Defence-in-depth — collectForDraft is already wrapped, but
       * keep the worker bulletproof. */
      summary.errors.push(`collect draft ${draft.id} (${channel}) threw: ${err?.message || err}`);
      summary.skipped++;
      summary.byChannel[channel].skipped++;
      continue;
    }
    if (!collectorRes.ok) {
      summary.skipped++;
      summary.byChannel[channel].skipped++;
      continue;
    }

    const partial: Partial<PerformanceData> = collectorRes.data ?? { channel };
    /* Sprint 17: merge collector output with existing performance
     * counts so a "no API yet" collector doesn't blow away counts
     * that arrived via another source (manual import, future
     * webhook, pre-seeded test data). When the collector returns
     * concrete numeric fields, they overwrite. When it returns
     * undefined, existing values are preserved. */
    const now = new Date().toISOString();
    const meta = (draft.metadata || {}) as Record<string, any>;
    const existingPerf = (meta.performance || {}) as Partial<PerformanceData>;
    const merged: Partial<PerformanceData> = {
      ...existingPerf,
      ...partial,
      channel,
      fetched_at: now,
    };
    const score = computePerformanceScore(merged);
    merged.score = score;
    const flags = flagsForScore(score);

    try {
      await mergePerformance(draft.id, merged, flags);
      summary.updated++;
      summary.byChannel[channel].updated++;
    } catch (err: any) {
      summary.errors.push(`mergePerformance draft ${draft.id} (${channel}) failed: ${err?.message || err}`);
      summary.byChannel[channel].skipped++;
    }
  }

  return summary;
}
