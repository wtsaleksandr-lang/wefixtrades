/**
 * Audit-to-RankFlow Conversion Logic
 *
 * Determines the recommended RankFlow tier based on audit findings
 * and provides specific, audit-derived justification for the recommendation.
 */

export interface RankFlowRecommendation {
  recommended_tier: "starter" | "growth" | "pro";
  headline: string;
  reason: string;
  specific_findings: string[];
  highlights: string[];
  cta_text: string;
  urgency_text: string;
  prefill: {
    business_name: string;
    website_url: string;
    niche: string;
    location: string;
  };
}

const ISSUE_LABELS: Record<string, string> = {
  "low-search-ranking": "not ranking for key service searches",
  "low-visibility": "low visibility in local search results",
  "weak-website": "website needs SEO improvements",
  "no-schema": "missing search result enhancements",
  "few-reviews": "not enough customer reviews",
  "no-gbp": "Google Business Profile incomplete",
  "slow-website": "website loading too slowly",
  "no-mobile": "website not optimized for mobile",
  "missing-citations": "not listed in key local directories",
  "weak-content": "service pages missing or too thin",
};

/**
 * Recommend a RankFlow tier based on audit scores and detected issues.
 * Returns specific, audit-derived findings to justify the recommendation.
 */
export function recommendRankFlowTier(audit: {
  scores?: { total?: number; searchVisibility?: { score?: number }; websiteQuality?: { score?: number }; googleMaps?: { score?: number } };
  detectedIssues?: string[];
  business?: { name?: string; website?: string };
  trade?: string;
  city?: string;
  keywords?: any[];
}): RankFlowRecommendation {
  const total = audit.scores?.total || 0;
  const issueCount = audit.detectedIssues?.length || 0;
  const issues = audit.detectedIssues || [];
  const searchScore = audit.scores?.searchVisibility?.score || 0;
  const websiteScore = audit.scores?.websiteQuality?.score || 0;
  const kwCount = audit.keywords?.length || 0;

  const businessName = audit.business?.name || "Your business";
  const websiteUrl = audit.business?.website || "";
  const niche = audit.trade || "general";
  const location = audit.city || "";
  const tradeLabel = niche.charAt(0).toUpperCase() + niche.slice(1);

  const prefill = { business_name: businessName, website_url: websiteUrl, niche, location };

  // Build specific findings from audit issues
  const specificFindings: string[] = [];
  for (const issue of issues.slice(0, 4)) {
    const label = ISSUE_LABELS[issue];
    if (label) specificFindings.push(`${businessName} is ${label}`);
  }
  if (searchScore < 10 && !specificFindings.some(f => f.includes("ranking"))) {
    specificFindings.push(`${businessName} is hard to find when people search for ${tradeLabel.toLowerCase()} services in ${location || "your area"}`);
  }
  if (websiteScore < 10 && !specificFindings.some(f => f.includes("website"))) {
    specificFindings.push("Your website is missing key SEO elements that help Google understand your services");
  }
  if (specificFindings.length === 0) {
    specificFindings.push(`${businessName} has room to rank higher for ${tradeLabel.toLowerCase()} searches in ${location || "your area"}`);
  }

  // Pro: many issues + weak across multiple areas
  if (issueCount >= 5 && total < 40 && kwCount > 5) {
    return {
      recommended_tier: "pro",
      headline: `${businessName} Needs Serious Visibility Work`,
      reason: `Your audit found ${issueCount} issues holding you back from getting found by customers searching for ${tradeLabel.toLowerCase()} services. The Pro plan gives you the most coverage to fix this fast.`,
      specific_findings: specificFindings,
      highlights: [
        "4 new SEO pages targeting your services each month",
        "Your business listed on 15+ local directories",
        "Technical issues fixed so Google can find you",
        "Weekly progress tracking so you see results",
      ],
      cta_text: "Fix My Visibility Now",
      urgency_text: "We can start work this week",
      prefill,
    };
  }

  // Growth: moderate issues + weak search visibility
  if ((issueCount >= 3 && total < 60) || (searchScore < 10 && issueCount >= 2)) {
    return {
      recommended_tier: "growth",
      headline: `Get More ${location || "Local"} Customers Finding ${businessName}`,
      reason: `Your audit shows ${businessName} is missing visibility where customers are searching. The Growth plan builds the pages and listings you need to show up.`,
      specific_findings: specificFindings,
      highlights: [
        "2 new service pages each month targeting what customers search",
        "Local directory listings so Google trusts your business",
        `Optimization for "${tradeLabel.toLowerCase()} ${location || "near me"}" searches`,
        "Bi-weekly reports showing your ranking progress",
      ],
      cta_text: `Get More ${tradeLabel} Calls`,
      urgency_text: "Work starts within 48 hours of signup",
      prefill,
    };
  }

  // Starter: fewer issues or decent baseline
  return {
    recommended_tier: "starter",
    headline: `Keep ${businessName} Moving Up in Search`,
    reason: `${businessName} has a solid foundation. Monthly SEO work keeps you climbing in search results so more customers find you instead of competitors.`,
    specific_findings: specificFindings,
    highlights: [
      `Monthly optimization for "${tradeLabel.toLowerCase()} ${location || "near me"}" searches`,
      "Title and description improvements on your key pages",
      "Google Search Console monitoring for issues",
      "Monthly dashboard showing what we did and what improved",
    ],
    cta_text: "Start Ranking Higher",
    urgency_text: "The sooner we start, the sooner rankings move",
    prefill,
  };
}
