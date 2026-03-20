import type { Express } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { storage } from "../storage";
import { sendBookingConfirmationToCustomer, sendBookingNotificationToBusiness } from "../bookingEmails";

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

function generateTimeSlots(
  startTime: string, endTime: string,
  durationMinutes: number, bufferMinutes: number,
  existingBookings: { time: string; duration_minutes: number }[]
): string[] {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const bookedRanges = existingBookings.map(b => {
    const [bh, bm] = b.time.split(":").map(Number);
    const bStart = bh * 60 + bm;
    return { start: bStart, end: bStart + b.duration_minutes };
  });

  const slots: string[] = [];
  let current = startMinutes;

  while (current + durationMinutes <= endMinutes) {
    const slotEnd = current + durationMinutes;
    const overlaps = bookedRanges.some(
      r => current < r.end + bufferMinutes && slotEnd > r.start - bufferMinutes
    );
    if (!overlaps) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
    current += durationMinutes + bufferMinutes;
  }
  return slots;
}

const createBookingBody = z.object({
  calculator_id: z.number(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  quote_amount: z.number().optional(),
  notes: z.string().optional(),
});

export function registerBookingRoutes(app: Express): void {
  app.get("/api/bookings/availability", async (req, res) => {
    try {
      const calculatorId = parseInt(req.query.calculator_id as string);
      const date = req.query.date as string;
      if (!calculatorId || !date) return res.status(400).json({ error: "calculator_id and date required" });

      const calc = await storage.getCalculatorById(calculatorId);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      if (!bookingSettings.enabled) return res.json({ slots: [], message: "Booking not enabled" });

      const avail = bookingSettings.availability || {};
      const dayOfWeek = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
      const dayMap: Record<string, string> = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
      const workingDays: string[] = avail.working_days || ["mon", "tue", "wed", "thu", "fri"];
      if (!workingDays.includes(dayMap[dayOfWeek])) {
        return res.json({ slots: [], message: "Not a working day" });
      }

      const existingBookings = await storage.getConfirmedBookingsForDate(calculatorId, date);
      const slots = generateTimeSlots(
        avail.start_time || "09:00",
        avail.end_time || "17:00",
        bookingSettings.slot_duration_minutes || 60,
        avail.buffer_minutes || 0,
        existingBookings
      );

      res.json({ slots, date, working_day: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const body = createBookingBody.parse(req.body);
      const calc = await storage.getCalculatorById(body.calculator_id);
      if (!calc) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc.calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};
      if (!bookingSettings.enabled) return res.status(400).json({ error: "Booking not enabled" });

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
      const requiresDeposit = bookingSettings.require_deposit && bookingSettings.stripe_account_id;
      if (requiresDeposit) {
        if (bookingSettings.deposit_type === "percentage" && body.quote_amount) {
          depositAmount = Math.round(body.quote_amount * (bookingSettings.deposit_value || 0) / 100);
        } else {
          depositAmount = bookingSettings.deposit_value || 0;
        }
      }

      const booking = await storage.createBooking({
        calculator_id: body.calculator_id,
        customer_name: body.customer_name,
        customer_email: body.customer_email || null,
        customer_phone: body.customer_phone || null,
        date: body.date,
        time: body.time,
        duration_minutes: duration,
        status: requiresDeposit ? "pending" : "confirmed",
        deposit_amount: depositAmount,
        deposit_paid: false,
        quote_amount: body.quote_amount || null,
        notes: body.notes || null,
      });

      if (!requiresDeposit) {
        sendBookingConfirmationToCustomer(booking, calc).catch(() => {});
        sendBookingNotificationToBusiness(booking, calc).catch(() => {});
      }

      res.json({
        booking,
        requires_checkout: requiresDeposit,
        deposit_amount: depositAmount,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: err.message });
    }
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
      console.error("[Stripe Checkout]", err);
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
        sendBookingConfirmationToCustomer(updatedBooking, calc).catch(() => {});
        sendBookingNotificationToBusiness(updatedBooking, calc).catch(() => {});
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
      console.error("[Booking Confirm]", err);
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
      if (!["pending", "confirmed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const booking = await storage.getBookingById(bookingId);
      if (!booking || booking.calculator_id !== calc.id) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const updated = await storage.updateBookingStatus(bookingId, status);

      if (status === "confirmed" && booking.status !== "confirmed") {
        sendBookingConfirmationToCustomer(updated!, calc).catch(() => {});
        sendBookingNotificationToBusiness(updated!, calc).catch(() => {});
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
