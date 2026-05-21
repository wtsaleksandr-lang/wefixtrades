/**
 * API platform tier definitions (Wave AJ-3 — pricing locked).
 *
 * Defines the developer-facing subscription tiers for the public API
 * platform. SEPARATE from QuoteQuick subscription tiers — these gate access
 * to the API endpoints (rate limit + monthly call quota), not the
 * QuoteQuick widget itself.
 *
 * Pricing magnitudes are LOCKED as of Wave AJ-3. Annual prices reflect a
 * 17% discount vs monthly × 12 (matches QQ's QUOTEQUICK_YEARLY_DISCOUNT_PCT).
 * Overage is billed at $2.00 per 1,000 calls, capped at 3× the tier's
 * monthly price for a given period.
 *
 * Stripe price ids live in env vars (not in code) so we can rotate them
 * without a redeploy. Alex creates the live prices in Stripe Dashboard
 * and sets the corresponding env keys in Doppler `wefixtrades/prd`.
 *
 * QQ loyalty pricing: existing QuoteQuick paid customers get the Starter
 * tier at $29/mo (40% off the $49 list) — locked while their QQ paid
 * subscription remains active. Implemented via a separate Stripe price
 * referenced by `stripeLoyaltyMonthlyPriceEnv`.
 *
 * Tier-id renames vs the AJ-2 placeholders: `growth` → `pro`, `scale` →
 * `business`, plus a new top tier `agency`. Any old keys still tagged
 * with `growth`/`scale` continue to function (the auth middleware
 * doesn't gate on tier id); they will be migrated lazily on next
 * checkout via the Stripe webhook.
 */

export interface ApiTier {
  id: string;
  name: string;
  /** Monthly price in whole dollars (USD). 0 = freemium. */
  priceMonthly: number;
  /** Annualised total in whole dollars (USD). 17% off implicit. */
  priceAnnual: number;
  /** Annual price expressed as monthly equivalent — for display only. */
  priceAnnualPerMonthEq: number;
  /** Hard quota that resets each billing period. 0 = no API access. */
  monthlyCallQuota: number;
  /** Token-bucket capacity (and refill per minute) for short-burst limiting. */
  rateLimitPerMinute: number;
  /**
   * Max calculators the user can own via the API. -1 = unlimited.
   * Counted against active (non-deleted) calculators only.
   */
  maxCalculators: number;
  /**
   * Max webhook subscriptions allowed (Wave AJ-6). -1 = unlimited, 0 = none.
   */
  webhookQuota: number;
  /** Bullet copy for the pricing page. */
  features: string[];
  /** Env-var name holding the Stripe price id for monthly billing. */
  stripeMonthlyPriceEnv: string;
  /** Env-var name holding the Stripe price id for annual billing. */
  stripeAnnualPriceEnv: string;
  /** Env-var name holding the loyalty (QQ-paid) monthly price id. Starter only. */
  stripeLoyaltyMonthlyPriceEnv?: string;
}

export const API_TIERS: ApiTier[] = [
  {
    id: "free",
    name: "Developer",
    priceMonthly: 0,
    priceAnnual: 0,
    priceAnnualPerMonthEq: 0,
    monthlyCallQuota: 1_000,
    rateLimitPerMinute: 5,
    maxCalculators: 1,
    webhookQuota: 0,
    features: [
      "1 API key",
      "Sandbox + production keys",
      "Webhooks (read-only)",
      "Community support",
      "7-day data retention",
    ],
    stripeMonthlyPriceEnv: "",
    stripeAnnualPriceEnv: "",
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 49,
    priceAnnual: 480,
    priceAnnualPerMonthEq: 40,
    monthlyCallQuota: 25_000,
    rateLimitPerMinute: 30,
    maxCalculators: 3,
    webhookQuota: 5,
    features: [
      "3 API keys",
      "Production webhooks",
      "90-day retention",
      "Email support",
      "WFT badge optional",
    ],
    stripeMonthlyPriceEnv: "STRIPE_API_STARTER_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_STARTER_ANNUAL_PRICE",
    stripeLoyaltyMonthlyPriceEnv: "STRIPE_API_STARTER_LOYALTY_MONTHLY_PRICE",
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 149,
    priceAnnual: 1_488,
    priceAnnualPerMonthEq: 124,
    monthlyCallQuota: 150_000,
    rateLimitPerMinute: 120,
    maxCalculators: 10,
    webhookQuota: 20,
    features: [
      "White-label (no WFT branding)",
      "Custom domain on hosted quote pages",
      "Priority webhook delivery",
      "180-day retention",
      "Business-hours support",
      "99.5% uptime SLA",
    ],
    stripeMonthlyPriceEnv: "STRIPE_API_PRO_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_PRO_ANNUAL_PRICE",
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 399,
    priceAnnual: 3_972,
    priceAnnualPerMonthEq: 331,
    monthlyCallQuota: 750_000,
    rateLimitPerMinute: 600,
    maxCalculators: 50,
    webhookQuota: 100,
    features: [
      "Multi-workspace",
      "Role-based API keys",
      "IP allowlisting",
      "1-year retention",
      "4-hour support SLA",
      "99.9% uptime SLA",
      "Stripe Connect handoff",
    ],
    stripeMonthlyPriceEnv: "STRIPE_API_BUSINESS_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_BUSINESS_ANNUAL_PRICE",
  },
  {
    id: "agency",
    name: "Agency",
    priceMonthly: 999,
    priceAnnual: 9_948,
    priceAnnualPerMonthEq: 829,
    monthlyCallQuota: 3_000_000,
    rateLimitPerMinute: 1_800,
    maxCalculators: -1,
    webhookQuota: -1,
    features: [
      "Reseller terms (sub-account billing)",
      "Co-branded dashboards",
      "24h onboarding",
      "Named CSM",
      "99.95% SLA",
      "Custom DPA",
    ],
    stripeMonthlyPriceEnv: "STRIPE_API_AGENCY_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_AGENCY_ANNUAL_PRICE",
  },
];

export function getApiTier(id: string): ApiTier | undefined {
  return API_TIERS.find((t) => t.id === id);
}

/** Default tier id assigned to a brand-new account before checkout. */
export const DEFAULT_API_TIER_ID = "free";

export type ApiTierId = (typeof API_TIERS)[number]["id"];

/** Overage billed at $2.00 per 1,000 calls beyond the tier quota. */
export const API_OVERAGE_RATE_PER_1K_CALLS = 2.0;

/** Overage charges are capped at 3× the tier's monthly price per period. */
export const API_OVERAGE_MAX_MULTIPLIER = 3.0;

/** QQ-paid loyalty Starter price (40% off list). */
export const QQ_LOYALTY_STARTER_MONTHLY = 29;

/** Loyalty discount percentage (informational, for display). */
export const QQ_LOYALTY_DISCOUNT_PCT = 40;
