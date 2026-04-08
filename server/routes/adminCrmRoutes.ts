import type { Express, Request, Response } from "express";
import { requireAdmin, hashPassword } from "../auth";
import { storage } from "../storage";
import crypto from "crypto";

export function registerAdminCrmRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Overview
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overview = await storage.getCrmOverview();
      res.json(overview);
    } catch (err: any) {
      console.error("[admin-crm] Overview error:", err.message);
      res.status(500).json({ error: "Failed to load overview" });
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
      console.error("[admin-crm] List clients error:", err.message);
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
      console.error("[admin-crm] Create client error:", err.message);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.get("/api/admin/crm/clients/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const client = await storage.getClientById(id);
      if (!client) return res.status(404).json({ error: "Client not found" });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get client" });
    }
  });

  app.patch("/api/admin/crm/clients/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
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
      const clientId = parseInt(req.params.id as string);
      const rows = await storage.listClientServices(clientId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list client services" });
    }
  });

  app.post("/api/admin/crm/clients/:id/services", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Create client service error:", err.message);
      res.status(500).json({ error: "Failed to create client service" });
    }
  });

  app.patch("/api/admin/crm/client-services/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
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

  /* ═══════════════════════════════════════════
     Fulfillment
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/fulfillment", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Create fulfillment error:", err.message);
      res.status(500).json({ error: "Failed to create fulfillment task" });
    }
  });

  app.patch("/api/admin/crm/fulfillment/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
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

      // Completion cascade: if task delivered, check if all tasks for this service are done
      let cascade;
      if (task.status === "delivered" && task.client_service_id) {
        cascade = await storage.checkAndCompleteService(task.client_service_id);
      }

      res.json({ ...task, cascade });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update fulfillment task" });
    }
  });

  /* ═══════════════════════════════════════════
     Suppliers
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/suppliers", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await storage.listSuppliers();
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list suppliers" });
    }
  });

  app.post("/api/admin/crm/suppliers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const supplier = await storage.createSupplier(req.body);
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "supplier.created",
        entity_type: "supplier",
        entity_id: supplier.id,
        summary: `Created supplier "${supplier.name}" (${supplier.type})`,
      });
      res.status(201).json(supplier);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  /* ═══════════════════════════════════════════
     Payments
     ═══════════════════════════════════════════ */

  app.get("/api/admin/crm/clients/:id/payments", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
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
      const id = parseInt(req.params.id as string);
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
      const clientId = parseInt(req.params.id as string);
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
      const id = parseInt(req.params.id as string);
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
      const clientId = parseInt(req.params.id as string);
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
      const entityType = req.query.entity_type as string | undefined;
      const entityId = req.query.entity_id ? parseInt(req.query.entity_id as string) : undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const rows = await storage.listAdminActivity({ entityType, entityId, limit });
      res.json(rows);
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
      const clientId = parseInt(req.params.id as string);
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
          status: "not_started",
          actor_type: "human",
        });
        tasks.push(task);
      }

      // 5. Update client status if needed
      if (client.status === "lead") {
        await storage.updateClient(clientId, { status: "onboarding" });
      }

      // 6. Log activity
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
      console.error("[admin-crm] Provision error:", err.message);
      res.status(500).json({ error: "Failed to provision service" });
    }
  });

  /* ═══════════════════════════════════════════
     Generate Monthly Tasks (Pattern B)
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/client-services/:id/generate-tasks", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientServiceId = parseInt(req.params.id as string);
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
          status: "not_started",
          actor_type: "human",
        });
        tasks.push(task);
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
      console.error("[admin-crm] Generate tasks error:", err.message);
      res.status(500).json({ error: "Failed to generate tasks" });
    }
  });

  /* ═══════════════════════════════════════════
     Portal Account Provisioning
     ═══════════════════════════════════════════ */

  app.post("/api/admin/crm/clients/:id/create-account", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Create account error:", err.message);
      res.status(500).json({ error: "Failed to create portal account" });
    }
  });

  // ═══════════════════════════════════════════════
  // Review Requests
  // ═══════════════════════════════════════════════

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
      console.error("[admin-crm] List review requests error:", err.message);
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
      console.error("[admin-crm] Review request stats error:", err.message);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  /**
   * GET /api/admin/crm/review-requests/:id
   * Single review request detail.
   */
  app.get("/api/admin/crm/review-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const rr = await storage.getReviewRequestById(id);
      if (!rr) return res.status(404).json({ error: "Review request not found" });
      res.json(rr);
    } catch (err: any) {
      console.error("[admin-crm] Get review request error:", err.message);
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
          console.error("[admin-crm] Review request send error:", err.message);
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
      console.error("[admin-crm] Create review request error:", err.message);
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
      const id = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Stop review request error:", err.message);
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
      const id = parseInt(req.params.id as string);
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
          console.error("[admin-crm] Review resend error:", err.message);
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
      console.error("[admin-crm] Resend review request error:", err.message);
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
      const id = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Nudge review request error:", err.message);
      res.status(500).json({ error: "Failed to nudge review request" });
    }
  });

  /**
   * PATCH /api/admin/crm/review-requests/:id
   * Generic update — guarded against unsafe transitions.
   */
  app.patch("/api/admin/crm/review-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Update review request error:", err.message);
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
      res.json({ data, total });
    } catch (err: any) {
      console.error("[admin-crm] List monitored reviews error:", err.message);
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
      console.error("[admin-crm] Monitored review stats error:", err.message);
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
      console.error("[admin-crm] Acknowledge reviews error:", err.message);
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
        console.error("[admin-crm] Manual review sync error:", err.message);
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
      console.error("[admin-crm] Manual review sync error:", err.message);
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
      const id = parseInt(req.params.id as string);
      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      // Load client context for business name + trade
      let client = null;
      if (review.client_id) {
        client = await storage.getClientById(review.client_id);
      }

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

      // Persist the draft
      await storage.updateMonitoredReview(review.id, {
        draft_response: result.draft,
        draft_generated_at: new Date(),
        draft_model: result.model,
      });

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
      console.error("[admin-crm] Draft response error:", err.message);
      res.status(500).json({ error: "Failed to generate draft response" });
    }
  });

  /**
   * PATCH /api/admin/crm/monitored-reviews/:id/draft-response
   * Save an admin-edited draft response.
   */
  app.patch("/api/admin/crm/monitored-reviews/:id/draft-response", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const { draft_response } = req.body;
      if (typeof draft_response !== "string") {
        return res.status(400).json({ error: "draft_response string is required" });
      }

      const review = await storage.getMonitoredReviewById(id);
      if (!review) return res.status(404).json({ error: "Review not found" });

      await storage.updateMonitoredReview(review.id, {
        draft_response: draft_response.trim().slice(0, 2000),
      });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[admin-crm] Save draft error:", err.message);
      res.status(500).json({ error: "Failed to save draft" });
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
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Reputation config error:", err.message);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * PATCH /api/admin/crm/clients/:id/reputation-config
   * Update a client's ReputationShield settings (admin override).
   */
  app.patch("/api/admin/crm/clients/:id/reputation-config", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Reputation config update error:", err.message);
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
      console.error("[admin-crm] Google connect error:", err.message);
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

      let state: { clientId: number; adminId?: number };
      try { state = JSON.parse(stateStr); } catch { return res.status(400).send("Invalid state"); }

      const { handleGoogleCallback } = await import("../services/googleBusinessService");
      const result = await handleGoogleCallback(code, state.clientId);

      if (result.ok) {
        await storage.logAdminActivity({
          actor_type: "human",
          actor_id: state.adminId ?? null,
          actor_name: null,
          action: "google.connected",
          entity_type: "client",
          entity_id: state.clientId,
          summary: `Google Business Profile connected for client #${state.clientId}`,
        });

        // Redirect back to admin CRM
        res.redirect(`/admin/crm/clients/${state.clientId}?google_connected=true`);
      } else {
        res.redirect(`/admin/crm/clients/${state.clientId}?google_error=${encodeURIComponent(result.error || "Unknown error")}`);
      }
    } catch (err: any) {
      console.error("[admin-crm] Google callback error:", err.message);
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
      const clientId = parseInt(req.params.id as string);
      const { isGoogleOAuthConfigured } = await import("../services/googleBusinessService");
      const client = await storage.getClientById(clientId);
      const creds = client?.google_credentials as any;
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
      const clientId = parseInt(req.params.id as string);
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
      console.error("[admin-crm] Google disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  /**
   * GET /api/admin/crm/monitored-reviews/:id/post-eligibility
   * Check if a review can be posted to Google (for UI gating).
   */
  app.get("/api/admin/crm/monitored-reviews/:id/post-eligibility", requireAdmin, async (req: Request, res: Response) => {
    try {
      const reviewId = parseInt(req.params.id as string);
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
      const reviewId = parseInt(req.params.id as string);
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
        return res.status(502).json({ error: postResult.error, code: "POST_FAILED" });
      }

      // Update local record
      await storage.updateMonitoredReview(reviewId, {
        response_text: responseText,
        response_date: new Date(),
        posted_via: "reputationshield",
        posted_at: new Date(),
      });

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
      console.error("[admin-crm] Post to Google error:", err.message);
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
}
