/**
 * RankFlow Margin Guardrails
 *
 * Defines tier cost modeling, hard delivery limits, cost protection rules,
 * and upsell boundaries. This is the financial source of truth.
 */

/* ─── Types ─── */

export interface TaskCostEstimate {
  task_type: string;
  vendor: string;
  cost_low: number;
  cost_mid: number;
  cost_high: number;
}

export interface TierConfig {
  id: string;
  label: string;
  price: number; // monthly selling price

  // Hard task limits (system-enforced)
  limits: Record<string, number>;

  // Cost estimates per task
  costs: TaskCostEstimate[];

  // Aggregate cost estimates
  total_cost_low: number;
  total_cost_mid: number;
  total_cost_high: number;

  // Margin calculations
  margin_low: number;
  margin_mid: number;
  margin_high: number;
  margin_pct_mid: number;

  // Monthly delivery bounds
  min_tasks: number;
  max_tasks: number;

  // Monthly cost ceiling — flag if exceeded
  cost_ceiling: number;
}

/* ─── Task Cost Reference ─── */

const TASK_COSTS: Record<string, { vendor: string; low: number; mid: number; high: number }> = {
  citation_build: { vendor: "citation_vendor", low: 1, mid: 3, high: 5 },
  page_create:    { vendor: "ai + content_vendor", low: 2, mid: 12, high: 30 },
  meta_fix:       { vendor: "internal_ai", low: 0, mid: 0, high: 5 },
  internal_linking: { vendor: "onpage_vendor / admin", low: 0, mid: 5, high: 15 },
  schema_basic:   { vendor: "internal_ai", low: 0, mid: 0, high: 10 },
  content_support: { vendor: "internal_ai", low: 0, mid: 1, high: 5 },
};

/* ─── Tier Definitions ─── */

function buildTier(
  id: string,
  label: string,
  price: number,
  limits: Record<string, number>,
): TierConfig {
  const costs: TaskCostEstimate[] = [];
  let totalLow = 0;
  let totalMid = 0;
  let totalHigh = 0;

  for (const [taskType, count] of Object.entries(limits)) {
    const ref = TASK_COSTS[taskType];
    if (!ref) continue;
    const cost: TaskCostEstimate = {
      task_type: taskType,
      vendor: ref.vendor,
      cost_low: ref.low * count,
      cost_mid: ref.mid * count,
      cost_high: ref.high * count,
    };
    costs.push(cost);
    totalLow += cost.cost_low;
    totalMid += cost.cost_mid;
    totalHigh += cost.cost_high;
  }

  const totalTasks = Object.values(limits).reduce((s, n) => s + n, 0);

  return {
    id,
    label,
    price,
    limits,
    costs,
    total_cost_low: totalLow,
    total_cost_mid: totalMid,
    total_cost_high: totalHigh,
    margin_low: price - totalHigh,
    margin_mid: price - totalMid,
    margin_high: price - totalLow,
    margin_pct_mid: Math.round(((price - totalMid) / price) * 100),
    min_tasks: totalTasks,
    max_tasks: totalTasks,
    cost_ceiling: Math.round(price * 0.45), // never spend more than 45% of price
  };
}

export const TIER_CONFIGS: Record<string, TierConfig> = {
  starter: buildTier("starter", "Starter", 349, {
    meta_fix: 5,
    content_support: 1,
    internal_linking: 5,
    schema_basic: 1,
  }),
  growth: buildTier("growth", "Growth", 599, {
    page_create: 2,
    meta_fix: 5,
    citation_build: 10,
    internal_linking: 10,
    content_support: 1,
    schema_basic: 2,
  }),
  pro: buildTier("pro", "Pro", 899, {
    page_create: 4,
    meta_fix: 10,
    citation_build: 15,
    internal_linking: 15,
    content_support: 2,
    schema_basic: 3,
  }),
};

/* ─── Guard Functions ─── */

/**
 * Get the hard task limit for a specific task type within a tier.
 * Returns 0 if the task type is not included in the tier.
 */
export function getTaskLimit(tier: string, taskType: string): number {
  const config = TIER_CONFIGS[tier];
  if (!config) return 0;
  return config.limits[taskType] || 0;
}

/**
 * Check if a proposed task count exceeds the tier limit.
 */
export function exceedsTaskLimit(tier: string, taskType: string, proposedCount: number): boolean {
  return proposedCount > getTaskLimit(tier, taskType);
}

/**
 * Get the cost ceiling for a tier (maximum delivery spend per month).
 */
export function getCostCeiling(tier: string): number {
  return TIER_CONFIGS[tier]?.cost_ceiling || 0;
}

/**
 * Check if monthly delivery cost has exceeded the ceiling.
 */
export function isCostOverCeiling(tier: string, currentMonthCost: number): boolean {
  const ceiling = getCostCeiling(tier);
  return ceiling > 0 && currentMonthCost > ceiling;
}

/**
 * Get the full tier config.
 */
export function getTierConfig(tier: string): TierConfig | undefined {
  return TIER_CONFIGS[tier];
}

/**
 * Validate a proposed plan against tier limits.
 * Returns an array of violations (empty = valid).
 */
export function validatePlanAgainstLimits(
  tier: string,
  tasks: { type: string; count: number }[],
): string[] {
  const violations: string[] = [];
  const config = TIER_CONFIGS[tier];
  if (!config) {
    violations.push(`Unknown tier: ${tier}`);
    return violations;
  }

  for (const task of tasks) {
    const limit = config.limits[task.type];
    if (limit === undefined) {
      violations.push(`Task type "${task.type}" not included in ${tier} tier`);
    } else if (task.count > limit) {
      violations.push(`${task.type}: ${task.count} exceeds limit of ${limit} for ${tier} tier`);
    }
  }

  return violations;
}

/* ─── Upsell Definitions ─── */

export interface UpsellOpportunity {
  id: string;
  label: string;
  description: string;
  cross_sell_product: string | null;
  available_from_tier: string[];
}

export const UPSELL_OPTIONS: UpsellOpportunity[] = [
  {
    id: "extra_pages",
    label: "Additional SEO Pages",
    description: "Create more service or location pages beyond the tier limit.",
    cross_sell_product: null,
    available_from_tier: ["starter", "growth", "pro"],
  },
  {
    id: "multi_location",
    label: "Multi-Location Expansion",
    description: "Extend SEO coverage to additional cities or service areas.",
    cross_sell_product: null,
    available_from_tier: ["growth", "pro"],
  },
  {
    id: "tier_upgrade",
    label: "Tier Upgrade",
    description: "Upgrade to a higher tier for more monthly SEO capacity.",
    cross_sell_product: null,
    available_from_tier: ["starter", "growth"],
  },
  {
    id: "speed_optimization",
    label: "Website Speed Optimization",
    description: "Fix Core Web Vitals and page speed issues.",
    cross_sell_product: "WebFix",
    available_from_tier: ["starter", "growth", "pro"],
  },
  {
    id: "paid_ads",
    label: "Google & Facebook Ads",
    description: "Get leads faster with paid advertising alongside SEO.",
    cross_sell_product: "AdFlow",
    available_from_tier: ["starter", "growth", "pro"],
  },
  {
    id: "reputation",
    label: "Review & Reputation Management",
    description: "Get more 5-star reviews and manage your online reputation.",
    cross_sell_product: "ReputationShield",
    available_from_tier: ["starter", "growth", "pro"],
  },
  {
    id: "gbp_management",
    label: "Google Business Profile Management",
    description: "Keep your Google listing optimized and protected.",
    cross_sell_product: "MapGuard",
    available_from_tier: ["starter", "growth", "pro"],
  },
];
