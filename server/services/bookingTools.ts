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
 * Uses the internal storage layer directly for slot lookup and booking
 * creation via the existing calculator-based booking infrastructure.
 */

import { storage } from "../storage";
import { createLogger } from "../lib/logger";

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

/* ─── Slot generation helper ─── */

function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  existingBookings: { time: string; duration_minutes: number }[],
): string[] {
  const [startH, startM] = (startTime || "09:00").split(":").map(Number);
  const [endH, endM] = (endTime || "17:00").split(":").map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) return [];
  if (!durationMinutes || durationMinutes <= 0) return [];

  const bookedRanges = existingBookings.map((b) => {
    const [bh, bm] = b.time.split(":").map(Number);
    const bStart = bh * 60 + bm;
    return { start: bStart, end: bStart + b.duration_minutes };
  });

  const slots: string[] = [];
  let current = startMinutes;

  while (current + durationMinutes <= endMinutes) {
    const slotEnd = current + durationMinutes;
    const overlaps = bookedRanges.some(
      (r) => current < r.end + bufferMinutes && slotEnd > r.start - bufferMinutes,
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

/* ─── Time display helper ─── */

function formatTimeDisplay(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
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
 */
export async function executeCheckAvailability(
  calculatorId: number,
  args: Record<string, unknown>,
): Promise<BookingToolResult> {
  try {
    const calc = await storage.getCalculatorById(calculatorId);
    if (!calc) {
      return { success: false, data: {}, narrative: "I couldn't find the booking calendar. Let me take your details instead." };
    }

    const settings = (calc.calculator_settings as Record<string, unknown>) || {};
    const bookingSettings = (settings.booking_settings as Record<string, unknown>) || {};
    if (!bookingSettings.enabled) {
      return { success: false, data: {}, narrative: "Online booking is not currently available. I can take your details and have someone call you back." };
    }

    const startDate = (args.date as string) || new Date().toISOString().split("T")[0];
    const days = (args.days as number) || 7;
    const avail = (bookingSettings.availability as Record<string, unknown>) || {};
    const workingDays: string[] = (avail.working_days as string[]) || ["mon", "tue", "wed", "thu", "fri"];
    const startTime = (avail.start_time as string) || "09:00";
    const endTime = (avail.end_time as string) || "17:00";
    const duration = (bookingSettings.slot_duration_minutes as number) || 60;
    const buffer = (avail.buffer_minutes as number) || 0;

    const today = new Date().toISOString().split("T")[0];
    const allSlots: { date: string; day: string; slots: string[] }[] = [];

    for (let d = 0; d < days; d++) {
      const checkDate = new Date(startDate + "T12:00:00");
      checkDate.setDate(checkDate.getDate() + d);
      const dateStr = checkDate.toISOString().split("T")[0];

      if (dateStr < today) continue;

      const dayOfWeek = checkDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
      const dayMap: Record<string, string> = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
      if (!workingDays.includes(dayMap[dayOfWeek])) continue;

      const existingBookings = await storage.getConfirmedBookingsForDate(calculatorId, dateStr);
      const daySlots = generateTimeSlots(startTime, endTime, duration, buffer, existingBookings);

      if (daySlots.length > 0) {
        const dayName = checkDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        allSlots.push({ date: dateStr, day: dayName, slots: daySlots });
      }
    }

    if (allSlots.length === 0) {
      return {
        success: true,
        data: { slots: [] },
        narrative: `I checked the next ${days} days and unfortunately there are no available slots. Would you like me to check further out, or take your details so we can arrange a time?`,
      };
    }

    const slotLines = allSlots.map((dayInfo) => {
      const times = dayInfo.slots.map((t) => {
        const [h, m] = t.split(":").map(Number);
        return formatTimeDisplay(h, m);
      });
      return `${dayInfo.day}: ${times.join(", ")}`;
    });

    const narrative = `Here are the available appointment times:\n\n${slotLines.join("\n")}\n\nWhich time works best for you?`;

    return {
      success: true,
      data: { slots: allSlots },
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
 */
export async function executeCreateBooking(
  calculatorId: number,
  args: Record<string, unknown>,
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

    const calc = await storage.getCalculatorById(calculatorId);
    if (!calc) {
      return { success: false, data: {}, narrative: "I couldn't find the booking system. Let me take your details and have someone call you back." };
    }

    const settings = (calc.calculator_settings as Record<string, unknown>) || {};
    const bookingSettings = (settings.booking_settings as Record<string, unknown>) || {};
    if (!bookingSettings.enabled) {
      return { success: false, data: {}, narrative: "Online booking is not currently available. I've noted your details and someone will be in touch." };
    }

    const startDateTime = new Date(startTime);
    if (isNaN(startDateTime.getTime())) {
      return {
        success: false,
        data: {},
        narrative: "I couldn't understand that time. Could you tell me the date and time you'd like? For example, 'Tuesday at 2 PM'.",
      };
    }

    const dateStr = startDateTime.toISOString().split("T")[0];
    const hours = startDateTime.getHours();
    const minutes = startDateTime.getMinutes();
    const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    const duration = (bookingSettings.slot_duration_minutes as number) || 60;

    // Check for slot conflicts
    const existingBookings = await storage.getConfirmedBookingsForDate(calculatorId, dateStr);
    const avail = (bookingSettings.availability as Record<string, unknown>) || {};
    const buffer = (avail.buffer_minutes as number) || 0;
    const bookStart = hours * 60 + minutes;
    const bookEnd = bookStart + duration;

    const overlap = existingBookings.some((eb) => {
      const [eh, em] = eb.time.split(":").map(Number);
      const eStart = eh * 60 + em;
      const eEnd = eStart + eb.duration_minutes;
      return bookStart < eEnd + buffer && bookEnd > eStart - buffer;
    });

    if (overlap) {
      return {
        success: false,
        data: {},
        narrative: "Unfortunately that time slot is no longer available. Would you like me to check what other times are open?",
      };
    }

    const service = args.service as string | undefined;
    const notes = args.notes as string | undefined;
    const notesParts: string[] = [];
    if (service) notesParts.push(`Service: ${service}`);
    if (notes) notesParts.push(notes);
    const combinedNotes = notesParts.length > 0 ? notesParts.join(". ") : null;

    const booking = await storage.createBooking({
      calculator_id: calculatorId,
      customer_name: customerName.trim(),
      customer_email: (args.customer_email as string)?.trim() || null,
      customer_phone: (args.customer_phone as string)?.trim() || null,
      date: dateStr,
      time: timeStr,
      duration_minutes: duration,
      status: "confirmed",
      notes: combinedNotes,
    });

    // Send confirmation emails in the background
    try {
      const { sendBookingConfirmationToCustomer, sendBookingNotificationToBusiness } = await import("../bookingEmails");
      sendBookingConfirmationToCustomer(booking, calc).catch(() => {});
      sendBookingNotificationToBusiness(booking, calc).catch(() => {});
    } catch {
      log.debug("Booking email module not available");
    }

    const displayTime = formatTimeDisplay(hours, minutes);
    const displayDate = startDateTime.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const narrative = `Your appointment is confirmed! Here are the details:\n\nDate: ${displayDate}\nTime: ${displayTime}${service ? `\nService: ${service}` : ""}\n\nWe look forward to seeing you then!`;

    return {
      success: true,
      data: {
        booking_id: booking.id,
        date: dateStr,
        time: timeStr,
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
