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
    id: "quickquotepro",
    name: "QuickQuotePro",
    tagline: "Instant quote calculator for your website",
    billingType: "subscription",
    monthly: 129,
    setup: 399,
    oneTime: null,
    badge: "Core Product",
    features: [
      "Unlimited calculators",
      "Hosted quote page + embed",
      "Lead capture + storage",
      "Custom branding",
      "Email follow-up sequences",
      "Analytics dashboard",
    ],
    category: "core",
  },
  {
    id: "booking",
    name: "Booking & Calendar",
    tagline: "Let customers book directly from your calculator",
    billingType: "subscription",
    monthly: 59,
    setup: null,
    oneTime: null,
    badge: "Add-on",
    features: [
      "Online booking calendar",
      "Stripe deposit collection",
      "Automated confirmations",
      "Availability management",
      "Double-booking prevention",
    ],
    category: "core",
  },
  {
    id: "ai-chat",
    name: "AI Employee Chat 24/7",
    tagline: "AI chat assistant that qualifies leads around the clock",
    billingType: "subscription",
    monthly: 179,
    setup: null,
    oneTime: null,
    features: [
      "24/7 website chat widget",
      "Lead qualification & capture",
      "Instant estimate generation",
      "Booking integration",
      "Multi-language support",
    ],
    category: "ai",
  },
  {
    id: "ai-voice",
    name: "AI Employee Voice 24/7",
    tagline: "AI voice assistant that answers calls and books jobs",
    billingType: "subscription",
    monthly: 349,
    setup: null,
    oneTime: null,
    badge: "Premium",
    features: [
      "24/7 inbound call handling",
      "Natural voice conversations",
      "Lead qualification & routing",
      "Appointment scheduling",
      "Call recording & transcripts",
    ],
    category: "ai",
  },
  {
    id: "webboost",
    name: "WebBoost",
    tagline: "Website SEO and speed optimization",
    billingType: "subscription",
    monthly: 199,
    setup: null,
    oneTime: null,
    features: [
      "Technical SEO audit & fixes",
      "Page speed optimization",
      "Keyword research & targeting",
      "Monthly performance reports",
      "Core Web Vitals improvements",
    ],
    category: "growth",
  },
  {
    id: "webcare",
    name: "WebCare",
    tagline: "Website and Google Maps account maintenance",
    billingType: "subscription",
    monthly: 149,
    setup: null,
    oneTime: null,
    features: [
      "Monthly website updates",
      "Security monitoring",
      "Google Maps profile management",
      "Content updates (2/mo)",
      "Uptime monitoring",
    ],
    category: "growth",
  },
  {
    id: "mapguard",
    name: "MapGuard",
    tagline: "Google Maps GBP optimization",
    billingType: "subscription",
    monthly: 299,
    setup: null,
    oneTime: null,
    features: [
      "GBP profile optimization",
      "Citation building & cleanup",
      "Review generation strategy",
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
    monthly: 349,
    setup: null,
    oneTime: null,
    features: [
      "Content creation & scheduling",
      "Facebook & Instagram management",
      "Lead-gen campaigns",
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
    monthly: 229,
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
    oneTime: 2999,
    features: [
      "Custom design & development",
      "Mobile-responsive layout",
      "QuickQuote calculator built in",
      "SEO-ready structure",
      "Delivered in 5 business days",
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
