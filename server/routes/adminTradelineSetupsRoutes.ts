/**
 * Admin surface for tradeline phone-number setup wizard journeys.
 *
 * Endpoints under /api/admin/tradeline-setups, all `requireAdmin`:
 *   GET    /stats                     KPI strip data
 *   GET    /                          paginated list w/ filters
 *   GET    /:id                       single row + linked client info
 *   POST   /:id/retry-provision       admin force-retry of queued provisioning
 *   POST   /:id/mark-port-status      admin sets port_status (when Twilio porting API not yet wired)
 *
 * Read-only by default for the dashboard; the two POST routes are admin
 * operations to nudge stuck wizards along while batch 3's automated
 * worker isn't shipped yet.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { tradelinePhoneSetups, clients } from "@shared/schema";
import { portStatusSchema } from "@shared/schema";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { provisionNumber } from "../services/tradelineSetup/provisionNumber";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminTradelineSetups");

const TRADELINE_MODES = ["new", "forward", "port"] as const;
type Mode = (typeof TRADELINE_MODES)[number];

export function registerAdminTradelineSetupsRoutes(app: Express) {
  /* ─── KPI strip ─── */
  app.get(
    "/api/admin/tradeline-setups/stats",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const [total] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradelinePhoneSetups);

        const [completed] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradelinePhoneSetups)
          .where(isNotNull(tradelinePhoneSetups.completed_at));

        const [abandoned] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradelinePhoneSetups)
          .where(isNotNull(tradelinePhoneSetups.abandoned_at));

        const [queued] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.provisioning_status, "queued"));

        const byMode = await db
          .select({
            mode: tradelinePhoneSetups.mode,
            count: sql<number>`count(*)::int`,
          })
          .from(tradelinePhoneSetups)
          .where(isNotNull(tradelinePhoneSetups.mode))
          .groupBy(tradelinePhoneSetups.mode);

        const byPortStatus = await db
          .select({
            status: tradelinePhoneSetups.port_status,
            count: sql<number>`count(*)::int`,
          })
          .from(tradelinePhoneSetups)
          .where(isNotNull(tradelinePhoneSetups.port_status))
          .groupBy(tradelinePhoneSetups.port_status);

        res.json({
          total: total?.count ?? 0,
          completed: completed?.count ?? 0,
          abandoned: abandoned?.count ?? 0,
          queued: queued?.count ?? 0,
          byMode: Object.fromEntries(byMode.map((r) => [r.mode, r.count])),
          byPortStatus: Object.fromEntries(byPortStatus.map((r) => [r.status, r.count])),
        });
      } catch (err) {
        log.error("stats failed", { err: (err as Error).message });
        res.status(500).json({ error: "Failed to load stats" });
      }
    },
  );

  /* ─── List ─── */
  const listQuery = z.object({
    mode: z.enum(TRADELINE_MODES).optional(),
    portStatus: z.string().optional(),
    completed: z.enum(["yes", "no", "all"]).optional().default("all"),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  });

  app.get(
    "/api/admin/tradeline-setups",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = listQuery.safeParse(req.query);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { mode, portStatus, completed, limit, offset } = parsed.data;

        const conditions = [];
        if (mode) conditions.push(eq(tradelinePhoneSetups.mode, mode));
        if (portStatus) conditions.push(eq(tradelinePhoneSetups.port_status, portStatus));
        if (completed === "yes") conditions.push(isNotNull(tradelinePhoneSetups.completed_at));
        if (completed === "no") conditions.push(isNull(tradelinePhoneSetups.completed_at));

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db
          .select({
            id: tradelinePhoneSetups.id,
            client_id: tradelinePhoneSetups.client_id,
            mode: tradelinePhoneSetups.mode,
            last_step: tradelinePhoneSetups.last_step,
            provisioning_status: tradelinePhoneSetups.provisioning_status,
            assigned_number: tradelinePhoneSetups.assigned_number,
            customer_number: tradelinePhoneSetups.customer_number,
            carrier: tradelinePhoneSetups.carrier,
            forwarding_verified_at: tradelinePhoneSetups.forwarding_verified_at,
            port_status: tradelinePhoneSetups.port_status,
            started_at: tradelinePhoneSetups.started_at,
            completed_at: tradelinePhoneSetups.completed_at,
            abandoned_at: tradelinePhoneSetups.abandoned_at,
            client_business_name: clients.business_name,
            client_contact_email: clients.contact_email,
          })
          .from(tradelinePhoneSetups)
          .innerJoin(clients, eq(clients.id, tradelinePhoneSetups.client_id))
          .where(where)
          .orderBy(desc(tradelinePhoneSetups.started_at))
          .limit(limit)
          .offset(offset);

        const [totalRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradelinePhoneSetups)
          .where(where);

        res.json({
          rows,
          total: totalRow?.count ?? 0,
          limit,
          offset,
        });
      } catch (err) {
        log.error("list failed", { err: (err as Error).message });
        res.status(500).json({ error: "Failed to load list" });
      }
    },
  );

  /* ─── Detail ─── */
  app.get(
    "/api/admin/tradeline-setups/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

        const [row] = await db
          .select()
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.id, id))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });

        const [client] = await db.select().from(clients).where(eq(clients.id, row.client_id)).limit(1);

        res.json({ setup: row, client: client ?? null });
      } catch (err) {
        log.error("detail failed", { err: (err as Error).message });
        res.status(500).json({ error: "Failed to load detail" });
      }
    },
  );

  /* ─── Force-retry queued provisioning ─── */
  app.post(
    "/api/admin/tradeline-setups/:id/retry-provision",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

        const [row] = await db
          .select()
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.id, id))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.mode !== "new") {
          return res.status(400).json({ error: "Retry only applies to mode='new'" });
        }
        if (row.provisioning_status === "provisioned") {
          return res.status(400).json({ error: "Already provisioned" });
        }

        // Default to US local if carrier_country is null. Admin override comes
        // through request body if needed.
        const body = z
          .object({ countryCode: z.enum(["US", "CA"]).optional(), preference: z.enum(["local", "toll_free"]).optional() })
          .safeParse(req.body);
        const countryCode = body.success ? body.data.countryCode ?? "US" : "US";
        const preference = body.success ? body.data.preference ?? "local" : "local";

        const result = await provisionNumber(countryCode, preference);

        if (result.ok && !result.queued) {
          await db
            .update(tradelinePhoneSetups)
            .set({
              assigned_number: result.number,
              assigned_number_sid: result.sid,
              provisioning_status: "provisioned",
              provisioning_failed_reason: null,
              provisioned_at: new Date(),
              completed_at: row.completed_at ?? new Date(),
              last_step: "new_provisioned",
              updated_at: new Date(),
            })
            .where(eq(tradelinePhoneSetups.id, id));
          return res.json({
            ok: true,
            provisioned: true,
            number: result.number,
            ...(result.warning ? { warning: result.warning } : {}),
          });
        }

        if (result.ok && result.queued) {
          await db
            .update(tradelinePhoneSetups)
            .set({
              provisioning_status: "queued",
              provisioning_failed_reason: result.reason,
              updated_at: new Date(),
            })
            .where(eq(tradelinePhoneSetups.id, id));
          return res.json({ ok: true, provisioned: false, queued: true, reason: result.reason });
        }

        await db
          .update(tradelinePhoneSetups)
          .set({
            provisioning_status: "failed",
            provisioning_failed_reason: result.error,
            updated_at: new Date(),
          })
          .where(eq(tradelinePhoneSetups.id, id));
        return res.status(502).json({ ok: false, error: result.error });
      } catch (err) {
        log.error("retry-provision failed", { err: (err as Error).message });
        res.status(500).json({ error: "Retry failed" });
      }
    },
  );

  /* ─── Admin sets port_status manually ─── */
  const markPortBody = z.object({
    status: portStatusSchema,
    rejectionReason: z.string().max(2000).optional(),
  });
  app.post(
    "/api/admin/tradeline-setups/:id/mark-port-status",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
        const parsed = markPortBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const [row] = await db
          .select()
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.id, id))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.mode !== "port") {
          return res.status(400).json({ error: "Only applies to mode='port'" });
        }

        const isTerminal = parsed.data.status === "approved" || parsed.data.status === "rejected";

        await db
          .update(tradelinePhoneSetups)
          .set({
            port_status: parsed.data.status,
            port_rejection_reason: parsed.data.status === "rejected" ? (parsed.data.rejectionReason ?? null) : null,
            port_resolved_at: isTerminal ? new Date() : row.port_resolved_at,
            updated_at: new Date(),
          })
          .where(eq(tradelinePhoneSetups.id, id));

        return res.json({ ok: true });
      } catch (err) {
        log.error("mark-port-status failed", { err: (err as Error).message });
        res.status(500).json({ error: "Update failed" });
      }
    },
  );

  log.info("Admin tradeline-setups routes registered");
}
