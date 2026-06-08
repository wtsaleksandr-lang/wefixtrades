/**
 * Shared Stripe price resolver for the catalog.
 *
 * Resolution order: catalog-stored price id first (the sync-stripe path,
 * `stripe_price_id` / `stripe_yearly_price_id`), then an env-var placeholder
 * keyed by the catalog row / tier id (TradeLine, ContentFlow, QuoteQuick
 * install). Returns null when no price is configured.
 *
 * Extracted from publicCheckoutRoutes.ts so the portal subscribe path
 * (server/routes/portal/catalog.ts) resolves env-priced products identically
 * to public checkout — previously the portal read `stripe_price_id` directly
 * and 400'd "pricing isn't configured" for env-priced products (TradeLine,
 * ContentFlow tiers, QuoteQuick install) even though they sell publicly.
 *
 * Behaviour is byte-for-byte identical to the original public-checkout
 * function — same maps, same legacy fallthrough, same null result.
 */

/**
 * Env-var placeholder Stripe price IDs for the public TradeLine tiers.
 *
 * The TradeLine tier SKUs (tradeline-starter/pro/premium) are purchasable
 * from the marketing pricing page. Their Stripe prices are provisioned by
 * Alex separately (live mode) and supplied via these env vars — so the
 * checkout works without anyone running sync-stripe.ts in production.
 *
 * Resolution order (see resolveStripePriceId): catalog stripe_price_id
 * first (sync-stripe path), then the env-var placeholder. If neither is
 * set the checkout returns a clean "contact us" error rather than failing.
 *
 * Wave 11D D4 — env var names realigned to `STRIPE_PRICE_TRADELINE_*` to
 * match the canonical 2026-05-26 mint (6 live prices in Doppler prd).
 * Tier $99/$149/$249 monthly + 2-months-free yearly. Old legacy names
 * (STRIPE_TRADELINE_*_PRICE) are still resolved as a fallback so any
 * stale Doppler entry continues to work; new var names take priority.
 */
const TRADELINE_TIER_PRICE_ENV: Record<string, { monthly: string; yearly: string; monthlyLegacy?: string; yearlyLegacy?: string }> = {
  "tradeline-starter": {
    monthly: "STRIPE_PRICE_TRADELINE_STARTER_MONTHLY",
    yearly:  "STRIPE_PRICE_TRADELINE_STARTER_YEARLY",
    monthlyLegacy: "STRIPE_TRADELINE_STARTER_PRICE",
    yearlyLegacy:  "STRIPE_TRADELINE_STARTER_YEARLY_PRICE",
  },
  "tradeline-pro": {
    monthly: "STRIPE_PRICE_TRADELINE_PRO_MONTHLY",
    yearly:  "STRIPE_PRICE_TRADELINE_PRO_YEARLY",
    monthlyLegacy: "STRIPE_TRADELINE_PRO_PRICE",
    yearlyLegacy:  "STRIPE_TRADELINE_PRO_YEARLY_PRICE",
  },
  "tradeline-premium": {
    monthly: "STRIPE_PRICE_TRADELINE_PREMIUM_MONTHLY",
    yearly:  "STRIPE_PRICE_TRADELINE_PREMIUM_YEARLY",
    monthlyLegacy: "STRIPE_TRADELINE_PREMIUM_PRICE",
    yearlyLegacy:  "STRIPE_TRADELINE_PREMIUM_YEARLY_PRICE",
  },
};

/**
 * ContentFlow standalone-SKU price env placeholders (phase2-decision #3).
 * Same env-var fallback model as TradeLine: catalog stripe_price_id first,
 * then these env vars. TODO(alex): provision the live Stripe recurring
 * prices and set these in Doppler wefixtrades/prd.
 */
const CONTENTFLOW_TIER_PRICE_ENV: Record<string, { monthly: string; yearly: string }> = {
  "contentflow-creator": { monthly: "STRIPE_CONTENTFLOW_CREATOR_PRICE", yearly: "STRIPE_CONTENTFLOW_CREATOR_YEARLY_PRICE" },
  "contentflow-studio":  { monthly: "STRIPE_CONTENTFLOW_STUDIO_PRICE",  yearly: "STRIPE_CONTENTFLOW_STUDIO_YEARLY_PRICE" },
  "contentflow-agency":  { monthly: "STRIPE_CONTENTFLOW_AGENCY_PRICE",  yearly: "STRIPE_CONTENTFLOW_AGENCY_YEARLY_PRICE" },
};

/**
 * Wave L I1 — QuoteQuick one-time install service. $75 one-time SKU
 * surfaced via the Install tab CTA in the editor.
 *
 * Same env-var fallback model as TradeLine / ContentFlow above: catalog
 * stripe_price_id first (sync-stripe writes it back after provisioning),
 * then this env var. TODO(alex): provision STRIPE_QUOTEQUICK_INSTALL_PRICE
 * in Doppler wefixtrades/prd and rerun sync-stripe.
 *
 * The tier is one-time, so only the `monthly` slot is meaningful here —
 * yearly is left unset and the resolver returns null when `wantsYearly`.
 */
const QUOTEQUICK_TIER_PRICE_ENV: Record<string, { monthly: string; yearly: string }> = {
  "quotequick-install": { monthly: "STRIPE_QUOTEQUICK_INSTALL_PRICE", yearly: "" },
};

/**
 * Minimal structural shape the resolver needs from a catalog row or a
 * per-product tier. A full `ServiceCatalogRow` satisfies this (so the public
 * path is unchanged); a picked product tier — which carries `id` +
 * `stripe_price_id` but no `stripe_yearly_price_id` — also satisfies it via
 * the optional fields.
 */
export interface PriceResolvableRow {
  id: string;
  stripe_price_id?: string | null;
  stripe_yearly_price_id?: string | null;
}

/**
 * Resolve the Stripe price ID for a catalog service or tier.
 * Prefers the catalog-stored id; falls back to an env-var placeholder for
 * the TradeLine / ContentFlow / QuoteQuick-install SKUs. Returns null when no
 * price is configured.
 */
export function resolveStripePriceId(svc: PriceResolvableRow, wantsYearly: boolean): string | null {
  const catalogId = wantsYearly ? svc.stripe_yearly_price_id : svc.stripe_price_id;
  if (catalogId) return catalogId;

  const envKeys = TRADELINE_TIER_PRICE_ENV[svc.id]
    ?? CONTENTFLOW_TIER_PRICE_ENV[svc.id]
    ?? QUOTEQUICK_TIER_PRICE_ENV[svc.id];
  if (envKeys) {
    const envName = wantsYearly ? envKeys.yearly : envKeys.monthly;
    if (envName) {
      const envVal = process.env[envName];
      if (envVal && envVal.trim()) return envVal.trim();
    }
    // Wave 11D D4 — fall through to the legacy env var name when the
    // canonical one isn't set (only TradeLine tiers carry these).
    const legacyName = wantsYearly
      ? (envKeys as { yearlyLegacy?: string }).yearlyLegacy
      : (envKeys as { monthlyLegacy?: string }).monthlyLegacy;
    if (legacyName) {
      const legacyVal = process.env[legacyName];
      if (legacyVal && legacyVal.trim()) return legacyVal.trim();
    }
  }
  return null;
}
