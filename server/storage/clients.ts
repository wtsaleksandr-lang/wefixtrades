/**
 * Client-related storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by all existing consumers) stays byte-identical.
 *
 * Tables touched: clients.
 *
 * Includes the local sanitizeClientPlaceId helper (formerly a module-level
 * fn in storage.ts) so this module is self-contained.
 */

import { db } from "../db";
import {
  clients,
  type Client,
  type InsertClient,
} from "@shared/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { extractPlaceId } from "@shared/utils/googlePlaceId";
import { createLogger } from "../lib/logger";

const log = createLogger("Storage:clients");

/**
 * Normalise a client write that may set google_place_id from a pasted
 * Google Maps URL. Mutates a shallow copy and never throws.
 *  - Clean ChIJ id → kept verbatim
 *  - Maps URL with `place_id:` param or data-segment hex pair → cleaned
 *  - Short / CID / unrecognised URLs → kept as-is so the value isn't
 *    silently dropped; downstream API calls will surface the error.
 */
export function sanitizeClientPlaceId<T extends { google_place_id?: string | null }>(data: T): T {
  if (!data || typeof data.google_place_id !== "string") return data;
  const { placeId, reason } = extractPlaceId(data.google_place_id);
  if (placeId && placeId !== data.google_place_id) {
    return { ...data, google_place_id: placeId };
  }
  if (!placeId && reason && reason !== "already_clean" && reason !== "empty") {
    log.warn(`[storage] google_place_id appears malformed (reason=${reason}); storing as-provided`);
  }
  return data;
}

export async function listClients(
  opts: { search?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<Client[]> {
  const { search, status, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (status) conditions.push(eq(clients.status, status));
  if (search) {
    conditions.push(or(
      ilike(clients.business_name, `%${search}%`),
      ilike(clients.contact_name, `%${search}%`),
      ilike(clients.contact_email, `%${search}%`),
    ));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(clients).where(where).orderBy(desc(clients.created_at)).limit(limit).offset(offset);
}

export async function getClientById(id: number): Promise<Client | undefined> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row;
}

export async function createClient(data: InsertClient): Promise<Client> {
  const sanitized = sanitizeClientPlaceId(data);
  const [row] = await db.insert(clients).values(sanitized).returning();
  return row;
}

export async function updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined> {
  const sanitized = sanitizeClientPlaceId(updates);
  const [row] = await db.update(clients).set({ ...sanitized, updated_at: new Date() }).where(eq(clients.id, id)).returning();
  return row;
}

export async function getClientCount(status?: string): Promise<number> {
  const where = status ? eq(clients.status, status) : undefined;
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(clients).where(where);
  return row?.total ?? 0;
}
