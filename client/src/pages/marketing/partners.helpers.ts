/**
 * Shared client types + hooks + formatters for the /partners marketing surface
 * (Partners landing, PartnersTerms, PartnersDashboard). Program NUMBERS are
 * fetched from GET /api/partners/program-terms — the single source of truth is
 * server/affiliate/programs.ts, so the copy can never drift from billing.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface ProgramTerms {
  referral: {
    referrerFreeMonths: number;
    refereeTrialDays: number;
    refereeDiscountPct: number;
    refereeDiscountMonths: number;
  };
  affiliate: {
    baseRatePct: number;
    proRatePct: number;
    partnerRatePct: number;
    proThreshold: number;
    proDurationMonths: number;
    cookieDays: number;
    minPayoutCents: number;
    payoutCadence: string;
  };
}

export interface AffiliateDashboardSummary {
  // Public-by-code projection: NO PII (no email / real name / payout method).
  // GET /api/partners/dashboard?code= is reachable by anyone with the public
  // ?ref= share link, so the server intentionally omits those fields.
  affiliate: {
    code: string;
    tier: "base" | "pro" | "partner";
    status: string;
    commissionRate: number;
    link: string;
  };
  stats: {
    clicks: number;
    signups: number;
    convertedCustomers: number;
    activeReferredCustomers: number;
  };
  tier: {
    tier: "base" | "pro" | "partner";
    activeReferredCustomers: number;
    toNextTier: number;
    nextTier: "base" | "pro" | "partner" | null;
    rate: number;
  };
  earnings: {
    estimatedMonthlyCents: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    minPayoutCents: number;
  };
}

export interface SignupResponse {
  code: string;
  referralLink: string;
  status: string;
  existing?: boolean;
}

/** Fetch the published terms for both programs. */
export function useProgramTerms() {
  return useQuery<ProgramTerms>({
    queryKey: ["/api/partners/program-terms"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/partners/program-terms");
      return (await res.json()) as ProgramTerms;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Format integer cents as USD (whole dollars when even, else 2dp). */
export function formatCents(cents: number): string {
  const dollars = (Number(cents) || 0) / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a rate fraction (0.25) as a whole-number percent ("25%"). */
export function formatRate(rate: number): string {
  return `${Math.round((Number(rate) || 0) * 100)}%`;
}
