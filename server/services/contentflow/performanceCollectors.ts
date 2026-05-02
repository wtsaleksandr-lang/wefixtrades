/**
 * ContentFlow — performance collectors.
 *
 * Per-channel fetchers that pull engagement data into a uniform
 * PerformanceData shape. EVERY collector:
 *   - never throws (returns null on any error)
 *   - is optional — skips silently when no API config is present
 *   - is fast — single API hit, short timeout, no pagination
 *
 * Sprint 18: real API calls for Facebook and Instagram Graph API when
 * env-gated via CONTENTFLOW_FB_INSIGHTS=1 / CONTENTFLOW_IG_INSIGHTS=1.
 * GBP local posts remain a stub (Google deprecated the insights API).
 * WordPress uses internal tracking signals only.
 */

import type { ContentDraft } from "@shared/schema";
import {
  publishedAtForDraft,
  type PerformanceChannel,
  type PerformanceData,
} from "./performanceTracker";
import { getFacebookPageToken } from "../socialSync/facebookService";
import { getInstagramPublishCredentials } from "../socialSync/instagramService";
import { createLogger } from "../../lib/logger";

const log = createLogger("PerfCollectors");

/* Per-channel toggle. Default OFF — env var gates real API hits. */
const FB_INSIGHTS_ENABLED = process.env.CONTENTFLOW_FB_INSIGHTS === "1";
const IG_INSIGHTS_ENABLED = process.env.CONTENTFLOW_IG_INSIGHTS === "1";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const FETCH_TIMEOUT_MS = 8_000;

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
    log.warn(`channel=${channel} draft=${draft.id} threw: ${err?.message || err}`);
    return { ok: false, reason: "fetch_failed" };
  }
}

/* ─── Facebook ────────────────────────────────────────────────────── */

async function collectFacebook(draft: ContentDraft): Promise<CollectorResult> {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const remoteId = meta.facebook?.remote_post_id as string | undefined;
  if (!remoteId) return { ok: false, reason: "no_remote_id" };
  if (!FB_INSIGHTS_ENABLED) {
    return { ok: true, data: { channel: "facebook" } };
  }

  /* Real Graph API insights:
   * GET /{post_id}/insights?metric=post_impressions,post_clicks,post_reactions_like_total */
  const creds = await getFacebookPageToken(draft.client_id);
  if (!creds) {
    log.debug(`No Facebook token for client=${draft.client_id}, skipping insights`);
    return { ok: true, data: { channel: "facebook" } };
  }

  try {
    const metrics = "post_impressions,post_clicks,post_reactions_like_total";
    const url = `${GRAPH_API_BASE}/${remoteId}/insights?metric=${metrics}&access_token=${creds.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log.warn(`Facebook insights API ${resp.status} for post=${remoteId}: ${text.slice(0, 200)}`);
      return { ok: true, data: { channel: "facebook" } };
    }

    const body = await resp.json() as any;
    const dataArr = body?.data as Array<{ name: string; values?: Array<{ value: number }> }> | undefined;

    let impressions = 0;
    let clicks = 0;
    let reactions = 0;

    if (Array.isArray(dataArr)) {
      for (const metric of dataArr) {
        const val = metric.values?.[0]?.value ?? 0;
        switch (metric.name) {
          case "post_impressions":
            impressions = val;
            break;
          case "post_clicks":
            clicks = val;
            break;
          case "post_reactions_like_total":
            reactions = val;
            break;
        }
      }
    }

    /* Also fetch shares + comments from the post object itself */
    let shares = 0;
    let comments = 0;
    try {
      const postUrl = `${GRAPH_API_BASE}/${remoteId}?fields=shares,comments.summary(true)&access_token=${creds.token}`;
      const postResp = await fetch(postUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (postResp.ok) {
        const postData = await postResp.json() as any;
        shares = postData?.shares?.count ?? 0;
        comments = postData?.comments?.summary?.total_count ?? 0;
      }
    } catch {
      /* Non-critical — shares/comments are bonus data */
    }

    return {
      ok: true,
      data: {
        channel: "facebook",
        impressions,
        clicks,
        reactions,
        shares,
        comments,
      },
    };
  } catch (err: any) {
    log.warn(`Facebook insights fetch failed for post=${remoteId}: ${err?.message || err}`);
    return { ok: true, data: { channel: "facebook" } };
  }
}

/* ─── Instagram ───────────────────────────────────────────────────── */

async function collectInstagram(draft: ContentDraft): Promise<CollectorResult> {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const remoteId = meta.instagram?.remote_post_id as string | undefined;
  if (!remoteId) return { ok: false, reason: "no_remote_id" };
  if (!IG_INSIGHTS_ENABLED) {
    return { ok: true, data: { channel: "instagram" } };
  }

  /* Real Instagram Graph API insights:
   * GET /{media_id}/insights?metric=impressions,reach,engagement */
  const creds = await getInstagramPublishCredentials(draft.client_id);
  if (!creds) {
    log.debug(`No Instagram token for client=${draft.client_id}, skipping insights`);
    return { ok: true, data: { channel: "instagram" } };
  }

  try {
    const metrics = "impressions,reach,engagement";
    const url = `${GRAPH_API_BASE}/${remoteId}/insights?metric=${metrics}&access_token=${creds.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      log.warn(`Instagram insights API ${resp.status} for media=${remoteId}: ${text.slice(0, 200)}`);
      return { ok: true, data: { channel: "instagram" } };
    }

    const body = await resp.json() as any;
    const dataArr = body?.data as Array<{ name: string; values?: Array<{ value: number }> }> | undefined;

    let impressions = 0;
    let reach = 0;
    let engagement = 0;

    if (Array.isArray(dataArr)) {
      for (const metric of dataArr) {
        const val = metric.values?.[0]?.value ?? 0;
        switch (metric.name) {
          case "impressions":
            impressions = val;
            break;
          case "reach":
            reach = val;
            break;
          case "engagement":
            engagement = val;
            break;
        }
      }
    }

    /* Fetch likes, comments, saves from the media object */
    let likes = 0;
    let comments = 0;
    let saved = 0;
    try {
      const mediaUrl = `${GRAPH_API_BASE}/${remoteId}?fields=like_count,comments_count&access_token=${creds.token}`;
      const mediaResp = await fetch(mediaUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (mediaResp.ok) {
        const mediaData = await mediaResp.json() as any;
        likes = mediaData?.like_count ?? 0;
        comments = mediaData?.comments_count ?? 0;
      }
    } catch {
      /* Non-critical */
    }

    /* saved metric via insights (only available for some content types) */
    try {
      const savedUrl = `${GRAPH_API_BASE}/${remoteId}/insights?metric=saved&access_token=${creds.token}`;
      const savedResp = await fetch(savedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (savedResp.ok) {
        const savedBody = await savedResp.json() as any;
        const savedMetric = savedBody?.data?.find?.((m: any) => m.name === "saved");
        saved = savedMetric?.values?.[0]?.value ?? 0;
      }
    } catch {
      /* Non-critical */
    }

    return {
      ok: true,
      data: {
        channel: "instagram",
        impressions,
        clicks: reach, // Using reach as the closest analog to clicks for IG
        reactions: likes,
        comments,
        shares: saved, // Saves mapped to shares slot for scoring
        engagement_rate: impressions > 0 ? engagement / impressions : 0,
      },
    };
  } catch (err: any) {
    log.warn(`Instagram insights fetch failed for media=${remoteId}: ${err?.message || err}`);
    return { ok: true, data: { channel: "instagram" } };
  }
}

/* ─── GBP local posts ─────────────────────────────────────────────── */

function collectGbpPost(draft: ContentDraft): CollectorResult {
  /* GBP local post insights API was deprecated by Google. Keep as a
   * stub that returns null metrics — log a note for observability. */
  const publishedAt = publishedAtForDraft(draft);
  if (!publishedAt) return { ok: false, reason: "no_remote_id" };
  log.debug(`GBP insights unavailable (deprecated API) for draft=${draft.id}`);
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
  /* WordPress REST API stats can be fetched via Jetpack Stats or
   * WP.com stats plugin. Currently tracked via internal click tracking
   * only — no external API call needed. */
  return { ok: true, data: { channel: "wordpress" } };
}

/* ─── Email ───────────────────────────────────────────────────────── */

function collectEmail(draft: ContentDraft): CollectorResult {
  const meta = (draft.metadata || {}) as Record<string, any>;
  if (!meta.email?.message_id) return { ok: false, reason: "no_remote_id" };
  /* Send result only — tracked elsewhere. */
  return { ok: true, data: { channel: "email" } };
}
