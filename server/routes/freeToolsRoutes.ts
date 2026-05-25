/**
 * Free Tools — Wave 1 (BrightLocal-style public SEO tools).
 *
 * Adds four standalone public tools, each on its own /tools/* URL with a
 * single POST/GET endpoint here. All four are deliberately stand-alone
 * (no auth, no audit-report dependency, no DB writes) so they can be
 * crawled, indexed, and used as zero-friction lead magnets.
 *
 *   POST /api/tools/google-review-link
 *     body  { businessName, city }
 *     → { ok, placeId, reviewUrl, qrUrl, name, formattedAddress }
 *
 *   POST /api/tools/local-search-checker
 *     body  { keyword, location }
 *     → { ok, organic[], localPack[], gl, hl, location }
 *
 *   POST /api/tools/citation-checker
 *     body  { businessName, city, phone? }
 *     → { ok, results: [{ source, label, status, url? }] }
 *
 *   GET  /api/tools/local-rankflux
 *     → { ok, volatility: "HIGH"|"MEDIUM"|"LOW", score: number, last7d[], updatedAt }
 *
 *   POST /api/tools/local-rank-grid
 *     body  { businessName, city, keyword }
 *     → { ok, gridPoints: [{ lat, lng, rank, mapRank }], summary, center }
 *
 * Rate limit: shared with the existing /api/audit/* tab tools — 20 req /
 * hour / IP per tool. Implemented in-memory; not horizontally safe but
 * fine for the single-instance Replit deploy. Rotation of historical
 * rankflux data is P2 (see Rankflux page docstring).
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { rankfluxSubscriptions } from "@shared/schemas/rankfluxSubscriptions";
import { sql } from "drizzle-orm";
import { queueEmail } from "../services/emailQueueService";
import { searchSerp } from "../lib/serpOrchestrator";

const log = createLogger("free-tools");

/* ─── Rate limiting (per-tool, in-memory) ─────────────────────────────── */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 20;

function rateOk(tool: string, req: Request, res: Response): boolean {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const key = `${tool}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > RATE_MAX) {
    res.status(429).json({
      ok: false,
      error: "Too many requests — try again in an hour.",
      resetIn: Math.ceil((b.resetAt - now) / 1000),
    });
    return false;
  }
  return true;
}

/**
 * Per-minute bucket — used by Wave 6E/6F surfaces (Local SERP Checker, Local
 * Rank Tracker) where the user is actively comparing engines/locations and
 * the hourly bucket would feel artificially tight. 10 req / minute / IP per
 * tool. Same in-memory shape as `rateOk`, just a 60-second window.
 */
const minuteBuckets = new Map<string, Bucket>();
const RATE_MINUTE_WINDOW_MS = 60 * 1000;
const RATE_MINUTE_MAX = 10;

function rateOkPerMinute(tool: string, req: Request, res: Response): boolean {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const key = `${tool}:${ip}`;
  const now = Date.now();
  let b = minuteBuckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_MINUTE_WINDOW_MS };
    minuteBuckets.set(key, b);
  }
  b.count++;
  if (b.count > RATE_MINUTE_MAX) {
    res.status(429).json({
      ok: false,
      error: "Too many requests — please wait a moment and try again.",
      resetIn: Math.ceil((b.resetAt - now) / 1000),
    });
    return false;
  }
  return true;
}

/* ─── Shared helpers ──────────────────────────────────────────────────── */

function fetchJson(url: string, init: RequestInit, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

function strField(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/* ─── 1. Google Review Link Generator ─────────────────────────────────── */

async function googleReviewLinkHandler(req: Request, res: Response) {
  if (!rateOk("review-link", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const city = strField(req.body?.city, 80);
  if (!businessName) {
    return res.status(400).json({ ok: false, error: "Missing businessName." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "Google Places API not configured." });
  }

  // findPlaceFromText — cheapest Place ID lookup. We pass `place_id,name,
  // formatted_address` as fields so the response stays in the lowest
  // billing SKU tier.
  const queryText = city ? `${businessName} ${city}` : businessName;
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", queryText);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id,name,formatted_address");
  url.searchParams.set("key", apiKey);

  try {
    const data = await fetchJson(url.toString(), { method: "GET" });
    const cand = Array.isArray(data?.candidates) && data.candidates.length ? data.candidates[0] : null;
    if (!cand?.place_id) {
      return res.status(404).json({ ok: false, error: "No Google Business Profile found for that name + city." });
    }
    const placeId: string = cand.place_id;
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(reviewUrl)}&size=300x300`;
    return res.json({
      ok: true,
      placeId,
      reviewUrl,
      qrUrl,
      name: cand.name || businessName,
      formattedAddress: cand.formatted_address || null,
    });
  } catch (err: any) {
    log.warn("[review-link] places lookup failed:", { error: err?.message || String(err) });
    return res.status(502).json({ ok: false, error: "Google Places lookup failed. Please try again." });
  }
}

/* ─── 2. Local Search Results Checker (Serper) ────────────────────────── */

async function localSearchCheckerHandler(req: Request, res: Response) {
  if (!rateOk("local-search", req, res)) return;
  const keyword = strField(req.body?.keyword, 120);
  const location = strField(req.body?.location, 120);
  if (!keyword || !location) {
    return res.status(400).json({ ok: false, error: "Both keyword and location are required." });
  }

  try {
    // /web + /maps via the multi-provider orchestrator (Wave 6.5). Same
    // dual-call shape — orchestrator picks the best free-tier provider
    // available for each engine.
    const [searchResp, mapsResp] = await Promise.allSettled([
      searchSerp({ query: keyword, location, country: "us", language: "en", num: 20, engine: "google_web" }),
      searchSerp({ query: keyword, location, country: "us", language: "en", engine: "google_maps" }),
    ]);
    const search = searchResp.status === "fulfilled" ? searchResp.value : null;
    const maps = mapsResp.status === "fulfilled" ? mapsResp.value : null;
    if (!search && !maps) {
      log.warn("[local-search] all serp providers failed");
      return res.status(502).json({ ok: false, error: "Search check failed. Please try again." });
    }
    const organic = search?.organic
      ? search.organic.slice(0, 10).map((o, i: number) => ({
          rank: o.position ?? i + 1,
          title: o.title || "",
          url: o.link || "",
          snippet: o.snippet || "",
          domain: (() => {
            try {
              return new URL(o.link).hostname.replace(/^www\./, "");
            } catch {
              return "";
            }
          })(),
        }))
      : [];
    const localPack = maps?.localPack
      ? maps.localPack.slice(0, 10).map((p, i: number) => ({
          rank: i + 1,
          name: p.title || "",
          address: p.address || "",
          rating: p.rating ?? null,
          reviewsCount: p.reviewCount ?? null,
          gbpUrl: p.placeId ? `https://www.google.com/maps?cid=${p.placeId}` : null,
          phone: null,
        }))
      : [];
    return res.json({
      ok: true,
      keyword,
      location,
      gl: "us",
      hl: "en",
      organic,
      localPack,
    });
  } catch (err: any) {
    log.warn("[local-search] serp orchestrator failed:", { error: err?.message || String(err) });
    return res.status(502).json({ ok: false, error: "Search check failed. Please try again." });
  }
}

/* ─── 3. Citation Checker (Serper site: queries) ──────────────────────── */

const CITATION_SOURCES: Array<{ source: string; label: string; domain: string }> = [
  { source: "yelp", label: "Yelp", domain: "yelp.com" },
  { source: "bbb", label: "Better Business Bureau", domain: "bbb.org" },
  { source: "angi", label: "Angi (Angie's List)", domain: "angi.com" },
  { source: "thumbtack", label: "Thumbtack", domain: "thumbtack.com" },
  { source: "yellowpages", label: "YellowPages", domain: "yellowpages.com" },
  { source: "houzz", label: "Houzz", domain: "houzz.com" },
  { source: "homeadvisor", label: "HomeAdvisor", domain: "homeadvisor.com" },
  { source: "mapquest", label: "MapQuest", domain: "mapquest.com" },
  { source: "foursquare", label: "Foursquare", domain: "foursquare.com" },
  { source: "manta", label: "Manta", domain: "manta.com" },
];

async function citationCheckerHandler(req: Request, res: Response) {
  if (!rateOk("citation", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const city = strField(req.body?.city, 80);
  const phone = strField(req.body?.phone, 30);
  if (!businessName) {
    return res.status(400).json({ ok: false, error: "Missing businessName." });
  }

  const checks = CITATION_SOURCES.map(async (src) => {
    // `site:<domain> "<name>" <city>` — phone added only if supplied. We
    // accept the first organic hit on that domain as confirmation; the
    // disclaimer below makes clear this is a quick check, not the full
    // 50+ directory sweep that the paid audit runs.
    const queryParts = [
      `site:${src.domain}`,
      `"${businessName}"`,
      city,
      phone,
    ].filter(Boolean);
    const q = queryParts.join(" ");
    try {
      const result = await searchSerp({ query: q, country: "us", language: "en", num: 5 });
      const hit = result.organic.find((o) => {
        try {
          const host = new URL(o.link).hostname.replace(/^www\./, "");
          return host === src.domain || host.endsWith(`.${src.domain}`);
        } catch {
          return false;
        }
      });
      if (hit) {
        return { source: src.source, label: src.label, status: "found" as const, url: hit.link };
      }
      return { source: src.source, label: src.label, status: "missing" as const };
    } catch {
      return { source: src.source, label: src.label, status: "unable-to-check" as const };
    }
  });

  const results = await Promise.all(checks);
  const foundCount = results.filter((r) => r.status === "found").length;
  return res.json({
    ok: true,
    businessName,
    city,
    results,
    summary: {
      checked: results.length,
      found: foundCount,
      missing: results.length - foundCount,
    },
  });
}

/* ─── 4. Local Rankflux (Wave 6B — real MozCast feed) ────────────────── */

/**
 * Wave 6B — real Google volatility data sourced from Moz's public
 * MozCast feed (https://moz.com/mozcast.rss). MozCast publishes a daily
 * 0–10 algorithm-volatility score that's the de-facto industry standard
 * for "is Google shuffling SERPs today?". We mirror it into our own
 * /tools/local-rankflux surface, expose a daily 7-day window, and let
 * visitors subscribe to email alerts (daily / weekly / urgent-only).
 *
 * Cache: parsed feed is held in-memory for 1 hour so we don't hammer
 * moz.com on every request. The page only refreshes once per hour
 * client-side anyway. Failures degrade to the last-known value.
 */

type MozBand = "LOW" | "MEDIUM" | "HIGH";
interface MozCastDay {
  date: string;        // yyyy-mm-dd (UTC)
  score: number;       // Moz's 0..10 raw value
  scorePct: number;    // 0..100 (= score*10, used for bar heights)
  band: MozBand;
}

let mozCache: { fetchedAt: number; days: MozCastDay[] } | null = null;
const MOZCAST_TTL_MS = 60 * 60 * 1000;

function bandForMoz(score10: number): MozBand {
  // Moz's published rubric: <3 quiet, 3–6 normal, 6–8 active, ≥8 storm.
  if (score10 >= 8) return "HIGH";
  if (score10 >= 3) return "MEDIUM";
  return "LOW";
}

/**
 * Parse MozCast's RSS. Items are 1 per day with a title that contains
 * the day's score (e.g. "MozCast 7.2 - 2026-05-25"). We extract the
 * numeric score with a lightweight regex pass — no XML parser dep.
 * Returns up to 7 most-recent days.
 */
function parseMozCastRss(xml: string): MozCastDay[] {
  // Match <item>…</item> blocks then pull title + pubDate.
  const items: MozCastDay[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch) continue;
    const title = titleMatch[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
    // Title format historically: "MozCast: <score>" or "MozCast <score> - <date>".
    const scoreMatch = title.match(/(\d+(?:\.\d+)?)/);
    if (!scoreMatch) continue;
    const score = parseFloat(scoreMatch[1]);
    if (!isFinite(score)) continue;
    let dateISO: string;
    if (pubMatch) {
      const d = new Date(pubMatch[1].trim());
      dateISO = isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    } else {
      dateISO = new Date().toISOString().slice(0, 10);
    }
    items.push({
      date: dateISO,
      score: Math.max(0, Math.min(10, score)),
      scorePct: Math.max(0, Math.min(100, score * 10)),
      band: bandForMoz(score),
    });
  }
  // Newest first → oldest first for chart display (left = oldest, right = today)
  return items.slice(0, 7).reverse();
}

async function fetchMozCast(): Promise<MozCastDay[] | null> {
  const now = Date.now();
  if (mozCache && now - mozCache.fetchedAt < MOZCAST_TTL_MS) return mozCache.days;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch("https://moz.com/mozcast.rss", {
      signal: controller.signal,
      headers: { "User-Agent": "WeFixTrades/1.0 (Rankflux mirror; +https://wefixtrades.com)" },
    }).finally(() => clearTimeout(timer));
    if (!r.ok) throw new Error(`MozCast HTTP ${r.status}`);
    const xml = await r.text();
    const days = parseMozCastRss(xml);
    if (days.length === 0) throw new Error("MozCast feed returned no items");
    mozCache = { fetchedAt: now, days };
    return days;
  } catch (err: any) {
    log.warn("[rankflux] mozcast fetch failed", { error: err?.message || String(err) });
    return mozCache?.days || null;
  }
}

async function localRankfluxHandler(_req: Request, res: Response) {
  const days = await fetchMozCast();
  if (!days || days.length === 0) {
    return res.status(502).json({ ok: false, error: "Could not reach MozCast — try again shortly." });
  }
  const today = days[days.length - 1];
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    ok: true,
    source: "mozcast",
    sourceUrl: "https://moz.com/mozcast.rss",
    todayScore: today.score,
    todayBand: today.band,
    todayDate: today.date,
    last7d: days,
    updatedAt: new Date().toISOString(),
  });
}

/* ─── 4b. Rankflux subscribe endpoint ─────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function rankfluxSubscribeHandler(req: Request, res: Response) {
  if (!rateOk("rankflux-subscribe", req, res)) return;
  const email = strField(req.body?.email, 200).toLowerCase();
  const daily = req.body?.daily === true;
  const weekly = req.body?.weekly === true;
  const urgent = req.body?.urgent === true;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email." });
  }
  if (!daily && !weekly && !urgent) {
    return res.status(400).json({ ok: false, error: "Pick at least one alert cadence." });
  }
  try {
    // Upsert on the unique email index. If the row exists we update the
    // cadence flags + clear any prior unsubscribe stamp so resubscribing
    // is one form submit.
    await db.execute(sql`
      INSERT INTO rankflux_subscriptions (email, daily, weekly, urgent, source)
      VALUES (${email}, ${daily}, ${weekly}, ${urgent}, 'tools/local-rankflux')
      ON CONFLICT (email) DO UPDATE
      SET daily = EXCLUDED.daily,
          weekly = EXCLUDED.weekly,
          urgent = EXCLUDED.urgent,
          unsubscribed_at = NULL
    `);
    // Best-effort confirmation. If SMTP isn't configured the queue is
    // a no-op — the subscription row still lands so we don't lose the
    // signal.
    try {
      const cadences = [daily && "daily", weekly && "weekly", urgent && "urgent-only"].filter(Boolean).join(", ");
      await queueEmail(
        email,
        "You're subscribed to Local Rankflux alerts",
        `<p>Thanks for subscribing to Local Rankflux alerts. You'll get the following from us:</p>
         <p><strong>${cadences}</strong></p>
         <p>Local Rankflux mirrors Moz's industry-standard MozCast volatility index. The same data feeds MapGuard's per-customer rank-recheck triggers.</p>
         <p>You can unsubscribe anytime from any alert email.</p>`,
        undefined,
        { category: "marketing", source: "rankflux_subscribe" },
      );
    } catch (emailErr: any) {
      log.debug("[rankflux] confirmation email enqueue failed (non-fatal)", { error: emailErr?.message });
    }
    return res.json({ ok: true });
  } catch (err: any) {
    log.warn("[rankflux] subscribe failed", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, error: "Could not save your subscription. Please try again." });
  }
}

// Re-export type for the cron worker.
export type { MozBand, MozCastDay };
export { fetchMozCast };

/* ─── 5. Local Rank Grid (Serper, geo-grid) ───────────────────────────── */

/**
 * Geocode the city via Google Places `findplacefromtext` — same SKU tier
 * we already use in /api/tools/google-review-link, so no incremental
 * billing surprises. We only need lat/lng + formatted_address; the
 * `geometry/location` field is included by default in `findPlace`.
 */
async function geocodeCity(
  city: string,
  apiKey: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", city);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "geometry,formatted_address");
  url.searchParams.set("key", apiKey);
  try {
    const data = await fetchJson(url.toString(), { method: "GET" }, 8000);
    const cand = Array.isArray(data?.candidates) && data.candidates.length ? data.candidates[0] : null;
    const loc = cand?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng, address: cand.formatted_address || city };
  } catch {
    return null;
  }
}

/**
 * 5x5 grid centred on (lat, lng), spread across a ~5km radius. We use a
 * simple "1 degree latitude ≈ 111 km" approximation — accurate enough at
 * city scale and fast enough to compute inline. Longitude is scaled by
 * cos(lat) so the grid stays roughly square at any latitude.
 */
function buildGrid(lat: number, lng: number, radiusKm = 5): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  // 5 evenly spaced steps from -radius to +radius in each axis.
  const steps = [-1, -0.5, 0, 0.5, 1];
  for (const dy of steps) {
    for (const dx of steps) {
      points.push({ lat: lat + dy * latDelta, lng: lng + dx * lngDelta });
    }
  }
  return points;
}

/**
 * Case-insensitive "does this business name appear in this result?"
 * check. We trim non-alphanumerics on both sides so "Joe's Plumbing" vs
 * "Joes Plumbing" still matches.
 */
function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function looseIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return normName(haystack).includes(normName(needle));
}

/**
 * Wave 6A — competitor enrichment cache. The Places `findPlaceFromText`
 * call to resolve a business name → rating/reviewCount is cheap but
 * still bills per call; cache for 6h to avoid hammering Places when the
 * same competitor recurs across grid scans (which they do, a lot).
 */
type PlacesCacheEntry = { fetchedAt: number; data: { rating: number | null; reviewsCount: number | null; address: string | null } };
const placesCache = new Map<string, PlacesCacheEntry>();
const PLACES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function enrichCompetitor(
  name: string,
  city: string,
  apiKey: string,
): Promise<{ rating: number | null; reviewsCount: number | null; address: string | null }> {
  const cacheKey = `${normName(name)}|${normName(city)}`;
  const cached = placesCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < PLACES_CACHE_TTL_MS) {
    return cached.data;
  }
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", `${name} ${city}`);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "rating,user_ratings_total,formatted_address");
  url.searchParams.set("key", apiKey);
  try {
    const data = await fetchJson(url.toString(), { method: "GET" }, 8000);
    const cand = Array.isArray(data?.candidates) && data.candidates.length ? data.candidates[0] : null;
    const result = {
      rating: typeof cand?.rating === "number" ? cand.rating : null,
      reviewsCount: typeof cand?.user_ratings_total === "number" ? cand.user_ratings_total : null,
      address: typeof cand?.formatted_address === "string" ? cand.formatted_address : null,
    };
    placesCache.set(cacheKey, { fetchedAt: now, data: result });
    return result;
  } catch {
    const result = { rating: null, reviewsCount: null, address: null };
    placesCache.set(cacheKey, { fetchedAt: now, data: result });
    return result;
  }
}

async function localRankGridHandler(req: Request, res: Response) {
  if (!rateOk("rank-grid", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const city = strField(req.body?.city, 80);
  const keyword = strField(req.body?.keyword, 120);
  if (!businessName || !city || !keyword) {
    return res.status(400).json({ ok: false, error: "Business name, city, and keyword are all required." });
  }

  const placesKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return res.status(503).json({ ok: false, error: "Geocoding provider not configured." });
  }

  const geo = await geocodeCity(city, placesKey);
  if (!geo) {
    return res.status(404).json({ ok: false, error: "Could not geocode that city. Try \"City, State\"." });
  }

  const grid = buildGrid(geo.lat, geo.lng, 5);

  // 25 parallel searches via the multi-provider orchestrator (Wave 6.5).
  // Each request carries per-point lat/lng — Serper consumes them
  // directly; other providers ignore them and fall back to the city
  // location text. We dual-call web + maps per point (Local Pack rank is
  // what matters for trades; organic rank is the fallback signal).
  //
  // Wave 6A: also retain the top-3 Local Pack results per point so the
  // frontend can render a hover popover ("who's #1/2/3 at this exact
  // lat/lng") and aggregate the most-frequent #1s into a competitor
  // sidebar.
  const points = await Promise.all(
    grid.map(async (pt) => {
      try {
        const [searchResp, mapsResp] = await Promise.allSettled([
          searchSerp({
            query: keyword,
            country: "us",
            language: "en",
            location: city,
            latitude: pt.lat,
            longitude: pt.lng,
            num: 20,
            engine: "google_web",
          }),
          searchSerp({
            query: keyword,
            country: "us",
            language: "en",
            location: city,
            latitude: pt.lat,
            longitude: pt.lng,
            num: 20,
            engine: "google_maps",
          }),
        ]);
        const search = searchResp.status === "fulfilled" ? searchResp.value : null;
        const maps = mapsResp.status === "fulfilled" ? mapsResp.value : null;
        let rank: number | null = null;
        const organic = search?.organic ?? [];
        for (let i = 0; i < organic.length && i < 20; i++) {
          if (looseIncludes(organic[i]?.title || "", businessName)) {
            rank = i + 1;
            break;
          }
        }
        let mapRank: number | null = null;
        const places = maps?.localPack ?? [];
        for (let i = 0; i < places.length && i < 20; i++) {
          if (looseIncludes(places[i]?.title || "", businessName)) {
            mapRank = i + 1;
            break;
          }
        }
        const topResults = places.slice(0, 3).map((p, i: number) => ({
          rank: i + 1,
          name: p.title || "",
          rating: typeof p.rating === "number" ? p.rating : null,
          reviewsCount: typeof p.reviewCount === "number" ? p.reviewCount : null,
        }));
        return { lat: pt.lat, lng: pt.lng, rank, mapRank, topResults };
      } catch {
        return { lat: pt.lat, lng: pt.lng, rank: null as number | null, mapRank: null as number | null, topResults: [] as Array<{ rank: number; name: string; rating: number | null; reviewsCount: number | null }> };
      }
    }),
  );

  // Summary stats — average rank uses whichever signal is stronger per
  // cell (mapRank wins because trades-intent searches resolve in the
  // Local Pack 80%+ of the time). Missing cells excluded from average.
  const effective = points.map((p) => p.mapRank ?? p.rank);
  const found = effective.filter((r): r is number => r != null);
  const avgRank = found.length ? found.reduce((a, b) => a + b, 0) / found.length : null;
  const top3Count = found.filter((r) => r <= 3).length;
  const missedCount = points.length - found.length;

  // Wave 6A — aggregate the most-frequent #1 businesses across all 25
  // grid points to build the "Who's outranking you nearby" sidebar.
  // Skip the searcher's own business; tally each distinct competitor by
  // how many points they own #1; pick the top 3.
  const ownNormName = normName(businessName);
  const firstPlaceTally = new Map<string, { name: string; count: number }>();
  for (const pt of points) {
    const top = pt.topResults[0];
    if (!top || !top.name) continue;
    const key = normName(top.name);
    if (!key || key === ownNormName) continue;
    const prev = firstPlaceTally.get(key);
    if (prev) prev.count += 1;
    else firstPlaceTally.set(key, { name: top.name, count: 1 });
  }
  const topCompetitors = Array.from(firstPlaceTally.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Enrich each competitor name with Google Places rating + review
  // count. The Places lookup is cached for 6h per (name, city) so the
  // typical "scan the same city for the 5th time today" is free.
  const competitors = await Promise.all(
    topCompetitors.map(async (c) => {
      const enrichment = await enrichCompetitor(c.name, city, placesKey);
      return {
        name: c.name,
        wonAtPoints: c.count,
        rating: enrichment.rating,
        reviewsCount: enrichment.reviewsCount,
        address: enrichment.address,
      };
    }),
  );

  return res.json({
    ok: true,
    businessName,
    city,
    keyword,
    center: { lat: geo.lat, lng: geo.lng, address: geo.address },
    gridPoints: points,
    summary: { avgRank, top3Count, missedCount },
    competitors,
  });
}

/* ─── 6. Local SERP Checker (Wave 6E) ──────────────────────────────── */

/**
 * BrightLocal-parity SERP viewer. One query → either organic top-10 (Google
 * Search) or the Local Pack (Google Maps), localized to any country +
 * language + free-form location string. Routes through the Wave 6.5
 * orchestrator so the marginal cost is $0 (Google CSE / Serper / Brave /
 * ScaleSerp / SerpStack free-tier rotation, DataForSEO paid fallback).
 *
 * Body: { query, location, country, language, engine: "search" | "maps" }
 * Response: { ok, organic[], localPack[], provider, cached, totalResults,
 *             engine, country, language }
 */

const ALLOWED_COUNTRIES = new Set([
  "us","gb","ca","au","de","fr","it","es","nl","be",
  "mx","br","in","jp","kr","sg","nz","ie","za","ae",
]);
const ALLOWED_LANGUAGES = new Set([
  "en","es","fr","de","it","pt","nl","ja","ko","zh",
]);

async function localSerpCheckHandler(req: Request, res: Response) {
  if (!rateOkPerMinute("local-serp-check", req, res)) return;
  const query = strField(req.body?.query, 200);
  const location = strField(req.body?.location, 120);
  const countryRaw = strField(req.body?.country, 4).toLowerCase();
  const languageRaw = strField(req.body?.language, 6).toLowerCase();
  const engineRaw = strField(req.body?.engine, 16).toLowerCase();
  if (!query || !location) {
    return res.status(400).json({ ok: false, error: "Both search term and location are required." });
  }
  const country = ALLOWED_COUNTRIES.has(countryRaw) ? countryRaw : "us";
  const language = ALLOWED_LANGUAGES.has(languageRaw) ? languageRaw : "en";
  const engine = engineRaw === "maps" ? "maps" : "search";
  const serpEngine = engine === "maps" ? "google_maps" : "google_web";

  try {
    const result = await searchSerp({
      query,
      location,
      country,
      language,
      engine: serpEngine,
      num: 10,
    });
    const organic = result.organic.slice(0, 10).map((o, i) => ({
      position: o.position ?? i + 1,
      title: o.title || "",
      link: o.link || "",
      snippet: o.snippet || "",
      displayedLink: o.displayedLink || (() => {
        try { return new URL(o.link).hostname.replace(/^www\./, ""); } catch { return ""; }
      })(),
    }));
    const localPack = (result.localPack || []).slice(0, 10).map((p, i) => ({
      position: i + 1,
      title: p.title || "",
      rating: typeof p.rating === "number" ? p.rating : undefined,
      reviewCount: typeof p.reviewCount === "number" ? p.reviewCount : undefined,
      address: p.address || undefined,
    }));
    return res.json({
      ok: true,
      query,
      location,
      country,
      language,
      engine,
      organic,
      localPack,
      provider: result.provider,
      cached: !!result.cached,
      totalResults: result.totalResults,
    });
  } catch (err: any) {
    log.warn("[local-serp-check] orchestrator failed", { error: err?.message || String(err) });
    return res.status(502).json({ ok: false, error: "SERP check failed. Please try again." });
  }
}

/* ─── 7. Local Rank Tracker (Wave 6F) ──────────────────────────────── */

/**
 * Single-business, multi-engine rank checker. Fires 3 parallel SERP queries
 * (Google Web, Brave's Bing-equivalent index, Google Maps Local Pack),
 * fuzzy-matches the business name against each result list, and returns the
 * position + the top 3 competitors above the business on each engine.
 *
 * Body: { businessName, keyword, location }
 * Response: { ok, businessName, keyword, location,
 *             engines: { googleWeb, braveWeb, googleMaps } }
 */

type RankEngineKey = "googleWeb" | "braveWeb" | "googleMaps";
const RANK_ENGINES: Array<{ key: RankEngineKey; serp: "google_web" | "bing_equivalent" | "google_maps" }> = [
  { key: "googleWeb", serp: "google_web" },
  { key: "braveWeb", serp: "bing_equivalent" },
  { key: "googleMaps", serp: "google_maps" },
];

interface RankEngineOutcome {
  position: number | null;
  totalChecked: number;
  competitors: Array<{ position: number; title: string; rating?: number; reviewCount?: number }>;
  provider: string;
  cached: boolean;
  error?: string;
}

async function localRankTrackerHandler(req: Request, res: Response) {
  if (!rateOkPerMinute("local-rank-tracker", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const keyword = strField(req.body?.keyword, 120);
  const location = strField(req.body?.location, 120);
  if (!businessName || !keyword || !location) {
    return res.status(400).json({ ok: false, error: "Business name, keyword, and location are all required." });
  }

  const outcomes = await Promise.all(
    RANK_ENGINES.map(async ({ key, serp }): Promise<[RankEngineKey, RankEngineOutcome]> => {
      try {
        const result = await searchSerp({
          query: keyword,
          location,
          country: "us",
          language: "en",
          engine: serp,
          num: 20,
        });
        // For map engine, use local pack as the ranking source; for web/brave use organic.
        const list = serp === "google_maps"
          ? (result.localPack ?? []).map((p, i) => ({
              position: i + 1,
              title: p.title || "",
              rating: typeof p.rating === "number" ? p.rating : undefined,
              reviewCount: typeof p.reviewCount === "number" ? p.reviewCount : undefined,
            }))
          : result.organic.map((o, i) => ({
              position: o.position ?? i + 1,
              title: o.title || "",
              rating: undefined as number | undefined,
              reviewCount: undefined as number | undefined,
            }));
        const totalChecked = list.length;
        // Fuzzy-match business name against titles using existing
        // `looseIncludes` (lowercases, strips non-alphanumerics).
        let position: number | null = null;
        for (let i = 0; i < list.length; i++) {
          if (looseIncludes(list[i].title, businessName)) {
            position = list[i].position;
            break;
          }
        }
        // Top 3 competitors = first 3 entries ranked above the business
        // (or first 3 overall if the business is not found / below 3).
        const competitorsAbove = position != null
          ? list.filter((row) => row.position < (position ?? 0)).slice(0, 3)
          : list.slice(0, 3);
        return [key, {
          position,
          totalChecked,
          competitors: competitorsAbove,
          provider: result.provider,
          cached: !!result.cached,
        }];
      } catch (err: any) {
        log.debug(`[local-rank-tracker] ${serp} failed`, { error: err?.message || String(err) });
        return [key, {
          position: null,
          totalChecked: 0,
          competitors: [],
          provider: "none",
          cached: false,
          error: err?.message || "engine unavailable",
        }];
      }
    }),
  );

  const engines = Object.fromEntries(outcomes) as Record<RankEngineKey, RankEngineOutcome>;

  // If literally every engine errored we surface 502 — but if any succeeded
  // we return 200 with the partial result so the UI can render what we have.
  const anySuccess = Object.values(engines).some((e) => !e.error);
  if (!anySuccess) {
    return res.status(502).json({ ok: false, error: "All ranking engines failed. Please try again." });
  }

  return res.json({
    ok: true,
    businessName,
    keyword,
    location,
    engines,
  });
}

/* ─── Router registration ─────────────────────────────────────────────── */

export function registerFreeToolsRoutes(app: Express): void {
  app.post("/api/tools/google-review-link", googleReviewLinkHandler);
  app.post("/api/tools/local-search-checker", localSearchCheckerHandler);
  app.post("/api/tools/citation-checker", citationCheckerHandler);
  app.get("/api/tools/local-rankflux", localRankfluxHandler);
  app.post("/api/tools/rankflux-subscribe", rankfluxSubscribeHandler);
  app.post("/api/tools/local-rank-grid", localRankGridHandler);
  // Wave 6E + 6F — BrightLocal-parity SERP Checker + Rank Tracker.
  app.post("/api/tools/local-serp-check", localSerpCheckHandler);
  app.post("/api/tools/local-rank-tracker", localRankTrackerHandler);
}
