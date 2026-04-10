import type { RankflowProfile } from "@shared/schema";
import { TIER_CONFIGS, validatePlanAgainstLimits } from "./marginGuardrails";

export interface PlanTask {
  type: string;
  count: number;
}

export interface MonthlyPlanData {
  tier: string;
  tasks: PlanTask[];
}

/**
 * Generate a monthly plan based on the client's profile and tier.
 * Task counts are sourced from TIER_CONFIGS (margin guardrails)
 * to ensure hard limits are always enforced.
 */
export function generateMonthlyPlan(profile: RankflowProfile): MonthlyPlanData {
  const tier = profile.plan_tier || "starter";
  const config = TIER_CONFIGS[tier] || TIER_CONFIGS.starter;

  const tasks: PlanTask[] = Object.entries(config.limits).map(([type, count]) => ({
    type,
    count,
  }));

  // Validate (defensive — should never fail since we read from config)
  const violations = validatePlanAgainstLimits(tier, tasks);
  if (violations.length > 0) {
    console.error(`[planGenerator] Violations detected for tier ${tier}:`, violations);
  }

  return { tier, tasks };
}
