/**
 * Portal AdFlow Campaigns — Wave 30.
 *
 * GET /api/portal/adflow/campaigns
 *
 * Returns a list of ad campaigns the client has running, each with a
 * letter-grade Score (A-F), trade-first label, and "Why?" expansion
 * factors so the dashboard can render the CampaignCard widget without
 * exposing PMAX/CPA/ROAS/CTR on the default surface.
 *
 *   campaign[] = {
 *     id, name, platform, status,
 *     score (0-100), grade ("A"-"F"),
 *     summary (1-sentence plain language),
 *     factors: { costPerBookingScore, volumeScore, ltvTrendScore },
 *     stats: { moneySpent, jobsBooked, customersReached, costPerBooking }
 *   }
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 *
 * Data source: synthesizes the most-recent adflow_reports.metrics +
 * creatives[] arrays into per-campaign rows. When no AdFlow service is
 * provisioned we return an empty array; the dashboard renders an
 * onboarding-ready empty state.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, adflowReports } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowCampaigns");

export type CampaignPlatform = "google" | "meta" | "bing" | "other";
export type CampaignStatus = "active" | "paused" | "draft";

interface CampaignFactors {
  costPerBookingScore: number;
  volumeScore: number;
  ltvTrendScore: number;
}

interface CampaignStats {
  moneySpent: number;
  jobsBooked: number;
  customersReached: number;
  costPerBooking: number;
}

interface Campaign {
  id: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignStatus;
  score: number;
  grade: string;
  summary: string;
  factors: CampaignFactors;
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

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function gradeForScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/** Industry-average plumbing / trade cost-per-booking benchmark (cents). */
const INDUSTRY_AVG_CPB_CENTS = 15_000;

function scoreFromCostPerBooking(cpbCents: number): number {
  if (cpbCents <= 0) return 50;
  // Lower is better; cap at 100 when ≤ 50% of industry avg.
  const ratio = INDUSTRY_AVG_CPB_CENTS / cpbCents;
  return Math.max(0, Math.min(100, Math.round(ratio * 60)));
}

function scoreFromVolume(jobsBooked: number): number {
  // 0 → 0, 1 → 30, 10 → 80, 25+ → 100.
  if (jobsBooked <= 0) return 0;
  if (jobsBooked >= 25) return 100;
  return Math.round(30 + (jobsBooked / 25) * 70);
}

function scoreFromLtvTrend(_jobsBooked: number, _spend: number): number {
  // Without explicit LTV signal stored on adflow_reports yet, return a
  // neutral 50 unless we have enough volume + spend to be confident.
  if (_jobsBooked >= 5 && _spend > 50_000) return 65;
  return 50;
}

function detectPlatform(creativeName: string | undefined): CampaignPlatform {
  if (!creativeName) return "other";
  const n = creativeName.toLowerCase();
  if (n.includes("google") || n.includes("pmax") || n.includes("search")) return "google";
  if (n.includes("meta") || n.includes("facebook") || n.includes("instagram") || n.includes("fb")) return "meta";
  if (n.includes("bing") || n.includes("microsoft")) return "bing";
  return "other";
}

function plainSummary(stats: CampaignStats, grade: string): string {
  if (stats.jobsBooked === 0 && stats.moneySpent === 0) {
    return "No activity yet — campaign is in draft or just launched.";
  }
  if (stats.jobsBooked === 0) {
    return `Spent $${Math.round(stats.moneySpent / 100)} but no bookings yet. Worth reviewing the ad copy or pausing.`;
  }
  const cpb = `$${Math.round(stats.costPerBooking / 100)}`;
  const industry = `$${Math.round(INDUSTRY_AVG_CPB_CENTS / 100)}`;
  if (grade === "A" || grade === "B") {
    return `This campaign costs ${cpb} per booking — industry average is ${industry}.`;
  }
  if (grade === "C") {
    return `Booking cost (${cpb}) is around industry average (${industry}). Room to optimize.`;
  }
  return `Booking cost (${cpb}) is above industry average (${industry}). Consider pausing or refreshing the ad.`;
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
    .select({ metrics: adflowReports.metrics, period_label: adflowReports.period_label })
    .from(adflowReports)
    .where(eq(adflowReports.client_service_id, svc.cs_id))
    .orderBy(desc(adflowReports.period_end))
    .limit(1);

  if (!latest) return [];

  const metrics = (latest.metrics ?? {}) as Record<string, unknown>;
  const creatives = (metrics.creatives ?? []) as Array<{
    name?: string;
    spend_cents?: number;
    leads?: number;
    ctr_pct?: number;
    impressions?: number;
    status?: string;
  }>;

  if (!Array.isArray(creatives) || creatives.length === 0) {
    // Fall back to a single aggregate campaign so the dashboard isn't
    // empty when reports exist but no creative breakdown is present.
    const moneySpent = num(metrics.cost_spent_cents);
    const jobsBooked = num(metrics.leads_generated);
    const customersReached = num(metrics.impressions);
    const costPerBooking = jobsBooked > 0 ? Math.round(moneySpent / jobsBooked) : 0;

    const factors: CampaignFactors = {
      costPerBookingScore: scoreFromCostPerBooking(costPerBooking),
      volumeScore: scoreFromVolume(jobsBooked),
      ltvTrendScore: scoreFromLtvTrend(jobsBooked, moneySpent),
    };
    const score = Math.round(
      factors.costPerBookingScore * 0.5 +
        factors.volumeScore * 0.3 +
        factors.ltvTrendScore * 0.2,
    );
    const grade = gradeForScore(score);
    const stats: CampaignStats = { moneySpent, jobsBooked, customersReached, costPerBooking };
    return [
      {
        id: `cs-${svc.cs_id}-aggregate`,
        name: `${latest.period_label ?? "Current"} — All Campaigns`,
        platform: "other",
        status: "active",
        score,
        grade,
        summary: plainSummary(stats, grade),
        factors,
        stats,
      },
    ];
  }

  return creatives.map((c, idx) => {
    const moneySpent = num(c.spend_cents);
    const jobsBooked = num(c.leads);
    const customersReached = num(c.impressions);
    const costPerBooking = jobsBooked > 0 ? Math.round(moneySpent / jobsBooked) : 0;
    const factors: CampaignFactors = {
      costPerBookingScore: scoreFromCostPerBooking(costPerBooking),
      volumeScore: scoreFromVolume(jobsBooked),
      ltvTrendScore: scoreFromLtvTrend(jobsBooked, moneySpent),
    };
    const score = Math.round(
      factors.costPerBookingScore * 0.5 +
        factors.volumeScore * 0.3 +
        factors.ltvTrendScore * 0.2,
    );
    const grade = gradeForScore(score);
    const stats: CampaignStats = { moneySpent, jobsBooked, customersReached, costPerBooking };
    return {
      id: `cs-${svc.cs_id}-${idx}-${(c.name ?? "campaign").replace(/\s+/g, "-").toLowerCase()}`,
      name: c.name ?? `Campaign ${idx + 1}`,
      platform: detectPlatform(c.name),
      status:
        (c.status === "paused" ? "paused" : c.status === "draft" ? "draft" : "active") as CampaignStatus,
      score,
      grade,
      summary: plainSummary(stats, grade),
      factors,
      stats,
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
