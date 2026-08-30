/**
 * Citation Tracker — shared HTTP helper for directory scrapers.
 *
 * Every scraper does the same boilerplate around the actual fetch — UA
 * spoofing, 1-2s polite jitter delay, 8s timeout, bot-wall detection, and
 * normalised error mapping into the {found:false, error?} shape the
 * monitor pipeline already understands. This module centralises that
 * boilerplate so the individual scrapers only contain parsing logic.
 *
 * `fetchJson` provides the same contract for the API-backed checks
 * (Google Places, Nominatim).
 *
 * Hard requirements (from the wave brief):
 *   - No new dependencies (uses built-in fetch + AbortController; cheerio
 *     is already a transitive dep used elsewhere in the server).
 *   - Never throws on transport errors — every failure mode resolves
 *     into a typed `{ ok: false, reason }` so a single bad directory
 *     can never abort the daily-scan cron loop.
 *   - Cloudflare / 403 / 429 mapped to `rate_limited` so the future
 *     `requires_manual_check` lane (Wave 42 scope) can detect those
 *     directories cleanly without re-parsing bodies.
 */
import { createLogger } from "../../../lib/logger";
import { isUrlAllowed } from "../robots";

const log = createLogger("citation-tracker:http");

/** Realistic desktop browser UA — picked to avoid the "bot-shaped" UA
 * patterns most directories' anti-bot heuristics flag first. */
export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Per-request timeout. 8s lines up with the wave brief and keeps the
 * worst-case daily-scan within a reasonable window across the monitored directories. */
export const SCRAPER_TIMEOUT_MS = 8_000;

/** Politeness delay window. Each fetch sleeps a uniformly-random amount
 * inside this band BEFORE firing — randomised so synchronous loops
 * across the directory registry don't all hit the same target on the
 * same tick. */
const POLITE_DELAY_MIN_MS = 1_000;
const POLITE_DELAY_MAX_MS = 2_000;

export type ScrapeFailureReason =
  | "rate_limited" // 403 / 429 / bot-challenge interstitial
  | "timeout" // AbortController fired
  | "network" // fetch threw before a response was received
  | "bad_status" // 5xx
  | "parse_error" // 2xx but body wasn't parseable (HTML structure changed)
  | "not_configured" // API-backed check with no credential — never checked
  | "robots_disallowed"; // the target's robots.txt forbids this path — never requested

/**
 * Bot-wall interstitials that return **HTTP 200** with a body that contains
 * no listings. These are the dangerous ones: the status code says success,
 * the parser finds nothing, and the result reads downstream as "we checked
 * and the listing is gone".
 *
 * This is not hypothetical. Detection here used to cover Cloudflare only,
 * so Houzz's Imperva "Client Challenge" page (HTTP 200, ~3KB, zero anchors)
 * parsed cleanly to `{ found: false }` on EVERY scan — a permanent, silent
 * false "confirmed absent" for every subscriber. Houzz has since been
 * removed from the registry, but the detection gap is fixed here so the
 * next directory to deploy a challenge page fails loudly instead.
 */
const CHALLENGE_PATTERNS: Array<{ re: RegExp; vendor: string }> = [
  { re: /\bcf-chl|cf_chl_opt|Just a moment\.\.\.|Attention Required! \| Cloudflare/i, vendor: "cloudflare" },
  { re: /Client Challenge|_Incapsula_|incap_ses_|Incapsula incident/i, vendor: "imperva" },
  { re: /PerimeterX|px-captcha|_pxhd|Access to this page has been denied/i, vendor: "perimeterx" },
  { re: /datadome|geo\.captcha-delivery\.com/i, vendor: "datadome" },
  { re: /Are you a robot|unusual traffic from your computer/i, vendor: "generic-captcha" },
];

/**
 * A page small enough that it cannot plausibly carry search results.
 * Challenge interstitials are tiny; real result pages observed during the
 * directory probe ranged 78KB–880KB. 20KB is a wide margin below the
 * smallest genuine results page and well above every challenge page seen.
 */
const MIN_PLAUSIBLE_RESULTS_BYTES = 20_000;

/**
 * Detect a bot-wall interstitial served as HTTP 200. Returns the vendor
 * name when the body is a challenge, else null.
 *
 * Two independent signals, because neither alone is sufficient:
 *   - a vendor fingerprint in a body too small to hold results; and
 *   - a body with effectively no anchors at all (a JS-only shell), which
 *     cannot yield a listing even if it isn't strictly a challenge.
 * Vendor strings are NOT matched on large pages — real directory pages
 * legitimately mention "captcha" in an embedded config blob (BBB ships
 * `NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY` in its 275KB results page), and
 * treating that as a block would discard good data.
 */
export function detectBotWall(html: string): string | null {
  if (html.length >= MIN_PLAUSIBLE_RESULTS_BYTES) return null;
  for (const { re, vendor } of CHALLENGE_PATTERNS) {
    if (re.test(html)) return vendor;
  }
  const anchors = (html.match(/<a\s[^>]*href=/gi) || []).length;
  if (anchors < 3) return "empty-shell";
  return null;
}

export interface ScrapeFetchOk {
  ok: true;
  status: number;
  html: string;
  url: string;
}

export interface ScrapeFetchErr {
  ok: false;
  reason: ScrapeFailureReason;
  status?: number;
  detail?: string;
}

export type ScrapeFetchResult = ScrapeFetchOk | ScrapeFetchErr;

/** Sleep helper. Exposed for tests that need to override it (the test
 * file passes `politeDelayMs: 0` so unit tests don't take 2s each). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polite-fetch wrapper. Performs:
 *   1. Random jitter delay (skipped when `politeDelayMs` is 0 — tests).
 *   2. fetch() with realistic browser UA, 8s timeout, follow redirects.
 *   3. Maps 403/429/Cloudflare to `rate_limited`, 5xx to `bad_status`,
 *      AbortError to `timeout`, anything else to `network`.
 *
 * Never throws. Always resolves to a ScrapeFetchResult. */
export async function fetchHtml(
  url: string,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeFetchResult> {
  // ROBOTS GATE — before the delay, before the socket.
  //
  // Build-time guards check the URL *templates* the scrapers construct, but
  // the actual path depends on the subscriber: a business name is
  // interpolated into it, and some directives (YellowPages.ca's facet
  // suffixes, BuildZoom's one named contractor) could be tripped by a name
  // or by a URL harvested from a results page. Checking here makes the
  // whole class impossible rather than merely audited.
  //
  // Fails CLOSED for a host with no recorded directives: an unrecorded host
  // is one nobody has checked, and requesting it is the thing we are trying
  // to stop. `robotsCompliance.test.ts` asserts every implemented scraper's
  // host IS recorded, so this can never surprise a shipped check — it
  // surfaces at build time, which is the point.
  //
  // The failure is a CHECK FAILURE, never an absence. A path we may not
  // request tells us nothing about whether the listing exists, so it must
  // reach the customer as "couldn't check" exactly like a Cloudflare wall.
  if (!isUrlAllowed(url)) {
    log.debug("scraper refused a disallowed path", { url });
    return { ok: false, reason: "robots_disallowed" };
  }

  const delayMs =
    opts.politeDelayMs !== undefined
      ? opts.politeDelayMs
      : Math.floor(POLITE_DELAY_MIN_MS + Math.random() * (POLITE_DELAY_MAX_MS - POLITE_DELAY_MIN_MS));
  if (delayMs > 0) await sleep(delayMs);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SCRAPER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        // Some directories soft-block on missing Accept-Encoding.
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
      signal: ctl.signal,
    });
    clearTimeout(timer);

    const status = res.status;
    if (status === 403 || status === 429) {
      return { ok: false, reason: "rate_limited", status };
    }
    if (status >= 500) {
      return { ok: false, reason: "bad_status", status };
    }
    if (status >= 400) {
      // 404 / 410 etc. — treat as "no listing here", not as rate-limit.
      return { ok: false, reason: "bad_status", status };
    }

    const html = await res.text();

    // Bot-wall interstitials arrive as 200 OK with a body that holds no
    // listings, so the status checks above cannot catch them. Treat them
    // as rate-limited (a CHECK FAILURE) — never let the parser run and
    // report a clean `{ found: false }`, which downstream reads as a
    // confirmed removal.
    const wall = detectBotWall(html);
    if (wall) {
      return { ok: false, reason: "rate_limited", status, detail: `${wall}_challenge` };
    }

    return { ok: true, status, html, url: res.url || url };
  } catch (err: unknown) {
    clearTimeout(timer);
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      log.debug("scraper timeout", { url });
      return { ok: false, reason: "timeout" };
    }
    log.debug("scraper network error", { url, error: e?.message });
    return { ok: false, reason: "network", detail: e?.message };
  }
}

export interface JsonFetchOk<T> {
  ok: true;
  status: number;
  data: T;
}
export type JsonFetchResult<T> = JsonFetchOk<T> | ScrapeFetchErr;

/**
 * Polite-fetch wrapper for the API-backed checks (Google Places,
 * Nominatim, Foursquare, …). Same never-throw contract as `fetchHtml`:
 * every transport, status and parse failure resolves to a typed error so
 * an API outage is recorded as "we could not check", never as "absent".
 *
 * Deliberately NOT robots-gated, unlike `fetchHtml`. robots.txt governs
 * crawlers of a web site; it does not govern a client of an API the vendor
 * licenses for exactly this use, reached with a key they issued. Gating
 * here would also fail closed on hosts that have no robots record and no
 * reason to have one. The distinction is asserted rather than assumed:
 * `robotsCompliance.test.ts` keeps an explicit API_EXEMPT set, so moving a
 * check from HTML scraping to an API cannot quietly skip the gate.
 *
 * Note the deliberate asymmetry with fetchHtml: a 404 here is still
 * `bad_status`, not "no listing". Callers decide absence from a
 * successfully-parsed empty result set, never from a status code — a 404
 * usually means we called the endpoint wrong, which is our bug, not the
 * customer's missing listing.
 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: {
    politeDelayMs?: number;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    /** Overrides SCRAPER_USER_AGENT. Nominatim's policy requires a UA that
     * identifies the application and a contact address. */
    userAgent?: string;
  } = {},
): Promise<JsonFetchResult<T>> {
  const delayMs =
    opts.politeDelayMs !== undefined
      ? opts.politeDelayMs
      : Math.floor(POLITE_DELAY_MIN_MS + Math.random() * (POLITE_DELAY_MAX_MS - POLITE_DELAY_MIN_MS));
  if (delayMs > 0) await sleep(delayMs);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SCRAPER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "User-Agent": opts.userAgent ?? SCRAPER_USER_AGENT,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body,
      redirect: "follow",
      signal: ctl.signal,
    });
    clearTimeout(timer);

    const status = res.status;
    if (status === 401 || status === 403 || status === 429) {
      // Auth failures and quota exhaustion are indistinguishable from the
      // caller's perspective and equally uninformative about the listing.
      return { ok: false, reason: "rate_limited", status };
    }
    if (status >= 400) return { ok: false, reason: "bad_status", status };

    const text = await res.text();
    try {
      return { ok: true, status, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, reason: "parse_error", status };
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      log.debug("api check timeout", { url });
      return { ok: false, reason: "timeout" };
    }
    log.debug("api check network error", { url, error: e?.message });
    return { ok: false, reason: "network", detail: e?.message };
  }
}

/** Normalise a free-form phone string into the digits-only representation
 * the citation tracker uses for NAP matching. Strips +1 country code,
 * whitespace, parens, dashes. Returns the empty string when nothing
 * digit-like is in the input. */
export function normalisePhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Extract the city from a free-form single-string address. Subscriptions
 * store address as one string; the city is almost always the last-but-one
 * comma-separated token ("100 Main St, Waco, TX 76701" → "Waco"). */
export function cityFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0];
}

/** Best-effort state/province from a free-form address. Accepts "TX" or
 * "Texas"; strips a trailing ZIP/postal code. */
export function stateFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const last = address.split(",").pop()?.trim();
  if (!last) return undefined;
  const m = last.match(/([A-Z]{2}|[A-Za-z]+)/);
  return m?.[1];
}

/**
 * Strict identity check for a candidate returned by a SEARCH endpoint.
 *
 * Search APIs are built to always return *something* relevant-ish. Google
 * Places answers the query "Zzqqx Nonexistent Plumbing Co, Cincinnati OH"
 * with "Zins Plumbing" — a real, operational, completely unrelated
 * business. Accepting the top hit would report a listing the customer does
 * not have, then alert on "NAP drift" against a stranger's address forever.
 *
 * So a candidate counts as the customer's listing only when the name
 * loosely matches AND at least one hard identifier corroborates it:
 * phone (digits-only) or city. When we hold no corroborating field at all,
 * a name match alone is accepted — that is the same standard the HTML
 * scrapers apply, and refusing would make the check useless for
 * subscriptions with a sparse NAP.
 */
export function candidateMatches(
  ctx: { business_name: string; phone?: string; address?: string },
  candidate: { name?: string; phone?: string; address?: string },
): boolean {
  if (!candidate.name || !nameLooselyMatches(ctx.business_name, candidate.name)) return false;

  const wantPhone = normalisePhone(ctx.phone);
  const gotPhone = normalisePhone(candidate.phone);
  if (wantPhone && gotPhone) return wantPhone === gotPhone;

  const wantCity = cityFromAddress(ctx.address)?.toLowerCase();
  if (wantCity && candidate.address) {
    return candidate.address.toLowerCase().includes(wantCity);
  }

  // No corroborating field on either side — fall back to the name match.
  return true;
}

/** Loose business-name match. Lowercased, stripped of punctuation, then
 * compared as substring either direction. Tolerates "Mr. Rooter" vs
 * "Mr Rooter Plumbing" without false-matching unrelated businesses. */
export function nameLooselyMatches(needle: string, hay: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(needle);
  const b = norm(hay);
  if (!a || !b) return false;
  // Require at least 4 chars of overlap on the needle to avoid matching
  // single-token directories ("plumber" matching every result).
  if (a.length < 4) return false;
  return b.includes(a) || a.includes(b);
}
