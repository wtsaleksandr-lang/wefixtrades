/**
 * Admin health aggregator — Wave 140.
 *
 *   GET /api/admin/health  (requireAdmin)
 *     → { overall, products: ProductHealth[], tools: ToolHealth[], generatedAt }
 *
 * Runs every product probe + the tools probe in parallel, each wrapped so one
 * probe failure degrades that product to "down" rather than crashing the
 * aggregate. Result is cached in-memory ~60s so repeated dashboard loads don't
 * hammer the probes (mirrors healthz's in-process cache pattern).
 *
 * Wave 140 is monitoring-only: no UI, no auto-resolution, no SMS/WhatsApp, no
 * systemAlerts writes, no cron. Those land in Waves 141–144.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import {
  allProductIds,
  runProductProbe,
  runToolsProbe,
  runAiProvidersProbe,
  reduceStatus,
  type ProductHealth,
  type ToolHealth,
  type ProductStatus,
} from "../services/health/productHealthRegistry";

const log = createLogger("AdminHealth");

const CACHE_TTL_MS = 60_000;

interface HealthAggregate {
  overall: ProductStatus;
  products: ProductHealth[];
  tools: ToolHealth[];
  generatedAt: string;
}

let cached: { at: number; body: HealthAggregate } | null = null;

/**
 * Wrap a product probe so a thrown probe becomes a "down" ProductHealth rather
 * than rejecting the whole Promise.all.
 */
async function safeProductProbe(productId: string): Promise<ProductHealth> {
  try {
    return await runProductProbe(productId);
  } catch (err) {
    return {
      productId,
      status: "down",
      checks: [
        {
          name: "probe_error",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          critical: true,
        },
      ],
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

/** Wrap the tools probe the same way. */
async function safeToolsProbe(): Promise<ToolHealth> {
  try {
    return await runToolsProbe();
  } catch (err) {
    return {
      toolId: "free_tools",
      status: "down",
      checks: [
        {
          name: "probe_error",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          critical: true,
        },
      ],
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

/** Wrap the AI-providers probe the same way. */
async function safeAiProvidersProbe(): Promise<ToolHealth> {
  try {
    return await runAiProvidersProbe();
  } catch (err) {
    return {
      toolId: "ai_providers",
      status: "down",
      checks: [
        {
          name: "probe_error",
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
          critical: true,
        },
      ],
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

/** Worst status across every product + tool. */
function overallStatus(products: ProductHealth[], tools: ToolHealth[]): ProductStatus {
  // Reuse reduceStatus by mapping each product/tool status into a synthetic
  // check (ok = status==="ok"; critical = status==="down").
  const synthetic = [...products, ...tools].map((h) => ({
    name: h.status === "down" ? "down" : h.status === "degraded" ? "degraded" : "ok",
    ok: h.status === "ok",
    detail: h.status,
    critical: h.status === "down",
  }));
  return reduceStatus(synthetic);
}

async function buildAggregate(): Promise<HealthAggregate> {
  const ids = allProductIds();
  const [products, freeTools, aiProviders] = await Promise.all([
    Promise.all(ids.map((id) => safeProductProbe(id))),
    safeToolsProbe(),
    safeAiProvidersProbe(),
  ]);
  const tools = [freeTools, aiProviders];
  return {
    overall: overallStatus(products, tools),
    products,
    tools,
    generatedAt: new Date().toISOString(),
  };
}

export function registerAdminHealthRoutes(app: Express): void {
  app.get("/api/admin/health", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (cached && now - cached.at < CACHE_TTL_MS) {
        res.json(cached.body);
        return;
      }
      const body = await buildAggregate();
      cached = { at: now, body };
      res.json(body);
    } catch (err) {
      log.error("admin health aggregate failed", { error: String(err) });
      res.status(500).json({ error: "Failed to gather product health" });
    }
  });
}
