import type { Request, Response } from "express";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getServicesForIssues } from "@shared/services";
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
        const screenshotData =
          audits?.["final-screenshot"]?.details?.data ||
          audits?.["screenshot-thumbnails"]?.details?.items?.[0]?.data ||
          null;
        if (screenshotData) {
          console.log('[pagespeed] screenshot: extracted, length:', screenshotData.length);
        }
        return {
          score,
          fcp: numVal("first-contentful-paint") !== null ? +(numVal("first-contentful-paint")! / 1000).toFixed(2) : null,
          lcp: numVal("largest-contentful-paint") !== null ? +(numVal("largest-contentful-paint")! / 1000).toFixed(2) : null,
          tbt: numVal("total-blocking-time") !== null ? Math.round(numVal("total-blocking-time")!) : null,
          cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
          screenshot: screenshotData,
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
router.get("/speed-test", async (req: Request, res: Response) => {
  res.setTimeout(120000);
  console.log('[speed-test] starting...');
  const start = Date.now();
  try {
    const result = await fetchPageSpeed('https://example.com', 'mobile');
    const elapsed = Date.now() - start;
    console.log('[speed-test] done in', elapsed + 'ms:', result?.score ?? 'null');
    return res.json({ ok: true, elapsed, score: result?.score ?? null });
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.log('[speed-test] error in', elapsed + 'ms:', err.message);
    return res.json({ ok: false, elapsed, error: err.message });
  }
});

router.post("/speed", async (req: Request, res: Response) => {
  const { website, reportId } = req.body;
  if (!website || !reportId) {
    return safeJsonError(res, 400, "Missing website or reportId");
  }

  // Return immediately — don't wait for PageSpeed
  res.json({ ok: true, status: 'processing', reportId });

  // Continue processing in background after response is sent
  (async () => {
    try {
      const cleanUrl = (url: string) => {
        try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
      };
      const pageSpeedUrl = cleanUrl(String(website));
      console.log('[speed-bg] starting for:', pageSpeedUrl);

      const [mob, desk] = await Promise.allSettled([
        fetchPageSpeed(pageSpeedUrl, 'mobile'),
        fetchPageSpeed(pageSpeedUrl, 'desktop'),
      ]);

      let mobileScore = mob.status === 'fulfilled' ? mob.value : null;
      const desktopScore = desk.status === 'fulfilled' ? desk.value : null;

      if (!mobileScore) {
        console.log('[speed-bg] mobile null, retrying...');
        await new Promise(r => setTimeout(r, 3000));
        mobileScore = await fetchPageSpeed(pageSpeedUrl, 'mobile');
      }

      const speedData = { mobile: mobileScore, desktop: desktopScore };
      console.log('[speed-bg] done — mobile:', mobileScore?.score ?? 'null', 'desktop:', desktopScore?.score ?? 'null');

      // Extract screenshot and run AI analysis
      const screenshotBase64: string | null = mobileScore?.screenshot || desktopScore?.screenshot || null;
      let websiteAIAnalysis: any = null;
      if (screenshotBase64) {
        try {
          // Need business name + trade from DB for AI analysis
          const rows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
          const reportData = rows[0]?.audit_data as any;
          const businessName = reportData?.business?.name || "this business";
          const trade = reportData?.trade || "general";
          websiteAIAnalysis = await analyzeScreenshot(screenshotBase64, businessName, trade);
        } catch (e: any) {
          console.error('[speed-bg] screenshot AI failed:', e.message);
        }
      }

      // Strip screenshot from speedData before saving (it can be large)
      const speedDataClean = {
        mobile: mobileScore ? { ...mobileScore, screenshot: undefined } : null,
        desktop: desktopScore ? { ...desktopScore, screenshot: undefined } : null,
      };

      // Merge speedData + screenshot metadata into audit_data
      const mergeData: Record<string, any> = { speedData: speedDataClean };
      if (screenshotBase64) mergeData.websiteScreenshot = screenshotBase64.slice(0, 100) + "...(truncated)";
      if (websiteAIAnalysis) mergeData.websiteAIAnalysis = websiteAIAnalysis;

      // Recalculate websiteQuality score with speed + AI data
      const mobileVal = speedDataClean.mobile?.score;
      const desktopVal = speedDataClean.desktop?.score;
      let speedPts = 0;
      const speedScore = typeof mobileVal === "number" ? mobileVal : (typeof desktopVal === "number" ? desktopVal : null);
      if (speedScore !== null) {
        if (speedScore >= 90) speedPts = 8;
        else if (speedScore >= 70) speedPts = 6;
        else if (speedScore >= 50) speedPts = 4;
        else if (speedScore >= 30) speedPts = 2;
        else speedPts = 1;
      }

      // Read existing QA score from report
      const existingRows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
      const existingData = existingRows[0]?.audit_data as any;
      const qaScoreVal = typeof existingData?.websiteQualityCheckScore === "number" ? existingData.websiteQualityCheckScore : 0;
      const qaPointsCalc = Math.round((qaScoreVal / 18) * 8);

      let aiVisualPts = 0;
      if (websiteAIAnalysis?.findings && Array.isArray(websiteAIAnalysis.findings)) {
        const passCount = websiteAIAnalysis.findings.filter((f: any) => f.status === "pass").length;
        const total = websiteAIAnalysis.findings.length || 1;
        aiVisualPts = Math.round((passCount / total) * 4);
      }

      const newWebsiteScore = Math.min(speedPts + qaPointsCalc + aiVisualPts, 20);
      const oldTotal = existingData?.scores?.total || 0;
      const oldWebsiteScore = existingData?.scores?.websiteQuality?.score || 0;
      const newTotal = oldTotal - oldWebsiteScore + newWebsiteScore;

      // Update scores in merge data
      mergeData.scores = {
        ...(existingData?.scores || {}),
        total: newTotal,
        websiteQuality: {
          score: newWebsiteScore,
          max: 20,
          breakdown: { speed: speedPts, htmlChecks: qaPointsCalc, aiVisual: aiVisualPts, mobile: mobileVal ?? null, desktop: desktopVal ?? null },
        },
      };
      console.log('[speed-bg] recalculated websiteQuality:', newWebsiteScore, '(speed:', speedPts, 'qa:', qaPointsCalc, 'aiVisual:', aiVisualPts, ') total:', newTotal);

      await db.update(auditReports)
        .set({ audit_data: sql`${auditReports.audit_data} || ${JSON.stringify(mergeData)}::jsonb` })
        .where(eq(auditReports.id, reportId));

      console.log('[speed-bg] saved to DB:', reportId);
    } catch (err) {
      console.error('[speed-bg] error:', err);
    }
  })();
});

router.get("/speed/:reportId", async (req: Request, res: Response) => {
  try {
    const reportId = req.params.reportId as string;
    const rows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
    if (!rows.length) return safeJsonError(res, 404, "Report not found");

    const auditData = rows[0].audit_data as any;
    const speedData = auditData?.speedData || null;
    const hasData = speedData?.mobile?.score != null || speedData?.desktop?.score != null;

    return res.json({
      ok: true,
      ready: hasData,
      speedData: hasData ? speedData : null,
      websiteAIAnalysis: auditData?.websiteAIAnalysis || null,
      websiteQualityChecks: auditData?.websiteQualityChecks || null,
      websiteQualityCheckScore: auditData?.websiteQualityCheckScore ?? null,
    });
  } catch (err) {
    console.error('[speed-poll] error:', err);
    return safeJsonError(res, 500, "Failed to check speed");
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

/* ─── Niche Inference ─── */
// Infer specific business niche from name, types, and description
// Returns { primary, secondary[], nicheTerms[] }
function inferBusinessNiche(businessName: string, types: string[], description?: string | null): {
  primary: string;
  secondary: string[];
  nicheTerms: string[];
  confidence: 'high' | 'medium' | 'low';
} {
  const haystack = [businessName, ...(types || []), description || ''].join(' ').toLowerCase();
  const nicheTerms: string[] = [];
  const secondary: string[] = [];

  // Service-specific patterns — more granular than trade detection
  const NICHE_PATTERNS: Array<{ pattern: RegExp; niche: string; trade: string }> = [
    // Locksmith sub-niches
    { pattern: /fob|key\s*(copy|cut|duplicat|program|replac)/i, niche: 'key & fob services', trade: 'locksmith' },
    { pattern: /auto\s*lock|car\s*lock|car\s*key|vehicle\s*lock/i, niche: 'automotive locksmith', trade: 'locksmith' },
    { pattern: /safe\s*(open|crack|install|repair)/i, niche: 'safe services', trade: 'locksmith' },
    { pattern: /lock\s*(chang|rekey|install|repair)/i, niche: 'lock services', trade: 'locksmith' },
    // Plumbing sub-niches
    { pattern: /drain|sewer|rooter|clog/i, niche: 'drain & sewer services', trade: 'plumbing' },
    { pattern: /water\s*heater|hot\s*water|tankless/i, niche: 'water heater services', trade: 'plumbing' },
    { pattern: /bathroom|kitchen\s*plumb|renovation/i, niche: 'plumbing renovation', trade: 'plumbing' },
    // HVAC sub-niches
    { pattern: /furnace|heating\s*repair/i, niche: 'furnace & heating', trade: 'hvac' },
    { pattern: /air\s*condition|ac\s*(repair|install|service)/i, niche: 'air conditioning', trade: 'hvac' },
    { pattern: /duct\s*(clean|repair|install)/i, niche: 'ductwork services', trade: 'hvac' },
    // Electrical sub-niches
    { pattern: /panel|wiring|rewir/i, niche: 'electrical wiring', trade: 'electrical' },
    { pattern: /ev\s*charg|electric\s*vehicle/i, niche: 'EV charger installation', trade: 'electrical' },
    { pattern: /light|illumin/i, niche: 'lighting services', trade: 'electrical' },
    // Cleaning sub-niches
    { pattern: /carpet/i, niche: 'carpet cleaning', trade: 'cleaning' },
    { pattern: /window\s*clean/i, niche: 'window cleaning', trade: 'cleaning' },
    { pattern: /pressure\s*wash|power\s*wash/i, niche: 'pressure washing', trade: 'cleaning' },
    { pattern: /commercial\s*clean|office\s*clean|janitorial/i, niche: 'commercial cleaning', trade: 'cleaning' },
  ];

  let primary = '';
  for (const { pattern, niche } of NICHE_PATTERNS) {
    if (pattern.test(haystack)) {
      if (!primary) primary = niche;
      else if (!secondary.includes(niche)) secondary.push(niche);
      // Extract matching terms for keyword generation
      const match = haystack.match(pattern);
      if (match && match[0]) nicheTerms.push(match[0].trim());
    }
  }

  // Confidence based on how much signal we found
  const confidence = primary && nicheTerms.length >= 2 ? 'high'
    : primary ? 'medium'
    : 'low';

  return { primary: primary || '', secondary, nicheTerms, confidence };
}

/* ─── Niche-Aware Keyword Generation ─── */
function buildNicheKeywords(trade: string, city: string, niche: ReturnType<typeof inferBusinessNiche>, businessName: string): string[] {
  const base = buildSeedKeywords(trade, city);
  if (!niche.primary || niche.confidence === 'low') return base;

  // Add niche-specific keywords
  const nicheKws: string[] = [];
  // Primary niche + city
  nicheKws.push(`${niche.primary} ${city}`);
  // Each detected niche term + city
  for (const term of niche.nicheTerms.slice(0, 3)) {
    const kw = `${term} ${city}`;
    if (!nicheKws.includes(kw) && !base.includes(kw)) nicheKws.push(kw);
  }
  // Secondary niches
  for (const sec of niche.secondary.slice(0, 2)) {
    const kw = `${sec} ${city}`;
    if (!nicheKws.includes(kw)) nicheKws.push(kw);
  }
  // Near-me variant for primary niche
  nicheKws.push(`${niche.primary} near me`);

  // Merge: niche keywords first (higher relevance), then base (broader)
  const all = [...nicheKws, ...base];
  // Deduplicate
  const seen = new Set<string>();
  return all.filter(kw => {
    const key = kw.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12); // Cap at 12 keywords for cost control
}

/* ─── Keyword Relevance Scoring ─── */
function scoreKeywordRelevance(keyword: string, trade: string, niche: ReturnType<typeof inferBusinessNiche>): 'high' | 'medium' | 'low' {
  const kw = keyword.toLowerCase();
  // Check niche-specific terms first
  if (niche.primary && kw.includes(niche.primary.toLowerCase().split(' ')[0])) return 'high';
  for (const term of niche.nicheTerms) {
    if (kw.includes(term.toLowerCase())) return 'high';
  }
  // Check trade-level match
  const tradeLower = trade.toLowerCase();
  if (kw.includes(tradeLower)) return niche.primary ? 'medium' : 'high';
  // Check specific service map
  const specific = SPECIFIC_SERVICE_MAP[tradeLower];
  if (specific && kw.includes(specific.toLowerCase())) return 'medium';
  return 'low';
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
async function fetchOutscraperCompetitors(trade: string, city: string, businessName: string, stateCode?: string) {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    console.warn("[E1 Outscraper competitors] OUTSCRAPER_API_KEY not set, skipping");
    return null;
  }
  const locationLabel = stateCode ? `${city}, ${stateCode}` : city;
  const competitorQuery = `${trade} near ${locationLabel}`;
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
  keywords: string[], businessDomain: string, businessName: string, city: string,
  stateCode?: string, businessAddress?: string
) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  const domain = businessDomain.replace(/^https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
  const nameLC = businessName.toLowerCase();
  const businessNameWords = nameLC.split(' ').filter((w: string) => w.length > 3);
  const nameFirstWord = nameLC.split(' ')[0];
  const streetNum = (businessAddress || "").toLowerCase().split(',')[0].trim();
  const locationStr = stateCode ? `${city}, ${stateCode}, Canada` : `${city}, Canada`;
  console.log('[serper] location:', locationStr);

  const results = await Promise.allSettled(keywords.map(async (kw) => {
    const cacheKey = `serper:${kw.toLowerCase()}:${city.toLowerCase()}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      console.log('[serper] cache hit:', kw);
      return { keyword: kw, data: cachedData };
    }

    // Run /search (organic) and /maps (local pack) in parallel
    const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
    const body = { q: kw, location: locationStr, gl: "ca", hl: "en" };
    const { signal: sSignal, clear: sClear } = withSignal(15000);
    try {
      const [searchResp, mapsResp] = await Promise.allSettled([
        fetch("https://google.serper.dev/search", {
          method: "POST", headers,
          body: JSON.stringify({ ...body, num: 20 }),
          signal: sSignal,
        }).then(r => r.json()),
        fetch("https://google.serper.dev/maps", {
          method: "POST", headers,
          body: JSON.stringify(body),
          signal: sSignal,
        }).then(r => r.json()),
      ]);
      const searchData = searchResp.status === "fulfilled" ? searchResp.value : {};
      const mapsData = mapsResp.status === "fulfilled" ? mapsResp.value : {};
      // Merge maps places into search data as localResults
      const data = {
        ...searchData,
        localResults: Array.isArray(mapsData?.places) ? mapsData.places : [],
      };
      setCached(cacheKey, data);
      console.log('[serper] cached:', kw, '— organic:', (data.organic?.length || 0), 'local:', data.localResults.length);
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
    const localResults = Array.isArray(data?.localResults) ? data.localResults
      : Array.isArray(data?.places) ? data.places : [];
    const ads = Array.isArray(data?.ads) ? data.ads : [];

    let organicRank: number | null = null;
    for (const o of organic) {
      const link = (o.link || "").toLowerCase();
      if (domain && link.includes(domain)) { organicRank = o.position || null; break; }
    }

    const localPackIdx = localResults.findIndex((r: any) => {
      const title = (r.title || r.name || "").toLowerCase();
      const addr = (r.address || "").toLowerCase();
      // Match by name words (any significant word)
      const nameMatch = businessNameWords.some((w: string) => title.includes(w));
      // Match by street number from address
      const streetPart = (businessAddress || "").split(",")[0].toLowerCase();
      const addressMatch = streetPart.length > 3 && addr.includes(streetPart.split(" ")[0]);
      return nameMatch || nameLC.includes(title) || addressMatch;
    });
    const isInLocalPack = localPackIdx >= 0 && localPackIdx < 10;
    const localPackPosition: number | null = isInLocalPack ? localPackIdx + 1 : null;
    console.log('[serper] local pack:', isInLocalPack, 'position:', localPackPosition, 'of', localResults.length, 'results');

    const status = isInLocalPack
      ? (localPackIdx === 0 ? "dominant" : "strong")
      : organicRank
        ? (organicRank <= 3 ? "strong" : organicRank <= 7 ? "good" : "weak")
        : "not-visible";

    for (const ad of ads) {
      const adName = ad.title || ad.displayedLink || "";
      if (adName && !competitorAdNames.has(adName)) {
        competitorAdNames.add(adName);
        adCompetitors.push({ name: adName, displayedUrl: ad.displayedLink || "", sampleHeadline: ad.title || "" });
      }
    }

    keywordResults.push({
      keyword, organicRank, localPackPosition, status,
      isInLocalPack,
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
  const normalizeKw = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  results.forEach((item: any) => {
    const kw = item?.keyword;
    if (!kw) return;
    // search_volume/live returns fields directly on item (not nested under keyword_info)
    const info = item?.keyword_info;
    const val = {
      searchVolume: item?.search_volume ?? info?.search_volume ?? 0,
      cpc: item?.cpc ?? info?.cpc ?? 0,
      competition: item?.competition_index ?? item?.competition ?? info?.competition ?? 0,
    };
    const norm = normalizeKw(kw);
    volumeMap[norm] = val;
    volumeMap[kw.trim()] = val;
    const firstWord = norm.split(' ')[0];
    if (firstWord) volumeMap[firstWord] = val;
  });
  console.log('[dataforseo] volumeMap keys after build:', Object.keys(volumeMap));
  setCached(dfsKey, volumeMap);
  console.log('[dataforseo] cached:', Object.keys(volumeMap).length, 'volume entries');
  return volumeMap;
}

/* ─── isOpenInEvenings helper ─── */
function isOpenInEvenings(hours: string[]): boolean {
  if (!hours || hours.length === 0) return false;
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  for (const hourStr of hours) {
    const lower = hourStr.toLowerCase();
    // Check if it's a weekday line
    const isWeekday = weekdays.some(d => lower.includes(d));
    if (!isWeekday) continue;
    if (lower.includes('closed')) continue;
    // Open 24 hours covers evenings
    if (lower.includes('open 24 hours') || lower.includes('24/7') || lower.includes('24hrs')) return true;
    // Parse closing time — format: "Monday: 9:00 AM – 10:00 PM"
    const match = lower.match(/[–—\-]\s*(\d{1,2}):?(\d{0,2})\s*(am|pm)/);
    if (!match) continue;
    let hour = parseInt(match[1]);
    const ampm = match[3];
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 24; // midnight
    if (ampm === 'am' && hour < 12) hour += 24;  // 1am, 2am → past midnight
    if (hour >= 21) return true;
  }
  return false;
}

/* ─── E5: Demand Gap ─── */
async function calculateDemandGaps(
  topKeyword: string, businessHours: string[], trade: string, totalMonthlySearchVolume: number
) {
  const weekdayBusiness = 38, weekdayEvening = 31, weekends = 31;
  console.log("[audit] Using hardcoded demand distribution");

  const hoursStr = (businessHours || []).join(" ").toLowerCase();
  const isOpenEvenings = isOpenInEvenings(businessHours || []);
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

  // Website Quality — 20pts (speed 8pts + QA checks 12pts)
  const speedDataAvailable = typeof speedMobile === "number" || typeof speedDesktop === "number";
  let webMobile: number | null = null, webDesktop: number | null = null;

  // Speed contribution (max 8)
  if (bd.website && typeof speedMobile === "number") {
    if (speedMobile >= 90) webMobile = 8;
    else if (speedMobile >= 70) webMobile = 6;
    else if (speedMobile >= 50) webMobile = 4;
    else if (speedMobile >= 30) webMobile = 2;
    else webMobile = 1;
  }
  if (bd.website && typeof speedDesktop === "number" && webMobile === null) {
    if (speedDesktop >= 90) webDesktop = 8;
    else if (speedDesktop >= 70) webDesktop = 6;
    else if (speedDesktop >= 50) webDesktop = 4;
    else if (speedDesktop >= 30) webDesktop = 2;
    else webDesktop = 1;
  }

  // QA checks contribution (max 8)
  const qaScore = typeof auditData.websiteQualityCheckScore === "number" ? auditData.websiteQualityCheckScore : null;
  const qaMax = 18; // sum of all weights
  const qaPoints = qaScore !== null ? Math.round((qaScore / qaMax) * 8) : 0;

  // AI visual analysis contribution (max 4)
  const aiAnalysis = auditData.websiteAIAnalysis;
  let aiVisualPts = 0;
  if (aiAnalysis?.findings && Array.isArray(aiAnalysis.findings)) {
    const passCount = aiAnalysis.findings.filter((f: any) => f.status === "pass").length;
    const total = aiAnalysis.findings.length || 1;
    aiVisualPts = Math.round((passCount / total) * 4);
  }

  const speedPts = webMobile ?? webDesktop ?? 0;
  // If business has a website but speed data didn't load, score is null (excluded from total)
  const websiteScore: number | null = bd.website && !speedDataAvailable && qaScore === null
    ? null
    : Math.min(speedPts + qaPoints + aiVisualPts, 20);
  console.log('[scoring] websiteQuality:', websiteScore ?? 'null - excluded', '(speed:', speedPts, 'qa:', qaPoints, 'aiVisual:', aiVisualPts, ')');

  // Search Visibility — 20pts
  // Local pack position-based scoring (stronger differentiation by position):
  //   LP #1 = 8pts, LP #2 = 6pts, LP #3 = 5pts, LP #4-10 = 3pts
  // Organic: rank 1-3 = 3pts, 4-7 = 2pts, 8-10 = 1pt
  // Relevance weighting: high=1.0, medium=0.7, low=0.3
  const RELEVANCE_WEIGHT: Record<string, number> = { high: 1.0, medium: 0.7, low: 0.3 };
  let searchPts = 0;
  let hasLocalPack = false;
  let bestLocalPackPos = 99;
  let localPackPts = 0;
  let organicPts = 0;
  let lowRelPts = 0;
  let totalEarnedPts = 0;
  for (const kw of kws) {
    const relWeight = RELEVANCE_WEIGHT[kw.relevance] ?? 0.7; // unknown defaults to medium weight
    if (kw.isInLocalPack && kw.localPackPosition) {
      const pos = kw.localPackPosition;
      const rawPts = pos === 1 ? 8 : pos === 2 ? 6 : pos === 3 ? 5 : 3;
      const pts = Math.round(rawPts * relWeight);
      searchPts += pts;
      localPackPts += pts;
      totalEarnedPts += pts;
      if (kw.relevance === 'low') lowRelPts += pts;
      hasLocalPack = true;
      if (pos < bestLocalPackPos) bestLocalPackPos = pos;
    } else if (kw.organicRank) {
      const rawPts = kw.organicRank <= 3 ? 3 : kw.organicRank <= 7 ? 2 : kw.organicRank <= 10 ? 1 : 0;
      const pts = Math.round(rawPts * relWeight);
      searchPts += pts;
      organicPts += pts;
      totalEarnedPts += pts;
      if (kw.relevance === 'low') lowRelPts += pts;
    }
  }
  // Position-based local pack floor (replaces flat floor of 6)
  if (hasLocalPack) {
    const posFloor = bestLocalPackPos === 1 ? 12 : bestLocalPackPos === 2 ? 10 : bestLocalPackPos === 3 ? 8 : 6;
    if (searchPts < posFloor) searchPts = posFloor;
  }
  const searchVisibilityScore = Math.min(searchPts, 20);

  // ─── Keyword coverage metric ───
  const relevantKws = kws.filter((k: any) => k.relevance === 'high' || k.relevance === 'medium');
  const denomKws = relevantKws.length > 0 ? relevantKws : kws;
  const rankingKws = denomKws.filter((k: any) => k.isInLocalPack || (k.organicRank && k.organicRank <= 20));
  const coverageRatio = denomKws.length > 0 ? rankingKws.length / denomKws.length : 0;
  const coveragePercent = Math.round(coverageRatio * 100);
  const coverageLevel: 'strong' | 'partial' | 'weak' =
    coverageRatio >= 0.7 ? 'strong' : coverageRatio >= 0.4 ? 'partial' : 'weak';

  // ─── Misalignment quantification ───
  const misalignmentPercent = totalEarnedPts > 0 ? Math.round((lowRelPts / totalEarnedPts) * 100) : 0;

  // ─── Strong business presence detection ───
  const strongLocalPack = hasLocalPack && bestLocalPackPos <= 3;
  const strongReviews = (bd.reviewsCount || 0) >= 50;
  const strongRating = (bd.rating || 0) >= 4.2;
  const strongCoverage = coverageLevel === 'strong';
  const strongSignals = [strongLocalPack, strongReviews, strongRating, strongCoverage, searchVisibilityScore >= 12].filter(Boolean).length;
  const presenceLevel: 'strong' | 'moderate' | 'weak' =
    strongSignals >= 3 ? 'strong' : strongSignals >= 2 ? 'moderate' : 'weak';

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
    websiteQuality: { score: websiteScore, max: websiteScore === null ? null : 20, breakdown: { speed: speedPts, htmlChecks: qaPoints, aiVisual: aiVisualPts, mobile: webMobile, desktop: webDesktop } },
    searchVisibility: { score: searchVisibilityScore, max: 20, breakdown: { keywordPoints: organicPts, localPackBonus: localPackPts, bestLocalPackPos: hasLocalPack ? bestLocalPackPos : null } },
    competitorPositioning: { score: competitorScore, max: 15, breakdown: {} },
    adOpportunity: { score: adScore, max: 10, breakdown: { topCPC, totalVol } },
    demandCoverage: { score: demandScore, max: 10, breakdown: { evenings: auditData.isOpenEvenings, weekends: auditData.isOpenWeekends } },
    total,
    grade,
    keywordCoverage: { ratio: coverageRatio, percent: coveragePercent, level: coverageLevel, ranked: rankingKws.length, tested: denomKws.length },
    presenceLevel,
    misalignmentPercent,
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
  // Fallback for "City, ON" or "City, Province" format (2 parts)
  if (parts.length === 2) {
    const firstPart = parts[0];
    // If first part doesn't look like a street address (no numbers at start), use it as city
    if (firstPart && !/^\d/.test(firstPart)) {
      console.log("[extractCity] Extracted city from 2-part address:", firstPart);
      return firstPart;
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

const TYPE_TRADE_MAP: Record<string, string> = {
  electrician: "electrical",
  plumber: "plumbing",
  roofing_contractor: "roofing",
  painter: "painting",
  general_contractor: "general",
  cleaning_service: "cleaning",
  window_cleaning_service: "cleaning",
  landscaper: "landscaping",
  locksmith: "locksmith",
  hvac_contractor: "hvac",
  moving_company: "moving",
  pest_control_service: "pest",
  garage_door_service: "garage",
  carpenter: "carpentry",
};

const NAME_TRADE_MAP: Record<string, string> = {
  window: "cleaning",
  clean: "cleaning",
  upkeep: "cleaning",
  wash: "cleaning",
  gutter: "cleaning",
  carpet: "cleaning",
  maid: "cleaning",
  janitorial: "cleaning",
  plumb: "plumbing",
  drain: "plumbing",
  pipe: "plumbing",
  electric: "electrical",
  hvac: "hvac",
  heating: "hvac",
  cooling: "hvac",
  furnace: "hvac",
  "air condition": "hvac",
  roof: "roofing",
  shingle: "roofing",
  eaves: "roofing",
  paint: "painting",
  landscap: "landscaping",
  lawn: "landscaping",
  snow: "landscaping",
  lock: "locksmith",
  key: "locksmith",
  mov: "moving",
  storage: "moving",
  garage: "garage",
  pest: "pest",
  extermina: "pest",
  handyman: "handyman",
  renovation: "renovation",
  remodel: "renovation",
  construct: "construction",
};

function detectTrade(businessName: string, types: string[]): string {
  const haystack = [businessName, ...types].join(" ");
  console.log(`[detectTrade] businessName: ${businessName}, types: ${JSON.stringify(types)}, haystack: ${haystack}`);

  // Step 1: pattern match on combined haystack (name + types)
  for (const { pattern, trade } of TRADE_PATTERNS) {
    if (pattern.test(haystack)) {
      console.log(`[audit] Detected trade: ${trade} from business name: ${businessName}`);
      return trade;
    }
  }

  let trade = "general";

  // Step 2: type-based fallback
  for (const type of types) {
    if (TYPE_TRADE_MAP[type]) {
      trade = TYPE_TRADE_MAP[type];
      break;
    }
  }

  // Step 3: name word fallback
  if (trade === "general") {
    const nameLower = businessName.toLowerCase();
    for (const [word, t] of Object.entries(NAME_TRADE_MAP)) {
      if (nameLower.includes(word)) {
        trade = t;
        break;
      }
    }
  }

  console.log(`[trade] final: ${trade} for: ${businessName}`);
  return trade;
}

/* ─── Timeout helper for API calls ─── */
function withApiTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => { console.log(`[anthropic] timeout after ${ms}ms`); resolve(fallback); }, ms)
    ),
  ]);
}

/* ─── Screenshot AI Analysis ─── */
async function analyzeScreenshot(
  screenshotBase64: string,
  businessName: string,
  trade: string
): Promise<{
  findings: Array<{ label: string; status: "pass" | "warn" | "fail"; note: string }>;
  summary: string;
} | null> {
  try {
    const AnthropicSdk = (await import("@anthropic-ai/sdk")).default;
    const client = new AnthropicSdk();
    const imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const response = await withApiTimeout(
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageData },
            },
            {
              type: "text",
              text: `You are analyzing a screenshot of ${businessName}'s website (${trade} business).\n\nEvaluate ONLY what is visible in the screenshot. Respond in JSON only:\n{\n  "findings": [\n    {\n      "label": "Phone number visible",\n      "status": "pass|warn|fail",\n      "note": "one short sentence"\n    }\n  ],\n  "summary": "2 sentences max"\n}\n\nCheck these 5 things:\n1. Phone number visible above fold\n2. Clear call-to-action button\n3. Professional appearance\n4. Business name/logo visible\n5. Services mentioned\n\nStatus: pass=present and good, warn=present but could improve, fail=missing or poor`,
            },
          ],
        }],
      }),
      15000,
      null as any
    );
    if (!response) return null;
    const textBlock = response.content.find((b: any) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[screenshot-ai] error:", err.message);
    return null;
  }
}

/* ─── Website Quality Analysis (cheerio) ─── */
async function analyzeWebsiteQuality(url: string): Promise<{
  checks: Record<string, boolean>;
  score: number;
  maxScore: number;
}> {
  const checks: Record<string, boolean> = {
    hasPhone: false,
    hasEmail: false,
    hasContactLink: false,
    hasBookingForm: false,
    hasReviewsSection: false,
    hasLocalSchema: false,
    hasMetaDescription: false,
    hasSSL: false,
    hasMobileViewport: false,
  };

  // SSL check (free, instant)
  checks.hasSSL = url.startsWith("https");

  try {
    const cleanUrl = (u: string) => {
      try { const p = new URL(u); return p.origin + p.pathname; } catch { return u; }
    };
    const fetchUrl = cleanUrl(url);
    console.log("[website-qa] fetching:", fetchUrl);

    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WeFixTrades Audit Bot/1.0)" },
    });
    const html = await res.text();
    const { load } = await import("cheerio");
    const $ = load(html);

    // Phone number (Canadian/US)
    const bodyText = $("body").text();
    checks.hasPhone = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(bodyText);

    // Email
    checks.hasEmail =
      /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(bodyText) ||
      $('a[href^="mailto:"]').length > 0;

    // Contact page link
    const contactKeywords = ["contact", "reach us", "get in touch", "reach out", "contactez"];
    checks.hasContactLink = $("a").toArray().some((el) => {
      const text = $(el).text().toLowerCase();
      const href = ($(el).attr("href") || "").toLowerCase();
      return contactKeywords.some((k) => text.includes(k) || href.includes("contact"));
    });

    // Booking/quote form
    const formKeywords = ["quote", "book", "schedule", "appointment", "estimate", "request", "reservation"];
    const hasForms = $("form").length > 0;
    const hasFormKeywords = formKeywords.some((k) => bodyText.toLowerCase().includes(k));
    checks.hasBookingForm = hasForms && hasFormKeywords;

    // Reviews/testimonials section
    const reviewKeywords = ["review", "testimonial", "what our", "clients say", "customers say", "rated", "stars"];
    checks.hasReviewsSection = reviewKeywords.some((k) => bodyText.toLowerCase().includes(k));

    // LocalBusiness schema
    const schemaScripts = $('script[type="application/ld+json"]').toArray();
    checks.hasLocalSchema = schemaScripts.some((el) => {
      const content = $(el).html() || "";
      return content.includes("LocalBusiness") || content.includes("Organization");
    });

    // Meta description
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    checks.hasMetaDescription = metaDesc.length > 10;

    // Mobile viewport
    checks.hasMobileViewport = $('meta[name="viewport"]').length > 0;

    console.log("[website-qa] checks:", checks);
  } catch (err: any) {
    console.error("[website-qa] error:", err.message);
  }

  const weights: Record<string, number> = {
    hasPhone: 3,
    hasEmail: 1,
    hasContactLink: 2,
    hasBookingForm: 3,
    hasReviewsSection: 2,
    hasLocalSchema: 2,
    hasMetaDescription: 1,
    hasSSL: 2,
    hasMobileViewport: 2,
  };

  let score = 0;
  let maxScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    maxScore += weight;
    if (checks[key]) score += weight;
  }

  return { checks, score, maxScore };
}

/* ─── Trade Context for AI ─── */
function getTradeContext(trade: string, city: string): {
  avgJobValue: number;
  keyServices: string[];
  seasonalNotes: string;
  urgencyKeywords: string[];
} {
  const contexts: Record<string, any> = {
    plumbing: {
      avgJobValue: 280,
      keyServices: ["drain cleaning", "emergency repairs", "water heater", "pipe repair", "sewer line"],
      seasonalNotes: "Frozen pipe emergencies peak Jan-Feb.",
      urgencyKeywords: ["emergency plumbing", "burst pipe", "24 hour plumber", "drain backup"],
    },
    electrical: {
      avgJobValue: 320,
      keyServices: ["panel upgrades", "outlet installation", "lighting", "EV charger", "emergency electrical"],
      seasonalNotes: "Permit work peaks spring/fall.",
      urgencyKeywords: ["emergency electrician", "power outage", "electrical repair"],
    },
    hvac: {
      avgJobValue: 450,
      keyServices: ["furnace repair", "AC installation", "heat pump", "duct cleaning", "maintenance contracts"],
      seasonalNotes: "AC peaks June-Aug, heating peaks Oct-Dec.",
      urgencyKeywords: ["emergency HVAC", "furnace repair", "no heat", "AC not working"],
    },
    cleaning: {
      avgJobValue: 180,
      keyServices: ["window cleaning", "pressure washing", "gutter cleaning", "commercial cleaning", "post-construction"],
      seasonalNotes: "Spring cleaning peaks March-May.",
      urgencyKeywords: ["window cleaning", "cleaning service", "commercial cleaner"],
    },
    roofing: {
      avgJobValue: 8000,
      keyServices: ["roof replacement", "leak repair", "shingle repair", "emergency tarping", "inspection"],
      seasonalNotes: "Peak April-Oct. Storm damage drives urgency.",
      urgencyKeywords: ["emergency roof repair", "roof leak", "storm damage"],
    },
    landscaping: {
      avgJobValue: 250,
      keyServices: ["lawn maintenance", "snow removal", "interlocking", "tree service", "spring cleanup"],
      seasonalNotes: "Lawn April-Oct, snow Nov-March.",
      urgencyKeywords: ["landscaping", "lawn care", "snow removal"],
    },
    general: {
      avgJobValue: 350,
      keyServices: ["repairs", "maintenance", "installations", "renovations"],
      seasonalNotes: "Year-round demand.",
      urgencyKeywords: ["handyman", "repairs", "home services"],
    },
  };
  return contexts[trade] || contexts.general;
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
    const forceRefresh = req.body?.forceRefresh === true;
    if (business.placeId && !forceRefresh) {
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

    // ─── Enrich business from Google Places if missing key fields ───
    if (business.placeId && (!business.hours || !business.hours.length || !business.types || !business.types.length)) {
      const gmKey = process.env.GOOGLE_MAPS_API_KEY;
      if (gmKey) {
        try {
          const detailFields = "opening_hours/weekday_text,types,formatted_address,address_components,formatted_phone_number,website,name,photos/photo_reference";
          const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(business.placeId)}&fields=${encodeURIComponent(detailFields)}&key=${encodeURIComponent(gmKey)}`;
          const detailResp = await fetch(detailUrl);
          const detailData = await detailResp.json();
          const result = (detailData as any)?.result;
          if (result) {
            if (!business.hours || !business.hours.length) {
              business.hours = result?.opening_hours?.weekday_text || [];
            }
            if (!business.types || !business.types.length) {
              business.types = Array.isArray(result.types) ? result.types : [];
            }
            if (!business.formattedAddress && result.formatted_address) {
              business.formattedAddress = result.formatted_address;
            }
            if (!business.addressComponents && result.address_components) {
              business.addressComponents = result.address_components;
            }
            if (!business.phone && result.formatted_phone_number) {
              business.phone = result.formatted_phone_number;
            }
            if (!business.description && result.editorial_summary?.text) {
              business.description = result.editorial_summary.text;
            }
            console.log('[audit] enriched from Places API — hours:', business.hours?.length, 'types:', business.types?.length);
          }
        } catch (err: any) {
          console.error('[audit] Places enrichment failed:', err?.message);
        }
      }
    }

    // Extract city from place details if not provided by client
    const city = String(req.body?.city || "").trim() || extractCity(business);
    console.log("[audit] Resolved city:", JSON.stringify(city));
    // Extract state/province short code for more precise geo queries (e.g. "ON", "CA", "TX")
    const stateCode = (() => {
      const comps = Array.isArray(business.addressComponents) ? business.addressComponents : [];
      const lvl1 = comps.find((c: any) => Array.isArray(c.types) && c.types.includes("administrative_area_level_1"));
      return lvl1?.short_name || null;
    })();

    // Detect trade from business name + types if not provided by client
    const clientTrade = String(req.body?.trade || "").trim();
    let trade = clientTrade && clientTrade !== "general"
      ? clientTrade
      : detectTrade(business.name || "", Array.isArray(business.types) ? business.types : []);
    // Apply user-confirmed trade override from frontend
    const tradeOverride = String(req.body?.tradeOverride || "").trim();
    if (tradeOverride && tradeOverride !== "general") {
      trade = tradeOverride;
      console.log('[trade] using override:', trade);
    }
    console.log("[trade] final:", trade, "for:", business.name);

    const rating = typeof business.rating === "number" ? business.rating : null;
    const reviewsCount = typeof business.reviewsCount === "number" ? business.reviewsCount : 0;
    const website = String(business.website || "");
    const photosLen = Array.isArray(business.photos) ? business.photos.length : 0;
    // mobileScore/desktopScore set after parallel fetch below

    // ─── Infer business niche ───
    const businessNiche = inferBusinessNiche(
      business.name || '',
      Array.isArray(business.types) ? business.types : [],
      business.description || null,
    );
    console.log('[niche] inferred:', JSON.stringify(businessNiche));

    // ─── Build seed keywords (niche-aware) ───
    const seedKeywords = buildNicheKeywords(trade, city, businessNiche, business.name || '');
    console.log('[keywords] niche-aware seeds:', seedKeywords);

    // ─── Run Serper first so we can use its returned keywords as DataForSEO seeds ───
    let serperData: any = null;
    try {
      serperData = await fetchSerperRankings(seedKeywords, website, business.name, city, stateCode || undefined, business.formattedAddress || business.address || undefined);
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
    const [compResult, reviewResult, dataForSEOResult, websiteQaResult] = await Promise.allSettled([
      fetchOutscraperCompetitors(trade, city, business.name, stateCode || undefined),
      (business.placeId && reviewsCount > 0) ? fetchOutscraperReviews(business.placeId) : Promise.resolve(null),
      fetchDataForSEOVolumes(dataForSEOSeeds),
      website ? analyzeWebsiteQuality(website) : Promise.resolve(null),
    ]);
    console.log('[dataforseo] POST-ALLSETTLED status:', dataForSEOResult?.status, 'value type:', typeof (dataForSEOResult as any)?.value);

    // ─── Extract results (null on failure) ───
    const compData = compResult.status === "fulfilled" ? compResult.value : null;
    if (compResult.status === "rejected") console.error("E1 Outscraper competitors failed:", (compResult as any).reason?.message);

    const reviewData = reviewResult.status === "fulfilled" ? reviewResult.value : null;
    if (reviewResult.status === "rejected") console.error("E2 Outscraper reviews failed:", (reviewResult as any).reason?.message);

    const volumeMap = dataForSEOResult.status === "fulfilled" ? dataForSEOResult.value : null;
    if (dataForSEOResult.status === "rejected") console.error("E4 DataForSEO volumes failed:", (dataForSEOResult as any).reason?.message);

    const websiteQaData = websiteQaResult.status === "fulfilled" ? websiteQaResult.value : null;
    if (websiteQaResult.status === "rejected") console.error("Website QA failed:", (websiteQaResult as any).reason?.message);

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

    const normalizeKw = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    if (volumeMap) {
      for (const kw of keywords) {
        const norm = normalizeKw(kw.keyword);
        const vol = volumeMap[norm] ||
          volumeMap[kw.keyword.trim()] ||
          volumeMap[norm.split(' ')[0]];
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
    // Score keyword relevance based on inferred niche
    for (const kw of keywords) {
      kw.relevance = scoreKeywordRelevance(kw.keyword, trade, businessNiche);
    }
    console.log('[keywords] after dedup + relevance:', keywords.map((k: any) => `${k.keyword} (${k.relevance})`));
    if (keywords.length > 0 && volumeMap) {
      console.log('[dataforseo] first keyword lookup attempt:', keywords[0]?.keyword,
        '→', volumeMap[keywords[0]?.keyword?.toLowerCase()?.trim()]);
    }
    const averageCPC = keywords.length > 0 ? +(cpcSum / keywords.length).toFixed(2) : 0;

    // ─── Detect niche misalignment ───
    const highRelevanceKws = keywords.filter((k: any) => k.relevance === 'high');
    const lowRelevanceKws = keywords.filter((k: any) => k.relevance === 'low');
    const hasNicheMisalignment = businessNiche.primary
      && lowRelevanceKws.some((k: any) => k.isInLocalPack || (k.organicRank && k.organicRank <= 5))
      && highRelevanceKws.some((k: any) => !k.isInLocalPack && (!k.organicRank || k.organicRank > 10));

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
      websiteQualityChecks: websiteQaData?.checks || null,
      websiteQualityCheckScore: websiteQaData?.score ?? null,
      businessNiche: businessNiche.primary ? {
        primary: businessNiche.primary,
        secondary: businessNiche.secondary,
        confidence: businessNiche.confidence,
      } : null,
      nicheAlignment: hasNicheMisalignment ? {
        misaligned: true,
        misalignmentPercent: 0, // will be set after scoring
        insight: `Your business appears in searches for "${trade}", but your core offering is more closely aligned with ${businessNiche.primary}. You rank lower for your most relevant service keywords, which means you may be missing higher-intent customers searching for exactly what you offer.`,
      } : null,
    };

    // ─── E6: New scoring engine ───
    const scores = calculateScores(auditData);
    auditData.scores = scores;

    // Enrich nicheAlignment with quantified misalignment from scoring
    if (auditData.nicheAlignment?.misaligned && scores.misalignmentPercent > 0) {
      auditData.nicheAlignment.misalignmentPercent = scores.misalignmentPercent;
      if (scores.misalignmentPercent >= 30) {
        auditData.nicheAlignment.insight += ` About ${scores.misalignmentPercent}% of your current visibility comes from loosely related searches.`;
      }
    }
    // Suppress misalignment insight if the percentage is too low to be meaningful
    if (auditData.nicheAlignment?.misaligned && scores.misalignmentPercent < 15) {
      auditData.nicheAlignment = null;
    }

    // Store presence level and coverage for AI context
    auditData.presenceLevel = scores.presenceLevel;
    auditData.keywordCoverage = scores.keywordCoverage;

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
    const kwList: any[] = auditData.keywords || [];
    const anyLocalPack = kwList.some((k: any) => k.isInLocalPack);
    const majorityNotVisible = kwList.length === 0 ||
      kwList.filter((k: any) => !k.organicRank || k.organicRank > 10).length > kwList.length / 2;
    if (!anyLocalPack && majorityNotVisible) detectedIssues.push("low-visibility");
    if ((auditData.scores?.competitorPositioning?.score || 0) < 8) detectedIssues.push("not-in-maps-pack");
    if ((auditData.scores?.demandCoverage?.score || 0) < 8) detectedIssues.push("no-after-hours");
    if ((auditData.scores?.adOpportunity?.score || 0) < 5) detectedIssues.push("no-ads");
    if (!resolvedSpeedData?.mobile?.score || resolvedSpeedData.mobile.score < 50) detectedIssues.push("slow-website");
    const dedupedIssues = Array.from(new Set(detectedIssues));
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

        const tradeCtx = getTradeContext(trade, city);
        const servicesList = recommendedServices?.map((s: any) => s.name || s.title || s).join(", ") || "";
        const notRankingKeywords = keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(", ") || "None";

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
- Local pack appearances: ${keywords.filter((k: any) => k.isInLocalPack).length} of ${keywords.length}
- Business niche: ${businessNiche.primary || trade} (confidence: ${businessNiche.confidence})
- Keyword coverage: ${scores.keywordCoverage?.percent ?? 0}% (${scores.keywordCoverage?.level ?? 'unknown'}) — ${scores.keywordCoverage?.ranked ?? 0} of ${scores.keywordCoverage?.tested ?? 0} relevant keywords
- Business presence level: ${scores.presenceLevel ?? 'unknown'}${auditData.nicheAlignment?.misaligned ? `\n- ⚠ NICHE MISALIGNMENT: ${scores.misalignmentPercent}% of visibility from loosely related searches` : ''}${scores.presenceLevel === 'strong' ? '\n- ℹ STRONG PRESENCE: Focus recommendations on website conversion, lead capture, and booking friction rather than visibility' : ''}
- Competitor positioning: ${scores.competitorPositioning?.score ?? 0}/15
- Demand coverage: ${scores.demandCoverage?.score ?? 0}/10
- Detected issues: ${JSON.stringify(dedupedIssues)}
- Competitors analyzed: ${competitors.length}
- Market leader reviews: ${compData?.marketLeader?.reviewsCount ?? 'unknown'}
- Business reviews: ${reviewsCount}
- Revenue loss estimate: $${auditData.estimatedRevenueLoss?.low ?? 0}–$${auditData.estimatedRevenueLoss?.high ?? 0}/month

TRADE CONTEXT:
Trade: ${trade}
Average job value: $${tradeCtx.avgJobValue}
Key services: ${tradeCtx.keyServices.join(", ")}
Seasonal notes: ${tradeCtx.seasonalNotes}
High-intent keywords: ${tradeCtx.urgencyKeywords.join(", ")}

HARD RULES:
1. Only recommend services from this list: ${servicesList}
2. Only suggest content pages for keywords NOT ranking: ${notRankingKeywords}
3. Never suggest after-hours service if isOpenEvenings is true
4. Revenue math: use $${tradeCtx.avgJobValue} as job value
5. Every claim must reference data provided above
6. Max 3 action plan items
7. Each item must cite which detectedIssue it fixes

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
  "demandGapInsight": string,
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
  "websiteInsight": string|null,
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
Rules for demandGapInsight: Always provide a string (never null). If demand gaps exist, explain what they mean. If the business has full coverage (open 24hrs, evenings, weekends), say so positively — e.g. "Your 24/7 availability means you're capturing evening and weekend demand that competitors miss."
Rules for websiteInsight: 1-2 sentences. If speed data is available, state the mobile score and what it means for customers (e.g. slow load = they leave). If no speed data, set to null. Never mention WeFixTrades.

Business hours: ${JSON.stringify(auditData.business?.hours || [])}
isOpenEvenings (open past 9pm): ${auditData.isOpenEvenings ?? false}
isOpenWeekends: ${auditData.isOpenWeekends ?? false}

Keywords currently ranking (have organicRank):
${keywords.filter((k: any) => k.organicRank).map((k: any) => `${k.keyword} (#${k.organicRank})`).join(', ') || 'None'}

Keywords NOT ranking (no organicRank):
${keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(', ') || 'None'}

Content gaps should ONLY target: ${keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(', ') || 'None'}

Keywords tracked:
${keywords.map((k: any) => `${k.keyword}: rank ${k.organicRank || 'not ranking'}, local pack ${k.isInLocalPack ? '#' + k.localPackPosition : 'no'}, relevance: ${k.relevance || 'unknown'}, ${k.monthlySearches || 0} searches/mo, $${k.cpc || 0} CPC`).join('\n') || 'No keyword data available'}

Business audit data:
${JSON.stringify(auditData, null, 2)}`;

        const message = await withApiTimeout(
          anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
          90000,
          null as any
        );
        if (!message) {
          console.error("[audit] narrative generation timed out after 90s");
          auditData.narrative = { summary: "", analysis: "", recommendations: [], actionPlan: [], quickWin: null };
        } else {

        const raw = message.content?.[0]?.type === "text" ? message.content[0].text : "";
        console.log("═══ CLAUDE RESPONSE ═══");
        console.log(raw);
        try {
          // Strip markdown fences and any surrounding text, extract JSON object
          let cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
          // If cleaning didn't produce valid JSON start, extract from first { to last }
          if (!cleaned.startsWith("{")) {
            const firstBrace = cleaned.indexOf("{");
            const lastBrace = cleaned.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            }
          }
          const parsed = JSON.parse(cleaned);
          auditData.narrative = parsed;
          console.log("[audit] narrative parsed OK, keys:", Object.keys(parsed));
        } catch (parseErr: any) {
          console.error("[audit] narrative JSON parse failed:", parseErr?.message);
          // Try to salvage truncated JSON by closing open braces/brackets
          try {
            let salvaged = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
            const firstBrace = salvaged.indexOf("{");
            if (firstBrace !== -1) salvaged = salvaged.substring(firstBrace);
            // Count open braces/brackets and close them
            let openBraces = 0, openBrackets = 0;
            let inString = false, escaped = false;
            for (const ch of salvaged) {
              if (escaped) { escaped = false; continue; }
              if (ch === '\\') { escaped = true; continue; }
              if (ch === '"') { inString = !inString; continue; }
              if (inString) continue;
              if (ch === '{') openBraces++;
              if (ch === '}') openBraces--;
              if (ch === '[') openBrackets++;
              if (ch === ']') openBrackets--;
            }
            // Trim trailing incomplete values and close
            salvaged = salvaged.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, "");
            while (openBrackets > 0) { salvaged += "]"; openBrackets--; }
            while (openBraces > 0) { salvaged += "}"; openBraces--; }
            const parsed2 = JSON.parse(salvaged);
            auditData.narrative = parsed2;
            console.log("[audit] narrative salvaged OK, keys:", Object.keys(parsed2));
          } catch {
            auditData.narrative = { summary: raw, analysis: "", recommendations: "" };
          }
        }
        } // close else (message exists)
      }
    } catch (aiErr: any) {
      console.error("AI narrative generation failed:", aiErr?.message);
    }

    // ─── Inject DataForSEO volumes into contentGaps ───
    if (auditData.narrative?.contentGaps && volumeMap) {
      auditData.narrative.contentGaps = auditData.narrative.contentGaps.map((gap: any) => {
        const kw = gap.targetKeyword?.toLowerCase()?.trim();
        const vol = kw ? (volumeMap[kw] || volumeMap[kw?.split(' ')[0]]) : null;
        return {
          ...gap,
          monthlySearches: gap.monthlySearches || vol?.searchVolume || null,
          cpc: gap.cpc || vol?.cpc || null,
        };
      });
      console.log('[audit] contentGaps enriched with volume data');
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
