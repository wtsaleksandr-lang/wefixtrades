/**
 * Portal QuoteQuick Notification Settings — Wave 29.
 *
 * GET  /api/portal/quotequick/notification-settings
 * POST /api/portal/quotequick/notification-settings
 *
 * Per-customer event × channel matrix for QuoteQuick events. Persists
 * inside `clients.metadata.quotequick_notifications`. The fan-out
 * (email/SMS dispatch) is handled by the existing notifications service —
 * this route only manages opt-in preferences.
 *
 * Event keys (Wave 29 scope):
 *   - quote_viewed       → customer opened the shareable quote link
 *   - quote_started      → customer began filling out the widget
 *   - quote_completed    → customer reached the final step
 *   - deposit_paid       → customer paid the deposit
 *   - quote_expired      → quote went past its deadline without action
 *
 * Channels: email, sms. (Web push deferred — no service worker yet.)
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

const log = createLogger("PortalQuotequickNotificationSettings");

const EVENT_KEYS = [
  "quote_viewed",
  "quote_started",
  "quote_completed",
  "deposit_paid",
  "quote_expired",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
});

const settingsSchema = z.object({
  quote_viewed: channelMapSchema,
  quote_started: channelMapSchema,
  quote_completed: channelMapSchema,
  deposit_paid: channelMapSchema,
  quote_expired: channelMapSchema,
});

type QuotequickNotificationSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: QuotequickNotificationSettings = {
  quote_viewed: { email: false, sms: false },
  quote_started: { email: false, sms: false },
  quote_completed: { email: true, sms: false },
  deposit_paid: { email: true, sms: true },
  quote_expired: { email: true, sms: false },
};

const EVENT_META: Record<EventKey, { label: string; description: string }> = {
  quote_viewed: {
    label: "Quote viewed",
    description:
      "Fired when a customer opens a shareable quote URL. Off by default — can be noisy.",
  },
  quote_started: {
    label: "Quote started",
    description:
      "Customer began filling out the widget. Useful as an early signal.",
  },
  quote_completed: {
    label: "Quote completed",
    description:
      "Customer reached the final step. The most reliable lead signal.",
  },
  deposit_paid: {
    label: "Deposit paid",
    description: "Customer paid the deposit via Stripe. Job is locked in.",
  },
  quote_expired: {
    label: "Quote expired",
    description:
      "Quote went past its deadline without action — time to follow up.",
  },
};

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  eventMeta: EVENT_META,
  smsGloballyAllowed: false,
};

function parseSettings(metadata: unknown): QuotequickNotificationSettings {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.quotequick_notifications;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULTS;
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

export function registerPortalQuotequickNotificationSettingsRoutes(
  app: Express,
) {
  app.get(
    "/api/portal/quotequick/notification-settings",
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
          "[portal/quotequick/notification-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/quotequick/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "quotequick.notification-settings.update",
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

        const nextMd = { ...md, quotequick_notifications: incoming };
        await db
          .update(clients)
          .set({ metadata: nextMd })
          .where(eq(clients.id, clientId));

        log.info("quotequick.notification-settings.updated", {
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
          "[portal/quotequick/notification-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
