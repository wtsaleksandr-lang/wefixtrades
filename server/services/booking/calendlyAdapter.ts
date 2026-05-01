/**
 * Calendly adapter for the booking engine.
 *
 * Uses Calendly API v2:
 * - getAvailableSlots: GET /event_type_available_times
 * - createBooking: Calendly does not support API-based booking creation,
 *   so we generate a pre-filled scheduling link instead.
 *
 * Auth is via OAuth2 token or personal access token stored in credentials.
 */

import type { CalendarConnection } from "@shared/schema";
import type { CalendarAdapter, TimeSlot, BookingRequest, BookingResult } from "./calendarAdapter";
import { decryptToken } from "../../lib/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("CalendlyAdapter");

const CALENDLY_API_BASE = "https://api.calendly.com";

function getAccessToken(connection: CalendarConnection): string {
  const creds = connection.credentials as Record<string, unknown> | null;
  if (!creds) {
    throw new Error("No Calendly credentials stored for this connection");
  }

  // Support both OAuth tokens and personal access tokens
  const token = creds.access_token || creds.personal_access_token || creds.api_key;
  if (typeof token !== "string") {
    throw new Error("No valid Calendly access token found in credentials");
  }
  return decryptToken(token);
}

function getEventTypeUri(connection: CalendarConnection): string {
  // calendar_id stores the full Calendly event type URI
  // e.g. "https://api.calendly.com/event_types/abc123"
  if (!connection.calendar_id) {
    throw new Error("No Calendly event type URI configured (calendar_id)");
  }
  return connection.calendar_id;
}

export class CalendlyAdapter implements CalendarAdapter {
  platform = "calendly";

  async getAvailableSlots(connection: CalendarConnection, date: string, days: number = 7): Promise<TimeSlot[]> {
    const token = getAccessToken(connection);
    const eventTypeUri = getEventTypeUri(connection);

    const startTime = new Date(`${date}T00:00:00Z`).toISOString();
    const endDate = new Date(new Date(date).getTime() + days * 86400000);
    const endTime = endDate.toISOString();

    const params = new URLSearchParams({
      event_type: eventTypeUri,
      start_time: startTime,
      end_time: endTime,
    });

    try {
      const response = await fetch(
        `${CALENDLY_API_BASE}/event_type_available_times?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error("Calendly availability API error", {
          status: String(response.status),
          body: errorText,
        });
        throw new Error(`Calendly API returned ${response.status}`);
      }

      const data = await response.json() as {
        collection?: Array<{
          status: string;
          start_time: string;
          invitees_remaining?: number;
        }>;
      };

      const slotDuration = connection.slot_duration_minutes ?? 60;
      const allSlots: TimeSlot[] = [];

      if (data.collection) {
        for (const slot of data.collection) {
          const startDate = new Date(slot.start_time);
          const endDate = new Date(startDate.getTime() + slotDuration * 60000);
          allSlots.push({
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            available: slot.status === "available",
          });
        }
      }

      return allSlots;
    } catch (err: any) {
      log.error("Failed to fetch Calendly availability", {
        error: err.message,
        clientId: String(connection.client_id),
      });
      throw new Error(`Calendly API error: ${err.message}`);
    }
  }

  async createBooking(connection: CalendarConnection, booking: BookingRequest): Promise<BookingResult> {
    // Calendly does not support API-based booking creation.
    // Instead, generate a pre-filled scheduling link.

    const bookingUrl = connection.booking_url;
    if (!bookingUrl) {
      log.warn("No booking_url configured for Calendly connection, cannot generate scheduling link", {
        clientId: String(connection.client_id),
      });
      return {
        success: false,
        error: "No Calendly booking URL configured. Set booking_url on the calendar connection.",
      };
    }

    // Build pre-filled link with customer details
    const params = new URLSearchParams();
    if (booking.customerName) params.set("name", booking.customerName);
    if (booking.customerEmail) params.set("email", booking.customerEmail);

    const separator = bookingUrl.includes("?") ? "&" : "?";
    const confirmationUrl = `${bookingUrl}${separator}${params.toString()}`;

    log.info("Calendly scheduling link generated", {
      clientId: String(booking.clientId),
    });

    return {
      success: true,
      confirmationUrl,
    };
  }

  // Calendly does not support direct cancellation via our integration
}
