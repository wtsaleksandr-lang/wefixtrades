/**
 * Google Business Profile review ingestion and reply posting.
 *
 * Platform-specific API interactions for GBP reviews.
 * Separated from core review logic so other platforms (Facebook, Yelp)
 * can be added without touching classification/reply generation.
 */
import { storage } from "../../storage";
import { getGoogleAccessToken } from "../socialSync/googleBusinessService";
import { classifyReview, generateReply, shouldAutoReply, type ReplyContext } from "./reviewCore";
import type { Review } from "@shared/schema";

const GBP_API_V4 = "https://mybusiness.googleapis.com/v4";

/* ─── GBP Review Types ─── */

interface GBPReview {
  reviewId: string;
  reviewer: { displayName?: string };
  starRating: string;
  comment?: string;
  createTime: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime: string };
}

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  ONE_STAR: 1, TWO_STAR: 2, THREE_STAR: 3, FOUR_STAR: 4, FIVE_STAR: 5,
};

function parseStarRating(rating: string): number {
  return STAR_MAP[rating] || parseInt(rating) || 0;
}

/* ─── Fetch Reviews ─── */

export async function fetchGBPReviews(
  token: string,
  locationName: string,
): Promise<GBPReview[]> {
  const res = await fetch(`${GBP_API_V4}/${locationName}/reviews?pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GBP API ${res.status}: ${res.statusText}`);
  const data = await res.json() as any;
  return data.reviews || [];
}

/* ─── Post Reply ─── */

export async function postGBPReply(
  token: string,
  locationName: string,
  reviewId: string,
  replyText: string,
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    const url = `${GBP_API_V4}/${locationName}/reviews/${reviewId}/reply`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: replyText }),
    });
    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      return { success: false, error: data?.error?.message || res.statusText, result: { status: res.status, error: data?.error } };
    }
    return { success: true, result: { status: res.status, comment: data.comment } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/* ─── Sync + Process ─── */

export interface SyncResult {
  fetched: number;
  new_reviews: number;
  replies_posted: number;
  errors: string[];
}

/**
 * Fetch GBP reviews, classify, generate replies, auto-post where policy allows.
 */
export async function syncGBPReviews(
  clientId: number,
  replyContext: ReplyContext = {},
): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, new_reviews: 0, replies_posted: 0, errors: [] };

  const credentials = await getGoogleAccessToken(clientId);
  if (!credentials) {
    result.errors.push("No active Google Business connection");
    await logSync(clientId, "failure", result);
    return result;
  }

  let rawReviews: GBPReview[];
  try {
    rawReviews = await fetchGBPReviews(credentials.token, credentials.locationName);
  } catch (err: any) {
    result.errors.push(`Fetch failed: ${err.message}`);
    await logSync(clientId, "failure", result);
    return result;
  }

  result.fetched = rawReviews.length;

  for (const raw of rawReviews) {
    try {
      const stars = parseStarRating(raw.starRating);
      const hasOwnerReply = !!raw.reviewReply;
      const existing = await storage.getReviewByExternalId(clientId, "google_business", raw.reviewId);
      const isNew = !existing;

      const classification = classifyReview(stars, raw.comment, hasOwnerReply);

      const review = await storage.upsertReview({
        client_id: clientId,
        platform: "google_business",
        external_review_id: raw.reviewId,
        reviewer_name: raw.reviewer?.displayName || null,
        star_rating: stars,
        review_text: raw.comment || null,
        review_time: raw.createTime ? new Date(raw.createTime) : null,
        sentiment: classification.sentiment,
        needs_reply: classification.needs_reply,
        eligible_for_auto_reply: classification.eligible_for_auto_reply,
        requires_human_attention: classification.requires_human_attention,
        has_existing_owner_reply: hasOwnerReply,
        escalation_flag: classification.escalation,
        reply_status: hasOwnerReply ? "skipped" : (existing?.reply_status || "pending"),
        reply_text: existing?.reply_text || null,
        reply_posted_at: existing?.reply_posted_at || null,
        reply_result: existing?.reply_result || null,
        metadata: { raw_star_rating: raw.starRating, update_time: raw.updateTime },
      } as any);

      if (isNew) result.new_reviews++;

      if (hasOwnerReply || review.reply_status === "auto_replied" || review.reply_status === "manually_replied") {
        continue;
      }

      // Generate reply
      if (!review.reply_text) {
        try {
          const replyText = await generateReply(review, replyContext);
          await storage.updateReview(review.id, { reply_text: replyText, reply_status: "draft_ready" } as any);
          review.reply_text = replyText;
        } catch (err: any) {
          result.errors.push(`Reply gen failed for review ${review.id}: ${err.message}`);
          continue;
        }
      }

      // Auto-reply if policy allows
      if (shouldAutoReply(review) && review.reply_text) {
        try {
          const posted = await postGBPReply(credentials.token, credentials.locationName, raw.reviewId, review.reply_text);
          if (posted.success) {
            await storage.updateReview(review.id, {
              reply_status: "auto_replied",
              reply_posted_at: new Date(),
              reply_result: posted.result,
            } as any);
            result.replies_posted++;
          } else {
            await storage.updateReview(review.id, { reply_status: "failed", reply_result: posted.result } as any);
            result.errors.push(`Reply post failed for review ${review.id}: ${posted.error}`);
          }
        } catch (err: any) {
          result.errors.push(`Reply post error for review ${review.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Review processing error: ${err.message}`);
    }
  }

  await logSync(clientId, "success", result);
  return result;
}

async function logSync(clientId: number, status: string, result: SyncResult) {
  await storage.createReviewSyncLog({
    client_id: clientId,
    platform: "google_business",
    status,
    reviews_fetched: result.fetched,
    new_reviews: result.new_reviews,
    replies_posted: result.replies_posted,
    error: result.errors.length > 0 ? result.errors.join("; ") : null,
    metadata: null,
  } as any);
}
