/**
 * User-related storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by all existing consumers) stays byte-identical.
 *
 * Tables touched: users.
 *
 * Not extracted (depend on this.getClientById/this.updateClient):
 *   - ensurePortalAccount
 */

import { db } from "../db";
import {
  users,
  type User,
  type InsertUser,
} from "@shared/schema";
import { desc, eq, sql } from "drizzle-orm";

export async function createUser(data: InsertUser): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

export async function getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.google_sub, googleSub)).limit(1);
  return user;
}

export async function updateUser(
  id: number,
  updates: Partial<Pick<InsertUser, "name" | "email" | "role">>,
): Promise<User | undefined> {
  const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return user;
}

export async function listUsers(limit = 50, offset = 0): Promise<User[]> {
  return db.select().from(users).orderBy(desc(users.created_at)).limit(limit).offset(offset);
}

export async function getUserCount(): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
  return row?.total ?? 0;
}
