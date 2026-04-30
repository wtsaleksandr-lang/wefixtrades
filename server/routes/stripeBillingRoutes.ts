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
import { sendOnboardingEmail } from "../lib/onboardingEmail";
import { sendPaymentReceipt } from "../lib/paymentReceiptEmail";
import { sendAccountWelcome } from "../lib/accountWelcomeEmail";
import { sendPaymentFailedEmail } from "../lib/paymentFailedEmail";
import { sendCancellationEmail } from "../lib/cancellationEmail";
import {
  scheduleFailedPaymentSequence,
  scheduleCardExpiringEmail,
  cancelPendingForSubscription,
} from "../services/dunningService";
import { getTradeLineDefaultConfig } from "@shared/schema";
import { kickoffMapguardService } from "../services/mapguardTaskEngine";

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

        case "invoice.payment_succeeded":
          // Cancels any pending dunning rows when a charge eventually
          // goes through. Stripe fires this for both first-time + retry
          // payments — handleInvoicePaid covers DB recording, this only
          // touches the dunning queue.
          await handleInvoiceSucceeded(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await handleInvoiceFailed(event.data.object as Stripe.Invoice, event.id);
          break;

        case "customer.source.expiring":
          await handleCardExpiring(event.data.object as Stripe.Card | Stripe.Source, event.id);
          break;

        case "customer.subscription.updated":
          // Only acts on past_due → active transitions (recovery) and
          // active → canceled transitions (defensive cleanup). Most
          // subscription updates are no-ops here.
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
            event.data.previous_attributes as Partial<Stripe.Subscription> | undefined,
          );
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
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
  // ─── QuoteQuick direct checkout (calculator-linked) ───
  if (session.metadata?.source === 'quotequick_checkout') {
    await handleQuoteQuickCheckout(session);
    return;
  }

  const clientId = parseInt(session.metadata?.crm_client_id || "0");
  const serviceIdRaw = session.metadata?.service_catalog_id;
  const isPublicCheckout = session.metadata?.source === "public_checkout";

  if (!clientId || !serviceIdRaw) {
    console.warn("[billing-webhook] checkout.session.completed missing metadata, skipping");
    return;
  }

  // Support comma-separated service IDs (from public checkout bundles)
  const serviceIds = serviceIdRaw.split(",").map(s => s.trim()).filter(Boolean);
  const baseUrl = process.env.APP_URL || "https://wefixtrades.co.uk";

  for (const serviceId of serviceIds) {
    await provisionOrConfirmService(session, clientId, serviceId, baseUrl);
  }

  // Branded payment receipt — sent once per session, after all services provisioned.
  // Stripe sends its own receipt; this one is on-brand and links back to the portal.
  sendPaymentReceipt(session, clientId).catch(err =>
    console.warn(`[payment-receipt] send failed for session ${session.id}:`, err.message),
  );

  // Ensure portal login exists after payment is confirmed
  try {
    const { user, created } = await storage.ensurePortalAccount(clientId);
    if (created) {
      console.log(`[billing-webhook] Auto-created portal account for client #${clientId}`);
      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "Stripe Webhook",
        action: "portal.auto_created",
        entity_type: "client",
        entity_id: clientId,
        summary: `Auto-created portal account after payment`,
      });

      // Send account-created welcome email with a magic "set password" link.
      // We never email the temp password — the customer sets their own via the link.
      const client = await storage.getClientById(clientId);
      if (client) {
        sendAccountWelcome({ user, client }).catch(err =>
          console.warn(`[account-welcome] send failed for client #${clientId}:`, err.message),
        );
      }
    }
  } catch (err: any) {
    console.warn(`[billing-webhook] Could not auto-create portal account for client #${clientId}: ${err.message}`);
  }
}

/** Handle a single service within a checkout session */
async function provisionOrConfirmService(
  session: Stripe.Checkout.Session,
  clientId: number,
  serviceId: string,
  baseUrl: string,
) {
  // Idempotency: check if already provisioned (public checkout pre-provisions; admin provision-first flow)
  const existing = await storage.findClientServiceByServiceId(clientId, serviceId);
  if (existing) {
    console.log(`[billing-webhook] Service ${serviceId} already provisioned for client ${clientId} — updating payment only`);

    // Find the pending invoice created during provisioning and mark it paid
    const pendingInvoice = await storage.findPendingPaymentForClientService(existing.id);
    if (pendingInvoice) {
      await storage.updateClientPayment(pendingInvoice.id, {
        status: "paid",
        paid_at: new Date(),
        stripe_payment_intent_id: session.id,
      });
      console.log(`[billing-webhook] Updated invoice #${pendingInvoice.id} → paid`);
    } else {
      const alreadyRecorded = await storage.findPaymentByStripeSession(session.id);
      if (!alreadyRecorded) {
        const service = await storage.getServiceById(serviceId);
        await storage.createClientPayment({
          client_id: clientId,
          client_service_id: existing.id,
          type: "payment",
          amount_cents: session.amount_total ?? service?.default_price ?? 0,
          status: "paid",
          paid_at: new Date(),
          description: service ? service.name : "Service payment",
          stripe_payment_intent_id: session.id,
          actor_type: "system",
        });
        console.log(`[billing-webhook] No pending invoice found — created paid payment record`);
      }
    }

    // Send onboarding email now that payment is confirmed
    await sendOnboardingForClientService(clientId, existing.id, serviceId, baseUrl);

    // Phase-2: trigger MapGuard kickoff (idempotent) so paying customers
    // get tasks + a first scan immediately instead of waiting for the weekly cron.
    if (serviceId.startsWith("mapguard")) {
      try {
        const result = await kickoffMapguardService(clientId, existing.id, serviceId);
        if (result.kickedOff) {
          console.log(`[billing-webhook] MapGuard kickoff: ${result.tasksCreated} tasks for client ${clientId} (${serviceId})`);
        }
      } catch (err: any) {
        console.warn(`[billing-webhook] MapGuard kickoff failed for client ${clientId}: ${err.message}`);
      }
    }
    return;
  }

  // Service not yet provisioned — provision it now (admin-initiated checkout without pre-provision)
  const service = await storage.getServiceById(serviceId);
  if (!service) {
    console.error(`[billing-webhook] Service ${serviceId} not found`);
    return;
  }

  const tradelineDefaults = getTradeLineDefaultConfig(serviceId);
  const metadata = tradelineDefaults ? { tradeline: tradelineDefaults } : undefined;

  const clientService = await storage.createClientService({
    client_id: clientId,
    service_id: serviceId,
    status: "pending",
    enabled: true,
    fulfillment_mode: "internal",
    price_cents: service.default_price,
    billing_period: service.billing_period,
    metadata,
  });

  // Auto-populate TradeLine notifications from client contact info
  if (tradelineDefaults) {
    const client = await storage.getClientById(clientId);
    if (client) {
      const notifications: { email: string[]; sms: string[] } = { email: [], sms: [] };
      if (client.contact_email) notifications.email.push(client.contact_email);
      if (client.contact_phone) notifications.sms.push(client.contact_phone);
      if (notifications.email.length || notifications.sms.length) {
        await storage.updateTradeLineConfig(clientService.id, { notifications });
      }
    }
  }

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
    const submission = await storage.createOnboardingSubmission({
      client_service_id: clientService.id,
      client_id: clientId,
      template_id: onboardingTemplate.id,
      status: "not_sent",
      actor_type: "system",
    });

    // Send onboarding email immediately
    const client = await storage.getClientById(clientId);
    if (client && submission.access_token) {
      const sent = await sendOnboardingEmail({
        client,
        serviceName: service.name,
        accessToken: submission.access_token,
        baseUrl,
      });
      if (sent) {
        await storage.updateOnboardingSubmission(submission.id, {
          status: "sent",
          sent_at: new Date(),
        });
      }
    }
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

  // Phase-2: trigger MapGuard kickoff for admin-initiated checkouts that
  // provision the service inside the webhook (no pre-provision step).
  if (serviceId.startsWith("mapguard")) {
    try {
      const result = await kickoffMapguardService(clientId, clientService.id, serviceId);
      if (result.kickedOff) {
        console.log(`[billing-webhook] MapGuard kickoff: ${result.tasksCreated} tasks for client ${clientId} (${serviceId})`);
      }
    } catch (err: any) {
      console.warn(`[billing-webhook] MapGuard kickoff failed for client ${clientId}: ${err.message}`);
    }
  }
}

/** Find and send onboarding emails for a client_service that was already provisioned */
async function sendOnboardingForClientService(
  clientId: number,
  clientServiceId: number,
  serviceId: string,
  baseUrl: string,
) {
  // Find unsent onboarding submissions for this client_service
  const submissions = await storage.listOnboardingSubmissions(clientId);
  const unsent = submissions.find(
    s => s.client_service_id === clientServiceId && (s.status === "not_sent"),
  );
  if (!unsent || !unsent.access_token) return;

  const client = await storage.getClientById(clientId);
  const service = await storage.getServiceById(serviceId);
  if (!client || !service) return;

  const sent = await sendOnboardingEmail({
    client,
    serviceName: service.name,
    accessToken: unsent.access_token,
    baseUrl,
  });

  if (sent) {
    await storage.updateOnboardingSubmission(unsent.id, {
      status: "sent",
      sent_at: new Date(),
    });
    console.log(`[billing-webhook] Onboarding email sent for ${service.name} → ${client.contact_email}`);
  }
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

async function handleInvoiceFailed(invoice: Stripe.Invoice, eventId: string) {
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

  // Day 0 — friendly heads-up email (immediate, idempotent per invoice).
  // Existing module — kept as the immediate touchpoint for the failure.
  sendPaymentFailedEmail({
    clientId: client.id,
    invoiceId: invoice.id || "",
    amountCents: invoice.amount_due ?? 0,
    nextAttemptAt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null,
  }).catch(err => console.warn(`[payment-failed] email send failed:`, err.message));

  // Day 2 / Day 5 / Day 7 — schedule the dunning sequence. Idempotent on
  // (subscription, event_id, kind) so duplicate Stripe deliveries are
  // safe. Day 0 is already covered by sendPaymentFailedEmail above.
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id ?? null;

  scheduleFailedPaymentSequence({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: invoice.id || null,
    triggerEventId: eventId,
    amountCents: invoice.amount_due ?? undefined,
    currency: invoice.currency ?? undefined,
    clientId: client.id,
  }).catch(err => console.warn(`[dunning] schedule failed:`, err.message));

  console.log(`[billing-webhook] Payment failed for client ${client.id}, dunning sequence scheduled`);
}

async function handleInvoiceSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  // Stop nagging — payment came through.
  await cancelPendingForSubscription({
    stripeSubscriptionId: subscriptionId,
    reason: "payment_succeeded",
  }).catch(err => console.warn(`[dunning] cancel-on-success failed:`, err.message));
}

async function handleCardExpiring(source: Stripe.Card | Stripe.Source, eventId: string) {
  const customerId = typeof source.customer === "string" ? source.customer : source.customer?.id;
  if (!customerId) return;

  const client = await storage.findClientByStripeCustomerId(customerId);

  // Pull card details — shape differs slightly between Card (legacy) and Source
  const card = (source as any).card || source;
  const last4 = card.last4 ?? undefined;
  const brand = card.brand ?? undefined;
  const expMonth = card.exp_month ?? undefined;
  const expYear = card.exp_year ?? undefined;

  await scheduleCardExpiringEmail({
    stripeCustomerId: customerId,
    triggerEventId: eventId,
    clientId: client?.id ?? null,
    cardLast4: last4,
    cardBrand: brand,
    expMonth,
    expYear,
  }).catch(err => console.warn(`[dunning] card-expiring schedule failed:`, err.message));

  console.log(`[billing-webhook] Card expiring for customer ${customerId}, email queued`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttrs: Partial<Stripe.Subscription> | undefined,
) {
  // Recovery path: past_due → active (a retry succeeded). Cancel any
  // pending dunning rows even if Stripe didn't fire a fresh
  // invoice.payment_succeeded for some reason.
  if (previousAttrs?.status === "past_due" && subscription.status === "active") {
    await cancelPendingForSubscription({
      stripeSubscriptionId: subscription.id,
      reason: "payment_succeeded",
    }).catch(err => console.warn(`[dunning] cancel-on-recovery failed:`, err.message));
  }

  // Defensive: if we ever see active → canceled here (rare — usually
  // subscription.deleted fires first), still cancel pending rows.
  if (previousAttrs?.status && previousAttrs.status !== "canceled" && subscription.status === "canceled") {
    await cancelPendingForSubscription({
      stripeSubscriptionId: subscription.id,
      reason: "subscription_canceled",
    }).catch(err => console.warn(`[dunning] cancel-on-canceled-update failed:`, err.message));
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, _eventId: string) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return;

  // Stop dunning sequence: a canceled subscription should not receive any
  // remaining day_2 / day_5 / day_7 reminders. The existing per-service
  // sendCancellationEmail (below) is the customer-facing cancel confirmation
  // — we don't add a duplicate dunning canceled-email here. The
  // scheduleSubscriptionCanceledEmail() helper remains in dunningService for
  // future use (e.g. ops-initiated cancellation outside the existing flow).
  cancelPendingForSubscription({
    stripeSubscriptionId: subscription.id,
    reason: "subscription_canceled",
  }).catch(err => console.warn(`[dunning] cancel-pending-on-deleted failed:`, err.message));

  const client = await storage.findClientByStripeCustomerId(customerId);
  if (!client) return;

  // Find active monthly services for this client and pause them
  const services = await storage.listClientServices(client.id);
  for (const svc of services) {
    if (svc.billing_period === "monthly" && svc.status === "active") {
      await storage.updateClientService(svc.id, { status: "cancelled", cancelled_at: new Date() });

      // Send branded cancellation confirmation + exit survey (non-blocking, idempotent per service)
      sendCancellationEmail({
        clientServiceId: svc.id,
        cancellationContext: "stripe",
      }).catch(err => console.warn(`[cancellation-email] send failed for service #${svc.id}:`, err.message));
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

/* ─── QuoteQuick Direct Checkout Handler ─── */

async function handleQuoteQuickCheckout(session: Stripe.Checkout.Session) {
  const calculatorId = parseInt(session.metadata?.calculator_id || "0");
  const planTier = session.metadata?.plan_tier || "starter";

  if (!calculatorId) {
    console.warn("[billing-webhook] QuoteQuick checkout missing calculator_id");
    return;
  }

  const calculator = await storage.getCalculatorById(calculatorId);
  if (!calculator) {
    console.warn(`[billing-webhook] Calculator ${calculatorId} not found`);
    return;
  }

  const wasPaused = calculator.plan_tier === 'free';

  // Update plan_tier on the calculator
  await storage.updateCalculator(calculatorId, {
    plan_tier: planTier,
  });

  // Restore deployment_status to live (reactivate if trial-paused)
  await storage.upsertDeploymentStatus({
    calculator_id: calculatorId,
    status: 'live',
    last_published_at: new Date(),
  });

  // Track payment_completed
  await storage.trackEvent({
    calculator_id: calculatorId,
    event_type: 'payment_completed',
    metadata: {
      plan_tier: planTier,
      billing: session.metadata?.billing,
      stripe_session_id: session.id,
      amount_total: session.amount_total,
    },
  });

  // Track reactivation if was paused
  if (wasPaused) {
    await storage.trackEvent({
      calculator_id: calculatorId,
      event_type: 'trial_reactivated',
      metadata: { plan_tier: planTier, calculator_id: calculatorId },
    });
  }

  console.log(`[billing-webhook] QuoteQuick calculator ${calculatorId} upgraded to ${planTier}${wasPaused ? ' (reactivated)' : ''}`);
}

