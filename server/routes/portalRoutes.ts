import express, { type Express, type Request, type Response } from "express";
import { requireClient, requireClientStrict } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";

import {
  clients,
  clientServices,
  fulfillmentTasks,
  onboardingSubmissions,
  clientPayments,
} from "@shared/schema";

import { createLogger } from "../lib/logger";
import { saveFile, deleteFile } from "../services/fileStorage";
import { withClientIdOrPreview } from "../middleware/adminPreviewSafe";
import { registerPortalQuotequickRoutes } from "./portal/quotequick";
import { registerPortalQuotequickDashboardRoutes } from "./portal/quotequick/index";
import { registerPortalReputationRoutes } from "./portal/reputation";
import { registerPortalBillingRoutes } from "./portal/billing";
import { registerPortalServicesRoutes } from "./portal/services";
import { registerPortalTradelineRoutes } from "./portal/tradeline";
import { registerPortalTradelineDashboardRoutes } from "./portal/tradeline/index";
import { registerPortalChatRoutes } from "./portal/chat";
import { registerPortalOnboardingRoutes } from "./portal/onboarding";
import { registerPortalReviewQueueRoutes } from "./portal/review-queue";
import { registerPortalContentflowRoutes } from "./portal/contentflow";
import { registerPortalContentflowDashboardRoutes } from "./portal/contentflowDashboard";
import { registerPortalMapguardRoutes } from "./portal/mapguard";
import { registerPortalMapguardDashboardRoutes } from "./portal/mapguard/index";
import { registerPortalReputationshieldDashboardRoutes } from "./portal/reputationshield/index";
import { registerPortalSocialsyncRoutes } from "./portal/socialsync";
import { registerPortalSocialsyncDashboardRoutes } from "./portal/socialsync/index";
import { registerPortalRankflowRoutes } from "./portal/rankflow";
import { registerPortalRankflowDashboardRoutes } from "./portal/rankflow/index";
import { registerPortalCatalogRoutes } from "./portal/catalog";
import { registerPortalTicketsRoutes } from "./portal/tickets";
import { registerPortalSettingsRoutes } from "./portal/settings";

const log = createLogger("Portal");

/* ─── Helpers ─── */

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
 * Middleware-style helper: resolve client_id or send a response and return null.
 *
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` so the portal page
 * renders an empty state. Real customers still get 403 `no_client_linked`.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

/* ─── Routes ─── */

export function registerPortalRoutes(app: Express) {
  // Sub-registrars (portal sub-modules extracted from this file).
  // Adding new ones here keeps routes/index.ts unchanged.
  // Wave 29: QuoteQuick dashboard sub-registrar mounts BEFORE the legacy
  // /api/portal/quotequick/* routes so the new dashboard-kpis, brand-settings,
  // run-action, notification-settings, and conversion endpoints take
  // precedence — same pattern as Wave 27 (MapGuard) and Wave 28
  // (ReputationShield).
  registerPortalQuotequickDashboardRoutes(app);
  registerPortalQuotequickRoutes(app);
  registerPortalReputationRoutes(app);
  registerPortalBillingRoutes(app);
  registerPortalServicesRoutes(app);
  // Wave 26: dashboard sub-registrar must mount BEFORE the parameterized
  // tradeline registrar — the latter defines GET /api/portal/tradeline/:clientServiceId
  // which would otherwise swallow /dashboard-kpis, /active-calls, /funnel.
  registerPortalTradelineDashboardRoutes(app);
  registerPortalTradelineRoutes(app);
  registerPortalChatRoutes(app);
  registerPortalOnboardingRoutes(app);
  registerPortalReviewQueueRoutes(app);
  registerPortalContentflowRoutes(app);
  registerPortalContentflowDashboardRoutes(app);
  // Wave 27: dashboard sub-registrar mounts BEFORE the legacy mapguard
  // registrar so the new /dashboard-kpis, /competitor-alerts, /run-action,
  // /notification-settings paths take precedence over any parameterized
  // routes defined in the parent file.
  registerPortalMapguardDashboardRoutes(app);
  registerPortalMapguardRoutes(app);
  // Wave 28: ReputationShield dashboard sub-registrar mounts BEFORE the
  // legacy /api/portal/reputation/* routes so the new endpoints are
  // separate namespaces and don't collide.
  registerPortalReputationshieldDashboardRoutes(app);
  registerPortalSocialsyncRoutes(app);
  registerPortalSocialsyncDashboardRoutes(app);
  registerPortalRankflowRoutes(app);
  registerPortalRankflowDashboardRoutes(app);
  registerPortalCatalogRoutes(app);
  registerPortalTicketsRoutes(app);
  registerPortalSettingsRoutes(app);

  /**
   * GET /api/portal/overview
   * Dashboard summary for the authenticated client.
   */
  app.get("/api/portal/overview", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, {
        client: null,
        active_services: 0,
        pending_onboarding: 0,
        recent_tasks: [],
        recent_payments: [],
      });
      if (!clientId) return;

      // Client info
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);

      // Active services count
      const [activeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(clientServices)
        .where(and(eq(clientServices.client_id, clientId), sql`${clientServices.status} IN ('active', 'onboarding')`));

      // Pending onboarding count
      const [onboardingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.client_id, clientId), sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed')`));

      // Items waiting on client
      const [waitingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fulfillmentTasks)
        .where(
          and(
            eq(fulfillmentTasks.client_id, clientId),
            eq(fulfillmentTasks.waiting_on, "client"),
            sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`
          )
        );

      // Outstanding balance
      const [balance] = await db
        .select({ total: sql<number>`coalesce(sum(${clientPayments.amount_cents}), 0)::int` })
        .from(clientPayments)
        .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending")));

      // Recent activity (last 10 fulfilled tasks, client-safe fields only)
      const recentActivity = await db
        .select({
          id: fulfillmentTasks.id,
          title: fulfillmentTasks.title,
          status: fulfillmentTasks.status,
          completed_at: fulfillmentTasks.completed_at,
          updated_at: fulfillmentTasks.updated_at,
        })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.client_id, clientId))
        .orderBy(desc(fulfillmentTasks.updated_at))
        .limit(10);

      res.json({
        business_name: client.business_name,
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        active_services: activeCount?.count ?? 0,
        pending_onboarding: onboardingCount?.count ?? 0,
        action_needed: waitingCount?.count ?? 0,
        outstanding_balance_cents: balance?.total ?? 0,
        recent_activity: recentActivity,
      });
    } catch (err) {
      log.error("Portal overview error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /**
   * GET /api/portal/adflow/:csId/reports
   * List past AdFlow reports for a client service.
   */
  app.get("/api/portal/adflow/:csId/reports", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const csId = parseInt(req.params.csId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      // Verify ownership
      const [cs] = await db.select({ id: clientServices.id, client_id: clientServices.client_id })
        .from(clientServices)
        .where(and(eq(clientServices.id, csId), eq(clientServices.client_id, clientId)))
        .limit(1);
      if (!cs) return res.status(404).json({ error: "Service not found" });

      const reports = await storage.listAdflowReports(csId, 12);
      const safe = reports.map((r) => ({
        id: r.id,
        period_label: r.period_label,
        period_start: r.period_start,
        period_end: r.period_end,
        metrics: r.metrics,
        ai_summary: r.ai_summary,
        sent_at: r.sent_at,
      }));
      res.json(safe);
    } catch (err) {
      log.error("Portal adflow reports error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load reports" });
    }
  });

  /* ═══════════════════════════════════════════
     Task Approval / Revision (client-facing)
     ═══════════════════════════════════════════ */

  /**
   * POST /api/portal/tasks/:taskId/approve
   * Client approves a task that is waiting on them (e.g. design approval).
   * Sets status to "delivered" and clears waiting_on.
   */
  app.post("/api/portal/tasks/:taskId/approve", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      // Fetch the task
      const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Verify ownership
      if (task.client_id !== clientId) {
        return res.status(403).json({ error: "This task does not belong to your account" });
      }

      // Verify the task is waiting on the client
      if (task.waiting_on !== "client") {
        return res.status(400).json({ error: "This task is not waiting on client action" });
      }

      // Update: mark as delivered and clear waiting_on
      const updated = await storage.updateFulfillmentTask(taskId, {
        status: "delivered",
        waiting_on: null,
        last_action: "Client approved",
        last_action_at: new Date(),
        completed_at: new Date(),
      });

      // Resolve client name for the log
      const client = await storage.getClientById(clientId);
      const actorName = client?.contact_name || client?.business_name || "Client";

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: req.user!.id,
        actor_name: actorName,
        action: "task.approved",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Client "${actorName}" approved task "${task.title}"`,
      });

      log.info(`[portal/task-approve] Task #${taskId} approved by client #${clientId}`);
      res.json({ ok: true, task: updated });
    } catch (err: any) {
      log.error("[portal/task-approve] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to approve task" });
    }
  });

  /**
   * POST /api/portal/tasks/:taskId/request-revision
   * Client requests a revision on a task that is waiting on them.
   * Sets status to "in_progress", waiting_on to "internal", and stores revision notes.
   */
  app.post("/api/portal/tasks/:taskId/request-revision", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { notes } = req.body || {};
      if (!notes || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ error: "Revision notes are required" });
      }

      // Fetch the task
      const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Verify ownership
      if (task.client_id !== clientId) {
        return res.status(403).json({ error: "This task does not belong to your account" });
      }

      // Verify the task is waiting on the client
      if (task.waiting_on !== "client") {
        return res.status(400).json({ error: "This task is not waiting on client action" });
      }

      // Build metadata with revision history
      const existingMeta = (task.metadata as Record<string, any>) || {};
      const revisionHistory = existingMeta.revision_history || [];
      revisionHistory.push({
        notes: notes.trim(),
        requested_at: new Date().toISOString(),
        requested_by: clientId,
      });

      const updated = await storage.updateFulfillmentTask(taskId, {
        status: "in_progress",
        waiting_on: "internal",
        last_action: `Client requested revision: ${notes.trim().slice(0, 100)}`,
        last_action_at: new Date(),
        metadata: { ...existingMeta, revision_history: revisionHistory, latest_revision_notes: notes.trim() },
      } as any);

      // Resolve client name for the log
      const client = await storage.getClientById(clientId);
      const actorName = client?.contact_name || client?.business_name || "Client";

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: req.user!.id,
        actor_name: actorName,
        action: "task.revision_requested",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Client "${actorName}" requested revision on task "${task.title}": ${notes.trim().slice(0, 200)}`,
        metadata: { revision_notes: notes.trim() },
      });

      log.info(`[portal/task-revision] Task #${taskId} revision requested by client #${clientId}`);
      res.json({ ok: true, task: updated });
    } catch (err: any) {
      log.error("[portal/task-revision] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to request revision" });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     Sprint 12 — Automation pause toggles
     Clients can pause individual service automation or all at once.
     Flags are stored in client.metadata and client_service.metadata.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * GET /api/portal/automation-status
   * Returns the current automation pause state for the client and each
   * applicable service.
   */
  app.get("/api/portal/automation-status", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const meta = (client.metadata as Record<string, any>) ?? {};
      const allPaused = meta.all_automation_paused === true;

      // Get per-service pause flags
      const services = await db.select({
        id: clientServices.id,
        service_id: clientServices.service_id,
        metadata: clientServices.metadata,
      })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          eq(clientServices.status, "active"),
        ));

      const serviceFlags: Record<string, boolean> = {};
      for (const svc of services) {
        const svcMeta = (svc.metadata as Record<string, any>) ?? {};
        if (svc.service_id.includes("socialsync")) {
          serviceFlags.socialsync_auto_post_paused = svcMeta.auto_post_paused === true;
        }
        if (svc.service_id.includes("reputationshield")) {
          serviceFlags.reputationshield_auto_reply_paused = svcMeta.auto_reply_paused === true;
        }
        if (svc.service_id.includes("rankflow")) {
          serviceFlags.rankflow_article_generation_paused = svcMeta.article_generation_paused === true;
        }
      }

      res.json({
        all_automation_paused: allPaused,
        ...serviceFlags,
      });
    } catch (err: any) {
      log.error("[portal/automation-status] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load automation status" });
    }
  });

  /**
   * PATCH /api/portal/settings/automation
   * Master "Pause All Automation" toggle.
   * Body: { all_automation_paused: boolean }
   * Stores in client.metadata.
   */
  app.patch("/api/portal/settings/automation", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { all_automation_paused } = req.body;
      if (typeof all_automation_paused !== "boolean") {
        return res.status(400).json({ error: "all_automation_paused must be a boolean" });
      }

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const existing = (client.metadata as Record<string, any>) ?? {};
      await db.update(clients)
        .set({ metadata: { ...existing, all_automation_paused }, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      log.info("[portal/settings/automation] all_automation_paused toggled", { clientId, all_automation_paused });
      res.json({ ok: true, all_automation_paused });
    } catch (err: any) {
      log.error("[portal/settings/automation] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update automation settings" });
    }
  });


  /**
   * POST /api/portal/logo
   * Q15: save customer logo URL (paste-link v1; file-upload later).
   * Body: { logo_url: string | null }
   */
  app.post("/api/portal/logo", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { logo_url } = req.body ?? {};
      if (logo_url !== null && typeof logo_url !== "string") {
        return res.status(400).json({ error: "logo_url must be a string or null" });
      }
      if (typeof logo_url === "string" && logo_url.length > 2048) {
        return res.status(400).json({ error: "logo_url exceeds 2048 chars" });
      }
      if (typeof logo_url === "string" && logo_url.length > 0 && !/^https?:\/\//i.test(logo_url)) {
        return res.status(400).json({ error: "logo_url must start with http:// or https://" });
      }

      await db.update(clients)
        .set({ logo_url: logo_url ?? null, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      log.info("[portal/logo] updated", { clientId, has_logo: !!logo_url });
      res.json({ ok: true, logo_url: logo_url ?? null });
    } catch (err: any) {
      log.error("[portal/logo] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update logo" });
    }
  });

  /**
   * POST /api/portal/logo/upload
   * Q15 (file-upload): accept a logo image file directly instead of
   * requiring the customer to host it elsewhere. Body is a base64 JSON
   * payload — same pattern as the admin deliverables upload
   * (`/api/admin/crm/fulfillment/:id/deliverables`); no multer dependency.
   * Body: { file: "base64data...", filename: "logo.png" }
   *
   * The file is stored via fileStorage.saveFile() under data/uploads/logos
   * and served from the /uploads static mount (server/index.ts). The
   * resulting public URL is persisted to clients.logo_url, replacing any
   * previous value and deleting a previously-uploaded file.
   *
   * TODO(alex): in production the data/uploads directory is local to the
   * Replit container and is wiped on redeploy. Before launch, point
   * fileStorage at a durable bucket (Replit Object Storage via
   * server/lib/objectStorage.ts, or set LOGO_UPLOAD_BUCKET) so customer
   * logos survive deploys. Paste-URL logos are unaffected.
   */
  // The global express.json() parser defaults to a 100 KB body limit, which
  // is far too small for a base64-encoded image. Mount a route-scoped parser
  // with a raised limit (5 MB binary -> ~6.8 MB base64, +slack) ahead of the
  // handler so the upload body is accepted.
  const logoUploadBodyParser = express.json({ limit: "8mb" });

  app.post("/api/portal/logo/upload", requireClientStrict, logoUploadBodyParser, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { file, filename } = req.body ?? {};
      if (!file || typeof file !== "string") {
        return res.status(400).json({ error: "file (base64 string) is required" });
      }
      if (!filename || typeof filename !== "string") {
        return res.status(400).json({ error: "filename is required" });
      }

      // Only allow common raster/vector image extensions.
      const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
      const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
      if (!ALLOWED_EXT.includes(ext)) {
        return res.status(400).json({
          error: "Unsupported image type — use PNG, JPG, GIF, WEBP or SVG",
        });
      }

      const buffer = Buffer.from(file, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "File is empty or invalid base64" });
      }
      // 5 MB limit — logos are small; this also bounds the JSON body size.
      const MAX_SIZE = 5 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) {
        return res.status(400).json({ error: "Logo exceeds 5 MB limit" });
      }

      const url = await saveFile(buffer, `logo${ext}`, "logos");

      // Replace the stored reference, cleaning up a previously-uploaded file.
      const [prev] = await db
        .select({ logo_url: clients.logo_url })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      await db.update(clients)
        .set({ logo_url: url, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      const prevUrl = prev?.logo_url;
      if (prevUrl && prevUrl.startsWith("/uploads/logos/") && prevUrl !== url) {
        await deleteFile(prevUrl).catch(() => {});
      }

      log.info("[portal/logo/upload] uploaded", { clientId, size: buffer.length });
      res.status(201).json({ ok: true, logo_url: url });
    } catch (err: any) {
      log.error("[portal/logo/upload] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });
}
