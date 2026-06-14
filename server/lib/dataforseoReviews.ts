/**
 * dataforseoReviews.ts
 *
 * DataForSEO-primary competitor/client Google-review fetcher with a
 * provider chain so the review pipeline is NO LONGER Outscraper-dependent.
 *
 * Provider chain (for review BODIES):
 *   1. DataForSEO  — Business Data → Google → Reviews (task_post + poll).
 *                    PRIMARY. Creds already in Doppler
 *                    (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).
 *   2. Google Places (New) Details `reviews` — SECONDARY. Caps at 5
 *                    reviews (Google's hard limit) but is free/already-keyed
 *                    (GOOGLE_MAPS_API_KEY) and instant.
 *   3. Outscraper  — LAST-RESORT fallback (the previously-sole provider,
 *                    currently 402-overdrawn → degraded).
 *
 * Output contract: every provider returns `OutscraperReview[]` (the raw
 * shape consumed by `normalizeReview()` in ./outscraper.ts) so the
 * downstream review-monitor pipeline is unchanged. Field names are mapped
 * to the Outscraper raw keys that `normalizeReview` already reads
 * (review_id / author_title / review_text / review_rating /
 * review_datetime_utc / owner_answer / owner_answer_timestamp / review_link).
 *
 * VERIFIED LIVE (2026-06-14, prd creds) — the exact shapes mapped here were
 * confirmed against real API responses, not docs:
 *
 *   DataForSEO item (.../google/reviews/task_get/{id} → tasks[0].result[0].items[]):
 *     review_id, profile_name, review_text, rating.value, timestamp,
 *     owner_answer, owner_timestamp, review_url
 *   NOTE: DataForSEO reviews are task-based and queue-throttled. priority:2
 *   (premium queue) completes in ~30s; the default queue can stall for many
 *   minutes — so we always post with priority:2 and poll with a deadline.
 *   place_id is NOT accepted as input — keyword (business name) +
 *   location_name are required.
 *
 *   Places Details review (.../v1/places/{id}?fields=reviews → reviews[]):
 *     name, text.text, rating, authorAttribution.displayName, publishTime
 */

import { createLogger } from "./logger";
import { fetchWithRetry } from "./httpRetry";
import type { OutscraperReview } from "./outscraper";
import { fetchGoogleReviews as fetchOutscraperGoogleReviews } from "./outscraper";

const log = createLogger("ReviewsChain");

/* ─── Provider 1: DataForSEO (PRIMARY) ─── */

const DFS_BASE = "https://api.dataforseo.com/v3/business_data/google/reviews";
const DFS_POLL_INTERVAL_MS = 4000;
const DFS_POLL_DEADLINE_MS = 40000;

/** Build the Basic-auth header. Auth pair, not a secret value we log. */
function dfsAuthHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/**
 * Map a raw DataForSEO review item to the Outscraper raw shape that
 * normalizeReview() consumes. Exported for unit testing.
 */
export function mapDataForSeoReview(item: any): OutscraperReview {
  const ratingValue =
    typeof item?.rating?.value === "number"
      ? item.rating.value
      : typeof item?.rating === "number"
        ? item.rating
        : undefined;

  return {
    review_id: item?.review_id ?? undefined,
    author_title: item?.profile_name ?? undefined,
    review_text: item?.review_text ?? undefined,
    review_rating: ratingValue,
    review_datetime_utc: item?.timestamp ?? undefined,
    owner_answer: item?.owner_answer ?? undefined,
    owner_answer_timestamp: item?.owner_timestamp ?? undefined,
    review_link: item?.review_url ?? undefined,
    review_img_urls: Array.isArray(item?.images)
      ? item.images.map((im: any) => im?.image_url).filter(Boolean)
      : undefined,
    // raw passthrough so nothing observed is lost downstream
    ...item,
  };
}

/**
 * Inject point for the network call so the unit test can stub HTTP without
 * a real DataForSEO account. Returns the parsed JSON body (or throws).
 */
export type HttpJson = (
  url: string,
  init: RequestInit & { timeoutMs?: number },
) => Promise<{ status: number; ok: boolean; json: any }>;

const defaultHttpJson: HttpJson = async (url, init) => {
  const r = await fetchWithRetry(url, init as any);
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: r.status, ok: r.ok, json };
};

/**
 * Fetch Google reviews for a business via DataForSEO (task_post + poll).
 *
 * place_id is rejected by this endpoint, so the caller MUST supply the
 * business name + a location label (e.g. "Toronto,Ontario,Canada"). Returns
 * the raw Outscraper-shaped reviews, or null on any failure/timeout (so the
 * chain falls through gracefully — never throws to the caller).
 *
 * @param http  injectable HTTP-JSON fn (defaults to fetchWithRetry); the
 *              test passes a stub returning fixtures.
 */
export async function fetchDataForSeoGoogleReviews(
  businessName: string,
  locationLabel: string,
  limit = 30,
  http: HttpJson = defaultHttpJson,
): Promise<OutscraperReview[] | null> {
  const auth = dfsAuthHeader();
  if (!auth) {
    log.warn("[chain:dataforseo] credentials not set");
    return null;
  }
  if (!businessName) {
    log.warn("[chain:dataforseo] businessName required (place_id not accepted by this endpoint)");
    return null;
  }

  // 1. Post task — priority 2 (premium queue) so it doesn't stall in the
  //    default queue (verified: default queue stalled >8min; priority 2 ~30s).
  let taskId: string | null = null;
  try {
    const post = await http(`${DFS_BASE}/task_post`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          keyword: businessName,
          location_name: locationLabel || "United States",
          language_code: "en",
          reviews_count: Math.min(Math.max(limit, 10), 100),
          sort_by: "newest",
          priority: 2,
        },
      ]),
      timeoutMs: 12000,
    });
    if (!post.ok) {
      log.warn("[chain:dataforseo] task_post non-OK", { status: post.status });
      return null;
    }
    taskId = post.json?.tasks?.[0]?.id ?? null;
    if (!taskId) {
      log.warn("[chain:dataforseo] no task id in task_post response");
      return null;
    }
  } catch (err: any) {
    log.warn("[chain:dataforseo] task_post error", { msg: err?.message });
    return null;
  }

  // 2. Poll task_get until status_code 20000 (Ok) or deadline.
  const start = Date.now();
  while (Date.now() - start < DFS_POLL_DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, DFS_POLL_INTERVAL_MS));
    try {
      const get = await http(`${DFS_BASE}/task_get/${taskId}`, {
        method: "GET",
        headers: { Authorization: auth },
        timeoutMs: 10000,
      });
      const task = get.json?.tasks?.[0];
      const statusCode: number | undefined = task?.status_code;
      if (statusCode === 20000) {
        const items: any[] = task?.result?.[0]?.items ?? [];
        log.info("[chain:dataforseo] complete", { items: items.length });
        return items.map(mapDataForSeoReview);
      }
      // 40602 = "Task In Queue" → keep polling; any other 4xxxx/5xxxx → bail.
      if (typeof statusCode === "number" && statusCode >= 40000 && statusCode !== 40602 && statusCode !== 40601) {
        log.warn("[chain:dataforseo] task error", { statusCode, msg: task?.status_message });
        return null;
      }
    } catch (err: any) {
      log.warn("[chain:dataforseo] poll error", { msg: err?.message });
      // transient — keep polling within the deadline
    }
  }
  log.warn("[chain:dataforseo] timed out", { deadlineMs: DFS_POLL_DEADLINE_MS });
  return null;
}

/* ─── Provider 2: Google Places Details (SECONDARY) ─── */

/**
 * Map a raw Places-Details review object to the Outscraper raw shape.
 * Exported for unit testing. Places caps at 5 reviews per place.
 */
export function mapPlacesReview(rev: any): OutscraperReview {
  const ratingValue = typeof rev?.rating === "number" ? rev.rating : undefined;
  // Places review "name" is "places/<id>/reviews/<reviewId>" — use the full
  // name as the external id so dedup stays stable across providers.
  const externalId: string | undefined =
    typeof rev?.name === "string" && rev.name.length > 0 ? rev.name : undefined;

  return {
    review_id: externalId,
    author_title: rev?.authorAttribution?.displayName ?? undefined,
    review_text: rev?.text?.text ?? rev?.originalText?.text ?? undefined,
    review_rating: ratingValue,
    review_datetime_utc: rev?.publishTime ?? undefined,
    owner_answer: undefined, // Places Details does not expose owner replies
    owner_answer_timestamp: undefined,
    review_link: rev?.googleMapsUri ?? undefined,
    ...rev,
  };
}

/**
 * Fetch up to 5 reviews for a place via Google Places (New) Details.
 * Returns raw Outscraper-shaped reviews, or null on failure (graceful).
 */
export async function fetchPlacesGoogleReviews(
  placeId: string,
  http: HttpJson = defaultHttpJson,
): Promise<OutscraperReview[] | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    log.warn("[chain:places] GOOGLE_MAPS_API_KEY not set");
    return null;
  }
  if (!placeId) {
    log.warn("[chain:places] placeId required");
    return null;
  }
  try {
    const res = await http(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,rating,userRatingCount,reviews",
      },
      timeoutMs: 12000,
    });
    if (!res.ok) {
      log.warn("[chain:places] Details non-OK", { status: res.status });
      return null;
    }
    const reviews: any[] = Array.isArray(res.json?.reviews) ? res.json.reviews : [];
    log.info("[chain:places] reviews", { count: reviews.length });
    return reviews.map(mapPlacesReview);
  } catch (err: any) {
    log.warn("[chain:places] error", { msg: err?.message });
    return null;
  }
}

/* ─── Orchestrator: DataForSEO → Places → Outscraper ─── */

export interface ReviewChainParams {
  placeId: string;
  businessName: string;
  /** e.g. "Toronto,Ontario,Canada" or "City, ST" — required for DataForSEO. */
  locationLabel: string;
  limit?: number;
}

export interface ReviewChainResult {
  reviews: OutscraperReview[];
  /** Which provider served the data — observable, no secret values. */
  provider: "dataforseo" | "places" | "outscraper" | "none";
}

/**
 * Fetch Google review bodies via the provider chain. Each provider is
 * best-effort; on failure/empty we fall to the next. Never throws — returns
 * { reviews: [], provider: "none" } when every provider is exhausted.
 */
export async function fetchGoogleReviewsChained(
  params: ReviewChainParams,
  deps: {
    dataforseo?: typeof fetchDataForSeoGoogleReviews;
    places?: typeof fetchPlacesGoogleReviews;
    outscraper?: typeof fetchOutscraperGoogleReviews;
  } = {},
): Promise<ReviewChainResult> {
  const { placeId, businessName, locationLabel, limit = 30 } = params;
  const dfs = deps.dataforseo ?? fetchDataForSeoGoogleReviews;
  const places = deps.places ?? fetchPlacesGoogleReviews;
  const outscraper = deps.outscraper ?? fetchOutscraperGoogleReviews;

  // 1. DataForSEO (primary)
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD && businessName) {
    const r = await dfs(businessName, locationLabel, limit);
    if (r && r.length > 0) {
      log.info("[chain] served by dataforseo", { count: r.length });
      return { reviews: r, provider: "dataforseo" };
    }
    log.warn("[chain] dataforseo empty/failed — falling through to places");
  } else {
    log.info("[chain] dataforseo skipped (no creds or no businessName)");
  }

  // 2. Google Places Details (secondary)
  if (process.env.GOOGLE_MAPS_API_KEY && placeId) {
    const r = await places(placeId);
    if (r && r.length > 0) {
      log.info("[chain] served by places", { count: r.length });
      return { reviews: r, provider: "places" };
    }
    log.warn("[chain] places empty/failed — falling through to outscraper");
  } else {
    log.info("[chain] places skipped (no key or no placeId)");
  }

  // 3. Outscraper (last-resort fallback)
  if (process.env.OUTSCRAPER_API_KEY && placeId) {
    const r = await outscraper(placeId, limit);
    if (r && r.length > 0) {
      log.info("[chain] served by outscraper", { count: r.length });
      return { reviews: r, provider: "outscraper" };
    }
    log.warn("[chain] outscraper empty/failed — all providers exhausted");
  } else {
    log.info("[chain] outscraper skipped (no key or no placeId)");
  }

  return { reviews: [], provider: "none" };
}
