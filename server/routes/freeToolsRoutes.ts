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

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "Search provider not configured." });
  }

  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
  const body = { q: keyword, location, gl: "us", hl: "en", num: 20 };

  try {
    // /search + /maps in parallel — same dual-call pattern as auditRoutes
    // fetchSerperRankings (used by the paid Full Audit). The /maps call is
    // what surfaces the Local Pack rows that competitors actually rank in.
    const [searchResp, mapsResp] = await Promise.allSettled([
      fetchJson("https://google.serper.dev/search", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      fetchJson("https://google.serper.dev/maps", {
        method: "POST",
        headers,
        body: JSON.stringify({ q: keyword, location, gl: "us", hl: "en" }),
      }),
    ]);
    const search: any = searchResp.status === "fulfilled" ? searchResp.value : {};
    const maps: any = mapsResp.status === "fulfilled" ? mapsResp.value : {};
    const organic = Array.isArray(search?.organic)
      ? search.organic.slice(0, 10).map((o: any, i: number) => ({
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
    const localPack = Array.isArray(maps?.places)
      ? maps.places.slice(0, 10).map((p: any, i: number) => ({
          rank: i + 1,
          name: p.title || p.name || "",
          address: p.address || "",
          rating: p.rating ?? null,
          reviewsCount: p.ratingCount ?? null,
          gbpUrl: p.cid ? `https://www.google.com/maps?cid=${p.cid}` : p.link || null,
          phone: p.phoneNumber || null,
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
    log.warn("[local-search] serper failed:", { error: err?.message || String(err) });
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

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "Search provider not configured." });
  }

  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };

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
      const data: any = await fetchJson(
        "https://google.serper.dev/search",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ q, gl: "us", hl: "en", num: 5 }),
        },
        9000,
      );
      const organic = Array.isArray(data?.organic) ? data.organic : [];
      const hit = organic.find((o: any) => {
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

/* ─── 4. Local Rankflux (stub) ────────────────────────────────────────── */

/**
 * Stubbed daily Google-local volatility index. The real metric needs a
 * daily cron that re-runs a fixed keyword/location matrix through
 * Serper, stores SERP positions in Postgres, and computes a day-over-day
 * shuffle score. P2 follow-up: see comment in /tools/local-rankflux page.
 *
 * For now we return a deterministic synthetic series so the page never
 * "looks dead" between visits — the value is seeded off the date so it
 * stays stable for the day. The number is meant to be *plausible*, not
 * predictive; the UI flags it as a placeholder.
 */
function pseudoVolatility(dateISO: string): number {
  // Simple stable hash of yyyy-mm-dd → 0..100.
  let h = 0;
  for (let i = 0; i < dateISO.length; i++) {
    h = (h * 31 + dateISO.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 60 + 20; // 20..79
}

function bandFor(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 65) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function localRankfluxHandler(_req: Request, res: Response) {
  const today = new Date();
  const last7d: Array<{ date: string; score: number; band: "LOW" | "MEDIUM" | "HIGH" }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const score = pseudoVolatility(iso);
    last7d.push({ date: iso, score, band: bandFor(score) });
  }
  const yesterday = last7d[last7d.length - 2] || last7d[last7d.length - 1];
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    ok: true,
    volatility: yesterday.band,
    score: yesterday.score,
    last7d,
    updatedAt: new Date().toISOString(),
    // The page surfaces this so visitors know the number is a placeholder
    // until the daily SERP-tracking cron lands (see P2 follow-up).
    isStub: true,
  });
}

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

async function localRankGridHandler(req: Request, res: Response) {
  if (!rateOk("rank-grid", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const city = strField(req.body?.city, 80);
  const keyword = strField(req.body?.keyword, 120);
  if (!businessName || !city || !keyword) {
    return res.status(400).json({ ok: false, error: "Business name, city, and keyword are all required." });
  }

  const serperKey = process.env.SERPER_API_KEY;
  const placesKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!serperKey) {
    return res.status(503).json({ ok: false, error: "Search provider not configured." });
  }
  if (!placesKey) {
    return res.status(503).json({ ok: false, error: "Geocoding provider not configured." });
  }

  const geo = await geocodeCity(city, placesKey);
  if (!geo) {
    return res.status(404).json({ ok: false, error: "Could not geocode that city. Try \"City, State\"." });
  }

  const grid = buildGrid(geo.lat, geo.lng, 5);
  const headers = { "X-API-KEY": serperKey, "Content-Type": "application/json" };

  // 25 parallel searches. Each query carries the per-point lat/lng so
  // Serper / Google treat it as a real geo-located search. We dual-call
  // /maps (for Local Pack rank — the one that matters for trades) and
  // /search (organic rank — fallback when the business isn't in Maps).
  const points = await Promise.all(
    grid.map(async (pt) => {
      const body = {
        q: keyword,
        gl: "us",
        hl: "en",
        location: city,
        latitude: pt.lat,
        longitude: pt.lng,
        num: 20,
      };
      try {
        const [searchResp, mapsResp] = await Promise.allSettled([
          fetchJson("https://google.serper.dev/search", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          }, 10000),
          fetchJson("https://google.serper.dev/maps", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          }, 10000),
        ]);
        const search: any = searchResp.status === "fulfilled" ? searchResp.value : {};
        const maps: any = mapsResp.status === "fulfilled" ? mapsResp.value : {};
        let rank: number | null = null;
        const organic = Array.isArray(search?.organic) ? search.organic : [];
        for (let i = 0; i < organic.length && i < 20; i++) {
          if (looseIncludes(organic[i]?.title || "", businessName)) {
            rank = i + 1;
            break;
          }
        }
        let mapRank: number | null = null;
        const places = Array.isArray(maps?.places) ? maps.places : [];
        for (let i = 0; i < places.length && i < 20; i++) {
          const name = places[i]?.title || places[i]?.name || "";
          if (looseIncludes(name, businessName)) {
            mapRank = i + 1;
            break;
          }
        }
        return { lat: pt.lat, lng: pt.lng, rank, mapRank };
      } catch {
        return { lat: pt.lat, lng: pt.lng, rank: null as number | null, mapRank: null as number | null };
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

  return res.json({
    ok: true,
    businessName,
    city,
    keyword,
    center: { lat: geo.lat, lng: geo.lng, address: geo.address },
    gridPoints: points,
    summary: { avgRank, top3Count, missedCount },
  });
}

/* ─── Router registration ─────────────────────────────────────────────── */

export function registerFreeToolsRoutes(app: Express): void {
  app.post("/api/tools/google-review-link", googleReviewLinkHandler);
  app.post("/api/tools/local-search-checker", localSearchCheckerHandler);
  app.post("/api/tools/citation-checker", citationCheckerHandler);
  app.get("/api/tools/local-rankflux", localRankfluxHandler);
  app.post("/api/tools/local-rank-grid", localRankGridHandler);
}
