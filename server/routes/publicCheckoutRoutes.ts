/**
 * Public checkout route — allows website visitors to start a checkout
 * without admin authentication.
 *
 * Flow:
 *   1. Visitor fills short intake form on pricing page
 *   2. POST /api/public/checkout with business info + item IDs
 *   3. Endpoint creates/reuses CRM client, provisions services (pending),
 *      creates Stripe Checkout Session with all line items
 *   4. Returns checkout_url → visitor redirects to Stripe
 *   5. Existing webhook (stripeBillingRoutes) handles payment confirmation
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "../storage";
import type { ServiceCatalogRow } from "@shared/schema";
import { getTradeLineDefaultConfig } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { autoAssignSupplier } from "../services/supplierAssignment";

const log = createLogger("PublicCheckout");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

interface CheckoutRequestBody {
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  items: string[];          // service_catalog IDs, e.g. ["tradeline-starter", "mapguard-basic"]
  bundle_id?: string;       // optional: which bundle this came from (metadata only)
  billing_period?: "monthly" | "yearly"; // defaults to "monthly"
}

export function registerPublicCheckoutRoutes(app: Express): void {

  app.post("/api/public/checkout", async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Payments are not configured yet. Please contact us directly." });

      /* ─── Validate input ─── */
      const body = req.body as CheckoutRequestBody;
      const { business_name, contact_name, contact_email, contact_phone, items, bundle_id } = body;
      const billingPeriod = body.billing_period === "yearly" ? "yearly" : "monthly";

      if (!business_name?.trim()) return res.status(400).json({ error: "Business name is required" });
      if (!contact_name?.trim()) return res.status(400).json({ error: "Your name is required" });
      if (!contact_email?.trim() || !contact_email.includes("@")) return res.status(400).json({ error: "A valid email is required" });
      if (!items?.length) return res.status(400).json({ error: "At least one service must be selected" });
      if (items.length > 10) return res.status(400).json({ error: "Too many items" });

      /* ─── Look up all requested services ─── */
      const services: Array<ServiceCatalogRow & { _resolvedPriceId: string }> = [];
      for (const id of items) {
        const svc = await storage.getServiceById(id);
        if (!svc) return res.status(400).json({ error: `Unknown service: ${id}` });
        if (!svc.is_active) return res.status(400).json({ error: `Service ${svc.name} is not available` });
        // Determine which Stripe price to use
        const wantsYearly = billingPeriod === "yearly" && svc.billing_period === "monthly";
        const resolvedPriceId = wantsYearly ? svc.stripe_yearly_price_id : svc.stripe_price_id;
        if (!resolvedPriceId) {
          const missing = wantsYearly ? "yearly" : "default";
          return res.status(400).json({ error: `${svc.name} does not have a ${missing} price configured. Please contact us.` });
        }
        services.push({ ...svc, _resolvedPriceId: resolvedPriceId });
      }

      /* ─── Find or create CRM client ─── */
      let client = await storage.findClientByEmail(contact_email.trim());

      if (client) {
        // Update with latest info if changed
        const updates: Record<string, any> = {};
        if (business_name.trim() !== client.business_name) updates.business_name = business_name.trim();
        if (contact_name.trim() !== client.contact_name) updates.contact_name = contact_name.trim();
        if (contact_phone?.trim() && contact_phone.trim() !== client.contact_phone) updates.contact_phone = contact_phone.trim();
        if (Object.keys(updates).length > 0) {
          client = (await storage.updateClient(client.id, updates)) || client;
        }
      } else {
        client = await storage.createClient({
          business_name: business_name.trim(),
          contact_name: contact_name.trim(),
          contact_email: contact_email.trim().toLowerCase(),
          contact_phone: contact_phone?.trim() || null,
          status: "lead",
          source: "website",
        });
      }

      /* ─── Ensure Stripe Customer ─── */
      let stripeCustomerId = client.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: client.business_name,
          email: client.contact_email || undefined,
          phone: client.contact_phone || undefined,
          metadata: { crm_client_id: String(client.id) },
        });
        stripeCustomerId = customer.id;
        await storage.updateClient(client.id, { stripe_customer_id: stripeCustomerId });
      }

      /* ─── Provision each service (pending — payment not yet confirmed) ─── */
      for (const svc of services) {
        // Skip if already provisioned (idempotent)
        const existing = await storage.findClientServiceByServiceId(client.id, svc.id);
        if (existing) continue;

        // Set TradeLine config defaults if this is a TradeLine service
        const tradelineDefaults = getTradeLineDefaultConfig(svc.id);
        const metadata = tradelineDefaults ? { tradeline: tradelineDefaults } : undefined;

        const cs = await storage.createClientService({
          client_id: client.id,
          service_id: svc.id,
          status: "pending",
          enabled: true,
          fulfillment_mode: "internal",
          price_cents: svc.default_price,
          billing_period: svc.billing_period,
          metadata,
        });

        // Auto-populate TradeLine notifications from client contact info
        if (tradelineDefaults) {
          const notifications: { email: string[]; sms: string[] } = { email: [], sms: [] };
          if (client.contact_email) notifications.email.push(client.contact_email);
          if (client.contact_phone) notifications.sms.push(client.contact_phone);
          if (notifications.email.length || notifications.sms.length) {
            await storage.updateTradeLineConfig(cs.id, { notifications });
          }
        }

        // Create pending payment record (webhook will mark it paid)
        await storage.createClientPayment({
          client_id: client.id,
          client_service_id: cs.id,
          type: svc.billing_period === "monthly" ? "invoice" : "payment",
          amount_cents: svc.default_price ?? 0,
          status: "pending",
          description: `${svc.name} — ${svc.billing_period === "monthly" ? "monthly" : "one-time"}`,
          actor_type: "system",
        });

        // Create onboarding if template exists
        const tmpl = await storage.getOnboardingTemplate(svc.id);
        if (tmpl) {
          await storage.createOnboardingSubmission({
            client_service_id: cs.id,
            client_id: client.id,
            template_id: tmpl.id,
            status: "not_sent",
            actor_type: "system",
          });
        }

        // Create fulfillment tasks
        const tasks = await storage.getTaskTemplates(svc.id);
        for (const t of tasks) {
          const task = await storage.createFulfillmentTask({
            client_service_id: cs.id,
            client_id: client.id,
            title: t.title,
            description: t.description,
            sort_order: t.sort_order,
            priority: t.default_priority,
            handled_by: t.default_handled_by,
            waiting_on: t.default_waiting_on,
            human_review_required: t.human_review_required,
            due_at: t.sla_days ? new Date(Date.now() + t.sla_days * 86400000) : null,
            status: "not_started",
            actor_type: "system",
          });

          // Auto-assign supplier if template specifies handled_by = "supplier"
          if (t.default_handled_by === "supplier") {
            try { await autoAssignSupplier(task); } catch (_) { /* fail-safe */ }
          }
        }
      }

      // Update client status to onboarding
      if (client.status === "lead") {
        await storage.updateClient(client.id, { status: "onboarding" });
      }

      /* ─── Build Stripe Checkout Session ─── */
      // Determine mode: if ANY item is subscription, use subscription mode
      // (Stripe subscription mode supports mixing subscription + one-time line items)
      const hasSubscription = services.some(s => s.billing_period === "monthly");
      const mode = hasSubscription ? "subscription" : "payment";

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = services.map(svc => ({
        price: svc._resolvedPriceId,
        quantity: 1,
      }));

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        line_items: lineItems,
        metadata: {
          crm_client_id: String(client.id),
          service_catalog_id: services.map(s => s.id).join(","),
          bundle_id: bundle_id || "",
          billing_period: billingPeriod,
          source: "public_checkout",
        },
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/cancelled`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
      });

      /* ─── Log activity ─── */
      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "Public Checkout",
        action: "checkout.initiated",
        entity_type: "client",
        entity_id: client.id,
        summary: `Public checkout started for "${client.business_name}" — ${services.map(s => s.name).join(", ")}`,
        metadata: {
          stripe_session_id: session.id,
          items: services.map(s => s.id),
          bundle_id: bundle_id || null,
        },
      });

      res.json({
        checkout_url: session.url,
        session_id: session.id,
      });

    } catch (err: any) {
      log.error("[public-checkout] Error:", err.message);
      res.status(500).json({ error: "Something went wrong. Please try again or contact us." });
    }
  });
}
