/**
 * Wave K — QuoteQuick editor AI budget enforcement.
 *
 * Centralises the four checks that gate the `/api/quotequick/ai/chat`
 * endpoint and the after-call accounting that updates per-user totals.
 *
 *   1. cumulative spend  ≤ cap_lifetime_usd
 *   2. spend so far today ≤ daily_ceiling_usd
 *   3. this call's estimate ≤ per_call_max_usd
 *   4. cumulative images ≤ image_lifetime_cap     (image-call only)
 *
 * Each user's budget config is resolved as:
 *   tier_<plan_tier>  (most-recent calculator's tier) → fall back → global.
 *
 * The service is intentionally fail-LOUD: any DB error bubbles to the
 * caller (the chat route), which converts it to a 503. Spend is real
 * money — better a friendly "couldn't load budget" than silently
 * over-spending because a read failed.
 */

import { eq, sql, and } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  calculators,
  aiSpendLog,
  aiBudgetConfig,
  aiBudgetAuditLog,
  DEFAULT_AI_BUDGET_CONFIG,
  type AiBudgetConfigValues,
  type AiBudgetScope,
  AI_BUDGET_SCOPES,
} from "@shared/schema";
import { createLogger } from "../lib/logger";
import {
  costForUsage, estimateCallCost, utcDayKey, gateDecision,
  type SupportedModel, type BudgetSnapshot, type BudgetGateDecision,
} from "./quotequickAiBudgetMath";

const log = createLogger("QuoteQuickAiBudget");

/** Re-export the pure helpers so existing call sites don't have to change. */
export {
  costForUsage, estimateCallCost, utcDayKey, gateDecision,
  type SupportedModel, type BudgetSnapshot, type BudgetGateDecision,
};

/* ─── Config lookup ─── */

function rowToValues(row: typeof aiBudgetConfig.$inferSelect | undefined): AiBudgetConfigValues | null {
  if (!row) return null;
  return {
    cap_lifetime_usd: Number(row.cap_lifetime_usd),
    soft_warn_pct: row.soft_warn_pct,
    per_call_max_usd: Number(row.per_call_max_usd),
    daily_ceiling_usd: Number(row.daily_ceiling_usd),
    image_lifetime_cap: row.image_lifetime_cap,
  };
}

/** Read every budget config row keyed by scope. */
export async function readAllBudgetConfigs(): Promise<Record<string, AiBudgetConfigValues>> {
  const rows = await db.select().from(aiBudgetConfig);
  const out: Record<string, AiBudgetConfigValues> = {};
  for (const r of rows) {
    const v = rowToValues(r);
    if (v) out[r.scope] = v;
  }
  return out;
}

/** Resolve the effective config for a user (per-tier override → global → seed default). */
export async function getEffectiveBudgetConfig(userId: number): Promise<{
  values: AiBudgetConfigValues;
  scope: AiBudgetScope;
  tier: string | null;
}> {
  // Look up the user's plan_tier via their most-recent calculator (the
  // tier lives there, not on users). If the user has no calculator yet,
  // we treat them as `free`.
  const [calcRow] = await db
    .select({ plan_tier: calculators.plan_tier })
    .from(calculators)
    .where(eq(calculators.user_id, userId))
    .orderBy(sql`${calculators.created_at} DESC`)
    .limit(1);
  const tier = (calcRow?.plan_tier ?? "free").trim();
  const tierScope = `tier_${tier}` as AiBudgetScope;

  const rows = await db.select().from(aiBudgetConfig);
  const byScope = new Map(rows.map(r => [r.scope, r]));

  const tierValues = AI_BUDGET_SCOPES.includes(tierScope)
    ? rowToValues(byScope.get(tierScope))
    : null;
  if (tierValues) return { values: tierValues, scope: tierScope, tier };

  const globalValues = rowToValues(byScope.get("global"));
  if (globalValues) return { values: globalValues, scope: "global", tier };

  return { values: { ...DEFAULT_AI_BUDGET_CONFIG }, scope: "global", tier };
}

/** Upsert a budget config row. Captures old + new in the audit log. */
export async function upsertBudgetConfig(
  scope: AiBudgetScope,
  values: AiBudgetConfigValues,
  adminId: number,
): Promise<void> {
  const [existing] = await db.select().from(aiBudgetConfig).where(eq(aiBudgetConfig.scope, scope));
  const oldValues = rowToValues(existing);

  if (existing) {
    await db
      .update(aiBudgetConfig)
      .set({
        cap_lifetime_usd: String(values.cap_lifetime_usd),
        soft_warn_pct: values.soft_warn_pct,
        per_call_max_usd: String(values.per_call_max_usd),
        daily_ceiling_usd: String(values.daily_ceiling_usd),
        image_lifetime_cap: values.image_lifetime_cap,
        updated_by: adminId,
        updated_at: new Date(),
      })
      .where(eq(aiBudgetConfig.scope, scope));
  } else {
    await db.insert(aiBudgetConfig).values({
      scope,
      cap_lifetime_usd: String(values.cap_lifetime_usd),
      soft_warn_pct: values.soft_warn_pct,
      per_call_max_usd: String(values.per_call_max_usd),
      daily_ceiling_usd: String(values.daily_ceiling_usd),
      image_lifetime_cap: values.image_lifetime_cap,
      updated_by: adminId,
    });
  }

  await db.insert(aiBudgetAuditLog).values({
    scope,
    admin_id: adminId,
    old_values: oldValues ?? null,
    new_values: values,
  });
}

/* ─── Spend tracking ─── */

/** Read everything the chat endpoint needs to make a gate decision. */
export async function getUserBudgetSnapshot(userId: number): Promise<BudgetSnapshot> {
  const { values, scope, tier } = await getEffectiveBudgetConfig(userId);

  const [userRow] = await db
    .select({
      ai_spend_usd: users.ai_spend_usd,
      ai_images_used: users.ai_images_used,
    })
    .from(users)
    .where(eq(users.id, userId));

  const cumulative = Number(userRow?.ai_spend_usd ?? 0);
  const imagesUsed = userRow?.ai_images_used ?? 0;

  const day = utcDayKey();
  const [todayRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${aiSpendLog.cost_usd}), 0)` })
    .from(aiSpendLog)
    .where(and(eq(aiSpendLog.user_id, userId), eq(aiSpendLog.day, day)));

  const today = Number(todayRow?.total ?? 0);

  return {
    cumulative_usd: cumulative,
    today_usd: today,
    images_used: imagesUsed,
    config: values,
    scope,
    tier,
  };
}

/** Record an actual call result after Anthropic responds. */
export async function recordSpend(opts: {
  userId: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
}): Promise<{ cost_usd: number }> {
  const cost = costForUsage(opts.model, opts.inputTokens, opts.outputTokens);

  await db.insert(aiSpendLog).values({
    user_id: opts.userId,
    day: utcDayKey(),
    model: opts.model,
    input_tokens: opts.inputTokens,
    output_tokens: opts.outputTokens,
    image_count: opts.imageCount,
    cost_usd: String(cost),
  });

  // Increment cumulative + image counters atomically.
  await db
    .update(users)
    .set({
      ai_spend_usd: sql`${users.ai_spend_usd} + ${cost}`,
      ai_images_used: sql`${users.ai_images_used} + ${opts.imageCount}`,
    })
    .where(eq(users.id, opts.userId));

  log.info(`[budget] user=${opts.userId} model=${opts.model} cost=$${cost.toFixed(6)} img=${opts.imageCount}`);
  return { cost_usd: cost };
}

/** Top-N highest-spend users in the current calendar month. */
export async function getTopSpendersThisMonth(limit = 20): Promise<Array<{
  user_id: number;
  email: string;
  name: string | null;
  cumulative_usd: number;
  month_usd: number;
  today_usd: number;
  images_used: number;
}>> {
  const now = new Date();
  const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const day = utcDayKey(now);

  const monthLike = `${monthPrefix}%`;
  const result = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.email AS email,
      u.name AS name,
      COALESCE(u.ai_spend_usd, 0) AS cumulative_usd,
      COALESCE((
        SELECT SUM(cost_usd) FROM ai_spend_log
        WHERE user_id = u.id AND day LIKE ${monthLike}
      ), 0) AS month_usd,
      COALESCE((
        SELECT SUM(cost_usd) FROM ai_spend_log
        WHERE user_id = u.id AND day = ${day}
      ), 0) AS today_usd,
      COALESCE(u.ai_images_used, 0) AS images_used
    FROM users u
    WHERE COALESCE(u.ai_spend_usd, 0) > 0
    ORDER BY u.ai_spend_usd DESC
    LIMIT ${limit}
  `);

  const raw: any[] = (result as any).rows ?? [];
  return raw.map((r) => ({
    user_id: Number(r.user_id),
    email: String(r.email),
    name: r.name ?? null,
    cumulative_usd: Number(r.cumulative_usd),
    month_usd: Number(r.month_usd),
    today_usd: Number(r.today_usd),
    images_used: Number(r.images_used),
  }));
}
