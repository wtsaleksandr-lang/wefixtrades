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
    price: 299,
    priceLabel: "$299 one-time",
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
    price: 149,
    priceLabel: "From $149/mo",
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "low-search-ranking",
      "no-gbp-description",
    ],
    features: [
      "Monthly profile updates",
      "Post scheduling (4/mo)",
      "Competitor monitoring",
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
    price: 99,
    priceLabel: "From $99/mo",
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
    id: "ai-chatline",
    name: "AI ChatLine™",
    tagline: "24/7 website + SMS chat that captures leads while you sleep",
    description:
      "An AI assistant on your website and SMS line that qualifies leads, captures contact info, and sends you instant summaries — so no lead falls through the cracks.",
    price: 149,
    priceLabel: "From $149/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
      "no-quote-tool",
    ],
    features: [
      "24/7 website chat widget",
      "SMS lead capture",
      "Lead qualification flow",
      "Instant job summaries by email",
    ],
    isPopular: true,
  },
  {
    id: "ai-callline",
    name: "AI CallLine™",
    tagline: "Never miss a call — AI answers every call, 24/7",
    description:
      "A friendly AI voice agent answers every missed or after-hours call, captures the caller's name, job details, and address, then sends you a summary instantly.",
    price: 199,
    priceLabel: "From $199/mo",
    billingPeriod: "monthly",
    category: "automation",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
    ],
    features: [
      "24/7 AI voice answering",
      "Name, need & address capture",
      "Instant call summary by SMS",
      "Email + push notifications",
    ],
  },
  {
    id: "tradeline-complete",
    name: "TradeLine™ Complete",
    tagline: "Chat + Voice + DMs — the full lead engine",
    description:
      "Every inbound channel covered: website chat, phone calls, and Facebook/Instagram DMs. One unified dashboard. Zero missed leads.",
    price: 299,
    priceLabel: "From $299/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
      "no-quote-tool",
    ],
    features: [
      "AI ChatLine included",
      "AI CallLine included",
      "Facebook & Instagram DMs",
      "Unified lead dashboard",
    ],
    isPopular: true,
  },
  {
    id: "webboost-setup",
    name: "WebBoost™ Setup",
    tagline: "One-time speed & SEO upgrade for your website",
    description:
      "We audit your site, fix the PageSpeed issues, and resolve Core Web Vitals problems in a single sprint — giving Google a reason to rank you higher.",
    price: 449,
    priceLabel: "$449 one-time",
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
    price: 129,
    priceLabel: "From $129/mo",
    billingPeriod: "monthly",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-search-ranking",
    ],
    features: [
      "Monthly performance checks",
      "Regression fixes",
      "Core Web Vitals monitoring",
      "Light SEO upkeep",
    ],
  },
  {
    id: "sitelaunch",
    name: "SiteLaunch™",
    tagline: "High-converting website built for trades",
    description:
      "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. Built and launched within two weeks.",
    price: 997,
    priceLabel: "$997 one-time",
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "no-website",
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: [
      "5-page trades website",
      "Mobile-first design",
      "On-page SEO built in",
      "Quote form + call-to-actions",
    ],
  },
  {
    id: "quotequick",
    name: "QuoteQuick Pro™",
    tagline: "Instant quote calculator for your website",
    description:
      "An embeddable quote calculator that gives visitors instant estimates — turning browsers into warm leads before they pick up the phone.",
    price: 79,
    priceLabel: "From $79/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-quote-tool",
      "low-demand-coverage",
    ],
    features: [
      "Instant estimate calculator",
      "Lead capture on submit",
      "Trade-specific templates",
      "Embed on any site",
    ],
  },
];

export function getServicesForIssues(issues: string[]): Service[] {
  return SERVICES.filter((s) =>
    s.fixesIssues.some((i) => issues.includes(i))
  );
}
