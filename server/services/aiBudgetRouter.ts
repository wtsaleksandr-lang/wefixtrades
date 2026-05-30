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
import { and, eq, gte, sql } from "drizzle-orm";
import { clientVariableCosts, aiUsageLogs } from "@shared/schema";
import {
  DEFAULT_CLIENT_BUDGET_CENTS,
  getClientVariableCosts,
} from "./clientVariableCosts";
import { cheapestModelInTier } from "./aiModelPricingTable";
import { createLogger } from "../lib/logger";

const log = createLogger("AiBudgetRouter");

/** Founder-accepted soft-cap overage on top of the per-client default budget. */
export const SOFT_CAP_DELTA_CENTS = 1000; // $10

/**
 * Wave AI-1 — GLOBAL hard brake on autonomous Opus escalation.
 *
 * Month-to-date Opus spend (summed across ALL clients/surfaces from
 * ai_usage_logs) is checked before any escalation returns Opus. At or above
 * this ceiling, escalation is refused and the standard (Sonnet) model is used
 * instead. This is a money guard independent of any per-client budget band —
 * it caps total Opus exposure regardless of who triggers it.
 *
 * Conservative default: $50/month. Bump this single const to raise the cap.
 */
export const OPUS_MONTHLY_CEILING_CENTS = 5000; // $50.00

export type BudgetBand = "default" | "soft_cap" | "over_cap";
/** "expert" (Wave AI-1) is reachable ONLY via selectModelWithEscalation. */
export type TaskComplexity = "simple" | "standard" | "complex" | "expert";

/**
 * High-signal conditions that justify spending Opus money on ONE call.
 * Anything not in this set NEVER escalates — routine chat stays on Haiku/Sonnet.
 *   - "resolution":          error-resolution / troubleshooting / outage handling.
 *   - "retry_after_failure": a cheaper model already failed or returned
 *                            low-confidence on THIS task (one retry).
 */
export type EscalationSignal = "resolution" | "retry_after_failure";

export interface SelectModelResult {
  model: string;
  band: BudgetBand;
  /** Spend in cents this month. 0 when no row exists yet. */
  spendCents: number;
  /** Per-client budget in cents. */
  budgetCents: number;
  /** Wave AI-1 — true when this call escalated to the expert (Opus) tier. */
  escalated?: boolean;
  /** Wave AI-1 — why escalation was refused, when an escalation signal was
   *  present but did NOT result in Opus (ceiling hit, budget band, or no
   *  expert model available). undefined when no escalation was requested. */
  escalationBlockedReason?: "ceiling" | "over_cap" | "soft_cap" | "no_expert_model";
}

/** The standard (Sonnet) model used as the de-escalation fallback. */
const STANDARD_MODEL = "claude-sonnet-4-6";

/** Fallback model when the pricing table is empty (test envs). */
const FALLBACK_MODELS: Record<TaskComplexity, string> = {
  simple: "claude-haiku-4-5",
  standard: STANDARD_MODEL,
  // Cost: demoted from Opus → Sonnet (~75× Haiku); admin tools don't need Opus.
  complex: STANDARD_MODEL,
  // expert → Opus-4-8. Reached ONLY via selectModelWithEscalation, gated by
  // the global monthly ceiling. Direct selectModelForTask callers never get
  // here unless they explicitly pass complexity "expert".
  expert: "claude-opus-4-8",
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
  // MONEY GUARD: selectModelForTask is the legacy, ungated entry point. It must
  // NEVER reach the Opus expert tier — that path exists only through
  // selectModelWithEscalation, which enforces the global $50 monthly ceiling.
  // A direct "expert" complexity here is demoted to "complex" so it tops out at
  // premium (Sonnet today) instead of silently spending Opus money uncapped.
  const safeComplexity: TaskComplexity =
    opts.taskComplexity === "expert" ? "complex" : opts.taskComplexity;
  const tier = pickTier(band, safeComplexity);
  let model = await cheapestModelInTier(tier);
  if (!model) model = FALLBACK_MODELS[safeComplexity] ?? FALLBACK_MODELS.standard;

  return { model, band, spendCents, budgetCents };
}

/* ─── Wave AI-1: month-to-date GLOBAL Opus spend (cached ~60s) ───
 *
 * Sums ai_usage_logs.estimated_cost_usd (stored as micro-USD = USD ×
 * 1,000,000) for the current calendar month across EVERY client/surface where
 * the model id contains "opus". Converts the micro-USD sum to whole cents for
 * comparison against OPUS_MONTHLY_CEILING_CENTS.
 *
 * Cached for 60s so we don't issue one aggregate query per chat call. The
 * cache deliberately under-counts in-flight spend by up to 60s — acceptable
 * for a $50 ceiling, and the per-call escalation rate is bounded by the
 * high-signal gate anyway.
 */
const OPUS_MTD_CACHE_TTL_MS = 60_000;
let opusMtdCache: { at: number; cents: number } | null = null;

/** First day of the current calendar month at 00:00 local time. */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Read month-to-date GLOBAL Opus spend in CENTS. Fail-open: any DB error
 * returns 0 (treated as "no spend yet" → escalation allowed). We prefer a
 * rare over-spend on a metering outage to throttling every hard task because a
 * read failed — consistent with the rest of the budget router's fail-open
 * philosophy.
 */
export async function getMonthToDateOpusCents(): Promise<number> {
  if (opusMtdCache && Date.now() - opusMtdCache.at < OPUS_MTD_CACHE_TTL_MS) {
    return opusMtdCache.cents;
  }
  let cents = 0;
  try {
    const since = startOfCurrentMonth();
    const [row] = await db
      .select({
        // estimated_cost_usd is micro-USD (USD × 1,000,000). Sum then convert.
        microUsd: sql<string>`COALESCE(SUM(${aiUsageLogs.estimated_cost_usd}), 0)`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          gte(aiUsageLogs.created_at, since),
          sql`LOWER(${aiUsageLogs.model}) LIKE '%opus%'`,
        ),
      );
    const microUsd = Number(row?.microUsd) || 0;
    // micro-USD → cents: USD × 1,000,000 → cents = micro-USD / 10,000.
    cents = Math.round(microUsd / 10_000);
  } catch (err) {
    log.warn("getMonthToDateOpusCents: ledger read failed — treating as $0", {
      error: String(err),
    });
    cents = 0;
  }
  opusMtdCache = { at: Date.now(), cents };
  return cents;
}

/** Test/admin helper — drop the MTD-Opus cache so the next read re-queries. */
export function invalidateOpusMtdCache(): void {
  opusMtdCache = null;
}

/**
 * Wave AI-1 — autonomous "sharp-mind" model selection.
 *
 * Behaves EXACTLY like selectModelForTask unless a high-signal escalation
 * signal is present AND every guard passes. Decision order:
 *
 *   1. No escalationSignal → delegate to selectModelForTask (unchanged today).
 *   2. Per-client band check FIRST: over_cap → cheapest (escalation never
 *      overrides the per-client cap). soft_cap → no escalation (Sonnet).
 *   3. Global ceiling: if month-to-date Opus spend ≥ OPUS_MONTHLY_CEILING_CENTS,
 *      DO NOT escalate — fall back to standard (Sonnet) and log [opus-ceiling-hit].
 *   4. Resolve the expert (Opus) model. If none seeded, fall back to standard.
 *   5. Escalate: return Opus and log [opus-escalation] with running spend.
 *
 * Fail-open: any unexpected error escalation-side falls through to
 * selectModelForTask at the requested complexity → cheaper model, never a crash.
 */
export async function selectModelWithEscalation(opts: {
  clientId: number;
  taskComplexity: TaskComplexity;
  surface: string;
  /** High-signal trigger. Absent → no escalation, legacy behavior. */
  escalationSignal?: EscalationSignal;
}): Promise<SelectModelResult> {
  // No signal → identical to today. Never escalate routine work.
  if (!opts.escalationSignal) {
    return selectModelForTask(opts);
  }

  try {
    // Read the per-client band first so the per-client cap always wins.
    let spendCents = 0;
    let budgetCents = DEFAULT_CLIENT_BUDGET_CENTS;
    try {
      const row = await getClientVariableCosts(opts.clientId);
      if (row) {
        spendCents = row.ai_cost_cents_month;
        budgetCents = row.default_budget_cents;
      }
    } catch (err) {
      log.warn("selectModelWithEscalation: client ledger read failed — default band", {
        clientId: opts.clientId,
        error: String(err),
      });
    }
    const band = classifyBand(spendCents, budgetCents);

    // GUARD: over_cap forces cheapest — escalation NEVER overrides the cap.
    if (band === "over_cap") {
      const baseTier = pickTier(band, opts.taskComplexity);
      let model = await cheapestModelInTier(baseTier);
      if (!model) model = FALLBACK_MODELS[opts.taskComplexity] ?? STANDARD_MODEL;
      return { model, band, spendCents, budgetCents, escalated: false, escalationBlockedReason: "over_cap" };
    }

    // GUARD: soft_cap — under budget pressure, do not spend Opus money. Use
    // the standard (Sonnet) model. No log noise — this is expected throttling.
    if (band === "soft_cap") {
      return { model: STANDARD_MODEL, band, spendCents, budgetCents, escalated: false, escalationBlockedReason: "soft_cap" };
    }

    // GUARD: GLOBAL monthly Opus ceiling. Hard brake regardless of who triggered.
    const mtdOpusCents = await getMonthToDateOpusCents();
    if (mtdOpusCents >= OPUS_MONTHLY_CEILING_CENTS) {
      log.info("[opus-ceiling-hit]", {
        clientId: opts.clientId,
        surface: opts.surface,
        signal: opts.escalationSignal,
        mtdOpusCents,
        ceilingCents: OPUS_MONTHLY_CEILING_CENTS,
        fallbackModel: STANDARD_MODEL,
      });
      return { model: STANDARD_MODEL, band, spendCents, budgetCents, escalated: false, escalationBlockedReason: "ceiling" };
    }

    // Resolve the Opus expert-tier model.
    let model = await cheapestModelInTier("expert");
    if (!model) {
      // Expert row not seeded (pre-migration window / empty test DB). Fall
      // back to the static expert model id if present, else Sonnet.
      model = FALLBACK_MODELS.expert || STANDARD_MODEL;
    }
    // Defensive: if somehow we didn't land on an Opus model, do NOT log an
    // escalation — treat it as standard.
    if (!model.toLowerCase().includes("opus")) {
      return { model: STANDARD_MODEL, band, spendCents, budgetCents, escalated: false, escalationBlockedReason: "no_expert_model" };
    }

    // ESCALATE. Log EVERY Opus selection with running spend so Alex can audit.
    log.info("[opus-escalation]", {
      clientId: opts.clientId,
      surface: opts.surface,
      signal: opts.escalationSignal,
      model,
      mtdOpusCents,
      ceilingCents: OPUS_MONTHLY_CEILING_CENTS,
    });
    return { model, band, spendCents, budgetCents, escalated: true };
  } catch (err) {
    // Fail-open: never crash, never silently escalate. Degrade to the normal
    // (non-escalated) selection at the requested complexity.
    log.warn("selectModelWithEscalation: unexpected error — falling back to non-escalated selection", {
      clientId: opts.clientId,
      surface: opts.surface,
      error: String(err),
    });
    return selectModelForTask(opts);
  }
}

/** Pure band classification. */
export function classifyBand(spendCents: number, budgetCents: number): BudgetBand {
  const softCapCents = budgetCents + SOFT_CAP_DELTA_CENTS;
  if (spendCents >= softCapCents) return "over_cap";
  if (spendCents >= budgetCents) return "soft_cap";
  return "default";
}

/** Map (band, complexity) → pricing tier.
 *
 * Wave AI-1 — the new "expert" complexity maps to the Opus "expert" tier ONLY
 * in the default band. Budget pressure demotes it: soft_cap → standard
 * (Sonnet), over_cap → cheap (the per-client cap ALWAYS wins; escalation never
 * overrides it). All pre-existing rows are unchanged.
 */
export function pickTier(
  band: BudgetBand,
  complexity: TaskComplexity,
): "cheap" | "standard" | "premium" | "expert" {
  if (band === "over_cap") return "cheap";
  if (band === "soft_cap") {
    // Expert + complex tasks demote one notch toward standard; cheap stays cheap.
    if (complexity === "expert") return "standard";
    if (complexity === "complex") return "standard";
    if (complexity === "standard") return "standard";
    return "cheap";
  }
  // default band — task-appropriate
  if (complexity === "expert") return "expert";
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
