import type { RankflowProfile } from "@shared/schema";
import {
  TIER_CONFIGS,
  getStarterLimitsForMonth,
  getRotationPhase,
  validatePlanAgainstLimits,
  applySoftThrottle,
} from "./marginGuardrails";

export interface PlanTask {
  type: string;
  count: number;
}

export interface MonthlyPlanData {
  tier: string;
  month: string;
  rotation_phase?: "a" | "b";
  tasks: PlanTask[];
  throttled: boolean;
}

/**
 * Generate a monthly plan based on the client's profile and tier.
 *
 * For Starter tier: applies month-based rotation (page vs citations).
 * For all tiers: applies soft cost throttling if projected cost exceeds 35% of price.
 * Task limits sourced from TIER_CONFIGS (single source of truth).
 */
export function generateMonthlyPlan(profile: RankflowProfile, month?: string): MonthlyPlanData {
  const tier = profile.plan_tier || "starter";
  const currentMonth = month || new Date().toISOString().slice(0, 7);
  const config = TIER_CONFIGS[tier] || TIER_CONFIGS.starter;

  // Get effective limits — Starter uses rotation, others use static limits
  let effectiveLimits: Record<string, number>;
  let rotationPhase: "a" | "b" | undefined;

  if (config.rotation_enabled && tier === "starter") {
    effectiveLimits = getStarterLimitsForMonth(currentMonth);
    rotationPhase = getRotationPhase(currentMonth);
  } else {
    effectiveLimits = config.limits;
  }

  let tasks: PlanTask[] = Object.entries(effectiveLimits)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => ({ type, count }));

  // Calculate projected cost for soft throttle check
  const projectedCost = tasks.reduce((sum, t) => {
    const costRef = getCostMid(t.type);
    return sum + costRef * t.count;
  }, 0);

  // Apply soft throttle if needed
  let throttled = false;
  if (projectedCost > config.soft_cost_limit) {
    tasks = applySoftThrottle(tier, tasks, projectedCost);
    throttled = true;
    console.log(`[planGenerator] Soft throttle applied for ${tier} — projected $${projectedCost} > soft limit $${config.soft_cost_limit}`);
  }

  // Validate (defensive)
  const violations = validatePlanAgainstLimits(tier, tasks);
  if (violations.length > 0) {
    console.error(`[planGenerator] Violations for tier ${tier}:`, violations);
  }

  return { tier, month: currentMonth, rotation_phase: rotationPhase, tasks, throttled };
}

/** Get mid-range cost for a task type. */
function getCostMid(taskType: string): number {
  const costs: Record<string, number> = {
    citation_build: 3,
    page_create: 12,
    meta_fix: 0,
    internal_linking: 0,
    schema_basic: 0,
    content_support: 1,
  };
  return costs[taskType] || 0;
}
