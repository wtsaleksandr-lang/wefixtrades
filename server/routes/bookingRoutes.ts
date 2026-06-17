import type { Express, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { storage } from "../storage";
import { sendBookingConfirmationToCustomer, sendBookingNotificationToBusiness } from "../bookingEmails";
import { createLogger } from "../lib/logger";
import { noisyCatch } from "../lib/silentFailureGuard";
import {
  createBookingForCalculator as realCreateBooking,
  BookingFacadeError,
  type CreateBookingForCalculatorInput,
} from "../services/booking/createBookingForCalculator";
import { resolveClientForCalculator as realResolveClient } from "../services/booking/resolveClientForCalculator";
import type { BookflowAppointment } from "@shared/schema";
import type { TimeSlot } from "../services/booking/bookflowService";

const log = createLogger("Booking");

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

const createBookingBody = z.object({
  calculator_id: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  quote_amount: z.number().optional(),
  notes: z.string().optional(),
});

/* ─── DI seam (DB-free unit-testable) ─────────────────────────────────────
 * Booking consolidation (PR7): the legacy wizard BookingStep (System C-legacy)
 * is repointed onto the single BookFlow authority for the NON-DEPOSIT case.
 * The collaborators that touch the DB / the BookFlow engine are injected so
 * server/routes/bookingRoutes.bookflow.test.ts can drive the handlers with no
 * DB call, mirroring the seam in widgetSchedulingRoutes.ts (PR3) /
 * bookingTools.ts (PR5). The default deps wire the real implementations.
 *
 * IMPORTANT — deposit/Stripe is intentionally NOT in this seam. The deposit
 * path stays 100% on the existing `bookings` table + Stripe flow (deferred
 * phase: BookFlow's createAppointment does not do deposit-on-booking). Only the
 * clean no-deposit case is repointed. */

export interface BookingRoutesDeps {
  /** calculator id → owning clients.id (null when unowned). */
  resolveClientForCalculator: (calculatorId: number) => Promise<number | null>;
  /** The native BookFlow slot engine — keyed by client id. */
  getAvailableSlots: (clientId: number, date: string, days?: number) => Promise<TimeSlot[]>;
  /** The single booking façade — lands a `bookflow_appointments` row (no-deposit). */
  createBookingForCalculator: (
    calculatorId: number,
    input: CreateBookingForCalculatorInput,
  ) => Promise<BookflowAppointment>;
}

export const defaultBookingRoutesDeps: BookingRoutesDeps = {
  resolveClientForCalculator: (calculatorId) => realResolveClient(calculatorId),
  async getAvailableSlots(clientId, date, days) {
    const { getAvailableSlots } = await import("../services/booking/bookflowService");
    return getAvailableSlots(clientId, date, days);
  },
  createBookingForCalculator: (calculatorId, input) => realCreateBooking(calculatorId, input),
};

/* ─── Helpers ─── */

/** Local YYYY-MM-DD for a Date (matches the picker's local-time date strings). */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local HH:MM for a Date. */
function localTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Project the native BookFlow ISO slots onto the legacy `{ slots: ["HH:MM"] }`
 * shape the wizard BookingStep consumes, filtered to the requested calendar day.
 * Only `available` slots that fall on `date` (local time) are surfaced.
 */
function bookflowSlotsToTimes(slots: TimeSlot[], date: string): string[] {
  const out: string[] = [];
  for (const slot of slots) {
    if (!slot.available) continue;
    const start = new Date(slot.start);
    if (isNaN(start.getTime())) continue;
    if (localDateString(start) !== date) continue;
    out.push(localTimeString(start));
  }
  return out;
}

/**
 * Recognise the graceful "booking unavailable" conditions raised by the
 * consolidation façade / native engine, so the POST handler returns a clean 4xx
 * "unavailable" instead of a 500. Returns a user-facing message, or null when
 * the error is a genuine fault that should 500. Mirrors
 * widgetSchedulingRoutes.unavailableReason (PR3) / bookingTools (PR5).
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
 * GET /api/bookings/availability — resolve the calculator's client and read
 * slots from the SAME BookFlow source the no-deposit booking writes to (single
 * availability authority), projected onto the legacy `{ slots: ["HH:MM"] }`
 * shape so the wizard BookingStep needs no change.
 */
export async function handleAvailability(
  req: Request,
  res: Response,
  deps: BookingRoutesDeps = defaultBookingRoutesDeps,
): Promise<Response> {
  try {
    const rawId = parseInt(req.query.calculator_id as string);
    const date = req.query.date as string;
    if (isNaN(rawId) || !date) return res.status(400).json({ error: "calculator_id and date required" });

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    // Reject past dates
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (date < todayStr) {
      return res.json({ slots: [], message: "Cannot book past dates" });
    }

    const calc = await storage.getCalculatorById(rawId);
    if (!calc) return res.status(404).json({ error: "Calculator not found" });

    const settings = (calc.calculator_settings as any) || {};
    const bookingSettings = settings.booking_settings || {};
    if (!bookingSettings.enabled) return res.json({ slots: [], message: "Booking not enabled" });

    // PR7: read availability from the single BookFlow authority. Resolve the
    // owning client, then read the same slot source the no-deposit booking
    // writes to. getAvailableSlots returns ONLY available slots, and [] when
    // BookFlow is inactive / no settings — the picker renders an empty grid.
    const clientId = await deps.resolveClientForCalculator(rawId);
    if (!clientId) {
      // No linked client → BookFlow can't be configured → no slots. Keep the
      // legacy shape stable so the picker renders an empty grid.
      return res.json({ slots: [], message: "Booking not available" });
    }

    // days=1: scan just the requested calendar day; we filter to `date` below.
    const slots = await deps.getAvailableSlots(clientId, date, 1);
    const times = bookflowSlotsToTimes(slots, date);

    res.json({ slots: times, date, working_day: times.length > 0 });
    return res;
  } catch (err: any) {
    log.error("[Booking Availability]", err);
    return res.status(500).json({ error: "Failed to fetch availability" });
  }
}

/**
 * POST /api/bookings — create a booking.
 *
 * Booking consolidation (PR7) — the deposit / no-deposit SPLIT:
 *   - NO-DEPOSIT → route through the single BookFlow façade
 *     (createBookingForCalculator, source='quotequick') so it lands a real
 *     `bookflow_appointments` row (Dispatch + confirmation email + 4-stage SMS
 *     lifecycle via the native engine, which also re-checks availability with
 *     the race-safe conflict guard). This REPLACES the old storage.createBooking
 *     write to the `bookings` table for the no-deposit case.
 *   - DEPOSIT → UNCHANGED legacy path: writes the `bookings` table via
 *     storage.createBooking with status='pending', then the existing
 *     POST /api/bookings/:id/checkout Stripe flow collects the deposit and
 *     /api/bookings/confirm marks it confirmed. BookFlow's createAppointment
 *     does NOT do deposit-on-booking (deferred phase), so this path stays
 *     entirely on bookings + Stripe — it MUST NOT be repointed.
 */
export async function handlePostBooking(
  req: Request,
  res: Response,
  deps: BookingRoutesDeps = defaultBookingRoutesDeps,
): Promise<Response> {
  try {
    const body = createBookingBody.parse(req.body);
    const calc = await storage.getCalculatorById(body.calculator_id);
    if (!calc) return res.status(404).json({ error: "Calculator not found" });

    const settings = (calc.calculator_settings as any) || {};
    const bookingSettings = settings.booking_settings || {};
    if (!bookingSettings.enabled) return res.status(400).json({ error: "Booking not enabled" });

    // THE SPLIT: a deposit is required only when the trade both opted in AND has
    // a connected Stripe account. This single boolean decides the path.
    const requiresDeposit = !!(bookingSettings.require_deposit && bookingSettings.stripe_account_id);

    /* ─────────────────────────────────────────────────────────────────────
     * NO-DEPOSIT → BookFlow façade (PR7). Lands a bookflow_appointments row.
     * The native engine owns the availability re-check / race-safe conflict
     * guard + confirmation email + SMS lifecycle, so we do NOT pre-check
     * overlaps here (that was the bookings-table path's job).
     * ───────────────────────────────────────────────────────────────────── */
    if (!requiresDeposit) {
      const startIso = new Date(`${body.date}T${body.time}:00`).toISOString();
      try {
        const appointment = await deps.createBookingForCalculator(body.calculator_id, {
          customerName: body.customer_name.trim(),
          customerEmail: body.customer_email?.trim() || undefined,
          customerPhone: body.customer_phone?.trim() || undefined,
          startTime: startIso,
          notes: body.notes?.trim() || undefined,
          source: "quotequick",
        });

        return res.json({
          booking: appointment,
          requires_checkout: false,
          deposit_amount: 0,
        });
      } catch (err: unknown) {
        // GRACEFUL ERRORS (PR2-flagged): no linked client (BookingFacadeError
        // 'no_client') / BookFlow deactivated / slot just taken → a clean 4xx
        // "unavailable", NOT a 500 and NOT a silent success. Logged via the
        // existing logger (no bare catch — no-silent-catch).
        const reason = unavailableReason(err);
        if (reason) {
          const slotTaken =
            err instanceof Error &&
            err.message === "This time slot is no longer available. Please choose another time.";
          log.warn("[Booking] no-deposit booking unavailable", {
            calculator_id: body.calculator_id,
            reason,
            err: (err as Error)?.message,
          });
          return res.status(slotTaken ? 409 : 400).json({ error: reason });
        }
        log.error("[Booking] no-deposit booking failed", { err: (err as Error)?.message });
        return res.status(500).json({ error: "Failed to create appointment" });
      }
    }

    /* ─────────────────────────────────────────────────────────────────────
     * DEPOSIT → UNCHANGED legacy path: bookings table + Stripe. Deferred phase.
     * Everything below this line is the original deposit flow, byte-for-byte:
     * overlap pre-check, deposit math, storage.createBooking(status='pending'),
     * and the requires_checkout response that the Stripe checkout flow consumes.
     * ───────────────────────────────────────────────────────────────────── */
    const existingBookings = await storage.getConfirmedBookingsForDate(body.calculator_id, body.date);
    const duration = bookingSettings.slot_duration_minutes || 60;
    const buffer = bookingSettings.availability?.buffer_minutes || 0;

    const [bh, bm] = body.time.split(":").map(Number);
    const bookStart = bh * 60 + bm;
    const bookEnd = bookStart + duration;
    const overlap = existingBookings.some(eb => {
      const [eh, em] = eb.time.split(":").map(Number);
      const eStart = eh * 60 + em;
      const eEnd = eStart + eb.duration_minutes;
      return bookStart < eEnd + buffer && bookEnd > eStart - buffer;
    });
    if (overlap) return res.status(409).json({ error: "Time slot no longer available" });

    let depositAmount = 0;
    const quoteForDeposit = body.quote_amount != null && Number.isFinite(body.quote_amount) ? body.quote_amount : 0;
    if (bookingSettings.deposit_type === "percentage" && quoteForDeposit > 0) {
      depositAmount = Math.round(quoteForDeposit * (bookingSettings.deposit_value || 0) / 100);
    } else {
      depositAmount = bookingSettings.deposit_value || 0;
    }

    // Preserve 0 as valid quote_amount (don't coerce to null)
    const safeQuoteAmount = body.quote_amount != null && Number.isFinite(body.quote_amount) ? body.quote_amount : null;

    const booking = await storage.createBooking({
      calculator_id: body.calculator_id,
      customer_name: body.customer_name.trim(),
      customer_email: body.customer_email?.trim() || null,
      customer_phone: body.customer_phone?.trim() || null,
      date: body.date,
      time: body.time,
      duration_minutes: duration,
      status: "pending",
      deposit_amount: depositAmount,
      deposit_paid: false,
      quote_amount: safeQuoteAmount,
      notes: body.notes?.trim() || null,
    });

    return res.json({
      booking,
      requires_checkout: true,
      deposit_amount: depositAmount,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: err.message });
  }
}

export function registerBookingRoutes(app: Express, deps: BookingRoutesDeps = defaultBookingRoutesDeps): void {
  app.get("/api/bookings/availability", (req, res) => {
    void handleAvailability(req, res, deps);
  });

  app.post("/api/bookings", (req, res) => {
    void handlePostBooking(req, res, deps);
  });

  app.post("/api/bookings/:id/checkout", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const calc = await storage.getCalculatorById(booking.calculator_id);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const stripeAccountId = bookingSettings.stripe_account_id;

      if (!stripeAccountId) return res.status(400).json({ error: "Stripe not connected" });

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured on platform" });

      const depositCents = (booking.deposit_amount || 0) * 100;
      if (depositCents <= 0) return res.status(400).json({ error: "No deposit required" });

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Booking Deposit — ${calc.business_name}`,
              description: `Appointment on ${booking.date} at ${booking.time}`,
            },
            unit_amount: depositCents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/api/bookings/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/calculator/${calc.slug}?booking_cancelled=1`,
        payment_intent_data: {
          application_fee_amount: 0,
        },
      }, {
        stripeAccount: stripeAccountId,
      });

      await storage.updateBooking(bookingId, { stripe_checkout_session_id: session.id } as any);

      res.json({ checkout_url: session.url });
    } catch (err: any) {
      log.error("[Stripe Checkout]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bookings/confirm", async (req, res) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).send("Missing session_id");

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).send("Stripe not configured");

      const { db } = await import("../db");
      const { bookings: bookingsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [booking] = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.stripe_checkout_session_id, sessionId)).limit(1);
      if (!booking) return res.status(404).send("Booking not found");

      const calc = await storage.getCalculatorById(booking.calculator_id);

      const settings = (calc?.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      const stripeAccountId = bookingSettings.stripe_account_id;

      if (!stripeAccountId) {
        return res.status(400).send("Stripe not connected for this booking");
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        stripeAccount: stripeAccountId,
      });

      if (session.payment_status !== "paid") {
        return res.status(400).send("Payment not completed");
      }

      const expectedCents = (booking.deposit_amount || 0) * 100;
      if (session.amount_total && expectedCents > 0 && session.amount_total !== expectedCents) {
        return res.status(400).send("Payment amount mismatch");
      }

      await storage.updateBooking(booking.id, {
        status: "confirmed",
        deposit_paid: true,
      } as any);

      if (calc) {
        const updatedBooking = { ...booking, status: "confirmed", deposit_paid: true };
        // Wave 92: see note on /api/bookings — deposit-path confirmations.
        noisyCatch(sendBookingConfirmationToCustomer(updatedBooking, calc), {
          op: "booking.confirmation.customer.deposit",
          meta: { booking_id: booking.id, calculator_id: calc.id },
        });
        noisyCatch(sendBookingNotificationToBusiness(updatedBooking, calc), {
          op: "booking.notification.business.deposit",
          meta: { booking_id: booking.id, calculator_id: calc.id },
        });
      }

      const confirmParams = new URLSearchParams({
        booking_confirmed: "1",
        booking_date: booking.date,
        booking_time: booking.time,
        booking_name: booking.customer_name,
        ...(booking.quote_amount ? { booking_quote: String(booking.quote_amount) } : {}),
        ...(booking.deposit_amount ? { booking_deposit: String(booking.deposit_amount) } : {}),
      });
      res.redirect(`/calculator/${calc?.slug || ""}?${confirmParams.toString()}`);
    } catch (err: any) {
      log.error("[Booking Confirm]", err);
      res.status(500).send("Error confirming booking");
    }
  });

  app.get("/api/dashboard/bookings", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });
      if (calc.token_expires_at && new Date(calc.token_expires_at) < new Date()) {
        return res.status(401).json({ error: "Token expired" });
      }

      const bookingsList = await storage.getBookingsByCalculatorId(calc.id);
      res.json({ bookings: bookingsList });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/dashboard/bookings/:id/status", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const calc = await storage.getCalculatorByToken(token);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });
      if (calc.token_expires_at && new Date(calc.token_expires_at) < new Date()) {
        return res.status(401).json({ error: "Token expired" });
      }

      const bookingId = parseInt(req.params.id);
      const { status } = req.body;
      if (!["pending", "confirmed", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const booking = await storage.getBookingById(bookingId);
      if (!booking || booking.calculator_id !== calc.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const updated = await storage.updateBookingStatus(bookingId, status);

      if (status === "confirmed" && booking.status !== "confirmed") {
        // Wave 92: see note on /api/bookings — manual status-change confirmations.
        noisyCatch(sendBookingConfirmationToCustomer(updated!, calc), {
          op: "booking.confirmation.customer.status_change",
          meta: { booking_id: booking.id, calculator_id: calc.id },
        });
        noisyCatch(sendBookingNotificationToBusiness(updated!, calc), {
          op: "booking.notification.business.status_change",
          meta: { booking_id: booking.id, calculator_id: calc.id },
        });
      }

      // Trigger review request when job marked completed
      if (status === "completed" && booking.status !== "completed") {
        import("../services/reviewRequestService")
          .then(async ({ createPostJobReviewRequest, processReviewRequest }) => {
            const result = await createPostJobReviewRequest(updated!, calc);
            if (result.created && result.reviewRequest) {
              await processReviewRequest(result.reviewRequest);
            } else {
              log.info(`[ReviewRequest] Skipped for booking ${bookingId}: ${result.reason}`);
            }
          })
          .catch((err) => {
            log.error(`[ReviewRequest] Error for booking ${bookingId}:`, err.message);
          });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
