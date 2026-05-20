/**
 * SINGLE SOURCE OF TRUTH for all WeFixTrades pricing.
 *
 * Every UI page, seed script, and billing flow MUST import from here.
 * DO NOT hardcode prices anywhere else.
 */

/* ─── Billing ─── */
export const YEARLY_DISCOUNT_PCT = 0.10; // Default — 10% discount for yearly billing across most products.
// Wave Q — QuoteQuick uses a deeper 17% annual discount ("two months free")
// matching the modal industry pattern (ConvertCalculator, Jotform mid-range).
// Used by the QuoteQuick marketing page + checkout flow only.
export const QUOTEQUICK_YEARLY_DISCOUNT_PCT = 0.17;
export function qqYearlyTotal(monthly: number): number {
  return Math.round(monthly * 12 * (1 - QUOTEQUICK_YEARLY_DISCOUNT_PCT));
}
export function qqYearlyMonthlyEquiv(monthly: number): number {
  return Math.round((monthly * 12 * (1 - QUOTEQUICK_YEARLY_DISCOUNT_PCT)) / 12);
}

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
        "AI call answering (inbound + outbound)",
        "AI SMS (two-way)",
        "Missed-call auto-response",
        "Lead capture + follow-ups",
        "Number porting — free, all tiers",
        "Basic AI training (FAQs from your website)",
        "Email follow-ups from em.wefixtrades.com",
        "Website chat widget snippet (install service $79 add-on)",
        "Basic after-hours rules",
        "WeFixTrades Concierge (free AI assistant in your dashboard)",
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
        "Everything in Starter, plus:",
        "Advanced AI training (custom pricing, service area, flow logic)",
        "Email follow-ups from your own domain (with setup)",
        "Chat widget install service — included free",
        "Stripe payments inside the chat widget",
        "Instagram DM + Facebook Messenger (waitlist — unblocks with Meta API)",
        "Advanced after-hours / on-duty scheduling rules",
        "Priority support",
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
        "Everything in Pro",
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
    /* Wave Q — pricing restructure. Three-tier ladder anchored on a free
     * forever plan with WeFixTrades branding (Wave P-H badge). Pro at $29
     * unlocks badge removal + custom domain + SMS; Business at $79 adds
     * the AI assistant + bookings + webhooks + multi-calc. Matches the
     * market: free-with-badge is the standard freemium pattern; $29 is
     * the badge-removal sweet spot (Calculoid $19, Jotform Bronze $39,
     * ConvertCalculator Pro $40); $79 sits with Involve.me Grow $69 and
     * Interact Growth $89. The Starter $49 tier was removed because it
     * couldn't differentiate from a free-with-badge plan above or a $79
     * Pro below — classic muddy-middle. */
    {
      id: "quotequick-free",
      name: "Free",
      price: 0,
      billingPeriod: "monthly",
      features: [
        "1 instant quote calculator",
        "Hosted quote page (`{your-name}.your-quote.net`)",
        "Embed snippet for any website",
        "Lead capture with every quote",
        "50 leads/month",
        "WeFixTrades branding shown",
      ],
    },
    {
      id: "quotequick-pro",
      name: "Pro",
      price: 29,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "Everything in Free, plus:",
        "Remove WeFixTrades branding",
        "Custom domain (e.g. quotes.yoursite.com)",
        "Up to 1,000 leads/month",
        "Email + SMS follow-ups",
        "Indefinite hosted-link reservation",
        "Priority email support",
      ],
    },
    {
      id: "quotequick-business",
      name: "Business",
      price: 79,
      billingPeriod: "monthly",
      features: [
        "Everything in Pro, plus:",
        "Up to 5 calculators",
        "Online booking + deposits",
        "Webhook / CRM integration (Zapier, Stripe, HubSpot)",
        "AI quote assistant",
        "Coupon codes + promotions",
        "5,000 leads/month",
      ],
    },
    /* Wave L I1 — one-time install service.
     *
     * Surfaced via the Install tab CTA when the user doesn't want to
     * embed the widget themselves. Stripe price id is wired off
     * STRIPE_QUOTEQUICK_INSTALL_PRICE (server-side env var; Alex
     * provisions live). Tier is intentionally kept inside QUOTEQUICK
     * (not its own product) so it surfaces alongside the subscription
     * options in catalogue UIs without duplicating product chrome. */
    {
      id: "quotequick-install",
      name: "Install service",
      price: 75,
      billingPeriod: "one-time",
      features: [
        "We install QuoteQuick on your website",
        "Configure it for your trade",
        "Verify it's capturing leads — within 24 hours",
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
        "Monthly security & SSL health checks",
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
      name: "Basic",
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
        "Everything in Basic",
        "AI-drafted review responses — edit and post in seconds",
        "Full review carousel widget with rotating testimonials",
        "Google + Facebook review destination choice for customers",
        "Bi-weekly reputation report",
        "Portal manual review requests + source tracking",
      ],
    },
    {
      id: "reputationshield-premium",
      name: "Premium",
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
  tagline: "Done-for-you local SEO that improves your visibility every month",
  category: "visibility",
  tiers: [
    {
      id: "rankflow-starter",
      name: "Starter",
      price: 349,
      billingPeriod: "monthly",
      features: [
        "Keyword research & local targeting",
        "Title & meta description optimization",
        "On-page SEO improvements (5 pages/mo)",
        "Google Search Console setup & monitoring",
        "Monthly progress report via dashboard",
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
        "SEO page creation (2 pages/mo)",
        "Local citation & directory building",
        "Internal linking optimization",
        "Basic schema markup",
        "Bi-weekly progress reports",
      ],
    },
    {
      id: "rankflow-pro",
      name: "Pro",
      price: 899,
      billingPeriod: "monthly",
      features: [
        "Everything in Growth",
        "SEO page creation (4 pages/mo)",
        "Expanded citation building",
        "Technical SEO checks & fixes",
        "Advanced schema markup",
        "Priority support",
        "Weekly progress reports",
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

/* ═══════════════════════════════════════════
   K. CONTENTFLOW
   ═══════════════════════════════════════════ */
export const CONTENTFLOW: ProductDef = {
  id: "contentflow",
  name: "ContentFlow™",
  tagline: "AI that writes, designs, and publishes your content — across every channel",
  category: "visibility",
  tiers: [
    {
      id: "contentflow-creator",
      name: "Creator",
      price: 49,
      billingPeriod: "monthly",
      features: [
        "1 business profile",
        "~12 AI content pieces/month (articles + social posts)",
        "Up to 3 connected channels",
        "AI-generated images",
        "Content-style questionnaire — set your tone, topics & audience",
        "Approve-before-publish review queue",
      ],
    },
    {
      id: "contentflow-studio",
      name: "Studio",
      price: 99,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      features: [
        "Up to 3 business profiles",
        "~40 AI content pieces/month",
        "All publish channels (blog, Facebook, Instagram, Google, LinkedIn, Pinterest, email)",
        "Premium AI model for higher-quality writing",
        "AI-generated images on every post",
        "Automated multi-channel repurposing",
      ],
    },
    {
      id: "contentflow-agency",
      name: "Agency",
      price: 199,
      billingPeriod: "monthly",
      features: [
        "Unlimited business profiles",
        "~120 AI content pieces/month",
        "All publish channels",
        "Premium AI model",
        "AI video generation",
        "Priority generation & support",
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
  CONTENTFLOW,
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
    { productId: "quotequick", tierId: "quotequick-business", label: "QuoteQuick Business \u2014 Instant quotes + bookings + CRM", value: 79 },
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

/**
 * Monthly revenue in cents per QuoteQuick plan_tier, derived from the canonical
 * QUOTEQUICK tiers. plan_tier DB values are the bare tier key (the `quotequick-`
 * prefix stripped from each tier id): "free" / "pro" / "business". The one-time
 * "install" tier is excluded — it's not a recurring plan_tier.
 *
 * Wave Q — legacy "starter" (the old $49 tier, retired May 2026) is kept in
 * the map at $49/mo so any grandfathered DB rows still report correctly until
 * the migration runs. The marketing UI never offers it again; existing
 * customers can either stay on starter pricing or upgrade via the dashboard.
 */
export const QUOTEQUICK_PLAN_REVENUE_CENTS: Record<string, number> = {
  free: 0,
  // Legacy — retained for backward compatibility with any pre-Wave-Q rows.
  starter: 4900,
  ...Object.fromEntries(
    QUOTEQUICK.tiers
      .filter(t => t.billingPeriod === "monthly")
      .map(t => [t.id.replace(/^quotequick-/, ""), t.price * 100]),
  ),
};
