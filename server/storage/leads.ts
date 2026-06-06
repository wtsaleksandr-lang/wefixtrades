/**
 * Lead-related storage helpers extracted from server/storage.ts.
 *
 * These are pure functions over `db` — they don't depend on `this` and
 * don't call other DatabaseStorage methods. They're re-exported through
 * thin one-line wrappers on `DatabaseStorage` to preserve the public API
 * for all 151 existing consumers.
 *
 * Tables touched: leads, missedCallLeads, demoQuoteLeads, salesLeads.
 */

import { db } from "../db";
import {
  leads,
  calculators,
  missedCallLeads,
  demoQuoteLeads,
  salesLeads,
  type Lead,
  type InsertLead,
  type MissedCallLead,
  type InsertMissedCallLead,
  type DemoQuoteLead,
  type InsertDemoQuoteLead,
  type SalesLead,
  type InsertSalesLead,
} from "@shared/schema";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { isPaidTier, startOfMonthUTC } from "@shared/quotequickQuota";

// ─── QuoteQuick leads (calculator widget) ───

export async function createLead(data: InsertLead): Promise<Lead> {
  const [lead] = await db.insert(leads).values(data).returning();
  return lead;
}

export async function getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]> {
  return db.select().from(leads).where(eq(leads.calculator_id, calculatorId)).orderBy(desc(leads.created_date));
}

export async function searchLeads(calculatorId: number, query: string): Promise<Lead[]> {
  const pattern = `%${query}%`;
  return db.select().from(leads).where(
    and(
      eq(leads.calculator_id, calculatorId),
      or(
        ilike(leads.name, pattern),
        ilike(leads.email, pattern),
        ilike(leads.phone, pattern),
      )
    )
  ).orderBy(desc(leads.created_date));
}

export async function deleteLead(id: number, calculatorId: number): Promise<void> {
  await db.delete(leads).where(and(eq(leads.id, id), eq(leads.calculator_id, calculatorId)));
}

export async function getLeadCountSince(calculatorId: number, since: Date): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.calculator_id, calculatorId), gte(leads.created_date, since)));
  return result?.count || 0;
}

/**
 * Free-tier quota counting (account-scoped, current calendar month).
 *
 * Counts quote/lead captures across EVERY calculator owned by `userId` whose
 * `created_date` falls in the current calendar month (UTC). Aggregate query
 * over the existing `leads` table — no counter column / migration needed.
 * Also returns the account's plan tiers so the caller can classify free vs
 * paid via `isPaidTier()`.
 *
 * Returns `{ used: 0, isPaid: false }` for an account that owns no
 * calculators (a brand-new free account).
 */
export async function getAccountMonthlyQuoteUsage(
  userId: number,
  now: Date = new Date(),
): Promise<{ used: number; isPaid: boolean }> {
  // Owned calculators + their plan tiers in one round-trip.
  const calcs = await db
    .select({ id: calculators.id, plan_tier: calculators.plan_tier })
    .from(calculators)
    .where(eq(calculators.user_id, userId));

  if (calcs.length === 0) {
    return { used: 0, isPaid: false };
  }

  const isPaid = isPaidTier(calcs.map((c) => c.plan_tier));
  const calcIds = calcs.map((c) => c.id);
  const monthStart = startOfMonthUTC(now);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(inArray(leads.calculator_id, calcIds), gte(leads.created_date, monthStart)));

  return { used: result?.count ?? 0, isPaid };
}

/**
 * Capture-time variant: given the calculator a lead was just submitted to,
 * resolve its owning account and return that account's current-month usage.
 * Returns null when the calculator has no owner (anonymous portal calcs) —
 * the quota only applies to owned accounts.
 */
export async function getAccountMonthlyQuoteUsageByCalculator(
  calculatorId: number,
  now: Date = new Date(),
): Promise<{ used: number; isPaid: boolean } | null> {
  const [calc] = await db
    .select({ user_id: calculators.user_id })
    .from(calculators)
    .where(eq(calculators.id, calculatorId))
    .limit(1);

  if (!calc || calc.user_id == null) return null;
  return getAccountMonthlyQuoteUsage(calc.user_id, now);
}

export async function getQuoteQuickLeadTrend(days: number): Promise<Array<{ date: string; count: number }>> {
  const span = Math.max(1, Math.min(days, 365));
  const cutoff = new Date(Date.now() - (span - 1) * 86400000);
  cutoff.setHours(0, 0, 0, 0);

  const rows = await db.select({
    day: sql<string>`to_char(date_trunc('day', ${leads.created_date}), 'YYYY-MM-DD')`,
    count: sql<number>`count(*)::int`,
  })
    .from(leads)
    .where(gte(leads.created_date, cutoff))
    .groupBy(sql`date_trunc('day', ${leads.created_date})`);

  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const series: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(cutoff.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return series;
}

export async function markLeadReplied(leadId: number): Promise<Lead | undefined> {
  const [lead] = await db.update(leads)
    .set({ replied_at: new Date() })
    .where(eq(leads.id, leadId))
    .returning();
  return lead;
}

export async function getLeadById(id: number): Promise<Lead | undefined> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return lead;
}

export async function updateLeadStatus(id: number, status: string): Promise<Lead | undefined> {
  const [lead] = await db.update(leads).set({ status }).where(eq(leads.id, id)).returning();
  return lead;
}

export async function updateLead(id: number, updates: Record<string, any>): Promise<Lead | undefined> {
  const [lead] = await db.update(leads).set(updates).where(eq(leads.id, id)).returning();
  return lead;
}

export async function updateLeadAiPaused(leadId: number, calculatorId: number, paused: boolean): Promise<void> {
  await db
    .update(leads)
    .set({ ai_paused: paused })
    .where(and(eq(leads.id, leadId), eq(leads.calculator_id, calculatorId)));
}

// ─── Other lead sources ───

export async function createMissedCallLead(data: InsertMissedCallLead): Promise<MissedCallLead> {
  const [row] = await db.insert(missedCallLeads).values(data).returning();
  return row;
}

export async function createDemoQuoteLead(data: InsertDemoQuoteLead): Promise<DemoQuoteLead> {
  const [row] = await db.insert(demoQuoteLeads).values(data).returning();
  return row;
}

// ─── Sales leads (admin CRM) ───

export async function createSalesLead(data: InsertSalesLead): Promise<SalesLead> {
  const [row] = await db.insert(salesLeads).values(data).returning();
  return row;
}

export async function listSalesLeads(status?: string): Promise<SalesLead[]> {
  const conditions = [];
  if (status) conditions.push(eq(salesLeads.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(salesLeads).where(where).orderBy(desc(salesLeads.updated_at));
}

export async function updateSalesLead(id: number, updates: Partial<InsertSalesLead>): Promise<SalesLead | undefined> {
  const [row] = await db.update(salesLeads).set({ ...updates, updated_at: new Date() }).where(eq(salesLeads.id, id)).returning();
  return row;
}

export async function getSalesLeadById(id: number): Promise<SalesLead | undefined> {
  const [row] = await db.select().from(salesLeads).where(eq(salesLeads.id, id)).limit(1);
  return row;
}
