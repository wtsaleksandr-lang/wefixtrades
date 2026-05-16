/**
 * Phase 3b-iii — the per-client AI budget dial.
 *
 * A client's trailing-30-day AI spend places it in one of three bands. The
 * band is a MODEL-SELECTION dial, never an off-switch: over the soft cap the
 * portal copilot drops to the cheapest capable model, but it never goes dark.
 *
 *   within   — spend ≤ default budget              → normal model
 *   soft_cap — default budget < spend ≤ budget +$10 → normal model (warning)
 *   over     — spend > default budget + $10         → forced to Haiku
 *
 * Fail-open: any lookup error yields the `within` band with no override, so a
 * metering failure degrades to normal service rather than throttling everyone.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients } from "@shared/schema";
import { getClientCostLedger, type ClientCostLedger } from "./clientCostLedger";
import { getAiChannelSettings } from "./aiChannelSettings";
import { createLogger } from "../lib/logger";

const log = createLogger("AiBudget");

/** Fixed overage the founder accepts on top of the default budget (USD). */
const SOFT_CAP_DELTA_USD = 10;

/** Cheapest capable model — what `over`-band clients route to. */
const CHEAPEST_MODEL = "claude-haiku-4-5-20251001";

/** Ledger cost-breakdown lines that count as AI spend toward the budget. */
const AI_COST_TYPES = ["copilot_ai", "ai_content", "ai_image", "ai_quality", "ai_review"];

export type BudgetBand = "within" | "soft_cap" | "over";

export interface BudgetBandInfo {
  band: BudgetBand;
  ai_spend_usd: number;
  budget_usd: number;
  soft_cap_usd: number;
}

/** Returned on any error or when a portal user has no client row. */
const WITHIN_FALLBACK: BudgetBandInfo = {
  band: "within",
  ai_spend_usd: 0,
  budget_usd: 0,
  soft_cap_usd: SOFT_CAP_DELTA_USD,
};

/** Sum the AI-related lines of a cost ledger (USD). */
export function sumAiSpendUsd(ledger: ClientCostLedger): number {
  let total = 0;
  for (const type of AI_COST_TYPES) {
    total += ledger.cost_breakdown[type] || 0;
  }
  return Math.round(total * 100) / 100;
}

/** Classify an AI-spend figure against a budget. Pure. */
export function classifyBand(aiSpendUsd: number, budgetCents: number): BudgetBandInfo {
  const budgetUsd = budgetCents / 100;
  const softCapUsd = budgetUsd + SOFT_CAP_DELTA_USD;
  const band: BudgetBand =
    aiSpendUsd > softCapUsd ? "over" : aiSpendUsd > budgetUsd ? "soft_cap" : "within";
  return { band, ai_spend_usd: aiSpendUsd, budget_usd: budgetUsd, soft_cap_usd: softCapUsd };
}

/**
 * Budget band for one client. Pass a pre-fetched ledger to avoid a second
 * round-trip when the caller already has one.
 */
export async function getClientBudgetBand(
  clientId: number,
  ledger?: ClientCostLedger,
): Promise<BudgetBandInfo> {
  try {
    const l = ledger ?? (await getClientCostLedger(clientId));
    const settings = await getAiChannelSettings();
    return classifyBand(sumAiSpendUsd(l), settings.default_ai_budget_cents);
  } catch (err) {
    log.warn("getClientBudgetBand failed — defaulting to within-budget", {
      clientId,
      error: String(err),
    });
    return { ...WITHIN_FALLBACK };
  }
}

/**
 * Budget band for the client linked to a portal user. Returns the within-band
 * fallback when the user has no client row (e.g. an admin using the portal).
 */
export async function getBudgetBandForPortalUser(userId: number): Promise<BudgetBandInfo> {
  try {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    if (!client) return { ...WITHIN_FALLBACK };
    return await getClientBudgetBand(client.id);
  } catch (err) {
    log.warn("getBudgetBandForPortalUser failed — defaulting to within-budget", {
      userId,
      error: String(err),
    });
    return { ...WITHIN_FALLBACK };
  }
}

/** The model override a band implies — undefined means "use the normal model". */
export function modelOverrideForBand(band: BudgetBand): string | undefined {
  return band === "over" ? CHEAPEST_MODEL : undefined;
}
