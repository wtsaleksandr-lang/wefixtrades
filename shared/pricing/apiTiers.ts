/**
 * API platform tier definitions (Wave AJ-2).
 *
 * Defines the developer-facing subscription tiers for the public API
 * platform. SEPARATE from QuoteQuick subscription tiers — these gate access
 * to the API endpoints (rate limit + monthly call quota), not the
 * QuoteQuick widget itself.
 *
 * Pricing magnitudes here are PLACEHOLDERS. Wave AJ-1 is researching real
 * comparables (Stripe API, Twilio, etc.) and will land final numbers in a
 * follow-up PR. Until then we use round-magnitude figures so the rest of
 * the system (Stripe price env-vars, admin UI, portal UI) can be wired
 * end-to-end against stable shapes.
 *
 * Adding a tier: append to API_TIERS and add corresponding Stripe price
 * env-var entries. The Stripe price ids live in env-vars (not in code)
 * so we can rotate them without a redeploy.
 */

export interface ApiTier {
  id: string;
  name: string;
  /** Monthly price in whole dollars (USD). Placeholder until AJ-1. */
  priceMonthly: number;
  /** Annual price in whole dollars (USD). Placeholder until AJ-1. */
  priceAnnual: number;
  /** Hard quota that resets each billing period. 0 = no API access. */
  monthlyCallQuota: number;
  /** Token-bucket capacity (and refill per minute) for short-burst limiting. */
  rateLimitPerMinute: number;
  /**
   * Max calculators the user can own via the API (Wave AJ-6). -1 = unlimited.
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
}

export const API_TIERS: ApiTier[] = [
  {
    id: "free",
    name: "Developer",
    priceMonthly: 0,
    priceAnnual: 0,
    monthlyCallQuota: 100,
    rateLimitPerMinute: 5,
    maxCalculators: 1,
    webhookQuota: 0,
    features: ["1 API key", "Sandbox mode", "Community support"],
    stripeMonthlyPriceEnv: "",
    stripeAnnualPriceEnv: "",
  },
  // PLACEHOLDER prices — Wave AJ-1 will refine. Use round magnitudes.
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    priceAnnual: 290,
    monthlyCallQuota: 5_000,
    rateLimitPerMinute: 30,
    maxCalculators: 3,
    webhookQuota: 5,
    features: ["3 API keys", "Webhooks", "Email support"],
    stripeMonthlyPriceEnv: "STRIPE_API_STARTER_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_STARTER_ANNUAL_PRICE",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 79,
    priceAnnual: 790,
    monthlyCallQuota: 50_000,
    rateLimitPerMinute: 120,
    maxCalculators: 25,
    webhookQuota: 20,
    features: ["Unlimited keys", "Custom webhooks", "Priority email"],
    stripeMonthlyPriceEnv: "STRIPE_API_GROWTH_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_GROWTH_ANNUAL_PRICE",
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 199,
    priceAnnual: 1_990,
    monthlyCallQuota: 500_000,
    rateLimitPerMinute: 600,
    maxCalculators: -1,
    webhookQuota: 100,
    features: ["SLA 99.9%", "Multi-team", "Dedicated Slack"],
    stripeMonthlyPriceEnv: "STRIPE_API_SCALE_MONTHLY_PRICE",
    stripeAnnualPriceEnv: "STRIPE_API_SCALE_ANNUAL_PRICE",
  },
];

export function getApiTier(id: string): ApiTier | undefined {
  return API_TIERS.find((t) => t.id === id);
}

/** Default tier id assigned to a brand-new account before checkout. */
export const DEFAULT_API_TIER_ID = "free";

export type ApiTierId = (typeof API_TIERS)[number]["id"];
