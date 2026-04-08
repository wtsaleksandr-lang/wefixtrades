/**
 * Shared Outscraper client for Google review fetching.
 * Extracted from audit pipeline for reuse by monitoring engine.
 *
 * Uses Outscraper REST API directly (no SDK).
 * Handles async 202 polling.
 */

const API_BASE = "https://api.app.outscraper.com";

function getApiKey(): string | null {
  return process.env.OUTSCRAPER_API_KEY || null;
}

function withSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * Poll an Outscraper async results URL until data is ready or timeout.
 */
async function pollResults(
  resultsUrl: string,
  maxWaitMs = 30000,
  intervalMs = 1500,
): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(resultsUrl, {
        headers: { "X-API-KEY": getApiKey() || "" },
      });
      const data = await res.json();
      if (data.status !== "Pending" && data.data) {
        return data.data;
      }
    } catch (e: any) {
      console.error("[outscraper] poll error:", e.message);
    }
  }
  return [];
}

/** A single raw review from Outscraper. */
export interface OutscraperReview {
  review_id?: string;
  author_title?: string;
  author_id?: string;
  review_text?: string;
  review_rating?: number;
  rating?: number;
  review_datetime_utc?: string;
  date?: string;
  owner_answer?: string;
  response_text?: string;
  owner_answer_timestamp?: string;
  review_link?: string;
  review_img_urls?: string[];
  [key: string]: any; // raw payload passthrough
}

/**
 * Fetch individual Google reviews for a place_id.
 * Returns raw review objects for storage/processing.
 *
 * @param placeId Google Place ID
 * @param limit Max reviews to fetch (default 50)
 * @returns Array of raw review objects, or null on failure
 */
export async function fetchGoogleReviews(
  placeId: string,
  limit = 50,
): Promise<OutscraperReview[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[outscraper] OUTSCRAPER_API_KEY not set");
    return null;
  }
  if (!placeId) {
    console.warn("[outscraper] No placeId provided");
    return null;
  }

  const params = new URLSearchParams({
    query: placeId,
    reviewsLimit: String(limit),
    sort: "newest",
  });
  const url = `${API_BASE}/maps/reviews-v3?${params}`;

  const { signal, clear } = withSignal(25000);
  let r: globalThis.Response;
  let rawText: string;

  try {
    r = await fetch(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal,
    });
    rawText = await r.text();
  } catch (err: any) {
    console.error("[outscraper] fetchGoogleReviews error:", err.message);
    return null;
  } finally {
    clear();
  }

  if (!r.ok) {
    console.error("[outscraper] Non-OK response:", r.status, rawText.slice(0, 500));
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("[outscraper] Invalid JSON response");
    return null;
  }

  // Handle async polling
  let rawReviews = data?.data;
  if (data?.status === "Pending" && data?.results_location) {
    rawReviews = await pollResults(data.results_location);
  }

  const reviews: any[] = Array.isArray(rawReviews)
    ? rawReviews.flat()
    : Array.isArray(data)
      ? data.flat()
      : [];

  return reviews as OutscraperReview[];
}

/**
 * Fetch Facebook page reviews via Outscraper.
 * Uses the same reviews-v3 endpoint with the Facebook page URL as query.
 *
 * @param facebookPageUrl Full Facebook page URL (e.g., https://facebook.com/mybusiness)
 * @param limit Max reviews to fetch
 */
export async function fetchFacebookReviews(
  facebookPageUrl: string,
  limit = 30,
): Promise<OutscraperReview[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[outscraper] OUTSCRAPER_API_KEY not set");
    return null;
  }
  if (!facebookPageUrl) {
    console.warn("[outscraper] No facebookPageUrl provided");
    return null;
  }

  const params = new URLSearchParams({
    query: facebookPageUrl,
    reviewsLimit: String(limit),
    sort: "newest",
  });
  const url = `${API_BASE}/maps/reviews-v3?${params}`;

  const { signal, clear } = withSignal(25000);
  let r: globalThis.Response;
  let rawText: string;

  try {
    r = await fetch(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal,
    });
    rawText = await r.text();
  } catch (err: any) {
    console.error("[outscraper] fetchFacebookReviews error:", err.message);
    return null;
  } finally {
    clear();
  }

  if (!r.ok) {
    console.error("[outscraper] Facebook reviews non-OK:", r.status, rawText.slice(0, 500));
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("[outscraper] Invalid JSON from Facebook reviews");
    return null;
  }

  let rawReviews = data?.data;
  if (data?.status === "Pending" && data?.results_location) {
    rawReviews = await pollResults(data.results_location);
  }

  const reviews: any[] = Array.isArray(rawReviews)
    ? rawReviews.flat()
    : Array.isArray(data)
      ? data.flat()
      : [];

  return reviews as OutscraperReview[];
}

/**
 * Normalize a raw Outscraper review into a consistent shape.
 */
export function normalizeReview(raw: OutscraperReview): {
  externalId: string | null;
  reviewerName: string;
  rating: number;
  reviewText: string | null;
  publishedAt: Date | null;
  responseText: string | null;
  responseDate: Date | null;
  rawPayload: Record<string, any>;
} {
  const rating = typeof raw.review_rating === "number"
    ? raw.review_rating
    : typeof raw.rating === "number"
      ? raw.rating
      : 0;

  const dateStr = raw.review_datetime_utc || raw.date || null;
  const publishedAt = dateStr ? new Date(dateStr) : null;

  const responseText = raw.owner_answer || raw.response_text || null;
  const responseDate = raw.owner_answer_timestamp
    ? new Date(raw.owner_answer_timestamp)
    : null;

  return {
    externalId: raw.review_id || raw.author_id || null,
    reviewerName: raw.author_title || "Anonymous",
    rating,
    reviewText: raw.review_text || null,
    publishedAt,
    responseText,
    responseDate,
    rawPayload: raw,
  };
}

/**
 * Generate a stable dedup key for a review.
 * Uses external_id if available, otherwise hashes reviewer + date + rating.
 */
export function reviewDedupKey(
  placeId: string,
  normalized: ReturnType<typeof normalizeReview>,
): string {
  if (normalized.externalId) {
    return `${placeId}:${normalized.externalId}`;
  }
  // Fallback: deterministic key from content
  const dateStr = normalized.publishedAt?.toISOString().slice(0, 10) || "nodate";
  return `${placeId}:${normalized.reviewerName}:${normalized.rating}:${dateStr}`;
}
