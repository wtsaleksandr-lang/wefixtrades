/**
 * Google Calendar adapter for the booking engine.
 *
 * Uses googleapis for Google Calendar API:
 * - getAvailableSlots: calls freebusy.query, then generates slots from working_hours minus busy periods
 * - createBooking: creates a calendar event via events.insert
 * - cancelBooking: deletes or cancels a calendar event
 *
 * Credentials come from calendarConnections.credentials (encrypted via tokenEncryption).
 * Follows the same OAuth pattern as server/services/googleBusinessService.ts.
 */

import { google, calendar_v3 } from "googleapis";
import type { CalendarConnection } from "@shared/schema";
import type { CalendarAdapter, TimeSlot, BookingRequest, BookingResult } from "./calendarAdapter";
import { decryptToken } from "../../lib/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("GoogleCalendarAdapter");

interface WorkingHoursDay {
  start: string; // "08:00"
  end: string;   // "17:00"
}

type WorkingHours = Record<string, WorkingHoursDay>;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

function createOAuth2Client(connection: CalendarConnection) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_BUSINESS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured for calendar integration");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);

  const creds = connection.credentials as Record<string, unknown> | null;
  if (!creds) {
    throw new Error("No credentials stored for this calendar connection");
  }

  // Decrypt tokens if encrypted
  const accessToken = typeof creds.access_token === "string" ? decryptToken(creds.access_token) : undefined;
  const refreshToken = typeof creds.refresh_token === "string" ? decryptToken(creds.refresh_token) : undefined;

  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: typeof creds.expiry_date === "number" ? creds.expiry_date : undefined,
    token_type: typeof creds.token_type === "string" ? creds.token_type : "Bearer",
  });

  return oauth2;
}

function getCalendarId(connection: CalendarConnection): string {
  return connection.calendar_id || "primary";
}

function getWorkingHours(connection: CalendarConnection): WorkingHours {
  const raw = connection.working_hours as WorkingHours | null;
  return raw && typeof raw === "object" ? { ...DEFAULT_WORKING_HOURS, ...raw } : DEFAULT_WORKING_HOURS;
}

/**
 * Parse "HH:MM" to minutes from midnight.
 */
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Generate available time slots for a single day, subtracting busy periods.
 */
function generateSlots(
  dateStr: string,
  workingHours: WorkingHoursDay,
  busyPeriods: { start: Date; end: Date }[],
  slotDuration: number,
  buffer: number,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMin = parseTime(workingHours.start);
  const endMin = parseTime(workingHours.end);

  if (startMin >= endMin) return slots;

  let current = startMin;
  while (current + slotDuration <= endMin) {
    const slotStartHour = Math.floor(current / 60);
    const slotStartMin = current % 60;
    const slotEndTotal = current + slotDuration;
    const slotEndHour = Math.floor(slotEndTotal / 60);
    const slotEndMin = slotEndTotal % 60;

    const slotStartStr = `${dateStr}T${String(slotStartHour).padStart(2, "0")}:${String(slotStartMin).padStart(2, "0")}:00`;
    const slotEndStr = `${dateStr}T${String(slotEndHour).padStart(2, "0")}:${String(slotEndMin).padStart(2, "0")}:00`;

    const slotStart = new Date(slotStartStr);
    const slotEnd = new Date(slotEndStr);

    // Check for overlap with busy periods
    const isBusy = busyPeriods.some(bp =>
      slotStart < bp.end && slotEnd > bp.start,
    );

    slots.push({
      start: slotStartStr,
      end: slotEndStr,
      available: !isBusy,
    });

    current += slotDuration + buffer;
  }

  return slots;
}

export class GoogleCalendarAdapter implements CalendarAdapter {
  platform = "google_calendar";

  async getAvailableSlots(connection: CalendarConnection, date: string, days: number = 7): Promise<TimeSlot[]> {
    const auth = createOAuth2Client(connection);
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = getCalendarId(connection);
    const workingHours = getWorkingHours(connection);
    const slotDuration = connection.slot_duration_minutes ?? 60;
    const buffer = connection.buffer_minutes ?? 15;
    const timezone = connection.timezone ?? "America/New_York";

    // Build date range
    const startDate = new Date(`${date}T00:00:00`);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    try {
      // Query freebusy for the date range
      const freebusyResponse = await calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          timeZone: timezone,
          items: [{ id: calendarId }],
        },
      });

      const busyPeriods: { start: Date; end: Date }[] = [];
      const calendarBusy = freebusyResponse.data.calendars?.[calendarId]?.busy || [];
      for (const bp of calendarBusy) {
        if (bp.start && bp.end) {
          busyPeriods.push({ start: new Date(bp.start), end: new Date(bp.end) });
        }
      }

      // Generate slots for each day in the range
      const allSlots: TimeSlot[] = [];
      const currentDate = new Date(startDate);

      while (currentDate < endDate) {
        const dayName = DAY_NAMES[currentDate.getDay()];
        const dayHours = workingHours[dayName];

        if (dayHours) {
          const dateStr = currentDate.toISOString().slice(0, 10);
          const daySlots = generateSlots(dateStr, dayHours, busyPeriods, slotDuration, buffer);
          allSlots.push(...daySlots);
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return allSlots;
    } catch (err: any) {
      log.error("Failed to fetch Google Calendar availability", {
        error: err.message,
        calendarId,
        clientId: String(connection.client_id),
      });
      throw new Error(`Google Calendar API error: ${err.message}`);
    }
  }

  async createBooking(connection: CalendarConnection, booking: BookingRequest): Promise<BookingResult> {
    const auth = createOAuth2Client(connection);
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = getCalendarId(connection);
    const timezone = connection.timezone ?? "America/New_York";

    const attendees: calendar_v3.Schema$EventAttendee[] = [];
    if (booking.customerEmail) {
      attendees.push({ email: booking.customerEmail, displayName: booking.customerName });
    }

    const descriptionParts: string[] = [];
    descriptionParts.push(`Customer: ${booking.customerName}`);
    if (booking.customerPhone) descriptionParts.push(`Phone: ${booking.customerPhone}`);
    if (booking.customerEmail) descriptionParts.push(`Email: ${booking.customerEmail}`);
    if (booking.service) descriptionParts.push(`Service: ${booking.service}`);
    if (booking.notes) descriptionParts.push(`Notes: ${booking.notes}`);
    descriptionParts.push(`\nBooked via WeFixTrades`);

    try {
      const event = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: booking.service
            ? `${booking.service} - ${booking.customerName}`
            : `Appointment - ${booking.customerName}`,
          description: descriptionParts.join("\n"),
          start: {
            dateTime: booking.startTime,
            timeZone: timezone,
          },
          end: {
            dateTime: booking.endTime,
            timeZone: timezone,
          },
          attendees: attendees.length > 0 ? attendees : undefined,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 60 },
              { method: "popup", minutes: 30 },
            ],
          },
        },
        sendUpdates: attendees.length > 0 ? "all" : "none",
      });

      log.info("Google Calendar event created", {
        eventId: event.data.id || undefined,
        clientId: String(booking.clientId),
      });

      return {
        success: true,
        bookingId: event.data.id || undefined,
        confirmationUrl: event.data.htmlLink || undefined,
      };
    } catch (err: any) {
      log.error("Failed to create Google Calendar event", {
        error: err.message,
        clientId: String(booking.clientId),
      });
      return {
        success: false,
        error: `Google Calendar API error: ${err.message}`,
      };
    }
  }

  async cancelBooking(connection: CalendarConnection, bookingId: string): Promise<boolean> {
    const auth = createOAuth2Client(connection);
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = getCalendarId(connection);

    try {
      await calendar.events.delete({
        calendarId,
        eventId: bookingId,
        sendUpdates: "all",
      });
      log.info("Google Calendar event cancelled", { bookingId });
      return true;
    } catch (err: any) {
      log.error("Failed to cancel Google Calendar event", {
        error: err.message,
        bookingId,
      });
      return false;
    }
  }
}
