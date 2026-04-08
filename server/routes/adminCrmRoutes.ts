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

  app.get("/api/admin/crm/review-requests", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
      const status = req.query.status as string | undefined;
      const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const rows = await storage.listReviewRequests({ clientId, status, limit, offset });
      res.json({ data: rows });
    } catch (err: any) {
      console.error("[admin-crm] List review requests error:", err.message);
      res.status(500).json({ error: "Failed to list review requests" });
    }
  });

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

  app.patch("/api/admin/crm/review-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const updated = await storage.updateReviewRequest(id, req.body);
      if (!updated) return res.status(404).json({ error: "Review request not found" });

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "review_request.updated",
        entity_type: "review_request",
        entity_id: id,
        summary: `Updated review request #${id}`,
        metadata: { fields: Object.keys(req.body) },
      });

      res.json(updated);
    } catch (err: any) {
      console.error("[admin-crm] Update review request error:", err.message);
      res.status(500).json({ error: "Failed to update review request" });
    }
  });
}
