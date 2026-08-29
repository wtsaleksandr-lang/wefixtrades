/**
 * n49 scraper (Canadian general directory).
 *
 * Why this directory
 * ------------------
 * n49 is the second general-purpose Canadian directory that survives a
 * plain HTTP client, and it indexes trades heavily. Paired with
 * YellowPages.ca it gives Canadian subscribers two real checks instead of
 * the zero they had when the registry was US-only.
 *
 * Strategy
 * --------
 *   GET https://www.n49.com/search/{name-slug}/1/{city}-{province}/
 * Results are anchors of the form
 *   /biz/{id}/{name-slug}-{province}-{city}-{street-slug}/
 *
 * THE FALLBACK TRAP (this is the important part)
 * ----------------------------------------------
 * n49 does not 404 on a query it cannot parse. It silently 302s to a
 * default city index — a probe for `?query=Mr+Rooter+Plumbing` landed on
 * `/search/none/314/hamilton-ontario/`, a page full of perfectly valid
 * `/biz/` anchors for unrelated Hamilton businesses. A parser that trusted
 * that page would compare the customer's name against a random city's
 * listings and confidently report "not found" forever.
 *
 * So we verify the FINAL url still contains the slug we asked for. If it
 * doesn't, the search did not happen and the correct answer is
 * `check-failed`, not `absent`. The same guard catches the case where n49
 * changes its URL scheme: we fail loudly rather than emitting a stream of
 * false removals.
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { cityFromAddress, fetchHtml, nameLooselyMatches, stateFromAddress } from "./httpClient";

const BIZ_PATH = /^\/biz\/(\d+)\/([^/]+)\/?$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deslug(slug: string): string {
  return decodeURIComponent(slug).replace(/-+/g, " ").trim();
}

export async function scrapeN49(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const city = cityFromAddress(ctx.address);
  const state = stateFromAddress(ctx.address);
  const nameSlug = slugify(ctx.business_name);
  if (!nameSlug) return { found: false, error: "parse_error" };

  const where = slugify([city, state].filter(Boolean).join(" ")) || "canada";
  const url = `https://www.n49.com/search/${nameSlug}/1/${where}/`;

  const fetched = await fetchHtml(url, opts);
  if (!fetched.ok) return { found: false, error: fetched.reason };

  // Redirected away from our query => n49 served a default index, and this
  // page says nothing at all about the customer's listing.
  if (!fetched.url.toLowerCase().includes(nameSlug)) {
    return { found: false, error: "parse_error" };
  }

  try {
    const $ = cheerio.load(fetched.html);

    const seen = new Set<string>();
    const results: Array<{ path: string; slug: string }> = [];
    $("a[href*='/biz/']").each((_, el) => {
      const raw = ($(el).attr("href") || "").split("?")[0].split("#")[0];
      const m = BIZ_PATH.exec(raw);
      if (!m || seen.has(raw)) return;
      seen.add(raw);
      results.push({ path: raw, slug: deslug(m[2]) });
    });

    if (results.length === 0) return { found: false, error: "parse_error" };

    const match = results.find((r) => {
      if (!nameLooselyMatches(ctx.business_name, r.slug)) return false;
      // The slug embeds province + city + street, so a city check is a
      // plain substring test against it.
      if (city && !r.slug.toLowerCase().includes(city.toLowerCase())) return false;
      return true;
    });

    if (!match) return { found: false };

    return {
      found: true,
      listing_url: "https://www.n49.com" + match.path,
      nap: { name: match.slug },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
