/**
 * Citation Tracker — directory registry.
 *
 * 50+ directories we monitor for NAP consistency. Each entry pairs a
 * stable identifier with a search-URL pattern (used to discover a
 * customer's listing) and a scrape-strategy stub (Wave 4 will fill in
 * actual scrapers — for now monitor.ts treats every listing as a
 * no-op success and only diffs against what's already in the DB).
 *
 * The shape is intentionally production-shaped so Wave 4 only needs to
 * fill in the `scrape` function bodies — nothing else moves.
 */

import type { NapSnapshot } from "./monitor";

export interface ScrapeContext {
  business_name: string;
  phone?: string;
  address?: string;
  website?: string;
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
   * Search URL pattern. Used to discover a customer's listing on first
   * scan and to recover after a moved-listing event. `{q}` substitutes
   * URL-encoded business name + city.
   */
  searchUrlPattern: string;
  /**
   * Category bucket — drives which scrape strategy + which alert
   * severity. "general" is BBB / Yelp / YP class; "social" is
   * Foursquare / Facebook; "data-aggregator" is the listings that
   * spawn auto-citations elsewhere; "trade" is industry-specific.
   */
  category: "general" | "social" | "data_aggregator" | "trade" | "mapping" | "voice";
  /**
   * Scrape strategy stub. Wave 4 will implement these against the
   * directory's public HTML. Until then, monitor.ts treats a `null`
   * scrape result as "no change" — the row keeps whatever NAP we
   * already have.
   */
  scrape: ((ctx: ScrapeContext) => Promise<ScrapeResult>) | null;
}

/* ─── Shared scrape stub ────────────────────────────────────────────────
 * Returns found:false. Replaced per-directory in Wave 4 with real
 * cheerio / playwright scrapers. Kept as a single placeholder so the
 * monitor loop has a predictable shape during Wave 3.
 * ────────────────────────────────────────────────────────────────────── */
async function noopScrape(_ctx: ScrapeContext): Promise<ScrapeResult> {
  return { found: false };
}

export const CITATION_TRACKER_DIRECTORIES: DirectoryDef[] = [
  // ─── General / top-tier ────────────────────────────────────────────
  { id: "yelp", name: "Yelp", url: "https://www.yelp.com", searchUrlPattern: "https://www.yelp.com/search?find_desc={q}", category: "general", scrape: noopScrape },
  { id: "yellowpages", name: "Yellow Pages", url: "https://www.yellowpages.com", searchUrlPattern: "https://www.yellowpages.com/search?search_terms={q}", category: "general", scrape: noopScrape },
  { id: "bbb", name: "Better Business Bureau", url: "https://www.bbb.org", searchUrlPattern: "https://www.bbb.org/search?find_text={q}", category: "general", scrape: noopScrape },
  { id: "mapquest", name: "MapQuest", url: "https://www.mapquest.com", searchUrlPattern: "https://www.mapquest.com/search/results?query={q}", category: "mapping", scrape: noopScrape },
  { id: "manta", name: "Manta", url: "https://www.manta.com", searchUrlPattern: "https://www.manta.com/search?search_source=nav&search={q}", category: "general", scrape: noopScrape },
  { id: "superpages", name: "Superpages", url: "https://www.superpages.com", searchUrlPattern: "https://www.superpages.com/search?STYPE=S&SRC=hdr&search_terms={q}", category: "general", scrape: noopScrape },
  { id: "yellowbook", name: "Yellowbook", url: "https://www.yellowbook.com", searchUrlPattern: "https://www.yellowbook.com/search?what={q}", category: "general", scrape: noopScrape },
  { id: "merchantcircle", name: "MerchantCircle", url: "https://www.merchantcircle.com", searchUrlPattern: "https://www.merchantcircle.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "citysearch", name: "Citysearch", url: "https://www.citysearch.com", searchUrlPattern: "https://www.citysearch.com/find?text={q}", category: "general", scrape: noopScrape },
  { id: "insiderpages", name: "Insider Pages", url: "https://www.insiderpages.com", searchUrlPattern: "https://www.insiderpages.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "hotfrog", name: "Hotfrog", url: "https://www.hotfrog.com", searchUrlPattern: "https://www.hotfrog.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "brownbook", name: "Brownbook", url: "https://www.brownbook.net", searchUrlPattern: "https://www.brownbook.net/search?q={q}", category: "general", scrape: noopScrape },
  { id: "cybo", name: "Cybo", url: "https://www.cybo.com", searchUrlPattern: "https://www.cybo.com/search/?q={q}", category: "general", scrape: noopScrape },
  { id: "cylex", name: "Cylex", url: "https://www.cylex.us.com", searchUrlPattern: "https://www.cylex.us.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "tupalo", name: "Tupalo", url: "https://tupalo.com", searchUrlPattern: "https://tupalo.com/en/search?q={q}", category: "general", scrape: noopScrape },
  { id: "chamber_of_commerce", name: "ChamberOfCommerce.com", url: "https://www.chamberofcommerce.com", searchUrlPattern: "https://www.chamberofcommerce.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "n49", name: "n49", url: "https://www.n49.com", searchUrlPattern: "https://www.n49.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "ezlocal", name: "EZlocal", url: "https://www.ezlocal.com", searchUrlPattern: "https://www.ezlocal.com/?find={q}", category: "general", scrape: noopScrape },
  { id: "showmelocal", name: "ShowMeLocal", url: "https://www.showmelocal.com", searchUrlPattern: "https://www.showmelocal.com/search.aspx?q={q}", category: "general", scrape: noopScrape },
  { id: "localdatabase", name: "LocalDatabase", url: "https://www.localdatabase.com", searchUrlPattern: "https://www.localdatabase.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "ibegin", name: "iBegin", url: "https://www.ibegin.com", searchUrlPattern: "https://www.ibegin.com/search/?q={q}", category: "general", scrape: noopScrape },
  { id: "localstack", name: "LocalStack", url: "https://www.localstack.com", searchUrlPattern: "https://www.localstack.com/search?q={q}", category: "general", scrape: noopScrape },
  { id: "expressupdate", name: "ExpressUpdate (Data Axle)", url: "https://www.expressupdate.com", searchUrlPattern: "https://www.expressupdate.com/search?q={q}", category: "data_aggregator", scrape: noopScrape },
  { id: "dataaxle", name: "Data Axle", url: "https://www.data-axle.com", searchUrlPattern: "https://www.data-axle.com/search?q={q}", category: "data_aggregator", scrape: noopScrape },

  // ─── Mapping / voice search ────────────────────────────────────────
  { id: "bing_places", name: "Bing Places", url: "https://www.bingplaces.com", searchUrlPattern: "https://www.bing.com/maps?q={q}", category: "mapping", scrape: noopScrape },
  { id: "apple_maps", name: "Apple Maps", url: "https://mapsconnect.apple.com", searchUrlPattern: "https://duckduckgo.com/?q=site%3Amaps.apple.com+{q}", category: "mapping", scrape: noopScrape },
  { id: "here_we_go", name: "HERE WeGo", url: "https://wego.here.com", searchUrlPattern: "https://wego.here.com/search/?q={q}", category: "mapping", scrape: noopScrape },
  { id: "waze", name: "Waze", url: "https://www.waze.com", searchUrlPattern: "https://www.waze.com/live-map/directions?q={q}", category: "mapping", scrape: noopScrape },
  { id: "tomtom", name: "TomTom", url: "https://places.tomtom.com", searchUrlPattern: "https://places.tomtom.com/search?q={q}", category: "mapping", scrape: noopScrape },

  // ─── Social ────────────────────────────────────────────────────────
  { id: "foursquare", name: "Foursquare", url: "https://foursquare.com", searchUrlPattern: "https://foursquare.com/explore?q={q}", category: "social", scrape: noopScrape },
  { id: "facebook", name: "Facebook", url: "https://www.facebook.com", searchUrlPattern: "https://www.facebook.com/search/pages?q={q}", category: "social", scrape: noopScrape },
  { id: "instagram", name: "Instagram", url: "https://www.instagram.com", searchUrlPattern: "https://www.instagram.com/explore/tags/{q}", category: "social", scrape: noopScrape },
  { id: "linkedin", name: "LinkedIn", url: "https://www.linkedin.com", searchUrlPattern: "https://www.linkedin.com/search/results/companies/?keywords={q}", category: "social", scrape: noopScrape },
  { id: "nextdoor", name: "Nextdoor", url: "https://nextdoor.com", searchUrlPattern: "https://nextdoor.com/search/?query={q}", category: "social", scrape: noopScrape },

  // ─── Trade-specific ────────────────────────────────────────────────
  { id: "angi", name: "Angi (Angie's List)", url: "https://www.angi.com", searchUrlPattern: "https://www.angi.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "thumbtack", name: "Thumbtack", url: "https://www.thumbtack.com", searchUrlPattern: "https://www.thumbtack.com/search?query={q}", category: "trade", scrape: noopScrape },
  { id: "homeadvisor", name: "HomeAdvisor", url: "https://www.homeadvisor.com", searchUrlPattern: "https://www.homeadvisor.com/c.{q}.html", category: "trade", scrape: noopScrape },
  { id: "houzz", name: "Houzz", url: "https://www.houzz.com", searchUrlPattern: "https://www.houzz.com/professionals/{q}", category: "trade", scrape: noopScrape },
  { id: "porch", name: "Porch", url: "https://porch.com", searchUrlPattern: "https://porch.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "networx", name: "Networx", url: "https://www.networx.com", searchUrlPattern: "https://www.networx.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "buildzoom", name: "BuildZoom", url: "https://www.buildzoom.com", searchUrlPattern: "https://www.buildzoom.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "pro_referral", name: "Pro Referral", url: "https://www.proreferral.com", searchUrlPattern: "https://www.proreferral.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "trust_com", name: "Trust.com", url: "https://www.trust.com", searchUrlPattern: "https://www.trust.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "homestars", name: "HomeStars", url: "https://homestars.com", searchUrlPattern: "https://homestars.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "taskrabbit", name: "TaskRabbit", url: "https://www.taskrabbit.com", searchUrlPattern: "https://www.taskrabbit.com/services?q={q}", category: "trade", scrape: noopScrape },
  { id: "handy", name: "Handy", url: "https://www.handy.com", searchUrlPattern: "https://www.handy.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "gaf_roofing", name: "GAF Roofing Pro", url: "https://www.gaf.com", searchUrlPattern: "https://www.gaf.com/en-us/roofing-contractors/{q}", category: "trade", scrape: noopScrape },
  { id: "plumbing_direct", name: "PlumbingDirect", url: "https://www.plumbingdirect.com", searchUrlPattern: "https://www.plumbingdirect.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "hvac_com", name: "HVAC.com", url: "https://www.hvac.com", searchUrlPattern: "https://www.hvac.com/find-an-hvac-contractor?q={q}", category: "trade", scrape: noopScrape },
  { id: "electrician_finder", name: "ElectricianFinder", url: "https://www.electricianfinder.com", searchUrlPattern: "https://www.electricianfinder.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "roofing_contractor", name: "RoofingContractor", url: "https://www.roofingcontractor.com", searchUrlPattern: "https://www.roofingcontractor.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "landscaping_network", name: "LandscapingNetwork", url: "https://www.landscapingnetwork.com", searchUrlPattern: "https://www.landscapingnetwork.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "locksmith_ledger", name: "Locksmith Ledger", url: "https://www.locksmithledger.com", searchUrlPattern: "https://www.locksmithledger.com/search?q={q}", category: "trade", scrape: noopScrape },
  { id: "pestworld", name: "PestWorld", url: "https://www.pestworld.org", searchUrlPattern: "https://www.pestworld.org/find-a-pest-control-professional/?q={q}", category: "trade", scrape: noopScrape },
];

/** Total count, exported for tests + admin UI badge. */
export const CITATION_TRACKER_DIRECTORY_COUNT = CITATION_TRACKER_DIRECTORIES.length;

/** Lookup by id. */
export function getDirectoryById(id: string): DirectoryDef | undefined {
  return CITATION_TRACKER_DIRECTORIES.find((d) => d.id === id);
}
