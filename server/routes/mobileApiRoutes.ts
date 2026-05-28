/**
 * Mobile API endpoints — duty toggle + profile + scheduled-auto-toggle
 * settings. All endpoints accept Bearer JWT (mobile) OR session cookie
 * (web) via `requireSessionOrBearer`.
 *
 * Current mode lives in client_services.metadata.tradelineConfig.currentMode
 * (values: 'available' | 'on_the_job' | 'after_hours'). Per Alex's Q4
 * decision: the scheduled cron may only set 'after_hours'; the runtime
 * value 'on_the_job' is reserved for runtime detection by other systems.
 * The /duty endpoint here is the manual toggle — it accepts all three
 * values, since the user can declare on_the_job manually.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import { sendSMS, sendSmsAsClient, isTwilioConfigured } from "../twilioClient";
import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  BOOKFLOW_SMS_TEMPLATES,
  interpolate,
  formatAppointmentTime,
} from "../lib/bookflowSmsTemplates";

const log = createLogger("MobileApi");

const TRADELINE_SERVICE_IDS = [
  "tradeline-starter",
  "tradeline-pro",
  "tradeline-enterprise",
];

const dutyModeSchema = z.enum(["available", "on_the_job", "after_hours"]);

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

export function registerMobileApiRoutes(app: Express) {
  /* ─── GET current duty mode (and profile bits useful at app boot) ─── */
  app.get(
    "/api/mobile/profile",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const u = req.user as any;
        const clientId = await resolveClientId(u.id);
        if (!clientId) {
          return res.status(403).json({ error: "No client record linked", code: "no_client_linked" });
        }
        const [client] = await db
          .select({
            id: clients.id,
            business_name: clients.business_name,
            contact_name: clients.contact_name,
          })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        // Pull currentMode from the first tradeline service's metadata (if any)
        const services = await db
          .select({
            metadata: clientServices.metadata,
            service_id: clientServices.service_id,
            status: clientServices.status,
          })
          .from(clientServices)
          .where(
            and(
              eq(clientServices.client_id, clientId),
              inArray(clientServices.service_id, TRADELINE_SERVICE_IDS),
            ),
          )
          .limit(1);

        const currentMode = (services[0]?.metadata as any)?.tradelineConfig?.currentMode ?? "available";
        const tradelineService = services[0]?.service_id ?? null;
        const tradelineStatus = services[0]?.status ?? null;

        return res.json({
          user: { id: u.id, email: u.email, role: u.role, name: u.name },
          client: client ?? null,
          tradeline: {
            service: tradelineService,
            status: tradelineStatus,
            currentMode,
          },
        });
      } catch (err) {
        log.error("profile failed", { err: (err as Error).message });
        res.status(500).json({ error: "Profile load failed" });
      }
    },
  );

  /* ─── PATCH duty mode ─── */
  const dutyBody = z.object({ mode: dutyModeSchema });

  app.patch(
    "/api/mobile/duty",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const u = req.user as any;
        const parsed = dutyBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const clientId = await resolveClientId(u.id);
        if (!clientId) {
          return res.status(403).json({ error: "No client record linked", code: "no_client_linked" });
        }

        // JSONB merge — preserves other tradelineConfig fields.
        const patch = JSON.stringify({ currentMode: parsed.data.mode, currentModeUpdatedAt: new Date().toISOString() });
        await db
          .update(clientServices)
          .set({
            metadata: sql`jsonb_set(
              COALESCE(${clientServices.metadata}, '{}'::jsonb),
              '{tradelineConfig}',
              COALESCE(${clientServices.metadata}->'tradelineConfig', '{}'::jsonb) || ${patch}::jsonb
            )`,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(clientServices.client_id, clientId),
              inArray(clientServices.service_id, TRADELINE_SERVICE_IDS),
            ),
          );

        return res.json({ ok: true, mode: parsed.data.mode });
      } catch (err) {
        log.error("duty PATCH failed", { err: (err as Error).message });
        res.status(500).json({ error: "Duty toggle failed" });
      }
    },
  );

  /* ─── POST "on my way" ETA text to a customer ─── */
  // Wave 80 — schema extended with optional tech_name and track_link.
  // Mobile clients that have not been updated yet continue to work with
  // the to + etaMinutes pair; the new fields just enrich the body when
  // the caller provides them. The body itself is now rendered from the
  // shared BookFlow ETA template so future tweaks land in one place.
  const etaBody = z.object({
    to: z.string().min(7).max(20),
    etaMinutes: z.number().int().min(1).max(480),
    techName: z.string().trim().min(1).max(80).optional(),
    trackLink: z.string().trim().url().max(500).optional(),
  });

  app.post(
    "/api/mobile/notify-eta",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const u = req.user as any;
        const parsed = etaBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

        if (!isTwilioConfigured()) {
          return res.status(503).json({ error: "Text messaging isn't set up yet", code: "sms_unconfigured" });
        }

        // Sign the text with the business name so the customer knows who.
        const clientId = await resolveClientId(u.id);
        let businessName = "Your tradesperson";
        if (clientId) {
          const [c] = await db
            .select({ business_name: clients.business_name })
            .from(clients)
            .where(eq(clients.id, clientId))
            .limit(1);
          if (c?.business_name) businessName = c.business_name;
        }

        // Wave 80 — render the body through the shared BookFlow ETA
        // template. tech_name and track_link are optional; the
        // interpolator leaves unknown vars literal so missing inputs
        // result in a fallback line rather than a broken body.
        const eta = parsed.data.etaMinutes;
        const etaTime = new Date(Date.now() + eta * 60 * 1000);
        const etaTimeStr = formatAppointmentTime(etaTime);
        const trackLink = parsed.data.trackLink ?? "";
        const techName = parsed.data.techName ?? businessName;

        let body: string;
        if (parsed.data.techName || parsed.data.trackLink) {
          body = interpolate(BOOKFLOW_SMS_TEMPLATES.eta, {
            tech_name: techName,
            brand_name: businessName,
            eta_time: etaTimeStr,
            track_link: trackLink,
          });
          // Drop the "Track: " suffix entirely if no link was provided
          // (rather than leaving a dangling "Track: " in the SMS).
          body = body.replace(/\s+Track:\s*$/i, "");
        } else {
          // Back-compat: legacy mobile clients that send only
          // (to, etaMinutes) get the original Wave 77 body so the
          // SMS reads identically until they upgrade.
          body = `On my way! ETA about ${eta} minute${eta === 1 ? "" : "s"}. - ${businessName}`;
        }

        // Wave 77 — ETA text goes to the homeowner. Route via per-tenant
        // number with per-client opt-out scoping when we have a clientId;
        // otherwise fall back to the shared brand line.
        // Wave 79 — ETA is operationally sent by the trade en route to a
        // scheduled appointment. Transactional — bypass quiet-hours.
        const sid = clientId
          ? await sendSmsAsClient({
              clientId,
              to: parsed.data.to.trim(),
              body,
              channel: "sms",
              quietHoursBypass: "transactional",
            })
          : await sendSMS(parsed.data.to.trim(), body);

        return res.json({ ok: true, sid });
      } catch (err) {
        log.error("notify-eta failed", { err: (err as Error).message });
        res.status(500).json({ error: "Couldn't send the message — try again" });
      }
    },
  );

  log.info("Mobile API routes registered");
}
