/**
 * BBB (Better Business Bureau) scraper.
 *
 * Strategy: GET https://www.bbb.org/search?find_text={name}&find_loc={city},{state}
 * The search-results page is server-rendered HTML; each result is an
 * anchor under /us/{state}/{city}/profile/... with the business name as
 * text. We match on loose-name + city to disambiguate "Mr. Rooter of
 * Waco" from "Mr. Rooter of Dallas".
 *
 * Why BBB:
 *   - Highest-trust general-purpose directory in the US.
 *   - Search results page is server-rendered (verified Wave 41 probe).
 *   - Profile pages 403 from a vanilla fetch but the search-results
 *     snippet has everything we need (name, city, profile URL). We
 *     skip the profile-deep-dive on purpose — it would just add a
 *     rate-limit risk for no NAP we can't already canonicalise from
 *     the customer's own input.
 *
 * Returns:
 *   - {found:true, listing_url, nap:{name}} when a same-city loose-match hits.
 *   - {found:false} for misses + rate-limit (rate-limit handled by the cron's
 *     consecutive-fail tracker — Wave 42 will turn that into requires_manual_check).
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { cityFromAddress, fetchHtml, nameLooselyMatches, stateFromAddress } from "./httpClient";

/** Canadian province/territory codes. BBB scopes search by country, and a
 * Canadian business searched without `find_country=CAN` returns US results
 * — which would read as "not listed" for a customer who is in fact listed.
 * Profile paths differ too (/ca/... vs /us/...), so we detect the country
 * from the address rather than assuming US. */
const CA_PROVINCES = new Set([
  "ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt",
  "alberta", "british columbia", "manitoba", "new brunswick", "newfoundland",
  "nova scotia", "ontario", "quebec", "saskatchewan",
]);

function isCanadian(ctx: ScrapeContext): boolean {
  const state = stateFromAddress(ctx.address)?.toLowerCase().trim();
  if (state && CA_PROVINCES.has(state)) return true;
  return /\bcanada\b/i.test(ctx.address ?? "");
}

export async function scrapeBbb(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const city = cityFromAddress(ctx.address);
  const state = stateFromAddress(ctx.address);
  const loc = [city, state].filter(Boolean).join(", ");
  const canadian = isCanadian(ctx);
  const url =
    "https://www.bbb.org/search?find_text=" +
    encodeURIComponent(ctx.business_name) +
    (loc ? "&find_loc=" + encodeURIComponent(loc) : "") +
    (canadian ? "&find_country=CAN" : "");

  const fetched = await fetchHtml(url, opts);
  if (!fetched.ok) {
    return { found: false, error: fetched.reason };
  }

  try {
    const $ = cheerio.load(fetched.html);
    // BBB search results: each result anchor matches /us/{state}/{city}/profile/{category}/{slug}-{ids}.
    let listingUrl: string | undefined;
    let listingName: string | undefined;
    $("a[href*='/profile/']").each((_, el) => {
      if (listingUrl) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!href.includes("/profile/")) return;
      if (!nameLooselyMatches(ctx.business_name, text)) return;
      // City disambiguation: require the city slug to appear in the URL.
      if (city) {
        const citySlug = city.toLowerCase().replace(/\s+/g, "-");
        if (!href.toLowerCase().includes("/" + citySlug + "/")) return;
      }
      listingUrl = href.startsWith("http") ? href : "https://www.bbb.org" + href;
      listingName = text;
    });

    if (!listingUrl) return { found: false };

    return {
      found: true,
      listing_url: listingUrl,
      nap: {
        name: listingName,
      },
    };
  } catch (err) {
    return { found: false, error: "parse_error" };
  }
}
