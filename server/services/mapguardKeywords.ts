/**
 * MapGuard auto-keyword generator — per-trade and per-category.
 *
 * Pre-launch audit found that the previous flat 6-template generator
 * produced low-signal queries like "kitchen_remodeling Sydney" (literal
 * trade ID with underscores) and "emergency carpenter Sydney" (the
 * "emergency" prefix only makes sense for a few trades). Customers
 * search with intent — "blocked drain", "leaking roof", "lock repair" —
 * not with the trade noun stuffed into a fixed template.
 *
 * Strategy:
 *   1. Curated, customer-intent keyword bundles for the high-volume
 *      trades where mis-targeting hurts most (plumber, electrician,
 *      roofer, locksmith, hvac, carpenter, painter, builder, tiler,
 *      landscaper, handyman, glazier, concreter, fencer, cleaner).
 *   2. Category-level fallback for the other ~70 trades the wizard
 *      offers (matches by trade ID prefix → category).
 *   3. Final fallback: humanise the trade ID (underscores → spaces),
 *      produce sensible generic templates, and ONLY include "emergency
 *      [trade] [city]" if the trade is in EMERGENCY_TRADES.
 *
 * The output is still capped downstream by
 * MAPGUARD_KEYWORDS_PER_SCAN_MAX (default 12, 2 Serper calls each), so
 * curated bundles can safely include up to ~10 candidates.
 *
 * Pure function — no I/O. Easy to unit-test.
 */

/** Trades where "emergency [trade] [city]" is a real customer search. */
const EMERGENCY_TRADES = new Set([
  "plumber",
  "electrician",
  "locksmith",
  "roofer",
  "glazier",
  "hvac",
  "garage_door_service",
  "tree_removal",
]);

/**
 * Curated bundles for the highest-volume / highest-intent trades.
 * Keys are normalised (lowercase, snake_case) trade IDs as stored in
 * `clients.trade_type`. Values are functions of `(city)` returning the
 * keyword candidate list — the order matters since downstream caps at
 * MAPGUARD_KEYWORDS_PER_SCAN_MAX. Most-distinctive intent first.
 */
const TRADE_KEYWORD_OVERRIDES: Record<string, (city: string) => string[]> = {
  plumber: (city) => [
    `plumber ${city}`,
    `blocked drain ${city}`,
    `hot water repair ${city}`,
    `burst pipe ${city}`,
    `leaking tap ${city}`,
    `emergency plumber ${city}`,
    `gas plumber ${city}`,
    `plumber near me`,
  ],
  electrician: (city) => [
    `electrician ${city}`,
    `${city} electrical work`,
    `switchboard upgrade ${city}`,
    `rewire house ${city}`,
    `power point installation ${city}`,
    `safety switch ${city}`,
    `emergency electrician ${city}`,
    `electrician near me`,
  ],
  roofer: (city) => [
    `roofer ${city}`,
    `roof repair ${city}`,
    `leaking roof ${city}`,
    `gutter cleaning ${city}`,
    `roof restoration ${city}`,
    `metal roof ${city}`,
    `tile roof repair ${city}`,
    `emergency roof repair ${city}`,
  ],
  locksmith: (city) => [
    `locksmith ${city}`,
    `emergency locksmith ${city}`,
    `lock repair ${city}`,
    `key cutting ${city}`,
    `car locksmith ${city}`,
    `locked out ${city}`,
    `mobile locksmith ${city}`,
  ],
  carpenter: (city) => [
    `carpenter ${city}`,
    `kitchen carpenter ${city}`,
    `deck builder ${city}`,
    `custom carpentry ${city}`,
    `cabinet maker ${city}`,
    `pergola builder ${city}`,
    `carpenter near me`,
  ],
  painter: (city) => [
    `painter ${city}`,
    `house painter ${city}`,
    `interior painter ${city}`,
    `exterior painter ${city}`,
    `commercial painter ${city}`,
    `painter near me`,
  ],
  hvac: (city) => [
    `air conditioning ${city}`,
    `aircon repair ${city}`,
    `${city} heating`,
    `split system installation ${city}`,
    `ducted air conditioning ${city}`,
    `emergency aircon ${city}`,
  ],
  builder: (city) => [
    `builder ${city}`,
    `home renovation ${city}`,
    `extension builder ${city}`,
    `custom home builder ${city}`,
    `granny flat builder ${city}`,
    `builder near me`,
  ],
  tiler: (city) => [
    `tiler ${city}`,
    `bathroom tiler ${city}`,
    `kitchen tiler ${city}`,
    `floor tiler ${city}`,
    `pool tiler ${city}`,
    `tiler near me`,
  ],
  glazier: (city) => [
    `glazier ${city}`,
    `glass repair ${city}`,
    `shower screen ${city}`,
    `broken window ${city}`,
    `splashback installation ${city}`,
    `emergency glazier ${city}`,
  ],
  concreter: (city) => [
    `concreter ${city}`,
    `concrete driveway ${city}`,
    `concrete slab ${city}`,
    `exposed aggregate ${city}`,
    `concrete pool surround ${city}`,
    `concreter near me`,
  ],
  fencer: (city) => [
    `fencer ${city}`,
    `fence installation ${city}`,
    `colorbond fence ${city}`,
    `timber fence ${city}`,
    `pool fencing ${city}`,
    `fencer near me`,
  ],
  landscaper: (city) => [
    `landscaper ${city}`,
    `garden design ${city}`,
    `garden maintenance ${city}`,
    `landscape construction ${city}`,
    `paving ${city}`,
    `landscaper near me`,
  ],
  gardener: (city) => [
    `gardener ${city}`,
    `lawn mowing ${city}`,
    `garden maintenance ${city}`,
    `hedge trimming ${city}`,
    `gardener near me`,
  ],
  handyman: (city) => [
    `handyman ${city}`,
    `small jobs ${city}`,
    `home repairs ${city}`,
    `handyman near me`,
    `odd jobs ${city}`,
  ],
  house_cleaning: (city) => [
    `house cleaning ${city}`,
    `cleaning service ${city}`,
    `house cleaner ${city}`,
    `domestic cleaning ${city}`,
    `cleaner near me`,
  ],
  carpet_cleaning: (city) => [
    `carpet cleaning ${city}`,
    `carpet cleaner ${city}`,
    `steam cleaning carpet ${city}`,
    `stain removal carpet ${city}`,
  ],
  pressure_washing: (city) => [
    `pressure washing ${city}`,
    `driveway cleaning ${city}`,
    `house washing ${city}`,
    `roof cleaning ${city}`,
  ],
  pool_cleaning: (city) => [
    `pool cleaning ${city}`,
    `pool maintenance ${city}`,
    `pool service ${city}`,
    `pool repair ${city}`,
  ],
  garage_door_service: (city) => [
    `garage door repair ${city}`,
    `garage door installation ${city}`,
    `roller door repair ${city}`,
    `emergency garage door ${city}`,
  ],
  tree_removal: (city) => [
    `tree removal ${city}`,
    `tree lopping ${city}`,
    `arborist ${city}`,
    `stump grinding ${city}`,
    `emergency tree removal ${city}`,
  ],
  pest_control: (city) => [
    `pest control ${city}`,
    `termite inspection ${city}`,
    `cockroach treatment ${city}`,
    `rat exterminator ${city}`,
  ],
};

/**
 * Category fallback — applied when the trade ID isn't in the override
 * map but its category prefix is recognised. Mirrors the wizard
 * `categoryId` taxonomy (cleaning, reno, mechanical, etc.).
 */
const CATEGORY_KEYWORD_PATTERNS: Record<string, (label: string, city: string) => string[]> = {
  cleaning: (label, city) => [
    `${label} ${city}`,
    `${label} service ${city}`,
    `${label} near me`,
    `${label} company ${city}`,
  ],
  reno: (label, city) => [
    `${label} ${city}`,
    `${label} contractor ${city}`,
    `best ${label} ${city}`,
    `${label} company ${city}`,
    `${label} near me`,
  ],
  driveway: (label, city) => [
    `${label} ${city}`,
    `${label} installation ${city}`,
    `${label} contractor ${city}`,
  ],
  emergency: (label, city) => [
    `emergency ${label} ${city}`,
    `${label} ${city}`,
    `24 hour ${label} ${city}`,
    `${label} near me`,
  ],
};

/**
 * Best-effort trade-id → category mapping used when we don't have a
 * curated override. Add entries as we observe them in client.trade_type
 * values; missing entries fall through to the generic generator.
 */
const TRADE_ID_TO_CATEGORY: Record<string, string> = {
  // cleaning category
  deep_cleaning: "cleaning",
  move_in_out_cleaning: "cleaning",
  commercial_cleaning: "cleaning",
  post_construction_cleaning: "cleaning",
  window_cleaning: "cleaning",
  gutter_cleaning: "cleaning",
  chimney_sweep: "cleaning",
  dryer_vent_cleaning: "cleaning",
  // reno category
  kitchen_remodeling: "reno",
  bathroom_remodeling: "reno",
  basement_finishing: "reno",
  home_addition: "reno",
  interior_painting: "reno",
  exterior_painting: "reno",
  cabinet_refinishing: "reno",
  flooring_installation: "reno",
  tile_installation: "reno",
  drywall_plaster: "reno",
  insulation_installation: "reno",
  deck_construction: "reno",
  patio_installation: "reno",
  fence_installation: "reno",
  shed_installation: "reno",
  roofing_installation: "reno",
};

function humanise(tradeId: string): string {
  return tradeId.replace(/_/g, " ").trim().toLowerCase();
}

/**
 * Generate monitoring keywords for a given trade + city.
 *
 * @param trade trade ID as stored in `clients.trade_type` (snake_case)
 *              or a free-text label (handled gracefully)
 * @param city  geographic descriptor — already validated by caller
 *
 * The output is intentionally over-generated; downstream
 * runMapguardScan slices to MAPGUARD_KEYWORDS_PER_SCAN_MAX. Producing
 * 8 candidates here means an admin can rotate the cap between 4 and 8
 * across scans for variety, all from the same source list.
 */
export function buildMonitorKeywords(trade: string, city: string): string[] {
  if (!trade) trade = "trades";
  const tradeKey = trade.toLowerCase().trim();

  // 1. Exact override — best-quality keyword list available.
  const override = TRADE_KEYWORD_OVERRIDES[tradeKey];
  if (override) return dedupe(override(city));

  // 2. Category fallback via the trade-id taxonomy.
  const categoryId = TRADE_ID_TO_CATEGORY[tradeKey];
  if (categoryId) {
    const pattern = CATEGORY_KEYWORD_PATTERNS[categoryId];
    if (pattern) {
      const label = humanise(tradeKey);
      return dedupe(pattern(label, city));
    }
  }

  // 3. Generic — humanise the ID, generate sensible templates, only
  // include "emergency" if the trade qualifies.
  const label = humanise(tradeKey);
  const out = [
    `${label} ${city}`,
    `${label} near me`,
    `best ${label} ${city}`,
    `${label} services ${city}`,
    `local ${label} ${city}`,
  ];
  if (EMERGENCY_TRADES.has(tradeKey)) {
    out.push(`emergency ${label} ${city}`);
  }
  return dedupe(out);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of items) {
    const norm = k.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(k);
  }
  return out;
}
