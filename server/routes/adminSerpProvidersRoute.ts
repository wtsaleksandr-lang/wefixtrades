/**
 * Admin SERP providers diagnostic endpoint (Wave 6.5).
 *
 * GET /api/admin/serp-providers
 *   → { ok, providers: [{ name, available, supportedEngines, monthlyCount,
 *                          monthlyLimit, remaining, lastUsedAt?, lastError? }] }
 *
 * Reports which providers in the multi-provider SERP orchestrator are
 * configured (env vars present), their persisted monthly counter, and
 * the last call timestamp / last error message per provider. Useful for
 * ops to confirm fall-through behavior and watch quota burn-down.
 *
 * Admin-only — never exposes provider key values, only presence + state.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { getProviderDiagnostics } from "../lib/serpOrchestrator";

const log = createLogger("AdminSerpProviders");

export function registerAdminSerpProvidersRoute(app: Express): void {
  app.get("/api/admin/serp-providers", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const providers = await getProviderDiagnostics();
      res.json({
        ok: true,
        checked_at: new Date().toISOString(),
        providers,
      });
    } catch (err: any) {
      log.error("[serp-providers] GET error", { error: err?.message ?? String(err) });
      res.status(500).json({ ok: false, error: "Failed to read SERP provider diagnostics" });
    }
  });
}
