/**
 * Public widget routes for the Free Tools batch 1 — FAQ, Business Hours,
 * Trust Badges. All three resolve a public widget_token (already on clients)
 * and return JSON. No authentication; CORS open. The `poweredBy` flag is
 * `true` for free-tier clients (no active paid subscription), driving the
 * "Powered by WeFixTrades" footer on the embed.
 *
 * Endpoints:
 *   GET /api/widget/:token/faq      (5-min cache)
 *   GET /api/widget/:token/hours    (60-sec cache — open/closed flips on the minute)
 *   GET /api/widget/:token/badges   (5-min cache)
 *
 * Plus a server-rendered preview shell at /widget/preview/:tool so the
 * portal pages can iframe the actual embed JS for a live preview.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, asc, sql, gte } from "drizzle-orm";
import { z } from "zod";
import {
  clients,
  clientServices,
  clientFaqItems,
  clientTrustBadges,
  callbackWidgetConfigs,
  callbackRequests,
} from "@shared/schemas/adminCrm";
import { createLogger } from "../lib/logger";
import { RateLimiter, MemoryRateLimitStore } from "../services/rateLimiter";

const log = createLogger("WidgetFreetools");

const CACHE_TTL_LONG_MS = 5 * 60 * 1000;
const CACHE_TTL_SHORT_MS = 60 * 1000;
const FREE_TIER_FAQ_CAP = 10;
const FREE_TIER_CALLBACK_CAP_PER_MONTH = 25;

// Anti-spam for callback widget — 3 submissions per token+IP per hour.
const callbackStore = new MemoryRateLimitStore();
const callbackLimiter = new RateLimiter(callbackStore, 3, 60 * 60_000);

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return String(fwd[0]).split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

interface CacheEntry { data: any; expires: number }
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): any | null {
  const e = cache.get(key);
  if (!e || Date.now() > e.expires) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

function cacheSet(key: string, data: any, ttl: number): void {
  cache.set(key, { data, expires: Date.now() + ttl });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) if (now > v.expires) cache.delete(k);
  }
}

export function invalidateFreetoolsCache(clientId: number, tool: "faq" | "hours" | "badges" | "callback"): void {
  // Cache key includes token, not client id — wipe all entries for safety.
  // Cheaper to drop the whole namespace prefix than to keep token↔client map.
  for (const k of cache.keys()) {
    if (k.endsWith(":" + tool) || k.endsWith(":" + tool + ":" + clientId)) {
      cache.delete(k);
    }
  }
}

async function resolveClientByToken(token: string) {
  if (!token || token.length < 16) return null;
  const [row] = await db.select().from(clients).where(eq(clients.widget_token, token)).limit(1);
  return row ?? null;
}

async function hasActivePaidSubscription(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientServices)
    .where(and(eq(clientServices.client_id, clientId), sql`${clientServices.status} = 'active'`));
  return (row?.count ?? 0) > 0;
}

function setPublicHeaders(res: Response, maxAgeSec: number) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", `public, max-age=${maxAgeSec}`);
}

/* ─── Hours helpers ─── */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

interface DaySpec { open: boolean; opens?: string; closes?: string }
interface HoursMap { tz?: string; sun?: DaySpec; mon?: DaySpec; tue?: DaySpec; wed?: DaySpec; thu?: DaySpec; fri?: DaySpec; sat?: DaySpec }
interface SpecialDay { date: string; closed?: boolean; opens?: string; closes?: string }

function computeOpenStatus(hours: HoursMap | null, special: SpecialDay[] | null, now: Date) {
  if (!hours) return { status: "closed" as const };
  const tz = hours.tz || "UTC";
  // Format current date + day-of-week in the configured tz.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  const dayShort = get("weekday").toLowerCase().slice(0, 3) as DayKey;
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  const hh = get("hour");
  const mm = get("minute");
  const nowHM = `${hh}:${mm}`;

  // Holiday override
  if (Array.isArray(special)) {
    const sp = special.find(s => s.date === isoDate);
    if (sp) {
      if (sp.closed || !sp.opens || !sp.closes) return { status: "closed" as const };
      return nowHM >= sp.opens && nowHM < sp.closes
        ? { status: "open" as const, closesAt: sp.closes }
        : { status: "closed" as const, opensAt: nowHM < sp.opens ? sp.opens : undefined };
    }
  }

  const day = hours[dayShort];
  if (!day || !day.open || !day.opens || !day.closes) return { status: "closed" as const };
  if (nowHM >= day.opens && nowHM < day.closes) {
    return { status: "open" as const, closesAt: day.closes };
  }
  return { status: "closed" as const, opensAt: nowHM < day.opens ? day.opens : undefined };
}

/* ─── Routes ─── */
export function registerWidgetFreetoolsRoutes(app: Express): void {
  // ─── FAQ ─────────────────────────────────────────────────────────────
  app.get("/api/widget/:token/faq", async (req: Request, res: Response) => {
    setPublicHeaders(res, 300);
    try {
      const token = String(req.params.token || "");
      const cacheKey = `${token}:faq`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const client = await resolveClientByToken(token);
      if (!client) return res.status(404).json({ error: "Widget not found" });

      const rows = await db
        .select()
        .from(clientFaqItems)
        .where(and(eq(clientFaqItems.client_id, client.id), eq(clientFaqItems.published, true)))
        .orderBy(asc(clientFaqItems.position))
        .limit(FREE_TIER_FAQ_CAP);

      const poweredBy = !(await hasActivePaidSubscription(client.id));
      const data = {
        businessName: client.business_name,
        items: rows.map(r => ({ id: r.id, question: r.question, answer: r.answer })),
        poweredBy,
      };
      cacheSet(cacheKey, data, CACHE_TTL_LONG_MS);
      res.json(data);
    } catch (err: any) {
      log.error("[widget/faq] error", { error: err?.message });
      res.status(500).json({ error: "Failed to load FAQ" });
    }
  });

  // ─── Hours ───────────────────────────────────────────────────────────
  app.get("/api/widget/:token/hours", async (req: Request, res: Response) => {
    setPublicHeaders(res, 60);
    try {
      const token = String(req.params.token || "");
      const cacheKey = `${token}:hours`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const client = await resolveClientByToken(token);
      if (!client) return res.status(404).json({ error: "Widget not found" });

      const hours = (client.business_hours as HoursMap | null) ?? null;
      const special = (client.special_hours as SpecialDay[] | null) ?? null;
      const statusInfo = computeOpenStatus(hours, special, new Date());

      const poweredBy = !(await hasActivePaidSubscription(client.id));
      const data = {
        businessName: client.business_name,
        hours: hours ?? {},
        special: special ?? [],
        ...statusInfo,
        poweredBy,
      };
      cacheSet(cacheKey, data, CACHE_TTL_SHORT_MS);
      res.json(data);
    } catch (err: any) {
      log.error("[widget/hours] error", { error: err?.message });
      res.status(500).json({ error: "Failed to load hours" });
    }
  });

  // ─── Trust Badges ────────────────────────────────────────────────────
  app.get("/api/widget/:token/badges", async (req: Request, res: Response) => {
    setPublicHeaders(res, 300);
    try {
      const token = String(req.params.token || "");
      const cacheKey = `${token}:badges`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const client = await resolveClientByToken(token);
      if (!client) return res.status(404).json({ error: "Widget not found" });

      const [row] = await db
        .select()
        .from(clientTrustBadges)
        .where(eq(clientTrustBadges.client_id, client.id))
        .limit(1);

      const poweredBy = !(await hasActivePaidSubscription(client.id));
      const data = {
        businessName: client.business_name,
        badges: Array.isArray(row?.badges) ? row!.badges : [],
        poweredBy,
      };
      cacheSet(cacheKey, data, CACHE_TTL_LONG_MS);
      res.json(data);
    } catch (err: any) {
      log.error("[widget/badges] error", { error: err?.message });
      res.status(500).json({ error: "Failed to load badges" });
    }
  });

  // ─── Callback widget config ──────────────────────────────────────────
  app.get("/api/widget/:token/callback-config", async (req: Request, res: Response) => {
    setPublicHeaders(res, 300);
    try {
      const token = String(req.params.token || "");
      const cacheKey = `${token}:callback`;
      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const client = await resolveClientByToken(token);
      if (!client) return res.status(404).json({ error: "Widget not found" });

      const [cfg] = await db
        .select()
        .from(callbackWidgetConfigs)
        .where(eq(callbackWidgetConfigs.client_id, client.id))
        .limit(1);

      const poweredBy = !(await hasActivePaidSubscription(client.id));
      const data = {
        businessName: client.business_name,
        enabled: cfg?.enabled ?? true,
        heading: cfg?.heading ?? "Request a callback",
        ctaLabel: cfg?.cta_label ?? "Send request",
        fields: cfg?.fields_json ?? { name: true, phone: true, message: true, best_time: true },
        poweredBy,
      };
      cacheSet(cacheKey, data, CACHE_TTL_LONG_MS);
      res.json(data);
    } catch (err: any) {
      log.error("[widget/callback-config] error", { error: err?.message });
      res.status(500).json({ error: "Failed to load callback config" });
    }
  });

  // ─── Callback widget submission ──────────────────────────────────────
  const callbackSubmitBody = z.object({
    name: z.string().min(1).max(200),
    phone: z.string().min(3).max(40),
    message: z.string().max(2000).optional(),
    best_time: z.string().max(200).optional(),
    source_url: z.string().max(500).optional(),
    // Honeypot — invisible field. Bots fill it, humans don't.
    hp: z.string().max(500).optional(),
  });

  app.options("/api/widget/:token/callback", (_req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
  });

  app.post("/api/widget/:token/callback", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const token = String(req.params.token || "");
      const ip = getClientIp(req);
      if (!(await callbackLimiter.check(`cb:${token}:${ip}`))) {
        return res.status(429).json({ error: "Too many submissions, please wait." });
      }

      const parsed = callbackSubmitBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      // Honeypot — silently accept then drop. Bots get a 200 so they don't
      // retry, but nothing hits the inbox.
      if (parsed.data.hp && parsed.data.hp.trim().length > 0) {
        log.warn("callback honeypot filled", { token: token.slice(0, 8) });
        return res.json({ ok: true });
      }

      const client = await resolveClientByToken(token);
      if (!client) return res.status(404).json({ error: "Widget not found" });

      // Free-tier monthly cap.
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const [countRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(callbackRequests)
        .where(
          and(
            eq(callbackRequests.client_id, client.id),
            gte(callbackRequests.created_at, monthStart),
          ),
        );
      if ((countRow?.c ?? 0) >= FREE_TIER_CALLBACK_CAP_PER_MONTH) {
        return res.status(429).json({
          error: "This widget has reached its free-tier monthly limit. Upgrade for unlimited callbacks.",
          code: "free_tier_cap",
          cap: FREE_TIER_CALLBACK_CAP_PER_MONTH,
        });
      }

      await db.insert(callbackRequests).values({
        client_id: client.id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        message: parsed.data.message ?? null,
        best_time: parsed.data.best_time ?? null,
        source_url: parsed.data.source_url ?? null,
        visitor_ip: ip,
        status: "new",
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("[widget/callback] error", { error: err?.message });
      res.status(500).json({ error: "Failed to submit callback request" });
    }
  });

  // ─── Preview shell ───────────────────────────────────────────────────
  // GET /widget/preview/:tool?token=...   — minimal HTML page that loads
  // the real widget script, intended to be iframed by the portal editor.
  app.get("/widget/preview/:tool", (req: Request, res: Response) => {
    const tool = String(req.params.tool || "");
    if (!["faq", "hours", "badges", "callback"].includes(tool)) {
      return res.status(400).send("Unknown tool");
    }
    const token = String(req.query.token || "");
    if (!token || token.length < 16) return res.status(400).send("Invalid token");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
    );
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Widget preview</title>
<style>
  html,body { margin:0; padding:0; background:#f8fafc; }
  body { padding:16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#0f172a; }
</style>
</head>
<body>
<script src="/widget/v1.js" data-site-key="${encodeURIComponent(token)}" data-tool="${tool}" async></script>
</body>
</html>`);
  });
}
