/**
 * Portal Brand Kits routes (Wave W-AO-6d — Brand Studio Wave 2).
 *
 * Mounted at /api/portal/brand-kits/. Auth: logged-in user (requireClient).
 * A Brand Kit is a reusable bundle of QuoteQuick style settings the user
 * can apply across every calculator they own. The bundle stores an
 * `AdvStyle`-shaped JSON blob plus a separate `logo_url` for the picker.
 *
 * Endpoints (all requireClient + Pro-tier gated):
 *   GET    /                       — list MY brand kits (newest first)
 *   POST   /                       — create a new kit
 *   GET    /:id                    — fetch one (must belong to me)
 *   PATCH  /:id                    — update name/desc/style/logo
 *   DELETE /:id                    — hard delete (no external refs)
 *   POST   /:id/apply/:calculatorId — apply this kit's style to a calc
 *
 * Tier gate: the Pro $29 plan is tracked per-calculator on
 * `calculators.plan_tier`. A user is "Pro+" if they own AT LEAST ONE
 * calculator with plan_tier in ('starter','pro','business'). Free-only
 * users get 403 with `pro_tier_required`.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../db";
import { brandKits, calculators } from "@shared/schema";
import { requireClient } from "../auth";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { generateCuid } from "../lib/apiKeys";
import { and, desc, eq, inArray } from "drizzle-orm";

const log = createLogger("PortalBrandKits");
const BASE = "/api/portal/brand-kits";

// AdvStyle is passthrough — the server doesn't enforce every optional
// field; it just stores the JSON blob. The renderer + shared schema
// already validate the shape on calculator save.
const advStyleSchema = z.record(z.any());

const createBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  style: advStyleSchema,
  logo_url: z.string().max(8000).nullable().optional(),
  is_default: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  style: advStyleSchema.optional(),
  logo_url: z.string().max(8000).nullable().optional(),
  is_default: z.boolean().optional(),
});

/**
 * True when the user owns at least one calculator on a paid QuoteQuick
 * plan (starter/pro/business — starter is the legacy alias of pro per
 * Wave Q's three-tier ladder).
 */
async function userHasProAccess(userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: calculators.id })
    .from(calculators)
    .where(
      and(
        eq(calculators.user_id, userId),
        inArray(calculators.plan_tier, ["starter", "pro", "business"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Middleware: requireClient + Pro-tier on any of the user's calculators. */
function requirePro(req: Request, res: Response, next: NextFunction): void {
  const userId = (req.user as Express.User | undefined)?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  userHasProAccess(userId)
    .then((ok) => {
      if (!ok) {
        res.status(403).json({
          error: "pro_tier_required",
          detail: "Brand Kits require a QuoteQuick Pro $29+ plan on at least one calculator.",
        });
        return;
      }
      next();
    })
    .catch((err: any) => {
      log.error("pro gate failed", { error: err?.message, userId });
      res.status(500).json({ error: "pro_gate_failed" });
    });
}

export function registerPortalBrandKitsRoutes(app: Express): void {
  /* ─── GET / — list MY kits, newest first ────────────────────────── */
  app.get(BASE, requireClient, requirePro, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    try {
      const rows = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.user_id, userId))
        .orderBy(desc(brandKits.created_at));
      res.json({ kits: rows });
    } catch (err: any) {
      log.error("list kits failed", { error: err?.message, userId });
      res.status(500).json({ error: "list_kits_failed" });
    }
  });

  /* ─── POST / — create a new kit ─────────────────────────────────── */
  app.post(BASE, requireClient, requirePro, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const id = generateCuid();
      const [created] = await db
        .insert(brandKits)
        .values({
          id,
          user_id: userId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          style: parsed.data.style,
          logo_url: parsed.data.logo_url ?? null,
          is_default: parsed.data.is_default ?? false,
        })
        .returning();
      res.status(201).json({ kit: created });
    } catch (err: any) {
      log.error("create kit failed", { error: err?.message, userId });
      res.status(500).json({ error: "create_kit_failed" });
    }
  });

  /* ─── GET /:id — fetch one ──────────────────────────────────────── */
  app.get(`${BASE}/:id`, requireClient, requirePro, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const id = String(req.params.id);
    try {
      const [row] = await db
        .select()
        .from(brandKits)
        .where(and(eq(brandKits.id, id), eq(brandKits.user_id, userId)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "kit_not_found" });
        return;
      }
      res.json({ kit: row });
    } catch (err: any) {
      log.error("get kit failed", { error: err?.message, userId, id });
      res.status(500).json({ error: "get_kit_failed" });
    }
  });

  /* ─── PATCH /:id — update ───────────────────────────────────────── */
  app.patch(`${BASE}/:id`, requireClient, requirePro, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const id = String(req.params.id);
    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.description !== undefined) patch.description = parsed.data.description;
      if (parsed.data.style !== undefined) patch.style = parsed.data.style;
      if (parsed.data.logo_url !== undefined) patch.logo_url = parsed.data.logo_url;
      if (parsed.data.is_default !== undefined) patch.is_default = parsed.data.is_default;

      const [updated] = await db
        .update(brandKits)
        .set(patch)
        .where(and(eq(brandKits.id, id), eq(brandKits.user_id, userId)))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "kit_not_found" });
        return;
      }
      res.json({ kit: updated });
    } catch (err: any) {
      log.error("update kit failed", { error: err?.message, userId, id });
      res.status(500).json({ error: "update_kit_failed" });
    }
  });

  /* ─── DELETE /:id — hard delete (no external refs) ──────────────── */
  app.delete(`${BASE}/:id`, requireClient, requirePro, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const id = String(req.params.id);
    try {
      const [deleted] = await db
        .delete(brandKits)
        .where(and(eq(brandKits.id, id), eq(brandKits.user_id, userId)))
        .returning({ id: brandKits.id });
      if (!deleted) {
        res.status(404).json({ error: "kit_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("delete kit failed", { error: err?.message, userId, id });
      res.status(500).json({ error: "delete_kit_failed" });
    }
  });

  /* ─── POST /:id/apply/:calculatorId ──────────────────────────────
   * Convenience: merge the kit's `style` into the named calculator's
   * `calculator_settings.advanced.style`. The calculator MUST belong to
   * the same user. The kit's logo_url ALSO writes back as the
   * calculator's `logo_url` so the branding lands end-to-end.
   *
   * Returns the updated calculator row.
   * ─────────────────────────────────────────────────────────────── */
  app.post(
    `${BASE}/:id/apply/:calculatorId`,
    requireClient,
    requirePro,
    async (req: Request, res: Response) => {
      const userId = (req.user as Express.User).id;
      const id = String(req.params.id);
      const calculatorId = Number.parseInt(String(req.params.calculatorId), 10);
      if (!Number.isFinite(calculatorId) || calculatorId <= 0) {
        res.status(400).json({ error: "invalid_calculator_id" });
        return;
      }
      try {
        const [kit] = await db
          .select()
          .from(brandKits)
          .where(and(eq(brandKits.id, id), eq(brandKits.user_id, userId)))
          .limit(1);
        if (!kit) {
          res.status(404).json({ error: "kit_not_found" });
          return;
        }
        const calc = await storage.getCalculatorById(calculatorId);
        if (!calc || calc.user_id !== userId) {
          res.status(404).json({ error: "calculator_not_found" });
          return;
        }

        const settings = (calc.calculator_settings as any) || {};
        const advanced = (settings.advanced as any) || {};
        const existingStyle = (advanced.style as Record<string, unknown>) || {};
        const kitStyle = (kit.style as Record<string, unknown>) || {};
        const mergedStyle = { ...existingStyle, ...kitStyle };

        const mergedSettings = {
          ...settings,
          advanced: {
            ...advanced,
            style: mergedStyle,
          },
        };

        const updates: Record<string, any> = { calculator_settings: mergedSettings };
        if (kit.logo_url) updates.logo_url = kit.logo_url;

        const updated = await storage.updateCalculator(calc.id, updates);
        log.info("brand kit applied", {
          kit_id: kit.id,
          calculator_id: calc.id,
          user_id: userId,
        });
        res.json({ ok: true, calculator: updated });
      } catch (err: any) {
        log.error("apply kit failed", { error: err?.message, userId, id, calculatorId });
        res.status(500).json({ error: "apply_kit_failed" });
      }
    },
  );
}
