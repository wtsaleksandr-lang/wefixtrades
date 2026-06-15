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
import { geocodeAddress } from "./originGeocode";

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
  /** Genuine same-niche category this competitor matched (for "Plumber · …" UI). */
  category: string;
  /** Straight-line km from the subject business; null when the subject coords
   *  are unknown (no centroid resolvable). Out-of-radius competitors are dropped. */
  distanceKm: number | null;
  /** Set true when the peer-relevance filter classed this competitor as a
   *  national/global player (a giant) and excluded it from the head-to-head.
   *  Kept on the entry only so a later UI could surface "national players
   *  dominate this category" context — it is NEVER part of the comparison set. */
  nationalPlayer?: boolean;
}

/* ─── Same-niche category matching ───────────────────────────────────────────
 * Today the only filter was exact-name dedup — Places/Outscraper results were
 * trusted blindly, so a "plumber" search could surface a hardware store or a
 * restaurant that merely mentioned the trade. We now keep a competitor ONLY if
 * its Places types/primaryType (or Outscraper type/category) intersect the
 * searched trade's known Places types, OR the searched category text itself.
 *
 * Maps every supported trade to the Google Places `types` it legitimately
 * surfaces under. A general (derived-label) search has no entry here and falls
 * back to a token-overlap check against the search category text. */
const TRADE_PLACES_TYPES: Record<string, string[]> = {
  plumbing: ["plumber"],
  plumber: ["plumber"],
  hvac: ["hvac_contractor"],
  electrical: ["electrician"],
  electrician: ["electrician"],
  cleaning: ["cleaning_service", "window_cleaning_service", "house_cleaning_service", "laundry"],
  landscaping: ["landscaper", "lawn_care_service", "landscaping"],
  landscaper: ["landscaper", "lawn_care_service", "landscaping"],
  roofing: ["roofing_contractor"],
  roofer: ["roofing_contractor"],
  locksmith: ["locksmith"],
  painting: ["painter"],
  painter: ["painter"],
  flooring: ["flooring_contractor", "flooring_store"],
  carpentry: ["carpenter"],
  renovation: ["general_contractor", "remodeling_contractor"],
  remodeling: ["general_contractor", "remodeling_contractor"],
  handyman: ["handyman", "general_contractor"],
  pest: ["pest_control_service"],
  moving: ["moving_company", "mover"],
  garage: ["garage_door_service"],
  construction: ["general_contractor"],
};

/** Tokens that are too generic to anchor a token-overlap niche match. */
const STOP_TOKENS = new Set([
  "service", "services", "company", "co", "inc", "ltd", "llc", "the", "and",
  "near", "in", "of", "for", "&", "contractor", "contractors", "shop", "store",
]);

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

/**
 * True when a competitor's category signals (its Places types/primaryType, or
 * Outscraper type/category strings) genuinely match the searched trade/category.
 *
 *  - Known trade → require intersection with that trade's allowed Places types.
 *    If the competitor exposes NO type signal at all (some Outscraper rows), we
 *    fall back to the token check so we don't drop legitimate rows blindly.
 *  - Derived/general category (not a known trade) → token-overlap between the
 *    search category and the competitor's type/category/name signals.
 */
export function isSameNiche(
  searchCategory: string,
  competitorTypes: string[],
  competitorPrimaryType?: string | null,
  competitorName?: string,
): boolean {
  const cat = (searchCategory || "").toString().trim().toLowerCase();
  if (!cat) return false;

  const sigTypes = [
    ...(competitorPrimaryType ? [competitorPrimaryType] : []),
    ...(Array.isArray(competitorTypes) ? competitorTypes : []),
  ]
    .map((t) => (t || "").toString().trim().toLowerCase())
    .filter(Boolean);

  const allowed = TRADE_PLACES_TYPES[cat];
  if (allowed) {
    // Known trade: a hard Places-type intersection is the strongest signal.
    if (sigTypes.some((t) => allowed.includes(t))) return true;
    // Competitor exposes type signals, none of which matched the trade's
    // allowed types → genuinely a different niche (hardware store, restaurant…).
    if (sigTypes.length > 0) return false;
    // No usable type signal at all (some Outscraper rows): don't drop blindly —
    // fall through to the token check against name so a legit row survives.
  }

  // Token overlap: search category vs the competitor's type strings + name.
  // Covers derived/general categories and the no-type-signal trade fallback.
  const catTokens = new Set(tokenize(cat));
  if (catTokens.size === 0) return true; // can't discriminate → keep
  const sigTokens = new Set<string>();
  for (const t of sigTypes) for (const tk of tokenize(t)) sigTokens.add(tk);
  for (const tk of tokenize(competitorName || "")) sigTokens.add(tk);
  for (const tk of catTokens) if (sigTokens.has(tk)) return true;
  return false;
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Competitors farther than this from the subject are dropped (matches the 30km bias). */
const MAX_DISTANCE_KM = 30;

/* ─── Peer-relevance (same-LEAGUE) filter ─────────────────────────────────────
 * Same-niche + nearby is not enough: a small local freight forwarder (e.g.
 * "Access Air Mississauga") must NOT be benchmarked head-to-head against
 * FedEx / DHL / UPS just because those national giants also surface for
 * "freight forwarding near Toronto" and sit inside the 30km radius. The audit's
 * comparison set, marketLeader, and review-gap narrative must name a PEER — a
 * business in the same SIZE LEAGUE as the subject — not an out-of-league giant.
 *
 * Two complementary signals exclude a giant from the head-to-head:
 *
 *  1. Known-national-brand match — a curated, maintainable list of national /
 *     global brands and big franchises whose name alone proves they are not a
 *     local peer (FedEx, DHL, UPS, Purolator, …, plus common across-trades
 *     franchise names). Name-based, so it catches a giant even with sparse
 *     review data.
 *
 *  2. Review-magnitude (size-tier) — TUNED to avoid dropping legitimate LOCAL
 *     leaders. A busy local independent can carry several HUNDRED reviews and is
 *     a real competitor; the giants carry THOUSANDS-to-tens-of-thousands. So:
 *       • Absolute: reviewsCount ≥ PEER_REVIEW_ABS_CEILING → out-of-league. No
 *         single-location local independent realistically has this many.
 *       • Relative: only at an EXTREME ratio — reviewsCount ≥ PEER_REVIEW_RATIO×
 *         the subject AND reviewsCount ≥ PEER_REVIEW_RATIO_FLOOR. The floor stops
 *         a brand-new subject (2 reviews) from making a normal 200-review local
 *         leader look like a giant.
 *
 * Conservative by design: the #1 risk is dropping a real local competitor, so
 * every threshold biases toward KEEPING. Only clear giants are removed. If the
 * filter would empty the comparison entirely, we fall back to the original set
 * rather than show an empty head-to-head. */

/** Absolute review ceiling: at/above this, a competitor is treated as a
 *  national/regional giant. Tuned high — busy local independents top out in the
 *  hundreds to low-thousands; FedEx-class brands sit in the 10k+ range, so 3000
 *  clears even an unusually-reviewed local leader. */
const PEER_REVIEW_ABS_CEILING = 3000;

/** Relative multiplier: a competitor with ≥ this many times the subject's
 *  reviews is a candidate giant — but only combined with the floor below, so a
 *  near-zero-review subject can't trip it against an ordinary local leader. */
const PEER_REVIEW_RATIO = 40;

/** The relative rule only fires when the competitor itself has at least this
 *  many reviews. Below it, even a 40× ratio is just "an established local beats
 *  a brand-new shop" — NOT a giant — so we keep the competitor. */
const PEER_REVIEW_RATIO_FLOOR = 1000;

/**
 * Curated national/global brands + big multi-location franchises. Matched
 * word-bounded against the competitor name (case-insensitive). Intentionally a
 * plain, maintainable constant — extend it as new giants surface. Names are
 * lowercased; multi-word brands match as a contiguous phrase.
 *
 * Grouped by domain for maintainability:
 *  - Freight / parcel / logistics giants (the Access Air case)
 *  - National home-services franchises common across the trades we audit
 *  - National big-box / supply chains that can mis-surface in a trade search
 */
const NATIONAL_BRANDS: string[] = [
  // Freight / parcel / courier / logistics giants
  "fedex", "fed ex", "dhl", "ups", "united parcel", "purolator", "canada post",
  "usps", "postnl", "tnt express", "ceva", "ceva logistics", "kuehne", "kuehne nagel",
  "kuehne + nagel", "db schenker", "schenker", "expeditors", "dsv", "dsv air",
  "geodis", "nippon express", "c.h. robinson", "ch robinson", "dachser",
  "bollore", "hellmann", "panalpina", "agility logistics", "maersk", "kerry logistics",
  "xpo", "xpo logistics", "j.b. hunt", "jb hunt", "old dominion", "estes express",
  "yrc", "tforce", "day & ross", "manitoulin", "loomis express",
  // National home-services / trades franchises
  "roto-rooter", "roto rooter", "mr. rooter", "mr rooter", "mister rooter",
  "mr. handyman", "mr handyman", "mister handyman", "ace handyman",
  "one hour heating", "mister sparky", "mr. sparky", "mr sparky",
  "benjamin franklin plumbing", "aire serv", "aire-serv", "molly maid",
  "merry maids", "the maids", "servpro", "stanley steemer", "chemdry",
  "chem-dry", "terminix", "orkin", "rentokil", "two men and a truck",
  "u-haul", "uhaul", "u haul", "1-800-got-junk", "1 800 got junk", "got junk",
  "junk king", "college hunks", "the brothers that just do gutters",
  "trugreen", "weed man", "scotts lawn", "rotech", "precision door",
  // National big-box / supply chains (can mis-surface in trade searches)
  "home depot", "the home depot", "lowe's", "lowes", "rona", "canadian tire",
  "ferguson", "grainger", "wurth", "sherwin-williams", "sherwin williams",
  "general electric",
];

/** Word-bounded, case-insensitive: true when the competitor name contains a
 *  curated national brand as a whole token/phrase. Word-bounded so "Upstate
 *  Plumbing" does NOT match "ups" and "Upscale Movers" does NOT match a brand. */
export function matchesNationalBrand(name: string): boolean {
  const n = (name || "").toLowerCase();
  if (!n) return false;
  for (const brand of NATIONAL_BRANDS) {
    // Escape regex specials in the brand, allow flexible whitespace between words.
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (re.test(n)) return true;
  }
  return false;
}

/**
 * True when a competitor is OUT OF LEAGUE for the given subject — a national /
 * global giant that should not appear in the local head-to-head. Returns the
 * reason for logging. Conservative: only fires on a curated brand match or a
 * clear size-tier signal (see the threshold constants above).
 */
export function isOutOfLeague(
  c: Pick<CompetitorEntry, "name" | "reviewsCount">,
  subjectReviewsCount: number,
): { out: boolean; reason: string } {
  if (matchesNationalBrand(c.name)) return { out: true, reason: "national-brand" };

  const reviews = typeof c.reviewsCount === "number" ? c.reviewsCount : 0;
  // Primary: absolute ceiling — no local independent realistically reaches this.
  if (reviews >= PEER_REVIEW_ABS_CEILING) {
    return { out: true, reason: `reviews≥${PEER_REVIEW_ABS_CEILING}` };
  }
  // Secondary: extreme ratio AND a high absolute floor — catches a giant the
  // absolute ceiling missed without dropping a local leader who merely dwarfs a
  // brand-new subject.
  const subj = typeof subjectReviewsCount === "number" && subjectReviewsCount > 0 ? subjectReviewsCount : 0;
  if (subj > 0 && reviews >= PEER_REVIEW_RATIO_FLOOR && reviews >= PEER_REVIEW_RATIO * subj) {
    return { out: true, reason: `ratio≥${PEER_REVIEW_RATIO}x (reviews ${reviews} vs subject ${subj})` };
  }
  return { out: false, reason: "" };
}

/**
 * Split a same-niche, geo-bounded competitor list into peers (same league) and
 * out-of-league giants. Tags giants with nationalPlayer:true. NEVER over-filters
 * to zero: if every competitor is judged out-of-league, fall back to the closest
 * in size (or the original set) so the head-to-head is never empty.
 */
function applyPeerRelevance(
  competitors: CompetitorEntry[],
  subjectReviewsCount: number,
): { peers: CompetitorEntry[]; nationalPlayers: CompetitorEntry[] } {
  const peers: CompetitorEntry[] = [];
  const nationalPlayers: CompetitorEntry[] = [];
  for (const c of competitors) {
    const { out, reason } = isOutOfLeague(c, subjectReviewsCount);
    if (out) {
      c.nationalPlayer = true;
      nationalPlayers.push(c);
      log.info("[E1 peer-filter] excluded out-of-league competitor", { name: c.name, reviews: c.reviewsCount, reason });
    } else {
      peers.push(c);
    }
  }

  log.info("[E1 peer-filter] kept vs excluded:", {
    kept: peers.length,
    excluded: nationalPlayers.length,
    subjectReviews: subjectReviewsCount,
  });

  // Never over-filter to zero. If the peer filter removed EVERY competitor, the
  // subject still deserves a comparison — surface the closest-in-size ones rather
  // than an empty head-to-head. We pick the smallest-by-reviews of the excluded
  // set (the least out-of-league) so the fallback is as peer-like as possible.
  if (peers.length === 0 && nationalPlayers.length > 0) {
    const fallback = [...nationalPlayers].sort((a, b) => a.reviewsCount - b.reviewsCount);
    log.warn("[E1 peer-filter] peer filter emptied the set — falling back to closest-in-size competitors", {
      fallbackCount: fallback.length,
      fallbackNames: fallback.map((c) => c.name),
    });
    // These are kept in the comparison but stay tagged nationalPlayer:true so a
    // UI could still label them honestly.
    return { peers: fallback, nationalPlayers: [] };
  }

  return { peers, nationalPlayers };
}

export interface CompetitorResult {
  competitors: CompetitorEntry[];
  areaAverageRating: number;
  areaAverageReviews: number;
  marketLeader: CompetitorEntry | null;
  /** Out-of-league national/global players the peer filter pulled OUT of the
   *  head-to-head. Empty unless giants surfaced. Provided so a later UI could
   *  show "national players dominate this category" context — these are NOT in
   *  `competitors` and never feed marketLeader / the review-gap narrative. */
  nationalPlayers?: CompetitorEntry[];
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
 *
 * The peer-relevance filter runs FIRST so the comparison set, marketLeader, area
 * averages, and the downstream review-gap narrative are all built from PEERS
 * (same-league locals) — never from an out-of-league national giant.
 * `subjectReviewsCount` powers the relative size-tier heuristic; when unknown
 * (0) only the absolute ceiling + brand list apply.
 */
function aggregate(competitors: CompetitorEntry[], subjectReviewsCount = 0): CompetitorResult {
  const { peers, nationalPlayers } = applyPeerRelevance(competitors, subjectReviewsCount);
  return { ...aggregatePeers(peers), nationalPlayers };
}

/** Builds the averages + marketLeader from an already-peer-filtered list. */
function aggregatePeers(competitors: CompetitorEntry[]): Omit<CompetitorResult, "nationalPlayers"> {
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
  // Rank-math reconciliation: the report's businessRank + review-gap narrative
  // are both reviewsCount-based (ReportView sorts competitors by reviewsCount),
  // so the marketLeader MUST be the highest-reviewsCount competitor — not the
  // highest composite-score one. Picking by score could name a "leader" the
  // user already out-reviews, contradicting the rank shown right beside it.
  // Deterministic tie-break: higher score, then name, so equal-review ties are
  // stable across runs.
  const marketLeader = competitors.reduce<CompetitorEntry | null>((best, c) => {
    if (!best) return c;
    if (c.reviewsCount !== best.reviewsCount) return c.reviewsCount > best.reviewsCount ? c : best;
    if (c.score !== best.score) return c.score > best.score ? c : best;
    return c.name < best.name ? c : best;
  }, null);
  return { competitors, areaAverageRating, areaAverageReviews, marketLeader };
}

/* ─── Primary: Google Places API (New) ─── */

export async function fetchPlacesCompetitors(
  searchCategory: string,
  city: string,
  businessName: string,
  stateCode?: string,
  coords?: { lat: number; lng: number } | null,
  subjectPlaceId?: string,
  subjectReviewsCount = 0,
): Promise<CompetitorResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");

  const location = stateCode ? `${city}, ${stateCode}` : city;
  const textQuery = `${searchCategory} near ${location}`;
  log.info("[E1 Places competitors] query:", { detail: textQuery });

  // Resolve a centroid to ALWAYS geo-bound the search. Prefer the subject's own
  // coords; when those are absent (common — bizCoords is frequently null) fall
  // back to geocoding the city/state to a centroid so the search is still local
  // rather than a metro-wide "near Toronto" scatter. distanceKm is computed off
  // whichever centroid we end up with (null only if we resolve none).
  let center: { lat: number; lng: number } | null =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? { lat: coords.lat, lng: coords.lng }
      : null;
  if (!center) {
    try {
      center = await geocodeAddress(location);
      if (center) log.info("[E1 Places competitors] geocoded city centroid for bias", { detail: location });
    } catch (e) {
      log.warn("[E1 Places competitors] city centroid geocode failed", { error: String(e) });
    }
  }

  const body: Record<string, any> = {
    textQuery,
    maxResultCount: 20, // over-fetch: we filter by niche + distance, then slice to 8
    languageCode: "en",
  };
  if (center) {
    body.locationBias = {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
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
          "places.googleMapsUri,places.photos,places.types,places.primaryType," +
          "places.location",
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
  const rawCount = places.length;
  log.info("[E1 Places competitors] raw count:", { detail: rawCount });

  const lowerBizName = businessName.toLowerCase();
  const lowerSubjectId = (subjectPlaceId || "").trim();
  let droppedNiche = 0;
  let droppedDistance = 0;

  const mapped: CompetitorEntry[] = places
    .filter((p: any) => {
      // Self-exclusion: by placeId FIRST (exact, catches "Bob's Plumbing" vs
      // "Bob's Plumbing Ltd."), then the fuzzy name fallback.
      if (lowerSubjectId && (p.id || "").trim() === lowerSubjectId) return false;
      const n = (p.displayName?.text || "").toLowerCase();
      return n !== lowerBizName;
    })
    .filter((p: any) => {
      // Same-niche gate: keep only genuinely-matching categories.
      const types = Array.isArray(p.types) ? p.types : [];
      const ok = isSameNiche(searchCategory, types, p.primaryType, p.displayName?.text || "");
      if (!ok) droppedNiche++;
      return ok;
    })
    .map((p: any) => {
      const rating = typeof p.rating === "number" ? p.rating : 0;
      const reviewsCount = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
      const hasWebsite = !!p.websiteUri;
      // Photos exist but media fetch requires a separate signed URL with the key;
      // we set photoUrl to null to avoid embedding the key in the audit payload.
      const hasPhoto = !!(p.photos && p.photos.length > 0);
      const score = scoreCompetitor(rating, reviewsCount, hasWebsite, hasPhoto);
      const loc = p.location;
      let distanceKm: number | null = null;
      if (center && loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        distanceKm = +haversineKm(center, { lat: loc.latitude, lng: loc.longitude }).toFixed(2);
      }
      const category = (p.primaryType || (Array.isArray(p.types) ? p.types[0] : "") || "")
        .toString()
        .replace(/_/g, " ")
        .trim();
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
        category,
        distanceKm,
      };
    })
    .filter((c: CompetitorEntry) => {
      // Geo-bound hard cut: drop competitors beyond the radius. Keep rows whose
      // distance we couldn't compute (no centroid / no place location) so a
      // missing coordinate doesn't silently empty the list.
      if (c.distanceKm !== null && c.distanceKm > MAX_DISTANCE_KM) {
        droppedDistance++;
        return false;
      }
      return true;
    });

  const competitors = mapped.slice(0, 8);
  log.info("[E1 Places competitors] kept vs raw:", {
    arg0: competitors.length,
    arg1: "kept of",
    arg2: rawCount,
    arg3: "raw (droppedNiche:",
    arg4: droppedNiche,
    arg5: "droppedDistance:",
    arg6: droppedDistance,
    arg7: ")",
  });
  return aggregate(competitors, subjectReviewsCount);
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
  coords?: { lat: number; lng: number } | null,
  subjectPlaceId?: string,
  subjectReviewsCount = 0,
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

  // Centroid for distance: subject coords, else geocode the city/state.
  const locForGeo = stateCode ? `${city}, ${stateCode}` : city;
  let center: { lat: number; lng: number } | null =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? { lat: coords.lat, lng: coords.lng }
      : null;
  if (!center) {
    try {
      center = await geocodeAddress(locForGeo);
    } catch (e) {
      log.warn("[E1 Outscraper competitors] city centroid geocode failed", { error: String(e) });
    }
  }

  const lowerBizName = businessName.toLowerCase();
  const lowerSubjectId = (subjectPlaceId || "").trim();
  let droppedNiche = 0;
  let droppedDistance = 0;

  const mapped: CompetitorEntry[] = results
    .filter((b: any) => {
      // Self-exclude by place_id first, then fuzzy name.
      if (lowerSubjectId && (b.place_id || "").trim() === lowerSubjectId) return false;
      return (b.name || "").toLowerCase() !== lowerBizName;
    })
    .filter((b: any) => {
      // Same-niche gate on Outscraper's category fields. Outscraper exposes
      // `type` (primary) and `category`/`categories`; map them into the same
      // niche check used for Places (token overlap, since Outscraper labels are
      // human strings like "Plumber" not Places enum types).
      const typeStrings: string[] = [];
      if (b.type) typeStrings.push(String(b.type));
      if (b.category) typeStrings.push(String(b.category));
      if (Array.isArray(b.categories)) for (const c of b.categories) if (c) typeStrings.push(String(c));
      if (b.subtypes) typeStrings.push(String(b.subtypes));
      const ok = isSameNiche(searchCategory, typeStrings, String(b.type || ""), b.name || "");
      if (!ok) droppedNiche++;
      return ok;
    })
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
      const lat = typeof b.latitude === "number" ? b.latitude : null;
      const lng = typeof b.longitude === "number" ? b.longitude : null;
      let distanceKm: number | null = null;
      if (center && lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
        distanceKm = +haversineKm(center, { lat, lng }).toFixed(2);
      }
      const category = (b.type || b.category || "").toString().trim();
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
        category,
        distanceKm,
      };
    })
    .filter((c: CompetitorEntry) => {
      if (c.distanceKm !== null && c.distanceKm > MAX_DISTANCE_KM) {
        droppedDistance++;
        return false;
      }
      return true;
    });

  const competitors = mapped.slice(0, 8);
  log.info("[E1 Outscraper competitors] kept vs raw:", {
    arg0: competitors.length,
    arg1: "kept of",
    arg2: results.length,
    arg3: "raw (droppedNiche:",
    arg4: droppedNiche,
    arg5: "droppedDistance:",
    arg6: droppedDistance,
    arg7: ")",
  });
  return aggregate(competitors, subjectReviewsCount);
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
  subjectPlaceId?: string,
  subjectReviewsCount = 0,
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

  // Cache key includes stateCode + a coarse geo bucket so two different
  // "Springfield"s (different states) — and two distant neighborhoods of the
  // same city — never share a competitor set. Bucket = lat/lng rounded to ~0.1°
  // (~11km), aligned with the 30km local radius.
  const geoBucket =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      ? `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`
      : "nogeo";
  const compCacheKey = `competitors:${category.toLowerCase().trim()}:${(stateCode || "").toLowerCase().trim()}:${city.toLowerCase().trim()}:${geoBucket}`;

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
    const placesResult = await fetchPlacesCompetitors(category, city, businessName, stateCode, coords, subjectPlaceId, subjectReviewsCount);
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
      const outResult = await fetchOutscraperCompetitorsFallback(category, city, businessName, stateCode, coords, subjectPlaceId, subjectReviewsCount);
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
