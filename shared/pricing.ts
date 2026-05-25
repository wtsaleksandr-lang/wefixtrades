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
  /**
   * Stripe live price id for this tier. `null` means "tier is defined
   * in code but Stripe price has NOT yet been minted live — checkout
   * cannot proceed until Alex approves and the live-mint script runs."
   * Existing tiers that resolve their price via a server-side env var
   * (e.g. STRIPE_QUOTEQUICK_INSTALL_PRICE) leave this undefined.
   */
  stripePriceId?: string | null;
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
        "BONUS: 14-day free trial of TradeLine Starter + QuoteQuick",
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
        "Promo code support at checkout",
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
    /* TODO(stripe-launch-wiring): MapGuard live Stripe Price IDs not yet
     * minted. Wave 3.5 audit (2026-05-25) flagged this as a critical gap \u2014
     * ContentFlow has live `price_...` IDs but MapGuard does not, so
     * checkout falls back to inline price_data (works, but lookup_keys are
     * the durable wiring). Alex to mint:
     *   - mapguard_setup_one_time      \u2192 mapguard-setup
     *   - mapguard_basic_monthly       \u2192 mapguard-basic
     *   - mapguard_pro_monthly         \u2192 mapguard-pro
     * then paste each `price_...` id into stripePriceId below.
     */
    {
      id: "mapguard-setup",
      name: "MapSetup\u2122",
      price: 397,
      billingPeriod: "one-time",
      stripePriceId: null,
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
      stripePriceId: null,
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
      stripePriceId: null,
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
  /* TODO(stripe-launch-wiring): ReputationShield live Stripe Price IDs
   * not yet minted (Wave 3.5 audit 2026-05-25). ContentFlow has live
   * `price_...` IDs but ReputationShield does not. Alex to mint:
   *   - reputationshield_basic_monthly   → reputationshield-basic
   *   - reputationshield_pro_monthly     → reputationshield-pro
   *   - reputationshield_premium_monthly → reputationshield-premium
   * then paste each into stripePriceId below.
   */
  tiers: [
    {
      id: "reputationshield-basic",
      name: "Basic",
      price: 79,
      billingPeriod: "monthly",
      stripePriceId: null,
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
      stripePriceId: null,
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
      stripePriceId: null,
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
   ═══════════════════════════════════════════
   2026-05-25 — standalone-pricing rework. ContentFlow now positions as
   a self-serve product anyone can subscribe to (marketers, agencies,
   creators, solopreneurs, trades). New ladder: Free → Starter $9 →
   Creator $29 → Studio $69 → Agency $129. Old Creator/Studio/Agency
   were $49/$99/$199; new mid-tier prices drop ~40-50% per Alex's
   "really not expensive" direction.

   2026-05-25 — Stripe live prices minted (lookup_keys cf_starter_monthly_v1,
   cf_creator_monthly_v2, cf_studio_monthly_v2, cf_agency_monthly_v2). The
   `_v2` suffix marks the replaced Creator/Studio/Agency tiers that dropped
   from $49/$99/$199 to $29/$69/$129; the prior live prices remain ACTIVE so
   existing subscribers grandfather at old rates (Stripe keeps a subscription
   on its original Price ID). New signups flow through the IDs below.
*/
export const CONTENTFLOW: ProductDef = {
  id: "contentflow",
  name: "ContentFlow™",
  tagline: "AI content that actually sounds human — for marketers, agencies, creators, and trades",
  category: "visibility",
  tiers: [
    {
      id: "contentflow-free",
      name: "Free",
      price: 0,
      billingPeriod: "monthly",
      stripePriceId: null,
      features: [
        "5 AI images / month",
        "3 AI articles / month",
        "0 AI videos",
        "1 publishing channel",
        "Watermark on images",
        "Brand-color aware styling",
        "Sub-30% AI detection (humanization pipeline)",
      ],
    },
    {
      id: "contentflow-starter",
      name: "Starter",
      price: 9,
      billingPeriod: "monthly",
      // Stripe live price minted 2026-05-25 (lookup_key cf_starter_monthly_v1)
      stripePriceId: "price_1Tb1MDFWY4wju6Qir0av2PBN",
      badge: "New",
      features: [
        "10 AI images / month",
        "5 AI articles / month",
        "1 AI video / month",
        "1 publishing channel",
        "No watermark",
        "All 10 image-style presets",
        "URL prefill (paste a link, AI fills the brief)",
      ],
    },
    {
      id: "contentflow-creator",
      name: "Creator",
      price: 29,
      billingPeriod: "monthly",
      // Stripe live price minted 2026-05-25 (lookup_key cf_creator_monthly_v2 —
      // _v2 suffix because Creator was previously $49/mo; old subscribers stay
      // on legacy price `contentflow-creator_monthly` via Stripe subscription).
      stripePriceId: "price_1Tb1MEFWY4wju6QiYpvucTjY",
      features: [
        "40 AI images / month",
        "20 AI articles / month",
        "5 AI videos / month",
        "3 publishing channels",
        "Approve-before-publish review queue",
        "Content-style questionnaire (tone, topics, audience)",
        "12-pattern content library",
      ],
    },
    {
      id: "contentflow-studio",
      name: "Studio",
      price: 69,
      billingPeriod: "monthly",
      highlighted: true,
      badge: "Most Popular",
      // Stripe live price minted 2026-05-25 (lookup_key cf_studio_monthly_v2 —
      // _v2 suffix because Studio was previously $99/mo; old subscribers stay
      // on legacy price `contentflow-studio_monthly` via Stripe subscription).
      stripePriceId: "price_1Tb1MEFWY4wju6QibgFABfoM",
      features: [
        "150 AI images / month",
        "60 AI articles / month",
        "15 AI videos / month",
        "5 publishing channels",
        "Premium AI model for higher-quality writing",
        "Automated multi-channel repurposing",
        "Brand-voice memory across sessions",
      ],
    },
    {
      id: "contentflow-agency",
      name: "Agency",
      price: 129,
      billingPeriod: "monthly",
      // Stripe live price minted 2026-05-25 (lookup_key cf_agency_monthly_v2 —
      // _v2 suffix because Agency was previously $199/mo; old subscribers stay
      // on legacy price `contentflow-agency_monthly` via Stripe subscription).
      stripePriceId: "price_1Tb1MEFWY4wju6QiJkl1fMNp",
      features: [
        "500 AI images / month",
        "200 AI articles / month",
        "50 AI videos / month",
        "Unlimited publishing channels",
        "Unlimited brand/client profiles",
        "Priority generation & support",
        "Early access to new patterns + styles",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   L. CITATION BUILDER (one-time service, 3 tiers)
   ═══════════════════════════════════════════
   Wave 3.5 launch-wiring — Citation Builder shipped its marketing
   surface in PR #815 (Starter $79 / Pro $179 / Premium $299) but had
   no Stripe entry here. This block fixes that so the page CTAs can
   wire to a real checkout endpoint instead of mailto:sales@.

   TODO(stripe): Alex to mint live prices then paste IDs:
     - citation_builder_starter_one_time  → citationbuilder-starter
     - citation_builder_pro_one_time      → citationbuilder-pro
     - citation_builder_premium_one_time  → citationbuilder-premium
   Until then, checkout falls back to inline price_data (works end-to-end).
*/
export const CITATIONBUILDER: ProductDef = {
  id: "citationbuilder",
  name: "Citation Builder",
  tagline: "Done-for-you submission to 100+ local business directories",
  category: "visibility",
  tiers: [
    {
      id: "citationbuilder-starter",
      name: "Starter",
      price: 79,
      billingPeriod: "one-time",
      stripePriceId: null,
      features: [
        "25 hand-picked general directories",
        "NAP verification + cleanup before submission",
        "Listed within 7 business days",
        "Status dashboard + completion report",
        "Email support",
      ],
    },
    {
      id: "citationbuilder-pro",
      name: "Pro",
      price: 179,
      billingPeriod: "one-time",
      highlighted: true,
      badge: "Most Popular",
      stripePriceId: null,
      features: [
        "Everything in Starter (25 general)",
        "+25 trade-specific directories (Angi, Houzz, HomeAdvisor)",
        "Photo + service-list upload where supported",
        "Listed within 7 business days",
        "Priority email support",
      ],
    },
    {
      id: "citationbuilder-premium",
      name: "Premium",
      price: 299,
      billingPeriod: "one-time",
      stripePriceId: null,
      features: [
        "Everything in Pro (50 trade + general)",
        "+50 niche / regional / industry directories",
        "Voice-search optimized directories",
        "Aggregator submissions (Localeze, Acxiom, Foursquare)",
        "Quarterly NAP re-verification report",
        "Phone support during business hours",
      ],
    },
  ],
};

/* ═══════════════════════════════════════════
   M. FULL AUDIT MASTER (one-time $9.80 upsell)
   ═══════════════════════════════════════════
   Wave 3.5 launch-wiring — multiple free tools advertise a "$9.80 full
   audit" upsell (CitationChecker, LocalRankflux, LocalSearchChecker,
   FreeToolLayout) but no Stripe product existed. This block + the
   /api/full-audit/checkout endpoint close the loop so the upsell is
   actually payable instead of dead copy.
*/
export const FULL_AUDIT_MASTER: ProductDef = {
  id: "full_audit_master",
  name: "Full Audit Master",
  tagline: "Five audits combined into one PDF — local SEO, NAP, speed, trust, market size",
  category: "visibility",
  tiers: [
    {
      id: "full_audit_master",
      name: "Master Audit",
      price: 9.80,
      billingPeriod: "one-time",
      // TODO(stripe): mint live price (lookup_key full_audit_master_one_time) and paste id here
      stripePriceId: null,
      features: [
        "Local SEO checklist (all 28 ranking factors)",
        "NAP consistency across 50 directories",
        "Site speed (Core Web Vitals desktop + mobile)",
        "Trust & authority signals",
        "Market size analysis for your service area",
        "Delivered as a single PDF within 60 seconds of payment",
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
  CITATIONBUILDER,
  FULL_AUDIT_MASTER,
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
