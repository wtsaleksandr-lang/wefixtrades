/**
 * Review attribution — heuristic matching between review requests
 * and received reviews.
 *
 * Matching strategy:
 *   1. Same client, same platform
 *   2. Review appeared within 1–21 days after request was sent
 *   3. Name similarity between customer and reviewer
 *
 * Confidence levels:
 *   HIGH   — strong name match + review within 7 days of request
 *   MEDIUM — moderate name match OR review within 3 days (any name)
 *   LOW    — weak name similarity within 21-day window
 *   NONE   — no match found
 *
 * This is heuristic attribution, not guaranteed causation.
 * Labels use "likely" and "estimated" language.
 */
import { storage } from "../../storage";
import type { Review, ReviewRequest } from "@shared/schema";

/* ─── Config ─── */

const MATCH_WINDOW_DAYS = 21;       // Max days after request to consider a match
const HIGH_WINDOW_DAYS = 7;         // Within this window + name match = HIGH
const MEDIUM_WINDOW_DAYS = 3;       // Within this window = at least MEDIUM

/* ─── Name Matching ─── */

function normalizeNameWords(name: string | null): string[] {
  if (!name) return [];
  return name.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 1);
}

function nameSimilarity(a: string | null, b: string | null): "strong" | "moderate" | "weak" | "none" {
  const wordsA = normalizeNameWords(a);
  const wordsB = normalizeNameWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return "none";

  // Check for exact full-name match
  const fullA = wordsA.join(" ");
  const fullB = wordsB.join(" ");
  if (fullA === fullB) return "strong";

  // Check for first-name match
  if (wordsA[0] === wordsB[0]) {
    // First name matches — check if last name also matches
    if (wordsA.length > 1 && wordsB.length > 1 && wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) {
      return "strong";
    }
    return "moderate";
  }

  // Check for last-name match (common in some display formats)
  if (wordsA.length > 1 && wordsB.length > 1 && wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) {
    return "moderate";
  }

  // Check for any shared significant word
  const shared = wordsA.filter(w => wordsB.includes(w) && w.length > 2);
  if (shared.length > 0) return "weak";

  return "none";
}

/* ─── Attribution Logic ─── */

export type AttributionConfidence = "high" | "medium" | "low";

interface AttributionMatch {
  request: ReviewRequest;
  confidence: AttributionConfidence;
  reason: string;
  daysBetween: number;
}

/**
 * Try to match a review to a recent review request for the same client.
 */
export function findBestMatch(
  review: Review,
  requests: ReviewRequest[],
): AttributionMatch | null {
  if (!review.review_time) return null;
  const reviewTime = new Date(review.review_time).getTime();

  let bestMatch: AttributionMatch | null = null;

  for (const req of requests) {
    // Must be sent
    if (!req.sent_at) continue;
    // Must not already be attributed to another review
    if (req.attributed_review_id && req.attributed_review_id !== review.id) continue;
    // Must be same client
    if (req.client_id !== review.client_id) continue;

    const sentTime = new Date(req.sent_at).getTime();
    const daysBetween = (reviewTime - sentTime) / (1000 * 60 * 60 * 24);

    // Review must come AFTER request, within window
    if (daysBetween < 0 || daysBetween > MATCH_WINDOW_DAYS) continue;

    const nameMatch = nameSimilarity(req.customer_name, review.reviewer_name);

    let confidence: AttributionConfidence | null = null;
    let reason = "";

    if (nameMatch === "strong" && daysBetween <= HIGH_WINDOW_DAYS) {
      confidence = "high";
      reason = `Strong name match "${req.customer_name}" ≈ "${review.reviewer_name}", ${Math.round(daysBetween)}d after request`;
    } else if (nameMatch === "strong") {
      confidence = "medium";
      reason = `Strong name match, ${Math.round(daysBetween)}d after request`;
    } else if (nameMatch === "moderate" && daysBetween <= HIGH_WINDOW_DAYS) {
      confidence = "medium";
      reason = `Moderate name match "${req.customer_name}" ≈ "${review.reviewer_name}", ${Math.round(daysBetween)}d after request`;
    } else if (daysBetween <= MEDIUM_WINDOW_DAYS) {
      confidence = "medium";
      reason = `Review within ${Math.round(daysBetween)}d of request (timing match)`;
    } else if (nameMatch === "moderate") {
      confidence = "low";
      reason = `Moderate name match, ${Math.round(daysBetween)}d after request`;
    } else if (nameMatch === "weak" && daysBetween <= HIGH_WINDOW_DAYS) {
      confidence = "low";
      reason = `Weak name similarity, ${Math.round(daysBetween)}d after request`;
    }

    if (!confidence) continue;

    // Keep the best match (higher confidence wins, then closer timing)
    if (!bestMatch || confidenceRank(confidence) > confidenceRank(bestMatch.confidence) ||
        (confidenceRank(confidence) === confidenceRank(bestMatch.confidence) && daysBetween < bestMatch.daysBetween)) {
      bestMatch = { request: req, confidence, reason, daysBetween };
    }
  }

  return bestMatch;
}

function confidenceRank(c: AttributionConfidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

/* ─── Attribution Flow ─── */

/**
 * Attempt attribution for a single review.
 * Called after review ingestion.
 */
export async function attemptAttribution(review: Review): Promise<AttributionMatch | null> {
  // Get recent sent requests for this client
  const requests = await storage.listReviewRequests(review.client_id, 100);
  const sentRequests = requests.filter(r => r.status === "sent" || r.status === "delivered");

  const match = findBestMatch(review, sentRequests);
  if (!match) return null;

  // Record attribution on both sides
  await storage.updateReviewRequest(match.request.id, {
    attributed_review_id: review.id,
    attribution_confidence: match.confidence,
    attribution_reason: match.reason,
    attributed_at: new Date(),
  });

  await storage.updateReview(review.id, {
    attributed_request_id: match.request.id,
  } as any);

  return match;
}

/**
 * Batch attribution pass for all unmatched reviews of a client.
 */
export async function runAttributionForClient(clientId: number): Promise<{ matched: number; total: number }> {
  const reviews = await storage.listReviews(clientId, { limit: 100 });
  const unmatched = reviews.filter(r => !r.attributed_request_id && r.review_time);

  let matched = 0;
  for (const review of unmatched) {
    const result = await attemptAttribution(review);
    if (result) matched++;
  }

  return { matched, total: unmatched.length };
}

/* ─── Insight Metrics ─── */

export interface AttributionInsights {
  requests_sent: number;
  likely_attributed: number;
  estimated_response_rate: number | null; // Percentage, labeled "estimated"
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  avg_days_to_review: number | null;
  recent_attributions: {
    review_id: number;
    request_id: number;
    reviewer_name: string | null;
    customer_name: string | null;
    star_rating: number | null;
    confidence: string;
    days_between: number;
    review_date: string | null;
  }[];
}

export async function getAttributionInsights(clientId: number): Promise<AttributionInsights> {
  const requests = await storage.listReviewRequests(clientId, 200);
  const sentRequests = requests.filter(r => r.status === "sent" || r.status === "delivered");
  const attributed = sentRequests.filter(r => r.attributed_review_id);

  const requestsSent = sentRequests.length;
  const likelyAttributed = attributed.length;
  const responseRate = requestsSent > 0 ? Math.round((likelyAttributed / requestsSent) * 100) : null;

  const high = attributed.filter(r => r.attribution_confidence === "high").length;
  const medium = attributed.filter(r => r.attribution_confidence === "medium").length;
  const low = attributed.filter(r => r.attribution_confidence === "low").length;

  // Average days to review
  const daysList: number[] = [];
  for (const req of attributed) {
    if (req.sent_at && req.attributed_at) {
      // Get the matched review's time
      const reviews = await storage.listReviews(clientId, { limit: 200 });
      const matchedReview = reviews.find(r => r.id === req.attributed_review_id);
      if (matchedReview?.review_time && req.sent_at) {
        const days = (new Date(matchedReview.review_time).getTime() - new Date(req.sent_at).getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0) daysList.push(days);
      }
    }
  }
  const avgDays = daysList.length > 0 ? Math.round((daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10) / 10 : null;

  // Recent attributions for display
  const recentAttributions: AttributionInsights["recent_attributions"] = [];
  const allReviews = await storage.listReviews(clientId, { limit: 200 });
  for (const req of attributed.slice(0, 10)) {
    const matchedReview = allReviews.find(r => r.id === req.attributed_review_id);
    if (matchedReview) {
      const days = req.sent_at && matchedReview.review_time
        ? Math.round((new Date(matchedReview.review_time).getTime() - new Date(req.sent_at).getTime()) / (1000 * 60 * 60 * 24) * 10) / 10
        : 0;
      recentAttributions.push({
        review_id: matchedReview.id,
        request_id: req.id,
        reviewer_name: matchedReview.reviewer_name,
        customer_name: req.customer_name,
        star_rating: matchedReview.star_rating,
        confidence: req.attribution_confidence || "unknown",
        days_between: days,
        review_date: matchedReview.review_time?.toISOString() || null,
      });
    }
  }

  return {
    requests_sent: requestsSent,
    likely_attributed: likelyAttributed,
    estimated_response_rate: responseRate,
    high_confidence: high,
    medium_confidence: medium,
    low_confidence: low,
    avg_days_to_review: avgDays,
    recent_attributions: recentAttributions,
  };
}
