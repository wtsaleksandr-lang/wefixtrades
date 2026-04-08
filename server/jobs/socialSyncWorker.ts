import { storage } from "../storage";
import { publishToFacebook, type PublishResult } from "../services/socialSync/facebookPublisher";
import type { SocialSyncPost, SocialSyncQueueItem } from "@shared/schema";

/** How long a lock can be held before it's considered stale (10 minutes). */
const STALE_LOCK_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * SocialSync publish queue worker.
 *
 * Flow:
 *   1. Recover any stale locks from crashed previous runs
 *   2. Fetch due jobs (pending, run_at <= now, not locked)
 *   3. For each job: validate → lock → publish → update
 *
 * Currently supports: Facebook (real publish)
 * Other platforms: fail with "not yet implemented"
 */
export async function processSocialSyncQueue(): Promise<{ processed: number; published: number; recovered: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let published = 0;

  // ─── Step 0: Recover stale locks ───
  const recovered = await recoverStaleLocks();

  // ─── Step 1: Fetch due jobs ───
  const dueJobs = await storage.fetchDueSocialSyncJobs(20);
  if (dueJobs.length === 0) return { processed: 0, published: 0, recovered, errors: [] };

  for (const job of dueJobs) {
    try {
      const result = await processOneJob(job);
      processed++;
      if (result.published) published++;
      if (result.error) errors.push(`Job ${job.id}: ${result.error}`);
    } catch (err: any) {
      // Truly unexpected error — try to clean up
      errors.push(`Job ${job.id}: unexpected: ${err.message}`);
      try {
        await handleUnexpectedError(job, err.message);
      } catch {
        // If even cleanup fails, just log and move on
      }
    }
  }

  return { processed, published, recovered, errors };
}

/* ─── Stale Lock Recovery ─── */

async function recoverStaleLocks(): Promise<number> {
  const staleJobs = await storage.fetchStaleSocialSyncLocks(STALE_LOCK_THRESHOLD_MS);
  let recovered = 0;

  for (const job of staleJobs) {
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = job.max_attempts || 3;

    if (attempts >= maxAttempts) {
      // Exhausted retries while locked — mark as failed
      await storage.updateSocialSyncQueueItem(job.id, {
        status: "failed",
        locked_at: null,
        attempts,
        last_error: "Stale lock: worker likely crashed during publish",
        worker_note: `Lock held since ${job.locked_at} — recovered as failed after ${maxAttempts} attempts`,
        updated_at: new Date(),
      });

      // If the post is stuck in "publishing", reset it
      const post = await storage.getSocialSyncPostById(job.post_id);
      if (post && post.status === "publishing") {
        await storage.updateSocialSyncPost(job.post_id, {
          status: "failed",
          failure_reason: "Worker crashed during publish (stale lock recovered)",
        } as any);
      }
    } else {
      // Release for retry
      await storage.updateSocialSyncQueueItem(job.id, {
        status: "pending",
        locked_at: null,
        attempts,
        last_error: "Stale lock recovered — will retry",
        worker_note: `Lock held since ${job.locked_at} — released for retry (attempt ${attempts}/${maxAttempts})`,
        updated_at: new Date(),
      });

      // Reset post from "publishing" back to "queued"
      const post = await storage.getSocialSyncPostById(job.post_id);
      if (post && post.status === "publishing") {
        await storage.updateSocialSyncPost(job.post_id, { status: "queued" } as any);
      }
    }

    await storage.createSocialSyncLog({
      client_id: job.client_id,
      entity_type: "queue",
      entity_id: job.id,
      action: "queue.stale_lock_recovered",
      status: "info",
      details: { post_id: job.post_id, locked_at: job.locked_at, attempts: (job.attempts || 0) + 1 },
    });

    recovered++;
  }

  return recovered;
}

/* ─── Pre-Publish Validation ─── */

interface ValidationResult {
  valid: boolean;
  error?: string;
  permanent?: boolean;
}

function validateBeforePublish(
  job: SocialSyncQueueItem,
  post: SocialSyncPost,
): ValidationResult {
  // Post belongs to the right client
  if (post.client_id !== job.client_id) {
    return { valid: false, error: "Post client_id does not match queue client_id", permanent: true };
  }

  // Post platform matches queue platform
  if (post.platform !== job.platform) {
    return { valid: false, error: `Post platform "${post.platform}" does not match queue platform "${job.platform}"`, permanent: true };
  }

  // Content is non-empty
  if (!post.post_text || post.post_text.trim().length === 0) {
    return { valid: false, error: "Post text is empty", permanent: true };
  }

  // Post is not already published (idempotency guard)
  if (post.status === "published") {
    return { valid: false, error: "Post is already published — skipping to prevent duplicate", permanent: true };
  }

  // Post is not cancelled
  if (post.status === "cancelled") {
    return { valid: false, error: "Post has been cancelled", permanent: true };
  }

  return { valid: true };
}

/* ─── Single Job Processing ─── */

async function processOneJob(job: SocialSyncQueueItem): Promise<{ published: boolean; error?: string }> {
  // ─── Lock ───
  await storage.updateSocialSyncQueueItem(job.id, {
    status: "locked",
    locked_at: new Date(),
    updated_at: new Date(),
  });

  // ─── Load post ───
  const post = await storage.getSocialSyncPostById(job.post_id);
  if (!post) {
    await failJob(job, "Post not found or deleted", true);
    return { published: false, error: "Post not found" };
  }

  // ─── Pre-publish validation ───
  const validation = validateBeforePublish(job, post);
  if (!validation.valid) {
    if (validation.permanent) {
      // For already-published, just complete the queue item silently
      if (post.status === "published") {
        await storage.updateSocialSyncQueueItem(job.id, {
          status: "completed",
          locked_at: null,
          attempts: (job.attempts || 0) + 1,
          worker_note: `Skipped: post already published (idempotency guard)`,
          updated_at: new Date(),
        });
        await storage.createSocialSyncLog({
          client_id: job.client_id,
          entity_type: "queue",
          entity_id: job.id,
          action: "queue.skipped_duplicate",
          status: "info",
          details: { post_id: job.post_id, reason: validation.error },
        });
        return { published: false };
      }
      await failJob(job, validation.error!, true);
    }
    return { published: false, error: validation.error };
  }

  // ─── Mark publishing ───
  await storage.updateSocialSyncPost(job.post_id, { status: "publishing" } as any);

  await storage.createSocialSyncLog({
    client_id: job.client_id,
    entity_type: "post",
    entity_id: job.post_id,
    action: "post.publish_started",
    status: "info",
    details: { queue_id: job.id, platform: job.platform, attempt: (job.attempts || 0) + 1 },
  });

  // ─── Publish ───
  let result: PublishResult;
  switch (job.platform) {
    case "facebook":
      result = await publishToFacebook(job.client_id, post);
      break;
    default:
      result = {
        success: false,
        platform: job.platform as any,
        remote_post_id: null,
        page_id: "",
        published_at: null,
        error: `Platform "${job.platform}" publishing not yet implemented`,
        permanent_failure: true,
      };
      break;
  }

  // ─── Handle result ───
  if (result.success) {
    await storage.updateSocialSyncQueueItem(job.id, {
      status: "completed",
      locked_at: null,
      attempts: (job.attempts || 0) + 1,
      worker_note: `Published to ${result.platform}. Remote ID: ${result.remote_post_id || "n/a"}`,
      updated_at: new Date(),
    });

    await storage.updateSocialSyncPost(job.post_id, {
      status: "published",
      published_at: new Date(),
      publish_result: {
        platform: result.platform,
        remote_post_id: result.remote_post_id,
        page_id: result.page_id,
        published_at: result.published_at,
        response_summary: result.raw_response_summary || null,
      },
    } as any);

    await storage.createSocialSyncLog({
      client_id: job.client_id,
      entity_type: "post",
      entity_id: job.post_id,
      action: "post.published",
      status: "success",
      details: {
        queue_id: job.id,
        platform: result.platform,
        remote_post_id: result.remote_post_id,
        page_id: result.page_id,
      },
    });

    return { published: true };
  }

  // ─── Failure handling ───
  const attempts = (job.attempts || 0) + 1;
  const maxAttempts = job.max_attempts || 3;
  const isPermanent = result.permanent_failure || attempts >= maxAttempts;

  if (isPermanent) {
    await failJob(job, result.error || "Unknown publish error", true, result);
  } else {
    await storage.updateSocialSyncQueueItem(job.id, {
      status: "pending",
      locked_at: null,
      attempts,
      last_error: result.error,
      worker_note: `Attempt ${attempts}/${maxAttempts} failed (${result.error_code ? `code ${result.error_code}` : "transient"}): ${result.error}`,
      updated_at: new Date(),
    });

    await storage.updateSocialSyncPost(job.post_id, { status: "queued" } as any);

    await storage.createSocialSyncLog({
      client_id: job.client_id,
      entity_type: "queue",
      entity_id: job.id,
      action: "queue.retry",
      status: "info",
      details: {
        post_id: job.post_id,
        platform: job.platform,
        attempt: attempts,
        max_attempts: maxAttempts,
        error: result.error,
        error_code: result.error_code,
      },
    });
  }

  return { published: false, error: result.error };
}

/* ─── Unexpected Error Handler ─── */

async function handleUnexpectedError(job: SocialSyncQueueItem, error: string): Promise<void> {
  const attempts = (job.attempts || 0) + 1;
  const maxAttempts = job.max_attempts || 3;

  if (attempts >= maxAttempts) {
    await failJob(job, `Unexpected error: ${error}`, false);
  } else {
    await storage.updateSocialSyncQueueItem(job.id, {
      status: "pending",
      locked_at: null,
      attempts,
      last_error: `Unexpected: ${error}`,
      updated_at: new Date(),
    });

    // Reset post if it's stuck in publishing
    try {
      const post = await storage.getSocialSyncPostById(job.post_id);
      if (post && post.status === "publishing") {
        await storage.updateSocialSyncPost(job.post_id, { status: "queued" } as any);
      }
    } catch { /* best effort */ }
  }

  await storage.createSocialSyncLog({
    client_id: job.client_id,
    entity_type: "queue",
    entity_id: job.id,
    action: "queue.unexpected_error",
    status: "failure",
    details: { post_id: job.post_id, error, attempts },
  });
}

/* ─── Fail Job Helper ─── */

async function failJob(
  job: SocialSyncQueueItem,
  error: string,
  isPermanent: boolean,
  publishResult?: PublishResult,
): Promise<void> {
  const attempts = (job.attempts || 0) + 1;
  const maxAttempts = job.max_attempts || 3;

  await storage.updateSocialSyncQueueItem(job.id, {
    status: "failed",
    locked_at: null,
    attempts,
    last_error: error,
    worker_note: isPermanent
      ? `Permanent failure: ${error}`
      : `Failed after ${maxAttempts} attempts: ${error}`,
    updated_at: new Date(),
  });

  await storage.updateSocialSyncPost(job.post_id, {
    status: "failed",
    failure_reason: error,
    publish_result: publishResult ? {
      platform: publishResult.platform,
      error: publishResult.error,
      error_code: publishResult.error_code,
      page_id: publishResult.page_id,
      permanent: isPermanent,
      response_summary: publishResult.raw_response_summary || null,
    } : { error, permanent: isPermanent },
  } as any);

  await storage.createSocialSyncLog({
    client_id: job.client_id,
    entity_type: "queue",
    entity_id: job.id,
    action: "queue.failed",
    status: "failure",
    details: {
      post_id: job.post_id,
      platform: job.platform,
      error,
      permanent: isPermanent,
      attempts,
      error_code: publishResult?.error_code,
    },
  });
}
