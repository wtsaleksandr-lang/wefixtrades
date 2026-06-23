/**
 * Portal Lead Analytics — contractor-facing ROI dashboard for QuoteQuick.
 *
 * The audit flagged that a contractor had no way to see the return on their
 * QuoteQuick widget — how many leads it captures, the pipeline value, the
 * conversion rate against widget views. This module serves that surface.
 *
 *   GET /api/portal/leads/analytics   — aggregate rollup (KPIs, time series,
 *                                        by-calculator + by-source breakdowns).
 *   GET /api/portal/leads/list        — paginated lead list (contact, date,
 *                                        calculator, quote value, status).
 *
 * Auth scoping (no cross-tenant leakage)
 * ──────────────────────────────────────
 * Leads have no direct owner column. Ownership is:
 *   clients.id  →  clients.user_id  →  calculators.user_id  →  leads.calculator_id
 * Every query below filters leads to `calculator_id IN (calculators owned by
 * the authenticated client's user_id)`. The owned-calculator-id set is the
 * security boundary — an empty set short-circuits to an empty response, never
 * to an unscoped query. Same pattern as computeQuotequickDashboardKpis (Wave 29).
 *
 * Auth: requireClient. adminPreviewSafe-wrapped (admins previewing with no
 * clients row get a 200 empty shape, not a red 403 boundary).
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { db } from "../../db";
import { clients, calculators, leads } from "@shared/schema";
import { calculatorAnalyticsDaily } from "@shared/schemas/calculatorAnalytics";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalLeadAnalytics");

interface DailyPoint {
  date: string; // YYYY-MM-DD
  leads: number;
}

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
}

interface AnalyticsResponse {
  previewMode?: boolean;
  days: number;
  totals: {
    total_leads: number; // all-time
    leads_in_range: number; // within the selected window
    this_month: number; // current calendar month (UTC)
    total_quote_value: number; // sum of quote_amount, all-time
    avg_quote_value: number; // mean quote_amount over leads with a value
    views_in_range: number | null; // null when no view tracking data exists
    conversion_rate: number | null; // leads/views in range, null if no views
  };
  series: DailyPoint[];
  by_calculator: BreakdownRow[];
  by_source: BreakdownRow[];
}

const EMPTY_ANALYTICS = {
  previewMode: true,
  days: 30,
  totals: {
    total_leads: 0,
    leads_in_range: 0,
    this_month: 0,
    total_quote_value: 0,
    avg_quote_value: 0,
    views_in_range: null,
    conversion_rate: null,
  },
  series: [] as DailyPoint[],
  by_calculator: [] as BreakdownRow[],
  by_source: [] as BreakdownRow[],
} satisfies Record<string, unknown>;

const EMPTY_LIST = {
  previewMode: true,
  leads: [] as unknown[],
  page: 1,
  page_size: 25,
  total: 0,
  total_pages: 0,
};

/** Map a lead's UTM/referrer fields to a single human source label. */
function deriveSource(row: {
  utm_source: string | null;
  referrer: string | null;
}): { key: string; label: string } {
  const utm = row.utm_source?.trim();
  if (utm) return { key: utm.toLowerCase(), label: utm };
  const ref = row.referrer?.trim();
  if (ref) {
    try {
      const host = new URL(ref).hostname.replace(/^www\./, "");
      if (host) return { key: host.toLowerCase(), label: host };
    } catch {
      // Non-URL referrer — fall through to direct.
    }
  }
  return { key: "direct", label: "Direct / widget" };
}

/** Resolve the owned-calculator id set for the authenticated client. */
async function resolveOwnedCalculatorIds(
  clientId: number,
): Promise<{ ids: number[]; names: Map<number, string> }> {
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client?.user_id) return { ids: [], names: new Map() };

  const calcs = await db
    .select({
      id: calculators.id,
      business_name: calculators.business_name,
      trade_type: calculators.trade_type,
    })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id));

  const names = new Map<number, string>();
  for (const c of calcs) {
    names.set(c.id, c.business_name || c.trade_type || `Calculator #${c.id}`);
  }
  return { ids: calcs.map((c) => c.id), names };
}

export function registerPortalLeadAnalyticsRoutes(app: Express) {
  /* ─── Aggregate analytics ─── */
  app.get(
    "/api/portal/leads/analytics",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_ANALYTICS,
        });
        if (clientId === null) return;

        const daysParam = Number(req.query.days);
        const days =
          Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 365
            ? Math.floor(daysParam)
            : 30;

        const { ids: calcIds, names } =
          await resolveOwnedCalculatorIds(clientId);

        if (calcIds.length === 0) {
          res.json({ ...EMPTY_ANALYTICS, previewMode: undefined, days });
          return;
        }

        // Window cutoff (inclusive of `days` calendar days back, UTC).
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
        cutoff.setUTCHours(0, 0, 0, 0);

        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);

        const ownedLeads = and(inArray(leads.calculator_id, calcIds));

        // All-time totals + value (single aggregate query — no N+1).
        const [allTime] = await db
          .select({
            total_leads: sql<number>`count(*)::int`,
            total_quote_value: sql<number>`coalesce(sum(${leads.quote_amount}), 0)::bigint`,
            valued_count: sql<number>`count(${leads.quote_amount})::int`,
          })
          .from(leads)
          .where(ownedLeads);

        const totalQuoteValue = Number(allTime?.total_quote_value ?? 0);
        const valuedCount = allTime?.valued_count ?? 0;
        const avgQuoteValue =
          valuedCount > 0 ? Math.round(totalQuoteValue / valuedCount) : 0;

        // This-month count.
        const [monthRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(ownedLeads, gte(leads.created_date, monthStart)));

        // In-range count.
        const [rangeRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(ownedLeads, gte(leads.created_date, cutoff)));

        // Daily series across the window (single grouped query).
        const seriesRows = await db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${leads.created_date}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .where(and(ownedLeads, gte(leads.created_date, cutoff)))
          .groupBy(sql`date_trunc('day', ${leads.created_date})`);
        const byDay = new Map(seriesRows.map((r) => [r.day, r.count]));
        const series: DailyPoint[] = [];
        for (let i = 0; i < days; i++) {
          const d = new Date(cutoff.getTime() + i * 86_400_000);
          const key = d.toISOString().slice(0, 10);
          series.push({ date: key, leads: byDay.get(key) ?? 0 });
        }

        // By-calculator breakdown (grouped count, all-time).
        const calcRows = await db
          .select({
            calculator_id: leads.calculator_id,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .where(ownedLeads)
          .groupBy(leads.calculator_id);
        const byCalculator: BreakdownRow[] = calcRows
          .map((r) => ({
            key: String(r.calculator_id),
            label: names.get(r.calculator_id) ?? `Calculator #${r.calculator_id}`,
            count: r.count,
          }))
          .sort((a, b) => b.count - a.count);

        // By-source breakdown — pull lightweight source columns and bucket
        // in-app (utm_source / referrer host parsing isn't expressible in a
        // single portable GROUP BY). Capped at owned leads only.
        const sourceRows = await db
          .select({
            utm_source: leads.utm_source,
            referrer: leads.referrer,
          })
          .from(leads)
          .where(ownedLeads);
        const sourceMap = new Map<string, BreakdownRow>();
        for (const r of sourceRows) {
          const { key, label } = deriveSource(r);
          const existing = sourceMap.get(key);
          if (existing) existing.count += 1;
          else sourceMap.set(key, { key, label, count: 1 });
        }
        const bySource = Array.from(sourceMap.values()).sort(
          (a, b) => b.count - a.count,
        );

        // Views in range → real conversion rate (leads/views). Only emit a
        // rate when view tracking actually has data; never fabricate one.
        const cutoffDateStr = cutoff.toISOString().slice(0, 10);
        const [viewRow] = await db
          .select({
            views: sql<number>`coalesce(sum(${calculatorAnalyticsDaily.views}), 0)::int`,
          })
          .from(calculatorAnalyticsDaily)
          .where(
            and(
              inArray(calculatorAnalyticsDaily.calculator_id, calcIds),
              gte(calculatorAnalyticsDaily.date, cutoffDateStr),
            ),
          );
        const viewsInRange = viewRow?.views ?? 0;
        const leadsInRange = rangeRow?.count ?? 0;
        const conversionRate =
          viewsInRange > 0 ? leadsInRange / viewsInRange : null;

        const response: AnalyticsResponse = {
          days,
          totals: {
            total_leads: allTime?.total_leads ?? 0,
            leads_in_range: leadsInRange,
            this_month: monthRow?.count ?? 0,
            total_quote_value: totalQuoteValue,
            avg_quote_value: avgQuoteValue,
            views_in_range: viewsInRange > 0 ? viewsInRange : null,
            conversion_rate: conversionRate,
          },
          series,
          by_calculator: byCalculator,
          by_source: bySource,
        };

        res.json(response);
      } catch (err: any) {
        log.error("[portal/leads/analytics]", err?.message || err);
        res.status(500).json({ error: "Failed to load lead analytics" });
      }
    },
  );

  /* ─── Paginated lead list ─── */
  app.get(
    "/api/portal/leads/list",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_LIST,
        });
        if (clientId === null) return;

        const pageParam = Number(req.query.page);
        const page =
          Number.isFinite(pageParam) && pageParam >= 1
            ? Math.floor(pageParam)
            : 1;
        const sizeParam = Number(req.query.page_size);
        const pageSize =
          Number.isFinite(sizeParam) && sizeParam >= 1 && sizeParam <= 100
            ? Math.floor(sizeParam)
            : 25;

        const { ids: calcIds, names } =
          await resolveOwnedCalculatorIds(clientId);

        if (calcIds.length === 0) {
          res.json({ ...EMPTY_LIST, previewMode: undefined, page, page_size: pageSize });
          return;
        }

        const ownedLeads = inArray(leads.calculator_id, calcIds);

        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(ownedLeads);
        const total = countRow?.count ?? 0;
        const totalPages = Math.ceil(total / pageSize);

        const rows = await db
          .select({
            id: leads.id,
            calculator_id: leads.calculator_id,
            name: leads.name,
            email: leads.email,
            phone: leads.phone,
            quote_amount: leads.quote_amount,
            status: leads.status,
            utm_source: leads.utm_source,
            referrer: leads.referrer,
            created_date: leads.created_date,
          })
          .from(leads)
          .where(ownedLeads)
          .orderBy(desc(leads.created_date))
          .limit(pageSize)
          .offset((page - 1) * pageSize);

        const list = rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          quote_amount: r.quote_amount,
          status: r.status,
          calculator: names.get(r.calculator_id) ?? `Calculator #${r.calculator_id}`,
          source: deriveSource(r).label,
          created_date: r.created_date,
        }));

        res.json({
          leads: list,
          page,
          page_size: pageSize,
          total,
          total_pages: totalPages,
        });
      } catch (err: any) {
        log.error("[portal/leads/list]", err?.message || err);
        res.status(500).json({ error: "Failed to load leads" });
      }
    },
  );
}
