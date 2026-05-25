/**
 * Wave W-BA-2 (Phase 3b §4) — model-selection dial for per-client AI spend.
 *
 * Three bands per client, derived from `client_variable_costs.ai_cost_cents_month`
 * vs the per-client `default_budget_cents` (with a $10 soft-cap delta):
 *
 *   default  — spend < budget          → task-appropriate model
 *                                          (simple → cheap, complex → premium)
 *   soft_cap — budget ≤ spend < +$10   → task-appropriate but stricter
 *                                          (complex falls back to standard)
 *   over_cap — spend ≥ budget + $10    → ALWAYS cheapest capable model
 *
 * NEVER an off-switch. Service degrades, never stops. Fail-open: any error
 * falls back to the `default` band so a metering failure doesn't throttle
 * anyone.
 *
 * The selector is wired into `aiService.ts` via the `clientId` +
 * `taskComplexity` options — callers that don't set them get the legacy
 * model picked by env / `CLAUDE_MODEL`.
 */
import { db } from "../db";
import { eq } from "drizzle-orm";
import { clientVariableCosts } from "@shared/schema";
import {
  DEFAULT_CLIENT_BUDGET_CENTS,
  getClientVariableCosts,
} from "./clientVariableCosts";
import { cheapestModelInTier } from "./aiModelPricingTable";
import { createLogger } from "../lib/logger";

const log = createLogger("AiBudgetRouter");

/** Founder-accepted soft-cap overage on top of the per-client default budget. */
export const SOFT_CAP_DELTA_CENTS = 1000; // $10

export type BudgetBand = "default" | "soft_cap" | "over_cap";
export type TaskComplexity = "simple" | "standard" | "complex";

export interface SelectModelResult {
  model: string;
  band: BudgetBand;
  /** Spend in cents this month. 0 when no row exists yet. */
  spendCents: number;
  /** Per-client budget in cents. */
  budgetCents: number;
}

/** Fallback model when the pricing table is empty (test envs). */
const FALLBACK_MODELS: Record<TaskComplexity, string> = {
  simple: "claude-haiku-4-5",
  standard: "claude-sonnet-4-6",
  // Cost: demoted from Opus → Sonnet (~75× Haiku); admin tools don't need Opus.
  complex: "claude-sonnet-4-6",
};

/**
 * Choose a model for one AI call. Three steps:
 *   1. Read the client's current-month AI spend and budget.
 *   2. Classify the band.
 *   3. Pick the cheapest active model in the tier that band+complexity allow.
 */
export async function selectModelForTask(opts: {
  clientId: number;
  taskComplexity: TaskComplexity;
  surface: string;
}): Promise<SelectModelResult> {
  let spendCents = 0;
  let budgetCents = DEFAULT_CLIENT_BUDGET_CENTS;
  try {
    const row = await getClientVariableCosts(opts.clientId);
    if (row) {
      spendCents = row.ai_cost_cents_month;
      budgetCents = row.default_budget_cents;
    }
  } catch (err) {
    log.warn("selectModelForTask: ledger read failed — defaulting band", {
      clientId: opts.clientId,
      error: String(err),
    });
  }

  const band = classifyBand(spendCents, budgetCents);
  const tier = pickTier(band, opts.taskComplexity);
  let model = await cheapestModelInTier(tier);
  if (!model) model = FALLBACK_MODELS[opts.taskComplexity] ?? FALLBACK_MODELS.standard;

  return { model, band, spendCents, budgetCents };
}

/** Pure band classification. */
export function classifyBand(spendCents: number, budgetCents: number): BudgetBand {
  const softCapCents = budgetCents + SOFT_CAP_DELTA_CENTS;
  if (spendCents >= softCapCents) return "over_cap";
  if (spendCents >= budgetCents) return "soft_cap";
  return "default";
}

/** Map (band, complexity) → pricing tier. */
export function pickTier(
  band: BudgetBand,
  complexity: TaskComplexity,
): "cheap" | "standard" | "premium" {
  if (band === "over_cap") return "cheap";
  if (band === "soft_cap") {
    // Complex tasks demote one notch (premium → standard) but cheap stays cheap.
    if (complexity === "complex") return "standard";
    if (complexity === "standard") return "standard";
    return "cheap";
  }
  // default band — task-appropriate
  if (complexity === "complex") return "premium";
  if (complexity === "standard") return "standard";
  return "cheap";
}

/** Bypass helper for tests: read the per-client AI budget without inserting a row. */
export async function readClientBudgetCents(clientId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ b: clientVariableCosts.default_budget_cents })
      .from(clientVariableCosts)
      .where(eq(clientVariableCosts.client_id, clientId))
      .limit(1);
    return row?.b ?? DEFAULT_CLIENT_BUDGET_CENTS;
  } catch {
    return DEFAULT_CLIENT_BUDGET_CENTS;
  }
}
