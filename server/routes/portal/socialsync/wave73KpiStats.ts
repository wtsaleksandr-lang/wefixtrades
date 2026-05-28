/**
 * Portal SocialSync — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/socialsync/stats/monthly?months=6      — MonthlyBarSeries
 *   GET /api/portal/socialsync/stats/segments?dimension=platform — DonutChart
 *   GET /api/portal/socialsync/stats/peak?metric=top_post  — SparklineWithPeak
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { socialsyncPosts } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalSocialsyncWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}
interface SegmentResponse {
  data: Array<{ label: string; value: number; color?: string }>;
  data_status: "real" | "illustrative";
}
interface PeakSeriesResponse {
  data: number[];
  peakLabel: string;
  peakIndex: number;
  data_status: "real" | "illustrative";
}

const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();
const segmentsCache = new Map<string, Cached<SegmentResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();

const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };
const EMPTY_SEGMENTS: SegmentResponse = { data: [], data_status: "illustrative" };
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};

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

export async function computeSocialsyncMonthlySeries(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const labels = monthLabels(months);
  const periodStart = labels[0]!.start;

  const rows = await db
    .select({
      created_at: socialsyncPosts.created_at,
    })
    .from(socialsyncPosts)
    .where(
      and(
        eq(socialsyncPosts.client_id, clientId),
        sql`status IN ('queued','ready','publishing','published')`,
        gte(socialsyncPosts.created_at, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const count = rows.filter(
      (r) => r.created_at && r.created_at >= m.start && r.created_at < m.end,
    ).length;
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
        value: Math.round(3 + i * 1.4),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export async function computeSocialsyncPlatformCounts(
  clientId: number,
): Promise<SegmentResponse> {
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db
    .select({
      platform: socialsyncPosts.platform,
      n: sql<number>`count(*)::int`,
    })
    .from(socialsyncPosts)
    .where(
      and(
        eq(socialsyncPosts.client_id, clientId),
        gte(socialsyncPosts.created_at, thirtyAgo),
      ),
    )
    .groupBy(socialsyncPosts.platform);

  if (rows.length === 0) {
    return {
      data: [
        { label: "Facebook", value: 8 },
        { label: "Instagram", value: 6 },
        { label: "X", value: 3 },
        { label: "LinkedIn", value: 4 },
        { label: "Google Business", value: 2 },
      ],
      data_status: "illustrative",
    };
  }

  const platformLabel = (p: string): string => {
    if (p === "google_business") return "Google Business";
    return p.charAt(0).toUpperCase() + p.slice(1);
  };
  return {
    data: rows.map((r) => ({
      label: platformLabel(r.platform),
      value: Number(r.n) || 0,
    })),
    data_status: "real",
  };
}

export async function computeSocialsyncTopPostEngagement(
  clientId: number,
): Promise<PeakSeriesResponse> {
  // Engagement isn't stored yet — use 14-day publish velocity (published count
  // per day) as a proxy.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const fourteenAgo = new Date(today.getTime() - 14 * 86_400_000);
  const rows = await db
    .select({
      published_at: socialsyncPosts.published_at,
    })
    .from(socialsyncPosts)
    .where(
      and(
        eq(socialsyncPosts.client_id, clientId),
        eq(socialsyncPosts.status, "published"),
        gte(socialsyncPosts.published_at, fourteenAgo),
      ),
    );

  const buckets = new Array<number>(14).fill(0);
  for (const r of rows) {
    if (!r.published_at) continue;
    const diff = Math.floor(
      (today.getTime() - r.published_at.getTime()) / 86_400_000,
    );
    if (diff >= 0 && diff < 14) buckets[13 - diff]! += 1;
  }
  const anyData = buckets.some((v) => v > 0);
  if (!anyData) {
    const synthetic = [2, 3, 2, 4, 3, 5, 4, 7, 6, 5, 8, 7, 9, 8];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `${Math.max(...synthetic)} posts on peak day`,
      peakIndex,
      data_status: "illustrative",
    };
  }
  const peakValue = Math.max(...buckets);
  const peakIndex = buckets.indexOf(peakValue);
  return {
    data: buckets,
    peakLabel: `${peakValue} posts on peak day`,
    peakIndex,
    data_status: "real",
  };
}

export function registerPortalSocialsyncWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/socialsync/stats/monthly",
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
        const payload = await computeSocialsyncMonthlySeries(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/socialsync/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/socialsync/stats/segments",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_SEGMENTS as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = segmentsCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeSocialsyncPlatformCounts(clientId);
        segmentsCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/socialsync/stats/segments]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/socialsync/stats/peak",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_PEAK as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = peakCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeSocialsyncTopPostEngagement(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/socialsync/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
