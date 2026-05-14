/**
 * MapGuard review responder.
 *
 * Once per day, for every active MapGuard subscriber with a working GBP
 * connection, this:
 *
 *   1. Pulls fresh reviews into the `reviews` table via the existing
 *      reputation ingestion (syncGBPReviews()).
 *   2. Finds reviews where:
 *        platform = 'google_business'
 *        needs_reply = true
 *        has_existing_owner_reply = false
 *        reply_status IN ('pending', 'draft_ready')
 *        requires_human_attention = false
 *      That last filter holds urgent/legal-sensitive reviews back from
 *      auto-reply — those still require ops review through the existing
 *      reputation pipeline.
 *   3. Generates a reply via the MapGuard-specific generator.
 *   4. Posts to GBP via postGBPReply().
 *   5. Updates the review row (reply_status='auto_replied', reply_text,
 *      reply_posted_at, reply_result).
 *
 * Per-row error isolation. Per-client error isolation.
 */
import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import { clientServices, clients } from "@shared/schemas/adminCrm";
import { reviews } from "@shared/schemas/reviews";
import { syncGBPReviews, postGBPReply } from "../reputation/gbpReviewIngestion";
import { getGoogleAccessToken } from "../socialSync/googleBusinessService";
import { generateMapguardReviewReply } from "./mapguardPostGenerator";
import { storage } from "../../storage";
import { createLogger } from "../../lib/logger";

const log = createLogger("MapGuardReviewResponder");

const MAX_REPLIES_PER_CLIENT_PER_RUN = 10;

interface ResponderSummary {
  clients_processed: number;
  reviews_ingested: number;
  replies_drafted: number;
  replies_posted: number;
  reply_failures: number;
  client_errors: number;
}

export async function processMapguardReviewResponses(): Promise<ResponderSummary> {
  const summary: ResponderSummary = {
    clients_processed: 0,
    reviews_ingested: 0,
    replies_drafted: 0,
    replies_posted: 0,
    reply_failures: 0,
    client_errors: 0,
  };

  // Active ongoing-tier MapGuard subscribers.
  const subscribers = await db
    .selectDistinct({ client_id: clientServices.client_id })
    .from(clientServices)
    .innerJoin(clients, eq(clients.id, clientServices.client_id))
    .where(
      and(
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
        sql`${clientServices.service_id} IN ('mapguard-basic', 'mapguard-pro')`,
        eq(clients.automation_enabled, true),
      ),
    );

  for (const sub of subscribers) {
    try {
      summary.clients_processed += 1;

      // Skip clients without a working GBP connection upfront — saves
      // an ingestion round-trip that would error out anyway.
      const credentials = await getGoogleAccessToken(sub.client_id);
      if (!credentials) continue;

      // 1. Ingest fresh reviews from Google.
      const ingestResult = await syncGBPReviews(sub.client_id, {});
      summary.reviews_ingested += ingestResult.new_reviews;

      // 2. Find pending reviews this run should handle. Limited per
      //    client per run to avoid burning the GBP daily quota in one go.
      const pending = await db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.client_id, sub.client_id),
            eq(reviews.platform, "google_business"),
            eq(reviews.needs_reply, true),
            eq(reviews.has_existing_owner_reply, false),
            eq(reviews.requires_human_attention, false),
            sql`${reviews.reply_status} IN ('pending', 'draft_ready')`,
          ),
        )
        .limit(MAX_REPLIES_PER_CLIENT_PER_RUN);

      for (const review of pending) {
        try {
          // 3. Draft (or reuse existing draft).
          let replyText = review.reply_text;
          if (!replyText) {
            const draft = await generateMapguardReviewReply({
              clientId: sub.client_id,
              reviewerName: review.reviewer_name,
              rating: review.star_rating || 5,
              reviewText: review.review_text || "",
            });
            replyText = draft.reply;
            summary.replies_drafted += 1;
            await storage.updateReview(review.id, {
              reply_status: "draft_ready",
              reply_text: replyText,
            });
          }

          // 4. Post via GBP API.
          const postResult = await postGBPReply(
            credentials.token,
            credentials.locationName,
            review.external_review_id,
            replyText,
          );

          if (postResult.success) {
            await storage.updateReview(review.id, {
              reply_status: "auto_replied",
              reply_posted_at: new Date(),
              reply_result: postResult.result,
            });
            summary.replies_posted += 1;
          } else {
            await storage.updateReview(review.id, {
              reply_status: "failed",
              reply_result: { error: postResult.error, status: postResult.status },
            });
            summary.reply_failures += 1;
            log.warn("GBP review reply failed", {
              client_id: sub.client_id,
              review_id: review.id,
              error: postResult.error,
            });
          }
        } catch (err: any) {
          summary.reply_failures += 1;
          log.error("Reply draft/post crashed", {
            client_id: sub.client_id,
            review_id: review.id,
            error: err.message,
          });
        }
      }
    } catch (err: any) {
      summary.client_errors += 1;
      log.error("Responder failed for client", {
        client_id: sub.client_id,
        error: err.message,
      });
    }
  }

  log.info("MapGuard review responder run complete", summary);
  return summary;
}
