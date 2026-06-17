/**
 * Booking tool definitions and executors for AI chat and voice.
 *
 * Provides two tools:
 * - check_availability: Queries available appointment slots
 * - create_booking: Creates a booking appointment
 *
 * These tools are injected into TradeLine AI chat (Anthropic tool_use),
 * Vapi voice (function calling), and WhatsApp/SMS conversations.
 *
 * Booking consolidation (PR5 — the CI-gated TradeLine VOICE path): both
 * executors are now repointed onto the single BookFlow authority. They used to
 * read availability from the calculator's `booking_settings` + write the
 * `bookings` table via `storage.createBooking` — a divergent path that never
 * reached Dispatch and got no email / SMS lifecycle, and (per
 * tradelineBooking.test.ts) was the exact path where a wiring slip once let the
 * AI claim "booked" while nothing persisted. Now:
 *   - executeCheckAvailability → bookflowService.getAvailableSlots
 *   - executeCreateBooking     → createBookingForCalculator(source:'tradeline_voice')
 * Both resolve the owning client via resolveClientForCalculator. The executor
 * signatures `(calculatorId, args)` are UNCHANGED so the vapiService agent-loop
 * wiring + the DI seam the gate test relies on are untouched.
 *
 * GRACEFUL ERRORS: a missing client (BookingFacadeError 'no_client') or a
 * deactivated trade (engine Error "BookFlow is not active for this client") is
 * surfaced as the executor's normal "couldn't book / unavailable" result so the
 * AI tells the caller it could NOT book — NEVER a false "booked", NEVER a bare
 * catch (no-silent-catch guard; the existing noisyCatch / log.error patterns are
 * preserved).
 */

import { createLogger } from "../lib/logger";
import {
  createBookingForCalculator as realCreateBooking,
  BookingFacadeError,
  type CreateBookingForCalculatorInput,
} from "./booking/createBookingForCalculator";
import { resolveClientForCalculator as realResolveClient } from "./booking/resolveClientForCalculator";
import type { BookflowAppointment } from "@shared/schema";
import type { TimeSlot } from "./booking/bookflowService";

const log = createLogger("BookingTools");

/* ─── Anthropic tool definitions (for AI chat) ─── */

export interface BookingTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export const CHECK_AVAILABILITY_TOOL: BookingTool = {
  name: "check_availability",
  description:
    "Check available appointment slots for booking. Use when a customer asks about availability or wants to schedule/book an appointment.",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format. Defaults to today.",
      },
      days: {
        type: "number",
        description: "Number of days to check. Default 7.",
      },
    },
  },
};

export const CREATE_BOOKING_TOOL: BookingTool = {
  name: "create_booking",
  description:
    "Book an appointment for the customer. Use after confirming the time slot with the customer.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: {
        type: "string",
        description: "Customer's full name",
      },
      customer_phone: {
        type: "string",
        description: "Customer's phone number",
      },
      customer_email: {
        type: "string",
        description: "Customer's email (optional)",
      },
      start_time: {
        type: "string",
        description: "Appointment start time in ISO format",
      },
      service: {
        type: "string",
        description: "Type of service requested",
      },
      notes: {
        type: "string",
        description: "Any additional notes",
      },
    },
    required: ["customer_name", "start_time"],
  },
};

export const BOOKING_TOOLS: BookingTool[] = [CHECK_AVAILABILITY_TOOL, CREATE_BOOKING_TOOL];

/* ─── Vapi function definitions (OpenAI-style for Vapi) ─── */

export const VAPI_CHECK_AVAILABILITY_FUNCTION = {
  name: "checkAvailability",
  description: "Check available appointment times for a given date range",
  parameters: {
    type: "object" as const,
    properties: {
      date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format. Defaults to today.",
      },
      days: {
        type: "number",
        description: "Number of days to check. Default 7.",
      },
    },
  },
};

export const VAPI_CREATE_BOOKING_FUNCTION = {
  name: "createBooking",
  description: "Book an appointment for the caller",
  parameters: {
    type: "object" as const,
    properties: {
      customer_name: {
        type: "string",
        description: "Customer's full name",
      },
      customer_phone: {
        type: "string",
        description: "Customer's phone number",
      },
      customer_email: {
        type: "string",
        description: "Customer's email (optional)",
      },
      start_time: {
        type: "string",
        description: "Appointment start time in ISO format",
      },
      service: {
        type: "string",
        description: "Type of service requested",
      },
      notes: {
        type: "string",
        description: "Any additional notes",
      },
    },
    required: ["customer_name", "start_time"],
  },
};

export const VAPI_BOOKING_FUNCTIONS = [
  VAPI_CHECK_AVAILABILITY_FUNCTION,
  VAPI_CREATE_BOOKING_FUNCTION,
];

/* ─── Booking DI seam (DB-free unit-testable) ──────────────────────────────
 * Booking consolidation (PR5): every collaborator that touches the DB / the
 * BookFlow engine is injected here so the executors stay DB-free unit-testable,
 * mirroring the seam in widgetSchedulingRoutes.ts / customerWidgetTools.ts. The
 * default deps wire the real implementations. (The gate test drives the WHOLE
 * executor through vapiService's TradeLineTurnDeps seam and asserts the
 * resulting bookflow_appointments row + source — it does not need to inject
 * here, but keeping the seam matches PR3/PR4 and keeps the engine import lazy.) */

export interface BookingToolsDeps {
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

export const defaultBookingToolsDeps: BookingToolsDeps = {
  resolveClientForCalculator: (calculatorId) => realResolveClient(calculatorId),
  async getAvailableSlots(clientId, date, days) {
    const { getAvailableSlots } = await import("./booking/bookflowService");
    return getAvailableSlots(clientId, date, days);
  },
  createBookingForCalculator: (calculatorId, input) => realCreateBooking(calculatorId, input),
};

/**
 * Recognise the graceful "booking unavailable" conditions raised by the
 * consolidation façade / native engine, so the executor returns its normal
 * "couldn't book / unavailable" tool result instead of throwing. Returns a
 * caller-facing reason, or null when the error is a genuine fault that should
 * propagate to the executor's catch (logged, then a safe take-a-message reply).
 *
 * Mirrors widgetSchedulingRoutes.unavailableReason (PR3) /
 * customerWidgetTools.bookingUnavailableReason (PR4).
 */
function bookingUnavailableReason(err: unknown): string | null {
  if (err instanceof BookingFacadeError && err.code === "no_client") {
    return "Online booking isn't set up for this business yet.";
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

/* ─── Time display helper ─── */

function formatTimeDisplay(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

/** YYYY-MM-DD for a Date in local time — the start date getAvailableSlots scans from. */
function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ─── Tool result type ─── */

export interface BookingToolResult {
  success: boolean;
  data: Record<string, unknown>;
  narrative: string;
}

/**
 * Execute check_availability for a given calculator ID.
 * Returns available slots formatted as natural language.
 *
 * PR5: reads slots from the SAME BookFlow source the booking writes to (single
 * availability authority) via resolveClientForCalculator → getAvailableSlots.
 */
export async function executeCheckAvailability(
  calculatorId: number,
  args: Record<string, unknown>,
  deps: BookingToolsDeps = defaultBookingToolsDeps,
): Promise<BookingToolResult> {
  try {
    const startDate = (args.date as string) || dateString(new Date());
    const days = (args.days as number) || 7;

    // Resolve the calculator's owning client, then read slots from BookFlow.
    let slots: TimeSlot[] = [];
    try {
      const clientId = await deps.resolveClientForCalculator(calculatorId);
      if (!clientId) {
        // No linked client → BookFlow can't be configured → no online booking.
        return {
          success: false,
          data: {},
          narrative: "Online booking is not currently available. I can take your details and have someone call you back.",
        };
      }
      // getAvailableSlots returns ONLY available slots, and [] when BookFlow is
      // inactive for the client — the same empty-grid signal as before.
      slots = await deps.getAvailableSlots(clientId, startDate, days);
    } catch (err: unknown) {
      // Graceful: a known unavailable condition → "couldn't check" result, not a
      // throw. Logged via the existing logger (no bare catch — no-silent-catch).
      const reason = bookingUnavailableReason(err);
      if (reason) {
        log.warn("check_availability unavailable", {
          calculatorId: String(calculatorId),
          reason,
          error: (err as Error)?.message,
        });
        return {
          success: false,
          data: {},
          narrative: "Online booking is not currently available. I can take your details and have someone call you back.",
        };
      }
      throw err;
    }

    if (slots.length === 0) {
      return {
        success: true,
        data: { slots: [] },
        narrative: `I checked the next ${days} days and unfortunately there are no available slots. Would you like me to check further out, or take your details so we can arrange a time?`,
      };
    }

    // Group the ISO slots by calendar day for a natural-language read-back.
    const byDay = new Map<string, { label: string; times: string[] }>();
    for (const slot of slots) {
      const start = new Date(slot.start);
      if (isNaN(start.getTime())) continue;
      const key = dateString(start);
      if (!byDay.has(key)) {
        const label = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        byDay.set(key, { label, times: [] });
      }
      byDay.get(key)!.times.push(formatTimeDisplay(start.getHours(), start.getMinutes()));
    }

    const slotLines = Array.from(byDay.values()).map(
      (dayInfo) => `${dayInfo.label}: ${dayInfo.times.join(", ")}`,
    );

    const narrative = `Here are the available appointment times:\n\n${slotLines.join("\n")}\n\nWhich time works best for you?`;

    return {
      success: true,
      data: { slots },
      narrative,
    };
  } catch (err) {
    log.error("check_availability failed", { calculatorId: String(calculatorId), error: (err as Error).message });
    return {
      success: false,
      data: {},
      narrative: "I had trouble checking the calendar. Can I take your details and have someone call you back to arrange a time?",
    };
  }
}

/**
 * Execute create_booking for a given calculator ID.
 * Returns confirmation formatted as natural language.
 *
 * PR5: routes the booking through the single BookFlow façade
 * (createBookingForCalculator, source:'tradeline_voice') so it lands a real
 * `bookflow_appointments` row (Dispatch + confirmation email + 4-stage SMS
 * lifecycle, all via the native engine, which also re-checks availability with
 * the race-safe conflict guard). The AI can NEVER falsely claim "booked": the
 * confirmation narrative is only returned AFTER the façade resolves a persisted
 * row; any failure returns success:false with an honest "couldn't book" reply.
 */
export async function executeCreateBooking(
  calculatorId: number,
  args: Record<string, unknown>,
  deps: BookingToolsDeps = defaultBookingToolsDeps,
): Promise<BookingToolResult> {
  try {
    const customerName = args.customer_name as string | undefined;
    const startTime = args.start_time as string | undefined;

    if (!customerName || !startTime) {
      return {
        success: false,
        data: {},
        narrative: "I need your name and preferred appointment time to make the booking. Could you provide those?",
      };
    }

    const startDateTime = new Date(startTime);
    if (isNaN(startDateTime.getTime())) {
      return {
        success: false,
        data: {},
        narrative: "I couldn't understand that time. Could you tell me the date and time you'd like? For example, 'Tuesday at 2 PM'.",
      };
    }

    const service = args.service as string | undefined;
    const notes = args.notes as string | undefined;
    const notesParts: string[] = [];
    if (service) notesParts.push(`Service: ${service}`);
    if (notes) notesParts.push(notes);
    const combinedNotes = notesParts.length > 0 ? notesParts.join(". ") : undefined;

    // Route through the single BookFlow façade. The façade resolves the client,
    // ensures settings, and the native engine re-checks availability + applies
    // the race-safe conflict guard, sends the confirmation email, and arms the
    // SMS lifecycle. On a missing client / deactivated trade the façade/engine
    // throws — handled below as a graceful "couldn't book", NEVER a false success.
    let appointment: BookflowAppointment;
    try {
      appointment = await deps.createBookingForCalculator(calculatorId, {
        customerName: customerName.trim(),
        customerEmail: (args.customer_email as string)?.trim() || undefined,
        customerPhone: (args.customer_phone as string)?.trim() || undefined,
        serviceName: service,
        startTime,
        notes: combinedNotes,
        source: "tradeline_voice",
      });
    } catch (err: unknown) {
      // GRACEFUL ERRORS (PR2-flagged): no linked client (BookingFacadeError
      // 'no_client') / BookFlow deactivated / slot just taken → the executor's
      // normal "couldn't book / unavailable" result so the AI tells the caller it
      // could NOT book. NOT a throw, NOT a bare catch (no-silent-catch — logged
      // via the existing logger), and NEVER a false "booked".
      const reason = bookingUnavailableReason(err);
      if (reason) {
        const slotTaken =
          (err as Error)?.message === "This time slot is no longer available. Please choose another time.";
        log.warn("create_booking unavailable", {
          calculatorId: String(calculatorId),
          reason,
          error: (err as Error)?.message,
        });
        return {
          success: false,
          data: {},
          narrative: slotTaken
            ? "Unfortunately that time slot is no longer available. Would you like me to check what other times are open?"
            : "Online booking is not currently available. I've noted your details and someone will be in touch.",
        };
      }
      // Genuine fault → propagate to the outer catch (logged, safe fallback).
      throw err;
    }

    const start =
      appointment.start_time instanceof Date
        ? appointment.start_time
        : new Date(appointment.start_time as unknown as string);
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const displayTime = formatTimeDisplay(hours, minutes);
    const displayDate = start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const narrative = `Your appointment is confirmed! Here are the details:\n\nDate: ${displayDate}\nTime: ${displayTime}${service ? `\nService: ${service}` : ""}\n\nWe look forward to seeing you then!`;

    return {
      success: true,
      data: {
        booking_id: appointment.id,
        date: dateString(start),
        time: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
        service,
      },
      narrative,
    };
  } catch (err) {
    log.error("create_booking failed", { calculatorId: String(calculatorId), error: (err as Error).message });
    return {
      success: false,
      data: {},
      narrative: "I had trouble creating the booking. Let me take your details and have someone confirm the appointment with you directly.",
    };
  }
}
