/**
 * System-wide AI gate (W-AX-1).
 *
 * Promotes the product-scoped ContentFlow gate (contentflowGate.ts) to a
 * system-scoped registry: one row per surface in ai_system_gates with its
 * own kill switch + monthly spend cap. Every AI call site across the
 * product (SocialSync, MapGuard, Reputation, Reply-Intelligence, etc.)
 * must call `aiGateAllowed(surface)` BEFORE invoking the upstream model.
 *
 *   const gate = await aiGateAllowed("socialsync");
 *   if (!gate.allowed) throw new Error(gate.reason);
 *
 * Spend tracking: success/failure is logged to ai_usage_logs by the
 * existing usageTracker. After a successful call, `recordAiSpend(surface,
 * cents)` increments monthly_spent_cents on the gate row so the next call
 * can be capped. Spend resets on the 1st of each month (lazy reset on
 * read — see monthlyResetIfStale()).
 *
 * Fail-open: if the gates table can't be read, we ALLOW the call rather
 * than silently halting the whole product. Loud logs are emitted instead.
 */

import { db } from "../db";
import { aiSystemGates } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  AI_SURFACE_LIST,
  DEFAULT_BUDGET_CENTS,
  type AiSurface,
} from "./aiSurfaces";

const log = createLogger("AI:SystemGate");

export interface GateResult {
  allowed: boolean;
  /** Human-readable reason when allowed === false. */
  reason?: string;
}

/** Lazy-create a gate row using the registry default if missing. */
async function ensureGateRow(surface: string): Promise<void> {
  const budget = (DEFAULT_BUDGET_CENTS as Record<string, number | null>)[surface] ?? null;
  await db
    .insert(aiSystemGates)
    .values({
      surface,
      kill_switch_on: false,
      monthly_budget_cents: budget,
      monthly_spent_cents: 0,
      alert_threshold_pct: 80,
      alerts_sent: [],
    })
    .onConflictDoNothing();
}

/** Reset monthly_spent_cents when the stored reset stamp falls in a prior
 *  month. Lazy reset on read avoids needing a cron. */
async function monthlyResetIfStale(surface: string, resetAt: Date | null): Promise<void> {
  if (!resetAt) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (resetAt >= monthStart) return;
  await db
    .update(aiSystemGates)
    .set({
      monthly_spent_cents: 0,
      monthly_reset_at: monthStart,
      alerts_sent: [],
      updated_at: new Date(),
    })
    .where(eq(aiSystemGates.surface, surface));
}

/**
 * The primary gate check. Call BEFORE any upstream AI invocation.
 *
 * Returns { allowed: false } when:
 *   - kill_switch_on is true for this surface, OR
 *   - monthly_budget_cents is set AND monthly_spent_cents has reached it.
 *
 * Returns { allowed: true } otherwise, including on infrastructure failure
 * (fail-open).
 */
export async function aiGateAllowed(surface: string): Promise<GateResult> {
  try {
    let [row] = await db
      .select()
      .from(aiSystemGates)
      .where(eq(aiSystemGates.surface, surface))
      .limit(1);

    if (!row) {
      await ensureGateRow(surface);
      [row] = await db
        .select()
        .from(aiSystemGates)
        .where(eq(aiSystemGates.surface, surface))
        .limit(1);
    }

    if (!row) {
      log.warn("gate row missing after ensure — allowing (fail-open)", { surface });
      return { allowed: true };
    }

    await monthlyResetIfStale(surface, row.monthly_reset_at ?? null);

    if (row.kill_switch_on) {
      return {
        allowed: false,
        reason: `AI surface "${surface}" is paused — admin kill switch is ON.`,
      };
    }

    if (row.monthly_budget_cents != null && row.monthly_spent_cents >= row.monthly_budget_cents) {
      return {
        allowed: false,
        reason: `AI surface "${surface}" reached its monthly budget ($${(row.monthly_budget_cents / 100).toFixed(2)}). Resets on the 1st.`,
      };
    }

    return { allowed: true };
  } catch (err: any) {
    log.error("gate read failed — allowing (fail-open)", { surface, error: err?.message });
    return { allowed: true };
  }
}

/**
 * Increment monthly_spent_cents for a surface after a successful call.
 * Caller passes cents (USD × 100). Use `Math.round(costMicroCents / 10_000)`
 * to convert from the micro-cents stored in ai_usage_logs.
 */
export async function recordAiSpend(surface: string, cents: number): Promise<void> {
  if (!Number.isFinite(cents) || cents <= 0) return;
  try {
    await db
      .update(aiSystemGates)
      .set({
        monthly_spent_cents: sql`COALESCE(${aiSystemGates.monthly_spent_cents}, 0) + ${Math.round(cents)}`,
        updated_at: new Date(),
      })
      .where(eq(aiSystemGates.surface, surface));
  } catch (err: any) {
    log.error("spend record failed", { surface, cents, error: err?.message });
  }
}

/** Admin-only — flip the kill switch for one surface. */
export async function setKillSwitch(surface: string, on: boolean): Promise<void> {
  await ensureGateRow(surface);
  await db
    .update(aiSystemGates)
    .set({ kill_switch_on: on, updated_at: new Date() })
    .where(eq(aiSystemGates.surface, surface));
  log.warn("kill switch toggled", { surface, on });
}

/** Admin-only — set the kill switch on EVERY known surface. */
export async function setGlobalKillSwitch(on: boolean): Promise<void> {
  for (const surface of AI_SURFACE_LIST) {
    await ensureGateRow(surface);
  }
  await db
    .update(aiSystemGates)
    .set({ kill_switch_on: on, updated_at: new Date() });
  log.warn("GLOBAL kill switch toggled", { on });
}

/** Admin-only — update the monthly budget cap for one surface. */
export async function setMonthlyBudget(surface: string, cents: number | null): Promise<void> {
  await ensureGateRow(surface);
  await db
    .update(aiSystemGates)
    .set({ monthly_budget_cents: cents, updated_at: new Date() })
    .where(eq(aiSystemGates.surface, surface));
  log.info("budget updated", { surface, cents });
}

/** Admin-only — list every gate row. Ensures all registry surfaces exist. */
export async function listGates(): Promise<Array<typeof aiSystemGates.$inferSelect>> {
  for (const surface of AI_SURFACE_LIST) {
    await ensureGateRow(surface);
  }
  return db.select().from(aiSystemGates);
}
