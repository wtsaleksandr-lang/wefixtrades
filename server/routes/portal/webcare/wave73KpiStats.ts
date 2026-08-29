/**
 * Portal WebCare — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/webcare/stats/score?type=site_health  — SemiGauge
 *   GET /api/portal/webcare/stats/monthly?months=6        — MonthlyBarSeries
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog } from "@shared/schema";
import { webcareActionLog } from "@shared/schemas/adminCrm";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
// Single source of truth for "what security did we actually measure" — see
// the honesty contract in dashboardKpis.ts. Never re-derive a score here.
import { computeSecurity } from "./dashboardKpis";

const log = createLogger("PortalWebcareWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface ScoreResponse {
  /** null when we have measured nothing — never a placeholder number. */
  value: number | null;
  verdict: string;
  advice: string;
  data_status: "real" | "illustrative" | "unavailable";
}
interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}

const scoreCache = new Map<string, Cached<ScoreResponse>>();
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();

const EMPTY_SCORE: ScoreResponse = {
  value: null,
  verdict: "Not measured yet",
  advice: "Provision WebCare to begin tracking site health.",
  data_status: "unavailable",
};
const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };

function monthLabels(months: number): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({
      label: start.toLocaleString(undefined, { month: "short" }),
      start,
      end,
    });
  }
  return out;
}

interface UptimeEntry {
  ts: string;
  status: "up" | "down";
}

/** null with no checks — "we never polled it" is not "100% available". */
function computeUptimePct(history: UptimeEntry[]): number | null {
  if (history.length === 0) return null;
  const upCount = history.filter((h) => h.status === "up").length;
  return Math.round((upCount / history.length) * 10_000) / 100;
}

export async function computeWebcareSiteHealthScore(
  clientId: number,
): Promise<ScoreResponse> {
  const [svc] = await db
    .select({
      cs_id: clientServices.id,
      cs_metadata: clientServices.metadata,
    })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'webcare%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);

  if (!svc?.cs_id) {
    return {
      value: null,
      verdict: "Not measured yet",
      advice: "Provision WebCare to begin tracking site health.",
      data_status: "unavailable",
    };
  }

  const csMeta = (svc.cs_metadata as Record<string, unknown>) ?? {};
  const history = Array.isArray(csMeta.uptime_history)
    ? (csMeta.uptime_history as UptimeEntry[])
    : [];

  // Blend ONLY measured components, weighted by what we actually have.
  // The old formula was uptime*0.5 + perf*0.3 + security*0.2 where perf and
  // security both read metadata keys nothing writes — so they contributed a
  // hard 0 and the result (~50 for a perfectly healthy site) was returned
  // with data_status:"real". Nothing may enter this average unmeasured.
  const uptimePct = computeUptimePct(history);
  const { grade } = computeSecurity(csMeta);

  const parts: Array<{ value: number; weight: number }> = [];
  if (uptimePct !== null) parts.push({ value: uptimePct, weight: 0.7 });
  if (grade) parts.push({ value: grade.score, weight: 0.3 });

  if (parts.length === 0) {
    return {
      value: null,
      verdict: "Not measured yet",
      advice: "Your first uptime check and health sweep haven't run yet — this fills in automatically.",
      data_status: "unavailable",
    };
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const value = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight);

  const verdict =
    value >= 80 ? "Healthy site"
      : value >= 50 ? "Improvements available"
        : "Action required";
  const advice =
    value >= 80
      ? "Uptime and site security checks are both in good shape."
      : value >= 50
        ? "Apply the pending plugin updates to lift this above 80."
        : "Apply security hardening and pending updates — site needs attention.";

  return { value, verdict, advice, data_status: "real" };
}

const INCIDENT_TYPES = ["downtime", "malware", "security_alert", "incident"] as const;
const INCIDENT_SEVERITIES = ["warning", "failed"] as const;

export async function computeWebcareMonthlyIncidents(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const labels = monthLabels(months);
  const periodStart = labels[0]!.start;

  const rows = await db
    .select({
      recorded_at: webcareActionLog.recorded_at,
      event_type: webcareActionLog.event_type,
      severity: webcareActionLog.severity,
    })
    .from(webcareActionLog)
    .where(
      and(
        eq(webcareActionLog.client_id, clientId),
        gte(webcareActionLog.recorded_at, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const count = rows.filter((r) => {
      if (!r.recorded_at) return false;
      if (r.recorded_at < m.start || r.recorded_at >= m.end) return false;
      const t = (r.event_type ?? "").toLowerCase();
      const s = (r.severity ?? "").toLowerCase();
      return (
        (INCIDENT_TYPES as readonly string[]).includes(t) ||
        (INCIDENT_SEVERITIES as readonly string[]).includes(s)
      );
    }).length;
    return {
      label: m.label,
      value: count,
      highlighted: idx === labels.length - 1,
    };
  });
  const anyData = data.some((d) => d.value > 0);
  if (!anyData) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.max(0, 3 - i),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export function registerPortalWebcareWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/webcare/stats/score",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_SCORE as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = scoreCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeWebcareSiteHealthScore(clientId);
        scoreCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/webcare/stats/score]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/webcare/stats/monthly",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_MONTHLY as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const months = Math.max(1, Math.min(12, Number(req.query.months) || 6));
        const cacheKey = `${clientId}:${months}`;
        const cached = monthlyCache.get(cacheKey);
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeWebcareMonthlyIncidents(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/webcare/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
