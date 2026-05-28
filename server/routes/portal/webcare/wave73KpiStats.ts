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

const log = createLogger("PortalWebcareWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface ScoreResponse {
  value: number;
  verdict: string;
  advice: string;
  data_status: "real" | "illustrative";
}
interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}

const scoreCache = new Map<string, Cached<ScoreResponse>>();
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();

const EMPTY_SCORE: ScoreResponse = {
  value: 0,
  verdict: "Action required",
  advice: "Provision WebCare to begin tracking site health.",
  data_status: "illustrative",
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

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return fallback;
}

interface UptimeEntry {
  ts: string;
  status: "up" | "down";
}

function computeUptimePct(history: UptimeEntry[]): number {
  if (history.length === 0) return 100;
  const upCount = history.filter((h) => h.status === "up").length;
  return Math.round((upCount / history.length) * 10_000) / 100;
}

function securityScoreFromState(state: Record<string, unknown>): number {
  const factors: Array<{ key: string; weight: number }> = [
    { key: "malware_clean", weight: 25 },
    { key: "ssl_valid", weight: 15 },
    { key: "wp_core_current", weight: 15 },
    { key: "plugins_current", weight: 15 },
    { key: "themes_current", weight: 10 },
    { key: "admin_2fa", weight: 10 },
    { key: "passwords_clean", weight: 10 },
  ];
  let score = 0;
  for (const f of factors) {
    if (bool(state[f.key], false)) score += f.weight;
  }
  return score;
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
      value: 75,
      verdict: "Improvements available",
      advice: "Run pending updates and check the Lighthouse score to lift this above 80.",
      data_status: "illustrative",
    };
  }

  const csMeta = (svc.cs_metadata as Record<string, unknown>) ?? {};
  const securityState = (csMeta.webcare_security_state as Record<string, unknown>) ?? {};
  const history = Array.isArray(csMeta.uptime_history)
    ? (csMeta.uptime_history as UptimeEntry[])
    : [];
  const perfState = (csMeta.webcare_perf_state as Record<string, unknown>) ?? {};

  const uptimePct = computeUptimePct(history);
  const sec = securityScoreFromState(securityState);
  const perfDesktop = num(perfState.desktop_score);
  const perfMobile = num(perfState.mobile_score);
  const perfAvg = perfDesktop > 0 && perfMobile > 0
    ? Math.round((perfDesktop + perfMobile) / 2)
    : Math.max(perfDesktop, perfMobile);

  if (uptimePct + sec + perfAvg === 0) {
    return {
      value: 75,
      verdict: "Improvements available",
      advice: "Workers haven't recorded any data yet — check back after the next maintenance cycle.",
      data_status: "illustrative",
    };
  }

  const value = Math.round(uptimePct * 0.5 + perfAvg * 0.3 + sec * 0.2);
  const verdict =
    value >= 80 ? "Healthy site"
      : value >= 50 ? "Improvements available"
        : "Action required";
  const advice =
    value >= 80
      ? "Uptime, performance, and security all in good shape."
      : value >= 50
        ? "Run pending updates and check the Lighthouse score to lift this above 80."
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
