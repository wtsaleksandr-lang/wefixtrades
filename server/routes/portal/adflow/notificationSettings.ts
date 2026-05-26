/**
 * Portal AdFlow Notification Settings — Wave 30.
 *
 * GET  /api/portal/adflow/notification-settings
 * POST /api/portal/adflow/notification-settings
 *
 * Per-customer event × channel matrix for AdFlow events. Persists inside
 * `clients.metadata.adflow_notifications`.
 *
 * Event keys (Wave 30 scope, plain-language for matrix labels):
 *   - anomaly_detected         → AnomalyBanner-triggering event
 *   - daily_spend_exceeded     → today's spend went above the customer's cap
 *   - campaign_paused          → a campaign was paused (auto or manual)
 *   - new_lead_from_ad         → ad-attributable lead just came in
 *   - weekly_report_ready      → weekly performance summary delivered
 *
 * Channels: email, sms (gated by sms_opt_in).
 *
 * SMS compliance gate (PR #770 + Wave 27): even if the customer opts in
 * per-event, SMS stays off unless `clients.metadata.sms_opt_in` is true.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowNotificationSettings");

const EVENT_KEYS = [
  "anomaly_detected",
  "daily_spend_exceeded",
  "campaign_paused",
  "new_lead_from_ad",
  "weekly_report_ready",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
});

const settingsSchema = z.object({
  anomaly_detected: channelMapSchema,
  daily_spend_exceeded: channelMapSchema,
  campaign_paused: channelMapSchema,
  new_lead_from_ad: channelMapSchema,
  weekly_report_ready: channelMapSchema,
});

type AdflowNotificationSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: AdflowNotificationSettings = {
  anomaly_detected: { email: true, sms: true },
  daily_spend_exceeded: { email: true, sms: false },
  campaign_paused: { email: true, sms: false },
  new_lead_from_ad: { email: true, sms: false },
  weekly_report_ready: { email: true, sms: false },
};

const EVENT_META: Record<EventKey, { label: string; description: string }> = {
  anomaly_detected: {
    label: "Anomaly detected",
    description:
      "An ad campaign behaved very differently than expected — usually worth investigating.",
  },
  daily_spend_exceeded: {
    label: "Daily spend over limit",
    description:
      "Today's ad spend went above the cap you set. Helps you stay in control of monthly budget.",
  },
  campaign_paused: {
    label: "Campaign paused",
    description:
      "Fires whenever a campaign gets paused — either by you, by the AI, or by your ops team.",
  },
  new_lead_from_ad: {
    label: "New lead from an ad",
    description:
      "Customer reached you via one of your paid ads. Useful as a real-time pulse.",
  },
  weekly_report_ready: {
    label: "Weekly report ready",
    description: "Your weekly performance summary just landed.",
  },
};

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  eventMeta: EVENT_META,
  smsGloballyAllowed: false,
};

function parseSettings(metadata: unknown): AdflowNotificationSettings {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.adflow_notifications;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULTS;
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

export function registerPortalAdflowNotificationSettingsRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
        });
        if (clientId === null) return;

        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        const settings = parseSettings(row?.metadata);
        const smsAllowed = smsGloballyAllowed(row?.metadata);
        res.json({
          settings,
          eventMeta: EVENT_META,
          smsGloballyAllowed: smsAllowed,
        });
      } catch (err: any) {
        log.error(
          "[portal/adflow/notification-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/adflow/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "adflow.notification-settings.update",
        });
        if (clientId === null) return;

        const parsed = settingsSchema.safeParse(req.body?.settings);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        const smsAllowed = smsGloballyAllowed(md);

        const incoming = parsed.data;
        if (!smsAllowed) {
          for (const key of EVENT_KEYS) {
            incoming[key].sms = false;
          }
        }

        const nextMd = { ...md, adflow_notifications: incoming };
        await db
          .update(clients)
          .set({ metadata: nextMd })
          .where(eq(clients.id, clientId));

        log.info("adflow.notification-settings.updated", {
          clientId,
          smsAllowed,
        });

        res.json({
          settings: incoming,
          eventMeta: EVENT_META,
          smsGloballyAllowed: smsAllowed,
          persisted: true,
        });
      } catch (err: any) {
        log.error(
          "[portal/adflow/notification-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
