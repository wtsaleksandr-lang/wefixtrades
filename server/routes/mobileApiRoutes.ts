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
import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

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

  log.info("Mobile API routes registered");
}
