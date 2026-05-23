/**
 * Invoice template routes — Phase A.
 *
 * Surfaces the seed builtin templates + per-client custom templates and lets
 * the portal toggle the account-level default. Phase B will add full CRUD
 * (POST/PATCH/DELETE on custom templates) — A only exposes:
 *
 *   GET   /api/portal/invoice-templates           — list (builtins + custom)
 *   GET   /api/portal/invoice-templates/default   — current default + accent
 *   PATCH /api/portal/invoice-templates/default   — { slug, accent_color }
 *   GET   /api/portal/contacts/search?q=          — autocomplete for invoice
 *                                                   customer-linking. Filters
 *                                                   by display_name / email /
 *                                                   phone, max 20 results.
 */

import type { Express, Request, Response } from "express";
import { eq, sql, or, ilike, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { requireClient } from "../auth";
import { clients, invoiceTemplates } from "@shared/schema";
import { contacts } from "@shared/schemas/contacts";
import { createLogger } from "../lib/logger";
import { BUILTIN_TEMPLATE_SLUGS } from "../lib/invoiceTemplates";

const log = createLogger("InvoiceTemplates");

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account" });
    return null;
  }
  return clientId;
}

const defaultUpdateBody = z.object({
  slug: z.enum(["classic-minimal", "modern-bold", "trade-service"]),
  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Expected a hex color like #0d3cfc")
    .optional(),
});

export function registerInvoiceTemplateRoutes(app: Express): void {
  /** List templates available to the current client (builtins + their own custom). */
  app.get("/api/portal/invoice-templates", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Builtins are client_id IS NULL; per-client customs match client_id.
      const rows = await db
        .select()
        .from(invoiceTemplates)
        .where(or(sql`${invoiceTemplates.client_id} IS NULL`, eq(invoiceTemplates.client_id, clientId)))
        .orderBy(asc(invoiceTemplates.kind), asc(invoiceTemplates.name));

      res.json(rows);
    } catch (err: any) {
      log.error("Failed to list invoice templates", { error: err.message });
      res.status(500).json({ error: "Failed to list templates" });
    }
  });

  /** Current default template + accent for new invoices. */
  app.get("/api/portal/invoice-templates/default", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db
        .select({
          slug: clients.default_invoice_template_slug,
          accent: clients.invoice_accent_color,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      res.json({
        slug: client?.slug || "classic-minimal",
        accent_color: client?.accent || "#0d3cfc",
        available_builtins: BUILTIN_TEMPLATE_SLUGS,
      });
    } catch (err: any) {
      log.error("Failed to load default template", { error: err.message });
      res.status(500).json({ error: "Failed to load default" });
    }
  });

  /** Save the account default template + accent. */
  app.patch("/api/portal/invoice-templates/default", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const parsed = defaultUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const updates: Record<string, any> = {
        default_invoice_template_slug: parsed.data.slug,
        updated_at: new Date(),
      };
      if (parsed.data.accent_color) updates.invoice_accent_color = parsed.data.accent_color;

      const [updated] = await db
        .update(clients)
        .set(updates)
        .where(eq(clients.id, clientId))
        .returning({
          slug: clients.default_invoice_template_slug,
          accent: clients.invoice_accent_color,
        });

      res.json({
        slug: updated?.slug || "classic-minimal",
        accent_color: updated?.accent || "#0d3cfc",
      });
    } catch (err: any) {
      log.error("Failed to update default template", { error: err.message });
      res.status(500).json({ error: "Failed to update default" });
    }
  });

  /** Contact autocomplete for invoice customer-linking. */
  app.get("/api/portal/contacts/search", requireClient, async (req: Request, res: Response) => {
    try {
      // Ensure caller is a client; the contacts table is global (shared with
      // admin Communications), so we don't filter by client_id here — search
      // is name/email/phone substring against the global directory. Future
      // tightening can scope this once a contact ↔ client ownership column
      // lands; Phase B item.
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const qRaw = String(req.query.q || "").trim();
      if (qRaw.length < 1) return res.json([]);
      const q = `%${qRaw}%`;

      const rows = await db
        .select({
          id: contacts.id,
          display_name: contacts.display_name,
          email: contacts.email,
          phone_e164: contacts.phone_e164,
          billing_street: contacts.billing_street,
          billing_city: contacts.billing_city,
          billing_region: contacts.billing_region,
          billing_postal: contacts.billing_postal,
          billing_country: contacts.billing_country,
        })
        .from(contacts)
        .where(
          or(
            ilike(contacts.display_name, q),
            ilike(contacts.email, q),
            ilike(contacts.phone_e164, q),
          ),
        )
        .orderBy(asc(contacts.display_name))
        .limit(20);

      res.json(rows);
    } catch (err: any) {
      log.error("Failed to search contacts", { error: err.message });
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });
}
