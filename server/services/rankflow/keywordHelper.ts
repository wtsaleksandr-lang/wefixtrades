/**
 * RankFlow Keyword Engine
 *
 * Generates structured, intent-classified, clustered keyword targets
 * from a client's trade niche and service locations.
 */

/* ─── Types ─── */

export type KeywordIntent = "core" | "emergency" | "problem" | "service_specific" | "location_variant";

export interface TargetKeyword {
  keyword: string;
  intent: KeywordIntent;
  cluster: string;
  priority: number; // 1-10, higher = more valuable
  page_type: "core_service" | "emergency_service" | "service_specific" | "problem_based" | "location_variant";
}

export interface KeywordCluster {
  cluster: string;
  page_type: string;
  primary_keyword: string;
  keywords: TargetKeyword[];
  priority: number;
}

/* ─── Trade Data ─── */

interface TradeKeywordData {
  core: string[];
  emergency: string[];
  problems: string[];
  services: string[];
}

const TRADE_DATA: Record<string, TradeKeywordData> = {
  plumbing: {
    core: ["plumber", "plumbing"],
    emergency: ["emergency plumber", "24 hour plumber", "same day plumber", "after hours plumber"],
    problems: ["clogged drain", "burst pipe", "no hot water", "leaking faucet", "sewer backup", "frozen pipes", "running toilet"],
    services: ["drain cleaning", "water heater repair", "water heater installation", "pipe repair", "sewer line repair", "faucet installation", "toilet repair", "backflow testing"],
  },
  hvac: {
    core: ["hvac", "hvac contractor", "heating and cooling"],
    emergency: ["emergency hvac", "24 hour ac repair", "emergency furnace repair", "same day hvac"],
    problems: ["ac not cooling", "furnace not working", "no heat", "thermostat issues", "ac leaking water", "strange hvac noises"],
    services: ["air conditioning repair", "furnace repair", "ac installation", "furnace installation", "duct cleaning", "heat pump repair", "hvac maintenance"],
  },
  electrical: {
    core: ["electrician", "electrical contractor"],
    emergency: ["emergency electrician", "24 hour electrician", "same day electrician"],
    problems: ["power outage", "flickering lights", "tripping breaker", "burning smell electrical", "no power to outlet"],
    services: ["electrical repair", "panel upgrade", "wiring", "lighting installation", "outlet installation", "ceiling fan installation", "ev charger installation"],
  },
  roofing: {
    core: ["roofer", "roofing contractor", "roofing company"],
    emergency: ["emergency roof repair", "emergency roofer"],
    problems: ["roof leak", "missing shingles", "roof damage", "sagging roof", "ice dam damage"],
    services: ["roof repair", "roof replacement", "roof inspection", "shingle repair", "flat roof repair", "gutter installation", "roof maintenance"],
  },
  cleaning: {
    core: ["cleaning service", "house cleaning", "cleaner"],
    emergency: [],
    problems: ["move out cleaning needed", "post renovation cleanup"],
    services: ["deep cleaning", "move out cleaning", "move in cleaning", "commercial cleaning", "office cleaning", "carpet cleaning", "window cleaning"],
  },
  landscaping: {
    core: ["landscaping", "landscaper", "landscaping company"],
    emergency: [],
    problems: ["overgrown yard", "dead lawn", "drainage problems yard"],
    services: ["lawn care", "lawn maintenance", "garden design", "tree trimming", "tree removal", "patio installation", "sod installation", "snow removal"],
  },
  locksmith: {
    core: ["locksmith"],
    emergency: ["emergency locksmith", "24 hour locksmith", "lockout service"],
    problems: ["locked out of house", "locked out of car", "broken key in lock"],
    services: ["lock repair", "lock change", "lock installation", "key cutting", "lock rekey", "deadbolt installation", "safe opening"],
  },
  general: {
    core: ["contractor", "general contractor", "handyman"],
    emergency: ["emergency handyman"],
    problems: ["home repair needed", "storm damage repair"],
    services: ["home repair", "renovation", "remodeling", "kitchen renovation", "bathroom renovation", "deck building", "drywall repair"],
  },
};

const INTENT_PRIORITY: Record<KeywordIntent, number> = {
  emergency: 9,
  service_specific: 7,
  problem: 6,
  core: 5,
  location_variant: 3,
};

/* ─── Main Functions ─── */

/**
 * Generate structured keyword targets with intent, clustering, and priority.
 */
export function generateKeywordTargets(
  niche: string,
  primaryLocation: string,
  additionalLocations?: string[],
  additionalServices?: string[],
): TargetKeyword[] {
  const nicheKey = niche.toLowerCase().replace(/[^a-z]/g, "");
  const data = TRADE_DATA[nicheKey] || TRADE_DATA.general;

  const locations = [primaryLocation.trim()];
  if (additionalLocations) {
    for (const loc of additionalLocations) {
      const trimmed = loc.trim();
      if (trimmed && !locations.includes(trimmed)) locations.push(trimmed);
    }
  }

  const allKeywords: TargetKeyword[] = [];
  const primaryLoc = locations[0];

  // Core keywords — primary location only
  for (const term of data.core) {
    allKeywords.push(buildKeyword(term, primaryLoc, "core", "core_service"));
  }

  // Emergency keywords — primary location only
  for (const term of data.emergency) {
    allKeywords.push(buildKeyword(term, primaryLoc, "emergency", "emergency_service"));
  }

  // Problem keywords — primary location, top 4 only
  for (const term of data.problems.slice(0, 4)) {
    allKeywords.push(buildKeyword(term, primaryLoc, "problem", "problem_based"));
  }

  // Service-specific keywords — primary location
  const serviceTerms = [...data.services];
  if (additionalServices) {
    for (const svc of additionalServices) {
      const term = svc.trim().toLowerCase();
      if (term && !serviceTerms.includes(term)) serviceTerms.push(term);
    }
  }
  for (const term of serviceTerms) {
    allKeywords.push(buildKeyword(term, primaryLoc, "service_specific", "service_specific"));
  }

  // Location variants — core terms × additional locations
  for (const loc of locations.slice(1)) {
    for (const term of data.core.slice(0, 2)) {
      allKeywords.push(buildKeyword(term, loc, "location_variant", "location_variant"));
    }
    // Top 2 services per extra location
    for (const term of serviceTerms.slice(0, 2)) {
      allKeywords.push(buildKeyword(term, loc, "location_variant", "location_variant"));
    }
  }

  // Deduplicate, filter, cap
  const deduped = deduplicateKeywords(allKeywords);
  const filtered = filterSpammy(deduped);
  const capped = filtered.slice(0, 40);

  return capped;
}

/**
 * Group keywords into page-oriented clusters.
 * Each cluster = one potential page.
 */
export function clusterKeywords(keywords: TargetKeyword[]): KeywordCluster[] {
  const clusterMap = new Map<string, TargetKeyword[]>();

  for (const kw of keywords) {
    if (!clusterMap.has(kw.cluster)) clusterMap.set(kw.cluster, []);
    clusterMap.get(kw.cluster)!.push(kw);
  }

  const clusters: KeywordCluster[] = [];
  for (const [clusterName, kws] of clusterMap) {
    // Sort by priority descending within cluster
    kws.sort((a, b) => b.priority - a.priority);
    const primary = kws[0];
    clusters.push({
      cluster: clusterName,
      page_type: primary.page_type,
      primary_keyword: primary.keyword,
      keywords: kws,
      priority: Math.max(...kws.map(k => k.priority)),
    });
  }

  // Sort clusters by priority descending
  clusters.sort((a, b) => b.priority - a.priority);
  return clusters;
}

/**
 * Select the top N clusters for this month's page creation tasks.
 */
export function selectClustersForMonth(clusters: KeywordCluster[], pageCount: number): KeywordCluster[] {
  return clusters.slice(0, pageCount);
}

/**
 * Derive target_services array from niche for the RankFlow profile.
 */
export function deriveTargetServices(niche: string, additionalServices?: string[]): string[] {
  const nicheKey = niche.toLowerCase().replace(/[^a-z]/g, "");
  const data = TRADE_DATA[nicheKey] || TRADE_DATA.general;
  const base = [...data.core.slice(0, 2), ...data.services.slice(0, 2)];
  if (additionalServices) {
    for (const svc of additionalServices) {
      const term = svc.trim().toLowerCase();
      if (term && !base.includes(term)) base.push(term);
    }
  }
  return base;
}

/* ─── Internal Helpers ─── */

function buildKeyword(
  term: string,
  location: string,
  intent: KeywordIntent,
  pageType: TargetKeyword["page_type"],
): TargetKeyword {
  const keyword = `${term} ${location}`;
  const cluster = toClusterKey(term, location);
  const basePriority = INTENT_PRIORITY[intent] || 5;
  // Boost emergency slightly, penalize location_variant
  const priority = Math.min(10, basePriority);

  return { keyword, intent, cluster, priority, page_type: pageType };
}

function toClusterKey(term: string, location: string): string {
  // Group similar terms into same cluster
  // "emergency plumber" and "24 hour plumber" → different clusters
  // "plumber Hamilton" and "plumbing Hamilton" → same cluster (core)
  const normalized = term.toLowerCase()
    .replace(/\b(24 hour|same day|after hours)\b/g, "emergency")
    .replace(/\bing\b/g, "er") // plumbing → plumber (loose grouping)
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const locNorm = location.toLowerCase().replace(/[^a-z]/g, "_").replace(/_+/g, "_");
  return `${normalized}_${locNorm}`;
}

function deduplicateKeywords(keywords: TargetKeyword[]): TargetKeyword[] {
  const seen = new Set<string>();
  const result: TargetKeyword[] = [];

  for (const kw of keywords) {
    const normalized = kw.keyword.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) continue;

    // Near-duplicate check: if a keyword is substring of existing higher-priority one, skip
    let isDupe = false;
    for (const existing of seen) {
      if (stringSimilarity(normalized, existing) > 0.85) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;

    seen.add(normalized);
    result.push(kw);
  }

  return result;
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  // Simple containment check + length ratio
  if (longer.includes(shorter)) return shorter.length / longer.length;
  // Word overlap ratio
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

function filterSpammy(keywords: TargetKeyword[]): TargetKeyword[] {
  return keywords.filter(kw => {
    const words = kw.keyword.split(" ");
    // Too many words = spammy
    if (words.length > 6) return false;
    // Contains stacking modifiers
    const spamPatterns = /\b(best cheap|cheap best|top rated best|near me 24\/7|free cheap)\b/i;
    if (spamPatterns.test(kw.keyword)) return false;
    return true;
  });
}
