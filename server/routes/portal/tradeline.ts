/**
 * Portal TradeLine routes.
 *
 * Mounted under /api/portal/tradeline/*. Auth: requireClient (with per-route
 * ownership verification via verifyTradeLineOwnership).
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PR #713 quotequick, PR #718 reputation, PR #721
 * billing established the pattern). Pure code move — zero behaviour change.
 * The parent registrar (registerPortalRoutes) invokes
 * registerPortalTradelineRoutes(app) so the wiring in routes/index.ts is
 * unchanged.
 *
 * Endpoints
 *   GET   /api/portal/tradeline/:clientServiceId
 *   POST  /api/portal/tradeline/:clientServiceId/mode
 *   POST  /api/portal/tradeline/:clientServiceId/settings
 *   GET   /api/portal/tradeline/:clientServiceId/calls
 *   GET   /api/portal/tradeline/:clientServiceId/widget-config
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  getTradeLineReadiness,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalTradeline");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
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

/** Verify a TradeLine client_service belongs to the authenticated client. */
async function verifyTradeLineOwnership(
  req: Request,
  res: Response,
  clientServiceId: number,
): Promise<{ clientId: number; clientServiceId: number } | null> {
  const clientId = await withClientId(req, res);
  if (!clientId) return null;

  const [cs] = await db
    .select({ id: clientServices.id, client_id: clientServices.client_id, service_id: clientServices.service_id })
    .from(clientServices)
    .where(and(eq(clientServices.id, clientServiceId), eq(clientServices.client_id, clientId)))
    .limit(1);

  if (!cs || !cs.service_id.startsWith("tradeline")) {
    res.status(404).json({ error: "TradeLine service not found" });
    return null;
  }

  return { clientId, clientServiceId: cs.id };
}

export function registerPortalTradelineRoutes(app: Express) {
  /**
   * GET /api/portal/tradeline/:clientServiceId
   * Returns TradeLine config, latest usage, and recent calls.
   */
  app.get("/api/portal/tradeline/:clientServiceId", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const [config, usage, calls] = await Promise.all([
        storage.getTradeLineConfig(csId),
        storage.getTradeLineUsage(csId),
        storage.listTradeLineCalls(csId, 10),
      ]);

      res.json({
        config: config ?? null,
        usage: usage ?? null,
        recentCalls: calls,
        setupStage: config?.setupStage ?? "not_started",
        readiness: config ? getTradeLineReadiness(config) : null,
        assistantStatus: config?.assistant?.status ?? "not_built",
      });
    } catch (err) {
      log.error("Portal tradeline GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load TradeLine data" });
    }
  });

  /**
   * POST /api/portal/tradeline/:clientServiceId/mode
   * Switch TradeLine mode (available / on_the_job / after_hours).
   */
  app.post("/api/portal/tradeline/:clientServiceId/mode", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const { newMode } = req.body;
      const validModes = ["available", "on_the_job", "after_hours"];
      if (!newMode || !validModes.includes(newMode)) {
        return res.status(400).json({ error: "newMode must be one of: available, on_the_job, after_hours" });
      }

      const modeLog = await storage.setTradeLineMode(csId, newMode, "client", "Manual switch by client");
      const config = await storage.getTradeLineConfig(csId);

      res.json({ config, modeLog });
    } catch (err) {
      log.error("Portal tradeline mode error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update mode" });
    }
  });

  /**
   * POST /api/portal/tradeline/:clientServiceId/settings
   * Client-facing config update for voice, personality, and widget style.
   * Only allows updating curated fields — not raw config.
   */
  app.post("/api/portal/tradeline/:clientServiceId/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const { voice, personality, widgetStyle, businessHours, notifications } = req.body;
      const update: Record<string, any> = {};

      if (voice && typeof voice === "object") update.voice = voice;
      if (personality && typeof personality === "object") update.personality = personality;
      if (widgetStyle && typeof widgetStyle === "object") update.widgetStyle = widgetStyle;
      if (businessHours && typeof businessHours === "object") update.businessHours = businessHours;
      if (notifications && typeof notifications === "object") update.notifications = notifications;

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No valid settings provided" });
      }

      const config = await storage.updateTradeLineConfig(csId, update);
      res.json({ config });
    } catch (err) {
      log.error("Portal tradeline settings error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/tradeline/:clientServiceId/calls
   * Paginated call log list.
   */
  app.get("/api/portal/tradeline/:clientServiceId/calls", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const calls = await storage.listTradeLineCalls(csId, limit);

      res.json({ calls });
    } catch (err) {
      log.error("Portal tradeline calls error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load call log" });
    }
  });

  /**
   * GET /api/portal/tradeline/:clientServiceId/widget-config
   * Minimal config payload for future widget embed / hosted fallback.
   */
  app.get("/api/portal/tradeline/:clientServiceId/widget-config", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const config = await storage.getTradeLineConfig(csId);
      if (!config) return res.status(404).json({ error: "TradeLine not configured" });

      // Get business name from client record
      const [client] = await db
        .select({ business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, ownership.clientId))
        .limit(1);

      res.json({
        channels: config.channels,
        embedMode: config.website.embedMode,
        hostedUrl: config.website.hostedUrl || null,
        businessName: client?.business_name ?? null,
        mode: config.currentMode,
      });
    } catch (err) {
      log.error("Portal tradeline widget-config error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load widget config" });
    }
  });
}
