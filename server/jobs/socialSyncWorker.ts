import { storage } from "../storage";
import { publishToFacebook, isRateLimitError as isFbRateLimit, type PublishResult } from "../services/socialSync/facebookPublisher";
import { publishToInstagram, isRateLimitError as isIgRateLimit, type InstagramPublishResult } from "../services/socialSync/instagramPublisher";
import { publishToGoogleBusiness, type GooglePublishResult } from "../services/socialSync/googleBusinessPublisher";
import { checkCooldown, recordSuccess, recordRateLimit, recordFailure, recordPermanentFailure } from "../services/socialSync/cooldownManager";
import { sendAlert, buildPublishFailuresAlert, buildRateLimitedAlert, isAlertingConfigured } from "../services/socialSync/alertService";
import type { SocialSyncPost, SocialSyncQueueItem } from "@shared/schema";

/** Unified result type that all publishers can produce. */
type AnyPublishResult = PublishResult | InstagramPublishResult | GooglePublishResult;

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
export async function processSocialSyncQueue(): Promise<{ processed: number; published: number; recovered: number; skipped_cooldown: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let published = 0;
  let skippedCooldown = 0;

  // ─── Step 0: Recover stale locks ───
  const recovered = await recoverStaleLocks();

  // ─── Step 1: Fetch due jobs ───
  const dueJobs = await storage.fetchDueSocialSyncJobs(20);
  if (dueJobs.length === 0) return { processed: 0, published: 0, recovered, skipped_cooldown: 0, errors: [] };

  for (const job of dueJobs) {
    try {
      const result = await processOneJob(job);
      if (result.skipped) {
        skippedCooldown++;
        continue;
      }
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

  return { processed, published, recovered, skipped_cooldown: skippedCooldown, errors };
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

async function processOneJob(job: SocialSyncQueueItem): Promise<{ published: boolean; error?: string; skipped?: boolean }> {
  // ─── Cooldown check ───
  const cooldown = await checkCooldown(job.client_id, job.platform);
  if (cooldown.coolingDown) {
    // Skip this job without marking it failed — it will be retried later
    return { published: false, skipped: true, error: `Client ${job.client_id}/${job.platform} in cooldown (${cooldown.minutesLeft}min left: ${cooldown.reason})` };
  }

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
  let result: AnyPublishResult;
  switch (job.platform) {
    case "facebook":
      result = await publishToFacebook(job.client_id, post);
      break;
    case "instagram":
      result = await publishToInstagram(job.client_id, post);
      break;
    case "google_business":
      result = await publishToGoogleBusiness(job.client_id, post);
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
    // Normalize target ID across platforms
    const targetId = "page_id" in result ? result.page_id : "ig_account_id" in result ? result.ig_account_id : "location_name" in result ? result.location_name : "";

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
        target_id: targetId,
        published_at: result.published_at,
        ...("container_id" in result && result.container_id ? { container_id: result.container_id } : {}),
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
        target_id: targetId,
      },
    });

    // Record success for cooldown manager
    await recordSuccess(job.client_id, job.platform);

    return { published: true };
  }

  // ─── Failure handling ───
  const attempts = (job.attempts || 0) + 1;
  const maxAttempts = job.max_attempts || 3;
  const isPermanent = result.permanent_failure || attempts >= maxAttempts;

  // Detect rate limiting for better logging
  const errorCode = "error_code" in result ? result.error_code : undefined;
  const errorSubcode = "error_subcode" in result ? result.error_subcode : undefined;
  const isGoogleRateLimit = "rate_limited" in result && (result as any).rate_limited === true;
  const isRateLimit = isFbRateLimit(errorCode) || isIgRateLimit(errorCode, errorSubcode) || isGoogleRateLimit;

  if (isPermanent && !isRateLimit) {
    await failJob(job, result.error || "Unknown publish error", true, result);
    // Record permanent failure for suppression + alerting
    const { shouldAlert } = await recordPermanentFailure(job.client_id, job.platform, result.error || "unknown");
    if (shouldAlert && isAlertingConfigured()) {
      const client = await storage.getClientById(job.client_id);
      await sendAlert(buildPublishFailuresAlert(job.client_id, client?.business_name || null, job.platform, 3));
    }
  } else {
    // Rate-limited or transient — release for retry
    if (isRateLimit) {
      const { cooldownMinutes } = await recordRateLimit(job.client_id, job.platform);
      // Alert on repeated rate limits
      if (isAlertingConfigured()) {
        const client = await storage.getClientById(job.client_id);
        await sendAlert(buildRateLimitedAlert(job.client_id, client?.business_name || null, job.platform));
      }
    } else {
      await recordFailure(job.client_id, job.platform);
    }

    const note = isRateLimit
      ? `Rate limited (code ${errorCode}). Client in cooldown. Attempt ${attempts}/${maxAttempts}`
      : `Attempt ${attempts}/${maxAttempts} failed (${errorCode ? `code ${errorCode}` : "transient"}): ${result.error}`;

    await storage.updateSocialSyncQueueItem(job.id, {
      status: "pending",
      locked_at: null,
      attempts,
      last_error: result.error,
      worker_note: note,
      updated_at: new Date(),
    });

    await storage.updateSocialSyncPost(job.post_id, { status: "queued" } as any);

    await storage.createSocialSyncLog({
      client_id: job.client_id,
      entity_type: "queue",
      entity_id: job.id,
      action: isRateLimit ? "queue.rate_limited" : "queue.retry",
      status: "info",
      details: {
        post_id: job.post_id,
        platform: job.platform,
        attempt: attempts,
        max_attempts: maxAttempts,
        error: result.error,
        error_code: errorCode,
        rate_limited: isRateLimit,
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
  publishResult?: AnyPublishResult,
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

  const targetId = publishResult
    ? ("page_id" in publishResult ? publishResult.page_id : "ig_account_id" in publishResult ? publishResult.ig_account_id : "location_name" in publishResult ? publishResult.location_name : "")
    : "";

  await storage.updateSocialSyncPost(job.post_id, {
    status: "failed",
    failure_reason: error,
    publish_result: publishResult ? {
      platform: publishResult.platform,
      error: publishResult.error,
      error_code: publishResult.error_code,
      target_id: targetId,
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
