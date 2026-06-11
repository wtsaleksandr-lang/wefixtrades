/**
 * locationCountry — derive an ISO-3166 alpha-2 country code (lowercase)
 * from a free-form "search location" string, e.g. "Toronto, Ontario, Canada"
 * → "ca", "Denver, CO" → "us", "M5V 2T6" → "ca".
 *
 * Why this exists (T-sweep 2026-06-11, P1): the Local SERP Checker defaulted
 * country=us blindly, so a visitor typing a Canadian city got US results
 * (Toronto → Baltimore). The tool serves North American trades — the typed
 * location is the strongest signal of which country index to query, so both
 * the client (auto-set the country select) and the server (override the
 * blind default) derive from it via this single shared implementation.
 *
 * Design constraints:
 * - Pure + synchronous + dependency-free: no geocoding API call on the hot
 *   path of a free tool. String evidence only.
 * - CONSERVATIVE: only resolve on unambiguous evidence. Ambiguous names
 *   (London, Sydney, Hamilton, Windsor, Victoria, Richmond…) return null and
 *   the caller keeps its current default. A wrong confident answer is worse
 *   than no answer.
 * - Only ever returns codes from SERP_SUPPORTED_COUNTRIES (the 20 countries
 *   the SERP providers reliably target) — or null.
 *
 * Evidence tiers, strongest first (later tiers only run if earlier found
 * nothing):
 *   1. Explicit country mention ("canada", "united kingdom", "usa", …)
 *   2. Canadian postal code (full "M5V 2T6" or FSA "M5V") — very distinctive
 *   3. State / province (full names + trailing 2-letter codes); when several
 *      match, the LAST occurrence wins because location strings run
 *      specific → general ("Ontario, California" → us)
 *   4. Unambiguous major-city names (CA + US lists below)
 *   5. 5-digit US ZIP
 */

export const SERP_SUPPORTED_COUNTRIES = [
  "us", "gb", "ca", "au", "de", "fr", "it", "es", "nl", "be",
  "mx", "br", "in", "jp", "kr", "sg", "nz", "ie", "za", "ae",
] as const;

export type SerpCountry = (typeof SERP_SUPPORTED_COUNTRIES)[number];

/* ─── Tier 1: explicit country names / aliases ─────────────────────────── */

/**
 * Phrases that, when present, must be removed BEFORE the country-name scan
 * because they contain a country name they do not mean ("New Mexico" the US
 * state contains "mexico"; "Northern Ireland" is gb, not ie).
 */
const COUNTRY_FALSE_FRIENDS: Array<{ phrase: string; country: SerpCountry | null }> = [
  { phrase: "new mexico", country: "us" },
  { phrase: "northern ireland", country: "gb" },
  { phrase: "new england", country: "us" },
];

const COUNTRY_NAMES: Array<{ name: string; country: SerpCountry }> = [
  { name: "united states of america", country: "us" },
  { name: "united states", country: "us" },
  { name: "usa", country: "us" },
  { name: "u s a", country: "us" }, // "U.S.A." after punctuation strip
  { name: "u s", country: "us" }, // "U.S."
  { name: "canada", country: "ca" },
  { name: "united kingdom", country: "gb" },
  { name: "great britain", country: "gb" },
  { name: "england", country: "gb" },
  { name: "scotland", country: "gb" },
  { name: "wales", country: "gb" },
  { name: "uk", country: "gb" },
  { name: "australia", country: "au" },
  { name: "germany", country: "de" },
  { name: "deutschland", country: "de" },
  { name: "france", country: "fr" },
  { name: "italy", country: "it" },
  { name: "italia", country: "it" },
  { name: "spain", country: "es" },
  { name: "espana", country: "es" },
  { name: "netherlands", country: "nl" },
  { name: "holland", country: "nl" },
  { name: "belgium", country: "be" },
  { name: "mexico", country: "mx" },
  { name: "brazil", country: "br" },
  { name: "brasil", country: "br" },
  { name: "india", country: "in" },
  { name: "japan", country: "jp" },
  { name: "south korea", country: "kr" },
  { name: "korea", country: "kr" },
  { name: "singapore", country: "sg" },
  { name: "new zealand", country: "nz" },
  { name: "ireland", country: "ie" },
  { name: "south africa", country: "za" },
  { name: "united arab emirates", country: "ae" },
  { name: "uae", country: "ae" },
  { name: "dubai", country: "ae" },
  { name: "abu dhabi", country: "ae" },
];

/* ─── Tier 3: provinces / states ───────────────────────────────────────── */

const CA_PROVINCE_NAMES = [
  "ontario", "quebec", "british columbia", "alberta", "manitoba",
  "saskatchewan", "nova scotia", "new brunswick", "newfoundland",
  "labrador", "prince edward island", "northwest territories",
  "nunavut", "yukon",
];

const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia", "puerto rico",
];

/**
 * Trailing 2-letter codes, accepted only as the LAST token of a
 * comma-separated part ("Toronto, ON" / "Denver CO"). The two sets are
 * disjoint. "CA" is deliberately EXCLUDED: in "City, CA" it almost always
 * means California, but for Canadian cities ("Toronto, CA") it means Canada
 * — instead of guessing we let the city tier (or the caller's default)
 * decide.
 */
const CA_PROVINCE_CODES = new Set([
  "on", "qc", "bc", "ab", "mb", "sk", "ns", "nb", "nl", "pe", "pei", "nt", "nu", "yt",
]);

const US_STATE_CODES = new Set([
  "al", "ak", "az", "ar", "co", "ct", "de", "fl", "ga", "hi", "id", "il",
  "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo",
  "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or",
  "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi",
  "wy", "dc", "pr",
]);

/* ─── Tier 4: unambiguous major cities ─────────────────────────────────── */

/**
 * Canadian cities whose names do not collide with sizeable cities in other
 * supported countries. Deliberately omitted as ambiguous: London, Hamilton,
 * Windsor, Kingston, Cambridge, Waterloo, Victoria, Vernon, Burlington,
 * Surrey, Sydney (NS), Dartmouth, Whitby, Peterborough, Stratford,
 * Woodstock, Richmond.
 */
const CA_CITIES = [
  "toronto", "montreal", "vancouver", "calgary", "edmonton", "ottawa",
  "winnipeg", "quebec city", "ville de quebec", "mississauga", "brampton",
  "scarborough", "etobicoke", "north york", "markham", "vaughan",
  "richmond hill", "oakville", "oshawa", "halifax", "laval", "gatineau",
  "longueuil", "sherbrooke", "saguenay", "trois rivieres", "drummondville",
  "repentigny", "brossard", "terrebonne", "rimouski", "chicoutimi",
  "saskatoon", "regina", "moncton", "fredericton", "charlottetown",
  "whitehorse", "yellowknife", "iqaluit", "kelowna", "kamloops", "nanaimo",
  "abbotsford", "coquitlam", "burnaby", "lethbridge", "red deer",
  "medicine hat", "grande prairie", "airdrie", "thunder bay", "sudbury",
  "guelph", "kitchener", "brantford", "st catharines", "barrie", "timmins",
  "north bay", "orillia", "milton ontario", "ajax ontario",
];

/**
 * US cities — unambiguous within the supported-country set. Omitted as
 * colliding with UK/CA/etc.: Birmingham, Durham, Norfolk, Lincoln, Newark
 * (kept — Newark NJ dwarfs Newark-on-Trent), Aurora (CO/IL vs Aurora ON —
 * omitted), Toledo (vs Spain), Berlin NH, Paris TX.
 */
const US_CITIES = [
  "new york", "nyc", "brooklyn", "manhattan", "bronx", "staten island",
  "los angeles", "chicago", "houston", "phoenix", "philadelphia",
  "san antonio", "san diego", "dallas", "san jose", "austin",
  "jacksonville", "fort worth", "columbus", "charlotte", "indianapolis",
  "san francisco", "seattle", "denver", "nashville", "oklahoma city",
  "el paso", "boston", "portland", "las vegas", "detroit", "memphis",
  "louisville", "baltimore", "milwaukee", "albuquerque", "tucson",
  "fresno", "sacramento", "kansas city", "atlanta", "omaha",
  "colorado springs", "raleigh", "miami", "virginia beach", "oakland",
  "minneapolis", "tulsa", "tampa", "new orleans", "wichita", "cleveland",
  "bakersfield", "anaheim", "honolulu", "santa ana", "riverside",
  "corpus christi", "stockton", "st paul", "saint paul", "st louis",
  "saint louis", "cincinnati", "pittsburgh", "greensboro", "anchorage",
  "plano", "orlando", "irvine", "newark", "chula vista", "fort wayne",
  "jersey city", "chandler", "madison", "lubbock", "scottsdale", "reno",
  "buffalo", "gilbert", "boise", "spokane", "tacoma", "baton rouge",
  "des moines", "grand rapids", "salt lake city", "huntsville",
  "amarillo", "little rock", "knoxville", "worcester", "chattanooga",
  "fort lauderdale", "salem oregon", "santa rosa", "eugene", "pasadena",
];

/* ─── Postal patterns ──────────────────────────────────────────────────── */

// Full Canadian postal code "M5V 2T6" / "M5V2T6" (first letter never D,F,I,O,Q,U,W,Z)
const CA_POSTAL_FULL = /(?:^|[^a-z0-9])([abceghj-nprstvxy][0-9][abceghj-nprstv-z])\s?([0-9][abceghj-nprstv-z][0-9])(?![a-z0-9])/i;
// FSA alone: "M5V" as its own token
const CA_POSTAL_FSA = /(?:^|[^a-z0-9])([abceghj-nprstvxy][0-9][abceghj-nprstv-z])(?![a-z0-9])/i;
// US ZIP / ZIP+4
const US_ZIP = /(?:^|[^0-9a-z-])([0-9]{5})(?:-[0-9]{4})?(?![0-9a-z])/i;

/* ─── Helpers ──────────────────────────────────────────────────────────── */

/** lowercase, strip diacritics, replace punctuation with spaces, collapse. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Index of the LAST whole-word occurrence of `phrase` in `haystack`, or -1. */
function lastWordIndex(haystack: string, phrase: string): number {
  const padded = ` ${haystack} `;
  const idx = padded.lastIndexOf(` ${phrase} `);
  return idx === -1 ? -1 : idx; // relative offsets only ever compared to each other
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

/**
 * Derive the country for a free-form location string.
 * Returns a lowercase ISO code from SERP_SUPPORTED_COUNTRIES, or null when
 * the string carries no unambiguous country evidence (caller keeps its
 * current default).
 */
export function deriveCountryFromLocation(location: string): SerpCountry | null {
  const raw = (location || "").trim();
  if (!raw) return null;

  let norm = normalize(raw);
  if (!norm) return null;

  // Tier 1 — explicit country names. Strip false friends first; if a false
  // friend itself implies a country, remember it as weak tier-3 evidence.
  let falseFriendCountry: SerpCountry | null = null;
  for (const ff of COUNTRY_FALSE_FRIENDS) {
    if (lastWordIndex(norm, ff.phrase) !== -1) {
      norm = ` ${norm} `.split(` ${ff.phrase} `).join(" ").replace(/\s+/g, " ").trim();
      if (ff.country) falseFriendCountry = ff.country;
    }
  }
  let best: { country: SerpCountry; at: number } | null = null;
  for (const { name, country } of COUNTRY_NAMES) {
    const at = lastWordIndex(norm, name);
    if (at !== -1 && (!best || at > best.at)) best = { country, at };
  }
  if (best) return best.country;

  // Tier 2 — full Canadian postal code (decisive), or FSA-only token.
  if (CA_POSTAL_FULL.test(raw) || CA_POSTAL_FSA.test(raw)) return "ca";

  // Tier 3 — provinces/states. Last occurrence wins (specific → general).
  best = null;
  for (const name of CA_PROVINCE_NAMES) {
    const at = lastWordIndex(norm, name);
    if (at !== -1 && (!best || at > best.at)) best = { country: "ca", at };
  }
  for (const name of US_STATE_NAMES) {
    const at = lastWordIndex(norm, name);
    if (at !== -1 && (!best || at > best.at)) best = { country: "us", at };
  }
  // Trailing 2-letter codes per comma-part ("Toronto, ON" / "Denver CO").
  // Later parts outrank earlier ones; any code outranks a full-name hit at
  // an earlier position only via position comparison on the normalized
  // string, so approximate: a code hit in a later comma-part wins.
  const parts = raw.split(/[,;]/).map((p) => normalize(p)).filter(Boolean);
  let cursor = 0;
  for (const part of parts) {
    const tokens = part.split(" ").filter(Boolean);
    const lastTok = tokens[tokens.length - 1];
    const at = cursor + part.length; // monotonically increasing per part
    if (lastTok && lastTok.length >= 2 && lastTok.length <= 3) {
      if (CA_PROVINCE_CODES.has(lastTok) && (!best || at > best.at)) best = { country: "ca", at };
      else if (US_STATE_CODES.has(lastTok) && (!best || at > best.at)) best = { country: "us", at };
    }
    cursor = at + 1;
  }
  if (best) return best.country;
  if (falseFriendCountry) return falseFriendCountry;

  // Tier 4 — unambiguous major cities.
  best = null;
  for (const name of CA_CITIES) {
    const at = lastWordIndex(norm, name);
    if (at !== -1 && (!best || at > best.at)) best = { country: "ca", at };
  }
  for (const name of US_CITIES) {
    const at = lastWordIndex(norm, name);
    if (at !== -1 && (!best || at > best.at)) best = { country: "us", at };
  }
  if (best) return best.country;

  // Tier 5 — bare 5-digit ZIP. (After cities so "Berlin 10115"-style strings
  // at least had a chance to resolve via stronger evidence first.)
  if (US_ZIP.test(raw)) return "us";

  return null;
}
