/**
 * Wave R-1 — Widget scheduling routes (Calendly-style picker).
 *
 * Public endpoints — no auth, called from embedded widgets via slug.
 *   GET  /api/scheduling/availability?slug=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *        → { enabled, timezone?, slot_duration_minutes?, slots: [{ start, end, available }] }
 *   POST /api/scheduling/book
 *        body: { slug, start_iso, customer_name, customer_email,
 *                 customer_phone?, lead_id?, notes? }
 *        → { id, scheduled_for, status }
 *
 * Booking consolidation (PR3): this is the wizard "Online booking" picker
 * (System D-picker). It used to write `scheduled_appointments` and read
 * `availability_rules` — a dead-end table that never reached Dispatch and got
 * no email / SMS lifecycle. It is now repointed onto the single BookFlow
 * authority:
 *   - POST /book → createBookingForCalculator(calc.id, …, { source: 'quotequick' })
 *     → a real `bookflow_appointments` row (Dispatch + confirmation email +
 *       4-stage SMS lifecycle, all for free via the native engine).
 *   - GET  /availability → resolveClientForCalculator + bookflowService.getAvailableSlots
 *     so the picker and the booking share ONE availability source.
 *
 * The endpoint URLs and response JSON shapes are kept stable so the embedded
 * widget bootstrap (SchedulingStep.tsx) needs no changes.
 *
 * Graceful errors (PR2 flagged): the façade throws BookingFacadeError('no_client')
 * when the calculator has no linked client, and the native engine throws
 * Error("BookFlow is not active for this client") when the trade deactivated
 * BookFlow. Both are surfaced as a clean 409 "booking unavailable" — never a
 * 500, never a silent success.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import {
  availabilityQuerySchema,
  bookRequestSchema,
  type Slot,
} from "@shared/schemas/scheduling";
import {
  createBookingForCalculator as realCreateBooking,
  BookingFacadeError,
  type CreateBookingForCalculatorInput,
} from "../services/booking/createBookingForCalculator";
import { resolveClientForCalculator as realResolveClient } from "../services/booking/resolveClientForCalculator";
import type { BookflowAppointment } from "@shared/schema";
import type { TimeSlot } from "../services/booking/bookflowService";
import { createLogger } from "../lib/logger";

const log = createLogger("WidgetScheduling");

/* ─── Constants ─── */

/** Default timezone surfaced to the picker when BookFlow has none set. */
const DEFAULT_TIMEZONE = "America/Toronto";

/* ─── DI seam (DB-free unit-testable) ─────────────────────────────────────
 * Every collaborator that touches the DB or the BookFlow engine is injected,
 * mirroring the seam in server/services/tradelineBooking.test.ts so
 * server/routes/widgetScheduling.bookflow.test.ts can drive the handlers with
 * no DB / network call. The default deps wire the real implementations. */

export interface WidgetSchedulingDeps {
  /** slug → { id } (the calculator that owns this widget). */
  getCalculatorBySlug: (slug: string) => Promise<{ id: number } | null | undefined>;
  /** calculator id → owning clients.id (null when unowned). */
  resolveClientForCalculator: (calculatorId: number) => Promise<number | null>;
  /** The native BookFlow slot engine — keyed by client id. */
  getAvailableSlots: (clientId: number, date: string, days?: number) => Promise<TimeSlot[]>;
  /** The single booking façade — lands a `bookflow_appointments` row. */
  createBookingForCalculator: (
    calculatorId: number,
    input: CreateBookingForCalculatorInput,
  ) => Promise<BookflowAppointment>;
}

export const defaultWidgetSchedulingDeps: WidgetSchedulingDeps = {
  getCalculatorBySlug: (slug) => storage.getCalculatorBySlug(slug),
  resolveClientForCalculator: (calculatorId) => realResolveClient(calculatorId),
  async getAvailableSlots(clientId, date, days) {
    const { getAvailableSlots } = await import("../services/booking/bookflowService");
    return getAvailableSlots(clientId, date, days);
  },
  createBookingForCalculator: (calculatorId, input) => realCreateBooking(calculatorId, input),
};

/* ─── Helpers ─── */

/** Inclusive whole-day count between two YYYY-MM-DD strings (>= 1). */
function dayCount(from: string, to: string): number {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1; // inclusive of `to`
  return Number.isFinite(days) && days > 0 ? days : 1;
}

/**
 * Recognise the graceful "booking unavailable" conditions raised by the
 * consolidation façade / native engine, so the handler can return a clean 409
 * instead of a 500. Returns a user-facing message or null when the error is a
 * genuine fault that should 500.
 */
function unavailableReason(err: unknown): string | null {
  if (err instanceof BookingFacadeError && err.code === "no_client") {
    return "Online booking isn’t set up for this business yet.";
  }
  const message = err instanceof Error ? err.message : "";
  if (message === "BookFlow is not active for this client") {
    return "Online booking is currently unavailable for this business.";
  }
  if (message === "This time slot is no longer available. Please choose another time.") {
    return message;
  }
  return null;
}

/* ─── Handlers (exported for the DB-free test) ─── */

/**
 * GET /api/scheduling/availability — resolve the calculator's client and read
 * slots from the SAME BookFlow source the booking writes to.
 */
export async function handleAvailability(
  req: Request,
  res: Response,
  deps: WidgetSchedulingDeps = defaultWidgetSchedulingDeps,
): Promise<Response> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const parsed = availabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const { slug, from, to } = parsed.data;

  try {
    const calc = await deps.getCalculatorBySlug(slug);
    if (!calc) return res.status(404).json({ error: "Calculator not found" });

    const clientId = await deps.resolveClientForCalculator(calc.id);
    if (!clientId) {
      // No linked client → BookFlow can't be configured → no slots. Keep the
      // shape stable: the picker reads `enabled` and renders an empty grid.
      return res.json({ enabled: false, slots: [] });
    }

    const days = dayCount(from, to);
    const slots = (await deps.getAvailableSlots(clientId, from, days)) as Slot[];

    // getAvailableSlots returns [] both when there are genuinely no open slots
    // and when BookFlow is inactive for the client. Either way the picker
    // renders an empty grid; we keep `enabled` true when slots exist so the
    // widget shows the calendar.
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      enabled: slots.length > 0,
      timezone: DEFAULT_TIMEZONE,
      slots,
    });
  } catch (err: any) {
    log.error("availability lookup failed", { err: err?.message });
    return res.status(500).json({ error: "Failed to fetch availability" });
  }
}

/**
 * POST /api/scheduling/book — route a wizard-path booking through the single
 * BookFlow façade so it lands a real `bookflow_appointments` row.
 */
export async function handleBook(
  req: Request,
  res: Response,
  deps: WidgetSchedulingDeps = defaultWidgetSchedulingDeps,
): Promise<Response> {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const parsed = bookRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const startDate = new Date(body.start_iso);
  if (isNaN(startDate.getTime())) {
    return res.status(400).json({ error: "Invalid start_iso" });
  }
  if (startDate.getTime() < Date.now()) {
    return res.status(400).json({ error: "Cannot book a slot in the past" });
  }

  try {
    const calc = await deps.getCalculatorBySlug(body.slug);
    if (!calc) return res.status(404).json({ error: "Calculator not found" });

    const appointment = await deps.createBookingForCalculator(calc.id, {
      customerName: body.customer_name,
      customerEmail: body.customer_email,
      customerPhone: body.customer_phone ?? undefined,
      startTime: body.start_iso,
      notes: body.notes ?? undefined,
      source: "quotequick",
    });

    const scheduledFor =
      appointment.start_time instanceof Date
        ? appointment.start_time.toISOString()
        : new Date(appointment.start_time as any).toISOString();

    return res.status(201).json({
      id: appointment.id,
      scheduled_for: scheduledFor,
      status: appointment.status,
    });
  } catch (err: any) {
    // GRACEFUL ERRORS (PR2-flagged): no linked client / BookFlow deactivated /
    // slot taken → a clean 409 "unavailable", NOT a 500 and NOT a silent
    // success. We log via the existing logger (no bare catch — no-silent-catch).
    const reason = unavailableReason(err);
    if (reason) {
      log.warn("booking unavailable", { slug: body.slug, reason, err: err?.message });
      return res.status(409).json({ error: reason });
    }
    log.error("booking failed", { err: err?.message });
    return res.status(500).json({ error: "Failed to create appointment" });
  }
}

/* ─── Registration ─── */

export function registerWidgetSchedulingRoutes(
  app: Express,
  deps: WidgetSchedulingDeps = defaultWidgetSchedulingDeps,
): void {
  app.get("/api/scheduling/availability", (req, res) => {
    void handleAvailability(req, res, deps);
  });
  app.post("/api/scheduling/book", (req, res) => {
    void handleBook(req, res, deps);
  });
}
