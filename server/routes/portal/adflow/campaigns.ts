/**
 * Portal AdFlow Campaigns.
 *
 * GET /api/portal/adflow/campaigns
 *
 * HONESTY CONTRACT (guarded by server/services/aiActions/handlers/adflow.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────
 * There is no ad-platform integration. Every field below is a figure the ads
 * team reported to us and an ops admin typed into the CRM, passed through
 * unchanged. The only computed value is cost-per-lead, which is spend ÷ leads
 * — both reported.
 *
 * DELETED, and must not come back (see the guard):
 *
 *   - detectPlatform(): guessed "google" / "meta" / "bing" by substring-matching
 *     the campaign NAME ("pmax", "fb", "search"…). A campaign called "Spring
 *     Search Blitz" running on Meta was labelled Google on the customer's
 *     dashboard. Platform now comes only from an explicit `platform` field the
 *     ads team supplies; anything else is "unspecified".
 *
 *   - scoreFromLtvTrend(): returned a hardcoded 50, or 65 above an arbitrary
 *     volume threshold. It carried 20% of the letter grade and rendered in the
 *     "Why this score?" panel as "Customer lifetime trend 50/100" — a number
 *     about a customer's lifetime value that was never measured.
 *
 *   - the A–F grade itself, and INDUSTRY_AVG_CPB_CENTS = 15_000. Half the grade
 *     was the campaign's cost-per-booking scored against that constant, and the
 *     card told the customer in plain words "industry average is $150". We have
 *     no such benchmark — it was invented. With the constant gone and the LTV
 *     factor gone there is nothing left to grade with, so the grade is gone too
 *     rather than restated on a thinner invention.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, adflowReports } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowCampaigns");

export type CampaignPlatform = "google" | "meta" | "bing" | "unspecified";
export type CampaignStatus = "active" | "paused" | "draft" | "unspecified";

interface CampaignStats {
  /** All reported. Null means the ads team didn't report it this period. */
  adSpendCents: number | null;
  leads: number | null;
  impressions: number | null;
  costPerLeadCents: number | null;
}

interface Campaign {
  id: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignStatus;
  /** Period the reported figures cover, e.g. "April 2026". */
  periodLabel: string | null;
  stats: CampaignStats;
}

interface CampaignsResponse {
  previewMode?: boolean;
  campaigns: Campaign[];
}

const EMPTY_RESPONSE = {
  previewMode: true,
  campaigns: [] as Campaign[],
} satisfies Record<string, unknown>;

/** Null, not 0, when a reported field is absent — see dashboardKpis.ts. */
function reportedNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Platform is taken ONLY from an explicit field the ads team fills in. It is
 * never inferred from the campaign name — see the docblock.
 */
function reportedPlatform(raw: unknown): CampaignPlatform {
  if (typeof raw !== "string") return "unspecified";
  const v = raw.trim().toLowerCase();
  if (v === "google" || v === "meta" || v === "bing") return v;
  return "unspecified";
}

function reportedStatus(raw: unknown): CampaignStatus {
  if (typeof raw !== "string") return "unspecified";
  const v = raw.trim().toLowerCase();
  if (v === "active" || v === "paused" || v === "draft") return v;
  return "unspecified";
}

function costPerLead(
  adSpendCents: number | null,
  leads: number | null,
): number | null {
  if (adSpendCents === null || leads === null || leads <= 0) return null;
  return Math.round(adSpendCents / leads);
}

export async function computeAdflowCampaigns(
  clientId: number,
): Promise<Campaign[]> {
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

  const [latest] = await db
    .select({
      metrics: adflowReports.metrics,
      period_label: adflowReports.period_label,
    })
    .from(adflowReports)
    .where(eq(adflowReports.client_service_id, svc.cs_id))
    .orderBy(desc(adflowReports.period_end))
    .limit(1);

  if (!latest) return [];

  const periodLabel = latest.period_label ?? null;
  const metrics = (latest.metrics ?? {}) as Record<string, unknown>;
  const creatives = (metrics.creatives ?? []) as Array<{
    name?: string;
    platform?: string;
    spend_cents?: number;
    leads?: number;
    impressions?: number;
    status?: string;
  }>;

  if (!Array.isArray(creatives) || creatives.length === 0) {
    // The ads team reported period totals with no per-campaign split. Show the
    // total as one row and say so in its name — do not invent a split.
    const adSpendCents = reportedNum(metrics.cost_spent_cents);
    const leads = reportedNum(metrics.leads_generated);
    const impressions = reportedNum(metrics.impressions);
    if (adSpendCents === null && leads === null && impressions === null) return [];
    return [
      {
        id: `cs-${svc.cs_id}-total`,
        name: "All campaigns (combined total)",
        platform: "unspecified",
        status: "unspecified",
        periodLabel,
        stats: {
          adSpendCents,
          leads,
          impressions,
          costPerLeadCents: costPerLead(adSpendCents, leads),
        },
      },
    ];
  }

  return creatives.map((c, idx) => {
    const adSpendCents = reportedNum(c.spend_cents);
    const leads = reportedNum(c.leads);
    return {
      id: `cs-${svc.cs_id}-${idx}-${(c.name ?? "campaign").replace(/\s+/g, "-").toLowerCase()}`,
      name: c.name ?? `Campaign ${idx + 1}`,
      platform: reportedPlatform(c.platform),
      status: reportedStatus(c.status),
      periodLabel,
      stats: {
        adSpendCents,
        leads,
        impressions: reportedNum(c.impressions),
        costPerLeadCents: costPerLead(adSpendCents, leads),
      },
    };
  });
}

export function registerPortalAdflowCampaignsRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/campaigns",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;
        const campaigns = await computeAdflowCampaigns(clientId);
        res.json({ campaigns });
      } catch (err: any) {
        log.error("[portal/adflow/campaigns]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
