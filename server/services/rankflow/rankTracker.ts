/**
 * Lightweight keyword rank checker.
 * Checks Google search results for a keyword and detects the client's domain position.
 * No paid APIs — uses direct search result parsing.
 */
import { createLogger } from "../../lib/logger";

const log = createLogger("RankTracker");

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

/**
 * Check the ranking position of a domain for a specific keyword.
 * Returns position 1-50 or null if not found in top 50.
 *
 * Uses Google search with num=50 and parses result URLs.
 * Falls back gracefully on rate limits or blocks.
 */
export async function checkKeywordRank(
  keyword: string,
  domain: string,
  location?: string,
): Promise<RankCheckResult> {
  const checkedAt = new Date().toISOString();
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
      log.info(`[rank-tracker] Google returned ${resp.status} for "${keyword}" — skipping`);
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
    log.error(`[rank-tracker] Error checking "${keyword}":`, err.message);
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
 * Check multiple keywords for a client with rate limiting.
 * Adds a delay between checks to avoid rate limits.
 */
export async function checkKeywordRanks(
  keywords: { id: number; keyword: string }[],
  domain: string,
  location?: string,
  delayMs = 3000,
): Promise<(RankCheckResult & { keyword_id: number })[]> {
  const results: (RankCheckResult & { keyword_id: number })[] = [];

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
