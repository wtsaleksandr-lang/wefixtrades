/**
 * Billing portal redirect — `/api/billing/portal/:token`
 *
 * Validates the HMAC-signed token from a dunning email, mints a fresh
 * Stripe Billing Portal session for the authorized customer, and
 * 302-redirects the browser straight to it.
 *
 * The token is opaque — no PII in the URL, just a base64url-signed
 * `customer_id:expires_at` payload. Replay-safe within the TTL because
 * each click mints a NEW Stripe portal session (Stripe sessions
 * themselves expire after a few minutes of inactivity).
 *
 * Failure modes (intentionally generic to avoid token-fishing):
 *   - Bad/expired token  → redirect to /billing/expired
 *   - Stripe not configured → redirect to /billing/error
 *   - Stripe API error    → redirect to /billing/error
 *
 * No admin auth required — the HMAC token IS the auth.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { verifyBillingPortalToken } from "../lib/billingPortalToken";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

export function registerBillingPortalRoute(app: Express): void {
  app.get("/api/billing/portal/:token", async (req: Request, res: Response) => {
    const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
    const token = req.params.token;

    const verified = verifyBillingPortalToken(token);
    if (!verified) {
      console.warn("[billing-portal] token verification failed");
      return res.redirect(302, `${baseUrl}/billing/expired`);
    }

    const stripe = getStripe();
    if (!stripe) {
      console.error("[billing-portal] STRIPE_SECRET_KEY not configured");
      return res.redirect(302, `${baseUrl}/billing/error`);
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: verified.stripeCustomerId,
        return_url: `${baseUrl}/portal/billing`,
      });
      return res.redirect(302, session.url);
    } catch (err: any) {
      console.error("[billing-portal] Stripe session create failed:", err.message);
      return res.redirect(302, `${baseUrl}/billing/error`);
    }
  });
}
