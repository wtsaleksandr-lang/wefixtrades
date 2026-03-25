import type { Request, Response } from "express";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getServicesForIssues } from "./data/services";
import { db } from "./db";
import { auditReports } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const router = express.Router();

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

/* ─── PageSpeed helper with 15s timeout ─── */
async function fetchPageSpeed(siteUrl: string): Promise<{ mobile: any; desktop: any } | null> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return null;
  const url = normalizeUrl(siteUrl);
  if (!url) return null;

  const run = async (strategy: "mobile" | "desktop") => {
    const endpoint =
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?` +
      `url=${encodeURIComponent(url)}` +
      `&strategy=${strategy}` +
      `&key=${encodeURIComponent(key)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeout);
      const text = await resp.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch {}
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const lhr = data?.lighthouseResult;
      const score01 = lhr?.categories?.performance?.score;
      const score = typeof score01 === "number" ? Math.round(score01 * 100) : null;
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
        console.log(`[pagespeed] ${strategy} timed out after 25s, using null scores`);
      } else {
        console.error(`[pagespeed] ${strategy} error:`, err.message);
      }
      return { score: null, fcp: null, lcp: null, tbt: null, cls: null };
    }
  };

  const [mobile, desktop] = await Promise.all([run("mobile"), run("desktop")]);
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

/* ─── E1: Outscraper Competitor Data ─── */
async function fetchOutscraperCompetitors(trade: string, city: string, businessName: string) {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    console.warn("[E1 Outscraper competitors] OUTSCRAPER_API_KEY not set, skipping");
    return null;
  }
  const params = new URLSearchParams({
    query: `${trade} near ${city}`,
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
  const results = Array.isArray(data?.data) ? data.data.flat() : Array.isArray(data) ? data.flat() : [];
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
  const reviews = Array.isArray(data?.data) ? data.data.flat() : Array.isArray(data) ? data.flat() : [];
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
    const { signal: sSignal, clear: sClear } = withSignal(12000);
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: kw, location: `${city}, Canada`, gl: "ca", hl: "en", num: 20 }),
        signal: sSignal,
      });
      return { keyword: kw, data: await r.json() };
    } finally {
      sClear();
    }
  }));

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
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const { signal: e4Signal, clear: e4Clear } = withSignal(15000);
  let data: any;
  try {
    const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keywords, location_name: "Canada", language_name: "English" }]),
      signal: e4Signal,
    });
    data = await r.json();
  } catch (e: any) {
    console.error("[E4 DataForSEO] Fetch error:", e?.message);
    return null;
  } finally {
    e4Clear();
  }
  const items = data?.tasks?.[0]?.result || [];
  const volumeMap: Record<string, { searchVolume: number; cpc: number; competition: string }> = {};
  for (const item of items) {
    const kw = item.keyword || "";
    volumeMap[kw.toLowerCase().trim()] = {
      searchVolume: item.search_volume || 0,
      cpc: item.cpc || 0,
      competition: item.competition_level || "LOW",
    };
  }
  return volumeMap;
}

/* ─── E5: Demand Gap ─── */
async function calculateDemandGaps(
  topKeyword: string, businessHours: string[], trade: string, totalMonthlySearchVolume: number
) {
  const weekdayBusiness = 38, weekdayEvening = 31, weekends = 31;
  console.log("[audit] Using hardcoded demand distribution");

  const hoursStr = (businessHours || []).join(" ").toLowerCase();
  const isOpenEvenings = /([6-9]|1[0-1]):\d{2}\s*(pm|$)/.test(hoursStr) || hoursStr.includes("18:") || hoursStr.includes("19:") || hoursStr.includes("20:");
  const isOpenWeekends = hoursStr.includes("saturday") || hoursStr.includes("sunday");

  const clickRate = 0.05;
  const conversionRate = 0.15;
  const monthlyLeads = totalMonthlySearchVolume * clickRate * conversionRate;
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
  let webMobile = 0, webDesktop = 0;
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
  const websiteScore = Math.min(webMobile + webDesktop, 20);

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

  const total = googleMapsScore + websiteScore + searchVisibilityScore + competitorScore + adScore + demandScore;
  let grade: string;
  if (total >= 85) grade = "A";
  else if (total >= 70) grade = "B";
  else if (total >= 55) grade = "C";
  else grade = "D";

  return {
    googleMaps: { score: googleMapsScore, max: 25, breakdown: { rating: gmRating, reviews: gmReviews, photos: gmPhotos, description: gmDesc, website: gmWeb } },
    websiteQuality: { score: websiteScore, max: 20, breakdown: { mobile: webMobile, desktop: webDesktop } },
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

    // ─── Run ALL external data fetches in parallel (including PageSpeed) ───
    const [compResult, reviewResult, serperResult, dataForSEOResult, pageSpeedResult] = await Promise.allSettled([
      fetchOutscraperCompetitors(trade, city, business.name),
      (business.placeId && reviewsCount > 0) ? fetchOutscraperReviews(business.placeId) : Promise.resolve(null),
      fetchSerperRankings(seedKeywords, website, business.name, city),
      fetchDataForSEOVolumes(seedKeywords),
      website ? fetchPageSpeed(website) : Promise.resolve(speedData),
    ]);

    // ─── Extract results (null on failure) ───
    const compData = compResult.status === "fulfilled" ? compResult.value : null;
    if (compResult.status === "rejected") console.error("E1 Outscraper competitors failed:", (compResult as any).reason?.message);

    const reviewData = reviewResult.status === "fulfilled" ? reviewResult.value : null;
    if (reviewResult.status === "rejected") console.error("E2 Outscraper reviews failed:", (reviewResult as any).reason?.message);

    const serperData = serperResult.status === "fulfilled" ? serperResult.value : null;
    if (serperResult.status === "rejected") console.error("E3 Serper rankings failed:", (serperResult as any).reason?.message);

    const volumeMap = dataForSEOResult.status === "fulfilled" ? dataForSEOResult.value : null;
    if (dataForSEOResult.status === "rejected") console.error("E4 DataForSEO volumes failed:", (dataForSEOResult as any).reason?.message);

    // Use server-side PageSpeed if available, otherwise fall back to client-provided speedData
    const resolvedSpeedData = pageSpeedResult.status === "fulfilled" && pageSpeedResult.value ? pageSpeedResult.value : speedData;
    if (pageSpeedResult.status === "rejected") console.error("PageSpeed failed:", (pageSpeedResult as any).reason?.message);

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
        const vol = volumeMap[kw.keyword.toLowerCase().trim()];
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
    keywords = keywords.filter((k: any, i: number, arr: any[]) =>
      arr.findIndex((x: any) => x.keyword === k.keyword) === i
    );
    console.log('[audit] keyword sample:', keywords[0]);
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
    if (!auditData.business.website) detectedIssues.push("no-website");
    if (auditData.speedData?.mobile?.score !== null && (auditData.speedData?.mobile?.score ?? 101) < 50) detectedIssues.push("slow-website");
    if ((auditData.business.reviewsCount || 0) < 50) detectedIssues.push("low-reviews");
    if ((auditData.business.rating || 5) < 4.0) detectedIssues.push("bad-rating");
    if (!auditData.business.description) detectedIssues.push("no-gbp-description");
    if ((scores.searchVisibility?.score || 0) < 8) detectedIssues.push("low-visibility");
    if ((scores.competitorPositioning?.score || 0) < 5) detectedIssues.push("not-in-maps-pack");
    if ((scores.demandCoverage?.score || 0) < 8) detectedIssues.push("no-after-hours");
    if (auditData.keywords?.length > 0 && auditData.keywords.every((k: any) => !k.organicRank)) detectedIssues.push("low-search-ranking");
    const recommendedServices = getServicesForIssues(detectedIssues);
    auditData.detectedIssues = detectedIssues;
    auditData.recommendedServices = recommendedServices;
    console.log('[audit] detectedIssues result:', detectedIssues);
    console.log('[audit] recommendedServices:', recommendedServices.map((s: any) => s.name));

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

        const systemPrompt = `You are a senior local SEO analyst specialising exclusively in trades businesses: plumbing, HVAC, electrical, cleaning, landscaping, roofing, locksmith, and general contracting.

You work for WeFixTrades, a platform that helps trades businesses grow online. WeFixTrades services:
- Google Business Profile optimisation and management
- Local SEO and website content optimisation
- Google Ads setup and management
- Review generation and reputation management
- Citation building across directories
- Instant quote widget for websites
- After-hours AI call/chat answering

YOUR RULES:
1. Never fabricate data not present in auditData. If a field is null or missing, work around it.
2. Every recommendation must cite specific numbers from the data. Never give generic advice.
3. Tone: direct, warm, trusted advisor. Not alarming. Not salesy. Plain English. Write for busy tradespeople — short sentences.
4. Revenue estimates use this formula exactly:
   Job values: plumbing $280, hvac $420, electrical $310, cleaning $160, landscaping $200, roofing $8500, locksmith $180, general $350
   Low = missedLeads x jobValue x 0.25
   High = missedLeads x jobValue x 0.35
   Round to nearest $100.
5. Mention WeFixTrades services naturally, maximum twice in the entire response, only where genuinely relevant.
6. Return valid JSON only. No markdown fences. No text outside the JSON. Use null for missing data — never omit a field.`;

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

export default router;
