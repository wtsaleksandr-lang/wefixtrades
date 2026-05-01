/**
 * Cal.com adapter for the booking engine.
 *
 * Uses Cal.com REST API v1:
 * - getAvailableSlots: GET /v1/availability with apiKey + eventTypeId
 * - createBooking: POST /v1/bookings
 *
 * Auth is via simple API key stored in calendarConnections.credentials.
 */

import type { CalendarConnection } from "@shared/schema";
import type { CalendarAdapter, TimeSlot, BookingRequest, BookingResult } from "./calendarAdapter";
import { decryptToken } from "../../lib/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("CalComAdapter");

const CAL_COM_BASE_URL = "https://api.cal.com/v1";

function getApiKey(connection: CalendarConnection): string {
  const creds = connection.credentials as Record<string, unknown> | null;
  if (!creds || typeof creds.api_key !== "string") {
    throw new Error("No Cal.com API key stored for this connection");
  }
  return decryptToken(creds.api_key);
}

function getEventTypeId(connection: CalendarConnection): string {
  if (!connection.calendar_id) {
    throw new Error("No Cal.com event type ID configured (calendar_id)");
  }
  return connection.calendar_id;
}

export class CalComAdapter implements CalendarAdapter {
  platform = "cal_com";

  async getAvailableSlots(connection: CalendarConnection, date: string, days: number = 7): Promise<TimeSlot[]> {
    const apiKey = getApiKey(connection);
    const eventTypeId = getEventTypeId(connection);

    const dateFrom = date;
    const dateTo = new Date(new Date(date).getTime() + days * 86400000).toISOString().slice(0, 10);

    const params = new URLSearchParams({
      apiKey,
      eventTypeId,
      dateFrom,
      dateTo,
    });

    try {
      const response = await fetch(`${CAL_COM_BASE_URL}/availability?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Cal.com availability API error", {
          status: String(response.status),
          body: errorText,
        });
        throw new Error(`Cal.com API returned ${response.status}`);
      }

      const data = await response.json() as {
        slots?: Record<string, Array<{ time: string }>>;
      };

      const slotDuration = connection.slot_duration_minutes ?? 60;
      const allSlots: TimeSlot[] = [];

      if (data.slots) {
        for (const [_dateKey, dateSlots] of Object.entries(data.slots)) {
          for (const slot of dateSlots) {
            const startTime = new Date(slot.time);
            const endTime = new Date(startTime.getTime() + slotDuration * 60000);
            allSlots.push({
              start: startTime.toISOString(),
              end: endTime.toISOString(),
              available: true,
            });
          }
        }
      }

      return allSlots;
    } catch (err: any) {
      log.error("Failed to fetch Cal.com availability", {
        error: err.message,
        clientId: String(connection.client_id),
      });
      throw new Error(`Cal.com API error: ${err.message}`);
    }
  }

  async createBooking(connection: CalendarConnection, booking: BookingRequest): Promise<BookingResult> {
    const apiKey = getApiKey(connection);
    const eventTypeId = getEventTypeId(connection);

    try {
      const response = await fetch(`${CAL_COM_BASE_URL}/bookings?apiKey=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: parseInt(eventTypeId),
          start: booking.startTime,
          end: booking.endTime,
          name: booking.customerName,
          email: booking.customerEmail || "noreply@wefixtrades.com",
          notes: booking.notes || undefined,
          metadata: {
            phone: booking.customerPhone,
            service: booking.service,
            source: "wefixtrades",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Cal.com booking creation failed", {
          status: String(response.status),
          body: errorText,
        });
        return {
          success: false,
          error: `Cal.com API returned ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json() as {
        id?: number;
        uid?: string;
      };

      log.info("Cal.com booking created", {
        bookingId: String(result.uid || result.id),
        clientId: String(booking.clientId),
      });

      return {
        success: true,
        bookingId: String(result.uid || result.id),
      };
    } catch (err: any) {
      log.error("Failed to create Cal.com booking", {
        error: err.message,
        clientId: String(booking.clientId),
      });
      return {
        success: false,
        error: `Cal.com API error: ${err.message}`,
      };
    }
  }

  async cancelBooking(connection: CalendarConnection, bookingId: string): Promise<boolean> {
    const apiKey = getApiKey(connection);

    try {
      const response = await fetch(`${CAL_COM_BASE_URL}/bookings/${bookingId}/cancel?apiKey=${apiKey}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        log.error("Cal.com booking cancellation failed", {
          status: String(response.status),
          bookingId,
        });
        return false;
      }

      log.info("Cal.com booking cancelled", { bookingId });
      return true;
    } catch (err: any) {
      log.error("Failed to cancel Cal.com booking", {
        error: err.message,
        bookingId,
      });
      return false;
    }
  }
}
