/**
 * Public QuoteQuick catalogue endpoints (Wave W-AI-2).
 *
 * Consumed by:
 *   - The QuoteQuick widget (cross-domain embeds)
 *   - The QuoteQuick wizard (`TemplateGallery.tsx`)
 *   - The AI tool `apply_template` (server-side via the merge helper, NOT
 *     via these HTTP endpoints — the AI tool reads the DB directly)
 *
 * No auth — same security posture as the existing public widget API.
 * Returns merged (code default + admin override) data, with archived
 * rows hidden.
 *
 * Cache-Control: `public, max-age=60, stale-while-revalidate=600`. The
 * 60 s window matches the spec for the AI tool: queries can tolerate
 * up to 60 s of staleness for an admin edit to propagate.
 */

import type { Express, Request, Response } from "express";
import { getEffectiveTemplate, getEffectiveTemplates, getEffectiveTrades, getCategories } from "../lib/applyQuoteQuickOverrides";
import { createLogger } from "../lib/logger";
import {
  API_TIERS,
  API_OVERAGE_RATE_PER_1K_CALLS,
  API_OVERAGE_MAX_MULTIPLIER,
  QQ_LOYALTY_STARTER_MONTHLY,
  QQ_LOYALTY_DISCOUNT_PCT,
} from "@shared/pricing/apiTiers";

const log = createLogger("QuoteQuickPublic");

const CACHE_HEADER = "public, max-age=60, stale-while-revalidate=600";

export function registerQuoteQuickPublicRoutes(app: Express) {
  /* ─── Templates list ─── */
  app.get("/api/quotequick/templates", async (_req: Request, res: Response) => {
    try {
      const templates = await getEffectiveTemplates();
      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({ templates });
    } catch (err) {
      log.error("templates list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load templates" });
    }
  });

  /* ─── Single template ─── */
  app.get("/api/quotequick/templates/:id", async (req: Request, res: Response) => {
    try {
      const templateId = String(req.params.id);
      const template = await getEffectiveTemplate(templateId);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({ template });
    } catch (err) {
      log.error("template get failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load template" });
    }
  });

  /* ─── Trades list (+ categories for completeness) ─── */
  app.get("/api/quotequick/trades", async (_req: Request, res: Response) => {
    try {
      const trades = await getEffectiveTrades();
      const categories = getCategories();
      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({ trades, categories });
    } catch (err) {
      log.error("trades list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load trades" });
    }
  });

  /* ─── API platform tiers (Wave AJ-3) ───────────────────────────────
   * Public, unauthenticated — consumed by marketing/pricing pages.
   * Stripe price env-var names are stripped before serialisation so
   * we never leak environment shape to the public.
   * ──────────────────────────────────────────────────────────────── */
  app.get("/api/quotequick/api-tiers", async (_req: Request, res: Response) => {
    try {
      const tiers = API_TIERS.map(
        ({
          stripeMonthlyPriceEnv: _m,
          stripeAnnualPriceEnv: _a,
          stripeLoyaltyMonthlyPriceEnv: _l,
          ...publicFields
        }) => publicFields,
      );
      res.setHeader("Cache-Control", CACHE_HEADER);
      return res.json({
        tiers,
        overage: {
          rate_per_1k_calls: API_OVERAGE_RATE_PER_1K_CALLS,
          max_multiplier: API_OVERAGE_MAX_MULTIPLIER,
        },
        loyalty: {
          starter_monthly: QQ_LOYALTY_STARTER_MONTHLY,
          discount_pct: QQ_LOYALTY_DISCOUNT_PCT,
          eligibility: "Active QuoteQuick Pro or Business subscription",
        },
      });
    } catch (err) {
      log.error("api-tiers list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load API tiers" });
    }
  });
}
