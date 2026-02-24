import OpenAI from "openai";
import { type PricingIntake, type SampleQuote, type AIDraftResponse, aiDraftResponseSchema, type PricingAuditLog } from "@shared/schema";
import { PRICING_TYPES, type PricingType, type PricingConfigV1, validatePricingConfig, CALL_FOR_QUOTE_FALLBACK, FAMILY_LABELS, FAMILY_DESCRIPTIONS } from "@shared/pricingConfig";

const ALLOWED_PRICING_TYPES = [...PRICING_TYPES] as string[];

const ALLOWED_OPS = [
  "base_plus_rate",
  "min_charge",
  "multipliers",
  "addons_fixed",
  "addons_pct",
  "tiers",
] as const;

const ALLOWED_CONFIG_FIELDS = new Set([
  "pricingType",
  "unitName",
  "rate",
  "baseFee",
  "minCharge",
  "travelFee",
  "afterHoursMult",
  "difficultyTiers",
  "addOns",
  "callUsThreshold",
  "tierMode",
  "tiers",
  "rangeMin",
  "rangeMax",
  "message",
]);

export function buildConstraints() {
  return {
    allowed_pricing_types: ALLOWED_PRICING_TYPES,
    allowed_ops: [...ALLOWED_OPS],
    no_other_math: true as const,
  };
}

export function buildPayload(intake: PricingIntake, sampleQuotes?: SampleQuote[]) {
  return {
    pricing_intake: {
      version: intake.version,
      stage1: intake.stage1,
      stage2: intake.stage2,
    },
    sample_quotes: sampleQuotes && sampleQuotes.length > 0 ? sampleQuotes : undefined,
    constraints: buildConstraints(),
  };
}

const FEW_SHOT_EXAMPLES = [
  {
    input: "Hourly plumber, $85/hr, 2-person crew, trip fee $50, after-hours 1.5x",
    output: {
      pricing_config: { pricingType: "hourly", unitName: "hour", rate: 85, travelFee: 50, afterHoursMult: 1.5 },
      confidence_score: 85,
      assumptions: ["Rate based on provided $85/hr", "Trip fee $50 as stated"],
      needs_human_review: false,
    },
  },
  {
    input: "Carpet cleaning per sq ft, $0.25/sqft, min charge $150, setup fee $40",
    output: {
      pricing_config: { pricingType: "per_sqft", unitName: "sq ft", rate: 0.25, minCharge: 150, baseFee: 40 },
      confidence_score: 90,
      assumptions: ["Rate from provided $0.25/sqft", "Min charge $150 as stated"],
      needs_human_review: false,
    },
  },
  {
    input: "Landscaping with 3 tiers: Basic $200, Standard $450, Premium $800",
    output: {
      pricing_config: { pricingType: "tiered_packages", tierMode: "fixed", tiers: [{ label: "Basic", price: 200 }, { label: "Standard", price: 450 }, { label: "Premium", price: 800 }] },
      confidence_score: 95,
      assumptions: ["Packages directly from user input"],
      needs_human_review: false,
    },
  },
  {
    input: "Painting per room, base $150 + $50/room, materials markup 15%",
    output: {
      pricing_config: { pricingType: "base_plus_rate", unitName: "room", baseFee: 150, rate: 50, addOns: [{ id: "materials", label: "Materials Markup", type: "pct", amount: 15 }] },
      confidence_score: 88,
      assumptions: ["Base fee $150 as stated", "Per-room rate $50 as stated"],
      needs_human_review: false,
    },
  },
  {
    input: "Unknown trade, no rates provided, range $200-$1000",
    output: {
      pricing_config: { pricingType: "price_range_only", rangeMin: 200, rangeMax: 1000 },
      confidence_score: 40,
      assumptions: ["No specific rates available", "Using provided price range"],
      needs_human_review: true,
    },
  },
];

export function buildSystemPrompt(): string {
  const familyList = PRICING_TYPES.map(t => `- "${t}": ${FAMILY_LABELS[t]} — ${FAMILY_DESCRIPTIONS[t]}`).join("\n");

  const examplesBlock = FEW_SHOT_EXAMPLES.map((ex, i) =>
    `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${JSON.stringify(ex.output)}`
  ).join("\n\n");

  return `You are a constrained pricing configuration composer. You receive structured pricing intake data and output a strict JSON pricing configuration.

CRITICAL RULES:
1. You MUST output ONLY valid JSON matching this exact structure:
{
  "pricing_config": { <PricingConfigV1 matching one allowed family> },
  "confidence_score": <0-100>,
  "assumptions": [<max 12 short strings>],
  "needs_human_review": <true|false>
}

2. ALLOWED pricing families (choose exactly ONE):
${familyList}

3. ALLOWED fields in pricing_config (NO other fields permitted):
pricingType, unitName, rate, baseFee, minCharge, travelFee, afterHoursMult, difficultyTiers, addOns, callUsThreshold, tierMode, tiers, rangeMin, rangeMax, message

4. ALLOWED operations only:
- base_plus_rate: baseFee + rate * quantity
- min_charge: enforce minimum
- multipliers: afterHoursMult, difficultyTiers
- addons_fixed: flat fee add-ons
- addons_pct: percentage add-ons
- tiers: tiered_packages or tiered_ranges
NO custom formulas, NO equation strings, NO polynomial math.

5. CONFIDENCE RULES:
- If you are uncertain about rates (no sample_quotes, vague intake): confidence_score < 60, use "price_range_only" or "call_for_quote_only", set needs_human_review=true
- If rates are directly stated in intake: confidence_score 80+, use the matching family
- If derived from sample_quotes: confidence_score 60-80 depending on fit quality

6. DO NOT invent numeric values unless:
- Directly stated in the pricing intake data
- Derivable from sample_quotes via simple division (rate = price_diff / qty_diff)
If you cannot determine a rate, use price_range_only or call_for_quote_only.

7. Schema rules:
- addOns: [{id: string, label: string, type: "fixed"|"pct", amount: number >= 0}]
- difficultyTiers: [{id: string, label: string, multiplier: number >= 1}]
- tiers (packages): [{label: string, price: number >= 0}]
- tiers (ranges): [{min: number, max: number|null, price: number >= 0}]
- afterHoursMult >= 1
- All prices/rates >= 0

${examplesBlock}

Return ONLY the JSON object. No prose, no markdown, no explanation outside the JSON.`;
}

export function deriveFromSampleQuotes(
  quotes: SampleQuote[],
  intake: PricingIntake
): { success: boolean; config?: PricingConfigV1; source: string } {
  if (!quotes || quotes.length < 2) {
    return { success: false, source: "insufficient_quotes" };
  }

  const sorted = [...quotes].sort((a, b) => a.inputs.qty - b.inputs.qty);
  const small = sorted[0];
  const big = sorted[sorted.length - 1];

  const qtyDiff = big.inputs.qty - small.inputs.qty;
  const priceDiff = big.final_price - small.final_price;

  if (qtyDiff <= 0) {
    return { success: false, source: "no_qty_variation" };
  }

  const rate = priceDiff / qtyDiff;

  if (rate < 0) {
    return { success: false, source: "negative_rate" };
  }

  const baseFee = small.final_price - rate * small.inputs.qty;

  const chargeMethod = intake.stage1.charge_method;

  if (rate === 0 && baseFee > 0) {
    const validation = validatePricingConfig({
      pricingType: "price_range_only",
      rangeMin: Math.min(...quotes.map(q => q.final_price)),
      rangeMax: Math.max(...quotes.map(q => q.final_price)),
    });
    if (validation.valid) {
      return { success: true, config: validation.config, source: "derivation_range" };
    }
    return { success: false, source: "derivation_invalid" };
  }

  if (baseFee < 0) {
    const adjustedRate = small.final_price / small.inputs.qty;
    if (adjustedRate <= 0) {
      return { success: false, source: "negative_base_negative_rate" };
    }

    const unitName = getUnitName(chargeMethod, intake.stage2);
    const pricingType = getPricingType(chargeMethod);

    if (pricingType && unitName) {
      const validation = validatePricingConfig({
        pricingType,
        unitName,
        rate: Math.round(adjustedRate * 100) / 100,
        ...(intake.stage1.has_minimum_charge && intake.stage1.minimum_charge_amount
          ? { minCharge: intake.stage1.minimum_charge_amount } : {}),
        ...(intake.stage1.has_trip_fee && intake.stage1.trip_fee_amount
          ? { travelFee: intake.stage1.trip_fee_amount } : {}),
      });
      if (validation.valid) {
        return { success: true, config: validation.config, source: "derivation_rate_only" };
      }
    }
    return { success: false, source: "derivation_invalid" };
  }

  if (baseFee > 0 && rate > 0) {
    const unitName = getUnitName(chargeMethod, intake.stage2);
    const validation = validatePricingConfig({
      pricingType: "base_plus_rate",
      unitName: unitName || "unit",
      baseFee: Math.round(baseFee * 100) / 100,
      rate: Math.round(rate * 100) / 100,
      ...(intake.stage1.has_minimum_charge && intake.stage1.minimum_charge_amount
        ? { minCharge: intake.stage1.minimum_charge_amount } : {}),
      ...(intake.stage1.has_trip_fee && intake.stage1.trip_fee_amount
        ? { travelFee: intake.stage1.trip_fee_amount } : {}),
    });
    if (validation.valid) {
      return { success: true, config: validation.config, source: "derivation_base_plus_rate" };
    }
    return { success: false, source: "derivation_invalid" };
  }

  const unitName = getUnitName(chargeMethod, intake.stage2);
  const pricingType = getPricingType(chargeMethod);

  if (pricingType && unitName) {
    const validation = validatePricingConfig({
      pricingType,
      unitName,
      rate: Math.round(rate * 100) / 100,
      ...(intake.stage1.has_minimum_charge && intake.stage1.minimum_charge_amount
        ? { minCharge: intake.stage1.minimum_charge_amount } : {}),
      ...(intake.stage1.has_trip_fee && intake.stage1.trip_fee_amount
        ? { travelFee: intake.stage1.trip_fee_amount } : {}),
    });
    if (validation.valid) {
      return { success: true, config: validation.config, source: "derivation_rate" };
    }
  }

  return { success: false, source: "derivation_no_match" };
}

function getPricingType(chargeMethod: string): PricingType | null {
  const map: Record<string, PricingType> = {
    per_hour: "hourly",
    per_sqft: "per_sqft",
    per_linear_ft: "per_linear_ft",
    per_item: "per_unit",
    base_plus_variable: "base_plus_rate",
  };
  return map[chargeMethod] || null;
}

function getUnitName(chargeMethod: string, stage2: PricingIntake["stage2"]): string | null {
  const map: Record<string, string> = {
    per_hour: "hour",
    per_sqft: "sq ft",
    per_linear_ft: "linear ft",
    per_item: stage2.unit_name || "unit",
    base_plus_variable: stage2.unit_name || "unit",
  };
  return map[chargeMethod] || null;
}

export function validateAIResponse(raw: unknown): {
  valid: boolean;
  response?: AIDraftResponse;
  config: PricingConfigV1;
  errors: string[];
} {
  const parsed = aiDraftResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const response = parsed.data;
  const pricingConfig = response.pricing_config;

  const unknownFields = Object.keys(pricingConfig).filter(k => !ALLOWED_CONFIG_FIELDS.has(k));
  if (unknownFields.length > 0) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: [`Unknown fields in pricing_config: ${unknownFields.join(", ")}`],
    };
  }

  if (!ALLOWED_PRICING_TYPES.includes(pricingConfig.pricingType)) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: [`Invalid pricingType: ${pricingConfig.pricingType}`],
    };
  }

  const validation = validatePricingConfig(pricingConfig);
  if (!validation.valid) {
    return {
      valid: false,
      config: CALL_FOR_QUOTE_FALLBACK,
      errors: validation.errors,
    };
  }

  if (response.confidence_score < 60) {
    const conservativeTypes: PricingType[] = ["price_range_only", "call_for_quote_only"];
    if (!conservativeTypes.includes(validation.config.pricingType)) {
      return {
        valid: false,
        response,
        config: CALL_FOR_QUOTE_FALLBACK,
        errors: [`Low confidence (${response.confidence_score}) requires price_range_only or call_for_quote_only, got ${validation.config.pricingType}`],
      };
    }
    response.needs_human_review = true;
  }

  return {
    valid: true,
    response: {
      ...response,
      assumptions: response.assumptions.slice(0, 12),
    },
    config: validation.config,
    errors: [],
  };
}

export async function generatePricingConfigDraft(
  intake: PricingIntake,
  sampleQuotes?: SampleQuote[],
  openaiClient?: OpenAI
): Promise<{
  config: PricingConfigV1;
  confidence_score: number;
  assumptions: string[];
  needs_human_review: boolean;
  audit: PricingAuditLog;
}> {
  const audit: PricingAuditLog = {
    pricing_intake: intake,
    sample_quotes: sampleQuotes,
    derivation_attempted: false,
    timestamp: Date.now(),
  };

  if (sampleQuotes && sampleQuotes.length >= 2) {
    audit.derivation_attempted = true;
    const derivation = deriveFromSampleQuotes(sampleQuotes, intake);
    audit.derivation_result = { success: derivation.success, source: derivation.source };

    if (derivation.success && derivation.config) {
      audit.final_config = derivation.config as Record<string, unknown>;
      audit.source = "derivation";
      return {
        config: derivation.config,
        confidence_score: 75,
        assumptions: ["Pricing derived from your sample job prices using simple rate calculation"],
        needs_human_review: true,
        audit,
      };
    }
  }

  if (!openaiClient) {
    const fallbackConfig = buildFallbackConfig(intake);
    audit.final_config = fallbackConfig as Record<string, unknown>;
    audit.source = "fallback";
    return {
      config: fallbackConfig,
      confidence_score: 30,
      assumptions: ["No AI available, using conservative fallback"],
      needs_human_review: true,
      audit,
    };
  }

  try {
    const payload = buildPayload(intake, sampleQuotes);
    const userMessage = `Structured pricing intake:\n${JSON.stringify(payload, null, 2)}`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(content);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    audit.ai_raw_output = rawOutput as Record<string, unknown>;

    const validated = validateAIResponse(rawOutput);
    audit.ai_validated_output = validated.config as Record<string, unknown>;

    if (!validated.valid) {
      console.warn("AI response failed validation:", validated.errors);
      const fallbackConfig = buildFallbackConfig(intake);
      audit.final_config = fallbackConfig as Record<string, unknown>;
      audit.source = "fallback";
      return {
        config: fallbackConfig,
        confidence_score: 25,
        assumptions: ["AI output failed validation, using conservative fallback", ...validated.errors.slice(0, 3)],
        needs_human_review: true,
        audit,
      };
    }

    audit.final_config = validated.config as Record<string, unknown>;
    audit.source = "ai";
    return {
      config: validated.config,
      confidence_score: validated.response!.confidence_score,
      assumptions: validated.response!.assumptions,
      needs_human_review: validated.response!.needs_human_review,
      audit,
    };
  } catch (error: any) {
    console.error("AI pricing generation error:", error?.message || error);
    const fallbackConfig = buildFallbackConfig(intake);
    audit.final_config = fallbackConfig as Record<string, unknown>;
    audit.source = "fallback";
    return {
      config: fallbackConfig,
      confidence_score: 20,
      assumptions: ["AI generation failed, using conservative fallback"],
      needs_human_review: true,
      audit,
    };
  }
}

function buildFallbackConfig(intake: PricingIntake): PricingConfigV1 {
  if (intake.stage1.price_range_min != null && intake.stage1.price_range_max != null) {
    const validation = validatePricingConfig({
      pricingType: "price_range_only",
      rangeMin: intake.stage1.price_range_min,
      rangeMax: Math.max(intake.stage1.price_range_max, intake.stage1.price_range_min),
    });
    if (validation.valid) return validation.config;
  }
  return CALL_FOR_QUOTE_FALLBACK;
}
