// pricingConfig — single source of truth mapping the wizard's Settings-tab
// pricing model (`ShellPricing`) onto the canonical `pricing_config` shape.
//
// Why this exists (preview-fidelity fix):
//   The SAVE path (WizardShell) mapped `settings.pricing` → `pricing_config`
//   via a private `toPricingConfig`, but the live PREVIEW (PreviewPane)
//   hard-coded `{ pricingType: 'hourly', rate: 75, baseFee: 50 }`. So changing
//   the pricing mode/rate in Settings had NO effect on the preview estimate —
//   the owner couldn't see their pricing reflected until after publish. This
//   helper is the ONE mapping both call sites use, so the preview estimate and
//   the persisted pricing can never drift.
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
