import type { Request, Response } from "express";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getServicesForIssues } from "./data/services";
import { db } from "./db";
import { auditReports } from "@shared/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";

const router = express.Router();

/* ─── File-based keyword result cache (24h TTL, persists across restarts) ─── */
const CACHE_FILE = path.join(process.cwd(), ".keyword-cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

function loadCache(): Record<string, { data: any; timestamp: number }> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    console.log("[cache] failed to load, starting fresh");
  }
  return {};
}

function saveCache(cache: Record<string, any>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("[cache] failed to save:", err);
  }
}

function getCached(key: string) {
  const cache = loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    delete cache[key];
    saveCache(cache);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any) {
  const cache = loadCache();
  cache[key] = { data, timestamp: Date.now() };
  saveCache(cache);
  console.log("[cache] saved:", key);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeJsonError(res: Response, code: number, message: string) {
  return res.status(code).json({ ok: false, error: message });
}

function normalizeUrl(input: string): string {
  let u = (input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("172.") ||
      host.startsWith("192.168.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      !host.includes(".")
    ) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function resolvePhotoUrl(photoRef: string | undefined | null, key: string, maxwidth = 800): string | null {
  if (!photoRef) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photo_reference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(key)}`;
}

function withSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url: string) {
  const r = await fetch(url);
  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!r.ok) {
    const msg =
      data?.error_message || data?.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  // Google APIs return HTTP 200 with error status in JSON body
  if (data?.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    const msg = data.error_message || `Google API error: ${data.status}`;
    console.error("[fetchJson] API status:", data.status, "message:", data.error_message);
    throw new Error(msg);
  }
  return data;
}

router.post("/search-places", async (req: Request, res: Response) => {
  try {
    // ─── Env var diagnostics ───
    const rawKey = process.env.GOOGLE_MAPS_API_KEY;
    console.log("[search-places] GOOGLE_MAPS_API_KEY present:", !!rawKey, "length:", rawKey?.length ?? 0, "starts with:", rawKey?.slice(0, 8) ?? "(unset)");
    const key = requireEnv("GOOGLE_MAPS_API_KEY");

    const query = String(req.body?.query || "").trim();
    console.log("[search-places] query:", JSON.stringify(query));
    if (query.length < 2) return safeJsonError(res, 400, "Query too short");

    const apiUrl =
      `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
      `query=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;

    // Log the full URL (with key masked)
    const maskedUrl = apiUrl.replace(key, key.slice(0, 8) + "..." + key.slice(-4));
    console.log("[search-places] Calling:", maskedUrl);

    const r = await fetch(apiUrl);
    const rawText = await r.text();

    // Log raw response for diagnosis
    let data: any = null;
    try { data = JSON.parse(rawText); } catch {}
    console.log("[search-places] HTTP status:", r.status);
    console.log("[search-places] Google status:", data?.status);
    console.log("[search-places] error_message:", data?.error_message || "(none)");
    console.log("[search-places] results count:", data?.results?.length ?? 0);
    // Log raw response (first 1000 chars) to debug
    console.log("[search-places] Raw response (first 1000):", rawText.slice(0, 1000));

    // Check for Google API-level errors (200 with error status)
    if (data?.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      const msg = data.error_message || `Google Places API: ${data.status}`;
      console.error("[search-places] API ERROR:", msg);
      return safeJsonError(res, 502, msg);
    }

    if (!r.ok) {
      console.error("[search-places] HTTP error:", r.status, rawText.slice(0, 500));
      return safeJsonError(res, 502, `Google API returned HTTP ${r.status}`);
    }

    let results = Array.isArray(data?.results) ? data.results : [];

    // Fallback: if Text Search found nothing, try Find Place API (different matching logic)
    if (results.length === 0) {
      console.log("[search-places] Text Search returned 0 results, trying Find Place fallback…");
      const fpUrl =
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?` +
        `input=${encodeURIComponent(query)}&inputtype=textquery` +
        `&fields=${encodeURIComponent("place_id,name,formatted_address,rating,user_ratings_total,photos")}` +
        `&key=${encodeURIComponent(key)}`;
      try {
        const fpData = await fetchJson(fpUrl);
        const candidates = Array.isArray(fpData?.candidates) ? fpData.candidates : [];
        console.log("[search-places] Find Place returned", candidates.length, "candidates");
        results = candidates;
      } catch (fpErr: any) {
        console.error("[search-places] Find Place fallback failed:", fpErr?.message);
      }
    }

    // Log first result to debug place_id availability
    if (results.length > 0) {
      const first = results[0];
      console.log("[search-places] First result keys:", Object.keys(first));
      console.log("[search-places] First result place_id:", JSON.stringify(first.place_id));
      console.log("[search-places] First result (truncated):", JSON.stringify(first).slice(0, 500));
    }

    const predictions = results.slice(0, 5).map((r: any) => ({
      place_id: r.place_id || "",
      name: r.name || "",
      formatted_address: r.formatted_address || "",
      rating: typeof r.rating === "number" ? r.rating : null,
      user_ratings_total: typeof r.user_ratings_total === "number" ? r.user_ratings_total : 0,
      photoUrl: resolvePhotoUrl(r.photos?.[0]?.photo_reference, key, 400),
    }));

    console.log("[search-places] Returning", predictions.length, "predictions:", predictions.map((p: any) => ({ name: p.name, place_id: p.place_id })));
    return res.json({ ok: true, predictions });
  } catch (e: any) {
    console.error("[search-places] EXCEPTION:", e?.message || e);
    return safeJsonError(res, 500, e?.message || "search-places failed");
  }
});

router.post("/place-details", async (req: Request, res: Response) => {
  try {
    console.log("[place-details] Called with body keys:", Object.keys(req.body || {}));
    const key = requireEnv("GOOGLE_MAPS_API_KEY");
    let placeId = String(req.body?.placeId || "").trim();
    const queryFallback = String(req.body?.query || "").trim();

    // If no placeId provided, try Find Place to resolve it from a text query
    if (!placeId && queryFallback) {
      console.log("[place-details] No placeId, resolving via Find Place:", queryFallback);
      const fpUrl =
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?` +
        `input=${encodeURIComponent(queryFallback)}&inputtype=textquery` +
        `&fields=${encodeURIComponent("place_id")}` +
        `&key=${encodeURIComponent(key)}`;
      const fpData = await fetchJson(fpUrl);
      placeId = fpData?.candidates?.[0]?.place_id || "";
      console.log("[place-details] Resolved placeId:", placeId);
    }

    if (!placeId) {
      console.error("[place-details] ERROR: placeId missing. Full body:", JSON.stringify(req.body));
      return safeJsonError(res, 400, "placeId required");
    }

    const fields = [
      "place_id",
      "name",
      "formatted_address",
      "address_components",
      "types",
      "rating",
      "user_ratings_total",
      "website",
      "formatted_phone_number",
      "opening_hours/weekday_text",
      "photos/photo_reference",
    ].join(",");

    const url =
      `https://maps.googleapis.com/maps/api/place/details/json?` +
      `place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}` +
      `&key=${encodeURIComponent(key)}`;

    const data = await fetchJson(url);
    const result = data?.result;
    if (!result) return safeJsonError(res, 404, "Place not found");

    const photosRefs = Array.isArray(result?.photos) ? result.photos : [];
    const photos = photosRefs
      .slice(0, 10)
      .map((p: any) => p?.photo_reference)
      .filter(Boolean)
      .map(
        (ref: string) => resolvePhotoUrl(ref, key, 800)!
      );

    const businessPhotoUrl = photosRefs.length > 0
      ? resolvePhotoUrl(photosRefs[0]?.photo_reference, key, 800)
      : null;

    const payload = {
      placeId: result.place_id || placeId,
      name: result.name || "",
      formattedAddress: result.formatted_address || "",
      addressComponents: Array.isArray(result.address_components) ? result.address_components : [],
      types: Array.isArray(result.types) ? result.types : [],
      rating: typeof result.rating === "number" ? result.rating : null,
      reviewsCount:
        typeof result.user_ratings_total === "number"
          ? result.user_ratings_total
          : 0,
      website: result.website || "",
      phone: result.formatted_phone_number || "",
      hours: result?.opening_hours?.weekday_text || [],
      photos,
      businessPhotoUrl,
    };

    return res.json({ ok: true, business: payload });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "place-details failed");
  }
});

/* ─── PageSpeed helper with 45s timeout ─── */
// When strategy is provided, returns just that strategy's result.
// When omitted, returns { mobile, desktop }.
async function fetchPageSpeed(siteUrl: string, strategy?: "mobile" | "desktop"): Promise<any> {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return strategy ? null : null;
  const url = normalizeUrl(siteUrl);
  if (!url) return strategy ? null : null;

  const run = async (s: "mobile" | "desktop") => {
    const attempt = async () => {
      const params = new URLSearchParams({ url, strategy: s, key, category: 'performance' });
      const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const resp = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) {
          console.log(`[pagespeed] ${s} HTTP ${resp.status}`);
          return null;
        }
        const data = await resp.json();
        const lhr = data?.lighthouseResult;
        const score01 = lhr?.categories?.performance?.score;
        if (score01 == null) { console.log('[pagespeed] no performance data'); return null; }
        const score = Math.round(score01 * 100);
        const audits = lhr?.audits || {};
        const numVal = (k: string) => { const v = audits[k]?.numericValue; return typeof v === "number" ? v : null; };
        return {
          score,
          fcp: numVal("first-contentful-paint") !== null ? +(numVal("first-contentful-paint")! / 1000).toFixed(2) : null,
          lcp: numVal("largest-contentful-paint") !== null ? +(numVal("largest-contentful-paint")! / 1000).toFixed(2) : null,
          tbt: numVal("total-blocking-time") !== null ? Math.round(numVal("total-blocking-time")!) : null,
          cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
        };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          console.log(`[pagespeed] ${s} timed out after 45s`);
        } else {
          console.log(`[pagespeed] ${s} error:`, err.message);
        }
        return null;
      }
    };

    let result = await attempt();
    if (!result) {
      console.log(`[pagespeed] ${s} retrying after 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      result = await attempt();
    }
    return result;
  };

  if (strategy) return run(strategy);

  const [mobileResult, desktopResult] = await Promise.allSettled([run("mobile"), run("desktop")]);
  const mobile = mobileResult.status === 'fulfilled' ? mobileResult.value : null;
  const desktop = desktopResult.status === 'fulfilled' ? desktopResult.value : null;
  console.log('[pagespeed] mobile score:', mobile?.score ?? 'null');
  console.log('[pagespeed] desktop score:', desktop?.score ?? 'null');
  return { mobile, desktop };
}

router.post("/pagespeed", async (req: Request, res: Response) => {
  try {
    const urlRaw = String(req.body?.url || "");
    const speedData = await fetchPageSpeed(urlRaw);
    if (!speedData) return safeJsonError(res, 400, "Invalid url or missing API key");
    return res.json({ ok: true, speedData });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "pagespeed failed");
  }
});

/* ─── Background speed test endpoint (called after report is shown) ─── */
router.post("/speed", async (req: Request, res: Response) => {
  try {
    const { website } = req.body;
    if (!website) return safeJsonError(res, 400, "No website provided");
    console.log('[speed] Starting for:', website);
    const cleanUrl = (url: string) => {
      try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
    };
    const pageSpeedUrl = cleanUrl(String(website));

    const [mobileResult, desktopResult] = await Promise.allSettled([
      fetchPageSpeed(pageSpeedUrl, 'mobile'),
      fetchPageSpeed(pageSpeedUrl, 'desktop'),
    ]);

    let mobileScore = mobileResult.status === 'fulfilled' ? mobileResult.value : null;
    if (!mobileScore) {
      console.log('[speed] mobile null, retrying once...');
      await new Promise(r => setTimeout(r, 3000));
      mobileScore = await fetchPageSpeed(pageSpeedUrl, 'mobile');
    }

    const speedData = {
      mobile: mobileScore,
      desktop: desktopResult.status === 'fulfilled' ? desktopResult.value : null,
    };
    console.log('[speed] mobile:', speedData.mobile?.score ?? 'null');
    console.log('[speed] desktop:', speedData.desktop?.score ?? 'null');
    return res.json({ ok: true, speedData });
  } catch (e: any) {
    console.error('[speed] error:', e);
    return safeJsonError(res, 500, "Speed test failed");
  }
});

/* ─── Specific Service Mapping ─── */
const SPECIFIC_SERVICE_MAP: Record<string, string> = {
  plumbing: "drain cleaning", hvac: "ac repair", electrical: "electrician",
  cleaning: "house cleaning", landscaping: "lawn care", roofing: "roof repair",
  locksmith: "locksmith", general: "home renovation",
};
const JOB_VALUES: Record<string, number> = {
  plumbing: 280, hvac: 420, electrical: 310, cleaning: 160,
  landscaping: 200, roofing: 8500, locksmith: 180, general: 350,
};

function buildSeedKeywords(trade: string, city: string): string[] {
  const specific = SPECIFIC_SERVICE_MAP[trade.toLowerCase()] || trade;
  return [
    `${trade} ${city}`,
    `emergency ${trade} ${city}`,
    `${trade} near me`,
    `best ${trade} ${city}`,
    `${trade} services ${city}`,
    `${specific} ${city}`,
  ];
}

/* ─── Outscraper async polling ─── */
async function pollOutscraper(
  resultsUrl: string,
  maxWaitMs = 30000,
  intervalMs = 1500
): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(resultsUrl, {
        headers: { 'X-API-KEY': process.env.OUTSCRAPER_API_KEY || '' }
      });
      const data = await res.json();
      console.log('[outscraper] poll status:', data.status, 'results:', data.data?.length || 0);
      if (data.status !== 'Pending' && data.data) {
        return data.data;
      }
    } catch (e) {
      console.error('[outscraper] poll error:', e);
    }
  }
  console.log('[outscraper] timed out');
  return [];
}

/* ─── E1: Outscraper Competitor Data ─── */
async function fetchOutscraperCompetitors(trade: string, city: string, businessName: string) {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    console.warn("[E1 Outscraper competitors] OUTSCRAPER_API_KEY not set, skipping");
    return null;
  }
  const competitorQuery = `${trade} near ${city}`;
  console.log('[outscraper] query:', competitorQuery);
  const params = new URLSearchParams({
    query: competitorQuery,
    limit: "8",
    language: "en",
    region: "CA",
  });
  const requestUrl = `https://api.app.outscraper.com/maps/search-v3?${params}`;
  console.log("[E1 Outscraper competitors] Request URL:", requestUrl);
  let r: globalThis.Response;
  let rawText: string;
  const { signal: e1Signal, clear: e1Clear } = withSignal(20000);
  try {
    r = await fetch(requestUrl, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal: e1Signal,
    });
    rawText = await r.text();
    console.log("[E1 Outscraper competitors] HTTP status:", r.status);
    console.log("[E1 Outscraper competitors] Raw response:", rawText.slice(0, 2000));
  } catch (fetchErr: any) {
    console.error("[E1 Outscraper competitors] Fetch error:", fetchErr?.message);
    throw fetchErr;
  } finally {
    e1Clear();
  }
  let data: any;
  try { data = JSON.parse(rawText); } catch { data = null; }
  if (!r.ok) {
    console.error("[E1 Outscraper competitors] Non-OK response:", r.status, rawText.slice(0, 500));
  }
  let rawResults = data?.data;
  if (data?.status === 'Pending' && data?.results_location) {
    console.log('[E1 Outscraper competitors] Got 202 Pending, polling:', data.results_location);
    rawResults = await pollOutscraper(data.results_location);
  }
  const results = Array.isArray(rawResults) ? rawResults.flat() : (Array.isArray(data) ? data.flat() : []);
  console.log("[E1 Outscraper competitors] Parsed results count:", results.length);
  const competitors = results
    .filter((b: any) => {
      const n = (b.name || "").toLowerCase();
      return n !== businessName.toLowerCase();
    })
    .slice(0, 8)
    .map((b: any) => {
      const rat = typeof b.rating === "number" ? b.rating : 0;
      const rev = typeof b.reviews === "number" ? b.reviews : (typeof b.reviews_count === "number" ? b.reviews_count : 0);
      const hasWebsite = !!(b.site || b.website);
      const hasPhoto = !!(b.photo || b.main_photo);
      const rating_score = (rat / 5) * 40;
      const review_score = Math.min(rev / 200, 1) * 35;
      const website_score = hasWebsite ? 15 : 0;
      const photo_score = hasPhoto ? 10 : 0;
      const score = Math.round(rating_score + review_score + website_score + photo_score);
      return {
        name: b.name || "", rating: rat, reviewsCount: rev,
        hasWebsite, website: b.site || b.website || "",
        phoneNumber: b.phone || b.phone_number || "",
        photoUrl: b.photo || b.main_photo || null,
        score, placeId: b.place_id || "",
        googleMapsUrl: b.google_maps_url || "",
        address: b.full_address || b.address || "",
        isRunningAds: false,
      };
    });
  const allRatings = competitors.map((c: any) => c.rating).filter((r: number) => r > 0);
  const allReviews = competitors.map((c: any) => c.reviewsCount);
  const areaAverageRating = allRatings.length > 0 ? +(allRatings.reduce((a: number, b: number) => a + b, 0) / allRatings.length).toFixed(2) : 0;
  const areaAverageReviews = allReviews.length > 0 ? Math.round(allReviews.reduce((a: number, b: number) => a + b, 0) / allReviews.length) : 0;
  const marketLeader = competitors.reduce((best: any, c: any) => (!best || c.score > best.score) ? c : best, null);
  return { competitors, areaAverageRating, areaAverageReviews, marketLeader };
}

/* ─── E2: Outscraper Reviews Intelligence ─── */
async function fetchOutscraperReviews(placeId: string) {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey || !placeId) {
    console.warn("[E2 Outscraper reviews] Missing apiKey or placeId, skipping");
    return null;
  }
  const reviewParams = new URLSearchParams({
    query: placeId,
    reviewsLimit: "50",
    sort: "newest",
  });
  const requestUrl = `https://api.app.outscraper.com/maps/reviews-v3?${reviewParams}`;
  console.log("[E2 Outscraper reviews] Request URL:", requestUrl);
  let r: globalThis.Response;
  let rawText: string;
  const { signal: e2Signal, clear: e2Clear } = withSignal(20000);
  try {
    r = await fetch(requestUrl, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal: e2Signal,
    });
    rawText = await r.text();
    console.log("[E2 Outscraper reviews] HTTP status:", r.status);
    console.log("[E2 Outscraper reviews] Raw response:", rawText.slice(0, 2000));
  } catch (fetchErr: any) {
    console.error("[E2 Outscraper reviews] Fetch error:", fetchErr?.message);
    throw fetchErr;
  } finally {
    e2Clear();
  }
  let data: any;
  try { data = JSON.parse(rawText); } catch { data = null; }
  if (!r.ok) {
    console.error("[E2 Outscraper reviews] Non-OK response:", r.status, rawText.slice(0, 500));
  }
  let rawReviews = data?.data;
  if (data?.status === 'Pending' && data?.results_location) {
    console.log('[E2 Outscraper reviews] Got 202 Pending, polling:', data.results_location);
    rawReviews = await pollOutscraper(data.results_location);
  }
  const reviews = Array.isArray(rawReviews) ? rawReviews.flat() : (Array.isArray(data) ? data.flat() : []);
  console.log("[E2 Outscraper reviews] Parsed reviews count:", reviews.length);
  const reviewTexts: string[] = [];
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ownerReplies = 0;
  let mostRecentDate = "";
  for (const rev of reviews) {
    if (rev.review_text) reviewTexts.push(rev.review_text);
    const stars = typeof rev.review_rating === "number" ? rev.review_rating : (typeof rev.rating === "number" ? rev.rating : 0);
    if (stars >= 1 && stars <= 5) dist[stars]++;
    if (rev.owner_answer || rev.response_text) ownerReplies++;
    const d = rev.review_datetime_utc || rev.date || "";
    if (d && d > mostRecentDate) mostRecentDate = d;
  }
  const total = reviews.length || 1;
  return {
    totalFetched: reviews.length,
    ratingDistribution: dist,
    mostRecentReviewDate: mostRecentDate || null,
    ownerResponseRate: Math.round((ownerReplies / total) * 100),
    reviewTexts,
  };
}

/* ─── E3: Serper Keyword Rankings ─── */
async function fetchSerperRankings(
  keywords: string[], businessDomain: string, businessName: string, city: string
) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  const domain = businessDomain.replace(/^https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
  const nameLC = businessName.toLowerCase();

  const results = await Promise.allSettled(keywords.map(async (kw) => {
    const cacheKey = `serper:${kw.toLowerCase()}:${city.toLowerCase()}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      console.log('[serper] cache hit:', kw);
      return { keyword: kw, data: cachedData };
    }

    const { signal: sSignal, clear: sClear } = withSignal(12000);
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: kw, location: `${city}, Canada`, gl: "ca", hl: "en", num: 20 }),
        signal: sSignal,
      });
      const data = await r.json();
      setCached(cacheKey, data);
      console.log('[serper] cached:', kw);
      return { keyword: kw, data };
    } finally {
      sClear();
    }
  }));
  console.log('[serper] cache stats:', Object.keys(loadCache()).length, 'entries cached');

  const keywordResults: any[] = [];
  const adCompetitors: any[] = [];
  const competitorAdNames = new Set<string>();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { keyword, data } = r.value;
    const organic = Array.isArray(data?.organic) ? data.organic : [];
    const localPack = Array.isArray(data?.places) ? data.places : [];
    const ads = Array.isArray(data?.ads) ? data.ads : [];

    let organicRank: number | null = null;
    for (const o of organic) {
      const link = (o.link || "").toLowerCase();
      if (domain && link.includes(domain)) { organicRank = o.position || null; break; }
    }

    let localPackPosition: number | null = null;
    for (let i = 0; i < localPack.length; i++) {
      const n = (localPack[i].title || "").toLowerCase();
      if (n.includes(nameLC) || nameLC.includes(n)) { localPackPosition = i + 1; break; }
    }

    let status: string;
    if ((organicRank && organicRank <= 3) || (localPackPosition && localPackPosition <= 2)) status = "strong";
    else if ((organicRank && organicRank <= 10) || localPackPosition === 3) status = "good";
    else if (organicRank && organicRank <= 20) status = "below-fold";
    else status = "not-visible";

    for (const ad of ads) {
      const adName = ad.title || ad.displayedLink || "";
      if (adName && !competitorAdNames.has(adName)) {
        competitorAdNames.add(adName);
        adCompetitors.push({ name: adName, displayedUrl: ad.displayedLink || "", sampleHeadline: ad.title || "" });
      }
    }

    keywordResults.push({
      keyword, organicRank, localPackPosition, status,
      isInLocalPack: localPackPosition !== null,
    });
  }

  return { keywords: keywordResults, adCompetitors, competitorsRunningAds: competitorAdNames.size };
}

/* ─── E4: DataForSEO Keyword Volumes ─── */
async function fetchDataForSEOVolumes(keywords: string[]) {
  const dfsKey = 'dfs:' + [...keywords].sort().join(',');
  const dfsCached = getCached(dfsKey);
  if (dfsCached) {
    console.log('[dataforseo] cache hit');
    return dfsCached;
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  console.log('[dataforseo] login:', login ? 'SET' : 'MISSING');
  console.log('[dataforseo] password:', password ? 'SET' : 'MISSING');
  if (!login || !password) {
    console.log('[dataforseo] SKIPPING — credentials not set');
    return null;
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const { signal: e4Signal, clear: e4Clear } = withSignal(15000);
  let data: any;
  try {
    console.log('[dataforseo] STARTING call with', keywords.length, 'keywords');
    const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keywords, location_name: "Canada", language_name: "English" }]),
      signal: e4Signal,
    });
    const rawText = await r.text();
    console.log('[dataforseo] raw response:', rawText.slice(0, 500));
    data = JSON.parse(rawText);
  } catch (e: any) {
    console.error('[dataforseo] CAUGHT ERROR:', e?.message || e);
    return null;
  } finally {
    e4Clear();
  }
  console.log('[dataforseo] status:', data?.tasks?.[0]?.status_code);
  const results = data?.tasks?.[0]?.result || [];
  console.log('[dataforseo] parsed results count:', results.length);
  const volumeMap: Record<string, { searchVolume: number; cpc: number; competition: number }> = {};
  results.forEach((item: any) => {
    const kw = item?.keyword;
    const info = item?.keyword_info;
    if (!kw || !info) return;
    const val = {
      searchVolume: info.search_volume || 0,
      cpc: info.cpc || 0,
      competition: info.competition || 0,
    };
    volumeMap[kw.toLowerCase().trim()] = val;
    volumeMap[kw.trim()] = val;
    const firstWord = kw.toLowerCase().trim().split(' ')[0];
    if (firstWord) volumeMap[firstWord] = val;
  });
  console.log('[dataforseo] volumeMap keys after build:', Object.keys(volumeMap));
  setCached(dfsKey, volumeMap);
  console.log('[dataforseo] cached:', Object.keys(volumeMap).length, 'volume entries');
  return volumeMap;
}

/* ─── E5: Demand Gap ─── */
async function calculateDemandGaps(
  topKeyword: string, businessHours: string[], trade: string, totalMonthlySearchVolume: number
) {
  const weekdayBusiness = 38, weekdayEvening = 31, weekends = 31;
  console.log("[audit] Using hardcoded demand distribution");

  const hoursStr = (businessHours || []).join(" ").toLowerCase();
  // isOpenEvenings: closing time >= 9:00 PM (21:00) on any listed day
  // Parses closing time from "Day: H:MM AM/PM – H:MM AM/PM" format
  const isOpenEvenings = (() => {
    for (const line of (businessHours || [])) {
      const lower = line.toLowerCase();
      if (lower.includes('closed')) continue;
      if (lower.includes('24 hours') || lower.includes('24hrs') || lower.includes('24/7')) return true;
      // Match closing time after dash (handles – — -)
      const closeMatch = line.match(/[–—\-]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (!closeMatch) continue;
      let closeHour = parseInt(closeMatch[1]);
      const ampm = closeMatch[3].toLowerCase();
      if (ampm === 'pm' && closeHour !== 12) closeHour += 12;      // e.g. 9pm → 21
      else if (ampm === 'am' && closeHour === 12) closeHour = 24;   // midnight → 24
      else if (ampm === 'am' && closeHour < 12) closeHour += 24;    // 1am, 2am → 25, 26
      if (closeHour >= 21) return true;
    }
    return false;
  })();
  const isOpenWeekends = hoursStr.includes("saturday") || hoursStr.includes("sunday");

  const fallbackVolume: Record<string, number> = {
    plumbing: 5000, hvac: 3000, electrical: 4000, cleaning: 6000,
    landscaping: 4000, roofing: 2000, locksmith: 4000, general: 3000,
  };
  const effectiveVolume = totalMonthlySearchVolume > 0
    ? totalMonthlySearchVolume
    : (fallbackVolume[trade.toLowerCase()] || 3000);
  const clickRate = 0.05;
  const conversionRate = 0.15;
  const monthlyLeads = effectiveVolume * clickRate * conversionRate;
  const jobValue = JOB_VALUES[trade.toLowerCase()] || 350;

  const gaps: any[] = [];
  if (!isOpenEvenings) {
    const missed = monthlyLeads * (weekdayEvening / 100);
    gaps.push({
      timeWindow: "Weekday evenings (5pm\u201310pm)",
      searchSharePercent: weekdayEvening,
      businessCovered: false,
      estimatedMissedLeadsPerMonth: Math.round(missed),
    });
  }
  if (!isOpenWeekends) {
    const missed = monthlyLeads * (weekends / 100);
    gaps.push({
      timeWindow: "Weekends (all day)",
      searchSharePercent: weekends,
      businessCovered: false,
      estimatedMissedLeadsPerMonth: Math.round(missed),
    });
  }

  const totalMissedLeads = gaps.reduce((s, g) => s + g.estimatedMissedLeadsPerMonth, 0);

  return {
    demandGaps: gaps,
    estimatedRevenueLoss: {
      low: Math.round(totalMissedLeads * jobValue * 0.25 / 100) * 100,
      high: Math.round(totalMissedLeads * jobValue * 0.35 / 100) * 100,
      monthlyMissedLeads: totalMissedLeads,
      jobValue,
    },
    isOpenEvenings,
    isOpenWeekends,
  };
}

/* ─── E6: Scoring Engine ─── */
function calculateScores(auditData: any) {
  const bd = auditData.business || {};
  const kws = auditData.keywords || [];
  const comp = auditData.competitors || [];
  const ml = auditData.marketLeader;
  const kwSummary = auditData.keywordSummary || {};
  const speedMobile = auditData.speedData?.mobile?.score;
  const speedDesktop = auditData.speedData?.desktop?.score;

  // Google Maps Profile — 25pts
  let gmRating = 1;
  if (bd.rating >= 4.5) gmRating = 10;
  else if (bd.rating >= 4.0) gmRating = 7;
  else if (bd.rating >= 3.5) gmRating = 4;

  const avgRevs = auditData.areaAverageReviews || 50;
  let gmReviews = 1;
  if (bd.reviewsCount >= avgRevs) gmReviews = 8;
  else if (bd.reviewsCount >= avgRevs * 0.75) gmReviews = 5;
  else if (bd.reviewsCount >= avgRevs * 0.5) gmReviews = 3;

  const photosLen = Array.isArray(bd.photos) ? bd.photos.length : 0;
  let gmPhotos = 0;
  if (photosLen >= 20) gmPhotos = 4;
  else if (photosLen >= 10) gmPhotos = 2;

  const gmDesc = bd.description ? 2 : 0;
  const gmWeb = bd.website ? 1 : 0;
  const googleMapsScore = Math.min(gmRating + gmReviews + gmPhotos + gmDesc + gmWeb, 25);

  // Website Quality — 20pts
  const speedDataAvailable = typeof speedMobile === "number" || typeof speedDesktop === "number";
  let webMobile: number | null = null, webDesktop: number | null = null;
  if (bd.website) {
    if (typeof speedMobile === "number") {
      if (speedMobile >= 90) webMobile = 12;
      else if (speedMobile >= 70) webMobile = 8;
      else if (speedMobile >= 50) webMobile = 4;
      else webMobile = 1;
    }
    if (typeof speedDesktop === "number") {
      if (speedDesktop >= 90) webDesktop = 8;
      else if (speedDesktop >= 70) webDesktop = 5;
      else webDesktop = 2;
    }
  }
  // If business has a website but speed data didn't load, score is null (excluded from total)
  // If no website, score is 0 (correctly penalized)
  const websiteScore: number | null = bd.website && !speedDataAvailable
    ? null
    : Math.min((webMobile ?? 0) + (webDesktop ?? 0), 20);
  console.log('[scoring] websiteQuality:', websiteScore ?? 'null - excluded');

  // Search Visibility — 20pts
  let searchPts = 0;
  let hasLocalPack = false;
  for (const kw of kws) {
    if (kw.status === "strong") searchPts += 4;
    else if (kw.status === "good") searchPts += 2;
    if (kw.isInLocalPack) hasLocalPack = true;
  }
  if (hasLocalPack) searchPts += 5;
  const searchVisibilityScore = Math.min(searchPts, 20);

  // Competitor Positioning — 15pts
  let compPts = 2;
  if (ml) {
    const myRat = bd.rating || 0;
    const myRev = bd.reviewsCount || 0;
    const myScore = (myRat / 5) * 40 + Math.min(myRev / 200, 1) * 35 + (bd.website ? 15 : 0) + (photosLen > 0 ? 10 : 0);
    const diff = ml.score - myScore;
    if (diff <= 10) compPts = 12;
    else if (diff <= 20) compPts = 8;
    else if (diff <= 30) compPts = 5;
  }
  const competitorScore = Math.min(compPts, 15);

  // Ad Market Opportunity — 10pts
  let adPts = 2;
  const topCPC = kwSummary.topKeywordCPC || 0;
  const totalVol = kwSummary.totalMonthlySearchVolume || 0;
  if (topCPC > 15 && totalVol > 500) adPts = 10;
  else if (topCPC > 10 && totalVol > 300) adPts = 7;
  else if (topCPC > 5 && totalVol > 100) adPts = 4;
  const adScore = Math.min(adPts, 10);

  // Demand Coverage — 10pts
  let demandPts = 0;
  if (auditData.isOpenEvenings) demandPts += 5;
  if (auditData.isOpenWeekends) demandPts += 5;
  const demandScore = demandPts;

  const baseTotal = googleMapsScore + searchVisibilityScore + competitorScore + adScore + demandScore;
  const total = websiteScore === null
    ? Math.round((baseTotal / 80) * 100)
    : baseTotal + websiteScore;
  let grade: string;
  if (total >= 85) grade = "A";
  else if (total >= 70) grade = "B";
  else if (total >= 55) grade = "C";
  else grade = "D";

  return {
    googleMaps: { score: googleMapsScore, max: 25, breakdown: { rating: gmRating, reviews: gmReviews, photos: gmPhotos, description: gmDesc, website: gmWeb } },
    websiteQuality: { score: websiteScore, max: websiteScore === null ? null : 20, breakdown: { mobile: webMobile, desktop: webDesktop } },
    searchVisibility: { score: searchVisibilityScore, max: 20, breakdown: { keywordPoints: Math.min(searchPts - (hasLocalPack ? 5 : 0), 12), localPackBonus: hasLocalPack ? 5 : 0 } },
    competitorPositioning: { score: competitorScore, max: 15, breakdown: {} },
    adOpportunity: { score: adScore, max: 10, breakdown: { topCPC, totalVol } },
    demandCoverage: { score: demandScore, max: 10, breakdown: { evenings: auditData.isOpenEvenings, weekends: auditData.isOpenWeekends } },
    total,
    grade,
  };
}

/* ─── City Extraction ─── */
function extractCity(business: any): string {
  console.log("[extractCity] addressComponents:", JSON.stringify(business.addressComponents)?.slice(0, 500));
  console.log("[extractCity] formattedAddress:", business.formattedAddress || business.address || "(empty)");

  // Try address_components first (most reliable)
  const components = Array.isArray(business.addressComponents) ? business.addressComponents : [];
  for (const comp of components) {
    const types = Array.isArray(comp.types) ? comp.types : [];
    if (types.includes("locality")) {
      console.log("[extractCity] Found locality from addressComponents:", comp.long_name);
      return comp.long_name || "";
    }
  }
  // Fallback: sublocality
  for (const comp of components) {
    const types = Array.isArray(comp.types) ? comp.types : [];
    if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
      console.log("[extractCity] Found sublocality from addressComponents:", comp.long_name);
      return comp.long_name || "";
    }
  }
  // Fallback: parse formatted_address — take the part before province/state code
  const addr = business.formattedAddress || business.address || "";
  // Pattern: "..., City, XX POSTAL, Country" or "..., City, Province, Country"
  const parts = addr.split(",").map((s: string) => s.trim());
  console.log("[extractCity] Address parts:", JSON.stringify(parts));
  if (parts.length >= 3) {
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      // Skip if it looks like a province/state code + postal
      if (/^[A-Z]{2}\s/.test(part) || /^\d{5}/.test(part)) continue;
      // Skip country names
      if (/^(canada|united states|usa|us)$/i.test(part)) continue;
      console.log("[extractCity] Extracted city from address string:", part);
      return part;
    }
  }
  console.log("[extractCity] Could not extract city");
  return "";
}

/* ─── Trade Detection ─── */
const TRADE_PATTERNS: Array<{ pattern: RegExp; trade: string }> = [
  { pattern: /plumb|plomb|drain|rooter|pipe|tuyau/i, trade: "plumbing" },
  { pattern: /hvac|heating|cooling|air.?condition|furnace|chauffage|climatisation/i, trade: "hvac" },
  { pattern: /electr/i, trade: "electrical" },
  { pattern: /clean|maid|janitorial|nettoy/i, trade: "cleaning" },
  { pattern: /landscape|lawn|garden|gazon|jardin/i, trade: "landscaping" },
  { pattern: /roof|toit|couvreur/i, trade: "roofing" },
  { pattern: /lock|serrurier/i, trade: "locksmith" },
];

function detectTrade(businessName: string, types: string[]): string {
  const haystack = [businessName, ...types].join(" ");
  console.log(`[detectTrade] businessName: ${businessName}, types: ${JSON.stringify(types)}, haystack: ${haystack}`);
  for (const { pattern, trade } of TRADE_PATTERNS) {
    if (pattern.test(haystack)) {
      console.log(`[audit] Detected trade: ${trade} from business name: ${businessName}`);
      return trade;
    }
  }
  console.log(`[audit] Detected trade: general from business name: ${businessName}`);
  return "general";
}

/* ═══════════════════════════════════════════════════════ */
router.post("/generate", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const business = req.body?.business;
    const speedData = req.body?.speedData || null;

    if (!business || !business.name)
      return safeJsonError(res, 400, "business required");

    // ─── Check for recent cached report (24h TTL) ───
    if (business.placeId) {
      const REPORT_TTL_HOURS = 24;
      const cutoff = new Date(Date.now() - REPORT_TTL_HOURS * 60 * 60 * 1000);
      try {
        const existing = await db.select().from(auditReports)
          .where(and(eq(auditReports.business_place_id, business.placeId), gte(auditReports.created_at, cutoff)))
          .orderBy(desc(auditReports.created_at)).limit(1);
        if (existing.length > 0) {
          const cached = existing[0];
          const ageMin = Math.round((Date.now() - new Date(cached.created_at!).getTime()) / 60000);
          console.log('[audit] returning cached report:', cached.id, 'age:', ageMin + 'min');
          return res.json({ ok: true, report_json: cached.audit_data, reportId: cached.id, fromCache: true });
        }
      } catch (err) {
        console.error('[audit] cache check failed:', err);
      }
    }

    // Extract city from place details if not provided by client
    const city = String(req.body?.city || "").trim() || extractCity(business);
    console.log("[audit] Resolved city:", JSON.stringify(city));

    // Detect trade from business name + types if not provided by client
    const clientTrade = String(req.body?.trade || "").trim();
    const trade = clientTrade && clientTrade !== "general"
      ? clientTrade
      : detectTrade(business.name || "", Array.isArray(business.types) ? business.types : []);
    console.log("[audit] Resolved trade:", JSON.stringify(trade));

    const rating = typeof business.rating === "number" ? business.rating : null;
    const reviewsCount = typeof business.reviewsCount === "number" ? business.reviewsCount : 0;
    const website = String(business.website || "");
    const photosLen = Array.isArray(business.photos) ? business.photos.length : 0;
    // mobileScore/desktopScore set after parallel fetch below

    // ─── Build seed keywords ───
    const seedKeywords = buildSeedKeywords(trade, city);

    // ─── Run Serper first so we can use its returned keywords as DataForSEO seeds ───
    let serperData: any = null;
    try {
      serperData = await fetchSerperRankings(seedKeywords, website, business.name, city);
    } catch (e: any) {
      console.error("E3 Serper rankings failed:", e?.message);
    }
    const serperKeywords = (serperData?.keywords || []).map((k: any) => k.keyword).filter(Boolean);
    const dataForSEOSeeds = serperKeywords.length > 0 ? serperKeywords : seedKeywords;
    console.log('[dataforseo] seeds from serper:', dataForSEOSeeds);
    console.log('[dataforseo] PRE-CALL seeds:', dataForSEOSeeds?.length, dataForSEOSeeds?.[0]);

    // Strip query params from website URL before passing to PageSpeed
    const cleanUrl = (url: string) => {
      try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
    };
    const pageSpeedUrl = website ? cleanUrl(website) : "";
    if (pageSpeedUrl !== website) console.log('[pagespeed] cleaned URL:', pageSpeedUrl);

    // ─── Run remaining external data fetches in parallel ───
    const [compResult, reviewResult, dataForSEOResult] = await Promise.allSettled([
      fetchOutscraperCompetitors(trade, city, business.name),
      (business.placeId && reviewsCount > 0) ? fetchOutscraperReviews(business.placeId) : Promise.resolve(null),
      fetchDataForSEOVolumes(dataForSEOSeeds),
    ]);
    console.log('[dataforseo] POST-ALLSETTLED status:', dataForSEOResult?.status, 'value type:', typeof (dataForSEOResult as any)?.value);

    // ─── Extract results (null on failure) ───
    const compData = compResult.status === "fulfilled" ? compResult.value : null;
    if (compResult.status === "rejected") console.error("E1 Outscraper competitors failed:", (compResult as any).reason?.message);

    const reviewData = reviewResult.status === "fulfilled" ? reviewResult.value : null;
    if (reviewResult.status === "rejected") console.error("E2 Outscraper reviews failed:", (reviewResult as any).reason?.message);

    const volumeMap = dataForSEOResult.status === "fulfilled" ? dataForSEOResult.value : null;
    if (dataForSEOResult.status === "rejected") console.error("E4 DataForSEO volumes failed:", (dataForSEOResult as any).reason?.message);

    // PageSpeed runs separately in /api/audit/speed after report is returned to client
    const resolvedSpeedData: { mobile: any; desktop: any } = { mobile: null, desktop: null };

    const mobileScore = typeof resolvedSpeedData?.mobile?.score === "number" ? resolvedSpeedData.mobile.score : null;
    const desktopScore = typeof resolvedSpeedData?.desktop?.score === "number" ? resolvedSpeedData.desktop.score : null;

    // ─── Merge keyword data (E3 + E4) ───
    let keywords = serperData?.keywords || [];
    let totalMonthlySearchVolume = 0;
    let topKeywordCPC = 0;
    let cpcSum = 0;
    let highestVolumeKeyword = seedKeywords[0] || "";
    let highestVolume = 0;

    if (volumeMap) {
      for (const kw of keywords) {
        const vol = volumeMap[kw.keyword.toLowerCase().trim()] ||
          volumeMap[kw.keyword.trim()] ||
          volumeMap[kw.keyword.toLowerCase().trim().split(' ')[0]];
        if (vol) {
          kw.monthlySearches = vol.searchVolume;
          kw.cpc = vol.cpc;
          kw.competition = vol.competition;
          totalMonthlySearchVolume += vol.searchVolume;
          if (vol.cpc > topKeywordCPC) topKeywordCPC = vol.cpc;
          cpcSum += vol.cpc;
          if (vol.searchVolume > highestVolume) {
            highestVolume = vol.searchVolume;
            highestVolumeKeyword = kw.keyword;
          }
        }
      }
    }
    // Deduplicate keywords by keyword string
    const seenKeywords = new Set<string>();
    const uniqueKeywords = keywords.filter((k: any) => {
      const key = k.keyword?.toLowerCase().trim();
      if (!key || seenKeywords.has(key)) return false;
      seenKeywords.add(key);
      return true;
    });
    keywords = uniqueKeywords;
    console.log('[keywords] after dedup:', keywords.map((k: any) => k.keyword));
    if (keywords.length > 0 && volumeMap) {
      console.log('[dataforseo] first keyword lookup attempt:', keywords[0]?.keyword,
        '→', volumeMap[keywords[0]?.keyword?.toLowerCase()?.trim()]);
    }
    const averageCPC = keywords.length > 0 ? +(cpcSum / keywords.length).toFixed(2) : 0;

    // ─── Flag ad-running competitors ───
    const competitors = compData?.competitors || [];
    if (serperData?.adCompetitors) {
      const adNames = new Set(serperData.adCompetitors.map((a: any) => a.name.toLowerCase()));
      for (const comp of competitors) {
        if (adNames.has(comp.name.toLowerCase())) comp.isRunningAds = true;
      }
    }

    // ─── E5: Demand gap (needs totalMonthlySearchVolume from E4) ───
    let demandData: any = null;
    try {
      demandData = await calculateDemandGaps(
        highestVolumeKeyword, business.hours || [], trade, totalMonthlySearchVolume
      );
    } catch (err: any) {
      console.error("E5 Demand gap failed:", err?.message);
    }

    // ─── Build auditData for scoring + AI ───
    const auditData: Record<string, any> = {
      business: {
        name: business.name || "",
        address: business.formattedAddress || "",
        rating,
        reviewsCount,
        website,
        phone: business.phone || "",
        businessPhotoUrl: business.businessPhotoUrl || null,
        photos: business.photos || [],
        hours: business.hours || [],
        description: business.description || null,
        placeId: business.placeId || null,
      },
      trade,
      city,
      speedData: { mobile: resolvedSpeedData?.mobile || null, desktop: resolvedSpeedData?.desktop || null },
      competitors,
      areaAverageReviews: compData?.areaAverageReviews || 0,
      areaAverageRating: compData?.areaAverageRating || 0,
      marketLeader: compData?.marketLeader || null,
      reviewIntelligence: reviewData || null,
      keywords,
      keywordSummary: {
        totalMonthlySearchVolume,
        topKeywordCPC,
        averageCPC,
        highestVolumeKeyword,
      },
      adMarket: {
        competitorsRunningAds: serperData?.competitorsRunningAds || 0,
        userRunningAds: false,
        adCompetitors: serperData?.adCompetitors || [],
      },
      demandGaps: demandData?.demandGaps || [],
      estimatedRevenueLoss: demandData?.estimatedRevenueLoss || null,
      isOpenEvenings: demandData?.isOpenEvenings ?? false,
      isOpenWeekends: demandData?.isOpenWeekends ?? false,
    };

    // ─── E6: New scoring engine ───
    const scores = calculateScores(auditData);
    auditData.scores = scores;

    // ─── Issue detection → service recommendations ───
    console.log('[audit] scores at detection:', JSON.stringify(scores, null, 2));
    console.log('[audit] business at detection:', JSON.stringify({
      website: auditData.business?.website,
      reviewsCount: auditData.business?.reviewsCount,
      rating: auditData.business?.rating,
      description: auditData.business?.description
    }));
    const detectedIssues: string[] = [];
    if (!auditData.business?.website) detectedIssues.push("no-website");
    if (!auditData.business?.description) detectedIssues.push("no-gbp-description");
    if ((auditData.business?.reviewsCount || 0) < 100) detectedIssues.push("low-reviews");
    if ((auditData.business?.rating || 5) < 4.2) detectedIssues.push("bad-rating");
    if ((auditData.scores?.searchVisibility?.score || 0) < 15) detectedIssues.push("low-visibility");
    if ((auditData.scores?.competitorPositioning?.score || 0) < 8) detectedIssues.push("not-in-maps-pack");
    if ((auditData.scores?.demandCoverage?.score || 0) < 8) detectedIssues.push("no-after-hours");
    if ((auditData.scores?.adOpportunity?.score || 0) < 5) detectedIssues.push("no-ads");
    if (!resolvedSpeedData?.mobile?.score || resolvedSpeedData.mobile.score < 50) detectedIssues.push("slow-website");
    const dedupedIssues = [...new Set(detectedIssues)];
    const recommendedServices = getServicesForIssues(dedupedIssues);
    auditData.detectedIssues = dedupedIssues;
    auditData.recommendedServices = recommendedServices;
    console.log('[audit] FINAL detectedIssues:', auditData.detectedIssues);
    console.log('[audit] scores used:', JSON.stringify(auditData.scores));

    // ─── Legacy fields for backward compatibility ───
    const issues: Array<{ title: string; severity: "High" | "Medium"; impact: string; fix: string }> = [];
    if (reviewsCount < 20) issues.push({ title: "Low review count", severity: "High", impact: "Fewer reviews reduces trust and hurts your visibility in Maps.", fix: "Ask recent happy customers for reviews and follow up with a simple link." });
    if (photosLen === 0) issues.push({ title: "No recent photos", severity: "Medium", impact: "Listings with photos get more clicks and calls.", fix: "Upload 10\u201315 high-quality photos (work, team, before/after, exterior)." });
    if (mobileScore !== null && mobileScore < 50) issues.push({ title: "Slow mobile website", severity: "High", impact: "Mobile slowness reduces conversions and can impact search visibility.", fix: "Compress images, remove heavy scripts, and improve Core Web Vitals." });
    if (!website) issues.push({ title: "No website linked", severity: "High", impact: "A website link improves trust and increases conversions from Maps.", fix: "Add a simple 1-page site or link your existing site to the profile." });
    if (rating !== null && rating < 3.5) issues.push({ title: "Low average rating", severity: "High", impact: "Low ratings reduce click-through and ranking performance.", fix: "Reply to all reviews and address recurring complaints in operations." });
    auditData.issues = issues;

    // Log full auditData for debugging
    console.log("═══ AUDIT DATA (before AI) ═══");
    console.log(JSON.stringify(auditData, null, 2));

    // ─── AI Narrative (Anthropic Claude — Part F prompt) ───
    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const systemPrompt = `You are a senior local SEO and digital marketing analyst for WeFixTrades — a platform that helps trades businesses get more leads.

You are analyzing audit data for a ${trade} business in ${city}.

Your job is to write a compelling, specific audit report that:
1. Explains their exact problems with data
2. Connects each problem to lost revenue
3. Recommends specific fixes with ROI

AUDIT DATA AVAILABLE:
- Google Maps score: ${scores.googleMaps?.score ?? 0}/25
- Website speed mobile: ${auditData.speedData?.mobile?.score ?? 'unavailable'}
- Website speed desktop: ${auditData.speedData?.desktop?.score ?? 'unavailable'}
- Search visibility: ${scores.searchVisibility?.score ?? 0}/20
- Keywords ranking: ${keywords.filter((k: any) => k.organicRank).length} of ${keywords.length}
- Competitor positioning: ${scores.competitorPositioning?.score ?? 0}/15
- Demand coverage: ${scores.demandCoverage?.score ?? 0}/10
- Detected issues: ${JSON.stringify(dedupedIssues)}
- Competitors analyzed: ${competitors.length}
- Market leader reviews: ${compData?.marketLeader?.reviewsCount ?? 'unknown'}
- Business reviews: ${reviewsCount}
- Revenue loss estimate: $${auditData.estimatedRevenueLoss?.low ?? 0}–$${auditData.estimatedRevenueLoss?.high ?? 0}/month

WRITING RULES:
- Be specific — use actual numbers from the data
- Connect every problem to a dollar amount or missed lead
- Write like a trusted advisor, not a salesperson
- No filler phrases like "it's important to note"
- Each action plan item must include ROI math
- Never fabricate data not present in auditData. If a field is null or missing, work around it.
- Return valid JSON only. No markdown fences. No text outside the JSON. Use null for missing data.
- For the actionPlan array, reference the specific WeFixTrades services that fix each issue:
  * MapGuard Setup ($299 one-time) — fixes GBP issues, low visibility, missing description
  * MapGuard Ongoing ($149/mo) — ongoing Maps ranking maintenance
  * WebBoost Setup ($449 one-time) — fixes slow website, Core Web Vitals, mobile speed
  * ReputationShield ($99/mo) — fixes low reviews, bad rating, reputation gaps
  * AI ChatLine ($149/mo) — fixes after-hours gaps, missed leads, no quote tool
  * AI CallLine ($199/mo) — fixes missed calls, after-hours phone coverage
  * TradeLine Complete ($299/mo) — all channels covered, best value bundle
  * SiteLaunch ($997 one-time) — builds new website if none exists

ROI FRAMING RULE:
Job values by trade: plumbing $280, hvac $420, electrical $310, cleaning $160, landscaping $200, roofing $8500, locksmith $180, general $350.
For each recommended service in the detail field, include: "At $[price]/month and an average ${trade} job worth $[jobValue], you only need [X] extra jobs per month to break even. Based on your current gaps, we estimate you could recover this cost in month one." (Calculate X = ceil(price / jobValue).)

WEBSITE SPEED RULE:
If website speed mobile score is below 70 (or unavailable), include in the relevant action plan item: "Every 1-second delay reduces conversions by 7%. Fixing your mobile speed typically recovers 15–25% of visitors who currently leave before contacting you."

COMPETITOR RULE:
If competitor data is available, reference the market leader by name: "[marketLeader.name] has [reviewsCount] reviews vs your [business.reviewsCount] — [analysis of gap]."

GUARANTEE FRAMING:
In the estimatedImpact field, include: "Businesses that fix this typically see measurable results within 30 days. This service pays for itself with [X] extra jobs per month."

Tone: direct, warm, trusted advisor. Not alarming. Not salesy. Short sentences. Write for busy tradespeople.

STRICT RULES — NEVER VIOLATE:

1. NEVER suggest creating a page or service that the business likely already offers based on their trade and hours data.
   Example: Do NOT suggest creating a "24/7 emergency service page" if the business hours show they are open 24 hours or until midnight.

2. NEVER suggest adding after-hours coverage if isOpenEvenings is true or if hours show operation past 9pm.

3. Content gap pages must target keywords the business is NOT currently ranking for.
   Only suggest content gaps for keywords where organicRank is null.
   Keywords where organicRank exists (even rank 7–10) should NOT be suggested as content gaps.

4. Revenue loss must only reference demandGaps data. If demandGaps array is empty or missedLeads is 0, do NOT invent revenue loss numbers. Set estimatedMonthlyRevenueLoss to { low: 0, high: 0, calculation: "No demand gaps detected" }.

5. All recommendations must be based ONLY on the data provided. Do NOT make assumptions about what the business does or doesn't have beyond what the data shows.

6. NEVER suggest services for issues that don't exist in detectedIssues.`;

        const userPrompt = `Analyse this business audit data and return a JSON object with exactly this structure. Valid JSON only — no other text whatsoever.

{
  "grade": "A"|"B"|"C"|"D",
  "executiveSummary": string,
  "gradeExplanation": string,
  "keyStrength": string,
  "competitorWeakness": string,
  "reviewGap": {
    "behindLeaderBy": number,
    "insight": string
  },
  "actionPlan": [
    {
      "priority": "HIGH"|"MEDIUM"|"LOW",
      "title": string,
      "detail": string,
      "estimatedImpact": string,
      "estimatedCost": string,
      "timeToResult": string,
      "wefixtrades_can_help": boolean
    }
  ],
  "contentGaps": [
    {
      "pageTitle": string,
      "targetKeyword": string,
      "monthlySearches": number|null,
      "reason": string
    }
  ],
  "demandGapInsight": string|null,
  "estimatedMonthlyRevenueLoss": {
    "low": number,
    "high": number,
    "calculation": string
  },
  "quickWin": {
    "action": string,
    "timeRequired": string,
    "expectedResult": string
  },
  "citationNote": string|null,
  "reportDataQuality": {
    "keywordDataAvailable": boolean,
    "competitorDataAvailable": boolean,
    "demandDataAvailable": boolean,
    "adDataAvailable": boolean,
    "reviewDataAvailable": boolean,
    "missingDataNote": string|null
  }
}

Rules for actionPlan: Exactly 3 items, HIGH to LOW. One must be free. Base each on a real gap.
Rules for contentGaps: Exactly 3 items, ordered by search volume desc. Format pageTitle as "{Service} {City} — {Benefit}".
Rules for executiveSummary: 2-3 sentences. S1: score, grade, one genuine strength with number. S2: single biggest gap with specific number. S3: what fixing it is worth in dollars.

Business hours: ${JSON.stringify(auditData.business?.hours || [])}
isOpenEvenings (open past 9pm): ${auditData.isOpenEvenings ?? false}
isOpenWeekends: ${auditData.isOpenWeekends ?? false}

Keywords currently ranking (have organicRank):
${keywords.filter((k: any) => k.organicRank).map((k: any) => `${k.keyword} (#${k.organicRank})`).join(', ') || 'None'}

Keywords NOT ranking (no organicRank):
${keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(', ') || 'None'}

Content gaps should ONLY target: ${keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(', ') || 'None'}

Keywords tracked:
${keywords.map((k: any) => `${k.keyword}: rank ${k.organicRank || 'not ranking'}, ${k.monthlySearches || 0} searches/mo, $${k.cpc || 0} CPC`).join('\n') || 'No keyword data available'}

Business audit data:
${JSON.stringify(auditData, null, 2)}`;

        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const raw = message.content?.[0]?.type === "text" ? message.content[0].text : "";
        console.log("═══ CLAUDE RESPONSE ═══");
        console.log(raw);
        try {
          const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
          auditData.narrative = JSON.parse(cleaned);
        } catch {
          auditData.narrative = { summary: raw, analysis: "", recommendations: "" };
        }
      }
    } catch (aiErr: any) {
      console.error("AI narrative generation failed:", aiErr?.message);
    }

    // ─── Save report to database ───
    let reportId: string | null = null;
    try {
      const [saved] = await db.insert(auditReports).values({
        business_name: business.name || "",
        business_place_id: business.placeId || null,
        audit_data: auditData,
        ai_narrative: auditData.narrative || null,
      }).returning({ id: auditReports.id });
      reportId = saved.id;
      console.log(`[audit] Report saved: ${reportId}`);
    } catch (dbErr: any) {
      console.error("[audit] Failed to save report:", dbErr?.message);
    }

    const elapsed = Date.now() - startTime;
    console.log(`═══ AUDIT COMPLETE in ${elapsed}ms ═══`);

    console.log('[audit] FINAL detectedIssues:', detectedIssues);
    console.log('[audit] FINAL recommended:', recommendedServices?.length || 0);
    return res.json({ ok: true, report_json: auditData, reportId });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "generate failed");
  }
});

/* ─── GET /report/:id — Shareable report ─── */
router.get("/report/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return safeJsonError(res, 400, "Report ID required");

    const rows = await db.select().from(auditReports).where(eq(auditReports.id, id)).limit(1);
    if (rows.length === 0) return safeJsonError(res, 404, "Report not found");

    // Increment view count
    await db.update(auditReports).set({ view_count: sql`${auditReports.view_count} + 1` }).where(eq(auditReports.id, id));

    const report = rows[0];
    return res.json({
      ok: true,
      report: {
        id: report.id,
        createdAt: report.created_at,
        businessName: report.business_name,
        auditData: report.audit_data,
        aiNarrative: report.ai_narrative,
        viewCount: (report.view_count || 0) + 1,
      },
    });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "Failed to fetch report");
  }
});

/* ─── POST /chat — AI Chat for report ─── */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return safeJsonError(res, 500, "ANTHROPIC_API_KEY not set");

    const { messages, auditContext } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return safeJsonError(res, 400, "messages[] required");
    }

    const ctx = auditContext || {};
    const systemPrompt = `You are a friendly local SEO advisor for WeFixTrades. You are chatting with the owner of ${ctx.businessName || "a local business"}, a ${ctx.trade || "trade"} business in ${ctx.city || "their city"}. Their audit score is ${ctx.score ?? "N/A"}/100 (grade ${ctx.grade || "N/A"}).

Their biggest issue is: ${ctx.topIssue || "unknown"}
Estimated monthly revenue impact: $${ctx.estimatedLoss?.low ?? 0}–$${ctx.estimatedLoss?.high ?? 0}

Answer their questions about their audit results in plain English. Be specific to their data — never give generic advice.
Short responses only — max 3 sentences.
Naturally mention WeFixTrades services where relevant, maximum once per conversation.
Never make up data not in the audit.`;

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Stream the response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20241022",
      max_tokens: 300,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e: any) {
    console.error("[audit/chat] Error:", e?.message);
    if (!res.headersSent) {
      return safeJsonError(res, 500, e?.message || "Chat failed");
    }
    res.end();
  }
});

router.post('/save-email', async (req: Request, res: Response) => {
  try {
    const { email, reportId, businessName, trade, city, score } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    console.log('[email-capture]', email, businessName, score);
    // Save to DB when table exists — for now just log and confirm
    return res.json({ ok: true });
  } catch (err) {
    console.error('[email-capture] error:', err);
    return res.status(500).json({ error: 'Failed to save' });
  }
});

export default router;
