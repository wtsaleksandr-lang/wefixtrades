/**
 * NEW Stripe Billing Routes — Direct charges for WeFixTrades service sales.
 *
 * This is SEPARATE from the legacy Stripe Connect flow in stripeRoutes.ts.
 * Legacy = calculator owners collecting deposits via Connect.
 * This = WeFixTrades selling its own services to clients.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { widgetDeposits, apiSubscriptions } from "@shared/schema";
import { getApiTier } from "@shared/pricing/apiTiers";
import { generateCuid } from "../lib/apiKeys";
import { sendOnboardingEmail } from "../lib/onboardingEmail";
import { sendPaymentReceipt } from "../lib/paymentReceiptEmail";
import { sendAccountWelcome } from "../lib/accountWelcomeEmail";
import { sendPaymentFailedEmail } from "../lib/paymentFailedEmail";
import { sendCancellationEmail } from "../lib/cancellationEmail";
import { sendOrderConfirmationEmail } from "../lib/orderConfirmationEmail";
import {
  scheduleFailedPaymentSequence,
  scheduleCardExpiringEmail,
  cancelPendingForSubscription,
} from "../services/dunningService";
import { sendPaymentSucceededEmail } from "../lib/paymentSucceededEmail";
import { buildBillingPortalUrl } from "../lib/billingPortalToken";
import { getTradeLineDefaultConfig } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { recordRevenueForClient } from "../services/clientCostBilling";
import { fireAlert } from "../services/alertService";
import { autoAssignSupplier } from "../services/supplierAssignment";
import { runPreFixAudit } from "../services/webfixAuditService";
import { sendAdflowOnboardingEmail } from "../lib/adflowOnboardingEmail";
import { buildLoginToken, storeCheckoutLoginToken } from "../lib/loginToken";
import { kickoffMapguardService } from "../services/mapguardTaskEngine";
import { kickoffReputationShieldService } from "../services/reputation/reputationShieldKickoff";
import { sendGA4Event, clientIdFromStableId } from "../lib/analytics/ga4Server";

const log = createLogger("StripeBilling");

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
        return res.status(400).json({ error: "Service has no Stripe Price configured. Set stripe_price_id on the service catalog row, or run scripts/sync-api-platform-stripe-prices.ts for API platform tiers." });
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

      // Broad payment method types — Stripe auto-shows relevant options per locale
      const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = [
        "card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit",
      ];

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode,
        payment_method_types: paymentMethodTypes,
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
      log.error("[billing] Checkout error:", err.message);
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
      // Verify signature
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig as string,
          webhookSecret,
        );
      } catch (err: any) {
        log.error("[billing-webhook] Signature verification failed:", err.message);
        return res.status(400).send("Invalid signature");
      }
    } else if (process.env.NODE_ENV === "production") {
      // In production, refuse to process unverified webhooks
      log.error("[billing-webhook] STRIPE_BILLING_WEBHOOK_SECRET is not set — rejecting webhook in production");
      return res.status(500).send("Webhook secret not configured");
    } else {
      // Development only — accept event without verification
      event = req.body as Stripe.Event;
      log.warn("[billing-webhook] No STRIPE_BILLING_WEBHOOK_SECRET — skipping signature verification (dev only)");
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(session);
          // ─── GA4 (server) — purchase_completed ───
          // Fire-and-forget. No-ops outside production / without
          // GA4_MEASUREMENT_PROTOCOL_API_SECRET. client_id is derived
          // deterministically from the Stripe customer id so the same
          // customer's purchases roll up to one "user" in GA reports.
          // No PII in params — only amounts, currency, source label.
          try {
            const stripeCustomerId =
              typeof session.customer === "string"
                ? session.customer
                : session.customer?.id ?? session.id;
            void sendGA4Event({
              clientId: clientIdFromStableId(stripeCustomerId || session.id),
              name: "purchase_completed",
              params: {
                transaction_id: session.id,
                value: typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
                currency: (session.currency || "usd").toUpperCase(),
                source: session.metadata?.source ?? "unknown",
              },
            });
          } catch {
            // sendGA4Event is internally safe; this catch is belt-and-suspenders.
          }
          break;
        }

        case "invoice.paid":
          await handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_succeeded":
          // Cancels any pending dunning rows when a charge eventually
          // goes through. Stripe fires this for both first-time + retry
          // payments — handleInvoicePaid covers DB recording, this only
          // touches the dunning queue.
          await handleInvoiceSucceeded(event.data.object as Stripe.Invoice);
          // Wave AJ-3: if this invoice belongs to an api_subscription,
          // reset the quota usage at period boundary.
          await maybeHandleApiInvoiceSucceeded(event.data.object as Stripe.Invoice, stripe);
          break;

        case "invoice.payment_failed":
          await handleInvoiceFailed(event.data.object as Stripe.Invoice, event.id);
          await maybeHandleApiInvoiceFailed(event.data.object as Stripe.Invoice, stripe);
          break;

        case "customer.source.expiring":
          await handleCardExpiring(event.data.object as Stripe.Card | Stripe.Source, event.id);
          break;

        case "customer.subscription.created": {
          // Wave AJ-3: only the API platform listens for "created" —
          // QQ + service subscriptions are still bootstrapped via
          // checkout.session.completed.
          const sub = event.data.object as Stripe.Subscription;
          if (isApiSubscription(sub)) {
            await handleApiSubscriptionUpserted(sub);
          }
          break;
        }

        case "customer.subscription.updated":
          // Only acts on past_due → active transitions (recovery) and
          // active → canceled transitions (defensive cleanup). Most
          // subscription updates are no-ops here.
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
            event.data.previous_attributes as Partial<Stripe.Subscription> | undefined,
          );
          // Wave AJ-3: keep api_subscriptions row in sync for tier
          // changes made via the customer portal.
          if (isApiSubscription(event.data.object as Stripe.Subscription)) {
            await handleApiSubscriptionUpserted(event.data.object as Stripe.Subscription);
          }
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
          if (isApiSubscription(event.data.object as Stripe.Subscription)) {
            await handleApiSubscriptionDeleted(event.data.object as Stripe.Subscription);
          }
          break;

        default:
          // Ignore unhandled events
          break;
      }

      res.json({ received: true });
    } catch (err: any) {
      log.error(`[billing-webhook] Error handling ${event.type}:`, err.message);
      fireAlert({ severity: "critical", category: "stripe_error", title: `Stripe webhook handler failed: ${event.type}`, details: err.message, metadata: { event_type: event.type, event_id: event.id } }).catch(() => {});
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

  // ─── QuoteQuick one-time install ($75) — Wave AU-1 audit fix ───
  // Previously the install checkout (server/routes/calculatorRoutes.ts) set
  // source='quotequick_install' but no webhook handler matched, so Stripe
  // captured the money silently with no DB trail. Now we record the event
  // and update the calculator metadata so the dashboard can show "install
  // paid".
  if (session.metadata?.source === 'quotequick_install') {
    await handleQuoteQuickInstall(session);
    return;
  }

  // ─── Wave R-2: widget deposit (Stripe Connect to calculator owner) ───
  if (session.metadata?.source === 'widget_deposit') {
    await handleWidgetDepositCompleted(session);
    return;
  }

  const clientId = parseInt(session.metadata?.crm_client_id || "0");
  const serviceIdRaw = session.metadata?.service_catalog_id;
  const isPublicCheckout = session.metadata?.source === "public_checkout";

  if (!clientId || !serviceIdRaw) {
    log.warn("[billing-webhook] checkout.session.completed missing metadata, skipping");
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
    log.warn(`[payment-receipt] send failed for session ${session.id}:`, err.message),
  );

  // Order confirmation email — reassurance about what they bought and what's next.
  // Fail-safe: non-blocking, never disrupts webhook processing.
  try {
    const client = await storage.getClientById(clientId);
    if (client?.contact_email) {
      const firstServiceId = serviceIds[0];
      const service = firstServiceId ? await storage.getServiceById(firstServiceId) : null;
      sendOrderConfirmationEmail(client.contact_email, {
        businessName: client.business_name,
        serviceName: service?.name || "WeFixTrades service",
        amount: session.amount_total ?? 0,
        currency: session.currency || "usd",
        onboardingUrl: `${baseUrl}/portal`,
      }).catch(err =>
        log.warn(`[order-confirmation] send failed for session ${session.id}:`, err.message),
      );
    }
  } catch (err: any) {
    log.warn(`[order-confirmation] lookup failed for client #${clientId}:`, err.message);
  }

  // Ensure portal login exists after payment is confirmed
  try {
    const { user, created } = await storage.ensurePortalAccount(clientId);
    if (created) {
      log.info(`[billing-webhook] Auto-created portal account for client #${clientId}`);
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
          log.warn(`[account-welcome] send failed for client #${clientId}:`, err.message),
        );
      }
    }

    // Generate a one-time login token so the checkout success page can auto-login
    const loginToken = buildLoginToken(user.id);
    storeCheckoutLoginToken(session.id, loginToken);
    log.info(`[billing-webhook] Login token stored for session ${session.id}, user #${user.id}`);
  } catch (err: any) {
    log.warn(`[billing-webhook] Could not auto-create portal account for client #${clientId}: ${err.message}`);
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
    log.info(`[billing-webhook] Service ${serviceId} already provisioned for client ${clientId} — updating payment only`);

    // Find the pending invoice created during provisioning and mark it paid
    const pendingInvoice = await storage.findPendingPaymentForClientService(existing.id);
    if (pendingInvoice) {
      await storage.updateClientPayment(pendingInvoice.id, {
        status: "paid",
        paid_at: new Date(),
        stripe_payment_intent_id: session.id,
      });
      log.info(`[billing-webhook] Updated invoice #${pendingInvoice.id} → paid`);
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
        log.info(`[billing-webhook] No pending invoice found — created paid payment record`);
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
          log.info(`[billing-webhook] MapGuard kickoff: ${result.tasksCreated} tasks for client ${clientId} (${serviceId})`);
        }
      } catch (err: any) {
        log.warn(`[billing-webhook] MapGuard kickoff failed for client ${clientId}: ${err.message}`);
      }
    }

    // ReputationShield kickoff: send the welcome email that walks the
    // customer through Google Business Profile OAuth. Idempotent via
    // metadata.reputationshield_kickoff_at.
    if (serviceId.startsWith("reputationshield")) {
      try {
        const result = await kickoffReputationShieldService(clientId, existing.id, serviceId);
        if (result.kickedOff) {
          log.info(`[billing-webhook] ReputationShield kickoff: welcome sent for client ${clientId} (${serviceId})`);
        }
      } catch (err: any) {
        log.warn(`[billing-webhook] ReputationShield kickoff failed for client ${clientId}: ${err.message}`);
      }
    }
    return;
  }

  // Service not yet provisioned — provision it now (admin-initiated checkout without pre-provision)
  const service = await storage.getServiceById(serviceId);
  if (!service) {
    log.error(`[billing-webhook] Service ${serviceId} not found`);
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
    const task = await storage.createFulfillmentTask({
      client_service_id: clientService.id,
      client_id: clientId,
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

  // Update client status
  const client = await storage.getClientById(clientId);
  if (client && (client.status === "lead" || client.status === "onboarding")) {
    await storage.updateClient(clientId, { status: "onboarding" });
  }

  // WebFix pre-audit: auto-run PageSpeed audit after provisioning
  // Non-blocking — enriches the first task with audit results for supplier brief
  if (serviceId.startsWith("webfix")) {
    runPreFixAudit(clientService.id).catch(err =>
      log.warn(`[webfix-pre-audit] failed for client_service #${clientService.id}: ${err.message}`),
    );
  }

  // AdFlow onboarding kickoff email: sends "what happens next" timeline
  if (serviceId.startsWith("adflow")) {
    const adflowClient = client || await storage.getClientById(clientId);
    if (adflowClient?.contact_email) {
      sendAdflowOnboardingEmail({
        recipientEmail: adflowClient.contact_email,
        businessName: adflowClient.business_name,
        contactName: adflowClient.contact_name || adflowClient.business_name,
        clientServiceId: clientService.id,
      }).catch(err =>
        log.warn(`[adflow-onboarding] send failed for client_service #${clientService.id}: ${err.message}`),
      );
    }
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

  log.info(`[billing-webhook] Provisioned ${serviceId} for client ${clientId} (${taskTemplates.length} tasks)`);

  // Phase-2: trigger MapGuard kickoff for admin-initiated checkouts that
  // provision the service inside the webhook (no pre-provision step).
  // Note: storage.createClientService already fires the activation hook when
  // status="active" is set on insert, but Stripe-provisioned rows often start
  // in pending/onboarding so we keep this explicit call as a belt-and-braces
  // safety net. kickoffMapguardService is idempotent.
  if (serviceId.startsWith("mapguard")) {
    try {
      const result = await kickoffMapguardService(clientId, clientService.id, serviceId);
      if (result.kickedOff) {
        log.info(`[billing-webhook] MapGuard kickoff: ${result.tasksCreated} tasks for client ${clientId} (${serviceId})`);
      }
    } catch (err: any) {
      log.warn(`[billing-webhook] MapGuard kickoff failed for client ${clientId}: ${err.message}`);
    }
  }

  if (serviceId.startsWith("reputationshield")) {
    try {
      const result = await kickoffReputationShieldService(clientId, clientService.id, serviceId);
      if (result.kickedOff) {
        log.info(`[billing-webhook] ReputationShield kickoff: welcome sent for client ${clientId} (${serviceId})`);
      }
    } catch (err: any) {
      log.warn(`[billing-webhook] ReputationShield kickoff failed for client ${clientId}: ${err.message}`);
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
    log.info(`[billing-webhook] Onboarding email sent for ${service.name} → ${client.contact_email}`);
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
    log.warn(`[billing-webhook] invoice.paid — no client found for customer ${customerId}`);
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

  // W-BA-2 (Phase 3b §5) — accumulate revenue into the variable-cost ledger.
  recordRevenueForClient({
    clientId: client.id,
    amountCents: invoice.amount_paid ?? 0,
  }).catch(err => log.warn(`[billing-cost] revenue record failed: ${err.message}`));

  log.info(`[billing-webhook] Recorded renewal payment for client ${client.id}: $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}`);
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
  }).catch(err => log.warn(`[payment-failed] email send failed:`, err.message));

  // Day 2 / Day 5 / Day 7 — schedule the dunning sequence. Idempotent on
  // (subscription, event_id, kind) so duplicate Stripe deliveries are
  // safe. Day 0 is already covered by sendPaymentFailedEmail above.
  const subscriptionId = typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : (invoice as any).subscription?.id ?? null;

  scheduleFailedPaymentSequence({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: invoice.id || null,
    triggerEventId: eventId,
    amountCents: invoice.amount_due ?? undefined,
    currency: invoice.currency ?? undefined,
    clientId: client.id,
  }).catch(err => log.warn(`[dunning] schedule failed:`, err.message));

  log.info(`[billing-webhook] Payment failed for client ${client.id}, dunning sequence scheduled`);
}

async function handleInvoiceSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : (invoice as any).subscription?.id;
  if (!subscriptionId) return;

  // Stop nagging — payment came through.
  await cancelPendingForSubscription({
    stripeSubscriptionId: subscriptionId,
    reason: "payment_succeeded",
  }).catch(err => log.warn("dunning cancel-on-success failed", { error: err.message }));

  // Send payment-succeeded confirmation email (fail-safe, non-blocking).
  (async () => {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;
    const periodKey = invoice.period_end ? String(invoice.period_end) : String(invoice.created);
    const marker = (invoice.metadata as Record<string, string>)?.last_payment_success_email_period;
    if (marker === periodKey) return;

    const client = await storage.findClientByStripeCustomerId(customerId);
    if (!client?.contact_email) return;

    const stripe = getStripe();
    let nextBillingDate = "See billing portal";
    if (stripe && subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId) as any;
        if (sub.current_period_end) {
          nextBillingDate = new Date(sub.current_period_end * 1000)
            .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        }
      } catch { /* best-effort */ }
    }

    const services = await storage.listClientServices(client.id);
    const active = services.find(s => s.status === "active" && s.billing_period === "monthly");
    let serviceName = "WeFixTrades subscription";
    if (active) {
      const svc = await storage.getServiceById(active.service_id);
      if (svc) serviceName = svc.name;
    }

    const amountCents = invoice.amount_paid ?? invoice.amount_due ?? 0;
    const amountStr = (amountCents / 100).toFixed(2);
    const portalUrl = buildBillingPortalUrl({ stripeCustomerId: customerId });

    await sendPaymentSucceededEmail(client.contact_email, {
      businessName: client.business_name,
      amount: amountStr,
      currency: invoice.currency || "usd",
      serviceName,
      nextBillingDate,
      billingPortalUrl: portalUrl,
    }, client.id);

    if (stripe && invoice.id) {
      await stripe.invoices.update(invoice.id, {
        metadata: { last_payment_success_email_period: periodKey },
      }).catch(() => {});
    }
  })().catch(err => log.warn("Payment succeeded email failed", { error: err.message }));
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
  }).catch(err => log.warn(`[dunning] card-expiring schedule failed:`, err.message));

  log.info(`[billing-webhook] Card expiring for customer ${customerId}, email queued`);
}

/**
 * Wave Q — map a Stripe Price ID back to a local QuoteQuick plan_tier.
 * Returns null if the price ID doesn't match any QuoteQuick price.
 *
 * Legacy STARTER_* env vars (if still set) resolve to 'pro' — Wave Q
 * grandfathers starter customers onto Pro tier.
 */
function priceIdToQuoteQuickTier(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const proIds = [
    process.env.STRIPE_PRICE_QQ_PRO_MONTHLY,
    process.env.STRIPE_PRICE_QQ_PRO_ANNUAL,
    process.env.STRIPE_PRICE_QQ_STARTER_MONTHLY,  // legacy → pro
    process.env.STRIPE_PRICE_QQ_STARTER_ANNUAL,   // legacy → pro
  ].filter(Boolean);
  const businessIds = [
    process.env.STRIPE_PRICE_QQ_BUSINESS_MONTHLY,
    process.env.STRIPE_PRICE_QQ_BUSINESS_ANNUAL,
  ].filter(Boolean);
  if (proIds.includes(priceId)) return "pro";
  if (businessIds.includes(priceId)) return "business";
  return null;
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
    }).catch(err => log.warn(`[dunning] cancel-on-recovery failed:`, err.message));
  }

  // Defensive: if we ever see active → canceled here (rare — usually
  // subscription.deleted fires first), still cancel pending rows.
  if (previousAttrs?.status && previousAttrs.status !== "canceled" && subscription.status === "canceled") {
    await cancelPendingForSubscription({
      stripeSubscriptionId: subscription.id,
      reason: "subscription_canceled",
    }).catch(err => log.warn(`[dunning] cancel-on-canceled-update failed:`, err.message));
  }

  // ── QuoteQuick: keep calculators.plan_tier in sync with the subscription's
  // current price. Covers tier swaps (Pro ↔ Business) made via the Stripe
  // customer portal, where checkout.session.completed never fires. Idempotent
  // — only writes when the resolved tier differs from the current row.
  //
  // We look up by stripe_subscription_id (set on checkout.session.completed).
  // For older rows that predate that field, this is a no-op and the next
  // checkout (or manual sync) will populate it.
  try {
    const qqCalculator = await storage.findCalculatorByStripeSubscriptionId(subscription.id);
    if (qqCalculator) {
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
      const newTier = priceIdToQuoteQuickTier(priceId);
      if (newTier && newTier !== qqCalculator.plan_tier) {
        await storage.updateCalculator(qqCalculator.id, { plan_tier: newTier });
        log.info(`[billing-webhook] QuoteQuick calculator ${qqCalculator.id} plan_tier ${qqCalculator.plan_tier} → ${newTier} (subscription ${subscription.id})`);
      } else if (!newTier && priceId) {
        log.warn(`[billing-webhook] QuoteQuick subscription ${subscription.id} updated to unknown price ${priceId} — calculator ${qqCalculator.id} plan_tier NOT changed`);
      }
    }
  } catch (err: any) {
    log.warn(`[billing-webhook] QuoteQuick plan_tier sync failed for subscription ${subscription.id}:`, err.message);
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
  }).catch(err => log.warn(`[dunning] cancel-pending-on-deleted failed:`, err.message));

  // ── QuoteQuick-direct subscription: revert calculator to free/draft ──
  const qqCalculator = await storage.findCalculatorByStripeSubscriptionId(subscription.id);
  if (qqCalculator) {
    await storage.updateCalculator(qqCalculator.id, {
      plan_tier: "free",
    });
    await storage.upsertDeploymentStatus({
      calculator_id: qqCalculator.id,
      status: "draft",
    });
    log.info(`[billing-webhook] QuoteQuick calculator ${qqCalculator.id} reverted to free/draft after subscription cancellation`);
  }

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
      }).catch(err => log.warn(`[cancellation-email] send failed for service #${svc.id}:`, err.message));
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

  log.info(`[billing-webhook] Subscription cancelled for client ${client.id}`);
}

/* ─── QuoteQuick Direct Checkout Handler ─── */

async function handleQuoteQuickCheckout(session: Stripe.Checkout.Session) {
  const calculatorId = parseInt(session.metadata?.calculator_id || "0");
  const planTier = session.metadata?.plan_tier || "starter";

  if (!calculatorId) {
    log.warn("[billing-webhook] QuoteQuick checkout missing calculator_id");
    return;
  }

  const calculator = await storage.getCalculatorById(calculatorId);
  if (!calculator) {
    log.warn(`[billing-webhook] Calculator ${calculatorId} not found`);
    return;
  }

  const wasPaused = calculator.plan_tier === 'free';

  // Store stripe_subscription_id for cancellation handling
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription as any)?.id;

  // Update plan_tier (and subscription ID) on the calculator
  const updateData: Record<string, any> = { plan_tier: planTier };
  if (subscriptionId) {
    updateData.stripe_subscription_id = subscriptionId;
  }
  await storage.updateCalculator(calculatorId, updateData);

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

  log.info(`[billing-webhook] QuoteQuick calculator ${calculatorId} upgraded to ${planTier}${wasPaused ? ' (reactivated)' : ''}`);
}

/* ─── QuoteQuick One-Time Install Handler (Wave AU-1) ─── */

/**
 * $75 one-time install service for QuoteQuick. The customer pays via the
 * dashboard CTA → calculatorRoutes.ts creates the Checkout session with
 * source='quotequick_install' + calculator_id metadata. This handler is
 * the missing record-keeping step: track a payment_completed event so the
 * install request shows up in the dashboard + Stripe receipt trail is
 * paired with our own audit log. The actual install work is done manually
 * by Alex (or assigned freelancer) outside this codebase.
 */
async function handleQuoteQuickInstall(session: Stripe.Checkout.Session) {
  const calculatorId = parseInt(session.metadata?.calculator_id || "0");
  if (!calculatorId) {
    log.warn("[billing-webhook] quotequick_install missing calculator_id");
    return;
  }
  const calculator = await storage.getCalculatorById(calculatorId);
  if (!calculator) {
    log.warn(`[billing-webhook] quotequick_install — calculator ${calculatorId} not found`);
    return;
  }
  await storage.trackEvent({
    calculator_id: calculatorId,
    event_type: 'install_paid',
    metadata: {
      stripe_session_id: session.id,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email || null,
    },
  });
  log.info(`[billing-webhook] QuoteQuick install paid for calculator ${calculatorId} (session ${session.id}, $${((session.amount_total ?? 0) / 100).toFixed(2)})`);
}

/* ─── Wave R-2 Widget Deposit Handler ─── */

/**
 * Mark the matching widget_deposits row paid when its Checkout session
 * completes. Lookup is by metadata.widget_deposit_id (preferred) with a
 * fallback to stripe_session_id for resilience.
 */
async function handleWidgetDepositCompleted(session: Stripe.Checkout.Session) {
  const depositIdRaw = session.metadata?.widget_deposit_id;
  const depositId = depositIdRaw ? parseInt(depositIdRaw, 10) : NaN;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  let updated;
  if (Number.isFinite(depositId)) {
    [updated] = await db
      .update(widgetDeposits)
      .set({
        status: "paid",
        paid_at: new Date(),
        stripe_payment_intent_id: paymentIntentId ?? undefined,
        stripe_session_id: session.id,
      })
      .where(eq(widgetDeposits.id, depositId))
      .returning();
  }
  if (!updated) {
    [updated] = await db
      .update(widgetDeposits)
      .set({
        status: "paid",
        paid_at: new Date(),
        stripe_payment_intent_id: paymentIntentId ?? undefined,
      })
      .where(eq(widgetDeposits.stripe_session_id, session.id))
      .returning();
  }

  if (!updated) {
    log.warn(`[widget-deposit] checkout.session.completed could not match a widget_deposits row (session ${session.id})`);
    return;
  }

  log.info(`[widget-deposit] Deposit #${updated.id} marked paid (session ${session.id})`);
}

/* ─── Wave AJ-3 — API Platform Subscription Handlers ─────────────────
 * The API platform (wfx_live_* keys) carries its own subscriptions in
 * `api_subscriptions`. We re-use this webhook endpoint (single Stripe
 * signing secret) and discriminate by `subscription.metadata.kind ===
 * 'api_subscription'`. The portal /checkout endpoint stamps this
 * metadata onto both the Checkout Session and the resulting
 * Subscription (subscription_data.metadata) so it survives portal-side
 * tier swaps that never re-touch Checkout.
 * ─────────────────────────────────────────────────────────────────── */

function isApiSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.kind === "api_subscription";
}

function apiTierFromSubscription(sub: Stripe.Subscription): string | null {
  // Prefer subscription metadata (set at checkout); fall back to scanning
  // env vars for a price-id match if metadata is missing (e.g. legacy row).
  const fromMeta = sub.metadata?.tier_id;
  if (fromMeta && getApiTier(fromMeta)) return fromMeta;

  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;

  const tiers = ["starter", "pro", "business", "agency"];
  for (const tierId of tiers) {
    const tier = getApiTier(tierId);
    if (!tier) continue;
    const candidates: Array<string | undefined> = [
      tier.stripeMonthlyPriceEnv ? process.env[tier.stripeMonthlyPriceEnv] : undefined,
      tier.stripeAnnualPriceEnv ? process.env[tier.stripeAnnualPriceEnv] : undefined,
      tier.stripeLoyaltyMonthlyPriceEnv
        ? process.env[tier.stripeLoyaltyMonthlyPriceEnv]
        : undefined,
    ];
    if (candidates.includes(priceId)) return tierId;
  }
  return null;
}

/** Map Stripe subscription status to our local status column. */
function mapApiStatus(
  status: Stripe.Subscription.Status,
): "active" | "trial" | "past_due" | "cancelled" | "paused" {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "paused":
      return "paused";
    default:
      return "active";
  }
}

async function handleApiSubscriptionUpserted(sub: Stripe.Subscription) {
  const userIdRaw = sub.metadata?.user_id;
  const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
  if (!Number.isFinite(userId)) {
    log.warn(`[api-webhook] subscription ${sub.id} has no user_id metadata — skipping`);
    return;
  }

  const tierId = apiTierFromSubscription(sub);
  if (!tierId) {
    log.warn(`[api-webhook] subscription ${sub.id} — could not resolve tier (price ${sub.items?.data?.[0]?.price?.id ?? "unknown"})`);
    return;
  }
  const tier = getApiTier(tierId)!;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  // Stripe types: current_period_* live on the Subscription but the
  // current SDK typing surfaces them only via the underlying API shape.
  const subAny = sub as any;
  const periodStart = new Date(subAny.current_period_start * 1000);
  const periodEnd = new Date(subAny.current_period_end * 1000);
  const status = mapApiStatus(sub.status);

  const [existing] = await db
    .select()
    .from(apiSubscriptions)
    .where(eq(apiSubscriptions.user_id, userId))
    .limit(1);

  if (existing) {
    // Reset usage only if the period actually advanced (avoids zeroing
    // out mid-period on a metadata-only update).
    const periodAdvanced =
      existing.current_period_end?.getTime?.() !== periodEnd.getTime();
    await db
      .update(apiSubscriptions)
      .set({
        tier: tier.id,
        status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId ?? existing.stripe_customer_id,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        monthly_call_quota: tier.monthlyCallQuota,
        monthly_calls_used: periodAdvanced ? 0 : existing.monthly_calls_used,
        reset_at: periodEnd,
        updated_at: new Date(),
      })
      .where(eq(apiSubscriptions.user_id, userId));
    log.info(`[api-webhook] subscription ${sub.id} → user ${userId} tier=${tier.id} status=${status}${periodAdvanced ? " (period advanced, usage reset)" : ""}`);
  } else {
    await db.insert(apiSubscriptions).values({
      id: generateCuid(),
      user_id: userId,
      tier: tier.id,
      status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      monthly_call_quota: tier.monthlyCallQuota,
      monthly_calls_used: 0,
      reset_at: periodEnd,
    });
    log.info(`[api-webhook] created api_subscriptions row for user ${userId} tier=${tier.id}`);
  }
}

async function handleApiSubscriptionDeleted(sub: Stripe.Subscription) {
  const userIdRaw = sub.metadata?.user_id;
  const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
  if (!Number.isFinite(userId)) return;
  await db
    .update(apiSubscriptions)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(eq(apiSubscriptions.user_id, userId));
  log.info(`[api-webhook] subscription ${sub.id} cancelled for user ${userId}`);
}

/**
 * Invoice events don't carry our metadata, so we look up the
 * subscription via Stripe to confirm it's an API subscription before
 * touching our table.
 */
async function maybeHandleApiInvoiceSucceeded(invoice: Stripe.Invoice, stripe: Stripe) {
  const subscriptionId =
    typeof (invoice as any).subscription === "string"
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;
  if (!subscriptionId) return;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err: any) {
    log.warn(`[api-webhook] invoice.payment_succeeded — sub ${subscriptionId} retrieve failed: ${err.message}`);
    return;
  }
  if (!isApiSubscription(sub)) return;

  // Re-use the upsert handler — it will detect the period advance and
  // zero monthly_calls_used.
  await handleApiSubscriptionUpserted(sub);
}

async function maybeHandleApiInvoiceFailed(invoice: Stripe.Invoice, stripe: Stripe) {
  const subscriptionId =
    typeof (invoice as any).subscription === "string"
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;
  if (!subscriptionId) return;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err: any) {
    log.warn(`[api-webhook] invoice.payment_failed — sub ${subscriptionId} retrieve failed: ${err.message}`);
    return;
  }
  if (!isApiSubscription(sub)) return;

  const userIdRaw = sub.metadata?.user_id;
  const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
  if (!Number.isFinite(userId)) return;
  await db
    .update(apiSubscriptions)
    .set({ status: "past_due", updated_at: new Date() })
    .where(eq(apiSubscriptions.user_id, userId));
  log.info(`[api-webhook] subscription ${sub.id} → past_due for user ${userId}`);
}

