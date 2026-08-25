/**
 * Portal CRM routes — the client-facing customer database.
 *
 * The #1 audit gap: a trades business that moves its whole operation onto
 * WeFixTrades needs a unified, editable customer record. Customer data used
 * to live inline per appointment / invoice with no single source of truth.
 *
 * Every endpoint is client-scoped via `withClientIdOrPreview` (requireClient
 * auth + resolved client_id from the session, admin-preview safe) exactly the
 * way bookflowRoutes scopes invoices / appointments. All queries filter by
 * the resolved clientId — a customer belonging to another tenant is never
 * reachable.
 *
 * Portal endpoints (requireClient):
 *   GET    /api/portal/customers          — list + search (q, sort)
 *   GET    /api/portal/customers/:id       — one customer + booking/invoice history
 *   POST   /api/portal/customers          — create
 *   PATCH  /api/portal/customers/:id       — update
 *   DELETE /api/portal/customers/:id       — delete (detaches history back-refs)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireClient } from "../auth";
import {
  customers,
  bookflowAppointments,
  bookflowInvoices,
} from "@shared/schema";
import { withClientIdOrPreview } from "../middleware/adminPreviewSafe";
import { createLogger } from "../lib/logger";

const log = createLogger("PortalCRM");

/* ─── Validation ─── */

// Tags: a short list of short free-form labels. Capped so a payload can't
// balloon the JSONB column.
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20);

const createCustomerBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().max(10000).optional().or(z.literal("")),
  tags: tagsSchema.optional(),
});

// Update: all fields optional; string fields accept "" to clear.
const updateCustomerBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().max(10000).optional().or(z.literal("")),
  tags: tagsSchema.optional(),
}).refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

/** Normalise an optional string: "" / whitespace → null, else trimmed value. */
function nullifyEmpty(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/* ─── Route Registration ─── */

export function registerCustomerRoutes(app: Express): void {
  /** GET /api/portal/customers — searchable customer list.
   *
   *  Query params:
   *    q    — substring against name / email / phone
   *    sort — name | recent | created (default name)
   */
  app.get("/api/portal/customers", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, { previewShape: { customers: [] } });
      if (!clientId) return;

      const q = (req.query.q as string | undefined)?.trim();
      const sort = (req.query.sort as string | undefined) || "name";

      const conditions = [eq(customers.client_id, clientId)];
      if (q && q.length > 0) {
        const like = `%${q}%`;
        conditions.push(
          sql`(${customers.name} ILIKE ${like} OR COALESCE(${customers.email}, '') ILIKE ${like} OR COALESCE(${customers.phone}, '') ILIKE ${like})`,
        );
      }

      const orderBy = (() => {
        switch (sort) {
          case "recent": return desc(customers.updated_at);
          case "created": return desc(customers.created_at);
          case "name":
          default: return customers.name;
        }
      })();

      const rows = await db
        .select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          notes: customers.notes,
          tags: customers.tags,
          created_at: customers.created_at,
          updated_at: customers.updated_at,
        })
        .from(customers)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(500);

      res.json(rows);
    } catch (err: any) {
      log.error("Failed to list customers", { error: err.message });
      res.status(500).json({ error: "Failed to list customers" });
    }
  });

  /** GET /api/portal/customers/:id — one customer + their booking & invoice history. */
  app.get("/api/portal/customers/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { customer: null, appointments: [], invoices: [] },
      });
      if (!clientId) return;

      const customerId = parseInt(String(req.params.id), 10);
      if (Number.isNaN(customerId)) return res.status(400).json({ error: "Invalid customer ID" });

      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.client_id, clientId)))
        .limit(1);

      if (!customer) return res.status(404).json({ error: "Customer not found" });

      // History is joined by customer_id AND re-scoped to the same client_id so
      // a mismatched-tenant row can never leak even if a stray customer_id
      // pointed across tenants.
      const appointments = await db
        .select({
          id: bookflowAppointments.id,
          customer_name: bookflowAppointments.customer_name,
          service_name: bookflowAppointments.service_name,
          start_time: bookflowAppointments.start_time,
          end_time: bookflowAppointments.end_time,
          status: bookflowAppointments.status,
          notes: bookflowAppointments.notes,
        })
        .from(bookflowAppointments)
        .where(and(
          eq(bookflowAppointments.customer_id, customerId),
          eq(bookflowAppointments.client_id, clientId),
        ))
        .orderBy(desc(bookflowAppointments.start_time))
        .limit(200);

      const invoices = await db
        .select({
          id: bookflowInvoices.id,
          invoice_number: bookflowInvoices.invoice_number,
          total_cents: bookflowInvoices.total_cents,
          currency: bookflowInvoices.currency,
          status: bookflowInvoices.status,
          due_date: bookflowInvoices.due_date,
          paid_at: bookflowInvoices.paid_at,
          created_at: bookflowInvoices.created_at,
        })
        .from(bookflowInvoices)
        .where(and(
          eq(bookflowInvoices.customer_id, customerId),
          eq(bookflowInvoices.client_id, clientId),
        ))
        .orderBy(desc(bookflowInvoices.created_at))
        .limit(200);

      res.json({ customer, appointments, invoices });
    } catch (err: any) {
      log.error("Failed to load customer", { error: err.message });
      res.status(500).json({ error: "Failed to load customer" });
    }
  });

  /** POST /api/portal/customers — create a customer. */
  app.post("/api/portal/customers", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { customer: null }, mode: "write", action: "create_customer",
      });
      if (!clientId) return;

      const parsed = createCustomerBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { data } = parsed;

      const [customer] = await db.insert(customers).values({
        client_id: clientId,
        name: data.name.trim(),
        email: nullifyEmpty(data.email),
        phone: nullifyEmpty(data.phone),
        address: nullifyEmpty(data.address),
        notes: nullifyEmpty(data.notes),
        tags: data.tags && data.tags.length > 0 ? data.tags : null,
      }).returning();

      log.info("Customer created", { customerId: String(customer.id) });
      res.status(201).json(customer);
    } catch (err: any) {
      log.error("Failed to create customer", { error: err.message });
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  /** PATCH /api/portal/customers/:id — update a customer. */
  app.patch("/api/portal/customers/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { customer: null }, mode: "write", action: "update_customer",
      });
      if (!clientId) return;

      const customerId = parseInt(String(req.params.id), 10);
      if (Number.isNaN(customerId)) return res.status(400).json({ error: "Invalid customer ID" });

      const parsed = updateCustomerBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { data } = parsed;

      // Build a scoped patch — only the fields present in the payload.
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.email !== undefined) patch.email = nullifyEmpty(data.email);
      if (data.phone !== undefined) patch.phone = nullifyEmpty(data.phone);
      if (data.address !== undefined) patch.address = nullifyEmpty(data.address);
      if (data.notes !== undefined) patch.notes = nullifyEmpty(data.notes);
      if (data.tags !== undefined) patch.tags = data.tags.length > 0 ? data.tags : null;

      const [updated] = await db
        .update(customers)
        .set(patch)
        .where(and(eq(customers.id, customerId), eq(customers.client_id, clientId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Customer not found" });

      log.info("Customer updated", { customerId: String(customerId) });
      res.json(updated);
    } catch (err: any) {
      log.error("Failed to update customer", { error: err.message });
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  /** DELETE /api/portal/customers/:id — delete a customer, detaching history. */
  app.delete("/api/portal/customers/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { ok: true }, mode: "write", action: "delete_customer",
      });
      if (!clientId) return;

      const customerId = parseInt(String(req.params.id), 10);
      if (Number.isNaN(customerId)) return res.status(400).json({ error: "Invalid customer ID" });

      // Detach the nullable back-references first so appointment / invoice
      // history is preserved (customer_id → NULL), then delete the record.
      // All three statements are client-scoped.
      await db
        .update(bookflowAppointments)
        .set({ customer_id: null })
        .where(and(
          eq(bookflowAppointments.customer_id, customerId),
          eq(bookflowAppointments.client_id, clientId),
        ));
      await db
        .update(bookflowInvoices)
        .set({ customer_id: null })
        .where(and(
          eq(bookflowInvoices.customer_id, customerId),
          eq(bookflowInvoices.client_id, clientId),
        ));

      const deleted = await db
        .delete(customers)
        .where(and(eq(customers.id, customerId), eq(customers.client_id, clientId)))
        .returning({ id: customers.id });

      if (deleted.length === 0) return res.status(404).json({ error: "Customer not found" });

      log.info("Customer deleted", { customerId: String(customerId) });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("Failed to delete customer", { error: err.message });
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });
}
