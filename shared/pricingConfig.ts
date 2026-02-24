import { z } from "zod";

export const PRICING_TYPES = [
  "hourly",
  "per_unit",
  "per_sqft",
  "per_linear_ft",
  "base_plus_rate",
  "tiered_packages",
  "tiered_ranges",
  "min_charge_plus_addons",
  "price_range_only",
  "call_for_quote_only",
] as const;

export type PricingType = (typeof PRICING_TYPES)[number];

const addOnSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["fixed", "pct"]),
  amount: z.number().min(0),
  default: z.boolean().optional(),
});

const difficultyTierSchema = z.object({
  id: z.string(),
  label: z.string(),
  multiplier: z.number().min(1),
});

const tieredPackageSchema = z.object({
  label: z.string(),
  price: z.number().min(0),
});

const tieredRangeSchema = z.object({
  min: z.number().min(0),
  max: z.number().nullable(),
  price: z.number().min(0),
});

const sharedOptionalFields = z.object({
  baseFee: z.number().min(0).optional(),
  minCharge: z.number().min(0).optional(),
  travelFee: z.number().min(0).optional(),
  afterHoursMult: z.number().min(1).optional(),
  difficultyTiers: z.array(difficultyTierSchema).optional(),
  addOns: z.array(addOnSchema).optional(),
  callUsThreshold: z.number().min(0).optional(),
});

const hourlySchema = sharedOptionalFields.extend({
  pricingType: z.literal("hourly"),
  unitName: z.literal("hour"),
  rate: z.number().min(0),
});

const perUnitSchema = sharedOptionalFields.extend({
  pricingType: z.literal("per_unit"),
  unitName: z.string().min(1),
  rate: z.number().min(0),
});

const perSqftSchema = sharedOptionalFields.extend({
  pricingType: z.literal("per_sqft"),
  unitName: z.literal("sq ft"),
  rate: z.number().min(0),
});

const perLinearFtSchema = sharedOptionalFields.extend({
  pricingType: z.literal("per_linear_ft"),
  unitName: z.literal("linear ft"),
  rate: z.number().min(0),
});

const basePlusRateSchema = sharedOptionalFields.extend({
  pricingType: z.literal("base_plus_rate"),
  unitName: z.string().min(1),
  baseFee: z.number().min(0),
  rate: z.number().min(0),
});

const tieredPackagesSchema = z.object({
  pricingType: z.literal("tiered_packages"),
  tierMode: z.literal("fixed"),
  tiers: z.array(tieredPackageSchema).min(1),
  addOns: z.array(addOnSchema).optional(),
  travelFee: z.number().min(0).optional(),
  afterHoursMult: z.number().min(1).optional(),
  difficultyTiers: z.array(difficultyTierSchema).optional(),
  callUsThreshold: z.number().min(0).optional(),
});

const tieredRangesSchema = z.object({
  pricingType: z.literal("tiered_ranges"),
  tierMode: z.literal("fixed"),
  unitName: z.string().min(1),
  tiers: z.array(tieredRangeSchema).min(1),
  addOns: z.array(addOnSchema).optional(),
  travelFee: z.number().min(0).optional(),
  afterHoursMult: z.number().min(1).optional(),
  difficultyTiers: z.array(difficultyTierSchema).optional(),
  callUsThreshold: z.number().min(0).optional(),
});

const minChargePlusAddonsSchema = z.object({
  pricingType: z.literal("min_charge_plus_addons"),
  minCharge: z.number().min(0),
  addOns: z.array(addOnSchema).optional(),
  travelFee: z.number().min(0).optional(),
  afterHoursMult: z.number().min(1).optional(),
  difficultyTiers: z.array(difficultyTierSchema).optional(),
  callUsThreshold: z.number().min(0).optional(),
});

const priceRangeOnlySchema = z.object({
  pricingType: z.literal("price_range_only"),
  rangeMin: z.number().min(0),
  rangeMax: z.number().min(0),
  callUsThreshold: z.number().min(0).optional(),
});

const callForQuoteOnlySchema = z.object({
  pricingType: z.literal("call_for_quote_only"),
  message: z.string().default("Request a quote"),
});

export const pricingConfigV1Schema = z.discriminatedUnion("pricingType", [
  hourlySchema,
  perUnitSchema,
  perSqftSchema,
  perLinearFtSchema,
  basePlusRateSchema,
  tieredPackagesSchema,
  tieredRangesSchema,
  minChargePlusAddonsSchema,
  priceRangeOnlySchema,
  callForQuoteOnlySchema,
]);

export type PricingConfigV1 = z.infer<typeof pricingConfigV1Schema>;
export type AddOn = z.infer<typeof addOnSchema>;
export type DifficultyTier = z.infer<typeof difficultyTierSchema>;
export type TieredPackage = z.infer<typeof tieredPackageSchema>;
export type TieredRange = z.infer<typeof tieredRangeSchema>;

export const CALL_FOR_QUOTE_FALLBACK: PricingConfigV1 = {
  pricingType: "call_for_quote_only",
  message: "Request a quote",
};

export interface ValidationResult {
  valid: boolean;
  config: PricingConfigV1;
  errors: string[];
}

export function validatePricingConfig(config: unknown): ValidationResult {
  const result = pricingConfigV1Schema.safeParse(config);
  if (!result.success) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const data = result.data;
  if (data.pricingType === "price_range_only" && data.rangeMax < data.rangeMin) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: ["rangeMax must be >= rangeMin"],
    };
  }
  return { valid: true, config: data, errors: [] };
}

export const FAMILY_LABELS: Record<PricingType, string> = {
  hourly: "Hourly Rate",
  per_unit: "Per Unit",
  per_sqft: "Per Square Foot",
  per_linear_ft: "Per Linear Foot",
  base_plus_rate: "Base Fee + Rate",
  tiered_packages: "Package Tiers",
  tiered_ranges: "Quantity-Based Tiers",
  min_charge_plus_addons: "Minimum Charge + Add-ons",
  price_range_only: "Price Range Only",
  call_for_quote_only: "Call for Quote",
};

export const FAMILY_DESCRIPTIONS: Record<PricingType, string> = {
  hourly: "Charge by the hour with optional fees and multipliers",
  per_unit: "Charge per item, room, fixture, or other unit",
  per_sqft: "Charge per square foot of area",
  per_linear_ft: "Charge per linear foot",
  base_plus_rate: "A flat base fee plus a per-unit rate",
  tiered_packages: "Offer fixed-price packages (Basic, Standard, Premium)",
  tiered_ranges: "Different prices based on quantity ranges",
  min_charge_plus_addons: "Minimum service charge with optional add-ons",
  price_range_only: "Show a price range estimate only",
  call_for_quote_only: "No pricing shown — just collect leads",
};
