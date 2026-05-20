/**
 * Wave R-1 — Widget scheduling Zod schemas.
 *
 * These mirror the `availability_rules` / `scheduled_appointments` Drizzle
 * tables in `db.ts` but are framework-agnostic Zod definitions used at the
 * API boundary (request/response validation) and on the client.
 */

import { z } from "zod";

/** 24h "HH:MM" string. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

/** 0=Sun .. 6=Sat (matches JS Date.getDay()). */
export const dayOfWeek = z.number().int().min(0).max(6);

/** ISO timezone identifier — we don't validate against the IANA db here. */
export const ianaTimezone = z.string().min(1);

export const slotDurationMinutes = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);

export const bufferMinutes = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);

export const availabilityRuleSchema = z.object({
  id: z.number().int().optional(),
  calculator_id: z.number().int(),
  enabled: z.boolean().default(false),
  working_days: z.array(dayOfWeek).default([1, 2, 3, 4, 5]),
  working_hours_start: timeOfDay.default("09:00"),
  working_hours_end: timeOfDay.default("17:00"),
  timezone: ianaTimezone.default("America/Toronto"),
  slot_duration_minutes: slotDurationMinutes.default(30),
  buffer_minutes: bufferMinutes.default(0),
});
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

export const scheduledAppointmentSchema = z.object({
  id: z.number().int().optional(),
  calculator_id: z.number().int(),
  lead_id: z.number().int().nullable().optional(),
  customer_name: z.string().min(1).max(200).nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  customer_phone: z.string().max(40).nullable().optional(),
  scheduled_for: z.string().datetime(),
  duration_minutes: z.number().int().positive().default(30),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["confirmed", "cancelled", "pending"]).default("confirmed"),
});
export type ScheduledAppointmentInput = z.infer<typeof scheduledAppointmentSchema>;

/* ─── API request/response shapes ─── */

export const availabilityQuerySchema = z.object({
  slug: z.string().min(1),
  // YYYY-MM-DD
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const slotSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  available: z.boolean(),
});
export type Slot = z.infer<typeof slotSchema>;

export const bookRequestSchema = z.object({
  slug: z.string().min(1),
  start_iso: z.string().datetime(),
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email(),
  customer_phone: z.string().max(40).optional(),
  lead_id: z.number().int().optional(),
  notes: z.string().max(2000).optional(),
});
export type BookRequest = z.infer<typeof bookRequestSchema>;

export const bookResponseSchema = z.object({
  id: z.number().int(),
  scheduled_for: z.string().datetime(),
  status: z.string(),
});
export type BookResponse = z.infer<typeof bookResponseSchema>;

/**
 * Settings stored under `calculator_settings.appearance.scheduling`. The
 * server only reads `enabled` from this slot; the rest of the configuration
 * lives on the `availability_rules` row keyed by calculator_id.
 */
export const schedulingAppearanceSchema = z.object({
  enabled: z.boolean().default(false),
  working_days: z.array(dayOfWeek).default([1, 2, 3, 4, 5]),
  working_hours_start: timeOfDay.default("09:00"),
  working_hours_end: timeOfDay.default("17:00"),
  slot_duration_minutes: slotDurationMinutes.default(30),
  buffer_minutes: bufferMinutes.default(0),
});
export type SchedulingAppearance = z.infer<typeof schedulingAppearanceSchema>;
