/**
 * Portal MapGuard Dashboard KPIs — Wave 27.
 *
 * GET /api/portal/mapguard/dashboard-kpis
 *
 * Returns the four hero KPIs + the 5×5 rank grid + citation-health breakdown
 * needed by the new customer dashboard at /portal/mapguard/dashboard.
 *
 *   1. avgRank          — average position across tracked keywords × pins
 *   2. top3Coverage     — % of grid pins where customer is in Map Pack (top 3)
 *   3. citationHealth   — { found, missing, inconsistent } counts
 *   4. gbpHealth        — 0..100 score (photos + description + hours + reviews)
 *
 * Plus auxiliary payload:
 *   - grid: 25-cell array of { row, col, rank, delta7d }
 *   - gbpTrend14d: 14-day sparkline of gbpHealth
 *
 * Auth: requireClient. adminPreviewSafe-wrapped so admin preview returns
 * `{previewMode:true, …zeros}` instead of 403.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  clients,
  mapguardSnapshots,
  citationTrackerListings,
  citationTrackerSubscriptions,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalMapguardDashboardKpis");

interface GridCell {
  row: number;
  col: number;
  rank: number | null;
  delta7d: number | null;
}

interface DashboardResponse {
  previewMode?: boolean;
  kpis: {
    avgRank: number;
    top3Coverage: number;
    citationHealth: {
      found: number;
      missing: number;
      inconsistent: number;
      grade: "A" | "B" | "C" | "D" | "F";
    };
    gbpHealth: number;
  };
  grid: GridCell[];
  gbpTrend14d: number[];
}

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    avgRank: 0,
    top3Coverage: 0,
    citationHealth: { found: 0, missing: 0, inconsistent: 0, grade: "F" },
    gbpHealth: 0,
  },
  grid: [],
  gbpTrend14d: [],
};

/**
 * Wave 27 — derive a GBP-completeness 0..100 score from a snapshot. Same
 * weighting used elsewhere in MapGuard's scoring engine.
 */
function deriveGbpHealth(snapshot: {
  has_website: boolean | null;
  has_description: boolean | null;
  has_hours: boolean | null;
  photo_count: number | null;
  review_count: number | null;
  rating: number | null;
}): number {
  let score = 0;
  if (snapshot.has_website) score += 20;
  if (snapshot.has_description) score += 15;
  if (snapshot.has_hours) score += 10;
  if ((snapshot.photo_count ?? 0) >= 10) score += 15;
  else if ((snapshot.photo_count ?? 0) >= 5) score += 8;
  if ((snapshot.review_count ?? 0) >= 25) score += 20;
  else if ((snapshot.review_count ?? 0) >= 5) score += 10;
  if ((snapshot.rating ?? 0) >= 4.5) score += 20;
  else if ((snapshot.rating ?? 0) >= 4) score += 10;
  return Math.min(100, score);
}

function gradeFromHealthRatio(found: number, total: number): "A" | "B" | "C" | "D" | "F" {
  if (total === 0) return "F";
  const ratio = found / total;
  if (ratio >= 0.9) return "A";
  if (ratio >= 0.75) return "B";
  if (ratio >= 0.55) return "C";
  if (ratio >= 0.35) return "D";
  return "F";
}

/**
 * Translate the jsonb keywords_data array into 25 grid cells (row 0..4, col 0..4).
 *
 * The scraper writes one entry per keyword × pin with shape:
 *   { keyword, organicRank, localPackPosition, isInLocalPack, pinRow, pinCol }
 *
 * We collapse multiple keywords at the same pin to their best (lowest) rank.
 * If pinRow/pinCol aren't present we fall back to a deterministic synthetic
 * layout so the grid still renders during the migration window.
 */
function buildGrid(
  currentKeywords: unknown,
  previousKeywords: unknown,
): GridCell[] {
  const ofPin = (
    raw: unknown,
  ): Map<string, number> => {
    const map = new Map<string, number>();
    if (!Array.isArray(raw)) return map;
    raw.forEach((entry: any, idx: number) => {
      if (!entry || typeof entry !== "object") return;
      const row =
        typeof entry.pinRow === "number"
          ? entry.pinRow
          : Math.floor(idx / 5) % 5;
      const col =
        typeof entry.pinCol === "number"
          ? entry.pinCol
          : idx % 5;
      const key = `${row}:${col}`;
      const rank =
        typeof entry.localPackPosition === "number" && entry.localPackPosition > 0
          ? entry.localPackPosition
          : typeof entry.organicRank === "number" && entry.organicRank > 0
            ? entry.organicRank
            : null;
      if (rank == null) return;
      const prev = map.get(key);
      if (prev == null || rank < prev) map.set(key, rank);
    });
    return map;
  };

  const cur = ofPin(currentKeywords);
  const prev = ofPin(previousKeywords);

  const cells: GridCell[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const key = `${r}:${c}`;
      const rank = cur.get(key) ?? null;
      const prior = prev.get(key) ?? null;
      const delta = rank != null && prior != null ? prior - rank : null;
      cells.push({ row: r, col: c, rank, delta7d: delta });
    }
  }
  return cells;
}

function computeAvgRank(cells: GridCell[]): number {
  const ranked = cells
    .map((c) => c.rank)
    .filter((r): r is number => r != null);
  if (ranked.length === 0) return 0;
  const sum = ranked.reduce((a, b) => a + b, 0);
  return Math.round((sum / ranked.length) * 10) / 10;
}

function computeTop3Coverage(cells: GridCell[]): number {
  const total = cells.length || 25;
  const inTop3 = cells.filter((c) => c.rank != null && c.rank <= 3).length;
  return Math.round((inTop3 / total) * 100);
}

/**
 * Wave 27 — pure compute path. Extracted so Copilot metricsContext can
 * reuse it without going through Express.
 */
export async function computeMapguardDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  // Latest snapshot
  const [latest] = await db
    .select()
    .from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(1);

  // 7d-ago snapshot for delta calculation
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const [previous] = await db
    .select()
    .from(mapguardSnapshots)
    .where(
      and(
        eq(mapguardSnapshots.client_id, clientId),
        sql`captured_at < ${sevenDaysAgo}`,
      ),
    )
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(1);

  const grid = latest
    ? buildGrid(latest.keywords_data, previous?.keywords_data)
    : [];

  const avgRank = computeAvgRank(grid);
  const top3Coverage = computeTop3Coverage(grid);

  // Citation health — derived from citation_tracker_listings via the
  // client's user_id linkage. We do an indirect lookup since the listings
  // are keyed by customer_id (= users.id) not client_id.
  const [clientRow] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  let found = 0;
  let missing = 0;
  let inconsistent = 0;

  if (clientRow?.user_id) {
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

    for (const row of rows) {
      const n = Number(row.n) || 0;
      if (row.status === "active") found += n;
      else if (row.status === "missing") missing += n;
      else if (row.status === "inconsistent") inconsistent += n;
    }
  }
  const totalCitations = found + missing + inconsistent;
  const grade = gradeFromHealthRatio(found, totalCitations);

  // GBP health from snapshot
  const gbpHealth = latest
    ? deriveGbpHealth({
        has_website: latest.has_website,
        has_description: latest.has_description,
        has_hours: latest.has_hours,
        photo_count: latest.photo_count,
        review_count: latest.review_count,
        rating: latest.rating,
      })
    : 0;

  // 14-day GBP trend — one value per snapshot in the window. Capped at 14.
  const fourteenAgo = new Date(Date.now() - 14 * 86_400_000);
  const trendSnapshots = await db
    .select({
      has_website: mapguardSnapshots.has_website,
      has_description: mapguardSnapshots.has_description,
      has_hours: mapguardSnapshots.has_hours,
      photo_count: mapguardSnapshots.photo_count,
      review_count: mapguardSnapshots.review_count,
      rating: mapguardSnapshots.rating,
    })
    .from(mapguardSnapshots)
    .where(
      and(
        eq(mapguardSnapshots.client_id, clientId),
        gte(mapguardSnapshots.captured_at, fourteenAgo),
      ),
    )
    .orderBy(mapguardSnapshots.captured_at);

  const gbpTrend14d = trendSnapshots.map((s) => deriveGbpHealth(s)).slice(-14);

  return {
    kpis: {
      avgRank,
      top3Coverage,
      citationHealth: { found, missing, inconsistent, grade },
      gbpHealth,
    },
    grid,
    gbpTrend14d,
  };
}

export function registerPortalMapguardDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/mapguard/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeMapguardDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/mapguard/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
