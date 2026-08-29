/**
 * Wave BF-6 — MapGuard Snapshot routes.
 *
 * Powers the Free Audit's "Rank Grid" tab (client/src/pages/marketing/ReportView.tsx
 * → MapSnapshotShell) and any surviving shareable snapshot link. This is a
 * PUBLIC, anonymous surface — anything it returns is published to the world.
 *
 * Endpoints:
 *   POST /api/tools/map-snapshot/audit  → { snapshotId, slug, heatmap, audit, measurement }
 *   GET  /api/tools/map-snapshot/:slug  → existing snapshot, read-only
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HONESTY CONTRACT — read before editing
 * ─────────────────────────────────────────────────────────────────────────
 * This route previously SYNTHESISED its rank grid from a seeded RNG
 * (`baseRank = 1 + distanceKm * 2.5 + noise`), persisted it, and wrapped an
 * audit narrative around the invented numbers. Eight of its ten audit cards
 * asserted things about the business — review velocity, post cadence, photo
 * freshness, NAP consistency, Q&A coverage — that nothing in this codebase
 * ever measured. All of it is gone.
 *
 *  1. Ranks are MEASURED, via server/lib/localRankMeasurement.ts, which uses
 *     the existing multi-provider SERP orchestrator. No new vendor.
 *  2. A cell we could not check reports `status: "unavailable"` and
 *     `rank: null`. It renders with NO number and is excluded from every
 *     average, percentage and count. It is never interpolated, never
 *     estimated, never "about" anything.
 *  3. A cell we checked cleanly where the business is absent reports
 *     `status: "not-found"`. That IS a measurement and does count.
 *  4. The audit narrative derives ONLY from measured cells, and is suppressed
 *     entirely below MIN_CELLS_FOR_NARRATIVE. Things we do not measure are
 *     returned in `notAssessed` — prompts describing what a full audit covers,
 *     making no claim whatsoever about this business.
 *  5. Legacy rows are DOWNGRADED ON READ (see `honestHeatmap`). No read ever
 *     rewrites a stored row.
 *
 * Never add a code path that puts a number in front of a visitor without a
 * real measurement behind it. Guard: server/routes/mapSnapshotRoutes.rankHonesty.test.ts
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COST — this is a free tool for anonymous visitors
 * ─────────────────────────────────────────────────────────────────────────
 *   · 3×3 grid (9 points) at 2 km spacing — same ~4 km footprint the old 5×5
 *     covered, at 9 measurements instead of 25.
 *   · ONE SERP call per point (`google_maps`), for the primary keyword only.
 *     Additional keywords are stored but not scanned; scanning k keywords
 *     would multiply spend by k.
 *   · `freeTierOnly` inside measureLocalPackRank means pay-as-you-go
 *     providers are skipped, so this endpoint cannot bill money — it can only
 *     spend free-tier credit, and stops when that is gone.
 *   · DAILY_CALL_BUDGET (180/day) caps total spend across all visitors.
 *   · Per-IP rate limit: 3 fresh audits/hour (was 10 when results were free
 *     to fabricate).
 *   · GET by slug re-serves a stored snapshot with ZERO provider calls, so
 *     sharing a link costs nothing.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  measureRankGrid,
  remainingDailyBudget,
  type RankCellStatus,
} from "../lib/localRankMeasurement";

const log = createLogger("MapSnapshot");

/* ─── Rate limiting ─── */

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour
/**
 * Fresh audits per IP per hour. Each one spends up to GRID_SIZE² real SERP
 * calls, so this is a spend control, not just an abuse control.
 */
const RATE_MAX = 3;

function checkRate(ip: string): { ok: boolean; resetIn?: number } {
  const now = Date.now();
  let rl = rateMap.get(ip);
  if (!rl || now > rl.resetAt) {
    rl = { count: 0, resetAt: now + RATE_WINDOW };
    rateMap.set(ip, rl);
  }
  rl.count++;
  if (rl.count > RATE_MAX) {
    return { ok: false, resetIn: Math.ceil((rl.resetAt - now) / 1000) };
  }
  return { ok: true };
}

function generateSlug(): string {
  // 10-char base36, ~52 bits — collision-safe for our scale
  return (
    Math.random().toString(36).slice(2, 7) +
    Date.now().toString(36).slice(-5)
  ).slice(0, 10);
}

/* ─── Types ─── */

export interface HeatmapCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
  keyword: string;
  distanceKm: number;
  /**
   * "ranked"      → `rank` is a real measured Local Pack position.
   * "not-found"   → checked cleanly, business absent from the pack. Real.
   * "unavailable" → could NOT be checked. Render no number; exclude from stats.
   */
  status: RankCellStatus;
  /** Real measured position, or null. NEVER a placeholder or an estimate. */
  rank: number | null;
}

export interface AuditCard {
  id: string;
  label: string;
  status: "good" | "warn" | "fail";
  score: number; // 0-100
  details: string;
  ctaCardName?: string;
}

/**
 * Something this free scan does NOT check. Carries no score and no status
 * because we have no evidence — it exists to describe what a full audit
 * covers, and must never be phrased as a finding about the business.
 */
export interface NotAssessedItem {
  id: string;
  label: string;
  details: string;
  ctaCardName?: string;
}

export interface MeasurementSummary {
  totalCells: number;
  /** Cells with a real result — "ranked" + "not-found". */
  measuredCells: number;
  rankedCells: number;
  notFoundCells: number;
  /** Cells we could not check at all. Excluded from every statistic. */
  unavailableCells: number;
  /** True when every cell was measured. */
  complete: boolean;
  /** Set when the whole grid is unmeasured, explaining why. */
  note?: string;
}

/* ─── Grid geometry ─── */

const GRID_SIZE = 3;
const GRID_SPACING_KM = 2.0;
const KM_PER_DEG_LAT = 110.574;
/** Below this many measured cells we publish no narrative at all. */
const MIN_CELLS_FOR_NARRATIVE = 3;

interface GridPoint {
  row: number;
  col: number;
  lat: number;
  lng: number;
  distanceKm: number;
}

/**
 * Build the grid ordered CENTRE-OUTWARD, so a scan that only gets partial
 * budget still describes the business's immediate area rather than a random
 * scatter of far-flung points.
 */
function buildGrid(centerLat: number, centerLng: number): GridPoint[] {
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const halfGrid = (GRID_SIZE - 1) / 2;
  const pts: GridPoint[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const dRow = row - halfGrid;
      const dCol = col - halfGrid;
      pts.push({
        row,
        col,
        lat: centerLat + (dRow * GRID_SPACING_KM) / KM_PER_DEG_LAT,
        lng: centerLng + (dCol * GRID_SPACING_KM) / kmPerDegLng,
        distanceKm: Math.sqrt(dRow * dRow + dCol * dCol) * GRID_SPACING_KM,
      });
    }
  }
  return pts.sort((a, b) => a.distanceKm - b.distanceKm);
}

/* ─── Narrative — measured cells only ─── */

export function summarise(cells: HeatmapCell[]): MeasurementSummary {
  const ranked = cells.filter((c) => c.status === "ranked").length;
  const notFound = cells.filter((c) => c.status === "not-found").length;
  const unavailable = cells.filter((c) => c.status === "unavailable").length;
  return {
    totalCells: cells.length,
    measuredCells: ranked + notFound,
    rankedCells: ranked,
    notFoundCells: notFound,
    unavailableCells: unavailable,
    complete: cells.length > 0 && unavailable === 0,
  };
}

/**
 * Build the audit narrative from REAL measurements only.
 *
 * Exported pure (no DB, no network) so the CI guard can prove it never emits
 * a card unless the evidence for that card exists.
 *
 * Returns [] when fewer than MIN_CELLS_FOR_NARRATIVE cells were measured —
 * saying less is the correct behaviour, inventing filler is not.
 */
export function buildAudit(cells: HeatmapCell[]): AuditCard[] {
  const measured = cells.filter((c) => c.status !== "unavailable");
  if (measured.length < MIN_CELLS_FOR_NARRATIVE) return [];

  const ranked = measured.filter(
    (c): c is HeatmapCell & { rank: number } => c.status === "ranked" && c.rank != null,
  );
  const top3 = ranked.filter((c) => c.rank <= 3).length;
  const top3Pct = (top3 / measured.length) * 100;
  // Average across MEASURED cells only. Cells where the business genuinely
  // does not appear anchor at MAX+1 (a worst case we did observe); cells we
  // could not check contribute nothing at all.
  const rankSum = measured.reduce((s, c) => s + (c.rank ?? 21), 0);
  const avgRank = rankSum / measured.length;

  const scope =
    measured.length === cells.length
      ? `all ${cells.length} points`
      : `the ${measured.length} of ${cells.length} points we could check`;

  const status = (score: number): AuditCard["status"] =>
    score >= 75 ? "good" : score >= 45 ? "warn" : "fail";

  const coverageScore = Math.round(Math.max(0, 100 - avgRank * 5));
  const cards: AuditCard[] = [
    {
      id: "grid-coverage",
      label: "Local Map Coverage",
      score: coverageScore,
      status: status(coverageScore),
      details: `Average Local Pack position ${avgRank.toFixed(1)} across ${scope}. ${top3} of those are in the top 3.`,
      ctaCardName: "grid-coverage",
    },
    {
      id: "top3-share",
      label: "Top-3 Pack Share",
      score: Math.round(top3Pct),
      status: status(top3Pct),
      details: `You appear in the top-3 Local Pack for ${top3Pct.toFixed(0)}% of ${scope}.`,
      ctaCardName: "top3-share",
    },
  ];
  return cards;
}

/**
 * Prompts for things this scan does NOT measure.
 *
 * These deliberately describe the CHECK, never the business. The previous
 * version of this file scored these from `Math.random()` and asserted
 * failures ("Fewer than 4 new reviews in the last 30 days", "No GBP posts in
 * the last 14 days") about businesses nothing had ever looked at.
 */
export const NOT_ASSESSED: NotAssessedItem[] = [
  {
    id: "gbp-completeness",
    label: "Google Business Profile completeness",
    details:
      "Not checked by this free scan. A full audit reviews hours, categories, services and photos on your profile.",
    ctaCardName: "gbp-complete",
  },
  {
    id: "review-velocity",
    label: "Review velocity & response rate",
    details:
      "Not checked by this free scan. A full audit reads your review history and how often you reply.",
    ctaCardName: "review-velocity",
  },
  {
    id: "post-cadence",
    label: "GBP post cadence",
    details:
      "Not checked by this free scan. A full audit looks at how recently and how regularly you post.",
    ctaCardName: "post-cadence",
  },
  {
    id: "nap-consistency",
    label: "NAP consistency across directories",
    details:
      "Not checked by this free scan — our free Citation Checker does check this against the directories we monitor.",
    ctaCardName: "nap-consistency",
  },
];

/* ─── Legacy downgrade-on-read ─── */

/**
 * The ONLY `source` value under which stored ranks may be believed, and the
 * only value any current write path emits.
 *
 * Provenance here is an ALLOWLIST, not a blocklist of known-bad values. The
 * comparable SSL fix in server/routes/domainRoutes.ts could enumerate the two
 * strings its removed simulation wrote; here that framing would be misleading,
 * because BOTH historic values ('real' and 'mock') described only whether
 * Google Places geocoded the centre point — neither ever meant the ranks were
 * measured, since the ranks were always RNG output. Every pre-fix row is
 * therefore synthetic regardless of what its `source` says.
 *
 * Default-deny also fails safe for anything written in future by a code path
 * that forgets this contract: unknown provenance reads as unmeasured.
 */
export const SOURCE_MEASURED = "measured";

const LEGACY_NOTE =
  "This snapshot was generated before rank measurement existed. Its grid was " +
  "not measured against live search results, so no ranking figures are shown.";

/**
 * Refuse to re-publish rank numbers we cannot stand behind.
 *
 * Rows written before this fix hold RNG-generated ranks. Rather than rewrite
 * history in the database, we downgrade them on READ: geometry is preserved
 * so the map still draws, every rank becomes `unavailable`/null, and the
 * narrative is dropped.
 *
 * Exported pure so the CI guard can assert it without a DB.
 */
export function honestHeatmap(
  storedSource: string | null | undefined,
  storedCells: any[],
): { cells: HeatmapCell[]; legacy: boolean } {
  // Allowlist: anything that is not exactly SOURCE_MEASURED is unmeasured.
  const legacy = (storedSource || "").toString() !== SOURCE_MEASURED;
  const cells: HeatmapCell[] = (Array.isArray(storedCells) ? storedCells : []).map((c: any) => {
    const base = {
      row: Number(c?.row) || 0,
      col: Number(c?.col) || 0,
      lat: Number(c?.lat),
      lng: Number(c?.lng),
      keyword: typeof c?.keyword === "string" ? c.keyword : "",
      distanceKm: Number(c?.distanceKm) || 0,
    };
    if (legacy) {
      // Do NOT carry the stored `rank` through — it was invented.
      return { ...base, status: "unavailable" as const, rank: null };
    }
    const status: RankCellStatus =
      c?.status === "ranked" || c?.status === "not-found" ? c.status : "unavailable";
    return {
      ...base,
      status,
      rank: status === "ranked" && Number.isFinite(Number(c?.rank)) ? Number(c.rank) : null,
    };
  });
  return { cells, legacy };
}

/* ─── Google Places (centre resolution only) ─── */

function getApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
}

async function fetchPlace(
  businessName: string,
  near?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number; address?: string; resolvedName?: string } | null> {
  const key = getApiKey();
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      input: businessName,
      inputtype: "textquery",
      fields: "geometry,formatted_address,name",
      key,
    });
    if (near) params.set("locationbias", `point:${near.lat},${near.lng}`);
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!r.ok) return null;
    const j: any = await r.json();
    const cand = j.candidates?.[0];
    if (!cand?.geometry?.location) return null;
    return {
      lat: cand.geometry.location.lat,
      lng: cand.geometry.location.lng,
      address: cand.formatted_address,
      resolvedName: cand.name,
    };
  } catch (err: any) {
    log.warn("[map-snapshot] Places fetch failed:", err?.message);
    return null;
  }
}

/* ─── Input validation ─── */

function sanitizeString(v: any, max = 200): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max).replace(/[<>]/g, "");
}

/* ─── Route registration ─── */

export function registerMapSnapshotRoutes(app: Express): void {
  app.post(
    "/api/tools/map-snapshot/audit",
    async (req: Request, res: Response) => {
      try {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const rl = checkRate(ip);
        if (!rl.ok) {
          return res.status(429).json({
            error: "Too many requests. Try again later.",
            resetIn: rl.resetIn,
          });
        }

        const businessName = sanitizeString(req.body?.businessName, 200);
        const keywordsRaw = req.body?.keywords;
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        const city = sanitizeString(req.body?.city, 120) || undefined;

        if (!businessName) {
          return res.status(400).json({ error: "businessName is required" });
        }
        if (!Array.isArray(keywordsRaw) || keywordsRaw.length === 0) {
          return res.status(400).json({ error: "keywords array is required" });
        }
        const keywords = keywordsRaw
          .map((k: any) => sanitizeString(k, 60))
          .filter(Boolean)
          .slice(0, 8);
        if (keywords.length === 0) {
          return res.status(400).json({ error: "At least one keyword is required" });
        }

        // Resolve the grid centre. If we cannot establish WHERE the business
        // is, we cannot measure anything there — the old code defaulted to a
        // hardcoded point in the English Midlands and generated a grid around
        // it, which produced a confident-looking map of a place the business
        // has never been. Refuse instead.
        let centerLat = Number.isFinite(lat) ? lat : NaN;
        let centerLng = Number.isFinite(lng) ? lng : NaN;
        let address: string | undefined;
        let resolvedName: string | undefined;

        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
          const place = await fetchPlace(businessName);
          if (!place) {
            return res.status(404).json({
              error:
                "We couldn't find that business on Google Maps, so there's no location to measure from. Check the name, or add your city.",
            });
          }
          centerLat = place.lat;
          centerLng = place.lng;
          address = place.address;
          resolvedName = place.resolvedName;
        } else if (getApiKey()) {
          const place = await fetchPlace(businessName, { lat: centerLat, lng: centerLng });
          if (place) {
            address = place.address;
            resolvedName = place.resolvedName;
          }
        }

        // Measure the grid for real. Only the PRIMARY keyword is scanned —
        // each extra keyword would multiply provider spend by the grid size.
        const primaryKeyword = keywords[0];
        const grid = buildGrid(centerLat, centerLng);
        const budgetBefore = remainingDailyBudget();
        const measured = await measureRankGrid(grid, {
          businessName: resolvedName || businessName,
          keyword: primaryKeyword,
          location: city,
        });

        const heatmap: HeatmapCell[] = measured.map((m) => ({
          row: m.row,
          col: m.col,
          lat: m.lat,
          lng: m.lng,
          keyword: primaryKeyword,
          distanceKm: m.distanceKm,
          status: m.status,
          rank: m.rank,
        }));

        const measurement = summarise(heatmap);
        if (measurement.measuredCells === 0) {
          measurement.note =
            budgetBefore <= 0
              ? "This free scan's daily measurement budget is spent. No ranking figures are shown — try again tomorrow."
              : "Our search providers couldn't be reached for this scan, so no ranking figures are shown. Try again shortly.";
        }
        const audit = buildAudit(heatmap);
        const slug = generateSlug();

        // Persist. `source` is the provenance marker the read path checks —
        // only SOURCE_MEASURED means the ranks in heatmap_json are real.
        let snapshotId: number | null = null;
        try {
          const result = await db.execute(sql`
            INSERT INTO map_snapshots (
              slug, business_name, business_address, location_lat, location_lng,
              keywords_json, heatmap_json, audit_json, source
            ) VALUES (
              ${slug}, ${resolvedName || businessName}, ${address || null}, ${centerLat}, ${centerLng},
              ${JSON.stringify(keywords)}::jsonb,
              ${JSON.stringify(heatmap)}::jsonb,
              ${JSON.stringify(audit)}::jsonb,
              ${SOURCE_MEASURED}
            ) RETURNING id
          `);
          const rows = (result as any)?.rows || (result as any);
          if (Array.isArray(rows) && rows[0]?.id) {
            snapshotId = Number(rows[0].id);
          }
        } catch (err: any) {
          log.error("[map-snapshot] persist failed:", err?.message);
        }

        log.info("[map-snapshot] audit measured", {
          arg0: slug,
          arg1: businessName,
          arg2: `${measurement.measuredCells}/${measurement.totalCells} measured`,
          arg3: keywords.length,
        });

        return res.json({
          snapshotId,
          slug,
          businessName: resolvedName || businessName,
          address,
          lat: centerLat,
          lng: centerLng,
          keywords,
          measuredKeyword: primaryKeyword,
          heatmap,
          audit,
          notAssessed: NOT_ASSESSED,
          measurement,
          source: SOURCE_MEASURED,
        });
      } catch (err: any) {
        log.error("[map-snapshot] audit error:", err?.message);
        return res.status(500).json({ error: "Failed to generate audit" });
      }
    },
  );

  app.get(
    "/api/tools/map-snapshot/:slug",
    async (req: Request, res: Response) => {
      try {
        const slug = sanitizeString(req.params.slug, 32);
        if (!slug) return res.status(400).json({ error: "Invalid slug" });

        const result = await db.execute(sql`
          SELECT id, slug, business_name, business_address, location_lat, location_lng,
                 keywords_json, heatmap_json, audit_json, source, created_at
          FROM map_snapshots WHERE slug = ${slug} LIMIT 1
        `);
        const rows = (result as any)?.rows || (result as any);
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) {
          return res.status(404).json({ error: "Snapshot not found" });
        }

        // Downgrade any snapshot whose ranks were synthesised. The stored row
        // is never rewritten — we just refuse to repeat a claim we cannot back.
        const { cells, legacy } = honestHeatmap(row.source, row.heatmap_json || []);
        const measurement = summarise(cells);
        if (legacy) measurement.note = LEGACY_NOTE;

        return res.json({
          snapshotId: Number(row.id),
          slug: row.slug,
          businessName: row.business_name,
          address: row.business_address || undefined,
          lat: Number(row.location_lat),
          lng: Number(row.location_lng),
          keywords: row.keywords_json || [],
          heatmap: cells,
          // A legacy narrative was written around invented numbers, so it goes
          // with them. Recomputing from the downgraded cells yields [] anyway.
          audit: legacy ? [] : row.audit_json || [],
          notAssessed: NOT_ASSESSED,
          measurement,
          source: legacy ? "unmeasured" : SOURCE_MEASURED,
          createdAt: row.created_at,
        });
      } catch (err: any) {
        log.error("[map-snapshot] fetch error:", err?.message);
        return res.status(500).json({ error: "Failed to load snapshot" });
      }
    },
  );
}
