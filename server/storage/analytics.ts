/**
 * Analytics storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: analytics_events, calculator_analytics_summary,
 * leads (read-only for getAvgQuoteAmount).
 *
 * Scope: per-calculator analytics counters and rollups consumed by the owner
 * dashboard (event counts, weekly trend, daily counts, best day, average
 * quote amount) plus the persistent analytics_summary upsert/read pair used
 * by the background rollup worker.
 */

import { db } from "../db";
import {
  analyticsEvents,
  calculatorAnalyticsSummary,
  leads,
  type AnalyticsEvent, type InsertAnalyticsEvent,
  type AnalyticsSummary, type InsertAnalyticsSummary,
} from "@shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export async function trackEvent(data: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
  const [event] = await db.insert(analyticsEvents).values(data).returning();
  return event;
}

export async function getEventCounts(
  calculatorId: number,
  since: Date,
): Promise<{ views: number; leads: number; quotes: number }> {
  const rows = await db.select({
    event_type: analyticsEvents.event_type,
    count: sql<number>`count(*)::int`,
  })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.calculator_id, calculatorId), gte(analyticsEvents.created_at, since)))
    .groupBy(analyticsEvents.event_type);

  const counts = { views: 0, leads: 0, quotes: 0 };
  for (const r of rows) {
    if (r.event_type === 'view') counts.views = r.count;
    else if (r.event_type === 'lead') counts.leads = r.count;
    else if (r.event_type === 'quote_generated') counts.quotes = r.count;
  }
  return counts;
}

export async function getWeeklyTrend(
  calculatorId: number,
): Promise<{ week: string; views: number; leads: number }[]> {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  const rows = await db.select({
    week: sql<string>`to_char(date_trunc('week', ${analyticsEvents.created_at}), 'YYYY-MM-DD')`,
    event_type: analyticsEvents.event_type,
    count: sql<number>`count(*)::int`,
  })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.calculator_id, calculatorId), gte(analyticsEvents.created_at, eightWeeksAgo)))
    .groupBy(sql`date_trunc('week', ${analyticsEvents.created_at})`, analyticsEvents.event_type)
    .orderBy(sql`date_trunc('week', ${analyticsEvents.created_at})`);

  const weekMap = new Map<string, { views: number; leads: number }>();
  for (const r of rows) {
    const existing = weekMap.get(r.week) || { views: 0, leads: 0 };
    if (r.event_type === 'view') existing.views = r.count;
    else if (r.event_type === 'lead') existing.leads = r.count;
    weekMap.set(r.week, existing);
  }
  return Array.from(weekMap.entries()).map(([week, data]) => ({ week, ...data }));
}

export async function getAvgQuoteAmount(calculatorId: number): Promise<number> {
  const [result] = await db.select({ avg: sql<number>`coalesce(avg(${leads.quote_amount}), 0)::int` })
    .from(leads)
    .where(and(eq(leads.calculator_id, calculatorId), sql`${leads.quote_amount} is not null`));
  return result?.avg || 0;
}

export async function getAnalyticsSummary(
  calculatorId: number,
): Promise<AnalyticsSummary | undefined> {
  const [summary] = await db.select().from(calculatorAnalyticsSummary)
    .where(eq(calculatorAnalyticsSummary.calculator_id, calculatorId))
    .orderBy(desc(calculatorAnalyticsSummary.period_date))
    .limit(1);
  return summary;
}

export async function upsertAnalyticsSummary(
  data: InsertAnalyticsSummary,
): Promise<AnalyticsSummary> {
  const existing = await getAnalyticsSummary(data.calculator_id);
  if (existing) {
    const [updated] = await db.update(calculatorAnalyticsSummary)
      .set({ ...data })
      .where(eq(calculatorAnalyticsSummary.calculator_id, data.calculator_id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(calculatorAnalyticsSummary).values(data).returning();
  return created;
}

export async function getDailyEventCounts(
  calculatorId: number,
  date: Date,
): Promise<{ views: number; leads: number; quotes: number }> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const rows = await db.select({
    event_type: analyticsEvents.event_type,
    count: sql<number>`count(*)::int`,
  })
    .from(analyticsEvents)
    .where(and(
      eq(analyticsEvents.calculator_id, calculatorId),
      gte(analyticsEvents.created_at, dayStart),
      sql`${analyticsEvents.created_at} <= ${dayEnd}`,
    ))
    .groupBy(analyticsEvents.event_type);

  const counts = { views: 0, leads: 0, quotes: 0 };
  for (const r of rows) {
    if (r.event_type === 'view') counts.views = r.count;
    else if (r.event_type === 'lead') counts.leads = r.count;
    else if (r.event_type === 'quote_generated') counts.quotes = r.count;
  }
  return counts;
}

export async function getBestDay(calculatorId: number, since: Date): Promise<string | null> {
  const rows = await db.select({
    day: sql<string>`to_char(${analyticsEvents.created_at}::date, 'Day')`,
    count: sql<number>`count(*)::int`,
  })
    .from(analyticsEvents)
    .where(and(
      eq(analyticsEvents.calculator_id, calculatorId),
      gte(analyticsEvents.created_at, since),
      eq(analyticsEvents.event_type, 'lead'),
    ))
    .groupBy(sql`${analyticsEvents.created_at}::date, to_char(${analyticsEvents.created_at}::date, 'Day')`)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  return rows.length > 0 ? rows[0].day.trim() : null;
}
