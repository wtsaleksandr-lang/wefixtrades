import { storage } from "../storage";

/**
 * SocialSync publish queue worker.
 * Follows the same poll-lock-process-update pattern as notificationWorker.
 *
 * Phase 2A: Stub publish — marks items as completed without real API calls.
 */
export async function processSocialSyncQueue(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const dueJobs = await storage.fetchDueSocialSyncJobs(20);
  if (dueJobs.length === 0) return { processed: 0, errors: [] };

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
        await storage.updateSocialSyncQueueItem(job.id, {
          status: "failed",
          locked_at: null,
          attempts: (job.attempts || 0) + 1,
          last_error: "Post not found",
          updated_at: new Date(),
        });
        errors.push(`Job ${job.id}: post ${job.post_id} not found`);
        continue;
      }

      // Phase 2A stub: no real publish. Mark as completed.
      await storage.updateSocialSyncQueueItem(job.id, {
        status: "completed",
        locked_at: null,
        attempts: (job.attempts || 0) + 1,
        worker_note: "Phase 2A stub: marked as published without real API call",
        updated_at: new Date(),
      });

      // Update post to published
      await storage.updateSocialSyncPost(job.post_id, {
        status: "published",
        published_at: new Date(),
      } as any);

      // Log activity
      await storage.createSocialSyncLog({
        client_id: job.client_id,
        entity_type: "queue",
        entity_id: job.id,
        action: "queue.completed",
        status: "success",
        details: { post_id: job.post_id, platform: job.platform, stub: true },
      });

      processed++;
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.max_attempts || 3;

      if (attempts >= maxAttempts) {
        // Mark as permanently failed
        await storage.updateSocialSyncQueueItem(job.id, {
          status: "failed",
          locked_at: null,
          attempts,
          last_error: err.message,
          updated_at: new Date(),
        });
        // Mark the post as failed too
        await storage.updateSocialSyncPost(job.post_id, {
          status: "failed",
          failure_reason: `Queue failed after ${maxAttempts} attempts: ${err.message}`,
        } as any);
      } else {
        // Release lock for retry
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
        action: "queue.failed",
        status: "failure",
        details: { post_id: job.post_id, error: err.message, attempts },
      });

      errors.push(`Job ${job.id}: ${err.message}`);
    }
  }

  return { processed, errors };
}
