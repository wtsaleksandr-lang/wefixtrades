/**
 * Portal Services routes.
 *
 * Mounted under /api/portal/services/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PR #713 quotequick, PR #718 reputation, PR #721
 * billing established the pattern). Pure code move — zero behaviour change.
 * The parent registrar (registerPortalRoutes) invokes
 * registerPortalServicesRoutes(app) so the wiring in routes/index.ts is
 * unchanged.
 *
 * Endpoints
 *   GET   /api/portal/services
 *   GET   /api/portal/services/:id
 *   GET   /api/portal/services/:id/uptime
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { db } from "../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
  fulfillmentTasks,
  onboardingSubmissions,
  clientPayments,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalServices");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

export function registerPortalServicesRoutes(app: Express) {
  /**
   * GET /api/portal/services
   * List all services for the authenticated client.
   */
  app.get("/api/portal/services", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { services: [] });
      if (!clientId) return;

      // Get client services joined with catalog
      const services = await db
        .select({
          id: clientServices.id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          category: serviceCatalog.category,
          status: clientServices.status,
          billing_period: clientServices.billing_period,
          started_at: clientServices.started_at,
          created_at: clientServices.created_at,
        })
        .from(clientServices)
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(eq(clientServices.client_id, clientId))
        .orderBy(desc(clientServices.created_at));

      // For each service, get task counts + onboarding status
      const enriched = await Promise.all(
        services.map(async (svc) => {
          const [taskCounts] = await db
            .select({
              total: sql<number>`count(*)::int`,
              delivered: sql<number>`count(*) filter (where ${fulfillmentTasks.status} = 'delivered')::int`,
            })
            .from(fulfillmentTasks)
            .where(eq(fulfillmentTasks.client_service_id, svc.id));

          const [onboarding] = await db
            .select({
              id: onboardingSubmissions.id,
              status: onboardingSubmissions.status,
              responses: onboardingSubmissions.responses,
            })
            .from(onboardingSubmissions)
            .where(eq(onboardingSubmissions.client_service_id, svc.id))
            .limit(1);

          // Check if draft responses exist
          const hasResponses = onboarding?.responses != null
            && typeof onboarding.responses === "object"
            && Object.keys(onboarding.responses as Record<string, unknown>).length > 0;

          return {
            ...svc,
            tasks_total: taskCounts?.total ?? 0,
            tasks_delivered: taskCounts?.delivered ?? 0,
            onboarding_id: onboarding?.id ?? null,
            onboarding_status: onboarding?.status ?? null,
            onboarding_has_responses: hasResponses,
          };
        })
      );

      res.json({ services: enriched });
    } catch (err) {
      log.error("Portal services error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load services" });
    }
  });

  /**
   * GET /api/portal/services/:id
   * Single service detail with tasks, onboarding status, and payments.
   */
  app.get("/api/portal/services/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const serviceId = parseInt(req.params.id as string);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid service id" });

      // Get service (scoped to client)
      const [service] = await db
        .select({
          id: clientServices.id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          category: serviceCatalog.category,
          status: clientServices.status,
          billing_period: clientServices.billing_period,
          price_cents: clientServices.price_cents,
          started_at: clientServices.started_at,
          completed_at: clientServices.completed_at,
          created_at: clientServices.created_at,
        })
        .from(clientServices)
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(eq(clientServices.id, serviceId), eq(clientServices.client_id, clientId)))
        .limit(1);

      if (!service) return res.status(404).json({ error: "Service not found" });

      // For AdFlow services, attach latest_report from metadata
      let adflowMetrics: Record<string, any> | null = null;
      if (service.service_id.startsWith("adflow")) {
        const [csRow] = await db
          .select({ metadata: clientServices.metadata })
          .from(clientServices)
          .where(eq(clientServices.id, serviceId))
          .limit(1);
        const meta = (csRow?.metadata as Record<string, any>) || {};
        adflowMetrics = meta.latest_report || null;
      }

      // Tasks — client-safe fields only. `metadata` is selected here only so
      // we can extract the WebFix post-fix before/after report (stored in
      // task metadata, not as a real deliverable URL); it is NOT returned
      // to the client — see safeTasks below, which strips it.
      const tasks = await db
        .select({
          id: fulfillmentTasks.id,
          title: fulfillmentTasks.title,
          status: fulfillmentTasks.status,
          waiting_on: fulfillmentTasks.waiting_on,
          due_at: fulfillmentTasks.due_at,
          completed_at: fulfillmentTasks.completed_at,
          sort_order: fulfillmentTasks.sort_order,
          deliverables: fulfillmentTasks.deliverables,
          metadata: fulfillmentTasks.metadata,
        })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.client_service_id, serviceId))
        .orderBy(fulfillmentTasks.sort_order);

      // WebFix: surface the post-fix before/after audit report. It is
      // stored in fulfillmentTask.metadata.post_audit (the deliverable row
      // has an empty url), so without this it never reaches the portal.
      let webfixAudit: Record<string, any> | null = null;
      if (service.service_id.startsWith("webfix")) {
        for (const t of tasks) {
          const m = (t.metadata as Record<string, any>) || {};
          if (m.post_audit) webfixAudit = m.post_audit;
        }
      }

      // Filter waiting_on: only show if "client", otherwise null. Drop the
      // internal `metadata` field — never exposed to the client.
      const safeTasks = tasks.map(({ metadata: _internal, ...t }) => ({
        ...t,
        waiting_on: t.waiting_on === "client" ? "client" : null,
      }));

      // Onboarding submission status
      const [onboarding] = await db
        .select({
          id: onboardingSubmissions.id,
          status: onboardingSubmissions.status,
          submitted_at: onboardingSubmissions.submitted_at,
          approved_at: onboardingSubmissions.approved_at,
        })
        .from(onboardingSubmissions)
        .where(eq(onboardingSubmissions.client_service_id, serviceId))
        .limit(1);

      // Payments for this service
      const payments = await db
        .select({
          id: clientPayments.id,
          type: clientPayments.type,
          amount_cents: clientPayments.amount_cents,
          status: clientPayments.status,
          description: clientPayments.description,
          period_start: clientPayments.period_start,
          period_end: clientPayments.period_end,
          due_at: clientPayments.due_at,
          paid_at: clientPayments.paid_at,
          created_at: clientPayments.created_at,
        })
        .from(clientPayments)
        .where(eq(clientPayments.client_service_id, serviceId))
        .orderBy(desc(clientPayments.created_at));

      res.json({
        service,
        tasks: safeTasks,
        onboarding: onboarding ?? null,
        payments,
        ...(adflowMetrics ? { adflow_metrics: adflowMetrics } : {}),
        ...(webfixAudit ? { webfix_audit: webfixAudit } : {}),
      });
    } catch (err) {
      log.error("Portal service detail error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load service detail" });
    }
  });

  /* ═══════════════════════════════════════════
     WebCare Uptime History
     ═══════════════════════════════════════════ */

  /**
   * GET /api/portal/services/:id/uptime
   * Returns uptime history from the client_service metadata for WebCare services.
   */
  app.get("/api/portal/services/:id/uptime", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const serviceId = parseInt(req.params.id as string);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid service id" });

      // Verify service belongs to this client and is a WebCare service
      const [svc] = await db
        .select({
          id: clientServices.id,
          service_id: clientServices.service_id,
          metadata: clientServices.metadata,
        })
        .from(clientServices)
        .where(and(eq(clientServices.id, serviceId), eq(clientServices.client_id, clientId)))
        .limit(1);

      if (!svc) return res.status(404).json({ error: "Service not found" });
      if (!svc.service_id.startsWith("webcare")) {
        return res.status(400).json({ error: "Uptime history is only available for WebCare services" });
      }

      const meta = (svc.metadata as Record<string, any>) || {};
      const history = Array.isArray(meta.uptime_history) ? meta.uptime_history : [];

      // Calculate uptime percentage over the available history
      const totalChecks = history.length;
      const upChecks = history.filter((e: any) => e.status === "up").length;
      const uptimePercent = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 10000) / 100 : 100;

      res.json({
        uptime_percent: uptimePercent,
        total_checks: totalChecks,
        up_checks: upChecks,
        down_checks: totalChecks - upChecks,
        history,
      });
    } catch (err: any) {
      log.error("[portal/uptime] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load uptime history" });
    }
  });
}
