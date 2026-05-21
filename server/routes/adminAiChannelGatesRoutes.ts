/**
 * Admin routes for the per-channel AI emergency kill switches (W-BA-1).
 *
 * These manage the `ai_channel_gates` table — the runtime emergency net
 * the founder must have in hand BEFORE autonomy goes live. Distinct from
 * /api/admin/ai-channel-settings (the older governance config).
 *
 * Endpoints:
 *   GET  /api/admin/ai-channel-gates                          — list all 4
 *   POST /api/admin/ai-channel-gates/:channel/toggle          — flip one
 *   POST /api/admin/ai-channel-gates/emergency-disable-all    — flip all OFF
 *
 * All endpoints are admin-only and audit-logged via storage.logAdminActivity.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import {
  AI_CHANNEL_LIST,
  isAiChannel,
  listAiChannelGates,
  setAiChannelGate,
  emergencyDisableAllChannels,
} from "../services/aiChannelGate";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAiChannelGates");

export function registerAdminAiChannelGatesRoutes(app: Express): void {
  /** GET /api/admin/ai-channel-gates — list all 4 channel gate states. */
  app.get(
    "/api/admin/ai-channel-gates",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const gates = await listAiChannelGates();
        res.json({ channels: AI_CHANNEL_LIST, gates });
      } catch (err: any) {
        log.error("GET failed", { err: err?.message });
        res.status(500).json({ error: "Failed to load channel gates" });
      }
    },
  );

  /** POST /api/admin/ai-channel-gates/:channel/toggle  body: { enabled, notes? } */
  app.post(
    "/api/admin/ai-channel-gates/:channel/toggle",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const channel = String(req.params.channel || "").trim();
        if (!isAiChannel(channel)) {
          return res.status(400).json({ error: `Unknown channel: ${channel}` });
        }
        const enabled = req.body?.enabled;
        if (typeof enabled !== "boolean") {
          return res.status(400).json({ error: "enabled (boolean) is required" });
        }
        const notes =
          typeof req.body?.notes === "string" ? String(req.body.notes).slice(0, 500) : undefined;

        const user = req.user as { id: number; email?: string; name?: string } | undefined;
        if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

        await setAiChannelGate(channel, enabled, user.id, notes);

        // Audit trail — every toggle is recorded.
        await storage
          .logAdminActivity({
            actor_type: "admin",
            actor_id: user.id,
            actor_name: user.name || user.email || `admin#${user.id}`,
            action: enabled ? "ai_channel_gate.enabled" : "ai_channel_gate.disabled",
            entity_type: "ai_channel_gate",
            entity_id: null,
            summary: `AI channel "${channel}" ${enabled ? "enabled" : "disabled"}`,
            metadata: { channel, enabled, notes: notes ?? null },
          })
          .catch((e: Error) => log.error("audit log failed", { error: e.message }));

        const gates = await listAiChannelGates();
        res.json({ ok: true, gates });
      } catch (err: any) {
        log.error("toggle failed", { err: err?.message });
        res.status(500).json({ error: "Failed to toggle channel gate" });
      }
    },
  );

  /** POST /api/admin/ai-channel-gates/emergency-disable-all  body: { notes? } */
  app.post(
    "/api/admin/ai-channel-gates/emergency-disable-all",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const notes =
          typeof req.body?.notes === "string" ? String(req.body.notes).slice(0, 500) : undefined;
        const user = req.user as { id: number; email?: string; name?: string } | undefined;
        if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

        await emergencyDisableAllChannels(user.id, notes);

        await storage
          .logAdminActivity({
            actor_type: "admin",
            actor_id: user.id,
            actor_name: user.name || user.email || `admin#${user.id}`,
            action: "ai_channel_gate.emergency_disable_all",
            entity_type: "ai_channel_gate",
            entity_id: null,
            summary: "Emergency disable: AI turned OFF on every channel",
            metadata: { notes: notes ?? null },
          })
          .catch((e: Error) => log.error("audit log failed", { error: e.message }));

        const gates = await listAiChannelGates();
        res.json({ ok: true, gates });
      } catch (err: any) {
        log.error("emergency-disable-all failed", { err: err?.message });
        res.status(500).json({ error: "Failed to disable all channel gates" });
      }
    },
  );
}
