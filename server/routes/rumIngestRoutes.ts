/**
 * SEO Wave D — RUM Web Vitals ingest.
 *
 * POST /api/rum/web-vitals (public, no auth)
 *   Accepts one Core Web Vitals sample from the browser:
 *     { url, metric, value, rating, id?, navigationType? }
 *   Validates, inserts into `rum_web_vitals_samples`, and asynchronously
 *   forwards to GA4 via the Measurement Protocol (production only — same
 *   GA4_MEASUREMENT_ID + GA4_MEASUREMENT_PROTOCOL_API_SECRET Doppler
 *   secret used by server-side conversion events).
 *
 *   Returns 204 on success and 204 on most validation/insert failures —
 *   the client uses `navigator.sendBeacon` and we must never block or
 *   error a page-load on a telemetry write. Genuinely malformed bodies
 *   (missing required fields) return 400.
 *
 *   Rate-limited in-memory at 60 samples / minute / IP (one sample per
 *   page per session is the client-side cap, so 60/min/IP comfortably
 *   handles fast tab-switchers without being a DoS vector).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../db";
import { rumWebVitalsSamples } from "@shared/schema";
import { createLogger } from "../lib/logger";
import {
  sendGA4Event,
  clientIdFromStableId,
} from "../lib/analytics/ga4Server";

const log = createLogger("RumWebVitals");

/* ─── Rate limiting (in-memory, per IP, 60/min) ──────────────────────── */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0];
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimitRum(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    // Don't 429 — telemetry is best-effort; just swallow.
    return res.status(204).end();
  }
  existing.count += 1;
  return next();
}

let lastSweepAt = 0;
function maybeSweepBuckets() {
  const now = Date.now();
  if (now - lastSweepAt < RATE_LIMIT_WINDOW_MS) return;
  lastSweepAt = now;
  for (const [ip, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(ip);
  }
}

/* ─── Validation ──────────────────────────────────────────────────────── */

const ALLOWED_METRICS = new Set(["LCP", "CLS", "INP", "FCP", "TTFB"]);
const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const ALLOWED_NAV_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
]);

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
  metric: z.string().min(1).max(20),
  value: z.number().finite(),
  rating: z.string().max(40).optional(),
  id: z.string().max(200).optional(),
  navigationType: z.string().max(40).optional(),
});

function hashIdentity(ua: string, ip: string): string {
  return crypto
    .createHash("sha256")
    .update(`${ua}|${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export function registerRumIngestRoutes(app: Express): void {
  app.post(
    "/api/rum/web-vitals",
    rateLimitRum,
    async (req: Request, res: Response) => {
      maybeSweepBuckets();
      try {
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "invalid_body" });
        }
        const body = parsed.data;
        if (!ALLOWED_METRICS.has(body.metric)) {
          return res.status(400).json({ error: "invalid_metric" });
        }
        const rating =
          body.rating && ALLOWED_RATINGS.has(body.rating) ? body.rating : null;
        const navigationType =
          body.navigationType && ALLOWED_NAV_TYPES.has(body.navigationType)
            ? body.navigationType
            : null;

        const ua = String(req.headers["user-agent"] ?? "").slice(0, 400);
        const ip = getClientIp(req);
        const uaHash = hashIdentity(ua, ip);

        // Respond 204 immediately; persist + forward asynchronously so a
        // slow DB or GA4 endpoint never delays the response.
        res.status(204).end();

        void (async () => {
          try {
            await db.insert(rumWebVitalsSamples).values({
              url: body.url.slice(0, 2000),
              metric_name: body.metric,
              value: body.value,
              rating,
              metric_id: body.id ?? null,
              navigation_type: navigationType,
              user_agent_hash: uaHash,
            });
          } catch (err: any) {
            log.warn("rum sample insert failed", { error: err?.message });
          }

          // Mirror to GA4 as a custom event so the existing Looker /
          // Explorations dashboards can slice it alongside marketing
          // funnels. No-op in dev (sendGA4Event gates on NODE_ENV).
          try {
            await sendGA4Event({
              clientId: clientIdFromStableId(uaHash),
              name: "web_vitals",
              params: {
                metric_name: body.metric,
                metric_value: body.value,
                metric_rating: rating ?? "unknown",
                metric_id: body.id ?? "",
                page_path: body.url.slice(0, 200),
                navigation_type: navigationType ?? "",
              },
            });
          } catch (err: any) {
            // sendGA4Event already swallows internally; this catch is belt-and-braces.
            log.warn("rum GA4 forward failed", { error: err?.message });
          }
        })();
      } catch (err: any) {
        log.warn("rum ingest failed", { error: err?.message });
        if (!res.headersSent) {
          return res.status(204).end();
        }
      }
    },
  );
}
