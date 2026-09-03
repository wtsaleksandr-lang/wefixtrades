/**
 * Portal AdFlow Dashboard KPIs.
 *
 * GET /api/portal/adflow/dashboard-kpis
 *
 * HONESTY CONTRACT (guarded by server/services/aiActions/handlers/adflow.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────
 * WeFixTrades has NO ad-platform integration. No Google Ads client, no Meta Ads
 * client, no ad-account OAuth, no read or write path to any campaign. AdFlow is
 * an agency-brokered managed service: a human runs the campaigns in the
 * customer's own ad accounts and reports the numbers back to us, and an ops
 * admin types them into the CRM.
 *
 * So this endpoint returns exactly two kinds of figure, and says which is which:
 *
 *   reported — what a person typed in, carried through verbatim, with the
 *              period, the entry date and the name of whoever entered it. If
 *              nothing was entered for the period, every field is null and the
 *              dashboard renders "no ad data entered for this period". We never
 *              fill a gap with an estimate.
 *
 *   measured — what THIS platform genuinely observed: quote requests captured
 *              by the customer's own WeFixTrades quote widget whose UTM tagging
 *              marks them as paid-ad traffic. Ownership follows the same chain
 *              as portal/leadAnalytics.ts:
 *                clients.id → clients.user_id → calculators.user_id
 *                            → leads.calculator_id
 *              which is the tenant-security boundary. A client with no quote
 *              widget has nothing to attribute against, so `supported` is false
 *              rather than a zero that could read as "your ads produced none".
 *
 * DELETED, and must not come back (see the guard):
 *   - revenue estimated as `bookings × $250`. Revenue is reported or absent.
 *   - `conversionRates.spendToReach = 100` / `bookToRevenue = 100`, two
 *     constants rendered as measured funnel pass-through rates.
 *   - a spend sparkline built by dumping a whole month's total into the single
 *     week bucket containing its period_end, which drew a monthly figure as a
 *     one-week spike. The trend now exists only when a real day-by-day
 *     breakdown was supplied.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  calculators,
  clients,
  clientServices,
  leads,
  serviceCatalog,
  adflowReports,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowDashboardKpis");

/** Figures a person typed in. Null means "not entered", never "zero". */
export interface ReportedFigures {
  hasData: boolean;
  periodLabel: string | null;
  /** ISO date the ops admin saved these numbers. Null on pre-provenance rows. */
  enteredAt: string | null;
  /** Name/email of the ops admin who saved them. Null on pre-provenance rows. */
  enteredBy: string | null;
  adSpendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  /** adSpendCents / leads. Arithmetic on two reported figures, nothing more. */
  costPerLeadCents: number | null;
  revenueCents: number | null;
  priorPeriodLabel: string | null;
  priorAdSpendCents: number | null;
  priorLeads: number | null;
  /**
   * Weekly spend, oldest → newest, ONLY when the ads team supplied a
   * day-by-day breakdown. Null when they reported period totals only.
   */
  spendTrend12w: number[] | null;
}

/** Figures WeFixTrades observed itself. */
export interface MeasuredFigures {
  /** False when the client has no WeFixTrades quote widget to attribute with. */
  supported: boolean;
  windowDays: number;
  /** Quote requests whose utm_medium marks them as paid-ad traffic. */
  quoteRequestsFromAds: number | null;
  /** All quote requests in the window, for context. */
  quoteRequestsTotal: number | null;
}

export interface DashboardResponse {
  previewMode?: boolean;
  hasAdflowService: boolean;
  reported: ReportedFigures;
  measured: MeasuredFigures;
}

const MEASURED_WINDOW_DAYS = 30;

const EMPTY_REPORTED: ReportedFigures = {
  hasData: false,
  periodLabel: null,
  enteredAt: null,
  enteredBy: null,
  adSpendCents: null,
  impressions: null,
  clicks: null,
  leads: null,
  costPerLeadCents: null,
  revenueCents: null,
  priorPeriodLabel: null,
  priorAdSpendCents: null,
  priorLeads: null,
  spendTrend12w: null,
};

const EMPTY_MEASURED: MeasuredFigures = {
  supported: false,
  windowDays: MEASURED_WINDOW_DAYS,
  quoteRequestsFromAds: null,
  quoteRequestsTotal: null,
};

const EMPTY_RESPONSE = {
  previewMode: true,
  hasAdflowService: false,
  reported: EMPTY_REPORTED,
  measured: EMPTY_MEASURED,
} satisfies Record<string, unknown>;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Reported fields arrive from a JSON blob typed by a human, so a value may be
 * absent, empty, or a numeric string. Absent stays absent — this returns null,
 * never 0, so "not entered" can never be rendered as a measured zero.
 */
function reportedNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function reportedStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * utm_medium values that unambiguously mark paid advertising traffic. Only
 * utm_medium is consulted: `utm_source=google` alone is just as likely organic,
 * and counting it would inflate what we claim the ads produced.
 */
const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "cpm",
  "cpv",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-search",
  "paidsocial",
  "paid_social",
  "paid-social",
  "display",
  "banner",
  "retargeting",
]);

export function isPaidAdMedium(medium: string | null | undefined): boolean {
  if (typeof medium !== "string") return false;
  return PAID_MEDIUMS.has(medium.trim().toLowerCase());
}

/**
 * Weekly spend buckets from an ops-supplied day-by-day breakdown. Returns null
 * unless at least one dated row with a cost carried through — a month total
 * with no daily detail has no weekly shape and must not be drawn as one.
 */
function buildSpendTrend(
  reports: Array<{ metrics: Record<string, unknown> }>,
): number[] | null {
  const weeks = new Array<number>(12).fill(0);
  const today = startOfDay(new Date());
  let sawDailyRow = false;

  for (const r of reports) {
    const breakdown = (r.metrics?.daily_breakdown ?? []) as Array<{
      date?: string;
      cost_cents?: number;
    }>;
    if (!Array.isArray(breakdown)) continue;
    for (const d of breakdown) {
      if (!d?.date) continue;
      const cost = reportedNum(d.cost_cents);
      if (cost === null) continue;
      const date = new Date(d.date + "T00:00:00Z");
      if (Number.isNaN(date.getTime())) continue;
      const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
      if (diffDays < 0 || diffDays >= 12 * 7) continue;
      const weekIdx = 11 - Math.floor(diffDays / 7);
      if (weekIdx < 0 || weekIdx >= 12) continue;
      weeks[weekIdx]! += cost;
      sawDailyRow = true;
    }
  }

  return sawDailyRow ? weeks : null;
}

/**
 * Quote requests this platform actually captured, restricted to the calculators
 * the authenticated client owns. The owned-id set IS the tenant boundary: an
 * empty set short-circuits, it never widens into an unscoped query.
 */
async function measureAdAttributedLeads(
  clientId: number,
): Promise<MeasuredFigures> {
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client?.user_id) return EMPTY_MEASURED;

  const calcs = await db
    .select({ id: calculators.id })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id));

  const calcIds = calcs.map((c) => c.id);
  if (calcIds.length === 0) return EMPTY_MEASURED;

  const since = new Date(Date.now() - MEASURED_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ utm_medium: leads.utm_medium })
    .from(leads)
    .where(
      and(inArray(leads.calculator_id, calcIds), gte(leads.created_date, since)),
    );

  let fromAds = 0;
  for (const row of rows) {
    if (isPaidAdMedium(row.utm_medium)) fromAds += 1;
  }

  return {
    supported: true,
    windowDays: MEASURED_WINDOW_DAYS,
    quoteRequestsFromAds: fromAds,
    quoteRequestsTotal: rows.length,
  };
}

export async function computeAdflowDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  const [svc] = await db
    .select({ cs_id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'adflow%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);

  if (!svc?.cs_id) {
    return {
      hasAdflowService: false,
      reported: EMPTY_REPORTED,
      measured: EMPTY_MEASURED,
    };
  }

  const measured = await measureAdAttributedLeads(clientId);

  const now = new Date();
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  const rows = await db
    .select({
      period_label: adflowReports.period_label,
      period_end: adflowReports.period_end,
      metrics: adflowReports.metrics,
    })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, svc.cs_id),
        gte(adflowReports.period_end, ninetyAgo),
      ),
    )
    .orderBy(desc(adflowReports.period_end))
    .limit(12);

  const typed = rows.map((r) => ({
    period_label: r.period_label,
    period_end: r.period_end,
    metrics: (r.metrics ?? {}) as Record<string, unknown>,
  }));

  if (typed.length === 0) {
    return {
      hasAdflowService: true,
      reported: EMPTY_REPORTED,
      measured,
    };
  }

  // The latest report IS the current period. No blending across periods, no
  // filling a missing month from its neighbours.
  const latest = typed[0]!;
  const prior = typed[1] ?? null;
  const m = latest.metrics;

  const adSpendCents = reportedNum(m.cost_spent_cents);
  const leadsReported = reportedNum(m.leads_generated);
  const costPerLeadCents =
    adSpendCents !== null && leadsReported !== null && leadsReported > 0
      ? Math.round(adSpendCents / leadsReported)
      : null;

  const reported: ReportedFigures = {
    hasData: true,
    periodLabel: latest.period_label ?? null,
    enteredAt: reportedStr(m.entered_at),
    enteredBy: reportedStr(m.entered_by_name),
    adSpendCents,
    impressions: reportedNum(m.impressions),
    clicks: reportedNum(m.clicks),
    leads: leadsReported,
    costPerLeadCents,
    revenueCents: reportedNum(m.revenue_earned_cents),
    priorPeriodLabel: prior?.period_label ?? null,
    priorAdSpendCents: prior ? reportedNum(prior.metrics.cost_spent_cents) : null,
    priorLeads: prior ? reportedNum(prior.metrics.leads_generated) : null,
    spendTrend12w: buildSpendTrend(typed),
  };

  return { hasAdflowService: true, reported, measured };
}

export function registerPortalAdflowDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeAdflowDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/adflow/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
