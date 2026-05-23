/**
 * Public Review-link funnel routes — free-tools batch 2.
 *
 * Public, no-auth endpoints powering the /r/:slug star-rating gate:
 *
 *   GET  /api/r/:slug/config    — returns business_name + logo + heading +
 *                                  links + threshold so the client SPA can
 *                                  render the landing page.
 *   POST /api/r/:slug/click     — logs a star click + returns the redirect
 *                                  URL (or null if below threshold so the
 *                                  client renders the feedback form).
 *   POST /api/r/:slug/feedback  — captures private feedback (rating below
 *                                  threshold) plus optional name/email.
 *
 * Free-tier monthly cap: 50 routed visits (rating click → routed_to set).
 * Enforced server-side; over-cap returns 429 with an upsell hint.
 *
 * Rate-limit: 5 click+feedback submissions per IP per minute (anti-abuse).
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, sql, gte } from "drizzle-orm";
import { z } from "zod";
import {
  clients,
  reviewLinkConfigs,
  reviewFunnelEvents,
} from "@shared/schemas/adminCrm";
import { createLogger } from "../lib/logger";
import { RateLimiter, MemoryRateLimitStore } from "../services/rateLimiter";

const log = createLogger("ReviewFunnel");

const FREE_TIER_ROUTED_CAP_PER_MONTH = 50;

// Local store for funnel anti-abuse — shared across click + feedback so a
// single visitor can't trivially fan-out by hitting both endpoints.
const funnelStore = new MemoryRateLimitStore();
const funnelLimiter = new RateLimiter(funnelStore, 5, 60_000);

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return String(fwd[0]).split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function setPublicHeaders(res: Response, maxAgeSec: number) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", `public, max-age=${maxAgeSec}`);
}

async function resolveClientBySlug(slug: string) {
  if (!slug || slug.length < 2) return null;
  const [row] = await db
    .select({
      clientId: clients.id,
      businessName: clients.business_name,
      logoUrl: clients.logo_url,
      slug: reviewLinkConfigs.slug,
      google: reviewLinkConfigs.google_url,
      facebook: reviewLinkConfigs.facebook_url,
      yelp: reviewLinkConfigs.yelp_url,
      threshold: reviewLinkConfigs.threshold,
      heading: reviewLinkConfigs.heading,
    })
    .from(reviewLinkConfigs)
    .innerJoin(clients, eq(clients.id, reviewLinkConfigs.client_id))
    .where(eq(reviewLinkConfigs.slug, slug))
    .limit(1);
  return row ?? null;
}

async function routedCountThisMonth(clientId: number): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(reviewFunnelEvents)
    .where(
      and(
        eq(reviewFunnelEvents.client_id, clientId),
        sql`${reviewFunnelEvents.routed_to} IS NOT NULL`,
        gte(reviewFunnelEvents.created_at, start),
      ),
    );
  return row?.c ?? 0;
}

function pickExternalUrl(
  cfg: { google: string | null; facebook: string | null; yelp: string | null },
): { url: string; routedTo: "google" | "facebook" | "yelp" } | null {
  if (cfg.google) return { url: cfg.google, routedTo: "google" };
  if (cfg.facebook) return { url: cfg.facebook, routedTo: "facebook" };
  if (cfg.yelp) return { url: cfg.yelp, routedTo: "yelp" };
  return null;
}

/* ─── Validation ─── */
const clickBody = z.object({
  rating: z.number().int().min(1).max(5),
});
const feedbackBody = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  feedback: z.string().min(1).max(4000),
  name: z.string().max(200).optional(),
  email: z.string().email().max(200).optional(),
});

export function registerReviewFunnelRoutes(app: Express): void {
  /* ─── Config (drives the public landing page) ─── */
  app.get("/api/r/:slug/config", async (req: Request, res: Response) => {
    setPublicHeaders(res, 60);
    try {
      const slug = String(req.params.slug || "").toLowerCase();
      const cfg = await resolveClientBySlug(slug);
      if (!cfg) return res.status(404).json({ error: "Not found" });

      // Log landing (no rating, no routed_to). Best-effort — never blocks.
      db.insert(reviewFunnelEvents).values({
        client_id: cfg.clientId,
        slug,
        rating: null,
        routed_to: null,
        visitor_ip: getClientIp(req),
        user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      }).catch(() => { /* swallow */ });

      res.json({
        slug: cfg.slug,
        businessName: cfg.businessName,
        logoUrl: cfg.logoUrl,
        heading: cfg.heading,
        threshold: cfg.threshold,
        // Expose only presence (boolean) so the page can show "Google review"
        // buttons appropriately; the actual URL stays server-side until the
        // click endpoint validates the rating.
        hasGoogle: !!cfg.google,
        hasFacebook: !!cfg.facebook,
        hasYelp: !!cfg.yelp,
      });
    } catch (err: any) {
      log.error("config error", { error: err?.message });
      res.status(500).json({ error: "Failed to load review link" });
    }
  });

  /* ─── Star click ─── */
  app.post("/api/r/:slug/click", async (req: Request, res: Response) => {
    setPublicHeaders(res, 0);
    try {
      const ip = getClientIp(req);
      if (!(await funnelLimiter.check(`r:${ip}`))) {
        return res.status(429).json({ error: "Too many requests, slow down." });
      }
      const slug = String(req.params.slug || "").toLowerCase();
      const parsed = clickBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid rating" });

      const cfg = await resolveClientBySlug(slug);
      if (!cfg) return res.status(404).json({ error: "Not found" });

      const rating = parsed.data.rating;
      const ua = String(req.headers["user-agent"] || "").slice(0, 500);

      if (rating >= cfg.threshold) {
        const picked = pickExternalUrl(cfg);
        if (!picked) {
          // No external URL configured — fall back to feedback mode so we
          // don't lose the high-rating signal.
          await db.insert(reviewFunnelEvents).values({
            client_id: cfg.clientId,
            slug,
            rating,
            routed_to: "feedback",
            visitor_ip: ip,
            user_agent: ua,
          });
          return res.json({ mode: "feedback" });
        }

        // Free-tier cap on routed visits.
        const used = await routedCountThisMonth(cfg.clientId);
        if (used >= FREE_TIER_ROUTED_CAP_PER_MONTH) {
          return res.status(429).json({
            error: "This review link has reached its free-tier monthly limit. Upgrade for unlimited routed visits.",
            code: "free_tier_cap",
            cap: FREE_TIER_ROUTED_CAP_PER_MONTH,
          });
        }

        await db.insert(reviewFunnelEvents).values({
          client_id: cfg.clientId,
          slug,
          rating,
          routed_to: picked.routedTo,
          visitor_ip: ip,
          user_agent: ua,
        });
        return res.json({ mode: "external", redirect: picked.url, routedTo: picked.routedTo });
      }

      // Below threshold — render private feedback form.
      // We DON'T log routed_to here yet; that's logged when feedback POST lands.
      return res.json({ mode: "feedback" });
    } catch (err: any) {
      log.error("click error", { error: err?.message });
      res.status(500).json({ error: "Failed to record click" });
    }
  });

  /* ─── Private feedback submission ─── */
  app.post("/api/r/:slug/feedback", async (req: Request, res: Response) => {
    setPublicHeaders(res, 0);
    try {
      const ip = getClientIp(req);
      if (!(await funnelLimiter.check(`r:${ip}`))) {
        return res.status(429).json({ error: "Too many requests, slow down." });
      }
      const slug = String(req.params.slug || "").toLowerCase();
      const parsed = feedbackBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      const cfg = await resolveClientBySlug(slug);
      if (!cfg) return res.status(404).json({ error: "Not found" });

      // Build the feedback payload — append name/email inline so the inbox
      // shows everything without a JSONB column.
      const parts: string[] = [];
      if (parsed.data.name) parts.push(`Name: ${parsed.data.name}`);
      if (parsed.data.email) parts.push(`Email: ${parsed.data.email}`);
      parts.push(parsed.data.feedback);
      const fullFeedback = parts.join("\n\n");

      await db.insert(reviewFunnelEvents).values({
        client_id: cfg.clientId,
        slug,
        rating: parsed.data.rating ?? null,
        routed_to: "feedback",
        feedback: fullFeedback,
        visitor_ip: ip,
        user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("feedback error", { error: err?.message });
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  /* ─── CORS preflight ─── */
  app.options("/api/r/:slug/click", (_req, res) => {
    setPublicHeaders(res, 0);
    res.status(204).end();
  });
  app.options("/api/r/:slug/feedback", (_req, res) => {
    setPublicHeaders(res, 0);
    res.status(204).end();
  });
}
