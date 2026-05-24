/**
 * TradeLine storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`. Internal helpers call each other
 * directly within this module. The DatabaseStorage class re-exports these
 * through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched:
 *   - clientServices (metadata.tradeline read/write for config + mode)
 *   - tradelineCallLog
 *   - tradelineUsage
 *   - tradelineModeLog
 *
 * Helpers formerly on `this`:
 *   - this.getClientServiceById  → inlined as local getClientServiceById
 *   - this.getTradeLineConfig    → in this module
 *   - this.updateTradeLineConfig → in this module
 *   - this.upsertTradeLineUsage  → in this module
 *   - this.getTradeLineUsage     → in this module
 */

import { db } from "../db";
import {
  clientServices,
  clients,
  tradelineCallLog,
  tradelineUsage,
  tradelineModeLog,
  tradelineConfigSchema,
  type ClientService,
  type TradelineConfig,
  type TradelineUsage,
  type TradelineCallLog,
  type InsertTradelineCallLog,
  type TradelineModeLog,
} from "@shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

// ─── local helper (mirrors DatabaseStorage.getClientServiceById) ───
async function getClientServiceById(id: number): Promise<ClientService | undefined> {
  const [row] = await db.select().from(clientServices).where(eq(clientServices.id, id)).limit(1);
  return row;
}

// ─── Config ───

export async function getTradeLineConfig(clientServiceId: number): Promise<TradelineConfig | undefined> {
  const cs = await getClientServiceById(clientServiceId);
  if (!cs) return undefined;
  const raw = (cs.metadata as Record<string, any>)?.tradeline;
  if (!raw) return undefined;
  return tradelineConfigSchema.parse(raw);
}

export async function updateTradeLineConfig(
  clientServiceId: number,
  partialConfig: Partial<TradelineConfig>,
): Promise<TradelineConfig> {
  const cs = await getClientServiceById(clientServiceId);
  const existing = (cs?.metadata as Record<string, any>) ?? {};
  const current = existing.tradeline
    ? tradelineConfigSchema.parse(existing.tradeline)
    : tradelineConfigSchema.parse({});

  // Deep merge: for plain-object sub-keys (channels, website, phoneRouting, etc.)
  // spread-merge instead of overwriting, so partial updates don't wipe sibling fields.
  const merged: Record<string, any> = { ...current };
  for (const [key, value] of Object.entries(partialConfig)) {
    const cur = (current as Record<string, any>)[key];
    if (value != null && typeof value === "object" && !Array.isArray(value) && cur && typeof cur === "object" && !Array.isArray(cur)) {
      merged[key] = { ...cur, ...value };
    } else {
      merged[key] = value;
    }
  }

  const updated = { ...existing, tradeline: merged };
  await db.update(clientServices)
    .set({ metadata: updated, updated_at: new Date() })
    .where(eq(clientServices.id, clientServiceId));
  return tradelineConfigSchema.parse(merged);
}

export async function setTradeLineMode(
  clientServiceId: number,
  newMode: string,
  changedBy: string,
  reason?: string,
): Promise<TradelineModeLog> {
  const config = await getTradeLineConfig(clientServiceId) ?? tradelineConfigSchema.parse({});
  const oldMode = config.currentMode;

  // Update the config
  await updateTradeLineConfig(clientServiceId, { currentMode: newMode as TradelineConfig["currentMode"] });

  // Log the change
  const [log] = await db.insert(tradelineModeLog).values({
    client_service_id: clientServiceId,
    old_mode: oldMode,
    new_mode: newMode,
    changed_by: changedBy,
    reason: reason ?? null,
  }).returning();
  return log;
}

// ─── Call logs ───

export async function createTradeLineCallLog(data: InsertTradelineCallLog): Promise<TradelineCallLog | null> {
  // Idempotent: skip if a row with the same vapi_call_id already exists
  const rows = await db.insert(tradelineCallLog).values(data)
    .onConflictDoNothing({ target: tradelineCallLog.vapi_call_id })
    .returning();
  return rows[0] ?? null;
}

export async function listTradeLineCalls(clientServiceId: number, limit = 50): Promise<TradelineCallLog[]> {
  return db.select().from(tradelineCallLog)
    .where(eq(tradelineCallLog.client_service_id, clientServiceId))
    .orderBy(desc(tradelineCallLog.created_at))
    .limit(limit);
}

export async function getTradeLineCallById(callId: number): Promise<TradelineCallLog | undefined> {
  const [row] = await db.select().from(tradelineCallLog)
    .where(eq(tradelineCallLog.id, callId))
    .limit(1);
  return row;
}

export async function listAllTradeLineCalls(filters: {
  clientId?: number;
  from?: Date;
  to?: Date;
  outcome?: string;
  limit?: number;
  offset?: number;
}): Promise<{ calls: (TradelineCallLog & { business_name: string; client_id: number })[]; total: number }> {
  const conditions = [];
  if (filters.clientId) {
    conditions.push(sql`${tradelineCallLog.client_service_id} IN (SELECT id FROM client_services WHERE client_id = ${filters.clientId})`);
  }
  if (filters.from) {
    conditions.push(gte(tradelineCallLog.created_at, filters.from));
  }
  if (filters.to) {
    conditions.push(sql`${tradelineCallLog.created_at} <= ${filters.to}`);
  }
  if (filters.outcome) {
    conditions.push(eq(tradelineCallLog.outcome, filters.outcome));
  }
  conditions.push(sql`${tradelineCallLog.client_service_id} IN (SELECT id FROM client_services WHERE service_id LIKE 'tradeline%')`);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult] = await db.select({ total: sql<number>`count(*)::int` }).from(tradelineCallLog).where(whereClause);
  const rows = await db.select({
    id: tradelineCallLog.id, client_service_id: tradelineCallLog.client_service_id, vapi_call_id: tradelineCallLog.vapi_call_id,
    direction: tradelineCallLog.direction, caller_number: tradelineCallLog.caller_number, duration_seconds: tradelineCallLog.duration_seconds,
    outcome: tradelineCallLog.outcome, started_at: tradelineCallLog.started_at, ended_at: tradelineCallLog.ended_at,
    summary: tradelineCallLog.summary, transcript_json: tradelineCallLog.transcript_json, recording_url: tradelineCallLog.recording_url,
    created_at: tradelineCallLog.created_at, business_name: clients.business_name, client_id: clients.id,
  }).from(tradelineCallLog)
    .innerJoin(clientServices, eq(tradelineCallLog.client_service_id, clientServices.id))
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(whereClause).orderBy(desc(tradelineCallLog.created_at)).limit(limit).offset(offset);
  return { calls: rows as any, total: countResult?.total ?? 0 };
}

export async function updateTradeLineCallLeadData(callLogId: number, leadData: Record<string, unknown>): Promise<void> {
  await db.update(tradelineCallLog)
    .set({ transcript_json: sql`COALESCE(${tradelineCallLog.transcript_json}, '{}'::jsonb) || jsonb_build_object('lead_data', ${JSON.stringify(leadData)}::jsonb)` })
    .where(eq(tradelineCallLog.id, callLogId));
}

// ─── Fleet ───

export async function listTradeLineFleet(): Promise<Array<{
  clientServiceId: number;
  clientId: number;
  businessName: string;
  serviceId: string;
  status: string;
  variant: string;
  mode: string;
  assistantStatus: string;
  lastCallAt: string | null;
  periodMinutes: number;
  failedCalls24h: number;
}>> {
  const services = await db.select({
    id: clientServices.id,
    client_id: clientServices.client_id,
    service_id: clientServices.service_id,
    status: clientServices.status,
    metadata: clientServices.metadata,
    business_name: clients.business_name,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(sql`${clientServices.service_id} LIKE 'tradeline%'`)
    .orderBy(clients.business_name);
  const result = [];
  for (const svc of services) {
    const meta = (svc.metadata as Record<string, any>) ?? {};
    const tradeline = meta?.tradeline ?? {};
    const [lastCall] = await db.select({ created_at: tradelineCallLog.created_at })
      .from(tradelineCallLog).where(eq(tradelineCallLog.client_service_id, svc.id))
      .orderBy(desc(tradelineCallLog.created_at)).limit(1);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failedCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tradelineCallLog).where(and(
        eq(tradelineCallLog.client_service_id, svc.id),
        eq(tradelineCallLog.outcome, "failed"),
        gte(tradelineCallLog.created_at, twentyFourHoursAgo),
      ));
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [usageRow] = await db.select({ voice_minutes_used: tradelineUsage.voice_minutes_used })
      .from(tradelineUsage).where(and(
        eq(tradelineUsage.client_service_id, svc.id),
        eq(tradelineUsage.period_start, periodStart),
      )).limit(1);
    result.push({
      clientServiceId: svc.id,
      clientId: svc.client_id,
      businessName: svc.business_name,
      serviceId: svc.service_id,
      status: svc.status,
      variant: tradeline.variant || "complete",
      mode: tradeline.currentMode || "available",
      assistantStatus: tradeline.assistant?.status || "not_built",
      lastCallAt: lastCall?.created_at?.toISOString() ?? null,
      periodMinutes: usageRow?.voice_minutes_used ?? 0,
      failedCalls24h: failedCount?.count ?? 0,
    });
  }
  return result;
}

// ─── Usage ───

export async function upsertTradeLineUsage(
  clientServiceId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<TradelineUsage> {
  // Try to find existing usage row for this period
  const [existing] = await db.select().from(tradelineUsage)
    .where(and(
      eq(tradelineUsage.client_service_id, clientServiceId),
      eq(tradelineUsage.period_start, periodStart),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(tradelineUsage)
      .set({ updated_at: new Date() })
      .where(eq(tradelineUsage.id, existing.id))
      .returning();
    return updated;
  }

  const [row] = await db.insert(tradelineUsage).values({
    client_service_id: clientServiceId,
    period_start: periodStart,
    period_end: periodEnd,
  }).returning();
  return row;
}

export async function getTradeLineUsage(
  clientServiceId: number,
  periodStart?: Date,
): Promise<TradelineUsage | undefined> {
  if (periodStart) {
    const [row] = await db.select().from(tradelineUsage)
      .where(and(
        eq(tradelineUsage.client_service_id, clientServiceId),
        eq(tradelineUsage.period_start, periodStart),
      ))
      .limit(1);
    return row;
  }
  // Default: most recent period
  const [row] = await db.select().from(tradelineUsage)
    .where(eq(tradelineUsage.client_service_id, clientServiceId))
    .orderBy(desc(tradelineUsage.period_start))
    .limit(1);
  return row;
}

export async function incrementTradeLineUsage(
  clientServiceId: number,
  periodStart: Date,
  periodEnd: Date,
  increments: { voiceMinutes?: number; calls?: number; sms?: number },
): Promise<TradelineUsage> {
  // Ensure usage row exists
  const usage = await upsertTradeLineUsage(clientServiceId, periodStart, periodEnd);

  const newVoiceMinutes = (usage.voice_minutes_used ?? 0) + (increments.voiceMinutes ?? 0);
  const newCalls = (usage.calls_count ?? 0) + (increments.calls ?? 0);
  const newSms = (usage.sms_count ?? 0) + (increments.sms ?? 0);
  const includedMinutes = usage.included_minutes ?? 200;
  const overage = Math.max(0, newVoiceMinutes - includedMinutes);

  const [updated] = await db.update(tradelineUsage)
    .set({
      voice_minutes_used: newVoiceMinutes,
      calls_count: newCalls,
      sms_count: newSms,
      overage_minutes: overage,
      updated_at: new Date(),
    })
    .where(eq(tradelineUsage.id, usage.id))
    .returning();

  return updated;
}

export async function listTradeLineModeChanges(clientServiceId: number, limit = 50): Promise<TradelineModeLog[]> {
  return db.select().from(tradelineModeLog)
    .where(eq(tradelineModeLog.client_service_id, clientServiceId))
    .orderBy(desc(tradelineModeLog.created_at))
    .limit(limit);
}

/**
 * Calculate TradeLine profitability for a client service.
 * Uses current period usage data + service price.
 *
 * Cost rates (internal, not exposed to clients):
 *   Voice: $0.08/min  (Vapi + ElevenLabs + Deepgram blended)
 *   SMS:   $0.02/msg  (Twilio outbound)
 *   AI:    estimated from call count at ~$0.03/call (LLM tokens)
 */
export async function getTradeLineProfitability(clientServiceId: number): Promise<{
  revenue: number;
  voiceCost: number;
  smsCost: number;
  aiCost: number;
  totalCost: number;
  profit: number;
  margin: number;
}> {
  const COST_PER_VOICE_MINUTE = 8;   // cents
  const COST_PER_SMS = 2;            // cents
  const COST_PER_CALL_AI = 3;        // cents (avg LLM cost per call)

  const cs = await getClientServiceById(clientServiceId);
  const revenue = cs?.price_cents ?? 0;

  const usage = await getTradeLineUsage(clientServiceId);
  if (!usage) {
    return { revenue, voiceCost: 0, smsCost: 0, aiCost: 0, totalCost: 0, profit: revenue, margin: revenue > 0 ? 100 : 0 };
  }

  const voiceCost = (usage.voice_minutes_used ?? 0) * COST_PER_VOICE_MINUTE;
  const smsCost = (usage.sms_count ?? 0) * COST_PER_SMS;
  const aiCost = (usage.calls_count ?? 0) * COST_PER_CALL_AI;
  const totalCost = voiceCost + smsCost + aiCost;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  return { revenue, voiceCost, smsCost, aiCost, totalCost, profit, margin };
}

// ─── Phone-number lookups ───

export async function findClientServiceByVapiPhoneNumberId(vapiPhoneNumberId: string): Promise<number | null> {
  const rows = await db.select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
        sql`${clientServices.metadata}->'tradeline'->'assistant'->>'vapiPhoneNumberId' = ${vapiPhoneNumberId}`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function findClientServiceByPrimaryBusinessNumber(phoneNumber: string): Promise<number | null> {
  const rows = await db.select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
        sql`${clientServices.metadata}->'tradeline'->'phoneRouting'->>'primaryBusinessNumber' = ${phoneNumber}`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
