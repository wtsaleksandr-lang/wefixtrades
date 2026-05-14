/**
 * Reply-post retry queue worker. Drains rows from `review_reply_post_queue`
 * whose `next_attempt_at` has elapsed, posts to the appropriate platform,
 * and either marks succeeded, schedules the next retry with exponential
 * backoff, or escalates to dead_letter when `max_attempts` is exhausted.
 *
 * Coexists with the synchronous post-to-google endpoint: that endpoint
 * attempts the immediate post for UX; only persistent failures get
 * enqueued here. The two paths share the same Google API helper —
 * difference is purely transport (immediate vs. retried).
 *
 * Backoff: 5min, 15min, 1h, 4h, 12h. Cap at max_attempts (default 5).
 */

import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { reviewReplyPostQueue, monitoredReviews } from "@shared/schema";
import { storage } from "../storage";
import { postGoogleReviewReply } from "../services/socialSync/googleBusinessService";
import { createLogger } from "../lib/logger";
import { notifyReplyPostFailure } from "../services/reputation/reputationAlerts";

const log = createLogger("ReplyPostQueue");

const BACKOFF_MINUTES = [5, 15, 60, 240, 720];
const BATCH_SIZE = 20;

export interface ReplyQueueDrainResult {
  picked: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}

export async function drainReplyPostQueue(): Promise<ReplyQueueDrainResult> {
  const result: ReplyQueueDrainResult = { picked: 0, succeeded: 0, retried: 0, deadLettered: 0 };

  // Atomically claim a batch — flips pending → in_flight in one UPDATE so
  // a parallel scheduler tick can't pick the same rows.
  const claimed = await db.update(reviewReplyPostQueue)
    .set({ status: "in_flight", updated_at: new Date() })
    .where(and(
      eq(reviewReplyPostQueue.status, "pending"),
      lte(reviewReplyPostQueue.next_attempt_at, new Date()),
    ))
    .returning();

  if (claimed.length === 0) return result;
  const batch = claimed.slice(0, BATCH_SIZE);
  result.picked = batch.length;

  // Any rows beyond BATCH_SIZE that we accidentally flipped to in_flight:
  // immediately flip back so the next tick can pick them. Cheap insurance
  // against a runaway tick consuming the entire queue at once.
  if (claimed.length > BATCH_SIZE) {
    const overflow = claimed.slice(BATCH_SIZE).map((r) => r.id);
    await db.update(reviewReplyPostQueue)
      .set({ status: "pending" })
      .where(sql`${reviewReplyPostQueue.id} = ANY(${overflow})`);
  }

  for (const item of batch) {
    try {
      // Fetch the review once — every platform needs its external ID.
      const review = await storage.getMonitoredReviewById(item.monitored_review_id);
      if (!review) {
        await escalateOrRetry(item, "Monitored review not found", result);
        continue;
      }

      let postResult: { ok: boolean; error?: string } = { ok: false, error: "no platform handler" };

      if (item.platform === "google") {
        if (!review.google_review_name) {
          await escalateOrRetry(item, "Review missing google_review_name", result);
          continue;
        }
        postResult = await postGoogleReviewReply(item.client_id, review.google_review_name, item.reply_text);
      } else if (item.platform === "trustpilot") {
        const { postTrustpilotReply, isConfigured: tpConfigured } = await import("../services/reputation/trustpilotClient");
        if (!tpConfigured()) {
          await escalateOrRetry(item, "Trustpilot not configured", result);
          continue;
        }
        const bizUnit = (item.metadata as any)?.business_unit_id;
        if (!bizUnit) {
          await escalateOrRetry(item, "Trustpilot metadata.business_unit_id missing", result);
          continue;
        }
        if (!review.external_review_id) {
          await escalateOrRetry(item, "Review missing external_review_id for Trustpilot", result);
          continue;
        }
        postResult = await postTrustpilotReply({
          businessUnitId: bizUnit,
          externalReviewId: review.external_review_id,
          replyText: item.reply_text,
        });
      } else if (item.platform === "facebook") {
        const { postFacebookReply, isConfigured: fbConfigured } = await import("../services/reputation/facebookReplyClient");
        if (!fbConfigured()) {
          await escalateOrRetry(item, "Facebook not configured", result);
          continue;
        }
        if (!review.external_review_id) {
          await escalateOrRetry(item, "Review missing external_review_id for Facebook", result);
          continue;
        }
        postResult = await postFacebookReply({
          clientId: item.client_id,
          recommendationId: review.external_review_id,
          replyText: item.reply_text,
        });
      } else if (item.platform === "yelp") {
        // Yelp does not support programmatic replies. Dead-letter
        // immediately with a clear operator-actionable message — no
        // amount of retrying is going to change Yelp's API.
        await db.update(reviewReplyPostQueue)
          .set({
            status: "dead_letter",
            attempts: item.attempts + 1,
            last_error: "Yelp does not support programmatic replies — reply manually via biz.yelp.com",
            last_attempt_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(reviewReplyPostQueue.id, item.id));
        result.deadLettered++;
        continue;
      } else {
        await escalateOrRetry(item, `Unsupported platform: ${item.platform}`, result);
        continue;
      }

      if (postResult.ok) {
        await db.update(reviewReplyPostQueue)
          .set({
            status: "succeeded",
            succeeded_at: new Date(),
            last_attempt_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(reviewReplyPostQueue.id, item.id));
        // Mirror onto the monitored_review.
        await storage.updateMonitoredReview(item.monitored_review_id, {
          response_text: item.reply_text,
          response_date: new Date(),
          posted_via: "reputationshield_retry",
          posted_at: new Date(),
        });
        result.succeeded++;
        log.info(`Reply posted via retry queue for review ${item.monitored_review_id} (attempt ${item.attempts + 1})`);
      } else {
        await escalateOrRetry(item, postResult.error || "post returned not ok", result);
      }
    } catch (err: any) {
      await escalateOrRetry(item, err.message, result);
    }
  }

  return result;
}

async function escalateOrRetry(
  item: typeof reviewReplyPostQueue.$inferSelect,
  errorMsg: string,
  result: ReplyQueueDrainResult,
): Promise<void> {
  const nextAttemptNumber = item.attempts + 1;
  const isDead = nextAttemptNumber >= item.max_attempts;

  if (isDead) {
    await db.update(reviewReplyPostQueue)
      .set({
        status: "dead_letter",
        attempts: nextAttemptNumber,
        last_error: errorMsg,
        last_attempt_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(reviewReplyPostQueue.id, item.id));
    result.deadLettered++;

    // Critical alert — operator must intervene.
    const client = await storage.getClientById(item.client_id);
    await notifyReplyPostFailure({
      clientId: item.client_id,
      businessName: client?.business_name || `Client #${item.client_id}`,
      reviewId: item.monitored_review_id,
      error: `Dead-lettered after ${nextAttemptNumber} attempts: ${errorMsg}`,
      retryable: false,
    });
    return;
  }

  const backoffMin = BACKOFF_MINUTES[Math.min(nextAttemptNumber, BACKOFF_MINUTES.length - 1)];
  await db.update(reviewReplyPostQueue)
    .set({
      status: "pending",
      attempts: nextAttemptNumber,
      last_error: errorMsg,
      last_attempt_at: new Date(),
      next_attempt_at: new Date(Date.now() + backoffMin * 60 * 1000),
      updated_at: new Date(),
    })
    .where(eq(reviewReplyPostQueue.id, item.id));
  result.retried++;
}

/**
 * Enqueue a reply for retry. Called from post-to-google after the
 * synchronous attempt fails with a retryable error. Idempotent on
 * (monitored_review_id, status='pending').
 */
export async function enqueueReplyForRetry(input: {
  monitoredReviewId: number;
  clientId: number;
  replyText: string;
  createdBy?: number | null;
  initialError?: string;
}): Promise<{ id: number; enqueued: boolean }> {
  // Idempotency: don't enqueue if there's already a live attempt.
  const existing = await db.select({ id: reviewReplyPostQueue.id })
    .from(reviewReplyPostQueue)
    .where(and(
      eq(reviewReplyPostQueue.monitored_review_id, input.monitoredReviewId),
      sql`${reviewReplyPostQueue.status} IN ('pending', 'in_flight')`,
    ))
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, enqueued: false };
  }

  const [row] = await db.insert(reviewReplyPostQueue).values({
    monitored_review_id: input.monitoredReviewId,
    client_id: input.clientId,
    platform: "google",
    reply_text: input.replyText,
    status: "pending",
    attempts: 0,
    next_attempt_at: new Date(Date.now() + BACKOFF_MINUTES[0] * 60 * 1000),
    last_error: input.initialError ?? null,
    created_by: input.createdBy ?? null,
  }).returning({ id: reviewReplyPostQueue.id });

  return { id: row!.id, enqueued: true };
}
