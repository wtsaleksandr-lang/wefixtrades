import { storage } from "../storage";
import { publishToFacebook, type PublishResult } from "../services/socialSync/facebookPublisher";
import type { SocialSyncPost, SocialSyncQueueItem } from "@shared/schema";

/**
 * SocialSync publish queue worker.
 *
 * Polls due queue items and publishes to the target platform.
 * Currently supports: Facebook (real publish)
 * Stub: Instagram, Google Business, LinkedIn (logged as unsupported)
 */
export async function processSocialSyncQueue(): Promise<{ processed: number; published: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let published = 0;

  const dueJobs = await storage.fetchDueSocialSyncJobs(20);
  if (dueJobs.length === 0) return { processed: 0, published: 0, errors: [] };

  for (const job of dueJobs) {
    try {
      // Lock the job
      await storage.updateSocialSyncQueueItem(job.id, {
        status: "locked",
        locked_at: new Date(),
        updated_at: new Date(),
      });

      // Load the post
      const post = await storage.getSocialSyncPostById(job.post_id);
      if (!post) {
        await failJob(job, "Post not found", true);
        errors.push(`Job ${job.id}: post ${job.post_id} not found`);
        continue;
      }

      // Mark post as publishing
      await storage.updateSocialSyncPost(job.post_id, { status: "publishing" } as any);

      // Route to platform-specific publisher
      let result: PublishResult;
      switch (job.platform) {
        case "facebook":
          result = await publishToFacebook(job.client_id, post);
          break;
        default:
          // Platforms not yet implemented
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

      if (result.success) {
        // ─── Success ───
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

        published++;
        processed++;
      } else {
        // ─── Failure ───
        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.max_attempts || 3;
        const isPermanent = result.permanent_failure || attempts >= maxAttempts;

        if (isPermanent) {
          await failJob(job, result.error || "Unknown error", true, result);
        } else {
          // Transient — release for retry
          await storage.updateSocialSyncQueueItem(job.id, {
            status: "pending",
            locked_at: null,
            attempts,
            last_error: result.error,
            worker_note: `Attempt ${attempts}/${maxAttempts} failed: ${result.error}`,
            updated_at: new Date(),
          });

          // Reset post from publishing back to queued
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

        errors.push(`Job ${job.id}: ${result.error}`);
        processed++;
      }
    } catch (err: any) {
      // Unexpected error (not from publisher) — treat as transient
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.max_attempts || 3;

      if (attempts >= maxAttempts) {
        await failJob(job, err.message, false);
      } else {
        await storage.updateSocialSyncQueueItem(job.id, {
          status: "pending",
          locked_at: null,
          attempts,
          last_error: err.message,
          updated_at: new Date(),
        });
      }

      await storage.createSocialSyncLog({
        client_id: job.client_id,
        entity_type: "queue",
        entity_id: job.id,
        action: "queue.error",
        status: "failure",
        details: { post_id: job.post_id, error: err.message, attempts },
      });

      errors.push(`Job ${job.id}: ${err.message}`);
    }
  }

  return { processed, published, errors };
}

/**
 * Mark a job and its post as permanently failed.
 */
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
