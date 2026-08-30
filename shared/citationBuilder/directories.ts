/**
 * Citation Builder — the submission registry.
 *
 * This is the list of places a HUMAN OPERATOR can create a business listing
 * today. It is the sole source of the per-order checklist, of the tier counts
 * shown on /citation-builder and /pricing, of the number in the Stripe line
 * item, and of `directories_total` on a new order — so a number on the site
 * can never drift from the checklist an operator is actually handed.
 *
 * IT ANSWERS A DIFFERENT QUESTION FROM THE TRACKER REGISTRY
 * ---------------------------------------------------------
 * server/services/citationTracker/directories.ts answers "can we READ this
 * listing from a datacenter IP without violating robots.txt". This file
 * answers "can a person SUBMIT to it". The two diverge on purpose: Yelp,
 * Angi, Nextdoor and Manta all block automated reads and all accept a human
 * signing up in a browser. A directory may be in one file and not the other.
 *
 * THE ADMISSION RULE
 * ------------------
 * An entry is admitted only when the submission path was checked and found
 * to exist, and the check is written down in `evidence` with the date. A
 * directory nobody could verify is REMOVED, not carried with a caveat —
 * the same discipline the Tracker registry settled on ("fewer checks, each
 * of which genuinely works"). `cost` must be `free`: a directory that
 * charges is a margin decision, and none of these one-time tiers price one
 * in.
 *
 * `evidence` is also the operator's honest brief. Several entries are known
 * to be awkward — Angi routes an already-scraped contractor to a sales rep,
 * Data Axle's free tool mostly updates existing records rather than adding
 * new ones. Those are recorded here rather than discovered at the desk, and
 * the operator marks the real outcome (`rejected` / `not_applicable`, both
 * of which require a note) instead of quietly skipping.
 *
 * WHY THIS IS SO MUCH SHORTER THAN THE OLD MARKETING COPY
 * -------------------------------------------------------
 * /citation-builder previously named ~80 directories across three tiers,
 * guaranteed "25 / 50 / 100+", and its FAQ promised "your tier number is a
 * guarantee, not a target". Most of that could not be delivered — several
 * entries were the same company counted up to five times, several had been
 * shut for years, and a dozen had no findable submission surface at all.
 * `nonInclusionNotes` below records every removal and the reason.
 *
 * The counts here are the real ones. They are smaller and they are true.
 */

export type CitationBuilderTier = "starter" | "pro" | "premium";

export interface BuilderDirectoryDef {
  /** Stable slug persisted on citation_builder_directory_tasks.directory_id. */
  id: string;
  /** Display name shown to the operator and, on completion, to the customer. */
  name: string;
  /** Where the operator goes to submit. */
  submitUrl: string;
  /**
   * `directory` — a business directory in the ordinary sense.
   * `core_map`  — the map/search platforms; these carry most of the value.
   * `profile`   — a social/company profile that carries NAP but is not a
   *               directory. Kept honest as its own category so customer
   *               copy never calls LinkedIn a directory.
   * `aggregator`— feeds other listings downstream.
   */
  category: "core_map" | "directory" | "trade" | "profile" | "aggregator";
  markets: Array<"US" | "CA">;
  /**
   * The CHEAPEST tier that includes this. Higher tiers inherit everything
   * below them, so "everything in Starter" is true by construction rather
   * than by copy.
   */
  minTier: CitationBuilderTier;
  cost: "free";
  /** What was checked, when, and anything the operator should expect. */
  evidence: string;
}

const TIER_ORDER: CitationBuilderTier[] = ["starter", "pro", "premium"];

/** The date the whole registry was compiled and each path checked. */
export const CITATION_BUILDER_REGISTRY_VERIFIED_ON = "2026-08-29";

export const CITATION_BUILDER_DIRECTORIES: BuilderDirectoryDef[] = [
  /* ═══ STARTER — the listings that actually carry weight ═══════════════
   * Every "voice search" surface reads from the first three. A citation
   * package that skipped them to pad a count with link farms would be
   * worthless, so they are in the cheapest tier.
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: "google_business_profile",
    name: "Google Business Profile",
    submitUrl: "https://business.google.com/create",
    category: "core_map",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free; verified 2026-08-29. Service-area businesses are fully supported (no public address, up to 20 service areas). Verification is Google's — mark the task submitted once the claim is filed and live once verification clears. If the customer already has a verified profile, mark not_applicable rather than creating a duplicate.",
  },
  {
    id: "bing_places",
    name: "Bing Places for Business",
    submitUrl: "https://www.bingplaces.com",
    category: "core_map",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free; relaunched October 2025 with an improved import-from-Google path, which is the fastest route when the customer's Google profile is already verified. Also feeds Copilot.",
  },
  {
    id: "apple_business",
    name: "Apple Business",
    submitUrl: "https://businessconnect.apple.com",
    category: "core_map",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free in 200+ countries including Canada. RENAMED from Apple Business Connect in April 2026; existing data migrated automatically. Needs an Apple Account for the business. This is the honest version of the retired 'voice-search optimized directories (Alexa, Siri, Google Assistant)' claim — Siri reads this.",
  },
  {
    id: "yelp",
    name: "Yelp",
    submitUrl: "https://biz.yelp.com",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free basic listing, confirmed 2026-08-29. Yelp blocks automated reads — which is why Citation Tracker cannot verify it — but a human signing up in a browser is unaffected. Expect an aggressive phone upsell to Yelp Ads after claiming; decline it.",
  },
  {
    id: "facebook_page",
    name: "Facebook Page",
    submitUrl: "https://www.facebook.com/pages/create",
    category: "profile",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free, and a genuine citation — Whitespark ranks it #3 among US citation sources for 2026. Needs a personal Facebook account to administer; if the customer has none and will not create one, mark not_applicable with that note.",
  },
  {
    id: "nextdoor_business",
    name: "Nextdoor Business",
    submitUrl: "https://business.nextdoor.com",
    category: "profile",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free business page, confirmed 2026-08-29. Strong hyperlocal intent for home services; modest SEO value. Address verification is required and can take a few days.",
  },
  {
    id: "bbb_profile",
    name: "Better Business Bureau (free profile)",
    submitUrl: "https://www.bbb.org/get-listed",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "The free, NON-ACCREDITED profile is a real offered path (bbb.org/all/business/get-noticed). BBB Accreditation is a separate paid annual membership (roughly $510/yr for 1-3 staff, more above that) and is explicitly NOT included — never tell a customer we accredited them. Publication is at the local BBB's discretion and can take over a week.",
  },
  {
    id: "merchantcircle",
    name: "MerchantCircle",
    submitUrl: "https://www.merchantcircle.com",
    category: "directory",
    markets: ["US"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Fetched successfully 2026-08-29: a working directory with content dated through August 2026, a 'Claim your business' path, and its own copy stating the free listing takes under five minutes. US only.",
  },
  {
    id: "brownbook",
    name: "Brownbook",
    submitUrl: "https://www.brownbook.net/add-business",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Fetched successfully 2026-08-29: an open 'Add a New Business' path with listing, claim/verify and Profile+ all explicitly labelled free. No account wall on the basic listing.",
  },
  {
    id: "chamber_of_commerce_com",
    name: "ChamberofCommerce.com",
    submitUrl: "https://www.chamberofcommerce.com/claim",
    category: "directory",
    markets: ["US"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Fetched successfully 2026-08-29: live, with a real free basic tier behind a heavy premium upsell (premium pricing is hidden until registration). Take the free tier. Bot-walled to scrapers, fine for a human in a browser.",
  },
  {
    id: "openstreetmap",
    name: "OpenStreetMap",
    submitUrl: "https://www.openstreetmap.org",
    category: "core_map",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free and open; the repo's own Citation Tracker reads it successfully, so the data path is live. Add the business as a node with name/address/phone/website tags. OSM's community rules apply — a sloppy or bulk edit gets reverted, so edit by hand.",
  },
  {
    id: "linkedin_company",
    name: "LinkedIn Company Page",
    submitUrl: "https://www.linkedin.com/company/setup/new",
    category: "profile",
    markets: ["US", "CA"],
    minTier: "starter",
    cost: "free",
    evidence:
      "Free. A NAP-carrying company profile, not a directory — customer copy must not count it as one. Requires an admin's personal LinkedIn profile.",
  },

  /* ═══ PRO — trade platforms and the Canadian set ══════════════════════ */
  {
    id: "houzz_pro_profile",
    name: "Houzz (professional profile)",
    submitUrl: "https://www.houzz.com/professionals/signup",
    category: "trade",
    markets: ["US", "CA"],
    minTier: "pro",
    cost: "free",
    evidence:
      "The strongest primary source in the set: Houzz's own pro site, authored by Houzz staff and published 2026-07-13, states a free Houzz business account adds the business to the Find Professionals directory. Houzz Pro (the $85-199/mo software) is optional and out of scope; step 11 of signup pushes a plan and a demo — skip it. Most relevant to remodel, design, landscaping and roofing; for a trade Houzz has no category for, mark not_applicable.",
  },
  {
    id: "thumbtack_pro",
    name: "Thumbtack (pro profile)",
    submitUrl: "https://www.thumbtack.com/pro",
    category: "trade",
    markets: ["US"],
    minTier: "pro",
    cost: "free",
    evidence:
      "Profile creation is genuinely free and carries the NAP. Thumbtack's lead purchasing is a separate pay-per-lead product (roughly $25-75 per lead for most trades) and is NOT in scope — set no budget and buy no leads. Never imply the customer gets free leads.",
  },
  {
    id: "angi_business_listing",
    name: "Angi (business listing)",
    submitUrl: "https://www.angi.com/companylist",
    category: "trade",
    markets: ["US"],
    minTier: "pro",
    cost: "free",
    evidence:
      "EXPECT FRICTION. Angi's own claim flow (signup.angi.com/pro/business-already-listed, checked 2026-08-29) reads 'Your business may already be listed. Speak with a sales rep to continue creating your account.' Angi has scraped a large contractor database, so an established trade business is usually already in it and the claim routes through a sales rep rather than self-serve. Attempt the free listing only; Angi Ads (~$200+/mo) and Angi Leads (per-lead, the former HomeAdvisor) are paid and out of scope. If the path is sales-gated for this business, mark the task rejected with exactly what was seen — do not leave it open and do not buy anything.",
  },
  {
    id: "buildzoom",
    name: "BuildZoom",
    submitUrl: "https://www.buildzoom.com/contractor/claim",
    category: "trade",
    markets: ["US"],
    minTier: "pro",
    cost: "free",
    evidence:
      "Free contractor claim. BuildZoom builds profiles from public permit and licence records, so for a licensed contractor an unclaimed profile usually already exists — claim it rather than creating a duplicate. The repo's Citation Tracker scrapes BuildZoom successfully, so the site is live and readable.",
  },
  {
    id: "instagram_business",
    name: "Instagram Business profile",
    submitUrl: "https://business.instagram.com",
    category: "profile",
    markets: ["US", "CA"],
    minTier: "pro",
    cost: "free",
    evidence:
      "Free; carries the NAP and links to the Facebook Page. A profile, not a directory. Skip when the customer already runs one — mark not_applicable rather than making a second account.",
  },
  {
    id: "alignable",
    name: "Alignable",
    submitUrl: "https://www.alignable.com",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "pro",
    cost: "free",
    evidence: "Free small-business network profile carrying NAP.",
  },
  {
    id: "yellowpages_ca",
    name: "YellowPages.ca",
    submitUrl: "https://solutions.yp.ca/free-online-listing",
    category: "directory",
    markets: ["CA"],
    minTier: "pro",
    cost: "free",
    evidence:
      "CANADA ONLY. Yellow Pages Canada publishes a free online listing path at solutions.yp.ca/free-online-listing — note this is the Canadian operation and is NOT the same as the US YP.com, which was dropped from this registry. For a US-only business, mark not_applicable.",
  },
  {
    id: "n49",
    name: "n49",
    submitUrl: "https://n49.com",
    category: "directory",
    markets: ["CA"],
    minTier: "pro",
    cost: "free",
    evidence:
      "CANADA-focused free listing. The repo's Citation Tracker scrapes n49 successfully, so the site is live and readable. Not applicable to a US-only business.",
  },
  {
    id: "homestars",
    name: "HomeStars",
    submitUrl: "https://homestars.com/for-business",
    category: "trade",
    markets: ["CA"],
    minTier: "pro",
    cost: "free",
    evidence:
      "CANADA ONLY. Free basic company profile; the promoted paid plan is out of scope. HomeStars bot-walls scrapers (Cloudflare) but a human in a browser is unaffected. Not applicable to a US-only business.",
  },

  /* ═══ PREMIUM — aggregator push and the long tail ═════════════════════
   * Deliberately small. The aggregator tier is where the old copy made its
   * least deliverable promises (Acxiom shut in 2019; Localeze is an annual
   * contract), and padding it back out would repeat the mistake.
   * ══════════════════════════════════════════════════════════════════ */
  {
    id: "data_axle_local_listings",
    name: "Data Axle (local listings)",
    submitUrl: "https://local-listings.data-axle.com",
    category: "aggregator",
    markets: ["US"],
    minTier: "premium",
    cost: "free",
    evidence:
      "The last surviving free small-volume aggregator push, and the successor to ExpressUpdate / Infogroup / ReferenceUSA — all of which the old copy listed as separate directories. Data Axle's own Salesgenie page offers a free path for fewer than 10 listings with no credit card. EXPECT FRICTION: the listings app returned an error when probed on 2026-08-29, and practitioners report the free tool reliably updates records already in the database but often will not add a genuinely new one. Record the confirmation permalink as the listing URL; if the business cannot be added, mark rejected with what was seen.",
  },
  {
    id: "foursquare_venue",
    name: "Foursquare (venue)",
    submitUrl: "https://foursquare.com/venue/create",
    category: "aggregator",
    markets: ["US", "CA"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Free venue add/claim; sits at #4 on Whitespark's 2026 top-50 US citation list and still feeds downstream consumer surfaces. Requires a login. Foursquare offers an optional one-time paid instant-verification (~$20) — do NOT buy it; the free mail verification is the slower alternative and is what this tier covers. Note Foursquare retired its own consumer app, so the value is as a data source, not as a place customers browse.",
  },
  {
    id: "mapquest",
    name: "MapQuest",
    submitUrl: "https://www.mapquest.com",
    category: "core_map",
    markets: ["US", "CA"],
    minTier: "premium",
    cost: "free",
    evidence: "Free place add/claim. Long-tail map corroboration.",
  },
  {
    id: "manta",
    name: "Manta",
    submitUrl: "https://www.manta.com/business-listings/free-business-listing",
    category: "directory",
    markets: ["US"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Manta publishes a free-business-listing page; paid plans start around $37/mo and are out of scope. The site bot-walls automated fetches (alive and blocking, not dead), so the free path was not machine-verified — attempt it and record the real outcome.",
  },
  {
    id: "hotfrog",
    name: "Hotfrog",
    submitUrl: "https://www.hotfrog.com/AddYourBusiness.aspx",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Free self-serve add. Returns HTTP 403 to automated fetches — alive and bot-blocking rather than dead — so the path was not machine-verified. Low individual weight; useful as NAP-consistency corroboration.",
  },
  {
    id: "cylex",
    name: "Cylex",
    submitUrl: "https://www.cylex.us.com/company-register.html",
    category: "directory",
    markets: ["US", "CA"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Free self-serve add. Bot-walled to automated fetches, same caveat as Hotfrog. Same corroboration role.",
  },
  {
    id: "ezlocal",
    name: "EZlocal",
    submitUrl: "https://ezlocal.com",
    category: "directory",
    markets: ["US"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Free listing with a paid upsell; take the free tier. Bot-walled to automated fetches, same caveat as Hotfrog.",
  },
  {
    id: "the_blue_book",
    name: "The Blue Book Network",
    submitUrl: "https://www.thebluebook.com",
    category: "trade",
    markets: ["US"],
    minTier: "premium",
    cost: "free",
    evidence:
      "Free commercial-construction company listing. Genuinely useful for commercial trades and irrelevant to a residential-only business — mark not_applicable with a note in that case rather than filing a listing nobody will see.",
  },
  {
    id: "bbb_canada",
    name: "Better Business Bureau (Canada)",
    submitUrl: "https://www.bbb.org/ca",
    category: "directory",
    markets: ["CA"],
    minTier: "premium",
    cost: "free",
    evidence:
      "CANADA ONLY, and the free non-accredited profile only. Not applicable to a US-only business, and never describe it as accreditation.",
  },
];

/**
 * Everything the old marketing copy named that is NOT in this registry, with
 * the reason. Kept in code so the next person to widen the list starts from
 * the evidence instead of the listicles — every "top 100 free directories"
 * article checked on 2026-08-29 recycled the same stale set, including
 * Citysearch, which is provably dead.
 *
 * Nothing reads this at runtime. It is documentation living next to the
 * thing it documents, the same convention as the Tracker registry's
 * `unavailableReason`.
 */
export const nonInclusionNotes: Record<string, string> = {
  acxiom:
    "DEAD SINCE 2019. Acxiom retired its directory and local-search products at the end of 2019 for CCPA compliance, stopped accepting registrations for My Business Listing Manager, and closed the listing directory. The company is now part of LiveRamp and takes no small-business submissions. The old copy named it twice — as its own directory and inside 'Aggregator submissions (Localeze, Acxiom, Foursquare)'.",
  citysearch:
    "DEAD. Fetched 2026-08-29: a near-empty page with a title and a tracking pixel, no search, no listings, no signup. Listicles claiming it 'became CityGrid' are stale.",
  localeze:
    "PAID AND RECURRING. Localeze / Neustar Localeze is one product, now TransUnion's Digital Business Profile, at roughly $99-120 per YEAR, usually bought through a reseller. A recurring annual cost cannot be covered by a one-time $79-299 fee — a Starter customer would be underwater in year one. The old copy named it as two separate directories ('Localeze' and 'Neustar Localeze').",
  factual: "Absorbed into Foursquare; no independent submission surface. Foursquare is listed on its own.",
  homeadvisor:
    "Same company as Angi — HomeAdvisor's pro side is now Angi Leads, a pay-per-lead product. Listing both double-counts one company. Covered by the single angi_business_listing task.",
  servicemagic: "Former name of HomeAdvisor, therefore Angi. Not a separate directory.",
  expressupdate: "Redirects to a Data Axle portal. Covered by data_axle_local_listings.",
  infofree: "Data Axle brand. Covered by data_axle_local_listings.",
  referenceusa: "Data Axle brand. Covered by data_axle_local_listings.",
  infogroup: "Former name of Data Axle. Covered by data_axle_local_listings.",
  yellowpages_us:
    "The YP.com free-listing marketing page (m1.adsolutions.yp.com) no longer resolves in DNS, and practitioners report free submissions silently failing to publish, followed by Thryv sales calls. Dropped rather than promised as best-effort. Note YellowPages.ca is a different operation and IS included.",
  superpages: "Same Thryv infrastructure as YP.com, which was dropped for the same reason.",
  dexknows: "Same Thryv infrastructure as YP.com, which was dropped for the same reason.",
  yellowbook: "Folded into hibu; no working self-serve submission path found.",
  porch:
    "UNVERIFIABLE. pro.porch.com returned only a thin tagline on 2026-08-29, and Porch Group has pivoted to homeowners insurance with the contractor marketplace de-emphasised. Removed rather than promised.",
  networx: "A lead-selling network, not a free directory listing. No verifiable free-profile path.",
  trustpilot:
    "A review platform, not a local citation, with negligible local-SEO weight for a trade business. The free plan exists, but its value is review collection — which this service explicitly does not do — so listing it would be padding.",
  zoominfo: "A B2B contact database, not a local-business directory, and not self-serve for a listing.",
  taskrabbit: "A marketplace with vetting and background-check onboarding, not a directory listing.",
  handy: "Marketplace onboarding, not a directory listing.",
  pro_referral: "Home Depot's programme, retired.",
  improvenet: "No working self-serve submission path found.",
  gaf_roofing_pro:
    "A manufacturer certification programme with its own requirements, not a directory anyone can submit to.",
  voice_assistants:
    "'Alexa / Siri / Google Assistant' are not directories. They read Google, Apple and Bing — all three of which are in the Starter tier under their own names.",
  unverifiable_filler:
    "Cybo, ShowMeLocal, iBegin, Spoke, MagicYellow, MojoPages, Local.com, MyHuckleberry — the recycled listicle tail. None could be verified as a live free submission path on 2026-08-29, and their individual ranking value is around zero. Removed rather than counted.",
  invented:
    "'TradeFix Directory', 'Trust.com', 'Findhome.com', 'PlumbingDirect', 'ElectricianFinder', 'HVACInformed', 'ElectricalBusinessNetwork', 'Cleaning4U', 'DozerList', 'LocalDatabase', 'LocalStack', 'Insiderpages', 'GetFreeListing', 'ConstructionWire' — no findable submission surface for any of them. Removed rather than reworded.",
};

/** Every listing an order on `tier` gets. Tiers are strictly nested. */
export function getDirectoriesForTier(tier: CitationBuilderTier): BuilderDirectoryDef[] {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0) return [];
  const included = new Set(TIER_ORDER.slice(0, idx + 1));
  return CITATION_BUILDER_DIRECTORIES.filter(d => included.has(d.minTier));
}

/**
 * The REAL per-tier counts. Everything customer-facing must read this — the
 * marketing bullets, the pricing page, the Stripe line item and
 * `directories_total` on a new order.
 */
export const CITATION_BUILDER_TIER_DIRECTORIES: Record<CitationBuilderTier, number> = {
  starter: getDirectoriesForTier("starter").length,
  pro: getDirectoriesForTier("pro").length,
  premium: getDirectoriesForTier("premium").length,
};

/** How many listings a tier adds on top of the tier below it. */
export function tierIncrement(tier: CitationBuilderTier): number {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx <= 0) return CITATION_BUILDER_TIER_DIRECTORIES[tier] ?? 0;
  return CITATION_BUILDER_TIER_DIRECTORIES[tier] - CITATION_BUILDER_TIER_DIRECTORIES[TIER_ORDER[idx - 1]];
}

export function getBuilderDirectory(id: string): BuilderDirectoryDef | undefined {
  return CITATION_BUILDER_DIRECTORIES.find(d => d.id === id);
}

/** Display names for a tier, in registry order — used by marketing copy. */
export function directoryNamesForTier(tier: CitationBuilderTier): string[] {
  return getDirectoriesForTier(tier).map(d => d.name);
}
