import type { Request, Response } from "express";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

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

    const predictions = results.slice(0, 5).map((r: any) => ({
      place_id: r.place_id,
      name: r.name,
      formatted_address: r.formatted_address,
      rating: typeof r.rating === "number" ? r.rating : null,
      user_ratings_total: typeof r.user_ratings_total === "number" ? r.user_ratings_total : 0,
      photoUrl: resolvePhotoUrl(r.photos?.[0]?.photo_reference, key, 400),
    }));

    console.log("[search-places] Returning", predictions.length, "predictions:", predictions.map((p: any) => p.name));
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
    const placeId = String(req.body?.placeId || "").trim();
    if (!placeId) {
      console.error("[place-details] ERROR: placeId missing. Full body:", JSON.stringify(req.body));
      return safeJsonError(res, 400, "placeId required");
    }

    const fields = [
      "place_id",
      "name",
      "formatted_address",
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

router.post("/pagespeed", async (req: Request, res: Response) => {
  try {
    const key = requireEnv("PAGESPEED_API_KEY");
    const urlRaw = String(req.body?.url || "");
    const url = normalizeUrl(urlRaw);
    if (!url) return safeJsonError(res, 400, "Invalid url");

    const run = async (strategy: "mobile" | "desktop") => {
      const endpoint =
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?` +
        `url=${encodeURIComponent(url)}` +
        `&strategy=${strategy}` +
        `&key=${encodeURIComponent(key)}`;

      const data = await fetchJson(endpoint);
      const lhr = data?.lighthouseResult;
      const score01 = lhr?.categories?.performance?.score;
      const score =
        typeof score01 === "number" ? Math.round(score01 * 100) : null;

      const audits = lhr?.audits || {};
      const numVal = (key: string) => {
        const v = audits[key]?.numericValue;
        return typeof v === "number" ? v : null;
      };

      return {
        score,
        fcp: numVal("first-contentful-paint") !== null ? +(numVal("first-contentful-paint")! / 1000).toFixed(2) : null,
        lcp: numVal("largest-contentful-paint") !== null ? +(numVal("largest-contentful-paint")! / 1000).toFixed(2) : null,
        tbt: numVal("total-blocking-time") !== null ? Math.round(numVal("total-blocking-time")!) : null,
        cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      };
    }

    const [mobile, desktop] = await Promise.all([
      run("mobile"),
      run("desktop"),
    ]);
    return res.json({ ok: true, speedData: { mobile, desktop } });
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
  if (!apiKey) return null;
  const r = await fetch("https://api.app.outscraper.com/maps/search-v3", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `${trade} near ${city}`, limit: 8, language: "en", region: "CA" }),
  });
  const data = await r.json();
  const results = Array.isArray(data?.data) ? data.data.flat() : Array.isArray(data) ? data.flat() : [];
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
  if (!apiKey || !placeId) return null;
  const r = await fetch("https://api.app.outscraper.com/maps/reviews-v3", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: placeId, reviewsLimit: 50, sort: "newest" }),
  });
  const data = await r.json();
  const reviews = Array.isArray(data?.data) ? data.data.flat() : Array.isArray(data) ? data.flat() : [];
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
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: kw, location: `${city}, Canada`, gl: "ca", hl: "en", num: 20 }),
    });
    return { keyword: kw, data: await r.json() };
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
  const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ keywords, location_name: "Canada", language_name: "English" }]),
  });
  const data = await r.json();
  const items = data?.tasks?.[0]?.result || [];
  const volumeMap: Record<string, { searchVolume: number; cpc: number; competition: string }> = {};
  for (const item of items) {
    const kw = item.keyword || "";
    volumeMap[kw.toLowerCase()] = {
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
  let weekdayBusiness = 38, weekdayEvening = 31, weekends = 31;
  try {
    const googleTrends = require("google-trends-api");
    const trendsData = await googleTrends.interestOverTime({
      keyword: topKeyword,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });
    const parsed = JSON.parse(trendsData);
    const timeline = parsed?.default?.timelineData || [];
    if (timeline.length > 0) {
      let wdBiz = 0, wdEve = 0, wknd = 0, total = 0;
      for (const point of timeline) {
        const val = point.value?.[0] || 0;
        const date = new Date(point.time * 1000);
        const day = date.getDay();
        if (day === 0 || day === 6) wknd += val;
        else wdBiz += val; // simplified — trends doesn't give hourly
        total += val;
      }
      if (total > 0) {
        weekdayBusiness = Math.round((wdBiz / total) * 100 * 0.55); // ~55% during business hours
        weekdayEvening = Math.round((wdBiz / total) * 100 * 0.45);  // ~45% evenings
        weekends = Math.round((wknd / total) * 100);
      }
    }
  } catch (err: any) {
    console.error("Google Trends failed, using defaults:", err?.message);
  }

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

/* ═══════════════════════════════════════════════════════ */
router.post("/generate", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const business = req.body?.business;
    const speedData = req.body?.speedData || null;
    const trade = String(req.body?.trade || "general").trim();
    const city = String(req.body?.city || "").trim();

    if (!business || !business.name)
      return safeJsonError(res, 400, "business required");

    const rating = typeof business.rating === "number" ? business.rating : null;
    const reviewsCount = typeof business.reviewsCount === "number" ? business.reviewsCount : 0;
    const website = String(business.website || "");
    const photosLen = Array.isArray(business.photos) ? business.photos.length : 0;
    const mobileScore = typeof speedData?.mobile?.score === "number" ? speedData.mobile.score : null;
    const desktopScore = typeof speedData?.desktop?.score === "number" ? speedData.desktop.score : null;

    // ─── Build seed keywords ───
    const seedKeywords = buildSeedKeywords(trade, city);

    // ─── Run all external data fetches in parallel ───
    const [compResult, reviewResult, serperResult, dataForSEOResult] = await Promise.allSettled([
      fetchOutscraperCompetitors(trade, city, business.name),
      (business.placeId && reviewsCount > 0) ? fetchOutscraperReviews(business.placeId) : Promise.resolve(null),
      fetchSerperRankings(seedKeywords, website, business.name, city),
      fetchDataForSEOVolumes(seedKeywords),
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

    // ─── Merge keyword data (E3 + E4) ───
    let keywords = serperData?.keywords || [];
    let totalMonthlySearchVolume = 0;
    let topKeywordCPC = 0;
    let cpcSum = 0;
    let highestVolumeKeyword = seedKeywords[0] || "";
    let highestVolume = 0;

    if (volumeMap) {
      for (const kw of keywords) {
        const vol = volumeMap[kw.keyword.toLowerCase()];
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
      speedData: { mobile: speedData?.mobile || null, desktop: speedData?.desktop || null },
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
          model: "claude-sonnet-4-5-20250514",
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

    const elapsed = Date.now() - startTime;
    console.log(`═══ AUDIT COMPLETE in ${elapsed}ms ═══`);

    return res.json({ ok: true, report_json: auditData });
  } catch (e: any) {
    return safeJsonError(res, 500, e?.message || "generate failed");
  }
});

export default router;
