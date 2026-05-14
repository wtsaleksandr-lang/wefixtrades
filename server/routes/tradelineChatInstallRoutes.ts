/**
 * Routes for the "Install my chat widget for me" service.
 *
 * Portal endpoints (requireClient):
 *   POST   /api/portal/tradeline/chat-widget/install/intent    — Starter:
 *           create Stripe Checkout. Pro: directly create form-ready row.
 *   GET    /api/portal/tradeline/chat-widget/install/:id       — fetch a
 *           specific install request (only own client's rows).
 *   POST   /api/portal/tradeline/chat-widget/install/:id/form  — submit
 *           the onboarding form (URL, platform, access, position, etc.).
 *
 * Admin endpoints (requireAdmin):
 *   GET    /api/admin/install-queue                — list (filterable by status)
 *   GET    /api/admin/install-queue/:id            — detail
 *   PATCH  /api/admin/install-queue/:id            — assign / change status / notes
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { clients, tradelineChatInstallRequests, INSTALL_REQUEST_STATUSES, WEBSITE_PLATFORMS, ACCESS_METHODS } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireClient, requireAdmin } from "../auth";
import { clientHasProAccess } from "../lib/clientProAccess";
import { createLogger } from "../lib/logger";

const log = createLogger("ChatInstall");

async function clientIdFromUser(req: Request, res: Response): Promise<number | null> {
  const [row] = await db.select({ id: clients.id }).from(clients).where(eq(clients.user_id, req.user!.id)).limit(1);
  if (!row) {
    res.status(403).json({ error: "No client record linked", code: "no_client_linked" });
    return null;
  }
  return row.id;
}

const STRIPE_PRICE_ENV = "STRIPE_CHAT_INSTALL_PRICE_ID";
const APP_URL = () => process.env.APP_URL || "https://wefixtrades.com";

export function registerTradelineChatInstallRoutes(app: Express) {
  /* ─── Portal: create intent (Stripe for Starter, direct for Pro) ─── */
  app.post(
    "/api/portal/tradeline/chat-widget/install/intent",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await clientIdFromUser(req, res);
        if (!clientId) return;

        const isPro = await clientHasProAccess(clientId);

        if (isPro) {
          // Pro path: skip Stripe, create form-ready row directly
          const [row] = await db
            .insert(tradelineChatInstallRequests)
            .values({
              client_id: clientId,
              status: "awaiting_form",
              is_pro_at_request: 1,
            })
            .returning();
          return res.json({
            ok: true,
            requestId: row.id,
            path: "pro_direct",
            redirectTo: `/portal/tradeline/chat-widget/install-onboarding?id=${row.id}`,
          });
        }

        // Starter path: create Stripe Checkout session
        const priceId = process.env[STRIPE_PRICE_ENV];
        if (!priceId) {
          log.warn(`${STRIPE_PRICE_ENV} not configured — fallback path`);
          // Fallback: create the request anyway in awaiting_payment, expose a
          // manual "contact us" message in the UI until Alex configures Stripe.
          const [row] = await db
            .insert(tradelineChatInstallRequests)
            .values({ client_id: clientId, status: "awaiting_payment" })
            .returning();
          return res.json({
            ok: true,
            requestId: row.id,
            path: "stripe_not_configured",
            message: "Stripe checkout for the $79 install service isn't yet configured. We'll reach out manually to arrange payment.",
          });
        }

        const Stripe = (await import("stripe")).default;
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
          log.error("STRIPE_SECRET_KEY missing");
          return res.status(503).json({ error: "Stripe is temporarily unavailable" });
        }
        const stripe = new Stripe(stripeKey);

        const [row] = await db
          .insert(tradelineChatInstallRequests)
          .values({ client_id: clientId, status: "awaiting_payment" })
          .returning();

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: {
            install_request_id: String(row.id),
            client_id: String(clientId),
            kind: "tradeline_chat_install",
          },
          success_url: `${APP_URL()}/portal/tradeline/chat-widget/install-onboarding?id=${row.id}&paid=1`,
          cancel_url: `${APP_URL()}/portal/tradeline/chat-widget/install?cancelled=1`,
        });

        await db
          .update(tradelineChatInstallRequests)
          .set({ stripe_session_id: session.id, updated_at: new Date() })
          .where(eq(tradelineChatInstallRequests.id, row.id));

        return res.json({ ok: true, requestId: row.id, path: "stripe_checkout", checkoutUrl: session.url });
      } catch (err: any) {
        log.error("intent failed", { err: err?.message });
        return res.status(500).json({ error: "Failed to start install request" });
      }
    },
  );

  /* ─── Portal: get install request ─── */
  app.get(
    "/api/portal/tradeline/chat-widget/install/:id",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await clientIdFromUser(req, res);
        if (!clientId) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
        const [row] = await db
          .select()
          .from(tradelineChatInstallRequests)
          .where(and(eq(tradelineChatInstallRequests.id, id), eq(tradelineChatInstallRequests.client_id, clientId)))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });
        return res.json(row);
      } catch (err: any) {
        log.error("get failed", { err: err?.message });
        return res.status(500).json({ error: "Failed to load install request" });
      }
    },
  );

  /* ─── Portal: submit onboarding form ─── */
  const formBody = z.object({
    website_url: z.string().url().max(500),
    website_platform: z.enum(WEBSITE_PLATFORMS),
    access_method: z.enum(ACCESS_METHODS),
    access_credentials_encrypted: z.string().max(5000).optional(),
    widget_position: z.enum(["bottom-right", "bottom-left", "floating"]),
    greeting_message: z.string().max(500).optional(),
    excluded_pages: z.array(z.string().max(500)).max(20).optional(),
    customer_notes: z.string().max(2000).optional(),
  });
  app.post(
    "/api/portal/tradeline/chat-widget/install/:id/form",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await clientIdFromUser(req, res);
        if (!clientId) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

        const [row] = await db
          .select()
          .from(tradelineChatInstallRequests)
          .where(and(eq(tradelineChatInstallRequests.id, id), eq(tradelineChatInstallRequests.client_id, clientId)))
          .limit(1);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (row.status === "completed" || row.status === "cancelled") {
          return res.status(409).json({ error: `Request is ${row.status} — can't edit form` });
        }

        const parsed = formBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const [updated] = await db
          .update(tradelineChatInstallRequests)
          .set({
            ...parsed.data,
            status: "form_submitted",
            form_submitted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(tradelineChatInstallRequests.id, id))
          .returning();
        return res.json(updated);
      } catch (err: any) {
        log.error("form failed", { err: err?.message });
        return res.status(500).json({ error: "Failed to save form" });
      }
    },
  );

  /* ─── Admin: queue list ─── */
  app.get("/api/admin/install-queue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
      const where = statusFilter ? eq(tradelineChatInstallRequests.status, statusFilter) : undefined;
      const rows = await db
        .select({
          request: tradelineChatInstallRequests,
          client: { id: clients.id, business_name: clients.business_name, contact_email: clients.contact_email },
        })
        .from(tradelineChatInstallRequests)
        .leftJoin(clients, eq(tradelineChatInstallRequests.client_id, clients.id))
        .where(where)
        .orderBy(desc(tradelineChatInstallRequests.created_at))
        .limit(200);
      return res.json({ rows });
    } catch (err: any) {
      log.error("admin list failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load queue" });
    }
  });

  /* ─── Admin: detail ─── */
  app.get("/api/admin/install-queue/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
      const [row] = await db
        .select({
          request: tradelineChatInstallRequests,
          client: { id: clients.id, business_name: clients.business_name, contact_email: clients.contact_email, contact_phone: clients.contact_phone },
        })
        .from(tradelineChatInstallRequests)
        .leftJoin(clients, eq(tradelineChatInstallRequests.client_id, clients.id))
        .where(eq(tradelineChatInstallRequests.id, id))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch (err: any) {
      log.error("admin detail failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load request" });
    }
  });

  /* ─── Admin: assign + status update ─── */
  const adminPatchBody = z.object({
    status: z.enum(INSTALL_REQUEST_STATUSES).optional(),
    assigned_to: z.number().int().nullable().optional(),
    admin_notes: z.string().max(5000).optional(),
  });
  app.patch("/api/admin/install-queue/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
      const parsed = adminPatchBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const set: any = { ...parsed.data, updated_at: new Date() };
      if (parsed.data.status === "in_progress") set.started_at = new Date();
      if (parsed.data.status === "completed") set.completed_at = new Date();

      const [updated] = await db
        .update(tradelineChatInstallRequests)
        .set(set)
        .where(eq(tradelineChatInstallRequests.id, id))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      log.error("admin patch failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to update request" });
    }
  });
}
