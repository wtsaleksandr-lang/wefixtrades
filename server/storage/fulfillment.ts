/**
 * Fulfillment storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: orders, order_items, suppliers, fulfillment_tasks,
 * clients (join), client_services (join), service_catalog (join).
 *
 * Three sub-domains live here because they share the supplier ↔ task
 * lifecycle and are always queried together by the admin fulfillment UI:
 *   - Orders / OrderItems: customer-facing purchase records
 *   - Suppliers: external vendors with per-service cost overrides
 *   - FulfillmentTasks: the work queue (incl. QA review sub-queue)
 */

import { db } from "../db";
import {
  orders, orderItems,
  suppliers, fulfillmentTasks,
  clients, clientServices, serviceCatalog,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type Supplier, type InsertSupplier,
  type FulfillmentTask, type InsertFulfillmentTask,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════
// Orders
// ═══════════════════════════════════════════════

export async function listOrders(clientId?: number, limit = 50, offset = 0): Promise<Order[]> {
  const where = clientId ? eq(orders.client_id, clientId) : undefined;
  return db.select().from(orders).where(where).orderBy(desc(orders.created_at)).limit(limit).offset(offset);
}

export async function createOrder(data: InsertOrder): Promise<Order> {
  const [row] = await db.insert(orders).values(data).returning();
  return row;
}

export async function createOrderItem(data: InsertOrderItem): Promise<OrderItem> {
  const [row] = await db.insert(orderItems).values(data).returning();
  return row;
}

// ═══════════════════════════════════════════════
// Suppliers
// ═══════════════════════════════════════════════

export async function listSuppliers(): Promise<Supplier[]> {
  return db.select().from(suppliers).orderBy(suppliers.name);
}

export async function getSupplierById(id: number): Promise<Supplier | undefined> {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return row;
}

export async function getSupplierTasks(supplierId: number): Promise<FulfillmentTask[]> {
  return db.select().from(fulfillmentTasks)
    .where(eq(fulfillmentTasks.supplier_id, supplierId))
    .orderBy(desc(fulfillmentTasks.created_at));
}

export async function createSupplier(data: InsertSupplier): Promise<Supplier> {
  const [row] = await db.insert(suppliers).values(data).returning();
  return row;
}

export async function updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined> {
  const [row] = await db.update(suppliers).set({ ...updates, updated_at: new Date() }).where(eq(suppliers.id, id)).returning();
  return row;
}

/** Q28d: suppliers whose supported_services jsonb array contains the given service id. */
export async function listSuppliersForService(serviceId: string): Promise<Supplier[]> {
  // jsonb @> '["service_id"]' returns true when the array contains the value.
  return db.select().from(suppliers)
    .where(sql`${suppliers.supported_services} @> ${JSON.stringify([serviceId])}::jsonb`)
    .orderBy(suppliers.name);
}

/** Q28h: set or clear a per-service cost override on a supplier. Pass null cost_cents to clear. */
export async function setSupplierServiceCost(
  supplierId: number,
  serviceId: string,
  cost: { cost_cents: number; cost_type?: string } | null,
): Promise<Supplier | undefined> {
  const existing = await getSupplierById(supplierId);
  if (!existing) return undefined;
  const current = (existing.service_cost_overrides as Record<string, any> | null) ?? {};
  const next = { ...current };
  if (cost === null) {
    if (!(serviceId in next)) return existing; // no-op
    delete next[serviceId];
  } else {
    next[serviceId] = { cost_cents: cost.cost_cents, ...(cost.cost_type ? { cost_type: cost.cost_type } : {}) };
  }
  const [row] = await db.update(suppliers)
    .set({ service_cost_overrides: Object.keys(next).length === 0 ? null : next, updated_at: new Date() })
    .where(eq(suppliers.id, supplierId))
    .returning();
  return row;
}

/** Q28d: add or remove a service id from a supplier's supported_services array. */
export async function setSupplierServiceAssignment(supplierId: number, serviceId: string, assigned: boolean): Promise<Supplier | undefined> {
  const existing = await getSupplierById(supplierId);
  if (!existing) return undefined;
  const current = (existing.supported_services as string[] | null) ?? [];
  let next: string[];
  if (assigned) {
    if (current.includes(serviceId)) return existing; // no-op
    next = [...current, serviceId];
  } else {
    if (!current.includes(serviceId)) return existing; // no-op
    next = current.filter((id) => id !== serviceId);
  }
  const [row] = await db.update(suppliers)
    .set({ supported_services: next, updated_at: new Date() })
    .where(eq(suppliers.id, supplierId))
    .returning();
  return row;
}

// ═══════════════════════════════════════════════
// Fulfillment Tasks
// ═══════════════════════════════════════════════

export async function listFulfillmentTasks(opts: { clientId?: number; status?: string; limit?: number; offset?: number } = {}): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string })[]> {
  const { clientId, status, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (clientId) conditions.push(eq(fulfillmentTasks.client_id, clientId));
  if (status) conditions.push(eq(fulfillmentTasks.status, status));
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select({
    id: fulfillmentTasks.id,
    client_service_id: fulfillmentTasks.client_service_id,
    client_id: fulfillmentTasks.client_id,
    supplier_id: fulfillmentTasks.supplier_id,
    title: fulfillmentTasks.title,
    description: fulfillmentTasks.description,
    status: fulfillmentTasks.status,
    priority: fulfillmentTasks.priority,
    sort_order: fulfillmentTasks.sort_order,
    waiting_on: fulfillmentTasks.waiting_on,
    handled_by: fulfillmentTasks.handled_by,
    automation_status: fulfillmentTasks.automation_status,
    last_action: fulfillmentTasks.last_action,
    next_action: fulfillmentTasks.next_action,
    last_action_at: fulfillmentTasks.last_action_at,
    cost_cents: fulfillmentTasks.cost_cents,
    due_at: fulfillmentTasks.due_at,
    completed_at: fulfillmentTasks.completed_at,
    escalation_flag: fulfillmentTasks.escalation_flag,
    human_review_required: fulfillmentTasks.human_review_required,
    actor_type: fulfillmentTasks.actor_type,
    metadata: fulfillmentTasks.metadata,
    created_at: fulfillmentTasks.created_at,
    updated_at: fulfillmentTasks.updated_at,
    client_name: clients.business_name,
    supplier_name: suppliers.name,
    service_name: serviceCatalog.name,
  })
  .from(fulfillmentTasks)
  .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
  .leftJoin(suppliers, eq(fulfillmentTasks.supplier_id, suppliers.id))
  .leftJoin(clientServices, eq(fulfillmentTasks.client_service_id, clientServices.id))
  .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(where)
  .orderBy(fulfillmentTasks.sort_order, fulfillmentTasks.created_at)
  .limit(limit)
  .offset(offset);
  return rows as any;
}

export async function listQaQueueTasks(): Promise<(FulfillmentTask & { client_name?: string; service_name?: string })[]> {
  const rows = await db.select({
    id: fulfillmentTasks.id,
    client_service_id: fulfillmentTasks.client_service_id,
    client_id: fulfillmentTasks.client_id,
    supplier_id: fulfillmentTasks.supplier_id,
    title: fulfillmentTasks.title,
    description: fulfillmentTasks.description,
    status: fulfillmentTasks.status,
    priority: fulfillmentTasks.priority,
    sort_order: fulfillmentTasks.sort_order,
    waiting_on: fulfillmentTasks.waiting_on,
    handled_by: fulfillmentTasks.handled_by,
    automation_status: fulfillmentTasks.automation_status,
    last_action: fulfillmentTasks.last_action,
    next_action: fulfillmentTasks.next_action,
    last_action_at: fulfillmentTasks.last_action_at,
    cost_cents: fulfillmentTasks.cost_cents,
    due_at: fulfillmentTasks.due_at,
    completed_at: fulfillmentTasks.completed_at,
    escalation_flag: fulfillmentTasks.escalation_flag,
    human_review_required: fulfillmentTasks.human_review_required,
    actor_type: fulfillmentTasks.actor_type,
    deliverables: fulfillmentTasks.deliverables,
    metadata: fulfillmentTasks.metadata,
    created_at: fulfillmentTasks.created_at,
    updated_at: fulfillmentTasks.updated_at,
    client_name: clients.business_name,
    service_name: serviceCatalog.name,
  })
  .from(fulfillmentTasks)
  .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
  .leftJoin(clientServices, eq(fulfillmentTasks.client_service_id, clientServices.id))
  .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(eq(fulfillmentTasks.status, "qa_review"))
  .orderBy(fulfillmentTasks.due_at, fulfillmentTasks.created_at);
  return rows as any;
}

export async function getFulfillmentTask(id: number): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string }) | undefined> {
  const [row] = await db.select({
    id: fulfillmentTasks.id,
    client_service_id: fulfillmentTasks.client_service_id,
    client_id: fulfillmentTasks.client_id,
    supplier_id: fulfillmentTasks.supplier_id,
    title: fulfillmentTasks.title,
    description: fulfillmentTasks.description,
    status: fulfillmentTasks.status,
    priority: fulfillmentTasks.priority,
    sort_order: fulfillmentTasks.sort_order,
    waiting_on: fulfillmentTasks.waiting_on,
    handled_by: fulfillmentTasks.handled_by,
    automation_status: fulfillmentTasks.automation_status,
    last_action: fulfillmentTasks.last_action,
    next_action: fulfillmentTasks.next_action,
    last_action_at: fulfillmentTasks.last_action_at,
    cost_cents: fulfillmentTasks.cost_cents,
    due_at: fulfillmentTasks.due_at,
    completed_at: fulfillmentTasks.completed_at,
    escalation_flag: fulfillmentTasks.escalation_flag,
    human_review_required: fulfillmentTasks.human_review_required,
    actor_type: fulfillmentTasks.actor_type,
    deliverables: fulfillmentTasks.deliverables,
    metadata: fulfillmentTasks.metadata,
    created_at: fulfillmentTasks.created_at,
    updated_at: fulfillmentTasks.updated_at,
    client_name: clients.business_name,
    supplier_name: suppliers.name,
    service_name: serviceCatalog.name,
  })
  .from(fulfillmentTasks)
  .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
  .leftJoin(suppliers, eq(fulfillmentTasks.supplier_id, suppliers.id))
  .leftJoin(clientServices, eq(fulfillmentTasks.client_service_id, clientServices.id))
  .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(eq(fulfillmentTasks.id, id))
  .limit(1);
  return row as any;
}

export async function createFulfillmentTask(data: InsertFulfillmentTask): Promise<FulfillmentTask> {
  const [row] = await db.insert(fulfillmentTasks).values(data).returning();
  return row;
}

export async function updateFulfillmentTask(id: number, updates: Partial<InsertFulfillmentTask>): Promise<FulfillmentTask | undefined> {
  const [row] = await db.update(fulfillmentTasks).set({ ...updates, updated_at: new Date() }).where(eq(fulfillmentTasks.id, id)).returning();
  return row;
}

export async function getOpenFulfillmentCount(): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(fulfillmentTasks)
    .where(and(
      sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
    ));
  return row?.total ?? 0;
}
