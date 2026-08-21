/**
 * Affiliate DASHBOARD stats (Phase 1) — a marketer's view of their own link.
 *
 * Ported from QuoteFleet src/server/affiliate/dashboard.ts (PR #352), split so
 * the aggregation MATH is a pure function (`buildAffiliateDashboard`) the WFT
 * tsx + node:assert harness can test with no DB, and the DB-touching loader
 * (`loadAffiliateDashboard`) wraps it. tenant→client throughout.
 *
 * Phase-1 computes clicks / signups / conversions from referral_attributions
 * and earnings from affiliate_commissions (empty until the phase-2 billing job
 * writes real invoice-based rows), plus an HONEST estimate of monthly earnings
 * from active referred customers × average revenue × rate. Real payouts wire in
 * phase 2. ALL program NUMBERS (rates, tiers, min-payout) come from programs.ts
 * — this module never hardcodes a term.
 */
import { and, count, eq, ne, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { affiliates, affiliateCommissions, referralAttributions } from "@shared/schemas/affiliate";
import type { Affiliate } from "@shared/schemas/affiliate";
import {
  tierProgress,
  estimateMonthlyCommissionCents,
  commissionRateForTier,
  normalizeCode,
  AFFILIATE_MIN_PAYOUT_CENTS,
  type AffiliateTier,
  type TierProgress,
} from "./programs";
import { createLogger } from "../lib/logger";

const log = createLogger("AffiliateDashboard");

/**
 * Average monthly revenue per referred customer (cents) used for the phase-1
 * earnings ESTIMATE only — a mid-plan WeFixTrades figure. The phase-2 billing
 * job replaces this with the real per-invoice amounts written to
 * affiliate_commissions, so nothing downstream trusts this number for payout.
 */
export const AVG_MONTHLY_REVENUE_CENTS = 9900;

function referralBase(): string {
  return process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
}

/**
 * The affiliate's shareable short link (`https://host/ref/<code>`). Mirrors
 * partnersRoutes.referralLink intentionally so this module stays free of a
 * circular import back into the express route file (keeps it unit-testable).
 */
export function affiliateLink(code: string, base = referralBase()): string {
  return `${base.replace(/\/+$/, "")}/ref/${code}`;
}

/** Raw aggregates for one affiliate code — the only DB-derived inputs. */
export interface AffiliateAggregates {
  clicks: number;
  signups: number;
  convertedCustomers: number;
  /** affiliate_commissions rows (status + integer cents), possibly empty. */
  commissions: Array<{ status: string; amount_cents: number }>;
}

export interface AffiliateDashboardSummary {
  affiliate: {
    id: number;
    email: string;
    name: string | null;
    code: string;
    tier: AffiliateTier;
    status: string;
    commissionRate: number;
    link: string;
    payoutMethod: string | null;
  };
  stats: {
    clicks: number;
    signups: number;
    convertedCustomers: number;
    activeReferredCustomers: number;
  };
  tier: TierProgress;
  earnings: {
    estimatedMonthlyCents: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    /** Minimum balance (cents) before a payout is triggered — from programs.ts. */
    minPayoutCents: number;
  };
}

/**
 * PURE view-model builder — given the affiliate row + its aggregates + a
 * pre-built link, produce the dashboard summary. No DB, no IO, deterministic,
 * so dashboard.test.ts pins the tier/commission math without infrastructure.
 */
export function buildAffiliateDashboard(
  affiliate: Affiliate,
  agg: AffiliateAggregates,
  link: string,
): AffiliateDashboardSummary {
  const clicks = Math.max(0, Number(agg.clicks) || 0);
  const signups = Math.max(0, Number(agg.signups) || 0);
  const convertedCustomers = Math.max(0, Number(agg.convertedCustomers) || 0);
  // Phase-1: "active referred customers" == linked signups (a client is active
  // by default at signup). Phase-2 narrows this to currently-paying clients.
  const activeReferredCustomers = signups;

  const storedTier = (affiliate.tier as AffiliateTier) ?? "base";
  const progress = tierProgress(activeReferredCustomers, storedTier);
  // Effective rate: the stored rate wins (honours a hand-set 'partner' rate);
  // fall back to the published tier default.
  const rate = affiliate.commission_rate || commissionRateForTier(progress.tier);

  let pendingCents = 0;
  let approvedCents = 0;
  let paidCents = 0;
  for (const c of agg.commissions) {
    const cents = Math.max(0, Number(c.amount_cents) || 0);
    if (c.status === "paid") paidCents += cents;
    else if (c.status === "approved") approvedCents += cents;
    else pendingCents += cents;
  }

  const estimatedMonthlyCents = estimateMonthlyCommissionCents(
    activeReferredCustomers,
    AVG_MONTHLY_REVENUE_CENTS,
    rate,
  );

  return {
    affiliate: {
      id: affiliate.id,
      email: affiliate.email,
      name: affiliate.name ?? null,
      code: affiliate.code,
      tier: progress.tier,
      status: affiliate.status,
      commissionRate: rate,
      link,
      payoutMethod: affiliate.payout_method ?? null,
    },
    stats: { clicks, signups, convertedCustomers, activeReferredCustomers },
    tier: progress,
    earnings: {
      estimatedMonthlyCents,
      pendingCents,
      approvedCents,
      paidCents,
      minPayoutCents: AFFILIATE_MIN_PAYOUT_CENTS,
    },
  };
}

/** Fetch one affiliate by (normalized) code, or null. */
export async function getAffiliateByCode(rawCode: string): Promise<Affiliate | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const row = (await db.select().from(affiliates).where(eq(affiliates.code, code)).limit(1))[0];
  return row ?? null;
}

/**
 * Load + build the dashboard summary for a code (null if the code is unknown).
 * Read-only. Every failure logs (no silent catch) and re-throws so the route
 * turns it into a 500 rather than a misleading empty dashboard.
 */
export async function loadAffiliateDashboard(
  rawCode: string,
  base = referralBase(),
): Promise<AffiliateDashboardSummary | null> {
  const affiliate = await getAffiliateByCode(rawCode);
  if (!affiliate) return null;
  try {
    const [clicksRow, signupsRow, convertedRow, commissionRows] = await Promise.all([
      db.select({ n: count() }).from(referralAttributions).where(eq(referralAttributions.code, affiliate.code)),
      db
        .select({ n: count() })
        .from(referralAttributions)
        .where(
          and(
            eq(referralAttributions.code, affiliate.code),
            isNotNull(referralAttributions.referred_client_id),
            ne(referralAttributions.reward_status, "ignored"),
          ),
        ),
      db
        .select({ n: count() })
        .from(referralAttributions)
        .where(
          and(
            eq(referralAttributions.code, affiliate.code),
            isNotNull(referralAttributions.converted_at),
          ),
        ),
      db
        .select({ status: affiliateCommissions.status, amount_cents: affiliateCommissions.amount_cents })
        .from(affiliateCommissions)
        .where(eq(affiliateCommissions.affiliate_id, affiliate.id)),
    ]);

    return buildAffiliateDashboard(
      affiliate,
      {
        clicks: Number(clicksRow[0]?.n ?? 0),
        signups: Number(signupsRow[0]?.n ?? 0),
        convertedCustomers: Number(convertedRow[0]?.n ?? 0),
        commissions: commissionRows.map((c) => ({ status: c.status, amount_cents: c.amount_cents })),
      },
      affiliateLink(affiliate.code, base),
    );
  } catch (err) {
    log.error("loadAffiliateDashboard failed", {
      code: affiliate.code,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
