import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminSuppliers");

/**
 * Strip the integration `api_key` before any supplier object is sent to the
 * client. The admin UI only needs to know whether a key is set, not its value.
 */
function maskSupplier<T extends Record<string, any>>(s: T): Omit<T, "api_key"> & { api_key_set: boolean } {
  const { api_key, ...rest } = s;
  return { ...rest, api_key_set: !!api_key };
}

export function registerAdminSupplierRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     GET /api/admin/suppliers — list all suppliers
     Optional query params: status, service
     ═══════════════════════════════════════════ */
  app.get("/api/admin/suppliers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const serviceFilter = req.query.service as string | undefined;
      let rows = await storage.listSuppliers();

      if (statusFilter) {
        rows = rows.filter((s) =>
          statusFilter === "active" ? s.is_active : !s.is_active
        );
      }
      if (serviceFilter) {
        rows = rows.filter((s) => {
          const services = (s.supported_services as string[]) || [];
          return services.some(
            (svc) => svc === serviceFilter || serviceFilter.startsWith(svc + "-"),
          );
        });
      }

      res.json(rows.map(maskSupplier));
    } catch (err: any) {
      log.error("Failed to list suppliers", { error: err.message });
      res.status(500).json({ error: "Failed to list suppliers" });
    }
  });

  /* ═══════════════════════════════════════════
     GET /api/admin/suppliers/by-service/:serviceId
     List suppliers that handle a specific service
     ═══════════════════════════════════════════ */
  app.get("/api/admin/suppliers/by-service/:serviceId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const allSuppliers = await storage.listSuppliers();
      const matching = allSuppliers.filter((s) => {
        if (!s.is_active) return false;
        const services = (s.supported_services as string[]) || [];
        return services.some(
          (svc) => serviceId === svc || serviceId.startsWith(svc + "-"),
        );
      });
      res.json(matching.map(maskSupplier));
    } catch (err: any) {
      log.error("Failed to list suppliers by service", { error: err.message });
      res.status(500).json({ error: "Failed to list suppliers by service" });
    }
  });

  /* ═══════════════════════════════════════════
     GET /api/admin/suppliers/:id — single supplier with stats
     ═══════════════════════════════════════════ */
  app.get("/api/admin/suppliers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id as string);
      if (isNaN(supplierId)) {
        res.status(400).json({ error: "Invalid supplier ID" });
        return;
      }

      const supplier = await storage.getSupplierById(supplierId);
      if (!supplier) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      // Get tasks assigned to this supplier for stats
      const tasks = await storage.getSupplierTasks(supplierId);
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t) => t.status === "delivered").length;

      // Calculate average completion time for delivered tasks
      let avgCompletionTimeHours: number | null = null;
      const deliveredWithTimes = tasks.filter(
        (t) => t.status === "delivered" && t.completed_at && t.created_at,
      );
      if (deliveredWithTimes.length > 0) {
        const totalMs = deliveredWithTimes.reduce((sum, t) => {
          const created = new Date(t.created_at!).getTime();
          const completed = new Date(t.completed_at!).getTime();
          return sum + (completed - created);
        }, 0);
        avgCompletionTimeHours = Math.round(
          totalMs / deliveredWithTimes.length / (1000 * 60 * 60),
        );
      }

      res.json({
        ...maskSupplier(supplier),
        stats: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          avg_completion_time_hours: avgCompletionTimeHours,
        },
        tasks,
      });
    } catch (err: any) {
      log.error("Failed to get supplier", { error: err.message });
      res.status(500).json({ error: "Failed to get supplier" });
    }
  });

  /* ═══════════════════════════════════════════
     POST /api/admin/suppliers — create supplier
     ═══════════════════════════════════════════ */
  app.post("/api/admin/suppliers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, contact_email } = req.body;
      if (!name || !contact_email) {
        res.status(400).json({ error: "Name and contact email are required" });
        return;
      }

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
      res.status(201).json(maskSupplier(supplier));
    } catch (err: any) {
      log.error("Failed to create supplier", { error: err.message });
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  /* ═══════════════════════════════════════════
     PATCH /api/admin/suppliers/:id — update supplier
     ═══════════════════════════════════════════ */
  app.patch("/api/admin/suppliers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id as string);
      if (isNaN(supplierId)) {
        res.status(400).json({ error: "Invalid supplier ID" });
        return;
      }

      const existing = await storage.getSupplierById(supplierId);
      if (!existing) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      // The client never receives the real api_key (masked), so a blank/absent
      // api_key on update means "unchanged" — don't overwrite the stored secret.
      const patch = { ...req.body };
      if (!patch.api_key) delete patch.api_key;

      const updated = await storage.updateSupplier(supplierId, patch);
      if (!updated) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "supplier.updated",
        entity_type: "supplier",
        entity_id: supplierId,
        summary: `Updated supplier "${existing.name}"`,
        metadata: { changes: Object.keys(patch) },
      });
      res.json(maskSupplier(updated));
    } catch (err: any) {
      log.error("Failed to update supplier", { error: err.message });
      res.status(500).json({ error: "Failed to update supplier" });
    }
  });

  /* ═══════════════════════════════════════════
     DELETE /api/admin/suppliers/:id — soft-delete (set inactive)
     ═══════════════════════════════════════════ */
  app.delete("/api/admin/suppliers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const supplierId = parseInt(req.params.id as string);
      if (isNaN(supplierId)) {
        res.status(400).json({ error: "Invalid supplier ID" });
        return;
      }

      const existing = await storage.getSupplierById(supplierId);
      if (!existing) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      const updated = await storage.updateSupplier(supplierId, {
        is_active: false,
        status: "inactive" as any,
      });
      if (!updated) {
        res.status(404).json({ error: "Supplier not found" });
        return;
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "supplier.deactivated",
        entity_type: "supplier",
        entity_id: supplierId,
        summary: `Deactivated supplier "${existing.name}"`,
      });
      res.json(maskSupplier(updated));
    } catch (err: any) {
      log.error("Failed to deactivate supplier", { error: err.message });
      res.status(500).json({ error: "Failed to deactivate supplier" });
    }
  });
}
