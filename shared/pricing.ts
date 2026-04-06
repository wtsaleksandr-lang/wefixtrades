/**
 * SINGLE SOURCE OF TRUTH for all WeFixTrades pricing.
 *
 * Every UI page, seed script, and billing flow MUST import from here.
 * DO NOT hardcode prices anywhere else.
 */

/* ─── Billing ─── */
export const YEARLY_DISCOUNT_PCT = 0.10; // 10% discount for yearly billing

export function yearlyTotal(monthly: number): number {
  return Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT_PCT));
}

export function yearlyMonthlyEquiv(monthly: number): number {
  return Math.round((monthly * 12 * (1 - YEARLY_DISCOUNT_PCT)) / 12);
}

/* ─── Tier Definition ─── */
export interface Tier {
  id: string;            // DB row id, e.g. "tradeline-starter"
  name: string;          // Display name, e.g. "Starter"
  price: number;         // Dollar amount (monthly or one-time)
  billingPeriod: "monthly" | "one-time";
  badge?: string;
  highlighted?: boolean;
  features: string[];
  includedMins?: number; // TradeLine only
}

/* ─── Product Definition ─── */
export interface ProductDef {
  id: string;
  name: string;
  tagline: string;
  category: "leads" | "visibility" | "reputation" | "website";
  setup?: number;        // one-time setup fee (dollars) if applicable
  overageRate?: number;  // per-minute overage (dollars) if applicable
  tiers: Tier[];
}

/* ─── Bundle Definition ─── */
export interface BundleDef {
  id: string;
  name: string;
  tagline: string;
  price: number;
  billingPeriod: "monthly" | "one-time";
  badge?: string;
  highlighted?: boolean;
  includes: { productId: string; tierId: string; label: string; value: number }[];
}

/* ═══════════════════════════════════════════
   A. SITELAUNCH
   ═══════════════════════════════════════════ */
export const SITELAUNCH: ProductDef = {
  id: "sitelaunch",
  name: "SiteLaunch™",
  tagline: "High-converting website built for trades",
  category: "website",
  tiers: [
    {
      id: "sitelaunch",
      name: "SiteLaunch",
      price: 1197,
      billingPeriod: "one-time",
      highlighted: true,
      badge: "All Inclusive",
      features: [
        "5–7 page website",
        "Mobile optimization",
        "Speed optimization",
        "Basic SEO",
        "Contact forms",
        "QuoteQuick embed",
        "BONUS: 14-day free trial of TradeLine Starter + QuoteQuick Pro",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   B. TRADELINE
   ═══════════════════════════════════════════ */
export const TRADELINE: ProductDef = {
  id: "tradeline",
  name: "TradeLine™",
  tagline: "AI call answering, SMS replies & missed call auto-response",
  category: "leads",
  overageRate: 0.15,
  tiers: [
    {
      id: "tradeline-starter",
      name: "Starter",
      price: 97,
      billingPeriod: "monthly",
      includedMins: 200,
      features: [
        "200 minutes included",
        "AI call answering",
        "SMS replies",
        "Missed call auto-response",
        "Lead capture",
        "Follow-ups",
      ],
    },
    {
      id: "tradeline-pro",
      name: "Pro",
      price: 197,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      includedMins: 600,
      features: [
        "600 minutes included",
        "AI call answering",
        "SMS replies",
        "Missed call auto-response",
        "Lead capture",
        "Follow-ups",
      ],
    },
    {
      id: "tradeline-premium",
      name: "Premium",
      price: 347,
      billingPeriod: "monthly",
      includedMins: 1500,
      features: [
        "1500 minutes included",
        "AI call answering",
        "SMS replies",
        "Missed call auto-response",
        "Lead capture",
        "Follow-ups",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   C. QUOTEQUICK
   ═══════════════════════════════════════════ */
export const QUOTEQUICK: ProductDef = {
  id: "quotequick",
  name: "QuoteQuick™",
  tagline: "Instant quote calculator for your website",
  category: "leads",
  tiers: [
    {
      id: "quotequick-starter",
      name: "Starter",
      price: 49,
      billingPeriod: "monthly",
      features: [
        "Embeddable quote tool",
        "Lead capture",
      ],
    },
    {
      id: "quotequick-pro",
      name: "Pro",
      price: 79,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "Advanced logic rules",
        "Custom styling",
        "Booking integration",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   D. WEBBOOST
   ═══════════════════════════════════════════ */
export const WEBBOOST: ProductDef = {
  id: "webboost",
  name: "WebBoost™",
  tagline: "Website SEO and speed optimization",
  category: "website",
  setup: 349,
  tiers: [
    {
      id: "webboost-setup",
      name: "Setup",
      price: 349,
      billingPeriod: "one-time",
      features: [
        "Full PageSpeed audit",
        "Core Web Vitals fixes",
        "Image & asset optimisation",
        "Before/after speed report",
      ],
    },
    {
      id: "webboost-basic",
      name: "Basic",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Monitoring",
        "Updates",
        "Backups",
      ],
    },
    {
      id: "webboost-pro",
      name: "Pro",
      price: 129,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "SEO fixes",
        "Performance optimization",
        "Priority updates",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   D2. WEBCARE
   ═══════════════════════════════════════════ */
export const WEBCARE: ProductDef = {
  id: "webcare",
  name: "WebCare™",
  tagline: "Ongoing website maintenance for trades businesses",
  category: "website",
  tiers: [
    {
      id: "webcare-basic",
      name: "Basic",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Monthly updates & security patches",
        "Uptime monitoring with alerts",
        "Daily backups",
        "1 content change per month",
        "Email support",
      ],
    },
    {
      id: "webcare-pro",
      name: "Pro",
      price: 129,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "Everything in Basic",
        "4 content changes per month",
        "Speed & performance checks",
        "Priority support (24 hr response)",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   E. MAPGUARD
   ═══════════════════════════════════════════ */
export const MAPGUARD: ProductDef = {
  id: "mapguard",
  name: "MapGuard™",
  tagline: "Google Maps GBP optimization",
  category: "visibility",
  setup: 397,
  tiers: [
    {
      id: "mapguard-setup",
      name: "Setup",
      price: 397,
      billingPeriod: "one-time",
      features: [
        "Full profile audit & rebuild",
        "Category & service area optimisation",
        "Description & keyword tuning",
        "Photos & posts launch plan",
      ],
    },
    {
      id: "mapguard-basic",
      name: "Basic",
      price: 99,
      billingPeriod: "monthly",
      features: [
        "2 GBP posts/month",
        "Listing monitoring",
      ],
    },
    {
      id: "mapguard-pro",
      name: "Pro",
      price: 149,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "4 GBP posts/month",
        "Review responses",
        "Keyword optimization",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   F. REPUTATIONSHIELD
   ═══════════════════════════════════════════ */
export const REPUTATIONSHIELD: ProductDef = {
  id: "reputationshield",
  name: "ReputationShield™",
  tagline: "Review and reputation management",
  category: "reputation",
  tiers: [
    {
      id: "reputationshield-basic",
      name: "Basic",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Review monitoring",
        "Alerts",
      ],
    },
    {
      id: "reputationshield-pro",
      name: "Pro",
      price: 129,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "AI + human-reviewed responses",
        "Negative review handling",
      ],
    },
    {
      id: "reputationshield-premium",
      name: "Premium",
      price: 179,
      billingPeriod: "monthly",
      features: [
        "Review growth strategy",
        "Priority handling",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   G. SOCIALSYNC
   ═══════════════════════════════════════════ */
export const SOCIALSYNC: ProductDef = {
  id: "socialsync",
  name: "SocialSync™",
  tagline: "Social media management and automation",
  category: "visibility",
  tiers: [
    {
      id: "socialsync-starter",
      name: "Starter",
      price: 99,
      billingPeriod: "monthly",
      features: [
        "8 posts/month",
        "1 platform",
      ],
    },
    {
      id: "socialsync-growth",
      name: "Growth",
      price: 149,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "12 posts/month",
        "2 platforms",
        "GBP posting included",
      ],
    },
    {
      id: "socialsync-pro",
      name: "Pro",
      price: 199,
      billingPeriod: "monthly",
      features: [
        "20 posts/month",
        "Multi-platform",
        "Priority content",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   FIX & OPTIMIZE (one-time)
   ═══════════════════════════════════════════ */
export const FIX_OPTIMIZE: ProductDef = {
  id: "fix-optimize",
  name: "Fix & Optimize™",
  tagline: "Website fixes, tweaks, and optimization",
  category: "website",
  tiers: [
    {
      id: "fix-optimize",
      name: "Fix & Optimize",
      price: 249,
      billingPeriod: "one-time",
      features: [
        "Speed optimization (Core Web Vitals)",
        "Technical SEO fixes (meta tags, structure)",
        "Google Maps / GBP audit + fixes",
        "Broken links & errors cleanup",
        "Mobile performance improvements",
        "Basic on-page SEO improvements",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   I. RANKFLOW (SEO)
   ═══════════════════════════════════════════ */
export const RANKFLOW: ProductDef = {
  id: "rankflow",
  name: "RankFlow™",
  tagline: "Ongoing SEO that brings consistent traffic and leads",
  category: "visibility",
  tiers: [
    {
      id: "rankflow-starter",
      name: "Starter",
      price: 349,
      billingPeriod: "monthly",
      features: [
        "Keyword research & targeting",
        "On-page SEO optimization",
        "Monthly content recommendations",
        "Google Search Console setup",
        "Monthly ranking reports",
      ],
    },
    {
      id: "rankflow-growth",
      name: "Growth",
      price: 599,
      billingPeriod: "monthly",
      badge: "Most Popular",
      highlighted: true,
      features: [
        "Everything in Starter",
        "Content creation (2 pages/mo)",
        "Link building outreach",
        "Competitor analysis",
        "Local SEO optimization",
        "Bi-weekly ranking reports",
      ],
    },
    {
      id: "rankflow-pro",
      name: "Pro",
      price: 899,
      billingPeriod: "monthly",
      features: [
        "Everything in Growth",
        "Content creation (4 pages/mo)",
        "Technical SEO audits",
        "Schema markup implementation",
        "Priority support",
        "Weekly ranking reports",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   J. ADFLOW (Ads)
   ═══════════════════════════════════════════ */
export const ADFLOW: ProductDef = {
  id: "adflow",
  name: "AdFlow™",
  tagline: "Done-for-you ads that bring leads fast",
  category: "leads",
  tiers: [
    {
      id: "adflow-starter",
      name: "Starter",
      price: 399,
      billingPeriod: "monthly",
      features: [
        "Google Ads campaign setup",
        "Ad copy & creative",
        "Keyword targeting",
        "Monthly performance reports",
        "Budget optimization",
      ],
    },
    {
      id: "adflow-growth",
      name: "Growth",
      price: 699,
      billingPeriod: "monthly",
      badge: "Most Popular",
      highlighted: true,
      features: [
        "Everything in Starter",
        "Google + Facebook Ads",
        "Landing page optimization",
        "A/B testing",
        "Bi-weekly performance calls",
        "Retargeting campaigns",
      ],
    },
    {
      id: "adflow-pro",
      name: "Pro",
      price: 999,
      billingPeriod: "monthly",
      features: [
        "Everything in Growth",
        "Google + Facebook + Instagram",
        "Video ad creation",
        "Advanced audience targeting",
        "Weekly optimization calls",
        "Dedicated account manager",
      ],
    },
  ],
};

/* ─── All Products (ordered) ─── */
export const ALL_PRODUCTS: ProductDef[] = [
  SITELAUNCH,
  TRADELINE,
  QUOTEQUICK,
  ADFLOW,
  WEBBOOST,
  WEBCARE,
  MAPGUARD,
  RANKFLOW,
  REPUTATIONSHIELD,
  SOCIALSYNC,
  FIX_OPTIMIZE,
];

/* ═══════════════════════════════════════════
   H. BUNDLES
   ═══════════════════════════════════════════ */
export const BUNDLE_STARTER: BundleDef = {
  id: "bundle-starter",
  name: "Starter System",
  tagline: "Best for getting started",
  price: 249,
  billingPeriod: "monthly",
  includes: [
    { productId: "quotequick", tierId: "quotequick-pro", label: "QuoteQuick Pro", value: 79 },
    { productId: "mapguard", tierId: "mapguard-basic", label: "MapGuard Basic", value: 99 },
    { productId: "reputationshield", tierId: "reputationshield-basic", label: "ReputationShield Basic", value: 79 },
  ],
};

export const BUNDLE_GROWTH: BundleDef = {
  id: "bundle-growth",
  name: "Growth System",
  tagline: "Most popular",
  price: 449,
  billingPeriod: "monthly",
  highlighted: true,
  badge: "Most Popular",
  includes: [
    { productId: "tradeline", tierId: "tradeline-starter", label: "TradeLine Starter", value: 97 },
    { productId: "quotequick", tierId: "quotequick-pro", label: "QuoteQuick Pro", value: 79 },
    { productId: "mapguard", tierId: "mapguard-pro", label: "MapGuard Pro", value: 149 },
    { productId: "reputationshield", tierId: "reputationshield-pro", label: "ReputationShield Pro", value: 129 },
  ],
};

export const BUNDLE_PRO: BundleDef = {
  id: "bundle-pro",
  name: "Pro System",
  tagline: "Full automation system",
  price: 799,
  billingPeriod: "monthly",
  includes: [
    { productId: "tradeline", tierId: "tradeline-pro", label: "TradeLine Pro", value: 197 },
    { productId: "socialsync", tierId: "socialsync-growth", label: "SocialSync Growth", value: 149 },
    { productId: "mapguard", tierId: "mapguard-pro", label: "MapGuard Pro", value: 149 },
    { productId: "reputationshield", tierId: "reputationshield-pro", label: "ReputationShield Pro", value: 129 },
    { productId: "webboost", tierId: "webboost-pro", label: "WebBoost Pro", value: 129 },
  ],
};

export const BUNDLE_FIX: BundleDef = {
  id: "bundle-fix",
  name: "Fix & Optimize™",
  tagline: "Quick website fixes and optimization",
  price: 249,
  billingPeriod: "one-time",
  includes: [
    { productId: "webboost", tierId: "webboost-setup", label: "WebBoost Setup (lite)", value: 349 },
    { productId: "mapguard", tierId: "mapguard-setup", label: "MapGuard audit + quick fixes", value: 397 },
  ],
};

export const ALL_BUNDLES: BundleDef[] = [
  BUNDLE_STARTER,
  BUNDLE_GROWTH,
  BUNDLE_PRO,
  BUNDLE_FIX,
];

/* ─── Helpers ─── */

/** Get a specific tier from a product */
export function getTier(product: ProductDef, tierName: string): Tier | undefined {
  return product.tiers.find(t => t.name === tierName || t.id === tierName);
}

/** Get the lowest monthly price for a product (for "from $X/mo" labels) */
export function lowestMonthly(product: ProductDef): number | null {
  const monthly = product.tiers.filter(t => t.billingPeriod === "monthly");
  if (!monthly.length) return null;
  return Math.min(...monthly.map(t => t.price));
}

/** Format a price for display */
export function formatPrice(amount: number): string {
  return amount >= 1000 ? `$${amount.toLocaleString("en-US")}` : `$${amount}`;
}

/** Compute bundle savings vs buying separately */
export function bundleSavings(bundle: BundleDef): number {
  const separate = bundle.includes.reduce((sum, item) => sum + item.value, 0);
  return separate - bundle.price;
}
