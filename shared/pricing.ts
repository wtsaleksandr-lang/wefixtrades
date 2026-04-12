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
  tagline: "Instant quotes on your website. Qualified leads in your inbox.",
  category: "leads",
  tiers: [
    {
      id: "quotequick-starter",
      name: "Starter",
      price: 49,
      billingPeriod: "monthly",
      features: [
        "Instant quote widget on your site",
        "Lead capture with every quote",
        "Email notifications",
        "Lead dashboard",
        "Embed on any website",
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
        "Everything in Starter, plus:",
        "Online booking integration",
        "Automated email + SMS follow-ups",
        "Custom branding + styling",
        "Coupon codes + promotions",
        "Webhook / CRM integration",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   D. (REMOVED — WebBoost replaced by WebFix one-time)
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   D2. WEBCARE
   ═══════════════════════════════════════════ */
export const WEBCARE: ProductDef = {
  id: "webcare",
  name: "WebCare™",
  tagline: "Your website stays updated, secure, and working",
  category: "website",
  tiers: [
    {
      id: "webcare-basic",
      name: "Basic",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Monthly software & security updates",
        "24/7 uptime monitoring",
        "Daily automated backups",
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
        "Monthly performance checks",
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
  name: "MapGuard\u2122",
  tagline: "Fully managed Google Maps visibility \u2014 we monitor, fix, and improve your ranking for you",
  category: "visibility",
  setup: 397,
  tiers: [
    {
      id: "mapguard-setup",
      name: "MapSetup\u2122",
      price: 397,
      billingPeriod: "one-time",
      features: [
        "Full GBP audit & profile rebuild",
        "Category, services & area optimization",
        "Business description & keyword tuning",
        "Photo uploads & initial posts",
        "Before/after visibility report",
      ],
    },
    {
      id: "mapguard-basic",
      name: "Basic",
      price: 99,
      billingPeriod: "monthly",
      features: [
        "Weekly visibility monitoring & alerts",
        "2 Google Business posts/month",
        "Profile accuracy checks & fixes",
        "Monthly performance report",
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
        "Weekly visibility monitoring & alerts",
        "4 Google Business posts/month",
        "Review response management",
        "Ongoing keyword & category optimization",
        "Competitor tracking & response",
        "Monthly performance report with recommendations",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   F. REPUTATIONSHIELD
   ═══════════════════════════════════════════ */
export const REPUTATIONSHIELD: ProductDef = {
  id: "reputationshield",
  name: "ReputationShield\u2122",
  tagline: "Turn completed jobs into 5-star Google reviews — automatically",
  category: "reputation",
  tiers: [
    {
      id: "reputationshield-basic",
      name: "Grow",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Automated review requests via SMS + email after every job",
        "Smart follow-up reminders if customers forget",
        "Private feedback shield — catches complaints before they go public",
        "Google + Facebook review monitoring with instant alerts",
        "QR code for field collection (business cards, invoices, vans)",
        "Review badge widget for your website",
        "Monthly reputation report delivered to your inbox",
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
        "Everything in Grow",
        "AI-drafted review responses — edit and post in seconds",
        "Full review carousel widget with rotating testimonials",
        "Google + Facebook review destination choice for customers",
        "Bi-weekly reputation report",
        "Portal manual review requests + source tracking",
      ],
    },
    {
      id: "reputationshield-premium",
      name: "Scale",
      price: 179,
      billingPeriod: "monthly",
      features: [
        "Everything in Pro",
        "Post AI responses directly to Google (no copy-paste)",
        "Competitor review tracking + benchmarking",
        "Weekly detailed reputation report",
        "Priority response handling",
        "Review growth strategy & coaching",
        "Dedicated account support",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   G. SOCIALSYNC
   ═══════════════════════════════════════════ */
export const SOCIALSYNC: ProductDef = {
  id: "socialsync",
  name: "SocialSync\u2122",
  tagline: "We post on social media so you don\u2019t have to",
  category: "visibility",
  tiers: [
    {
      id: "socialsync-starter",
      name: "Starter",
      price: 99,
      billingPeriod: "monthly",
      features: [
        "8 AI-generated posts/month",
        "1 platform (Facebook or Instagram)",
        "Automated content calendar",
        "Quality-checked before publishing",
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
        "12 AI-generated posts/month",
        "Facebook + Instagram + Google Business",
        "AI-generated images for Instagram",
        "Autopilot scheduling & publishing",
        "Monthly content report",
      ],
    },
    {
      id: "socialsync-pro",
      name: "Pro",
      price: 199,
      billingPeriod: "monthly",
      features: [
        "20 AI-generated posts/month",
        "All platforms (FB, IG, Google Business)",
        "Priority content creation",
        "Custom tone & service focus",
        "Weekly reporting",
      ],
    },
  ],
};

/* (FIX_OPTIMIZE moved → WEBFIX above) */

/* ═══════════════════════════════════════════
   H2. WEBFIX (formerly Fix & Optimize)
   ═══════════════════════════════════════════ */
export const WEBFIX: ProductDef = {
  id: "webfix",
  name: "WebFix\u2122",
  tagline: "One-time fixes to make your website faster and work properly",
  category: "website",
  tiers: [
    {
      id: "webfix",
      name: "WebFix",
      price: 249,
      billingPeriod: "one-time",
      features: [
        "Page speed optimization (Core Web Vitals)",
        "Broken links, errors & 404 cleanup",
        "Mobile responsiveness fixes",
        "Contact form & CTA troubleshooting",
        "Image compression & performance tuning",
      ],
    },
  ],
};

/** @deprecated Use WEBFIX instead */
export const FIX_OPTIMIZE = WEBFIX;

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
  WEBCARE,
  MAPGUARD,
  RANKFLOW,
  REPUTATIONSHIELD,
  SOCIALSYNC,
  WEBFIX,
];

/* ═══════════════════════════════════════════
   H. BUNDLES
   ═══════════════════════════════════════════ */
export const BUNDLE_STARTER: BundleDef = {
  id: "bundle-starter",
  name: "Visibility Starter",
  tagline: "Get visible and start building trust",
  price: 249,
  billingPeriod: "monthly",
  includes: [
    { productId: "mapguard", tierId: "mapguard-basic", label: "MapGuard Basic \u2014 Google Maps visibility", value: 99 },
    { productId: "reputationshield", tierId: "reputationshield-basic", label: "ReputationShield Basic \u2014 Review management", value: 79 },
    { productId: "quotequick", tierId: "quotequick-pro", label: "QuoteQuick Pro \u2014 Instant quotes", value: 79 },
  ],
};

export const BUNDLE_GROWTH: BundleDef = {
  id: "bundle-growth",
  name: "Growth System",
  tagline: "Most popular — visibility + reputation",
  price: 449,
  billingPeriod: "monthly",
  highlighted: true,
  badge: "Most Popular",
  includes: [
    { productId: "tradeline", tierId: "tradeline-starter", label: "TradeLine Starter", value: 97 },
    { productId: "socialsync", tierId: "socialsync-starter", label: "SocialSync Starter", value: 99 },
    { productId: "mapguard", tierId: "mapguard-pro", label: "MapGuard Pro", value: 149 },
    { productId: "reputationshield", tierId: "reputationshield-pro", label: "ReputationShield Pro", value: 129 },
  ],
};

export const BUNDLE_PRO: BundleDef = {
  id: "bundle-pro",
  name: "Pro System",
  tagline: "Full automation — posting + reputation + leads",
  price: 799,
  billingPeriod: "monthly",
  includes: [
    { productId: "mapguard", tierId: "mapguard-pro", label: "MapGuard Pro \u2014 Managed visibility", value: 149 },
    { productId: "reputationshield", tierId: "reputationshield-pro", label: "ReputationShield Pro \u2014 Review growth", value: 129 },
    { productId: "socialsync", tierId: "socialsync-growth", label: "SocialSync Growth \u2014 Social presence", value: 149 },
    { productId: "tradeline", tierId: "tradeline-pro", label: "TradeLine Pro \u2014 AI call answering", value: 197 },
  ],
};

export const BUNDLE_FIX: BundleDef = {
  id: "bundle-fix",
  name: "WebFix\u2122",
  tagline: "One-time website fixes to make your site faster and work properly",
  price: 249,
  billingPeriod: "one-time",
  includes: [
    { productId: "webfix", tierId: "webfix", label: "Website speed & SEO fixes", value: 249 },
    { productId: "mapguard", tierId: "mapguard-setup", label: "MapSetup\u2122 \u2014 GBP audit + fixes", value: 397 },
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
