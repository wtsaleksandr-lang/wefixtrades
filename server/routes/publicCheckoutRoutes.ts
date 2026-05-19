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
import { db } from "../db";
import { storage } from "../storage";
import type { ServiceCatalogRow } from "@shared/schema";
import { getTradeLineDefaultConfig, serviceCatalog } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { autoAssignSupplier } from "../services/supplierAssignment";
import { getUpsellsForCart } from "../lib/checkoutUpsells";
import { inArray, eq } from "drizzle-orm";

const log = createLogger("PublicCheckout");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

/**
 * Env-var placeholder Stripe price IDs for the public TradeLine tiers.
 *
 * The TradeLine tier SKUs (tradeline-starter/pro/premium) are purchasable
 * from the marketing pricing page. Their Stripe prices are provisioned by
 * Alex separately (live mode) and supplied via these env vars — so the
 * checkout works without anyone running sync-stripe.ts in production.
 *
 * Resolution order (see resolveStripePriceId): catalog stripe_price_id
 * first (sync-stripe path), then the env-var placeholder. If neither is
 * set the checkout returns a clean "contact us" error rather than failing.
 */
const TRADELINE_TIER_PRICE_ENV: Record<string, { monthly: string; yearly: string }> = {
  "tradeline-starter": { monthly: "STRIPE_TRADELINE_STARTER_PRICE", yearly: "STRIPE_TRADELINE_STARTER_YEARLY_PRICE" },
  "tradeline-pro":     { monthly: "STRIPE_TRADELINE_PRO_PRICE",     yearly: "STRIPE_TRADELINE_PRO_YEARLY_PRICE" },
  "tradeline-premium": { monthly: "STRIPE_TRADELINE_PREMIUM_PRICE", yearly: "STRIPE_TRADELINE_PREMIUM_YEARLY_PRICE" },
};

/**
 * Resolve the Stripe price ID for a catalog service.
 * Prefers the catalog-stored id; falls back to an env-var placeholder for
 * the TradeLine tiers. Returns null when no price is configured.
 */
function resolveStripePriceId(svc: ServiceCatalogRow, wantsYearly: boolean): string | null {
  const catalogId = wantsYearly ? svc.stripe_yearly_price_id : svc.stripe_price_id;
  if (catalogId) return catalogId;

  const envKeys = TRADELINE_TIER_PRICE_ENV[svc.id];
  if (envKeys) {
    const envVal = process.env[wantsYearly ? envKeys.yearly : envKeys.monthly];
    if (envVal && envVal.trim()) return envVal.trim();
  }
  return null;
}

interface CheckoutRequestBody {
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  items: string[];          // service_catalog IDs, e.g. ["tradeline-starter", "mapguard-basic"]
  bundle_id?: string;       // bundle this came from — triggers bundle-savings coupon
  billing_period?: "monthly" | "yearly"; // defaults to "monthly"
  system_builder?: boolean; // true when this is the SystemBuilder cart path — triggers 7%
}

export function registerPublicCheckoutRoutes(app: Express): void {

  /**
   * GET /api/public/pricing — Q28g3
   * Public read of serviceCatalog overrides for the marketing /pricing page.
   * Returns ONLY customer-visible fields (no Stripe IDs, no internal costs).
   * Marketing pricing.tsx fetches this and merges over the hardcoded
   * shared/pricing.ts data so admin-edited copy + tiers go live without a
   * deploy.
   */
  app.get("/api/public/pricing", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: serviceCatalog.id,
          name: serviceCatalog.name,
          tagline: serviceCatalog.tagline,
          description: serviceCatalog.description,
          category: serviceCatalog.category,
          default_price: serviceCatalog.default_price,
          billing_period: serviceCatalog.billing_period,
          is_active: serviceCatalog.is_active,
          tiers: serviceCatalog.tiers,
          features: serviceCatalog.features,
        })
        .from(serviceCatalog);

      // Strip per-tier stripe_price_id before exposing publicly.
      const sanitized = rows
        .filter((r) => r.is_active)
        .map((r) => ({
          ...r,
          tiers: Array.isArray(r.tiers)
            ? (r.tiers as any[]).map((t) => {
                const { stripe_price_id: _omit, ...rest } = t ?? {};
                return rest;
              })
            : null,
        }));

      // 5-minute cache hint — pricing rarely changes; reduces marketing-page load.
      res.set("Cache-Control", "public, max-age=300");
      res.json({ products: sanitized });
    } catch (err: any) {
      log.error("[public-pricing] Error:", err.message);
      res.status(500).json({ error: "Failed to load pricing" });
    }
  });

  app.post("/api/public/checkout", async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Payments are not configured yet. Please contact us directly." });

      /* ─── Validate input ─── */
      const body = req.body as CheckoutRequestBody;
      const { business_name, contact_name, contact_email, contact_phone, items, bundle_id, system_builder } = body;
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
        // Determine which Stripe price to use. Resolution prefers the
        // catalog-stored price id and falls back to an env-var placeholder
        // for the TradeLine tier SKUs (see resolveStripePriceId).
        const wantsYearly = billingPeriod === "yearly" && svc.billing_period === "monthly";
        const resolvedPriceId = resolveStripePriceId(svc, wantsYearly);
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

      // Broad payment method types — Stripe auto-shows relevant options per locale
      const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = [
        "card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit",
      ];

      /* ─── Discount coupon (bundle savings OR SystemBuilder 7%) ───
       * Previously the UI showed "$75 saved" or "7% off" but the discount was
       * never sent to Stripe — customers got charged the full sum. We create
       * a one-shot transient coupon per checkout when applicable. Stripe
       * archives unused coupons automatically.
       *
       * Bundle savings take priority. If the same checkout is both a bundle
       * AND the system_builder path, the bundle's exact savings amount wins
       * (more accurate). */
      const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
      if (bundle_id) {
        try {
          const { ALL_BUNDLES, bundleSavings } = await import("@shared/pricing");
          const bundle = ALL_BUNDLES.find(b => b.id === bundle_id);
          if (bundle) {
            const savingsDollars = bundleSavings(bundle);
            if (savingsDollars > 0) {
              const coupon = await stripe.coupons.create({
                amount_off: savingsDollars * 100, // cents
                currency: "usd",
                duration: "once",
                name: `${bundle.name} bundle savings`,
                metadata: { bundle_id, source: "public_checkout_bundle" },
              });
              discounts.push({ coupon: coupon.id });
            }
          }
        } catch (err: any) {
          log.warn("[public-checkout] bundle coupon failed (continuing without)", { err: err?.message });
        }
      } else if (system_builder) {
        try {
          const coupon = await stripe.coupons.create({
            percent_off: 7,
            duration: "once",
            name: "System Builder — 7% bundle discount",
            metadata: { source: "system_builder" },
          });
          discounts.push({ coupon: coupon.id });
        } catch (err: any) {
          log.warn("[public-checkout] systembuilder coupon failed (continuing without)", { err: err?.message });
        }
      }

      /* ─── Optional cross-sell items (upsells in Stripe Checkout) ───
       * Suggest 1-2 complementary products the customer can toggle on at
       * the Stripe-hosted page. Skipped when:
       *   - the cart is system_builder (those already have intent toward
       *     a curated bundle; an upsell muddies the message)
       *   - the cart is a bundle (same reason)
       *   - mode === "payment" filters to one-time upsell prices only
       *     (Stripe disallows recurring optional_items in payment mode) */
      let optionalItems: Stripe.Checkout.SessionCreateParams.OptionalItem[] = [];
      if (!bundle_id && !system_builder) {
        try {
          const upsellIds = getUpsellsForCart(services.map(s => s.id));
          if (upsellIds.length > 0) {
            const upsellRows = await db
              .select()
              .from(serviceCatalog)
              .where(inArray(serviceCatalog.id, upsellIds));
            for (const row of upsellRows) {
              const priceId = (billingPeriod === "yearly" && row.stripe_yearly_price_id)
                ? row.stripe_yearly_price_id
                : row.stripe_price_id;
              if (!priceId) continue;
              // payment mode rejects recurring optional_items — filter.
              if (mode === "payment" && row.billing_period !== "one-time") continue;
              optionalItems.push({
                price: priceId,
                quantity: 1,
                adjustable_quantity: { enabled: false, minimum: 1, maximum: 1 },
              });
              if (optionalItems.length >= 2) break;
            }
          }
        } catch (err: any) {
          log.warn("[public-checkout] upsell computation failed (continuing without)", { err: err?.message });
        }
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        payment_method_types: paymentMethodTypes,
        line_items: lineItems,
        ...(optionalItems.length > 0 ? { optional_items: optionalItems } : {}),
        ...(discounts.length > 0 ? { discounts } : { allow_promotion_codes: true }),
        metadata: {
          crm_client_id: String(client.id),
          service_catalog_id: services.map(s => s.id).join(","),
          bundle_id: bundle_id || "",
          system_builder: system_builder ? "1" : "",
          billing_period: billingPeriod,
          source: "public_checkout",
          upsells_offered: optionalItems.length > 0 ? "1" : "",
        },
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/cancelled`,
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
