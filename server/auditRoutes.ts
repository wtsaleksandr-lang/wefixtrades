import type { Request, Response } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import { getServicesForIssues, SERVICES } from "@shared/services";
import { db } from "./db";
import { auditReports } from "@shared/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { chat, getSharedClient, assertCircuitAllowsRequest, recordSuccess, recordFailure } from "./services/aiService";
import {
  auditGenerateRateLimiter,
  auditWriteRateLimiter,
  AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS,
} from "./services/rateLimiter";
import { fetchCompetitors } from "./services/competitorSearch";
import { fetchReviewIntelligence } from "./services/reviewIntelligence";

const router = express.Router();

/** Public audit endpoints are unauthenticated — key the limiter on the
 *  forwarded client IP (Cloudflare/Replit set X-Forwarded-For). */
function getAuditClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    || req.ip
    || req.socket?.remoteAddress
    || "unknown";
}

/* ─── Diagnostic: verify audit router is reachable ─── */
router.get("/ping", (_req: Request, res: Response) => {
  res.json({ ok: true, router: "audit", ts: Date.now() });
});

/* ─── Static-map proxy (rank-grid background) ───
 * Proxies Google Static Maps server-side so the API key never reaches the
 * browser. Powers the real-map background behind the numbered rank pins on the
 * audit report, the /tools rank grid, and MapGuard. An in-memory LRU + a
 * Cache-Control header keep per-render cost down (a repeated business address
 * reuses the cached tile); novel coordinates are rate-limited per IP to blunt
 * cost-abuse. Degrades gracefully — the client falls back to the plain grid if
 * this 4xx/5xx (e.g. before the Static Maps API is enabled on the key). */
type CachedStaticMap = { buf: Buffer; type: string; ts: number };
const STATIC_MAP_CACHE = new Map<string, CachedStaticMap>();
const STATIC_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const STATIC_MAP_MAX = 300;

router.get("/static-map", async (req: Request, res: Response) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "map_unavailable" });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "invalid_coordinates" });
  }
  const zoom = Math.min(20, Math.max(1, Math.round(Number(req.query.zoom) || 12)));
  const w = Math.min(640, Math.max(120, Math.round(Number(req.query.w) || 480)));
  const h = Math.min(640, Math.max(120, Math.round(Number(req.query.h) || 480)));

  const cacheKey = `${lat.toFixed(5)}|${lng.toFixed(5)}|${zoom}|${w}x${h}`;
  const now = Date.now();
  const hit = STATIC_MAP_CACHE.get(cacheKey);
  if (hit && now - hit.ts < STATIC_MAP_TTL_MS) {
    res.set("Content-Type", hit.type);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(hit.buf);
  }

  // Only novel (uncached) coordinates reach Google — rate-limit those per IP.
  const ok = await auditWriteRateLimiter.check(`audit:staticmap:${getAuditClientIp(req)}`);
  if (!ok) return res.status(429).json({ error: "rate_limited" });

  // Low-clutter roadmap so the colored rank pins stay legible on top.
  const style = [
    "feature:poi|visibility:off",
    "feature:transit|visibility:off",
    "feature:road|element:labels|visibility:simplified",
  ]
    .map((s) => `style=${encodeURIComponent(s)}`)
    .join("&");
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
    `&zoom=${zoom}&size=${w}x${h}&scale=2&maptype=roadmap&${style}` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      log.info("[static-map] upstream non-OK", { status: r.status });
      return res.status(502).json({ error: "map_fetch_failed", status: r.status });
    }
    const type = r.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await r.arrayBuffer());
    if (STATIC_MAP_CACHE.size >= STATIC_MAP_MAX) {
      const oldest = STATIC_MAP_CACHE.keys().next().value;
      if (oldest) STATIC_MAP_CACHE.delete(oldest);
    }
    STATIC_MAP_CACHE.set(cacheKey, { buf, type, ts: now });
    res.set("Content-Type", type);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(buf);
  } catch (err) {
    log.error("[static-map] fetch failed", { error: String(err) });
    return res.status(502).json({ error: "map_fetch_failed" });
  }
});

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
    log.info("[cache] failed to load, starting fresh");
  }
  return {};
}

function saveCache(cache: Record<string, any>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.error("[cache] failed to save:", { error: String(err) });
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
  log.info("[cache] saved:", { detail: key });
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
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg =
      data?.error_message || data?.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  // Google APIs return HTTP 200 with error status in JSON body
  if (data?.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    const msg = data.error_message || `Google API error: ${data.status}`;
    log.error("[fetchJson] API status:", { arg0: data.status, arg1: "message:", arg2: data.error_message });
    throw new Error(msg);
  }
  return data;
}

router.post("/search-places", async (req: Request, res: Response) => {
  try {
    const key = requireEnv("GOOGLE_MAPS_API_KEY");

    const query = String(req.body?.query || "").trim();
    if (query.length < 2) return safeJsonError(res, 400, "Query too short");

    const inferredCountry = inferCountryFromRequest(req);

    // Extract optional user coordinates for location bias
    const userLat = typeof req.body?.lat === "number" ? req.body.lat : null;
    const userLng = typeof req.body?.lng === "number" ? req.body.lng : null;
    const userCoords = userLat !== null && userLng !== null ? { lat: userLat, lng: userLng } : null;

    // PRIMARY: Place Autocomplete (New) API.
    // Returns business-only predictions with built-in geographic bias.
    // Cheaper ($2.83/1k sessions) than Text Search ($32/1k requests)
    // and natively excludes cities/regions when types are restricted.
    let predictions = await searchViaAutocomplete(query, key, inferredCountry, userCoords);

    // FALLBACK: Text Search (legacy) if Autocomplete returned nothing.
    if (predictions.length === 0) {
      predictions = await searchViaTextSearch(query, key, inferredCountry, userCoords);
    }

    // Light reranking for ambiguous location queries
    const parsed = parseSearchQuery(query);
    predictions = rerankPredictions(predictions, inferredCountry, parsed);

    const locationHint = buildLocationHint(predictions, parsed, inferredCountry);

    return res.json({ ok: true, predictions: predictions.slice(0, 5), locationHint });
  } catch (e: any) {
    log.error("[search-places] EXCEPTION:", e?.message || e);
    return safeJsonError(res, 500, e?.message || "search-places failed");
  }
});

/** Prediction shape returned to the frontend. */
interface SearchPrediction {
  place_id: string;
  name: string;
  formatted_address: string;
  rating: number | null;
  user_ratings_total: number;
  photoUrl: string | null;
}

/**
 * PRIMARY: Google Place Autocomplete (New).
 * Uses includedPrimaryTypes to return only businesses, regionCode for bias.
 */
async function searchViaAutocomplete(
  query: string, key: string, regionCode: string,
  userCoords?: { lat: number; lng: number } | null,
): Promise<SearchPrediction[]> {
  try {
    const body: Record<string, any> = {
      input: query,
      includedPrimaryTypes: ["establishment"],
      languageCode: "en",
      regionCode: regionCode.toUpperCase(),
      includedRegionCodes: ["ca", "us"],
    };

    // Add location bias: circle around user's detected coordinates (50km radius)
    if (userCoords) {
      body.locationBias = {
        circle: {
          center: { latitude: userCoords.lat, longitude: userCoords.lng },
          radius: 50000.0,
        },
      };
    }

    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      log.error("[search-places] Autocomplete HTTP", { detail: r.status });
      return [];
    }

    const data = await r.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    return suggestions
      .filter((s: any) => s.placePrediction)
      .slice(0, 5)
      .map((s: any) => {
        const p = s.placePrediction;
        return {
          place_id: p.placeId || "",
          name: p.structuredFormat?.mainText?.text || p.text?.text || "",
          formatted_address: p.structuredFormat?.secondaryText?.text || "",
          rating: null,
          user_ratings_total: 0,
          photoUrl: null,
        };
      });
  } catch (err: any) {
    log.error("[search-places] Autocomplete error:", err?.message);
    return [];
  }
}

/**
 * FALLBACK: Google Text Search (legacy).
 * Used when Autocomplete returns no results.
 */
async function searchViaTextSearch(
  query: string, key: string, regionCode: string,
  userCoords?: { lat: number; lng: number } | null,
): Promise<SearchPrediction[]> {
  try {
    const params = new URLSearchParams({
      query, key,
      type: "establishment",
      region: regionCode,
      language: "en",
    });

    // Add location bias using user coordinates (50km radius)
    if (userCoords) {
      params.set("location", `${userCoords.lat},${userCoords.lng}`);
      params.set("radius", "50000");
    }
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
    const data = await r.json();

    if (data?.status !== "OK" && data?.status !== "ZERO_RESULTS") return [];

    let results = Array.isArray(data?.results) ? data.results : [];
    results = filterToBusinesses(results);

    return results.slice(0, 5).map((r: any) => ({
      place_id: r.place_id || "",
      name: r.name || "",
      formatted_address: r.formatted_address || "",
      rating: typeof r.rating === "number" ? r.rating : null,
      user_ratings_total: typeof r.user_ratings_total === "number" ? r.user_ratings_total : 0,
      photoUrl: resolvePhotoUrl(r.photos?.[0]?.photo_reference, key, 400),
    }));
  } catch (err: any) {
    log.error("[search-places] Text Search fallback error:", err?.message);
    return [];
  }
}

/* ─────────────────────────────────────────────
   Search helpers: parsing, ranking, filtering
   ───────────────────────────────────────────── */

/** Common trades/service terms this app targets. */
const SERVICE_TERMS = new Set([
  "plumber", "plumbing", "plumbers",
  "electrician", "electrical", "electricians", "electric",
  "hvac", "heating", "cooling", "furnace", "air conditioning",
  "roofer", "roofing", "roofers",
  "locksmith", "locksmiths",
  "landscaper", "landscaping", "lawn", "lawn care",
  "cleaner", "cleaning", "cleaners", "maid",
  "painter", "painting", "painters",
  "contractor", "contractors", "general contractor",
  "carpenter", "carpentry",
  "flooring", "tiler", "tiling",
  "fencing", "fence",
  "paving", "paver", "driveway",
  "garage door", "garage doors",
  "pest control", "exterminator",
  "tree service", "tree removal", "arborist",
  "handyman", "handymen",
  "appliance repair",
  "window", "windows", "glass",
  "siding", "gutters", "gutter",
  "deck", "decks", "deck builder",
  "demolition", "excavation",
  "concrete", "masonry", "mason",
  "welder", "welding",
  "septic", "drain", "drains", "sewer",
  "insulation",
  "solar", "solar panel",
  "pool", "hot tub",
]);

/**
 * Lightweight list of Canadian cities that clash with same-name cities
 * in the US/UK. Used ONLY for the location hint and light reranking —
 * not as a primary filter (Autocomplete API handles that via regionCode).
 * Keys are in NORMALIZED form (see normalizeForMatch).
 */
const AMBIGUOUS_CA_CITIES: Record<string, string> = {};
const _AMBIGUOUS_SRC: Array<[string, string]> = [
  // Cities that share names with US/UK cities
  ["Hamilton", "ON"], ["London", "ON"], ["Windsor", "ON"], ["Cambridge", "ON"],
  ["Kingston", "ON"], ["Cornwall", "ON"], ["Chatham", "ON"], ["Chatham-Kent", "ON"],
  ["Richmond", "BC"], ["Richmond Hill", "ON"], ["Surrey", "BC"], ["Victoria", "BC"],
  ["Sydney", "NS"], ["Brandon", "MB"], ["Stratford", "ON"], ["Woodstock", "ON"],
  // Cities with tricky name variants (st/saint, accents, hyphens)
  ["St. Catharines", "ON"], ["Saint Catharines", "ON"],
  ["St. John's", "NL"], ["Saint John's", "NL"], ["Saint John", "NB"],
  ["Sault Ste. Marie", "ON"],
  ["Niagara", "ON"], ["Niagara Falls", "ON"],
  ["Montréal", "QC"], ["Montreal", "QC"],
  ["Québec", "QC"], ["Quebec", "QC"],
  ["Trois-Rivières", "QC"], ["Lévis", "QC"],
];
for (const [name, prov] of _AMBIGUOUS_SRC) {
  AMBIGUOUS_CA_CITIES[normalizeForMatch(name)] = prov;
}

/**
 * Normalize a string for fuzzy location matching.
 * Handles: lowercase, periods, hyphens, apostrophes, accents/diacritics,
 * saint↔st, extra whitespace.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics (é→e, è→e)
    .replace(/[.']/g, "")          // strip periods and apostrophes
    .replace(/-/g, " ")            // hyphens to spaces (Chatham-Kent → Chatham Kent)
    .replace(/\bsaint\b/g, "st")   // saint → st (Saint John → St John)
    .replace(/\bste\b/g, "st")     // ste → st (Sault Ste Marie → Sault St Marie)
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim();
}

/**
 * Parse a search query into service and location tokens.
 * "hamilton plumber" => { service: "plumber", location: "hamilton" }
 * "niagara" => { service: null, location: "niagara" }
 * "acme plumbing" => { service: null, location: null } (business name)
 */
function parseSearchQuery(query: string): { service: string | null; location: string | null } {
  const lower = query.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const norm = normalizeForMatch(query);
  const normWords = norm.split(/\s+/);

  let service: string | null = null;
  let location: string | null = null;

  // Check for multi-word service matches first (e.g., "pest control", "tree removal")
  const serviceArr = Array.from(SERVICE_TERMS);
  for (let i = 0; i < serviceArr.length; i++) {
    const term = serviceArr[i];
    if (term.includes(" ") && lower.includes(term)) {
      service = term;
      break;
    }
  }

  // Check single words
  if (!service) {
    for (const word of words) {
      if (SERVICE_TERMS.has(word)) {
        service = word;
        break;
      }
    }
  }

  // Check for known locations against the normalized query.
  // Multi-word locations first (niagara falls, richmond hill), then single-word.
  const knownKeys = Object.keys(AMBIGUOUS_CA_CITIES);
  // Sort longer keys first so "niagara falls" matches before "niagara"
  knownKeys.sort((a, b) => b.length - a.length);

  for (const loc of knownKeys) {
    if (loc.includes(" ") && norm.includes(loc)) {
      location = loc;
      break;
    }
  }
  if (!location) {
    for (const word of normWords) {
      if (AMBIGUOUS_CA_CITIES[word]) {
        location = word;
        break;
      }
    }
  }

  return { service, location };
}

/**
 * Infer the user's country from request headers.
 * Checks common CDN/proxy headers, falls back to "ca" (Canada — target market).
 */
function inferCountryFromRequest(req: Request): string {
  const cfCountry = req.headers["cf-ipcountry"];
  if (cfCountry && typeof cfCountry === "string" && cfCountry.length === 2) {
    return cfCountry.toLowerCase();
  }
  const xCountry = req.headers["x-vercel-ip-country"] || req.headers["x-country"];
  if (xCountry && typeof xCountry === "string" && xCountry.length === 2) {
    return xCountry.toLowerCase();
  }
  const awsCountry = req.headers["cloudfront-viewer-country"];
  if (awsCountry && typeof awsCountry === "string" && awsCountry.length === 2) {
    return awsCountry.toLowerCase();
  }
  return "ca";
}

/**
 * Light reranking for predictions.
 * Autocomplete already handles most relevance via regionCode + establishment type.
 * This only kicks in when the query contains an ambiguous city name — to prefer
 * the Canadian variant over US/UK matches in the rare case Autocomplete returns both.
 */
function rerankPredictions(
  predictions: SearchPrediction[],
  inferredCountry: string,
  parsed: { service: string | null; location: string | null },
): SearchPrediction[] {
  // Only rerank if user typed a known ambiguous city
  if (!parsed.location || predictions.length <= 1) return predictions;

  const province = AMBIGUOUS_CA_CITIES[parsed.location];
  if (!province || inferredCountry !== "ca") return predictions;

  const scored = predictions.map((p) => {
    const addrNorm = normalizeForMatch(p.formatted_address);
    let score = 0;

    // +40: address contains the typed city name
    if (addrNorm.includes(parsed.location!)) score += 40;

    // +15: address contains the expected province
    const provLower = province.toLowerCase();
    if (addrNorm.includes(provLower) || p.formatted_address.toLowerCase().includes(`, ${provLower}`)) {
      score += 15;
    }

    // +10: address contains "canada"
    if (addrNorm.includes("canada")) score += 10;

    // +5: has reviews (indicates real business, not stub)
    if (p.user_ratings_total > 0) score += 5;

    return { prediction: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.prediction);
}

/**
 * Build a user-facing location hint like "Showing businesses near Hamilton, ON".
 * Only shown when a location token is confidently detected AND results contain
 * mixed locations (i.e., ambiguity actually exists).
 */
function buildLocationHint(
  results: SearchPrediction[],
  parsed: { service: string | null; location: string | null },
  inferredCountry: string,
): string | null {
  if (!parsed.location) return null;

  const province = AMBIGUOUS_CA_CITIES[parsed.location];
  if (!province || inferredCountry !== "ca") return null;

  // Only show hint if results contain addresses from different cities
  // (i.e., there's actual ambiguity to resolve)
  const addrs = results.slice(0, 5).map((r) => normalizeForMatch(r.formatted_address));
  const matchCount = addrs.filter((a) => a.includes(parsed.location!)).length;

  // If ALL results match the city, no hint needed — no ambiguity
  if (matchCount === addrs.length && addrs.length > 0) return null;
  // If NO results match, hint isn't useful either
  if (matchCount === 0 && addrs.length > 0) return null;

  // Mixed results — hint helps disambiguate
  const cityName = parsed.location
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `Showing businesses near ${cityName}, ${province}`;
}

/** Non-business Google Places types to filter out. */
const NON_BUSINESS_TYPES = new Set([
  "locality", "sublocality", "sublocality_level_1", "sublocality_level_2",
  "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3",
  "country", "postal_code", "neighborhood", "colloquial_area", "natural_feature",
  "continent", "archipelago", "political", "geocode", "route", "intersection",
  "premise", "subpremise", "street_address", "street_number",
  "floor", "room", "post_box", "postal_town",
  "postal_code_prefix", "postal_code_suffix", "plus_code",
]);

/**
 * Filters Google Places results to keep only actual businesses.
 */
function filterToBusinesses(results: any[]): any[] {
  return results.filter((r) => {
    const types: string[] = Array.isArray(r.types) ? r.types : [];
    if (types.length === 0) return true;
    return types.some((t) => !NON_BUSINESS_TYPES.has(t));
  });
}

router.post("/place-details", async (req: Request, res: Response) => {
  try {
    log.info("[place-details] Called with body keys:", { detail: Object.keys(req.body || {}) });
    const key = requireEnv("GOOGLE_MAPS_API_KEY");
    let placeId = String(req.body?.placeId || "").trim();
    const queryFallback = String(req.body?.query || "").trim();

    // If no placeId provided, try Find Place to resolve it from a text query
    if (!placeId && queryFallback) {
      log.info("[place-details] No placeId, resolving via Find Place:", { detail: queryFallback });
      const fpParams = new URLSearchParams({
        input: queryFallback,
        inputtype: "textquery",
        fields: "place_id",
        locationbias: "ipbias",
        key,
      });
      const fpUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${fpParams}`;
      const fpData = await fetchJson(fpUrl);
      placeId = fpData?.candidates?.[0]?.place_id || "";
      log.info("[place-details] Resolved placeId:", { detail: placeId });
    }

    if (!placeId) {
      log.error("[place-details] ERROR: placeId missing. Full body:", { detail: JSON.stringify(req.body) });
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
          log.info(`[pagespeed] ${s} HTTP ${resp.status}`);
          return null;
        }
        const data = await resp.json();
        const lhr = data?.lighthouseResult;
        const score01 = lhr?.categories?.performance?.score;
        if (score01 == null) { log.info('[pagespeed] no performance data'); return null; }
        const score = Math.round(score01 * 100);
        const audits = lhr?.audits || {};
        const numVal = (k: string) => { const v = audits[k]?.numericValue; return typeof v === "number" ? v : null; };
        // Extract screenshot — prefer full-page (higher res) over final-screenshot
        let screenshotData: string | null = null;
        if (audits?.["full-page-screenshot"]?.details?.screenshot?.data) {
          screenshotData = audits["full-page-screenshot"].details.screenshot.data;
          log.info('[pagespeed] screenshot: from full-page-screenshot, size:', { arg0: Math.round(screenshotData!.length / 1024), arg1: 'KB' });
        } else if (audits?.["final-screenshot"]?.details?.data) {
          screenshotData = audits["final-screenshot"].details.data;
          log.info('[pagespeed] screenshot: from final-screenshot, size:', { arg0: Math.round(screenshotData!.length / 1024), arg1: 'KB' });
        } else if (audits?.["screenshot-thumbnails"]?.details?.items?.length) {
          const items = audits["screenshot-thumbnails"].details.items;
          screenshotData = items[items.length - 1]?.data || null;
          if (screenshotData) log.info('[pagespeed] screenshot: from thumbnails, size:', { arg0: Math.round(screenshotData.length / 1024), arg1: 'KB' });
        }
        if (!screenshotData) {
          log.info('[pagespeed] screenshot: not found in audit keys:', { detail: Object.keys(audits).filter(k => k.includes('screenshot')) });
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
          log.info(`[pagespeed] ${s} timed out after 45s`);
        } else {
          log.info(`[pagespeed] ${s} error:`, err.message);
        }
        return null;
      }
    };

    let result = await attempt();
    if (!result) {
      log.info(`[pagespeed] ${s} retrying after 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      result = await attempt();
    }
    return result;
  };

  if (strategy) return run(strategy);

  const [mobileResult, desktopResult] = await Promise.allSettled([run("mobile"), run("desktop")]);
  const mobile = mobileResult.status === 'fulfilled' ? mobileResult.value : null;
  const desktop = desktopResult.status === 'fulfilled' ? desktopResult.value : null;
  log.info('[pagespeed] mobile score:', { detail: mobile?.score ?? 'null' });
  log.info('[pagespeed] desktop score:', { detail: desktop?.score ?? 'null' });
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
  log.info('[speed-test] starting...');
  const start = Date.now();
  try {
    const result = await fetchPageSpeed('https://example.com', 'mobile');
    const elapsed = Date.now() - start;
    log.info('[speed-test] done in', { arg0: elapsed + 'ms:', arg1: result?.score ?? 'null' });
    return res.json({ ok: true, elapsed, score: result?.score ?? null });
  } catch (err: any) {
    const elapsed = Date.now() - start;
    log.info('[speed-test] error in', { arg0: elapsed + 'ms:', error: err.message });
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
      log.info('[speed-bg] starting for:', { detail: pageSpeedUrl });

      const [mob, desk] = await Promise.allSettled([
        fetchPageSpeed(pageSpeedUrl, 'mobile'),
        fetchPageSpeed(pageSpeedUrl, 'desktop'),
      ]);

      let mobileScore = mob.status === 'fulfilled' ? mob.value : null;
      const desktopScore = desk.status === 'fulfilled' ? desk.value : null;

      if (!mobileScore) {
        log.info('[speed-bg] mobile null, retrying...');
        await new Promise(r => setTimeout(r, 3000));
        mobileScore = await fetchPageSpeed(pageSpeedUrl, 'mobile');
      }

      const speedData = { mobile: mobileScore, desktop: desktopScore };
      log.info('[speed-bg] done — mobile:', { arg0: mobileScore?.score ?? 'null', arg1: 'desktop:', arg2: desktopScore?.score ?? 'null' });

      // Get best available screenshot — desktop full-page first, then from existing speed results
      let screenshotBase64: string | null = desktopScore?.screenshot || mobileScore?.screenshot || null;
      // Try a dedicated desktop screenshot fetch for higher resolution if we don't have full-page
      if (!screenshotBase64 || screenshotBase64.length < 50000) {
        log.info('[speed-bg] attempting high-res screenshot capture...');
        const hqScreenshot = await captureWebsiteScreenshot(pageSpeedUrl);
        if (hqScreenshot && hqScreenshot.length > (screenshotBase64?.length || 0)) {
          screenshotBase64 = hqScreenshot;
        }
      }

      // Run AI analysis on screenshot
      let websiteAIAnalysis: any = null;
      if (screenshotBase64) {
        try {
          const rows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
          const reportData = rows[0]?.audit_data as any;
          const businessName = reportData?.business?.name || "this business";
          const trade = reportData?.trade || "general";
          websiteAIAnalysis = await analyzeScreenshot(screenshotBase64, businessName, trade);
        } catch (e: any) {
          log.error('[speed-bg] screenshot AI failed:', e.message);
        }
      }

      // Strip screenshot from speedData before saving (it can be large)
      const speedDataClean = {
        mobile: mobileScore ? { ...mobileScore, screenshot: undefined } : null,
        desktop: desktopScore ? { ...desktopScore, screenshot: undefined } : null,
      };

      // Merge speedData + screenshot metadata into audit_data
      const mergeData: Record<string, any> = { speedData: speedDataClean };
      if (screenshotBase64) mergeData.websiteScreenshot = screenshotBase64;
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
      // qaMax = 24 (sum of analyzeWebsiteQuality weights); clamp ratio at 1.0 so
      // the QA contribution can never exceed its 8-pt cap. (Mirror of calculateScores.)
      const qaPointsCalc = Math.round(Math.min(qaScoreVal / 24, 1) * 8);

      let aiVisualPts = 0;
      if (websiteAIAnalysis?.findings && Array.isArray(websiteAIAnalysis.findings)) {
        const passCount = websiteAIAnalysis.findings.filter((f: any) => f.status === "pass").length;
        const total = websiteAIAnalysis.findings.length || 1;
        aiVisualPts = Math.round((passCount / total) * 4);
      }

      const newWebsiteScore = Math.min(speedPts + qaPointsCalc + aiVisualPts, 20);
      // Recompute the /100 total by renormalizing over the AVAILABLE categories —
      // the same rule calculateScores uses — instead of additively swapping the
      // website slice. Additive math is wrong once any category is excluded
      // (the old total was already renormalized to a smaller denominator), so
      // we rebuild from the per-category scores + the persisted dataQuality flags.
      const exScores = existingData?.scores || {};
      const exDq = existingData?.dataQuality || {};
      const exKeywordAvailable = exDq.keywordDataAvailable !== false;
      const exCompetitorAvailable = exDq.competitorDataAvailable !== false;
      const totalParts: Array<{ score: number; max: number }> = [
        { score: exScores.googleMaps?.score || 0, max: 25 },
        { score: exScores.demandCoverage?.score || 0, max: 10 },
        // Website now has speed data, so it always counts post-speed.
        { score: newWebsiteScore, max: 20 },
      ];
      if (exKeywordAvailable) {
        totalParts.push({ score: exScores.searchVisibility?.score || 0, max: 20 });
        totalParts.push({ score: exScores.adOpportunity?.score || 0, max: 10 });
      }
      if (exCompetitorAvailable) totalParts.push({ score: exScores.competitorPositioning?.score || 0, max: 15 });
      const earned = totalParts.reduce((sum, p) => sum + p.score, 0);
      const availMax = totalParts.reduce((sum, p) => sum + p.max, 0);
      const newTotal = availMax < 100 && availMax > 0 ? Math.round((earned / availMax) * 100) : earned;

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
      log.info('[speed-bg] recalculated websiteQuality:', { arg0: newWebsiteScore, arg1: '(speed:', arg2: speedPts, arg3: 'qa:', arg4: qaPointsCalc, arg5: 'aiVisual:', arg6: aiVisualPts, arg7: ') total:', arg8: newTotal });

      // ─── Re-derive the slow-website issue from the REAL measurement ───
      // /generate cannot assert slow-website (speed runs here, in the background),
      // so it never adds it. Now that PageSpeed has actually run, decide truthfully:
      // only flag slow-website when the business has a website AND the measured
      // mobile speed is < 50. Strip any stale slow-website too, so a no-website or
      // fast business never ships a false "your site is slow on mobile" claim.
      const hasWebsite = !!existingData?.business?.website;
      const measuredSlow = hasWebsite && typeof mobileVal === "number" && mobileVal < 50;
      const prevIssues: string[] = Array.isArray(existingData?.detectedIssues) ? existingData.detectedIssues : [];
      const nextIssues = prevIssues.filter((iss) => iss !== "slow-website");
      if (measuredSlow) nextIssues.push("slow-website");
      const issuesChanged =
        nextIssues.length !== prevIssues.length ||
        nextIssues.some((iss, i) => iss !== prevIssues[i]);
      if (issuesChanged) {
        const deduped = Array.from(new Set(nextIssues));
        mergeData.detectedIssues = deduped;
        mergeData.recommendedServices = getServicesForIssues(deduped);
        log.info('[speed-bg] re-derived detectedIssues:', { before: prevIssues, after: deduped, measuredSlow });
        // The AI narrative was authored before the real speed was known. If it
        // asserted slow-website but the measurement says otherwise, the prose is
        // now stale. We do NOT regenerate the narrative here (it's an extra LLM
        // round-trip in a background job); the structured detectedIssues/scores —
        // which drive the report's scores, action plan, and chat context — are
        // corrected. Narrative-text regen on speed-land is a tracked follow-up.
        if (!measuredSlow && prevIssues.includes("slow-website")) {
          log.warn('[speed-bg] narrative may still mention slow-website though measurement cleared it — follow-up: regen narrative on speed-land');
        }
      }

      await db.update(auditReports)
        .set({ audit_data: sql`${auditReports.audit_data} || ${JSON.stringify(mergeData)}::jsonb` })
        .where(eq(auditReports.id, reportId));

      log.info('[speed-bg] saved to DB:', reportId);
    } catch (err) {
      log.error('[speed-bg] error:', { error: String(err) });
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
      websiteScreenshot: auditData?.websiteScreenshot || null,
      websiteQualityChecks: auditData?.websiteQualityChecks || null,
      websiteQualityCheckScore: auditData?.websiteQualityCheckScore ?? null,
    });
  } catch (err) {
    log.error('[speed-poll] error:', { error: String(err) });
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

/* ─── E1: Competitor Data — now in server/services/competitorSearch.ts ───
 * fetchCompetitors() (imported above) handles: cache-check → Places primary
 * → Outscraper fallback → cache-write.
 * E2 reviews: fetchReviewIntelligence (imported above) handles the
 * Serper → Outscraper → DataForSEO fallback chain. */

/* ─── E3: SERP Keyword Rankings (multi-provider via Wave 6.5 orchestrator) ─── */
async function fetchSerperRankings(
  keywords: string[], businessDomain: string, businessName: string, city: string,
  stateCode?: string, businessAddress?: string
) {
  const domain = businessDomain.replace(/^https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
  const nameLC = businessName.toLowerCase();
  const businessNameWords = nameLC.split(' ').filter((w: string) => w.length > 3);
  const nameFirstWord = nameLC.split(' ')[0];
  const streetNum = (businessAddress || "").toLowerCase().split(',')[0].trim();
  const locationStr = stateCode ? `${city}, ${stateCode}, Canada` : `${city}, Canada`;
  log.info('[serp] location:', { detail: locationStr });

  const results = await Promise.allSettled(keywords.map(async (kw) => {
    const cacheKey = `serper:${kw.toLowerCase()}:${city.toLowerCase()}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      log.info('[serp] cache hit:', { detail: kw });
      return { keyword: kw, data: cachedData };
    }

    // Run /web (organic + ads) and /maps (local pack) in parallel via
    // the multi-provider orchestrator (Wave 6.5). Returns null on total
    // provider failure rather than throwing.
    let searchResult: Awaited<ReturnType<typeof searchSerp>> | null = null;
    let mapsResult: Awaited<ReturnType<typeof searchSerp>> | null = null;
    try {
      const [s, m] = await Promise.allSettled([
        searchSerp({ query: kw, location: locationStr, country: "ca", language: "en", num: 20, engine: "google_web" }),
        searchSerp({ query: kw, location: locationStr, country: "ca", language: "en", engine: "google_maps" }),
      ]);
      searchResult = s.status === "fulfilled" ? s.value : null;
      mapsResult = m.status === "fulfilled" ? m.value : null;
    } catch (err: any) {
      log.warn('[serp] orchestrator failed for keyword', { keyword: kw, error: err?.message || String(err) });
    }
    const data = {
      organic: (searchResult?.organic ?? []).map((o) => ({
        position: o.position,
        title: o.title,
        link: o.link,
        snippet: o.snippet,
      })),
      ads: (searchResult?.ads ?? []).map((a) => ({
        title: a.title,
        displayedLink: a.displayedLink,
        link: a.link,
      })),
      localResults: (mapsResult?.localPack ?? []).map((p) => ({
        title: p.title,
        rating: p.rating,
        ratingCount: p.reviewCount,
        address: p.address,
      })),
    };
    setCached(cacheKey, data);
    log.info('[serp] cached:', { arg0: kw, arg1: '— organic:', arg2: data.organic.length, arg3: 'local:', arg4: data.localResults.length });
    return { keyword: kw, data };
  }));
  log.info('[serper] cache stats:', { arg0: Object.keys(loadCache()).length, arg1: 'entries cached' });

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
    log.info('[serper] local pack:', { arg0: isInLocalPack, arg1: 'position:', arg2: localPackPosition, arg3: 'of', arg4: localResults.length, arg5: 'results' });

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
    log.info('[dataforseo] cache hit');
    return dfsCached;
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  log.info('[dataforseo] login:', { detail: login ? 'SET' : 'MISSING' });
  log.info('[dataforseo] password:', { detail: password ? 'SET' : 'MISSING' });
  if (!login || !password) {
    log.info('[dataforseo] SKIPPING — credentials not set');
    return null;
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const { signal: e4Signal, clear: e4Clear } = withSignal(15000);
  let data: any;
  try {
    log.info('[dataforseo] STARTING call with', { arg0: keywords.length, arg1: 'keywords' });
    const r = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keywords, location_name: "Canada", language_name: "English" }]),
      signal: e4Signal,
    });
    const rawText = await r.text();
    log.info('[dataforseo] raw response:', { detail: rawText.slice(0, 500) });
    data = JSON.parse(rawText);
  } catch (e: any) {
    log.error('[dataforseo] CAUGHT ERROR:', e?.message || e);
    return null;
  } finally {
    e4Clear();
  }
  log.info('[dataforseo] status:', data?.tasks?.[0]?.status_code);
  const results = data?.tasks?.[0]?.result || [];
  log.info('[dataforseo] parsed results count:', results.length);
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
  log.info('[dataforseo] volumeMap keys after build:', { detail: Object.keys(volumeMap) });
  setCached(dfsKey, volumeMap);
  log.info('[dataforseo] cached:', { arg0: Object.keys(volumeMap).length, arg1: 'volume entries' });
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
  log.info("[audit] Using hardcoded demand distribution");

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
export function calculateScores(auditData: any) {
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
  // Sum of all analyzeWebsiteQuality weights (3+1+2+3+2+2+1+2+2+3+3). The prior
  // value of 18 was stale: a perfect QA score is 24, so (24/18)*8 = 10.7 → 11,
  // blowing past the 8-pt component cap. Clamp the ratio at 1.0 as well so this
  // can never exceed the cap even if the weights drift again.
  const qaMax = 24;
  const qaPoints = qaScore !== null ? Math.round(Math.min(qaScore / qaMax, 1) * 8) : 0;

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
  log.info('[scoring] websiteQuality:', { arg0: websiteScore ?? 'null - excluded', arg1: '(speed:', arg2: speedPts, arg3: 'qa:', arg4: qaPoints, arg5: 'aiVisual:', arg6: aiVisualPts, arg7: ')' });

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

  // ─── Score renormalization over AVAILABLE categories ───
  // Generalizes the long-standing websiteScore===null pattern (which divided the
  // 80-pt remainder back up to /100 when website data was absent) to EVERY
  // category whose external source dropped this run. A category whose source is
  // unavailable is excluded from both the earned points and the denominator, so
  // the remaining categories renormalize to /100 instead of the business being
  // penalized to that category's floor. googleMaps + demandCoverage derive from
  // always-present business data, so they are never excluded.
  const dq = auditData.dataQuality || {};
  // Default true preserves prior behavior for any caller/cache without dataQuality.
  const keywordAvailable = dq.keywordDataAvailable !== false;
  const competitorAvailable = dq.competitorDataAvailable !== false;
  const categoryParts: Array<{ score: number; max: number }> = [
    { score: googleMapsScore, max: 25 },
    { score: demandScore, max: 10 },
  ];
  if (websiteScore !== null) categoryParts.push({ score: websiteScore, max: 20 });
  if (keywordAvailable) {
    categoryParts.push({ score: searchVisibilityScore, max: 20 });
    categoryParts.push({ score: adScore, max: 10 });
  }
  if (competitorAvailable) categoryParts.push({ score: competitorScore, max: 15 });
  const earnedPts = categoryParts.reduce((sum, p) => sum + p.score, 0);
  const availableMax = categoryParts.reduce((sum, p) => sum + p.max, 0);
  // Renormalize to /100 whenever the available max is below the full 100 (i.e.
  // any category was excluded); otherwise the raw sum already IS the /100 total.
  const total = availableMax < 100 && availableMax > 0
    ? Math.round((earnedPts / availableMax) * 100)
    : earnedPts;
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
  log.info("[extractCity] addressComponents:", { detail: JSON.stringify(business.addressComponents)?.slice(0, 500) });
  log.info("[extractCity] formattedAddress:", business.formattedAddress || business.address || "(empty)");

  // Try address_components first (most reliable)
  const components = Array.isArray(business.addressComponents) ? business.addressComponents : [];
  for (const comp of components) {
    const types = Array.isArray(comp.types) ? comp.types : [];
    if (types.includes("locality")) {
      log.info("[extractCity] Found locality from addressComponents:", comp.long_name);
      return comp.long_name || "";
    }
  }
  // Fallback: sublocality
  for (const comp of components) {
    const types = Array.isArray(comp.types) ? comp.types : [];
    if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
      log.info("[extractCity] Found sublocality from addressComponents:", comp.long_name);
      return comp.long_name || "";
    }
  }
  // Fallback: parse formatted_address — take the part before province/state code
  const addr = business.formattedAddress || business.address || "";
  // Pattern: "..., City, XX POSTAL, Country" or "..., City, Province, Country"
  const parts = addr.split(",").map((s: string) => s.trim());
  log.info("[extractCity] Address parts:", { detail: JSON.stringify(parts) });
  if (parts.length >= 3) {
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      // Skip if it looks like a province/state code + postal
      if (/^[A-Z]{2}\s/.test(part) || /^\d{5}/.test(part)) continue;
      // Skip country names
      if (/^(canada|united states|usa|us)$/i.test(part)) continue;
      log.info("[extractCity] Extracted city from address string:", part);
      return part;
    }
  }
  // Fallback for "City, ON" or "City, Province" format (2 parts)
  if (parts.length === 2) {
    const firstPart = parts[0];
    // If first part doesn't look like a street address (no numbers at start), use it as city
    if (firstPart && !/^\d/.test(firstPart)) {
      log.info("[extractCity] Extracted city from 2-part address:", firstPart);
      return firstPart;
    }
  }
  log.info("[extractCity] Could not extract city");
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
  log.info(`[detectTrade] businessName: ${businessName}, types: ${JSON.stringify(types)}, haystack: ${haystack}`);

  // Step 1: pattern match on combined haystack (name + types)
  for (const { pattern, trade } of TRADE_PATTERNS) {
    if (pattern.test(haystack)) {
      log.info(`[audit] Detected trade: ${trade} from business name: ${businessName}`);
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

  log.info(`[trade] final: ${trade} for: ${businessName}`);
  return trade;
}

/* ─── Timeout helper for API calls ─── */
function withApiTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => { log.info(`[anthropic] timeout after ${ms}ms`); resolve(fallback); }, ms)
    ),
  ]);
}

/* ─── P1 audit-timeout fix (2026-06-07) ──────────────────────────────────
 * The whole /generate handler MUST finish well under Cloudflare's ~100s edge
 * 524 limit. The gather phase is already bounded (GATHER_DEADLINE_MS=50s), but
 * the Sonnet narrative call had NO timeout: aiService's failover chain (each
 * provider TIMEOUT_MS=30s + retries) could stack 60s+ of AI on top of the 50s
 * gather → ~110-125s → 524, and the tool returned nothing. We now:
 *   1. Bound the narrative chat() with a hard time budget (Promise.race via
 *      withApiTimeout, since ChatOptions has no AbortSignal). On timeout the
 *      race resolves to AI_TIMEOUT_SENTINEL.
 *   2. Cap the AI budget so gather + AI + save stays under HANDLER_DEADLINE_MS.
 *   3. On timeout/empty/error, fall back to a TEMPLATED narrative built from
 *      the already-computed scores + gathered data, so the report still ships
 *      with prose instead of a 524. Real narrative is used whenever it returns
 *      in time. */
const HANDLER_DEADLINE_MS = 80_000; // hard ceiling for the whole /generate handler
const AI_BUDGET_MS = 28_000;        // preferred narrative budget when time allows
const AI_SAVE_RESERVE_MS = 6_000;   // reserve for DB save + JSON response after AI
const AI_MIN_BUDGET_MS = 8_000;     // never give the model less than this if we call it at all
// Distinct sentinel so a genuine empty model reply ("") is not mistaken for a timeout.
const AI_TIMEOUT_SENTINEL = "__AI_TIMEOUT__";

/**
 * Build a usable audit narrative from already-gathered scores/data when the AI
 * call times out or fails. Mirrors the JSON shape the report UI consumes
 * (executiveSummary, grade, keyStrength, competitorWeakness, actionPlan[],
 * quickWin, demandGapInsight). Conservative, data-driven prose — no fabricated
 * numbers; every field falls back to a generic-but-true sentence when its
 * source datum is missing. */
function buildTemplatedNarrative(ctx: {
  businessName: string;
  trade: string;
  city: string;
  scores: any;
  reviewsCount: number;
  rating: number | null;
  hasWebsite: boolean;
  mobileScore: number | null;
  marketLeader: any;
  detectedIssues: string[];
  recommendedServices: any[];
  estimatedRevenueLoss: { low?: number; high?: number } | null;
}): any {
  const { businessName, trade, city, scores, reviewsCount, rating, hasWebsite, mobileScore, marketLeader, detectedIssues, recommendedServices, estimatedRevenueLoss } = ctx;
  const grade = scores?.grade || "C";
  const total = typeof scores?.total === "number" ? scores.total : null;
  const name = businessName || "Your business";

  // Executive summary — score + the single biggest detected gap.
  const summaryParts: string[] = [];
  summaryParts.push(
    total !== null
      ? `${name} scores ${total}/100 (grade ${grade}) for local search performance in ${city || "your area"}.`
      : `Here is your local search performance summary for ${name} in ${city || "your area"}.`
  );
  if (reviewsCount > 0) summaryParts.push(`You currently have ${reviewsCount} Google review${reviewsCount === 1 ? "" : "s"}${rating != null ? ` at a ${rating}★ rating` : ""}.`);
  const biggestGap =
    detectedIssues.includes("no-website") ? "you have no website linked, which costs you trust and conversions from Maps" :
    detectedIssues.includes("low-visibility") ? "you're not visible for most of the searches your customers use" :
    detectedIssues.includes("low-reviews") ? "your review count is behind where it needs to be to win the Maps pack" :
    detectedIssues.includes("slow-website") ? "your website is slow on mobile, where most customers find you" :
    detectedIssues.includes("not-in-maps-pack") ? "you're not consistently appearing in the Google Maps 3-pack" :
    detectedIssues.includes("bad-rating") ? "your average rating is dragging down click-through and ranking" :
    "there are clear opportunities to capture more local demand";
  summaryParts.push(`The biggest opportunity right now: ${biggestGap}.`);
  if (estimatedRevenueLoss && (estimatedRevenueLoss.low || estimatedRevenueLoss.high)) {
    summaryParts.push(`We estimate this is worth roughly $${estimatedRevenueLoss.low ?? 0}–$${estimatedRevenueLoss.high ?? 0}/month in recoverable revenue.`);
  }
  const executiveSummary = summaryParts.join(" ");

  // Grade explanation — score-driven, honest.
  const gradeExplanation =
    grade === "A" ? "You're outperforming most local competitors. The focus now is protecting your lead and converting more of the traffic you already earn." :
    grade === "B" ? "You're in a strong position with a few specific gaps holding you back from the top of the local pack." :
    grade === "C" ? "You have a solid foundation, but several fixable gaps are letting competitors capture demand that should be yours." :
    "There are multiple high-impact gaps. The good news: each one is fixable, and addressing the top few moves your grade quickly.";

  // Key strength — pick the highest-scoring pillar.
  let keyStrength = "";
  const gm = scores?.googleMaps?.score ?? 0;
  if (rating != null && rating >= 4.5 && reviewsCount >= 20) keyStrength = `Your ${rating}★ rating across ${reviewsCount} reviews is a genuine trust signal customers notice.`;
  else if (gm >= 18) keyStrength = "Your Google Business Profile is well-established and gives you a real head start in Maps.";
  else if (scores?.demandCoverage?.score >= 8) keyStrength = "Your availability (evenings/weekends) means you're positioned to capture demand competitors miss.";

  // Competitor weakness / opportunity.
  let competitorWeakness = "";
  if (marketLeader?.name && typeof marketLeader?.reviewsCount === "number") {
    const gap = marketLeader.reviewsCount - (reviewsCount || 0);
    competitorWeakness = gap > 0
      ? `${marketLeader.name} leads with ${marketLeader.reviewsCount} reviews vs your ${reviewsCount || 0} — closing that ${gap}-review gap directly lifts your Maps ranking.`
      : `You're ahead of ${marketLeader.name} on reviews — press that advantage by keeping your profile and content fresh.`;
  }

  // Demand-gap insight (UI always wants a string here).
  const demandGapInsight =
    scores?.demandCoverage?.breakdown?.evenings || scores?.demandCoverage?.breakdown?.weekends
      ? "Your evening/weekend availability means you're capturing after-hours demand many competitors miss."
      : "Extending into evening/weekend coverage (even via call/chat handling) would capture demand you're currently missing.";

  // Action plan — derived from detected issues + recommended services, max 3,
  // HIGH→LOW, at least one free.
  const svcByIssue = (recommendedServices || []).map((s: any) => s?.name || s?.title || String(s)).filter(Boolean);
  const candidates: Array<{ priority: string; title: string; detail: string; estimatedImpact: string }> = [];
  if (detectedIssues.includes("low-reviews") || detectedIssues.includes("bad-rating")) {
    candidates.push({ priority: "HIGH", title: "Win more reviews this month (free)", detail: `Ask your last 20 happy ${trade} customers for a Google review with a one-tap link. More reviews at a high rating is the single biggest lever on Maps ranking and click-through — and it costs nothing.`, estimatedImpact: "Higher Maps ranking + more calls" });
  }
  if (detectedIssues.includes("no-website") || detectedIssues.includes("slow-website")) {
    candidates.push({ priority: "HIGH", title: hasWebsite ? "Fix your mobile site speed" : "Get a fast, simple website live", detail: hasWebsite ? `Most customers reach you on mobile${mobileScore != null ? ` and your mobile speed score is ${mobileScore}/100` : ""}. Every 1-second delay reduces conversions by ~7%. Compress images and trim heavy scripts to recover visitors who leave before contacting you.` : "Without a linked website you lose trust and conversions from your Maps listing. Even a fast 1-page site with your services, area and a call button materially lifts conversions.", estimatedImpact: "15–25% more visitors contact you" });
  }
  if (detectedIssues.includes("low-visibility") || detectedIssues.includes("not-in-maps-pack")) {
    candidates.push({ priority: "MEDIUM", title: "Improve local search visibility", detail: `You're not consistently visible for the searches ${trade} customers in ${city || "your area"} actually use. Tightening your profile categories, services and city-relevant content lifts you into the local pack where the clicks are.`, estimatedImpact: "More local-pack appearances" });
  }
  if (svcByIssue.length && candidates.length < 3) {
    candidates.push({ priority: "LOW", title: "Close remaining gaps", detail: `Based on your audit, ${svcByIssue.slice(0, 3).join(", ")} target the remaining gaps WeFixTrades can fix for you.`, estimatedImpact: "Compounding visibility gains" });
  }
  if (candidates.length === 0) {
    candidates.push({ priority: "HIGH", title: "Keep your profile fresh (free)", detail: `Post updates, add recent photos, and respond to every review. Consistent activity on your Google Business Profile protects and grows your ${trade} visibility in ${city || "your area"}.`, estimatedImpact: "Sustained ranking" });
  }
  const actionPlan = candidates.slice(0, 3);

  const quickWin = {
    action: `Send a review request to your 10 most recent happy ${trade} customers today using a one-tap Google review link.`,
    timeRequired: "15 minutes",
    expectedResult: "Each new 5★ review measurably improves your Maps ranking and the trust customers see first.",
  };

  return {
    grade,
    executiveSummary,
    gradeExplanation,
    keyStrength: keyStrength || null,
    competitorWeakness: competitorWeakness || null,
    demandGapInsight,
    actionPlan,
    quickWin,
    // Marks this as the deterministic fallback (not AI-authored) for debugging.
    _templatedFallback: true,
  };
}

/* ─── High-quality website screenshot via dedicated PageSpeed call ─── */
async function captureWebsiteScreenshot(url: string): Promise<string | null> {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      url, strategy: "desktop", key,
      category: "performance",
    });
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) { log.info("[screenshot-hq] HTTP", { detail: resp.status }); return null; }
    const data = await resp.json();
    const lhr = data?.lighthouseResult;
    const audits = lhr?.audits || {};

    // full-page-screenshot has much higher resolution than final-screenshot
    if (audits?.["full-page-screenshot"]?.details?.screenshot?.data) {
      const img = audits["full-page-screenshot"].details.screenshot.data as string;
      log.info("[screenshot-hq] full-page-screenshot, size:", { arg0: Math.round(img.length / 1024), arg1: "KB" });
      return img;
    }
    // final-screenshot is viewport-sized (better than thumbnails)
    if (audits?.["final-screenshot"]?.details?.data) {
      const img = audits["final-screenshot"].details.data as string;
      log.info("[screenshot-hq] final-screenshot, size:", { arg0: Math.round(img.length / 1024), arg1: "KB" });
      return img;
    }
    log.info("[screenshot-hq] no screenshot in response");
    return null;
  } catch (err: any) {
    log.error("[screenshot-hq] failed:", err.message);
    return null;
  }
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
    assertCircuitAllowsRequest();
    const client = getSharedClient();
    const imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const response = await withApiTimeout(
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageData },
            },
            {
              type: "text",
              text: `You are analyzing a screenshot of ${businessName}'s website (${trade} business).\n\nEvaluate ONLY what is visible in the screenshot. Respond in JSON only:\n{\n  "findings": [\n    {\n      "label": "Phone number visible",\n      "status": "pass|warn|fail",\n      "note": "one short sentence"\n    }\n  ],\n  "summary": "2 sentences max"\n}\n\nCheck these 7 things:\n1. Phone number visible above fold\n2. Clear call-to-action button\n3. Professional appearance\n4. Business name/logo visible\n5. Services mentioned\n6. Instant quote tool or calculator — Look for interactive quote forms, price calculators, cost estimators, or "get a quote" widgets. IMPORTANT: If you see a button like "Get Quote", "Get a Quote", "Free Quote", "Request Quote", or similar, you CANNOT determine from a screenshot alone whether it leads to an instant pricing tool or a simple contact form. In that case use status "warn" and note something like "A quote button is visible, but based on visual examination alone we cannot confirm whether it provides instant pricing or redirects to a contact form." Only use "pass" if you can clearly see an interactive calculator/estimator widget on the page. Only use "fail" if there is NO quote-related button or element visible at all.\n7. Live chat or voice widget (look for chat bubbles, chat icons, "chat with us" widgets, AI assistants, voice call widgets in corners of the page)\n\nStatus: pass=present and good, warn=present but could improve, fail=missing or not visible`,
            },
          ],
        }],
      }),
      15000,
      null as any
    );
    if (!response) { recordFailure(); return null; }
    recordSuccess();
    const textBlock = response.content.find((b: any) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err: any) {
    recordFailure();
    log.error("[screenshot-ai] error:", err.message);
    return null;
  }
}

/* ─── Website Quality Analysis (cheerio) ─── */
export async function analyzeWebsiteQuality(url: string): Promise<{
  checks: Record<string, boolean>;
  score: number;
  maxScore: number;
  // false when the page couldn't be fetched (network error, timeout, or a
  // non-2xx response such as a 403/WAF bot-block). In that case the per-feature
  // `checks` are all-absent NOT because the features are missing but because we
  // never saw the HTML — so the caller must NOT score the website category from
  // this fabricated-zero, and should instead exclude it from the denominator.
  fetchOk: boolean;
  // HTTP status of the fetch attempt (null on network error/timeout). Lets the
  // UI tell "we couldn't reach it" from "it blocked our bot (403)".
  httpStatus: number | null;
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
    hasInstantQuoteTool: false,
    hasLiveChatWidget: false,
  };

  // SSL check (free, instant)
  checks.hasSSL = url.startsWith("https");

  let fetchOk = false;
  let httpStatus: number | null = null;

  try {
    const cleanUrl = (u: string) => {
      try { const p = new URL(u); return p.origin + p.pathname; } catch { return u; }
    };
    const fetchUrl = cleanUrl(url);
    log.info("[website-qa] fetching:", { detail: fetchUrl });

    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WeFixTrades Audit Bot/1.0)" },
    });
    httpStatus = res.status;
    if (!res.ok) {
      // Non-2xx (e.g. 403/429 from a WAF/bot-block, or 5xx). We can't read the
      // real page, so every content check would be a false negative. Bail out
      // with fetchOk=false so the caller excludes the website category instead
      // of fabricating a low score.
      log.warn("[website-qa] non-OK response — treating as unreachable:", { status: res.status, url: fetchUrl });
      throw new Error(`non-OK status ${res.status}`);
    }
    const html = await res.text();
    fetchOk = true;
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
    checks.hasContactLink = $("a").toArray().some((el: any) => {
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
    checks.hasLocalSchema = schemaScripts.some((el: any) => {
      const content = $(el).html() || "";
      return content.includes("LocalBusiness") || content.includes("Organization");
    });

    // Meta description
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    checks.hasMetaDescription = metaDesc.length > 10;

    // Mobile viewport
    checks.hasMobileViewport = $('meta[name="viewport"]').length > 0;

    // Instant quote tool / calculator
    const bodyLower = bodyText.toLowerCase();
    const htmlLower = html.toLowerCase();
    const quoteToolIndicators = [
      // Interactive calculator elements
      $('input[type="range"]').length > 0,
      // Price/cost calculator keywords near form elements
      $('[class*="calculator"], [id*="calculator"], [class*="quote-tool"], [id*="quote-tool"], [class*="estimat"], [id*="estimat"]').length > 0,
      // Instant/online quote language (not just "request a quote" contact forms)
      /instant\s+quote|online\s+quote|price\s+calculator|cost\s+calculator|cost\s+estimat|get\s+your\s+price|calculate\s+your|quote\s+calculator/i.test(bodyText),
    ];
    checks.hasInstantQuoteTool = quoteToolIndicators.some(Boolean);

    // Live chat / voice widget
    const chatWidgetIndicators = [
      // Common chat widget scripts
      /tawk\.to|livechat|intercom|drift|crisp|hubspot.*conversations|zendesk.*chat|tidio|olark|freshchat|smartsupp|chatwoot|jivochat/i.test(htmlLower),
      // Chat widget DOM elements
      $('[class*="chat-widget"], [class*="chatbot"], [class*="live-chat"], [id*="chat-widget"], [id*="livechat"], [class*="chat-bubble"], [id*="tawk"], [id*="intercom"], [class*="drift-"]').length > 0,
      // Voice/call widgets
      $('[class*="call-widget"], [class*="callback"], [id*="callbackwidget"], [class*="click-to-call"]').length > 0,
      /chat\s+with\s+us|live\s+chat|chat\s+now|talk\s+to\s+(us|an?\s+agent)|ai\s+assistant/i.test(bodyText),
    ];
    checks.hasLiveChatWidget = chatWidgetIndicators.some(Boolean);

    log.info("[website-qa] checks:", checks);
  } catch (err: any) {
    log.error("[website-qa] error:", err.message);
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
    hasInstantQuoteTool: 3,
    hasLiveChatWidget: 3,
  };

  let score = 0;
  let maxScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    maxScore += weight;
    if (checks[key]) score += weight;
  }

  return { checks, score, maxScore, fetchOk, httpStatus };
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

    // ─── Rate limit (public, no-login, spends Outscraper/DataForSEO/AI
    //     credits per call) — 5 /generate per IP per 10 min ───
    const auditIp = getAuditClientIp(req);
    const generateOk = await auditGenerateRateLimiter.check(`audit:generate:${auditIp}`);
    if (!generateOk) {
      res.setHeader("Retry-After", String(Math.ceil(AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS / 1000)));
      return res.status(429).json({ ok: false, error: "Too many audit requests from this source. Please try again in a few minutes." });
    }

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
          log.info('[audit] returning cached report:', { arg0: cached.id, arg1: 'age:', arg2: ageMin + 'min' });
          return res.json({ ok: true, report_json: cached.audit_data, reportId: cached.id, fromCache: true });
        }
      } catch (err) {
        log.error('[audit] cache check failed:', { error: String(err) });
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
            log.info('[audit] enriched from Places API — hours:', { arg0: business.hours?.length, arg1: 'types:', arg2: business.types?.length });
          }
        } catch (err: any) {
          log.error('[audit] Places enrichment failed:', err?.message);
        }
      }
    }

    // Extract city from place details if not provided by client
    const city = String(req.body?.city || "").trim() || extractCity(business);
    log.info("[audit] Resolved city:", { detail: JSON.stringify(city) });
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
      log.info('[trade] using override:', { detail: trade });
    }
    log.info("[trade] final:", { arg0: trade, arg1: "for:", arg2: business.name });

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
    log.info('[niche] inferred:', { detail: JSON.stringify(businessNiche) });

    // ─── Build seed keywords (niche-aware) ───
    const seedKeywords = buildNicheKeywords(trade, city, businessNiche, business.name || '');
    log.info('[keywords] niche-aware seeds:', { detail: seedKeywords });

    // Strip query params from website URL before passing to PageSpeed
    const cleanUrl = (url: string) => {
      try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
    };
    const pageSpeedUrl = website ? cleanUrl(website) : "";
    if (pageSpeedUrl !== website) log.info('[pagespeed] cleaned URL:', { detail: pageSpeedUrl });

    // ─── Gather ALL external data concurrently under a hard deadline ───
    // The whole request must finish under the CLIENT's 90s abort (FreeAudit.tsx)
    // and Cloudflare's ~100s edge, AND there is still ~30s of Sonnet narrative
    // + DB save AFTER the gather. So the gather deadline must leave that room:
    // 50s gather + ~30s AI + ~5s save ≈ 85s, comfortably under the 90s client
    // abort (70s here previously pushed worst-case to ~100s+ → orphaned reports
    // saved after the client already showed its timeout error).
    // Phases are independent EXCEPT that DataForSEO (E4) seeds off Serper's (E3)
    // keywords — E4 is chained onto the serper promise but runs alongside
    // competitors (E1), reviews (E2) and website QA. Net gather wall-clock
    // ≈ max(E1, E2, E3+E4, QA) instead of E3 + max(E1,E2,E4,QA).
    // 55s here: E1 worst case = 20s withSignal fetch + 30s poll = 50s; 55s gives
    // 5s margin. Total: 55s gather + ~30s Sonnet + ~5s DB ≈ 90s — just under the
    // 90s client abort and well under the Cloudflare 524 edge ceiling of ~100s.
    const GATHER_DEADLINE_MS = 55000;

    // E3 → E4 chain. fetchSerperRankings swallows its own per-keyword
    // errors and returns null on total failure, so this never rejects in
    // practice; we still wrap E4 so a serper failure falls back to the
    // niche seed keywords for volume lookups.
    const serperPromise: Promise<any> = (async () => {
      try {
        return await fetchSerperRankings(seedKeywords, website, business.name, city, stateCode || undefined, business.formattedAddress || business.address || undefined);
      } catch (e: any) {
        log.warn("E3 Serper rankings failed (degraded source):", { error: e?.message });
        return null;
      }
    })();

    const dataForSEOPromise: Promise<any> = (async () => {
      const sData = await serperPromise;
      const serperKeywords = (sData?.keywords || []).map((k: any) => k.keyword).filter(Boolean);
      const dataForSEOSeeds = serperKeywords.length > 0 ? serperKeywords : seedKeywords;
      log.info('[dataforseo] seeds from serper:', dataForSEOSeeds);
      log.info('[dataforseo] PRE-CALL seeds:', { arg0: dataForSEOSeeds?.length, arg1: dataForSEOSeeds?.[0] });
      return fetchDataForSEOVolumes(dataForSEOSeeds);
    })();

    // Race the full concurrent gather against the deadline. allSettled never
    // rejects, so the deadline is the only way this resolves early — and when
    // it does we fall back to per-phase nulls (partial report). The scoring
    // engine + report tolerate missing competitors/reviews/keywords/speed.
    const gatherAll = Promise.allSettled([
      serperPromise,                                                                  // 0: E3 Serper
      fetchCompetitors(trade, city, business.name, stateCode || undefined, getCached, setCached), // 1: E1 competitors (Places primary, Outscraper fallback)
      (business.placeId && reviewsCount > 0) ? fetchReviewIntelligence({ placeId: business.placeId, businessName: business.name, locationLabel: stateCode ? city + ", " + stateCode : city }) : Promise.resolve(null), // 2: E2 reviews (Serper → Outscraper → DataForSEO)
      dataForSEOPromise,                                                              // 3: E4 volumes
      website ? analyzeWebsiteQuality(website) : Promise.resolve(null),               // 4: website QA
    ]);

    let gatherTimedOut = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<null>((resolve) => {
      deadlineTimer = setTimeout(() => { gatherTimedOut = true; resolve(null); }, GATHER_DEADLINE_MS);
    });
    const settled = await Promise.race([gatherAll, deadline]);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (gatherTimedOut || settled === null) {
      log.warn("[audit/generate] data-gathering hit deadline — proceeding with partial data", {
        deadlineMs: GATHER_DEADLINE_MS,
        elapsedMs: Date.now() - startTime,
      });
    }
    const results = settled ?? [];
    const pick = <T,>(i: number): T | null => {
      const r = results[i];
      return r && r.status === "fulfilled" ? (r.value as T) : null;
    };

    // ─── Extract results (null on failure / timeout) ───
    const serperData: any = pick(0);

    const compData = pick<any>(1);
    if (results[1]?.status === "rejected") log.warn("E1 competitors failed (degraded source):", { error: (results[1] as any).reason?.message });

    const reviewData = pick<any>(2);
    if (results[2]?.status === "rejected") log.warn("E2 review intelligence failed (all providers, degraded source):", { error: (results[2] as any).reason?.message });

    const volumeMap = pick<any>(3);
    if (results[3]?.status === "rejected") log.warn("E4 DataForSEO volumes failed (degraded source):", { error: (results[3] as any).reason?.message });
    log.info('[dataforseo] POST-GATHER status:', { arg0: results[3]?.status, arg1: 'value type:', arg2: typeof (results[3] as any)?.value });

    const websiteQaData = pick<any>(4);
    if (results[4]?.status === "rejected") log.error("Website QA failed:", (results[4] as any).reason?.message);

    // ─── Data-quality flags (partial-data integrity) ───
    // Each external source can fail or be cut off by the gather deadline. When a
    // source drops, the categories that depend on it must be EXCLUDED from the
    // /100 denominator (see calculateScores) rather than scored at their floor —
    // otherwise a healthy business that merely had a source fail gets a
    // misleadingly low grade. These flags are persisted on auditData.dataQuality
    // and consumed by calculateScores, the report UI, and the outbound artifact.
    const competitorDataAvailable = !!compData && Array.isArray(compData.competitors) && compData.competitors.length > 0;
    const keywordDataAvailable = !!serperData && Array.isArray(serperData.keywords);
    const reviewDataAvailable = !!reviewData;
    if (!competitorDataAvailable) log.warn("[audit/generate] competitor source unavailable — excluding competitor/ad categories from score");
    if (!keywordDataAvailable) log.warn("[audit/generate] keyword source unavailable — excluding search-visibility category from score");

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
    log.info('[keywords] after dedup + relevance:', keywords.map((k: any) => `${k.keyword} (${k.relevance})`));
    if (keywords.length > 0 && volumeMap) {
      log.info('[dataforseo] first keyword lookup attempt', { keyword: keywords[0]?.keyword, volume: volumeMap[keywords[0]?.keyword?.toLowerCase()?.trim()] });
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
      log.warn("E5 Demand gap failed (degraded source):", { error: err?.message });
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
      // Which external sources actually loaded this run. Drives score
      // renormalization (calculateScores), the missing-data note in the report
      // UI, and the outbound-artifact gate.
      dataQuality: {
        competitorDataAvailable,
        keywordDataAvailable,
        reviewDataAvailable,
        gatherTimedOut,
        // True when the business HAS a website but we couldn't fetch it (network
        // error, timeout, or a WAF/bot-block such as 403). The website category
        // is excluded from the score and the report discloses we couldn't reach it.
        websiteFetchBlocked: !!website && !!websiteQaData && websiteQaData.fetchOk === false,
        websiteFetchHttpStatus: websiteQaData ? (websiteQaData.httpStatus ?? null) : null,
      },
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
      // When the QA fetch failed/was blocked (fetchOk === false), the per-feature
      // checks are fabricated zeros — do NOT feed that score into the website
      // category. Persist it as null (excluded from the denominator) and record
      // the reason so the report can disclose "we couldn't reach your site".
      websiteQualityChecks: websiteQaData?.fetchOk ? (websiteQaData?.checks || null) : null,
      websiteQualityCheckScore: websiteQaData?.fetchOk ? (websiteQaData?.score ?? null) : null,
      websiteFetch: websiteQaData
        ? { ok: !!websiteQaData.fetchOk, httpStatus: websiteQaData.httpStatus ?? null }
        : null,
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
    log.info('[audit] scores at detection:', { detail: JSON.stringify(scores, null, 2) });
    log.info('[audit] business at detection', {
      website: auditData.business?.website,
      reviewsCount: auditData.business?.reviewsCount,
      rating: auditData.business?.rating,
      description: auditData.business?.description
    });
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
    // slow-website can ONLY be asserted once PageSpeed has actually measured the
    // site AND it scored poorly. At this point in /generate, speed runs in the
    // background (/speed job) so resolvedSpeedData is always {mobile:null}, which
    // previously fired this for EVERY business — including ones with no website.
    // The /speed job re-derives slow-website from the real measurement (see below).
    const genMobileSpeed = resolvedSpeedData?.mobile?.score;
    if (auditData.business?.website && typeof genMobileSpeed === "number" && genMobileSpeed < 50) {
      detectedIssues.push("slow-website");
    }
    const dedupedIssues = Array.from(new Set(detectedIssues));
    const recommendedServices = getServicesForIssues(dedupedIssues);
    auditData.detectedIssues = dedupedIssues;
    auditData.recommendedServices = recommendedServices;
    log.info('[audit] FINAL detectedIssues:', auditData.detectedIssues);
    log.info('[audit] scores used:', { detail: JSON.stringify(auditData.scores) });

    // ─── Legacy fields for backward compatibility ───
    const issues: Array<{ title: string; severity: "High" | "Medium"; impact: string; fix: string }> = [];
    if (reviewsCount < 20) issues.push({ title: "Low review count", severity: "High", impact: "Fewer reviews reduces trust and hurts your visibility in Maps.", fix: "Ask recent happy customers for reviews and follow up with a simple link." });
    if (photosLen === 0) issues.push({ title: "No recent photos", severity: "Medium", impact: "Listings with photos get more clicks and calls.", fix: "Upload 10\u201315 high-quality photos (work, team, before/after, exterior)." });
    if (mobileScore !== null && mobileScore < 50) issues.push({ title: "Slow mobile website", severity: "High", impact: "Mobile slowness reduces conversions and can impact search visibility.", fix: "Compress images, remove heavy scripts, and improve Core Web Vitals." });
    if (!website) issues.push({ title: "No website linked", severity: "High", impact: "A website link improves trust and increases conversions from Maps.", fix: "Add a simple 1-page site or link your existing site to the profile." });
    if (rating !== null && rating < 3.5) issues.push({ title: "Low average rating", severity: "High", impact: "Low ratings reduce click-through and ranking performance.", fix: "Reply to all reviews and address recurring complaints in operations." });
    auditData.issues = issues;

    // Log full auditData for debugging
    log.info("═══ AUDIT DATA (before AI) ═══");
    log.info(JSON.stringify(auditData, null, 2));

    // ─── AI Narrative (Anthropic Claude — Part F prompt) ───
    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey) {

        const tradeCtx = getTradeContext(trade, city);
        const servicesList = recommendedServices?.map((s: any) => s.name || s.title || s).join(", ") || "";
        const notRankingKeywords = keywords.filter((k: any) => !k.organicRank).map((k: any) => k.keyword).join(", ") || "None";

        // Lane A2 — the service/price list quoted in customer audit reports is
        // GENERATED from @shared/services (which derives from @shared/pricing).
        // The previous hardcoded list quoted retired/fabricated products and
        // prices (AI ChatLine, AI CallLine, TradeLine Complete, $997 SiteLaunch).
        const serviceCatalogBlock = SERVICES.map(
          (s) => `  * ${s.name} (${s.priceLabel}) — ${s.tagline}. Fixes: ${s.fixesIssues.join(", ")}`
        ).join("\n");

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
- For the actionPlan array, reference the specific WeFixTrades services that fix each issue. This is the COMPLETE catalog — never quote a service name or price that is not in this list:
${serviceCatalogBlock}

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

        // P1 fix (2026-06-07): bound the narrative call so the handler can
        // never blow past Cloudflare's ~100s 524 limit. aiService has no
        // AbortSignal, so we race chat() against a hard time budget. The budget
        // is the smaller of AI_BUDGET_MS and whatever time is left under
        // HANDLER_DEADLINE_MS after reserving AI_SAVE_RESERVE_MS for the DB
        // save + response — so gather + AI + save stays under the ceiling.
        const aiElapsed = Date.now() - startTime;
        // Time left under the hard ceiling once we reserve room for save+response.
        const aiTimeLeftMs = HANDLER_DEADLINE_MS - aiElapsed - AI_SAVE_RESERVE_MS;
        const aiBudgetMs = Math.min(AI_BUDGET_MS, aiTimeLeftMs);
        // If gather already ate most of the ceiling, skip the AI entirely and go
        // straight to the templated narrative — calling it would risk a 524.
        let raw: string;
        if (aiBudgetMs < AI_MIN_BUDGET_MS) {
          log.warn("[audit] insufficient time for narrative AI — skipping to templated fallback", {
            timeLeftMs: aiTimeLeftMs,
            elapsedMs: aiElapsed,
          });
          raw = AI_TIMEOUT_SENTINEL;
        } else {
          log.info("[audit] narrative AI budget", { budgetMs: aiBudgetMs, elapsedMs: aiElapsed });
          raw = await withApiTimeout(
            chat({
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }],
              maxTokens: 4096,
              modelOverride: "claude-sonnet-4-6",
              // audit/ai 2026-05-24: audit narrative generation — gate
              // under wft_audit (same surface as webfixAuditService).
              surface: "wft_audit",
            }).catch((e: any) => {
              // Surface the underlying AI error here (instead of letting it reject
              // the race) so we can deterministically fall back to a templated
              // narrative below rather than throwing past the handler deadline.
              log.warn("[audit] narrative chat() failed — will use templated fallback:", { error: e?.message });
              return AI_TIMEOUT_SENTINEL;
            }),
            aiBudgetMs,
            AI_TIMEOUT_SENTINEL,
          );
        }
        if (raw === AI_TIMEOUT_SENTINEL || !raw) {
          // Timed out or returned empty/errored — ship a templated narrative
          // built from the already-gathered scores/data so the report still
          // has real prose. This is the 524-avoidance path; logged, never silent.
          log.warn("[audit] narrative unavailable in budget — using templated fallback", {
            reason: raw === AI_TIMEOUT_SENTINEL ? "timeout_or_error" : "empty",
            budgetMs: aiBudgetMs,
            elapsedMs: Date.now() - startTime,
          });
          auditData.narrative = buildTemplatedNarrative({
            businessName: business.name || "",
            trade,
            city,
            scores,
            reviewsCount,
            rating,
            hasWebsite: !!website,
            mobileScore,
            marketLeader: compData?.marketLeader || null,
            detectedIssues: dedupedIssues,
            recommendedServices,
            estimatedRevenueLoss: auditData.estimatedRevenueLoss || null,
          });
        } else {
        log.info("═══ CLAUDE RESPONSE ═══");
        log.info(raw);
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
          log.info("[audit] narrative parsed OK, keys:", { detail: Object.keys(parsed) });
        } catch (parseErr: any) {
          log.warn("[audit] narrative JSON parse failed (templated fallback):", { error: parseErr?.message });
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
            log.info("[audit] narrative salvaged OK, keys:", { detail: Object.keys(parsed2) });
          } catch {
            auditData.narrative = { summary: raw, analysis: "", recommendations: "" };
          }
        }
        } // close else (message exists)
      }
    } catch (aiErr: any) {
      log.error("AI narrative generation failed:", aiErr?.message);
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
      log.info('[audit] contentGaps enriched with volume data');
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
      log.info(`[audit] Report saved: ${reportId}`);
    } catch (dbErr: any) {
      log.error("[audit] Failed to save report:", { error: dbErr?.message, err: dbErr });
    }

    const elapsed = Date.now() - startTime;
    log.info(`═══ AUDIT COMPLETE in ${elapsed}ms ═══`);

    log.info('[audit] FINAL detectedIssues:', { detail: detectedIssues });
    log.info('[audit] FINAL recommended:', { detail: recommendedServices?.length || 0 });
    return res.json({ ok: true, report_json: auditData, reportId });
  } catch (e: any) {
    // B4 fix (2026-05-20): the post-deploy QA on 2026-05-20 saw a "Setup
    // might have expired. Please try again." surface on one live audit run.
    // No structured trace existed for the failure path, so reproducibility
    // was impossible. We now log a single structured line on every /generate
    // failure with the elapsed time, the business name (if parsable from the
    // request), the error class + message and a short stack hint so any
    // future repro is one log-line away from a root cause.
    const elapsed = Date.now() - startTime;
    const bizName = (() => { try { return String(req.body?.business?.name ?? ""); } catch { return ""; } })();
    const placeId = (() => { try { return String(req.body?.business?.placeId ?? ""); } catch { return ""; } })();
    log.error("[audit/generate] FAILED", {
      elapsedMs: elapsed,
      businessName: bizName,
      placeId,
      errorClass: e?.constructor?.name ?? typeof e,
      errorMessage: e?.message ?? String(e),
      // First few stack frames only — enough to identify the call site
      // without flooding the log with framework noise.
      stackHead: (e?.stack ?? "").split("\n").slice(0, 4).join(" | "),
    });
    // Don't echo the raw error to the client — an upstream SDK message can
    // embed a credentialed URL. The detailed message is logged above.
    return safeJsonError(res, 500, "We couldn't generate the audit. Please try again.");
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

    // ── Artifact-first buy-signal ───────────────────────────
    // If this report was generated FOR an outbound prospect (artifact-first
    // outreach), a view is the strongest engagement signal in the funnel.
    // Mark it viewed, bump the prospect's priority, and log an event so it
    // surfaces as a hot lead. Best-effort — never blocks the report render.
    try {
      const { prospectEnrichment, prospects: prospectsTbl, prospectEvents } = await import("@shared/schema");
      const [enr] = await db.select().from(prospectEnrichment)
        .where(eq(prospectEnrichment.artifact_ref_id, id)).limit(1);
      if (enr) {
        const firstView = !enr.artifact_viewed_at;
        await db.update(prospectEnrichment).set({
          artifact_view_count: sql`COALESCE(${prospectEnrichment.artifact_view_count}, 0) + 1`,
          artifact_viewed_at: enr.artifact_viewed_at ?? new Date(),
          updated_at: new Date(),
        }).where(eq(prospectEnrichment.id, enr.id));
        if (firstView) {
          await db.update(prospectsTbl).set({
            priority_score: sql`COALESCE(${prospectsTbl.priority_score}, 0) + 25`,
            updated_at: new Date(),
          }).where(eq(prospectsTbl.id, enr.prospect_id));
          await db.insert(prospectEvents).values({
            prospect_id: enr.prospect_id,
            event_type: "artifact_viewed",
            actor_type: "system",
            actor_name: "audit_report_view",
            summary: `Prospect opened their personalized audit report (${id}) — hot lead`,
          });
        }
      }
    } catch (sigErr: any) {
      log.warn("[audit] artifact view-signal hook failed", { error: String(sigErr?.message || sigErr) });
    }

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

/* ─── POST /chat — AI Chat for report (delegates to shared assistant) ─── */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const chatOk = await auditWriteRateLimiter.check(`audit:chat:${getAuditClientIp(req)}`);
    if (!chatOk) {
      res.setHeader("Retry-After", String(Math.ceil(AUDIT_GENERATE_RATE_LIMIT_WINDOW_MS / 1000)));
      return res.status(429).json({ ok: false, error: "Too many requests from this source. Please try again in a few minutes." });
    }

    const { assistantStream, isReady } = await import("./services/assistant");

    const readiness = isReady();
    if (!readiness.ready) return safeJsonError(res, 503, "Chat is temporarily unavailable.");

    const { messages, auditContext, sessionId, reportId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return safeJsonError(res, 400, "messages[] required");
    }

    // Map legacy auditContext shape to the shared format
    const mappedCtx = auditContext ? {
      businessName: auditContext.businessName,
      trade: auditContext.trade,
      city: auditContext.city,
      score: auditContext.score,
      grade: auditContext.grade,
      topIssues: auditContext.topIssue ? [{ title: auditContext.topIssue }] : undefined,
      estimatedRevenueLoss: auditContext.estimatedLoss,
    } : undefined;

    const { stream, onComplete } = await assistantStream({
      surface: "audit",
      messages: messages.slice(-20).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" as const : "user" as const,
        content: String(m.content || ""),
      })),
      sessionId: sessionId || `audit-legacy-${Date.now()}`,
      auditContext: mappedCtx,
      reportId,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullReply = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullReply += event.delta.text;
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
    onComplete(fullReply).catch((err) =>
      log.error("[audit/chat] onComplete failed", { error: String(err) }),
    );
  } catch (e: any) {
    log.error("[audit/chat] Error:", { error: e?.message, err: e });
    if (!res.headersSent) {
      return safeJsonError(res, 500, e?.message || "Chat failed");
    }
    res.end();
  }
});

import { storage } from "./storage";
import { enqueueAuditFollowupSequence } from "./lib/auditFollowup";

const leadRateMap = new Map<string, { count: number; resetAt: number }>();
const LEAD_RATE_WINDOW = 10 * 60 * 1000;
const LEAD_RATE_MAX = 5;

router.post('/save-lead', async (req: Request, res: Response) => {
  try {
    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let rl = leadRateMap.get(ip);
    if (!rl || now > rl.resetAt) { rl = { count: 0, resetAt: now + LEAD_RATE_WINDOW }; leadRateMap.set(ip, rl); }
    rl.count++;
    if (rl.count > LEAD_RATE_MAX) {
      return res.status(429).json({ error: "Too many submissions. Please try again in a few minutes." });
    }

    const { email, name, phone, reportId, businessName, placeId, trade, city, score, issueCount, detectedIssues, recommendedServices, source_tool, source_page } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // 1. Persist to audit_submissions
    const submission = await storage.createAuditSubmission({
      email: email.trim(),
      name: name || null,
      phone: phone || null,
      business_name: businessName || null,
      place_id: placeId || null,
      local_visibility_score: score || null,
      issue_count: issueCount || 0,
      wants_help: false,
      source_tool: source_tool || null,
      source_page: source_page || null,
    });

      // 2. Send PDF email (non-blocking)
      if (reportId) {
        import("./lib/sendAuditReport").then(({ sendAuditReportEmail }) => {
          const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
          sendAuditReportEmail({ reportId, recipientEmail: email.trim(), origin }).catch((err) => {
            log.error("[audit-lead] PDF email error:", { error: err?.message, err });
          });
        });
      }

    // 3. Enqueue follow-up sequence (non-blocking)
    enqueueAuditFollowupSequence({
      auditSubmissionId: submission.id,
      auditReportId: reportId || null,
      email: email.trim(),
      businessName: businessName || "Your Business",
      topIssues: detectedIssues || [],
      score: score || 0,
      trade: trade || "trades",
      city: city || "your area",
      recommendedServices: recommendedServices || [],
    }).catch((err) => {
      log.error("[audit-lead] Followup enqueue error:", { error: err?.message, err });
    });

    log.info("[audit-lead] Saved submission", { arg0: submission.id, arg1: email, arg2: businessName, arg3: score });
    return res.json({ ok: true, submissionId: submission.id });
  } catch (err: any) {
    log.error("[audit-lead] error:", { error: err?.message, err });
    return res.status(500).json({ error: "Failed to save lead" });
  }
});

/* ─── GET /report/:id/og-image — Social sharing preview image ─── */
import { handleOgImage } from "./lib/ogImage";
router.get("/report/:id/og-image", handleOgImage);

/* ─── POST /report/:id/send-email — Email report to recipient ─── */
import { sendAuditReportEmail } from "./lib/sendAuditReport";

// Simple in-memory rate limiter: max 5 emails per IP per 10 minutes
const emailRateMap = new Map<string, { count: number; resetAt: number }>();
const EMAIL_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes
const EMAIL_RATE_MAX = 5;

router.post("/report/:id/send-email", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return safeJsonError(res, 400, "Report ID required");

    const { recipientEmail } = req.body || {};
    if (!recipientEmail || typeof recipientEmail !== "string") {
      return safeJsonError(res, 400, "recipientEmail is required");
    }
    const emailTrimmed = recipientEmail.trim().toLowerCase();
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return safeJsonError(res, 400, "Invalid email address");
    }

    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = emailRateMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + EMAIL_RATE_WINDOW };
      emailRateMap.set(ip, entry);
    }
    entry.count++;
    if (entry.count > EMAIL_RATE_MAX) {
      return safeJsonError(res, 429, "Too many emails sent. Please try again later.");
    }

    const origin = `${req.protocol}://${req.get("host")}`;
    const result = await sendAuditReportEmail({
      reportId: id,
      recipientEmail: emailTrimmed,
      origin,
    });

    if (!result.ok) {
      return safeJsonError(res, result.error === "Report not found" ? 404 : 500, result.error || "Failed to send");
    }

    log.info(`[audit-email] Sent report ${id} to ${emailTrimmed}`);
    return res.json({ ok: true });
  } catch (err: any) {
    log.error("[audit-email] Error:", { error: err?.message, err });
    return safeJsonError(res, 500, "Failed to send email");
  }
});

/* ─── GET /report/:id/pdf — Download PDF ─── */
import { generateReportPdf } from "./lib/pdfGenerator";

router.get("/report/:id/pdf", async (req: Request, res: Response) => {
  log.info(`[audit-pdf] Route matched: ${req.method} ${req.originalUrl}`);

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "Report ID required" });
    }

    log.info(`[audit-pdf] Generating PDF for report ${id}`);
    const origin = `${req.protocol}://${req.get("host")}`;
    const result = await generateReportPdf(id, origin);

    if (!result.ok) {
      log.error(`[audit-pdf] Generation failed for ${id}: ${result.error}`);
      const status = result.error === "Report not found" ? 404 : 500;
      return res.status(status).json({ ok: false, error: result.error });
    }

    // Final safety: verify the buffer is actual PDF bytes
    const sig = result.buffer.slice(0, 5).toString("ascii");
    if (sig !== "%PDF-") {
      log.error(`[audit-pdf] CRITICAL: buffer is not PDF! sig="${sig}", len=${result.buffer.length}`);
      return res.status(500).json({ ok: false, error: "Generated content is not a valid PDF" });
    }

    log.info(`[audit-pdf] Sending ${result.buffer.length} bytes, sig="${sig}", file="${result.filename}"`);

    const inline = req.query.inline === "true";
    const disposition = inline ? "inline" : "attachment";

    // Use res.status().set().end() chain — avoid writeHead which can conflict with Express
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.length),
        "Cache-Control": "private, no-transform, max-age=300",
      })
      .end(result.buffer);
  } catch (err: any) {
    log.error("[audit-pdf] Unhandled error", { error: err?.message, stack: String(err?.stack?.slice(0, 300)) });
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "PDF generation failed" });
    }
  }
});

/* ─── GET /report/:id/rankflow-recommendation ─── */
import { recommendRankFlowTier } from "./services/rankflow/auditConversion";
import { createLogger } from "./lib/logger";
import { searchSerp } from "./lib/serpOrchestrator";

const log = createLogger("AuditRoutes");

router.get("/report/:id/rankflow-recommendation", async (req: Request, res: Response) => {
  try {
    const reportId = String(req.params.id);
    const [report] = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const auditData = report.audit_data as any;
    const recommendation = recommendRankFlowTier({
      scores: auditData?.scores,
      detectedIssues: auditData?.detectedIssues,
      business: auditData?.business,
      trade: auditData?.trade,
      city: auditData?.city,
      keywords: auditData?.keywords,
    });

    res.json(recommendation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
