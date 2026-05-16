import type { Express, Request, Response } from "express";
import { requireAdmin, hashPassword } from "../auth";
import { storage } from "../storage";
import { advanceSetupStage, getTradeLineReadiness } from "@shared/schema";
import { tiersSchema } from "@shared/tiers";
import { automationConfigSchema } from "@shared/automationConfig";
import { z } from "zod";

const featuresSchema = z.array(z.string().min(1).max(400)).max(40);

// Q28c: Stripe ID format check. Empty string OR null means "clear".
const stripeIdSchema = z.union([
  z.literal(""),
  z.null(),
  z.string().regex(/^(prod_|price_)[A-Za-z0-9]+$/, "Must look like prod_… or price_…").max(120),
]);
import { dispatchTaskToSupplier } from "../services/supplierDispatch";
import { autoAssignSupplier } from "../services/supplierAssignment";
import { sendWelcomePackage } from "../lib/welcomeEmail";
import { sendApprovalNotificationEmail } from "../lib/approvalNotificationEmail";
import { runSiteLaunchFinalization } from "../services/sitelaunchFinalization";
import { runPreFixAudit, runPostFixAudit } from "../services/webfixAuditService";
import { compileAndSendAdFlowReport, previewAdFlowReportHtml } from "../services/adflowReports";
import { sendAdflowCreativeApprovalEmail } from "../lib/adflowCreativeApprovalEmail";
import crypto from "crypto";
import { createLogger } from "../lib/logger";
import { saveFile, deleteFile } from "../services/fileStorage";
import type { Deliverable } from "@shared/schema";

const log = createLogger("AdminCRM");

export function registerAdminCrmRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Overview
     ═══════════════════════════════════════════ */

  // Q30 chat history: return the admin's rolling Copilot thread + last-
  // updated timestamp. 7-day server-side memory (per chat_memory). The
  // /admin/chat-history page reads from this.
  app.get("/api/admin/copilot/history", requireAdmin, async (req: Request, res: Response) => {
    try {
      const u = req.user as any;
      if (!u?.id) return res.status(401).json({ error: "Not authenticated" });
      const { getMemoryByUserId } = await import("../services/chatMemory");
      const mem = await getMemoryByUserId(u.id);
      if (!mem) return res.json({ messages: [], memory: null, updated_at: null });
      res.json({
        messages: mem.messages ?? [],
        memory: mem.memory ?? null,
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      log.error("[admin/copilot/history] Error:", err.message);
      res.status(500).json({ error: "Failed to load Copilot history" });
    }
  });

  app.get("/api/admin/crm/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overview = await storage.getCrmOverview();
      res.json(overview);
    } catch (err: any) {
      log.error("[admin-crm] Overview error:", err.message);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /**
   * POST /api/admin/audit/preview-portal-entry
   * Q20: log when an admin clicks "View as Customer" so we have a record
   * of every preview session entered. Fire-and-forget from the client.
   */
  app.post("/api/admin/audit/preview-portal-entry", requireAdmin, async (req: Request, res: Response) => {
    try {
      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: "admin.preview_portal_entry",
        entity_type: "user",
        entity_id: u?.id ?? null,
        summary: `${u?.name || u?.email || "Admin"} opened the customer portal in preview mode`,
      });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("[admin-audit/preview-portal] Error:", err.message);
      // Don't block the preview because of audit failure
      res.json({ ok: false });
    }
  });

  /* ═══════════════════════════════════════════
     Service Catalog
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/services", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await storage.listServiceCatalog();
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list services" });
    }
  });

  /* ═══════════════════════════════════════════
     Product Editor (Q28)
     ═══════════════════════════════════════════
     Endpoints for admin to edit serviceCatalog entries through a
     draft → publish flow. The customer-facing surfaces never read
     drafts — they always read serviceCatalog directly. Drafts exist
     only as a pending-change layer for admin review.
  */

  /** Multi-approver workflow threshold. Default 1 (pre-launch parity:
   *  any single admin can publish their own draft). Set PUBLISH_APPROVAL_COUNT
   *  env to a higher integer post-launch to require N distinct admins. */
  const publishApprovalThreshold = (() => {
    const raw = process.env.PUBLISH_APPROVAL_COUNT;
    const n = raw ? parseInt(raw, 10) : 1;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();

  // GET /api/admin/products/:id — current published row + latest pending draft (if any)
  app.get("/api/admin/products/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });
      const draft = await storage.getLatestProductDraft(svcId);
      res.json({ live, draft, publish_approval_threshold: publishApprovalThreshold });
    } catch (err: any) {
      log.error("[products GET] Error:", err.message);
      res.status(500).json({ error: "Failed to load product" });
    }
  });

  // POST /api/admin/products/:id/draft — create or update a draft for this product
  app.post("/api/admin/products/:id/draft", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });

      // Whitelist: only these fields can be edited via draft. Internal-only
      // fields (stripe IDs, cost_amount, sort_order) require direct admin
      // access for now and bypass the draft flow.
      const EDITABLE = ["name", "tagline", "description", "default_price", "billing_period", "category", "tiers", "features", "stripe_product_id", "stripe_price_id", "stripe_yearly_price_id", "automation_config"] as const;
      const draftData: Record<string, any> = {};
      for (const key of EDITABLE) {
        if (key in req.body) draftData[key] = req.body[key];
      }
      if (Object.keys(draftData).length === 0) {
        return res.status(400).json({ error: "No editable fields in request body" });
      }
      // Q28a: validate tiers shape if present (allow null to clear).
      if ("tiers" in draftData && draftData.tiers !== null) {
        const parsed = tiersSchema.safeParse(draftData.tiers);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid tiers payload", details: parsed.error.flatten() });
        }
        draftData.tiers = parsed.data;
      }
      // Q28b: validate features shape if present (allow null to clear).
      if ("features" in draftData && draftData.features !== null) {
        const parsed = featuresSchema.safeParse(draftData.features);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid features payload", details: parsed.error.flatten() });
        }
        draftData.features = parsed.data;
      }
      // Q28c: validate Stripe ID formats. Treat empty string as null.
      for (const key of ["stripe_product_id", "stripe_price_id", "stripe_yearly_price_id"] as const) {
        if (key in draftData) {
          const parsed = stripeIdSchema.safeParse(draftData[key]);
          if (!parsed.success) {
            return res.status(400).json({ error: `Invalid ${key}`, details: parsed.error.flatten() });
          }
          draftData[key] = parsed.data === "" ? null : parsed.data;
        }
      }
      // Q28f: validate automation_config shape if present.
      if ("automation_config" in draftData && draftData.automation_config !== null) {
        const parsed = automationConfigSchema.safeParse(draftData.automation_config);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid automation_config", details: parsed.error.flatten() });
        }
        draftData.automation_config = parsed.data;
      }

      const u = req.user as any;
      const draft = await storage.upsertProductDraft({
        service_id: svcId,
        draft_data: draftData,
        notes: typeof req.body.notes === "string" ? req.body.notes.slice(0, 500) : null,
        created_by: u?.id ?? null,
        created_by_email: u?.email ?? null,
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: "product.draft_saved",
        entity_type: "service_catalog",
        entity_id: null,
        summary: `Saved draft for "${live.name}" (${Object.keys(draftData).join(", ")})`,
        metadata: { service_id: svcId, draft_id: draft.id, fields: Object.keys(draftData) },
      });

      res.json({ draft });
    } catch (err: any) {
      log.error("[products draft POST] Error:", err.message);
      res.status(500).json({ error: "Failed to save draft" });
    }
  });

  // POST /api/admin/products/:id/approve — record an approval without publishing
  // Multi-approver workflow: idempotently adds the current admin to the
  // draft's approvers list. Used when PUBLISH_APPROVAL_COUNT > 1.
  app.post("/api/admin/products/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });
      const draft = await storage.getLatestProductDraft(svcId);
      if (!draft || draft.status !== "draft") {
        return res.status(400).json({ error: "No pending draft to approve" });
      }
      const u = req.user as any;
      if (!u?.id) return res.status(401).json({ error: "Missing user id" });
      const updated = await storage.addProductDraftApprover(draft.id, u.id, u.email ?? null);
      if (!updated) return res.status(404).json({ error: "Draft not found" });
      const approvers = (updated.approvers as Array<{ user_id: number }>) ?? [];
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u.id,
        actor_name: u.name || u.email,
        action: "product.draft_approved",
        entity_type: "service_catalog",
        entity_id: null,
        summary: `Approved draft for "${live.name}" (${approvers.length}/${publishApprovalThreshold} approvals)`,
        metadata: { service_id: svcId, draft_id: draft.id, approvals: approvers.length, threshold: publishApprovalThreshold },
      });
      res.json({ draft: updated, publish_approval_threshold: publishApprovalThreshold });
    } catch (err: any) {
      log.error("[products approve POST] Error:", err.message);
      res.status(500).json({ error: "Failed to record approval" });
    }
  });

  // POST /api/admin/products/:id/publish — promote latest draft to serviceCatalog
  // Enforces PUBLISH_APPROVAL_COUNT (default 1). The publisher is auto-added
  // to approvers if not already there, so a solo admin with threshold=1
  // can still one-click publish exactly as before.
  app.post("/api/admin/products/:id/publish", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });

      let draft = await storage.getLatestProductDraft(svcId);
      if (!draft || draft.status !== "draft") {
        return res.status(400).json({ error: "No pending draft to publish" });
      }

      const u = req.user as any;
      if (!u?.id) return res.status(401).json({ error: "Missing user id" });

      // Auto-add publisher as approver (idempotent). This preserves single-admin
      // one-click publish behavior when threshold=1.
      const withApprover = await storage.addProductDraftApprover(draft.id, u.id, u.email ?? null);
      if (withApprover) draft = withApprover;
      const approvers = (draft.approvers as Array<{ user_id: number; email: string | null; approved_at: string }>) ?? [];

      if (approvers.length < publishApprovalThreshold) {
        return res.status(409).json({
          error: `This draft needs ${publishApprovalThreshold - approvers.length} more approval(s) before publish.`,
          code: "approvals_pending",
          approvals: approvers.length,
          threshold: publishApprovalThreshold,
          draft,
        });
      }

      const updated = await storage.publishProductDraft(draft.id, svcId, draft.draft_data as Record<string, any>, u.id);

      // Q5f: surface tier-mirror summary so audit log readers can see which
      // sibling rows got updated by this publish. publishProductDraft handles
      // the mirror itself; this just records what was published for review.
      const publishedTiers = Array.isArray((draft.draft_data as any)?.tiers)
        ? ((draft.draft_data as any).tiers as Array<{ id?: string }>)
            .map((t) => t?.id)
            .filter((id): id is string => typeof id === "string")
        : [];

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u.id,
        actor_name: u.name || u.email,
        action: "product.draft_published",
        entity_type: "service_catalog",
        entity_id: null,
        summary: `Published draft for "${updated.name}" — changes are now live (${approvers.length}/${publishApprovalThreshold} approvals)${publishedTiers.length ? ` · mirrored ${publishedTiers.length} tier row(s)` : ""}`,
        metadata: {
          service_id: svcId,
          draft_id: draft.id,
          fields: Object.keys(draft.draft_data as Record<string, any>),
          mirrored_tier_ids: publishedTiers,
          approvals: approvers.length,
          threshold: publishApprovalThreshold,
        },
      });

      res.json({ live: updated });
    } catch (err: any) {
      log.error("[products publish POST] Error:", err.message);
      res.status(500).json({ error: "Failed to publish draft" });
    }
  });

  /* ─── Q28e: Subscriber roster per product ─── */

  // GET /api/admin/products/:id/subscribers — every client_service row + client info
  app.get("/api/admin/products/:id/subscribers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });
      const rows = await storage.listSubscribersForService(svcId);
      res.json({ subscribers: rows });
    } catch (err: any) {
      log.error("[products subscribers GET] Error:", err.message);
      res.status(500).json({ error: "Failed to load subscribers" });
    }
  });

  // POST /api/admin/products/:id/subscribers/:clientServiceId/toggle
  // body { enabled: boolean }  — flip enabled on a client_service row
  app.post("/api/admin/products/:id/subscribers/:clientServiceId/toggle", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId), 10);
      if (!Number.isFinite(csId)) return res.status(400).json({ error: "Invalid client_service id" });
      const enabled = req.body?.enabled === true;
      const updated = await storage.updateClientService(csId, { enabled });
      if (!updated) return res.status(404).json({ error: "Subscription not found" });
      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: enabled ? "product.subscription_enabled" : "product.subscription_disabled",
        entity_type: "client_service",
        entity_id: csId,
        summary: `${enabled ? "Enabled" : "Disabled"} client_service #${csId} on product "${String(req.params.id)}"`,
        metadata: { service_id: String(req.params.id), client_service_id: csId, client_id: updated.client_id },
      });
      res.json({ subscription: updated });
    } catch (err: any) {
      log.error("[products subscriber toggle POST] Error:", err.message);
      res.status(500).json({ error: "Failed to toggle subscription" });
    }
  });

  // POST /api/admin/products/:id/subscribers/:clientServiceId/cancel
  // body { reason?: string } — cancel the subscription with a reason (audit-logged)
  app.post("/api/admin/products/:id/subscribers/:clientServiceId/cancel", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId), 10);
      if (!Number.isFinite(csId)) return res.status(400).json({ error: "Invalid client_service id" });
      const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : null;
      const updated = await storage.updateClientService(csId, {
        status: "cancelled",
        enabled: false,
        cancelled_at: new Date(),
      });
      if (!updated) return res.status(404).json({ error: "Subscription not found" });
      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: "product.subscription_cancelled",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Cancelled client_service #${csId} on product "${String(req.params.id)}"${reason ? ` — ${reason}` : ""}`,
        metadata: { service_id: String(req.params.id), client_service_id: csId, client_id: updated.client_id, reason },
      });
      res.json({ subscription: updated });
    } catch (err: any) {
      log.error("[products subscriber cancel POST] Error:", err.message);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  /* ─── Q28d: Suppliers per product ─── */

  // GET /api/admin/products/:id/suppliers — assigned + available suppliers
  app.get("/api/admin/products/:id/suppliers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });
      const [assigned, all] = await Promise.all([
        storage.listSuppliersForService(svcId),
        storage.listSuppliers(),
      ]);
      const assignedIds = new Set(assigned.map((s) => s.id));
      const available = all.filter((s) => !assignedIds.has(s.id) && s.is_active);
      res.json({ assigned, available });
    } catch (err: any) {
      log.error("[products suppliers GET] Error:", err.message);
      res.status(500).json({ error: "Failed to load suppliers" });
    }
  });

  // POST /api/admin/products/:id/suppliers/:supplierId — body { assigned: boolean }
  app.post("/api/admin/products/:id/suppliers/:supplierId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const supplierId = parseInt(String(req.params.supplierId), 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ error: "Invalid supplier id" });
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });
      const assigned = req.body?.assigned === true;
      const updated = await storage.setSupplierServiceAssignment(supplierId, svcId, assigned);
      if (!updated) return res.status(404).json({ error: "Supplier not found" });
      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: assigned ? "product.supplier_assigned" : "product.supplier_unassigned",
        entity_type: "supplier",
        entity_id: supplierId,
        summary: `${assigned ? "Assigned" : "Unassigned"} supplier "${updated.name}" ${assigned ? "to" : "from"} product "${live.name}"`,
        metadata: { service_id: svcId, supplier_id: supplierId },
      });
      res.json({ supplier: updated });
    } catch (err: any) {
      log.error("[products supplier toggle POST] Error:", err.message);
      res.status(500).json({ error: "Failed to update supplier assignment" });
    }
  });

  // POST /api/admin/products/:id/suppliers/:supplierId/cost — Q28h
  // body: { cost_cents: number | null, cost_type?: string }
  // null cost_cents clears the override (falls back to supplier.cost_rate).
  app.post("/api/admin/products/:id/suppliers/:supplierId/cost", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const supplierId = parseInt(String(req.params.supplierId), 10);
      if (!Number.isFinite(supplierId)) return res.status(400).json({ error: "Invalid supplier id" });
      const live = await storage.getServiceById(svcId);
      if (!live) return res.status(404).json({ error: "Product not found" });

      const { cost_cents, cost_type } = req.body ?? {};
      let payload: { cost_cents: number; cost_type?: string } | null;
      if (cost_cents === null || cost_cents === undefined) {
        payload = null;
      } else if (typeof cost_cents !== "number" || !Number.isFinite(cost_cents) || cost_cents < 0 || cost_cents > 10_000_000) {
        return res.status(400).json({ error: "cost_cents must be a non-negative number ≤ 10,000,000 cents" });
      } else {
        payload = { cost_cents: Math.round(cost_cents) };
        if (typeof cost_type === "string" && /^(per_task|monthly|hourly|per_project)$/.test(cost_type)) {
          payload.cost_type = cost_type;
        }
      }

      const updated = await storage.setSupplierServiceCost(supplierId, svcId, payload);
      if (!updated) return res.status(404).json({ error: "Supplier not found" });
      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: payload === null ? "product.supplier_cost_cleared" : "product.supplier_cost_set",
        entity_type: "supplier",
        entity_id: supplierId,
        summary: payload === null
          ? `Cleared per-service cost override for "${updated.name}" on "${live.name}"`
          : `Set per-service cost override for "${updated.name}" on "${live.name}": ${(payload.cost_cents / 100).toFixed(2)} ${(updated.currency || "usd").toUpperCase()}${payload.cost_type ? ` (${payload.cost_type})` : ""}`,
        metadata: { service_id: svcId, supplier_id: supplierId, cost_cents: payload?.cost_cents ?? null, cost_type: payload?.cost_type ?? null },
      });
      res.json({ supplier: updated });
    } catch (err: any) {
      log.error("[products supplier cost POST] Error:", err.message);
      res.status(500).json({ error: "Failed to update supplier cost" });
    }
  });

  // POST /api/admin/products/:id/reject — reject the latest draft
  app.post("/api/admin/products/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    try {
      const svcId = String(req.params.id);
      const draft = await storage.getLatestProductDraft(svcId);
      if (!draft || draft.status !== "draft") {
        return res.status(400).json({ error: "No pending draft to reject" });
      }
      const u = req.user as any;
      const reason = typeof req.body.reason === "string" ? req.body.reason.slice(0, 500) : null;
      const updated = await storage.rejectProductDraft(draft.id, u?.id ?? null, reason);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: "product.draft_rejected",
        entity_type: "service_catalog",
        entity_id: null,
        summary: `Rejected draft for "${svcId}"`,
        metadata: { service_id: svcId, draft_id: draft.id, reason },
      });
      res.json({ draft: updated });
    } catch (err: any) {
      log.error("[products reject POST] Error:", err.message);
      res.status(500).json({ error: "Failed to reject draft" });
    }
  });

  /* ═══════════════════════════════════════════
     Clients
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients", requireAdmin, async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const rows = await storage.listClients({ search, status, limit, offset });
      const total = await storage.getClientCount(status);
      res.json({ data: rows, total });
    } catch (err: any) {
      log.error("[admin-crm] List clients error:", err.message);
      res.status(500).json({ error: "Failed to list clients" });
    }
  });

  app.post("/api/admin/crm/clients", requireAdmin, async (req: Request, res: Response) => {
    try {
      const client = await storage.createClient(req.body);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "client.created",
        entity_type: "client",
        entity_id: client.id,
        summary: `Created client "${client.business_name}"`,
      });
      res.status(201).json(client);
    } catch (err: any) {
      log.error("[admin-crm] Create client error:", err.message);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.get("/api/admin/crm/clients/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const client = await storage.getClientById(id);
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get client" });
    }
  });

  app.patch("/api/admin/crm/clients/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const client = await storage.updateClient(id, req.body);
      if (!client) return res.status(404).json({ error: "Client not found" });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "client.updated",
        entity_type: "client",
        entity_id: id,
        summary: `Updated client "${client.business_name}"`,
        metadata: { fields: Object.keys(req.body) },
      });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  /* ═══════════════════════════════════════════
     Client Services
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/services", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const rows = await storage.listClientServices(clientId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list client services" });
    }
  });

  app.post("/api/admin/crm/clients/:id/services", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const svc = await storage.createClientService({ ...req.body, client_id: clientId });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "client_service.created",
        entity_type: "client_service",
        entity_id: svc.id,
        summary: `Added service "${svc.service_id}" to client #${clientId}`,
      });
      res.status(201).json(svc);
    } catch (err: any) {
      log.error("[admin-crm] Create client service error:", err.message);
      res.status(500).json({ error: "Failed to create client service" });
    }
  });

  /**
   * GET /api/admin/crm/client-services/:id
   * Fetch a single client_service (used by the Service Ops admin page).
   */
  app.get("/api/admin/crm/client-services/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const svc = await storage.getClientServiceById(id);
      if (!svc) return res.status(404).json({ error: "Client service not found" });
      res.json(svc);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load client service" });
    }
  });

  app.patch("/api/admin/crm/client-services/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const svc = await storage.updateClientService(id, req.body);
      if (!svc) return res.status(404).json({ error: "Client service not found" });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "client_service.updated",
        entity_type: "client_service",
        entity_id: id,
        summary: `Updated client service #${id}`,
        metadata: { fields: Object.keys(req.body) },
      });
      res.json(svc);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update client service" });
    }
  });

  /**
   * POST /api/admin/crm/client-services/:id/sitelaunch-template
   *
   * Admin form submit for SiteLaunch-Template fulfillment.
   * Writes the chosen template ID + content block into
   * client_service.metadata.config.sitelaunch_template.
   *
   * Body: {
   *   template_id: string,      // e.g. "trade-classic-v2"
   *   brand_colors?: string,    // hex pair
   *   logo_url?: string,
   *   content: {                // structured content for the template
   *     hero_title?: string,
   *     hero_sub?: string,
   *     about?: string,
   *     services: Array<{ name: string; description: string }>,
   *     service_area?: string,
   *     contact: { phone: string; email: string; address?: string; hours?: string },
   *   },
   *   domain?: string,
   *   notes?: string,
   * }
   */
  app.post("/api/admin/crm/client-services/:id/sitelaunch-template", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const body = req.body || {};
      if (!body.template_id || typeof body.template_id !== "string") {
        return res.status(400).json({ error: "template_id is required" });
      }
      if (!body.content || typeof body.content !== "object") {
        return res.status(400).json({ error: "content block is required" });
      }
      const cs = await storage.getClientServiceById(id);
      if (!cs) return res.status(404).json({ error: "Client service not found" });
      if (cs.service_id !== "sitelaunch-template") {
        return res.status(400).json({ error: `Endpoint only applies to sitelaunch-template (got "${cs.service_id}")` });
      }

      const existingMeta = (cs.metadata as any) || {};
      const nextMeta = {
        ...existingMeta,
        config: {
          ...(existingMeta.config || {}),
          sitelaunch_template: {
            template_id: body.template_id,
            brand_colors: body.brand_colors,
            logo_url: body.logo_url,
            content: body.content,
            domain: body.domain,
            notes: body.notes,
            saved_at: new Date().toISOString(),
            saved_by: (req.user as any)?.email || (req.user as any)?.id,
          },
        },
      };

      const updated = await storage.updateClientService(id, { metadata: nextMeta });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "sitelaunch_template.configured",
        entity_type: "client_service",
        entity_id: id,
        summary: `SiteLaunch template "${body.template_id}" configured for service #${id}`,
        metadata: { template_id: body.template_id, fields: Object.keys(body.content) },
      });
      res.json({ ok: true, client_service: updated });
    } catch (err: any) {
      log.error("[sitelaunch-template] Save failed:", err.message);
      res.status(500).json({ error: "Failed to save SiteLaunch template config" });
    }
  });

  /**
   * POST /api/admin/crm/client-services/:id/adflow-metrics
   * Admin enters monthly ad campaign metrics for a client service.
   * Saves to client_service.metadata.latest_report.
   */
  app.post("/api/admin/crm/client-services/:id/adflow-metrics", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.id) as string);
      const cs = await storage.getClientServiceById(csId);
      if (!cs) return res.status(404).json({ error: "Client service not found" });
      if (!cs.service_id.startsWith("adflow")) return res.status(400).json({ error: "Not an AdFlow service" });

      const { impressions, clicks, leads_generated, cost_spent_cents, ctr_pct, cpc_cents,
              top_creative, notes, period_start, period_end, daily_breakdown, creatives,
              recommendations } = req.body;

      // Auto-carry prior period data from the previous saved report
      let prior_period: Record<string, any> | undefined;
      const previousReports = await storage.listAdflowReports(csId, 1);
      if (previousReports.length > 0) {
        const prevMetrics = previousReports[0].metrics as Record<string, any>;
        prior_period = {
          leads_generated: prevMetrics.leads_generated,
          cost_spent_cents: prevMetrics.cost_spent_cents,
          ctr_pct: prevMetrics.ctr_pct,
          cpc_cents: prevMetrics.cpc_cents,
        };
      }

      const latestReport = {
        impressions, clicks, leads_generated, cost_spent_cents, ctr_pct, cpc_cents,
        top_creative, notes, period_start, period_end, daily_breakdown, creatives,
        recommendations,
        ...(prior_period ? { prior_period } : {}),
      };

      const existingMeta = (cs.metadata as Record<string, any>) || {};
      const updated = await storage.updateClientService(csId, {
        metadata: { ...existingMeta, latest_report: latestReport },
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "adflow.metrics_entered",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Entered AdFlow metrics for period ${period_start || "unknown"}`,
      });

      res.json({ ok: true, client_service: updated });
    } catch (err: any) {
      log.error("[adflow-metrics] Save failed:", err.message);
      res.status(500).json({ error: "Failed to save AdFlow metrics" });
    }
  });

  /**
   * POST /api/admin/crm/client-services/:id/adflow-send-report
   * Manually trigger sending the AdFlow report for a single service.
   */
  app.post("/api/admin/crm/client-services/:id/adflow-send-report", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.id) as string);
      const result = await compileAndSendAdFlowReport(csId);
      res.json(result);
    } catch (err: any) {
      log.error("[adflow-send-report] Failed:", err.message);
      res.status(500).json({ error: "Failed to send AdFlow report" });
    }
  });

  /**
   * GET /api/admin/crm/adflow/services
   * List all active AdFlow client services with metrics status for the ops page.
   */
  app.get("/api/admin/crm/adflow/services", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { db } = await import("../db");
      const { clientServices, clients: clientsTable, serviceCatalog } = await import("@shared/schema");
      const { eq, and, sql } = await import("drizzle-orm");

      const rows = await db.select({
        id: clientServices.id,
        client_id: clientServices.client_id,
        service_id: clientServices.service_id,
        status: clientServices.status,
        enabled: clientServices.enabled,
        metadata: clientServices.metadata,
        business_name: clientsTable.business_name,
        service_name: serviceCatalog.name,
      })
        .from(clientServices)
        .innerJoin(clientsTable, eq(clientServices.client_id, clientsTable.id))
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(
          eq(clientServices.status, "active"),
          sql`${clientServices.service_id} LIKE 'adflow%'`,
        ));

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const enriched = rows.map((row: any) => {
        const meta = (row.metadata as Record<string, any>) || {};
        const latestReport = meta.latest_report;
        const periodStart: string | undefined = latestReport?.period_start;
        const hasCurrentMetrics = periodStart
          ? periodStart.slice(0, 7) >= currentMonth
          : false;
        return {
          id: row.id,
          client_id: row.client_id,
          service_id: row.service_id,
          enabled: row.enabled !== false,
          business_name: row.business_name || "Unknown",
          tier: row.service_id.replace("adflow-", ""),
          has_current_metrics: hasCurrentMetrics,
          last_report_sent: meta.last_report_sent_at || null,
          last_report_period: meta.last_report_period || null,
          period_start: periodStart || null,
        };
      });

      res.json(enriched);
    } catch (err: any) {
      log.error("[adflow-ops] Failed to list services:", err.message);
      res.status(500).json({ error: "Failed to list AdFlow services" });
    }
  });

  /**
   * GET /api/admin/crm/adflow/:csId/preview-report
   * Returns the HTML that would be sent as the report email.
   */
  app.get("/api/admin/crm/adflow/:csId/preview-report", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.csId) as string);
      const cs = await storage.getClientServiceById(csId);
      if (!cs) return res.status(404).json({ error: "Client service not found" });
      if (!cs.service_id.startsWith("adflow")) return res.status(400).json({ error: "Not an AdFlow service" });

      const client = await storage.getClientById(cs.client_id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const { db } = await import("../db");
      const { serviceCatalog } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [svc] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1);

      const csMeta = (cs.metadata as any) || {};
      const metrics = csMeta.latest_report || {};

      const result = await previewAdFlowReportHtml({
        contactName: client.contact_name || client.business_name || "there",
        serviceName: svc?.name || "AdFlow",
        metrics,
        recipientEmail: client.contact_email || "",
      });

      res.json({ html: result.html, subject: result.subject });
    } catch (err: any) {
      log.error("[adflow-preview] Failed:", { error: err.message });
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  /**
   * POST /api/admin/crm/adflow/:csId/resend-report
   * Re-sends the last report email for a single service.
   */
  app.post("/api/admin/crm/adflow/:csId/resend-report", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.csId) as string);
      const cs = await storage.getClientServiceById(csId);
      if (!cs) return res.status(404).json({ error: "Client service not found" });
      if (!cs.service_id.startsWith("adflow")) return res.status(400).json({ error: "Not an AdFlow service" });

      // Clear the last_report_period to allow re-sending
      const csMeta = (cs.metadata as Record<string, any>) || {};
      await storage.updateClientService(csId, {
        metadata: { ...csMeta, last_report_period: null },
      });

      const result = await compileAndSendAdFlowReport(csId);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "adflow.report_resent",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Re-sent AdFlow report for service #${csId}`,
      });

      res.json(result);
    } catch (err: any) {
      log.error("[adflow-resend] Failed:", { error: err.message });
      res.status(500).json({ error: "Failed to re-send report" });
    }
  });

  /**
   * GET /api/admin/crm/adflow/:csId/reports
   * List historical AdFlow reports for a service (admin view).
   */
  app.get("/api/admin/crm/adflow/:csId/reports", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.csId) as string);
      const reports = await storage.listAdflowReports(csId, 24);
      res.json(reports);
    } catch (err: any) {
      log.error("[adflow-reports-history] Failed:", { error: err.message });
      res.status(500).json({ error: "Failed to list reports" });
    }
  });

  /* ═══════════════════════════════════════════
     Fulfillment
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/fulfillment", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const rows = await storage.listFulfillmentTasks({ clientId });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list fulfillment tasks" });
    }
  });

  app.get("/api/admin/crm/fulfillment", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const rows = await storage.listFulfillmentTasks({ status, limit });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list fulfillment tasks" });
    }
  });

  app.post("/api/admin/crm/fulfillment", requireAdmin, async (req: Request, res: Response) => {
    try {
      const task = await storage.createFulfillmentTask(req.body);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "fulfillment.created",
        entity_type: "fulfillment_task",
        entity_id: task.id,
        summary: `Created fulfillment task "${task.title}"`,
      });
      res.status(201).json(task);
    } catch (err: any) {
      log.error("[admin-crm] Create fulfillment error:", err.message);
      res.status(500).json({ error: "Failed to create fulfillment task" });
    }
  });

  app.patch("/api/admin/crm/fulfillment/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      // If marking delivered, set completed_at
      if (req.body.status === "delivered" && !req.body.completed_at) {
        req.body.completed_at = new Date();
      }
      const task = await storage.updateFulfillmentTask(id, req.body);
      if (!task) return res.status(404).json({ error: "Fulfillment task not found" });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "fulfillment.updated",
        entity_type: "fulfillment_task",
        entity_id: id,
        summary: `Updated fulfillment task "${task.title}" → ${task.status}`,
        metadata: { fields: Object.keys(req.body) },
      });

      // QA auto-transition: tasks with human_review_required auto-move to qa_review on submit
      if (task.status === "submitted" && task.human_review_required) {
        await storage.updateFulfillmentTask(id, {
          status: "qa_review",
          last_action: "Auto-transitioned to QA review (human_review_required)",
          last_action_at: new Date(),
        } as any);
        task.status = "qa_review";
        log.info("Task auto-transitioned to QA review", { taskId: id, title: task.title });
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "QA Workflow",
          action: "fulfillment.qa_auto_transition",
          entity_type: "fulfillment_task",
          entity_id: id,
          summary: `Task "${task.title}" auto-transitioned to QA review`,
        });
      }

      // SiteLaunch finalization: when a supplier task is submitted, auto-generate
      // SEO meta tags, form embed instructions, and create a follow-up task.
      // Non-blocking — runs in background, idempotent.
      if (task.status === "submitted") {
        runSiteLaunchFinalization(task.id).catch(err =>
          log.warn(`[sitelaunch-finalization] failed for task #${task.id}:`, { error: err.message }),
        );
      }

      // Completion cascade: if task delivered, check if all tasks for this service are done
      let cascade;
      if (task.status === "delivered" && task.client_service_id) {
        cascade = await storage.checkAndCompleteService(task.client_service_id);

        // Send welcome package when the service transitions to active/completed
        // (non-blocking — idempotent on the service record)
        if (cascade?.serviceCompleted || cascade?.serviceActivated) {
          sendWelcomePackage(task.client_service_id).catch(err =>
            log.warn(`[welcome-email] send failed for client_service #${task.client_service_id}:`, err.message),
          );

          // WebFix post-audit: when a WebFix service completes, run post-fix
          // PageSpeed audit and generate before/after report. Non-blocking.
          runPostFixAudit(task.client_service_id).catch(err =>
            log.warn(`[webfix-post-audit] failed for client_service #${task.client_service_id}:`, { error: err.message }),
          );
        }

        // AdFlow report trigger removed — Sprint 1: AdFlow dropped.
      }

      // Auto-dispatch to supplier when a task moves into in_progress/submitted
      // with handled_by: supplier + supplier_id. Idempotent (no-ops if already dispatched).
      let supplier_dispatch;
      if (task.handled_by === "supplier" && task.supplier_id &&
          (task.status === "in_progress" || task.status === "submitted")) {
        supplier_dispatch = await dispatchTaskToSupplier(task.id);
      }

      // Send approval notification when task moves to waiting_on=client with deliverables
      if (task.waiting_on === "client" && Array.isArray(task.deliverables) && (task.deliverables as Deliverable[]).length > 0) {
        const taskMeta = (task.metadata as Record<string, any>) || {};
        if (!taskMeta.approval_notification_sent) {
          const client = await storage.getClientById(task.client_id);
          if (client?.contact_email) {
            sendApprovalNotificationEmail({
              recipientEmail: client.contact_email,
              businessName: client.business_name,
              taskTitle: task.title,
              taskId: task.id,
              clientId: task.client_id,
              clientServiceId: task.client_service_id,
              deliverables: task.deliverables as Deliverable[],
            }).then((sent) => {
              if (sent) {
                storage.updateFulfillmentTask(id, {
                  metadata: { ...taskMeta, approval_notification_sent: true, approval_notification_sent_at: new Date().toISOString() },
                } as any).catch((e: any) => log.warn("Failed to stamp approval_notification_sent", { error: e.message }));
              }
            }).catch((e: any) => log.warn("Approval notification error", { error: e.message }));
          }
        }
      }

      // AdFlow creative approval email: when a task with "approves creatives" in
      // the title moves to waiting_on=client, send a dedicated creative review email.
      if (task.waiting_on === "client" && task.title.toLowerCase().includes("approves creatives")) {
        const taskMeta = (task.metadata as Record<string, any>) || {};
        if (!taskMeta.creative_approval_email_sent) {
          const client = await storage.getClientById(task.client_id);
          if (client?.contact_email) {
            sendAdflowCreativeApprovalEmail({
              recipientEmail: client.contact_email,
              businessName: client.business_name,
              clientServiceId: task.client_service_id,
            }).then((sent) => {
              if (sent) {
                storage.updateFulfillmentTask(id, {
                  metadata: { ...taskMeta, creative_approval_email_sent: true, creative_approval_email_sent_at: new Date().toISOString() },
                } as any).catch((e: any) => log.warn("Failed to stamp creative_approval_email_sent", { error: e.message }));
              }
            }).catch((e: any) => log.warn("Creative approval email error", { error: e.message }));
          }
        }
      }

      res.json({ ...task, cascade, supplier_dispatch });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update fulfillment task" });
    }
  });

  /**
   * POST /api/admin/crm/fulfillment/:id/process
   * AI assist for an automatable fulfillment task. Generates a concrete
   * action plan via the provider rotator (Claude → OpenAI → Gemini) and
   * records it on the task. Does NOT change task status — the operator
   * still drives status with the normal controls.
   */
  app.post("/api/admin/crm/fulfillment/:id/process", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid task id" });
    }
    try {
      const task = await storage.getFulfillmentTask(id);
      if (!task) return res.status(404).json({ error: "Fulfillment task not found" });
      if (task.status === "delivered" || task.status === "cancelled") {
        return res.status(400).json({ error: `Task is ${task.status} — nothing to process` });
      }

      await storage.updateFulfillmentTask(id, { automation_status: "running" } as any);

      const { generateText } = await import("../services/ai/textRotator");
      const outcome = await generateText({
        tier: "standard",
        max_tokens: 700,
        system:
          "You are an operations copilot for WeFixTrades, a done-for-you marketing agency for trades businesses. " +
          "Given a client fulfillment task, produce a short, concrete action plan the admin can follow to complete it. " +
          "Numbered steps only — no preamble, no sign-off. Each step is one concrete action. Maximum 8 steps.",
        user: [
          `Task: ${task.title}`,
          task.description ? `Details: ${task.description}` : "",
          task.service_name ? `Service: ${task.service_name}` : "",
          task.client_name ? `Client: ${task.client_name}` : "",
          `Current status: ${task.status}`,
        ].filter(Boolean).join("\n"),
      });

      if (!outcome.ok) {
        await storage.updateFulfillmentTask(id, { automation_status: "failed" } as any);
        log.error("[admin-crm] fulfillment process — all AI providers failed", { taskId: id, tried: outcome.tried });
        return res.status(502).json({ error: "AI providers unavailable — please try again shortly" });
      }

      const plan = outcome.data.text.trim();
      if (!plan) {
        await storage.updateFulfillmentTask(id, { automation_status: "failed" } as any);
        return res.status(502).json({ error: "AI returned an empty plan — please try again" });
      }

      const firstLine = plan.split("\n").map((l) => l.trim()).find(Boolean);
      const firstStep = firstLine ? firstLine.replace(/^\d+[.)]\s*/, "").slice(0, 280) : null;

      await storage.updateFulfillmentTask(id, {
        automation_status: "completed",
        last_action: `AI assist via ${outcome.provider}`,
        last_action_at: new Date(),
        next_action: firstStep || task.next_action,
        metadata: {
          ...((task.metadata as Record<string, unknown>) || {}),
          automation_plan: plan,
          automation_plan_at: new Date().toISOString(),
        },
      } as any);

      await storage.logAdminActivity({
        actor_type: "ai_agent",
        actor_id: (req.user as any)?.id,
        actor_name: "AI Copilot",
        action: "fulfillment.processed",
        entity_type: "fulfillment_task",
        entity_id: id,
        summary: `AI assist generated an action plan for task "${task.title}" (provider: ${outcome.provider})`,
      }).catch((err: any) => log.error("logAdminActivity failed", { error: err.message }));

      res.json({ ok: true, result: { provider: outcome.provider, message: plan } });
    } catch (err: any) {
      await storage.updateFulfillmentTask(id, { automation_status: "failed" } as any).catch(() => {});
      log.error("[admin-crm] fulfillment process error:", err.message);
      res.status(500).json({ error: "Failed to process fulfillment task" });
    }
  });

  /* ═══════════════════════════════════════════
     Suppliers — moved to adminSupplierRoutes.ts
     See /api/admin/suppliers/* endpoints
     ═══════════════════════════════════════════ */

  /* ═══════════════════════════════════════════
     Payments
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/payments", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const rows = await storage.listClientPayments(clientId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list payments" });
    }
  });

  app.post("/api/admin/crm/payments", requireAdmin, async (req: Request, res: Response) => {
    try {
      const payment = await storage.createClientPayment(req.body);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "payment.created",
        entity_type: "payment",
        entity_id: payment.id,
        summary: `Created ${payment.type} for $${(payment.amount_cents / 100).toFixed(2)}`,
      });
      res.status(201).json(payment);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  app.patch("/api/admin/crm/payments/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const updates = { ...req.body };
      // Auto-set paid_at when marking as paid
      if (updates.status === "paid" && !updates.paid_at) {
        updates.paid_at = new Date();
      }
      const payment = await storage.updateClientPayment(id, updates);
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "payment.updated",
        entity_type: "payment",
        entity_id: id,
        summary: `Payment #${id} → ${payment.status}`,
        metadata: { fields: Object.keys(req.body) },
      });
      res.json(payment);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update payment" });
    }
  });

  /* ═══════════════════════════════════════════
     Onboarding
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/onboarding", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const rows = await storage.listOnboardingSubmissions(clientId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list onboarding submissions" });
    }
  });

  app.post("/api/admin/crm/onboarding", requireAdmin, async (req: Request, res: Response) => {
    try {
      const sub = await storage.createOnboardingSubmission(req.body);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "onboarding.created",
        entity_type: "onboarding",
        entity_id: sub.id,
        summary: `Created onboarding submission for client #${sub.client_id}`,
      });
      res.status(201).json(sub);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create onboarding submission" });
    }
  });

  app.patch("/api/admin/crm/onboarding/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const sub = await storage.updateOnboardingSubmission(id, req.body);
      if (!sub) return res.status(404).json({ error: "Onboarding submission not found" });
      res.json(sub);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update onboarding submission" });
    }
  });

  /* ═══════════════════════════════════════════
     Notes
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/notes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const rows = await storage.listInternalNotes(clientId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list notes" });
    }
  });

  app.post("/api/admin/crm/notes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const note = await storage.createInternalNote({
        ...req.body,
        author_id: (req.user as any)?.id,
      });
      res.status(201).json(note);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  /* ═══════════════════════════════════════════
     Activity Log
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/activity", requireAdmin, async (req: Request, res: Response) => {
    try {
      const entityType = (req.query.entity_type as string | undefined) || undefined;
      const entityId = req.query.entity_id ? parseInt(req.query.entity_id as string) : undefined;
      const actorType = (req.query.actor_type as string | undefined) || undefined;
      const actionLike = (req.query.action as string | undefined) || undefined;
      const q = (req.query.q as string | undefined) || undefined;
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);

      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const until = req.query.until ? new Date(req.query.until as string) : undefined;
      // Reject malformed dates rather than silently treating them as
      // "no filter" — that would surprise an operator filtering for
      // a specific window.
      if (since && isNaN(since.getTime())) return res.status(400).json({ error: "since must be ISO-8601" });
      if (until && isNaN(until.getTime())) return res.status(400).json({ error: "until must be ISO-8601" });

      const rows = await storage.listAdminActivity({
        entityType, entityId, actorType, actionLike, q, since, until, cursor, limit,
      });
      // The next cursor is the smallest id we returned. Front-end can
      // pass it back as ?cursor= to fetch the next page. If we got
      // fewer rows than the limit there are no more pages.
      const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
      res.json({ rows, nextCursor });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list activity" });
    }
  });

  /* ═══════════════════════════════════════════
     All Payments (cross-client)
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/payments", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const rows = await storage.listAllPayments({ status, limit });
      const unpaid = await storage.getUnpaidTotal();
      res.json({ data: rows, unpaidTotal: unpaid });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list payments" });
    }
  });

  /* ═══════════════════════════════════════════
     Service Catalog Stats
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/services/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const counts = await storage.getActiveClientCountByService();
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get service stats" });
    }
  });

  /* ═══════════════════════════════════════════
     Provision Service (single-action setup)
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/clients/:id/provision", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const { service_id, fulfillment_mode, price_override } = req.body;

      if (!service_id) return res.status(400).json({ error: "service_id is required" });

      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const service = await storage.getServiceById(service_id);
      if (!service) return res.status(404).json({ error: "Service not found in catalog" });

      // 1. Create client_service
      const clientService = await storage.createClientService({
        client_id: clientId,
        service_id,
        status: "pending",
        enabled: true,
        fulfillment_mode: fulfillment_mode || "internal",
        price_cents: price_override ?? service.default_price,
        billing_period: service.billing_period,
      });

      // 2. Create invoice
      const payment = await storage.createClientPayment({
        client_id: clientId,
        client_service_id: clientService.id,
        type: "invoice",
        amount_cents: clientService.price_cents ?? 0,
        status: "pending",
        description: `${service.name} — ${service.billing_period === "monthly" ? "monthly" : "one-time"}`,
        actor_type: "human",
      });

      // 3. Create onboarding submission (if template exists)
      const onboardingTemplate = await storage.getOnboardingTemplate(service_id);
      let onboarding = null;
      if (onboardingTemplate) {
        onboarding = await storage.createOnboardingSubmission({
          client_service_id: clientService.id,
          client_id: clientId,
          template_id: onboardingTemplate.id,
          status: "not_sent",
          actor_type: "human",
        });
      }

      // 4. Create tasks from template
      const taskTemplates = await storage.getTaskTemplates(service_id);
      const tasks = [];
      for (const t of taskTemplates) {
        const task = await storage.createFulfillmentTask({
          client_service_id: clientService.id,
          client_id: clientId,
          title: t.title,
          description: t.description,
          sort_order: t.sort_order,
          priority: t.default_priority,
          handled_by: t.default_handled_by,
          waiting_on: t.default_waiting_on,
          human_review_required: t.human_review_required,
          due_at: t.sla_days ? new Date(Date.now() + t.sla_days * 86400000) : null,
          status: "not_started",
          actor_type: "human",
        });
        tasks.push(task);

        // Auto-assign supplier if template specifies handled_by = "supplier"
        if (t.default_handled_by === "supplier") {
          try { await autoAssignSupplier(task); } catch (_) { /* fail-safe */ }
        }
      }

      // 5. Update client status if needed
      if (client.status === "lead") {
        await storage.updateClient(clientId, { status: "onboarding" });
      }

      // 6. WebFix pre-audit: auto-run PageSpeed audit after provisioning
      // Non-blocking — enriches the first task with audit results for supplier brief
      if (service_id.startsWith("webfix")) {
        runPreFixAudit(clientService.id).catch(err =>
          log.warn(`[webfix-pre-audit] failed for client_service #${clientService.id}:`, err.message),
        );
      }

      // 7. Log activity
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "service.provisioned",
        entity_type: "client_service",
        entity_id: clientService.id,
        summary: `Provisioned "${service.name}" for client "${client.business_name}" — ${tasks.length} tasks created`,
        metadata: { service_id, tasks_created: tasks.length, has_onboarding: !!onboarding },
      });

      res.status(201).json({
        clientService,
        payment,
        onboarding,
        tasksCreated: tasks.length,
      });
    } catch (err: any) {
      log.error("[admin-crm] Provision error:", err.message);
      res.status(500).json({ error: "Failed to provision service" });
    }
  });

  /* ═══════════════════════════════════════════
     Generate Monthly Tasks (Pattern B)
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/client-services/:id/generate-tasks", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientServiceId = parseInt(String(req.params.id) as string);
      const { month } = req.body; // optional label like "2026-04"

      const cs = await storage.getClientServiceById(clientServiceId);
      if (!cs) return res.status(404).json({ error: "Client service not found" });

      const allTemplates = await storage.getTaskTemplates(cs.service_id);
      const taskTemplates = allTemplates.filter(t => t.is_recurring);
      if (!taskTemplates.length) return res.status(400).json({ error: "No recurring task templates found for this service" });

      const label = month || new Date().toISOString().slice(0, 7);
      const tasks = [];
      for (const t of taskTemplates) {
        const task = await storage.createFulfillmentTask({
          client_service_id: clientServiceId,
          client_id: cs.client_id,
          title: `[${label}] ${t.title}`,
          description: t.description,
          sort_order: t.sort_order,
          priority: t.default_priority,
          handled_by: t.default_handled_by,
          waiting_on: t.default_waiting_on,
          human_review_required: t.human_review_required,
          due_at: t.sla_days ? new Date(Date.now() + t.sla_days * 86400000) : null,
          status: "not_started",
          actor_type: "human",
        });
        tasks.push(task);

        // Auto-assign supplier if template specifies handled_by = "supplier"
        if (t.default_handled_by === "supplier") {
          try { await autoAssignSupplier(task); } catch (_) { /* fail-safe */ }
        }
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tasks.generated",
        entity_type: "client_service",
        entity_id: clientServiceId,
        summary: `Generated ${tasks.length} monthly tasks for ${label}`,
        metadata: { month: label, tasks_created: tasks.length },
      });

      res.status(201).json({ tasksCreated: tasks.length, month: label });
    } catch (err: any) {
      log.error("[admin-crm] Generate tasks error:", err.message);
      res.status(500).json({ error: "Failed to generate tasks" });
    }
  });

  /* ═══════════════════════════════════════════
     Portal Account Provisioning
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/clients/:id/create-account", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      // Already has portal access
      if (client.user_id) {
        const existingUser = await storage.getUserById(client.user_id);
        return res.status(200).json({
          already_exists: true,
          email: existingUser?.email ?? client.contact_email,
        });
      }

      // Need a contact email to create the account
      const email = client.contact_email;
      if (!email) {
        return res.status(400).json({ error: "Client has no contact email. Add one first." });
      }

      // Check if a user with this email already exists
      const existingByEmail = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existingByEmail) {
        // Link existing user if it's a client role, otherwise reject
        if (existingByEmail.role !== "client") {
          return res.status(409).json({ error: "A user with this email already exists with a different role" });
        }
        await storage.updateClient(clientId, { user_id: existingByEmail.id });

        await storage.logAdminActivity({
          actor_type: "human",
          actor_id: (req.user as any)?.id,
          actor_name: (req.user as any)?.name || (req.user as any)?.email,
          action: "portal.linked",
          entity_type: "client",
          entity_id: clientId,
          summary: `Linked existing portal account ${email}`,
        });

        return res.status(200).json({
          already_exists: true,
          email: existingByEmail.email,
        });
      }

      // Generate temporary password
      const tempPassword = crypto.randomBytes(6).toString("base64url"); // ~8 chars, URL-safe

      // Create user
      const user = await storage.createUser({
        email: email.toLowerCase().trim(),
        password_hash: hashPassword(tempPassword),
        name: client.contact_name || client.business_name,
        role: "client",
      });

      // Link to client
      await storage.updateClient(clientId, { user_id: user.id });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "portal.created",
        entity_type: "client",
        entity_id: clientId,
        summary: `Created portal account for ${email}`,
      });

      res.status(201).json({
        already_exists: false,
        email: user.email,
        temporary_password: tempPassword,
      });
    } catch (err: any) {
      log.error("[admin-crm] Create account error:", err.message);
      res.status(500).json({ error: "Failed to create portal account" });
    }
  });

  // ═══════════════════════════════════════════════
  // Review Requests
  // ═══════════════════════════════════════════════

  /* ═══════════════════════════════════════════
     QuoteQuick Admin Overview
     ═══════════════════════════════════════════ */

  /**
   * GET /api/admin/crm/quotequick/overview
   * Returns all calculators with their status, client linkage, and basic metrics.
   */
  app.get("/api/admin/crm/quotequick/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const allCalcs = await storage.getAllCalculatorsForAdmin();
      res.json({ calculators: allCalcs });
    } catch (err: any) {
      log.error("[admin-crm] QuoteQuick overview error:", err.message);
      res.status(500).json({ error: "Failed to load QuoteQuick overview" });
    }
  });

  /**
   * PATCH /api/admin/crm/quotequick/:calculatorId/status
   * Pause or resume a QuoteQuick calculator by setting its deployment status.
   * status "paused" makes the public calculator 404; "live" restores it.
   */
  app.patch("/api/admin/crm/quotequick/:calculatorId/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const calculatorId = parseInt(String(req.params.calculatorId) as string);
      if (isNaN(calculatorId)) {
        return res.status(400).json({ error: "Invalid calculator ID" });
      }

      const status = req.body?.status;
      if (status !== "live" && status !== "paused") {
        return res.status(400).json({ error: "status must be 'live' or 'paused'" });
      }

      const deployment = await storage.upsertDeploymentStatus({
        calculator_id: calculatorId,
        status,
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "quotequick.status_updated",
        entity_type: "calculator",
        entity_id: calculatorId,
        summary: `${status === "paused" ? "Paused" : "Resumed"} QuoteQuick calculator #${calculatorId}`,
        metadata: { status },
      });

      res.json(deployment);
    } catch (err: any) {
      log.error("[admin-crm] QuoteQuick status update error:", err.message);
      res.status(500).json({ error: "Failed to update calculator status" });
    }
  });

  /**
   * POST /api/admin/crm/quotequick/:calculatorId/edit-link
   * Renews the calculator's 7-day edit token and returns its edit-page URL.
   * Lets an admin open any calculator's editor without knowing the owner's token
   * (and without hitting the "edit access expired" screen on stale calculators).
   */
  app.post("/api/admin/crm/quotequick/:calculatorId/edit-link", requireAdmin, async (req: Request, res: Response) => {
    try {
      const calculatorId = parseInt(String(req.params.calculatorId) as string);
      if (isNaN(calculatorId)) {
        return res.status(400).json({ error: "Invalid calculator ID" });
      }

      const calculator = await storage.getCalculatorById(calculatorId);
      if (!calculator) {
        return res.status(404).json({ error: "Calculator not found" });
      }

      // Renew the edit window so the (admin-initiated) edit session is always valid.
      const renewedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.updateCalculator(calculatorId, { token_expires_at: renewedExpiry });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "quotequick.edit_link_issued",
        entity_type: "calculator",
        entity_id: calculatorId,
        summary: `Opened editor for QuoteQuick calculator #${calculatorId}`,
      });

      res.json({ edit_url: `/edit-calculator?token=${calculator.edit_token}` });
    } catch (err: any) {
      log.error("[admin-crm] QuoteQuick edit-link error:", err.message);
      res.status(500).json({ error: "Failed to issue edit link" });
    }
  });

  /**
   * GET /api/admin/crm/clients/:id/quotequick
   * Returns QuoteQuick calculator data for a specific client (via user_id linkage).
   */
  app.get("/api/admin/crm/clients/:id/quotequick", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      if (!client.user_id) {
        return res.json({ calculators: [], message: "Client has no linked user account" });
      }

      const calcs = await storage.getCalculatorsByUserId(client.user_id);
      const results = [];

      const PLAN_REVENUE: Record<string, number> = {
        free: 0,
        starter: 4900,
        business: 9900,
      };
      const QQ_COST_CENTS = 500;

      let totalRevenue = 0;
      let totalCost = 0;

      for (const calc of calcs) {
        const deploy = await storage.getDeploymentStatus(calc.id);
        const leadCount = await storage.getLeadCountSince(calc.id, new Date(0));
        const tier = calc.plan_tier ?? "free";
        const revenue = PLAN_REVENUE[tier] ?? 0;
        const cost = tier === "free" ? 0 : QQ_COST_CENTS;

        totalRevenue += revenue;
        totalCost += cost;

        results.push({
          id: calc.id,
          business_name: calc.business_name,
          trade_type: calc.trade_type,
          slug: calc.slug,
          plan_tier: tier,
          total_views: calc.total_views ?? 0,
          total_leads: leadCount,
          status: deploy?.status ?? "draft",
          created_at: calc.created_at,
          calculator_url: `/calculator?slug=${calc.slug}`,
          edit_url: `/EditCalculator?token=${calc.edit_token}`,
          price_cents: revenue,
          cost_cents: cost,
        });
      }

      res.json({
        calculators: results,
        profitability: {
          total_revenue_cents: totalRevenue,
          total_cost_cents: totalCost,
          profit_cents: totalRevenue - totalCost,
          margin_pct: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0,
        },
      });
    } catch (err: any) {
      log.error("[admin-crm] Client QuoteQuick error:", err.message);
      res.status(500).json({ error: "Failed to load client QuoteQuick data" });
    }
  });

  /* ═══════════════════════════════════════════
     TradeLine - Admin Read/Write
     ═══════════════════════════════════════════ */

  /**
   * GET /api/admin/crm/tradeline/fleet
   * Returns all TradeLine client_services with fleet-level data for ops dashboard.
   *
   * NOTE: Static-path routes (fleet, calls, webhook-events, cost-reconciliation) MUST be
   * registered before /:clientServiceId — otherwise Express matches the param route
   * first and rejects the literal segment as an invalid integer id.
   */
  app.get("/api/admin/crm/tradeline/fleet", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const fleet = await storage.listTradeLineFleet();
      res.json(fleet);
    } catch (err: any) {
      log.error("[admin-crm] TradeLine fleet error:", { error: err.message });
      res.status(500).json({ error: "Failed to load TradeLine fleet data" });
    }
  });

  /**
   * GET /api/admin/crm/tradeline/calls
   * Fleet-wide call list with optional filters. Used by the TradeLine Ops "Calls" tab.
   */
  app.get("/api/admin/crm/tradeline/calls", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const outcome = (req.query.outcome as string) || undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const result = await storage.listAllTradeLineCalls({ clientId, outcome, from, to, limit, offset });
      res.json(result);
    } catch (err: any) {
      log.error("[admin-crm] TradeLine calls list error:", { error: err.message });
      res.status(500).json({ error: "Failed to load TradeLine calls" });
    }
  });

  /**
   * GET /api/admin/crm/tradeline/calls/:callId
   * Single call detail (transcript + recording). Used for inline expansion on Ops page.
   */
  app.get("/api/admin/crm/tradeline/calls/:callId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const callId = parseInt(String(req.params.callId) as string);
      if (isNaN(callId)) return res.status(400).json({ error: "Invalid call id" });
      const call = await storage.getTradeLineCallById(callId);
      if (!call) return res.status(404).json({ error: "Call not found" });
      res.json({ call });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine call detail error:", { error: err.message });
      res.status(500).json({ error: "Failed to load call detail" });
    }
  });

  app.get("/api/admin/crm/tradeline/webhook-events", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const events = await storage.listVapiWebhookEvents(limit);
      res.json(events);
    } catch (err: any) {
      log.error("[admin-crm] Webhook events error:", { error: err.message });
      res.status(500).json({ error: "Failed to load webhook events" });
    }
  });

  app.get("/api/admin/crm/tradeline/cost-reconciliation", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { getVapiBillingUsage } = await import("../services/tradelineCostService");
      const now = new Date();
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : now;
      const result = await getVapiBillingUsage(startDate, endDate);
      res.json(result);
    } catch (err: any) {
      log.error("[admin-crm] Cost reconciliation error:", { error: err.message });
      res.status(500).json({ error: "Failed to load cost reconciliation" });
    }
  });

  /**
   * GET /api/admin/crm/tradeline/:clientServiceId
   * Returns TradeLine config, latest usage, and recent calls for admin.
   */
  app.get("/api/admin/crm/tradeline/:clientServiceId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const [config, usage, calls, profitability] = await Promise.all([
        storage.getTradeLineConfig(csId),
        storage.getTradeLineUsage(csId),
        storage.listTradeLineCalls(csId, 10),
        storage.getTradeLineProfitability(csId),
      ]);

      res.json({
        clientServiceId: csId,
        clientId: cs.client_id,
        serviceId: cs.service_id,
        status: cs.status,
        config: config ?? null,
        usage: usage ?? null,
        recentCalls: calls,
        profitability,
        setupStage: config?.setupStage ?? "not_started",
        assistantStatus: config?.assistant?.status ?? "not_built",
        assistantError: config?.assistant?.lastBuildError || null,
        assistantBuiltAt: config?.assistant?.lastBuiltAt || null,
      });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine GET error:", err.message);
      res.status(500).json({ error: "Failed to load TradeLine data" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/config
   * Partially update TradeLine config.
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const partialConfig = req.body;
      if (!partialConfig || typeof partialConfig !== "object") {
        return res.status(400).json({ error: "Config object required" });
      }

      const updated = await storage.updateTradeLineConfig(csId, partialConfig);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.config_updated",
        entity_type: "client_service",
        entity_id: csId,
        summary: "Updated TradeLine config",
      });

      res.json({ config: updated });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine config update error:", err.message);
      res.status(500).json({ error: "Failed to update TradeLine config" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/mode
   * Switch TradeLine mode (admin-initiated).
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/mode", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const { newMode } = req.body;
      const validModes = ["available", "on_the_job", "after_hours"];
      if (!newMode || !validModes.includes(newMode)) {
        return res.status(400).json({ error: "newMode must be one of: available, on_the_job, after_hours" });
      }

      const modeLog = await storage.setTradeLineMode(csId, newMode, "admin", "Admin override");
      const config = await storage.getTradeLineConfig(csId);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.mode_changed",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Changed TradeLine mode to ${newMode}`,
      });

      res.json({ config, modeLog });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine mode change error:", err.message);
      res.status(500).json({ error: "Failed to change mode" });
    }
  });

  /**
   * GET /api/admin/crm/tradeline/:clientServiceId/usage
   * Returns usage rows / current period summary.
   */
  app.get("/api/admin/crm/tradeline/:clientServiceId/usage", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const usage = await storage.getTradeLineUsage(csId);
      const modeChanges = await storage.listTradeLineModeChanges(csId, 20);

      res.json({
        usage: usage ?? null,
        recentModeChanges: modeChanges,
      });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine usage error:", err.message);
      res.status(500).json({ error: "Failed to load TradeLine usage" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/install-path
   * Set website install decision (direct embed vs hosted fallback).
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/install-path", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const { accessAvailable, embedMode } = req.body;
      if (typeof accessAvailable !== "boolean") {
        return res.status(400).json({ error: "accessAvailable (boolean) is required" });
      }
      const validModes = ["direct_embed", "hosted_fallback"];
      if (!embedMode || !validModes.includes(embedMode)) {
        return res.status(400).json({ error: "embedMode must be direct_embed or hosted_fallback" });
      }

      const currentConfig = await storage.getTradeLineConfig(csId);
      const safeStage = currentConfig
        ? advanceSetupStage(currentConfig.setupStage, "configuring")
        : "configuring";

      const config = await storage.updateTradeLineConfig(csId, {
        website: {
          ...(currentConfig?.website ?? {}),
          hostedUrl: currentConfig?.website?.hostedUrl ?? "",
          domainStatus: currentConfig?.website?.domainStatus ?? "not_needed",
          accessAvailable,
          embedMode,
        },
        channels: {
          ...(currentConfig?.channels ?? {}),
          voice: currentConfig?.channels?.voice ?? false,
          websiteChat: currentConfig?.channels?.websiteChat ?? false,
          websiteVoice: currentConfig?.channels?.websiteVoice ?? false,
          sms: currentConfig?.channels?.sms ?? false,
          hostedFallback: embedMode === "hosted_fallback",
        },
        setupStage: safeStage,
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.install_path_set",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Set install path: ${embedMode} (access: ${accessAvailable})`,
      });

      res.json({ config });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine install-path error:", err.message);
      res.status(500).json({ error: "Failed to set install path" });
    }
  });

  /**
   * GET /api/admin/crm/tradeline/:clientServiceId/readiness
   * Check whether TradeLine config is ready for go-live.
   */
  app.get("/api/admin/crm/tradeline/:clientServiceId/readiness", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const config = await storage.getTradeLineConfig(csId);
      if (!config) return res.json({ ready: false, issues: ["TradeLine config not initialized"] });

      res.json(getTradeLineReadiness(config));
    } catch (err: any) {
      log.error("[admin-crm] TradeLine readiness error:", err.message);
      res.status(500).json({ error: "Failed to check readiness" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/go-live
   * Validate readiness and mark TradeLine as live.
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/go-live", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const config = await storage.getTradeLineConfig(csId);
      if (!config) return res.status(400).json({ error: "TradeLine config not initialized" });

      const readiness = getTradeLineReadiness(config);
      const pendingTaskCount = await storage.countPendingTasks(csId);
      if (pendingTaskCount > 0) {
        readiness.issues.push(`${pendingTaskCount} fulfillment task(s) still pending or in progress`);
        readiness.ready = false;
      }

      if (!readiness.ready) {
        return res.status(400).json({ error: "Not ready for go-live", issues: readiness.issues });
      }

      const updated = await storage.updateTradeLineConfig(csId, { setupStage: "live" });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.go_live",
        entity_type: "client_service",
        entity_id: csId,
        summary: "Marked TradeLine as live",
      });

      res.json({ config: updated });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine go-live error:", err.message);
      res.status(500).json({ error: "Failed to go live" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/build-assistant
   * Manually trigger assistant build + Vapi push for a TradeLine service.
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/build-assistant", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const { provisionTradeLineAssistant } = await import("../services/vapiService");
      const result = await provisionTradeLineAssistant(csId);

      if (result.error) {
        return res.status(422).json({
          error: result.error,
          skipped: false,
          assistantId: null,
        });
      }

      res.json({
        assistantId: result.assistantId,
        skipped: result.skipped,
        skipReason: result.skipReason,
        templateId: result.definition?.templateId,
        inputHash: result.definition?.inputHash,
      });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine build-assistant error:", err.message);
      res.status(500).json({ error: err.message || "Failed to build assistant" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/disable
   * Emergency disable — immediately kills the assistant.
   * Sets assistant.status = "disabled", mode = "after_hours", and deactivates via Vapi API.
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/disable", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const config = await storage.getTradeLineConfig(csId);
      if (!config) {
        return res.status(404).json({ error: "TradeLine config not found" });
      }

      // 1. Set assistant status to disabled and mode to after_hours (safest fallback)
      await storage.updateTradeLineConfig(csId, {
        assistant: { ...config.assistant, status: "disabled" as any },
        currentMode: "after_hours",
      });
      // Log mode change with kill switch reason
      await storage.setTradeLineMode(csId, "after_hours", "system", "Emergency disable by admin");

      // 2. Attempt to deactivate the Vapi assistant via API
      let vapiResult: string = "no_vapi_id";
      const vapiAssistantId = config.assistant?.vapiAssistantId;
      if (vapiAssistantId) {
        try {
          const { getVapiConfig } = await import("../services/vapiService");
          const vapiConfig = getVapiConfig();
          if (vapiConfig.apiKey) {
            const resp = await fetch(`https://api.vapi.ai/assistant/${vapiAssistantId}`, {
              method: "PATCH",
              headers: {
                "Authorization": `Bearer ${vapiConfig.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                firstMessage: "We're sorry, this service is temporarily unavailable. Please try again later or contact the business directly.",
                model: { provider: "custom-llm", url: "_disabled_", messages: [{ role: "system", content: "This assistant has been disabled. Respond only with: This service is temporarily unavailable." }] },
              }),
            });
            vapiResult = resp.ok ? "disabled_via_api" : `api_error_${resp.status}`;
          }
        } catch (err) {
          vapiResult = `api_unreachable: ${(err as Error).message}`;
          log.error("[admin-crm] Failed to disable assistant via Vapi API", { error: (err as Error).message });
        }
      }

      // 3. Log activity
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.emergency_disabled",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Emergency disabled TradeLine assistant (Vapi: ${vapiResult})`,
      });

      const updatedConfig = await storage.getTradeLineConfig(csId);
      res.json({ disabled: true, vapiResult, config: updatedConfig });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine disable error:", { error: err.message });
      res.status(500).json({ error: "Failed to disable assistant" });
    }
  });

  /**
   * POST /api/admin/crm/tradeline/:clientServiceId/enable
   * Re-enable a previously disabled assistant by triggering a full rebuild.
   */
  app.post("/api/admin/crm/tradeline/:clientServiceId/enable", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.clientServiceId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const config = await storage.getTradeLineConfig(csId);
      if (!config) {
        return res.status(404).json({ error: "TradeLine config not found" });
      }

      // 1. Reset assistant status and mode
      await storage.updateTradeLineConfig(csId, {
        assistant: { ...config.assistant, status: "not_built" as any },
        currentMode: "available",
      });

      // 2. Trigger full rebuild
      const { provisionTradeLineAssistant } = await import("../services/vapiService");
      const result = await provisionTradeLineAssistant(csId);

      // 3. Log activity
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "tradeline.re_enabled",
        entity_type: "client_service",
        entity_id: csId,
        summary: `Re-enabled TradeLine assistant${result.assistantId ? ` (Vapi: ${result.assistantId})` : ""}`,
      });

      const updatedConfig = await storage.getTradeLineConfig(csId);
      res.json({
        enabled: true,
        assistantId: result.assistantId,
        error: result.error ?? null,
        config: updatedConfig,
      });
    } catch (err: any) {
      log.error("[admin-crm] TradeLine enable error:", { error: err.message });
      res.status(500).json({ error: "Failed to re-enable assistant" });
    }
  });

  const REVIEW_TERMINAL_STATUSES = [
    "completed", "stopped", "failed",
    "routed_positive", "routed_negative", "feedback_captured",
  ];

  /**
   * GET /api/admin/crm/review-requests
   * List with filters: status, clientId, triggerSource, hasFeedback, dueForFollowup
   */
  app.get("/api/admin/crm/review-requests", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const status = req.query.status as string | undefined;
      const triggerSource = req.query.triggerSource as string | undefined;
      const hasFeedback = req.query.hasFeedback === "true" ? true : req.query.hasFeedback === "false" ? false : undefined;
      const dueForFollowup = req.query.dueForFollowup === "true" ? true : undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const filterOpts = { clientId, status, triggerSource, hasFeedback, dueForFollowup };
      const [data, total] = await Promise.all([
        storage.listReviewRequests({ ...filterOpts, limit, offset }),
        storage.countReviewRequests(filterOpts),
      ]);
      res.json({ data, total });
    } catch (err: any) {
      log.error("[admin-crm] List review requests error:", err.message);
      res.status(500).json({ error: "Failed to list review requests" });
    }
  });

  /**
   * GET /api/admin/crm/review-requests/stats
   * Operational summary: counts by status + due for followup.
   */
  app.get("/api/admin/crm/review-requests/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getReviewRequestStats();
      res.json(stats);
    } catch (err: any) {
      log.error("[admin-crm] Review request stats error:", err.message);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  /**
   * GET /api/admin/crm/review-requests/:id
   * Single review request detail.
   */
  app.get("/api/admin/crm/review-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });
      res.json(rr);
    } catch (err: any) {
      log.error("[admin-crm] Get review request error:", err.message);
      res.status(500).json({ error: "Failed to get review request" });
    }
  });

  /**
   * POST /api/admin/crm/review-requests
   * Create a manual review request + send immediately.
   */
  app.post("/api/admin/crm/review-requests", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { client_id, customer_name, customer_email, customer_phone, channel, job_label } = req.body;
      if (!client_id || !customer_name) {
        return res.status(400).json({ error: "client_id and customer_name are required" });
      }

      const { createManualReviewRequest, processReviewRequest } = await import("../services/reviewRequestService");
      const result = await createManualReviewRequest({
        clientId: client_id,
        customerName: customer_name,
        customerEmail: customer_email,
        customerPhone: customer_phone,
        channel,
        jobLabel: job_label,
      });

      if (!result.created) {
        return res.status(409).json({ error: result.reason });
      }

      // Send immediately
      if (result.reviewRequest) {
        processReviewRequest(result.reviewRequest).catch((err: any) => {
          log.error("[admin-crm] Review request send error:", err.message);
        });
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.created",
        entity_type: "review_request",
        entity_id: result.reviewRequest?.id ?? null,
        summary: `Manual review request for "${customer_name}" (client ${client_id})`,
      });

      res.status(201).json({ created: true, id: result.reviewRequest?.id });
    } catch (err: any) {
      log.error("[admin-crm] Create review request error:", err.message);
      res.status(500).json({ error: "Failed to create review request" });
    }
  });

  /**
   * POST /api/admin/crm/review-requests/:id/stop
   * Stop a review request and cancel all pending follow-ups.
   * Only allowed if not already in a terminal state.
   */
  app.post("/api/admin/crm/review-requests/:id/stop", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      if (REVIEW_TERMINAL_STATUSES.includes(rr.status)) {
        return res.status(400).json({ error: `Cannot stop — already in terminal status: ${rr.status}` });
      }

      const updated = await storage.updateReviewRequest(id, {
        status: "stopped",
        next_followup_at: null,
        completed_at: new Date(),
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.stopped",
        entity_type: "review_request",
        entity_id: id,
        summary: `Stopped review request #${id} (was: ${rr.status}, step ${rr.sequence_step})`,
      });

      res.json(updated);
    } catch (err: any) {
      log.error("[admin-crm] Stop review request error:", err.message);
      res.status(500).json({ error: "Failed to stop review request" });
    }
  });

  /**
   * POST /api/admin/crm/review-requests/:id/resend
   * Re-send the initial review request email.
   * Only allowed if the request is in a failed or stopped state.
   * Resets to sent status and schedules next follow-up.
   */
  app.post("/api/admin/crm/review-requests/:id/resend", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      // Only allow resend from failed or stopped
      if (!["failed", "stopped"].includes(rr.status)) {
        return res.status(400).json({ error: `Cannot resend — status is "${rr.status}". Only failed or stopped requests can be resent.` });
      }

      // Reset to pending so processReviewRequest can handle it
      await storage.updateReviewRequest(id, {
        status: "pending",
        run_at: new Date(),
        attempts: 0,
        last_error: null,
        sequence_step: 0,
        next_followup_at: null,
        completed_at: null,
      });

      const refreshed = await storage.getReviewRequestById(id);
      if (refreshed) {
        const { processReviewRequest } = await import("../services/reviewRequestService");
        processReviewRequest(refreshed).catch((err: any) => {
          log.error("[admin-crm] Review resend error:", err.message);
        });
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.resent",
        entity_type: "review_request",
        entity_id: id,
        summary: `Resent review request #${id} (was: ${rr.status})`,
      });

      res.json({ ok: true, id });
    } catch (err: any) {
      log.error("[admin-crm] Resend review request error:", err.message);
      res.status(500).json({ error: "Failed to resend review request" });
    }
  });

  /**
   * POST /api/admin/crm/review-requests/:id/nudge
   * Manually trigger the next follow-up step immediately.
   * Only works if the request is in 'sent' status with sequence_step < 2.
   */
  app.post("/api/admin/crm/review-requests/:id/nudge", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      if (rr.status !== "sent") {
        return res.status(400).json({ error: `Cannot nudge — status is "${rr.status}". Only sent requests can be nudged.` });
      }

      if (rr.sequence_step >= 2) {
        return res.status(400).json({ error: "Sequence already complete (step 2 reached). Cannot nudge further." });
      }

      // Set next_followup_at to now so the worker picks it up immediately
      await storage.updateReviewRequest(id, {
        next_followup_at: new Date(),
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.nudged",
        entity_type: "review_request",
        entity_id: id,
        summary: `Nudged review request #${id} to send step ${rr.sequence_step + 1} immediately`,
      });

      res.json({ ok: true, id, nextStep: rr.sequence_step + 1 });
    } catch (err: any) {
      log.error("[admin-crm] Nudge review request error:", err.message);
      res.status(500).json({ error: "Failed to nudge review request" });
    }
  });

  /**
   * PATCH /api/admin/crm/review-requests/:id
   * Generic update — guarded against unsafe transitions.
   */
  app.patch("/api/admin/crm/review-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });

      // Guard: don't allow status changes via raw PATCH — use action endpoints instead
      if (req.body.status) {
        return res.status(400).json({ error: "Use /stop, /resend, or /nudge endpoints to change status" });
      }

      // Allow updating safe fields only
      const safeFields = ["customer_name", "customer_email", "customer_phone", "channel", "google_place_id", "review_url"];
      const updates: Record<string, any> = {};
      for (const key of safeFields) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updated = await storage.updateReviewRequest(id, updates);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.updated",
        entity_type: "review_request",
        entity_id: id,
        summary: `Updated review request #${id} fields: ${Object.keys(updates).join(", ")}`,
        metadata: { fields: Object.keys(updates) },
      });

      res.json(updated);
    } catch (err: any) {
      log.error("[admin-crm] Update review request error:", err.message);
      res.status(500).json({ error: "Failed to update review request" });
    }
  });

  // ═══════════════════════════════════════════════
  // Monitored Reviews
  // ═══════════════════════════════════════════════

  /**
   * GET /api/admin/crm/monitored-reviews
   * List public reviews with filters.
   */
  app.get("/api/admin/crm/monitored-reviews", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const platform = req.query.platform as string | undefined;
      const isNew = req.query.isNew === "true" ? true : req.query.isNew === "false" ? false : undefined;
      const minRating = req.query.minRating ? parseInt(req.query.minRating as string) : undefined;
      const maxRating = req.query.maxRating ? parseInt(req.query.maxRating as string) : undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const [data, total] = await Promise.all([
        storage.listMonitoredReviews({ clientId, platform, isNew, minRating, maxRating, limit, offset }),
        storage.countMonitoredReviews({ clientId, isNew }),
      ]);

      // Enrich with client business_name for admin use
      const clientIds = [...new Set(data.map((r: any) => r.client_id).filter(Boolean))];
      const clientMap = new Map<number, string>();
      for (const cid of clientIds) {
        const c = await storage.getClientById(cid);
        if (c) clientMap.set(cid, c.business_name);
      }
      const enriched = data.map((r: any) => ({
        ...r,
        business_name: r.client_id ? clientMap.get(r.client_id) || null : null,
      }));

      res.json({ data: enriched, total });
    } catch (err: any) {
      log.error("[admin-crm] List monitored reviews error:", err.message);
      res.status(500).json({ error: "Failed to list monitored reviews" });
    }
  });

  /**
   * GET /api/admin/crm/monitored-reviews/stats
   * Review monitoring summary: counts, average rating, distribution.
   */
  app.get("/api/admin/crm/monitored-reviews/stats", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const stats = await storage.getMonitoredReviewStats(clientId);
      res.json(stats);
    } catch (err: any) {
      log.error("[admin-crm] Monitored review stats error:", err.message);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/acknowledge
   * Mark reviews as acknowledged (is_new = false).
   */
  app.post("/api/admin/crm/monitored-reviews/acknowledge", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await storage.markMonitoredReviewsAcknowledged(ids);
      res.json({ ok: true, acknowledged: ids.length });
    } catch (err: any) {
      log.error("[admin-crm] Acknowledge reviews error:", err.message);
      res.status(500).json({ error: "Failed to acknowledge reviews" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/sync
   * Trigger an immediate review sync for a specific client.
   */
  app.post("/api/admin/crm/monitored-reviews/sync", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { client_id } = req.body;
      if (!client_id) return res.status(400).json({ error: "client_id is required" });

      const client = await storage.getClientById(client_id);
      if (!client) return res.status(404).json({ error: "Client not found" });
      if (!client.google_place_id) {
        return res.status(400).json({ error: "Client has no google_place_id configured" });
      }

      // Fire sync in background
      const { processReviewMonitoring } = await import("../jobs/reviewMonitorWorker");
      // We can't easily sync a single client through the batch function,
      // so we update the sync timestamp to null to make it highest priority, then run
      await storage.updateClient(client_id, { last_review_sync_at: null as any });

      processReviewMonitoring().catch((err: any) => {
        log.error("[admin-crm] Manual review sync error:", err.message);
      });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_monitoring.manual_sync",
        entity_type: "client",
        entity_id: client_id,
        summary: `Triggered manual review sync for ${client.business_name}`,
      });

      res.json({ ok: true, message: "Sync triggered" });
    } catch (err: any) {
      log.error("[admin-crm] Manual review sync error:", err.message);
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/:id/draft-response
   * Generate an AI draft response for a review.
   * Stores the draft on the review record for later editing/use.
   */
  app.post("/api/admin/crm/monitored-reviews/:id/draft-response", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      // Load client context for business name + trade
      const client = review.client_id ? (await storage.getClientById(review.client_id)) ?? null : null;

      // Feature gating: check if client's plan includes AI drafts
      if (review.client_id) {
        const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");
        const svc = await storage.getClientReputationService(review.client_id);
        const tier = svc ? extractTier(svc.serviceId) : null;
        if (!canAccessFeature(tier, "aiDrafts")) {
          return res.status(403).json({ error: "AI response drafts require the Pro plan or higher", upgrade: true });
        }
      }

      const { generateReviewDraft } = await import("../services/reviewDraftService");
      const toneOverride = req.body?.tone as string | undefined;
      const validTones = ["positive", "negative", "neutral"];
      const tone = toneOverride && validTones.includes(toneOverride) ? toneOverride as any : undefined;
      const result = await generateReviewDraft(review, client, tone);

      // Determine approval treatment. 5★ + non-escalated drafts skip the
      // approval gate (auto_approved); everything else requires human OK
      // before publish. Mirrors the reviewCore auto-reply eligibility policy
      // so admin and ingestion paths agree.
      const isAutoApprovable = review.rating === 5 && result.tone === "positive";

      // Persist the draft
      await storage.updateMonitoredReview(review.id, {
        draft_response: result.draft,
        draft_generated_at: new Date(),
        draft_model: result.model,
        approval_status: isAutoApprovable ? "auto_approved" : "unreviewed",
        requires_approval: !isAutoApprovable,
      });

      // Audit: AI-generated text logged as edit kind for the history panel.
      await storage.appendReviewResponseEdit({
        monitored_review_id: review.id,
        edited_by: null,
        edit_kind: "ai_generated",
        old_text: null,
        new_text: result.draft,
        reason: `model=${result.model} tone=${result.tone}`,
        metadata: { auto_approved: isAutoApprovable },
      }).catch(() => { /* audit best-effort */ });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review.draft_generated",
        entity_type: "monitored_review",
        entity_id: id,
        summary: `AI draft response generated for ${review.rating}★ review by ${review.reviewer_name}`,
        metadata: {
          tone: result.tone,
          model: result.model,
          generated: result.generated,
          auto_approved: isAutoApprovable,
          error: result.error || null,
        },
      });

      res.json({
        draft: result.draft,
        tone: result.tone,
        model: result.model,
        generated: result.generated,
        error: result.error || null,
      });
    } catch (err: any) {
      log.error("[admin-crm] Draft response error:", err.message);
      res.status(500).json({ error: "Failed to generate draft response" });
    }
  });

  /**
   * PATCH /api/admin/crm/monitored-reviews/:id/draft-response
   * Save an admin-edited draft response.
   */
  app.patch("/api/admin/crm/monitored-reviews/:id/draft-response", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const { draft_response } = req.body;
      if (typeof draft_response !== "string") {
        return res.status(400).json({ error: "draft_response string is required" });
      }

      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      const newText = draft_response.trim().slice(0, 2000);
      const oldText = review.draft_response ?? null;

      await storage.updateMonitoredReview(review.id, {
        draft_response: newText,
        // A human edit invalidates any prior approval — they're changing the
        // content. Resets to unreviewed so the approval gate fires again.
        approval_status: "unreviewed",
        approved_by: null,
        approved_at: null,
      });

      // Append to the edit history.
      await storage.appendReviewResponseEdit({
        monitored_review_id: review.id,
        edited_by: (req.user as any)?.id ?? null,
        edit_kind: "human_edit",
        old_text: oldText,
        new_text: newText,
      }).catch(() => { /* audit best-effort */ });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("[admin-crm] Save draft error:", err.message);
      res.status(500).json({ error: "Failed to save draft" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/:id/approve
   * Mark a draft response as approved for posting. Optionally publish
   * immediately by passing `publish: true` (admin must still satisfy the
   * Google-connection + google_review_name preconditions in post-to-google).
   */
  app.post("/api/admin/crm/monitored-reviews/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });
      if (!review.draft_response) {
        return res.status(400).json({ error: "No draft to approve — generate one first" });
      }

      const actorId = (req.user as any)?.id ?? null;
      await storage.updateMonitoredReview(review.id, {
        approval_status: "approved",
        approved_by: actorId,
        approved_at: new Date(),
        approval_notes: req.body?.notes ?? null,
      });

      await storage.appendReviewResponseEdit({
        monitored_review_id: review.id,
        edited_by: actorId,
        edit_kind: "approval",
        old_text: null,
        new_text: review.draft_response,
        reason: req.body?.notes ?? null,
      }).catch(() => { /* audit best-effort */ });

      res.json({ ok: true, approval_status: "approved" });
    } catch (err: any) {
      log.error("[admin-crm] Approve draft error:", err.message);
      res.status(500).json({ error: "Failed to approve draft" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/:id/reject
   * Mark a draft response as rejected — won't be posted. Requires a reason.
   */
  app.post("/api/admin/crm/monitored-reviews/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const reason = (req.body?.reason || "").toString().trim();
      if (!reason) return res.status(400).json({ error: "reason is required when rejecting" });

      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      const actorId = (req.user as any)?.id ?? null;
      await storage.updateMonitoredReview(review.id, {
        approval_status: "rejected",
        approved_by: actorId,
        approved_at: new Date(),
        approval_notes: reason,
      });

      await storage.appendReviewResponseEdit({
        monitored_review_id: review.id,
        edited_by: actorId,
        edit_kind: "rejection",
        old_text: review.draft_response ?? null,
        new_text: null,
        reason,
      }).catch(() => { /* audit best-effort */ });

      res.json({ ok: true, approval_status: "rejected" });
    } catch (err: any) {
      log.error("[admin-crm] Reject draft error:", err.message);
      res.status(500).json({ error: "Failed to reject draft" });
    }
  });

  /**
   * GET /api/admin/crm/monitored-reviews/:id/edit-history
   * Audit trail of every change to this draft: AI generation, human edits,
   * approvals/rejections, publishes. Drives the "history" panel in the admin UI.
   */
  app.get("/api/admin/crm/monitored-reviews/:id/edit-history", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const edits = await storage.listReviewResponseEdits(id);
      res.json({ edits });
    } catch (err: any) {
      log.error("[admin-crm] Edit history error:", err.message);
      res.status(500).json({ error: "Failed to load edit history" });
    }
  });

  // ═══════════════════════════════════════════════
  // ReputationShield Config (Admin)
  // ═══════════════════════════════════════════════

  /**
   * GET /api/admin/crm/clients/:id/reputation-config
   * View a client's ReputationShield tier, features, and settings.
   */
  app.get("/api/admin/crm/clients/:id/reputation-config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const { extractTier, mergeSettings, TIER_FEATURES, TIER_LABELS } = await import("@shared/reputationConfig");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.json({ active: false, tier: null, features: {}, settings: null, serviceId: null });
      }

      const tier = extractTier(svc.serviceId);
      const settings = mergeSettings(svc.metadata?.reputation_settings);
      const features = tier ? TIER_FEATURES[tier] : {};

      res.json({
        active: true,
        tier,
        tierLabel: tier ? TIER_LABELS[tier] : null,
        serviceId: svc.serviceId,
        status: svc.status,
        features,
        settings,
        metadata: svc.metadata,
      });
    } catch (err: any) {
      log.error("[admin-crm] Reputation config error:", err.message);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * PATCH /api/admin/crm/clients/:id/reputation-config
   * Update a client's ReputationShield settings (admin override).
   */
  app.patch("/api/admin/crm/clients/:id/reputation-config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const { mergeSettings } = await import("@shared/reputationConfig");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.status(404).json({ error: "No ReputationShield service found for this client" });
      }

      const current = svc.metadata?.reputation_settings ?? {};
      const updated = mergeSettings({ ...current, ...req.body });
      const metadata = { ...svc.metadata, reputation_settings: updated };

      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "reputation.settings_updated",
        entity_type: "client",
        entity_id: clientId,
        summary: `Updated ReputationShield settings for client #${clientId}`,
        metadata: { fields: Object.keys(req.body) },
      });

      res.json({ ok: true, settings: updated });
    } catch (err: any) {
      log.error("[admin-crm] Reputation config update error:", err.message);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  // ═══════════════════════════════════════════════
  // Google Business Connection + Review Posting
  // ═══════════════════════════════════════════════

  /**
   * GET /api/admin/crm/google/connect?clientId=X
   * Initiates Google OAuth flow for a client.
   */
  app.get("/api/admin/crm/google/connect", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.query.clientId as string);
      if (!clientId) return res.status(400).json({ error: "clientId required" });

      const { isGoogleOAuthConfigured, getGoogleAuthUrl } = await import("../services/googleBusinessService");
      if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ error: "Google OAuth is not configured on this server" });
      }

      const state = JSON.stringify({ clientId, adminId: (req.user as any)?.id });
      const authUrl = getGoogleAuthUrl(state);
      res.json({ authUrl });
    } catch (err: any) {
      log.error("[admin-crm] Google connect error:", err.message);
      res.status(500).json({ error: "Failed to initiate Google connection" });
    }
  });

  /**
   * GET /api/admin/crm/google/callback?code=...&state=...
   * Google OAuth callback — exchanges code for tokens.
   */
  app.get("/api/admin/crm/google/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const stateStr = req.query.state as string;
      if (!code || !stateStr) return res.status(400).send("Missing code or state");

      // Verify HMAC-signed state
      const { verifyOAuthState } = await import("../services/googleBusinessService");
      const rawPayload = verifyOAuthState(stateStr);
      if (!rawPayload) {
        log.warn("Google callback: OAuth state HMAC verification failed");
        return res.status(400).send("Invalid or tampered state parameter");
      }

      let state: { clientId: number; adminId?: number; source?: string };
      try { state = JSON.parse(rawPayload); } catch { return res.status(400).send("Invalid state"); }

      const { handleGoogleCallback } = await import("../services/googleBusinessService");
      const result = await handleGoogleCallback(code, state.clientId);

      const actorType = state.source === "portal" ? "client" : "human";
      if (result.ok) {
        await storage.logAdminActivity({
          actor_type: actorType,
          actor_id: state.adminId ?? null,
          actor_name: null,
          action: "google.connected",
          entity_type: "client",
          entity_id: state.clientId,
          summary: `Google Business Profile connected for client #${state.clientId} (via ${state.source || "admin"})`,
        });

        if (state.source === "portal") {
          res.redirect("/portal/reviews?google_connected=true");
        } else {
          res.redirect(`/admin/crm/clients/${state.clientId}?google_connected=true`);
        }
      } else {
        const errorParam = encodeURIComponent(result.error || "Unknown error");
        if (state.source === "portal") {
          res.redirect(`/portal/reviews?google_error=${errorParam}`);
        } else {
          res.redirect(`/admin/crm/clients/${state.clientId}?google_error=${errorParam}`);
        }
      }
    } catch (err: any) {
      log.error("[admin-crm] Google callback error:", err.message);
      res.status(500).send("Google connection failed");
    }
  });

  /**
   * GET /api/admin/crm/clients/:id/google-status
   * Check if a client has a Google Business connection.
   */
  /**
   * GET /api/admin/crm/clients/:id/google-status
   * Detailed Google Business connection status.
   */
  app.get("/api/admin/crm/clients/:id/google-status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const { isGoogleOAuthConfigured } = await import("../services/googleBusinessService");
      const { decryptGoogleCredentials } = await import("../lib/tokenEncryption");
      const client = await storage.getClientById(clientId);
      const rawCreds = client?.google_credentials as Record<string, unknown> | null;
      const creds = rawCreds ? decryptGoogleCredentials(rawCreds) as any : null;
      const connected = !!(creds?.refresh_token || creds?.access_token);

      res.json({
        oauthConfigured: isGoogleOAuthConfigured(),
        connected,
        connectedAt: creds?.connected_at || null,
        hasRefreshToken: !!creds?.refresh_token,
        tokenExpiry: creds?.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/admin/crm/clients/:id/google-disconnect
   * Disconnect Google Business for a client. Clears stored credentials.
   */
  app.post("/api/admin/crm/clients/:id/google-disconnect", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);

      // Revoke token on Google's side before clearing credentials
      const { revokeGoogleTokens } = await import("../services/googleBusinessService");
      await revokeGoogleTokens(clientId);

      await storage.updateClient(clientId, { google_credentials: null } as any);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "google.disconnected",
        entity_type: "client",
        entity_id: clientId,
        summary: `Google Business Profile disconnected for client #${clientId}`,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("[admin-crm] Google disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  /**
   * GET /api/admin/crm/monitored-reviews/:id/post-eligibility
   * Check if a review can be posted to Google (for UI gating).
   */
  app.get("/api/admin/crm/monitored-reviews/:id/post-eligibility", requireAdmin, async (req: Request, res: Response) => {
    try {
      const reviewId = parseInt(String(req.params.id) as string);
      const review = await storage.getMonitoredReviewById(reviewId);
      if (!review) return res.status(404).json({ error: "Not found" });

      const issues: string[] = [];
      if (review.platform !== "google") issues.push("Only Google reviews can be posted to");
      if (!review.google_review_name) issues.push("Missing Google review identifier (review may predate posting support)");
      if (review.response_text) issues.push("Response already exists");
      if (!review.client_id) issues.push("No associated client");

      let googleConnected = false;
      if (review.client_id && issues.length === 0) {
        const { hasGoogleConnection } = await import("../services/googleBusinessService");
        googleConnected = await hasGoogleConnection(review.client_id);
        if (!googleConnected) issues.push("Google Business not connected for this client");
      }

      res.json({
        eligible: issues.length === 0,
        issues,
        googleConnected,
        hasReviewName: !!review.google_review_name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/:id/post-to-google
   * Post a draft response to Google for a monitored review.
   */
  app.post("/api/admin/crm/monitored-reviews/:id/post-to-google", requireAdmin, async (req: Request, res: Response) => {
    try {
      const reviewId = parseInt(String(req.params.id) as string);
      const review = await storage.getMonitoredReviewById(reviewId);
      if (!review) return res.status(404).json({ error: "Review not found" });

      // Must be a Google review
      if (review.platform !== "google") {
        return res.status(400).json({ error: "Only Google reviews can be posted to. This is a " + review.platform + " review." });
      }

      // Must have a client
      if (!review.client_id) {
        return res.status(400).json({ error: "Review has no associated client" });
      }

      // Feature gating: posting requires Scale/Premium tier
      const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");
      const svc = await storage.getClientReputationService(review.client_id);
      const tier = svc ? extractTier(svc.serviceId) : null;
      // For now, posting is available to all tiers with Google connection (can be gated later)

      // Get the response text
      const responseText = (req.body.response_text || review.draft_response || "").trim();
      if (!responseText || responseText.length < 5) {
        return res.status(400).json({ error: "Response text is required (minimum 5 characters)" });
      }

      // Need Google review name for posting
      if (!review.google_review_name) {
        return res.status(400).json({
          error: "This review does not have a Google API identifier. It may have been collected before posting support was added, or the identifier was not available from the review source.",
          code: "NO_REVIEW_NAME",
        });
      }

      // Approval gate (Sprint 1) — refuse to post unreviewed drafts unless
      // they fall under the auto_approved policy or the operator explicitly
      // overrides via `force=true`. Without this, a misclick in the UI
      // could publish an AI draft no human has read.
      const reviewRow = review as any;
      const approvalStatus = reviewRow.approval_status ?? "unreviewed";
      const requiresApproval = reviewRow.requires_approval !== false;
      const force = req.body?.force === true;
      const isApproved = approvalStatus === "approved" || approvalStatus === "auto_approved";
      if (requiresApproval && !isApproved && !force) {
        return res.status(409).json({
          error: "This draft has not been approved. Approve it first or pass force=true to override.",
          code: "NOT_APPROVED",
          approval_status: approvalStatus,
        });
      }

      // Check Google connection
      const { hasGoogleConnection, postGoogleReviewReply } = await import("../services/googleBusinessService");
      const connected = await hasGoogleConnection(review.client_id);
      if (!connected) {
        return res.status(400).json({
          error: "Google Business Profile is not connected for this client. Connect it first via Settings.",
          code: "NOT_CONNECTED",
        });
      }

      // Post the reply
      const postResult = await postGoogleReviewReply(review.client_id, review.google_review_name, responseText);
      if (!postResult.ok) {
        const client = await storage.getClientById(review.client_id);
        const { notifyReplyPostFailure } = await import("../services/reputation/reputationAlerts");
        const retryable = /timeout|rate.?limit|5\d\d/i.test(postResult.error || "");

        // Retryable failure → enqueue for the retry worker. Operator
        // gets a 202 + queued-id so the UI can show "queued for retry"
        // instead of an outright error toast.
        if (retryable) {
          const { enqueueReplyForRetry } = await import("../jobs/replyPostQueueWorker");
          const queued = await enqueueReplyForRetry({
            monitoredReviewId: review.id,
            clientId: review.client_id,
            replyText: responseText,
            createdBy: (req.user as any)?.id ?? null,
            initialError: postResult.error,
          });
          notifyReplyPostFailure({
            clientId: review.client_id,
            businessName: client?.business_name || `Client #${review.client_id}`,
            reviewId: review.id,
            error: postResult.error || "unknown",
            retryable: true,
          }).catch(() => { /* alert is best-effort */ });
          return res.status(202).json({
            error: postResult.error,
            code: "QUEUED_FOR_RETRY",
            queueId: queued.id,
            alreadyQueued: !queued.enqueued,
          });
        }

        // Non-retryable → immediate failure, no enqueue (would just dead-letter).
        notifyReplyPostFailure({
          clientId: review.client_id,
          businessName: client?.business_name || `Client #${review.client_id}`,
          reviewId: review.id,
          error: postResult.error || "unknown",
          retryable: false,
        }).catch(() => { /* alert is best-effort */ });
        return res.status(502).json({ error: postResult.error, code: "POST_FAILED" });
      }

      // Update local record
      await storage.updateMonitoredReview(reviewId, {
        response_text: responseText,
        response_date: new Date(),
        posted_via: "reputationshield",
        posted_at: new Date(),
      });

      // Audit: record the publish in the edit history.
      await storage.appendReviewResponseEdit({
        monitored_review_id: reviewId,
        edited_by: (req.user as any)?.id ?? null,
        edit_kind: "post_published",
        old_text: review.draft_response ?? null,
        new_text: responseText,
        reason: force ? "force-override" : `approval_status=${approvalStatus}`,
      }).catch(() => { /* audit best-effort */ });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review.response_posted",
        entity_type: "monitored_review",
        entity_id: reviewId,
        summary: `Posted response to Google for ${review.rating}★ review by ${review.reviewer_name}`,
        metadata: { platform: "google", clientId: review.client_id },
      });

      res.json({ ok: true, postedAt: new Date().toISOString() });
    } catch (err: any) {
      log.error("[admin-crm] Post to Google error:", err.message);
      res.status(500).json({ error: "Failed to post response to Google" });
    }
  });

  /**
   * GET /api/admin/crm/monitored-reviews/backfill-status
   * Count of Google reviews missing google_review_name (can't post to).
   */
  app.get("/api/admin/crm/monitored-reviews/backfill-status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const missingCount = await storage.countReviewsMissingGoogleName(clientId);
      res.json({ missingGoogleName: missingCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/admin/crm/clients/:id/reputation-ops
   * Operational delivery status for a client's ReputationShield service.
   * Returns task-by-task status to power the admin delivery panel.
   */
  app.get("/api/admin/crm/clients/:id/reputation-ops", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.id) as string);
      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const { extractTier, mergeSettings, canAccessFeature } = await import("@shared/reputationConfig");
      const { hasGoogleConnection, isGoogleOAuthConfigured } = await import("../services/googleBusinessService");

      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;
      const settings = svc ? mergeSettings(svc.metadata?.reputation_settings) : null;
      const ws = settings?.widget;

      // Gather operational data
      const googleConnected = tier ? await hasGoogleConnection(clientId) : false;
      const missingGoogleName = tier ? await storage.countReviewsMissingGoogleName(clientId) : 0;

      // Review stats
      const [reviewStats] = await (await import("../db")).db.select({
        total: (await import("drizzle-orm")).sql<number>`count(*)::int`,
        noResponse: (await import("drizzle-orm")).sql<number>`count(*) filter (where ${(await import("@shared/schema")).monitoredReviews.response_text} is null and ${(await import("@shared/schema")).monitoredReviews.rating} <= 2)::int`,
      }).from((await import("@shared/schema")).monitoredReviews)
        .where((await import("drizzle-orm")).eq((await import("@shared/schema")).monitoredReviews.client_id, clientId));

      // Request stats
      const [requestStats] = await (await import("../db")).db.select({
        total: (await import("drizzle-orm")).sql<number>`count(*)::int`,
      }).from((await import("@shared/schema")).reviewRequests)
        .where((await import("drizzle-orm")).eq((await import("@shared/schema")).reviewRequests.client_id, clientId));

      res.json({
        hasService: !!svc,
        tier,
        serviceStatus: svc?.status ?? null,
        tasks: {
          googlePlaceId: { value: client.google_place_id, done: !!client.google_place_id },
          facebookPageUrl: { value: client.facebook_page_url, done: !!client.facebook_page_url },
          googleConnected: { done: googleConnected, oauthConfigured: isGoogleOAuthConfigured() },
          widgetEnabled: { done: !!ws?.enabled, type: ws?.type ?? null },
          widgetToken: { value: client.widget_token, done: !!client.widget_token },
          remindersEnabled: { done: settings?.reminders_enabled ?? false },
          reportsEnabled: { done: settings?.report_enabled ?? false },
          lowRatingAlerts: { done: settings?.low_rating_alerts ?? false },
          aiDraftsAvailable: { done: canAccessFeature(tier, "aiDrafts") },
          googlePostingAvailable: { done: googleConnected && canAccessFeature(tier, "competitorTracking") },
          channelPreference: { value: settings?.channel_preference ?? "auto" },
        },
        stats: {
          totalReviews: reviewStats?.total ?? 0,
          lowRatingNoResponse: reviewStats?.noResponse ?? 0,
          totalRequests: requestStats?.total ?? 0,
          missingGoogleName,
        },
      });
    } catch (err: any) {
      log.error("[admin-crm] reputation-ops error:", err.message);
      res.status(500).json({ error: "Failed to load operational status" });
    }
  });

  // ═══════════════════════════════════════════════
  // Bulk Review Actions
  // ═══════════════════════════════════════════════

  /**
   * POST /api/admin/crm/monitored-reviews/bulk-draft
   * Generate AI drafts for multiple reviews.
   */
  app.post("/api/admin/crm/monitored-reviews/bulk-draft", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      if (ids.length > 50) {
        return res.status(400).json({ error: "Maximum 50 reviews per batch" });
      }

      const { generateReviewDraft } = await import("../services/reviewDraftService");
      const { extractTier, canAccessFeature } = await import("@shared/reputationConfig");

      const results = { drafted: 0, skipped: 0, failed: 0, details: [] as { id: number; status: string; reason?: string }[] };

      for (const id of ids) {
        const review = await storage.getMonitoredReviewById(id);
        if (!review) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Not found" }); continue; }
        if (review.response_text) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Already has response" }); continue; }
        if (!review.review_text || review.review_text.length < 5) { results.skipped++; results.details.push({ id, status: "skipped", reason: "No review text" }); continue; }

        // Check tier gating
        if (review.client_id) {
          const svc = await storage.getClientReputationService(review.client_id);
          const tier = svc ? extractTier(svc.serviceId) : null;
          if (!canAccessFeature(tier, "aiDrafts")) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Tier lacks AI drafts" }); continue; }
        }

        try {
          const client = review.client_id ? (await storage.getClientById(review.client_id)) ?? null : null;
          const result = await generateReviewDraft(review, client);
          await storage.updateMonitoredReview(id, {
            draft_response: result.draft,
            draft_generated_at: new Date(),
            draft_model: result.model,
          });
          results.drafted++;
          results.details.push({ id, status: "drafted" });
        } catch (err: any) {
          results.failed++;
          results.details.push({ id, status: "failed", reason: err.message });
        }
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review.bulk_draft",
        entity_type: "monitored_review",
        entity_id: null,
        summary: `Bulk drafted ${results.drafted} reviews (${results.skipped} skipped, ${results.failed} failed)`,
        metadata: { total: ids.length, ...results },
      });

      res.json(results);
    } catch (err: any) {
      log.error("[admin-crm] Bulk draft error:", err.message);
      res.status(500).json({ error: "Bulk draft failed" });
    }
  });

  /**
   * POST /api/admin/crm/monitored-reviews/bulk-post
   * Post draft responses to Google for multiple reviews.
   */
  app.post("/api/admin/crm/monitored-reviews/bulk-post", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      if (ids.length > 25) {
        return res.status(400).json({ error: "Maximum 25 reviews per bulk post" });
      }

      const { postGoogleReviewReply, hasGoogleConnection } = await import("../services/googleBusinessService");

      const results = { posted: 0, skipped: 0, failed: 0, details: [] as { id: number; status: string; reason?: string }[] };

      // Pre-check: cache Google connection status per client
      const connectionCache = new Map<number, boolean>();

      for (const id of ids) {
        const review = await storage.getMonitoredReviewById(id);
        if (!review) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Not found" }); continue; }
        if (review.platform !== "google") { results.skipped++; results.details.push({ id, status: "skipped", reason: "Not a Google review" }); continue; }
        if (review.response_text) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Already has response" }); continue; }
        if (!review.google_review_name) { results.skipped++; results.details.push({ id, status: "skipped", reason: "Missing Google review ID" }); continue; }
        if (!review.draft_response || review.draft_response.trim().length < 5) { results.skipped++; results.details.push({ id, status: "skipped", reason: "No draft response" }); continue; }
        if (!review.client_id) { results.skipped++; results.details.push({ id, status: "skipped", reason: "No client" }); continue; }

        // Check Google connection (cached)
        if (!connectionCache.has(review.client_id)) {
          connectionCache.set(review.client_id, await hasGoogleConnection(review.client_id));
        }
        if (!connectionCache.get(review.client_id)) {
          results.skipped++; results.details.push({ id, status: "skipped", reason: "Google not connected" }); continue;
        }

        try {
          const postResult = await postGoogleReviewReply(review.client_id, review.google_review_name, review.draft_response.trim());
          if (postResult.ok) {
            await storage.updateMonitoredReview(id, {
              response_text: review.draft_response.trim(),
              response_date: new Date(),
              posted_via: "reputationshield",
              posted_at: new Date(),
            });
            results.posted++;
            results.details.push({ id, status: "posted" });
          } else {
            results.failed++;
            results.details.push({ id, status: "failed", reason: postResult.error });
          }
        } catch (err: any) {
          results.failed++;
          results.details.push({ id, status: "failed", reason: err.message });
        }
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review.bulk_post",
        entity_type: "monitored_review",
        entity_id: null,
        summary: `Bulk posted ${results.posted} responses to Google (${results.skipped} skipped, ${results.failed} failed)`,
        metadata: { total: ids.length, ...results },
      });

      res.json(results);
    } catch (err: any) {
      log.error("[admin-crm] Bulk post error:", err.message);
      res.status(500).json({ error: "Bulk post failed" });
    }
  });

  /**
   * GET /api/admin/crm/client-services/:id/cost-suggestion
   * Estimates monthly delivery cost for a service based on actual usage data.
   */
  app.get("/api/admin/crm/client-services/:id/cost-suggestion", requireAdmin, async (req: Request, res: Response) => {
    try {
      const serviceId = parseInt(String(req.params.id) as string);
      const { db } = await import("../db");
      const { reviewRequests, monitoredReviews, aiUsageLogs, clientServices } = await import("@shared/schema");
      const { eq, and, gte, sql } = await import("drizzle-orm");

      // Get the service to find client_id and service type
      const [svc] = await db.select().from(clientServices).where(eq(clientServices.id, serviceId)).limit(1);
      if (!svc || !svc.client_id) return res.status(404).json({ error: "Service not found" });

      const clientId = svc.client_id;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const isReputation = svc.service_id.startsWith("reputationshield");

      const costs: { label: string; estimate_cents: number; detail: string }[] = [];

      if (isReputation) {
        // SMS cost: count outbound SMS review requests in last 30 days
        const [smsStats] = await db.select({
          count: sql<number>`count(*) filter (where ${reviewRequests.channel} = 'sms' and ${reviewRequests.status} != 'pending')::int`,
        }).from(reviewRequests).where(and(
          eq(reviewRequests.client_id, clientId),
          gte(reviewRequests.created_at, thirtyDaysAgo),
        ));
        const smsCount = smsStats?.count ?? 0;
        const smsCostCents = Math.round(smsCount * 0.75); // $0.0075 per SMS = 0.75 cents
        costs.push({ label: "Twilio SMS", estimate_cents: smsCostCents, detail: `${smsCount} messages @ $0.0075` });

        // AI drafting cost: count drafts generated in last 30 days
        const [draftStats] = await db.select({
          count: sql<number>`count(*) filter (where ${monitoredReviews.draft_generated_at} >= ${thirtyDaysAgo})::int`,
        }).from(monitoredReviews).where(eq(monitoredReviews.client_id, clientId));
        const draftCount = draftStats?.count ?? 0;
        // Estimate ~500 tokens per draft (input+output), Haiku pricing
        const aiCostCents = Math.round(draftCount * 0.04); // ~$0.0004 per draft = 0.04 cents
        costs.push({ label: "AI Drafts (Claude)", estimate_cents: aiCostCents, detail: `${draftCount} drafts @ ~$0.0004` });

        // Outscraper: estimate based on monitoring frequency (4x/day sync attempts, ~$0.002 per review fetched)
        const [reviewCount] = await db.select({
          count: sql<number>`count(*)::int`,
        }).from(monitoredReviews).where(eq(monitoredReviews.client_id, clientId));
        // Roughly 4 syncs/month * 30 reviews fetched * $0.002 per review
        const outscrCostCents = Math.round(4 * 30 * 0.2); // ~$0.24/month = 24 cents
        costs.push({ label: "Outscraper (monitoring)", estimate_cents: outscrCostCents, detail: `~4 syncs/mo @ 30 reviews` });

        // Email cost (negligible)
        const [emailStats] = await db.select({
          count: sql<number>`count(*) filter (where ${reviewRequests.channel} = 'email' and ${reviewRequests.status} != 'pending')::int`,
        }).from(reviewRequests).where(and(
          eq(reviewRequests.client_id, clientId),
          gte(reviewRequests.created_at, thirtyDaysAgo),
        ));
        const emailCount = emailStats?.count ?? 0;
        if (emailCount > 0) {
          costs.push({ label: "Email (SMTP)", estimate_cents: Math.max(1, Math.round(emailCount * 0.01)), detail: `${emailCount} emails @ ~$0.0001` });
        }
      }

      const totalCents = costs.reduce((sum, c) => sum + c.estimate_cents, 0);

      res.json({
        serviceId: svc.service_id,
        clientId,
        period: "last 30 days",
        costs,
        totalEstimateCents: totalCents,
        currentCostCents: svc.cost_cents ?? 0,
      });
    } catch (err: any) {
      log.error("[admin-crm] Cost suggestion error:", err.message);
      res.status(500).json({ error: "Failed to estimate costs" });
    }
  });

  // ═══════════════════════════════════════════════
  // Fulfillment Task Deliverables
  // ═══════════════════════════════════════════════

  /**
   * GET /api/admin/crm/fulfillment/:id/deliverables
   * List deliverables attached to a fulfillment task.
   */
  app.get("/api/admin/crm/fulfillment/:id/deliverables", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task id" });

      const task = await storage.updateFulfillmentTask(id, {});
      if (!task) return res.status(404).json({ error: "Fulfillment task not found" });

      const deliverables = (task.deliverables as Deliverable[] | null) ?? [];
      res.json({ deliverables });
    } catch (err: any) {
      log.error("[admin-crm] List deliverables error:", err.message);
      res.status(500).json({ error: "Failed to list deliverables" });
    }
  });

  /**
   * POST /api/admin/crm/fulfillment/:id/deliverables
   * Upload a deliverable (base64 JSON body — no multer dependency).
   * Body: { file: "base64data...", filename: "mockup.png", label: "Design mockup v1", kind: "mockup" }
   */
  app.post("/api/admin/crm/fulfillment/:id/deliverables", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task id" });

      const { file, filename, label, kind } = req.body;
      if (!file || typeof file !== "string") {
        return res.status(400).json({ error: "file (base64 string) is required" });
      }
      if (!filename || typeof filename !== "string") {
        return res.status(400).json({ error: "filename is required" });
      }

      const buffer = Buffer.from(file, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "File is empty or invalid base64" });
      }

      // 10 MB limit
      const MAX_SIZE = 10 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) {
        return res.status(400).json({ error: "File exceeds 10 MB limit" });
      }

      const url = await saveFile(buffer, filename, "deliverables");

      // Load current task
      const task = await storage.updateFulfillmentTask(id, {});
      if (!task) return res.status(404).json({ error: "Fulfillment task not found" });

      const deliverables: Deliverable[] = (task.deliverables as Deliverable[] | null) ?? [];
      const newDeliverable: Deliverable = {
        kind: kind || "file",
        url,
        label: label || filename,
        uploaded_by: (req.user as any)?.name || (req.user as any)?.email || "admin",
        uploaded_at: new Date().toISOString(),
      };
      deliverables.push(newDeliverable);

      const updated = await storage.updateFulfillmentTask(id, { deliverables } as any);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "fulfillment.deliverable_added",
        entity_type: "fulfillment_task",
        entity_id: id,
        summary: `Added deliverable "${newDeliverable.label}" (${newDeliverable.kind}) to task #${id}`,
        metadata: { url, kind: newDeliverable.kind, size: buffer.length },
      });

      res.status(201).json(updated);
    } catch (err: any) {
      log.error("[admin-crm] Upload deliverable error:", err.message);
      res.status(500).json({ error: "Failed to upload deliverable" });
    }
  });

  /**
   * DELETE /api/admin/crm/fulfillment/:id/deliverables/:index
   * Remove a specific deliverable by array index.
   */
  app.delete("/api/admin/crm/fulfillment/:id/deliverables/:index", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id) as string);
      const index = parseInt(String(req.params.index) as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid task id" });
      if (isNaN(index) || index < 0) return res.status(400).json({ error: "Invalid deliverable index" });

      const task = await storage.updateFulfillmentTask(id, {});
      if (!task) return res.status(404).json({ error: "Fulfillment task not found" });

      const deliverables: Deliverable[] = (task.deliverables as Deliverable[] | null) ?? [];
      if (index >= deliverables.length) {
        return res.status(404).json({ error: `Deliverable index ${index} out of range (${deliverables.length} items)` });
      }

      const removed = deliverables.splice(index, 1)[0];

      // Delete the file from disk
      await deleteFile(removed.url);

      const updated = await storage.updateFulfillmentTask(id, { deliverables } as any);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "fulfillment.deliverable_removed",
        entity_type: "fulfillment_task",
        entity_id: id,
        summary: `Removed deliverable "${removed.label}" from task #${id}`,
        metadata: { url: removed.url, kind: removed.kind },
      });

      res.json(updated);
    } catch (err: any) {
      log.error("[admin-crm] Delete deliverable error:", err.message);
      res.status(500).json({ error: "Failed to delete deliverable" });
    }
  });

  /* ═══════════════════════════════════════════
     QA Queue
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/qa-queue", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const tasks = await storage.listQaQueueTasks();
      res.json(tasks);
    } catch (err: any) {
      log.error("[admin-crm] QA queue error:", err.message);
      res.status(500).json({ error: "Failed to load QA queue" });
    }
  });

  /* ═══════════════════════════════════════════
     Profit Overview
     ═══════════════════════════════════════════ */

  app.get("/api/admin/profit-overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overview = await storage.getProfitOverview();
      res.json(overview);
    } catch (err: any) {
      log.error("[admin-crm] Profit overview error:", { error: err.message });
      res.status(500).json({ error: "Failed to load profit overview" });
    }
  });

  /* ═══════════════════════════════════════════
     TradeLine — Test Call
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/tradeline/:csId/test-call", requireAdmin, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(String(req.params.csId) as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const cs = await storage.getClientServiceById(csId);
      if (!cs || !cs.service_id.startsWith("tradeline")) {
        return res.status(404).json({ error: "TradeLine service not found" });
      }

      const { runTestCall } = await import("../services/tradelineTestCall");
      const result = await runTestCall(csId);
      res.json(result);
    } catch (err: any) {
      log.error("[admin-crm] Test call error:", { error: err.message });
      res.status(500).json({ error: "Failed to run test call" });
    }
  });
}
