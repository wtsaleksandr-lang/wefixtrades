/**
 * Citation Tracker — directory registry.
 *
 * The registry is the full map of directories we have EVALUATED. Only
 * entries with a non-null `scrape` are ever checked, and of those, only
 * the ones whose `isAvailable()` returns true are checked on this
 * deployment. Everything else is documented, not monitored — it must
 * never appear to the customer as a monitored, found, or missing listing.
 *
 * WHY THE LIST IS SHORT, AND WHY THAT IS THE POINT
 * ------------------------------------------------
 * This registry used to hold 54 entries, 49 of which were `noopScrape`
 * stubs that returned `{ found: false }` without a network call — read
 * downstream as "we checked and your listing is gone". Those became
 * `scrape: null`. This pass went further and asked, for every directory
 * that plausibly matters: can we actually check it, honestly, today?
 *
 * The answer in 2026 is: far fewer than the industry's "50+ directories"
 * marketing implies. Every claim below was verified by live probe on
 * 2026-08-29, not assumed:
 *
 *   - The major US directories are behind bot walls. yellowpages.com
 *     returns HTTP 403 for robots.txt itself; Angi, Superpages, Manta,
 *     Hotfrog, Cylex, ChamberOfCommerce and HomeStars all serve
 *     Cloudflare interstitials; HomeAdvisor serves PerimeterX; Yelp and
 *     Facebook return `Disallow: /` and 403/400 to any non-browser client.
 *   - The aggregators consolidated. ExpressUpdate 301s to a Data Axle
 *     portal behind a login. Acxiom's directory closed in 2019. Factual
 *     was absorbed into Foursquare.
 *   - The listings that DO carry ranking weight — Google, Apple, Bing —
 *     are API products, not web pages.
 *
 * A scraper that mostly fails is worse than no scraper: it burns the
 * customer's trust and generates noise. So the rule applied here is
 * "fewer checks, each of which genuinely works", and every rejection is
 * recorded in `unavailableReason` so the next person does not re-litigate
 * it from scratch.
 *
 * Customer-facing surfaces must report CITATION_TRACKER_MONITORED_COUNT
 * (what we check right now), never CITATION_TRACKER_DIRECTORY_COUNT
 * (everything we have evaluated).
 */

import type { NapSnapshot } from "./monitor";
import { scrapeBbb } from "./scrapers/bbb";
import { scrapeBuildzoom } from "./scrapers/buildzoom";
import { scrapeGoogleBusinessProfile, placesApiConfigured } from "./scrapers/googleBusinessProfile";
import { scrapeOpenStreetMap, osmConfigured } from "./scrapers/openStreetMap";
import { scrapeYellowPagesCa } from "./scrapers/yellowPagesCa";
import { scrapeN49 } from "./scrapers/n49";

export interface ScrapeContext {
  business_name: string;
  phone?: string;
  address?: string;
  website?: string;
  /**
   * The `listing_url` we recorded for this directory on a previous scan,
   * when we have one. Lets a scraper re-check a known listing directly
   * instead of re-running discovery — which for the Google check is the
   * difference between $0/mo and ~$128/mo at 300 subscribers.
   */
  known_listing_url?: string;
}

export interface ScrapeResult {
  found: boolean;
  listing_url?: string;
  nap?: NapSnapshot;
  /** Optional human-readable error if the scrape failed. */
  error?: string;
}

export interface DirectoryDef {
  /** Stable slug used in DB rows + alerts. */
  id: string;
  /** Display name shown to the customer. */
  name: string;
  /** Root URL of the directory (used for the "View on directory" link). */
  url: string;
  /**
   * Category bucket — drives which scrape strategy + which alert
   * severity. "general" is BBB / Yelp / YP class; "social" is
   * Foursquare / Facebook; "data_aggregator" is the listings that
   * spawn auto-citations elsewhere; "trade" is industry-specific.
   */
  category: "general" | "social" | "data_aggregator" | "trade" | "mapping" | "voice";
  /**
   * Which markets this check is useful for. Purely informational today —
   * the scrapers are safe to run anywhere — but it is what lets the
   * customer-facing list explain why a Canadian subscriber sees
   * YellowPages.ca and a US one does not.
   */
  markets: Array<"US" | "CA">;
  /** Why this directory is in the registry at all. Shown to customers. */
  rationale: string;
  /**
   * Scrape strategy. `null` means NOT IMPLEMENTED — monitor.ts skips the
   * directory entirely: no row, no status, no alert, and it is excluded
   * from every "checked" count. Never substitute a stub that returns
   * `{ found: false }`; that reads downstream as a confirmed removal.
   */
  scrape: ((ctx: ScrapeContext, opts?: { politeDelayMs?: number }) => Promise<ScrapeResult>) | null;
  /**
   * Runtime gate for directories whose check needs a credential or an
   * operator decision. Returning false means NOT CHECKED — identical
   * treatment to `scrape: null`, so a missing key can never look like a
   * missing listing. Absent means "always available".
   */
  isAvailable?: () => boolean;
  /**
   * Why we do not check this directory. REQUIRED whenever `scrape` is
   * null, so every exclusion carries its evidence. Verified 2026-08-29.
   */
  unavailableReason?: string;
}

export const CITATION_TRACKER_DIRECTORIES: DirectoryDef[] = [
  /* ═══ CHECKED — primary ══════════════════════════════════════════════
   * Google is not merely one directory among many: it carries roughly a
   * fifth of local-pack ranking weight by itself, more than everything
   * else in this registry combined. */
  {
    id: "google_business_profile",
    name: "Google Business Profile",
    url: "https://www.google.com/maps",
    category: "mapping",
    markets: ["US", "CA"],
    rationale:
      "The single highest-weight local ranking signal. Checked against Google's public Places index — the same data that feeds the local pack.",
    scrape: scrapeGoogleBusinessProfile,
    isAvailable: placesApiConfigured,
    unavailableReason:
      "Requires GOOGLE_MAPS_API_KEY, which production provisions — so this check is live there and inert in environments without it (dev, CI). The Google Business Profile API proper is a separate thing: it manages listings you own, needs a per-project approval, and this project sits at quota 0. When that approval lands, gbpApiConfigured() in the scraper reserves the slot for an owner-authenticated check.",
  },

  /* ═══ CHECKED — general ════════════════════════════════════════════ */
  {
    id: "bbb",
    name: "Better Business Bureau",
    url: "https://www.bbb.org",
    category: "general",
    markets: ["US", "CA"],
    rationale:
      "Highest-trust general directory in North America, and one of the very few whose robots.txt explicitly invites crawling of profile pages. Covers US and Canadian listings.",
    scrape: scrapeBbb,
    // OPEN COMPLIANCE ITEM — flagged 2026-08-29, deliberately NOT acted on
    // here because it changes what both the free tool and the paid product
    // check, which is a product decision rather than a bug fix.
    //
    // The rationale above is half right. bbb.org/robots.txt does explicitly
    // Allow the per-business profile paths (the "/us/…/profile/…" and
    // "/ca/…/profile/…" globs, query strings included). But the same
    // User-agent:* block also contains a broad "Disallow:" covering every
    // URL that carries a query string, and scrapeBbb's DISCOVERY call is
    // "/search?find_text=…" — which matches that Disallow and none of the
    // Allow exceptions.
    //
    // The data we get back is genuine, so this is NOT an honesty problem —
    // the statuses BBB gives us are real. It is a politeness/compliance
    // problem: we are fetching a path BBB asks crawlers not to fetch.
    //
    // Verified directly on 2026-08-29: robots.txt fetched and read in full,
    // and the search URL returns a real 283KB results page with 45 profile
    // anchors.
    //
    // Two ways out, neither free:
    //   1. Discover the profile URL without hitting /search. robots.txt
    //      advertises sitemap-business-profiles-index.xml and the profile
    //      paths are explicitly allowed. But the same probe got HTTP 403
    //      with "Cf-Mitigated: challenge" on profile pages, so this may
    //      just trade a robots violation for a Cloudflare wall.
    //   2. Drop BBB. That takes US coverage to Google + BuildZoom, and
    //      Canadian coverage to Google + YellowPages.ca + n49.
  },
  {
    id: "yellowpages_ca",
    name: "YellowPages.ca",
    url: "https://www.yellowpages.ca",
    category: "general",
    markets: ["CA"],
    rationale:
      "The dominant general directory in Canada, and reachable where its US sibling is not. Fills the gap that a US-only registry leaves for Canadian trades.",
    scrape: scrapeYellowPagesCa,
  },
  {
    id: "n49",
    name: "n49",
    url: "https://www.n49.com",
    category: "general",
    markets: ["CA"],
    rationale:
      "Second Canadian general directory that serves plain HTML, with heavy trades coverage. Gives Canadian subscribers a second independent check.",
    scrape: scrapeN49,
  },

  /* ═══ CHECKED — trade ══════════════════════════════════════════════ */
  {
    id: "buildzoom",
    name: "BuildZoom",
    url: "https://www.buildzoom.com",
    category: "trade",
    markets: ["US"],
    rationale:
      "Contractor-specific directory built on permit records, and the one trade platform that still serves structured JSON-LD to a plain client. Lead-generation relevance rather than ranking weight.",
    scrape: scrapeBuildzoom,
  },

  /* ═══ CHECKED WHEN CONFIGURED ══════════════════════════════════════ */
  {
    id: "openstreetmap",
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org",
    category: "mapping",
    markets: ["US", "CA"],
    rationale:
      "Open map data that propagates into Apple Maps and a long tail of smaller apps, so one OSM entry seeds many downstream listings.",
    scrape: scrapeOpenStreetMap,
    isAvailable: osmConfigured,
    unavailableReason:
      "Implemented and verified, but OFF until pointed at a compliant endpoint. The public Nominatim instance's usage policy prohibits systematic queries, which is exactly what a nightly per-subscriber sweep is. Set CITETRACK_NOMINATIM_URL (self-hosted, or a Nominatim-compatible host such as LocationIQ whose free tier permits commercial use) plus CITETRACK_NOMINATIM_KEY, or accept the policy risk explicitly with CITETRACK_OSM_USE_PUBLIC_INSTANCE=true.",
  },

  /* ═══ EVALUATED, NOT CHECKED — needs a credential ══════════════════
   * These are worth building. Each is blocked on a key or an approval,
   * not on a technical unknown, and each has its exact unblock recorded. */
  {
    id: "apple_maps",
    name: "Apple Maps",
    url: "https://maps.apple.com",
    category: "mapping",
    markets: ["US", "CA"],
    rationale:
      "Second-highest-value listing after Google — it backs Siri, Spotlight and CarPlay, and a large share of businesses have never claimed it.",
    scrape: null,
    unavailableReason:
      "No public web page to check: maps.apple.com is a JavaScript shell. The Apple Maps Server API can search places and is free within 25,000 calls/day, but requires an Apple Developer Program membership plus a Maps identifier and .p8 private key, exchanged for a short-lived token via a signed ES256 JWT. Deliberately not implemented unverified — the credentials exist on the WeFixTrades Apple team, so this is a scoped follow-up rather than a research problem.",
  },
  {
    id: "yelp",
    name: "Yelp",
    url: "https://www.yelp.com",
    category: "general",
    markets: ["US", "CA"],
    rationale:
      "Top-tier consumer directory and a syndication source for Apple Maps.",
    scrape: null,
    unavailableReason:
      "Blocked both ways. Scraping: robots.txt is `Disallow: /` with an explicit prohibition on automated access, and search returns HTTP 403 to a plain client. API: the Yelp Places API has no free tier — the entry plan is $229/month. Not worth it unless Yelp coverage becomes an advertised feature.",
  },
  {
    id: "foursquare",
    name: "Foursquare",
    url: "https://foursquare.com",
    category: "data_aggregator",
    markets: ["US", "CA"],
    rationale:
      "Still supplies place data to a number of downstream consumer surfaces even though its own apps were retired.",
    scrape: null,
    unavailableReason:
      "Web search requires a login. The Places API needs a key; its free allowance is documented inconsistently by Foursquare (500 vs 10,000 Pro calls/month), so cost is unpredictable. Low priority — a Foursquare listing is not a surface consumers check.",
  },
  {
    id: "mapquest",
    name: "MapQuest",
    url: "https://www.mapquest.com",
    category: "mapping",
    markets: ["US", "CA"],
    rationale: "Minor but real consumer map surface with a free business claim.",
    scrape: null,
    unavailableReason:
      "Profile pages are server-rendered but search results are client-side only, so there is no way to DISCOVER a listing URL from a plain fetch. robots.txt also disallows /search/*. This is the cleanest example in the registry of the trap httpClient's bot-wall detector exists for: the 2026-08-29 probe got HTTP 200 with 244KB of HTML and ZERO business anchors — the query echoed back inside a Next.js router payload and nothing else. A parser counting results reads that as 'not listed'. It is 'never checked'. Needs a MAPQUEST_API_KEY (free tier available) to become checkable.",
  },
  {
    id: "bing_places",
    name: "Bing Places",
    url: "https://www.bingplaces.com",
    category: "mapping",
    markets: ["US", "CA"],
    rationale:
      "Feeds Microsoft Copilot and, via the Bing index, other AI answer surfaces.",
    scrape: null,
    unavailableReason:
      "There is no public read API for Bing Places listings — the Bing Places for Business API only serves verified owners of a listing. Azure Maps is not a substitute: it queries a different POI dataset and would not tell us anything about the customer's Bing Places entry. Not checkable at any price.",
  },

  /* ═══ EVALUATED, NOT CHECKED — actively blocked ════════════════════
   * Probed live on 2026-08-29; each returned the response noted. Do not
   * re-add a scraper for these without re-probing first. */
  {
    id: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com",
    category: "social",
    markets: ["US", "CA"],
    rationale: "Still a top-tier authority citation and a real discovery surface.",
    scrape: null,
    unavailableReason:
      "No route in. Graph API Page search was removed entirely in 2020, and robots.txt is `Disallow: /` with automated collection expressly prohibited; a page fetch returns HTTP 400. Unreachable by any honest method.",
  },
  {
    id: "yellowpages",
    name: "Yellow Pages (US)",
    url: "https://www.yellowpages.com",
    category: "general",
    markets: ["US"],
    rationale: "Historically the default US general directory.",
    scrape: null,
    unavailableReason:
      "An edge WAF rejects non-browser clients before robots.txt is even served — the robots.txt URL itself returns HTTP 403. The most aggressive posture of any directory probed. Superpages and DexKnows share the same infrastructure and the same result.",
  },
  {
    id: "angi",
    name: "Angi",
    url: "https://www.angi.com",
    category: "trade",
    markets: ["US"],
    rationale: "Major home-services platform; HomeAdvisor is now Angi Leads.",
    scrape: null,
    unavailableReason:
      "Cloudflare interstitial on every path probed (HTTP 403). robots.txt additionally singles out SEO crawlers for a blanket disallow, which is exactly what this check looks like.",
  },
  {
    id: "houzz",
    name: "Houzz",
    url: "https://www.houzz.com",
    category: "trade",
    markets: ["US", "CA"],
    rationale: "Relevant to remodel and design trades.",
    scrape: null,
    unavailableReason:
      "REMOVED — was previously counted as a working check but is not one. Houzz served an Imperva 'Client Challenge' page: HTTP 200, ~3KB, zero anchors. The old scraper parsed that as a clean miss and reported CONFIRMED ABSENT on every scan for every subscriber. The bot-wall detector in httpClient.ts now catches this class of page. STILL EXCLUDED after a 2026-08-29 re-probe, and the re-probe is the reason to be careful rather than optimistic: from a residential IP Houzz served 1.1MB of genuine server-rendered HTML with 232 professional anchors and no challenge at all. That means the wall is IP-reputation-dependent, and our deploy host is a datacenter ASN — the population Imperva scores hardest. Reinstating this needs a clean probe FROM THE DEPLOY HOST, repeated, not a green result from a laptop.",
  },
  {
    id: "yellowbook",
    name: "Yellowbook",
    url: "https://www.yellowbook.com",
    category: "general",
    markets: ["US"],
    rationale: "Legacy US print-directory brand, folded into hibu.",
    scrape: null,
    unavailableReason:
      "REMOVED — was previously counted as a working check but is not one. The search endpoint ignores its query parameter: a request for 'ZZZQQQNOTAREALBUSINESS' returns the same 1,000-entry alphabetical index as any other term. The old scraper was loose-matching business names against a random A-Z index, which can produce both false absences and false FINDINGS.",
  },
  {
    id: "tupalo",
    name: "Tupalo",
    url: "https://tupalo.com",
    category: "general",
    markets: ["US", "CA"],
    rationale: "Small general directory, previously reachable.",
    scrape: null,
    unavailableReason:
      "REMOVED — now returns HTTP 429 to every request, so the check could only ever report 'could not check'. Carries no meaningful ranking weight either way.",
  },
  {
    id: "nextdoor",
    name: "Nextdoor",
    url: "https://nextdoor.com",
    category: "social",
    markets: ["US", "CA"],
    rationale: "Strong hyperlocal intent for home services.",
    scrape: null,
    unavailableReason:
      "robots.txt is `Disallow: /` apart from two unrelated paths, and the search page is a JavaScript shell with no listing data in the HTML.",
  },
  {
    id: "thumbtack",
    name: "Thumbtack",
    url: "https://www.thumbtack.com",
    category: "trade",
    markets: ["US"],
    rationale: "Home-services lead platform.",
    scrape: null,
    unavailableReason:
      "Search returned HTTP 404 plus a captcha challenge to a plain client, and robots.txt disallows the API and parts of the pro-profile tree. A 2026-08-29 re-probe from a residential IP got 386KB of server-rendered HTML with 32 service anchors, so — like Houzz — the block is IP-reputation-dependent rather than absolute. Still excluded: our deploy host is a datacenter ASN, and a check that works from a laptop but not from production is worse than no check, because it fails silently in the direction of 'not listed'. Gate for reinstating: a repeated clean probe FROM THE DEPLOY HOST.",
  },
  {
    id: "expressupdate",
    name: "Data Axle (ExpressUpdate)",
    url: "https://local-listings.data-axle.com",
    category: "data_aggregator",
    markets: ["US"],
    rationale:
      "Still a live aggregator that seeds long-tail citations, and still free for small volumes.",
    scrape: null,
    unavailableReason:
      "expressupdate.com now redirects to a Data Axle portal whose search requires an authenticated session, so there is nothing public to check. This is a place to PUSH listings, not a surface we can monitor.",
  },
  {
    id: "manta",
    name: "Manta",
    url: "https://www.manta.com",
    category: "general",
    markets: ["US"],
    rationale: "Long-standing US small-business directory.",
    scrape: null,
    unavailableReason:
      "robots.txt permits company profile paths, but search is behind a Cloudflare interstitial — so a listing URL cannot be discovered even though it could in principle be read.",
  },
  {
    id: "chamber_of_commerce",
    name: "ChamberOfCommerce.com",
    url: "https://www.chamberofcommerce.com",
    category: "general",
    markets: ["US"],
    rationale: "General directory with local-chamber branding.",
    scrape: null,
    unavailableReason: "Cloudflare interstitial on search and category pages (HTTP 403).",
  },
  {
    id: "trustpilot",
    name: "Trustpilot",
    url: "https://www.trustpilot.com",
    category: "general",
    markets: ["US", "CA"],
    rationale: "High-authority review domain.",
    scrape: null,
    unavailableReason: "Search returns HTTP 403 to a plain client.",
  },
  {
    id: "homestars",
    name: "HomeStars",
    url: "https://homestars.com",
    category: "trade",
    markets: ["CA"],
    rationale: "Leading Canadian home-services review directory.",
    scrape: null,
    unavailableReason: "Cloudflare interstitial (HTTP 403) on the company search path.",
  },
  {
    id: "citysearch",
    name: "Citysearch",
    url: "https://www.citysearch.com",
    category: "general",
    markets: ["US"],
    rationale: "Legacy general directory.",
    scrape: null,
    unavailableReason:
      "Effectively defunct — returns a ~2KB empty shell. Its parent CityGrid no longer resolves. Insider Pages, a sibling property, is in the same state.",
  },
  {
    id: "hotfrog",
    name: "Hotfrog",
    url: "https://www.hotfrog.com",
    category: "general",
    markets: ["US", "CA"],
    rationale: "Long-tail general directory.",
    scrape: null,
    unavailableReason:
      "Cloudflare interstitial (HTTP 403). Also a low-value listing — directories of this class routinely fall out of Google's index within months, so building around them adds maintenance risk for no ranking benefit. Cylex, EZlocal, ShowMeLocal, Brownbook and MerchantCircle were probed and rejected for the same combination of reasons.",
  },
];

/**
 * Full registry size, INCLUDING directories we do not check. Internal /
 * roadmap use only — never show this to a customer.
 */
export const CITATION_TRACKER_DIRECTORY_COUNT = CITATION_TRACKER_DIRECTORIES.length;

/**
 * True when a directory has a real scraper AND that scraper's
 * preconditions are met on this deployment.
 */
export function isDirectoryCheckable(dir: DirectoryDef): boolean {
  if (!dir.scrape) return false;
  return dir.isAvailable ? dir.isAvailable() === true : true;
}

/**
 * The directories we genuinely check right now. This is the only list a
 * customer-facing surface (marketing copy, portal counts, emails) may
 * describe.
 *
 * Deliberately a FUNCTION, not a frozen array: availability depends on
 * environment (an API key present in production may be absent in dev), and
 * a value computed once at import time would go stale and start
 * over-claiming.
 */
export function getMonitoredDirectories(): DirectoryDef[] {
  return CITATION_TRACKER_DIRECTORIES.filter(isDirectoryCheckable);
}

/** How many directories we actually check. Use this in customer copy. */
export function getMonitoredCount(): number {
  return getMonitoredDirectories().length;
}

/**
 * Directories with a working scraper, regardless of whether this
 * deployment has the credential to run it. Used by build-time guards and
 * by marketing copy that needs a stable figure independent of env.
 */
export const CITATION_TRACKER_IMPLEMENTED_DIRECTORIES: DirectoryDef[] =
  CITATION_TRACKER_DIRECTORIES.filter((d) => d.scrape !== null);

export const CITATION_TRACKER_IMPLEMENTED_COUNT =
  CITATION_TRACKER_IMPLEMENTED_DIRECTORIES.length;

/**
 * Per-subscriber cost of one full scan. Stated explicitly so it cannot
 * drift unnoticed — a widened Google field mask is the realistic way this
 * becomes expensive.
 *
 *   Google Business Profile — $0.00.
 *     Discovery (once per subscription) uses Text Search Pro, whose free
 *     allowance is 5,000 calls/month. Every later scan uses Place Details
 *     with an Essentials mask, free to 10,000 calls/month. One scan per
 *     subscriber per day stays inside the Essentials cap to roughly 330
 *     subscribers; past that it is ~$5 per additional 1,000 calls.
 *   BBB, YellowPages.ca, n49, BuildZoom — $0.00. Plain HTTP.
 *   OpenStreetMap — $0.00 when enabled against LocationIQ's free tier or
 *     a self-hosted instance.
 *
 * Total: $0.00 per subscriber per run at current and near-term scale.
 * Nothing here touches the paid SERP stack, so PR #2057's default-deny
 * cost gate is not involved and cannot be bypassed by this code path.
 */
export const CITATION_TRACKER_COST_PER_RUN_USD = 0;

/** Lookup by id. */
export function getDirectoryById(id: string): DirectoryDef | undefined {
  return CITATION_TRACKER_DIRECTORIES.find((d) => d.id === id);
}
