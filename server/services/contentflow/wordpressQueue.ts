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
 * Sprint 8: drain up to BATCH_SIZE eligible drafts using atomic claims.
 *
 *   1. Recover stale claims (publishing rows abandoned by crashed workers).
 *   2. Loop up to BATCH_SIZE: claimNextPublishJob → dispatch → record outcome.
 *   3. Stop when claim returns null (queue empty / all locked elsewhere).
 *
 * The claim is row-level locked + SKIP LOCKED, so two concurrent workers
 * never publish the same draft. Each adapter runs in isolation; an
 * adapter throw is caught and persisted as a failure.
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

  /* 1. Stale-lock recovery — re-queues rows whose worker crashed. */
  try {
    const recovered = await storage.recoverStalePublishClaims({ now, staleLockMs: STALE_LOCK_MS });
    if (recovered > 0) {
      console.log(`[contentflow][publish-queue] recovered ${recovered} stale claim(s)`);
    }
  } catch (err: any) {
    console.error(`[contentflow][publish-queue] stale-lock recovery failed:`, err?.message || err);
  }

  /* 2. Drain — atomic claim, dispatch, record outcome, repeat. */
  for (let i = 0; i < BATCH_SIZE; i++) {
    let claimed: ContentDraft | null;
    try {
      claimed = await storage.claimNextPublishJob(WORKER_ID, { now: new Date(), staleLockMs: STALE_LOCK_MS });
    } catch (err: any) {
      summary.errors.push(`claim failed: ${err?.message || err}`);
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
      /* Adapter already persisted post_id/post_url and flipped draft.status.
       * Layer in queue_status + clear lock + clear last_error. */
      await mergeWpMetadata(claimed.id, {
        queue_status: "published",
        last_error: null,
        locked_at: null,
        locked_by: null,
      });
      summary.published++;
      continue;
    }

    /* Failure path — increment attempts, decide retry vs dead-letter. */
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

  return summary;
}
