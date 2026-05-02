/**
 * Google Business Profile review ingestion and reply posting.
 *
 * Platform-specific API interactions for GBP reviews.
 * Separated from core review logic so other platforms (Facebook, Yelp)
 * can be added without touching classification/reply generation.
 */
import { storage } from "../../storage";
import { getGoogleAccessToken } from "../socialSync/googleBusinessService";
import { classifyReview, generateReply, type ReplyContext } from "./reviewCore";
import {
  sendAlert, buildNegativeReviewAlert, buildEscalatedReviewAlert, isAlertingConfigured,
} from "../socialSync/alertService";
import { attemptAttribution } from "./reviewAttribution";
import { createReviewReplyDraft } from "../contentflow/draftService";
import { autoApproveDraft } from "../contentflow/approvalService";
import { decideAutoApprove, readClientPolicy } from "../contentflow/reviewReplyPolicy";
import { enqueueGbpReviewReplyDraft } from "../contentflow/wordpressQueue";
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
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ success: boolean; error?: string; result?: any; status?: number }> {
  /* Sprint 9: optional apiBase override (or env var) lets the dev GBP
   * mock take the call without touching the real Google endpoint.
   * Defaults to the real My Business v4 base. */
  const overrideAllowed = process.env.NODE_ENV !== "production" && process.env.GBP_API_BASE_OVERRIDE;
  const apiBase = opts.apiBase || overrideAllowed || GBP_API_V4;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const url = `${apiBase}/${locationName}/reviews/${reviewId}/reply`;
    const res = await fetchImpl(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: replyText }),
    });
    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      return { success: false, error: data?.error?.message || res.statusText, result: { status: res.status, error: data?.error }, status: res.status };
    }
    return { success: true, result: { status: res.status, comment: data.comment }, status: res.status };
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

      // Attribution: try to match this review to a sent request
      if (isNew) {
        try { await attemptAttribution(review); } catch { /* non-blocking */ }
      }

      // Alert for new negative/escalated reviews (dedup: only if not yet alerted)
      if (isNew && !review.alerted_at && isAlertingConfigured()) {
        const shouldAlert = classification.sentiment === "urgent" || classification.sentiment === "negative";
        if (shouldAlert) {
          try {
            const client = await storage.getClientById(clientId);
            const snippet = raw.comment || "(no text)";
            const alert = classification.escalation
              ? buildEscalatedReviewAlert(clientId, client?.business_name || null, "google_business", stars, raw.reviewer?.displayName || null, snippet)
              : buildNegativeReviewAlert(clientId, client?.business_name || null, "google_business", stars, raw.reviewer?.displayName || null, snippet);
            await sendAlert(alert);
            await storage.updateReview(review.id, { alerted_at: new Date() } as any);
          } catch { /* Alert failure shouldn't block review processing */ }
        }
      }

      if (hasOwnerReply || review.reply_status === "auto_replied" || review.reply_status === "manually_replied") {
        continue;
      }

      // Generate reply (existing AI generator — preserved verbatim).
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

      /* Sprint 9: route through ContentFlow.
       *
       * Replaces the pre-Sprint-9 inline auto-reply (postGBPReply at
       * ingestion time, no audit trail). Now every reply becomes a
       * content_drafts row of kind='review_reply'. The per-client
       * policy (clients.metadata.review_reply_policy — default
       * 'auto_high_star' preserves prior behaviour) decides whether
       * to autoApprove + enqueue immediately or hold for manual
       * approval via the admin queue / client portal.
       *
       * Actual GBP posting now happens on the next publish-queue tick
       * (≤2 min latency), with full retry / dead-letter / audit trail. */
      if (!review.reply_text) continue;

      try {
        const draft = await createReviewReplyDraft({
          clientId,
          reviewId: review.id,
          externalReviewId: raw.reviewId,
          starRating: review.star_rating,
          replyText: review.reply_text,
          source: "auto",
        });

        const client = await storage.getClientById(clientId);
        const policy = readClientPolicy(client);
        const decision = decideAutoApprove(policy, review);

        if (decision.autoApprove) {
          await autoApproveDraft({
            draftId: draft.id,
            notes: `auto-approved (${decision.reason})`,
          });
          await enqueueGbpReviewReplyDraft(draft.id);
          result.replies_posted++; // Counted as queued for publish; the
                                   // queue worker is what actually posts.
        }
        /* else: draft is in 'draft' status awaiting manual approval —
         * shows up in admin queue + client portal. */
      } catch (err: any) {
        result.errors.push(`ContentFlow draft creation failed for review ${review.id}: ${err.message}`);
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
