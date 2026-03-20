import { z } from "zod";

/* ─── Stage 1: Pricing Intake ─── */

export const customTradeDataSchema = z.object({
  charge_method: z.enum(['per_hour', 'per_sqft', 'per_linear_ft', 'per_item', 'fixed_project', 'base_plus_variable', 'not_sure']).default('not_sure'),
  has_minimum_charge: z.boolean().default(false),
  minimum_charge_amount: z.number().optional(),
  has_trip_fee: z.boolean().default(false),
  trip_fee_amount: z.number().optional(),
  offers_packages: z.boolean().default(false),
  price_factors: z.array(z.string()).default([]),
  price_factors_other: z.string().optional(),
  price_range_min: z.number().optional(),
  price_range_max: z.number().optional(),
  output_preference: z.enum(['exact_price', 'price_range', 'call_for_quote']).default('exact_price'),
  short_description: z.string().optional(),
});

export type CustomTradeData = z.infer<typeof customTradeDataSchema>;

/* ─── Stage 2: Detailed Pricing Data ─── */

export const stage2DataSchema = z.object({
  hourly_rate: z.number().optional(),
  crew_size: z.number().optional(),
  min_hours: z.number().optional(),
  max_hours: z.number().optional(),

  sqft_rate: z.number().optional(),
  materials_included: z.boolean().optional(),
  setup_fee: z.number().optional(),

  unit_name: z.string().optional(),
  unit_rate: z.number().optional(),
  base_fee: z.number().optional(),

  packages: z.array(z.object({
    label: z.string(),
    price: z.number(),
  })).optional(),

  materials_markup_pct: z.number().optional(),
  materials_markup_custom: z.boolean().optional(),

  distance_mode: z.enum(['multiplier', 'flat']).optional(),
  distance_value: z.number().optional(),

  difficulty_tiers: z.array(z.object({
    label: z.string(),
    multiplier: z.number(),
  })).optional(),

  after_hours_multiplier: z.number().optional(),
});

export type Stage2Data = z.infer<typeof stage2DataSchema>;

/* ─── Sample Quotes ─── */

export const sampleQuoteSchema = z.object({
  label: z.enum(['small', 'typical', 'big']),
  inputs: z.object({
    qty: z.number().min(0),
    notes_optional: z.string().optional(),
  }),
  final_price: z.number().min(0),
});

export type SampleQuote = z.infer<typeof sampleQuoteSchema>;

/* ─── Combined Pricing Intake ─── */

export const pricingIntakeSchema = z.object({
  version: z.literal(1).default(1),
  stage1: customTradeDataSchema,
  stage2: stage2DataSchema.default({}),
  sample_quotes: z.array(sampleQuoteSchema).max(3).optional(),
});

export type PricingIntake = z.infer<typeof pricingIntakeSchema>;

/* ─── AI Draft Request / Response ─── */

export const aiDraftRequestSchema = z.object({
  pricing_intake: pricingIntakeSchema,
  sample_quotes: z.array(sampleQuoteSchema).max(3).optional(),
  constraints: z.object({
    allowed_pricing_types: z.array(z.string()),
    allowed_ops: z.array(z.string()),
    no_other_math: z.literal(true),
  }),
});

export type AIDraftRequest = z.infer<typeof aiDraftRequestSchema>;

export const aiDraftResponseSchema = z.object({
  pricing_config: z.record(z.any()),
  confidence_score: z.number().min(0).max(100),
  assumptions: z.array(z.string()).max(12),
  needs_human_review: z.boolean(),
});

export type AIDraftResponse = z.infer<typeof aiDraftResponseSchema>;

/* ─── Pricing Draft ─── */

export const pricingDraftSchema = z.object({
  pricing_config: z.record(z.any()),
  assumptions: z.array(z.string()).default([]),
  confidence_score: z.number().default(50),
  needs_human_review: z.boolean().default(true),
  status: z.enum(['pending', 'generating', 'ready', 'failed']).default('pending'),
  pricing_audit: z.object({
    source: z.string().optional(),
    derivation_attempted: z.boolean().optional(),
    derivation_result: z.record(z.any()).optional(),
    timestamp: z.number().optional(),
  }).optional(),
}).optional();

export type PricingDraft = z.infer<typeof pricingDraftSchema>;

export const pricingDraftJobSchema = z.object({
  job_id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  result: pricingDraftSchema.unwrap().optional(),
  error: z.string().optional(),
  created_at: z.number(),
});

export type PricingDraftJob = z.infer<typeof pricingDraftJobSchema>;

/* ─── Pricing Audit Log ─── */

export const pricingAuditLogSchema = z.object({
  pricing_intake: pricingIntakeSchema.optional(),
  sample_quotes: z.array(sampleQuoteSchema).optional(),
  ai_raw_output: z.record(z.any()).optional(),
  ai_validated_output: z.record(z.any()).optional(),
  derivation_attempted: z.boolean().optional(),
  derivation_result: z.record(z.any()).optional(),
  final_config: z.record(z.any()).optional(),
  source: z.enum(['deterministic', 'derivation', 'ai', 'fallback']).optional(),
  timestamp: z.number().optional(),
});

export type PricingAuditLog = z.infer<typeof pricingAuditLogSchema>;
