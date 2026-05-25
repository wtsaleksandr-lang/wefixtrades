/**
 * AI Insights — portal routes (Wave 7).
 *
 * Mounted under /api/portal/ai-insights. All routes:
 *   - require requireClient
 *   - resolve client_id from user_id (matches portal/mapguard.ts pattern)
 *   - gate by active MapGuard subscription (service_catalog.id LIKE 'mapguard%')
 *   - return 403 with { error: "ai_insights_requires_mapguard", upgradeUrl }
 *     when not subscribed
 *
 * Endpoints:
 *   GET  /api/portal/ai-insights
 *     → cached → fresh JSON or regenerate
 *
 *   POST /api/portal/ai-insights/refresh
 *     → bypass cache, max 1 refresh/hr/customer
 *
 *   POST /api/portal/ai-insights/dismiss-action
 *     → body: { title: string } — hashes + persists
 *
 * Per Alex Q2 (2026-05-25): bundled with MapGuard, NO separate Stripe SKU.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../auth";
import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { aggregateSignals } from "../services/aiInsights/dataAggregator";
import { generateInsights, type AiInsightsResult } from "../services/aiInsights/insightGenerator";
import {
  getCached,
  persist,
  getLastGeneratedAt,
  listDismissedHashes,
  dismissAction,
  hashActionTitle,
} from "../services/aiInsights/cache";
import { createLogger } from "../lib/logger";

const log = createLogger("AiInsightsRoutes");

const REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/** Resolve client_id from the authenticated user's id. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Returns true if client has an active MapGuard service. Mirrors the check
 *  used in server/routes/portal/mapguard.ts:248-258. */
async function hasActiveMapguard(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(and(
      eq(clientServices.client_id, clientId),
      sql`${serviceCatalog.id} LIKE 'mapguard%'`,
      sql`${clientServices.status} IN ('active', 'onboarding')`,
    ))
    .limit(1);
  return !!row;
}

/** Strip dismissed actions from a fresh result. */
function applyDismissedFilter(result: AiInsightsResult, dismissedHashes: Set<string>): AiInsightsResult {
  if (dismissedHashes.size === 0) return result;
  const filtered = result.actions.filter(a => !dismissedHashes.has(hashActionTitle(a.title)));
  return { ...result, actions: filtered };
}

export function registerAiInsightsRoutes(app: Express) {
  /**
   * GET /api/portal/ai-insights
   * Returns the current customer's insights. Generates + caches on first
   * call within the 24h window. Pure read on subsequent calls.
   */
  app.get("/api/portal/ai-insights", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await resolveClientId(req.user!.id);
      if (!clientId) {
        return res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
      }

      if (!(await hasActiveMapguard(clientId))) {
        return res.status(403).json({
          error: "ai_insights_requires_mapguard",
          message: "AI Insights is included with MapGuard plans. Upgrade to unlock prioritized recommendations.",
          upgradeUrl: "/products/mapguard",
        });
      }

      const dismissedHashes = await listDismissedHashes(clientId);

      // Cache hit?
      const cached = await getCached(clientId);
      if (cached) {
        return res.json({
          ...applyDismissedFilter(cached, dismissedHashes),
          cached: true,
        });
      }

      // Generate fresh.
      const signals = await aggregateSignals(clientId);
      const result = await generateInsights(signals);
      await persist(clientId, result);

      return res.json({
        ...applyDismissedFilter(result, dismissedHashes),
        cached: false,
      });
    } catch (err: any) {
      log.error("ai-insights GET error", { error: err?.message });
      res.status(500).json({ error: "Failed to load AI insights" });
    }
  });

  /**
   * POST /api/portal/ai-insights/refresh
   * Force-regenerates (bypasses cache). Rate-limited 1/hr/customer.
   */
  app.post("/api/portal/ai-insights/refresh", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await resolveClientId(req.user!.id);
      if (!clientId) {
        return res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
      }

      if (!(await hasActiveMapguard(clientId))) {
        return res.status(403).json({
          error: "ai_insights_requires_mapguard",
          upgradeUrl: "/products/mapguard",
        });
      }

      // Rate-limit by last-generated timestamp.
      const lastGen = await getLastGeneratedAt(clientId);
      if (lastGen) {
        const elapsed = Date.now() - lastGen.getTime();
        if (elapsed < REFRESH_COOLDOWN_MS) {
          const retryAfterSec = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000);
          return res.status(429).json({
            error: "refresh_rate_limited",
            message: "You can refresh AI Insights once per hour.",
            retry_after_seconds: retryAfterSec,
          });
        }
      }

      const dismissedHashes = await listDismissedHashes(clientId);
      const signals = await aggregateSignals(clientId);
      const result = await generateInsights(signals);
      await persist(clientId, result);

      return res.json({
        ...applyDismissedFilter(result, dismissedHashes),
        cached: false,
        refreshed: true,
      });
    } catch (err: any) {
      log.error("ai-insights refresh error", { error: err?.message });
      res.status(500).json({ error: "Failed to refresh AI insights" });
    }
  });

  /**
   * POST /api/portal/ai-insights/dismiss-action
   * Body: { title: string } — hashes + persists so the action doesn't
   * reappear in subsequent GETs.
   */
  app.post("/api/portal/ai-insights/dismiss-action", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await resolveClientId(req.user!.id);
      if (!clientId) {
        return res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
      }

      if (!(await hasActiveMapguard(clientId))) {
        return res.status(403).json({
          error: "ai_insights_requires_mapguard",
          upgradeUrl: "/products/mapguard",
        });
      }

      const schema = z.object({ title: z.string().min(2).max(200) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }

      await dismissAction(clientId, parsed.data.title);
      return res.json({ dismissed: true });
    } catch (err: any) {
      log.error("ai-insights dismiss error", { error: err?.message });
      res.status(500).json({ error: "Failed to dismiss action" });
    }
  });
}
