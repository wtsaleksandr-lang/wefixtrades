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
import { createLogger } from "../lib/logger";

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

const createInvoiceBody = z.object({
  appointment_id: z.number().int().optional(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1),
  tax_cents: z.number().int().min(0).optional().default(0),
  due_date: z.string().optional(), // ISO string
  notes: z.string().optional(),
});

const updateInvoiceBody = z.object({
  customer_name: z.string().min(1).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1).optional(),
  tax_cents: z.number().int().min(0).optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "sent", "viewed", "paid", "overdue", "cancelled"]).optional(),
  payment_method: z.enum(["stripe", "cash", "check", "other"]).optional(),
});

const checkoutBody = z.object({
  amount_cents: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  quote_details: z.record(z.unknown()).optional(),
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
      const invoice_number = await nextInvoiceNumber(clientId);
      const pay_link_token = crypto.randomBytes(16).toString("hex");

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
        due_date: data.due_date ? new Date(data.due_date) : null,
        notes: data.notes,
        status: "draft",
      }).returning();

      log.info("Invoice created", { invoiceId: String(invoice.id), invoiceNumber: invoice_number });
      res.status(201).json(invoice);
    } catch (err: any) {
      log.error("Failed to create invoice", { error: err.message });
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  /** GET /api/portal/bookflow/invoices — list invoices */
  app.get("/api/portal/bookflow/invoices", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const status = req.query.status as string | undefined;
      const conditions = [eq(bookflowInvoices.client_id, clientId)];
      if (status) conditions.push(eq(bookflowInvoices.status, status));

      const invoices = await db
        .select()
        .from(bookflowInvoices)
        .where(and(...conditions))
        .orderBy(desc(bookflowInvoices.created_at))
        .limit(100);

      res.json(invoices);
    } catch (err: any) {
      log.error("Failed to list invoices", { error: err.message });
      res.status(500).json({ error: "Failed to list invoices" });
    }
  });

  /** PATCH /api/portal/bookflow/invoices/:id — update invoice */
  app.patch("/api/portal/bookflow/invoices/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const parsed = updateInvoiceBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { data } = parsed;

      // Recalculate totals if line items changed
      const updates: Record<string, any> = { ...data, updated_at: new Date() };
      if (data.line_items) {
        updates.subtotal_cents = data.line_items.reduce(
          (sum, li) => sum + li.quantity * li.unit_price_cents, 0
        );
        updates.total_cents = updates.subtotal_cents + (data.tax_cents ?? 0);
      }
      if (data.due_date) updates.due_date = new Date(data.due_date);
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

  /** POST /api/portal/bookflow/invoices/:id/send — send invoice email */
  app.post("/api/portal/bookflow/invoices/:id/send", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid invoice ID" });

      const [invoice] = await db
        .select()
        .from(bookflowInvoices)
        .where(and(eq(bookflowInvoices.id, invoiceId), eq(bookflowInvoices.client_id, clientId)))
        .limit(1);

      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (!invoice.customer_email) return res.status(400).json({ error: "Customer email required to send" });

      // Get business name from client record
      const [client] = await db
        .select({ business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      const businessName = client?.business_name || "Your Service Provider";

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const payUrl = `${protocol}://${host}/pay/${invoice.pay_link_token}`;

      await sendInvoiceEmail({
        recipientEmail: invoice.customer_email,
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
      });

      // Mark as sent
      await db
        .update(bookflowInvoices)
        .set({ status: "sent", updated_at: new Date() })
        .where(eq(bookflowInvoices.id, invoiceId));

      log.info("Invoice sent", { invoiceId: String(invoiceId) });
      res.json({ success: true });
    } catch (err: any) {
      log.error("Failed to send invoice", { error: err.message });
      res.status(500).json({ error: "Failed to send invoice" });
    }
  });

  /* ═══════════════════════════════════════════
     Feature 1: Simple Invoicing — Public Pay
     ═══════════════════════════════════════════ */

  /** GET /api/pay/:token — view invoice (public, no auth) */
  app.get("/api/pay/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
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
      const token = req.params.token;
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

      const appointmentId = parseInt(req.params.id);
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
      const calcId = parseInt(req.params.id);
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
}
