/**
 * Service catalog used by audit recommendations and service matching.
 * Prices and features derived from shared/pricing.ts (single source of truth).
 */
import {
  SITELAUNCH, TRADELINE, QUOTEQUICK, MAPGUARD,
  REPUTATIONSHIELD, SOCIALSYNC, WEBFIX, RANKFLOW, WEBCARE, ADFLOW, CONTENTFLOW,
  lowestMonthly, formatPrice,
  type ProductDef,
} from "./pricing";

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
    name: "MapSetup\u2122",
    tagline: "One-time Google Business Profile optimisation sprint",
    description:
      "We audit and rebuild your Google Business Profile from scratch — fixing every gap that's hurting your local ranking and costing you calls.",
    price: MAPGUARD.setup!,
    priceLabel: `${formatPrice(MAPGUARD.setup!)} one-time`,
    billingPeriod: "one-time",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "no-gbp-description",
      "low-search-ranking",
    ],
    features: MAPGUARD.tiers[0].features,
  },
  {
    id: "mapguard-ongoing",
    name: MAPGUARD.name + " Ongoing",
    tagline: "Fully managed Google Maps visibility — monitoring, fixing, improving",
    description:
      "We monitor your rankings weekly, fix issues as they arise, and execute optimization work every month. You receive clear reports showing your progress.",
    price: lowestMonthly(MAPGUARD)!,
    priceLabel: `From ${formatPrice(lowestMonthly(MAPGUARD)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "not-in-maps-pack",
      "low-visibility",
      "low-search-ranking",
      "no-gbp-description",
    ],
    features: [
      ...MAPGUARD.tiers[1].features,
      ...MAPGUARD.tiers[2].features.filter(f => !MAPGUARD.tiers[1].features.includes(f)).map(f => `${f} (Pro)`),
    ],
    isPopular: true,
  },
  {
    id: "reputationshield",
    name: REPUTATIONSHIELD.name,
    tagline: REPUTATIONSHIELD.tagline,
    description:
      "Automated review requests after completed jobs, AI-powered review responses, negative review alerts, and a client-facing reputation dashboard.",
    price: lowestMonthly(REPUTATIONSHIELD)!,
    priceLabel: `From ${formatPrice(lowestMonthly(REPUTATIONSHIELD)!)}/mo`,
    billingPeriod: "monthly",
    category: "reputation",
    fixesIssues: [
      "low-reviews",
      "bad-rating",
      "low-visibility",
    ],
    features: [
      ...REPUTATIONSHIELD.tiers[0].features,
      ...REPUTATIONSHIELD.tiers[1].features.filter(f => !REPUTATIONSHIELD.tiers[0].features.includes(f)).map(f => `${f} (Pro)`),
    ],
  },
  {
    id: "tradeline",
    name: TRADELINE.name,
    tagline: TRADELINE.tagline,
    description:
      "Never miss a lead. TradeLine handles AI call answering, SMS replies, missed call auto-response, and follow-ups — with included minutes on every plan.",
    price: lowestMonthly(TRADELINE)!,
    priceLabel: `From ${formatPrice(lowestMonthly(TRADELINE)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
      "no-quote-tool",
    ],
    features: TRADELINE.tiers[0].features.filter(f => !f.includes("minutes")),
    isPopular: true,
  },
  {
    id: "webfix",
    name: WEBFIX.name,
    tagline: WEBFIX.tagline,
    description:
      "One-time website fixes covering speed, SEO structure, and Google Maps profile cleanup.",
    price: WEBFIX.tiers[0].price,
    priceLabel: `${formatPrice(WEBFIX.tiers[0].price)} one-time`,
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: WEBFIX.tiers[0].features,
  },
  {
    id: "rankflow",
    name: RANKFLOW.name,
    tagline: RANKFLOW.tagline,
    description:
      "Done-for-you local SEO that improves your search visibility every month.",
    price: lowestMonthly(RANKFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(RANKFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-search-ranking",
      "low-visibility",
    ],
    features: RANKFLOW.tiers[0].features,
  },
  {
    id: "webcare",
    name: WEBCARE.name,
    tagline: WEBCARE.tagline,
    description:
      "Automated website health monitoring, uptime checks, security scanning, and CMS patch management.",
    price: lowestMonthly(WEBCARE)!,
    priceLabel: `From ${formatPrice(lowestMonthly(WEBCARE)!)}/mo`,
    billingPeriod: "monthly",
    category: "website",
    fixesIssues: [
      "slow-website",
      "low-visibility",
    ],
    features: WEBCARE.tiers[0].features,
  },
  {
    id: "sitelaunch",
    name: SITELAUNCH.name,
    tagline: SITELAUNCH.tagline,
    description:
      "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. 5–7 pages with mobile optimization, speed optimization, basic SEO, contact forms, and QuoteQuick embed. Includes 14-day free trial of TradeLine Starter + QuoteQuick.",
    price: SITELAUNCH.tiers[0].price,
    priceLabel: `${formatPrice(SITELAUNCH.tiers[0].price)} one-time`,
    billingPeriod: "one-time",
    category: "website",
    fixesIssues: [
      "no-website",
      "slow-website",
      "low-search-ranking",
      "low-visibility",
    ],
    features: SITELAUNCH.tiers[0].features,
  },
  {
    id: "quotequick",
    name: QUOTEQUICK.name,
    tagline: QUOTEQUICK.tagline,
    description:
      "An embeddable quote calculator that gives visitors instant estimates — turning browsers into warm leads before they pick up the phone.",
    price: lowestMonthly(QUOTEQUICK)!,
    priceLabel: `From ${formatPrice(lowestMonthly(QUOTEQUICK)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-quote-tool",
      "low-demand-coverage",
    ],
    features: [
      ...QUOTEQUICK.tiers[0].features,
      ...QUOTEQUICK.tiers[1].features.filter(f => !QUOTEQUICK.tiers[0].features.includes(f)).map(f => `${f} (Pro)`),
    ],
  },
  {
    id: "socialsync",
    name: SOCIALSYNC.name,
    tagline: SOCIALSYNC.tagline,
    description:
      "AI-generated social media content published automatically to Facebook, Instagram, and Google Business Profile. Full autopilot posting.",
    price: lowestMonthly(SOCIALSYNC)!,
    priceLabel: `From ${formatPrice(lowestMonthly(SOCIALSYNC)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-visibility",
      "low-search-ranking",
    ],
    features: [
      ...SOCIALSYNC.tiers[0].features,
      ...SOCIALSYNC.tiers[1].features.filter(f => !SOCIALSYNC.tiers[0].features.includes(f)).map(f => `${f} (Growth)`),
    ],
  },
  {
    id: "contentflow",
    name: CONTENTFLOW.name,
    tagline: CONTENTFLOW.tagline,
    description:
      "Standalone AI content engine — articles, social posts, and Google Business Profile updates generated in your brand voice and auto-published across every channel. Sold on its own; no SocialSync or RankFlow subscription required.",
    price: lowestMonthly(CONTENTFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(CONTENTFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "visibility",
    fixesIssues: [
      "low-visibility",
      "low-search-ranking",
    ],
    features: [
      ...CONTENTFLOW.tiers[0].features,
      ...CONTENTFLOW.tiers[1].features.filter(f => !CONTENTFLOW.tiers[0].features.includes(f)).map(f => `${f} (Studio)`),
    ],
  },
  {
    id: "adflow",
    name: ADFLOW.name,
    tagline: ADFLOW.tagline,
    description:
      "Managed ad campaigns, delivered by our agency partners. WeFixTrades manages the relationship — your agency handles campaign setup, optimization, and reporting. Monthly performance reports delivered to your inbox.",
    price: lowestMonthly(ADFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(ADFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "low-visibility",
      "low-demand-coverage",
    ],
    features: [
      ...ADFLOW.tiers[0].features,
      ...ADFLOW.tiers[1].features.filter(f => !ADFLOW.tiers[0].features.includes(f)).map(f => `${f} (Growth)`),
    ],
  },
  {
    id: "bookflow",
    name: "BookFlow",
    tagline: "Simple online booking for trades businesses",
    description:
      "Simple online booking for your trades business. Customers book directly from your website, quote widget, or AI assistant.",
    price: 589,
    priceLabel: "$5.89/mo",
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "no-after-hours",
      "low-demand-coverage",
    ],
    features: [
      "Public booking page with your brand",
      "Working hours and service configuration",
      "Automatic confirmation emails",
      "SMS notifications for new bookings",
      "Integrates with QuoteQuick and TradeLine",
      "Customer self-service cancellation",
    ],
  },
];

// Services that should not appear in audit-tool recommendations even
// though they exist in the catalog. BookFlow has no standalone tier
// SKU in the checkout catalog (see AUDIT_SERVICE_TO_CATALOG_SKU in
// client/src/pages/marketing/ReportView.tsx), so recommending it gives
// the visitor a "Buy services" CTA that 400s on Unknown service.
// Today BookFlow is only sold bundled into adjacent products, so we
// hide it from audit recs rather than ship a broken purchase path.
const AUDIT_EXCLUDED_SERVICE_IDS = new Set<string>(["bookflow"]);

export function getServicesForIssues(issues: string[]): Service[] {
  if (!issues.length) return [];
  const scored = SERVICES
    .filter(service => !AUDIT_EXCLUDED_SERVICE_IDS.has(service.id))
    .map(service => ({
      service,
      matchCount: service.fixesIssues.filter(i => issues.includes(i)).length
    }))
    .filter(s => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);
  const seenCategories = new Set<string>();
  const deduplicated = scored.filter(({ service }) => {
    if (seenCategories.has(service.category)) return false;
    seenCategories.add(service.category);
    return true;
  });
  return deduplicated.slice(0, 3).map(s => s.service);
}
