/**
 * SaaS platform product catalog (what WE charge customers for the platform).
 * NOT related to shared/pricingConfig.ts which defines trade-work pricing types.
 */
export const BASE_CURRENCY = "CAD" as const;
export const YEARLY_DISCOUNT_PCT = 0.15;

export type BillingType = "subscription" | "one_time";
export type ProductCategory = "core" | "ai" | "growth";

export interface Product {
  id: string;
  name: string;
  tagline: string;
  billingType: BillingType;
  monthly: number | null;
  setup: number | null;
  oneTime: number | null;
  badge?: string;
  features: string[];
  category: ProductCategory;
}

export const PRODUCTS: Product[] = [
  {
    id: "quotequick-starter",
    name: "QuoteQuick Starter",
    tagline: "Basic calculator & lead capture",
    billingType: "subscription",
    monthly: 49,
    setup: null,
    oneTime: null,
    features: [
      "Basic calculator",
      "Lead capture",
      "Hosted quote page",
      "Embed on your site",
    ],
    category: "core",
  },
  {
    id: "quotequick-pro",
    name: "QuoteQuick Pro",
    tagline: "Advanced quote calculator with booking integration",
    billingType: "subscription",
    monthly: 79,
    setup: null,
    oneTime: null,
    badge: "Most Popular",
    features: [
      "Advanced logic & styling",
      "Booking integration",
      "Lead capture + storage",
      "Custom branding",
      "Email follow-up sequences",
      "Analytics dashboard",
    ],
    category: "core",
  },
  {
    id: "tradeline-starter",
    name: "TradeLine Starter",
    tagline: "AI answering with 200 included minutes",
    billingType: "subscription",
    monthly: 97,
    setup: null,
    oneTime: null,
    features: [
      "200 minutes included",
      "AI answering",
      "SMS replies",
      "Missed call auto-response",
      "Follow-ups",
      "$0.15/min overage",
    ],
    category: "ai",
  },
  {
    id: "tradeline-pro",
    name: "TradeLine Pro",
    tagline: "AI answering with 600 included minutes",
    billingType: "subscription",
    monthly: 197,
    setup: null,
    oneTime: null,
    badge: "Most Popular",
    features: [
      "600 minutes included",
      "AI answering",
      "SMS replies",
      "Missed call auto-response",
      "Follow-ups",
      "$0.15/min overage",
    ],
    category: "ai",
  },
  {
    id: "tradeline-premium",
    name: "TradeLine Premium",
    tagline: "AI answering with 1500 included minutes",
    billingType: "subscription",
    monthly: 347,
    setup: null,
    oneTime: null,
    badge: "Premium",
    features: [
      "1500 minutes included",
      "AI answering",
      "SMS replies",
      "Missed call auto-response",
      "Follow-ups",
      "$0.15/min overage",
    ],
    category: "ai",
  },
  {
    id: "webboost",
    name: "WebBoost",
    tagline: "Website SEO and speed optimization",
    billingType: "subscription",
    monthly: 79,
    setup: 349,
    oneTime: null,
    features: [
      "Monitoring & updates (Basic)",
      "SEO fixes & optimization (Pro $129/mo)",
      "Page speed optimization",
      "Monthly performance reports",
      "Core Web Vitals improvements",
    ],
    category: "growth",
  },
  {
    id: "mapguard",
    name: "MapGuard",
    tagline: "Google Maps GBP optimization",
    billingType: "subscription",
    monthly: 99,
    setup: 397,
    oneTime: null,
    features: [
      "2 posts/month (Basic) or 4 posts/month (Pro $149/mo)",
      "Profile monitoring",
      "Review responses & optimization (Pro)",
      "Local ranking monitoring",
      "Competitor analysis",
    ],
    category: "growth",
  },
  {
    id: "socialsync",
    name: "SocialSync",
    tagline: "Social media management and automation",
    billingType: "subscription",
    monthly: 99,
    setup: null,
    oneTime: null,
    features: [
      "Content creation & scheduling",
      "Facebook & Instagram management",
      "Lead-gen campaigns (Growth $149/mo)",
      "Branded templates",
      "Monthly analytics reports",
    ],
    category: "growth",
  },
  {
    id: "reputationshield",
    name: "ReputationShield",
    tagline: "Review and reputation management",
    billingType: "subscription",
    monthly: 79,
    setup: null,
    oneTime: null,
    features: [
      "Automated review requests",
      "Review response templates",
      "Reputation monitoring",
      "Negative review alerts",
      "Review widget for website",
    ],
    category: "growth",
  },
  {
    id: "sitelaunch",
    name: "SiteLaunch",
    tagline: "Professional trade website built from scratch",
    billingType: "one_time",
    monthly: null,
    setup: null,
    oneTime: 1197,
    features: [
      "5–7 page custom website",
      "Mobile optimization",
      "Speed optimization",
      "Basic SEO & contact forms",
      "QuoteQuick embed",
      "BONUS: 14-day trial of TradeLine Starter + QuoteQuick Pro",
    ],
    category: "core",
  },
];

export function getYearlyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - YEARLY_DISCOUNT_PCT));
}

export function getYearlyMonthlyEquivalent(monthlyPrice: number): number {
  return Math.round((monthlyPrice * 12 * (1 - YEARLY_DISCOUNT_PCT)) / 12);
}
