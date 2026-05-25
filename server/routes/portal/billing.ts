/**
 * Portal Billing routes.
 *
 * Mounted under /api/portal/billing/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PR #713 established the pattern with quotequick.ts,
 * PR #718 extended it with reputation.ts). Pure code move — zero behaviour
 * change. The parent registrar (registerPortalRoutes) invokes
 * registerPortalBillingRoutes(app) so the wiring in routes/index.ts is
 * unchanged.
 *
 * Endpoints
 *   GET   /api/portal/billing
 *   POST  /api/portal/billing/send-link
 *   POST  /api/portal/billing/portal-session
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { requireClient } from "../../auth";
import { db } from "../../db";
import {
  clients,
  clientServices,
  clientPayments,
  serviceCatalog,
} from "@shared/schema";
import { sendBillingPortalLinkEmail } from "../../lib/billingPortalEmail";
import { buildBillingPortalUrl } from "../../lib/billingPortalToken";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalBilling");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403.
 *
 * Admin viewing the portal directly (not impersonating a customer) has no
 * `clients` row of their own, so without this branch every GET 403'd — and
 * on billing the resulting error crashed the page (full error boundary trip).
 * We now return null cleanly on read paths so the caller can render an empty
 * shape; write paths pass `adminFallback: 'forbid'` to keep the explicit 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  opts: { adminFallback?: 'empty' | 'forbid' } = {},
): Promise<number | null> {
  if (req.user!.role === 'admin' && !req.adminImpersonating) {
    if (opts.adminFallback === 'forbid') {
      res.status(403).json({ error: "Admin must impersonate a customer for this action", code: "admin_no_impersonation" });
      return null;
    }
    return null; // caller returns empty data
  }
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalBillingRoutes(app: Express) {
  /**
   * GET /api/portal/billing
   * All payments/invoices for the authenticated client.
   */
  app.get("/api/portal/billing", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) {
        // Admin previewing the portal directly: return the full BillingData
        // shape (200) so PortalBilling.tsx renders its empty state instead
        // of throwing on data.summary / data.payments access.
        if (req.user!.role === 'admin') {
          return res.json({
            payments: [],
            summary: {
              total_paid_cents: 0,
              total_pending_cents: 0,
              next_due_at: null,
              next_due_amount_cents: null,
            },
          });
        }
        return;
      }

      // All payments with service name
      const payments = await db
        .select({
          id: clientPayments.id,
          type: clientPayments.type,
          amount_cents: clientPayments.amount_cents,
          status: clientPayments.status,
          description: clientPayments.description,
          service_name: serviceCatalog.name,
          period_start: clientPayments.period_start,
          period_end: clientPayments.period_end,
          due_at: clientPayments.due_at,
          paid_at: clientPayments.paid_at,
          created_at: clientPayments.created_at,
        })
        .from(clientPayments)
        .leftJoin(clientServices, eq(clientPayments.client_service_id, clientServices.id))
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(eq(clientPayments.client_id, clientId))
        .orderBy(desc(clientPayments.created_at));

      // Summary aggregates
      const [summary] = await db
        .select({
          total_paid: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'paid' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
          total_pending: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'pending' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
        })
        .from(clientPayments)
        .where(eq(clientPayments.client_id, clientId));

      // Next due payment
      const [nextDue] = await db
        .select({
          due_at: clientPayments.due_at,
          amount_cents: clientPayments.amount_cents,
        })
        .from(clientPayments)
        .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending")))
        .orderBy(clientPayments.due_at)
        .limit(1);

      res.json({
        payments,
        summary: {
          total_paid_cents: summary?.total_paid ?? 0,
          total_pending_cents: summary?.total_pending ?? 0,
          next_due_at: nextDue?.due_at ?? null,
          next_due_amount_cents: nextDue?.amount_cents ?? null,
        },
      });
    } catch (err) {
      log.error("Portal billing error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load billing" });
    }
  });

  /**
   * POST /api/portal/billing/send-link
   * Generate a billing portal URL and email it to the authenticated client.
   */
  app.post("/api/portal/billing/send-link", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { adminFallback: 'forbid' });
      if (!clientId) return;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });
      if (!client.contact_email) return res.status(400).json({ error: "No email address on file" });
      if (!client.stripe_customer_id) return res.status(400).json({ error: "No billing account linked" });

      const portalUrl = buildBillingPortalUrl({ stripeCustomerId: client.stripe_customer_id });
      const sent = await sendBillingPortalLinkEmail(client.contact_email, { businessName: client.business_name, portalUrl });

      if (!sent) return res.status(500).json({ error: "Failed to send billing portal email" });
      res.json({ success: true, message: "Billing portal link sent to your email" });
    } catch (err) {
      log.error("Portal billing send-link error:", { error: String(err) });
      res.status(500).json({ error: "Failed to send billing link" });
    }
  });

  /**
   * POST /api/portal/billing/portal-session
   * Create a Stripe billing portal session and return the URL directly.
   * Client opens this in a new tab to manage payment methods, invoices, cancel, etc.
   */
  app.post("/api/portal/billing/portal-session", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { adminFallback: 'forbid' });
      if (!clientId) return;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });
      if (!client.stripe_customer_id) {
        return res.status(400).json({ error: "No billing account linked to your account" });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return res.status(503).json({ error: "Billing is not configured" });
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-01-27.acacia" as any });
      const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

      const session = await stripe.billingPortal.sessions.create({
        customer: client.stripe_customer_id,
        return_url: `${baseUrl}/portal/billing`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      log.error("Portal billing portal-session error:", { error: String(err) });
      res.status(500).json({ error: "Failed to create billing portal session" });
    }
  });
}
