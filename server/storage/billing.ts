/**
 * Billing/Payments storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by ~151 consumers) stays byte-identical.
 *
 * Tables touched: clientPayments (joined with clients for the admin
 * listing). Stripe-specific lookups by session/subscription id live here
 * too since they all read from clientPayments.
 */

import { db } from "../db";
import {
  clientPayments,
  clients,
  type ClientPayment,
  type InsertClientPayment,
} from "@shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export async function listClientPayments(clientId: number): Promise<ClientPayment[]> {
  return db.select().from(clientPayments).where(eq(clientPayments.client_id, clientId)).orderBy(desc(clientPayments.created_at));
}

export async function listAllPayments(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<(ClientPayment & { client_name?: string })[]> {
  const { status, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (status) conditions.push(eq(clientPayments.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select({
    id: clientPayments.id, client_id: clientPayments.client_id,
    client_service_id: clientPayments.client_service_id, order_id: clientPayments.order_id,
    type: clientPayments.type, amount_cents: clientPayments.amount_cents,
    status: clientPayments.status, description: clientPayments.description,
    stripe_invoice_id: clientPayments.stripe_invoice_id,
    stripe_payment_intent_id: clientPayments.stripe_payment_intent_id,
    period_start: clientPayments.period_start, period_end: clientPayments.period_end,
    due_at: clientPayments.due_at, paid_at: clientPayments.paid_at,
    actor_type: clientPayments.actor_type, metadata: clientPayments.metadata,
    created_at: clientPayments.created_at, updated_at: clientPayments.updated_at,
    client_name: clients.business_name,
  })
  .from(clientPayments)
  .leftJoin(clients, eq(clientPayments.client_id, clients.id))
  .where(where)
  .orderBy(desc(clientPayments.created_at))
  .limit(limit).offset(offset) as any;
}

export async function createClientPayment(data: InsertClientPayment): Promise<ClientPayment> {
  const [row] = await db.insert(clientPayments).values(data).returning();
  return row;
}

export async function updateClientPayment(id: number, updates: Partial<InsertClientPayment>): Promise<ClientPayment | undefined> {
  const [row] = await db.update(clientPayments).set({ ...updates, updated_at: new Date() }).where(eq(clientPayments.id, id)).returning();
  return row;
}

export async function getUnpaidTotal(): Promise<number> {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(amount_cents), 0)::int` }).from(clientPayments)
    .where(and(eq(clientPayments.type, "invoice"), eq(clientPayments.status, "pending")));
  return row?.total ?? 0;
}

export async function getMonthlyRevenue(): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [row] = await db.select({ total: sql<number>`coalesce(sum(amount_cents), 0)::int` }).from(clientPayments)
    .where(and(eq(clientPayments.status, "paid"), gte(clientPayments.paid_at, monthStart)));
  return row?.total ?? 0;
}

export async function findPaymentByStripeSession(sessionId: string): Promise<ClientPayment | undefined> {
  const [row] = await db.select().from(clientPayments)
    .where(eq(clientPayments.stripe_payment_intent_id, sessionId))
    .limit(1);
  return row;
}

export async function findPendingPaymentForClientService(clientServiceId: number): Promise<ClientPayment | undefined> {
  const [row] = await db.select().from(clientPayments)
    .where(and(
      eq(clientPayments.client_service_id, clientServiceId),
      eq(clientPayments.status, "pending"),
    ))
    .orderBy(desc(clientPayments.created_at))
    .limit(1);
  return row;
}
