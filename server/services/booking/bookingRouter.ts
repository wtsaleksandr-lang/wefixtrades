/**
 * Booking router — routes booking requests to the correct calendar adapter
 * based on the client's active calendar connection platform.
 *
 * Exports high-level functions:
 * - getAvailableSlots(clientId, date, days?)
 * - createBooking(clientId, bookingRequest)
 *
 * Falls back to returning the client's booking_url if no API integration exists.
 */

import { storage } from "../../storage";
import type { CalendarConnection } from "@shared/schema";
import type { CalendarAdapter, TimeSlot, BookingRequest, BookingResult } from "./calendarAdapter";
import { GoogleCalendarAdapter } from "./googleCalendarAdapter";
import { CalComAdapter } from "./calComAdapter";
import { CalendlyAdapter } from "./calendlyAdapter";
import { createLogger } from "../../lib/logger";

const log = createLogger("BookingRouter");

// Singleton adapter instances
const adapters: Record<string, CalendarAdapter> = {
  google_calendar: new GoogleCalendarAdapter(),
  cal_com: new CalComAdapter(),
  calendly: new CalendlyAdapter(),
};

function getAdapter(platform: string): CalendarAdapter | null {
  return adapters[platform] || null;
}

/**
 * Get available time slots for a client's calendar.
 *
 * Returns available slots from the connected calendar platform.
 * If no API adapter exists (manual/jobber), returns an empty array.
 */
export async function getAvailableSlots(
  clientId: number,
  date: string,
  days: number = 7,
): Promise<{ slots: TimeSlot[]; connection: CalendarConnection | null; fallbackUrl?: string }> {
  const connection = await storage.getCalendarConnection(clientId);

  if (!connection) {
    log.debug("No active calendar connection for client", { clientId: String(clientId) });
    return { slots: [], connection: null };
  }

  const adapter = getAdapter(connection.platform);

  if (!adapter) {
    // Platform is "manual" or "jobber" — no API integration
    log.debug("No adapter for platform, returning fallback", {
      platform: connection.platform,
      clientId: String(clientId),
    });
    return {
      slots: [],
      connection,
      fallbackUrl: connection.booking_url || undefined,
    };
  }

  try {
    const slots = await adapter.getAvailableSlots(connection, date, days);
    return { slots, connection };
  } catch (err: any) {
    log.error("Adapter failed to fetch slots", {
      platform: connection.platform,
      clientId: String(clientId),
      error: err.message,
    });
    // Return empty slots with fallback URL on error
    return {
      slots: [],
      connection,
      fallbackUrl: connection.booking_url || undefined,
    };
  }
}

/**
 * Create a booking on the client's connected calendar.
 *
 * Routes to the correct adapter based on platform.
 * For manual/unsupported platforms, returns the booking_url as a confirmation link.
 */
export async function createBooking(
  clientId: number,
  booking: BookingRequest,
): Promise<BookingResult> {
  const connection = await storage.getCalendarConnection(clientId);

  if (!connection) {
    log.warn("No active calendar connection for booking creation", {
      clientId: String(clientId),
    });
    return {
      success: false,
      error: "No calendar connection configured for this client",
    };
  }

  const adapter = getAdapter(connection.platform);

  if (!adapter) {
    // For manual/jobber platforms, return the booking URL if available
    if (connection.booking_url) {
      log.info("No adapter for platform, returning booking URL", {
        platform: connection.platform,
        clientId: String(clientId),
      });
      return {
        success: true,
        confirmationUrl: connection.booking_url,
      };
    }
    return {
      success: false,
      error: `Platform "${connection.platform}" does not support API-based booking creation`,
    };
  }

  try {
    const result = await adapter.createBooking(connection, booking);
    return result;
  } catch (err: any) {
    log.error("Adapter failed to create booking", {
      platform: connection.platform,
      clientId: String(clientId),
      error: err.message,
    });
    return {
      success: false,
      error: `Failed to create booking: ${err.message}`,
    };
  }
}

/**
 * Cancel a booking on the client's connected calendar.
 */
export async function cancelBooking(
  clientId: number,
  bookingId: string,
): Promise<boolean> {
  const connection = await storage.getCalendarConnection(clientId);

  if (!connection) {
    log.warn("No active calendar connection for booking cancellation", {
      clientId: String(clientId),
    });
    return false;
  }

  const adapter = getAdapter(connection.platform);
  if (!adapter || !adapter.cancelBooking) {
    log.warn("Platform does not support booking cancellation", {
      platform: connection.platform,
      clientId: String(clientId),
    });
    return false;
  }

  try {
    return await adapter.cancelBooking(connection, bookingId);
  } catch (err: any) {
    log.error("Adapter failed to cancel booking", {
      platform: connection.platform,
      clientId: String(clientId),
      error: err.message,
    });
    return false;
  }
}
