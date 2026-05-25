/**
 * Full Audit Master — $9.80 paid audit checkout + delivery.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25). Three of the free
 * tools (CitationChecker, LocalRankflux, LocalSearchChecker, plus the
 * shared FreeToolLayout) all advertise a $9.80 "full audit master"
 * upsell, but no Stripe product or checkout endpoint existed. This
 * file closes that loop.
 *
 *   POST  /api/full-audit/checkout       — Stripe Checkout
 *   GET   /api/full-audit/result/:id     — fetch result by order id
 *
 * Checkout is unauth'd (free tools are public). Order rows persist in
 * `full_audit_master_orders` and are keyed by email + Stripe session.
 *
 * The actual audit-run step (POST /api/full-audit/run) is invoked by
 * the Stripe webhook handler after checkout.session.completed, not
 * here — keeps the surface area minimal.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { fullAuditMasterOrders } from "@shared/schema";
import { FULL_AUDIT_MASTER } from "@shared/pricing";
import { createLogger } from "../lib/logger";

const log = createLogger("FullAuditRoutes");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

const checkoutSchema = z.object({
  business_url: z.string().url().max(2048),
  email: z.string().email().max(320),
});

export const FULL_AUDIT_MASTER_PRICE_CENTS = 980; // $9.80 — canonical

export function registerFullAuditRoutes(app: Express): void {

  /* ─── POST /api/full-audit/checkout ────────────────────────────── */
  app.post("/api/full-audit/checkout", async (req: Request, res: Response) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    try {
      const { business_url, email } = parsed.data;
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      const livePriceId = FULL_AUDIT_MASTER.tiers[0]?.stripePriceId;

      let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
      if (livePriceId) {
        lineItem = { price: livePriceId, quantity: 1 };
      } else {
        lineItem = {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: "Full Audit Master",
              description: "Five-audit combined PDF — local SEO, NAP, speed, trust, market size",
            },
            unit_amount: FULL_AUDIT_MASTER_PRICE_CENTS,
          },
        };
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [lineItem],
        customer_email: email,
        metadata: {
          product: "full_audit_master",
          business_url,
          email,
        },
        success_url: `${baseUrl}/tools/free-audit?checkout=success`,
        cancel_url: `${baseUrl}/tools/free-audit?checkout=cancelled`,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("checkout failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ─── GET /api/full-audit/result/:id ───────────────────────────── */
  // Public read by id+email pair (id alone is a UUID and acts as bearer).
  app.get("/api/full-audit/result/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) return res.status(400).json({ error: "Missing id" });

      const rows = await db
        .select()
        .from(fullAuditMasterOrders)
        .where(eq(fullAuditMasterOrders.id, id))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      const row = rows[0];

      // Don't leak full payload until completed.
      if (row.status !== "completed") {
        return res.json({
          order: {
            id: row.id,
            status: row.status,
            business_url: row.business_url,
            created_at: row.created_at,
          },
        });
      }
      res.json({
        order: {
          id: row.id,
          status: row.status,
          business_url: row.business_url,
          completed_at: row.completed_at,
          result_payload: row.result_payload,
          result_pdf_url: row.result_pdf_url,
        },
      });
    } catch (err: any) {
      log.error("get result failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load result" });
    }
  });
}
