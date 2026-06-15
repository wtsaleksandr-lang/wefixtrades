/**
 * competitorSearch.ts
 *
 * Fetches competitor data for the free-audit E1 step.
 *
 * Primary:  Google Places API (New) — Text Search
 * Fallback: Outscraper maps/search-v3 (used only when Places throws or returns 0 results)
 *
 * Cache key: `competitors:<category>:<city>` — 24 h TTL (managed by the
 * orchestrator below so neither fetcher double-writes).
 *
 * The search "category" is a real, human category label (a trade vertical for
 * trades, or the business's Google Places category for non-trades). It is NEVER
 * the literal "general" — a business with no usable category yields an empty
 * competitor block (null) rather than a junk "general near <city>" search.
 */

import { createLogger } from "../lib/logger";

const log = createLogger("CompetitorSearch");

/* ─── Types ─── */

export interface CompetitorEntry {
  name: string;
  rating: number;
  reviewsCount: number;
  hasWebsite: boolean;
  website: string;
  phoneNumber: string;
  photoUrl: string | null;
  score: number;
  placeId: string;
  googleMapsUrl: string;
  address: string;
  isRunningAds: boolean;
}

export interface CompetitorResult {
  competitors: CompetitorEntry[];
  areaAverageRating: number;
  areaAverageReviews: number;
  marketLeader: CompetitorEntry | null;
}

/* ─── Shared helpers ─── */

/** Abort-signal with auto-clear to avoid timer leaks. */
function withSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Scoring formula shared by both fetchers (must stay in sync with audit scoring). */
function scoreCompetitor(rating: number, reviews: number, hasWebsite: boolean, hasPhoto: boolean): number {
  const rating_score = (rating / 5) * 40;
  const review_score = Math.min(reviews / 200, 1) * 35;
  const website_score = hasWebsite ? 15 : 0;
  const photo_score = hasPhoto ? 10 : 0;
  return Math.round(rating_score + review_score + website_score + photo_score);
}

/**
 * Aggregate helper: turns a list of mapped competitors into the full
 * CompetitorResult shape (areaAverageRating, areaAverageReviews, marketLeader).
 */
function aggregate(competitors: CompetitorEntry[]): CompetitorResult {
  const allRatings = competitors.map((c) => c.rating).filter((r) => r > 0);
  const allReviews = competitors.map((c) => c.reviewsCount);
  const areaAverageRating =
    allRatings.length > 0
      ? +(allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(2)
      : 0;
  const areaAverageReviews =
    allReviews.length > 0
      ? Math.round(allReviews.reduce((a, b) => a + b, 0) / allReviews.length)
      : 0;
  const marketLeader = competitors.reduce<CompetitorEntry | null>(
    (best, c) => (!best || c.score > best.score ? c : best),
    null,
  );
  return { competitors, areaAverageRating, areaAverageReviews, marketLeader };
}

/* ─── Primary: Google Places API (New) ─── */

export async function fetchPlacesCompetitors(
  searchCategory: string,
  city: string,
  businessName: string,
  stateCode?: string,
  coords?: { lat: number; lng: number } | null,
): Promise<CompetitorResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

  const location = stateCode ? `${city}, ${stateCode}` : city;
  const textQuery = `${searchCategory} near ${location}`;
  log.info("[E1 Places competitors] query:", { detail: textQuery });

  // Build the request body. When we have the business's coordinates, bias the
  // search to a ~30km circle around it so competitors are genuinely local
  // (not "general near Toronto" scattered across the metro).
  const body: Record<string, any> = {
    textQuery,
    maxResultCount: 10,
    languageCode: "en",
  };
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    body.locationBias = {
      circle: {
        center: { latitude: coords.lat, longitude: coords.lng },
        radius: 30000.0, // 30 km
      },
    };
  }

  const { signal, clear } = withSignal(20000);
  let r: globalThis.Response;
  try {
    r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.rating,places.userRatingCount," +
          "places.websiteUri,places.nationalPhoneNumber,places.formattedAddress," +
          "places.googleMapsUri,places.photos",
      },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    clear();
  }

  if (!r.ok) {
    const errText = await r.text();
    log.error("[E1 Places competitors] HTTP error:", { arg0: r.status, arg1: errText.slice(0, 500) });
    throw new Error(`Places API HTTP ${r.status}`);
  }

  const data = await r.json();
  const places: any[] = Array.isArray(data?.places) ? data.places : [];
  log.info("[E1 Places competitors] raw count:", { detail: places.length });

  const lowerBizName = businessName.toLowerCase();
  const competitors: CompetitorEntry[] = places
    .filter((p: any) => {
      const n = (p.displayName?.text || "").toLowerCase();
      return n !== lowerBizName;
    })
    .slice(0, 8)
    .map((p: any) => {
      const rating = typeof p.rating === "number" ? p.rating : 0;
      const reviewsCount = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
      const hasWebsite = !!p.websiteUri;
      // Photos exist but media fetch requires a separate signed URL with the key;
      // we set photoUrl to null to avoid embedding the key in the audit payload.
      const hasPhoto = !!(p.photos && p.photos.length > 0);
      const score = scoreCompetitor(rating, reviewsCount, hasWebsite, hasPhoto);
      return {
        name: p.displayName?.text || "",
        rating,
        reviewsCount,
        hasWebsite,
        website: p.websiteUri || "",
        phoneNumber: p.nationalPhoneNumber || "",
        photoUrl: null,
        score,
        placeId: p.id || "",
        googleMapsUrl: p.googleMapsUri || "",
        address: p.formattedAddress || "",
        isRunningAds: false,
      };
    });

  log.info("[E1 Places competitors] mapped count after filter:", { detail: competitors.length });
  return aggregate(competitors);
}

/* ─── Fallback: Outscraper ─── */

async function pollOutscraper(resultsUrl: string, maxWaitMs = 30000): Promise<any[]> {
  const intervalMs = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((res) => setTimeout(res, intervalMs));
    try {
      const res = await fetch(resultsUrl, {
        headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY || "" },
      });
      const data = await res.json();
      log.info("[outscraper] poll status:", { arg0: data.status, arg1: "results:", arg2: data.data?.length || 0 });
      if (data.status !== "Pending" && data.data) return data.data;
    } catch (e) {
      log.error("[outscraper] poll error:", { error: String(e) });
    }
  }
  log.info("[outscraper] timed out");
  return [];
}

export async function fetchOutscraperCompetitorsFallback(
  searchCategory: string,
  city: string,
  businessName: string,
  stateCode?: string,
): Promise<CompetitorResult> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY not set");

  const locationLabel = stateCode ? `${city}, ${stateCode}` : city;
  const competitorQuery = `${searchCategory} near ${locationLabel}`;
  log.info("[E1 Outscraper competitors] query:", { detail: competitorQuery });

  const params = new URLSearchParams({
    query: competitorQuery,
    limit: "8",
    language: "en",
    region: "CA",
  });
  const requestUrl = `https://api.app.outscraper.com/maps/search-v3?${params}`;
  log.info("[E1 Outscraper competitors] Request URL:", { detail: requestUrl });

  const { signal, clear } = withSignal(20000);
  let r: globalThis.Response;
  let rawText: string;
  try {
    r = await fetch(requestUrl, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal,
    });
    rawText = await r.text();
    log.info("[E1 Outscraper competitors] HTTP status:", { detail: r.status });
    log.info("[E1 Outscraper competitors] Raw response:", { detail: rawText.slice(0, 2000) });
  } finally {
    clear();
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!r.ok) {
    // warn, not error: Places is the primary competitor source; Outscraper is
    // the fallback and its non-OK (402 overdrawn) is a known degraded state.
    // The throw still propagates so the caller's fallback chain engages.
    log.warn("[E1 Outscraper competitors] Non-OK response:", { status: r.status, body: rawText.slice(0, 500) });
    throw new Error(`Outscraper HTTP ${r.status}`);
  }

  let rawResults = data?.data;
  if (data?.status === "Pending" && data?.results_location) {
    log.info("[E1 Outscraper competitors] Got 202 Pending, polling:", data.results_location);
    rawResults = await pollOutscraper(data.results_location, 30000);
  }

  const results = Array.isArray(rawResults)
    ? rawResults.flat()
    : Array.isArray(data)
    ? data.flat()
    : [];
  log.info("[E1 Outscraper competitors] Parsed results count:", { detail: results.length });

  const lowerBizName = businessName.toLowerCase();
  const competitors: CompetitorEntry[] = results
    .filter((b: any) => (b.name || "").toLowerCase() !== lowerBizName)
    .slice(0, 8)
    .map((b: any) => {
      const rating = typeof b.rating === "number" ? b.rating : 0;
      const reviews =
        typeof b.reviews === "number"
          ? b.reviews
          : typeof b.reviews_count === "number"
          ? b.reviews_count
          : 0;
      const hasWebsite = !!(b.site || b.website);
      const hasPhoto = !!(b.photo || b.main_photo);
      const score = scoreCompetitor(rating, reviews, hasWebsite, hasPhoto);
      return {
        name: b.name || "",
        rating,
        reviewsCount: reviews,
        hasWebsite,
        website: b.site || b.website || "",
        phoneNumber: b.phone || b.phone_number || "",
        photoUrl: b.photo || b.main_photo || null,
        score,
        placeId: b.place_id || "",
        googleMapsUrl: b.google_maps_url || "",
        address: b.full_address || b.address || "",
        isRunningAds: false,
      };
    });

  return aggregate(competitors);
}

/* ─── Orchestrator: cache + Places → Outscraper fallback ─── */

// Re-export cache helpers type so auditRoutes can pass them in without a circular dep.
export type CacheGet = (key: string) => any;
export type CacheSet = (key: string, data: any) => void;

export async function fetchCompetitors(
  searchCategory: string,
  city: string,
  businessName: string,
  stateCode: string | undefined,
  getCached: CacheGet,
  setCached: CacheSet,
  coords?: { lat: number; lng: number } | null,
): Promise<CompetitorResult | null> {
  // No usable category (truly-unknown business): an empty competitor block is
  // far better than searching "general near <city>" and returning junk. The
  // report tolerates null competitors and excludes the category from the score.
  const category = (searchCategory || "").toString().trim();
  if (!category || category.toLowerCase() === "general") {
    log.warn("[E1 competitors] no usable category — suppressing competitor search (returning null)", {
      detail: searchCategory,
    });
    return null;
  }

  const compCacheKey = `competitors:${category.toLowerCase().trim()}:${city.toLowerCase().trim()}`;

  // 1. Cache check
  const cached = getCached(compCacheKey);
  if (cached) {
    log.info("[E1 competitors] cache hit", { detail: compCacheKey });
    return cached as CompetitorResult;
  }

  // 2. Try Places primary
  let result: CompetitorResult | null = null;
  let usedFallback = false;

  try {
    const placesResult = await fetchPlacesCompetitors(category, city, businessName, stateCode, coords);
    if (placesResult.competitors.length > 0) {
      result = placesResult;
      log.info("[E1 competitors] Places succeeded:", { detail: placesResult.competitors.length });
    } else {
      log.warn("[E1 competitors] Places returned 0 results — falling back to Outscraper");
    }
  } catch (err: any) {
    log.warn("[E1 competitors] Places threw — falling back to Outscraper:", { detail: err?.message });
  }

  // 3. Fallback to Outscraper if Places gave us nothing
  if (!result) {
    usedFallback = true;
    try {
      const outResult = await fetchOutscraperCompetitorsFallback(category, city, businessName, stateCode);
      if (outResult.competitors.length > 0) {
        result = outResult;
        log.info("[E1 competitors] Outscraper fallback succeeded:", { detail: outResult.competitors.length });
      } else {
        log.warn("[E1 competitors] Outscraper fallback also returned 0 results");
      }
    } catch (err: any) {
      log.error("[E1 competitors] Outscraper fallback threw:", { detail: err?.message });
    }
  }

  log.info("[E1 competitors] source:", { detail: usedFallback ? "outscraper-fallback" : "places-primary" });

  // 4. Cache non-empty result
  if (result && result.competitors.length > 0) {
    setCached(compCacheKey, result);
    log.info("[E1 competitors] cached:", {
      arg0: result.competitors.length,
      arg1: "competitors for key",
      arg2: compCacheKey,
    });
  }

  return result;
}
