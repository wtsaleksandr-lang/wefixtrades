import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { seedDemoData, resetDemoData } from "../services/demoDataGenerator";

export function registerSalesRoutes(app: Express): void {

  app.get("/api/sales/leads", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const leads = await storage.listSalesLeads(status);

      const counts: Record<string, number> = {};
      const all = await storage.listSalesLeads();
      for (const l of all) counts[l.status] = (counts[l.status] || 0) + 1;

      res.json({ leads, counts, total: all.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load leads" });
    }
  });

  app.post("/api/sales/leads", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { business_name, contact_name, email, phone, website, google_maps_url, source, notes } = req.body;
      if (!business_name) return res.status(400).json({ error: "business_name is required" });

      const lead = await storage.createSalesLead({
        business_name, contact_name, email, phone, website, google_maps_url,
        source: source || "manual", status: "new", notes,
      } as any);

      res.status(201).json(lead);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  app.patch("/api/sales/leads/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const updates: any = {};
      const allowed = ["business_name", "contact_name", "email", "phone", "website", "google_maps_url", "source", "status", "notes", "last_contacted_at"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      const lead = await storage.updateSalesLead(id, updates);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      res.json(lead);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  app.post("/api/sales/leads/:id/contacted", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const updates: any = { status: "contacted", last_contacted_at: new Date() };
      if (req.body.notes) {
        const existing = await storage.getSalesLeadById(id);
        updates.notes = existing?.notes ? `${existing.notes}\n---\n${new Date().toLocaleDateString()}: ${req.body.notes}` : `${new Date().toLocaleDateString()}: ${req.body.notes}`;
      }

      const lead = await storage.updateSalesLead(id, updates);
      res.json(lead);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // Demo data management
  app.post("/api/admin/demo/seed/:clientId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });
      const result = await seedDemoData(clientId);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed demo data" });
    }
  });

  app.post("/api/admin/demo/reset/:clientId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });
      await resetDemoData(clientId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to reset demo data" });
    }
  });
}
