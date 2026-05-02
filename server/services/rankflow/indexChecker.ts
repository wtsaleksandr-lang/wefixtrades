/**
 * Page index checker.
 *
 * Data source priority:
 *   1. Google Search Console URL Inspection API (if client has OAuth connected
 *      and GOOGLE_SEARCH_CONSOLE_ENABLED=true)
 *   2. HTML "site:" scraping fallback (if ENABLE_RANK_SCRAPING=true)
 *   3. Direct HEAD request fallback (confirms page is live, not a true index check)
 *
 * The URL Inspection API provides authoritative, per-URL indexing verdicts
 * directly from Google. Rate limit: 2000 inspections/day per property.
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
  indexed: boolean;
  checked_at: string;
  /** The raw verdict from Search Console, if available. */
  verdict?: string;
  /** The coverage state from Search Console, if available. */
  coverageState?: string;
  /** Data source used for this check. */
  source?: "search_console" | "scrape" | "head_check";
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
      checked_at: result.inspectedAt,
      verdict: result.verdict,
      coverageState: result.coverageState,
      source: "search_console",
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
    return { url, indexed: false, checked_at: checkedAt, source: "scrape" };
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
        return { url, indexed: false, checked_at: checkedAt, source: "scrape" };
      }
      const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (html.includes(cleanUrl)) {
        return { url, indexed: true, checked_at: checkedAt, source: "scrape" };
      }
      const hasResults = /<div class="g"/.test(html) || /data-hveid/.test(html);
      return { url, indexed: hasResults, checked_at: checkedAt, source: "scrape" };
    }

    return await fallbackCheck(url, checkedAt);
  } catch {
    return await fallbackCheck(url, checkedAt);
  }
}

// ─── Direct HEAD request fallback ────────────────────────────────────

/**
 * Fallback: just check if the page is live and serves content.
 * Not a true index check, but confirms the page exists and could be indexed.
 */
async function fallbackCheck(url: string, checkedAt: string): Promise<IndexCheckResult> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (resp.ok) {
      return { url, indexed: true, checked_at: checkedAt, source: "head_check" };
    }
    return { url, indexed: false, checked_at: checkedAt, source: "head_check" };
  } catch {
    return { url, indexed: false, checked_at: checkedAt, source: "head_check" };
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Check if a URL is indexed by Google.
 *
 * Tries Search Console URL Inspection API first (if available),
 * then falls back to site: scraping or HEAD check.
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
                checked_at: scr.inspectedAt,
                verdict: scr.verdict,
                coverageState: scr.coverageState,
                source: "search_console",
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
  for (const page of urls) {
    const result = await checkIndexStatus(page.url);
    results.push({ ...result, page_id: page.id });

    if (urls.indexOf(page) < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
