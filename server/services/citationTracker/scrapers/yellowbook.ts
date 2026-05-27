/**
 * Yellowbook scraper.
 *
 * Strategy:
 *   1. GET https://www.yellowbook.com/search?what={name}&where={city, state}
 *   2. Each listing on the search-results page is an anchor under
 *      /profile/{slug}.html with the business name as text and a
 *      phone number adjacent in the same card.
 *   3. Loose-name match for the anchor; if the card has a phone, we
 *      lift it into the NAP snapshot.
 *
 * Why Yellowbook:
 *   - Server-rendered, no anti-bot wall (Wave 41 probe).
 *   - High volume of US small-business listings — historically merged
 *     from the old print Yellowbook database.
 *
 * Notes:
 *   - The "/profile/...html" URL appears to encode an internal profile
 *     id at the end; we keep the full path as the listing URL.
 */
import * as cheerio from "cheerio";
import type { ScrapeContext, ScrapeResult } from "../directories";
import { fetchHtml, nameLooselyMatches } from "./httpClient";

function locFromContext(ctx: ScrapeContext): string {
  if (!ctx.address) return "";
  // Best-effort: "City, ST" — last two comma-separated tokens, dropping ZIP.
  const parts = ctx.address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const state = parts[parts.length - 1].replace(/\d{5}.*/, "").trim();
    return parts[parts.length - 2] + ", " + state;
  }
  return parts[0] ?? "";
}

/** Extract any phone-like sequence from the text of a search-result card. */
function extractPhone(text: string): string | undefined {
  // Match (NNN) NNN-NNNN or NNN-NNN-NNNN or NNN.NNN.NNNN.
  // Excludes the all-digits run that Yellowbook uses as a profile id
  // (which is always exactly 10 contiguous digits with no separator).
  const m = text.match(/(?:\(\d{3}\)\s?\d{3}[-.\s]\d{4}|\d{3}[-.]\d{3}[-.]\d{4})/);
  return m?.[0];
}

export async function scrapeYellowbook(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const loc = locFromContext(ctx);
  const url =
    "https://www.yellowbook.com/search?what=" +
    encodeURIComponent(ctx.business_name) +
    (loc ? "&where=" + encodeURIComponent(loc) : "");

  const res = await fetchHtml(url, opts);
  if (!res.ok) return { found: false, error: res.reason };

  try {
    const $ = cheerio.load(res.html);
    let profilePath: string | undefined;
    let matchedName: string | undefined;
    let matchedPhone: string | undefined;
    $("a[href*='/profile/']").each((_, el) => {
      if (profilePath) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!/^\/profile\//.test(href)) return;
      if (!nameLooselyMatches(ctx.business_name, text)) return;
      profilePath = href;
      matchedName = text;
      // Walk up the DOM to find a containing card and search for phone.
      const card = $(el).closest("article,li,div").first();
      const cardText = card.length ? card.text() : "";
      matchedPhone = extractPhone(cardText);
    });

    if (!profilePath) return { found: false };

    return {
      found: true,
      listing_url: "https://www.yellowbook.com" + profilePath,
      nap: {
        name: matchedName,
        phone: matchedPhone,
      },
    };
  } catch {
    return { found: false, error: "parse_error" };
  }
}
