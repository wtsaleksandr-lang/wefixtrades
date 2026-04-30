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
import { sendRefundConfirmationEmail } from "../lib/refundConfirmationEmail";
import {
  scheduleFailedPaymentSequence,
  scheduleCardExpiringEmail,
  cancelPendingForSubscription,
} from "../services/dunningService";
import { getTradeLineDefaultConfig } from "@shared/schema";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

/**
 * Resolve the real Stripe identifiers off a Checkout Session.
 *
 *   `session.payment_intent` — populated for `mode: "payment"` sessions
 *      (one-time purchases). May be a string or an expanded object.
 *      Null for subscription-mode sessions.
 *   `session.subscription`   — populated for `mode: "subscription"`
 *      sessions. The first invoice carries the actual payment_intent.
 *
 * Storing the real ids (instead of the Checkout Session id) makes future
 * refund / invoice correlation work correctly.
 */
function extractStripeIds(session: Stripe.Checkout.Session): {
  paymentIntentId: string | null;
  subscriptionId: string | null;
} {
  const pi = session.payment_intent;
  const sub = session.subscription;
  return {
    paymentIntentId: typeof pi === "string" ? pi : pi?.id ?? null,
    subscriptionId: typeof sub === "string" ? sub : sub?.id ?? null,
  };
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
    const isProd = process.env.NODE_ENV === "production";

    // Phase 1 safety — production must be fully signed.
    if (isProd && !webhookSecret) {
      console.error("[billing-webhook] PROD misconfiguration: STRIPE_BILLING_WEBHOOK_SECRET is not set");
      return res.status(500).send("Webhook secret not configured");
    }
    if (isProd && !sig) {
      console.warn("[billing-webhook] PROD request rejected: missing stripe-signature header");
      return res.status(400).send("Missing signature");
    }

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      // Verify signature
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
      // Dev-only fallback (already blocked above when isProd=true).
      // Accepts unsigned events so local smoke / replay tooling works.
      event = req.body as Stripe.Event;
      console.warn(
        `[billing-webhook] DEV mode: accepting unsigned event (secret=${webhookSecret ? "set" : "missing"}, sig=${sig ? "present" : "missing"}). NEVER allow this in production.`,
      );
    }

    // ─── Idempotency: short-circuit duplicate Stripe deliveries ───
    // Stripe occasionally redelivers events; we record every event id
    // we've successfully processed and refuse to re-run side effects.
    if (event.id) {
      try {
        const already = await storage.findProcessedStripeEvent(event.id);
        if (already) {
          console.log(`[billing-webhook] Duplicate event ${event.id} (${event.type}) — already processed at ${already.processed_at?.toISOString?.() ?? "unknown"}`);
          return res.json({ received: true, duplicate: true });
        }
      } catch (err: any) {
        // Don't block the webhook on a lookup failure — just log and proceed.
        console.warn(`[billing-webhook] idempotency lookup failed for ${event.id}: ${err.message}`);
      }
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

        case "payment_intent.payment_failed":
          // Phase 2: one-time payment failed (e.g. setup fees, one-time SKUs).
          // Subscription invoice failures already flow through
          // invoice.payment_failed; we skip PIs that have an invoice attached
          // to avoid double-handling.
          await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, event.id);
          break;

        case "charge.refunded":
          // Phase 2: Stripe issued a refund (manual dashboard or API).
          // Records a negative-amount client_payments row and sends a
          // branded refund-confirmation email. On full refund of an
          // active monthly service, also flips the service to cancelled.
          await handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          // Ignore unhandled events
          break;
      }

      // Mark processed AFTER the handler completes successfully. If a
      // handler throws, no row is written and Stripe's retry will be
      // processed normally on the next delivery.
      if (event.id) {
        try {
          await storage.markStripeEventProcessed({
            stripe_event_id: event.id,
            event_type: event.type,
            metadata: null,
          });
        } catch (err: any) {
          // Race with another worker: a UNIQUE conflict here is benign —
          // the event was processed once. Log and continue.
          console.warn(`[billing-webhook] markStripeEventProcessed failed for ${event.id}: ${err.message}`);
        }
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
  const { paymentIntentId, subscriptionId } = extractStripeIds(session);

  // Idempotency: check if already provisioned (public checkout pre-provisions; admin provision-first flow)
  const existing = await storage.findClientServiceByServiceId(clientId, serviceId);
  if (existing) {
    console.log(`[billing-webhook] Service ${serviceId} already provisioned for client ${clientId} — updating payment only`);

    // Find the pending invoice created during provisioning and mark it paid
    const pendingInvoice = await storage.findPendingPaymentForClientService(existing.id);
    if (pendingInvoice) {
      const prevMeta = (pendingInvoice.metadata as Record<string, any> | null) ?? {};
      await storage.updateClientPayment(pendingInvoice.id, {
        status: "paid",
        paid_at: new Date(),
        stripe_payment_intent_id: paymentIntentId,
        metadata: { ...prevMeta, stripe_checkout_session_id: session.id },
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
          stripe_payment_intent_id: paymentIntentId,
          metadata: { stripe_checkout_session_id: session.id },
          actor_type: "system",
        });
        console.log(`[billing-webhook] No pending invoice found — created paid payment record`);
      }
    }

    // Persist Stripe subscription id into client_services.metadata
    // (preserves all other metadata fields).
    if (subscriptionId) {
      const prevServiceMeta = (existing.metadata as Record<string, any> | null) ?? {};
      if (prevServiceMeta.stripe_subscription_id !== subscriptionId) {
        await storage.updateClientService(existing.id, {
          metadata: { ...prevServiceMeta, stripe_subscription_id: subscriptionId },
        });
      }
    }

    // Flip pending → active now that payment is confirmed.
    // Only touch services that are still 'pending' so we never regress
    // an already-active or cancelled service.
    if (existing.status === "pending") {
      await storage.updateClientService(existing.id, {
        status: "active",
        started_at: existing.started_at ?? new Date(),
      });
      console.log(`[billing-webhook] Flipped client_service #${existing.id} pending → active after payment`);
    }

    // Send onboarding email now that payment is confirmed
    await sendOnboardingForClientService(clientId, existing.id, serviceId, baseUrl);
    return;
  }

  // Service not yet provisioned — provision it now (admin-initiated checkout without pre-provision)
  const service = await storage.getServiceById(serviceId);
  if (!service) {
    console.error(`[billing-webhook] Service ${serviceId} not found`);
    return;
  }

  const tradelineDefaults = getTradeLineDefaultConfig(serviceId);
  const initialMetadata: Record<string, any> = {};
  if (tradelineDefaults) initialMetadata.tradeline = tradelineDefaults;
  if (subscriptionId) initialMetadata.stripe_subscription_id = subscriptionId;

  const clientService = await storage.createClientService({
    client_id: clientId,
    service_id: serviceId,
    // Admin-provision-on-webhook path: payment is already confirmed by
    // the time we get here, so create as 'active' rather than 'pending'.
    status: "active",
    started_at: new Date(),
    enabled: true,
    fulfillment_mode: "internal",
    price_cents: service.default_price,
    billing_period: service.billing_period,
    metadata: Object.keys(initialMetadata).length ? initialMetadata : undefined,
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
    stripe_payment_intent_id: paymentIntentId,
    metadata: { stripe_checkout_session_id: session.id },
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



/* ─── charge.refunded (Phase 2) ─── */

async function handleChargeRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;

  // We need a payment_intent to correlate to a client_payments row.
  // Without one we have no idempotency anchor and don't know which client
  // to email. Log and bail.
  if (!piId) {
    console.warn(`[billing-webhook] charge.refunded ${charge.id} has no payment_intent — skipping`);
    return;
  }

  // Skip non-refund firings: Stripe fires charge.refunded for the refund
  // event itself (amount_refunded > 0). Belt-and-braces guard.
  const refundAmount = charge.amount_refunded ?? 0;
  if (refundAmount <= 0) {
    console.warn(`[billing-webhook] charge.refunded ${charge.id} has amount_refunded <= 0 — skipping`);
    return;
  }

  const isFullRefund = charge.amount_refunded === charge.amount;

  // Locate the originating payment row (created on checkout.session.completed
  // by the Phase 1 fix that stores the real PI id in stripe_payment_intent_id).
  const originating = await storage.findPaymentByStripePaymentIntent(piId);

  // Resolve client — prefer the originating row's client, fall back to
  // Stripe customer match for legacy rows / disconnected refunds.
  let clientId: number | null = originating?.client_id ?? null;
  let clientServiceId: number | null = originating?.client_service_id ?? null;
  if (!clientId) {
    const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
    if (customerId) {
      const client = await storage.findClientByStripeCustomerId(customerId);
      if (client) clientId = client.id;
    }
  }
  if (!clientId) {
    console.warn(`[billing-webhook] charge.refunded ${charge.id}: cannot resolve client (pi=${piId}) — skipping`);
    return;
  }

  // Latest refund object on the charge (Stripe orders refunds.data with
  // most recent first when expanded; if not expanded, fall back to the
  // charge id for traceability).
  const latestRefund = charge.refunds?.data?.[0];
  const refundId = latestRefund?.id ?? null;

  // Insert the negative-amount refund row. Idempotency at the row level:
  // (stripe_payment_intent_id = piId, type = 'refund', metadata.refund_id = refundId)
  // — but the Phase-1 event-id idempotency at the top of the webhook
  // handler is the primary guard. Belt-and-braces check below.
  const description = originating?.description
    ? `Refund — ${originating.description}`
    : `Refund (Stripe charge ${charge.id})`;

  const refundRow = await storage.createClientPayment({
    client_id: clientId,
    client_service_id: clientServiceId ?? undefined,
    type: "refund",
    amount_cents: -refundAmount,
    status: "refunded",
    paid_at: new Date(),
    description,
    stripe_payment_intent_id: piId,
    metadata: {
      stripe_charge_id: charge.id,
      refund_id: refundId,
      is_full_refund: isFullRefund,
    },
    actor_type: "system",
  });

  // Mark the originating payment as fully refunded if this was a full refund.
  if (originating && isFullRefund && originating.status !== "refunded") {
    await storage.updateClientPayment(originating.id, { status: "refunded" });
  }

  // Cancel the linked service if (a) full refund and (b) it's an active
  // monthly subscription. Partial refunds and one-time purchases never
  // touch service status here.
  let serviceCancelled = false;
  if (isFullRefund && clientServiceId) {
    const cs = await storage.getClientServiceById(clientServiceId);
    if (cs && cs.status === "active" && cs.billing_period === "monthly") {
      await storage.updateClientService(cs.id, {
        status: "cancelled",
        cancelled_at: new Date(),
      });
      serviceCancelled = true;
    }
  }

  // Branded refund email (idempotent on the refund row's metadata).
  sendRefundConfirmationEmail({
    refundPaymentId: refundRow.id,
    clientId,
    refundAmountCents: refundAmount,
    currency: charge.currency,
    originalDescription: originating?.description ?? null,
    serviceCancelled,
  }).catch((err: any) => console.warn(`[refund-email] send failed for refund row #${refundRow.id}:`, err.message));

  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Webhook",
    action: isFullRefund ? "payment.refunded_full" : "payment.refunded_partial",
    entity_type: "client",
    entity_id: clientId,
    summary: `Refund ${isFullRefund ? "(full)" : "(partial)"}: ${refundAmount} cents (charge ${charge.id})${serviceCancelled ? " — service cancelled" : ""}`,
    metadata: { stripe_charge_id: charge.id, refund_id: refundId, is_full_refund: isFullRefund, service_cancelled: serviceCancelled },
  });

  console.log(`[billing-webhook] charge.refunded ${charge.id} → refund row #${refundRow.id} (${refundAmount} cents, full=${isFullRefund}, service_cancelled=${serviceCancelled})`);
}


/* ─── payment_intent.payment_failed (Phase 2) ─── */

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent, _eventId: string) {
  // Subscription failures are owned by invoice.payment_failed (which also
  // schedules the dunning sequence). When pi.invoice is set, the parent
  // event for this failure is invoice.payment_failed — skip here.
  if (pi.invoice) {
    console.log(`[billing-webhook] payment_intent.payment_failed ${pi.id} has invoice — skipping (subscription path)`);
    return;
  }

  // Look up the originating payment row by the real PaymentIntent id.
  const existing = await storage.findPaymentByStripePaymentIntent(pi.id);
  if (!existing) {
    console.warn(`[billing-webhook] payment_intent.payment_failed ${pi.id}: no matching client_payments row — skipping`);
    return;
  }

  // Idempotency: don't re-flip an already-failed row. The Phase 1 event-id
  // short-circuit at the top of the webhook is the primary guard, but
  // belt-and-braces in case the row was flipped by a prior delivery.
  if (existing.status === "failed") {
    console.log(`[billing-webhook] payment_intent.payment_failed ${pi.id}: row already failed — skipping`);
    return;
  }

  const lastError = pi.last_payment_error;
  const prevMeta = (existing.metadata as Record<string, any> | null) ?? {};

  await storage.updateClientPayment(existing.id, {
    status: "failed",
    metadata: {
      ...prevMeta,
      last_failure_code: lastError?.code ?? null,
      last_failure_decline_code: lastError?.decline_code ?? null,
      last_failure_message: lastError?.message ?? null,
      last_failure_type: lastError?.type ?? null,
      last_failure_at: new Date().toISOString(),
    },
  });

  // NOTE: A dedicated one-time-payment-failed customer email is deferred
  // to a later phase. The existing paymentFailedEmail.ts module is
  // subscription-shaped (talks about Stripe auto-retries) and would mislead
  // a one-time customer. For now we record + log; the customer's card
  // issuer already sent them a decline notification.

  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Webhook",
    action: "payment.one_time_failed",
    entity_type: "client",
    entity_id: existing.client_id,
    summary: `One-time payment failed: PI ${pi.id} (${lastError?.code ?? "unknown"})`,
    metadata: {
      stripe_payment_intent_id: pi.id,
      client_payment_id: existing.id,
      failure_code: lastError?.code ?? null,
      failure_decline_code: lastError?.decline_code ?? null,
      failure_message: lastError?.message ?? null,
    },
  });

  console.log(`[billing-webhook] payment_intent.payment_failed ${pi.id} → client_payments #${existing.id} flipped to failed (${lastError?.code ?? "unknown"})`);
}
