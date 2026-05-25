/**
 * Full Audit Master — $9.80 paid audit checkout + delivery.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25): created the Stripe
 * checkout, DB row, and delivery email shell.
 *
 * Wave 3.6 (2026-05-25): wires the real 5-section pipeline routes:
 *
 *   POST  /api/full-audit/checkout                 — Stripe Checkout
 *   GET   /api/full-audit/result/:id               — JSON status + report
 *   POST  /api/full-audit/run                      — admin/dev re-run hook
 *   GET   /full-audit-report/:orderId/:shareToken  — public HTML report
 *
 * Checkout is unauth'd (free tools are public). Order rows persist in
 * `full_audit_master_orders`. The share-token in the public report URL
 * acts as the bearer — pairs with the UUID id so links are unguessable.
 */
import * as crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { fullAuditMasterOrders } from "@shared/schema";
import { FULL_AUDIT_MASTER } from "@shared/pricing";
import { createLogger } from "../lib/logger";
import {
  renderReportPage,
  renderPendingPage,
  renderFailedPage,
} from "../services/fullAuditMaster/reportRenderer";
import { runFullAuditMaster } from "../services/fullAuditMaster/pipeline";
import type { MasterAuditReport } from "../services/fullAuditMaster/types";

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

const runSchema = z.object({
  orderId: z.string().uuid(),
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
              description: "5-section automated audit — speed, mobile, SEO, accessibility, security",
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
        // Wave 3.6: drop the visitor on the Free Audit page with a marker
        // so the page can poll for an order matching this Stripe session.
        // The session-id query string is enough to find the order row
        // (we don't want to leak the share-token through Stripe's URL).
        success_url: `${baseUrl}/tools/free-audit?master_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/tools/free-audit?checkout=cancelled`,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("checkout failed", { error: err?.message });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  /* ─── GET /api/full-audit/result/:id ───────────────────────────── */
  // JSON status endpoint — used by the polling FreeAudit page after
  // Stripe success. The id alone is a UUID (bearer-ish). The full
  // report_payload is only returned once status === "completed".
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

      const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const shareUrl = row.report_share_token
        ? `${base}/full-audit-report/${row.id}/${row.report_share_token}`
        : null;

      // Don't leak the report payload until completed.
      if (row.status !== "completed") {
        return res.json({
          status: row.status,
          order: {
            id: row.id,
            status: row.status,
            business_url: row.business_url,
            created_at: row.created_at,
            error_message: row.status === "failed" ? row.error_message : undefined,
          },
        });
      }
      res.json({
        status: "completed",
        share_url: shareUrl,
        order: {
          id: row.id,
          status: row.status,
          business_url: row.business_url,
          completed_at: row.completed_at,
          report: row.result_payload,
        },
      });
    } catch (err: any) {
      log.error("get result failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load result" });
    }
  });

  /* ─── GET /api/full-audit/by-session/:sessionId ────────────────── */
  // Used by the marketing FreeAudit page after Stripe success redirects
  // back with ?master_session_id=cs_test_xxx. Returns the order status
  // and (when ready) the public share URL — the page polls this and
  // redirects to the share URL once status === "completed".
  app.get("/api/full-audit/by-session/:sessionId", async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId || "");
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

      const rows = await db
        .select()
        .from(fullAuditMasterOrders)
        .where(eq(fullAuditMasterOrders.stripe_session_id, sessionId))
        .limit(1);
      if (rows.length === 0) {
        // Webhook may not have fired yet — return a friendly pending
        // envelope rather than 404 so the client can keep polling.
        return res.json({ status: "pending", share_url: null });
      }
      const row = rows[0];
      const base = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const shareUrl = row.report_share_token
        ? `${base}/full-audit-report/${row.id}/${row.report_share_token}`
        : null;
      res.json({
        status: row.status,
        share_url: shareUrl,
        order_id: row.id,
        business_url: row.business_url,
      });
    } catch (err: any) {
      log.error("by-session lookup failed", { error: err?.message });
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  /* ─── POST /api/full-audit/run ─────────────────────────────────── */
  // Admin / test re-run hook. Validates the order id, kicks off the
  // pipeline synchronously, and returns the resulting report. Auth-gated
  // to ADMIN_API_KEY so it can be used from CLI / scripts without UI.
  app.post("/api/full-audit/run", async (req: Request, res: Response) => {
    const adminKey = process.env.ADMIN_API_KEY;
    const provided = req.header("x-admin-api-key") || "";
    if (!adminKey || provided !== adminKey) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    try {
      const rows = await db
        .select()
        .from(fullAuditMasterOrders)
        .where(eq(fullAuditMasterOrders.id, parsed.data.orderId))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
      const row = rows[0];

      await db.update(fullAuditMasterOrders)
        .set({ status: "running", started_at: new Date(), failed_at: null, error_message: null })
        .where(eq(fullAuditMasterOrders.id, row.id));

      const report = await runFullAuditMaster({
        orderId: row.id,
        websiteUrl: row.business_url,
        businessName: new URL(row.business_url.startsWith("http") ? row.business_url : `https://${row.business_url}`).hostname.replace(/^www\./, ""),
      });

      await db.update(fullAuditMasterOrders)
        .set({
          status: "completed",
          completed_at: new Date(),
          result_payload: report as any,
        })
        .where(eq(fullAuditMasterOrders.id, row.id));

      res.json({ ok: true, report });
    } catch (err: any) {
      log.error("manual run failed", { error: err?.message });
      res.status(500).json({ error: "Run failed", message: err?.message });
    }
  });

  /* ─── GET /full-audit-report/:orderId/:shareToken ──────────────── */
  // Public HTML page — no auth gate beyond the share-token match. Uses
  // a constant-time comparison to avoid leaking timing info on the token.
  app.get("/full-audit-report/:orderId/:shareToken", async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId || "");
      const providedToken = String(req.params.shareToken || "");
      if (!orderId || !providedToken) {
        return res.status(400).send("Missing parameters");
      }

      const rows = await db
        .select()
        .from(fullAuditMasterOrders)
        .where(eq(fullAuditMasterOrders.id, orderId))
        .limit(1);
      if (rows.length === 0) return res.status(404).send("Not found");
      const row = rows[0];

      // Timing-safe token comparison. Bail before timingSafeEqual if
      // the lengths differ (it throws on length mismatch).
      const expected = row.report_share_token || "";
      if (
        expected.length !== providedToken.length ||
        !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedToken))
      ) {
        return res.status(404).send("Not found");
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // X-Robots: don't index the share URL.
      res.setHeader("X-Robots-Tag", "noindex, nofollow");

      if (row.status === "completed" && row.result_payload) {
        return res.send(renderReportPage(row.result_payload as MasterAuditReport));
      }
      if (row.status === "failed") {
        return res.send(renderFailedPage(row.id, row.error_message));
      }
      // pending / running
      return res.send(renderPendingPage(row.id, row.business_url));
    } catch (err: any) {
      log.error("render share page failed", { error: err?.message });
      res.status(500).send("Failed to render report");
    }
  });
}
