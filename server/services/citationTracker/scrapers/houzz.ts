/**
 * Houzz scraper.
 *
 * Strategy:
 *   1. GET the trades-segment category page for the customer's city:
 *      https://www.houzz.com/professionals/{category}/c/{City--State}
 *      where category defaults to plumbing-contractors when we can't
 *      infer one — Houzz's category routing is liberal and a wrong
 *      slug 302s to a broader search.
 *   2. The category page is ~1.5MB of server-rendered HTML; result
 *      anchors live under /professionals/.../p/{slug}-{id}.
 *   3. Loose-name match against anchor text — Houzz pages include
 *      every business name in plain text up-front; the JS hydration
 *      only affects filters/pagination, not the first batch.
 *
 * Why Houzz:
 *   - Server-renders the first page of listings (verified — anchors
 *     for "Mr. Rooter" appear in plain HTML before any JS runs).
 *   - High authority for trade/contractor citations — explicit
 *     customer expectation for the WeFixTrades segment.
 *
 * Caveats:
 *   - Houzz uses a freeform `q` token in the slug. Many city pages
 *     don't surface a specific business by name on first page — we
 *     accept that as a found:false rather than infinitely paginate.
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { fetchHtml, nameLooselyMatches } from "./httpClient";

/** City-state slug per Houzz URL convention: "Waco--TX". */
function citySlug(ctx: ScrapeContext): string {
  if (!ctx.address) return "";
  const parts = ctx.address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const state = parts[parts.length - 1].replace(/\d{5}.*/, "").trim();
  const city = parts[parts.length - 2];
  return city.replace(/\s+/g, "-") + "--" + state;
}

export async function scrapeHouzz(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const slug = citySlug(ctx);
  // Default to plumbing-contractors; Houzz redirects to a broader index
  // if the customer is in a different trade.
  const url = slug
    ? "https://www.houzz.com/professionals/plumbing-contractors/c/" + encodeURIComponent(slug)
    : "https://www.houzz.com/professionals/plumbing-contractors/probr0-bo~q~" +
      encodeURIComponent(ctx.business_name);

  const res = await fetchHtml(url, opts);
  if (!res.ok) return { found: false, error: res.reason };

  try {
    const $ = cheerio.load(res.html);
    let profileUrl: string | undefined;
    let matchedName: string | undefined;
    // Houzz pro anchors: /professionals/.../p/{slug}-{id} or /pro/{slug}.
    $("a[href*='/pro']").each((_, el) => {
      if (profileUrl) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!/\/pro(?:fessionals)?\//.test(href)) return;
      if (!nameLooselyMatches(ctx.business_name, text)) return;
      profileUrl = href.startsWith("http") ? href : "https://www.houzz.com" + href;
      matchedName = text;
    });

    if (!profileUrl) return { found: false };

    return {
      found: true,
      listing_url: profileUrl,
      nap: { name: matchedName },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
