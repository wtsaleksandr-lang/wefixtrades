/**
 * Tupalo scraper.
 *
 * Strategy:
 *   1. GET https://tupalo.com/en/search?q={name+city}
 *   2. Tupalo's search-results page is small (~20KB) server-rendered
 *      HTML. Result anchors look like /en/{city-slug}/{business-slug}.
 *   3. Loose-name match against anchor text.
 *
 * Why Tupalo:
 *   - One of the few directories that doesn't 403 a vanilla fetch
 *     (Wave 41 probe). Manta, Yellow Pages, Cylex, Hotfrog all CF-blocked.
 *   - Light-weight payload — cheap to scrape across the full subscriber
 *     base on the daily cron.
 *
 * Notes:
 *   - Tupalo is European-skewed but still has substantial US data.
 *     Listings present at low rate vs BBB / BuildZoom — that's accepted
 *     because we report found:false on misses, not "broken scraper".
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { fetchHtml, nameLooselyMatches } from "./httpClient";

function locFromContext(ctx: ScrapeContext): string {
  if (!ctx.address) return "";
  const parts = ctx.address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? "");
}

export async function scrapeTupalo(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const city = locFromContext(ctx);
  const q = [ctx.business_name, city].filter(Boolean).join(" ");
  const url = "https://tupalo.com/en/search?q=" + encodeURIComponent(q);

  const res = await fetchHtml(url, opts);
  if (!res.ok) return { found: false, error: res.reason };

  try {
    const $ = cheerio.load(res.html);
    let listingPath: string | undefined;
    let matchedName: string | undefined;
    // Tupalo result anchors are /en/{city-slug}/{business-slug}.
    $("a[href^='/en/']").each((_, el) => {
      if (listingPath) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      // Filter out nav anchors: results are exactly 3 segments deep.
      const segments = href.replace(/^\/+|\/+$/g, "").split("/");
      if (segments.length !== 3) return;
      if (segments[0] !== "en") return;
      if (!nameLooselyMatches(ctx.business_name, text)) return;
      listingPath = href;
      matchedName = text;
    });

    if (!listingPath) return { found: false };

    return {
      found: true,
      listing_url: "https://tupalo.com" + listingPath,
      nap: { name: matchedName },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
