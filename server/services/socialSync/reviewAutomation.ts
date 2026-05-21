/**
 * SocialSync review automation for Google Business Profile.
 *
 * Handles: review ingestion, classification, reply generation,
 * auto-reply policy, reply publishing, and batch orchestration.
 *
 * Uses the shared reviews schema so ReputationShield can also
 * consume/extend this data without duplication.
 */
import { storage } from "../../storage";
import { chat } from "../aiService";
import { getGoogleAccessToken } from "./googleBusinessService";
import type { Review, SocialSyncProfile } from "@shared/schema";

const GBP_API_V4 = "https://mybusiness.googleapis.com/v4";

/* ═══ A. Review Ingestion ═══ */

interface GBPReview {
  reviewId: string;
  reviewer: { displayName?: string };
  starRating: string; // ONE_STAR through FIVE_STAR
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

export interface SyncResult {
  fetched: number;
  new_reviews: number;
  replies_posted: number;
  errors: string[];
}

/**
 * Fetch recent GBP reviews, upsert into DB, classify, generate replies,
 * auto-post where policy allows.
 */
export async function syncAndProcessReviews(clientId: number): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, new_reviews: 0, replies_posted: 0, errors: [] };

  const credentials = await getGoogleAccessToken(clientId);
  if (!credentials) {
    result.errors.push("No active Google Business connection");
    await logSync(clientId, "failure", result);
    return result;
  }

  const profile = await storage.getSocialSyncProfile(clientId);

  // Fetch reviews from GBP API
  let rawReviews: GBPReview[];
  try {
    const res = await fetch(`${GBP_API_V4}/${credentials.locationName}/reviews?pageSize=50`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    const data = await res.json() as any;
    rawReviews = data.reviews || [];
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

      // Classify
      const classification = classifyReview(stars, raw.comment, hasOwnerReply);

      // Upsert review
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

      // If already replied or doesn't need reply, skip
      if (hasOwnerReply || review.reply_status === "auto_replied" || review.reply_status === "manually_replied") {
        continue;
      }

      // Generate reply for new unreplied reviews
      if (!review.reply_text) {
        try {
          const replyText = await generateReply(review, profile);
          await storage.updateReview(review.id, { reply_text: replyText, reply_status: classification.eligible_for_auto_reply ? "draft_ready" : "draft_ready" } as any);
          review.reply_text = replyText;
        } catch (err: any) {
          result.errors.push(`Reply gen failed for review ${review.id}: ${err.message}`);
          continue;
        }
      }

      // Auto-reply if policy allows
      if (classification.eligible_for_auto_reply && review.reply_text && !hasOwnerReply) {
        try {
          const posted = await postReply(credentials.token, credentials.locationName, raw.reviewId, review.reply_text);
          if (posted.success) {
            await storage.updateReview(review.id, {
              reply_status: "auto_replied",
              reply_posted_at: new Date(),
              reply_result: posted.result,
            } as any);
            result.replies_posted++;
          } else {
            await storage.updateReview(review.id, {
              reply_status: "failed",
              reply_result: posted.result,
            } as any);
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

/* ═══ B. Classification ═══ */

interface ReviewClassification {
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  needs_reply: boolean;
  eligible_for_auto_reply: boolean;
  requires_human_attention: boolean;
  escalation: boolean;
}

const ESCALATION_KEYWORDS = [
  "lawsuit", "attorney", "lawyer", "health department", "bbb",
  "report", "scam", "fraud", "injured", "damage", "dangerous",
  "news", "media", "worst experience", "never use",
];

function classifyReview(stars: number, text: string | undefined, hasOwnerReply: boolean): ReviewClassification {
  const lower = (text || "").toLowerCase();
  const hasEscalation = ESCALATION_KEYWORDS.some(k => lower.includes(k));

  if (stars >= 4) {
    return {
      sentiment: "positive",
      needs_reply: !hasOwnerReply,
      eligible_for_auto_reply: !hasOwnerReply, // Auto-reply to 4-5 star
      requires_human_attention: false,
      escalation: false,
    };
  }

  if (stars === 3) {
    return {
      sentiment: "neutral",
      needs_reply: !hasOwnerReply,
      eligible_for_auto_reply: false, // Draft only for 3-star
      requires_human_attention: !hasOwnerReply,
      escalation: hasEscalation,
    };
  }

  // 1-2 stars
  return {
    sentiment: hasEscalation ? "urgent" : "negative",
    needs_reply: !hasOwnerReply,
    eligible_for_auto_reply: false, // Never auto-reply to negative
    requires_human_attention: true,
    escalation: hasEscalation,
  };
}

/* ═══ C. Reply Generation ═══ */

async function generateReply(review: Review, profile: SocialSyncProfile | null | undefined): Promise<string> {
  const niche = profile?.niche || "home services";
  const location = profile?.location || "local area";
  const tone = profile?.tone || "professional";
  const businessContext = `a ${niche} business in ${location}`;

  const systemPrompt = `You are writing a Google Business review reply on behalf of ${businessContext}.
Tone: ${tone}, genuine, grateful, brief.

Rules:
- Sound like a real business owner, not a corporate support bot
- Keep it 1-3 sentences max
- Never use "We appreciate your feedback" or "Thank you for your valuable feedback" verbatim
- For positive reviews: warm thanks, mention something specific if possible
- For neutral reviews: appreciative, acknowledge concern, offer to help
- For negative reviews: calm, empathetic, non-defensive, invite offline resolution
- Never make promises about compensation or legal matters
- Never argue or blame the customer
- No emojis in negative review replies

Respond with the reply text only. No quotes, no labels, no explanation.`;

  const reviewSummary = review.review_text
    ? `"${review.review_text.slice(0, 300)}"`
    : "(no text, just a star rating)";

  const response = await chat({
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `Write a reply to this ${review.star_rating}-star Google review from ${review.reviewer_name || "a customer"}:\n\n${reviewSummary}`,
    }],
    maxTokens: 300,
    surface: "socialsync",
  });

  return response.trim();
}

/* ═══ D. Reply Publishing ═══ */

async function postReply(
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

/* ═══ E. Batch Orchestration ═══ */

export interface BatchReviewResult {
  clients_processed: number;
  total_fetched: number;
  total_new: number;
  total_replied: number;
  errors: string[];
}

/**
 * Process reviews for all enabled SocialSync clients with Google Business connections.
 */
export async function processAllClientReviews(): Promise<BatchReviewResult> {
  const batch: BatchReviewResult = { clients_processed: 0, total_fetched: 0, total_new: 0, total_replied: 0, errors: [] };

  const profiles = await storage.listEnabledSocialSyncProfiles();

  for (const profile of profiles) {
    // Check if client has a connected Google Business
    const connections = await storage.listSocialSyncConnections(profile.client_id);
    const gbp = connections.find(c => c.platform === "google_business" && (c.connection_status === "connected" || c.connection_status === "expiring_soon"));
    if (!gbp || !gbp.external_page_id) continue;

    try {
      const result = await syncAndProcessReviews(profile.client_id);
      batch.clients_processed++;
      batch.total_fetched += result.fetched;
      batch.total_new += result.new_reviews;
      batch.total_replied += result.replies_posted;
      if (result.errors.length > 0) {
        batch.errors.push(`Client ${profile.client_id}: ${result.errors.join("; ")}`);
      }
    } catch (err: any) {
      batch.errors.push(`Client ${profile.client_id} failed: ${err.message}`);
    }
  }

  return batch;
}
