/**
 * Portal QuoteQuick routes.
 *
 * Mounted under /api/portal/quotequick/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the first step of the portal
 * sub-registrar refactor (PR #711 plan). Pure code move — zero behaviour
 * change. The parent registrar (registerPortalRoutes) invokes
 * registerPortalQuotequickRoutes(app) so the wiring in routes/index.ts
 * is unchanged.
 *
 * Endpoints
 *   GET /api/portal/quotequick/summary
 *   GET /api/portal/quotequick/:calcId/leads
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { db } from "../../db";
import { clients, calculators, leads, deploymentStatus } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuoteQuick");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

export function registerPortalQuotequickRoutes(app: Express) {
  /**
   * GET /api/portal/quotequick/summary
   * Returns QuoteQuick calculator summary for the authenticated client.
   * Links via clients.user_id → calculators.user_id.
   */
  app.get("/api/portal/quotequick/summary", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { calculator: null });
      if (!clientId) return;

      // Get client's user_id
      const [client] = await db.select({ user_id: clients.user_id }).from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client?.user_id) return res.json({ calculator: null });

      // Find calculators owned by this user
      const calcs = await db
        .select()
        .from(calculators)
        .where(eq(calculators.user_id, client.user_id))
        .orderBy(desc(calculators.id))
        .limit(1);

      if (calcs.length === 0) return res.json({ calculator: null });

      const calc = calcs[0];

      // Get deployment status
      const [deploy] = await db
        .select({ status: deploymentStatus.status })
        .from(deploymentStatus)
        .where(eq(deploymentStatus.calculator_id, calc.id))
        .limit(1);

      // Get lead count
      const [leadCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.calculator_id, calc.id));

      const tokenExpired = new Date() > new Date(calc.token_expires_at);

      res.json({
        calculator: {
          id: calc.id,
          business_name: calc.business_name,
          trade_type: calc.trade_type,
          slug: calc.slug,
          plan_tier: calc.plan_tier ?? "free",
          total_views: calc.total_views ?? 0,
          total_leads: leadCount?.count ?? 0,
          status: deploy?.status ?? "draft",
          calculator_url: `/calculator?slug=${calc.slug}`,
          edit_url: tokenExpired ? null : `/EditCalculator?token=${calc.edit_token}`,
          preview_url: tokenExpired ? null : `/calculator?slug=${calc.slug}&preview=${calc.edit_token}`,
          edit_token_expired: tokenExpired,
          created_at: calc.created_at,
        },
      });
    } catch (err) {
      log.error("Portal QuoteQuick summary error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load QuoteQuick summary" });
    }
  });

  /**
   * GET /api/portal/quotequick/:calcId/leads
   * Returns the last 20 leads for a QuoteQuick calculator owned by the
   * authenticated client. Validates that the calculator belongs to the client.
   */
  app.get("/api/portal/quotequick/:calcId/leads", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const calcId = parseInt(String(req.params.calcId));
      if (!calcId || isNaN(calcId)) return res.status(400).json({ error: "Invalid calculator ID" });

      // Verify the calculator belongs to this client
      const [client] = await db.select({ user_id: clients.user_id }).from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client?.user_id) return res.status(403).json({ error: "No user linked" });

      const [calc] = await db
        .select({ id: calculators.id, user_id: calculators.user_id })
        .from(calculators)
        .where(and(eq(calculators.id, calcId), eq(calculators.user_id, client.user_id)))
        .limit(1);

      if (!calc) return res.status(404).json({ error: "Calculator not found or not owned by you" });

      // Fetch last 20 leads
      const recentLeads = await db
        .select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          phone: leads.phone,
          quote_amount: leads.quote_amount,
          status: leads.status,
          created_date: leads.created_date,
          utm_source: leads.utm_source,
        })
        .from(leads)
        .where(eq(leads.calculator_id, calcId))
        .orderBy(desc(leads.created_date))
        .limit(20);

      res.json({ leads: recentLeads });
    } catch (err) {
      log.error("Portal QuoteQuick leads error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load leads" });
    }
  });
}
