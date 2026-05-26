/**
 * Portal WebCare Notification Settings — Wave 31.
 *
 * GET  /api/portal/webcare/notification-settings
 * POST /api/portal/webcare/notification-settings
 *
 * Per-customer event × channel matrix for WebCare events. Persists
 * inside `clients.metadata.webcare_notifications`.
 *
 * Event keys (Wave 31 scope, plain-language for matrix labels):
 *   - security_incident      → malware / brute-force / 2FA-fail spikes
 *   - backup_failed          → nightly backup couldn't complete
 *   - site_went_down         → uptime check failed (deduped 4h cooldown)
 *   - vulnerability_detected → a known CVE affects an installed plugin
 *   - maintenance_complete   → batch of plugin/theme/core updates done
 *   - monthly_digest_ready   → "5 numbers" email + portal banner
 *
 * Channels: email, sms (gated by clients.metadata.sms_opt_in), and
 * web_push (gated by clients.metadata.web_push_subscribed).
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalWebcareNotificationSettings");

const EVENT_KEYS = [
  "security_incident",
  "backup_failed",
  "site_went_down",
  "vulnerability_detected",
  "maintenance_complete",
  "monthly_digest_ready",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  web_push: z.boolean(),
});

const settingsSchema = z.object({
  security_incident:      channelMapSchema,
  backup_failed:          channelMapSchema,
  site_went_down:         channelMapSchema,
  vulnerability_detected: channelMapSchema,
  maintenance_complete:   channelMapSchema,
  monthly_digest_ready:   channelMapSchema,
});

type WebcareNotificationSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: WebcareNotificationSettings = {
  security_incident:      { email: true,  sms: true,  web_push: true },
  backup_failed:          { email: true,  sms: false, web_push: true },
  site_went_down:         { email: true,  sms: true,  web_push: true },
  vulnerability_detected: { email: true,  sms: false, web_push: true },
  maintenance_complete:   { email: true,  sms: false, web_push: false },
  monthly_digest_ready:   { email: true,  sms: false, web_push: false },
};

const EVENT_META: Record<EventKey, { label: string; description: string }> = {
  security_incident: {
    label: "Security incident",
    description:
      "Malware, brute-force spikes, or any other event that drops your security grade.",
  },
  backup_failed: {
    label: "Backup failed",
    description:
      "Nightly backup couldn't complete — usually a host or storage issue.",
  },
  site_went_down: {
    label: "Site went down",
    description:
      "Our uptime check failed. Deduped to one alert per 4 hours per site.",
  },
  vulnerability_detected: {
    label: "Vulnerability detected",
    description:
      "A known CVE affects an installed plugin, theme, or WordPress core.",
  },
  maintenance_complete: {
    label: "Maintenance complete",
    description:
      "Heads-up after we apply a batch of plugin / theme / core updates.",
  },
  monthly_digest_ready: {
    label: "Monthly report ready",
    description:
      "Your 5-number monthly report just landed — uptime, grade, updates, threats blocked, backups.",
  },
};

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  eventMeta: EVENT_META,
  smsGloballyAllowed: false,
  webPushGloballyAllowed: false,
};

function parseSettings(metadata: unknown): WebcareNotificationSettings {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.webcare_notifications;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULTS;
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

function webPushGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.web_push_subscribed === true;
}

export function registerPortalWebcareNotificationSettingsRoutes(app: Express) {
  app.get(
    "/api/portal/webcare/notification-settings",
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
        const webPushAllowed = webPushGloballyAllowed(row?.metadata);

        res.json({
          settings,
          eventMeta: EVENT_META,
          smsGloballyAllowed: smsAllowed,
          webPushGloballyAllowed: webPushAllowed,
        });
      } catch (err: any) {
        log.error(
          "[portal/webcare/notification-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/webcare/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "webcare.notification-settings.update",
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
        const webPushAllowed = webPushGloballyAllowed(md);

        const incoming = parsed.data;
        if (!smsAllowed) {
          for (const key of EVENT_KEYS) incoming[key].sms = false;
        }
        if (!webPushAllowed) {
          for (const key of EVENT_KEYS) incoming[key].web_push = false;
        }

        const nextMd = { ...md, webcare_notifications: incoming };
        await db
          .update(clients)
          .set({ metadata: nextMd })
          .where(eq(clients.id, clientId));

        log.info("webcare.notification-settings.updated", {
          clientId,
          smsAllowed,
          webPushAllowed,
        });

        res.json({
          settings: incoming,
          eventMeta: EVENT_META,
          smsGloballyAllowed: smsAllowed,
          webPushGloballyAllowed: webPushAllowed,
          persisted: true,
        });
      } catch (err: any) {
        log.error(
          "[portal/webcare/notification-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
