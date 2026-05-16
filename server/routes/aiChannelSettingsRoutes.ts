import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import {
  getAiChannelSettings,
  updateAiChannelSettings,
  type AiChannelFlags,
} from "../services/aiChannelSettings";
import { createLogger } from "../lib/logger";

const log = createLogger("AiChannelSettings");

const CHANNEL_KEYS: (keyof AiChannelFlags)[] = [
  "chat_enabled",
  "email_enabled",
  "sms_enabled",
  "voice_enabled",
];

/**
 * Admin routes for the per-channel AI kill switches (Phase 3a).
 * Admin-only — these are global, founder-controlled toggles.
 */
export function registerAiChannelSettingsRoutes(app: Express): void {
  /** GET /api/admin/ai-channel-settings — current kill-switch state. */
  app.get("/api/admin/ai-channel-settings", requireAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ settings: await getAiChannelSettings() });
    } catch (err: any) {
      log.error("[ai-channel-settings] GET error:", err?.message);
      res.status(500).json({ error: "Failed to load AI channel settings" });
    }
  });

  /** PATCH /api/admin/ai-channel-settings — toggle one or more channels. */
  app.patch("/api/admin/ai-channel-settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Partial<AiChannelFlags> = {};
      for (const key of CHANNEL_KEYS) {
        if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No valid channel flags supplied" });
      }

      const userId = (req.user as any)?.id as number;
      const settings = await updateAiChannelSettings(patch, userId);
      res.json({ settings });
    } catch (err: any) {
      log.error("[ai-channel-settings] PATCH error:", err?.message);
      res.status(500).json({ error: "Failed to update AI channel settings" });
    }
  });
}
