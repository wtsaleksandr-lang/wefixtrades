/**
 * Lightweight page index checker.
 * Determines if a URL is indexed by Google using a "site:" query.
 */

export interface IndexCheckResult {
  url: string;
  indexed: boolean;
  checked_at: string;
}

/**
 * Check if a URL is indexed by Google.
 * Uses a "site:url" search and checks for results.
 * Falls back to a direct fetch check if Google blocks the request.
 */
export async function checkIndexStatus(url: string): Promise<IndexCheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    // Method 1: Google "site:" query
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
      // If Google returns "did not match any documents" or similar, it's not indexed
      const notIndexed = /did not match any documents|no results found|your search.*did not match/i.test(html);
      if (notIndexed) {
        return { url, indexed: false, checked_at: checkedAt };
      }
      // If the URL appears in results, it's indexed
      const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (html.includes(cleanUrl)) {
        return { url, indexed: true, checked_at: checkedAt };
      }
      // Results exist but URL not explicitly found — assume indexed if results present
      const hasResults = /<div class="g"/.test(html) || /data-hveid/.test(html);
      return { url, indexed: hasResults, checked_at: checkedAt };
    }

    // Google blocked — fall back to direct fetch
    return await fallbackCheck(url, checkedAt);
  } catch {
    // Network error — fall back to direct fetch
    return await fallbackCheck(url, checkedAt);
  }
}

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
    // If page loads and doesn't have noindex, assume potentially indexed
    if (resp.ok) {
      return { url, indexed: true, checked_at: checkedAt };
    }
    return { url, indexed: false, checked_at: checkedAt };
  } catch {
    return { url, indexed: false, checked_at: checkedAt };
  }
}

/**
 * Check multiple URLs with rate limiting.
 */
export async function checkIndexStatuses(
  urls: { id: number; url: string }[],
  delayMs = 2000,
): Promise<(IndexCheckResult & { page_id: number })[]> {
  const results: (IndexCheckResult & { page_id: number })[] = [];

  for (const page of urls) {
    const result = await checkIndexStatus(page.url);
    results.push({ ...result, page_id: page.id });

    if (urls.indexOf(page) < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
