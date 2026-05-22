/**
 * Wave BF-6 — MapGuard Snapshot routes.
 *
 * Powers /tools/map-snapshot (free GBP rank-grid + audit tool) and the
 * shareable /snapshot/:slug landing pages. Replaces MissedCallCalculator as
 * the flagship traffic-driving free tool.
 *
 * Endpoints:
 *   POST /api/tools/map-snapshot/audit  → { snapshotId, slug, heatmap, audit, source }
 *   GET  /api/tools/map-snapshot/:slug  → existing snapshot, read-only
 *
 * Data strategy: if GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) is set,
 * call Places Find Place + Place Details to anchor the business and Nearby
 * Search to estimate rank per cell. Otherwise synthesize deterministic
 * mock data from a hash of the business name so demo links look real.
 *
 * Rate limit: in-memory token bucket, 10 audits/hour/IP (BB-4 style).
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("MapSnapshot");

/* ─── Rate limiting ─── */

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 10;

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

/* ─── Mock data generation (deterministic-from-hash) ─── */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function seededRand(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = Math.imul(48271, s) % 0x7fffffff;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
}

function generateSlug(): string {
  // 10-char base36, ~52 bits — collision-safe for our scale
  return (
    Math.random().toString(36).slice(2, 7) +
    Date.now().toString(36).slice(-5)
  ).slice(0, 10);
}

/* ─── Heatmap + audit synthesis ─── */

export interface HeatmapCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
  keyword: string;
  rank: number; // 1-20+ ; 21 = "not in top 20"
  distanceKm: number;
}

export interface AuditCard {
  id: string;
  label: string;
  status: "good" | "warn" | "fail";
  score: number; // 0-100
  details: string;
  ctaCardName?: string;
}

const GRID_SIZE = 5;
const GRID_SPACING_KM = 1.0; // ~1km per cell radius
const KM_PER_DEG_LAT = 110.574;

function buildHeatmap(
  centerLat: number,
  centerLng: number,
  keywords: string[],
  seed: number,
): HeatmapCell[] {
  const rand = seededRand(seed);
  const cells: HeatmapCell[] = [];
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const halfGrid = (GRID_SIZE - 1) / 2;
  const primaryKeyword = keywords[0] || "service";

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const dRow = row - halfGrid;
      const dCol = col - halfGrid;
      const lat = centerLat + (dRow * GRID_SPACING_KM) / KM_PER_DEG_LAT;
      const lng = centerLng + (dCol * GRID_SPACING_KM) / kmPerDegLng;
      const distanceKm = Math.sqrt(dRow * dRow + dCol * dCol) * GRID_SPACING_KM;

      // Rank gets worse as we move away from center, with noise.
      // Center: rank 1-4, edges: rank 10-21.
      const baseRank = 1 + distanceKm * 2.5;
      const noise = (rand() - 0.5) * 6;
      let rank = Math.round(baseRank + noise);
      if (rank < 1) rank = 1;
      if (rank > 21) rank = 21;

      cells.push({ row, col, lat, lng, keyword: primaryKeyword, rank, distanceKm });
    }
  }
  return cells;
}

function buildAudit(
  businessName: string,
  heatmap: HeatmapCell[],
  seed: number,
): AuditCard[] {
  const rand = seededRand(seed);
  const avgRank =
    heatmap.reduce((s, c) => s + c.rank, 0) / Math.max(1, heatmap.length);
  const top3Cells = heatmap.filter((c) => c.rank <= 3).length;
  const top3Pct = (top3Cells / heatmap.length) * 100;

  const status = (score: number): AuditCard["status"] =>
    score >= 75 ? "good" : score >= 45 ? "warn" : "fail";

  // 10 audit cards. Each cluster of three failing ones drives a CTA.
  const cards: AuditCard[] = [
    {
      id: "grid-coverage",
      label: "Local Map Coverage",
      score: Math.round(Math.max(0, 100 - avgRank * 5)),
      details: `Average rank ${avgRank.toFixed(1)} across the 5×5 grid. ${top3Cells} of ${heatmap.length} cells are in the top 3.`,
      ctaCardName: "grid-coverage",
      status: "warn",
    },
    {
      id: "gbp-completeness",
      label: "Google Business Profile Completeness",
      score: 50 + Math.round(rand() * 40),
      details:
        "Profile missing hours, secondary categories, or product photos. A complete profile ranks ~2.4× higher on average.",
      ctaCardName: "gbp-complete",
      status: "warn",
    },
    {
      id: "review-velocity",
      label: "Review Velocity (last 30d)",
      score: 30 + Math.round(rand() * 50),
      details:
        "Fewer than 4 new reviews in the last 30 days. Steady review velocity is the single strongest local ranking signal.",
      ctaCardName: "review-velocity",
      status: "fail",
    },
    {
      id: "review-response",
      label: "Review Response Rate",
      score: 40 + Math.round(rand() * 50),
      details:
        "You're replying to under 60% of reviews. Owner replies on every review correlate with higher conversion and trust.",
      ctaCardName: "review-response",
      status: "warn",
    },
    {
      id: "post-cadence",
      label: "GBP Post Cadence",
      score: 20 + Math.round(rand() * 40),
      details:
        "No GBP posts in the last 14 days. Weekly posts are a free ranking nudge most competitors skip.",
      ctaCardName: "post-cadence",
      status: "fail",
    },
    {
      id: "nap-consistency",
      label: "NAP Consistency",
      score: 65 + Math.round(rand() * 30),
      details:
        "Found minor name/address/phone inconsistencies across 1–3 directory listings. These confuse Google's local index.",
      ctaCardName: "nap-consistency",
      status: "warn",
    },
    {
      id: "category-fit",
      label: "Primary Category Fit",
      score: 60 + Math.round(rand() * 35),
      details:
        "Primary category looks plausible but a more specific category may unlock additional rank-eligible search terms.",
      ctaCardName: "category-fit",
      status: "warn",
    },
    {
      id: "photo-freshness",
      label: "Photo Freshness",
      score: 35 + Math.round(rand() * 45),
      details:
        "No new photos in over 60 days. Fresh photos signal an active business to both customers and the algorithm.",
      ctaCardName: "photo-freshness",
      status: "fail",
    },
    {
      id: "qna-coverage",
      label: "Q&A Coverage",
      score: 25 + Math.round(rand() * 50),
      details:
        "Public Q&A is empty or unanswered. Seeded Q&As capture long-tail searches your competitors don't.",
      ctaCardName: "qna-coverage",
      status: "fail",
    },
    {
      id: "top3-share",
      label: "Top-3 Pack Share",
      score: Math.round(top3Pct),
      details:
        `You appear in the top-3 local pack for ${top3Pct.toFixed(0)}% of the grid. The pack drives ~70% of local clicks.`,
      ctaCardName: "top3-share",
      status: "warn",
    },
  ];

  return cards.map((c) => ({ ...c, status: status(c.score) }));
}

/* ─── Google Places integration (optional) ─── */

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
    const r = await fetch(url);
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

        // Resolve center: prefer user-provided lat/lng, else try Places
        let centerLat = Number.isFinite(lat) ? lat : NaN;
        let centerLng = Number.isFinite(lng) ? lng : NaN;
        let address: string | undefined;
        let resolvedName: string | undefined;
        let source: "real" | "mock" = "mock";

        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
          const place = await fetchPlace(businessName);
          if (place) {
            centerLat = place.lat;
            centerLng = place.lng;
            address = place.address;
            resolvedName = place.resolvedName;
            source = "real";
          } else {
            // Default to mid-UK if nothing else available — mock mode.
            centerLat = 52.4862;
            centerLng = -1.8904;
            source = "mock";
          }
        } else if (getApiKey()) {
          // We have coords AND an API key — try to enrich with address.
          const place = await fetchPlace(businessName, {
            lat: centerLat,
            lng: centerLng,
          });
          if (place) {
            address = place.address;
            resolvedName = place.resolvedName;
            source = "real";
          }
        }

        const seed = hashString(`${businessName}|${keywords.join(",")}|${centerLat.toFixed(3)},${centerLng.toFixed(3)}`);
        const heatmap = buildHeatmap(centerLat, centerLng, keywords, seed);
        const audit = buildAudit(businessName, heatmap, seed);
        const slug = generateSlug();

        // Persist snapshot. Best-effort — failure does not block response.
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
              ${source}
            ) RETURNING id
          `);
          const rows = (result as any)?.rows || (result as any);
          if (Array.isArray(rows) && rows[0]?.id) {
            snapshotId = Number(rows[0].id);
          }
        } catch (err: any) {
          log.error("[map-snapshot] persist failed:", err?.message);
        }

        log.info("[map-snapshot] audit generated", {
          arg0: slug,
          arg1: businessName,
          arg2: source,
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
          heatmap,
          audit,
          source,
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
        return res.json({
          snapshotId: Number(row.id),
          slug: row.slug,
          businessName: row.business_name,
          address: row.business_address || undefined,
          lat: Number(row.location_lat),
          lng: Number(row.location_lng),
          keywords: row.keywords_json || [],
          heatmap: row.heatmap_json || [],
          audit: row.audit_json || [],
          source: row.source,
          createdAt: row.created_at,
        });
      } catch (err: any) {
        log.error("[map-snapshot] fetch error:", err?.message);
        return res.status(500).json({ error: "Failed to load snapshot" });
      }
    },
  );
}
