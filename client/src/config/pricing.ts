/**
 * Platform pricing config — re-exports from the single source of truth.
 * Import from here in client code, or directly from @shared/pricing.
 */
export {
  YEARLY_DISCOUNT_PCT,
  yearlyTotal,
  yearlyMonthlyEquiv,
  ALL_PRODUCTS,
  ALL_BUNDLES,
  SITELAUNCH,
  TRADELINE,
  QUOTEQUICK,
  MAPGUARD,
  REPUTATIONSHIELD,
  SOCIALSYNC,
  RANKFLOW,
  WEBFIX,
  FIX_OPTIMIZE,
  BUNDLE_STARTER,
  BUNDLE_GROWTH,
  BUNDLE_PRO,
  BUNDLE_FIX,
  getTier,
  lowestMonthly,
  formatPrice,
  bundleSavings,
} from "@shared/pricing";

export type {
  ProductDef,
  Tier,
  BundleDef,
} from "@shared/pricing";

export const BASE_CURRENCY = "CAD" as const;

/**
 * Legacy flat Product type for backwards compatibility with marketing/pricing.tsx
 * Derived from the canonical pricing data.
 */
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

import { ALL_PRODUCTS as _ALL, lowestMonthly as _lm } from "@shared/pricing";

/** Flat product list for legacy marketing/pricing.tsx consumption */
export const PRODUCTS: Product[] = _ALL.flatMap(p => {
  const catMap: Record<string, ProductCategory> = {
    leads: "core", visibility: "growth", reputation: "growth", website: "core",
  };
  const cat = catMap[p.category] || "core";

  if (p.tiers.length === 1) {
    const t = p.tiers[0];
    return [{
      id: t.id,
      name: p.name,
      tagline: p.tagline,
      billingType: t.billingPeriod === "monthly" ? "subscription" as BillingType : "one_time" as BillingType,
      monthly: t.billingPeriod === "monthly" ? t.price : null,
      setup: p.setup || null,
      oneTime: t.billingPeriod === "one-time" ? t.price : null,
      badge: t.badge,
      features: t.features,
      category: cat,
    }];
  }

  // Multi-tier: produce one card per tier
  return p.tiers.map(t => ({
    id: t.id,
    name: `${p.name.replace("™", "")} ${t.name}`,
    tagline: p.tagline,
    billingType: t.billingPeriod === "monthly" ? "subscription" as BillingType : "one_time" as BillingType,
    monthly: t.billingPeriod === "monthly" ? t.price : null,
    setup: p.setup || null,
    oneTime: t.billingPeriod === "one-time" ? t.price : null,
    badge: t.badge,
    features: t.features,
    category: cat,
  }));
});

/** @deprecated Use yearlyTotal from shared/pricing instead */
export function getYearlyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - 0.10));
}

/** @deprecated Use yearlyMonthlyEquiv from shared/pricing instead */
export function getYearlyMonthlyEquivalent(monthlyPrice: number): number {
  return Math.round((monthlyPrice * 12 * (1 - 0.10)) / 12);
}

/* ─── Q28g3: DB-override merge for marketing /pricing ───
 * Map every tier.id → parent product id so admin DB overrides (Q28b
 * features, Q28a tiers, name/tagline) can be applied at render time. */
const TIER_TO_PARENT: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const p of _ALL) {
    for (const t of p.tiers) out[t.id] = p.id;
  }
  return out;
})();

export interface DbProductOverride {
  id: string; // serviceCatalog.id (parent product id)
  name: string;
  tagline: string | null;
  description: string | null;
  features: string[] | null;
  tiers: Array<{
    id: string;
    name: string;
    price_cents: number;
    billing_period: "monthly" | "one-time";
    features: string[];
    badge?: string | null;
    highlighted?: boolean;
    included_mins?: number | null;
  }> | null;
}

export function mergeProductsWithDb(base: Product[], overrides: DbProductOverride[]): Product[] {
  if (!overrides || overrides.length === 0) return base;
  const byParentId = new Map(overrides.map((o) => [o.id, o]));
  return base.map((p) => {
    const parentId = TIER_TO_PARENT[p.id];
    if (!parentId) return p;
    const ov = byParentId.get(parentId);
    if (!ov) return p;

    // Find the matching tier in DB tiers (when present) for per-tier overrides.
    const dbTier = ov.tiers?.find((t) => t.id === p.id);
    const features = dbTier?.features?.length
      ? dbTier.features
      : ov.features && ov.features.length > 0
        ? ov.features
        : p.features;

    return {
      ...p,
      // Note: do NOT split admin-edited name across all tier rows — only
      // apply to single-tier products where p.name === parent name.
      name: dbTier ? `${ov.name.replace("™", "")} ${dbTier.name}` : (ov.name ?? p.name),
      tagline: ov.tagline ?? p.tagline,
      features,
      monthly: dbTier && dbTier.billing_period === "monthly" ? dbTier.price_cents / 100 : p.monthly,
      oneTime: dbTier && dbTier.billing_period === "one-time" ? dbTier.price_cents / 100 : p.oneTime,
      badge: dbTier?.badge ?? p.badge,
    };
  });
}
