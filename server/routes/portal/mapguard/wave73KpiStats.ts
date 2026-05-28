/**
 * Portal MapGuard — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/mapguard/stats/segments?dimension=citation_directory
 *   GET /api/portal/mapguard/stats/peak?metric=geo_grid_best_day
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  clients,
  citationTrackerListings,
  citationTrackerSubscriptions,
  mapguardSnapshots,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalMapguardWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

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

const segmentsCache = new Map<string, Cached<SegmentResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();

const EMPTY_SEGMENTS: SegmentResponse = { data: [], data_status: "illustrative" };
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};

export async function computeMapguardCitationDirectoryMix(
  clientId: number,
): Promise<SegmentResponse> {
  const [clientRow] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!clientRow?.user_id) {
    return {
      data: [
        { label: "Clean", value: 12, color: "emerald" },
        { label: "Missing", value: 4, color: "crimson" },
        { label: "Inconsistent", value: 3, color: "amber" },
      ],
      data_status: "illustrative",
    };
  }

  const rows = await db
    .select({
      status: citationTrackerListings.status,
      n: sql<number>`count(*)::int`,
    })
    .from(citationTrackerListings)
    .innerJoin(
      citationTrackerSubscriptions,
      eq(
        citationTrackerListings.subscription_id,
        citationTrackerSubscriptions.id,
      ),
    )
    .where(eq(citationTrackerSubscriptions.customer_id, clientRow.user_id))
    .groupBy(citationTrackerListings.status);

  let found = 0;
  let missing = 0;
  let inconsistent = 0;
  for (const row of rows) {
    const n = Number(row.n) || 0;
    if (row.status === "active") found += n;
    else if (row.status === "missing") missing += n;
    else if (row.status === "inconsistent") inconsistent += n;
  }

  if (found + missing + inconsistent === 0) {
    return {
      data: [
        { label: "Clean", value: 12, color: "emerald" },
        { label: "Missing", value: 4, color: "crimson" },
        { label: "Inconsistent", value: 3, color: "amber" },
      ],
      data_status: "illustrative",
    };
  }

  return {
    data: [
      { label: "Clean", value: found, color: "emerald" },
      { label: "Missing", value: missing, color: "crimson" },
      { label: "Inconsistent", value: inconsistent, color: "amber" },
    ],
    data_status: "real",
  };
}

export async function computeMapguardGeoGridBestDay(
  clientId: number,
): Promise<PeakSeriesResponse> {
  // Use the last 14 mapguard_snapshots — each snapshot rolls up daily
  // local-pack coverage. The "best day" = snapshot with the highest
  // keywords_in_local_pack count.
  const now = new Date();
  const fourteenAgo = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await db
    .select({
      captured_at: mapguardSnapshots.captured_at,
      keywords_in_local_pack: mapguardSnapshots.keywords_in_local_pack,
      best_local_pack_position: mapguardSnapshots.best_local_pack_position,
    })
    .from(mapguardSnapshots)
    .where(
      and(
        eq(mapguardSnapshots.client_id, clientId),
        gte(mapguardSnapshots.captured_at, fourteenAgo),
      ),
    )
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(14);

  if (rows.length === 0) {
    const synthetic = [3, 4, 5, 4, 7, 8, 9, 11, 10, 12, 14, 13, 15, 14];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `${Math.max(...synthetic)} in local pack`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  // Build day-aligned 14-point series, oldest → newest.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = new Array<number>(14).fill(0);
  for (const r of rows) {
    if (!r.captured_at) continue;
    const diff = Math.floor((today.getTime() - r.captured_at.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 14) {
      const idx = 13 - diff;
      const v = r.keywords_in_local_pack ?? 0;
      if (v > buckets[idx]!) buckets[idx] = v;
    }
  }
  const anyData = buckets.some((v) => v > 0);
  if (!anyData) {
    const synthetic = [3, 4, 5, 4, 7, 8, 9, 11, 10, 12, 14, 13, 15, 14];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `${Math.max(...synthetic)} in local pack`,
      peakIndex,
      data_status: "illustrative",
    };
  }
  const peakValue = Math.max(...buckets);
  const peakIndex = buckets.indexOf(peakValue);
  return {
    data: buckets,
    peakLabel: `${peakValue} in local pack`,
    peakIndex,
    data_status: "real",
  };
}

export function registerPortalMapguardWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/mapguard/stats/segments",
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
        const payload = await computeMapguardCitationDirectoryMix(clientId);
        segmentsCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/mapguard/stats/segments]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/mapguard/stats/peak",
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
        const payload = await computeMapguardGeoGridBestDay(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/mapguard/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
