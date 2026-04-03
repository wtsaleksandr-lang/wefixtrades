export type Service = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  priceLabel: string;
  billingPeriod: "monthly" | "one-time";
  category: "visibility" | "leads" | "reputation" | "automation" | "website";
  fixesIssues: string[];
  features: string[];
  isPopular?: boolean;
};

export const SERVICES: Service[] = [
  {
    id: "mapguard-setup",
    name: "MapGuard™ Setup",
    tagline: "One-time Google Business Profile optimisation sprint",
    description:
      "We audit and rebuild your Google Business Profile from scratch — fixing every gap that's hurting your local ranking and costing you calls.",
    price: 397,
    priceLabel: "$397 one-time",
    billingPeriod: "one-time",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "no-gbp-description",
      "low-search-ranking",
    ],
    features: [
      "Full profile audit & rebuild",
      "Category & service area optimisation",
      "Description & keyword tuning",
      "Photos & posts launch plan",
    ],
  },
  {
    id: "mapguard-ongoing",
    name: "MapGuard™ Ongoing",
    tagline: "Monthly Google Maps maintenance & growth",
    description:
      "Monthly profile updates, post scheduling, and review strategy to keep your Maps ranking climbing and your profile ahead of competitors.",
    price: 99,
    priceLabel: "From $99/mo",
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "low-search-ranking",
      "no-gbp-description",
    ],
    features: [
      "2 posts/month (Basic) or 4 posts/month (Pro)",
      "Profile monitoring",
      "Review responses & optimization (Pro)",
      "Ranking progress reports",
    ],
    isPopular: true,
  },
  {
    id: "reputationshield",
    name: "ReputationShield™",
    tagline: "Review generation & reputation automation",
    description:
      "Automated review request campaigns, response templates, and monitoring to build trust signals that convert browsers into callers.",
    price: 79,
    priceLabel: "From $79/mo",
    billingPeriod: "monthly",
    category: "reputation",
    fixesIssues: [
      "low-reviews",
      "bad-rating",
      "low-visibility",
    ],
    features: [
      "Automated review requests",
      "SMS & email follow-ups",
      "Response templates",
      "Reputation monitoring alerts",
    ],
  },
  {
    id: "tradeline",
    name: "TradeLine™",
    tagline: "AI answering, SMS replies & missed call auto-response",
    description:
      "Never miss a lead. TradeLine handles AI answering, SMS replies, missed call auto-response, and follow-ups — with included minutes on every plan.",
    price: 97,
    priceLabel: "From $97/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
      "no-quote-tool",
    ],
    features: [
      "AI answering",
      "SMS replies",
      "Missed call auto-response",
      "Follow-ups",
    ],
    isPopular: true,
  },
  {
    id: "webboost-setup",
    name: "WebBoost™ Setup",
    tagline: "One-time speed & SEO upgrade for your website",
    description:
      "We audit your site, fix the PageSpeed issues, and resolve Core Web Vitals problems in a single sprint — giving Google a reason to rank you higher.",
    price: 349,
    priceLabel: "$349 one-time",
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: [
      "Full PageSpeed audit",
      "Core Web Vitals fixes",
      "Image & asset optimisation",
      "Before/after speed report",
    ],
  },
  {
    id: "webboost-care",
    name: "WebBoost™ Care",
    tagline: "Ongoing website performance & SEO maintenance",
    description:
      "Monthly checks to keep your site fast, secure, and ranking. We catch regressions before Google does.",
    price: 79,
    priceLabel: "From $79/mo",
    billingPeriod: "monthly",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-search-ranking",
    ],
    features: [
      "Monitoring & updates (Basic)",
      "SEO fixes & optimization (Pro)",
      "Core Web Vitals monitoring",
      "Monthly performance reports",
    ],
  },
  {
    id: "sitelaunch",
    name: "SiteLaunch™",
    tagline: "High-converting website built for trades",
    description:
      "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. 5–7 pages with mobile optimization, speed optimization, basic SEO, contact forms, and QuoteQuick embed. Includes 14-day free trial of TradeLine Starter + QuoteQuick Pro.",
    price: 1197,
    priceLabel: "$1,197 one-time",
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "no-website",
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: [
      "5–7 page trades website",
      "Mobile & speed optimization",
      "Basic SEO & contact forms",
      "QuoteQuick embed included",
      "BONUS: 14-day trial of TradeLine Starter + QuoteQuick Pro",
    ],
  },
  {
    id: "quotequick",
    name: "QuoteQuick™",
    tagline: "Instant quote calculator for your website",
    description:
      "An embeddable quote calculator that gives visitors instant estimates — turning browsers into warm leads before they pick up the phone.",
    price: 49,
    priceLabel: "From $49/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-quote-tool",
      "low-demand-coverage",
    ],
    features: [
      "Basic calculator & lead capture (Starter)",
      "Advanced logic, styling & booking integration (Pro)",
      "Trade-specific templates",
      "Embed on any site",
    ],
  },
  {
    id: "socialsync",
    name: "SocialSync™",
    tagline: "Social media content & posting for trades",
    description:
      "Consistent social media presence with trade-specific content, scheduling, and engagement tracking.",
    price: 99,
    priceLabel: "From $99/mo",
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-visibility",
      "low-search-ranking",
    ],
    features: [
      "Content creation & scheduling",
      "Facebook & Instagram management",
      "Lead-gen campaigns (Growth+)",
      "Monthly analytics reports",
    ],
  },
];

export function getServicesForIssues(issues: string[]): Service[] {
  if (!issues.length) return [];
  // Score each service by how many detected issues it fixes
  const scored = SERVICES.map(service => ({
    service,
    matchCount: service.fixesIssues.filter(i => issues.includes(i)).length
  }))
  .filter(s => s.matchCount > 0)
  .sort((a, b) => b.matchCount - a.matchCount);
  // Deduplicate by category — only keep the highest-scoring service per category
  const seenCategories = new Set<string>();
  const deduplicated = scored.filter(({ service }) => {
    if (seenCategories.has(service.category)) return false;
    seenCategories.add(service.category);
    return true;
  });
  // Return max 3 services
  return deduplicated.slice(0, 3).map(s => s.service);
}
