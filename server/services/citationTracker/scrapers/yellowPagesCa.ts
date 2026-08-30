/**
 * YellowPages.ca / Pages Jaunes scraper.
 *
 * Why this directory
 * ------------------
 * WeFixTrades serves US *and* Canadian trades. The US Yellow Pages cluster
 * (YP.com / Superpages / DexKnows) is unreachable — yellowpages.com returns
 * HTTP 403 to non-browser clients for robots.txt itself, before any page
 * request. Its Canadian sibling is a different property on different
 * infrastructure: it serves plain server-rendered HTML to a normal client,
 * and it remains the dominant general directory north of the border, which
 * is exactly the coverage gap a US-only registry leaves open.
 *
 * Strategy
 * --------
 *   GET https://www.yellowpages.ca/search/si/1/{what}/{where}
 * Results are anchors of the form
 *   /bus/{Province}/{City}/{Business-Name-Slug}/{listingId}.html
 *
 * We match on the URL slug rather than the anchor text. The same listing
 * appears half a dozen times per results page (photo link, review jump,
 * hours jump) with different and sometimes empty link text, but the path
 * is identical every time — so the slug is both more stable to parse and
 * naturally de-duplicating. The {City} path segment gives us free city
 * disambiguation without trusting a rendered address string.
 *
 * Evidence discipline
 * -------------------
 * A results page that contains no `/bus/` anchors at all is treated as a
 * CHECK FAILURE, not an absence: every genuine results page carries the
 * pattern (a zero-result page still renders nearby suggestions), so its
 * total absence means the markup changed under us or we were served
 * something other than the search page. Reporting that as "your listing is
 * gone" is precisely the failure this service is built to avoid.
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { cityFromAddress, fetchHtml, nameLooselyMatches, stateFromAddress } from "./httpClient";

const BUS_PATH = /^\/bus\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)\.html$/;

/** "Mr-Rooter-Plumbing-of-Toronto-ON" → "Mr Rooter Plumbing of Toronto ON" */
function deslug(slug: string): string {
  return decodeURIComponent(slug).replace(/-+/g, " ").trim();
}

/**
 * The exact URL this scraper requests. Exported so the robots-compliance
 * guard can evaluate the REAL builder rather than a transcription of it —
 * a copy in the test would keep passing after someone edited this function.
 */
export function yellowPagesCaSearchUrl(ctx: ScrapeContext): string {
  const city = cityFromAddress(ctx.address);
  const state = stateFromAddress(ctx.address);
  const where = [city, state].filter(Boolean).join(" ") || "Canada";

  return (
    "https://www.yellowpages.ca/search/si/1/" +
    encodeURIComponent(ctx.business_name) +
    "/" +
    encodeURIComponent(where)
  );
}

export async function scrapeYellowPagesCa(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const city = cityFromAddress(ctx.address);
  const url = yellowPagesCaSearchUrl(ctx);

  const fetched = await fetchHtml(url, opts);
  if (!fetched.ok) return { found: false, error: fetched.reason };

  try {
    const $ = cheerio.load(fetched.html);

    const seen = new Set<string>();
    const results: Array<{ path: string; city: string; name: string }> = [];
    $("a[href*='/bus/']").each((_, el) => {
      const raw = ($(el).attr("href") || "").split("?")[0].split("#")[0];
      const m = BUS_PATH.exec(raw);
      if (!m || seen.has(raw)) return;
      seen.add(raw);
      results.push({ path: raw, city: deslug(m[2]), name: deslug(m[3]) });
    });

    // No listing anchors anywhere => we were not served a results page.
    if (results.length === 0) {
      return { found: false, error: "parse_error" };
    }

    const match = results.find((r) => {
      if (!nameLooselyMatches(ctx.business_name, r.name)) return false;
      if (city && !r.city.toLowerCase().includes(city.toLowerCase())) return false;
      return true;
    });

    if (!match) return { found: false };

    return {
      found: true,
      listing_url: "https://www.yellowpages.ca" + match.path,
      nap: { name: match.name },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
