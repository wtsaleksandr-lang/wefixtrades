/**
 * Marketing waitlist endpoints — Wave W-AN-2.
 *
 * Three products (SocialSync, ReputationShield, MapGuard) are blocked
 * on platform approvals and can't ship at the 2026-07-15 launch. Their
 * marketing pages render with a Coming Soon banner + waitlist form;
 * this module handles the form submissions and the admin oversight
 * reads.
 *
 *   POST  /api/marketing/waitlist            — public signup (rate-limited)
 *   GET   /api/admin/marketing/waitlist      — admin list (grouped client-side)
 *   POST  /api/admin/marketing/waitlist/:id/notify — admin marks a row notified
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { productWaitlist } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("MarketingWaitlist");

// Lightweight in-memory rate limit, same shape as demoLeadRoutes.
// Public endpoint — protects against spam without pulling in a new dep.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 10;

const signupSchema = z.object({
  product_slug: z.string().min(1).max(64),
  email: z.string().email().max(254),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  business_name: z.string().trim().max(120).optional().or(z.literal("")),
  source: z.string().trim().max(120).optional().or(z.literal("")),
});

export function registerMarketingWaitlistRoutes(app: Express): void {
  /* ─── Public signup ─────────────────────────────────────────── */
  app.post("/api/marketing/waitlist", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      let rl = rateMap.get(ip);
      if (!rl || now > rl.resetAt) {
        rl = { count: 0, resetAt: now + RATE_WINDOW };
        rateMap.set(ip, rl);
      }
      rl.count++;
      if (rl.count > RATE_MAX) {
        return res.status(429).json({ error: "Too many submissions. Please try again in a few minutes." });
      }

      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const { product_slug, email, phone, business_name, source } = parsed.data;

      const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

      try {
        await db
          .insert(productWaitlist)
          .values({
            product_slug: product_slug.toLowerCase(),
            email: email.toLowerCase(),
            phone: phone || null,
            business_name: business_name || null,
            source: source || null,
            ip,
            user_agent: userAgent,
          } as any)
          .onConflictDoNothing({
            target: [productWaitlist.product_slug, productWaitlist.email],
          });
      } catch (err: any) {
        // Unique-constraint races still resolve to "already signed up" —
        // friendly response, no leak.
        log.warn("[waitlist] insert failed:", err.message);
      }

      return res.json({ success: true });
    } catch (err: any) {
      log.error("[waitlist] unexpected error:", err.message);
      return res.status(500).json({ error: "Failed to save signup" });
    }
  });

  /* ─── Admin: list signups ───────────────────────────────────── */
  app.get("/api/admin/marketing/waitlist", requireAdmin, async (req: Request, res: Response) => {
    try {
      const querySchema = z.object({
        product_slug: z.string().optional(),
        pending_only: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { product_slug, pending_only, limit } = parsed.data;

      const conds: any[] = [];
      if (product_slug) conds.push(eq(productWaitlist.product_slug, product_slug.toLowerCase()));
      if (pending_only) conds.push(isNull(productWaitlist.notified_at));
      const whereClause = conds.length > 0 ? and(...conds) : undefined;

      const base = db
        .select()
        .from(productWaitlist)
        .orderBy(desc(productWaitlist.created_at))
        .limit(limit);
      const rows = whereClause ? await base.where(whereClause) : await base;

      // Per-slug counts for the admin page header
      const countRows = await db
        .select({
          product_slug: productWaitlist.product_slug,
          total: sql<number>`count(*)::int`,
          pending: sql<number>`sum(case when ${productWaitlist.notified_at} is null then 1 else 0 end)::int`,
        })
        .from(productWaitlist)
        .groupBy(productWaitlist.product_slug);

      return res.json({
        rows: rows.map((r) => ({ ...r, id: String(r.id) })),
        counts: countRows,
      });
    } catch (err: any) {
      log.error("[waitlist] list failed:", err.message);
      return res.status(500).json({ error: "Failed to load waitlist" });
    }
  });

  /* ─── Admin: mark notified ──────────────────────────────────── */
  app.post(
    "/api/admin/marketing/waitlist/:id/notify",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid id" });
        }
        const result = await db
          .update(productWaitlist)
          .set({ notified_at: new Date() })
          .where(eq(productWaitlist.id, id))
          .returning({ id: productWaitlist.id });
        if (result.length === 0) return res.status(404).json({ error: "Not found" });
        return res.json({ success: true, id: String(result[0].id) });
      } catch (err: any) {
        log.error("[waitlist] notify failed:", err.message);
        return res.status(500).json({ error: "Failed to mark notified" });
      }
    },
  );
}
