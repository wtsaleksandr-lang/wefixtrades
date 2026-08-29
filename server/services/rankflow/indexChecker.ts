/**
 * Page index checker.
 *
 * ─── Indexation is NOT reachability ──────────────────────────────────
 *
 * This module used to return `indexed: true` for any URL that answered a
 * HEAD request with a 2xx. That measures whether a page is *reachable*,
 * which says nothing about whether Google has it in its index — a page can
 * serve 200 to the whole world and be entirely absent from Google. That
 * boolean flowed into `rankflow_pages.indexed`, then into
 * `rankflow_signals.pages_indexed`, and finally into customer-facing copy:
 * "N pages indexed on Google" in the portal and "(N indexed by Google)" in
 * the monthly RankFlow report email. We were reporting a Google fact we had
 * never asked Google about.
 *
 * `indexed` is now a THREE-state value and only ever set from a source that
 * actually measures indexation:
 *
 *   true  — a real indexation source said this URL is indexed
 *   false — a real indexation source said it is NOT indexed
 *   null  — we did not measure indexation (do not claim either way)
 *
 * Reachability is still useful (an unreachable page cannot be indexed), so
 * it is reported separately as `reachable` and never conflated.
 *
 * Data source priority:
 *   1. Google Search Console URL Inspection API — authoritative per-URL
 *      verdicts straight from Google. Measures indexation.
 *   2. HTML "site:" scraping (ENABLE_RANK_SCRAPING=true) — a real, if
 *      fragile, indexation signal. Measures indexation. Off by default.
 *   3. HEAD request — measures REACHABILITY ONLY. Always yields
 *      `indexed: null`.
 *
 * ─── Search Console feasibility for customer sites ───────────────────
 *
 * Path 1 is per-client OAuth: `getCredentialsForClient(wftClientId)` reads
 * the tokens the customer granted us, and `hasSearchConsoleAccess()` checks
 * the property is actually readable. That is the only way to measure a
 * customer's indexation, and it requires the customer to connect Search
 * Console during onboarding (RankFlowSetup already offers this). The
 * `qf-search-console@quotefleet.iam.gserviceaccount.com` service account is
 * authorised for quotefleet.net only and is NOT usable for customer
 * properties. So: clients with GSC connected get real indexation numbers;
 * clients without it get `null` and we say nothing rather than guessing.
 *
 * URL Inspection rate limit: 2000 inspections/day per property.
 */

import { createLogger } from "../../lib/logger";
import {
  getCredentialsForClient,
  checkIndexStatus as scCheckIndexStatus,
  hasSearchConsoleAccess,
  type GoogleCredentials,
} from "./searchConsoleService";

const log = createLogger("IndexChecker");

const SEARCH_CONSOLE_ENABLED = process.env.GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
const SCRAPING_ENABLED = process.env.ENABLE_RANK_SCRAPING === "true";

export interface IndexCheckResult {
  url: string;
  /**
   * Whether Google has this URL indexed.
   *
   * `null` means WE DID NOT MEASURE IT — not "no". Callers must never
   * coerce null to false, count it in an "indexed" total, or render it as
   * a Google fact. Only `search_console` and `scrape` can ever set this.
   */
  indexed: boolean | null;
  /**
   * Whether the URL answered an HTTP request. This is reachability, a
   * strictly weaker property than indexation. `null` when not probed.
   */
  reachable: boolean | null;
  checked_at: string;
  /** The raw verdict from Search Console, if available. */
  verdict?: string;
  /** The coverage state from Search Console, if available. */
  coverageState?: string;
  /** Data source used for this check. */
  source?: "search_console" | "scrape" | "head_check";
  /**
   * What this result actually measured. `reachability` results carry no
   * indexation information at all.
   */
  measures: "indexation" | "reachability";
  /** Present when indexation could not be measured — why not. */
  unmeasured_reason?: string;
}

/** True only when this result carries a real, measured indexation verdict. */
export function hasMeasuredIndexation(r: IndexCheckResult): boolean {
  return r.measures === "indexation" && r.indexed !== null;
}

// ─── Search Console URL Inspection ───────────────────────────────────

/**
 * Check index status using the Search Console URL Inspection API.
 * Returns authoritative per-URL verdicts directly from Google.
 */
async function checkViaSearchConsole(
  url: string,
  siteUrl: string,
  credentials: GoogleCredentials,
): Promise<IndexCheckResult | null> {
  try {
    const results = await scCheckIndexStatus(siteUrl, credentials, [url]);
    if (results.length === 0) return null;

    const result = results[0];
    if (result.error) {
      log.warn("URL Inspection API returned error", { url, error: result.error });
      return null;
    }

    // PASS verdict = indexed, FAIL = not indexed, NEUTRAL = partial
    const indexed = result.verdict === "PASS";

    return {
      url,
      indexed,
      reachable: null,
      checked_at: result.inspectedAt,
      verdict: result.verdict,
      coverageState: result.coverageState,
      source: "search_console",
      measures: "indexation",
    };
  } catch (err: any) {
    log.warn("Search Console index check failed", { url, error: err.message });
    return null;
  }
}

// ─── HTML scraping fallback ──────────────────────────────────────────

/**
 * Check if a URL is indexed by Google using a "site:" query.
 * Parses Google search result HTML.
 *
 * WARNING: This method scrapes google.com HTML which violates Google ToS
 * and gets blocked at volume. Disabled by default.
 */
async function checkViaScrape(url: string): Promise<IndexCheckResult> {
  const checkedAt = new Date().toISOString();

  if (!SCRAPING_ENABLED) {
    // Scraping disabled means we did not measure indexation — it does NOT
    // mean the page is unindexed.
    return {
      url,
      indexed: null,
      reachable: null,
      checked_at: checkedAt,
      source: "scrape",
      measures: "reachability",
      unmeasured_reason: "site: scraping is disabled",
    };
  }

  try {
    const query = encodeURIComponent(`site:${url}`);
    const searchUrl = `https://www.google.com/search?q=${query}`;

    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (resp.ok) {
      const html = await resp.text();
      const notIndexed = /did not match any documents|no results found|your search.*did not match/i.test(html);
      if (notIndexed) {
        return {
          url, indexed: false, reachable: null, checked_at: checkedAt,
          source: "scrape", measures: "indexation",
        };
      }
      const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (html.includes(cleanUrl)) {
        return {
          url, indexed: true, reachable: null, checked_at: checkedAt,
          source: "scrape", measures: "indexation",
        };
      }
      // Google answered but neither confirmed nor denied this specific URL.
      // "The SERP had some results" is not evidence about THIS page — a
      // blocked/CAPTCHA page also renders result-ish markup. Report unmeasured.
      return {
        url,
        indexed: null,
        reachable: null,
        checked_at: checkedAt,
        source: "scrape",
        measures: "reachability",
        unmeasured_reason: "site: query returned no verdict for this URL",
      };
    }

    return await fallbackCheck(url, checkedAt, `site: query returned HTTP ${resp.status}`);
  } catch {
    return await fallbackCheck(url, checkedAt, "site: query failed");
  }
}

// ─── Direct HEAD request fallback ────────────────────────────────────

/**
 * Reachability probe. Confirms the page answers an HTTP request.
 *
 * This is NOT an index check and never reports one. It previously returned
 * `indexed: true` on a 2xx, which is how a reachability probe ended up being
 * published to customers as "pages indexed on Google". `indexed` is always
 * null here — the only honest value, because we did not ask Google anything.
 */
async function fallbackCheck(
  url: string,
  checkedAt: string,
  reason = "no indexation source available (Search Console not connected, scraping disabled)",
): Promise<IndexCheckResult> {
  const base = {
    url,
    indexed: null,
    checked_at: checkedAt,
    source: "head_check" as const,
    measures: "reachability" as const,
    unmeasured_reason: reason,
  };
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    return { ...base, reachable: resp.ok };
  } catch {
    return { ...base, reachable: false };
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Check if a URL is indexed by Google.
 *
 * Tries Search Console URL Inspection API first (if available), then site:
 * scraping, then a reachability probe. Read `measures` before trusting
 * `indexed`: a `reachability` result carries no indexation information and
 * its `indexed` is always null.
 */
export async function checkIndexStatus(
  url: string,
  wftClientId?: number,
  siteUrl?: string,
): Promise<IndexCheckResult> {
  const checkedAt = new Date().toISOString();

  // ── Try Search Console first ──
  if (SEARCH_CONSOLE_ENABLED && wftClientId && siteUrl) {
    try {
      const credentials = await getCredentialsForClient(wftClientId);
      if (credentials) {
        const hasAccess = await hasSearchConsoleAccess(siteUrl, credentials);
        if (hasAccess) {
          const result = await checkViaSearchConsole(url, siteUrl, credentials);
          if (result) return result;
        }
      }
    } catch (err: any) {
      log.warn("Search Console unavailable for index check, falling back", { error: err.message });
    }
  }

  // ── Fallback: site: scraping (if enabled) ──
  if (SCRAPING_ENABLED) {
    log.debug("Using scrape fallback for index check", { url });
    return checkViaScrape(url);
  }

  // ── Last resort: HEAD check ──
  log.debug("Using HEAD check fallback for index check (scraping disabled, no Search Console)", { url });
  return fallbackCheck(url, checkedAt);
}

/**
 * Check multiple URLs with rate limiting.
 * Uses Search Console URL Inspection API when available, falls back to scraping.
 */
export async function checkIndexStatuses(
  urls: { id: number; url: string }[],
  delayMs = 2000,
  wftClientId?: number,
  siteUrl?: string,
): Promise<(IndexCheckResult & { page_id: number })[]> {
  const results: (IndexCheckResult & { page_id: number })[] = [];

  // ── Batch via Search Console if possible ──
  if (SEARCH_CONSOLE_ENABLED && wftClientId && siteUrl) {
    try {
      const credentials = await getCredentialsForClient(wftClientId);
      if (credentials) {
        const hasAccess = await hasSearchConsoleAccess(siteUrl, credentials);
        if (hasAccess) {
          log.info("Using Search Console URL Inspection for batch index check", {
            clientId: wftClientId,
            urlCount: urls.length,
          });

          const urlStrings = urls.map((u) => u.url);
          const scResults = await scCheckIndexStatus(siteUrl, credentials, urlStrings);

          // Map SC results back to page IDs
          const urlToId = new Map(urls.map((u) => [u.url, u.id]));
          for (const scr of scResults) {
            const pageId = urlToId.get(scr.url);
            if (pageId !== undefined) {
              results.push({
                url: scr.url,
                indexed: scr.verdict === "PASS",
                reachable: null,
                checked_at: scr.inspectedAt,
                verdict: scr.verdict,
                coverageState: scr.coverageState,
                source: "search_console",
                measures: "indexation",
                page_id: pageId,
              });
            }
          }

          if (results.length > 0) {
            log.info("Search Console index check complete", { checked: results.length, total: urls.length });
            return results;
          }
        }
      }
    } catch (err: any) {
      log.warn("Search Console batch index check failed, falling back", { error: err.message });
    }
  }

  // ── Fallback: check one by one ──
  // Pass the client/site context through so a per-URL Search Console lookup
  // is still possible. The old code dropped both arguments here, which meant
  // that once the batch path missed, every page silently degraded to a HEAD
  // probe even for clients who HAD connected Search Console.
  for (let i = 0; i < urls.length; i++) {
    const page = urls[i]!;
    const result = await checkIndexStatus(page.url, wftClientId, siteUrl);
    results.push({ ...result, page_id: page.id });

    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
