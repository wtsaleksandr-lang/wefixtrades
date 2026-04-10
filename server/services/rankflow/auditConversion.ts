/**
 * Audit-to-RankFlow Conversion Logic
 *
 * Determines the recommended RankFlow tier based on audit findings
 * and provides prefilled onboarding data from audit context.
 */

export interface RankFlowRecommendation {
  recommended_tier: "starter" | "growth" | "pro";
  reason: string;
  highlights: string[];
  cta_text: string;
  prefill: {
    business_name: string;
    website_url: string;
    niche: string;
    location: string;
  };
}

/**
 * Recommend a RankFlow tier based on audit scores and detected issues.
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
  const searchScore = audit.scores?.searchVisibility?.score || 0;
  const websiteScore = audit.scores?.websiteQuality?.score || 0;
  const kwCount = audit.keywords?.length || 0;

  const businessName = audit.business?.name || "";
  const websiteUrl = audit.business?.website || "";
  const niche = audit.trade || "general";
  const location = audit.city || "";

  const prefill = { business_name: businessName, website_url: websiteUrl, niche, location };

  // Pro: many issues + weak across multiple areas + established site
  if (issueCount >= 5 && total < 40 && kwCount > 5) {
    return {
      recommended_tier: "pro",
      reason: "Your audit found significant gaps across multiple areas. The Pro plan provides the most comprehensive monthly SEO improvements.",
      highlights: [
        `${issueCount} issues found in your audit`,
        "4 SEO pages created per month",
        "Expanded local directory coverage",
        "Technical SEO checks included",
      ],
      cta_text: "Start Fixing Everything",
      prefill,
    };
  }

  // Growth: moderate issues + weak search visibility or several service gaps
  if ((issueCount >= 3 && total < 60) || (searchScore < 10 && issueCount >= 2)) {
    return {
      recommended_tier: "growth",
      reason: "Your audit identified clear opportunities. The Growth plan covers page creation, local listings, and ongoing optimization.",
      highlights: [
        `${issueCount} issues holding back your visibility`,
        "2 SEO pages created per month",
        "Local citation building",
        "Bi-weekly progress reports",
      ],
      cta_text: "Start Growing",
      prefill,
    };
  }

  // Starter: fewer issues or decent baseline
  return {
    recommended_tier: "starter",
    reason: "Your business has a solid foundation. The Starter plan keeps your SEO improving with monthly optimizations and tracking.",
    highlights: [
      "Monthly keyword targeting and optimization",
      "Title and meta description improvements",
      "Google Search Console monitoring",
      "Monthly progress dashboard",
    ],
    cta_text: "Start Improving",
    prefill,
  };
}
