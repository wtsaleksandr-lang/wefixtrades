// pricingConfig — single source of truth mapping the wizard's Settings-tab
// pricing model (`ShellPricing`) onto the canonical `pricing_config` shape.
//
// Why this exists:
//   The SAVE path (WizardShell) maps `settings.pricing` → `pricing_config`
//   through this single helper so the persisted shape is canonical.
//
// IMPORTANT (fidelity-A4, 2026-06-17): `pricing_config` is consumed ONLY by the
//   legacy non-advanced pricing-family engine. The QuoteQuick wizard always
//   authors an *advanced* calculator (`calculator_settings.advanced.enabled`),
//   which renders via <AdvancedCalculator> and computes its estimate from
//   `advanced.fields` + `advanced.calculations` — it NEVER reads
//   `pricing_config`. So for wizard calculators this mapping affects neither the
//   preview nor the published estimate; the real pricing engine is the
//   per-field option prices + Build-tab formula. The Settings-tab "Pricing
//   model" UI that fed this was removed (see SettingsTab.tsx). This helper is
//   retained for the save mapping + any legacy non-advanced consumer; do not
//   assume editing pricing here changes an advanced widget's numbers.
//
// Pure + typed: no React, no side effects.

import type { ShellPricing } from './types';

/** Canonical pricing_config the QuoteWidget engine consumes. */
export type WizardPricingConfig =
  | { readonly pricingType: 'hourly'; readonly unitName: 'hour'; readonly rate: number; readonly baseFee?: number }
  | { readonly pricingType: 'min_charge_plus_addons'; readonly minCharge: number }
  | { readonly pricingType: 'per_unit'; readonly unitName: string; readonly rate: number };

/**
 * Map the wizard pricing model onto the engine's pricing_config.
 *   - `hourly` → `{ pricingType: 'hourly', rate }`
 *   - `fixed`  → `{ pricingType: 'min_charge_plus_addons', minCharge }`
 *   - `custom` → `{ pricingType: 'per_unit', unitName: label, rate }`
 * Absent / invalid values fall back to sensible defaults so the preview always
 * produces a non-zero estimate.
 */
export function toPricingConfig(pricing: ShellPricing | undefined): WizardPricingConfig {
  if (!pricing) {
    return { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50 };
  }
  if (pricing.mode === 'hourly') {
    const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 75;
    return { pricingType: 'hourly', unitName: 'hour', rate };
  }
  if (pricing.mode === 'fixed') {
    const minCharge = typeof pricing.value === 'number' && pricing.value >= 0 ? pricing.value : 0;
    return { pricingType: 'min_charge_plus_addons', minCharge };
  }
  const unitName = (pricing.label ?? '').trim() || 'unit';
  const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 1;
  return { pricingType: 'per_unit', unitName, rate };
}
