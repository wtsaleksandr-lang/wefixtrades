/**
 * Auto-generate keyword targets from service + location combinations.
 * No user input needed — derived from onboarding profile data.
 */

const SERVICE_KEYWORD_TEMPLATES: Record<string, string[]> = {
  plumbing: ["plumber", "plumbing", "emergency plumber", "drain cleaning", "pipe repair", "water heater repair"],
  hvac: ["hvac", "air conditioning repair", "furnace repair", "ac installation", "heating and cooling", "hvac contractor"],
  electrical: ["electrician", "electrical repair", "wiring", "electrical contractor", "panel upgrade", "lighting installation"],
  roofing: ["roofer", "roofing contractor", "roof repair", "roof replacement", "roof inspection", "shingle repair"],
  cleaning: ["cleaning service", "house cleaning", "commercial cleaning", "deep cleaning", "move out cleaning", "office cleaning"],
  landscaping: ["landscaping", "landscaper", "lawn care", "lawn maintenance", "garden design", "tree trimming"],
  locksmith: ["locksmith", "emergency locksmith", "lock repair", "lock change", "lockout service", "key cutting"],
  general: ["contractor", "handyman", "home repair", "renovation", "remodeling", "general contractor"],
};

/**
 * Generate keyword targets from a service niche and locations.
 * Returns combinations like "emergency plumber Hamilton".
 */
export function generateKeywordTargets(
  niche: string,
  primaryLocation: string,
  additionalLocations?: string[],
  additionalServices?: string[],
): string[] {
  const nicheKey = niche.toLowerCase().replace(/[^a-z]/g, "");
  const templates = SERVICE_KEYWORD_TEMPLATES[nicheKey] || SERVICE_KEYWORD_TEMPLATES.general;

  const locations = [primaryLocation];
  if (additionalLocations) {
    for (const loc of additionalLocations) {
      if (loc.trim() && !locations.includes(loc.trim())) {
        locations.push(loc.trim());
      }
    }
  }

  // Merge additional services into templates
  const allTerms = [...templates];
  if (additionalServices) {
    for (const svc of additionalServices) {
      const term = svc.trim().toLowerCase();
      if (term && !allTerms.includes(term)) {
        allTerms.push(term);
      }
    }
  }

  const keywords: string[] = [];
  for (const term of allTerms) {
    for (const loc of locations) {
      keywords.push(`${term} ${loc}`);
    }
  }

  // Also add bare service terms (no location) for broader coverage
  for (const term of allTerms.slice(0, 3)) {
    keywords.push(`${term} near me`);
  }

  return keywords;
}

/**
 * Derive target_services array from niche for the RankFlow profile.
 */
export function deriveTargetServices(niche: string, additionalServices?: string[]): string[] {
  const nicheKey = niche.toLowerCase().replace(/[^a-z]/g, "");
  const base = SERVICE_KEYWORD_TEMPLATES[nicheKey]?.slice(0, 4) || SERVICE_KEYWORD_TEMPLATES.general.slice(0, 4);
  const result = [...base];
  if (additionalServices) {
    for (const svc of additionalServices) {
      if (svc.trim() && !result.includes(svc.trim().toLowerCase())) {
        result.push(svc.trim().toLowerCase());
      }
    }
  }
  return result;
}
