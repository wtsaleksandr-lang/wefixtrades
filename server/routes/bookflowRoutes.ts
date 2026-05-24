/**
 * BookFlow extension routes: Invoicing, Dispatch, QuoteQuick payments.
 *
 * Portal endpoints (requireClient):
 *   POST   /api/portal/bookflow/invoices           — create invoice
 *   GET    /api/portal/bookflow/invoices           — list invoices
 *   PATCH  /api/portal/bookflow/invoices/:id       — update invoice
 *   POST   /api/portal/bookflow/invoices/:id/send  — send invoice email
 *   GET    /api/portal/bookflow/dispatch            — today's jobs
 *   PATCH  /api/portal/bookflow/appointments/:id/status — update appointment status
 *
 * Public endpoints (no auth):
 *   GET    /api/pay/:token         — view invoice for payment
 *   POST   /api/pay/:token/checkout — create Stripe Checkout session
 *   POST   /api/calculators/:id/checkout — QuoteQuick payment checkout
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "../db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireClient } from "../auth";
import {
  bookflowInvoices,
  bookflowAppointments,
  bookflowSettings,
  clients,
  calculators,
} from "@shared/schema";
import { sendInvoiceEmail } from "../lib/invoiceEmail";
import { renderInvoicePdf, BUILTIN_TEMPLATE_SLUGS, type InvoicePdfData } from "../lib/invoiceTemplates";
import { contacts } from "@shared/schemas/contacts";
import { createLogger } from "../lib/logger";
import {
  getBookFlowSettingsBySlug,
  getBookFlowSettings,
  getAvailableSlots,
  createAppointment,
  setupBookFlow,
} from "../services/booking/bookflowService";

const log = createLogger("BookFlow");

/* ─── Helpers ─── */

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

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

/** Generate next invoice number for a client: INV-001, INV-002, etc. */
async function nextInvoiceNumber(clientId: number): Promise<string> {
  const [latest] = await db
    .select({ invoice_number: bookflowInvoices.invoice_number })
    .from(bookflowInvoices)
    .where(eq(bookflowInvoices.client_id, clientId))
    .orderBy(desc(bookflowInvoices.id))
    .limit(1);

  if (!latest?.invoice_number) return "INV-001";

  const match = latest.invoice_number.match(/INV-(\d+)/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `INV-${String(next).padStart(3, "0")}`;
}

/* ─── Validation ─── */

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(1),
  unit_price_cents: z.number().int().min(0),
});

const CURRENCY_VALUES = ["USD", "CAD", "EUR", "GBP", "AUD"] as const;
const TEMPLATE_SLUGS_ZOD = z.enum(["classic-minimal", "modern-bold", "trade-service"]);

const createInvoiceBody = z.object({
  appointment_id: z.number().int().optional(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1),
  tax_cents: z.number().int().min(0).optional().default(0),
  due_date: z.string().optional(), // ISO string
  issue_date: z.string().optional(), // ISO string (defaults to today)
  invoice_number: z.string().min(1).optional(), // user override; else auto
  notes: z.string().optional(),
  currency: z.enum(CURRENCY_VALUES).optional(),
  template_slug: TEMPLATE_SLUGS_ZOD.optional(),
  contact_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateInvoiceBody = z.object({
  customer_name: z.string().min(1).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1).optional(),
  tax_cents: z.number().int().min(0).optional(),
  due_date: z.string().optional(),
  issue_date: z.string().optional(),
  invoice_number: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "sent", "viewed", "paid", "overdue", "cancelled"]).optional(),
  payment_method: z.enum(["stripe", "cash", "check", "etransfer", "other"]).optional(),
  currency: z.enum(CURRENCY_VALUES).optional(),
  template_slug: TEMPLATE_SLUGS_ZOD.optional(),
  contact_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const sendInvoiceBody = z.object({
  /** Optional override — defaults to the invoice's stored customer_email. */
  to_email: z.string().email().optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
});

const markPaidBody = z.object({
  payment_method: z.enum(["cash", "check", "etransfer", "other"]),
  paid_at: z.string().optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

const checkoutBody = z.object({
  amount_cents: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  quote_details: z.record(z.unknown()).optional(),
});

/* ─── BookFlow public booking + setup validation ─── */

const workingDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
});

const serviceDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  price_cents: z.number().int().min(0),
  description: z.string().optional(),
});

/** Public booking submission from /book/:slug. */
const publicBookBody = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerAddress: z.string().optional(),
  serviceId: z.string().optional(),
  startTime: z.string().min(1), // ISO timestamp
  notes: z.string().optional(),
});

/** Portal setup payload — configure the public booking page. */
const setupBody = z.object({
  business_name: z.string().min(1).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens")
    .min(2)
    .max(60)
    .optional(),
  is_active: z.boolean().optional(),
  timezone: z.string().optional(),
  slot_duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(240).optional(),
  working_hours: z.record(workingDaySchema).optional(),
  services: z.array(serviceDefSchema).optional(),
  confirmation_message: z.string().max(2000).optional(),
  auto_confirm: z.boolean().optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Expected a hex colour like #3B82F6")
    .optional(),
});

/* ─── Route Registration ─── */

export function registerBookflowRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Feature 1: Simple Invoicing — Portal
     ═══════════════════════════════════════════ */

  /** POST /api/portal/bookflow/invoices — create invoice */
  app.post("/api/portal/bookflow/invoices", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const parsed = createInvoiceBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { data } = parsed;
      const subtotal_cents = data.line_items.reduce(
        (sum, li) => sum + li.quantity * li.unit_price_cents, 0
      );
      const tax_cents = data.tax_cents ?? 0;
      const total_cents = subtotal_cents + tax_cents;
      const invoice_number = data.invoice_number || await nextInvoiceNumber(clientId);
      const pay_link_token = crypto.randomBytes(16).toString("hex");

      // Apply account-level defaults for template + currency when the create
      // payload doesn't specify them.
      const [clientPrefs] = await db
        .select({
          template_slug: clients.default_invoice_template_slug,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      const issue_date = (data.issue_date ? new Date(data.issue_date) : new Date()).toISOString().slice(0, 10);

      const [invoice] = await db.insert(bookflowInvoices).values({
        client_id: clientId,
        appointment_id: data.appointment_id,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        line_items: data.line_items,
        subtotal_cents,
        tax_cents,
        total_cents,
        invoice_number,
        pay_link_token,
        issue_date,
        due_date: data.due_date ? new Date(data.due_date) : null,
        notes: data.notes,
        status: "draft",
        currency: data.currency || "USD",
        template_slug: data.template_slug || clientPrefs?.template_slug || "classic-minimal",
        contact_id: data.contact_id || null,
        metadata: data.metadata as any,
      }).returning();

      log.info("Invoice created", { invoiceId: String(invoice.id), invoiceNumber: invoice_number });
      res.status(201).json(invoice);
    } catch (err: any) {
      log.error("Failed to create invoice", { error: err.message });
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  /** GET /api/portal/bookflow/invoices — list invoices.
   *
   *  Query params:
   *    status            — exact match (draft|sent|viewed|paid|overdue|cancelled)
   *    q                 — substring against customer_name / invoice_number
   *    range             — 30d | 90d | all (default all)
   *    sort              — newest | oldest | amount_desc | amount_asc
   */
  app.get("/api/portal/bookflow/invoices", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const status = req.query.status as string | undefined;
      const q = (req.query.q as string | undefined)?.trim();
      const range = (req.query.range as string | undefined) || "all";
      const sort = (req.query.sort as string | undefined) || "newest";

      const conditions = [eq(bookflowInvoices.client_id, clientId)];
      if (status) conditions.push(eq(bookflowInvoices.status, status));

      if (q && q.length > 0) {
        const like = `%${q}%`;
        conditions.push(
          // Drizzle's `or` over two ilike checks against customer_name or invoice_number.
          sql`(${bookflowInvoices.customer_name} ILIKE ${like} OR COALESCE(${bookflowInvoices.invoice_number}, '') ILIKE ${like})`,
        );
      }

      if (range === "30d" || range === "90d") {
        const days = range === "30d" ? 30 : 90;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        conditions.push(gte(bookflowInvoices.created_at, cutoff));
      }

      const orderBy = (() => {
        switch (sort) {
          case "oldest": return bookflowInvoices.created_at;
          case "amount_desc": return desc(bookflowInvoices.total_cents);
          case "amount_asc": return bookflowInvoices.total_cents;
          case "newest":
          default: return desc(bookflowInvoices.created_at);
        }
      })();

      const invoices = await db
        .select()
        .from(bookflowInvoices)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(200);

      res.json(invoices);
    } catch (err: any) {
      log.error("Failed to list invoices", { error: err.message });
      res.status(500).json({ error: "Failed to list invoices" });
    }
  });

  /** GET /api/portal/bookflow/invoices/:id — single invoice for detail view */
  app.get("/api/portal/bookflow/invoices/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(String(req.params.id));
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const [invoice] = await db
        .select()
        .from(bookflowInvoices)
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      // Hydrate the linked contact (billing address auto-fill).
      let linkedContact: any = null;
      if (invoice.contact_id) {
        const [c] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, invoice.contact_id))
          .limit(1);
        linkedContact = c || null;
      }

      // Account branding for the live preview pane.
      const [client] = await db
        .select({
          business_name: clients.business_name,
          contact_email: clients.contact_email,
          contact_phone: clients.contact_phone,
          website_url: clients.website_url,
          logo_url: clients.logo_url,
          accent_color: clients.invoice_accent_color,
          default_template: clients.default_invoice_template_slug,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      res.json({
        invoice,
        contact: linkedContact,
        client,
      });
    } catch (err: any) {
      log.error("Failed to load invoice", { error: err.message });
      res.status(500).json({ error: "Failed to load invoice" });
    }
  });

  /** PATCH /api/portal/bookflow/invoices/:id — update invoice */
  app.patch("/api/portal/bookflow/invoices/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(String(req.params.id));
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const parsed = updateInvoiceBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { data } = parsed;

      // Recalculate totals if line items changed.
      const updates: Record<string, any> = { ...data, updated_at: new Date() };
      if (data.line_items) {
        updates.subtotal_cents = data.line_items.reduce(
          (sum, li) => sum + li.quantity * li.unit_price_cents, 0
        );
        // If tax wasn't sent on the PATCH, reuse the stored value so total
        // stays accurate.
        if (data.tax_cents === undefined) {
          const [existing] = await db
            .select({ tax_cents: bookflowInvoices.tax_cents })
            .from(bookflowInvoices)
            .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
            .limit(1);
          updates.tax_cents = existing?.tax_cents ?? 0;
        }
        updates.total_cents = updates.subtotal_cents + (updates.tax_cents ?? 0);
      } else if (data.tax_cents !== undefined) {
        // Tax-only update — recompute total against existing subtotal.
        const [existing] = await db
          .select({ subtotal_cents: bookflowInvoices.subtotal_cents })
          .from(bookflowInvoices)
          .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
          .limit(1);
        if (existing) {
          updates.total_cents = existing.subtotal_cents + data.tax_cents;
        }
      }

      if (data.due_date) updates.due_date = new Date(data.due_date);
      if (data.issue_date) updates.issue_date = new Date(data.issue_date).toISOString().slice(0, 10);
      if (data.status === "paid") updates.paid_at = new Date();

      const [updated] = await db
        .update(bookflowInvoices)
        .set(updates)
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Invoice not found" });
      res.json(updated);
    } catch (err: any) {
      log.error("Failed to update invoice", { error: err.message });
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  /** POST /api/portal/bookflow/invoices/:id/send — send invoice email.
   *
   *  Body (all optional): { to_email, subject, body }.
   *  Generates the PDF using the invoice's template_slug and attaches it.
   */
  app.post("/api/portal/bookflow/invoices/:id/send", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(String(req.params.id));
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const parsedBody = sendInvoiceBody.safeParse(req.body || {});
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid input", details: parsedBody.error.flatten() });
      }

      const [invoice] = await db
        .select()
        .from(bookflowInvoices)
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const recipientEmail = parsedBody.data.to_email || invoice.customer_email;
      if (!recipientEmail) return res.status(400).json({ error: "Customer email required to send" });

      const [client] = await db
        .select({
          business_name: clients.business_name,
          contact_email: clients.contact_email,
          contact_phone: clients.contact_phone,
          website_url: clients.website_url,
          logo_url: clients.logo_url,
          accent_color: clients.invoice_accent_color,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      const businessName = client?.business_name || "Your Service Provider";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const payUrl = `${protocol}://${host}/pay/${invoice.pay_link_token}`;

      // Per-invoice accent override (stored in metadata) wins over account.
      const meta = (invoice.metadata as Record<string, any>) || {};
      const accentColor =
        (typeof meta.accent_color === "string" && /^#[0-9A-Fa-f]{6}$/.test(meta.accent_color))
          ? meta.accent_color
          : client?.accent_color || "#0d3cfc";

      let pdfAttachment: { filename: string; buffer: Buffer } | undefined;
      try {
        const pdfData: InvoicePdfData = {
          invoice_number: invoice.invoice_number || "INV-000",
          status: invoice.status || "draft",
          issue_date: invoice.issue_date ? new Date(invoice.issue_date) : (invoice.created_at || null),
          due_date: invoice.due_date,
          currency: invoice.currency || "USD",
          line_items: invoice.line_items as Array<{ description: string; quantity: number; unit_price_cents: number }>,
          subtotal_cents: invoice.subtotal_cents,
          tax_cents: invoice.tax_cents ?? 0,
          total_cents: invoice.total_cents,
          notes: invoice.notes,
          customer_name: invoice.customer_name,
          customer_email: invoice.customer_email,
          customer_phone: invoice.customer_phone,
          billing_street: null,
          billing_city: null,
          billing_region: null,
          billing_postal: null,
          billing_country: null,
          business_name: businessName,
          business_email: client?.contact_email || null,
          business_phone: client?.contact_phone || null,
          business_website: client?.website_url || null,
          logo_url: client?.logo_url || null,
          accent_color: accentColor,
          pay_url: payUrl,
        };

        // Pull contact billing fields when an invoice is linked.
        if (invoice.contact_id) {
          const [linkedContact] = await db
            .select({
              billing_street: contacts.billing_street,
              billing_city: contacts.billing_city,
              billing_region: contacts.billing_region,
              billing_postal: contacts.billing_postal,
              billing_country: contacts.billing_country,
            })
            .from(contacts)
            .where(eq(contacts.id, invoice.contact_id))
            .limit(1);
          if (linkedContact) {
            pdfData.billing_street = linkedContact.billing_street;
            pdfData.billing_city = linkedContact.billing_city;
            pdfData.billing_region = linkedContact.billing_region;
            pdfData.billing_postal = linkedContact.billing_postal;
            pdfData.billing_country = linkedContact.billing_country;
          }
        }

        const buf = await renderInvoicePdf(invoice.template_slug, pdfData);
        pdfAttachment = {
          filename: `invoice-${invoice.invoice_number || invoice.id}.pdf`,
          buffer: buf,
        };
      } catch (pdfErr: any) {
        // PDF generation failure must not block the email — log and continue.
        log.warn("PDF generation failed, sending email without attachment", {
          invoiceId: String(invoiceId),
          error: pdfErr.message,
        });
      }

      await sendInvoiceEmail({
        recipientEmail,
        customerName: invoice.customer_name,
        businessName,
        invoiceNumber: invoice.invoice_number || "INV-000",
        lineItems: invoice.line_items as Array<{ description: string; quantity: number; unit_price_cents: number }>,
        subtotalCents: invoice.subtotal_cents,
        taxCents: invoice.tax_cents ?? 0,
        totalCents: invoice.total_cents,
        dueDate: invoice.due_date,
        notes: invoice.notes,
        payUrl,
        subjectOverride: parsedBody.data.subject,
        introOverride: parsedBody.data.body,
        pdfAttachment,
      });

      await db
        .update(bookflowInvoices)
        .set({ status: "sent", updated_at: new Date() })
        .where(eq(bookflowInvoices.id, invoiceId));

      log.info("Invoice sent", { invoiceId: String(invoiceId), pdf: pdfAttachment ? "yes" : "no" });
      res.json({ success: true, pdf_attached: !!pdfAttachment });
    } catch (err: any) {
      log.error("Failed to send invoice", { error: err.message });
      res.status(500).json({ error: "Failed to send invoice" });
    }
  });

  /** POST /api/portal/bookflow/invoices/:id/mark-paid — manual payment recording */
  app.post("/api/portal/bookflow/invoices/:id/mark-paid", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(String(req.params.id));
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const parsed = markPaidBody.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const [existing] = await db
        .select({ metadata: bookflowInvoices.metadata })
        .from(bookflowInvoices)
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Invoice not found" });

      const existingMeta = (existing.metadata as Record<string, any>) || {};
      const newMeta = {
        ...existingMeta,
        payment_reference: parsed.data.reference || existingMeta.payment_reference,
        payment_notes: parsed.data.notes || existingMeta.payment_notes,
      };

      const [updated] = await db
        .update(bookflowInvoices)
        .set({
          status: "paid",
          payment_method: parsed.data.payment_method,
          paid_at: parsed.data.paid_at ? new Date(parsed.data.paid_at) : new Date(),
          metadata: newMeta,
          updated_at: new Date(),
        })
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .returning();

      log.info("Invoice marked paid manually", {
        invoiceId: String(invoiceId),
        method: parsed.data.payment_method,
      });
      res.json(updated);
    } catch (err: any) {
      log.error("Failed to mark invoice paid", { error: err.message });
      res.status(500).json({ error: "Failed to mark invoice paid" });
    }
  });

  /* ═══════════════════════════════════════════
     Feature 1: Simple Invoicing — Public Pay
     ═══════════════════════════════════════════ */

  /** GET /api/pay/:token — view invoice (public, no auth) */
  app.get("/api/pay/:token", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token);
      const [invoice] = await db
        .select()
        .from(bookflowInvoices)
        .where(eq(bookflowInvoices.pay_link_token, token))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      // Get business name
      const [client] = await db
        .select({ business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, invoice.client_id))
        .limit(1);

      // Mark as viewed if sent
      if (invoice.status === "sent") {
        await db
          .update(bookflowInvoices)
          .set({ status: "viewed", updated_at: new Date() })
          .where(eq(bookflowInvoices.id, invoice.id));
      }

      // Get Stripe Connect account for the client
      const [settings] = await db
        .select()
        .from(bookflowSettings)
        .where(eq(bookflowSettings.client_id, invoice.client_id))
        .limit(1);

      // Check if Stripe is available through calculator settings
      const [calc] = await db
        .select({ calculator_settings: calculators.calculator_settings })
        .from(calculators)
        .where(eq(calculators.user_id, invoice.client_id))
        .limit(1);

      const calcSettings = (calc?.calculator_settings as any) || {};
      const stripeAccountId = calcSettings?.booking_settings?.stripe_account_id;

      // Payment methods configured by the tradesperson
      const paymentMethods = (settings?.payment_methods as Record<string, unknown>) || {};

      res.json({
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        line_items: invoice.line_items,
        subtotal_cents: invoice.subtotal_cents,
        tax_cents: invoice.tax_cents,
        total_cents: invoice.total_cents,
        due_date: invoice.due_date,
        status: invoice.status,
        paid_at: invoice.paid_at,
        notes: invoice.notes,
        business_name: client?.business_name || "Service Provider",
        stripe_enabled: !!stripeAccountId,
        payment_methods: paymentMethods,
      });
    } catch (err: any) {
      log.error("Failed to load invoice", { error: err.message });
      res.status(500).json({ error: "Failed to load invoice" });
    }
  });

  /** POST /api/pay/:token/checkout — create Stripe Checkout session */
  app.post("/api/pay/:token/checkout", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token);
      const [invoice] = await db
        .select()
        .from(bookflowInvoices)
        .where(eq(bookflowInvoices.pay_link_token, token))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (invoice.status === "paid") return res.status(400).json({ error: "Invoice already paid" });
      if (invoice.status === "cancelled") return res.status(400).json({ error: "Invoice cancelled" });

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

      // Get Stripe Connect account ID
      const [calc] = await db
        .select({ calculator_settings: calculators.calculator_settings })
        .from(calculators)
        .where(eq(calculators.user_id, invoice.client_id))
        .limit(1);

      const calcSettings = (calc?.calculator_settings as any) || {};
      const stripeAccountId = calcSettings?.booking_settings?.stripe_account_id;

      if (!stripeAccountId) return res.status(400).json({ error: "Business has not connected Stripe" });

      // Get business name
      const [client] = await db
        .select({ business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, invoice.client_id))
        .limit(1);

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const platformFeePercent = 2.9;
      const applicationFee = Math.round(invoice.total_cents * platformFeePercent / 100);

      // Broad payment method types — Stripe auto-shows relevant options
      const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = [
        "card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit",
      ];

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: paymentMethodTypes,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${invoice.invoice_number} — ${client?.business_name || "Service"}`,
            },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: applicationFee,
          metadata: {
            invoice_id: String(invoice.id),
            pay_link_token: token,
            type: "bookflow_invoice",
          },
        },
        success_url: `${baseUrl}/pay/${token}?paid=1`,
        cancel_url: `${baseUrl}/pay/${token}`,
        customer_email: invoice.customer_email || undefined,
      }, {
        stripeAccount: stripeAccountId,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      log.error("Failed to create checkout session", { error: err.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ═══════════════════════════════════════════
     Feature 2: Simple Dispatch
     ═══════════════════════════════════════════ */

  /** GET /api/portal/bookflow/dispatch — get appointments for a date */
  app.get("/api/portal/bookflow/dispatch", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Date filter — defaults to today
      const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const dayStart = new Date(dateStr + "T00:00:00.000Z");
      const dayEnd = new Date(dateStr + "T23:59:59.999Z");

      const appointments = await db
        .select()
        .from(bookflowAppointments)
        .where(
          and(
            eq(bookflowAppointments.client_id, clientId),
            gte(bookflowAppointments.start_time, dayStart),
            lte(bookflowAppointments.start_time, dayEnd),
          )
        )
        .orderBy(bookflowAppointments.start_time);

      res.json(appointments);
    } catch (err: any) {
      log.error("Failed to load dispatch", { error: err.message });
      res.status(500).json({ error: "Failed to load dispatch" });
    }
  });

  /** PATCH /api/portal/bookflow/appointments/:id/status — update appointment status */
  app.patch("/api/portal/bookflow/appointments/:id/status", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const appointmentId = parseInt(String(req.params.id));
      if (isNaN(appointmentId)) return res.status(400).json({ error: "Invalid appointment ID" });

      const { status } = req.body;
      const validStatuses = ["confirmed", "pending", "cancelled", "completed", "no_show"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [updated] = await db
        .update(bookflowAppointments)
        .set({ status, updated_at: new Date() })
        .where(and(
          eq(bookflowAppointments.id, appointmentId),
          eq(bookflowAppointments.client_id, clientId),
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Appointment not found" });

      log.info("Appointment status updated", { appointmentId: String(appointmentId), status });
      res.json(updated);
    } catch (err: any) {
      log.error("Failed to update appointment", { error: err.message });
      res.status(500).json({ error: "Failed to update appointment" });
    }
  });

  /* ═══════════════════════════════════════════
     Feature 3: QuoteQuick Payment Integration
     ═══════════════════════════════════════════ */

  /** POST /api/calculators/:id/checkout — QuoteQuick payment checkout */
  app.post("/api/calculators/:id/checkout", async (req: Request, res: Response) => {
    try {
      const calcId = parseInt(String(req.params.id));
      if (isNaN(calcId)) return res.status(400).json({ error: "Invalid calculator ID" });

      const parsed = checkoutBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { data } = parsed;

      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

      const calc = await db
        .select()
        .from(calculators)
        .where(eq(calculators.id, calcId))
        .limit(1);

      if (!calc[0]) return res.status(404).json({ error: "Calculator not found" });

      const settings = (calc[0].calculator_settings as any) || {};
      const bookingSettings = settings.booking_settings || {};

      if (!bookingSettings.accept_payments) {
        return res.status(400).json({ error: "Payments not enabled for this calculator" });
      }

      const stripeAccountId = bookingSettings.stripe_account_id;
      if (!stripeAccountId) {
        return res.status(400).json({ error: "Business has not connected Stripe" });
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const platformFeePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || "2.9");
      const applicationFee = Math.round(data.amount_cents * platformFeePercent / 100);

      const depositPercent = bookingSettings.deposit_percent || 100;
      const depositAmount = Math.round(data.amount_cents * depositPercent / 100);
      const depositFee = Math.round(depositAmount * platformFeePercent / 100);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: depositPercent < 100
                ? `${depositPercent}% Deposit — ${calc[0].business_name}`
                : `Payment — ${calc[0].business_name}`,
            },
            unit_amount: depositAmount,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: depositFee,
          metadata: {
            calculator_id: String(calcId),
            customer_name: data.customer_name,
            customer_email: data.customer_email || "",
            customer_phone: data.customer_phone || "",
            type: "quotequick_payment",
            full_amount_cents: String(data.amount_cents),
            deposit_percent: String(depositPercent),
          },
        },
        success_url: `${baseUrl}/calculator?slug=${calc[0].slug}&paid=1`,
        cancel_url: `${baseUrl}/calculator?slug=${calc[0].slug}`,
        customer_email: data.customer_email || undefined,
      }, {
        stripeAccount: stripeAccountId,
      });

      log.info("QuoteQuick checkout created", { calcId: String(calcId), amount: String(depositAmount) });
      res.json({ url: session.url, deposit_amount_cents: depositAmount });
    } catch (err: any) {
      log.error("Failed to create QuoteQuick checkout", { error: err.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ═══════════════════════════════════════════
     Stripe Connect Webhook handler for invoice payments
     ═══════════════════════════════════════════ */

  app.post("/api/bookflow/webhook/payment", async (req: Request, res: Response) => {
    const stripe = getStripeClient();
    if (!stripe) return res.status(503).send("Stripe not configured");

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.BOOKFLOW_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig as string,
          webhookSecret,
        );
      } catch (err: any) {
        log.error("Webhook signature verification failed", { error: err.message });
        return res.status(400).send("Invalid signature");
      }
    } else if (process.env.NODE_ENV === "production") {
      log.error("BOOKFLOW_WEBHOOK_SECRET not set in production");
      return res.status(500).send("Webhook secret not configured");
    } else {
      event = req.body as Stripe.Event;
      log.warn("No BOOKFLOW_WEBHOOK_SECRET — skipping verification (dev only)");
    }

    try {
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata || {};

        if (meta.type === "bookflow_invoice" && meta.pay_link_token) {
          await db
            .update(bookflowInvoices)
            .set({
              status: "paid",
              paid_at: new Date(),
              payment_method: "stripe",
              stripe_payment_intent_id: pi.id,
              updated_at: new Date(),
            })
            .where(eq(bookflowInvoices.pay_link_token, meta.pay_link_token));

          log.info("Invoice marked paid via webhook", { paymentIntent: pi.id });
        }

        if (meta.type === "quotequick_payment" && meta.calculator_id) {
          log.info("QuoteQuick payment succeeded", {
            calcId: meta.calculator_id,
            amount: String(pi.amount),
          });
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      log.error("Webhook handler error", { error: err.message });
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  /* ═══════════════════════════════════════════
     BookFlow settings — check feature toggles
     ═══════════════════════════════════════════ */

  /** PATCH /api/portal/bookflow/payment-methods — update payment methods */
  app.patch("/api/portal/bookflow/payment-methods", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const paymentMethodsSchema = z.object({
        stripe: z.boolean().optional(),
        paypal_email: z.string().optional(),
        bank_details: z.string().optional(),
        etransfer_email: z.string().optional(),
        venmo_handle: z.string().optional(),
        zelle_info: z.string().optional(),
        cash_accepted: z.boolean().optional(),
      });

      const parsed = paymentMethodsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      // Upsert bookflow settings with payment methods
      const [existing] = await db
        .select()
        .from(bookflowSettings)
        .where(eq(bookflowSettings.client_id, clientId))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(bookflowSettings)
          .set({ payment_methods: parsed.data, updated_at: new Date() })
          .where(eq(bookflowSettings.client_id, clientId))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db
          .insert(bookflowSettings)
          .values({ client_id: clientId, payment_methods: parsed.data })
          .returning();
        res.json(created);
      }

      log.info("Payment methods updated", { clientId: String(clientId) });
    } catch (err: any) {
      log.error("Failed to update payment methods", { error: err.message });
      res.status(500).json({ error: "Failed to update payment methods" });
    }
  });

  /** GET /api/portal/bookflow/settings — get bookflow settings for current client */
  app.get("/api/portal/bookflow/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [settings] = await db
        .select()
        .from(bookflowSettings)
        .where(eq(bookflowSettings.client_id, clientId))
        .limit(1);

      if (!settings) {
        // Return defaults — all features on
        return res.json({
          invoicing_enabled: true,
          dispatch_enabled: true,
          is_active: false,
        });
      }

      res.json(settings);
    } catch (err: any) {
      log.error("Failed to load bookflow settings", { error: err.message });
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  /* ═══════════════════════════════════════════
     BookFlow setup — Portal (configure public booking page)
     ═══════════════════════════════════════════ */

  /** GET /api/portal/bookflow/setup — get the booking-page config for the current client */
  app.get("/api/portal/bookflow/setup", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const settings = await getBookFlowSettings(clientId);

      if (!settings) {
        // Pre-fill business name from the client record so the form starts useful.
        const [client] = await db
          .select({ business_name: clients.business_name })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        return res.json({
          configured: false,
          is_active: false,
          business_name: client?.business_name ?? "",
          slug: null,
          timezone: "America/New_York",
          slot_duration_minutes: 60,
          buffer_minutes: 15,
          working_hours: null,
          services: null,
          confirmation_message: null,
          auto_confirm: true,
          accent_color: "#3B82F6",
        });
      }

      res.json({ configured: true, ...settings });
    } catch (err: any) {
      log.error("Failed to load BookFlow setup", { error: err.message });
      res.status(500).json({ error: "Failed to load BookFlow setup" });
    }
  });

  /** PATCH /api/portal/bookflow/setup — create or update the booking-page config */
  app.patch("/api/portal/bookflow/setup", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const parsed = setupBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      // Guard against a slug collision with a different client.
      if (parsed.data.slug) {
        const existingBySlug = await getBookFlowSettingsBySlug(parsed.data.slug);
        if (existingBySlug && existingBySlug.client_id !== clientId) {
          return res.status(409).json({ error: "That booking-page address is already taken. Choose another." });
        }
      }

      const settings = await setupBookFlow(clientId, parsed.data);
      log.info("BookFlow setup saved", { clientId: String(clientId), slug: settings.slug ?? "" });
      res.json({ configured: true, ...settings });
    } catch (err: any) {
      log.error("Failed to save BookFlow setup", { error: err.message });
      res.status(500).json({ error: "Failed to save BookFlow setup" });
    }
  });

  /* ═══════════════════════════════════════════
     BookFlow public booking flow — /book/:slug
     (no auth — these power the public BookingPage)
     ═══════════════════════════════════════════ */

  /** GET /api/bookflow/:slug — public booking-page config */
  app.get("/api/bookflow/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const settings = await getBookFlowSettingsBySlug(slug);

      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }

      // Shape mapped to the BookflowConfig interface BookingPage expects.
      res.json({
        businessName: settings.business_name ?? "Booking",
        slug: settings.slug,
        timezone: settings.timezone ?? "America/New_York",
        slotDurationMinutes: settings.slot_duration_minutes ?? 60,
        services: (settings.services as unknown[] | null) ?? null,
        workingHours: (settings.working_hours as Record<string, unknown> | null) ?? null,
        confirmationMessage: settings.confirmation_message ?? null,
        autoConfirm: settings.auto_confirm ?? true,
        accentColor: settings.accent_color ?? "#3B82F6",
      });
    } catch (err: any) {
      log.error("Failed to load public booking config", { error: err.message });
      res.status(500).json({ error: "Failed to load booking page" });
    }
  });

  /** GET /api/bookflow/:slug/slots — available appointment slots */
  app.get("/api/bookflow/:slug/slots", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const settings = await getBookFlowSettingsBySlug(slug);

      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }

      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date — expected YYYY-MM-DD" });
      }
      const daysRaw = parseInt(String(req.query.days ?? "7"), 10);
      const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 30) : 7;

      const slots = await getAvailableSlots(settings.client_id, date, days);
      res.json({ slots });
    } catch (err: any) {
      log.error("Failed to load booking slots", { error: err.message });
      res.status(500).json({ error: "Failed to load slots" });
    }
  });

  /** POST /api/bookflow/:slug/book — create an appointment from the public page */
  app.post("/api/bookflow/:slug/book", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      const settings = await getBookFlowSettingsBySlug(slug);

      if (!settings || !settings.is_active) {
        return res.status(404).json({ error: "Booking page not found" });
      }

      const parsed = publicBookBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }
      const { data } = parsed;

      // Resolve the chosen service (if any) from the configured catalog.
      const services = (settings.services as Array<{
        id: string;
        name: string;
        duration_minutes: number;
      }> | null) ?? [];
      const service = data.serviceId ? services.find((s) => s.id === data.serviceId) : undefined;

      const appointment = await createAppointment(settings.client_id, {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        customerAddress: data.customerAddress,
        serviceName: service?.name,
        serviceDurationMinutes: service?.duration_minutes,
        startTime: data.startTime,
        notes: data.notes,
        source: "direct",
      });

      res.status(201).json({
        success: true,
        appointment: {
          id: appointment.id,
          status: appointment.status,
          startTime: appointment.start_time,
          endTime: appointment.end_time,
          serviceName: appointment.service_name,
        },
        confirmationMessage: settings.confirmation_message ?? null,
      });
    } catch (err: any) {
      // Slot-conflict / inactive errors from the service are user-facing.
      const msg = String(err?.message ?? "Booking failed");
      const isConflict = /no longer available|not active/i.test(msg);
      if (isConflict) {
        return res.status(409).json({ error: msg });
      }
      log.error("Failed to create public booking", { error: msg });
      res.status(500).json({ error: "Failed to create booking" });
    }
  });
}
