/**
 * Wave W-BA-2 (Phase 3b §5) — admin endpoints for the per-client variable-cost
 * ledger that backs the client-detail "Cost & Profit" panel.
 *
 *   GET   /api/admin/clients/:clientId/variable-costs    — current month + lifetime
 *   GET   /api/admin/clients/:clientId/cost-history      — monthly time-series (default 6m)
 *   PATCH /api/admin/clients/:clientId/budget            — set default_budget_cents
 *
 * Separate file from adminCrmRoutes.ts to keep the cost ledger surface
 * easy to audit (it shipped in one PR) and to follow the per-feature naming
 * convention used by `adminAiBudgetRoutes.ts`. All routes are requireAdmin
 * and the PATCH is audit-logged.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import {
  getClientVariableCosts,
  getClientCostHistory,
  setClientBudget,
  DEFAULT_CLIENT_BUDGET_CENTS,
} from "../services/clientVariableCosts";
import { SOFT_CAP_DELTA_CENTS } from "../services/aiBudgetRouter";

const log = createLogger("AdminClientCosts");

const MAX_HISTORY_MONTHS = 24;
const MIN_BUDGET_CENTS = 0;
const MAX_BUDGET_CENTS = 100_00 * 100; // $100,000 ceiling — sanity bound

export function registerAdminClientCostsRoutes(app: Express): void {
  app.get(
    "/api/admin/clients/:clientId/variable-costs",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const clientId = Number(req.params.clientId);
        if (!Number.isFinite(clientId)) {
          return res.status(400).json({ error: "invalid_client_id" });
        }
        const row = await getClientVariableCosts(clientId);
        if (!row) {
          return res.json({
            client_id: clientId,
            current_month: null,
            ai_cost_cents_month: 0,
            ai_cost_cents_lifetime: 0,
            sms_cost_cents_month: 0,
            sms_cost_cents_lifetime: 0,
            voice_cost_cents_month: 0,
            voice_cost_cents_lifetime: 0,
            revenue_cents_month: 0,
            revenue_cents_lifetime: 0,
            profit_cents_month: 0,
            profit_cents_lifetime: 0,
            default_budget_cents: DEFAULT_CLIENT_BUDGET_CENTS,
            soft_cap_delta_cents: SOFT_CAP_DELTA_CENTS,
          });
        }
        res.json({ ...row, soft_cap_delta_cents: SOFT_CAP_DELTA_CENTS });
      } catch (err: any) {
        log.error("variable-costs GET failed", { error: err?.message });
        res.status(500).json({ error: "variable_costs_load_failed" });
      }
    },
  );

  app.get(
    "/api/admin/clients/:clientId/cost-history",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const clientId = Number(req.params.clientId);
        if (!Number.isFinite(clientId)) {
          return res.status(400).json({ error: "invalid_client_id" });
        }
        const monthsRaw = Number(req.query.months ?? 6);
        const months = Math.min(MAX_HISTORY_MONTHS, Math.max(1, Math.round(monthsRaw)));
        const history = await getClientCostHistory(clientId, months);
        res.json({ client_id: clientId, months, history });
      } catch (err: any) {
        log.error("cost-history GET failed", { error: err?.message });
        res.status(500).json({ error: "cost_history_load_failed" });
      }
    },
  );

  app.patch(
    "/api/admin/clients/:clientId/budget",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const clientId = Number(req.params.clientId);
        if (!Number.isFinite(clientId)) {
          return res.status(400).json({ error: "invalid_client_id" });
        }
        const cents = Number(req.body?.default_budget_cents);
        if (
          !Number.isFinite(cents) ||
          cents < MIN_BUDGET_CENTS ||
          cents > MAX_BUDGET_CENTS
        ) {
          return res.status(400).json({ error: "invalid_budget_cents" });
        }
        const row = await setClientBudget(clientId, Math.round(cents));
        if (!row) return res.status(500).json({ error: "budget_update_failed" });

        const u = req.user as any;
        await storage
          .logAdminActivity({
            actor_type: "human",
            actor_id: u?.id,
            actor_name: u?.name || u?.email,
            action: "client.budget_updated",
            entity_type: "client",
            entity_id: clientId,
            summary: `Set per-client AI budget to $${(cents / 100).toFixed(2)}/mo`,
            metadata: { default_budget_cents: Math.round(cents) },
          })
          .catch((err: any) =>
            log.warn("audit write failed", { error: err?.message }),
          );

        res.json({ ...row, soft_cap_delta_cents: SOFT_CAP_DELTA_CENTS });
      } catch (err: any) {
        log.error("budget PATCH failed", { error: err?.message });
        res.status(500).json({ error: "budget_update_failed" });
      }
    },
  );
}
