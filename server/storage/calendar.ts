/**
 * Calendar connection storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by ~151 consumers) stays byte-identical.
 *
 * Tables touched: calendar_connections. Powers the Booking Engine's
 * per-client calendar integration (Google/Outlook).
 */

import { db } from "../db";
import {
  calendarConnections,
  type CalendarConnection, type InsertCalendarConnection,
} from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export async function getCalendarConnection(clientId: number): Promise<CalendarConnection | undefined> {
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.client_id, clientId), eq(calendarConnections.is_active, true)))
    .limit(1);
  return conn;
}

export async function listCalendarConnections(clientId?: number): Promise<CalendarConnection[]> {
  if (clientId) {
    return db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.client_id, clientId))
      .orderBy(desc(calendarConnections.created_at));
  }
  return db
    .select()
    .from(calendarConnections)
    .orderBy(desc(calendarConnections.created_at));
}

export async function createCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection> {
  const [conn] = await db.insert(calendarConnections).values(data).returning();
  return conn;
}

export async function updateCalendarConnection(id: number, updates: Partial<InsertCalendarConnection>): Promise<CalendarConnection | undefined> {
  const [conn] = await db
    .update(calendarConnections)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(calendarConnections.id, id))
    .returning();
  return conn;
}

export async function deleteCalendarConnection(id: number): Promise<CalendarConnection | undefined> {
  // Soft delete — set is_active = false
  const [conn] = await db
    .update(calendarConnections)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(calendarConnections.id, id))
    .returning();
  return conn;
}
