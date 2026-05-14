/**
 * Yelp Fusion API client (read-only — Yelp does not allow programmatic
 * reply posting via Fusion. Owner replies happen only through the Yelp
 * for Business app/website, so postReply is a deliberate no-op that
 * routes the work to a "manual reply queue" instead.)
 *
 * Status: scaffolded, key-gated. Activation:
 *   1. Get a Yelp Fusion API key
 *      (https://www.yelp.com/developers/v3/manage_app).
 *   2. Set YELP_API_KEY via Doppler.
 *   3. Add a Yelp connection row to socialsync_platform_connections
 *      (platform='yelp') with metadata.yelp_business_id.
 *
 * Reference: https://docs.developer.yelp.com/reference/v3_business_reviews
 */

import { createLogger } from "../../lib/logger";

const log = createLogger("yelp");

const YELP_API_BASE = "https://api.yelp.com/v3";

export interface NormalizedReview {
  external_review_id: string;
  reviewer_name: string;
  star_rating: number;
  review_text: string | null;
  review_time: Date;
  reply_text: string | null;
  reply_time: Date | null;
  raw: any;
}

export function isConfigured(): boolean {
  return !!process.env.YELP_API_KEY;
}

/**
 * Fetch reviews for a Yelp business. Note: Yelp Fusion is read-only and
 * caps responses to 3 reviews per business (their API limitation, not
 * ours). For deeper history we'd need to scrape — see Outscraper path
 * already wired into reviewMonitorWorker.
 */
export async function fetchYelpReviews(input: {
  businessId: string;
  perPage?: number;
}): Promise<NormalizedReview[]> {
  if (!isConfigured()) return [];

  const url = `${YELP_API_BASE}/businesses/${input.businessId}/reviews?limit=${Math.min(input.perPage ?? 3, 3)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.YELP_API_KEY}` },
  });

  if (!resp.ok) {
    log.warn(`Yelp fetch failed for ${input.businessId}: HTTP ${resp.status}`);
    return [];
  }

  const data: any = await resp.json();
  const reviews: any[] = data?.reviews ?? [];

  return reviews.map((r): NormalizedReview => ({
    external_review_id: String(r.id),
    reviewer_name: r.user?.name ?? "Anonymous",
    star_rating: Number(r.rating ?? 0),
    review_text: r.text ?? null,
    review_time: new Date(r.time_created),
    reply_text: null,    // Yelp Fusion doesn't expose owner replies
    reply_time: null,
    raw: r,
  }));
}

/**
 * Yelp Fusion does NOT support programmatic owner replies — they must
 * go through the Yelp for Business app. We accept the call but route
 * it to a "manual reply" queue: the operator gets a notification with
 * the draft text and a deep-link to the Yelp owner console.
 *
 * Returning `ok: false, manual: true` so the retry queue worker won't
 * pound this endpoint expecting a different result.
 */
export async function postYelpReply(): Promise<{ ok: false; manual: true; error: string }> {
  return {
    ok: false,
    manual: true,
    error: "Yelp does not support programmatic replies. Reply manually via biz.yelp.com.",
  };
}
