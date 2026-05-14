/**
 * Phase 4 mobile-voice endpoints.
 *
 *   POST   /api/mobile/voice/access-token        mint Voice SDK access token
 *   POST   /api/mobile/push/register             register/upsert this device's push token
 *   DELETE /api/mobile/push/unregister/:deviceId remove this device's push registration
 *   GET    /api/mobile/voice/config              non-secret config the app needs at boot
 *
 * All require Bearer (mobile) or session (web admin testing). Server-side
 * Twilio Push Credential creation for the platform happens lazily on
 * first push/register — see TODO.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { mobileCallRecords, mobileDevices, mobilePlatformSchema } from "@shared/schema";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import {
  getVoiceConfig,
  voiceConfigMissingKeys,
  mintAccessToken,
} from "../lib/twilioVoiceAccessToken";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileVoice");

export function registerMobileVoiceRoutes(app: Express) {
  /* ─── Issue Voice SDK access token ─── */
  const tokenBody = z.object({
    deviceId: z.string().min(1).max(64).optional(),
  });

  app.post(
    "/api/mobile/voice/access-token",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        if (!getVoiceConfig()) {
          return res.status(503).json({
            error: "Voice configuration incomplete",
            missing: voiceConfigMissingKeys(),
            code: "voice_config_missing",
          });
        }
        const parsed = tokenBody.safeParse(req.body);
        const deviceId = parsed.success ? parsed.data.deviceId : undefined;

        const user = req.user as any;

        // If a deviceId is given, look up that device's Twilio binding so the
        // Voice grant can target it. If not yet bound, mint without binding —
        // the app will register-and-retry.
        let pushCredentialSid: string | undefined;
        if (deviceId) {
          const [row] = await db
            .select()
            .from(mobileDevices)
            .where(
              and(
                eq(mobileDevices.user_id, user.id),
                eq(mobileDevices.device_id, deviceId),
              ),
            )
            .limit(1);
          if (row?.twilio_binding_sid) {
            pushCredentialSid = row.twilio_binding_sid;
          }
          if (row) {
            await db
              .update(mobileDevices)
              .set({ last_seen_at: new Date() })
              .where(eq(mobileDevices.id, row.id));
          }
        }

        const result = mintAccessToken({ userId: user.id, pushCredentialSid });
        return res.json(result);
      } catch (err) {
        log.error("access-token failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Token issue failed" });
      }
    },
  );

  /* ─── Register / upsert push token ─── */
  const registerBody = z.object({
    deviceId: z.string().min(1).max(64),
    platform: mobilePlatformSchema,
    pushToken: z.string().min(1).max(500),
    deviceLabel: z.string().max(200).optional(),
    appVersion: z.string().max(32).optional(),
  });

  app.post(
    "/api/mobile/push/register",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const parsed = registerBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const user = req.user as any;
        const { deviceId, platform, pushToken, deviceLabel, appVersion } = parsed.data;

        const [existing] = await db
          .select()
          .from(mobileDevices)
          .where(
            and(
              eq(mobileDevices.user_id, user.id),
              eq(mobileDevices.device_id, deviceId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(mobileDevices)
            .set({
              platform,
              push_token: pushToken,
              device_label: deviceLabel ?? existing.device_label,
              app_version: appVersion ?? existing.app_version,
              last_seen_at: new Date(),
              // Clear Twilio binding so it gets re-created on next access-token
              // request if the push token changed.
              twilio_binding_sid: existing.push_token === pushToken ? existing.twilio_binding_sid : null,
            })
            .where(eq(mobileDevices.id, existing.id));
          return res.json({ ok: true, deviceId, updated: true });
        }

        await db.insert(mobileDevices).values({
          user_id: user.id,
          device_id: deviceId,
          platform,
          push_token: pushToken,
          device_label: deviceLabel ?? null,
          app_version: appVersion ?? null,
        });

        // TODO Phase 4 part 2: create a Twilio Push Credential + Binding so
        // inbound calls can be delivered as a push notification. Deferred until
        // the APNs Auth Key + FCM service account JSON are uploaded to the
        // Twilio admin console.

        return res.json({ ok: true, deviceId, updated: false });
      } catch (err) {
        log.error("push register failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Registration failed" });
      }
    },
  );

  /* ─── Unregister push (e.g., on logout) ─── */
  app.delete(
    "/api/mobile/push/unregister/:deviceId",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const raw = req.params.deviceId;
        const deviceId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
        if (!deviceId || deviceId.length > 64) {
          return res.status(400).json({ error: "Invalid deviceId" });
        }
        await db
          .delete(mobileDevices)
          .where(
            and(
              eq(mobileDevices.user_id, user.id as number),
              eq(mobileDevices.device_id, deviceId),
            ),
          );
        return res.json({ ok: true });
      } catch (err) {
        log.error("push unregister failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Unregistration failed" });
      }
    },
  );

  /* ─── Non-secret Voice config (currently just readiness) ─── */
  app.get(
    "/api/mobile/voice/config",
    requireSessionOrBearer,
    async (_req: Request, res: Response) => {
      const ready = getVoiceConfig() !== null;
      const missing = voiceConfigMissingKeys();
      return res.json({ ready, missing });
    },
  );

  /* ─── Recent calls for the authenticated user ─── */
  app.get(
    "/api/mobile/calls",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      const user = req.user as any;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      try {
        const rows = await db
          .select({
            id: mobileCallRecords.id,
            call_sid: mobileCallRecords.call_sid,
            direction: mobileCallRecords.direction,
            from_number: mobileCallRecords.from_number,
            to_number: mobileCallRecords.to_number,
            status: mobileCallRecords.status,
            duration_sec: mobileCallRecords.duration_sec,
            started_at: mobileCallRecords.started_at,
            ended_at: mobileCallRecords.ended_at,
          })
          .from(mobileCallRecords)
          .where(eq(mobileCallRecords.user_id, user.id as number))
          .orderBy(desc(mobileCallRecords.started_at))
          .limit(limit);
        return res.json({ calls: rows });
      } catch (err) {
        log.error("Call history query failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to fetch call history" });
      }
    },
  );

  log.info("Mobile voice routes registered");
}
