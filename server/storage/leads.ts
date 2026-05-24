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
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";

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
