/**
 * Per-client cost ledger — the *measured* operational spend for one client
 * over a trailing 30-day window.
 *
 * Composes two cost sources:
 *   - getClientProfitability() — serviceCostLogs (SocialSync / ReputationShield
 *     AI, SMS, email) plus flat infra, and revenue from active clientServices.
 *   - ai_usage_logs — the client portal copilot's Claude spend, attributed to
 *     the client via clients.user_id.
 *
 * This is distinct from the contract COGS figure (clientServices.cost_cents)
 * shown in the client header: that is what a service was *budgeted* to cost;
 * this is what serving the client actually cost.
 */
import { db } from "../db";
import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsageLogs, clients } from "@shared/schema";
import { getClientProfitability } from "./socialSync/costTracker";
import { createLogger } from "../lib/logger";

const log = createLogger("ClientCostLedger");

/** Trailing window for both the AI-usage sum and getClientProfitability. */
const LEDGER_WINDOW_DAYS = 30;

export interface ClientCostLedger {
  client_id: number;
  window_days: number;
  revenue_usd: number;
  cost_usd: number;
  profit_usd: number;
  margin_pct: number | null;
  /** cost_type → USD. Always includes a `copilot_ai` line (0 when none). */
  cost_breakdown: Record<string, number>;
}

/** Sum the client portal copilot's Claude spend (USD) over the window. */
async function getCopilotAiCostUsd(userId: number): Promise<number> {
  const since = new Date(Date.now() - LEDGER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${aiUsageLogs.estimated_cost_usd}), 0)` })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.user_id, userId), gte(aiUsageLogs.created_at, since)));
  // estimated_cost_usd is stored as micro-USD (USD × 1,000,000).
  return (Number(row?.total) || 0) / 1_000_000;
}

/**
 * Build the combined cost ledger for one client. Never throws on the copilot
 * lookup — a failure there degrades to $0 AI cost rather than a 500.
 */
export async function getClientCostLedger(clientId: number): Promise<ClientCostLedger> {
  const base = await getClientProfitability(clientId);

  // Attribute copilot AI spend via the client's linked portal user.
  let copilotAiUsd = 0;
  try {
    const [client] = await db
      .select({ user_id: clients.user_id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (client?.user_id) {
      copilotAiUsd = await getCopilotAiCostUsd(client.user_id);
    }
  } catch (err) {
    log.warn("copilot AI cost lookup failed — treating as $0", { clientId, error: String(err) });
  }
  copilotAiUsd = Math.round(copilotAiUsd * 100) / 100;

  const breakdown: Record<string, number> = { ...base.cost_breakdown, copilot_ai: copilotAiUsd };
  const costUsd = Math.round((base.cost_usd + copilotAiUsd) * 100) / 100;
  const profitUsd = Math.round((base.revenue_usd - costUsd) * 100) / 100;
  const marginPct = base.revenue_usd > 0 ? Math.round((profitUsd / base.revenue_usd) * 100) : null;

  return {
    client_id: clientId,
    window_days: LEDGER_WINDOW_DAYS,
    revenue_usd: base.revenue_usd,
    cost_usd: costUsd,
    profit_usd: profitUsd,
    margin_pct: marginPct,
    cost_breakdown: breakdown,
  };
}
