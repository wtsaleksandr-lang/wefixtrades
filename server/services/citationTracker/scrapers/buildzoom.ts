/**
 * BuildZoom scraper.
 *
 * Strategy:
 *   1. GET https://www.buildzoom.com/search/{name+city+state}
 *   2. Find the first anchor under /contractor/{slug} whose anchor text
 *      loosely matches the business name.
 *   3. Optionally GET the profile page to pull JSON-LD (telephone +
 *      postal address). Skipped if the search-results card already
 *      contains a phone substring next to the matched anchor (saves a
 *      request — most cards do).
 *
 * Why BuildZoom:
 *   - Server-rendered, no anti-bot wall (verified Wave 41 probe).
 *   - Profile pages embed schema.org Plumber/HomeAndConstructionBusiness
 *     JSON-LD with telephone + address — clean NAP extraction.
 *   - High signal for trades (its specialism), which is the core
 *     customer category for WeFixTrades.
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import type { NapSnapshot } from "../monitor";
import { fetchHtml, nameLooselyMatches } from "./httpClient";

function searchQuery(ctx: ScrapeContext): string {
  const city = ctx.address ? ctx.address.split(",").map((p) => p.trim()).slice(-2).join(" ") : "";
  return [ctx.business_name, city].filter(Boolean).join(" ");
}

interface ParsedJsonLd {
  name?: string;
  telephone?: string;
  address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
  url?: string;
}

/** Pull NAP from any schema.org *Business* JSON-LD block on the page. */
function extractNapFromJsonLd(html: string): Partial<NapSnapshot> | null {
  const $ = cheerio.load(html);
  let parsed: ParsedJsonLd | null = null;
  $("script[type='application/ld+json']").each((_, el) => {
    if (parsed) return;
    const raw = $(el).html();
    if (!raw) return;
    try {
      const json = JSON.parse(raw) as ParsedJsonLd | ParsedJsonLd[];
      const candidates = Array.isArray(json) ? json : [json];
      for (const c of candidates) {
        if (c && (c.telephone || c.address)) {
          parsed = c;
          return;
        }
      }
    } catch {
      // Non-JSON content in <script type=application/ld+json> — ignore.
    }
  });
  if (!parsed) return null;
  const p = parsed as ParsedJsonLd;
  const addr = p.address;
  const addressStr = addr
    ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
        .filter(Boolean)
        .join(", ")
    : undefined;
  return {
    name: p.name,
    phone: p.telephone,
    address: addressStr,
  };
}

export async function scrapeBuildzoom(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const q = searchQuery(ctx);
  const searchUrl = "https://www.buildzoom.com/search/" + encodeURIComponent(q).replace(/%20/g, "+");

  const searchRes = await fetchHtml(searchUrl, opts);
  if (!searchRes.ok) {
    return { found: false, error: searchRes.reason };
  }

  try {
    const $ = cheerio.load(searchRes.html);
    let profileUrl: string | undefined;
    let matchedName: string | undefined;
    $("a[href*='/contractor/']").each((_, el) => {
      if (profileUrl) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!/^\/contractor\//.test(href)) return;
      if (!nameLooselyMatches(ctx.business_name, text)) return;
      profileUrl = "https://www.buildzoom.com" + href;
      matchedName = text;
    });

    if (!profileUrl) return { found: false };

    // Profile fetch is best-effort — if it fails we still report the
    // listing as found with just the name we already have.
    const profileRes = await fetchHtml(profileUrl, opts);
    if (!profileRes.ok) {
      return {
        found: true,
        listing_url: profileUrl,
        nap: { name: matchedName },
      };
    }

    const nap = extractNapFromJsonLd(profileRes.html) ?? { name: matchedName };
    return {
      found: true,
      listing_url: profileUrl,
      nap: {
        name: nap.name ?? matchedName,
        phone: nap.phone,
        address: nap.address,
      },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
