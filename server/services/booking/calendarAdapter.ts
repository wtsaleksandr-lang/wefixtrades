/**
 * Calendar adapter interface — abstracts calendar integrations for the booking engine.
 *
 * Each platform adapter implements this interface to provide availability
 * lookup and booking creation via the platform's API.
 */

import type { CalendarConnection } from "@shared/schema";

export interface TimeSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  available: boolean;
}

export interface BookingRequest {
  clientId: number;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
  service?: string;
  notes?: string;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  confirmationUrl?: string;
  error?: string;
}

export interface CalendarAdapter {
  platform: string;
  getAvailableSlots(connection: CalendarConnection, date: string, days?: number): Promise<TimeSlot[]>;
  createBooking(connection: CalendarConnection, booking: BookingRequest): Promise<BookingResult>;
  cancelBooking?(connection: CalendarConnection, bookingId: string): Promise<boolean>;
}
