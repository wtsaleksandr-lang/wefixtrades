/**
 * RankFlow Margin Guardrails
 *
 * Defines tier cost modeling, hard delivery limits, soft cost throttling,
 * Starter rotation logic, priority/reducible task classification,
 * and upsell boundaries.
 *
 * This is the financial source of truth for RankFlow.
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
  price: number;

  // Hard task limits (max per month, system-enforced)
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

  // Delivery bounds
  min_tasks: number;
  max_tasks: number;

  // Cost controls
  cost_ceiling: number;      // hard limit (45% of price) — block if exceeded
  soft_cost_limit: number;   // soft limit (35% of price) — reduce low-impact tasks

  // Rotation (Starter only)
  rotation_enabled: boolean;

  // Task classification for cost throttling
  priority_tasks: string[];   // never reduce these
  reducible_tasks: string[];  // reduce first when over soft limit
}

/* ─── Task Cost Reference ─── */

const TASK_COSTS: Record<string, { vendor: string; low: number; mid: number; high: number }> = {
  citation_build:   { vendor: "citation_vendor", low: 1, mid: 3, high: 5 },
  page_create:      { vendor: "ai + content_vendor", low: 2, mid: 12, high: 30 },
  meta_fix:         { vendor: "internal_ai", low: 0, mid: 0, high: 2 },
  internal_linking: { vendor: "internal_ai / admin", low: 0, mid: 0, high: 5 },
  schema_basic:     { vendor: "internal_ai", low: 0, mid: 0, high: 5 },
  content_support:  { vendor: "internal_ai", low: 0, mid: 1, high: 3 },
};

/* ─── Tier Builder ─── */

function buildTier(
  id: string,
  label: string,
  price: number,
  limits: Record<string, number>,
  opts: { rotation_enabled?: boolean } = {},
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
    cost_ceiling: Math.round(price * 0.45),
    soft_cost_limit: Math.round(price * 0.35),
    rotation_enabled: opts.rotation_enabled || false,
    priority_tasks: ["page_create", "meta_fix", "schema_basic"],
    reducible_tasks: ["citation_build", "content_support", "internal_linking"],
  };
}

/* ─── Tier Definitions ─── */

// Starter: base tasks every month + rotating page/citation output
// Rotation adds page_create (month A) or citation_build (month B) alternately
export const STARTER_BASE_LIMITS: Record<string, number> = {
  meta_fix: 5,
  content_support: 1,
  internal_linking: 5,
  schema_basic: 1,
};

export const STARTER_ROTATION = {
  a: { page_create: 1 },      // odd months (Jan, Mar, May...)
  b: { citation_build: 5 },   // even months (Feb, Apr, Jun...)
};

export const TIER_CONFIGS: Record<string, TierConfig> = {
  starter: buildTier("starter", "Starter", 349, {
    ...STARTER_BASE_LIMITS,
    // Rotation adds either 1 page or 5 citations — use page for cost calc (higher)
    page_create: 1,
  }, { rotation_enabled: true }),

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

/* ─── Rotation Logic ─── */

/**
 * Determine which rotation phase for a given month string "YYYY-MM".
 * Odd months (Jan=1, Mar=3...) = phase A (page), even = phase B (citations).
 */
export function getRotationPhase(month: string): "a" | "b" {
  const monthNum = parseInt(month.split("-")[1] || "1", 10);
  return monthNum % 2 === 1 ? "a" : "b";
}

/**
 * Get the effective task limits for Starter tier for a given month,
 * applying the rotation model.
 */
export function getStarterLimitsForMonth(month: string): Record<string, number> {
  const phase = getRotationPhase(month);
  const rotation = STARTER_ROTATION[phase];
  return { ...STARTER_BASE_LIMITS, ...rotation };
}

/* ─── Cost Control ─── */

export function getTaskLimit(tier: string, taskType: string): number {
  const config = TIER_CONFIGS[tier];
  if (!config) return 0;
  return config.limits[taskType] || 0;
}

export function exceedsTaskLimit(tier: string, taskType: string, proposedCount: number): boolean {
  return proposedCount > getTaskLimit(tier, taskType);
}

export function getCostCeiling(tier: string): number {
  return TIER_CONFIGS[tier]?.cost_ceiling || 0;
}

export function getSoftCostLimit(tier: string): number {
  return TIER_CONFIGS[tier]?.soft_cost_limit || 0;
}

export function isCostOverCeiling(tier: string, currentMonthCost: number): boolean {
  const ceiling = getCostCeiling(tier);
  return ceiling > 0 && currentMonthCost > ceiling;
}

export function isOverSoftLimit(tier: string, currentMonthCost: number): boolean {
  const soft = getSoftCostLimit(tier);
  return soft > 0 && currentMonthCost > soft;
}

export function getTierConfig(tier: string): TierConfig | undefined {
  return TIER_CONFIGS[tier];
}

/**
 * Validate a proposed plan against tier limits.
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
    if (limit === undefined && task.count > 0) {
      violations.push(`Task type "${task.type}" not included in ${tier} tier`);
    } else if (limit !== undefined && task.count > limit) {
      violations.push(`${task.type}: ${task.count} exceeds limit of ${limit} for ${tier} tier`);
    }
  }

  return violations;
}

/**
 * Apply soft cost throttling: reduce low-impact tasks to stay under soft limit.
 * Returns adjusted task list (does not mutate input).
 */
export function applySoftThrottle(
  tier: string,
  tasks: { type: string; count: number }[],
  projectedCost: number,
): { type: string; count: number }[] {
  const config = TIER_CONFIGS[tier];
  if (!config || projectedCost <= config.soft_cost_limit) return tasks;

  const adjusted = tasks.map(t => ({ ...t }));
  const excess = projectedCost - config.soft_cost_limit;
  let saved = 0;

  // Reduce reducible tasks first (citation_build, then content_support, then internal_linking)
  for (const reducible of config.reducible_tasks) {
    if (saved >= excess) break;
    const task = adjusted.find(t => t.type === reducible);
    if (!task || task.count === 0) continue;

    const costRef = TASK_COSTS[reducible];
    if (!costRef) continue;

    // Reduce by up to 40%
    const maxReduce = Math.max(1, Math.floor(task.count * 0.4));
    const reduceBy = Math.min(maxReduce, Math.ceil((excess - saved) / costRef.mid) || 1);
    const actual = Math.min(reduceBy, task.count);

    task.count -= actual;
    saved += actual * costRef.mid;
  }

  return adjusted;
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
