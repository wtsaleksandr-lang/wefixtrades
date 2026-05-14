/**
 * ContentFlow — publish queue (Sprint 5; Sprint 8 hardened).
 *
 * Lightweight queue layered on top of `content_drafts.metadata.wordpress`.
 * No new tables; queue state coexists with Sprint 4 publish-result keys
 * (post_id, post_url, wp_status, published_at, error) on the same JSONB
 * column.
 *
 * Sprint 8 changes:
 *   - Atomic claim via storage.claimNextPublishJob (FOR UPDATE SKIP LOCKED).
 *     Two concurrent workers can never publish the same draft.
 *   - Stale-lock recovery: a `publishing` row whose locked_at is older than
 *     STALE_LOCK_MS (10min) is reclaimed on the next tick (worker crashed
 *     mid-publish).
 *   - Dead-letter: when attempts >= MAX_ATTEMPTS the draft transitions to
 *     queue_status='failed' AND metadata.wordpress.dead_letter_at is
 *     stamped. Subsequent enqueues from publishing state DO NOT reset
 *     attempts (so a crash-loop can't infinite-retry).
 *   - Dispatch via the adapter registry — queue is destination-agnostic.
 *
 * Lifecycle:
 *   queued → publishing → published        (success)
 *   queued → publishing → queued           (retry, attempts < MAX_ATTEMPTS)
 *   queued → publishing → failed (DLQ)     (attempts >= MAX_ATTEMPTS)
 *   publishing (stale) → queued (recovery)
 *   failed → queued                        (admin retry — clears DLQ + resets attempts)
 *
 * Scheduling: `metadata.wordpress.scheduled_for` (ISO 8601 string or null).
 * Worker only picks drafts where scheduled_for is null OR <= now().
 *
 * Idempotency / duplicate-publish prevention:
 *   - Atomic claim with row-level lock (B1 fix).
 *   - Already published drafts (queue_status='published' OR existing post_id)
 *     can NOT be re-queued. enqueueDraft refuses; the worker skips them.
 *   - Drafts not in 'approved' status can NOT be queued (rejected/draft/etc).
 */

import crypto from "crypto";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { contentDrafts } from "@shared/schema";
import { getAdapter } from "./adapters/registry";
import {
  channelForDraft,
  countPublishedInLast24h,
  MAX_PER_CHANNEL_PER_DAY,
} from "./calendarMetadata";
import { publishToCms } from "./cmsRouter";
import { renderArticleHtml } from "./articleHtml";
import { sendAlert, isAlertingConfigured } from "../socialSync/alertService";
import { createLogger } from "../../lib/logger";
import type { ContentDraft } from "@shared/schema";

const log = createLogger("ContentFlow:Queue");

/* ─── Constants ─────────────────────────────────────────────────────── */

export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 10;
export const STALE_LOCK_MS = 10 * 60_000;
/* Sprint 10: when a draft is in cooling_down, push its scheduled_for
 * forward by this much so it stops monopolising claim ordering. */
export const COOLDOWN_DEFER_MS = 5 * 60_000;
/* Sprint 14: when a draft hits the daily cap, push it forward 1 hour
 * so it drops out of eligibility until the cap window rolls. */
export const CAP_DEFER_MS = 60 * 60_000;

export type QueueStatus = "queued" | "publishing" | "published" | "failed";
export type WpPostStatus = "draft" | "publish";

const WORKER_ID = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

/* ─── Approval gate ────────────────────────────────────────────────── */

/**
 * Check whether a draft's associated client service has auto_publish
 * disabled. When auto_publish is explicitly `false` in the client
 * service metadata, the draft should be held for manual approval
 * instead of being auto-published by the queue worker.
 *
 * Default behaviour: auto_publish is `true` — existing clients are
 * not affected unless they explicitly opt out.
 */
async function shouldHoldForApproval(draft: ContentDraft): Promise<boolean> {
  const csId = draft.client_service_id;
  if (!csId) return false; // No linked service — default to auto-publish
  try {
    const cs = await storage.getClientServiceById(csId);
    if (!cs) return false;
    const meta = (cs.metadata || {}) as Record<string, any>;
    return meta.auto_publish === false;
  } catch {
    // If lookup fails, don't block the publish pipeline
    return false;
  }
}

/* ─── Public types ──────────────────────────────────────────────────── */

export interface EnqueueOptions {
  /** Optional ISO 8601 datetime — worker waits until this time to publish. */
  scheduled_for?: string | null;
  /** WordPress post status to publish under. Defaults to 'draft' (Sprint 4 default). */
  wp_status?: WpPostStatus;
}

export type EnqueueResult =
  | { ok: true; draftId: number; queue_status: QueueStatus; scheduled_for: string | null }
  | {
      ok: false;
      draftId: number;
      reason:
        | "draft_not_found"
        | "wrong_kind"
        | "wrong_surface"
        | "not_approved"
        | "already_published"
        | "invalid_scheduled_for";
      message: string;
    };

export type BulkEnqueueResult = {
  total: number;
  succeeded: number;
  failed: number;
  results: EnqueueResult[];
};

export type RetryResult =
  | { ok: true; draftId: number; attempts: number }
  | {
      ok: false;
      draftId: number;
      reason: "draft_not_found" | "not_failed" | "max_attempts_reached";
      message: string;
    };

/* Sprint 10: per-channel observability counters captured into
 * jobLogs.metadata so /api/admin/contentflow/queue-metrics can
 * aggregate over time. Sprint 13 adds an `email` channel for
 * newsletter-style email_post drafts. */
export interface ChannelMetrics {
  scanned: number;
  published: number;
  failed: number;
  retried: number;
  cooldown_skipped: number;
  total_duration_ms: number;
}

function emptyChannelMetrics(): ChannelMetrics {
  return { scanned: 0, published: 0, failed: 0, retried: 0, cooldown_skipped: 0, total_duration_ms: 0 };
}

export interface ProcessQueueSummary {
  scanned: number;
  published: number;
  failed: number;
  retried: number;
  errors: string[];
  /* Sprint 10/13/18: per-channel breakdown. */
  channels?: {
    wordpress: ChannelMetrics;
    gbp: ChannelMetrics;
    facebook: ChannelMetrics;
    instagram: ChannelMetrics;
    gbp_post: ChannelMetrics;
    email: ChannelMetrics;
    linkedin: ChannelMetrics;
    pinterest: ChannelMetrics;
    youtube: ChannelMetrics;
  };
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

interface WpMeta {
  // Sprint 4 keys (publish-result):
  post_id?: number;
  post_url?: string;
  wp_status?: string;
  published_at?: string;
  error?: string;
  attempted_at?: string;
  // Sprint 5 keys (queue lifecycle):
  queue_status?: QueueStatus;
  scheduled_for?: string | null;
  attempts?: number;
  last_error?: string | null;
  last_attempt_at?: string;
  desired_wp_status?: WpPostStatus;
  // Sprint 8 keys (locking + DLQ):
  locked_at?: string | null;
  locked_by?: string | null;
  dead_letter_at?: string | null;
}

function getWpMeta(draft: ContentDraft): WpMeta {
  return ((draft.metadata as any)?.wordpress as WpMeta | undefined) ?? {};
}

/**
 * Re-read the latest draft metadata immediately before a write and merge
 * the new wordpress fields. Uses the same race-protection pattern as
 * articleService (Sprint 4 fix).
 */
async function mergeWpMetadata(
  draftId: number,
  patch: Partial<WpMeta>,
): Promise<ContentDraft | undefined> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return undefined;
  const existingMeta = (fresh.metadata || {}) as Record<string, any>;
  const existingWp = (existingMeta.wordpress || {}) as WpMeta;
  return storage.updateContentDraft(draftId, {
    metadata: {
      ...existingMeta,
      wordpress: { ...existingWp, ...patch },
    },
  });
}

function isAlreadyPublished(wp: WpMeta): boolean {
  return (
    wp.queue_status === "published" ||
    (typeof wp.post_id === "number" && Number.isFinite(wp.post_id) && !!wp.post_url)
  );
}

function isValidIsoDateOrNull(v: unknown): v is string | null {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function isEligibleNow(wp: WpMeta, now: Date): boolean {
  if (!wp.scheduled_for) return true;
  const scheduled = new Date(wp.scheduled_for);
  if (Number.isNaN(scheduled.getTime())) return true; // bad data → run now rather than block forever
  return scheduled.getTime() <= now.getTime();
}

/* ─── Enqueue ───────────────────────────────────────────────────────── */

export async function enqueueDraft(
  draftId: number,
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) {
    return { ok: false, draftId, reason: "draft_not_found", message: `draft ${draftId} not found` };
  }
  if (draft.kind !== "article") {
    return { ok: false, draftId, reason: "wrong_kind", message: `draft ${draftId} is not an article` };
  }
  if (draft.surface !== "rankflow") {
    return { ok: false, draftId, reason: "wrong_surface", message: `draft ${draftId} is not a RankFlow draft` };
  }

  // Check already-published BEFORE checking 'approved'. A successfully
  // published draft has status='published' (Sprint 4 publisher transitions
  // it), so the status guard would otherwise return 'not_approved' — wrong
  // signal. Already-published is the more specific reason for the caller.
  const wp = getWpMeta(draft);
  if (draft.status === "published" || isAlreadyPublished(wp)) {
    return { ok: false, draftId, reason: "already_published", message: `draft ${draftId} is already published — refusing to duplicate` };
  }

  if (draft.status !== "approved") {
    return { ok: false, draftId, reason: "not_approved", message: `draft ${draftId} status is ${draft.status}, must be 'approved'` };
  }

  if (!isValidIsoDateOrNull(opts.scheduled_for ?? null)) {
    return { ok: false, draftId, reason: "invalid_scheduled_for", message: `scheduled_for must be a valid ISO 8601 date or null` };
  }

  const scheduledFor = (opts.scheduled_for as string | null | undefined) ?? null;
  /* Sprint 8: never reset attempts when transitioning from `publishing`
   * (would let a crash-looping draft escape the dead-letter ceiling).
   * `failed` preserves attempts; admin retry path uses retryDraft. */
  const preserveAttempts =
    wp.queue_status === "failed" || wp.queue_status === "publishing";
  await mergeWpMetadata(draftId, {
    queue_status: "queued",
    scheduled_for: scheduledFor,
    attempts: preserveAttempts ? wp.attempts ?? 0 : 0,
    last_error: null,
    locked_at: null,
    locked_by: null,
    desired_wp_status: opts.wp_status === "publish" ? "publish" : "draft",
  });

  return { ok: true, draftId, queue_status: "queued", scheduled_for: scheduledFor };
}

export async function bulkEnqueue(
  draftIds: number[],
  opts: EnqueueOptions = {},
): Promise<BulkEnqueueResult> {
  const results: EnqueueResult[] = [];
  for (const id of draftIds) {
    results.push(await enqueueDraft(id, opts));
  }
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return { total: results.length, succeeded, failed, results };
}

/* ─── Retry ─────────────────────────────────────────────────────────── */

export async function retryDraft(draftId: number): Promise<RetryResult> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) {
    return { ok: false, draftId, reason: "draft_not_found", message: `draft ${draftId} not found` };
  }
  const wp = getWpMeta(draft);
  if (wp.queue_status !== "failed") {
    return { ok: false, draftId, reason: "not_failed", message: `draft ${draftId} is not in 'failed' state (queue_status=${wp.queue_status ?? "null"})` };
  }
  // Admin retry resets the attempt counter and clears the dead-letter
  // stamp — operator has explicitly chosen to give it another shot.
  await mergeWpMetadata(draftId, {
    queue_status: "queued",
    attempts: 0,
    last_error: null,
    dead_letter_at: null,
    locked_at: null,
    locked_by: null,
  });
  return { ok: true, draftId, attempts: 0 };
}

/* ─── Worker ────────────────────────────────────────────────────────── */

/**
 * Sprint 8/9/10/13/18: drain up to BATCH_SIZE eligible drafts per
 * channel using atomic claims. Nine channels supported:
 *   wordpress  (RankFlow articles)
 *   gbp        (ReputationShield review-replies — Sprint 9)
 *   facebook   (SocialSync posts — Sprint 10)
 *   instagram  (SocialSync posts — Sprint 10)
 *   gbp_post   (SocialSync GBP posts — Sprint 10, distinct from review-replies)
 *   email      (Repurposed newsletter / email_post — Sprint 13)
 *   linkedin   (Repurposed LinkedIn social_post — Sprint 18)
 *   pinterest  (Repurposed Pinterest social_post — Sprint 18)
 *   youtube    (Repurposed kind='video' uploads — Sprint 18)
 *
 * Per-channel metrics are recorded into summary.channels so the
 * runJob wrapper persists them into job_logs.metadata for the
 * /api/admin/contentflow/queue-metrics endpoint.
 *
 * Stale-lock recovery runs for all 9 channels at the top of every
 * tick. Drain order is fixed but each is independent — SKIP LOCKED
 * is per-row so a slow facebook publish doesn't block instagram drain.
 */
export async function processQueue(): Promise<ProcessQueueSummary> {
  const summary: ProcessQueueSummary = {
    scanned: 0,
    published: 0,
    failed: 0,
    retried: 0,
    errors: [],
    channels: {
      wordpress: emptyChannelMetrics(),
      gbp: emptyChannelMetrics(),
      facebook: emptyChannelMetrics(),
      instagram: emptyChannelMetrics(),
      gbp_post: emptyChannelMetrics(),
      email: emptyChannelMetrics(),
      linkedin: emptyChannelMetrics(),
      pinterest: emptyChannelMetrics(),
      youtube: emptyChannelMetrics(),
    },
  };

  const now = new Date();

  /* 1. Stale-lock recovery for all 9 channels. */
  const recoveryFns: Array<[string, () => Promise<number>]> = [
    ["wp", () => storage.recoverStaleWordpressClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["gbp", () => storage.recoverStaleGbpClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["facebook", () => storage.recoverStaleFacebookClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["instagram", () => storage.recoverStaleInstagramClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["gbp_post", () => storage.recoverStaleGbpPostClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["email", () => storage.recoverStaleEmailClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["linkedin", () => storage.recoverStaleLinkedinClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["pinterest", () => storage.recoverStalePinterestClaims({ now, staleLockMs: STALE_LOCK_MS })],
    ["youtube", () => storage.recoverStaleYoutubeClaims({ now, staleLockMs: STALE_LOCK_MS })],
  ];
  for (const [tag, fn] of recoveryFns) {
    try {
      const n = await fn();
      if (n > 0) log.info(`Recovered stale claims`, { tag, count: n });
    } catch (err: any) {
      log.error(`Stale-lock recovery failed`, { tag, error: err?.message || String(err) });
    }
  }

  /* 2-10. Drain each channel up to BATCH_SIZE. */
  await drainWordpressQueue(summary);
  await drainGbpQueue(summary);
  await drainSocialChannel(summary, "facebook");
  await drainSocialChannel(summary, "instagram");
  await drainSocialChannel(summary, "gbp_post");
  await drainSocialChannel(summary, "email");
  await drainSocialChannel(summary, "linkedin");
  await drainSocialChannel(summary, "pinterest");
  await drainSocialChannel(summary, "youtube");

  /* 8. Backpressure alerting — after each drain cycle. */
  await checkBackpressure().catch((err: any) => {
    log.warn(`Backpressure check failed: ${err?.message || err}`);
  });

  return summary;
}

/* ─── Backpressure Alerting ────────────────────────────────────────── */

const BACKPRESSURE_THRESHOLD = 100;
const STALE_DRAFT_THRESHOLD_MS = 60 * 60_000; // 1 hour

async function checkBackpressure(): Promise<void> {
  if (!isAlertingConfigured()) return;

  try {
    /* Count all drafts currently in a queued state across all channels.
     * We check metadata JSONB for each channel's queue_status='queued'. */
    const queuedResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contentDrafts)
      .where(sql`
        (${contentDrafts.status} = 'approved')
        AND (
          ${contentDrafts.metadata}->>'wordpress'  IS NOT NULL AND (${contentDrafts.metadata}->'wordpress'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'facebook'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'instagram'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'gbp_post'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'gbp'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'email'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'linkedin'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'pinterest'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'youtube'->>'queue_status') = 'queued'
        )
      `);

    const totalQueued = queuedResult[0]?.count ?? 0;

    if (totalQueued > BACKPRESSURE_THRESHOLD) {
      log.warn(`Queue backpressure detected: ${totalQueued} drafts queued (threshold: ${BACKPRESSURE_THRESHOLD})`);
      await sendAlert({
        type: "publish_failures",
        client_id: 0,
        business_name: "System",
        platform: "contentflow",
        summary: `ContentFlow queue backpressure: ${totalQueued} drafts queued (threshold: ${BACKPRESSURE_THRESHOLD})`,
        details: {
          category: "contentflow_backpressure",
          queued_count: totalQueued,
          threshold: BACKPRESSURE_THRESHOLD,
        },
        admin_url: "/admin/contentflow",
      }).catch(() => {});
    }

    /* Check for stale drafts: queued > 1 hour without publishing. */
    const staleThreshold = new Date(Date.now() - STALE_DRAFT_THRESHOLD_MS).toISOString();
    const staleResult = await db.select({
      count: sql<number>`count(*)::int`,
      oldest_id: sql<number>`min(${contentDrafts.id})`,
    })
      .from(contentDrafts)
      .where(sql`
        (${contentDrafts.status} = 'approved')
        AND (${contentDrafts.updated_at} < ${staleThreshold})
        AND (
          (${contentDrafts.metadata}->'wordpress'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'facebook'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'instagram'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'gbp_post'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'gbp'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'email'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'linkedin'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'pinterest'->>'queue_status') = 'queued'
          OR (${contentDrafts.metadata}->'youtube'->>'queue_status') = 'queued'
        )
      `);

    const staleCount = staleResult[0]?.count ?? 0;
    if (staleCount > 0) {
      log.warn(`Stale drafts detected: ${staleCount} draft(s) queued > 1 hour`);
      await sendAlert({
        type: "publish_failures",
        client_id: 0,
        business_name: "System",
        platform: "contentflow",
        summary: `ContentFlow stale drafts: ${staleCount} draft(s) queued for over 1 hour without publishing`,
        details: {
          category: "contentflow_stale_draft",
          stale_count: staleCount,
          oldest_draft_id: staleResult[0]?.oldest_id,
          threshold_minutes: STALE_DRAFT_THRESHOLD_MS / 60_000,
        },
        admin_url: "/admin/contentflow",
      }).catch(() => {});
    }
  } catch (err: any) {
    log.error(`Backpressure check query failed: ${err?.message || err}`);
  }
}

async function drainWordpressQueue(summary: ProcessQueueSummary): Promise<void> {
  const m = summary.channels?.wordpress ?? emptyChannelMetrics();
  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    const t0 = Date.now();
    try {
      claimed = await storage.claimNextWordpressJob(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`wp claim failed: ${err?.message || err}`);
      break;
    }
    if (!claimed) break;
    summary.scanned++;
    m.scanned++;

    const wp = getWpMeta(claimed);

    /* Defence-in-depth: if a parallel write put post_id on the row between
     * the eligibility check and the claim, treat it as published and clear
     * the lock. */
    if (isAlreadyPublished(wp)) {
      await mergeWpMetadata(claimed.id, {
        queue_status: "published",
        locked_at: null,
        locked_by: null,
      });
      continue;
    }

    /* Approval gate: if client service has auto_publish=false, hold the
     * draft for manual approval instead of auto-publishing. */
    if (await shouldHoldForApproval(claimed)) {
      await mergeWpMetadata(claimed.id, {
        queue_status: "queued",
        locked_at: null,
        locked_by: null,
        last_error: "held for approval (auto_publish=false)",
      });
      await storage.updateContentDraft(claimed.id, { status: "pending_approval" } as any);
      log.info("Draft held for approval", { draftId: claimed.id, clientId: claimed.client_id, channel: "wordpress" });
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    /* Sprint 14: daily cap (wordpress channel). */
    {
      const cap = MAX_PER_CHANNEL_PER_DAY.wordpress;
      const recent = await countPublishedInLast24h(claimed.client_id, "wordpress").catch(() => 0);
      if (recent >= cap) {
        const deferUntil = new Date(Date.now() + CAP_DEFER_MS).toISOString();
        await mergeWpMetadata(claimed.id, {
          queue_status: "queued",
          scheduled_for: deferUntil,
          locked_at: null,
          locked_by: null,
          last_error: `daily cap (${cap}/day) reached for wordpress, deferred`,
        });
        m.cooldown_skipped++;
        m.total_duration_ms += Date.now() - t0;
        continue;
      }
    }

    const desiredStatus: WpPostStatus = wp.desired_wp_status === "publish" ? "publish" : "draft";
    let result;
    try {
      const adapter = getAdapter("wordpress");
      result = await adapter.publish(claimed, { status: desiredStatus });
    } catch (err: any) {
      result = { ok: false as const, reason: "network_error" as const, message: err?.message || String(err) };
    }

    /* Sprint 8 multi-CMS: if the WordPress adapter rejected because the
     * client uses a different CMS, route through the CMS router instead.
     * The router resolves the correct platform and credentials. */
    if (!result.ok && result.reason === "wrong_cms_type") {
      try {
        const contentHtml = renderArticleHtml({
          title: null,
          excerpt: null,
          bodyMd: claimed.body || "",
        });
        const cmsResult = await publishToCms(claimed.client_id, {
          title: claimed.title || "Untitled",
          content: contentHtml,
          excerpt: claimed.excerpt || undefined,
          status: desiredStatus,
        }, { clientServiceId: claimed.client_service_id, draftId: claimed.id });

        if (cmsResult.success) {
          /* Persist CMS publish result on the draft metadata + transition to published. */
          const freshDraft = await storage.getContentDraftById(claimed.id);
          const existingMeta = ((freshDraft ?? claimed).metadata || {}) as Record<string, any>;
          const existingWp = (existingMeta.wordpress || {}) as Record<string, any>;
          await storage.updateContentDraft(claimed.id, {
            status: "published",
            target_url: cmsResult.postUrl || null,
            metadata: {
              ...existingMeta,
              wordpress: {
                ...existingWp,
                post_id: cmsResult.postId ? Number(cmsResult.postId) || cmsResult.postId : null,
                post_url: cmsResult.postUrl || null,
                published_at: new Date().toISOString(),
                error: null,
              },
            },
          });
          result = { ok: true as const, externalId: cmsResult.postId, externalUrl: cmsResult.postUrl };
        } else {
          result = { ok: false as const, reason: "upstream_error" as const, message: cmsResult.error || "CMS publish failed" };
        }
      } catch (err: any) {
        result = { ok: false as const, reason: "network_error" as const, message: err?.message || String(err) };
      }
    }

    if (result.ok) {
      await mergeWpMetadata(claimed.id, {
        queue_status: "published",
        last_error: null,
        locked_at: null,
        locked_by: null,
      });
      summary.published++;
      m.published++;
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    const attemptsBefore = wp.attempts ?? 0;
    const attemptsAfter = attemptsBefore + 1;
    const errMsg = (result.message || "unknown error").slice(0, 500);
    if (attemptsAfter >= MAX_ATTEMPTS) {
      await mergeWpMetadata(claimed.id, {
        queue_status: "failed",
        attempts: attemptsAfter,
        last_error: errMsg,
        dead_letter_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      });
      summary.failed++;
      m.failed++;
      summary.errors.push(`draft ${claimed.id}: ${errMsg}`);
    } else {
      await mergeWpMetadata(claimed.id, {
        queue_status: "queued",
        attempts: attemptsAfter,
        last_error: errMsg,
        locked_at: null,
        locked_by: null,
      });
      summary.retried++;
      m.retried++;
    }
    m.total_duration_ms += Date.now() - t0;
  }
}

/**
 * Sprint 9: GBP review-reply queue drain. Same shape as the WP drain
 * but uses claimNextGbpJob, the gbp adapter, and metadata.gbp.* keys.
 * Implemented inline (not generalised) so the WP path stays unchanged
 * — keeping the surgical scope the user specified.
 */
async function drainGbpQueue(summary: ProcessQueueSummary): Promise<void> {
  const m = summary.channels?.gbp ?? emptyChannelMetrics();
  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    const t0 = Date.now();
    try {
      claimed = await storage.claimNextGbpJob(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`gbp claim failed: ${err?.message || err}`);
      break;
    }
    if (!claimed) break;
    summary.scanned++;
    m.scanned++;

    const gbp = ((claimed.metadata as any)?.gbp || {}) as Record<string, any>;

    /* Defence-in-depth: never re-post if posted_at is already set. */
    if (gbp.posted_at) {
      await mergeGbpMetadata(claimed.id, {
        queue_status: "published",
        locked_at: null,
        locked_by: null,
      });
      continue;
    }

    let result;
    try {
      const adapter = getAdapter("gbp");
      result = await adapter.publish(claimed);
    } catch (err: any) {
      result = { ok: false as const, reason: "transient" as const, message: err?.message || String(err), retryable: true };
    }

    if (result.ok) {
      await mergeGbpMetadata(claimed.id, {
        queue_status: "published",
        last_error: null,
        locked_at: null,
        locked_by: null,
      });
      summary.published++;
      m.published++;
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    const attemptsBefore = (gbp.attempts as number | undefined) ?? 0;
    const attemptsAfter = attemptsBefore + 1;
    const errMsg = (result.message || "unknown gbp error").slice(0, 500);
    /* Permanent failures (auth, validation, wrong_kind) skip retry — go
     * straight to failed. Otherwise honour MAX_ATTEMPTS. */
    const isRetryable =
      result.retryable === undefined ? true : result.retryable === true;
    const shouldDeadLetter = !isRetryable || attemptsAfter >= MAX_ATTEMPTS;
    if (shouldDeadLetter) {
      await mergeGbpMetadata(claimed.id, {
        queue_status: "failed",
        attempts: attemptsAfter,
        last_error: errMsg,
        dead_letter_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      });
      summary.failed++;
      m.failed++;
      summary.errors.push(`draft ${claimed.id}: ${errMsg}`);
    } else {
      await mergeGbpMetadata(claimed.id, {
        queue_status: "queued",
        attempts: attemptsAfter,
        last_error: errMsg,
        locked_at: null,
        locked_by: null,
      });
      summary.retried++;
      m.retried++;
    }
    m.total_duration_ms += Date.now() - t0;
  }
}

/**
 * Sprint 10: generic drain for the three social channels (facebook,
 * instagram, gbp_post). All use the same metadata-path-keyed claim,
 * adapter dispatch, cooling_down handling, and retry/dead-letter
 * logic — only the channel name varies.
 */
type SocialChannel = "facebook" | "instagram" | "gbp_post" | "email" | "linkedin" | "pinterest" | "youtube";

async function drainSocialChannel(summary: ProcessQueueSummary, channel: SocialChannel): Promise<void> {
  const m = summary.channels?.[channel] ?? emptyChannelMetrics();
  const claimFn =
    channel === "facebook" ? storage.claimNextFacebookJob.bind(storage)
    : channel === "instagram" ? storage.claimNextInstagramJob.bind(storage)
    : channel === "gbp_post" ? storage.claimNextGbpPostJob.bind(storage)
    : channel === "linkedin" ? storage.claimNextLinkedinJob.bind(storage)
    : channel === "pinterest" ? storage.claimNextPinterestJob.bind(storage)
    : channel === "youtube" ? storage.claimNextYoutubeJob.bind(storage)
    : storage.claimNextEmailJob.bind(storage);

  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    const t0 = Date.now();
    try {
      claimed = await claimFn(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`${channel} claim failed: ${err?.message || err}`);
      break;
    }
    if (!claimed) break;
    summary.scanned++;
    m.scanned++;

    const channelMeta = ((claimed.metadata as any)?.[channel] || {}) as Record<string, any>;

    /* Defence-in-depth: never re-post if posted_at is already set. */
    if (channelMeta.posted_at || channelMeta.remote_post_id) {
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "published",
        locked_at: null,
        locked_by: null,
      });
      continue;
    }

    /* Approval gate: if client service has auto_publish=false, hold the
     * draft for manual approval instead of auto-publishing. */
    if (await shouldHoldForApproval(claimed)) {
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "queued",
        locked_at: null,
        locked_by: null,
        last_error: "held for approval (auto_publish=false)",
      });
      await storage.updateContentDraft(claimed.id, { status: "pending_approval" } as any);
      log.info("Draft held for approval", { draftId: claimed.id, clientId: claimed.client_id, channel });
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    /* Sprint 14: per-(client, channel) daily cap. Skip-and-defer rather
     * than fail so the draft re-enters eligibility once the rolling 24h
     * window has space. NOT counted as an attempt. */
    const calChannel = channelForDraft(claimed);
    if (calChannel) {
      const cap = MAX_PER_CHANNEL_PER_DAY[calChannel];
      const recent = await countPublishedInLast24h(claimed.client_id, calChannel).catch(() => 0);
      if (recent >= cap) {
        const deferUntil = new Date(Date.now() + CAP_DEFER_MS).toISOString();
        await mergeChannelMetadata(claimed.id, channel, {
          queue_status: "queued",
          scheduled_for: deferUntil,
          locked_at: null,
          locked_by: null,
          last_error: `daily cap (${cap}/day) reached for ${calChannel}, deferred`,
        });
        m.cooldown_skipped++;
        m.total_duration_ms += Date.now() - t0;
        continue;
      }
    }

    let result;
    try {
      const adapter = getAdapter(channel);
      result = await adapter.publish(claimed);
    } catch (err: any) {
      result = { ok: false as const, reason: "transient" as const, message: err?.message || String(err), retryable: true };
    }

    /* Sprint 10: cooling_down branch. Adapter detected platform
     * cooldown — leave queued, do NOT increment attempts. To prevent
     * a single cooling client from starving the rest of the queue
     * (the eligibility filter orders by scheduled_for ASC, so a
     * head-of-queue cooling draft would be re-claimed every BATCH
     * iteration), push scheduled_for forward by COOLDOWN_DEFER_MS so
     * the row drops out of eligibility until the next tick window.
     * The actual cooldown_until lives on the profile and is
     * re-checked on every claim — this is just queue-fairness. */
    if (!result.ok && result.reason === "cooling_down") {
      const deferUntil = new Date(Date.now() + COOLDOWN_DEFER_MS).toISOString();
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "queued",
        scheduled_for: deferUntil,
        locked_at: null,
        locked_by: null,
        last_error: result.message,
      });
      m.cooldown_skipped++;
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    if (result.ok) {
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "published",
        last_error: null,
        locked_at: null,
        locked_by: null,
      });
      summary.published++;
      m.published++;
      m.total_duration_ms += Date.now() - t0;
      continue;
    }

    const attemptsBefore = (channelMeta.attempts as number | undefined) ?? 0;
    const attemptsAfter = attemptsBefore + 1;
    const errMsg = (result.message || `unknown ${channel} error`).slice(0, 500);
    const isRetryable = result.retryable === undefined ? true : result.retryable === true;
    const shouldDeadLetter = !isRetryable || attemptsAfter >= MAX_ATTEMPTS;
    if (shouldDeadLetter) {
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "failed",
        attempts: attemptsAfter,
        last_error: errMsg,
        dead_letter_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      });
      summary.failed++;
      m.failed++;
      summary.errors.push(`draft ${claimed.id} (${channel}): ${errMsg}`);
    } else {
      await mergeChannelMetadata(claimed.id, channel, {
        queue_status: "queued",
        attempts: attemptsAfter,
        last_error: errMsg,
        locked_at: null,
        locked_by: null,
      });
      summary.retried++;
      m.retried++;
    }
    m.total_duration_ms += Date.now() - t0;
  }
}

/* Sprint 10: race-protected merge into metadata[channel]. */
async function mergeChannelMetadata(
  draftId: number,
  channel: SocialChannel,
  patch: Record<string, any>,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const existing = (meta[channel] || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: { ...meta, [channel]: { ...existing, ...patch } },
  } as any);
}

/* Sprint 9: race-protected merge for metadata.gbp — same pattern as
 * mergeWpMetadata. Re-reads fresh draft, merges into existing gbp
 * sub-object, writes back. */
async function mergeGbpMetadata(
  draftId: number,
  patch: Record<string, any>,
): Promise<ContentDraft | undefined> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return undefined;
  const existingMeta = (fresh.metadata || {}) as Record<string, any>;
  const existingGbp = (existingMeta.gbp || {}) as Record<string, any>;
  return storage.updateContentDraft(draftId, {
    metadata: {
      ...existingMeta,
      gbp: { ...existingGbp, ...patch },
    },
  } as any);
}

/**
 * Sprint 9: mark a review_reply draft eligible for the GBP publish queue.
 * Called from:
 *   - ingestion auto-approve path (after autoApproveDraft)
 *   - approvalService.adminApproveDraft / clientApproveDraft when
 *     kind='review_reply' (the moment status flips to 'approved')
 *
 * Idempotent — re-calling on a draft already queued or published is a
 * no-op (the queue eligibility filter accepts only queued+null lock).
 */
export async function enqueueGbpReviewReplyDraft(
  draftId: number,
  opts: { scheduled_for?: string | null } = {},
): Promise<void> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return;
  if (draft.kind !== "review_reply" || draft.surface !== "reputationshield") return;
  const meta = (draft.metadata || {}) as Record<string, any>;
  const gbp = (meta.gbp || {}) as Record<string, any>;
  /* Already published or already in-flight — leave alone. */
  if (gbp.posted_at || gbp.queue_status === "publishing" || gbp.queue_status === "published") return;
  await mergeGbpMetadata(draftId, {
    queue_status: "queued",
    scheduled_for: opts.scheduled_for ?? null,
    /* Reset attempts only when (re)entering queued from a non-queued
     * state. Fresh draft → 0. Failed retry path uses retryReviewReplyDraft
     * (admin-driven) and resets explicitly. */
    attempts: gbp.queue_status === "failed" ? gbp.attempts ?? 0 : 0,
    last_error: null,
    locked_at: null,
    locked_by: null,
    dead_letter_at: gbp.queue_status === "failed" ? gbp.dead_letter_at : null,
  });
}

/**
 * Sprint 10: mark a SocialSync content_draft (kind='social_post' /
 * 'carousel_post' / 'google_post') eligible for the appropriate
 * platform queue. Replaces the pre-Sprint-10 path of inserting into
 * socialsync_publish_queue.
 *
 * Maps target_platform → metadata sub-object key:
 *   facebook         → metadata.facebook.queue_status='queued'
 *   instagram        → metadata.instagram.queue_status='queued'
 *   google_business  → metadata.gbp_post.queue_status='queued'
 *
 * Idempotent — re-calling on a draft already queued or in-flight is
 * a no-op (queue eligibility filter only accepts 'queued' + null lock).
 */
export async function enqueueSocialSyncDraft(
  draftId: number,
  opts: { scheduled_for?: string | null } = {},
): Promise<void> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return;
  const validKinds = new Set(["social_post", "carousel_post", "google_post"]);
  if (!validKinds.has(draft.kind)) return;

  const platformKey: SocialChannel | null =
    draft.target_platform === "facebook" ? "facebook"
    : draft.target_platform === "instagram" ? "instagram"
    : draft.target_platform === "google_business" ? "gbp_post"
    : null;
  if (!platformKey) {
    log.warn(`No SocialSync adapter for platform`, { draftId, targetPlatform: draft.target_platform });
    return;
  }

  const meta = (draft.metadata || {}) as Record<string, any>;
  const existing = (meta[platformKey] || {}) as Record<string, any>;
  if (existing.posted_at || existing.queue_status === "publishing" || existing.queue_status === "published") return;

  await mergeChannelMetadata(draftId, platformKey, {
    queue_status: "queued",
    scheduled_for: opts.scheduled_for ?? null,
    attempts: existing.queue_status === "failed" ? existing.attempts ?? 0 : 0,
    last_error: null,
    locked_at: null,
    locked_by: null,
    dead_letter_at: existing.queue_status === "failed" ? existing.dead_letter_at : null,
  });
}

/**
 * Sprint 13: mark a kind='email_post' draft eligible for the email
 * publish queue. Mirrors enqueueSocialSyncDraft but writes to
 * metadata.email.* instead of platform-keyed buckets.
 *
 * Idempotent — re-call on a draft already queued, in-flight, or sent
 * is a no-op.
 */
export async function enqueueEmailDraft(
  draftId: number,
  opts: { scheduled_for?: string | null } = {},
): Promise<void> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return;
  if (draft.kind !== "email_post") return;

  const meta = (draft.metadata || {}) as Record<string, any>;
  const existing = (meta.email || {}) as Record<string, any>;
  if (existing.message_id || existing.sent_at || existing.queue_status === "publishing" || existing.queue_status === "published") return;

  await mergeChannelMetadata(draftId, "email", {
    queue_status: "queued",
    scheduled_for: opts.scheduled_for ?? null,
    attempts: existing.queue_status === "failed" ? existing.attempts ?? 0 : 0,
    last_error: null,
    locked_at: null,
    locked_by: null,
    dead_letter_at: existing.queue_status === "failed" ? existing.dead_letter_at : null,
  });
}

/**
 * Sprint 18: mark a kind='video' draft eligible for the YouTube
 * publish queue. Mirrors enqueueEmailDraft but writes to
 * metadata.youtube.* instead. YouTube uploads go through the
 * existing adapter-based publish queue.
 *
 * Idempotent — re-call on a draft already queued, in-flight, or
 * published is a no-op.
 */
export async function enqueueYouTubeDraft(
  draftId: number,
  opts: { scheduled_for?: string | null } = {},
): Promise<void> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return;
  if (draft.kind !== "video") return;

  const meta = (draft.metadata || {}) as Record<string, any>;
  const existing = (meta.youtube || {}) as Record<string, any>;
  if (existing.posted_at || existing.youtube_url || existing.queue_status === "publishing" || existing.queue_status === "published") return;

  await mergeChannelMetadata(draftId, "youtube", {
    queue_status: "queued",
    scheduled_for: opts.scheduled_for ?? null,
    attempts: existing.queue_status === "failed" ? existing.attempts ?? 0 : 0,
    last_error: null,
    locked_at: null,
    locked_by: null,
    dead_letter_at: existing.queue_status === "failed" ? existing.dead_letter_at : null,
  });
}
