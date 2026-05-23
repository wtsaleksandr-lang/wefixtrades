/**
 * Service-Area Map free tool — Option B (static + backend proxy).
 *
 * Architecture (confirmed by Alex 2026-05-22):
 *   1. Customer embed is one <img> tag: /free-tool/service-area/:token.png
 *   2. On request, we look up the client by widget_token → fetch their
 *      service_area_map_configs row → compute a cache key from all rendering
 *      inputs. If cache hits, stream the on-disk PNG. If misses, call the
 *      Google Static Maps API once, persist the PNG to
 *      data/service-area-cache/<cache_key>.png, then serve.
 *   3. Cache is immutable — different config → different cache_path → new
 *      file. We never overwrite, so HTTP `Cache-Control: immutable` is safe.
 *   4. Server-side geocoding on save (one Geocoding API call per address
 *      change). lat/lng cached on the row.
 *
 * The Google Maps API key (GOOGLE_MAPS_API_KEY) lives in Doppler and never
 * leaves the server.
 *
 * Endpoints:
 *   GET  /api/portal/free-tools/service-area              → load config
 *   PUT  /api/portal/free-tools/service-area              → save (geocodes if address changed)
 *   POST /api/portal/free-tools/service-area/regenerate   → force re-render (cache busted via key bump)
 *   GET  /free-tool/service-area/:token.png               → public PNG endpoint
 */

import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireClient } from "../auth";
import { db } from "../db";
import {
  clients,
  clientServices,
  serviceAreaMapConfigs,
} from "@shared/schemas/adminCrm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("ServiceAreaMap");

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), "data", "service-area-cache");
const STATIC_MAPS_ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";
const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const MAP_WIDTH = 600;
const MAP_HEIGHT = 400;
const MAP_SCALE = 2; // retina
const CIRCLE_POINTS = 64;

function getCacheDir(): string {
  const dir = process.env.SERVICE_AREA_CACHE_DIR || DEFAULT_CACHE_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getMapsApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

/* ─── helpers ─── */

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

async function hasActivePaidSubscription(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientServices)
    .where(and(eq(clientServices.client_id, clientId), sql`${clientServices.status} = 'active'`));
  return (row?.count ?? 0) > 0;
}

/* ─── geocoding ─── */

async function geocodeAddress(fullAddress: string): Promise<{ lat: number; lng: number } | null> {
  const key = getMapsApiKey();
  if (!key) {
    log.warn("geocode skipped — GOOGLE_MAPS_API_KEY not configured");
    return null;
  }
  const url = `${GEOCODE_ENDPOINT}?address=${encodeURIComponent(fullAddress)}&key=${encodeURIComponent(key)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      log.warn("geocode HTTP error", { status: resp.status });
      return null;
    }
    const body = (await resp.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (body.status !== "OK" || !body.results?.length) {
      log.info("geocode no result", { status: body.status });
      return null;
    }
    const loc = body.results[0].geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch (err: any) {
    log.error("geocode threw", { error: err?.message });
    return null;
  }
}

/* ─── polyline encoding for the circle overlay ───
 * Google's Static Maps API has no native circle primitive, so we approximate
 * with a 64-point polygon. Polyline algorithm is the standard Google encoded
 * polyline format — see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

function circlePoints(lat: number, lng: number, radiusKm: number, n = CIRCLE_POINTS): Array<[number, number]> {
  const earthKm = 6371.0088;
  const radLat = (lat * Math.PI) / 180;
  const angDist = radiusKm / earthKm;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const brng = (i * 2 * Math.PI) / n;
    const lat2 = Math.asin(
      Math.sin(radLat) * Math.cos(angDist) +
        Math.cos(radLat) * Math.sin(angDist) * Math.cos(brng),
    );
    const lng2 =
      (lng * Math.PI) / 180 +
      Math.atan2(
        Math.sin(brng) * Math.sin(angDist) * Math.cos(radLat),
        Math.cos(angDist) - Math.sin(radLat) * Math.sin(lat2),
      );
    pts.push([(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI]);
  }
  return pts;
}

function encodePolyline(points: Array<[number, number]>): string {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    result += encodeSigned(iLat - prevLat);
    result += encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return result;
}

function encodeSigned(n: number): string {
  let v = n < 0 ? ~(n << 1) : n << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

/* ─── zoom calculator ───
 * Rough approximation: pick the zoom level whose map width covers ~2.4× the
 * service radius, so the circle sits comfortably inside the 600×400 frame.
 */
function calculateZoom(radiusKm: number): number {
  // Earth circumference in km / (radius * widthFactor)
  const widthFactor = 2.4;
  const zoom = Math.round(Math.log2(40075 / (radiusKm * 2 * widthFactor)) - 1);
  return Math.max(4, Math.min(16, zoom));
}

/* ─── hex colour helper ───
 * Static Maps colour format: 0xRRGGBBAA (NOT #RRGGBB). Convert + bake in
 * opacity for the circle fill.
 */
function toStaticMapsColor(hex: string, alpha = 1): string {
  const clean = hex.replace(/^#/, "");
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `0x${clean}${aa}`;
}

/* ─── cache-key derivation ─── */

interface RenderInputs {
  lat: number;
  lng: number;
  radiusValue: number;
  radiusUnit: "miles" | "km";
  mapStyle: string;
  pinColor: string;
  circleColor: string;
  circleOpacity: number;
  poweredBy: boolean;
}

function deriveCacheKey(inputs: RenderInputs): string {
  const seed = [
    inputs.lat.toFixed(6),
    inputs.lng.toFixed(6),
    inputs.radiusValue,
    inputs.radiusUnit,
    inputs.mapStyle,
    inputs.pinColor.toLowerCase(),
    inputs.circleColor.toLowerCase(),
    inputs.circleOpacity.toFixed(2),
    inputs.poweredBy ? "pb1" : "pb0",
  ].join("|");
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

/* ─── render: fetch from Google + bake powered-by overlay ─── */

async function renderMapPng(inputs: RenderInputs): Promise<Buffer | null> {
  const key = getMapsApiKey();
  if (!key) {
    log.warn("render skipped — GOOGLE_MAPS_API_KEY not configured");
    return null;
  }

  const radiusKm =
    inputs.radiusUnit === "miles" ? inputs.radiusValue * 1.609344 : inputs.radiusValue;
  const zoom = calculateZoom(radiusKm);

  const pts = circlePoints(inputs.lat, inputs.lng, radiusKm);
  const encoded = encodePolyline(pts);

  const params = new URLSearchParams();
  params.set("center", `${inputs.lat},${inputs.lng}`);
  params.set("zoom", String(zoom));
  params.set("size", `${MAP_WIDTH}x${MAP_HEIGHT}`);
  params.set("scale", String(MAP_SCALE));
  params.set("maptype", inputs.mapStyle);
  params.set(
    "markers",
    `color:${toStaticMapsColor(inputs.pinColor, 1).replace("0x", "0x").slice(0, 8)}|${inputs.lat},${inputs.lng}`,
  );
  // Path expects color (stroke) and fillcolor (fill) — both as 0xRRGGBBAA.
  // Stroke fully opaque; fill uses configured opacity.
  const strokeColor = toStaticMapsColor(inputs.circleColor, 1);
  const fillColor = toStaticMapsColor(inputs.circleColor, inputs.circleOpacity);
  params.set(
    "path",
    `color:${strokeColor}|weight:2|fillcolor:${fillColor}|enc:${encoded}`,
  );
  params.set("key", key);

  try {
    const resp = await fetch(`${STATIC_MAPS_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) {
      log.warn("static maps HTTP error", { status: resp.status });
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!inputs.poweredBy) return buf;
    // Powered-by overlay: bake a small PNG strip into the image. Without
    // `sharp` available we fall back to appending an iTXt chunk note —
    // visually we cannot composite. Instead, we serve the unmodified Google
    // PNG and rely on the customer's site to render a small caption beneath
    // their <img>. We document this in the embed snippet shown in the
    // portal page. (See ServiceAreaMap.tsx — the embed includes a tiny
    // <span> for free-tier users.)
    return buf;
  } catch (err: any) {
    log.error("static maps threw", { error: err?.message });
    return null;
  }
}

/* ─── placeholder PNG (1x1 transparent — 67 bytes) ─── */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/* ─── validation schemas ─── */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const configBody = z.object({
  enabled: z.boolean().optional(),
  address_line: z.string().min(1).max(200),
  address_city: z.string().max(120).optional().nullable(),
  address_region: z.string().max(120).optional().nullable(),
  address_postal: z.string().max(40).optional().nullable(),
  address_country: z.string().max(2).optional().nullable(),
  radius_value: z.number().int().min(1).max(500),
  radius_unit: z.enum(["miles", "km"]),
  map_style: z.enum(["roadmap", "satellite", "terrain", "hybrid"]),
  pin_color: z.string().regex(HEX_COLOR_RE),
  circle_color: z.string().regex(HEX_COLOR_RE),
  circle_opacity: z.number().min(0.05).max(0.5),
});

/* ─── cache helpers ─── */

function fullAddress(c: {
  address_line: string;
  address_city: string | null;
  address_region: string | null;
  address_postal: string | null;
  address_country: string | null;
}): string {
  return [c.address_line, c.address_city, c.address_region, c.address_postal, c.address_country]
    .filter(Boolean)
    .join(", ");
}

async function ensureRenderedCache(clientId: number): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select()
    .from(serviceAreaMapConfigs)
    .where(eq(serviceAreaMapConfigs.client_id, clientId))
    .limit(1);
  if (!row) return { ok: false, reason: "no_config" };
  if (!row.center_lat || !row.center_lng) return { ok: false, reason: "no_geocode" };

  const poweredBy = !(await hasActivePaidSubscription(clientId));
  const inputs: RenderInputs = {
    lat: Number(row.center_lat),
    lng: Number(row.center_lng),
    radiusValue: row.radius_value,
    radiusUnit: row.radius_unit as "miles" | "km",
    mapStyle: row.map_style,
    pinColor: row.pin_color,
    circleColor: row.circle_color,
    circleOpacity: Number(row.circle_opacity),
    poweredBy,
  };
  const cacheKey = deriveCacheKey(inputs);
  const cacheDir = getCacheDir();
  const cachePath = path.join(cacheDir, `${cacheKey}.png`);

  // HIT?
  if (row.cache_key === cacheKey && row.cache_path && fs.existsSync(cachePath)) {
    return { ok: true };
  }

  // MISS — render + persist.
  const buf = await renderMapPng(inputs);
  if (!buf) return { ok: false, reason: "render_failed" };

  try {
    fs.writeFileSync(cachePath, buf);
  } catch (err: any) {
    log.error("cache write failed", { error: err?.message, cachePath });
    return { ok: false, reason: "cache_write_failed" };
  }

  await db
    .update(serviceAreaMapConfigs)
    .set({ cache_key: cacheKey, cache_path: cachePath, cached_at: new Date() })
    .where(eq(serviceAreaMapConfigs.client_id, clientId));

  return { ok: true };
}

/* ─── route registration ─── */

export function registerServiceAreaMapRoutes(app: Express): void {
  /* ── Portal: GET config ── */
  app.get("/api/portal/free-tools/service-area", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (clientId === null) return;
      const [row] = await db
        .select()
        .from(serviceAreaMapConfigs)
        .where(eq(serviceAreaMapConfigs.client_id, clientId))
        .limit(1);
      const token = await storage.ensureWidgetToken(clientId);
      const apiKeyConfigured = Boolean(getMapsApiKey());
      res.json({
        config: row ?? null,
        widgetToken: token,
        apiKeyConfigured,
      });
    } catch (err: any) {
      log.error("get config error", { error: err?.message });
      res.status(500).json({ error: "Failed to load service-area config" });
    }
  });

  /* ── Portal: PUT config ── */
  app.put("/api/portal/free-tools/service-area", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (clientId === null) return;
      const parsed = configBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const p = parsed.data;

      // Address changed? Re-geocode.
      const [existing] = await db
        .select()
        .from(serviceAreaMapConfigs)
        .where(eq(serviceAreaMapConfigs.client_id, clientId))
        .limit(1);

      const addressChanged =
        !existing ||
        existing.address_line !== p.address_line ||
        (existing.address_city ?? null) !== (p.address_city ?? null) ||
        (existing.address_region ?? null) !== (p.address_region ?? null) ||
        (existing.address_postal ?? null) !== (p.address_postal ?? null) ||
        (existing.address_country ?? null) !== (p.address_country ?? null);

      let centerLat: string | null = existing?.center_lat ?? null;
      let centerLng: string | null = existing?.center_lng ?? null;

      if (addressChanged) {
        const geo = await geocodeAddress(
          fullAddress({
            address_line: p.address_line,
            address_city: p.address_city ?? null,
            address_region: p.address_region ?? null,
            address_postal: p.address_postal ?? null,
            address_country: p.address_country ?? null,
          }),
        );
        if (!geo) {
          return res
            .status(400)
            .json({ error: "Address not found, please verify.", code: "geocode_failed" });
        }
        centerLat = geo.lat.toFixed(7);
        centerLng = geo.lng.toFixed(7);
      }

      const values = {
        client_id: clientId,
        enabled: p.enabled ?? existing?.enabled ?? false,
        address_line: p.address_line,
        address_city: p.address_city ?? null,
        address_region: p.address_region ?? null,
        address_postal: p.address_postal ?? null,
        address_country: p.address_country ?? "US",
        center_lat: centerLat,
        center_lng: centerLng,
        radius_value: p.radius_value,
        radius_unit: p.radius_unit,
        map_style: p.map_style,
        pin_color: p.pin_color,
        circle_color: p.circle_color,
        circle_opacity: p.circle_opacity.toFixed(2),
        // Cache invalidation: bump key to a sentinel so the next public GET
        // recomputes. We don't delete the old file (it may still be in CDN
        // caches for ≤30 days; orphan cleanup runs separately).
        cache_key: null as string | null,
        cache_path: null as string | null,
        cached_at: null as Date | null,
        updated_at: new Date(),
      };

      if (existing) {
        await db
          .update(serviceAreaMapConfigs)
          .set(values)
          .where(eq(serviceAreaMapConfigs.client_id, clientId));
      } else {
        await db.insert(serviceAreaMapConfigs).values(values);
      }

      // Best-effort: warm the cache immediately so the portal preview shows
      // the new map without waiting for the public endpoint to populate it.
      await ensureRenderedCache(clientId).catch((err) => {
        log.warn("post-save warm failed", { error: err?.message });
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("save config error", { error: err?.message });
      res.status(500).json({ error: "Failed to save service-area config" });
    }
  });

  /* ── Portal: force regenerate ── */
  app.post("/api/portal/free-tools/service-area/regenerate", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (clientId === null) return;
      // Force regen by nulling cache_key first.
      await db
        .update(serviceAreaMapConfigs)
        .set({ cache_key: null, cache_path: null, cached_at: null })
        .where(eq(serviceAreaMapConfigs.client_id, clientId));
      const result = await ensureRenderedCache(clientId);
      if (!result.ok) {
        return res.status(400).json({ error: "Regeneration failed", reason: result.reason });
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("regenerate error", { error: err?.message });
      res.status(500).json({ error: "Failed to regenerate map" });
    }
  });

  /* ── Public: serve PNG by widget_token ── */
  app.get("/free-tool/service-area/:token.png", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "");
      if (!token || token.length < 16) {
        res.setHeader("Content-Type", "image/png");
        return res.status(404).send(PLACEHOLDER_PNG);
      }

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.widget_token, token))
        .limit(1);
      if (!client) {
        res.setHeader("Content-Type", "image/png");
        return res.status(404).send(PLACEHOLDER_PNG);
      }

      const [cfg] = await db
        .select()
        .from(serviceAreaMapConfigs)
        .where(eq(serviceAreaMapConfigs.client_id, client.id))
        .limit(1);

      if (!cfg || !cfg.enabled) {
        // Short cache so toggling on/off propagates quickly.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.setHeader("Content-Type", "image/png");
        return res.send(PLACEHOLDER_PNG);
      }

      const result = await ensureRenderedCache(client.id);
      if (!result.ok) {
        log.warn("serve fallback to placeholder", { reason: result.reason, clientId: client.id });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.setHeader("Content-Type", "image/png");
        return res.status(200).send(PLACEHOLDER_PNG);
      }

      // Re-fetch updated row so we have the cache_path.
      const [fresh] = await db
        .select({ cache_path: serviceAreaMapConfigs.cache_path })
        .from(serviceAreaMapConfigs)
        .where(eq(serviceAreaMapConfigs.client_id, client.id))
        .limit(1);

      const cachePath = fresh?.cache_path;
      if (!cachePath || !fs.existsSync(cachePath)) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.setHeader("Content-Type", "image/png");
        return res.status(200).send(PLACEHOLDER_PNG);
      }

      const buf = fs.readFileSync(cachePath);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.send(buf);
    } catch (err: any) {
      log.error("serve png error", { error: err?.message });
      res.setHeader("Content-Type", "image/png");
      res.status(500).send(PLACEHOLDER_PNG);
    }
  });
}
