/**
 * Portal Catalog routes.
 *
 * Mounted under /api/portal/catalog* (subscribe + list).
 * Auth: requireClient / requireClientStrict.
 *
 * Extracted from portalRoutes.ts as wave 13 of the portal sub-registrar
 * refactor. Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalCatalogRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   POST /api/portal/catalog/subscribe   (start Stripe Checkout for a service or bundle)
 *   GET  /api/portal/catalog             (list services + bundles available to subscribe)
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { requireClient, requireClientStrict } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
} from "@shared/schema";
import { SERVICES } from "@shared/services";
import { ALL_BUNDLES, bundleSavings } from "@shared/pricing";
import type { ServiceCatalogRow } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalCatalog");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403. */
async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalCatalogRoutes(app: Express) {
  /**
   * POST /api/portal/catalog/subscribe
   * Q16: add a service to an authenticated client's subscription via Stripe Checkout.
   * Pre-creates the clientService + onboarding + tasks in 'pending' state, then
   * returns a checkout_url. Webhook (stripeBillingRoutes) flips status to active
   * on payment success — same flow as /api/public/checkout.
   * Body: { service_id: string, billing_period?: "monthly" | "yearly" }
   */
  app.post("/api/portal/catalog/subscribe", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: "Payments are not configured yet. Please contact us." });
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-01-27.acacia" as any });

      const { service_id, billing_period, tier_id, bundle_id } = req.body ?? {};

      /* Q5e: bundle path. When bundle_id is set, resolve the bundle from
         shared/pricing.ts ALL_BUNDLES and create a pending client_service
         per included tier, then a SINGLE Stripe Checkout Session with one
         line_item per included tier (Stripe subscription mode supports
         mixed subscription + one-time line items). */
      if (bundle_id) {
        if (typeof bundle_id !== "string") {
          return res.status(400).json({ error: "bundle_id must be a string" });
        }
        const bundle = ALL_BUNDLES.find((b) => b.id === bundle_id);
        if (!bundle) return res.status(400).json({ error: "Unknown bundle" });

        // Pre-flight: every included tier must exist + be active + the client
        // must not already have any of them.
        const includedSvcs: Array<ServiceCatalogRow & { _priceId: string }> = [];
        for (const inc of bundle.includes) {
          const s = await storage.getServiceById(inc.tierId);
          if (!s || !s.is_active) return res.status(400).json({ error: `${inc.label} is not available` });
          const dup = await storage.findClientServiceByServiceId(clientId, s.id);
          if (dup && dup.status !== "cancelled" && dup.status !== "completed") {
            return res.status(409).json({ error: `You're already subscribed to ${s.name}.` });
          }
          const priceId = s.stripe_price_id;
          if (!priceId) {
            return res.status(400).json({ error: `${s.name} pricing isn't configured yet. Please contact us.` });
          }
          includedSvcs.push({ ...s, _priceId: priceId });
        }

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
        if (!client) return res.status(404).json({ error: "Client not found" });
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

        // Pre-create each included service in pending state.
        const createdIds: number[] = [];
        for (const s of includedSvcs) {
          const cs = await storage.createClientService({
            client_id: client.id,
            service_id: s.id,
            status: "pending",
            enabled: true,
            fulfillment_mode: "internal",
            price_cents: s.default_price,
            billing_period: s.billing_period,
            metadata: { bundle_id: bundle.id, bundle_name: bundle.name },
          });
          createdIds.push(cs.id);
          await storage.createClientPayment({
            client_id: client.id,
            client_service_id: cs.id,
            type: s.billing_period === "monthly" ? "invoice" : "payment",
            amount_cents: s.default_price ?? 0,
            status: "pending",
            description: `${s.name} (bundle: ${bundle.name})`,
            actor_type: "system",
          });
        }

        const hasMonthly = includedSvcs.some((s) => s.billing_period === "monthly");
        const mode = hasMonthly ? "subscription" : "payment";
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
          payment_method_types: ["card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit"],
          line_items: includedSvcs.map((s) => ({ price: s._priceId, quantity: 1 })),
          metadata: {
            crm_client_id: String(client.id),
            bundle_id: bundle.id,
            service_catalog_id: includedSvcs.map((s) => s.id).join(","),
            client_service_ids: createdIds.join(","),
            source: "portal_catalog_bundle",
          },
          success_url: `${baseUrl}/portal/services?checkout=success&bundle=${encodeURIComponent(bundle.id)}`,
          cancel_url: `${baseUrl}/portal/catalog?checkout=cancelled`,
          allow_promotion_codes: true,
          billing_address_collection: "auto",
        });

        log.info("[portal/catalog/subscribe] bundle session created", {
          clientId, bundle_id: bundle.id, items: includedSvcs.length, session_id: session.id,
        });
        return res.json({ checkout_url: session.url, session_id: session.id });
      }

      if (!service_id || typeof service_id !== "string") {
        return res.status(400).json({ error: "service_id or bundle_id is required" });
      }
      const wantsYearly = billing_period === "yearly";

      const svc = await storage.getServiceById(service_id);
      if (!svc || !svc.is_active) return res.status(400).json({ error: "Service not available" });

      const existing = await storage.findClientServiceByServiceId(clientId, svc.id);
      if (existing && existing.status !== "cancelled" && existing.status !== "completed") {
        return res.status(409).json({ error: "You're already subscribed to this service." });
      }

      /* Q28g2: if the product has tiers AND the request specifies a tier_id,
         use that tier's stripe_price_id + price_cents. Otherwise fall back to
         the product-level stripe_price_id (single-price products) or the
         first/highlighted tier when tiers exist but no tier_id was picked. */
      type ProductTier = {
        id: string;
        name: string;
        price_cents: number;
        billing_period: "monthly" | "one-time";
        stripe_price_id?: string | null;
        highlighted?: boolean;
      };
      const productTiers: ProductTier[] | null = Array.isArray(svc.tiers)
        ? (svc.tiers as ProductTier[])
        : null;

      let pickedTier: ProductTier | null = null;
      if (productTiers && productTiers.length > 0) {
        if (tier_id) {
          pickedTier = productTiers.find((t) => t.id === tier_id) ?? null;
          if (!pickedTier) {
            return res.status(400).json({ error: "Selected tier not found for this product." });
          }
        } else {
          // Default: highlighted tier if any, else first
          pickedTier = productTiers.find((t) => t.highlighted) ?? productTiers[0] ?? null;
        }
      }

      const tierStripeId = pickedTier?.stripe_price_id || null;
      const productLevelPriceId = wantsYearly && svc.billing_period === "monthly"
        ? svc.stripe_yearly_price_id
        : svc.stripe_price_id;
      const resolvedPriceId = tierStripeId ?? productLevelPriceId;
      if (!resolvedPriceId) {
        return res.status(400).json({ error: `${svc.name} pricing isn't configured yet. Please contact us.` });
      }

      const tierPriceCents = pickedTier?.price_cents ?? null;
      const tierBillingPeriod = pickedTier?.billing_period ?? null;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

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

      // Pre-create pending clientService + payment + onboarding + tasks (same shape as public flow)
      const effectivePriceCents = tierPriceCents ?? svc.default_price;
      const effectiveBillingPeriod = tierBillingPeriod ?? svc.billing_period;
      const tierLabel = pickedTier ? ` (${pickedTier.name})` : "";
      const cs = await storage.createClientService({
        client_id: client.id,
        service_id: svc.id,
        status: "pending",
        enabled: true,
        fulfillment_mode: "internal",
        price_cents: effectivePriceCents,
        billing_period: effectiveBillingPeriod,
        metadata: pickedTier ? { tier_id: pickedTier.id, tier_name: pickedTier.name } : null,
      });
      await storage.createClientPayment({
        client_id: client.id,
        client_service_id: cs.id,
        type: effectiveBillingPeriod === "monthly" ? "invoice" : "payment",
        amount_cents: effectivePriceCents ?? 0,
        status: "pending",
        description: `${svc.name}${tierLabel} — ${effectiveBillingPeriod === "monthly" ? "monthly" : "one-time"}`,
        actor_type: "system",
      });
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
      const tasks = await storage.getTaskTemplates(svc.id);
      for (const t of tasks) {
        await storage.createFulfillmentTask({
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
      }

      const mode = effectiveBillingPeriod === "monthly" ? "subscription" : "payment";
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        payment_method_types: ["card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit"],
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        metadata: {
          crm_client_id: String(client.id),
          service_catalog_id: svc.id,
          client_service_id: String(cs.id),
          billing_period: wantsYearly ? "yearly" : "monthly",
          source: "portal_catalog",
          ...(pickedTier ? { tier_id: pickedTier.id, tier_name: pickedTier.name } : {}),
        },
        success_url: `${baseUrl}/portal/services?checkout=success&service=${encodeURIComponent(svc.id)}`,
        cancel_url: `${baseUrl}/portal/catalog?checkout=cancelled`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
      });

      log.info("[portal/catalog/subscribe] session created", {
        clientId,
        service_id: svc.id,
        client_service_id: cs.id,
        session_id: session.id,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("[portal/catalog/subscribe] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to start checkout. Please try again." });
    }
  });

  /**
   * GET /api/portal/catalog
   * Q16: in-portal service catalog — services the client is NOT yet subscribed to.
   * Returns full SERVICES rows minus any IDs the client already has active/pending/onboarding.
   */
  app.get("/api/portal/catalog", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const active = await db
        .select({ service_id: clientServices.service_id })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${clientServices.status} in ('pending','onboarding','active','paused')`,
        ));
      const activeIds = new Set(active.map((r) => r.service_id));

      /* Q28g + Q28g2: read-path flip for admin-edited copy. DB overrides for
         name / tagline / description / features when non-null; otherwise fall
         back to the hardcoded SERVICES list. Tiers (Q28a) are passed through
         so the client can render a tier picker when present. */
      const dbRows = await db
        .select({
          id: serviceCatalog.id,
          name: serviceCatalog.name,
          tagline: serviceCatalog.tagline,
          description: serviceCatalog.description,
          features: serviceCatalog.features,
          tiers: serviceCatalog.tiers,
        })
        .from(serviceCatalog);
      const dbById = new Map(dbRows.map((r) => [r.id, r]));

      const available = SERVICES
        .filter((svc) => !activeIds.has(svc.id))
        .map((svc) => {
          const override = dbById.get(svc.id);
          if (!override) return { ...svc, tiers: null };
          return {
            ...svc,
            name: override.name ?? svc.name,
            tagline: override.tagline ?? svc.tagline,
            description: override.description ?? svc.description,
            features: Array.isArray(override.features) && override.features.length > 0
              ? (override.features as string[])
              : svc.features,
            tiers: Array.isArray(override.tiers) && override.tiers.length > 0
              ? override.tiers
              : null,
          };
        });

      /* Q5e: bundles available to subscribe to. A bundle is "available"
         if NONE of its included tier IDs are already on the client's
         active subscription list — otherwise checking out the bundle
         would create a duplicate subscription. */
      const availableBundles = ALL_BUNDLES
        .filter((b) => b.includes.every((inc) => !activeIds.has(inc.tierId)))
        .map((b) => ({
          id: b.id,
          name: b.name,
          tagline: b.tagline,
          price: b.price,
          billingPeriod: b.billingPeriod,
          badge: b.badge ?? null,
          highlighted: !!b.highlighted,
          savings: bundleSavings(b),
          includes: b.includes.map((inc) => ({
            tier_id: inc.tierId,
            label: inc.label,
            value: inc.value,
          })),
        }));

      res.json({ services: available, bundles: availableBundles });
    } catch (err: any) {
      log.error("[portal/catalog] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load catalog" });
    }
  });
}
