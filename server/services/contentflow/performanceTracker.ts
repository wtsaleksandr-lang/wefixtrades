/**
 * ContentFlow Sprint 17 — performance tracker.
 *
 * Stores per-draft performance signals on content_drafts.metadata
 * (no schema migration). Drives the feedback loop in generators —
 * recent high-performer patterns get injected into prompts so future
 * output trends towards what's working for that client + channel.
 *
 * Shape:
 *   metadata.performance = {
 *     channel:           "facebook" | "instagram" | "google_business"
 *                       | "wordpress" | "email",
 *     impressions?:      number,
 *     clicks?:           number,
 *     reactions?:        number,
 *     comments?:         number,
 *     shares?:           number,
 *     ctr?:              number,
 *     engagement_rate?:  number,
 *     score?:            number   // 0-100 normalized
 *     fetched_at?:       ISO string
 *   }
 *   metadata.performance_flags = {
 *     high_performer?: boolean,
 *     low_performer?:  boolean,
 *     needs_refresh?:  boolean,
 *   }
 *
 * Backend-only intelligence — no dashboards, no UI.
 */

import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { contentDrafts } from "@shared/schema";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("PerfTracker");

export type PerformanceChannel =
  | "facebook"
  | "instagram"
  | "google_business"
  | "wordpress"
  | "email";

export interface PerformanceData {
  channel: PerformanceChannel;
  impressions?: number;
  clicks?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  ctr?: number;
  engagement_rate?: number;
  score?: number;
  fetched_at?: string;
}

export interface PerformanceFlags {
  high_performer?: boolean;
  low_performer?: boolean;
  needs_refresh?: boolean;
}

/* ─── Scoring ────────────────────────────────────────────────────────── */

/**
 * Basic engagement-weighted score (0–100). Weights match the brief:
 *   reactions × 1, comments × 3, shares × 5, clicks × 2.
 * Saturates at 100 so a single viral post can't drown out everything
 * else when extracting patterns. Missing fields treated as 0 — no
 * external API → score 0 → low_performer (won't be injected back into
 * prompts as a "successful" pattern).
 */
export function computePerformanceScore(perf: Partial<PerformanceData>): number {
  const reactions = num(perf.reactions);
  const comments = num(perf.comments);
  const shares = num(perf.shares);
  const clicks = num(perf.clicks);
  const raw = reactions * 1 + comments * 3 + shares * 5 + clicks * 2;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(100, Math.round(raw));
}

function num(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return v;
}

/* Thresholds — kept simple per the brief. Tunable later via env if
 * customer ranges differ. */
export const HIGH_PERFORMER_THRESHOLD = 70;
export const LOW_PERFORMER_THRESHOLD = 20;
/** A draft's performance is considered "fresh" for this many minutes
 * after it was last fetched — the worker skips re-fetching to avoid
 * API abuse. */
export const FRESHNESS_MINUTES = 30;

export function flagsForScore(score: number): PerformanceFlags {
  return {
    high_performer: score >= HIGH_PERFORMER_THRESHOLD,
    low_performer: score <= LOW_PERFORMER_THRESHOLD,
  };
}

/* ─── Read / write ───────────────────────────────────────────────────── */

export function readPerformance(draft: ContentDraft): {
  performance: PerformanceData | null;
  flags: PerformanceFlags;
} {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const perf = (meta.performance && typeof meta.performance === "object" ? meta.performance : null) as PerformanceData | null;
  const flags = (meta.performance_flags && typeof meta.performance_flags === "object"
    ? meta.performance_flags
    : {}) as PerformanceFlags;
  return { performance: perf, flags };
}

/** Race-protected merge into metadata.performance + metadata.performance_flags.
 * Re-reads fresh draft, shallow-merges patches, writes back. Mirrors
 * mergeChannelMetadata / mergeCalendarMetadata. */
export async function mergePerformance(
  draftId: number,
  perfPatch: Partial<PerformanceData>,
  flagsPatch: Partial<PerformanceFlags> = {},
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const existingPerf = (meta.performance || {}) as Record<string, any>;
  const existingFlags = (meta.performance_flags || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: {
      ...meta,
      performance: { ...existingPerf, ...perfPatch },
      performance_flags: { ...existingFlags, ...flagsPatch },
    },
  } as any);
}

/* ─── Channel detection ──────────────────────────────────────────────── */

/** Map a draft to its performance channel. Reads target_platform with
 * fall-through for kind/surface oddities. Returns null if the draft
 * has no publishable channel. */
export function performanceChannelForDraft(draft: ContentDraft): PerformanceChannel | null {
  const tp = draft.target_platform;
  if (tp === "facebook") return "facebook";
  if (tp === "instagram") return "instagram";
  if (tp === "google_business") return "google_business";
  if (tp === "email") return "email";
  if (draft.kind === "article" && draft.surface === "rankflow") return "wordpress";
  return null;
}

/** A draft is considered published for performance purposes when its
 * adapter has stamped a success marker — posted_at / message_id /
 * post_id depending on the channel. */
export function publishedAtForDraft(draft: ContentDraft): string | null {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const channel = performanceChannelForDraft(draft);
  if (!channel) return null;
  if (channel === "facebook") return meta.facebook?.posted_at ?? null;
  if (channel === "instagram") return meta.instagram?.posted_at ?? null;
  if (channel === "google_business") return meta.gbp_post?.posted_at ?? null;
  if (channel === "email") return meta.email?.sent_at ?? null;
  if (channel === "wordpress") return meta.wordpress?.published_at ?? null;
  return null;
}

/* ─── Recent-published query ─────────────────────────────────────────── */

/** Recent published drafts whose performance hasn't been fetched in
 * the last `freshnessMinutes`. Limited to drafts published in the
 * last `windowDays` so we don't churn over historical archive forever.
 *
 * Returns ALL channels — caller filters as needed. */
export async function listRecentPublishedDrafts(opts: {
  windowDays?: number;
  freshnessMinutes?: number;
  limit?: number;
} = {}): Promise<ContentDraft[]> {
  const windowDays = opts.windowDays ?? 7;
  const freshnessMinutes = opts.freshnessMinutes ?? FRESHNESS_MINUTES;
  const limit = opts.limit ?? 50;
  const cutoff = new Date(Date.now() - windowDays * 24 * 3600_000).toISOString();
  const freshCutoff = new Date(Date.now() - freshnessMinutes * 60_000).toISOString();
  const result: any = await db.execute(sql`
    SELECT * FROM content_drafts
    WHERE status = 'published'
      AND (
        metadata->'facebook'->>'posted_at' >= ${cutoff}
        OR metadata->'instagram'->>'posted_at' >= ${cutoff}
        OR metadata->'gbp_post'->>'posted_at' >= ${cutoff}
        OR metadata->'wordpress'->>'published_at' >= ${cutoff}
        OR metadata->'email'->>'sent_at' >= ${cutoff}
      )
      AND (
        metadata->'performance'->>'fetched_at' IS NULL
        OR (metadata->'performance'->>'fetched_at')::timestamptz < ${freshCutoff}::timestamptz
      )
    ORDER BY id DESC
    LIMIT ${limit}
  `);
  const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
  return Array.isArray(rows) ? rows : [];
}

/* ─── Feedback loop helpers ──────────────────────────────────────────── */

/** Recent high-performer drafts for (clientId, channel). Used by
 * generators to extract patterns. Bounded to the most recent N high
 * performers to keep prompts small. */
export async function listRecentHighPerformers(
  clientId: number,
  channel: PerformanceChannel | null,
  limit: number = 5,
): Promise<ContentDraft[]> {
  const channelFilter = channel
    ? sql`AND target_platform = ${channelFor(channel)}`
    : sql``;
  const result: any = await db.execute(sql`
    SELECT * FROM content_drafts
    WHERE client_id = ${clientId}
      AND status = 'published'
      AND metadata->'performance_flags'->>'high_performer' = 'true'
      ${channelFilter}
    ORDER BY id DESC
    LIMIT ${limit}
  `);
  const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
  return Array.isArray(rows) ? rows : [];
}

function channelFor(channel: PerformanceChannel): string {
  /* target_platform values: facebook | instagram | google_business |
   * email. Wordpress maps to a different shape — articles use
   * surface=rankflow, target_platform=null. For wordpress feedback we
   * skip the platform filter; the listRecentHighPerformers caller
   * would rarely pass wordpress anyway. */
  return channel === "wordpress" ? "" : channel;
}

/** Extract style patterns from a list of drafts:
 *   - hooks: first sentence of body (capped 160 chars each)
 *   - tones: distinct tone-ish keywords drawn from metadata.calendar.* /
 *            metadata.content_brand.* if available
 *   - styleHints: distinct style_keywords across the set
 *
 * Returns "" if nothing useful. Output is short and prompt-safe. */
export function extractPatterns(drafts: ContentDraft[]): string {
  if (!drafts.length) return "";
  const hooks: string[] = [];
  const styleHintsSet = new Set<string>();
  const tonesSet = new Set<string>();
  for (const d of drafts) {
    const body = (d.body || "").trim();
    if (body) {
      const firstSentence = body.split(/[.!?\n]/, 1)[0]?.trim() ?? "";
      const hook = firstSentence.length > 160 ? firstSentence.slice(0, 157) + "..." : firstSentence;
      if (hook) hooks.push(`"${hook}"`);
    }
    const meta = (d.metadata || {}) as Record<string, any>;
    const cal = meta.calendar as Record<string, any> | undefined;
    const cb = meta.content_brand as Record<string, any> | undefined;
    if (cb?.tone && typeof cb.tone === "string") tonesSet.add(cb.tone);
    if (Array.isArray(cb?.style_keywords)) {
      for (const k of cb.style_keywords) {
        if (typeof k === "string") styleHintsSet.add(k);
      }
    }
  }
  const parts: string[] = [];
  if (hooks.length) parts.push(`Hooks: ${hooks.slice(0, 5).join(" / ")}.`);
  if (tonesSet.size) parts.push(`Tones: ${[...tonesSet].slice(0, 3).join(", ")}.`);
  if (styleHintsSet.size) parts.push(`Style hints: ${[...styleHintsSet].slice(0, 6).join(", ")}.`);
  return parts.join(" ");
}

/** End-to-end helper used by generators: fetch high performers for the
 * (client, channel) and return a one-line pattern summary. Returns ""
 * when there's nothing to inject — caller can `${str ? ... : ""}`. */
export async function buildPerformanceFeedback(
  clientId: number,
  channel: PerformanceChannel | null,
  limit: number = 5,
): Promise<string> {
  try {
    const drafts = await listRecentHighPerformers(clientId, channel, limit);
    return extractPatterns(drafts);
  } catch (err: any) {
    /* Never block generation — feedback loop is best-effort. */
    log.warn(`[contentflow][performance][feedback] client=${clientId} channel=${channel}: ${err?.message || err}`);
    return "";
  }
}
