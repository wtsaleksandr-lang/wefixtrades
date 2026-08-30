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
 *     → { ok, market, results: [{ id, label, status, listingUrl?, reason? }],
 *         declined: [{ id, name, reason }], summary }
 *     Runs the shared CiteTrack directory registry — real checks against
 *     real directories, three-state (found / confirmed-absent /
 *     could-not-check). Never SERP-inferred. See the handler's docblock.
 *
 *   GET  /api/tools/local-rankflux
 *     → { ok, volatility: "HIGH"|"MEDIUM"|"LOW", score: number, last7d[], updatedAt }
 *
 *   POST /api/tools/local-rank-grid
 *     body  { businessName, city, keyword }
 *     → { ok, gridPoints: [{ lat, lng, rank, mapRank }], summary, center }
 *
 * Rate limit: shared with the existing /api/audit/* tab tools — 20 req /
 * hour / IP per tool (local-rank-grid is tighter, see RANK_GRID_HOURLY_MAX).
 * Implemented in-memory; not horizontally safe but fine for the
 * single-instance Replit deploy. Rotation of historical rankflux data is P2
 * (see Rankflux page docstring).
 *
 * COST: every tool here is PUBLIC and ANONYMOUS, so none of them may pass
 * `allowPaidProviders` to searchSerp(). The orchestrator default-denies
 * pay-as-you-go providers, so these routes are structurally incapable of
 * billing; `npm run check:public-serp-spend` fails the build if that ever
 * changes. When the free pool runs dry the orchestrator throws and the
 * handlers report the result as unchecked — never an estimate.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { rankfluxSubscriptions } from "@shared/schemas/rankfluxSubscriptions";
import { sql } from "drizzle-orm";
import { queueEmail } from "../services/emailQueueService";
import { storage } from "../storage";
import { searchSerp } from "../lib/serpOrchestrator";
import { reserveDailyCalls } from "../lib/publicSerpBudget";
import { deriveCountryFromLocation } from "@shared/locationCountry";
// The free Citation Checker runs the SAME registry the paid CiteTrack
// product runs (#2061). Importing it rather than keeping a second list is
// the whole point: a directory proven unreachable cannot be "checked" by
// the free tool while the paid product declines it.
import {
  CITATION_TRACKER_DIRECTORIES,
  getMonitoredDirectories,
  isDirectoryCheckable,
  type DirectoryDef,
  type ScrapeContext,
} from "../services/citationTracker/directories";
import { chat, NoAIProviderError, validateConfig } from "../services/aiService";

const log = createLogger("free-tools");

/* ─── AI generation config (shared by the GBP + review-response tools) ────
 *
 * Both AI tools route through the canonical multi-provider engine (chat()):
 * Anthropic primary, auto-failover to OpenAI/Groq/Together/Mistral/… on
 * outage. We tag the call with the public `wft_marketing_chat` surface so
 * spend is gated + logged on the same system surface the public marketing
 * chat already uses (no new surface to seed). claude-haiku-4-5 is the
 * cheapest text model — these are short, anonymous lead-magnet generations.
 */
const TOOL_AI_MODEL = "claude-haiku-4-5-20251001";
const TOOL_AI_SURFACE = "wft_marketing_chat";

/** Tolerant extraction of a string[] from a model's JSON-ish text output. */
function parseStringArray(text: string, key: string): string[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) {
      try {
        raw = JSON.parse(m[0]);
      } catch {
        /* fall through — returns [] below */
      }
    }
  }
  const arr = (raw as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/* ─── Rate limiting (per-tool, in-memory) ─────────────────────────────── */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 20;

/**
 * `max` overrides the default 20/hour for a tool whose per-request fan-out is
 * large enough that 20 submits is not a sane worst case (see
 * RANK_GRID_HOURLY_MAX).
 */
function rateOk(tool: string, req: Request, res: Response, max = RATE_MAX): boolean {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const key = `${tool}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > max) {
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
          // The provider returns an opaque ChIJ… Place ID, NOT a numeric CID,
          // so `maps?cid=<placeId>` was a malformed link. The correct Place
          // ID-based deep link uses the Maps Search API query_place_id param.
          gbpUrl: p.placeId
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.title || "")}&query_place_id=${encodeURIComponent(p.placeId)}`
            : null,
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

/* ─── 3. SERP-index directory probe (NAP Checker only) ───────────────────
 *
 * This list and `classifyCitationHit` used to power the free Citation
 * Checker as well. They no longer do — see `citationCheckerHandler` below
 * for why a SERP-index probe cannot answer "is this business listed?".
 * Only the NAP Checker still uses them, and only to find a listing it can
 * then read NAP fields off; it never reports an index miss as an absence.
 */

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

/**
 * Accuracy fix (2026-06-13): the old matcher counted a directory "found"
 * whenever ANY organic result's hostname equalled the directory domain —
 * with no check that the page was actually THIS business's listing. Live,
 * a Roto-Rooter/Austin scan returned 10/10 "found" where the Houzz hit was
 * a *Boerne* (wrong-city) page and Thumbtack/HomeAdvisor were category
 * index pages. That is a misleading result on a public lead-magnet.
 *
 * New rule: a host-only hit is necessary but not sufficient. To claim
 * "found" we require a corroborating signal in the result's title /
 * snippet / URL:
 *   - the business-name token must appear (fuzzy, via looseIncludes), AND
 *   - if a city was supplied, the city must appear too (a wrong-city page
 *     stays "unverified", not "found").
 * Host-only hits with no name corroboration are demoted to "unverified"
 * (we found a page on that directory, but couldn't confirm it's yours) —
 * we never silently claim "found".
 *
 * Phone (optional): when supplied, a digits-match of the phone in the
 * title/snippet/URL is treated as a strong corroborating signal that, on
 * its own, can lift an "unverified" host hit to "found" — this is the
 * "helps confirm your listing" use the field's helptext now promises.
 */
/**
 * HONESTY FIX (2026-08-29): there is no "missing" verdict here any more.
 *
 * The classifier only ever sees the top ten organic results for one
 * phrasing of one query. When none of them sit on the directory's domain
 * that is an INDEX MISS, and an index miss is not evidence of absence:
 * the listing may exist and simply not rank for that phrasing, the
 * directory may be de-indexed for that query, or the provider may have
 * returned a thin result set. Reporting "not listed on Yelp" off that
 * signal is a fabricated status, which is exactly the class of bug #2061
 * removed from the paid product. A directory we cannot see into is
 * `unable-to-check`, and it is never counted as a gap.
 *
 * A genuine, verified absence requires contacting the directory itself —
 * which is what the citation registry does. See `citationCheckerHandler`.
 */
type CitationStatus = "found" | "unverified" | "unable-to-check";

function normPhoneDigits(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

/**
 * Decide a citation status from the organic results of a normal
 * `<name> <city> <directory>` query (results are host-filtered to the
 * directory domain here — the caller no longer uses a `site:` operator).
 * Pure + exported for unit tests.
 */
export function classifyCitationHit(
  organic: Array<{ link: string; title?: string; snippet?: string }>,
  src: { domain: string },
  businessName: string,
  city: string,
  phone: string,
): { status: CitationStatus; url?: string } {
  const hostHits = organic.filter((o) => {
    try {
      const host = new URL(o.link).hostname.replace(/^www\./, "");
      return host === src.domain || host.endsWith(`.${src.domain}`);
    } catch {
      return false;
    }
  });
  // No result on this directory's domain in the top ten. That tells us the
  // query did not surface a listing — NOT that no listing exists. Never a
  // reported absence; see the CitationStatus note above.
  if (hostHits.length === 0) return { status: "unable-to-check" };

  const phoneDigits = normPhoneDigits(phone);
  // A meaningful phone has at least 7 digits; ignore stubs so a "1" or area
  // code alone can't false-corroborate.
  const phoneUsable = phoneDigits.length >= 7;

  let firstHostUrl: string | undefined;
  for (const o of hostHits) {
    if (!firstHostUrl) firstHostUrl = o.link;
    const haystack = `${o.title || ""} ${o.snippet || ""} ${o.link || ""}`;
    const nameMatch = looseIncludes(haystack, businessName);
    const cityMatch = !city || looseIncludes(haystack, city);
    const phoneMatch =
      phoneUsable && normPhoneDigits(haystack).includes(phoneDigits);

    // Strong corroboration → "found":
    //   name + (city if provided)      → confirmed listing
    //   phone digits present           → confirmed listing (NAP phone match)
    if ((nameMatch && cityMatch) || phoneMatch) {
      return { status: "found", url: o.link };
    }
  }
  // We found a page on the directory but couldn't confirm it's this
  // business (wrong city, category/index page, or name didn't appear).
  return { status: "unverified", url: firstHostUrl };
}

/* ─── 3b. Citation Checker — real checks, from the shared registry ───────
 *
 * WHAT THIS TOOL USED TO DO, AND WHY IT WAS REPLACED (2026-08-29)
 * ---------------------------------------------------------------
 * The free Citation Checker advertised checks against ten directories —
 * Yelp, BBB, Angi, Thumbtack, YellowPages.com, Houzz, HomeAdvisor,
 * MapQuest, Foursquare, Manta — and contacted none of them. Per directory
 * it ran a single SERP query (`<name> <city> <directory>`) and filtered
 * the ten organic results down to that directory's domain. Zero results on
 * the domain returned `status: "missing"`, which the page rendered as a red
 * "Missing" row and fed into a "N directories need attention" upsell.
 *
 * Two independent failures:
 *
 *   1. FABRICATION. An index miss is not an absence. A business genuinely
 *      listed on Yelp is reported "Missing" whenever its listing does not
 *      happen to rank in the top ten for that exact phrasing. On a public
 *      lead magnet this told prospects they were absent from directories
 *      they were on — the same class of bug #2061 removed from the paid
 *      product, on a bigger audience.
 *
 *   2. IT COULD NOT RUN AT ALL. Since #2057 the public tools are
 *      structurally barred from paid SERP providers, and this deployment
 *      has no free-tier SERP credential (GOOGLE_CUSTOMSEARCH_CX is unset),
 *      so in production all ten searchSerp() calls threw and every row came
 *      back "unable to check". The tool had stopped producing results.
 *
 * WHAT IT DOES NOW
 * ----------------
 * It runs the SAME checks as the paid CiteTrack product, from the SAME
 * registry (server/services/citationTracker/directories.ts) and the same
 * bot-wall-aware httpClient. One source of truth: a directory #2061 proved
 * unreachable cannot be "checked" here while the paid product declines it,
 * because both read `getMonitoredDirectories()`.
 *
 * The three-state model is the registry's, unchanged:
 *   found            — the directory returned this business's listing.
 *   confirmed-absent — the directory answered cleanly and this business is
 *                      not in it. A real, actionable gap.
 *   could-not-check  — timeout, block, challenge page, quota, or budget.
 *                      Reported distinctly, never counted as a gap.
 *
 * Directories we evaluated and cannot honestly check are returned in
 * `declined`, each with the reason, so the page can name them instead of
 * quietly dropping them. "Here is what we check and here is what nobody can
 * check, with evidence" is a stronger claim than a bigger number.
 *
 * COST — a public tool has unbounded traffic, so this is bounded hard.
 * ------------------------------------------------------------------
 *   - No SERP. This handler never calls searchSerp(), so it cannot reach
 *     the pay-as-you-go providers even by accident (#2057 default-deny is
 *     a second line of defence, not the first).
 *   - BBB, BuildZoom, YellowPages.ca, n49, OpenStreetMap — plain HTTP.
 *     $0.00 per run, always, at any volume.
 *   - Google Business Profile — one Places Text Search call, Pro tier,
 *     whose free allowance is 5,000/month. This is the only line item that
 *     could ever bill, so it is triple-bounded:
 *       * per-IP:     CITATION_HOURLY_MAX scans/hour,
 *       * per-tool:   CITATION_PLACES_DAILY_BUDGET calls/UTC-day via the
 *                     shared #2057 ledger — a hard process-wide ceiling
 *                     across every visitor,
 *       * repeat use: a CITATION_CACHE_TTL_MS response cache, so re-running
 *                     the same business costs nothing.
 *     100/day is 3,100/month worst case, comfortably inside the 5,000 free
 *     Pro allowance with room left for CiteTrack's own discovery calls.
 *
 *   WORST CASE, ALL VISITORS COMBINED: 100 Places calls per UTC day, so at
 *   most 100 in any single hour = $0.00 (inside the free allowance). If the
 *   shared free allowance were ever exhausted by another surface, the
 *   absolute ceiling this tool could add is 100 × $0.032 = $3.20 per UTC
 *   day. It cannot exceed that regardless of traffic.
 */

/** Scans per hour per IP. Tighter than the 20/hr default: each scan fans
 * out to several third-party directories and one Places call. */
const CITATION_HOURLY_MAX = 5;

/** Process-wide Places Text Search ceiling per UTC day, across every
 * visitor. See the cost note above for the arithmetic. */
const CITATION_PLACES_DAILY_BUDGET = 100;
const CITATION_BUDGET_BUCKET = "tools:citation-checker";

/** Politeness delay before each directory fetch. Short because we make at
 * most one request per host per scan and the per-IP cap bounds the rate. */
const CITATION_POLITE_DELAY_MS = 200;

/** Response cache. Re-running the same business (the common case — people
 * fix a listing then re-check) must not spend budget or re-hit the
 * directories. */
const CITATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CITATION_CACHE_MAX = 500;

type CitationCheckStatus = "found" | "confirmed-absent" | "could-not-check";

interface CitationCheckRow {
  /** Registry directory id — the same id the paid product uses. */
  id: string;
  label: string;
  url: string;
  category: string;
  markets: string[];
  /** Why this directory is worth checking. Straight from the registry. */
  rationale: string;
  status: CitationCheckStatus;
  /** Present only on `found`. */
  listingUrl?: string;
  /** Present only on `could-not-check` — plain-English cause. */
  reason?: string;
  /** Google Business Profile leads the list; it outweighs the rest. */
  primary: boolean;
}

interface CitationCheckPayload {
  ok: true;
  businessName: string;
  city: string;
  market: "US" | "CA" | null;
  results: CitationCheckRow[];
  declined: Array<{ id: string; name: string; url: string; reason: string }>;
  summary: {
    checked: number;
    found: number;
    confirmedAbsent: number;
    couldNotCheck: number;
    declined: number;
  };
}

const citationCache = new Map<string, { at: number; payload: CitationCheckPayload }>();

function citationCacheKey(businessName: string, city: string, phone: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(businessName)}|${norm(city)}|${normPhoneDigits(phone)}`;
}

function citationCacheGet(key: string): CitationCheckPayload | null {
  const hit = citationCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CITATION_CACHE_TTL_MS) {
    citationCache.delete(key);
    return null;
  }
  return hit.payload;
}

function citationCacheSet(key: string, payload: CitationCheckPayload): void {
  // Bounded FIFO — Map preserves insertion order, so the oldest key is first.
  if (citationCache.size >= CITATION_CACHE_MAX) {
    const oldest = citationCache.keys().next();
    if (!oldest.done) citationCache.delete(oldest.value);
  }
  citationCache.set(key, { at: Date.now(), payload });
}

/**
 * Which market's directories apply. Derived from the typed city via the
 * shared, deliberately-conservative resolver — it returns null on anything
 * ambiguous rather than guessing.
 *
 * This matters for honesty, not just relevance: YellowPages.ca answering
 * cleanly for an Austin plumber is a true "not in it" that would read to
 * the customer as a gap they should fix. It is not one. So a directory is
 * only run when its market matches, and when we cannot tell the market we
 * run only the directories that serve both.
 */
export function citationMarketFor(city: string): "US" | "CA" | null {
  const country = city ? deriveCountryFromLocation(city) : null;
  if (country === "us") return "US";
  if (country === "ca") return "CA";
  return null;
}

/** Plain-English cause for a `could-not-check` row. The registry's failure
 * reasons are internal tokens; these are what a business owner reads. */
function citationFailureText(reason: string): string {
  switch (reason) {
    case "rate_limited":
      return "The directory blocked our request (rate limit or bot challenge).";
    case "timeout":
      return "The directory did not respond in time.";
    case "network":
      return "We could not reach the directory.";
    case "bad_status":
      return "The directory returned an error.";
    case "parse_error":
      return "The directory's page format changed and we could not read it reliably.";
    case "not_configured":
      return "This check is not enabled on this deployment.";
    case "robots_disallowed":
      return "This directory's robots.txt asks automated clients not to request that page, so we did not.";
    case "daily_budget":
      return "This tool's free daily allowance for Google lookups is used up. It resets at midnight UTC — or run the check again tomorrow.";
    default:
      return "The check did not complete, so we cannot say either way.";
  }
}

/**
 * THE honesty invariant of this tool, in one pure function so it can be
 * tested directly rather than inferred from the handler.
 *
 * A scraper that errored tells us NOTHING about the listing. A Cloudflare
 * challenge, an Imperva interstitial, a timeout, a 429 or an unparseable
 * page must all surface as `could-not-check` — never as an absence. The
 * error is checked FIRST and outranks `found`, so a scraper that sets both
 * (a partial read) still degrades to "we don't know" rather than asserting
 * either way.
 *
 * Exported for server/routes/freeToolsCitationHonesty.test.ts.
 */
export function citationRowStatus(
  out: { found: boolean; listing_url?: string; error?: string },
): { status: CitationCheckStatus; listingUrl?: string; reason?: string } {
  if (out.error) return { status: "could-not-check", reason: citationFailureText(out.error) };
  if (out.found) return { status: "found", listingUrl: out.listing_url };
  return { status: "confirmed-absent" };
}

async function citationCheckerHandler(req: Request, res: Response) {
  if (!rateOk("citation", req, res, CITATION_HOURLY_MAX)) return;
  const businessName = strField(req.body?.businessName, 120);
  const city = strField(req.body?.city, 80);
  // Phone is optional and purely corroborating: the registry's
  // candidateMatches() uses it to confirm a candidate really is this
  // business. It can only ever make a match stricter, never invent one.
  const phone = strField(req.body?.phone, 40);
  if (!businessName) {
    return res.status(400).json({ ok: false, error: "Missing businessName." });
  }

  const cacheKey = citationCacheKey(businessName, city, phone);
  const cached = citationCacheGet(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const market = citationMarketFor(city);
  const monitored = getMonitoredDirectories();
  // When the market is unknown, run only the directories that serve both —
  // never a market-specific one whose clean "not in it" would be a
  // meaningless gap.
  const run = monitored.filter((d) =>
    market ? d.markets.includes(market) : d.markets.includes("US") && d.markets.includes("CA"),
  );

  // Reserve this scan's single Places call from the process-wide daily
  // ledger BEFORE spending it. Nothing else in this handler can bill.
  const wantsPlaces = run.some((d) => d.id === "google_business_profile");
  const placesGranted = wantsPlaces
    ? reserveDailyCalls(CITATION_BUDGET_BUCKET, CITATION_PLACES_DAILY_BUDGET, 1)
    : 0;
  if (wantsPlaces && placesGranted < 1) {
    log.warn("[citation-checker] daily Places budget exhausted; GBP row reported unchecked");
  }

  const ctx: ScrapeContext = {
    business_name: businessName,
    phone: phone || undefined,
    // The scrapers parse city + state out of a single free-form address
    // string, which is exactly the shape of this tool's city field
    // ("Austin, TX" → city "Austin", state "TX").
    address: city || undefined,
  };

  const row = (
    dir: DirectoryDef,
    status: CitationCheckStatus,
    extra: { listingUrl?: string; reason?: string } = {},
  ): CitationCheckRow => ({
    id: dir.id,
    label: dir.name,
    url: dir.url,
    category: dir.category,
    markets: [...dir.markets],
    rationale: dir.rationale,
    status,
    listingUrl: extra.listingUrl,
    reason: extra.reason,
    primary: dir.id === "google_business_profile",
  });

  const results = await Promise.all(
    run.map(async (dir): Promise<CitationCheckRow> => {
      if (dir.id === "google_business_profile" && placesGranted < 1) {
        return row(dir, "could-not-check", { reason: citationFailureText("daily_budget") });
      }
      try {
        // `scrape` is non-null for everything getMonitoredDirectories()
        // returns — isDirectoryCheckable() already filtered nulls out.
        const out = await dir.scrape!(ctx, { politeDelayMs: CITATION_POLITE_DELAY_MS });
        const mapped = citationRowStatus(out);
        return row(dir, mapped.status, {
          listingUrl: mapped.status === "found" ? mapped.listingUrl || dir.url : undefined,
          reason: mapped.reason,
        });
      } catch (err: any) {
        log.warn("[citation-checker] scraper threw", {
          directory: dir.id,
          error: err?.message || String(err),
        });
        return row(dir, "could-not-check", { reason: citationFailureText("unknown") });
      }
    }),
  );

  // Google first — it carries more local-ranking weight than the rest
  // combined, so it leads the result table rather than sorting
  // alphabetically into the middle of it.
  results.sort((a, b) => Number(b.primary) - Number(a.primary));

  // Everything we evaluated and cannot honestly check, with the evidence.
  // Straight from the registry, so it can never drift from what the paid
  // product declines.
  const declined = CITATION_TRACKER_DIRECTORIES.filter((d) => !isDirectoryCheckable(d)).map((d) => ({
    id: d.id,
    name: d.name,
    url: d.url,
    reason: d.unavailableReason || "Not checked.",
  }));

  const payload: CitationCheckPayload = {
    ok: true,
    businessName,
    city,
    market,
    results,
    declined,
    summary: {
      checked: results.length,
      found: results.filter((r) => r.status === "found").length,
      confirmedAbsent: results.filter((r) => r.status === "confirmed-absent").length,
      couldNotCheck: results.filter((r) => r.status === "could-not-check").length,
      declined: declined.length,
    },
  };

  citationCacheSet(cacheKey, payload);
  return res.json(payload);
}

/* ─── 4. Local Rankflux (Wave 17 — HTML-scrape fallback chain) ────────── */

/**
 * Wave 17 — Moz deprecated their public MozCast RSS feed (now returns
 * HTTP 404). We replaced it with a 3-tier fallback chain off the same
 * MozCast surface:
 *
 *   1. PRIMARY:   scrape https://moz.com/mozcast (the page). The Vue
 *                 app embeds the last ~90 days of weather in a JS data
 *                 block. We pull the JSON array directly out of the
 *                 HTML and reduce it to a 7-day window.
 *   2. SECONDARY: if scrape fails AND cache is older than 24h, we
 *                 signal the client to render the official Semrush
 *                 Sensor embed widget (no scrape, no paid API — just an
 *                 iframe).
 *   3. TERTIARY:  last-known-good cached value. Cache TTL is 24h so
 *                 graceful-degradation lasts a full day before we flip
 *                 to the Semrush fallback.
 *   4. FINAL:     "Data temporarily unavailable" pill on the client.
 *
 * MozCast's temperature is published in degrees (typical baseline 70°F,
 * "stormy" 120-180°+). We keep the upstream API shape (0–10 score,
 * scorePct, band) to avoid breaking rankfluxAlertWorker.ts and the
 * page. The Fahrenheit value is mapped to the 0–10 scale via
 * `tempFToScore10` below — preserves the visual / alert thresholds.
 */

type MozBand = "LOW" | "MEDIUM" | "HIGH";
type RankfluxSource = "mozcast" | "semrush-embed" | "cached" | "unavailable";

interface MozCastDay {
  date: string;        // yyyy-mm-dd (UTC)
  score: number;       // mapped 0..10 (from MozCast Fahrenheit)
  scorePct: number;    // 0..100 (= score*10, used for bar heights)
  band: MozBand;
  tempF?: number;      // raw MozCast Fahrenheit value (debug / future use)
}

/**
 * Map MozCast's Fahrenheit temperature to a 0–10 score that's
 * compatible with our existing rubric. Calibrated so:
 *   60°F (boring)  → 3.0
 *  100°F (normal)  → 5.0
 *  140°F (active)  → 7.0
 *  160°F+ (storm)  → 8.0+
 * This keeps the HIGH band (≥8.0) firing on genuine algorithm storms
 * (Moz publishes weather icons "stormy" at temp ≥140°F).
 */
function tempFToScore10(tempF: number): number {
  if (!isFinite(tempF)) return 0;
  // Linear-ish: (tempF - 40) / 16, clamped to [0,10].
  // 40°F→0, 200°F→10. MozCast rarely goes below 60 or above 180.
  const raw = (tempF - 40) / 16;
  return Math.max(0, Math.min(10, raw));
}

let mozCache: { fetchedAt: number; days: MozCastDay[]; source: RankfluxSource } | null = null;
// Wave 17: 24h TTL (was 1h) so a single failed scrape doesn't immediately
// degrade — we hold the last good value for a full day.
const MOZCAST_TTL_MS = 24 * 60 * 60 * 1000;
// Re-attempt the live scrape after this interval even if we're inside
// the 24h window (so we don't serve a stale value when Moz is healthy).
const MOZCAST_REFRESH_MS = 60 * 60 * 1000;
const SEMRUSH_EMBED_URL = "https://www.semrush.com/sensor/widget/?country=US&category=overall";

function bandForMoz(score10: number): MozBand {
  // Moz's published rubric: <3 quiet, 3–6 normal, 6–8 active, ≥8 storm.
  if (score10 >= 8) return "HIGH";
  if (score10 >= 3) return "MEDIUM";
  return "LOW";
}

/**
 * Pull the day-by-day weather array out of moz.com/mozcast HTML.
 *
 * The Vue app on that page initializes its `data` block with a literal
 * JSON array assigned to `weather: [...]`. Each entry has the shape
 *   { date: "2026-05-26T16:00:27.000Z", dateStr: "May 26", temp: 108, … }
 *
 * We locate the array boundaries with a bracket walker (regex alone
 * can't handle nested braces robustly), JSON.parse the slice, and
 * project the fields we need.
 *
 * Returns up to 7 most-recent days, oldest-first.
 */
export function parseMozCastHtml(html: string): MozCastDay[] {
  // Anchor: "weather: [" followed by JSON array of day objects.
  const anchor = html.match(/weather\s*:\s*\[/);
  if (!anchor || anchor.index === undefined) return [];
  const startIdx = anchor.index + anchor[0].length - 1; // points at the '['
  // Walk the array, tracking bracket / string state, to find the
  // matching ']'. Handles embedded strings and escape sequences.
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx < 0) return [];
  const slice = html.slice(startIdx, endIdx + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows: MozCastDay[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const tempF = typeof e.temp === "number" ? e.temp : Number(e.temp);
    const rawDate = typeof e.date === "string" ? e.date : "";
    if (!isFinite(tempF) || !rawDate) continue;
    const d = new Date(rawDate);
    const dateISO = isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
    if (!dateISO) continue;
    const score = tempFToScore10(tempF);
    rows.push({
      date: dateISO,
      score,
      scorePct: Math.max(0, Math.min(100, score * 10)),
      band: bandForMoz(score),
      tempF,
    });
  }
  // Moz lists newest-first. Take the 7 newest, reverse to oldest-first
  // for chart display (left = oldest, right = today).
  return rows.slice(0, 7).reverse();
}

interface FetchAlgoTemperatureResult {
  days: MozCastDay[];
  source: RankfluxSource;
}

/**
 * 3-tier fallback chain. Always returns *something* — caller decides
 * whether the source warrants showing the gauge, the Semrush iframe,
 * or the "unavailable" pill.
 */
async function fetchAlgoTemperature(): Promise<FetchAlgoTemperatureResult> {
  const now = Date.now();
  const cacheFresh = mozCache && now - mozCache.fetchedAt < MOZCAST_REFRESH_MS;
  // Inside the refresh window: serve cached `mozcast` source as-is.
  if (cacheFresh && mozCache && mozCache.source === "mozcast") {
    return { days: mozCache.days, source: "mozcast" };
  }
  // Otherwise: attempt a live scrape.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch("https://moz.com/mozcast", {
      signal: controller.signal,
      headers: {
        "User-Agent": "WeFixTrades/1.0 (Rankflux mirror; +https://wefixtrades.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    }).finally(() => clearTimeout(timer));
    if (!r.ok) {
      const bodyPreview = await r.text().catch(() => "").then((t) => t.slice(0, 500));
      log.warn("[rankflux] mozcast scrape non-2xx", { status: r.status, bodyPreview });
      throw new Error(`MozCast HTTP ${r.status}`);
    }
    const html = await r.text();
    const days = parseMozCastHtml(html);
    if (days.length === 0) {
      log.warn("[rankflux] mozcast scrape parsed zero rows", {
        bodyLen: html.length,
        bodyPreview: html.slice(0, 500),
      });
      throw new Error("MozCast HTML returned no parseable weather rows");
    }
    mozCache = { fetchedAt: now, days, source: "mozcast" };
    return { days, source: "mozcast" };
  } catch (err: any) {
    log.warn("[rankflux] mozcast scrape failed", { error: err?.message || String(err) });
    // Fallback 2: cache still inside 24h window → serve as `cached`.
    if (mozCache && now - mozCache.fetchedAt < MOZCAST_TTL_MS) {
      return { days: mozCache.days, source: "cached" };
    }
    // Fallback 3: cache stale or absent → tell client to render Semrush
    // embed. We don't have day-by-day data in this branch.
    return { days: [], source: "semrush-embed" };
  }
}

/**
 * Backward-compat alias for rankfluxAlertWorker.ts which historically
 * imported `fetchMozCast`. Returns only the days array (or null) to
 * match the prior contract. The worker is updated separately to use
 * the source signal directly.
 */
async function fetchMozCast(): Promise<MozCastDay[] | null> {
  const result = await fetchAlgoTemperature();
  if (result.source === "semrush-embed" || result.days.length === 0) return null;
  return result.days;
}

async function localRankfluxHandler(_req: Request, res: Response) {
  const result = await fetchAlgoTemperature();
  res.setHeader("Cache-Control", "public, max-age=3600");

  // Semrush-embed branch: no day-by-day data — client renders the iframe.
  if (result.source === "semrush-embed") {
    return res.json({
      ok: true,
      source: result.source,
      sourceUrl: "https://www.semrush.com/sensor/",
      embedUrl: SEMRUSH_EMBED_URL,
      todayScore: null,
      todayBand: null,
      todayDate: null,
      last7d: [],
      updatedAt: new Date().toISOString(),
    });
  }

  // mozcast / cached branches: full day-by-day payload.
  if (result.days.length === 0) {
    return res.json({
      ok: true,
      source: "unavailable" as RankfluxSource,
      sourceUrl: "https://moz.com/mozcast",
      todayScore: null,
      todayBand: null,
      todayDate: null,
      last7d: [],
      updatedAt: new Date().toISOString(),
    });
  }

  const today = result.days[result.days.length - 1];
  return res.json({
    ok: true,
    source: result.source,
    sourceUrl: "https://moz.com/mozcast",
    todayScore: today.score,
    todayBand: today.band,
    todayDate: today.date,
    last7d: result.days,
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

// Re-export types + functions for the cron worker.
// `fetchMozCast` is a backward-compat alias around `fetchAlgoTemperature`
// (Wave 17 — MozCast RSS dead, HTML-scrape now primary).
export type { MozBand, MozCastDay, RankfluxSource };
export { fetchMozCast, fetchAlgoTemperature };

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

/** `size` evenly-spaced multipliers from -1..+1 (e.g. 3 → [-1,0,1];
 *  5 → [-1,-0.5,0,0.5,1]; 7 → [-1,-⅔,-⅓,0,⅓,⅔,1]). */
function gridSteps(size: number): number[] {
  if (size <= 1) return [0];
  return Array.from({ length: size }, (_, i) => -1 + (2 * i) / (size - 1));
}

/**
 * size×size grid centred on (lat, lng), spread across a ~radiusKm half-extent.
 * We use a simple "1 degree latitude ≈ 111 km" approximation — accurate enough
 * at city scale and fast enough to compute inline. Longitude is scaled by
 * cos(lat) so the grid stays roughly square at any latitude.
 */
function buildGrid(lat: number, lng: number, radiusKm = 5, size = 5): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const steps = gridSteps(size);
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

/* ─── Rank-grid spend ceiling ─────────────────────────────────────────
 *
 * This endpoint is PUBLIC and ANONYMOUS, and one submit fans out to
 * `gridSize² × 2` orchestrator calls. At the shared 20/hour/IP default that
 * was 20 × 50 = 1,000 SERP calls per hour per IP — and, before the
 * default-deny cost gate in server/lib/serpOrchestrator.ts, those could fall
 * through to the pay-as-you-go provider. Two ceilings now bound it:
 *
 *   1. Money: the orchestrator default-denies paid providers, so nothing this
 *      handler does can bill. (It never passes `allowPaidProviders`, and the
 *      CI guard `npm run check:public-serp-spend` fails if it ever does.)
 *   2. Free pool: a tighter per-IP hourly cap plus a process-wide daily
 *      ledger, so this lead magnet takes a slice of the ~2,600/month free
 *      google_maps capacity rather than the whole thing.
 *
 * Worst case per IP: 6 × 50 = 300 free-tier SERP calls/hour, $0.
 * Worst case for the tool overall: RANK_GRID_DAILY_CALL_BUDGET/UTC day across
 * every visitor. Points past the budget come back "unavailable" — the client
 * already renders those grey, with no number, and excludes them from the
 * dead-zone count.
 */
const RANK_GRID_HOURLY_MAX = 6;
const RANK_GRID_CALLS_PER_POINT = 2;   // google_web + google_maps
const RANK_GRID_DAILY_CALL_BUDGET = 600;
const RANK_GRID_BUDGET_BUCKET = "tools:local-rank-grid";

async function localRankGridHandler(req: Request, res: Response) {
  if (!rateOk("rank-grid", req, res, RANK_GRID_HOURLY_MAX)) return;
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

  // Grid size — free tool offers 3×3 and 5×5; 7×7 is gated to MapGuard
  // (paid), since each point fires 2 SERP calls (7×7 = 98 vs 5×5 = 50) and
  // would burn the free-tier providers. Anything but 3 falls back to 5.
  const gridSize = Number(req.body?.gridSize) === 3 ? 3 : 5;
  // Spacing = distance between adjacent grid points, BrightLocal-style
  // (miles). Half-extent radius = spacing × (size − 1) / 2. Clamp sane.
  const spacingRaw = Number(req.body?.spacingMiles);
  const spacingMiles = Number.isFinite(spacingRaw) ? Math.min(5, Math.max(0.25, spacingRaw)) : 1.5;
  const radiusKm = (spacingMiles * 1.60934 * (gridSize - 1)) / 2;
  const grid = buildGrid(geo.lat, geo.lng, radiusKm, gridSize);

  // Reserve this scan's share of the tool's daily free-tier slice. Points we
  // cannot fund are returned "unavailable" WITHOUT a provider call — the same
  // honest degrade the handler already uses when both providers fail. Never a
  // fabricated or interpolated rank.
  const grantedCalls = reserveDailyCalls(
    RANK_GRID_BUDGET_BUCKET,
    RANK_GRID_DAILY_CALL_BUDGET,
    grid.length * RANK_GRID_CALLS_PER_POINT,
  );
  const fundedPointCount = Math.floor(grantedCalls / RANK_GRID_CALLS_PER_POINT);
  if (fundedPointCount < grid.length) {
    log.warn("[rank-grid] daily free-tier budget limits this scan", {
      requestedPoints: grid.length,
      fundedPoints: fundedPointCount,
    });
  }
  const unfundedPoint = (pt: { lat: number; lng: number }) => ({
    lat: pt.lat,
    lng: pt.lng,
    rank: null as number | null,
    mapRank: null as number | null,
    status: "unavailable" as "ranked" | "not-found" | "unavailable",
    topResults: [] as Array<{ rank: number; name: string; rating: number | null; reviewsCount: number | null }>,
  });

  // size×size parallel searches via the multi-provider orchestrator (Wave 6.5).
  // Each request carries per-point lat/lng — Serper consumes them
  // directly; other providers ignore them and fall back to the city
  // location text. We dual-call web + maps per point (Local Pack rank is
  // what matters for trades; organic rank is the fallback signal).
  //
  // No `allowPaidProviders` here, deliberately and permanently: this is an
  // anonymous public endpoint, so it must be structurally incapable of
  // reaching a provider that bills. Guarded by check:public-serp-spend.
  //
  // Wave 6A: also retain the top-3 Local Pack results per point so the
  // frontend can render a hover popover ("who's #1/2/3 at this exact
  // lat/lng") and aggregate the most-frequent #1s into a competitor
  // sidebar.
  const points = await Promise.all(
    grid.map(async (pt, index) => {
      if (index >= fundedPointCount) return unfundedPoint(pt);
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
        // If BOTH provider calls failed (rejected), this point couldn't be
        // checked at all — almost always Serper-maps throttling on 25 parallel
        // calls. That's "unavailable", NOT a genuine ranking gap, so it must be
        // excluded from the dead-zone / missed count rather than counted as a
        // loss. If at least one call fulfilled, we have real data for the point.
        const unavailable = search === null && maps === null;
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
        const status: "ranked" | "not-found" | "unavailable" = unavailable
          ? "unavailable"
          : (rank ?? mapRank) != null
            ? "ranked"
            : "not-found";
        return { lat: pt.lat, lng: pt.lng, rank, mapRank, status, topResults };
      } catch {
        // The whole point errored — treat as unavailable (couldn't check),
        // not as a ranking gap.
        return { lat: pt.lat, lng: pt.lng, rank: null as number | null, mapRank: null as number | null, status: "unavailable" as "ranked" | "not-found" | "unavailable", topResults: [] as Array<{ rank: number; name: string; rating: number | null; reviewsCount: number | null }> };
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
  // "Dead zones" = points we successfully checked where the business does NOT
  // rank. Points that couldn't be checked (provider throttle/error) are tracked
  // separately as `unavailable` and MUST NOT inflate the missed/dead-zone count.
  const unavailableCount = points.filter((p) => p.status === "unavailable").length;
  const missedCount = points.filter((p) => p.status === "not-found").length;
  const checkedCount = points.length - unavailableCount;

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
    gridSize,
    spacingMiles,
    gridPoints: points,
    summary: {
      avgRank,
      top3Count,
      missedCount,
      unavailableCount,
      checkedCount,
      totalPoints: points.length,
      // True when the tool's daily free-tier slice — not a provider hiccup —
      // is what left points unchecked. The client says so plainly instead of
      // telling the visitor to retry in a minute, which would not help.
      budgetLimited: fundedPointCount < grid.length,
    },
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
  /* Country resolution (T-sweep 2026-06-11 P1 — geo-default trap):
   * a blind country=us default sent "Toronto, Ontario, Canada" to the US
   * index and returned Baltimore results. The typed location is the
   * strongest signal of which country index the visitor means, so:
   *   1. countryExplicit=true (the visitor manually picked a country in the
   *      UI) → honor their choice;
   *   2. otherwise, derive the country from the location string when the
   *      evidence is unambiguous (province/state, postal code, major city);
   *   3. otherwise fall back to the submitted value, then "us".
   * Derivation only ever returns codes within ALLOWED_COUNTRIES, but guard
   * anyway so provider gl params can never receive an unsupported code. */
  const submitted = ALLOWED_COUNTRIES.has(countryRaw) ? countryRaw : null;
  const countryExplicit = req.body?.countryExplicit === true;
  const derivedRaw = deriveCountryFromLocation(location);
  const derived = derivedRaw && ALLOWED_COUNTRIES.has(derivedRaw) ? derivedRaw : null;
  const country =
    countryExplicit && submitted ? submitted : (derived ?? submitted ?? "us");
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

    // Relevance gate (Wave — credibility fix). A generic non-result query
    // (e.g. "asdkjfh@@@") makes the Serper free-tier fall back to an unrelated
    // top-10. Showing that as a confident result is dishonest. For the web
    // engine, require non-trivial token overlap between the query terms and the
    // returned titles/snippets; if there's effectively none, return a
    // low-confidence empty state so the client renders its "no results" panel
    // instead of a fabricated count banner. (Maps/local-pack is name-matched by
    // the provider already, so we only gate the organic web engine.)
    let lowConfidence = false;
    if (engine === "search" && organic.length > 0) {
      const queryTokens = new Set(
        query
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .filter((t) => t.length >= 3),
      );
      if (queryTokens.size > 0) {
        const haystack = organic
          .map((o) => `${o.title} ${o.snippet} ${o.displayedLink}`.toLowerCase())
          .join(" ");
        const haystackTokens = new Set(haystack.split(/[^a-z0-9]+/i).filter(Boolean));
        let overlap = 0;
        for (const t of queryTokens) if (haystackTokens.has(t)) overlap += 1;
        // If not a single meaningful query token appears anywhere in the
        // returned result set, the provider returned generic filler.
        if (overlap === 0) lowConfidence = true;
      }
    }
    const safeOrganic = lowConfidence ? [] : organic;

    return res.json({
      ok: true,
      query,
      location,
      country,
      language,
      engine,
      organic: safeOrganic,
      localPack,
      lowConfidence,
      provider: result.provider,
      cached: !!result.cached,
      totalResults: lowConfidence ? 0 : result.totalResults,
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

/* ─── 8. Tool lead capture ("Email me this report") ───────────────────── */

/**
 * Peak-intent lead capture shared by every free SEO tool's result view
 * (Citation Checker, Google Review Link, Local Rank Grid, Local Rank Tracker,
 * Local SERP Checker — and the Rankflux upsell). The visitor sees full
 * results first; this is an OPTIONAL "email me this report" affordance, not a
 * gate.
 *
 * Reuses the existing audit lead store rather than inventing a new pipeline:
 *   - persists to `audit_submissions` via storage.createAuditSubmission (the
 *     same store /api/audit/save-lead writes to — see auditRoutes.ts:3363),
 *     tagged with `source_tool` for attribution so follow-up / analytics can
 *     differentiate which tool produced the lead;
 *   - sends a best-effort confirmation via the same queueEmail pipeline the
 *     rankflux-subscribe handler uses. If SMTP is unconfigured the queue is a
 *     no-op and the lead row still lands, so we never lose the signal.
 *
 * We do NOT enqueue the audit follow-up *sequence* here — that sequence is
 * audit-report-specific (it references the visitor's score, report link, and
 * detected issues, none of which a tool lead has). The lead is persisted +
 * confirmed; tool-specific nurture can be layered on later off the
 * `source_tool` tag without rework.
 */
const TOOL_LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function toolLeadHandler(req: Request, res: Response) {
  if (!rateOk("tool-lead", req, res)) return;
  const email = strField(req.body?.email, 200).toLowerCase();
  // Clamp to the audit_submissions.source_tool varchar(50) column width.
  const sourceTool = strField(req.body?.sourceTool, 50);
  const sourcePage = strField(req.body?.sourcePage, 200);
  const businessName = strField(req.body?.businessName, 120);
  if (!email || !TOOL_LEAD_EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email." });
  }

  try {
    const submission = await storage.createAuditSubmission({
      email,
      business_name: businessName || null,
      wants_help: false,
      issue_count: 0,
      source_tool: sourceTool || "seo-tool",
      source_page: sourcePage || null,
    });

    // Best-effort confirmation email — never blocks the lead save.
    try {
      await queueEmail(
        email,
        "Your WeFixTrades report",
        `<p>Thanks for using our free local-SEO tools.</p>
         <p>You asked us to email you a copy of your report${businessName ? ` for <strong>${businessName}</strong>` : ""}. Keep an eye on this inbox — if you'd like a hand acting on what it showed, just reply and a real person will help.</p>
         <!-- No citation-source count: there is no 50+ citation check in the
              product, and this email goes to Citation Checker leads who were
              just told, correctly, that big coverage numbers are theatre. -->
         <p>Want the complete picture? Our <a href="https://wefixtrades.com/tools/free-audit">Full Audit</a> covers 20 keyword rankings, your Google Business Profile, competitors, and website speed.</p>
         <p>— The WeFixTrades Team</p>`,
        undefined,
        { category: "marketing", source: `tool_lead:${sourceTool || "seo-tool"}` },
      );
    } catch (emailErr: any) {
      log.debug("[tool-lead] confirmation email enqueue failed (non-fatal)", { error: emailErr?.message });
    }

    log.info("[tool-lead] saved", { id: submission.id, sourceTool });
    return res.json({ ok: true, submissionId: submission.id });
  } catch (err: any) {
    log.warn("[tool-lead] save failed", { error: err?.message || String(err) });
    return res.status(500).json({ ok: false, error: "Could not save. Please try again." });
  }
}

/* ─── 9. GBP Post Generator (AI) ──────────────────────────────────────────
 *
 * POST /api/tools/gbp-post-generator
 *   body { businessName, trade, goal, details? }
 *   → { ok, posts: string[] }   (2-3 ready-to-publish GBP post variants)
 *
 * Generates Google Business Profile post copy via the canonical AI engine.
 * The prompt is constrained to honest, generic copy: NO invented prices,
 * discounts, guarantees, or specific claims (the pricing-truth guard would
 * otherwise catch fabricated "$X off" copy, and it would be dishonest on a
 * public lead magnet anyway). GBP posts have a ~1,500-char limit; we ask the
 * model to stay well under and lead with the key message.
 */
const GBP_GOALS: Record<string, string> = {
  offer: "a promotional Offer post (highlight value without inventing a specific price, % discount, or dollar figure — keep it generic, e.g. 'seasonal savings', 'ask us about current offers')",
  update: "a business Update post (news, a completed project type, a new service area, or a general announcement)",
  event: "an Event post (an upcoming event, open day, or seasonal availability — do not invent a specific date unless given in the details)",
  tip: "a helpful Tip post (a genuinely useful maintenance/safety tip for the customer that subtly positions the business as the expert)",
};

async function gbpPostGeneratorHandler(req: Request, res: Response) {
  if (!rateOk("gbp-post", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const trade = strField(req.body?.trade, 80);
  const goalKey = strField(req.body?.goal, 20).toLowerCase();
  const details = strField(req.body?.details, 400);
  if (!businessName || !trade) {
    return res.status(400).json({ ok: false, error: "Business name and trade are required." });
  }
  const goalDesc = GBP_GOALS[goalKey] || GBP_GOALS.update;

  const cfg = validateConfig();
  if (!cfg.valid) {
    return res.status(503).json({ ok: false, error: "The AI service is temporarily unavailable. Please try again in a moment." });
  }

  const system = [
    `You write Google Business Profile (GBP) posts for a ${trade} business called "${businessName}".`,
    "",
    `Write 3 distinct, ready-to-publish GBP post variants — each is ${goalDesc}.`,
    "Each post must:",
    "- be 2-4 short sentences, comfortably under 1,300 characters, leading with the key message",
    "- sound like a real local trade business owner — warm, plain-spoken, not corporate or salesy",
    "- end with ONE soft call-to-action (e.g. 'Call us to book', 'Message us for a free quote', 'Tap to learn more') — do NOT invent a phone number, URL, or booking link",
    "- NEVER invent prices, percentages, dollar amounts, discounts, guarantees, awards, certifications, or specific claims that weren't provided",
    "- vary wording and angle across the 3 so they don't read as duplicates",
    "- contain no markdown, no hashtags spam (at most 1-2 natural hashtags), no emojis-overload (0-1 tasteful emoji max)",
    "",
    details ? `Work in these details the owner provided (only facts from here may be stated as specific): "${details}"` : "No extra details were provided — keep claims generic and honest.",
    "",
    'Respond ONLY as JSON in exactly this shape: { "posts": ["<post 1>", "<post 2>", "<post 3>"] }. No prose outside the JSON.',
  ].join("\n");

  try {
    const text = (
      await Promise.race([
        chat({
          system,
          messages: [{ role: "user", content: `Generate the 3 GBP ${goalKey || "update"} posts now.` }],
          maxTokens: 900,
          modelOverride: TOOL_AI_MODEL,
          surface: TOOL_AI_SURFACE,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("AI request timed out")), 15000)
        ),
      ])
    ).trim();
    const posts = parseStringArray(text, "posts");
    if (posts.length === 0) {
      return res.status(422).json({ ok: false, error: "Couldn't draft posts this time. Please try again." });
    }
    return res.json({ ok: true, posts });
  } catch (err: any) {
    if (err instanceof NoAIProviderError) {
      log.error("[gbp-post] no AI provider available", { error: err?.message });
      return res.status(503).json({ ok: false, error: "The AI service is temporarily unavailable. Please try again in a moment." });
    }
    log.warn("[gbp-post] generation failed", { error: err?.message || String(err) });
    return res.status(502).json({ ok: false, error: "Couldn't reach the AI service. Please try again in a moment." });
  }
}

/* ─── 10. Review-Response Generator (AI) ──────────────────────────────────
 *
 * POST /api/tools/review-response-generator
 *   body { businessName, trade, rating (1-5), reviewText, tone? }
 *   → { ok, replies: string[] }   (2-3 reply variants appropriate to rating)
 *
 * Mirrors the portal review-reply tool's prompt discipline (de-escalating
 * for 1-2★, gracious for 5★, never defensive, never fabricates facts) but
 * runs ANONYMOUSLY off the public free-tools surface (no auth / no per-user
 * budget — gated by the shared marketing AI surface + the in-memory IP rate
 * bucket like the other public tools).
 */
const REVIEW_TONES: Record<string, string> = {
  warm: "Warm and friendly, like a local owner who genuinely cares. At most one tasteful emoji.",
  professional: "Professional and courteous — polished, businesslike, warm but not casual. No emojis.",
  apologetic: "Apologetic but composed — sincerely acknowledge the concern and take ownership, while staying calm and constructive. Do not grovel or admit legal fault. No emojis.",
};

async function reviewResponseHandler(req: Request, res: Response) {
  if (!rateOk("review-response", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const trade = strField(req.body?.trade, 80);
  const reviewText = strField(req.body?.reviewText, 4000);
  const ratingRaw = Number(req.body?.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.min(5, Math.max(1, Math.round(ratingRaw))) : 0;
  let toneKey = strField(req.body?.tone, 20).toLowerCase();
  if (!businessName || !trade || !reviewText || !rating) {
    return res.status(400).json({ ok: false, error: "Business name, trade, star rating, and the review text are all required." });
  }
  // For low-star reviews, default to the de-escalating apologetic tone unless
  // the caller explicitly chose one.
  if (!REVIEW_TONES[toneKey]) toneKey = rating <= 2 ? "apologetic" : "professional";

  const cfg = validateConfig();
  if (!cfg.valid) {
    return res.status(503).json({ ok: false, error: "The AI service is temporarily unavailable. Please try again in a moment." });
  }

  const sentiment = rating >= 4 ? "positive" : rating === 3 ? "mixed" : "negative";
  const system = [
    `You help the owner of a ${trade} business ("${businessName}") write replies to a ${rating}-star (${sentiment}) customer review.`,
    "",
    "Write 3 short, distinct, on-brand reply options the owner can post as-is. Each reply must:",
    "- be 2-4 sentences",
    "- thank the customer and acknowledge their specific feedback",
    rating <= 2
      ? "- stay calm and NEVER defensive: take ownership where appropriate, apologize sincerely, and offer to make it right by inviting them to get in touch directly. Do not argue, blame the customer, or dispute facts."
      : rating === 3
        ? "- acknowledge both what went well and the concern, and invite them back to give you another chance"
        : "- reinforce the good experience and warmly invite them back or to refer others",
    "- sign off naturally as the business (do NOT invent a person's name)",
    "- NEVER fabricate facts, discounts, refunds, names, or details not present in the review",
    "- vary wording and structure across the 3 options",
    "",
    `Tone: ${REVIEW_TONES[toneKey]}`,
    "",
    'Respond ONLY as JSON in exactly this shape: { "replies": ["<reply 1>", "<reply 2>", "<reply 3>"] }. No prose outside the JSON.',
  ].join("\n");

  try {
    const text = (
      await Promise.race([
        chat({
          system,
          messages: [{ role: "user", content: `Here is the ${rating}-star review to reply to:\n\n"""${reviewText}"""` }],
          maxTokens: 800,
          modelOverride: TOOL_AI_MODEL,
          surface: TOOL_AI_SURFACE,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("AI request timed out")), 15000)
        ),
      ])
    ).trim();
    const replies = parseStringArray(text, "replies");
    if (replies.length === 0) {
      return res.status(422).json({ ok: false, error: "Couldn't draft replies this time. Please try again." });
    }
    return res.json({ ok: true, replies });
  } catch (err: any) {
    if (err instanceof NoAIProviderError) {
      log.error("[review-response] no AI provider available", { error: err?.message });
      return res.status(503).json({ ok: false, error: "The AI service is temporarily unavailable. Please try again in a moment." });
    }
    log.warn("[review-response] generation failed", { error: err?.message || String(err) });
    return res.status(502).json({ ok: false, error: "Couldn't reach the AI service. Please try again in a moment." });
  }
}

/* ─── 11. NAP Consistency Checker ─────────────────────────────────────────
 *
 * POST /api/tools/nap-checker
 *   body { businessName, address, phone, city? }
 *   → { ok, results[], summary, topFixes[] }
 *
 * REUSES the citation backend (#1812): the same CITATION_SOURCES + the same
 * robust `<name> <city> <directory>` SERP path (host-filtered, no `site:`) +
 * classifyCitationHit discipline. For each
 * directory hit we compare the listing's snippet/title against the canonical
 * NAP the user entered and flag genuine mismatches (phone digits differ, the
 * business name appears in a variant form). We are HONEST about uncertainty:
 * a host-only/unverified hit (couldn't confirm it's this business) is
 * reported as "couldn't verify", NEVER a false mismatch. We only assert a
 * mismatch when the listing is confirmed to be this business AND a NAP field
 * provably differs.
 */
type NapFieldStatus = "match" | "mismatch" | "unknown";
interface NapRowResult {
  source: string;
  label: string;
  /** "listed" = confirmed this business; "unverified" = found a page but couldn't confirm; "missing"/"unable-to-check". */
  listing: "listed" | "unverified" | "missing" | "unable-to-check";
  url?: string;
  name: NapFieldStatus;
  phone: NapFieldStatus;
  /** Human-readable note about the specific inconsistency, when any. */
  note?: string;
}

async function napCheckerHandler(req: Request, res: Response) {
  if (!rateOk("nap-checker", req, res)) return;
  const businessName = strField(req.body?.businessName, 120);
  const address = strField(req.body?.address, 200);
  const phone = strField(req.body?.phone, 40);
  const city = strField(req.body?.city, 80);
  if (!businessName || !phone) {
    return res.status(400).json({ ok: false, error: "Business name and phone number are required." });
  }
  const canonPhoneDigits = normPhoneDigits(phone);

  const checks = CITATION_SOURCES.map(async (src): Promise<NapRowResult> => {
    // Robust directory lookup — see citationCheckerHandler for the full
    // rationale. The old `site:<domain> "<name>" <city>` query was
    // over-constrained (site: + exact-quoted name returned zero results for
    // genuinely-listed businesses, so real listings were mis-reported as
    // "missing"). We run a normal `<name> <city> <directory>` query and let
    // classifyCitationHit host-filter + name/phone-match; a listing must be
    // hosted ON the directory domain AND confirmed before any NAP field is
    // compared, so no false mismatches. Cost parity: 1 (<=10-result) credit
    // per directory.
    const dirName = src.label.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const q = [businessName, city, dirName].filter(Boolean).join(" ");
    try {
      const result = await searchSerp({ query: q, country: "us", language: "en", num: 10 });
      const { status, url } = classifyCitationHit(result.organic, src, businessName, city, phone);

      // There is no "missing" outcome any more: an index miss is not an
      // absence (see the CitationStatus note above classifyCitationHit), and
      // this tool never had the evidence to assert one. It now falls through
      // to "unable-to-check" like any other directory we could not read.
      if (status === "unable-to-check") {
        return { source: src.source, label: src.label, listing: "unable-to-check", url, name: "unknown", phone: "unknown" };
      }
      // "unverified" → we found a page on the directory but couldn't confirm
      // it's THIS business. Per #1812 discipline: do NOT assert a NAP mismatch
      // on an unconfirmed hit — report it as "couldn't verify".
      if (status === "unverified") {
        return { source: src.source, label: src.label, listing: "unverified", url, name: "unknown", phone: "unknown" };
      }

      // status === "found" → confirmed this business. Now compare NAP fields
      // against the matched result's text. We can only flag a field when we
      // have positive evidence of a DIFFERENCE, never on absence.
      const hostHit = result.organic.find((o) => o.link === url) || result.organic[0];
      const haystack = `${hostHit?.title || ""} ${hostHit?.snippet || ""} ${hostHit?.link || ""}`;

      // Name: classifyCitationHit confirmed via name OR phone. If the name
      // token appears, it's a match; if it confirmed purely on phone digits
      // and the name token is absent, the listing may use a name variant.
      const nameAppears = looseIncludes(haystack, businessName);
      const nameStatus: NapFieldStatus = nameAppears ? "match" : "unknown";

      // Phone: only assert mismatch when the snippet contains a *different*
      // 7+ digit phone number and NOT the canonical one. Absence → unknown.
      const haystackDigits = normPhoneDigits(haystack);
      let phoneStatus: NapFieldStatus = "unknown";
      let note: string | undefined;
      const phoneMatches = canonPhoneDigits.length >= 7 && haystackDigits.includes(canonPhoneDigits);
      if (phoneMatches) {
        phoneStatus = "match";
      } else {
        // Look for any 10-11 digit run in the snippet that ISN'T the canonical
        // number — positive evidence of a different listed phone.
        const phoneRuns = haystack.match(/(?:\+?\d[\s().-]?){10,}/g) || [];
        const differing = phoneRuns
          .map((p) => normPhoneDigits(p))
          .find((d) => d.length >= 10 && !d.includes(canonPhoneDigits) && !canonPhoneDigits.includes(d));
        if (differing) {
          phoneStatus = "mismatch";
          note = "Listing shows a different phone number than your canonical NAP.";
        }
      }

      if (nameStatus === "unknown" && phoneStatus === "match") {
        // Confirmed by phone but the visible name differs from what was typed
        // → likely a name variation worth checking.
        note = note || "Listing confirmed by phone, but your exact business name wasn't visible — check for a name variation.";
      }

      return { source: src.source, label: src.label, listing: "listed", url, name: nameStatus, phone: phoneStatus, note };
    } catch {
      return { source: src.source, label: src.label, listing: "unable-to-check", name: "unknown", phone: "unknown" };
    }
  });

  const results = await Promise.all(checks);

  const listed = results.filter((r) => r.listing === "listed");
  const mismatches = listed.filter((r) => r.name === "mismatch" || r.phone === "mismatch" || (r.note && r.phone !== "match"));
  // Consistency score: of the listings we could CONFIRM, what fraction had no
  // detected mismatch. Honest denominator = confirmed listings only (we don't
  // penalise for listings we couldn't verify).
  const confirmedClean = listed.filter((r) => r.phone === "match" && r.name === "match").length;
  const score = listed.length > 0 ? Math.round((confirmedClean / listed.length) * 100) : null;

  const topFixes = mismatches
    .map((r) => r.note ? `${r.label}: ${r.note}` : `${r.label}: review your Name / Phone for consistency.`)
    .slice(0, 5);

  return res.json({
    ok: true,
    businessName,
    address: address || null,
    phone,
    city: city || null,
    results,
    summary: {
      checked: results.length,
      listed: listed.length,
      unverified: results.filter((r) => r.listing === "unverified").length,
      missing: results.filter((r) => r.listing === "missing").length,
      mismatches: mismatches.length,
      score,
    },
    topFixes,
  });
}

/* ─── Router registration ─────────────────────────────────────────────── */

export function registerFreeToolsRoutes(app: Express): void {
  app.post("/api/tools/tool-lead", toolLeadHandler);
  app.post("/api/tools/google-review-link", googleReviewLinkHandler);
  app.post("/api/tools/local-search-checker", localSearchCheckerHandler);
  app.post("/api/tools/citation-checker", citationCheckerHandler);
  app.get("/api/tools/local-rankflux", localRankfluxHandler);
  app.post("/api/tools/rankflux-subscribe", rankfluxSubscribeHandler);
  app.post("/api/tools/local-rank-grid", localRankGridHandler);
  // Wave 6E + 6F — BrightLocal-parity SERP Checker + Rank Tracker.
  app.post("/api/tools/local-serp-check", localSerpCheckHandler);
  app.post("/api/tools/local-rank-tracker", localRankTrackerHandler);
  // Wave — three audit-flagged tools: AI GBP post generator, AI review-
  // response generator, NAP consistency checker (reuses the citation backend).
  app.post("/api/tools/gbp-post-generator", gbpPostGeneratorHandler);
  app.post("/api/tools/review-response-generator", reviewResponseHandler);
  app.post("/api/tools/nap-checker", napCheckerHandler);
}
