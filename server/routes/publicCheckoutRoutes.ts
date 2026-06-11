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
import { resolveStripePriceId } from "../lib/stripePriceResolver";
import { publicCheckoutRateLimiter } from "../services/rateLimiter";
import { inArray, eq } from "drizzle-orm";

const log = createLogger("PublicCheckout");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

/* Stripe price resolution (catalog stripe_price_id → env-var fallback for the
 * TradeLine / ContentFlow / QuoteQuick-install SKUs) lives in the shared
 * helper `../lib/stripePriceResolver` so the portal subscribe path resolves
 * env-priced products identically to this public checkout. */

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
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!(await publicCheckoutRateLimiter.check(`public-checkout:${ip}`))) {
      return res.status(429).json({ error: "Too many checkout attempts. Try again in a few minutes." });
    }

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
      const services: Array<ServiceCatalogRow & {
        _resolvedPriceId: string | null;
        _wantsYearly: boolean;
      }> = [];
      for (const id of items) {
        const svc = await storage.getServiceById(id);
        if (!svc) return res.status(400).json({ error: `Unknown service: ${id}` });
        if (!svc.is_active) return res.status(400).json({ error: `Service ${svc.name} is not available` });
        // Determine which Stripe price to use. Resolution prefers the
        // catalog-stored price id and falls back to an env-var placeholder
        // for the TradeLine tier SKUs (see resolveStripePriceId).
        const wantsYearly = billingPeriod === "yearly" && svc.billing_period === "monthly";
        const resolvedPriceId = resolveStripePriceId(svc, wantsYearly);
        // No live/env price id resolves → fall back to inline price_data built
        // from the catalog default_price + billing_period (mirrors the
        // citation-builder checkout). This keeps every active tier checkout-able
        // at its catalog amount even before live Stripe prices are minted.
        // Guard rails on the fallback:
        //   - need a usable catalog amount (default_price > 0 cents), else reject.
        //   - the catalog amount is the *monthly / one-time* price, so we can't
        //     synthesize a correct *yearly* price from it — when the customer
        //     asked for yearly and no yearly price id resolves, reject rather
        //     than mis-bill the monthly amount on a yearly interval.
        if (!resolvedPriceId && (wantsYearly || svc.default_price == null || svc.default_price <= 0)) {
          const missing = wantsYearly ? "yearly" : "default";
          return res.status(400).json({ error: `${svc.name} does not have a ${missing} price configured. Please contact us.` });
        }
        services.push({ ...svc, _resolvedPriceId: resolvedPriceId, _wantsYearly: wantsYearly });
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

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = services.map(svc => {
        // Prefer a real live/env price id (durable wiring). Fall back to inline
        // price_data built from the catalog default_price + billing_period when
        // no price id resolves — same pattern as citationBuilderRoutes, extended
        // with a `recurring` block for subscription tiers so the line item is
        // valid in subscription mode. unit_amount is in cents (default_price is
        // already cents in service_catalog).
        if (svc._resolvedPriceId) {
          return { price: svc._resolvedPriceId, quantity: 1 };
        }
        const isRecurring = svc.billing_period === "monthly";
        const interval: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval =
          svc._wantsYearly ? "year" : "month";
        return {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: svc.name,
              ...(svc.description ? { description: svc.description } : {}),
            },
            unit_amount: svc.default_price ?? 0,
            ...(isRecurring ? { recurring: { interval } } : {}),
          },
        };
      });

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
          const { ALL_BUNDLES, bundleSavings, bundleYearlySavings, yearlyTotal } = await import("@shared/pricing");
          const bundle = ALL_BUNDLES.find(b => b.id === bundle_id);
          if (bundle) {
            /* Lane B — yearly bundle alignment. On a yearly checkout each
             * component line item charges its YEARLY Stripe price, so the
             * coupon must be in yearly terms too. Previously the monthly
             * bundleSavings() was applied to the yearly invoice, so the page
             * (yearlyTotal(bundle.price)), the coupon (monthly savings), and
             * the actual charge (Σ component yearly − monthly savings) were
             * three different numbers.
             *
             * Canonical estimate: bundleYearlySavings() (assumes each yearly
             * price = monthly × 12 × 0.90). Some products mint different
             * yearly policies (e.g. TradeLine is 2-months-free), so when we
             * can resolve every line item to a real Stripe price we compute
             * the EXACT coupon: (actual pre-discount sum) − advertised
             * yearly bundle total — which makes the final charge land
             * precisely on the advertised yearlyTotal(bundle.price). */
            const isYearlyBundle = billingPeriod === "yearly" && bundle.billingPeriod === "monthly";
            let savingsCents = (isYearlyBundle ? bundleYearlySavings(bundle) : bundleSavings(bundle)) * 100;
            if (isYearlyBundle) {
              try {
                let actualSumCents = 0;
                for (const svc of services) {
                  if (svc._resolvedPriceId) {
                    const pr = await stripe.prices.retrieve(svc._resolvedPriceId);
                    if (typeof pr.unit_amount !== "number") throw new Error(`price ${svc._resolvedPriceId} has no flat unit_amount`);
                    actualSumCents += pr.unit_amount;
                  } else {
                    // Inline price_data fallback charges the catalog amount directly.
                    actualSumCents += svc.default_price ?? 0;
                  }
                }
                savingsCents = actualSumCents - yearlyTotal(bundle.price) * 100;
              } catch (err: any) {
                log.warn("[public-checkout] exact yearly bundle coupon failed — using canonical estimate", { err: err?.message });
              }
            }
            if (savingsCents > 0) {
              const coupon = await stripe.coupons.create({
                amount_off: Math.round(savingsCents),
                currency: "usd",
                /* Lane B: was "once", which discounted only the FIRST invoice
                 * — bundle subscribers paid the full component sum on every
                 * renewal even though the page advertises the bundle price as
                 * the recurring price. "forever" applies the discount to every
                 * invoice of this subscription (the coupon is minted per
                 * checkout and attached only to this session, so "forever"
                 * scopes to this customer's subscription, not globally). */
                duration: "forever",
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
            /* Lane B: same renewal bug as the bundle coupon — the pricing
             * page shows the 7%-discounted total as the recurring price, so
             * the discount must persist past the first invoice. */
            duration: "forever",
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
