import { z } from "zod";

/**
 * Wizard Step Schema
 *
 * This module defines the schema for wizard flows — the missing architectural
 * layer between the pricing engine and the UI. A WizardFlow is a JSON-serializable
 * definition of steps, questions, and navigation logic that can be:
 *
 * 1. Stored as part of a calculator's config
 * 2. Generated from a template for a given trade
 * 3. Edited by the builder product
 * 4. Rendered by a generic step renderer (no hardcoded JSX per step)
 *
 * Design principles:
 * - Schema-driven: UI renders from data, not code
 * - Composable: steps and questions are independent units
 * - Extensible: new question types added without touching renderer logic
 * - Serializable: entire flow is JSON, storable in JSONB
 */

/* ─── Question Types ─── */

export const QUESTION_TYPES = [
  "slider",
  "select",
  "toggle",
  "package_card",
  "text_input",
  "number_input",
  "checkbox_group",
  "radio_group",
  "info_display",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/* ─── Validation Rules ─── */

export const validationRuleSchema = z.object({
  type: z.enum(["required", "min", "max", "min_length", "max_length", "pattern"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
  message: z.string().optional(),
});

export type ValidationRule = z.infer<typeof validationRuleSchema>;

/* ─── Conditional Visibility ─── */

export const conditionOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "includes",
  "not_includes",
  "in",
  "not_in",
]);

export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const visibilityConditionSchema = z.object({
  field: z.string(),
  operator: conditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export type VisibilityCondition = z.infer<typeof visibilityConditionSchema>;

/* ─── Select / Radio Option ─── */

export const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  price_multiplier: z.number().optional(),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

/* ─── Package Card Option (Good / Better / Best) ─── */

export const packageOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  price: z.number(),
  features: z.array(z.string()).default([]),
  highlighted: z.boolean().default(false),
  badge: z.string().optional(),
});

export type PackageOption = z.infer<typeof packageOptionSchema>;

/* ─── Question Definition ─── */

export const questionDefinitionSchema = z.object({
  id: z.string(),
  type: z.enum(QUESTION_TYPES),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),

  // Slider config
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  unit_suffix: z.string().optional(),

  // Select / radio / checkbox options
  options: z.array(questionOptionSchema).optional(),

  // Package card options
  packages: z.array(packageOptionSchema).optional(),

  // Default value
  default_value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),

  // Validation
  validation: z.array(validationRuleSchema).default([]),

  // Conditional visibility
  visible_when: z.array(visibilityConditionSchema).optional(),

  // Maps this question's answer to a pricing engine input field
  maps_to: z.enum([
    "quantity",
    "selected_tier_index",
    "selected_add_on_ids",
    "selected_difficulty_id",
    "is_after_hours",
  ]).optional(),

  // Wave W-LAYOUT — how this question packs into a MultiQuestionStep.
  // "full"  : spans the full row (default; existing behavior)
  // "half"  : spans one of two columns; pairs with another half-width
  //           question if one is adjacent in the visible list, otherwise
  //           falls back to full-width on its own row. Mobile (<360px)
  //           always collapses to full.
  // Optional (not `.default()`) so existing literal-typed question
  // objects across the codebase don't have to be updated — the renderer
  // treats missing as 'full'.
  width: z.enum(["full", "half"]).optional(),

  // Wave W-LAYOUT — how a multi-select/checkbox/radio question lays out
  // its options.
  //   "auto"   : inline (horizontal) when ≤4 options AND all labels short
  //              (≤14 chars); stacked otherwise. Default — surprises least.
  //   "inline" : force horizontal layout (wraps if it overflows).
  //   "stack"  : force vertical (the legacy default).
  // Optional for the same reason as `width` — renderer treats missing as 'auto'.
  options_layout: z.enum(["auto", "inline", "stack"]).optional(),
});

export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;

/* ─── Step Types ─── */

export const STEP_TYPES = [
  "question",
  "multi_question",
  "package_selection",
  "addon_selection",
  "info",
  "price_reveal",
  "lead_capture",
  "booking",
  "confirmation",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

/* ─── Step Help ─── */

export const stepHelpItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export type StepHelpItem = z.infer<typeof stepHelpItemSchema>;

export const stepHelpSchema = z.object({
  title: z.string().optional(),
  items: z.array(stepHelpItemSchema).min(1),
  cta: z.string().optional(),
});

export type StepHelp = z.infer<typeof stepHelpSchema>;

/* ─── Step Definition ─── */

export const stepDefinitionSchema = z.object({
  id: z.string(),
  type: z.enum(STEP_TYPES),
  title: z.string().optional(),
  subtitle: z.string().optional(),

  // Questions for this step (question / multi_question types)
  questions: z.array(questionDefinitionSchema).default([]),

  // Conditional visibility for the entire step
  visible_when: z.array(visibilityConditionSchema).optional(),

  // Optional contextual help (shown via help icon)
  help: stepHelpSchema.optional(),

  // Step-level config
  config: z.object({
    show_progress: z.boolean().default(true),
    can_skip: z.boolean().default(false),
    auto_advance: z.boolean().default(false),
  }).default({}),
});

export type StepDefinition = z.infer<typeof stepDefinitionSchema>;

/* ─── Wizard Flow (Top-Level Definition) ─── */

export const wizardFlowSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Ordered list of steps
  steps: z.array(stepDefinitionSchema).min(1),

  // Flow-level settings
  settings: z.object({
    progress_style: z.enum(["bar", "dots", "numbers", "hidden"]).default("bar"),
    allow_back_navigation: z.boolean().default(true),
    show_step_count: z.boolean().default(true),
    mobile_optimized: z.boolean().default(true),
  }).default({}),
});

export type WizardFlow = z.infer<typeof wizardFlowSchema>;
