import type { PricingConfigV1, AddOn } from "./pricingConfig";
import { validatePricingConfig, CALL_FOR_QUOTE_FALLBACK } from "./pricingConfig";

export interface EstimateInputs {
  quantity?: number;
  selectedTierIndex?: number;
  selectedAddOnIds?: string[];
  selectedDifficultyId?: string;
  isAfterHours?: boolean;
}

export interface EstimateBreakdown {
  label: string;
  amount: number;
}

export interface EstimateResult {
  type: "exact" | "range" | "call_for_quote";
  total: number;
  rangeMin?: number;
  rangeMax?: number;
  message?: string;
  breakdown: EstimateBreakdown[];
  callUs: boolean;
}

function applyAddOns(
  subtotal: number,
  addOns: AddOn[] | undefined,
  selectedIds: string[] | undefined
): { amount: number; lines: EstimateBreakdown[] } {
  if (!addOns?.length || !selectedIds?.length) return { amount: 0, lines: [] };
  let amount = 0;
  const lines: EstimateBreakdown[] = [];
  for (const ao of addOns) {
    if (!selectedIds.includes(ao.id)) continue;
    const val = ao.type === "pct" ? subtotal * (ao.amount / 100) : ao.amount;
    amount += val;
    lines.push({
      label: ao.label + (ao.type === "pct" ? ` (${ao.amount}%)` : ""),
      amount: Math.round(val * 100) / 100,
    });
  }
  return { amount, lines };
}

function applyModifiers(
  subtotal: number,
  config: any,
  inputs: EstimateInputs
): { total: number; lines: EstimateBreakdown[] } {
  let total = subtotal;
  const lines: EstimateBreakdown[] = [];

  if (config.travelFee && config.travelFee > 0) {
    total += config.travelFee;
    lines.push({ label: "Travel / Service Fee", amount: config.travelFee });
  }

  if (inputs.isAfterHours && config.afterHoursMult && config.afterHoursMult > 1) {
    const extra = total * (config.afterHoursMult - 1);
    total += extra;
    lines.push({ label: `After-Hours (×${config.afterHoursMult})`, amount: Math.round(extra * 100) / 100 });
  }

  if (inputs.selectedDifficultyId && config.difficultyTiers?.length) {
    const tier = config.difficultyTiers.find((t: any) => t.id === inputs.selectedDifficultyId);
    if (tier && tier.multiplier > 1) {
      const extra = total * (tier.multiplier - 1);
      total += extra;
      lines.push({ label: `${tier.label} (×${tier.multiplier})`, amount: Math.round(extra * 100) / 100 });
    }
  }

  const { amount: addOnTotal, lines: addOnLines } = applyAddOns(total, config.addOns, inputs.selectedAddOnIds);
  total += addOnTotal;
  lines.push(...addOnLines);

  if (config.minCharge !== undefined && config.minCharge > 0 && total < config.minCharge) {
    total = config.minCharge;
    lines.push({ label: "Minimum charge applied", amount: config.minCharge });
  }

  // Guard: if any arithmetic produced NaN, clamp to 0
  total = Number.isFinite(total) ? Math.round(total * 100) / 100 : 0;
  return { total, lines };
}

export function calculateEstimate(
  rawConfig: unknown,
  inputs: EstimateInputs
): EstimateResult {
  const validation = validatePricingConfig(rawConfig ?? CALL_FOR_QUOTE_FALLBACK);
  const config = validation.valid ? validation.config : CALL_FOR_QUOTE_FALLBACK;

  // Guard: ensure quantity is a finite positive number
  const rawQty = inputs.quantity ?? 1;
  const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;

  switch (config.pricingType) {
    case "hourly": {
      const base = (config.baseFee ?? 0);
      const unitTotal = config.rate * qty;
      const breakdown: EstimateBreakdown[] = [];
      if (base > 0) breakdown.push({ label: "Setup / Dispatch Fee", amount: base });
      breakdown.push({ label: `${qty} hour${qty !== 1 ? "s" : ""} × $${config.rate}`, amount: unitTotal });
      const subtotal = base + unitTotal;
      const { total, lines } = applyModifiers(subtotal, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "per_unit": {
      const base = config.baseFee ?? 0;
      const unitTotal = config.rate * qty;
      const breakdown: EstimateBreakdown[] = [];
      if (base > 0) breakdown.push({ label: "Base Fee", amount: base });
      breakdown.push({ label: `${qty} ${config.unitName}${qty !== 1 ? "s" : ""} × $${config.rate}`, amount: unitTotal });
      const subtotal = base + unitTotal;
      const { total, lines } = applyModifiers(subtotal, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "per_sqft": {
      const base = config.baseFee ?? 0;
      const unitTotal = config.rate * qty;
      const breakdown: EstimateBreakdown[] = [];
      if (base > 0) breakdown.push({ label: "Base Fee", amount: base });
      breakdown.push({ label: `${qty} sq ft × $${config.rate}`, amount: unitTotal });
      const subtotal = base + unitTotal;
      const { total, lines } = applyModifiers(subtotal, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "per_linear_ft": {
      const base = config.baseFee ?? 0;
      const unitTotal = config.rate * qty;
      const breakdown: EstimateBreakdown[] = [];
      if (base > 0) breakdown.push({ label: "Base Fee", amount: base });
      breakdown.push({ label: `${qty} linear ft × $${config.rate}`, amount: unitTotal });
      const subtotal = base + unitTotal;
      const { total, lines } = applyModifiers(subtotal, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "base_plus_rate": {
      const unitTotal = config.rate * qty;
      const breakdown: EstimateBreakdown[] = [
        { label: "Base Fee", amount: config.baseFee },
        { label: `${qty} ${config.unitName}${qty !== 1 ? "s" : ""} × $${config.rate}`, amount: unitTotal },
      ];
      const subtotal = config.baseFee + unitTotal;
      const { total, lines } = applyModifiers(subtotal, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "tiered_packages": {
      const rawIdx = inputs.selectedTierIndex ?? 0;
      const tierIdx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < config.tiers.length ? rawIdx : 0;
      const tier = config.tiers[tierIdx] || config.tiers[0];
      if (!tier) {
        return { type: "call_for_quote", total: 0, message: "No packages configured", breakdown: [], callUs: true };
      }
      const breakdown: EstimateBreakdown[] = [
        { label: tier.label, amount: tier.price },
      ];
      const { total, lines } = applyModifiers(tier.price, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "tiered_ranges": {
      const matchedTier = config.tiers.find(
        t => qty >= t.min && (t.max === null || qty <= t.max)
      );
      if (!matchedTier) {
        return { type: "call_for_quote", total: 0, message: "Quantity out of range — contact us for a quote", breakdown: [], callUs: true };
      }
      const breakdown: EstimateBreakdown[] = [
        { label: `${qty} ${config.unitName} (tier: ${matchedTier.min}–${matchedTier.max ?? "∞"})`, amount: matchedTier.price },
      ];
      const { total, lines } = applyModifiers(matchedTier.price, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "min_charge_plus_addons": {
      const breakdown: EstimateBreakdown[] = [
        { label: "Minimum Service Charge", amount: config.minCharge },
      ];
      const { total, lines } = applyModifiers(config.minCharge, config, inputs);
      breakdown.push(...lines);
      const callUs = config.callUsThreshold !== undefined && total >= config.callUsThreshold;
      return { type: "exact", total, breakdown, callUs };
    }

    case "price_range_only": {
      const callUs = config.callUsThreshold !== undefined &&
        config.rangeMax >= config.callUsThreshold;
      return {
        type: "range",
        total: Math.round((config.rangeMin + config.rangeMax) / 2),
        rangeMin: config.rangeMin,
        rangeMax: config.rangeMax,
        breakdown: [{ label: "Estimated Range", amount: 0 }],
        callUs,
      };
    }

    case "call_for_quote_only": {
      return {
        type: "call_for_quote",
        total: 0,
        message: config.message,
        breakdown: [],
        callUs: true,
      };
    }

    default:
      return {
        type: "call_for_quote",
        total: 0,
        message: "Request a quote",
        breakdown: [],
        callUs: true,
      };
  }
}
