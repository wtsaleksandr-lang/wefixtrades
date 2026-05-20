/**
 * Wave R-1 — Widget scheduling routes (Calendly-style picker).
 *
 * Public endpoints — no auth, called from embedded widgets via slug.
 *   GET  /api/scheduling/availability?slug=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *        → { slots: [{ start, end, available }] }
 *   POST /api/scheduling/book
 *        body: { slug, start_iso, customer_name, customer_email,
 *                 customer_phone?, lead_id?, notes? }
 *        → { id, scheduled_for, status }
 *
 * Slot computation is local-time-naive within the calculator's configured
 * timezone; we don't attempt full IANA DST math here (out of scope for v1 —
 * the local-DB rows are stored as naive timestamps in the picked timezone).
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  availabilityRules,
  scheduledAppointments,
} from "@shared/schemas/db";
import {
  availabilityQuerySchema,
  bookRequestSchema,
  type Slot,
} from "@shared/schemas/scheduling";
import { createLogger } from "../lib/logger";

const log = createLogger("WidgetScheduling");

/* ─── Helpers ─── */

interface RuleRow {
  enabled: boolean;
  working_days: number[];
  working_hours_start: string; // "HH:MM"
  working_hours_end: string;
  timezone: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
}

const DEFAULT_RULE: RuleRow = {
  enabled: false,
  working_days: [1, 2, 3, 4, 5],
  working_hours_start: "09:00",
  working_hours_end: "17:00",
  timezone: "America/Toronto",
  slot_duration_minutes: 30,
  buffer_minutes: 0,
};

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return { h: h || 0, m: m || 0 };
}

/** Build all slot start times for a single day (local-naive). */
function buildDaySlots(
  dayDate: Date,
  rule: RuleRow,
): Array<{ start: Date; end: Date }> {
  const { h: startH, m: startM } = parseHM(rule.working_hours_start);
  const { h: endH, m: endM } = parseHM(rule.working_hours_end);

  const dayStart = new Date(dayDate);
  dayStart.setHours(startH, startM, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setHours(endH, endM, 0, 0);

  const slots: Array<{ start: Date; end: Date }> = [];
  const stepMs = (rule.slot_duration_minutes + rule.buffer_minutes) * 60 * 1000;
  const durMs = rule.slot_duration_minutes * 60 * 1000;

  let cursor = dayStart.getTime();
  while (cursor + durMs <= dayEnd.getTime()) {
    slots.push({
      start: new Date(cursor),
      end: new Date(cursor + durMs),
    });
    cursor += stepMs;
  }
  return slots;
}

/** Iterate dates from `from` (inclusive) to `to` (inclusive). */
function* dateRange(from: string, to: string): Generator<Date> {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    yield new Date(d);
  }
}

/* ─── Routes ─── */

export function registerWidgetSchedulingRoutes(app: Express): void {

  /**
   * GET /api/scheduling/availability
   * Returns slot objects across the requested date range. Slots outside
   * working_hours / working_days are omitted entirely (vs returned as
   * `available: false`) to keep the payload lean. Slots colliding with
   * existing `confirmed` appointments are returned with `available: false`.
   */
  app.get("/api/scheduling/availability", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    const parsed = availabilityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const { slug, from, to } = parsed.data;

    try {
      const calc = await storage.getCalculatorBySlug(slug);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const [ruleRow] = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.calculator_id, calc.id))
        .limit(1);

      const rule: RuleRow = ruleRow
        ? {
            enabled: ruleRow.enabled,
            working_days: Array.isArray(ruleRow.working_days)
              ? (ruleRow.working_days as number[])
              : DEFAULT_RULE.working_days,
            working_hours_start: ruleRow.working_hours_start,
            working_hours_end: ruleRow.working_hours_end,
            timezone: ruleRow.timezone,
            slot_duration_minutes: ruleRow.slot_duration_minutes,
            buffer_minutes: ruleRow.buffer_minutes,
          }
        : DEFAULT_RULE;

      if (!rule.enabled) {
        return res.json({ enabled: false, slots: [] });
      }

      // Existing confirmed appointments in range — used to mark unavailable.
      const rangeStart = new Date(from + "T00:00:00");
      const rangeEnd = new Date(to + "T23:59:59");
      const existing = await db
        .select({ scheduled_for: scheduledAppointments.scheduled_for })
        .from(scheduledAppointments)
        .where(
          and(
            eq(scheduledAppointments.calculator_id, calc.id),
            eq(scheduledAppointments.status, "confirmed"),
            gte(scheduledAppointments.scheduled_for, rangeStart),
            lt(scheduledAppointments.scheduled_for, rangeEnd),
          ),
        );
      const bookedTimes = new Set(
        existing
          .map((r) => r.scheduled_for?.getTime?.())
          .filter((t): t is number => typeof t === "number"),
      );

      const now = Date.now();
      const slots: Slot[] = [];
      for (const d of dateRange(from, to)) {
        const dayOfWeek = d.getDay();
        if (!rule.working_days.includes(dayOfWeek)) continue;

        for (const s of buildDaySlots(d, rule)) {
          // Skip slots in the past
          if (s.start.getTime() < now) continue;
          slots.push({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            available: !bookedTimes.has(s.start.getTime()),
          });
        }
      }

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        enabled: true,
        timezone: rule.timezone,
        slot_duration_minutes: rule.slot_duration_minutes,
        slots,
      });
    } catch (err: any) {
      log.error("availability lookup failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  /**
   * POST /api/scheduling/book
   * Creates a confirmed appointment. Re-validates that the slot is still
   * open (race-safe enough for v1: a single-row check inside one request).
   */
  app.post("/api/scheduling/book", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const parsed = bookRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    try {
      const calc = await storage.getCalculatorBySlug(body.slug);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const [ruleRow] = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.calculator_id, calc.id))
        .limit(1);

      if (!ruleRow || !ruleRow.enabled) {
        return res.status(403).json({ error: "Scheduling not enabled for this calculator" });
      }

      const startDate = new Date(body.start_iso);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid start_iso" });
      }
      if (startDate.getTime() < Date.now()) {
        return res.status(400).json({ error: "Cannot book a slot in the past" });
      }

      // Re-check slot is open
      const collision = await db
        .select({ id: scheduledAppointments.id })
        .from(scheduledAppointments)
        .where(
          and(
            eq(scheduledAppointments.calculator_id, calc.id),
            eq(scheduledAppointments.status, "confirmed"),
            eq(scheduledAppointments.scheduled_for, startDate),
          ),
        )
        .limit(1);
      if (collision.length > 0) {
        return res.status(409).json({ error: "Slot is no longer available" });
      }

      const [inserted] = await db
        .insert(scheduledAppointments)
        .values({
          calculator_id: calc.id,
          lead_id: body.lead_id ?? null,
          customer_name: body.customer_name,
          customer_email: body.customer_email,
          customer_phone: body.customer_phone ?? null,
          scheduled_for: startDate,
          duration_minutes: ruleRow.slot_duration_minutes,
          notes: body.notes ?? null,
          status: "confirmed",
        })
        .returning();

      return res.status(201).json({
        id: inserted.id,
        scheduled_for: inserted.scheduled_for?.toISOString?.() ?? body.start_iso,
        status: inserted.status,
      });
    } catch (err: any) {
      log.error("booking failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to create appointment" });
    }
  });
}
