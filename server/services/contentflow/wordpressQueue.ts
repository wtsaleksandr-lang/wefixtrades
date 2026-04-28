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
import { storage } from "../../storage";
import { getAdapter } from "./adapters/registry";
import type { ContentDraft } from "@shared/schema";

/* ─── Constants ─────────────────────────────────────────────────────── */

export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 10;
export const STALE_LOCK_MS = 10 * 60_000;

export type QueueStatus = "queued" | "publishing" | "published" | "failed";
export type WpPostStatus = "draft" | "publish";

const WORKER_ID = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

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

export interface ProcessQueueSummary {
  scanned: number;
  published: number;
  failed: number;
  retried: number;
  errors: string[];
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
 * Sprint 8/9: drain up to BATCH_SIZE eligible drafts per channel using
 * atomic claims.
 *
 *   1. Recover stale claims for both wordpress + gbp queues
 *      (publishing rows abandoned by crashed workers).
 *   2. Drain wordpress queue up to BATCH_SIZE.
 *   3. Drain gbp queue up to BATCH_SIZE.
 *   4. Stop a queue when claim returns null (empty / all locked elsewhere).
 *
 * The claim is row-level locked + SKIP LOCKED per row, so two concurrent
 * workers never publish the same draft AND the wordpress + gbp queues
 * drain independently — neither blocks the other.
 *
 * Each adapter runs in isolation; an adapter throw is caught and
 * persisted as a failure.
 */
export async function processQueue(): Promise<ProcessQueueSummary> {
  const summary: ProcessQueueSummary = {
    scanned: 0,
    published: 0,
    failed: 0,
    retried: 0,
    errors: [],
  };

  const now = new Date();

  /* 1. Stale-lock recovery for both queues. */
  try {
    const recoveredWp = await storage.recoverStaleWordpressClaims({ now, staleLockMs: STALE_LOCK_MS });
    if (recoveredWp > 0) {
      console.log(`[contentflow][publish-queue][wp] recovered ${recoveredWp} stale claim(s)`);
    }
  } catch (err: any) {
    console.error(`[contentflow][publish-queue][wp] stale-lock recovery failed:`, err?.message || err);
  }
  try {
    const recoveredGbp = await storage.recoverStaleGbpClaims({ now, staleLockMs: STALE_LOCK_MS });
    if (recoveredGbp > 0) {
      console.log(`[contentflow][publish-queue][gbp] recovered ${recoveredGbp} stale claim(s)`);
    }
  } catch (err: any) {
    console.error(`[contentflow][publish-queue][gbp] stale-lock recovery failed:`, err?.message || err);
  }

  /* 2. Drain WordPress queue. */
  await drainWordpressQueue(summary);

  /* 3. Drain GBP queue. */
  await drainGbpQueue(summary);

  return summary;
}

async function drainWordpressQueue(summary: ProcessQueueSummary): Promise<void> {
  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    try {
      claimed = await storage.claimNextWordpressJob(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`wp claim failed: ${err?.message || err}`);
      break;
    }
    if (!claimed) break;
    summary.scanned++;

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

    const desiredStatus: WpPostStatus = wp.desired_wp_status === "publish" ? "publish" : "draft";
    let result;
    try {
      const adapter = getAdapter("wordpress");
      result = await adapter.publish(claimed, { status: desiredStatus });
    } catch (err: any) {
      result = { ok: false as const, reason: "network_error" as const, message: err?.message || String(err) };
    }

    if (result.ok) {
      await mergeWpMetadata(claimed.id, {
        queue_status: "published",
        last_error: null,
        locked_at: null,
        locked_by: null,
      });
      summary.published++;
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
    }
  }
}

/**
 * Sprint 9: GBP review-reply queue drain. Same shape as the WP drain
 * but uses claimNextGbpJob, the gbp adapter, and metadata.gbp.* keys.
 * Implemented inline (not generalised) so the WP path stays unchanged
 * — keeping the surgical scope the user specified.
 */
async function drainGbpQueue(summary: ProcessQueueSummary): Promise<void> {
  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    try {
      claimed = await storage.claimNextGbpJob(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`gbp claim failed: ${err?.message || err}`);
      break;
    }
    if (!claimed) break;
    summary.scanned++;

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
    }
  }
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
