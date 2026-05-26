/**
 * Portal AdFlow Anomalies — Wave 30.
 *
 * GET /api/portal/adflow/anomalies
 *
 * Returns the plain-language anomaly events feed for the AnomalyBanner
 * dashboard surface. Plain-language is the key contract — no PMAX / CPA /
 * ROAS labels, no "122% baseline deviation" jargon.
 *
 * Anomalies are computed JIT from the most recent two adflow_reports:
 *   - costSpike  → spend up >40% vs prior period
 *   - bookingsDrop → bookings down >30%
 *   - winners    → creative carrying disproportionate share of bookings
 *
 *   { anomalies: [{
 *       id, severity: "info"|"amber"|"red",
 *       headline (plain language),
 *       detail (1-2 sentences, plain language),
 *       suggestedAction: "investigate"|"approve-pause"|"approve-boost"|"dismiss",
 *       actionId (whitelist-safe id for /run-action)
 *     }] }
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, adflowReports } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowAnomalies");

export type AnomalySeverity = "info" | "amber" | "red";
export type AnomalyAction = "investigate" | "approve-pause" | "approve-boost" | "dismiss";

interface Anomaly {
  id: string;
  severity: AnomalySeverity;
  headline: string;
  detail: string;
  suggestedAction: AnomalyAction;
  actionId: string;
  campaignName?: string;
}

interface AnomaliesResponse {
  previewMode?: boolean;
  anomalies: Anomaly[];
}

const EMPTY_RESPONSE = {
  previewMode: true,
  anomalies: [] as Anomaly[],
} satisfies Record<string, unknown>;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function computeAdflowAnomalies(
  clientId: number,
): Promise<Anomaly[]> {
  const [svc] = await db
    .select({ cs_id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'adflow%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);

  if (!svc?.cs_id) return [];

  const recent = await db
    .select({
      id: adflowReports.id,
      metrics: adflowReports.metrics,
      period_label: adflowReports.period_label,
    })
    .from(adflowReports)
    .where(eq(adflowReports.client_service_id, svc.cs_id))
    .orderBy(desc(adflowReports.period_end))
    .limit(2);

  if (recent.length === 0) return [];

  const anomalies: Anomaly[] = [];
  const curr = (recent[0]?.metrics ?? {}) as Record<string, unknown>;
  const prev = (recent[1]?.metrics ?? {}) as Record<string, unknown>;

  const currSpend = num(curr.cost_spent_cents);
  const prevSpend = num(prev.cost_spent_cents);
  const currBookings = num(curr.leads_generated);
  const prevBookings = num(prev.leads_generated);

  if (prevSpend > 0 && currSpend > prevSpend * 1.4) {
    const diffDollars = Math.round((currSpend - prevSpend) / 100);
    anomalies.push({
      id: `cost-spike-${recent[0]!.id}`,
      severity: "amber",
      headline: `Ad spend jumped $${diffDollars} this period`,
      detail: `Your spend went from $${Math.round(prevSpend / 100)} to $${Math.round(currSpend / 100)}. Worth a quick look to make sure it's earning extra bookings.`,
      suggestedAction: "investigate",
      actionId: `cost-spike-${recent[0]!.id}`,
    });
  }

  if (prevBookings > 0 && currBookings < prevBookings * 0.7) {
    const diff = prevBookings - currBookings;
    anomalies.push({
      id: `bookings-drop-${recent[0]!.id}`,
      severity: "red",
      headline: `${diff} fewer bookings than last period`,
      detail: `Last period brought ${prevBookings} bookings. This period brought ${currBookings}. Same ads, less engagement — could be a creative refresh moment.`,
      suggestedAction: "approve-pause",
      actionId: `bookings-drop-${recent[0]!.id}`,
    });
  }

  // Winner — identify a creative with high efficiency to suggest boosting.
  const creatives = (curr.creatives ?? []) as Array<{
    name?: string;
    spend_cents?: number;
    leads?: number;
  }>;
  if (Array.isArray(creatives) && creatives.length > 1) {
    const eff = creatives
      .map((c) => ({
        name: c.name ?? "Campaign",
        cpb:
          num(c.leads) > 0 ? num(c.spend_cents) / num(c.leads) : Number.POSITIVE_INFINITY,
        leads: num(c.leads),
        spend: num(c.spend_cents),
      }))
      .filter((c) => c.leads > 0);
    if (eff.length > 1) {
      eff.sort((a, b) => a.cpb - b.cpb);
      const winner = eff[0]!;
      const avg = eff.reduce((s, c) => s + c.cpb, 0) / eff.length;
      if (winner.cpb < avg * 0.7) {
        anomalies.push({
          id: `winner-${winner.name.replace(/\s+/g, "-").toLowerCase()}-${recent[0]!.id}`,
          severity: "info",
          headline: `"${winner.name}" is winning — costs less per booking`,
          detail: `It's bringing in bookings at $${Math.round(winner.cpb / 100)} each, well below the rest. Worth shifting more budget here?`,
          suggestedAction: "approve-boost",
          actionId: `winner-${winner.name.replace(/\s+/g, "-").toLowerCase()}-${recent[0]!.id}`,
          campaignName: winner.name,
        });
      }
    }
  }

  return anomalies;
}

export function registerPortalAdflowAnomaliesRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/anomalies",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;
        const anomalies = await computeAdflowAnomalies(clientId);
        res.json({ anomalies });
      } catch (err: any) {
        log.error("[portal/adflow/anomalies]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
