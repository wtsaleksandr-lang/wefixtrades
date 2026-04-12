/**
 * Service catalog used by audit recommendations and service matching.
 * Prices and features derived from shared/pricing.ts (single source of truth).
 */
import {
  SITELAUNCH, TRADELINE, QUOTEQUICK, MAPGUARD,
  REPUTATIONSHIELD, SOCIALSYNC, WEBFIX, RANKFLOW, ADFLOW,
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
    tagline: "Monthly Google Maps maintenance & growth",
    description:
      "Monthly profile updates, post scheduling, and review strategy to keep your Maps ranking climbing and your profile ahead of competitors.",
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
      "Ongoing SEO that brings consistent organic traffic and leads to your trades business.",
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
    id: "adflow",
    name: ADFLOW.name,
    tagline: ADFLOW.tagline,
    description:
      "Done-for-you Google and Facebook ads that bring qualified leads fast.",
    price: lowestMonthly(ADFLOW)!,
    priceLabel: `From ${formatPrice(lowestMonthly(ADFLOW)!)}/mo`,
    billingPeriod: "monthly",
    category: "leads",
    fixesIssues: [
      "low-visibility",
      "few-leads",
    ],
    features: ADFLOW.tiers[0].features,
  },
  {
    id: "sitelaunch",
    name: SITELAUNCH.name,
    tagline: SITELAUNCH.tagline,
    description:
      "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. 5–7 pages with mobile optimization, speed optimization, basic SEO, contact forms, and QuoteQuick embed. Includes 14-day free trial of TradeLine Starter + QuoteQuick Pro.",
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
];

export function getServicesForIssues(issues: string[]): Service[] {
  if (!issues.length) return [];
  const scored = SERVICES.map(service => ({
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
