/**
 * Wave W-BA-2 (Phase 3b) — per-client variable-cost recorder.
 *
 * The `clientCostLedger` already aggregates trailing-30-day spend from
 * `serviceCostLogs` + `ai_usage_logs`. This module is a *separate*, faster
 * read path for the admin client-detail "Cost & Profit" view: a per-client
 * running total of AI / SMS / voice spend and revenue for the current month
 * plus lifetime totals, plus the per-client AI budget the router consults.
 *
 *   - Increment paths (ai / sms / voice / revenue) update the cache row
 *     atomically and roll the current_month → history table on the 1st of
 *     each month before applying the new increment.
 *   - Read paths return the cached row, ensuring it exists first.
 *
 * Failures NEVER throw upstream — a metering miss is preferable to a 500.
 */
import { db } from "../db";
import { and, asc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  clientVariableCosts,
  clientVariableCostsHistory,
  type ClientVariableCosts,
  type ClientVariableCostsHistory,
} from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("ClientVariableCosts");

/** Default AI budget per client (cents) when no row exists yet — $10/mo. */
export const DEFAULT_CLIENT_BUDGET_CENTS = 1000;

/** YYYY-MM in UTC. */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Read the cached row. Creates an empty row + seed for the current month
 * if none exists, so callers always get a stable shape.
 */
export async function getClientVariableCosts(
  clientId: number,
): Promise<ClientVariableCosts | null> {
  try {
    await ensureRow(clientId);
    const [row] = await db
      .select()
      .from(clientVariableCosts)
      .where(eq(clientVariableCosts.client_id, clientId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    log.warn("getClientVariableCosts failed", { clientId, error: String(err) });
    return null;
  }
}

/**
 * Rolling 6-month history for the trend chart. Always returns up to N rows
 * sorted by month ascending. Includes the current month from the live row.
 */
export async function getClientCostHistory(
  clientId: number,
  months: number = 6,
): Promise<ClientVariableCostsHistory[]> {
  try {
    const cutoff = monthsAgoKey(months - 1);
    const rows = await db
      .select()
      .from(clientVariableCostsHistory)
      .where(
        and(
          eq(clientVariableCostsHistory.client_id, clientId),
          gte(clientVariableCostsHistory.month, cutoff),
        ),
      )
      .orderBy(asc(clientVariableCostsHistory.month));
    // Append current month from the live row if not already present.
    const live = await getClientVariableCosts(clientId);
    if (live) {
      const hasCurrent = rows.find((r) => r.month === live.current_month);
      if (!hasCurrent) {
        rows.push({
          client_id: clientId,
          month: live.current_month,
          ai_cost_cents: live.ai_cost_cents_month,
          sms_cost_cents: live.sms_cost_cents_month,
          voice_cost_cents: live.voice_cost_cents_month,
          revenue_cents: live.revenue_cents_month,
          created_at: live.updated_at,
        });
      }
    }
    return rows;
  } catch (err) {
    log.warn("getClientCostHistory failed", { clientId, error: String(err) });
    return [];
  }
}

/** Update the client's default monthly AI budget. */
export async function setClientBudget(
  clientId: number,
  budgetCents: number,
): Promise<ClientVariableCosts | null> {
  try {
    await ensureRow(clientId);
    const [row] = await db
      .update(clientVariableCosts)
      .set({ default_budget_cents: budgetCents, updated_at: new Date() })
      .where(eq(clientVariableCosts.client_id, clientId))
      .returning();
    return row ?? null;
  } catch (err) {
    log.warn("setClientBudget failed", { clientId, error: String(err) });
    return null;
  }
}

type CostKind = "ai" | "sms" | "voice" | "revenue";

const KIND_TO_COLS: Record<CostKind, { month: string; lifetime: string }> = {
  ai: { month: "ai_cost_cents_month", lifetime: "ai_cost_cents_lifetime" },
  sms: { month: "sms_cost_cents_month", lifetime: "sms_cost_cents_lifetime" },
  voice: { month: "voice_cost_cents_month", lifetime: "voice_cost_cents_lifetime" },
  revenue: { month: "revenue_cents_month", lifetime: "revenue_cents_lifetime" },
};

/**
 * Add `cents` to a single kind (AI / SMS / voice / revenue). Handles
 * month-rollover before the increment, and never throws.
 */
export async function incrementVariableCost(opts: {
  clientId: number;
  kind: CostKind;
  cents: number;
}): Promise<void> {
  if (!opts.clientId || !Number.isFinite(opts.cents) || opts.cents <= 0) return;
  const cents = Math.round(opts.cents);
  try {
    await ensureRow(opts.clientId);
    await rolloverIfNeeded(opts.clientId);
    const cols = KIND_TO_COLS[opts.kind];
    await db.execute(sql`
      update client_variable_costs
      set
        ${sql.raw(cols.month)} = ${sql.raw(cols.month)} + ${cents},
        ${sql.raw(cols.lifetime)} = ${sql.raw(cols.lifetime)} + ${cents},
        updated_at = now()
      where client_id = ${opts.clientId}
    `);
  } catch (err) {
    log.warn("incrementVariableCost failed", {
      clientId: opts.clientId,
      kind: opts.kind,
      error: String(err),
    });
  }
}

/* ─── Internal helpers ─── */

async function ensureRow(clientId: number): Promise<void> {
  await db
    .insert(clientVariableCosts)
    .values({
      client_id: clientId,
      current_month: currentMonthKey(),
      default_budget_cents: DEFAULT_CLIENT_BUDGET_CENTS,
    })
    .onConflictDoNothing({ target: clientVariableCosts.client_id });
}

/**
 * If the cached row's `current_month` is stale, snapshot the existing
 * monthly totals to the history table and zero out the month columns.
 * Lifetime + budget are preserved.
 */
async function rolloverIfNeeded(clientId: number): Promise<void> {
  const [row] = await db
    .select()
    .from(clientVariableCosts)
    .where(eq(clientVariableCosts.client_id, clientId))
    .limit(1);
  if (!row) return;
  const now = currentMonthKey();
  if (row.current_month === now) return;

  // Snapshot to history (upsert — month boundaries can race).
  await db
    .insert(clientVariableCostsHistory)
    .values({
      client_id: clientId,
      month: row.current_month,
      ai_cost_cents: row.ai_cost_cents_month,
      sms_cost_cents: row.sms_cost_cents_month,
      voice_cost_cents: row.voice_cost_cents_month,
      revenue_cents: row.revenue_cents_month,
    })
    .onConflictDoNothing({
      target: [clientVariableCostsHistory.client_id, clientVariableCostsHistory.month],
    });

  await db
    .update(clientVariableCosts)
    .set({
      current_month: now,
      ai_cost_cents_month: 0,
      sms_cost_cents_month: 0,
      voice_cost_cents_month: 0,
      revenue_cents_month: 0,
      updated_at: new Date(),
    })
    .where(eq(clientVariableCosts.client_id, clientId));
}

function monthsAgoKey(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return currentMonthKey(d);
}
