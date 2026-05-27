/**
 * Citation Tracker — shared HTTP helper for directory scrapers.
 *
 * Wave 41 introduces 5 real scrapers (BBB, BuildZoom, Yellowbook, Tupalo,
 * Houzz). Each scraper does the same boilerplate around the actual
 * fetch — UA spoofing, 1-2s polite jitter delay, 8s timeout, and
 * normalised error mapping into the {found:false, error?} shape the
 * monitor pipeline already understands. This module centralises that
 * boilerplate so the individual scrapers only contain parsing logic.
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

const log = createLogger("citation-tracker:http");

/** Realistic desktop browser UA — picked to avoid the "bot-shaped" UA
 * patterns most directories' anti-bot heuristics flag first. */
export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Per-request timeout. 8s lines up with the wave brief and keeps the
 * worst-case daily-scan within a reasonable window for 50+ directories. */
export const SCRAPER_TIMEOUT_MS = 8_000;

/** Politeness delay window. Each fetch sleeps a uniformly-random amount
 * inside this band BEFORE firing — randomised so synchronous loops
 * across the directory registry don't all hit the same target on the
 * same tick. */
const POLITE_DELAY_MIN_MS = 1_000;
const POLITE_DELAY_MAX_MS = 2_000;

export type ScrapeFailureReason =
  | "rate_limited" // 403 / 429 / Cloudflare challenge
  | "timeout" // AbortController fired
  | "network" // fetch threw before a response was received
  | "bad_status" // 5xx
  | "parse_error"; // 2xx but body wasn't parseable (HTML structure changed)

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

    // Cloudflare interstitial detection (the "Just a moment..." page).
    // These come back as 200 OK with a tiny challenge body, so the
    // status check above doesn't catch them.
    if (
      html.length < 8_000 &&
      (/\bcf-chl/i.test(html) ||
        /Just a moment\.\.\./i.test(html) ||
        /Attention Required! \| Cloudflare/i.test(html))
    ) {
      return { ok: false, reason: "rate_limited", status, detail: "cloudflare_challenge" };
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
