/**
 * Portal MapGuard Notification Settings — Wave 27.
 *
 * GET  /api/portal/mapguard/notification-settings
 * POST /api/portal/mapguard/notification-settings
 *
 * Per-customer event×channel matrix. The actual fan-out happens in
 * server/services/notifications/* (already wired for billing + leads).
 * This route only persists the customer's opt-in preferences inside
 * `clients.metadata.mapguard_notifications`.
 *
 * Event keys (Wave 27 scope):
 *   - rank_drop_top3         → Customer drops out of top 3 on any keyword
 *   - citation_nap_mismatch  → NAP-mismatch detected on tracked listing
 *   - new_negative_review    → cross-ReputationShield 1-3 star review
 *   - competitor_outranked   → competitor moves ahead on a tracked keyword
 *
 * Channels: email, sms. (Web push deferred — no service worker yet.)
 *
 * Anti-pattern: never auto-send without explicit opt-in. The defaults
 * follow PRs #767-771's CAN-SPAM-friendly pattern: email on for the two
 * highest-severity events, SMS off across the board.
 *
 * Twilio SMS compliance (PR #770): we ALSO check the existing client-level
 * sms_opt_in flag — if it's not set, we refuse to enable SMS regardless
 * of what the customer sends.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalMapguardNotificationSettings");

const EVENT_KEYS = [
  "rank_drop_top3",
  "citation_nap_mismatch",
  "new_negative_review",
  "competitor_outranked",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const CHANNEL_KEYS = ["email", "sms"] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
});

const settingsSchema = z.object({
  rank_drop_top3: channelMapSchema,
  citation_nap_mismatch: channelMapSchema,
  new_negative_review: channelMapSchema,
  competitor_outranked: channelMapSchema,
});

type MapguardNotificationSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: MapguardNotificationSettings = {
  rank_drop_top3: { email: true, sms: false },
  citation_nap_mismatch: { email: true, sms: false },
  new_negative_review: { email: true, sms: false },
  competitor_outranked: { email: false, sms: false },
};

const EVENT_META: Record<
  EventKey,
  { label: string; description: string }
> = {
  rank_drop_top3: {
    label: "Drop out of top 3",
    description:
      "Customer loses a Map Pack slot on any monitored keyword × pin.",
  },
  citation_nap_mismatch: {
    label: "Citation NAP mismatch",
    description:
      "Name / address / phone changes detected on a tracked directory listing.",
  },
  new_negative_review: {
    label: "New negative review",
    description:
      "1-3 star review detected via ReputationShield (cross-product).",
  },
  competitor_outranked: {
    label: "Competitor outranked you",
    description:
      "A monitored competitor moves ahead of you on a tracked keyword.",
  },
};

const PREVIEW_RESPONSE = {
  previewMode: true,
  settings: DEFAULTS,
  eventMeta: EVENT_META,
  smsGloballyAllowed: false,
};

function parseSettings(metadata: unknown): MapguardNotificationSettings {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.mapguard_notifications;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULTS;
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  // The client-level sms_opt_in flag is the master kill-switch enforced
  // by the orchestrator. We don't enable SMS even if the customer tries
  // to flip it on per-event.
  return md?.sms_opt_in === true;
}

export function registerPortalMapguardNotificationSettingsRoutes(app: Express) {
  app.get(
    "/api/portal/mapguard/notification-settings",
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
          "[portal/mapguard/notification-settings GET]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.post(
    "/api/portal/mapguard/notification-settings",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE, persisted: false },
          mode: "write",
          action: "mapguard.notification-settings.update",
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

        // SMS compliance gate — if the master flag is off, force-clear sms.
        const incoming = parsed.data;
        if (!smsAllowed) {
          for (const key of EVENT_KEYS) {
            incoming[key].sms = false;
          }
        }

        const nextMd = { ...md, mapguard_notifications: incoming };
        await db
          .update(clients)
          .set({ metadata: nextMd })
          .where(eq(clients.id, clientId));

        log.info("mapguard.notification-settings.updated", {
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
          "[portal/mapguard/notification-settings POST]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
