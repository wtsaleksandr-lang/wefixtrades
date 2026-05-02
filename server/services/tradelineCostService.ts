/**
 * TradeLine Cost Reconciliation Service
 *
 * Fetches Vapi billing data and compares against internal
 * revenue tracking from tradeline_usage to calculate margins.
 */

import { createLogger } from "../lib/logger";
import { storage } from "../storage";

const log = createLogger("TradeLineCost");

export interface CostReconciliationResult {
  vapiCost: number;
  clientRevenue: number;
  margin: number;
  marginPercent: number;
  periodStart: string;
  periodEnd: string;
  perClientBreakdown: Array<{
    clientServiceId: number;
    businessName: string;
    minutes: number;
    calls: number;
    estimatedCost: number;
    revenue: number;
  }>;
  discrepancies: Array<{
    clientServiceId: number;
    businessName: string;
    vapiCost: number;
    trackedMinutes: number;
    estimatedCost: number;
    variance: number;
  }>;
}

const COST_PER_MINUTE = 0.08;
const COST_PER_SMS = 0.02;
const COST_PER_CALL_AI = 0.03;

export async function getVapiBillingUsage(startDate: Date, endDate: Date): Promise<CostReconciliationResult> {
  const fleet = await storage.listTradeLineFleet();
  const perClientBreakdown: CostReconciliationResult["perClientBreakdown"] = [];
  let totalEstimatedCost = 0;
  let totalRevenue = 0;

  for (const item of fleet) {
    const usage = await storage.getTradeLineUsage(item.clientServiceId, startDate);
    if (!usage) continue;
    const minutes = usage.voice_minutes_used ?? 0;
    const calls = usage.calls_count ?? 0;
    const sms = usage.sms_count ?? 0;
    const estimatedCost = (minutes * COST_PER_MINUTE) + (sms * COST_PER_SMS) + (calls * COST_PER_CALL_AI);
    const profitability = await storage.getTradeLineProfitability(item.clientServiceId);
    const revenue = (profitability?.revenue ?? 0) / 100;

    perClientBreakdown.push({
      clientServiceId: item.clientServiceId,
      businessName: item.businessName,
      minutes,
      calls,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      revenue,
    });
    totalEstimatedCost += estimatedCost;
    totalRevenue += revenue;
  }

  let vapiActualCost = totalEstimatedCost;
  const vapiApiKey = process.env.VAPI_API_KEY;
  if (vapiApiKey) {
    try {
      const vapiCost = await fetchVapiCosts(vapiApiKey, startDate, endDate);
      if (vapiCost !== null) vapiActualCost = vapiCost;
    } catch (err) {
      log.warn("Failed to fetch Vapi billing data, using estimates", { error: (err as Error).message });
    }
  }

  const discrepancies: CostReconciliationResult["discrepancies"] = [];
  const margin = totalRevenue - vapiActualCost;
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  return {
    vapiCost: Math.round(vapiActualCost * 100) / 100,
    clientRevenue: Math.round(totalRevenue * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    marginPercent: Math.round(marginPercent * 10) / 10,
    periodStart: startDate.toISOString(),
    periodEnd: endDate.toISOString(),
    perClientBreakdown,
    discrepancies,
  };
}

async function fetchVapiCosts(apiKey: string, startDate: Date, endDate: Date): Promise<number | null> {
  try {
    const url = new URL("https://api.vapi.ai/call");
    url.searchParams.set("createdAtGt", startDate.toISOString());
    url.searchParams.set("createdAtLt", endDate.toISOString());
    url.searchParams.set("limit", "1000");
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resp.ok) return null;
    const calls = await resp.json();
    if (!Array.isArray(calls)) return null;
    let totalCost = 0;
    for (const call of calls) {
      if (call.cost != null) totalCost += Number(call.cost);
      else if (call.costs && Array.isArray(call.costs)) {
        for (const c of call.costs) totalCost += Number(c.cost ?? 0);
      }
    }
    return Math.round(totalCost * 100) / 100;
  } catch (err) {
    log.error("Failed to fetch Vapi billing costs", { error: (err as Error).message });
    return null;
  }
}
