import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminServices");

/**
 * Allowed fields for PATCH /api/admin/services/:id
 * Everything else is stripped before updating.
 */
const ALLOWED_UPDATE_FIELDS = [
  "name",
  "description",
  "tagline",
  "default_price",
  "cost_amount",
  "cost_type",
  "billing_period",
  "is_active",
  "category",
  "delivery_pattern",
] as const;

export function registerAdminServiceRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     GET /api/admin/services — list all services with active client counts
     ═══════════════════════════════════════════ */

  app.get("/api/admin/services", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const services = await storage.listServicesWithClientCounts();
      res.json(services);
    } catch (err: any) {
      log.error("Failed to list services", { error: err.message });
      res.status(500).json({ error: "Failed to list services" });
    }
  });

  /* ═══════════════════════════════════════════
     GET /api/admin/services/:id — single service detail
     ═══════════════════════════════════════════ */

  app.get("/api/admin/services/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const service = await storage.getServiceById(id);
      if (!service) return res.status(404).json({ error: "Service not found" });
      res.json(service);
    } catch (err: any) {
      log.error("Failed to get service", { error: err.message });
      res.status(500).json({ error: "Failed to get service" });
    }
  });

  /* ═══════════════════════════════════════════
     PATCH /api/admin/services/:id — update service fields
     ═══════════════════════════════════════════ */

  app.patch("/api/admin/services/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      // Verify the service exists
      const existing = await storage.getServiceById(id);
      if (!existing) return res.status(404).json({ error: "Service not found" });

      // Filter to allowed fields only
      const updates: Record<string, any> = {};
      for (const key of ALLOWED_UPDATE_FIELDS) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      // Check if price changed when Stripe price is set
      const priceChanged = updates.default_price !== undefined
        && updates.default_price !== existing.default_price;
      const stripeWarning = priceChanged && existing.stripe_price_id
        ? "Stripe price needs manual sync — Stripe prices are immutable. Create a new price in Stripe and update stripe_price_id."
        : null;

      if (stripeWarning) {
        log.warn("Price changed for service with Stripe price", {
          serviceId: id,
          oldPrice: String(existing.default_price),
          newPrice: String(updates.default_price),
          stripePriceId: existing.stripe_price_id ?? undefined,
        });
      }

      const updated = await storage.updateServiceCatalog(id, updates);

      // Build diff summary for activity log
      const changedFields: string[] = [];
      for (const [key, val] of Object.entries(updates)) {
        const oldVal = (existing as any)[key];
        if (val !== oldVal) changedFields.push(key);
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "service_catalog.updated",
        entity_type: "service_catalog",
        entity_id: undefined,
        summary: `Updated service "${existing.name}" — fields: ${changedFields.join(", ") || "none"}`,
        metadata: {
          service_id: id,
          fields: changedFields,
          stripe_warning: stripeWarning ?? undefined,
        },
      });

      res.json({ service: updated, stripe_warning: stripeWarning });
    } catch (err: any) {
      log.error("Failed to update service", { error: err.message });
      res.status(500).json({ error: "Failed to update service" });
    }
  });
}
