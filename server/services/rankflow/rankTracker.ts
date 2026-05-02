/**
 * Keyword rank checker.
 *
 * Data source priority:
 *   1. Google Search Console (if connected and GOOGLE_SEARCH_CONSOLE_ENABLED)
 *   2. Serper / DataForSEO (legitimate paid APIs — unchanged)
 *   3. HTML scraping fallback (behind ENABLE_RANK_SCRAPING env var, default OFF)
 *
 * The HTML scraper violates Google ToS and gets blocked at volume.
 * It is retained but disabled by default for emergency use only.
 */
import { createLogger } from "../../lib/logger";
import {
  getCredentialsForClient,
  getSearchConsoleData,
  hasSearchConsoleAccess,
  type GoogleCredentials,
  type SearchConsoleData,
} from "./searchConsoleService";

const log = createLogger("RankTracker");

const SEARCH_CONSOLE_ENABLED = process.env.GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
const SCRAPING_ENABLED = process.env.ENABLE_RANK_SCRAPING === "true";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface RankCheckResult {
  keyword: string;
  position: number | null; // 1-50, null = not found
  url_found: string | null;
  checked_at: string;
}

// ─── Search Console rank data ────────────────────────────────────────

export interface SearchConsoleRankResult {
  keyword: string;
  position: number | null;
  url_found: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  checked_at: string;
  source: "search_console";
}

/**
 * Pull rank data from Search Console for a client's site.
 * Returns an array of keyword rank results derived from real impression data.
 *
 * This is the preferred primary data source — it provides actual Google
 * impression/click/position data rather than scraped estimates.
 */
export async function getSearchConsoleRankData(
  siteUrl: string,
  credentials: GoogleCredentials,
  targetKeywords?: string[],
  options?: { startDate?: string; endDate?: string },
): Promise<SearchConsoleRankResult[]> {
  const checkedAt = new Date().toISOString();

  try {
    const scData = await getSearchConsoleData(siteUrl, credentials, options);

    const results: SearchConsoleRankResult[] = scData.topQueries.map((q) => ({
      keyword: q.query,
      position: q.avgPosition > 0 ? Math.round(q.avgPosition) : null,
      url_found: scData.topPages.find((p) => {
        // Find the top page for this query (best match from raw rows)
        const match = scData.rows.find((r) => r.query === q.query);
        return match ? p.page === match.page : false;
      })?.page || null,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.avgCtr,
      checked_at: checkedAt,
      source: "search_console" as const,
    }));

    // If target keywords are specified, filter and also mark missing ones
    if (targetKeywords && targetKeywords.length > 0) {
      const lcKeywords = new Set(targetKeywords.map((k) => k.toLowerCase()));
      const matched = results.filter((r) => lcKeywords.has(r.keyword.toLowerCase()));
      const foundKeywords = new Set(matched.map((r) => r.keyword.toLowerCase()));

      // Add entries for tracked keywords not found in Search Console data
      for (const kw of targetKeywords) {
        if (!foundKeywords.has(kw.toLowerCase())) {
          matched.push({
            keyword: kw,
            position: null,
            url_found: null,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            checked_at: checkedAt,
            source: "search_console",
          });
        }
      }

      return matched;
    }

    return results;
  } catch (err: any) {
    log.error("Search Console rank data fetch failed", { siteUrl, error: err.message });
    return [];
  }
}

// ─── HTML scraping fallback (disabled by default) ────────────────────

/**
 * Check the ranking position of a domain for a specific keyword.
 * Returns position 1-50 or null if not found in top 50.
 *
 * Uses Google search with num=50 and parses result URLs.
 * Falls back gracefully on rate limits or blocks.
 *
 * WARNING: This method scrapes google.com HTML which violates Google ToS
 * and gets blocked at volume. It is disabled by default — set
 * ENABLE_RANK_SCRAPING=true to enable.
 */
export async function checkKeywordRank(
  keyword: string,
  domain: string,
  location?: string,
): Promise<RankCheckResult> {
  const checkedAt = new Date().toISOString();

  if (!SCRAPING_ENABLED) {
    log.debug("HTML scraping disabled (ENABLE_RANK_SCRAPING!=true), skipping scrape check");
    return { keyword, position: null, url_found: null, checked_at: checkedAt };
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();

  try {
    // Build search URL — request 50 results
    const query = encodeURIComponent(keyword);
    const gl = location?.toLowerCase().includes("canada") || location?.toLowerCase().includes("ca") ? "ca" : "us";
    const searchUrl = `https://www.google.com/search?q=${query}&num=50&gl=${gl}&hl=en`;

    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!resp.ok) {
      log.info("Google returned non-OK for scrape check", { keyword, status: resp.status });
      return { keyword, position: null, url_found: null, checked_at: checkedAt };
    }

    const html = await resp.text();

    // Extract URLs from search results
    // Google wraps result URLs in <a href="/url?q=..." or <a href="https://..."
    const urls = extractResultUrls(html);

    // Find the first URL matching the client's domain
    for (let i = 0; i < urls.length && i < 50; i++) {
      const resultDomain = extractDomainFromUrl(urls[i]);
      if (resultDomain && resultDomain.includes(cleanDomain)) {
        return {
          keyword,
          position: i + 1,
          url_found: urls[i],
          checked_at: checkedAt,
        };
      }
    }

    return { keyword, position: null, url_found: null, checked_at: checkedAt };
  } catch (err: any) {
    log.error("Error in scrape rank check", { keyword, error: err.message });
    return { keyword, position: null, url_found: null, checked_at: checkedAt };
  }
}

/**
 * Extract organic result URLs from Google HTML.
 */
function extractResultUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: href="/url?q=https://..."
  const redirectPattern = /href="\/url\?q=(https?:\/\/[^"&]+)/g;
  let match;
  while ((match = redirectPattern.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    const domain = extractDomainFromUrl(url);
    if (domain && !isGoogleDomain(domain) && !seen.has(domain)) {
      seen.add(domain);
      urls.push(url);
    }
  }

  // Pattern 2: Direct href="https://..." in result links
  if (urls.length < 10) {
    const directPattern = /href="(https?:\/\/(?!www\.google\.)[^"]+)"/g;
    while ((match = directPattern.exec(html)) !== null) {
      const url = match[1];
      const domain = extractDomainFromUrl(url);
      if (domain && !isGoogleDomain(domain) && !seen.has(domain)) {
        seen.add(domain);
        urls.push(url);
      }
    }
  }

  return urls;
}

function extractDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isGoogleDomain(domain: string): boolean {
  return /google\.|googleapis\.com|gstatic\.com|youtube\.com|schema\.org/.test(domain);
}

/**
 * Check multiple keywords for a client.
 *
 * Data source priority:
 *   1. Search Console (if wftClientId provided, client has OAuth, and feature enabled)
 *   2. HTML scraping fallback (if ENABLE_RANK_SCRAPING=true)
 *
 * Serper/DataForSEO are called separately by the task execution layer —
 * they are not part of this function.
 */
export async function checkKeywordRanks(
  keywords: { id: number; keyword: string }[],
  domain: string,
  location?: string,
  delayMs = 3000,
  wftClientId?: number,
): Promise<(RankCheckResult & { keyword_id: number })[]> {
  const results: (RankCheckResult & { keyword_id: number })[] = [];

  // ── Attempt Search Console first ──
  if (SEARCH_CONSOLE_ENABLED && wftClientId) {
    try {
      const credentials = await getCredentialsForClient(wftClientId);
      if (credentials) {
        // Normalize site URL for Search Console (sc:domain: or https://)
        const siteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
        const hasAccess = await hasSearchConsoleAccess(siteUrl, credentials);

        if (hasAccess) {
          log.info("Using Search Console as primary rank data source", { clientId: wftClientId, domain });

          const keywordStrings = keywords.map((k) => k.keyword);
          const scResults = await getSearchConsoleRankData(siteUrl, credentials, keywordStrings);

          // Map SC results back to keyword IDs
          const keywordMap = new Map(keywords.map((k) => [k.keyword.toLowerCase(), k.id]));
          for (const scr of scResults) {
            const kwId = keywordMap.get(scr.keyword.toLowerCase());
            if (kwId !== undefined) {
              results.push({
                keyword: scr.keyword,
                position: scr.position,
                url_found: scr.url_found,
                checked_at: scr.checked_at,
                keyword_id: kwId,
              });
            }
          }

          if (results.length > 0) {
            log.info("Search Console rank data retrieved", { count: results.length, total: keywords.length });
            return results;
          }
        } else {
          log.debug("Client does not have Search Console access for this site", { clientId: wftClientId, siteUrl });
        }
      }
    } catch (err: any) {
      log.warn("Search Console rank check failed, falling back", { error: err.message });
    }
  }

  // ── Fallback: HTML scraping (if enabled) ──
  if (!SCRAPING_ENABLED) {
    log.debug("No rank data source available (Search Console unavailable, scraping disabled)");
    // Return empty results for all keywords
    const checkedAt = new Date().toISOString();
    return keywords.map((kw) => ({
      keyword: kw.keyword,
      position: null,
      url_found: null,
      checked_at: checkedAt,
      keyword_id: kw.id,
    }));
  }

  for (const kw of keywords) {
    const result = await checkKeywordRank(kw.keyword, domain, location);
    results.push({ ...result, keyword_id: kw.id });

    // Rate limit: wait between checks
    if (keywords.indexOf(kw) < keywords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
