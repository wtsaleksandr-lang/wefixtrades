/**
 * BookFlow API routes — native booking platform.
 *
 * Public endpoints (no auth — used by the /book/:slug page):
 *   GET  /api/bookflow/:slug           — public booking page config
 *   GET  /api/bookflow/:slug/slots     — available time slots
 *   POST /api/bookflow/:slug/book      — create an appointment
 *   POST /api/bookflow/:slug/cancel    — cancel an appointment
 *
 * Client portal endpoints (requireClient):
 *   GET   /api/portal/bookflow/settings        — get my BookFlow settings
 *   PATCH /api/portal/bookflow/settings        — update settings
 *   GET   /api/portal/bookflow/appointments    — my appointments
 *   PATCH /api/portal/bookflow/appointments/:id — update appointment status
 *
 * Admin endpoints (requireAdmin):
 *   GET  /api/admin/bookflow/clients           — list all clients with BookFlow
 *   POST /api/admin/bookflow/setup/:clientId   — set up BookFlow for a client
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requireAdmin, requireClient } from "../auth";
import { clients } from "@shared/schema";
import {
  getBookFlowSettings,
  getBookFlowSettingsBySlug,
  setupBookFlow,
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  getAppointments,
  updateAppointmentStatus,
  listBookFlowClients,
  generateSlug,
} from "../services/booking/bookflowService";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("BookFlowAPI");

// ─── Validation Schemas ───

const bookAppointmentBody = z.object({
  customerName: z.string().min(1, "Name is required"),
  customerPhone: z.string().min(1, "Phone number is required"),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerAddress: z.string().optional(),
  serviceId: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  notes: z.string().optional(),
});

const cancelBody = z.object({
  appointmentId: z.number().int().positive(),
  reason: z.string().optional(),
});

const updateSettingsBody = z.object({
  business_name: z.string().optional(),
  slug: z.string().optional(),
  timezone: z.string().optional(),
  slot_duration_minutes: z.number().int().min(10).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  working_hours: z.record(z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  })).optional(),
  services: z.array(z.object({
    id: z.string(),
    name: z.string(),
    duration_minutes: z.number(),
    price_cents: z.number(),
    description: z.string().optional(),
  })).optional(),
  confirmation_message: z.string().optional(),
  auto_confirm: z.boolean().optional(),
  is_active: z.boolean().optional(),
  accent_color: z.string().optional(),
});

const updateAppointmentBody = z.object({
  status: z.enum(["confirmed", "pending", "cancelled", "completed", "no_show"]),
  cancellation_reason: z.string().optional(),
});

const adminSetupBody = z.object({
  business_name: z.string().optional(),
  slug: z.string().optional(),
  timezone: z.string().optional(),
  slot_duration_minutes: z.number().int().min(10).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  working_hours: z.record(z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  })).optional(),
  services: z.array(z.object({
    id: z.string(),
    name: z.string(),
    duration_minutes: z.number(),
    price_cents: z.number(),
    description: z.string().optional(),
  })).optional(),
  auto_confirm: z.boolean().optional(),
  accent_color: z.string().optional(),
});

/* ─── Client ID resolver ─── */

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account" });
    return null;
  }
  return clientId;
}

/* ─── Route Registration ─── */

export function registerBookFlowRoutes(app: Express): void {

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC ENDPOINTS (no auth)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/bookflow/:slug", async (req: Request, res: Response) => {
    try {
      const settings = await getBookFlowSettingsBySlug(req.params.slug);
      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }
      res.json({
        businessName: settings.business_name,
        slug: settings.slug,
        timezone: settings.timezone,
        slotDurationMinutes: settings.slot_duration_minutes,
        services: settings.services,
        confirmationMessage: settings.confirmation_message,
        autoConfirm: settings.auto_confirm,
        workingHours: settings.working_hours,
        accentColor: settings.accent_color ?? "#3B82F6",
      });
    } catch (err: any) {
      log.error("Failed to get public booking config", { error: err.message });
      res.status(500).json({ error: "Failed to load booking page" });
    }
  });

  app.get("/api/bookflow/:slug/slots", async (req: Request, res: Response) => {
    try {
      const settings = await getBookFlowSettingsBySlug(req.params.slug);
      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }
      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date query parameter required (YYYY-MM-DD)" });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (date < today) {
        return res.json({ slots: [] });
      }
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 30);
      const slots = await getAvailableSlots(settings.client_id, date, days);
      res.json({ slots, timezone: settings.timezone });
    } catch (err: any) {
      log.error("Failed to fetch slots", { error: err.message });
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/bookflow/:slug/book", async (req: Request, res: Response) => {
    try {
      const settings = await getBookFlowSettingsBySlug(req.params.slug);
      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }
      const body = bookAppointmentBody.parse(req.body);

      let serviceName: string | undefined;
      let serviceDuration: number | undefined;
      if (body.serviceId && settings.services) {
        const services = settings.services as Array<{ id: string; name: string; duration_minutes: number }>;
        const svc = services.find((s) => s.id === body.serviceId);
        if (svc) {
          serviceName = svc.name;
          serviceDuration = svc.duration_minutes;
        }
      }

      const appointment = await createAppointment(settings.client_id, {
        customerName: body.customerName,
        customerEmail: body.customerEmail || undefined,
        customerPhone: body.customerPhone,
        customerAddress: body.customerAddress,
        serviceName,
        serviceDurationMinutes: serviceDuration,
        startTime: body.startTime,
        notes: body.notes,
        source: "direct",
      });

      res.status(201).json({
        success: true,
        appointment: {
          id: appointment.id,
          status: appointment.status,
          startTime: appointment.start_time,
          endTime: appointment.end_time,
          serviceName: appointment.service_name,
        },
        confirmationMessage: settings.confirmation_message,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      if (err.message?.includes("no longer available")) {
        return res.status(409).json({ error: err.message });
      }
      log.error("Failed to create booking", { error: err.message });
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.post("/api/bookflow/:slug/cancel", async (req: Request, res: Response) => {
    try {
      const body = cancelBody.parse(req.body);
      await cancelAppointment(body.appointmentId, body.reason);
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      if (err.message === "Appointment not found") {
        return res.status(404).json({ error: err.message });
      }
      log.error("Failed to cancel appointment", { error: err.message });
      res.status(500).json({ error: "Failed to cancel appointment" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CLIENT PORTAL ENDPOINTS (requireClient)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/portal/bookflow/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const settings = await getBookFlowSettings(clientId);
      res.json({ settings });
    } catch (err: any) {
      log.error("Failed to get portal bookflow settings", { error: err.message });
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  app.patch("/api/portal/bookflow/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const body = updateSettingsBody.parse(req.body);
      const settings = await setupBookFlow(clientId, body);
      res.json({ settings });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to update portal bookflow settings", { error: err.message });
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/portal/bookflow/appointments", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const appointments = await getAppointments(clientId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ appointments });
    } catch (err: any) {
      log.error("Failed to list portal appointments", { error: err.message });
      res.status(500).json({ error: "Failed to load appointments" });
    }
  });

  app.patch("/api/portal/bookflow/appointments/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const appointmentId = parseInt(req.params.id);
      if (isNaN(appointmentId)) {
        return res.status(400).json({ error: "Invalid appointment ID" });
      }
      const body = updateAppointmentBody.parse(req.body);
      const updated = await updateAppointmentStatus(appointmentId, body.status, body.cancellation_reason);
      if (!updated) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json({ appointment: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to update appointment", { error: err.message });
      res.status(500).json({ error: "Failed to update appointment" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS (requireAdmin)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/admin/bookflow/clients", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allSettings = await listBookFlowClients();
      res.json({ clients: allSettings });
    } catch (err: any) {
      log.error("Failed to list bookflow clients", { error: err.message });
      res.status(500).json({ error: "Failed to list clients" });
    }
  });

  app.post("/api/admin/bookflow/setup/:clientId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        return res.status(400).json({ error: "Invalid client ID" });
      }
      const [client] = await db
        .select({ id: clients.id, business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const body = adminSetupBody.parse(req.body);
      if (!body.business_name) {
        body.business_name = client.business_name;
      }
      if (!body.slug && body.business_name) {
        body.slug = await generateSlug(body.business_name);
      }
      const settings = await setupBookFlow(clientId, body);

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "bookflow.setup",
        entity_type: "client",
        entity_id: clientId,
        summary: `Set up BookFlow for client ${client.business_name} (slug: ${settings.slug})`,
      });

      res.status(201).json({ settings });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to setup bookflow", { error: err.message });
      res.status(500).json({ error: "Failed to set up BookFlow" });
    }
  });
}
