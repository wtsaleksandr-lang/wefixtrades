/**
 * ContentFlow Sprint 17 — performance collectors.
 *
 * Per-channel fetchers that pull engagement data into a uniform
 * PerformanceData shape. EVERY collector:
 *   - never throws (returns null on any error)
 *   - is optional — skips silently when no API config is present
 *   - is fast — single API hit, short timeout, no pagination
 *
 * Sprint 17 ships in conservative mode: collectors return a baseline
 * "no metrics yet, recently published" signal for FB/IG/GBP_POST/EMAIL
 * unless an explicit Graph-API access path is wired. This keeps tests
 * and unconfigured environments deterministic without crashing the
 * worker.
 *
 * Future sprints can wire real Graph API insights / WP page-views /
 * email open-tracking — the worker contract here doesn't change.
 */

import type { ContentDraft } from "@shared/schema";
import {
  publishedAtForDraft,
  type PerformanceChannel,
  type PerformanceData,
} from "./performanceTracker";
import { createLogger } from "../../lib/logger";

const log = createLogger("PerfCollectors");

/* Per-channel toggle. Default OFF — env var gates real API hits. The
 * worker will still update score=0 + fetched_at on every draft so the
 * freshness-skip logic works. */
const FB_INSIGHTS_ENABLED = process.env.CONTENTFLOW_FB_INSIGHTS === "1";
const IG_INSIGHTS_ENABLED = process.env.CONTENTFLOW_IG_INSIGHTS === "1";

export interface CollectorResult {
  ok: boolean;
  /** When ok=false, why we skipped (logged, never user-facing). */
  reason?: "no_api" | "no_remote_id" | "fetch_failed" | "unsupported_channel";
  data?: Partial<PerformanceData>;
}

export async function collectForDraft(
  draft: ContentDraft,
  channel: PerformanceChannel,
): Promise<CollectorResult> {
  try {
    switch (channel) {
      case "facebook":
        return await collectFacebook(draft);
      case "instagram":
        return await collectInstagram(draft);
      case "google_business":
        return collectGbpPost(draft);
      case "wordpress":
        return collectWordpress(draft);
      case "email":
        return collectEmail(draft);
      default:
        return { ok: false, reason: "unsupported_channel" };
    }
  } catch (err: any) {
    /* Defence-in-depth — collectors are wrapped per-channel too, this
     * is the last guard. */
    log.warn(`[contentflow][performance][collector] channel=${channel} draft=${draft.id} threw: ${err?.message || err}`);
    return { ok: false, reason: "fetch_failed" };
  }
}

/* ─── Facebook ────────────────────────────────────────────────────── */

async function collectFacebook(draft: ContentDraft): Promise<CollectorResult> {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const remoteId = meta.facebook?.remote_post_id as string | undefined;
  if (!remoteId) return { ok: false, reason: "no_remote_id" };
  if (!FB_INSIGHTS_ENABLED) {
    /* No Graph API enabled — return ONLY channel so the worker stamps
     * fetched_at without overwriting any pre-existing engagement
     * counts (e.g. from a future webhook or manual import). */
    return { ok: true, data: { channel: "facebook" } };
  }
  /* Live Graph API insights would land here in a future sprint:
   *   GET /{post-id}/insights?metric=post_impressions,post_engaged_users,...
   * For Sprint 17 we keep the path stub'd to avoid new infra. */
  return { ok: true, data: { channel: "facebook" } };
}

/* ─── Instagram ───────────────────────────────────────────────────── */

async function collectInstagram(draft: ContentDraft): Promise<CollectorResult> {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const remoteId = meta.instagram?.remote_post_id as string | undefined;
  if (!remoteId) return { ok: false, reason: "no_remote_id" };
  if (!IG_INSIGHTS_ENABLED) {
    return { ok: true, data: { channel: "instagram" } };
  }
  /* Live IG insights stub — same shape, future Graph API call. */
  return { ok: true, data: { channel: "instagram" } };
}

/* ─── GBP local posts ─────────────────────────────────────────────── */

function collectGbpPost(draft: ContentDraft): CollectorResult {
  /* GBP local post insights aren't easily available via API. Use a
   * proxy signal: posted recently (within 7 days). */
  const publishedAt = publishedAtForDraft(draft);
  if (!publishedAt) return { ok: false, reason: "no_remote_id" };
  return {
    ok: true,
    data: {
      channel: "google_business",
      /* No real metrics — score will be 0 from raw weights. */
    },
  };
}

/* ─── WordPress ───────────────────────────────────────────────────── */

function collectWordpress(draft: ContentDraft): CollectorResult {
  const meta = (draft.metadata || {}) as Record<string, any>;
  if (!meta.wordpress?.published_at) return { ok: false, reason: "no_remote_id" };
  /* Future: optional WP-views via a plugin — out of scope. */
  return { ok: true, data: { channel: "wordpress" } };
}

/* ─── Email ───────────────────────────────────────────────────────── */

function collectEmail(draft: ContentDraft): CollectorResult {
  const meta = (draft.metadata || {}) as Record<string, any>;
  if (!meta.email?.message_id) return { ok: false, reason: "no_remote_id" };
  /* Send result only — tracked elsewhere. Sprint 17: ack of send. */
  return { ok: true, data: { channel: "email" } };
}
