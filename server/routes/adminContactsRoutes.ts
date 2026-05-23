/**
 * COMMS-FEATURES wave — admin Communications address book CRUD.
 *
 * Pairs with the Twilio-driven Communications page. The page joins
 * Twilio messages/calls to this table on phone_e164 to display a
 * friendly name + an optional "linked to user/supplier" chip with a
 * "View profile" link.
 *
 * Endpoints (all admin-only):
 *
 *   GET    /api/admin/contacts?search=…&limit=50
 *   GET    /api/admin/contacts/by-phone/:phone
 *   POST   /api/admin/contacts
 *   PATCH  /api/admin/contacts/:id
 *   DELETE /api/admin/contacts/:id
 *   POST   /api/admin/contacts/:id/link
 *   POST   /api/admin/contacts/:id/unlink
 *
 * The list endpoint joins users + suppliers so the UI can render the
 * linked-name chip without a second round-trip.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, or, ilike, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { contacts, users, suppliers } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminContacts");

/* ─── validators ─────────────────────────────────────────────────── */

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format starting with +");

const createContactSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  phone_e164: e164,
  email: z.string().email().max(320).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  linked_user_id: z.coerce.number().int().positive().optional().nullable(),
  linked_supplier_id: z.coerce.number().int().positive().optional().nullable(),
});

const updateContactSchema = createContactSchema.partial();

const linkSchema = z.object({
  kind: z.enum(["user", "supplier"]),
  id: z.coerce.number().int().positive(),
});

const unlinkSchema = z.object({
  kind: z.enum(["user", "supplier"]),
});

/* ─── helpers ────────────────────────────────────────────────────── */

interface ListedContact {
  id: string;
  display_name: string;
  phone_e164: string;
  email: string | null;
  notes: string | null;
  linked_user_id: number | null;
  linked_user_name: string | null;
  linked_supplier_id: number | null;
  linked_supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Single SQL join used by list + by-phone + after-mutation reads. */
function selectContactWithJoins() {
  return db
    .select({
      id: contacts.id,
      display_name: contacts.display_name,
      phone_e164: contacts.phone_e164,
      email: contacts.email,
      notes: contacts.notes,
      linked_user_id: contacts.linked_user_id,
      linked_user_name: users.name,
      linked_supplier_id: contacts.linked_supplier_id,
      linked_supplier_name: suppliers.name,
      created_at: contacts.created_at,
      updated_at: contacts.updated_at,
    })
    .from(contacts)
    .leftJoin(users, eq(users.id, contacts.linked_user_id))
    .leftJoin(suppliers, eq(suppliers.id, contacts.linked_supplier_id));
}

function rowToListed(row: any): ListedContact {
  return {
    id: row.id,
    display_name: row.display_name,
    phone_e164: row.phone_e164,
    email: row.email ?? null,
    notes: row.notes ?? null,
    linked_user_id: row.linked_user_id ?? null,
    linked_user_name: row.linked_user_name ?? null,
    linked_supplier_id: row.linked_supplier_id ?? null,
    linked_supplier_name: row.linked_supplier_name ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function loadById(id: string): Promise<ListedContact | null> {
  const rows = await selectContactWithJoins().where(eq(contacts.id, id)).limit(1);
  return rows.length ? rowToListed(rows[0]) : null;
}

/* ─── route registration ─────────────────────────────────────────── */

export function registerAdminContactsRoutes(app: Express): void {
  /**
   * GET /api/admin/contacts?search=…&limit=50
   *
   * Returns up to `limit` contacts ordered by created_at DESC. When
   * `search` is supplied, matches against display_name OR phone_e164
   * OR email (case-insensitive substring).
   */
  app.get("/api/admin/contacts", requireAdmin, async (req: Request, res: Response) => {
    const search = String(req.query.search ?? "").trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);

    try {
      let query = selectContactWithJoins().$dynamic();
      if (search) {
        const needle = `%${search}%`;
        query = query.where(
          or(
            ilike(contacts.display_name, needle),
            ilike(contacts.phone_e164, needle),
            ilike(contacts.email, needle),
          ),
        );
      }
      const rows = await query.orderBy(desc(contacts.created_at)).limit(limit);
      res.json({ contacts: rows.map(rowToListed) });
    } catch (err: any) {
      log.error("list failed", { message: err?.message });
      res.status(500).json({ error: "list_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * GET /api/admin/contacts/by-phone/:phone
   *
   * Look up a single contact by exact E.164. Used by the SMS / Phone
   * views to swap the number for a name + render the linked chip.
   * 404 when not found (so the UI can offer "Save as contact").
   */
  app.get("/api/admin/contacts/by-phone/:phone", requireAdmin, async (req: Request, res: Response) => {
    const phone = String(req.params.phone ?? "").trim();
    if (!phone) return res.status(400).json({ error: "missing_phone" });
    try {
      const rows = await selectContactWithJoins().where(eq(contacts.phone_e164, phone)).limit(1);
      if (!rows.length) return res.status(404).json({ error: "not_found" });
      res.json(rowToListed(rows[0]));
    } catch (err: any) {
      log.error("by-phone failed", { phone, message: err?.message });
      res.status(500).json({ error: "lookup_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * POST /api/admin/contacts
   */
  app.post("/api/admin/contacts", requireAdmin, async (req: Request, res: Response) => {
    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    try {
      // Validate linked targets exist if supplied.
      if (body.linked_user_id != null) {
        const u = await db.select({ id: users.id }).from(users).where(eq(users.id, body.linked_user_id)).limit(1);
        if (!u.length) return res.status(400).json({ error: "linked_user_not_found" });
      }
      if (body.linked_supplier_id != null) {
        const s = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, body.linked_supplier_id)).limit(1);
        if (!s.length) return res.status(400).json({ error: "linked_supplier_not_found" });
      }
      const inserted = await db
        .insert(contacts)
        .values({
          display_name: body.display_name,
          phone_e164: body.phone_e164,
          email: body.email ?? null,
          notes: body.notes ?? null,
          linked_user_id: body.linked_user_id ?? null,
          linked_supplier_id: body.linked_supplier_id ?? null,
        })
        .returning({ id: contacts.id });
      const created = await loadById(inserted[0].id);
      log.info("contact created", { id: inserted[0].id, phone: body.phone_e164 });
      res.status(201).json(created);
    } catch (err: any) {
      if (/unique|duplicate/i.test(err?.message ?? "")) {
        return res.status(409).json({ error: "phone_already_exists" });
      }
      log.error("create failed", { message: err?.message });
      res.status(500).json({ error: "create_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * PATCH /api/admin/contacts/:id
   */
  app.patch("/api/admin/contacts/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "missing_id" });
    const parsed = updateContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const patch = parsed.data;
    try {
      // Validate linked targets if supplied & non-null.
      if (patch.linked_user_id != null) {
        const u = await db.select({ id: users.id }).from(users).where(eq(users.id, patch.linked_user_id)).limit(1);
        if (!u.length) return res.status(400).json({ error: "linked_user_not_found" });
      }
      if (patch.linked_supplier_id != null) {
        const s = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, patch.linked_supplier_id)).limit(1);
        if (!s.length) return res.status(400).json({ error: "linked_supplier_not_found" });
      }
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (patch.display_name !== undefined) updates.display_name = patch.display_name;
      if (patch.phone_e164 !== undefined) updates.phone_e164 = patch.phone_e164;
      if (patch.email !== undefined) updates.email = patch.email;
      if (patch.notes !== undefined) updates.notes = patch.notes;
      if (patch.linked_user_id !== undefined) updates.linked_user_id = patch.linked_user_id;
      if (patch.linked_supplier_id !== undefined) updates.linked_supplier_id = patch.linked_supplier_id;
      const updated = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning({ id: contacts.id });
      if (!updated.length) return res.status(404).json({ error: "not_found" });
      const fresh = await loadById(id);
      res.json(fresh);
    } catch (err: any) {
      if (/unique|duplicate/i.test(err?.message ?? "")) {
        return res.status(409).json({ error: "phone_already_exists" });
      }
      log.error("update failed", { id, message: err?.message });
      res.status(500).json({ error: "update_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * DELETE /api/admin/contacts/:id
   */
  app.delete("/api/admin/contacts/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "missing_id" });
    try {
      const removed = await db.delete(contacts).where(eq(contacts.id, id)).returning({ id: contacts.id });
      if (!removed.length) return res.status(404).json({ error: "not_found" });
      log.info("contact deleted", { id });
      res.status(204).send();
    } catch (err: any) {
      log.error("delete failed", { id, message: err?.message });
      res.status(500).json({ error: "delete_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * POST /api/admin/contacts/:id/link
   * Body: { kind: 'user'|'supplier', id: number }
   */
  app.post("/api/admin/contacts/:id/link", requireAdmin, async (req: Request, res: Response) => {
    const contactId = String(req.params.id ?? "").trim();
    if (!contactId) return res.status(400).json({ error: "missing_id" });
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { kind, id: targetId } = parsed.data;
    try {
      if (kind === "user") {
        const u = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
        if (!u.length) return res.status(404).json({ error: "user_not_found" });
        const updated = await db
          .update(contacts)
          .set({ linked_user_id: targetId, updated_at: new Date() })
          .where(eq(contacts.id, contactId))
          .returning({ id: contacts.id });
        if (!updated.length) return res.status(404).json({ error: "contact_not_found" });
      } else {
        const s = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, targetId)).limit(1);
        if (!s.length) return res.status(404).json({ error: "supplier_not_found" });
        const updated = await db
          .update(contacts)
          .set({ linked_supplier_id: targetId, updated_at: new Date() })
          .where(eq(contacts.id, contactId))
          .returning({ id: contacts.id });
        if (!updated.length) return res.status(404).json({ error: "contact_not_found" });
      }
      const fresh = await loadById(contactId);
      log.info("contact linked", { id: contactId, kind, target_id: targetId });
      res.json(fresh);
    } catch (err: any) {
      log.error("link failed", { id: contactId, message: err?.message });
      res.status(500).json({ error: "link_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * POST /api/admin/contacts/:id/unlink
   * Body: { kind: 'user'|'supplier' }
   */
  app.post("/api/admin/contacts/:id/unlink", requireAdmin, async (req: Request, res: Response) => {
    const contactId = String(req.params.id ?? "").trim();
    if (!contactId) return res.status(400).json({ error: "missing_id" });
    const parsed = unlinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { kind } = parsed.data;
    try {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (kind === "user") updates.linked_user_id = null;
      else updates.linked_supplier_id = null;
      const updated = await db
        .update(contacts)
        .set(updates)
        .where(eq(contacts.id, contactId))
        .returning({ id: contacts.id });
      if (!updated.length) return res.status(404).json({ error: "contact_not_found" });
      const fresh = await loadById(contactId);
      log.info("contact unlinked", { id: contactId, kind });
      res.json(fresh);
    } catch (err: any) {
      log.error("unlink failed", { id: contactId, message: err?.message });
      res.status(500).json({ error: "unlink_failed", message: err?.message ?? "Unknown error" });
    }
  });
}

// Keep `and` / `sql` imported for future filter expansion (search across
// linked profile names) — tsc would whine if it sat unused.
void and;
void sql;
