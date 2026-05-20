/**
 * Wave K — admin endpoints for /admin/crm/ai-budget.
 *
 *   GET    /api/admin/crm/ai-budget        — config (global + per tier) + top spenders.
 *   PUT    /api/admin/crm/ai-budget/:scope — upsert one scope's config row.
 *
 * All routes are requireAdmin. Every PUT writes a row into ai_budget_audit_log.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import {
  readAllBudgetConfigs,
  upsertBudgetConfig,
  getTopSpendersThisMonth,
} from "../services/quotequickAiBudget";
import {
  aiBudgetConfigValuesSchema,
  AI_BUDGET_SCOPES,
  DEFAULT_AI_BUDGET_CONFIG,
  type AiBudgetScope,
} from "@shared/schema";

const log = createLogger("AdminAiBudget");

export function registerAdminAiBudgetRoutes(app: Express): void {
  app.get("/api/admin/crm/ai-budget", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [configs, topSpenders] = await Promise.all([
        readAllBudgetConfigs(),
        getTopSpendersThisMonth(20),
      ]);

      // Always surface a "global" row, falling back to the spec defaults if
      // someone deleted it in the DB.
      const global = configs.global ?? { ...DEFAULT_AI_BUDGET_CONFIG };

      const tiers: Record<string, ReturnType<typeof Object>> = {};
      for (const scope of AI_BUDGET_SCOPES) {
        if (scope === "global") continue;
        tiers[scope] = configs[scope] ?? null;
      }

      res.json({
        global,
        tiers,
        top_spenders: topSpenders,
        scopes: AI_BUDGET_SCOPES,
      });
    } catch (err: any) {
      log.error("ai-budget GET failed", { error: err?.message });
      res.status(500).json({ error: "ai_budget_load_failed" });
    }
  });

  app.put("/api/admin/crm/ai-budget/:scope", requireAdmin, async (req: Request, res: Response) => {
    const scopeRaw = String(req.params.scope ?? "");
    if (!AI_BUDGET_SCOPES.includes(scopeRaw as AiBudgetScope)) {
      return res.status(400).json({ error: "invalid_scope", scope: scopeRaw });
    }
    const scope = scopeRaw as AiBudgetScope;

    const parsed = aiBudgetConfigValuesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_values", details: parsed.error.format() });
    }

    try {
      const adminId = (req.user as Express.User).id;
      await upsertBudgetConfig(scope, parsed.data, adminId);
      res.json({ ok: true, scope, values: parsed.data });
    } catch (err: any) {
      log.error("ai-budget PUT failed", { error: err?.message, scope });
      res.status(500).json({ error: "ai_budget_save_failed" });
    }
  });
}
