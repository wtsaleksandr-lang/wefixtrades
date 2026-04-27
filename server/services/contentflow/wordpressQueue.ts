/**
 * ContentFlow — WordPress publish queue (Sprint 5).
 *
 * Lightweight queue layered on top of `content_drafts.metadata.wordpress`.
 * No new tables; queue state coexists with Sprint 4 publish-result keys
 * (post_id, post_url, wp_status, published_at, error) on the same JSONB
 * column. Sprint 4's race-fix (re-read metadata before write) is what
 * makes coexistence safe — every write here merges with a fresh read.
 *
 * Lifecycle:
 *   queued → publishing → published    (success)
 *   queued → publishing → queued       (retry, attempts < MAX_ATTEMPTS)
 *   queued → publishing → failed       (terminal, attempts >= MAX_ATTEMPTS)
 *   failed → queued                    (admin retry)
 *
 * Scheduling: `metadata.wordpress.scheduled_for` (ISO 8601 string or null).
 * Worker only picks drafts where scheduled_for is null OR <= now().
 *
 * Idempotency / duplicate-publish prevention:
 *   - Already published drafts (queue_status='published' OR existing post_id)
 *     can NOT be re-queued. enqueueDraft refuses; the worker skips them.
 *   - Drafts not in 'approved' status can NOT be queued (rejected/draft/etc).
 */

import { storage } from "../../storage";
import { publishDraftToWordpress } from "./wordpressPublisher";
import type { ContentDraft } from "@shared/schema";

/* ─── Constants ─────────────────────────────────────────────────────── */

export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 10;

export type QueueStatus = "queued" | "publishing" | "published" | "failed";
export type WpPostStatus = "draft" | "publish";

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
  await mergeWpMetadata(draftId, {
    queue_status: "queued",
    scheduled_for: scheduledFor,
    // Reset attempts only when transitioning from a non-failed state.
    // (Retry-from-failed should preserve attempts; that path uses retryDraft.)
    attempts: wp.queue_status === "failed" ? wp.attempts ?? 0 : 0,
    last_error: null,
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
  // Admin retry resets the attempt counter so the draft gets a clean shot
  // at MAX_ATTEMPTS more tries — matches "retry failed publishes" UX.
  await mergeWpMetadata(draftId, {
    queue_status: "queued",
    attempts: 0,
    last_error: null,
  });
  return { ok: true, draftId, attempts: 0 };
}

/* ─── Worker ────────────────────────────────────────────────────────── */

/**
 * Drain up to BATCH_SIZE eligible queued drafts.
 *  - Eligible = status=approved, kind=article, surface=rankflow,
 *    queue_status='queued', scheduled_for IS NULL OR <= now.
 *  - Skips drafts already containing post_id (defence in depth against
 *    duplicate publishes even if queue_status got out of sync).
 *  - On AI/WP failure: increments attempts; transitions to 'queued'
 *    (retry) if attempts < MAX_ATTEMPTS, else 'failed'.
 *
 * Designed to be called from the cron scheduler (`runJob` wrapper) or
 * synchronously from a dev-only test trigger.
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
  const candidates = await storage.findQueuedWordpressDrafts({ limit: BATCH_SIZE, now });
  summary.scanned = candidates.length;
  if (candidates.length === 0) return summary;

  for (const draft of candidates) {
    const wp = getWpMeta(draft);

    // Defence in depth: skip if already published (post_id present) regardless
    // of queue_status. Also skip if eligibility recheck (since queue read)
    // moved scheduled_for into the future.
    if (isAlreadyPublished(wp)) {
      // Self-heal stale queue_status on already-published drafts.
      if (wp.queue_status !== "published") {
        await mergeWpMetadata(draft.id, { queue_status: "published" });
      }
      continue;
    }
    if (!isEligibleNow(wp, now)) continue;

    // Transition queued → publishing.
    await mergeWpMetadata(draft.id, {
      queue_status: "publishing",
      last_attempt_at: now.toISOString(),
    });

    const desiredStatus: WpPostStatus = wp.desired_wp_status === "publish" ? "publish" : "draft";
    let result;
    try {
      result = await publishDraftToWordpress(draft.id, { status: desiredStatus });
    } catch (err: any) {
      // publishDraftToWordpress is documented to never throw, but defend anyway.
      result = { ok: false as const, reason: "network_error" as const, message: err?.message || String(err) };
    }

    if (result.ok) {
      // Sprint 4 publisher already wrote post_id/post_url and flipped draft
      // status to 'published'. Layer in queue_status + clear last_error.
      await mergeWpMetadata(draft.id, {
        queue_status: "published",
        last_error: null,
      });
      summary.published++;
      continue;
    }

    // Failure path. Increment attempts and decide retry vs terminal.
    const attemptsBefore = wp.attempts ?? 0;
    const attemptsAfter = attemptsBefore + 1;
    const errMsg = (result.message || "unknown error").slice(0, 500);
    if (attemptsAfter >= MAX_ATTEMPTS) {
      await mergeWpMetadata(draft.id, {
        queue_status: "failed",
        attempts: attemptsAfter,
        last_error: errMsg,
      });
      summary.failed++;
      summary.errors.push(`draft ${draft.id}: ${errMsg}`);
    } else {
      await mergeWpMetadata(draft.id, {
        queue_status: "queued",
        attempts: attemptsAfter,
        last_error: errMsg,
      });
      summary.retried++;
    }
  }

  return summary;
}
