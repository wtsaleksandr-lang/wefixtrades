/**
 * Portal QuoteQuick Conversion Funnel — Wave 29.
 *
 * GET /api/portal/quotequick/templates/:id/conversion?range=30d
 *
 * Returns the 4-stage funnel for a single QuoteQuick template:
 *   views  → starts  → completes  → depositPaid
 *
 * Stages are computed against the parent calculator. `views` comes from
 * calculators.total_views; the rest are derived from leads status enum.
 *
 * Industry benchmark for deposit-paid conversion = 5% (ResponsiBid
 * reference). Below 2% = "below avg", 2–5% = "industry avg", 5%+ = "above
 * average".
 *
 * Empty-state: if the template has zero views, return all-zero stages
 * AND benchmarkBelow = true so the UI can render a neutral empty card
 * instead of a fake-impressive funnel.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, calculators, leads } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuotequickConversionFunnel");

interface FunnelResponse {
  previewMode?: boolean;
  templateId: number;
  range: string;
  stages: {
    views: number;
    starts: number;
    completes: number;
    depositPaid: number;
  };
  conversionRate: number;
  industryBenchmark: number;
  performanceVsBenchmark: "below" | "at" | "above";
}

const INDUSTRY_BENCHMARK = 5; // %

const EMPTY_RESPONSE = {
  previewMode: true,
  templateId: 0,
  range: "30d",
  stages: { views: 0, starts: 0, completes: 0, depositPaid: 0 },
  conversionRate: 0,
  industryBenchmark: INDUSTRY_BENCHMARK,
  performanceVsBenchmark: "below" as "below" | "at" | "above",
} satisfies Record<string, unknown>;

function rangeToDays(range: string | undefined): number {
  const map: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    all: 365,
  };
  return map[range ?? "30d"] ?? 30;
}

export function registerPortalQuotequickConversionFunnelRoutes(app: Express) {
  app.get(
    "/api/portal/quotequick/templates/:id/conversion",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const templateId = Number(req.params.id);
        if (!Number.isFinite(templateId) || templateId <= 0) {
          return res.status(400).json({ error: "Invalid template id" });
        }

        const rangeStr = String(req.query.range ?? "30d");
        const days = rangeToDays(rangeStr);
        const since = new Date(Date.now() - days * 86_400_000);

        // Verify ownership: the calc must belong to this client's user_id.
        const [client] = await db
          .select({ user_id: clients.user_id })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        if (!client?.user_id) {
          return res.json({ ...EMPTY_RESPONSE, templateId, range: rangeStr });
        }

        const [calc] = await db
          .select({
            id: calculators.id,
            total_views: calculators.total_views,
          })
          .from(calculators)
          .where(
            and(
              eq(calculators.id, templateId),
              eq(calculators.user_id, client.user_id),
            ),
          )
          .limit(1);

        if (!calc) {
          return res.status(404).json({ error: "Template not found" });
        }

        const allLeads = await db
          .select({
            status: leads.status,
            created_date: leads.created_date,
          })
          .from(leads)
          .where(
            and(eq(leads.calculator_id, calc.id), gte(leads.created_date, since)),
          );

        const views = calc.total_views ?? 0;
        const starts = allLeads.length;
        const completes = allLeads.filter(
          (l) =>
            l.status === "completed" ||
            l.status === "deposit_paid" ||
            l.status === "won" ||
            l.status === "qualified",
        ).length;
        const depositPaid = allLeads.filter(
          (l) => l.status === "deposit_paid" || l.status === "won",
        ).length;

        const conversionRate =
          views > 0 ? Math.round((depositPaid / views) * 1000) / 10 : 0;

        let performanceVsBenchmark: FunnelResponse["performanceVsBenchmark"] =
          "below";
        if (conversionRate >= INDUSTRY_BENCHMARK) performanceVsBenchmark = "above";
        else if (conversionRate >= INDUSTRY_BENCHMARK * 0.5)
          performanceVsBenchmark = "at";

        const payload: FunnelResponse = {
          templateId,
          range: rangeStr,
          stages: { views, starts, completes, depositPaid },
          conversionRate,
          industryBenchmark: INDUSTRY_BENCHMARK,
          performanceVsBenchmark,
        };
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/quotequick/templates/:id/conversion]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
