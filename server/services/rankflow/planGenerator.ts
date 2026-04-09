import type { RankflowProfile } from "@shared/schema";

/**
 * Task quotas by tier.
 * Each key is a task type, value is the count to generate per month.
 */
const TIER_QUOTAS: Record<string, Record<string, number>> = {
  starter: {
    meta_fix: 5,
    content_support: 1,
    internal_linking: 5,
    schema_basic: 1,
  },
  growth: {
    page_create: 2,
    meta_fix: 5,
    citation_build: 10,
    internal_linking: 10,
    content_support: 1,
    schema_basic: 2,
  },
  pro: {
    page_create: 4,
    meta_fix: 10,
    citation_build: 15,
    internal_linking: 15,
    content_support: 2,
    schema_basic: 3,
  },
};

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
 * Template-driven — no AI needed at this stage.
 */
export function generateMonthlyPlan(profile: RankflowProfile): MonthlyPlanData {
  const tier = profile.plan_tier || "starter";
  const quotas = TIER_QUOTAS[tier] || TIER_QUOTAS.starter;

  const tasks: PlanTask[] = Object.entries(quotas).map(([type, count]) => ({
    type,
    count,
  }));

  return { tier, tasks };
}
