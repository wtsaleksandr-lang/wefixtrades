/**
 * Booking engine API routes.
 *
 * Public endpoints (no auth — called from embedded widgets):
 *   GET  /api/booking/:clientId/slots      — available time slots
 *   POST /api/booking/:clientId/create      — create a booking
 *   GET  /api/booking/:clientId/config      — booking configuration
 *
 * Admin endpoints (requireAdmin):
 *   GET    /api/admin/booking/connections           — list all calendar connections
 *   POST   /api/admin/booking/connections           — add calendar connection
 *   PATCH  /api/admin/booking/connections/:id       — update connection
 *   DELETE /api/admin/booking/connections/:id       — remove connection (soft delete)
 *   POST   /api/admin/booking/connections/:id/test  — test connection by fetching today's slots
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../auth";
import { getAvailableSlots, createBooking } from "../services/booking/bookingRouter";
import { createLogger } from "../lib/logger";

const log = createLogger("BookingAPI");

// ─── Validation Schemas ───

const createBookingBody = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  service: z.string().optional(),
  notes: z.string().optional(),
});

const createConnectionBody = z.object({
  client_id: z.number().int().positive(),
  platform: z.enum(["google_calendar", "cal_com", "calendly", "jobber", "manual"]),
  credentials: z.record(z.unknown()).optional(),
  calendar_id: z.string().optional(),
  booking_url: z.string().url().optional().or(z.literal("")),
  slot_duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  working_hours: z.record(z.object({
    start: z.string(),
    end: z.string(),
  })).optional(),
  timezone: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateConnectionBody = createConnectionBody.partial().omit({ client_id: true });

export function registerBookingApiRoutes(app: Express): void {

  // ─── Public Endpoints ───

  /**
   * GET /api/booking/:clientId/slots?date=2026-05-15&days=7
   * Returns available time slots for a client's calendar.
   */
  app.get("/api/booking/:clientId/slots", async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.clientId));
      if (isNaN(clientId)) {
        return res.status(400).json({ error: "Invalid client ID" });
      }

      const date = req.query.date as string;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date query parameter required (YYYY-MM-DD)" });
      }

      // Reject past dates
      const today = new Date().toISOString().slice(0, 10);
      if (date < today) {
        return res.json({ slots: [], message: "Cannot book past dates" });
      }

      const days = parseInt(req.query.days as string) || 7;
      const clampedDays = Math.min(Math.max(days, 1), 30);

      const result = await getAvailableSlots(clientId, date, clampedDays);

      if (result.fallbackUrl) {
        return res.json({
          slots: [],
          fallbackUrl: result.fallbackUrl,
          message: "Use the booking URL to schedule directly",
        });
      }

      // Filter to only available slots for the public response
      const availableSlots = result.slots.filter(s => s.available);

      res.json({
        slots: availableSlots,
        timezone: result.connection?.timezone || "America/New_York",
      });
    } catch (err: any) {
      log.error("Failed to fetch available slots", { error: err.message });
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  /**
   * POST /api/booking/:clientId/create
   * Creates a booking on the client's connected calendar.
   */
  app.post("/api/booking/:clientId/create", async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.clientId));
      if (isNaN(clientId)) {
        return res.status(400).json({ error: "Invalid client ID" });
      }

      const body = createBookingBody.parse(req.body);

      const result = await createBooking(clientId, {
        clientId,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone,
        startTime: body.startTime,
        endTime: body.endTime,
        service: body.service,
        notes: body.notes,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to create booking", { error: err.message });
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  /**
   * GET /api/booking/:clientId/config
   * Returns slot duration, timezone, and whether booking is enabled.
   */
  app.get("/api/booking/:clientId/config", async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(String(req.params.clientId));
      if (isNaN(clientId)) {
        return res.status(400).json({ error: "Invalid client ID" });
      }

      const connection = await storage.getCalendarConnection(clientId);

      if (!connection) {
        return res.json({
          enabled: false,
          message: "No calendar connection configured",
        });
      }

      res.json({
        enabled: true,
        platform: connection.platform,
        slotDurationMinutes: connection.slot_duration_minutes ?? 60,
        bufferMinutes: connection.buffer_minutes ?? 15,
        timezone: connection.timezone ?? "America/New_York",
        workingHours: connection.working_hours,
        hasBookingUrl: !!connection.booking_url,
      });
    } catch (err: any) {
      log.error("Failed to fetch booking config", { error: err.message });
      res.status(500).json({ error: "Failed to fetch booking configuration" });
    }
  });

  // ─── Admin Endpoints ───

  /**
   * GET /api/admin/booking/connections
   * List all calendar connections, optionally filtered by client_id.
   */
  app.get("/api/admin/booking/connections", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = req.query.client_id ? parseInt(req.query.client_id as string) : undefined;
      const connections = await storage.listCalendarConnections(clientId);
      res.json({ connections });
    } catch (err: any) {
      log.error("Failed to list calendar connections", { error: err.message });
      res.status(500).json({ error: "Failed to list connections" });
    }
  });

  /**
   * POST /api/admin/booking/connections
   * Add a new calendar connection.
   */
  app.post("/api/admin/booking/connections", requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = createConnectionBody.parse(req.body);

      const connection = await storage.createCalendarConnection({
        client_id: body.client_id,
        platform: body.platform,
        credentials: body.credentials || null,
        calendar_id: body.calendar_id || null,
        booking_url: body.booking_url || null,
        slot_duration_minutes: body.slot_duration_minutes ?? 60,
        buffer_minutes: body.buffer_minutes ?? 15,
        working_hours: body.working_hours || null,
        timezone: body.timezone || "America/New_York",
        metadata: body.metadata || null,
      });

      // Log admin activity
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "calendar_connection.created",
        entity_type: "calendar_connection",
        entity_id: connection.id,
        summary: `Created ${body.platform} calendar connection for client ${body.client_id}`,
      });

      res.status(201).json(connection);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to create calendar connection", { error: err.message });
      res.status(500).json({ error: "Failed to create connection" });
    }
  });

  /**
   * PATCH /api/admin/booking/connections/:id
   * Update a calendar connection.
   */
  app.patch("/api/admin/booking/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid connection ID" });
      }

      const body = updateConnectionBody.parse(req.body);
      const updated = await storage.updateCalendarConnection(id, body);

      if (!updated) {
        return res.status(404).json({ error: "Connection not found" });
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "calendar_connection.updated",
        entity_type: "calendar_connection",
        entity_id: id,
        summary: `Updated calendar connection ${id}`,
      });

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      log.error("Failed to update calendar connection", { error: err.message });
      res.status(500).json({ error: "Failed to update connection" });
    }
  });

  /**
   * DELETE /api/admin/booking/connections/:id
   * Soft-delete a calendar connection (sets is_active = false).
   */
  app.delete("/api/admin/booking/connections/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid connection ID" });
      }

      const deleted = await storage.deleteCalendarConnection(id);
      if (!deleted) {
        return res.status(404).json({ error: "Connection not found" });
      }

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: (req.user as any)?.id,
        actor_name: (req.user as any)?.name || (req.user as any)?.email,
        action: "calendar_connection.deleted",
        entity_type: "calendar_connection",
        entity_id: id,
        summary: `Removed calendar connection ${id} (soft delete)`,
      });

      res.json({ success: true, connection: deleted });
    } catch (err: any) {
      log.error("Failed to delete calendar connection", { error: err.message });
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });

  /**
   * POST /api/admin/booking/connections/:id/test
   * Test a connection by fetching today's available slots.
   */
  app.post("/api/admin/booking/connections/:id/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid connection ID" });
      }

      // Look up the connection directly
      const connections = await storage.listCalendarConnections();
      const connection = connections.find(c => c.id === id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      const today = new Date().toISOString().slice(0, 10);
      const result = await getAvailableSlots(connection.client_id, today, 1);

      res.json({
        success: true,
        slotsFound: result.slots.length,
        availableSlots: result.slots.filter(s => s.available).length,
        slots: result.slots,
        fallbackUrl: result.fallbackUrl,
      });
    } catch (err: any) {
      log.error("Connection test failed", { error: err.message });
      res.json({
        success: false,
        error: err.message,
      });
    }
  });
}
