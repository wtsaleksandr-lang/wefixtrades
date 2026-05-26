/**
 * Portal ReputationShield Notification Settings — Wave 28.
 *
 * GET  /api/portal/reputationshield/notification-settings
 * POST /api/portal/reputationshield/notification-settings
 *
 * Per-customer event×channel matrix for ReputationShield events. Persists
 * inside `clients.metadata.reputationshield_notifications`. The fan-out
 * (email/SMS dispatch) is handled by the existing notifications service —
 * this route only manages opt-in preferences.
 *
 * Event keys (Wave 28 scope):
 *   - new_review            → any new review across any platform
 *   - negative_review       → 1-3 star review
 *   - five_star_review      → 5-star review
 *   - no_reviews_7d         → no new reviews in 7 days
 *   - no_reviews_14d        → no new reviews in 14 days
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

const log = createLogger("PortalReputationshieldNotificationSettings");

const EVENT_KEYS = [
  "new_review",
  "negative_review",
  "five_star_review",
  "no_reviews_7d",
  "no_reviews_14d",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
});

const settingsSchema = z.object({
  new_review: channelMapSchema,
  negative_review: channelMapSchema,
  five_star_review: channelMapSchema,
  no_reviews_7d: channelMapSchema,
  no_reviews_14d: channelMapSchema,
});

type ReputationshieldNotificationSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: ReputationshieldNotificationSettings = {
  new_review: { email: true, sms: false },
  negative_review: { email: true, sms: false },
  five_star_review: { email: false, sms: false },
  no_reviews_7d: { email: false, sms: false },
  no_reviews_14d: { email: true, sms: false },
};

const EVENT_META: Record<
  EventKey,
  { label: string; description: string }
> = {
  new_review: {
    label: "Any new review",
    description: "Fired when a fresh review is detected on any monitored platform.",
  },
  negative_review: {
    label: "Negative review (1-3 stars)",
    description:
      "Same-day alert for low ratings so you can respond before the customer churns.",
  },
  five_star_review: {
    label: "5-star review",
    description: "Celebrate the wins. Optional — many owners leave this off.",
  },
  no_reviews_7d: {
    label: "No reviews in 7 days",
    description:
      "Light nudge — your review velocity has stalled for a week.",
  },
  no_reviews_14d: {
    label: "No reviews in 14 days",
    description:
      "Stronger nudge — 2+ weeks without a review impacts ranking.",
  },
};

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  eventMeta: EVENT_META,
  smsGloballyAllowed: false,
};

function parseSettings(metadata: unknown): ReputationshieldNotificationSettings {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.reputationshield_notifications;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULTS;
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

export function registerPortalReputationshieldNotificationSettingsRoutes(
  app: Express,
) {
  app.get(
    "/api/portal/reputationshield/notification-settings",
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
          "[portal/reputationshield/notification-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/reputationshield/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "reputationshield.notification-settings.update",
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

        const nextMd = { ...md, reputationshield_notifications: incoming };
        await db
          .update(clients)
          .set({ metadata: nextMd })
          .where(eq(clients.id, clientId));

        log.info("reputationshield.notification-settings.updated", {
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
          "[portal/reputationshield/notification-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
