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
