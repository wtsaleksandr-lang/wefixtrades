/**
 * Portal CRUD routes for Free Tools batch 1 — FAQ items, business hours,
 * trust badges. Authenticated client-only (requireClient). All routes resolve
 * the caller's client_id via the user→client link.
 *
 * Endpoints:
 *   GET    /api/portal/free-tools/faq                  → list (admin view, all items)
 *   POST   /api/portal/free-tools/faq                  → create
 *   PATCH  /api/portal/free-tools/faq/:id              → update one item
 *   DELETE /api/portal/free-tools/faq/:id              → delete one item
 *   POST   /api/portal/free-tools/faq/reorder          → bulk update positions
 *
 *   GET    /api/portal/free-tools/hours                → load + return widget_token
 *   PUT    /api/portal/free-tools/hours                → save business_hours + special_hours
 *
 *   GET    /api/portal/free-tools/badges               → load + return widget_token
 *   PUT    /api/portal/free-tools/badges               → save badges array
 *
 *   GET    /api/portal/free-tools/widget-token         → returns { token } (ensures one exists)
 */

import type { Express, Request, Response } from "express";
import { requireClient } from "../auth";
import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import {
  clients,
  clientFaqItems,
  clientTrustBadges,
} from "@shared/schemas/adminCrm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { invalidateFreetoolsCache } from "./widgetFreetoolsRoutes";
import { withClientIdOrPreview } from "../middleware/adminPreviewSafe";

const log = createLogger("PortalFreetools");

const FREE_TIER_FAQ_CAP = 10;

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

/* ─── Validation schemas ─── */
const faqItemBody = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(4000),
  published: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

const faqReorderBody = z.object({
  order: z.array(z.string().uuid()).min(1).max(FREE_TIER_FAQ_CAP),
});

const dayHoursSchema = z.object({
  open: z.boolean(),
  opens: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closes: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const hoursBody = z.object({
  hours: z.object({
    tz: z.string().min(1).max(64).optional(),
    sun: dayHoursSchema.optional(),
    mon: dayHoursSchema.optional(),
    tue: dayHoursSchema.optional(),
    wed: dayHoursSchema.optional(),
    thu: dayHoursSchema.optional(),
    fri: dayHoursSchema.optional(),
    sat: dayHoursSchema.optional(),
  }),
  special: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    closed: z.boolean().optional(),
    opens: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closes: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })).max(50).optional(),
});

const badgeSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  proofUrl: z.string().url().max(500).optional(),
  valueText: z.string().max(120).optional(),
});

const badgesBody = z.object({
  badges: z.array(badgeSchema).max(20),
});

export function registerPortalFreetoolsRoutes(app: Express): void {
  /* ─── Widget token ─── */
  app.get("/api/portal/free-tools/widget-token", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const token = await storage.ensureWidgetToken(clientId);
      res.json({ token });
    } catch (err: any) {
      log.error("widget-token error", { error: err?.message });
      res.status(500).json({ error: "Failed to resolve widget token" });
    }
  });

  /* ─── FAQ ─── */
  app.get("/api/portal/free-tools/faq", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const rows = await db
        .select()
        .from(clientFaqItems)
        .where(eq(clientFaqItems.client_id, clientId))
        .orderBy(asc(clientFaqItems.position));
      const token = await storage.ensureWidgetToken(clientId);
      res.json({ items: rows, widgetToken: token, freeTierCap: FREE_TIER_FAQ_CAP });
    } catch (err: any) {
      log.error("list faq error", { error: err?.message });
      res.status(500).json({ error: "Failed to load FAQ" });
    }
  });

  app.post("/api/portal/free-tools/faq", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = faqItemBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      // Free-tier cap — count PUBLISHED rows only.
      const existing = await db
        .select()
        .from(clientFaqItems)
        .where(and(eq(clientFaqItems.client_id, clientId), eq(clientFaqItems.published, true)));
      const wantsPublished = parsed.data.published !== false;
      if (wantsPublished && existing.length >= FREE_TIER_FAQ_CAP) {
        return res.status(403).json({
          error: "Free tier limit reached",
          code: "free_tier_cap",
          cap: FREE_TIER_FAQ_CAP,
        });
      }

      const allCount = await db
        .select()
        .from(clientFaqItems)
        .where(eq(clientFaqItems.client_id, clientId));

      const [row] = await db
        .insert(clientFaqItems)
        .values({
          client_id: clientId,
          question: parsed.data.question,
          answer: parsed.data.answer,
          published: parsed.data.published ?? true,
          position: parsed.data.position ?? allCount.length,
        })
        .returning();
      invalidateFreetoolsCache(clientId, "faq");
      res.status(201).json(row);
    } catch (err: any) {
      log.error("create faq error", { error: err?.message });
      res.status(500).json({ error: "Failed to create FAQ item" });
    }
  });

  app.patch("/api/portal/free-tools/faq/:id", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const id = String(req.params.id);
      const parsed = faqItemBody.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      // If user is enabling publish on an already-existing item, enforce cap.
      if (parsed.data.published === true) {
        const existing = await db
          .select()
          .from(clientFaqItems)
          .where(and(eq(clientFaqItems.client_id, clientId), eq(clientFaqItems.published, true)));
        const isSelfPublished = existing.some(r => r.id === id);
        if (!isSelfPublished && existing.length >= FREE_TIER_FAQ_CAP) {
          return res.status(403).json({ error: "Free tier limit reached", code: "free_tier_cap", cap: FREE_TIER_FAQ_CAP });
        }
      }

      const [row] = await db
        .update(clientFaqItems)
        .set({ ...parsed.data, updated_at: new Date() })
        .where(and(eq(clientFaqItems.id, id), eq(clientFaqItems.client_id, clientId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      invalidateFreetoolsCache(clientId, "faq");
      res.json(row);
    } catch (err: any) {
      log.error("update faq error", { error: err?.message });
      res.status(500).json({ error: "Failed to update FAQ item" });
    }
  });

  app.delete("/api/portal/free-tools/faq/:id", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const id = String(req.params.id);
      const deleted = await db
        .delete(clientFaqItems)
        .where(and(eq(clientFaqItems.id, id), eq(clientFaqItems.client_id, clientId)))
        .returning();
      if (!deleted.length) return res.status(404).json({ error: "Not found" });
      invalidateFreetoolsCache(clientId, "faq");
      res.json({ ok: true });
    } catch (err: any) {
      log.error("delete faq error", { error: err?.message });
      res.status(500).json({ error: "Failed to delete FAQ item" });
    }
  });

  app.post("/api/portal/free-tools/faq/reorder", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = faqReorderBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      // Apply position updates in sequence (small N, ≤10).
      for (let i = 0; i < parsed.data.order.length; i++) {
        await db
          .update(clientFaqItems)
          .set({ position: i, updated_at: new Date() })
          .where(and(eq(clientFaqItems.id, parsed.data.order[i]), eq(clientFaqItems.client_id, clientId)));
      }
      invalidateFreetoolsCache(clientId, "faq");
      res.json({ ok: true });
    } catch (err: any) {
      log.error("reorder faq error", { error: err?.message });
      res.status(500).json({ error: "Failed to reorder FAQ items" });
    }
  });

  /* ─── Hours ─── */
  app.get("/api/portal/free-tools/hours", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      const token = await storage.ensureWidgetToken(clientId);
      res.json({
        hours: client?.business_hours ?? null,
        special: client?.special_hours ?? [],
        widgetToken: token,
      });
    } catch (err: any) {
      log.error("get hours error", { error: err?.message });
      res.status(500).json({ error: "Failed to load hours" });
    }
  });

  app.put("/api/portal/free-tools/hours", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = hoursBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
      await db
        .update(clients)
        .set({
          business_hours: parsed.data.hours,
          special_hours: parsed.data.special ?? [],
          updated_at: new Date(),
        })
        .where(eq(clients.id, clientId));
      invalidateFreetoolsCache(clientId, "hours");
      res.json({ ok: true });
    } catch (err: any) {
      log.error("save hours error", { error: err?.message });
      res.status(500).json({ error: "Failed to save hours" });
    }
  });

  /* ─── Trust Badges ─── */
  app.get("/api/portal/free-tools/badges", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const [row] = await db
        .select()
        .from(clientTrustBadges)
        .where(eq(clientTrustBadges.client_id, clientId))
        .limit(1);
      const token = await storage.ensureWidgetToken(clientId);
      res.json({
        badges: Array.isArray(row?.badges) ? row!.badges : [],
        widgetToken: token,
      });
    } catch (err: any) {
      log.error("get badges error", { error: err?.message });
      res.status(500).json({ error: "Failed to load badges" });
    }
  });

  app.put("/api/portal/free-tools/badges", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const parsed = badgesBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

      // Upsert
      const [existing] = await db
        .select()
        .from(clientTrustBadges)
        .where(eq(clientTrustBadges.client_id, clientId))
        .limit(1);
      if (existing) {
        await db
          .update(clientTrustBadges)
          .set({ badges: parsed.data.badges, updated_at: new Date() })
          .where(eq(clientTrustBadges.client_id, clientId));
      } else {
        await db
          .insert(clientTrustBadges)
          .values({ client_id: clientId, badges: parsed.data.badges });
      }
      invalidateFreetoolsCache(clientId, "badges");
      res.json({ ok: true });
    } catch (err: any) {
      log.error("save badges error", { error: err?.message });
      res.status(500).json({ error: "Failed to save badges" });
    }
  });
}
