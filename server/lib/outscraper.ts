/**
 * Shared Outscraper client for Google review fetching.
 * Extracted from audit pipeline for reuse by monitoring engine.
 *
 * Uses Outscraper REST API directly (no SDK).
 * Handles async 202 polling.
 */
import { createLogger } from "./logger";
import { fetchWithRetry } from "./httpRetry";

const log = createLogger("Outscraper");

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
      log.error("[outscraper] poll error:", e.message);
    }
  }
  log.warn("Polling timed out waiting for Outscraper results", { resultsUrl, maxWaitMs });
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
    log.warn("[outscraper] OUTSCRAPER_API_KEY not set");
    return null;
  }
  if (!placeId) {
    log.warn("[outscraper] No placeId provided");
    return null;
  }

  const params = new URLSearchParams({
    query: placeId,
    reviewsLimit: String(limit),
    sort: "newest",
  });
  const url = `${API_BASE}/maps/reviews-v3?${params}`;

  let r: globalThis.Response;
  let rawText: string;

  try {
    r = await fetchWithRetry(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      timeoutMs: 25000,
    });
    rawText = await r.text();
  } catch (err: any) {
    log.error("[outscraper] fetchGoogleReviews error:", err.message);
    return null;
  }

  if (!r.ok) {
    log.error("[outscraper] Non-OK response:", { arg0: r.status, arg1: rawText.slice(0, 500) });
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    log.error("[outscraper] Invalid JSON response");
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
    log.warn("[outscraper] OUTSCRAPER_API_KEY not set");
    return null;
  }
  if (!facebookPageUrl) {
    log.warn("[outscraper] No facebookPageUrl provided");
    return null;
  }

  const params = new URLSearchParams({
    query: facebookPageUrl,
    reviewsLimit: String(limit),
    sort: "newest",
  });
  const url = `${API_BASE}/maps/reviews-v3?${params}`;

  let r: globalThis.Response;
  let rawText: string;

  try {
    r = await fetchWithRetry(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      timeoutMs: 25000,
    });
    rawText = await r.text();
  } catch (err: any) {
    log.error("[outscraper] fetchFacebookReviews error:", err.message);
    return null;
  }

  if (!r.ok) {
    log.error("[outscraper] Facebook reviews non-OK:", { arg0: r.status, arg1: rawText.slice(0, 500) });
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    log.error("[outscraper] Invalid JSON from Facebook reviews");
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
 * Generic Outscraper review fetch for the non-Google platforms.
 *
 * Outscraper exposes per-platform review endpoints that all share the
 * same async-poll response contract as reviews-v3. `endpoint` is the
 * path (e.g. "yelp/reviews"), `query` is the platform-specific
 * business identifier (Yelp business URL/id, Trustpilot domain/URL).
 *
 * NOTE: the exact endpoint paths/params should be confirmed against
 * the live Outscraper account on first run — they are key-gated and
 * wrapped in try/catch by every caller, so a wrong path degrades to
 * "no reviews" + a logged error rather than breaking Google/FB sync.
 */
async function fetchPlatformReviews(
  endpoint: string,
  query: string,
  limit: number,
): Promise<OutscraperReview[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    log.warn("[outscraper] OUTSCRAPER_API_KEY not set");
    return null;
  }
  if (!query) {
    log.warn(`[outscraper] No query provided for ${endpoint}`);
    return null;
  }

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    sort: "newest",
  });
  const url = `${API_BASE}/${endpoint}?${params}`;

  let r: globalThis.Response;
  let rawText: string;
  try {
    r = await fetchWithRetry(url, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      timeoutMs: 25000,
    });
    rawText = await r.text();
  } catch (err: any) {
    log.error(`[outscraper] fetch ${endpoint} error:`, err.message);
    return null;
  }

  if (!r.ok) {
    log.error(`[outscraper] ${endpoint} non-OK:`, { arg0: r.status, arg1: rawText.slice(0, 500) });
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    log.error(`[outscraper] Invalid JSON from ${endpoint}`);
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
 * Fetch Yelp reviews for a business via Outscraper.
 * @param yelpQuery Yelp business URL or Yelp business id
 */
export async function fetchYelpReviews(
  yelpQuery: string,
  limit = 30,
): Promise<OutscraperReview[] | null> {
  return fetchPlatformReviews("yelp/reviews", yelpQuery, limit);
}

/**
 * Fetch Trustpilot reviews for a business via Outscraper.
 * @param trustpilotQuery Trustpilot business domain (e.g. "example.com") or full Trustpilot URL
 */
export async function fetchTrustpilotReviews(
  trustpilotQuery: string,
  limit = 30,
): Promise<OutscraperReview[] | null> {
  return fetchPlatformReviews("trustpilot/reviews", trustpilotQuery, limit);
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
  googleReviewName: string | null;
  rawPayload: Record<string, any>;
} {
  // Rating field name varies by platform (Google: review_rating;
  // Yelp/Trustpilot: rating / review_rating). Coerce string ratings too.
  const ratingRaw = raw.review_rating ?? raw.rating ?? (raw as any).stars;
  const rating = typeof ratingRaw === "number"
    ? ratingRaw
    : typeof ratingRaw === "string" && !isNaN(parseFloat(ratingRaw))
      ? parseFloat(ratingRaw)
      : 0;

  const dateStr = raw.review_datetime_utc || raw.date || (raw as any).review_date || (raw as any).datetime || null;
  const publishedAt = dateStr ? new Date(dateStr) : null;

  const responseText = raw.owner_answer || raw.response_text || (raw as any).reply || null;
  const responseDate = raw.owner_answer_timestamp
    ? new Date(raw.owner_answer_timestamp)
    : null;

  // Outscraper may return a Google review name like "accounts/.../locations/.../reviews/..."
  const googleReviewName = raw.review_id && raw.review_id.startsWith("accounts/")
    ? raw.review_id
    : null;

  return {
    externalId: raw.review_id || raw.author_id || (raw as any).id || null,
    reviewerName: raw.author_title || (raw as any).author_name || (raw as any).name || (raw as any).user_name || "Anonymous",
    rating,
    reviewText: raw.review_text || (raw as any).text || (raw as any).comment || null,
    publishedAt,
    responseText,
    responseDate,
    googleReviewName,
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
