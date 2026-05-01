/**
 * BookFlow Service — native booking platform for trades businesses.
 *
 * Provides slot generation, appointment creation, and settings management.
 * Bookings are stored directly in our DB — no external calendar dependency.
 */

import { db } from "../../db";
import { eq, and, gte, lte, ne, sql } from "drizzle-orm";
import {
  bookflowSettings,
  bookflowAppointments,
  type BookflowSettings,
  type BookflowAppointment,
  type InsertBookflowSettings,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { sendBookingConfirmationToCustomer, sendBookingNotificationToTradesperson } from "../../lib/bookingConfirmationEmail";

const log = createLogger("BookFlow");

/* ─── Types ─── */

export interface TimeSlot {
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
  available: boolean;
}

export interface CreateAppointmentInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  serviceName?: string;
  serviceDurationMinutes?: number;
  startTime: string; // ISO timestamp
  notes?: string;
  source?: string;
}

interface WorkingDay {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

type WorkingHours = Record<string, WorkingDay>;

/* ─── Settings ─── */

export async function getBookFlowSettings(clientId: number): Promise<BookflowSettings | null> {
  const [row] = await db
    .select()
    .from(bookflowSettings)
    .where(eq(bookflowSettings.client_id, clientId))
    .limit(1);
  return row ?? null;
}

export async function getBookFlowSettingsBySlug(slug: string): Promise<BookflowSettings | null> {
  const [row] = await db
    .select()
    .from(bookflowSettings)
    .where(eq(bookflowSettings.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function setupBookFlow(
  clientId: number,
  data: Partial<InsertBookflowSettings>,
): Promise<BookflowSettings> {
  const existing = await getBookFlowSettings(clientId);

  if (existing) {
    const [updated] = await db
      .update(bookflowSettings)
      .set({ ...data, updated_at: new Date() })
      .where(eq(bookflowSettings.client_id, clientId))
      .returning();
    log.info("Updated BookFlow settings", { clientId });
    return updated;
  }

  // Generate slug if not provided
  if (!data.slug && data.business_name) {
    data.slug = await generateSlug(data.business_name);
  }

  const [created] = await db
    .insert(bookflowSettings)
    .values({ ...data, client_id: clientId } as InsertBookflowSettings)
    .returning();
  log.info("Created BookFlow settings", { clientId, slug: created.slug });
  return created;
}

/* ─── Slug Generation ─── */

export async function generateSlug(businessName: string): Promise<string> {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const [existing] = await db
      .select({ id: bookflowSettings.id })
      .from(bookflowSettings)
      .where(eq(bookflowSettings.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    attempt++;
    candidate = `${base}-${attempt}`;
  }

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/* ─── Available Slots ─── */

export async function getAvailableSlots(
  clientId: number,
  date: string,
  days: number = 7,
): Promise<TimeSlot[]> {
  const settings = await getBookFlowSettings(clientId);
  if (!settings || !settings.is_active) return [];

  const workingHours = (settings.working_hours ?? {}) as WorkingHours;
  const slotDuration = settings.slot_duration_minutes ?? 60;
  const buffer = settings.buffer_minutes ?? 15;

  const startDate = new Date(date + "T00:00:00");
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  const existingAppointments = await db
    .select()
    .from(bookflowAppointments)
    .where(
      and(
        eq(bookflowAppointments.client_id, clientId),
        ne(bookflowAppointments.status, "cancelled"),
        gte(bookflowAppointments.start_time, startDate),
        lte(bookflowAppointments.start_time, endDate),
      ),
    );

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const slots: TimeSlot[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + d);
    const dayName = dayNames[currentDate.getDay()];
    const dayConfig = workingHours[dayName];

    if (!dayConfig || !dayConfig.enabled) continue;

    const [startH, startM] = dayConfig.start.split(":").map(Number);
    const [endH, endM] = dayConfig.end.split(":").map(Number);

    let slotStart = new Date(currentDate);
    slotStart.setHours(startH, startM, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(endH, endM, 0, 0);

    while (slotStart.getTime() + slotDuration * 60 * 1000 <= dayEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      if (slotStart <= now) {
        slotStart = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
        continue;
      }

      const slotStartWithBuffer = new Date(slotStart.getTime() - buffer * 60 * 1000);
      const slotEndWithBuffer = new Date(slotEnd.getTime() + buffer * 60 * 1000);

      const isConflict = existingAppointments.some((appt) => {
        const apptStart = new Date(appt.start_time);
        const apptEnd = new Date(appt.end_time);
        return slotStartWithBuffer < apptEnd && slotEndWithBuffer > apptStart;
      });

      if (!isConflict) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          available: true,
        });
      }

      slotStart = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
    }
  }

  return slots;
}

/* ─── Appointments ─── */

export async function createAppointment(
  clientId: number,
  input: CreateAppointmentInput,
): Promise<BookflowAppointment> {
  const settings = await getBookFlowSettings(clientId);
  if (!settings || !settings.is_active) {
    throw new Error("BookFlow is not active for this client");
  }

  const slotDuration = input.serviceDurationMinutes ?? settings.slot_duration_minutes ?? 60;
  const startTime = new Date(input.startTime);
  const endTime = new Date(startTime.getTime() + slotDuration * 60 * 1000);
  const buffer = settings.buffer_minutes ?? 15;

  // Race condition guard: verify slot is still available
  const conflictStart = new Date(startTime.getTime() - buffer * 60 * 1000);
  const conflictEnd = new Date(endTime.getTime() + buffer * 60 * 1000);

  const conflicts = await db
    .select({ id: bookflowAppointments.id })
    .from(bookflowAppointments)
    .where(
      and(
        eq(bookflowAppointments.client_id, clientId),
        ne(bookflowAppointments.status, "cancelled"),
        sql`${bookflowAppointments.start_time} < ${conflictEnd}`,
        sql`${bookflowAppointments.end_time} > ${conflictStart}`,
      ),
    )
    .limit(1);

  if (conflicts.length > 0) {
    throw new Error("This time slot is no longer available. Please choose another time.");
  }

  const status = settings.auto_confirm ? "confirmed" : "pending";

  const [appointment] = await db
    .insert(bookflowAppointments)
    .values({
      client_id: clientId,
      customer_name: input.customerName,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      customer_address: input.customerAddress ?? null,
      service_name: input.serviceName ?? null,
      service_duration_minutes: slotDuration,
      start_time: startTime,
      end_time: endTime,
      status,
      notes: input.notes ?? null,
      source: (input.source ?? "direct") as string,
    })
    .returning();

  log.info("Created appointment", {
    appointmentId: appointment.id,
    clientId,
    customerName: input.customerName,
    status,
  });

  // Send confirmation emails (fire-and-forget)
  const businessName = settings.business_name ?? "Your tradesperson";
  const confirmationMessage = settings.confirmation_message ?? undefined;

  sendBookingConfirmationToCustomer({
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    businessName,
    serviceName: input.serviceName,
    startTime,
    endTime,
    address: input.customerAddress,
    confirmationMessage,
    slug: settings.slug ?? undefined,
    appointmentId: appointment.id,
  }).catch((err) => log.error("Failed to send customer confirmation", { error: err.message }));

  sendBookingNotificationToTradesperson({
    clientId,
    businessName,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    serviceName: input.serviceName,
    startTime,
    endTime,
    address: input.customerAddress,
    notes: input.notes,
  }).catch((err) => log.error("Failed to send tradesperson notification", { error: err.message }));

  return appointment;
}

export async function cancelAppointment(
  appointmentId: number,
  reason?: string,
): Promise<void> {
  const [updated] = await db
    .update(bookflowAppointments)
    .set({
      status: "cancelled",
      cancellation_reason: reason ?? null,
      updated_at: new Date(),
    })
    .where(eq(bookflowAppointments.id, appointmentId))
    .returning();

  if (!updated) {
    throw new Error("Appointment not found");
  }

  log.info("Cancelled appointment", { appointmentId, reason });
}

export async function getAppointments(
  clientId: number,
  filters?: { from?: string; to?: string; status?: string },
): Promise<BookflowAppointment[]> {
  const conditions = [eq(bookflowAppointments.client_id, clientId)];

  if (filters?.from) {
    conditions.push(gte(bookflowAppointments.start_time, new Date(filters.from)));
  }
  if (filters?.to) {
    conditions.push(lte(bookflowAppointments.start_time, new Date(filters.to)));
  }
  if (filters?.status) {
    conditions.push(eq(bookflowAppointments.status, filters.status));
  }

  return db
    .select()
    .from(bookflowAppointments)
    .where(and(...conditions))
    .orderBy(bookflowAppointments.start_time);
}

export async function updateAppointmentStatus(
  appointmentId: number,
  status: string,
  cancellationReason?: string,
): Promise<BookflowAppointment | null> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date(),
  };
  if (cancellationReason !== undefined) {
    updates.cancellation_reason = cancellationReason;
  }

  const [updated] = await db
    .update(bookflowAppointments)
    .set(updates)
    .where(eq(bookflowAppointments.id, appointmentId))
    .returning();

  return updated ?? null;
}

/* ─── Admin: list clients with BookFlow ─── */

export async function listBookFlowClients(): Promise<BookflowSettings[]> {
  return db
    .select()
    .from(bookflowSettings)
    .orderBy(bookflowSettings.created_at);
}
