/**
 * Server-side recompute of a submitted `quote_amount`.
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 * POST /api/leads accepted `quote_amount` straight from the browser with no
 * server-side check, so the stored price was whatever the client said it was.
 * Anyone could post a fabricated number and it became the tradesperson's lead
 * value, their dashboard revenue, and the figure in their CRM webhook.
 *
 * ── WHAT THIS MODULE WILL AND WILL NOT DO ───────────────────────────────────
 * It recomputes ONLY where it can do so FAITHFULLY. That distinction is the
 * whole design, because a recompute that is merely approximate is worse than
 * no recompute at all: it would overwrite correct customer quotes with wrong
 * ones. Two engines exist behind the widget and they are not equal:
 *
 *   SIMPLE path (`pricing_config` → calculateEstimate) — REPRODUCIBLE.
 *     The widget's number is a pure function of the stored pricing_config, the
 *     stored template/flow, and the submitted `answers`. All three are on the
 *     server. `rebuildEstimateInputs` below is lifted verbatim from the widget
 *     (WidgetContext.tsx) and is now imported BY the widget, so the two can
 *     never drift apart. This path is recomputed and enforced.
 *
 *   ADVANCED path (`calculator_settings.advanced` → formulaEngine) — NOT
 *     REPRODUCIBLE TODAY, and deliberately skipped. The widget converts each
 *     raw answer through `rawFieldValue()` before it reaches the formula
 *     context: a `select` answer is an option ID that maps to that option's
 *     numeric `value`, `multi_select` maps an ID array to a value array,
 *     `address_distance` applies a miles→km conversion and an optional
 *     round-trip doubling, `rate_matrix` resolves a cell through
 *     `resolveMatrixRate()`. All of that lives in client-only modules. A
 *     server recompute without it would feed raw ID strings to the engine,
 *     where `toNum("opt_3")` is 0 — every select-driven term would silently
 *     become ZERO and we would overwrite a correct quote with a fabricated
 *     low one. Field VISIBILITY and the Good/Better/Best tier multiplier are
 *     likewise client-side, and `selectedTierIndex` is never even posted.
 *
 *     (The pre-existing `computeFromAdvanced()` in apiV1/submissionsRoutes.ts
 *     has exactly this defect. It is not reused here.)
 *
 * Making the advanced path enforceable is a follow-up: post the resolved
 * formula context (or `selected_tier_index` + lifted `rawFieldValue` /
 * `emptyFieldValue` / `isFieldVisible` / `resolveMatrixRate`) and then this
 * module gains a second engine. Until then it reports `skipped_advanced` and
 * the client value stands — honestly labelled rather than falsely "verified".
 */
import { validatePricingConfig, CALL_FOR_QUOTE_FALLBACK } from "./pricingConfig";
import { calculateEstimate, type EstimateInputs } from "./calculateEstimate";
import { buildWidgetFlow, type FlowBuilderSettings } from "./widgetFlowBuilder";
import { getTemplateById } from "./templateLibrary";
import type { WizardFlow } from "./wizardSchema";

export type WidgetAnswerValue = string | number | boolean | string[];
export type WidgetAnswers = Record<string, WidgetAnswerValue>;

/**
 * Rebuild `EstimateInputs` by replaying submitted answers against the flow's
 * question definitions and their `maps_to` bindings.
 *
 * MOVED HERE from client/src/components/quote-widget/WidgetContext.tsx so the
 * server can reproduce the widget's own number. The widget imports this same
 * function — there is exactly one implementation, by design. Pure, no React.
 */
export function rebuildEstimateInputs(
  flow: WizardFlow,
  answers: WidgetAnswers,
): Required<Pick<EstimateInputs, "quantity" | "selectedTierIndex" | "selectedAddOnIds" | "selectedDifficultyId" | "isAfterHours">> {
  const inputs = {
    quantity: 1,
    selectedTierIndex: 0,
    selectedAddOnIds: [] as string[],
    selectedDifficultyId: '',
    isAfterHours: false,
  };
  for (const step of flow.steps) {
    if (!Array.isArray(step.questions)) continue;
    for (const q of step.questions) {
      const val = answers[q.id];
      if (val !== undefined && q.maps_to) {
        switch (q.maps_to) {
          case 'quantity':
            inputs.quantity = typeof val === 'number' ? val : Number(val) || 1;
            break;
          case 'selected_tier_index':
            inputs.selectedTierIndex = typeof val === 'number' ? val : Number(val) || 0;
            break;
          case 'selected_add_on_ids':
            inputs.selectedAddOnIds = Array.isArray(val) ? val : [String(val)];
            break;
          case 'selected_difficulty_id':
            inputs.selectedDifficultyId = String(val);
            break;
          case 'is_after_hours':
            inputs.isAfterHours = Boolean(val);
            break;
        }
      }
    }
  }
  return inputs;
}

/**
 * Rebuild the widget's WizardFlow from stored calculator state.
 * Mirrors QuoteWidget.tsx's `config` memo exactly — if that changes, this
 * must change with it or the recompute silently starts reading the wrong
 * `maps_to` bindings.
 */
export function rebuildWidgetFlow(
  pricingConfig: ReturnType<typeof validatePricingConfig>["config"],
  calculatorSettings: any,
): WizardFlow {
  const calcSettings = (calculatorSettings || {}) as Record<string, any>;
  const templateId: string = calcSettings.ui_template?.template_id || 'classic_single';
  const template = getTemplateById(templateId) || getTemplateById('classic_single')!;

  const bookingSettings = calcSettings.booking_settings || {};
  const appearance = calcSettings.appearance || {};
  const schedulingEnabled = !!(appearance.scheduling_enabled || appearance.scheduling?.enabled);

  const flowSettings: FlowBuilderSettings = {
    calculatorType: calcSettings.calculator_type,
    bookingEnabled:
      calcSettings.calculator_type === 'estimate_plus_booking' &&
      bookingSettings.enabled === true,
    schedulingEnabled,
    leadForm: calcSettings.lead_form,
    action: calcSettings.action,
    promotionsEnabled: calcSettings.promotions?.enabled === true,
    quoteRules: calcSettings.quote_rules,
    serviceTypes: calcSettings.serviceTypes,
    tradeInputs: calcSettings.trade_inputs,
    fieldOverrides: calcSettings.field_overrides,
    deposit: appearance.deposit,
  };
  return buildWidgetFlow(pricingConfig, template, flowSettings);
}

export type RecomputeStatus =
  /** Recomputed and the client agreed. */
  | "verified"
  /** Recomputed and the client DISAGREED — the server value is authoritative. */
  | "corrected"
  /** No amount was submitted (call-for-quote, AI handoff, suppressed quote). */
  | "skipped_no_amount"
  /** Advanced formula engine — not faithfully reproducible server-side yet. */
  | "skipped_advanced"
  /** Priced by an external surface (the roof/solar visualiser). */
  | "skipped_external"
  /** The config itself declines to quote, so there is nothing to check against. */
  | "skipped_no_price"
  /** The recompute could not run (invalid config, unexpected error). */
  | "unavailable";

export interface RecomputeResult {
  status: RecomputeStatus;
  /** Short machine-ish explanation, safe for logs. */
  reason: string;
  /** What the browser submitted. */
  clientAmount: number | null;
  /** What the server computed, when it could. */
  serverAmount: number | null;
  /** The value the caller should PERSIST. */
  storedAmount: number | null;
  /** True only when both numbers exist and differ beyond tolerance. */
  mismatch: boolean;
  /** serverAmount - clientAmount, when both exist. */
  delta: number | null;
}

/**
 * Cents-level tolerance. Client and server run the identical pure function on
 * identical inputs, so a real divergence is never sub-cent — anything larger
 * is a genuine disagreement worth recording, not float dust.
 */
export const RECOMPUTE_TOLERANCE = 0.01;

export interface RecomputeInput {
  pricingConfig: unknown;
  calculatorSettings: unknown;
  answers: unknown;
  submittedAmount: number | null;
}

/**
 * Decide what `quote_amount` should actually be stored for a submission.
 *
 * Never throws — a recompute failure degrades to `unavailable` and keeps the
 * client value, because losing a real lead is worse than storing an
 * unverified price.
 */
export function recomputeQuoteAmount(input: RecomputeInput): RecomputeResult {
  const clientAmount =
    typeof input.submittedAmount === "number" && Number.isFinite(input.submittedAmount)
      ? input.submittedAmount
      : null;

  const base = {
    clientAmount,
    serverAmount: null,
    storedAmount: clientAmount,
    mismatch: false,
    delta: null,
  } as const;

  try {
    const settings = (input.calculatorSettings || {}) as any;
    const answers = (input.answers && typeof input.answers === "object" && !Array.isArray(input.answers)
      ? input.answers
      : {}) as WidgetAnswers;

    // Nothing was quoted — a call-for-quote lead, an AI-chat handoff, or a
    // quote the widget deliberately suppressed (out of service area, custom
    // matrix cell). There is no number to verify and none to invent.
    if (clientAmount === null) {
      return { ...base, status: "skipped_no_amount", reason: "no quote_amount submitted" };
    }

    // Priced inside the roof/solar 3D visualiser, whose maths lives in a
    // browser bundle the server does not run.
    if ((answers as any).source === "roof_visualizer") {
      return { ...base, status: "skipped_external", reason: "priced by the roof visualiser" };
    }

    // Advanced formula engine — see the header. Not reproducible faithfully.
    if (settings.advanced?.enabled === true) {
      return { ...base, status: "skipped_advanced", reason: "advanced formula builder" };
    }

    const validation = validatePricingConfig(input.pricingConfig ?? CALL_FOR_QUOTE_FALLBACK);
    const pricingConfig = validation.config;

    const flow = rebuildWidgetFlow(pricingConfig, settings);
    const estimateInputs = rebuildEstimateInputs(flow, answers);
    const estimate = calculateEstimate(pricingConfig, estimateInputs);

    /* The configuration declines to price this job (call_for_quote, or an
     * invalid config that fell back to it). Recomputing would yield 0, and
     * writing that 0 over a real submitted number would DESTROY the quote —
     * exactly the failure mode this module exists to avoid. Keep the client
     * value and label it unverified. */
    if (estimate.type === "call_for_quote") {
      return {
        ...base,
        status: "skipped_no_price",
        reason: validation.valid
          ? "pricing config declines to quote"
          : `invalid pricing config: ${validation.errors.slice(0, 2).join("; ")}`,
      };
    }

    const serverAmount = estimate.total;
    if (!Number.isFinite(serverAmount)) {
      return { ...base, status: "unavailable", reason: "recompute produced a non-finite total" };
    }

    const delta = Math.round((serverAmount - clientAmount) * 100) / 100;
    const mismatch = Math.abs(delta) > RECOMPUTE_TOLERANCE;

    return {
      status: mismatch ? "corrected" : "verified",
      reason: mismatch ? "client amount disagreed with the server recompute" : "client amount verified",
      clientAmount,
      serverAmount,
      // The server number is authoritative on this path — it is derived from
      // the owner's own stored pricing config, not from the browser.
      storedAmount: serverAmount,
      mismatch,
      delta,
    };
  } catch (err) {
    return {
      ...base,
      status: "unavailable",
      reason: `recompute threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
