/**
 * Citation Tracker — customer-facing portal routes.
 *
 *   POST   /api/citation-tracker/subscribe         — Stripe Checkout session
 *   GET    /api/citation-tracker/subscription      — current sub + summary
 *   GET    /api/citation-tracker/listings          — paginated listings
 *   GET    /api/citation-tracker/alerts            — paginated alerts (unread first)
 *   POST   /api/citation-tracker/alerts/:id/dismiss — mark alert read
 *   POST   /api/citation-tracker/cancel            — Stripe customer portal URL
 *
 * All routes require requireClient. Admin-side ops (run-now scan, listing
 * inspection) are handled out of this file — TBD in Wave 3.5.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireClient } from "../auth";
import { db } from "../db";
import {
  citationTrackerSubscriptions,
  citationTrackerListings,
  citationTrackerAlerts,
  CITATION_TRACKER_LOOKUP_KEYS,
  CITATION_TRACKER_PRICING,
} from "@shared/schema";
import { getSubscriptionForCustomer } from "../services/citationTracker/monitor";
import { createLogger } from "../lib/logger";

const log = createLogger("CitationTrackerRoutes");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

const subscribeSchema = z.object({
  plan: z.enum(["standalone_monthly", "standalone_yearly", "bundle_monthly", "bundle_yearly"]),
  business_name: z.string().min(1).max(200),
  nap: z.object({
    phone: z.string().optional(),
    address: z.string().optional(),
    name: z.string().optional(),
    website: z.string().optional(),
  }),
});

function lookupKeyFor(plan: z.infer<typeof subscribeSchema>["plan"]): string {
  switch (plan) {
    case "standalone_monthly": return CITATION_TRACKER_LOOKUP_KEYS.STANDALONE_MONTHLY;
    case "standalone_yearly": return CITATION_TRACKER_LOOKUP_KEYS.STANDALONE_YEARLY;
    case "bundle_monthly": return CITATION_TRACKER_LOOKUP_KEYS.BUNDLE_MONTHLY;
    case "bundle_yearly": return CITATION_TRACKER_LOOKUP_KEYS.BUNDLE_YEARLY;
  }
}

function planTierFor(plan: z.infer<typeof subscribeSchema>["plan"]): "standalone" | "bundle" {
  return plan.startsWith("bundle") ? "bundle" : "standalone";
}

function unitAmountFor(plan: z.infer<typeof subscribeSchema>["plan"]): number {
  switch (plan) {
    case "standalone_monthly": return CITATION_TRACKER_PRICING.standalone_monthly_cents;
    case "standalone_yearly": return CITATION_TRACKER_PRICING.standalone_yearly_cents;
    case "bundle_monthly": return CITATION_TRACKER_PRICING.bundle_monthly_cents;
    case "bundle_yearly": return CITATION_TRACKER_PRICING.bundle_yearly_cents;
  }
}

function intervalFor(plan: z.infer<typeof subscribeSchema>["plan"]): "month" | "year" {
  return plan.endsWith("_yearly") ? "year" : "month";
}

/**
 * Resolve a Stripe Price ID by lookup_key. If the lookup_key doesn't
 * exist yet (Alex hasn't created the prices in the dashboard), fall
 * back to a one-shot price_data line item using the static price table.
 * That keeps the checkout flow working end-to-end even before the live
 * Price objects are wired up.
 */
async function resolvePriceOrInline(
  stripe: Stripe,
  plan: z.infer<typeof subscribeSchema>["plan"],
): Promise<{ price?: string; price_data?: Stripe.Checkout.SessionCreateParams.LineItem.PriceData }> {
  const lookupKey = lookupKeyFor(plan);
  try {
    const list = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const found = list.data[0];
    if (found) return { price: found.id };
  } catch (err: any) {
    log.warn("price lookup failed — falling back to inline price_data", { lookup_key: lookupKey, error: err?.message });
  }
  return {
    price_data: {
      currency: "usd",
      product_data: { name: plan.startsWith("bundle") ? "Citation Tracker (bundle add-on)" : "Citation Tracker" },
      unit_amount: unitAmountFor(plan),
      recurring: { interval: intervalFor(plan) },
    },
  };
}

export function registerCitationTrackerRoutes(app: Express): void {

  /* ─── POST /api/citation-tracker/subscribe ─────────────────────── */
  app.post("/api/citation-tracker/subscribe", requireClient, async (req: Request, res: Response) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    try {
      const userId = req.user!.id;
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const priceOrInline = await resolvePriceOrInline(stripe, parsed.data.plan);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ ...priceOrInline, quantity: 1 }],
        customer_email: req.user?.email,
        metadata: {
          product: "citation_tracker",
          plan: parsed.data.plan,
          user_id: String(userId),
          business_name: parsed.data.business_name,
          nap: JSON.stringify(parsed.data.nap),
        },
        subscription_data: {
          metadata: {
            product: "citation_tracker",
            plan: parsed.data.plan,
            user_id: String(userId),
            plan_tier: planTierFor(parsed.data.plan),
          },
        },
        success_url: `${baseUrl}/portal/citation-tracker?checkout=success`,
        cancel_url: `${baseUrl}/citation-tracker?checkout=cancelled`,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("subscribe failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ─── GET /api/citation-tracker/subscription ───────────────────── */
  app.get("/api/citation-tracker/subscription", requireClient, async (req: Request, res: Response) => {
    try {
      const sub = await getSubscriptionForCustomer(req.user!.id);
      if (!sub) return res.json({ subscription: null });

      const [{ total_listings = 0 } = { total_listings: 0 }] = await db
        .select({ total_listings: sql<number>`count(*)::int` })
        .from(citationTrackerListings)
        .where(eq(citationTrackerListings.subscription_id, sub.id));

      const [{ unread_alerts = 0 } = { unread_alerts: 0 }] = await db
        .select({ unread_alerts: sql<number>`count(*)::int` })
        .from(citationTrackerAlerts)
        .where(and(
          eq(citationTrackerAlerts.subscription_id, sub.id),
          isNull(citationTrackerAlerts.read_at),
        ));

      res.json({
        subscription: sub,
        summary: {
          total_listings,
          unread_alerts,
        },
      });
    } catch (err: any) {
      log.error("get subscription failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load subscription" });
    }
  });

  /* ─── GET /api/citation-tracker/listings ───────────────────────── */
  app.get("/api/citation-tracker/listings", requireClient, async (req: Request, res: Response) => {
    try {
      const sub = await getSubscriptionForCustomer(req.user!.id);
      if (!sub) return res.json({ listings: [], total: 0 });

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const rows = await db
        .select()
        .from(citationTrackerListings)
        .where(eq(citationTrackerListings.subscription_id, sub.id))
        .orderBy(desc(citationTrackerListings.last_checked_at))
        .limit(limit)
        .offset(offset);

      const [{ total = 0 } = { total: 0 }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(citationTrackerListings)
        .where(eq(citationTrackerListings.subscription_id, sub.id));

      res.json({ listings: rows, total, page, limit });
    } catch (err: any) {
      log.error("list listings failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load listings" });
    }
  });

  /* ─── GET /api/citation-tracker/alerts ─────────────────────────── */
  app.get("/api/citation-tracker/alerts", requireClient, async (req: Request, res: Response) => {
    try {
      const sub = await getSubscriptionForCustomer(req.user!.id);
      if (!sub) return res.json({ alerts: [], total: 0 });

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      // Unread first (read_at IS NULL), then most recent.
      const rows = await db
        .select()
        .from(citationTrackerAlerts)
        .where(eq(citationTrackerAlerts.subscription_id, sub.id))
        .orderBy(sql`${citationTrackerAlerts.read_at} IS NULL DESC`, desc(citationTrackerAlerts.created_at))
        .limit(limit)
        .offset(offset);

      const [{ total = 0 } = { total: 0 }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(citationTrackerAlerts)
        .where(eq(citationTrackerAlerts.subscription_id, sub.id));

      res.json({ alerts: rows, total, page, limit });
    } catch (err: any) {
      log.error("list alerts failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load alerts" });
    }
  });

  /* ─── POST /api/citation-tracker/alerts/:id/dismiss ────────────── */
  app.post("/api/citation-tracker/alerts/:id/dismiss", requireClient, async (req: Request, res: Response) => {
    try {
      const sub = await getSubscriptionForCustomer(req.user!.id);
      if (!sub) return res.status(404).json({ error: "No active subscription" });

      const alertId = String(req.params.id ?? "");
      if (!alertId) return res.status(400).json({ error: "Missing alert id" });
      const updated = await db
        .update(citationTrackerAlerts)
        .set({ read_at: new Date() })
        .where(and(
          eq(citationTrackerAlerts.id, alertId),
          eq(citationTrackerAlerts.subscription_id, sub.id),
        ))
        .returning();

      if (updated.length === 0) return res.status(404).json({ error: "Alert not found" });
      res.json({ alert: updated[0] });
    } catch (err: any) {
      log.error("dismiss alert failed", { error: err?.message });
      res.status(500).json({ error: "Failed to dismiss alert" });
    }
  });

  /* ─── POST /api/citation-tracker/cancel ────────────────────────── */
  app.post("/api/citation-tracker/cancel", requireClient, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

      const sub = await getSubscriptionForCustomer(req.user!.id);
      if (!sub) return res.status(404).json({ error: "No active subscription" });
      if (!sub.stripe_subscription_id) {
        return res.status(409).json({ error: "Subscription not linked to Stripe yet — try again in a moment" });
      }

      // Resolve the customer from the subscription so we can issue a portal URL.
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/portal/citation-tracker`,
      });

      res.json({ portal_url: portal.url });
    } catch (err: any) {
      log.error("cancel/portal failed", { error: err?.message });
      res.status(500).json({ error: "Failed to open customer portal" });
    }
  });
}
