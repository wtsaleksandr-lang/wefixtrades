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
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { provisionNumber } from "../services/tradelineSetup/provisionNumber";
import { releaseTwilioNumber } from "../services/twilioNumberRelease";
import { createLogger } from "../lib/logger";
import { writeAudit } from "../lib/auditLog";
import { translatePortRejection, listKnownRejections } from "../services/tradelineSetup/portRejectionTranslator";
import { isTwilioConfigured, sendSmsAsClient } from "../twilioClient";
import { PORT_IN_TRANSIT_STATUSES } from "@shared/schema";

const log = createLogger("AdminTradelineSetups");

const TRADELINE_MODES = ["new", "forward", "port"] as const;
type Mode = (typeof TRADELINE_MODES)[number];

/**
 * Release the Twilio number a setup row owns (if any) and null out the
 * stored SID/number so it isn't double-released or treated as live.
 *
 * Call this AFTER the row's terminal status flip on any cancel/abandon path.
 * Safe to call when the row has no `assigned_number_sid` (no-op). Audit-logs
 * the release with actor + SID via the same writeAudit pattern the handlers
 * use. Non-throwing: a Twilio failure is logged inside releaseTwilioNumber
 * and surfaced in the audit metadata, never propagated to the response.
 *
 * `row` only needs `id`, `assigned_number`, and `assigned_number_sid`; we
 * accept the broader select type for convenience.
 */
async function releaseAssignedNumberIfPresent(
  row: { assigned_number_sid?: string | null; assigned_number?: string | null },
  id: number,
  req: Request,
  context: string,
): Promise<void> {
  const sid = row.assigned_number_sid?.trim();
  if (!sid) return;

  const result = await releaseTwilioNumber(sid);

  // Only clear the stored SID/number once Twilio confirms it's gone (released
  // now or already absent). On a hard failure we KEEP the SID so a later
  // reconciliation/retry can still find and release it.
  if (result.released) {
    await db
      .update(tradelinePhoneSetups)
      .set({ assigned_number: null, assigned_number_sid: null, updated_at: new Date() })
      .where(eq(tradelinePhoneSetups.id, id));
  }

  writeAudit({
    actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
    actorType: "admin",
    action: "tradeline_number_released",
    entityType: "tradeline_phone_setup",
    entityId: String(id),
    metadata: {
      context,
      sid,
      released: result.released,
      already_gone: result.alreadyGone ?? false,
      ...(result.error ? { error: result.error } : {}),
    },
    req,
  });
}

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
          writeAudit({
            actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
            actorType: "admin",
            action: "tradeline_retry_provision",
            entityType: "tradeline_phone_setup",
            entityId: String(id),
            metadata: {
              outcome: "provisioned",
              from_status: row.provisioning_status,
              to_status: "provisioned",
              number: result.number,
              sid: result.sid,
              countryCode,
              preference,
            },
            req,
          });
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
          writeAudit({
            actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
            actorType: "admin",
            action: "tradeline_retry_provision",
            entityType: "tradeline_phone_setup",
            entityId: String(id),
            metadata: {
              outcome: "queued",
              from_status: row.provisioning_status,
              to_status: "queued",
              reason: result.reason,
              countryCode,
              preference,
            },
            req,
          });
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
        writeAudit({
          actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
          actorType: "admin",
          action: "tradeline_retry_provision",
          entityType: "tradeline_phone_setup",
          entityId: String(id),
          metadata: {
            outcome: "failed",
            from_status: row.provisioning_status,
            to_status: "failed",
            error: result.error,
            countryCode,
            preference,
          },
          req,
        });
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

        writeAudit({
          actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
          actorType: "admin",
          action: "tradeline_mark_port_status",
          entityType: "tradeline_phone_setup",
          entityId: String(id),
          metadata: {
            from_status: row.port_status,
            to_status: parsed.data.status,
            terminal: isTerminal,
            ...(parsed.data.status === "rejected"
              ? { reason: parsed.data.rejectionReason ?? null }
              : {}),
          },
          req,
        });

        return res.json({ ok: true });
      } catch (err) {
        log.error("mark-port-status failed", { err: (err as Error).message });
        res.status(500).json({ error: "Update failed" });
      }
    },
  );

  /* ─── Wave 86 Layer 8: admin override panel ────────────────────────── */

  /** List all in-flight ports, sorted by oldest-first (days-in-flight). */
  app.get(
    "/api/admin/tradeline-ports/in-flight",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select({
            id: tradelinePhoneSetups.id,
            client_id: tradelinePhoneSetups.client_id,
            customer_number: tradelinePhoneSetups.customer_number,
            port_status: tradelinePhoneSetups.port_status,
            port_submitted_at: tradelinePhoneSetups.port_submitted_at,
            port_last_polled_at: tradelinePhoneSetups.port_last_polled_at,
            port_twilio_order_sid: tradelinePhoneSetups.port_twilio_order_sid,
            port_rejection_code: tradelinePhoneSetups.port_rejection_code,
            client_business_name: clients.business_name,
            client_contact_email: clients.contact_email,
          })
          .from(tradelinePhoneSetups)
          .innerJoin(clients, eq(clients.id, tradelinePhoneSetups.client_id))
          .where(inArray(tradelinePhoneSetups.port_status, PORT_IN_TRANSIT_STATUSES as unknown as string[]))
          .orderBy(tradelinePhoneSetups.port_submitted_at);

        const now = Date.now();
        const enriched = rows.map((r) => {
          const submitted = r.port_submitted_at?.getTime() ?? now;
          const daysInFlight = Math.max(0, Math.floor((now - submitted) / (24 * 60 * 60 * 1000)));
          return {
            ...r,
            daysInFlight,
            translation: r.port_rejection_code ? translatePortRejection(r.port_rejection_code) : null,
          };
        });

        return res.json({ rows: enriched, count: enriched.length });
      } catch (err) {
        log.error("in-flight list failed", { err: (err as Error).message });
        res.status(500).json({ error: "Failed to load list" });
      }
    },
  );

  /** Force-cancel a port (last-resort escape hatch). */
  const forceCancelBody = z.object({
    reason: z.string().max(500).optional(),
  });
  app.post(
    "/api/admin/tradeline-ports/:id/force-cancel",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
        const parsed = forceCancelBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const [row] = await db
          .select()
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.id, id))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });

        await db
          .update(tradelinePhoneSetups)
          .set({
            port_status: "canceled",
            port_canceled_at: new Date(),
            port_canceled_by: "admin",
            port_resolved_at: new Date(),
            port_rejection_reason: parsed.data.reason ?? "Admin-initiated cancellation",
            updated_at: new Date(),
          })
          .where(eq(tradelinePhoneSetups.id, id));

        writeAudit({
          actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
          actorType: "admin",
          action: "tradeline_port_force_cancel",
          entityType: "tradeline_phone_setup",
          entityId: String(id),
          metadata: { reason: parsed.data.reason ?? null, from_status: row.port_status },
          req,
        });

        // Cost-leak plug: if this setup owns a provisioned Twilio number,
        // release it back to Twilio AFTER the DB status flip so a churned
        // tradeline stops billing. Idempotent + non-blocking — see
        // releaseTwilioNumber. Audit-log the release with actor + SID.
        await releaseAssignedNumberIfPresent(row, id, req, "force_cancel");

        return res.json({ ok: true });
      } catch (err) {
        log.error("force-cancel failed", { err: (err as Error).message });
        res.status(500).json({ error: "Force cancel failed" });
      }
    },
  );

  /** Force-complete a port (e.g. when carrier confirmed out-of-band). */
  app.post(
    "/api/admin/tradeline-ports/:id/force-complete",
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

        await db
          .update(tradelinePhoneSetups)
          .set({
            port_status: "port_complete",
            port_resolved_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(tradelinePhoneSetups.id, id));

        writeAudit({
          actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
          actorType: "admin",
          action: "tradeline_port_force_complete",
          entityType: "tradeline_phone_setup",
          entityId: String(id),
          metadata: { from_status: row.port_status },
          req,
        });

        // GAP 3 — wire the ported number end-to-end (voice_url → Vapi, SMS
        // messaging service, Vapi import + assistant attach) and set setupStage
        // honestly. Without this the admin flips status to "port_complete" but
        // the AI can never answer the ported number. Best-effort.
        let live = false;
        let notLiveReason: string | undefined;
        if (row.customer_number) {
          try {
            const { completePortedNumberWiring } = await import(
              "../services/tradelineSetup/unifyNumber"
            );
            const { dualWriteSetup } = await import(
              "../services/tradelineSetup/dualWrite"
            );
            const unify = await completePortedNumberWiring(
              row.client_id,
              row.customer_number,
            );
            live = unify.ready;
            notLiveReason = unify.notReadyReason;
            await dualWriteSetup({
              clientId: row.client_id,
              setupPatch: {
                assigned_number: row.customer_number,
                ...(live ? { completed_at: new Date() } : {}),
                last_step: live
                  ? "port_complete_wired"
                  : "port_complete_pending_assistant",
              },
              tradelineConfigPatch: {
                setupStage: live ? "ready_for_testing" : "configuring",
                phoneRouting: { primaryBusinessNumber: row.customer_number },
              },
            });
          } catch (err) {
            log.error("force-complete wiring failed (ported, AI not live)", {
              id,
              err: (err as Error).message,
            });
          }
        }

        return res.json({ ok: true, live, ...(live ? {} : { notLiveReason }) });
      } catch (err) {
        log.error("force-complete failed", { err: (err as Error).message });
        res.status(500).json({ error: "Force complete failed" });
      }
    },
  );

  /** Send a custom SMS to the customer (free-form admin message). */
  const customMsgBody = z.object({
    body: z.string().min(1).max(320),
  });
  app.post(
    "/api/admin/tradeline-ports/:id/send-message",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
        const parsed = customMsgBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const [row] = await db
          .select()
          .from(tradelinePhoneSetups)
          .where(eq(tradelinePhoneSetups.id, id))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (!row.customer_number) {
          return res.status(400).json({ error: "Row has no customer_number" });
        }
        if (!isTwilioConfigured()) {
          return res.status(503).json({ error: "Twilio not configured" });
        }

        await sendSmsAsClient({
          clientId: row.client_id,
          to: row.customer_number,
          body: parsed.data.body,
          channel: "sms",
          quietHoursBypass: "transactional",
        });

        writeAudit({
          actorId: (req.user as any)?.id ? String((req.user as any).id) : null,
          actorType: "admin",
          action: "tradeline_port_admin_custom_sms",
          entityType: "tradeline_phone_setup",
          entityId: String(id),
          metadata: { body_length: parsed.data.body.length },
          req,
        });

        return res.json({ ok: true });
      } catch (err) {
        log.error("admin send-message failed", { err: (err as Error).message });
        res.status(500).json({ error: "Send failed" });
      }
    },
  );

  /** Reference list of known Twilio rejection codes + their translations. */
  app.get(
    "/api/admin/tradeline-ports/rejection-codes",
    requireAdmin,
    async (_req: Request, res: Response) => {
      res.json({ rejections: listKnownRejections() });
    },
  );

  log.info("Admin tradeline-setups routes registered");
}
