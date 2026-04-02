/**
 * NEW Stripe Billing Routes — Direct charges for WeFixTrades service sales.
 *
 * This is SEPARATE from the legacy Stripe Connect flow in stripeRoutes.ts.
 * Legacy = calculator owners collecting deposits via Connect.
 * This = WeFixTrades selling its own services to clients.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { requireAdmin } from "../auth";
import { storage } from "../storage";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

export function registerStripeBillingRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Checkout Session (admin-initiated)
     ═══════════════════════════════════════════ */

  app.post("/api/billing/checkout", requireAdmin, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

      const { client_id, service_id } = req.body;
      if (!client_id || !service_id) {
        return res.status(400).json({ error: "client_id and service_id are required" });
      }

      // Look up service
      const service = await storage.getServiceById(service_id);
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (!service.stripe_price_id) {
        return res.status(400).json({ error: "Service has no Stripe Price. Run sync-stripe.ts first." });
      }

      // Look up client
      const client = await storage.getClientById(client_id);
      if (!client) return res.status(404).json({ error: "Client not found" });

      // Ensure client has a Stripe Customer
      let stripeCustomerId = client.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: client.business_name,
          email: client.contact_email || undefined,
          phone: client.contact_phone || undefined,
          metadata: {
            crm_client_id: String(client.id),
          },
        });
        stripeCustomerId = customer.id;
        await storage.updateClient(client.id, { stripe_customer_id: stripeCustomerId });
      }

      // Determine mode based on billing period
      const isSubscription = service.billing_period === "monthly";
      const mode = isSubscription ? "subscription" : "payment";

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode,
        line_items: [{
          price: service.stripe_price_id,
          quantity: 1,
        }],
        metadata: {
          crm_client_id: String(client.id),
          service_catalog_id: service.id,
        },
        success_url: `${baseUrl}/admin/crm/clients/${client.id}?checkout=success`,
        cancel_url: `${baseUrl}/admin/crm/clients/${client.id}?checkout=cancelled`,
      });

      res.json({
        checkout_url: session.url,
        session_id: session.id,
      });
    } catch (err: any) {
      console.error("[billing] Checkout error:", err.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ═══════════════════════════════════════════
     Webhook Handler
     ═══════════════════════════════════════════ */

  app.post("/api/billing/webhook", async (req: Request, res: Response) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).send("Stripe not configured");

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      // Verify signature in production
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig as string,
          webhookSecret,
        );
      } catch (err: any) {
        console.error("[billing-webhook] Signature verification failed:", err.message);
        return res.status(400).send("Invalid signature");
      }
    } else {
      // No webhook secret configured — accept event without verification (dev mode)
      event = req.body as Stripe.Event;
      console.warn("[billing-webhook] No STRIPE_BILLING_WEBHOOK_SECRET — skipping signature verification");
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case "invoice.paid":
          await handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await handleInvoiceFailed(event.data.object as Stripe.Invoice);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        default:
          // Ignore unhandled events
          break;
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error(`[billing-webhook] Error handling ${event.type}:`, err.message);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });
}

/* ─── Webhook Handlers ─── */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const clientId = parseInt(session.metadata?.crm_client_id || "0");
  const serviceId = session.metadata?.service_catalog_id;

  if (!clientId || !serviceId) {
    console.warn("[billing-webhook] checkout.session.completed missing metadata, skipping");
    return;
  }

  // Idempotency: check if already provisioned
  const existing = await storage.findClientServiceByServiceId(clientId, serviceId);
  if (existing) {
    console.log(`[billing-webhook] Service ${serviceId} already provisioned for client ${clientId}, skipping`);
    // Still update payment status if needed
    await markPaymentPaid(clientId, serviceId, session.id, session.amount_total);
    return;
  }

  const service = await storage.getServiceById(serviceId);
  if (!service) {
    console.error(`[billing-webhook] Service ${serviceId} not found`);
    return;
  }

  // Provision the service (same logic as admin provision endpoint)
  const clientService = await storage.createClientService({
    client_id: clientId,
    service_id: serviceId,
    status: "pending",
    enabled: true,
    fulfillment_mode: "internal",
    price_cents: service.default_price,
    billing_period: service.billing_period,
  });

  // Create paid payment record
  await storage.createClientPayment({
    client_id: clientId,
    client_service_id: clientService.id,
    type: service.billing_period === "monthly" ? "invoice" : "payment",
    amount_cents: session.amount_total ?? service.default_price ?? 0,
    status: "paid",
    paid_at: new Date(),
    description: `${service.name} — ${service.billing_period === "monthly" ? "monthly" : "one-time"}`,
    stripe_payment_intent_id: session.id,
    actor_type: "system",
  });

  // Create onboarding submission if template exists
  const onboardingTemplate = await storage.getOnboardingTemplate(serviceId);
  if (onboardingTemplate) {
    await storage.createOnboardingSubmission({
      client_service_id: clientService.id,
      client_id: clientId,
      template_id: onboardingTemplate.id,
      status: "not_sent",
      actor_type: "system",
    });
  }

  // Create tasks from template
  const taskTemplates = await storage.getTaskTemplates(serviceId);
  for (const t of taskTemplates) {
    await storage.createFulfillmentTask({
      client_service_id: clientService.id,
      client_id: clientId,
      title: t.title,
      description: t.description,
      sort_order: t.sort_order,
      priority: t.default_priority,
      handled_by: t.default_handled_by,
      waiting_on: t.default_waiting_on,
      human_review_required: t.human_review_required,
      status: "not_started",
      actor_type: "system",
    });
  }

  // Update client status
  const client = await storage.getClientById(clientId);
  if (client && (client.status === "lead" || client.status === "onboarding")) {
    await storage.updateClient(clientId, { status: "onboarding" });
  }

  // Log activity
  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Webhook",
    action: "service.provisioned",
    entity_type: "client_service",
    entity_id: clientService.id,
    summary: `Auto-provisioned "${service.name}" for client #${clientId} after payment`,
    metadata: { stripe_session_id: session.id, tasks_created: taskTemplates.length },
  });

  console.log(`[billing-webhook] Provisioned ${serviceId} for client ${clientId} (${taskTemplates.length} tasks)`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // For subscription renewals — the first payment is handled by checkout.session.completed
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  // Skip if this is the first invoice (already handled by checkout)
  if (invoice.billing_reason === "subscription_create") return;

  const client = await storage.findClientByStripeCustomerId(customerId);
  if (!client) {
    console.warn(`[billing-webhook] invoice.paid — no client found for customer ${customerId}`);
    return;
  }

  // Create payment record for the renewal
  await storage.createClientPayment({
    client_id: client.id,
    type: "payment",
    amount_cents: invoice.amount_paid ?? 0,
    status: "paid",
    paid_at: new Date(),
    description: `Subscription renewal`,
    stripe_invoice_id: invoice.id,
    actor_type: "system",
  });

  console.log(`[billing-webhook] Recorded renewal payment for client ${client.id}: $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}`);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const client = await storage.findClientByStripeCustomerId(customerId);
  if (!client) return;

  await storage.createClientPayment({
    client_id: client.id,
    type: "invoice",
    amount_cents: invoice.amount_due ?? 0,
    status: "failed",
    description: `Payment failed — ${invoice.billing_reason || "unknown"}`,
    stripe_invoice_id: invoice.id,
    actor_type: "system",
  });

  console.log(`[billing-webhook] Payment failed for client ${client.id}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  const client = await storage.findClientByStripeCustomerId(customerId);
  if (!client) return;

  // Find active monthly services for this client and pause them
  const services = await storage.listClientServices(client.id);
  for (const svc of services) {
    if (svc.billing_period === "monthly" && svc.status === "active") {
      await storage.updateClientService(svc.id, { status: "cancelled", cancelled_at: new Date() });
    }
  }

  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Webhook",
    action: "subscription.cancelled",
    entity_type: "client",
    entity_id: client.id,
    summary: `Subscription cancelled for client "${client.business_name}"`,
  });

  console.log(`[billing-webhook] Subscription cancelled for client ${client.id}`);
}

/* ─── Helper ─── */

async function markPaymentPaid(clientId: number, serviceId: string, sessionId: string, amount: number | null) {
  // Check if we already recorded this payment
  const existing = await storage.findPaymentByStripeSession(sessionId);
  if (existing) return;

  const service = await storage.getServiceById(serviceId);
  await storage.createClientPayment({
    client_id: clientId,
    type: "payment",
    amount_cents: amount ?? service?.default_price ?? 0,
    status: "paid",
    paid_at: new Date(),
    description: service ? `${service.name}` : `Service payment`,
    stripe_payment_intent_id: sessionId,
    actor_type: "system",
  });
}
