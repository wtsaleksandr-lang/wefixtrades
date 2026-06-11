/**
 * Keyword rank checker.
 *
 * Data source priority (Lane H — Serper is PRIMARY):
 *   1. Serper.dev SERP API (if SERPER_API_KEY present) — real rank
 *      checks: organic position 1-100 + local-pack position, geo-located
 *      via gl/hl + location. Search Console, when the client also has a
 *      GSC connection, ENRICHES these results with impressions/clicks/CTR
 *      — it no longer gates rank tracking on the multi-week Google
 *      consent-screen verification.
 *   2. Google Search Console (if connected and GOOGLE_SEARCH_CONSOLE_ENABLED)
 *      — fallback when no Serper key. Only reports avg position for
 *      queries that already earned impressions; NOT real rank tracking.
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
import {
  checkKeywordRanksViaSerp,
  serpRankAvailable,
  RANK_SOURCE_SERP,
  RANK_SOURCE_GSC,
  RANK_SOURCE_SCRAPE,
  type RankSource,
} from "./serpRankProvider";

const log = createLogger("RankTracker");

// Read at call time (not module load) so source selection reacts to the
// live environment and stays unit-testable.
function searchConsoleEnabled(): boolean {
  return process.env.GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
}
function scrapingEnabled(): boolean {
  return process.env.ENABLE_RANK_SCRAPING === "true";
}

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
  position: number | null; // organic position (1-100 serp_api / 1-50 scrape), null = not found
  url_found: string | null;
  checked_at: string;
  /** Provenance: which data source produced this check. */
  source?: RankSource;
  /** Local-pack (map pack) position — serp_api source only. */
  local_pack_position?: number | null;
  /** true = the check could not be performed (API error / budget) —
   *  callers must NOT store a rank-history row for it. */
  skipped?: boolean;
  /** GSC enrichment (present when the client has a Search Console
   *  connection, regardless of which source produced the position). */
  impressions?: number | null;
  clicks?: number | null;
  ctr?: number | null;
}

// ─── Source selection (Lane H) ───────────────────────────────────────

export interface RankSourceSelection {
  /** Where positions come from. */
  primary: RankSource | "none";
  /** Optional GSC enrichment layered onto serp_api results. */
  enrichment: typeof RANK_SOURCE_GSC | null;
}

/**
 * Pure source-selection logic:
 *   - Serper key present           → serp_api primary; GSC (when connected)
 *                                    enriches with impressions/CTR/avg position.
 *   - no Serper key, GSC connected → search_console primary (legacy path).
 *   - neither, scraping enabled    → scrape (emergency only).
 *   - nothing                      → none (results carry null positions).
 */
export function selectRankSources(opts: {
  serperKeyPresent: boolean;
  gscEnabled: boolean;
  gscConnected: boolean;
  scrapingEnabled?: boolean;
}): RankSourceSelection {
  const gscUsable = opts.gscEnabled && opts.gscConnected;
  if (opts.serperKeyPresent) {
    return { primary: RANK_SOURCE_SERP, enrichment: gscUsable ? RANK_SOURCE_GSC : null };
  }
  if (gscUsable) {
    return { primary: RANK_SOURCE_GSC, enrichment: null };
  }
  if (opts.scrapingEnabled) {
    return { primary: RANK_SOURCE_SCRAPE, enrichment: null };
  }
  return { primary: "none", enrichment: null };
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

  if (!scrapingEnabled()) {
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

// ─── Internal: GSC connection lookup (shared by primary + enrichment paths) ──

async function getGscConnection(
  wftClientId: number | undefined,
  domain: string,
): Promise<{ credentials: GoogleCredentials; siteUrl: string } | null> {
  if (!searchConsoleEnabled() || !wftClientId) return null;
  try {
    const credentials = await getCredentialsForClient(wftClientId);
    if (!credentials) return null;
    // Normalize site URL for Search Console (sc:domain: or https://)
    const siteUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const hasAccess = await hasSearchConsoleAccess(siteUrl, credentials);
    if (!hasAccess) {
      log.debug("Client does not have Search Console access for this site", { clientId: wftClientId, siteUrl });
      return null;
    }
    return { credentials, siteUrl };
  } catch (err: any) {
    log.warn("Search Console connection check failed", { clientId: wftClientId, error: err.message });
    return null;
  }
}

export interface CheckKeywordRanksOptions {
  /** Per-run Serper query budget (tier keyword cap). Defaults to
   *  keywords.length (no extra cap) — the tracking worker always passes
   *  the tier-derived cap. */
  maxSerpQueries?: number;
  /** Business name for local-pack matching (serp_api source only). */
  businessName?: string;
}

/**
 * Check multiple keywords for a client.
 *
 * Data source priority (Lane H):
 *   1. Serper SERP API (if SERPER_API_KEY present) — PRIMARY. Real
 *      organic position 1-100 + local-pack position, geo-located.
 *      When the client also has a GSC connection, results are ENRICHED
 *      with impressions/clicks/CTR (best-effort; enrichment failure
 *      never fails the run).
 *   2. Search Console (if wftClientId provided, client has OAuth, and
 *      feature enabled) — fallback when no Serper key.
 *   3. HTML scraping fallback (if ENABLE_RANK_SCRAPING=true).
 */
export async function checkKeywordRanks(
  keywords: { id: number; keyword: string }[],
  domain: string,
  location?: string,
  delayMs = 3000,
  wftClientId?: number,
  options?: CheckKeywordRanksOptions,
): Promise<(RankCheckResult & { keyword_id: number })[]> {
  const results: (RankCheckResult & { keyword_id: number })[] = [];

  // ── 1. Serper SERP API — PRIMARY ──
  if (serpRankAvailable()) {
    const gsc = await getGscConnection(wftClientId, domain);
    log.info("Using Serper SERP API as primary rank data source", {
      clientId: wftClientId ?? null,
      domain,
      gscEnrichment: !!gsc,
    });

    const serpResults = await checkKeywordRanksViaSerp(keywords, domain, location, {
      maxQueries: options?.maxSerpQueries ?? keywords.length,
      businessName: options?.businessName,
    });

    // Best-effort GSC enrichment: impressions / clicks / CTR per keyword.
    const enrichment = new Map<string, { impressions: number; clicks: number; ctr: number }>();
    if (gsc) {
      try {
        const keywordStrings = keywords.map((k) => k.keyword);
        const scResults = await getSearchConsoleRankData(gsc.siteUrl, gsc.credentials, keywordStrings);
        for (const scr of scResults) {
          if (scr.impressions > 0 || scr.clicks > 0) {
            enrichment.set(scr.keyword.toLowerCase(), {
              impressions: scr.impressions,
              clicks: scr.clicks,
              ctr: scr.ctr,
            });
          }
        }
      } catch (err: any) {
        log.warn("GSC enrichment failed — continuing with Serper-only data", { error: err.message });
      }
    }

    return serpResults.map((r) => {
      const extra = enrichment.get(r.keyword.toLowerCase());
      return {
        keyword: r.keyword,
        keyword_id: r.keyword_id,
        position: r.position,
        url_found: r.url_found,
        checked_at: r.checked_at,
        source: r.source,
        local_pack_position: r.local_pack_position,
        skipped: r.skipped,
        impressions: extra?.impressions ?? null,
        clicks: extra?.clicks ?? null,
        ctr: extra?.ctr ?? null,
      };
    });
  }

  // ── 2. Fallback: Search Console as the position source ──
  const gsc = await getGscConnection(wftClientId, domain);
  if (gsc) {
    try {
      log.info("Using Search Console as rank data source (no SERPER_API_KEY)", { clientId: wftClientId, domain });

      const keywordStrings = keywords.map((k) => k.keyword);
      const scResults = await getSearchConsoleRankData(gsc.siteUrl, gsc.credentials, keywordStrings);

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
            source: RANK_SOURCE_GSC,
            impressions: scr.impressions,
            clicks: scr.clicks,
            ctr: scr.ctr,
          });
        }
      }

      if (results.length > 0) {
        log.info("Search Console rank data retrieved", { count: results.length, total: keywords.length });
        return results;
      }
    } catch (err: any) {
      log.warn("Search Console rank check failed, falling back", { error: err.message });
    }
  }

  // ── 3. Fallback: HTML scraping (if enabled) ──
  if (!scrapingEnabled()) {
    log.debug("No rank data source available (no Serper key, Search Console unavailable, scraping disabled)");
    // Mark all keywords skipped so callers don't store false nulls.
    const checkedAt = new Date().toISOString();
    return keywords.map((kw) => ({
      keyword: kw.keyword,
      position: null,
      url_found: null,
      checked_at: checkedAt,
      keyword_id: kw.id,
      skipped: true,
    }));
  }

  for (const kw of keywords) {
    const result = await checkKeywordRank(kw.keyword, domain, location);
    results.push({ ...result, keyword_id: kw.id, source: RANK_SOURCE_SCRAPE });

    // Rate limit: wait between checks
    if (keywords.indexOf(kw) < keywords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
