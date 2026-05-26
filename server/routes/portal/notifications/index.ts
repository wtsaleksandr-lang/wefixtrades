/**
 * Wave 32 — Unified notification settings + Web Push subscription routes.
 *
 * Endpoints:
 *   GET  /api/portal/notifications                   — full settings payload
 *                                                       (all 9 products, current
 *                                                       opt-ins, gates, quiet
 *                                                       hours).
 *   POST /api/portal/notifications                   — bulk update opt-ins.
 *   POST /api/portal/notifications/quiet-hours       — set quiet hours window.
 *   POST /api/portal/notifications/push/subscribe    — register a Web Push
 *                                                       subscription.
 *   POST /api/portal/notifications/push/unsubscribe  — revoke a subscription.
 *   GET  /api/portal/notifications/vapid-public-key  — public VAPID key for
 *                                                       service-worker
 *                                                       subscribe() calls.
 *
 * Persistence:
 *   • Per-event opt-ins → `clients.metadata.<product>_notifications` (keys
 *     identical to Waves 27-31 — backwards compatible).
 *   • Push subscriptions → `customer_push_subscriptions` table.
 *   • Quiet hours → `clients.metadata.notification_quiet_hours`.
 *
 * SMS compliance gate (PR #770) still owns SMS — even if a customer opts
 * in per-event, SMS stays off until `clients.metadata.sms_opt_in === true`.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients } from "@shared/schema";
import { customerPushSubscriptions } from "@shared/schemas/notificationsUniversal";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_PRODUCTS,
  PRODUCT_LABELS,
  PRODUCT_METADATA_KEY,
  defaultChannelMap,
  type NotificationProduct,
  type NotificationChannel,
} from "@shared/notifications/eventRegistry";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { getVapidPublicKey } from "../../../services/notifications/webPush";

const log = createLogger("PortalUniversalNotifications");

const channelMapSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  web_push: z.boolean(),
});

const updatePayloadSchema = z.object({
  preferences: z.record(
    z.string(),                              // product key
    z.record(z.string(), channelMapSchema),  // event_key → channel map
  ),
});

const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

function buildSettingsForClient(metadata: unknown) {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const out: Record<
    NotificationProduct,
    Record<string, Record<NotificationChannel, boolean>>
  > = {} as any;

  for (const product of NOTIFICATION_PRODUCTS) {
    const blob = (md[PRODUCT_METADATA_KEY[product]] ?? {}) as Record<
      string,
      unknown
    >;
    out[product] = {};
    for (const ev of NOTIFICATION_EVENTS.filter((e) => e.product === product)) {
      const def = defaultChannelMap(ev);
      const raw = blob[ev.key] as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") {
        out[product][ev.key] = def;
      } else {
        out[product][ev.key] = {
          email: typeof raw.email === "boolean" ? raw.email : def.email,
          sms: typeof raw.sms === "boolean" ? raw.sms : def.sms,
          web_push:
            typeof raw.web_push === "boolean" ? raw.web_push : def.web_push,
        };
      }
    }
  }
  return out;
}

function readQuietHours(metadata: unknown) {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.notification_quiet_hours as Record<string, unknown> | undefined;
  if (!raw) {
    return {
      enabled: false,
      start: "22:00",
      end: "07:00",
      timezone: "America/New_York",
    };
  }
  return {
    enabled: raw.enabled === true,
    start: typeof raw.start === "string" ? raw.start : "22:00",
    end: typeof raw.end === "string" ? raw.end : "07:00",
    timezone:
      typeof raw.timezone === "string" ? raw.timezone : "America/New_York",
  };
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

const PREVIEW_RESPONSE_GET = {
  previewMode: true,
  events: NOTIFICATION_EVENTS,
  products: NOTIFICATION_PRODUCTS.map((p) => ({ key: p, label: PRODUCT_LABELS[p] })),
  preferences: buildSettingsForClient({}),
  smsGloballyAllowed: false,
  webPushSubscribed: false,
  vapidPublicKey: null,
  quietHours: readQuietHours({}),
};

export function registerPortalUniversalNotificationsRoutes(app: Express) {
  /** GET full settings */
  app.get(
    "/api/portal/notifications",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE_GET,
        });
        if (clientId === null) return;

        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        const preferences = buildSettingsForClient(row?.metadata);
        const smsAllowed = smsGloballyAllowed(row?.metadata);
        const quietHours = readQuietHours(row?.metadata);

        const [pushRow] = await db
          .select({ id: customerPushSubscriptions.id })
          .from(customerPushSubscriptions)
          .where(eq(customerPushSubscriptions.client_id, clientId))
          .limit(1);

        res.json({
          events: NOTIFICATION_EVENTS,
          products: NOTIFICATION_PRODUCTS.map((p) => ({
            key: p,
            label: PRODUCT_LABELS[p],
          })),
          preferences,
          smsGloballyAllowed: smsAllowed,
          webPushSubscribed: !!pushRow,
          vapidPublicKey: getVapidPublicKey(),
          quietHours,
        });
      } catch (err: any) {
        log.error("[GET /api/portal/notifications]", err?.message ?? err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /** POST bulk-update preferences */
  app.post(
    "/api/portal/notifications",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ...PREVIEW_RESPONSE_GET, persisted: false },
          mode: "write",
          action: "universal-notifications.update",
        });
        if (clientId === null) return;

        const parsed = updatePayloadSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid body", details: parsed.error.flatten() });
        }

        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        const smsAllowed = smsGloballyAllowed(md);

        // Merge per-product blobs (keeps Waves 27-31 keys intact for any
        // event we don't have explicit prefs for).
        for (const product of NOTIFICATION_PRODUCTS) {
          const incoming = parsed.data.preferences[product];
          if (!incoming) continue;
          const blobKey = PRODUCT_METADATA_KEY[product];
          const existing = (md[blobKey] ?? {}) as Record<string, unknown>;
          for (const [eventKey, channels] of Object.entries(incoming)) {
            const safeChannels = {
              email: channels.email,
              // Force-off SMS if master flag missing.
              sms: smsAllowed ? channels.sms : false,
              web_push: channels.web_push,
            };
            existing[eventKey] = safeChannels;
          }
          md[blobKey] = existing;
        }

        await db
          .update(clients)
          .set({ metadata: md })
          .where(eq(clients.id, clientId));

        const preferences = buildSettingsForClient(md);
        log.info("universal-notifications.updated", { clientId, smsAllowed });

        res.json({
          preferences,
          smsGloballyAllowed: smsAllowed,
          persisted: true,
        });
      } catch (err: any) {
        log.error("[POST /api/portal/notifications]", err?.message ?? err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /** POST quiet hours */
  app.post(
    "/api/portal/notifications/quiet-hours",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, persisted: false },
          mode: "write",
          action: "universal-notifications.quiet-hours.update",
        });
        if (clientId === null) return;

        const parsed = quietHoursSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid body", details: parsed.error.flatten() });
        }

        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        md.notification_quiet_hours = {
          enabled: parsed.data.enabled,
          start: parsed.data.start ?? "22:00",
          end: parsed.data.end ?? "07:00",
          timezone: parsed.data.timezone ?? "America/New_York",
        };

        await db
          .update(clients)
          .set({ metadata: md })
          .where(eq(clients.id, clientId));

        res.json({ quietHours: md.notification_quiet_hours, persisted: true });
      } catch (err: any) {
        log.error(
          "[POST /api/portal/notifications/quiet-hours]",
          err?.message ?? err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /** Web Push: subscribe */
  app.post(
    "/api/portal/notifications/push/subscribe",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, persisted: false },
          mode: "write",
          action: "universal-notifications.push.subscribe",
        });
        if (clientId === null) return;

        const parsed = pushSubscribeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid body", details: parsed.error.flatten() });
        }

        const { endpoint, keys, userAgent } = parsed.data;

        // Upsert: a single (client, endpoint) row.
        const [existing] = await db
          .select({ id: customerPushSubscriptions.id })
          .from(customerPushSubscriptions)
          .where(eq(customerPushSubscriptions.endpoint, endpoint))
          .limit(1);

        if (existing) {
          await db
            .update(customerPushSubscriptions)
            .set({
              client_id: clientId,
              p256dh_key: keys.p256dh,
              auth_key: keys.auth,
              user_agent: userAgent ?? null,
              last_used_at: new Date(),
            })
            .where(eq(customerPushSubscriptions.id, existing.id));
        } else {
          await db.insert(customerPushSubscriptions).values({
            client_id: clientId,
            endpoint,
            p256dh_key: keys.p256dh,
            auth_key: keys.auth,
            user_agent: userAgent ?? null,
          });
        }

        // Mark master flag so legacy per-product `webPushGloballyAllowed`
        // checks (Wave 31) light up the column.
        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        md.web_push_subscribed = true;
        await db
          .update(clients)
          .set({ metadata: md })
          .where(eq(clients.id, clientId));

        log.info("push.subscribe", { clientId });
        res.json({ persisted: true });
      } catch (err: any) {
        log.error(
          "[POST /api/portal/notifications/push/subscribe]",
          err?.message ?? err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /** Web Push: unsubscribe */
  app.post(
    "/api/portal/notifications/push/unsubscribe",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, persisted: false },
          mode: "write",
          action: "universal-notifications.push.unsubscribe",
        });
        if (clientId === null) return;

        const parsed = pushUnsubscribeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid body", details: parsed.error.flatten() });
        }

        await db
          .delete(customerPushSubscriptions)
          .where(
            and(
              eq(customerPushSubscriptions.client_id, clientId),
              eq(customerPushSubscriptions.endpoint, parsed.data.endpoint),
            ),
          );

        // Recompute master flag.
        const remaining = await db
          .select({ id: customerPushSubscriptions.id })
          .from(customerPushSubscriptions)
          .where(eq(customerPushSubscriptions.client_id, clientId))
          .limit(1);
        const [row] = await db
          .select({ metadata: clients.metadata })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        md.web_push_subscribed = remaining.length > 0;
        await db
          .update(clients)
          .set({ metadata: md })
          .where(eq(clients.id, clientId));

        log.info("push.unsubscribe", { clientId });
        res.json({ persisted: true });
      } catch (err: any) {
        log.error(
          "[POST /api/portal/notifications/push/unsubscribe]",
          err?.message ?? err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /** Public VAPID key (browser needs this to subscribe). */
  app.get(
    "/api/portal/notifications/vapid-public-key",
    requireClient,
    async (_req: Request, res: Response) => {
      res.json({ vapidPublicKey: getVapidPublicKey() });
    },
  );
}
