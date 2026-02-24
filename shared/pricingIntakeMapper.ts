import { type CustomTradeData, type Stage2Data } from './schema';
import { type PricingConfigV1, validatePricingConfig, CALL_FOR_QUOTE_FALLBACK } from './pricingConfig';

export interface MapperResult {
  success: boolean;
  config: PricingConfigV1;
  errors: string[];
}

export function mapPricingIntakeToConfig(
  stage1: CustomTradeData,
  stage2: Stage2Data
): MapperResult {
  const { charge_method, output_preference, offers_packages } = stage1;
  const factors = stage1.price_factors || [];

  if (output_preference === 'call_for_quote') {
    return validated({
      pricingType: 'call_for_quote_only',
      message: stage1.short_description || 'Request a quote',
    });
  }

  if (output_preference === 'price_range') {
    const rangeMin = stage1.price_range_min ?? 0;
    const rangeMax = stage1.price_range_max ?? (rangeMin * 2 || 500);
    return validated({
      pricingType: 'price_range_only',
      rangeMin,
      rangeMax: Math.max(rangeMax, rangeMin),
    });
  }

  if (offers_packages && stage2.packages && stage2.packages.length >= 2) {
    const validPackages = stage2.packages.filter(p => p.label && p.price > 0);
    if (validPackages.length >= 2) {
      return validated({
        pricingType: 'tiered_packages',
        tierMode: 'fixed' as const,
        tiers: validPackages,
        ...buildSharedFields(stage1, stage2, factors),
      });
    }
  }

  if (charge_method === 'per_hour') {
    const rate = stage2.hourly_rate ?? guessRate(stage1);
    return validated({
      pricingType: 'hourly',
      unitName: 'hour' as const,
      rate,
      ...buildSharedFields(stage1, stage2, factors),
    });
  }

  if (charge_method === 'per_sqft') {
    const rate = stage2.sqft_rate ?? guessRate(stage1);
    return validated({
      pricingType: 'per_sqft',
      unitName: 'sq ft' as const,
      rate,
      ...buildSharedFields(stage1, stage2, factors),
      ...(stage2.setup_fee ? { baseFee: stage2.setup_fee } : {}),
    });
  }

  if (charge_method === 'per_linear_ft') {
    const rate = stage2.unit_rate ?? guessRate(stage1);
    return validated({
      pricingType: 'per_linear_ft',
      unitName: 'linear ft' as const,
      rate,
      ...buildSharedFields(stage1, stage2, factors),
      ...(stage2.base_fee ? { baseFee: stage2.base_fee } : {}),
    });
  }

  if (charge_method === 'per_item') {
    const unitName = stage2.unit_name || 'unit';
    const rate = stage2.unit_rate ?? guessRate(stage1);
    return validated({
      pricingType: 'per_unit',
      unitName,
      rate,
      ...buildSharedFields(stage1, stage2, factors),
    });
  }

  if (charge_method === 'base_plus_variable') {
    const baseFee = stage2.base_fee ?? 0;
    const unitName = stage2.unit_name || 'unit';
    const rate = stage2.unit_rate ?? guessRate(stage1);
    return validated({
      pricingType: 'base_plus_rate',
      unitName,
      baseFee,
      rate,
      ...buildSharedFields(stage1, stage2, factors),
    });
  }

  if (charge_method === 'fixed_project') {
    if (stage2.packages && stage2.packages.length >= 2) {
      const validPkgs = stage2.packages.filter(p => p.label && p.price > 0);
      if (validPkgs.length >= 2) {
        return validated({
          pricingType: 'tiered_packages',
          tierMode: 'fixed' as const,
          tiers: validPkgs,
          ...buildSharedFields(stage1, stage2, factors),
        });
      }
    }

    if (stage1.has_minimum_charge && stage1.minimum_charge_amount) {
      return validated({
        pricingType: 'min_charge_plus_addons',
        minCharge: stage1.minimum_charge_amount,
        ...buildSharedFields(stage1, stage2, factors),
      });
    }

    const rangeMin = stage1.price_range_min ?? 0;
    const rangeMax = stage1.price_range_max ?? (rangeMin > 0 ? rangeMin * 2 : 500);
    return validated({
      pricingType: 'price_range_only',
      rangeMin: rangeMin > 0 ? rangeMin : 100,
      rangeMax: Math.max(rangeMax, rangeMin > 0 ? rangeMin : 100),
    });
  }

  if (stage1.has_minimum_charge && stage1.minimum_charge_amount) {
    return validated({
      pricingType: 'min_charge_plus_addons',
      minCharge: stage1.minimum_charge_amount,
      ...buildSharedFields(stage1, stage2, factors),
    });
  }

  if (stage1.price_range_min != null || stage1.price_range_max != null) {
    const rangeMin = stage1.price_range_min ?? 0;
    const rangeMax = stage1.price_range_max ?? (rangeMin > 0 ? rangeMin * 2 : 500);
    return validated({
      pricingType: 'price_range_only',
      rangeMin: rangeMin > 0 ? rangeMin : 100,
      rangeMax: Math.max(rangeMax, rangeMin > 0 ? rangeMin : 100),
    });
  }

  return {
    success: false,
    config: CALL_FOR_QUOTE_FALLBACK,
    errors: ['Could not determine pricing type from intake answers'],
  };
}

function buildSharedFields(
  stage1: CustomTradeData,
  stage2: Stage2Data,
  factors: string[]
): Record<string, unknown> {
  const shared: Record<string, unknown> = {};

  if (stage1.has_minimum_charge && stage1.minimum_charge_amount) {
    shared.minCharge = stage1.minimum_charge_amount;
  }

  if (stage1.has_trip_fee && stage1.trip_fee_amount) {
    shared.travelFee = stage1.trip_fee_amount;
  }

  if (stage2.after_hours_multiplier && stage2.after_hours_multiplier > 1) {
    shared.afterHoursMult = stage2.after_hours_multiplier;
  }

  if (factors.includes('Difficulty level') && stage2.difficulty_tiers && stage2.difficulty_tiers.length > 0) {
    shared.difficultyTiers = stage2.difficulty_tiers.map((t, i) => ({
      id: `d${i}`,
      label: t.label || `Level ${i + 1}`,
      multiplier: Math.max(t.multiplier, 1),
    }));
  }

  if (factors.includes('Materials') && stage2.materials_markup_pct) {
    shared.addOns = [
      ...(shared.addOns as any[] || []),
      { id: 'materials_markup', label: 'Materials Markup', type: 'pct' as const, amount: stage2.materials_markup_pct },
    ];
  }

  if (factors.includes('Distance') && stage2.distance_value) {
    if (stage2.distance_mode === 'flat') {
      shared.travelFee = stage2.distance_value;
    }
  }

  return shared;
}

function guessRate(stage1: CustomTradeData): number {
  if (stage1.price_range_min != null && stage1.price_range_max != null && stage1.price_range_max > 0) {
    return Math.round((stage1.price_range_min + stage1.price_range_max) / 2);
  }
  if (stage1.price_range_min != null && stage1.price_range_min > 0) return stage1.price_range_min;
  if (stage1.price_range_max != null && stage1.price_range_max > 0) return Math.round(stage1.price_range_max / 2);
  return 50;
}

function validated(raw: Record<string, unknown>): MapperResult {
  const result = validatePricingConfig(raw);
  return {
    success: result.valid,
    config: result.config,
    errors: result.errors,
  };
}
