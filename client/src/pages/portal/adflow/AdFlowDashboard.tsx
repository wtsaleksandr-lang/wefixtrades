/**
 * /portal/adflow/dashboard — Wave 30 AdFlow UI upgrade.
 *
 * Trade-first AdFlow customer dashboard. Hides PMAX/CPA/ROAS/CTR jargon
 * by default; uses Money Spent / Customers Reached / Jobs Booked / Revenue
 * Earned / Score / Cost per Booking.
 *
 * Built on Wave 22A shared visual primitives + Wave 26.7 polish-mix +
 * the 7 new AdFlow-specific surfaces:
 *
 *   - AnomalyBanner          (top of page; plain-language alerts)
 *   - Animated ad-spend hero counter with daily/weekly delta
 *   - ROIFunnel              (4-stage hero card)
 *   - LetterGradeBadge per   CampaignCard with "Why?" expander +
 *                            1-click "Pause campaign" + confirmation
 *   - AdCopyComposer         (3-variant generator with KpiGauge scoring)
 *   - ProfitableTradeHeatmap (rows = trades, cols = platforms)
 *   - DayPartingHeatmap      (24h × 7d; empty state <14d)
 *
 * Plus the universal action row + links to NotificationSettings and the
 * 3-question AdFlowSetup wizard.
 *
 * Backend (Wave 30):
 *   GET   /api/portal/adflow/dashboard-kpis
 *   GET   /api/portal/adflow/campaigns
 *   POST  /api/portal/adflow/copy/generate
 *   GET   /api/portal/adflow/anomalies
 *   POST  /api/portal/adflow/run-action
 *   GET   /api/portal/adflow/notification-settings
 *   GET   /api/portal/adflow/heatmaps/profitable-trade
 *   GET   /api/portal/adflow/heatmaps/day-parting
 *
 * Polling: 60s for KPIs/anomalies/campaigns. No WebSockets.
 */

import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Megaphone,
  Settings as SettingsIcon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AnimatedCounter,
  DonutChart,
  KpiGauge,
  MonthlyBarSeries,
  Sparkline,
  SparklineWithPeak,
  type DonutSegment,
  type MonthlyBar,
} from "@/components/ui/visual-primitives";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import { ROIFunnel } from "@/components/adflow/ROIFunnel";
import {
  CampaignCard,
  type CampaignPlatform,
  type CampaignStatus,
} from "@/components/adflow/CampaignCard";
import { AdCopyComposer } from "@/components/adflow/AdCopyComposer";
import {
  AnomalyBanner,
  type Anomaly,
  type AnomalyAction,
} from "@/components/adflow/AnomalyBanner";
import { ProfitableTradeHeatmap } from "@/components/adflow/ProfitableTradeHeatmap";
import { DayPartingHeatmap } from "@/components/adflow/DayPartingHeatmap";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import { IllustrativeDataBadge } from "@/components/portal/IllustrativeDataBadge";

const META = {
  moneySpent: getMetricMeta("adflow", "moneySpent")!,
  jobsBooked: getMetricMeta("adflow", "jobsBooked")!,
  revenueEarned: getMetricMeta("adflow", "revenueEarned")!,
  customersReached: getMetricMeta("adflow", "customersReached")!,
  costPerBooking: getMetricMeta("adflow", "costPerBooking")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    moneySpent: { thisMonth: number; lastMonth: number; deltaPct: number };
    jobsBooked: { thisMonth: number; lastMonth: number; deltaPct: number };
    revenueEarned: number;
    customersReached: number;
    costPerBooking: number;
  };
  funnel: {
    moneySpent: number;
    customersReached: number;
    jobsBooked: number;
    revenueEarned: number;
    conversionRates: {
      spendToReach: number;
      reachToBook: number;
      bookToRevenue: number;
    };
  };
  spendTrend12w: number[];
  hasAdflowService: boolean;
}

interface CampaignsResponse {
  previewMode?: boolean;
  campaigns: Array<{
    id: string;
    name: string;
    platform: CampaignPlatform;
    status: CampaignStatus;
    score: number;
    grade: string;
    summary: string;
    factors: {
      costPerBookingScore: number;
      volumeScore: number;
      ltvTrendScore: number;
    };
    stats: {
      moneySpent: number;
      jobsBooked: number;
      customersReached: number;
      costPerBooking: number;
    };
  }>;
}

interface AnomaliesResponse {
  previewMode?: boolean;
  anomalies: Anomaly[];
}

interface TradeHeatmapResponse {
  previewMode?: boolean;
  rows: string[];
  columns: Array<"google" | "meta" | "bing">;
  cells: Array<{
    trade: string;
    platform: "google" | "meta" | "bing";
    spendCents: number;
    jobsBooked: number;
    revenueCents: number;
    ratio: number;
    tone: "emerald" | "amber" | "crimson" | "neutral";
  }>;
  hasData: boolean;
}

interface DayPartingResponse {
  previewMode?: boolean;
  cells: Array<{
    day: number;
    hour: number;
    spendCents: number;
    jobsBooked: number;
    score: number;
    tone: "emerald" | "amber" | "crimson" | "neutral";
  }>;
  hasEnoughData: boolean;
  daysOfData: number;
}

/* ─── Quick actions ──────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    id: "pause-underperforming-campaign",
    label: "Pause worst campaign",
    description: "Stop the campaign with the lowest grade in the last 7 days.",
    icon: TrendingDown,
  },
  {
    id: "boost-winning-campaign",
    label: "Boost top campaign",
    description: "Shift budget to your highest-grade campaign.",
    icon: TrendingUp,
  },
  {
    id: "swap-ad-copy",
    label: "Refresh worst ad copy",
    description: "Replace a stale creative with a fresh AI-suggested winner.",
    icon: Sparkles,
  },
  {
    id: "expand-to-new-platform",
    label: "Expand to new platform",
    description: "Duplicate your winning Google campaign to Meta.",
    icon: Zap,
  },
] as const;

type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

/* ─── Dashboard ─────────────────────────────────────────────────────── */

export default function AdFlowDashboard() {
  usePageTitle("AdFlow dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: kpis, isLoading: kpisLoading } = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/adflow/dashboard-kpis"],
    queryFn: async () => {
      const res = await fetch("/api/portal/adflow/dashboard-kpis", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: campaignsData } = useQuery<CampaignsResponse>({
    queryKey: ["/api/portal/adflow/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/portal/adflow/campaigns", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load campaigns");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: anomaliesData } = useQuery<AnomaliesResponse>({
    queryKey: ["/api/portal/adflow/anomalies"],
    queryFn: async () => {
      const res = await fetch("/api/portal/adflow/anomalies", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load anomalies");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: tradeHeatmap } = useQuery<TradeHeatmapResponse>({
    queryKey: ["/api/portal/adflow/heatmaps/profitable-trade"],
    queryFn: async () => {
      const res = await fetch(
        "/api/portal/adflow/heatmaps/profitable-trade",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load trade heatmap");
      return res.json();
    },
  });

  const { data: dayParting } = useQuery<DayPartingResponse>({
    queryKey: ["/api/portal/adflow/heatmaps/day-parting"],
    queryFn: async () => {
      const res = await fetch("/api/portal/adflow/heatmaps/day-parting", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load day-parting heatmap");
      return res.json();
    },
  });

  /* ─── Wave 73a — real KPI stat endpoints ──────────────────────────── */
  type MonthlyResponse = {
    data: MonthlyBar[];
    data_status: "real" | "illustrative";
  };
  type PeakResponse = {
    data: number[];
    peakLabel: string;
    peakIndex: number;
    data_status: "real" | "illustrative";
  };
  type SegmentResponse = {
    data: DonutSegment[];
    data_status: "real" | "illustrative";
  };
  const { data: monthlyStats } = useQuery<MonthlyResponse>({
    queryKey: ["portal", "adflow", "stats", "monthly"],
    queryFn: () =>
      fetch("/api/portal/adflow/stats/monthly?months=6", {
        credentials: "include",
      }).then((r) => r.json()),
  });
  const { data: peakStats } = useQuery<PeakResponse>({
    queryKey: ["portal", "adflow", "stats", "peak"],
    queryFn: () =>
      fetch("/api/portal/adflow/stats/peak", { credentials: "include" }).then(
        (r) => r.json(),
      ),
  });
  const { data: segmentStats } = useQuery<SegmentResponse>({
    queryKey: ["portal", "adflow", "stats", "segments"],
    queryFn: () =>
      fetch("/api/portal/adflow/stats/segments", {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const runAction = useMutation({
    mutationFn: async (input: {
      action: string;
      actionId?: string;
      params?: Record<string, string | number | boolean>;
    }) => {
      return apiRequest("POST", "/api/portal/adflow/run-action", {
        actionId: input.actionId ?? `dashboard-${input.action}-${Date.now()}`,
        action: input.action,
        params: input.params,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Action queued",
        description: data?.message ?? "Done.",
      });
      if (data?.redirectUrl) setLocation(data.redirectUrl);
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/adflow/dashboard-kpis"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/adflow/anomalies"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/adflow/campaigns"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const onAnomalyAction = async (a: Anomaly, action: AnomalyAction) => {
    const verb =
      action === "investigate"
        ? "investigate-anomaly"
        : action === "approve-pause"
          ? "approve-anomaly-pause"
          : action === "approve-boost"
            ? "approve-anomaly-boost"
            : "acknowledge";
    runAction.mutate({
      action: verb,
      actionId: a.actionId,
      params: a.campaignName ? { campaignName: a.campaignName } : undefined,
    });
  };

  const k = kpis?.kpis;
  const trend = kpis?.spendTrend12w ?? [];
  const hasService = kpis?.hasAdflowService ?? false;
  const campaigns = campaignsData?.campaigns ?? [];
  const anomalies = anomaliesData?.anomalies ?? [];

  /* ─── Wave 72 — derived series for new KPI primitives ───────────────── */

  // Leads per month — Wave 73a: backed by /stats/monthly. Local mock kept
  // for first-render fallback while the query is loading.
  const leadsMonthlyFallback: MonthlyBar[] = useMemo(() => {
    const now = new Date();
    const labels: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString(undefined, { month: "short" }));
    }
    const thisMonth = (k?.jobsBooked.thisMonth ?? 0) * 2;
    const lastMonth = (k?.jobsBooked.lastMonth ?? 0) * 2;
    const anchor = Math.max(thisMonth, lastMonth, 1);
    return labels.map((label, idx) => {
      const isCurrent = idx === labels.length - 1;
      if (isCurrent) return { label, value: thisMonth, highlighted: true };
      if (idx === labels.length - 2) return { label, value: lastMonth };
      const ratio = 0.5 + idx * 0.09;
      return { label, value: Math.round(anchor * ratio) };
    });
  }, [k?.jobsBooked.thisMonth, k?.jobsBooked.lastMonth]);
  const leadsMonthlyUsingFallback = !(
    monthlyStats?.data && monthlyStats.data.length > 0
  );
  const leadsMonthlyBars: MonthlyBar[] = leadsMonthlyUsingFallback
    ? leadsMonthlyFallback
    : monthlyStats!.data;
  // Wave K2: badge whenever synthetic fallback is shown, not just when the
  // server flags illustrative — empty/errored stats also render fallback.
  const leadsMonthlyIllustrative =
    monthlyStats?.data_status === "illustrative" || leadsMonthlyUsingFallback;

  // Peak ROAS day — Wave 73a: backed by /stats/peak. Note the fallback here is
  // the customer's *real* 12-week spend trend (spendTrend12w), not synthetic
  // numbers, so no illustrative badge when falling back to it.
  const peakRoasSeries = peakStats?.data ?? trend.slice(-12);
  const peakRoasIllustrative = peakStats?.data_status === "illustrative";

  // Ad spend by platform — Wave 73a: backed by /stats/segments.
  const adSpendByPlatformFallback: DonutSegment[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of campaigns) {
      const platform = c.platform ?? "other";
      map.set(platform, (map.get(platform) ?? 0) + (c.stats?.moneySpent ?? 0));
    }
    if (map.size === 0) {
      return [
        { label: "Google", value: 1800 },
        { label: "Meta", value: 1100 },
        { label: "Bing", value: 400 },
      ];
    }
    return Array.from(map.entries()).map(([platform, value]) => ({
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      value: Math.max(1, Math.round(value / 100)),
    }));
  }, [campaigns]);
  const segmentStatsHasData = !!(
    segmentStats?.data && segmentStats.data.length > 0
  );
  const adSpendByPlatform: DonutSegment[] = segmentStatsHasData
    ? segmentStats!.data
    : adSpendByPlatformFallback;
  // Wave K2: the donut shows truly synthetic numbers only when BOTH the stat
  // endpoint is empty AND there are no campaigns to derive from (the hardcoded
  // Google/Meta/Bing branch). With campaigns present the fallback is real.
  const adSpendByPlatformUsingSynthetic =
    !segmentStatsHasData && campaigns.length === 0;
  const adSpendByPlatformIllustrative =
    segmentStats?.data_status === "illustrative" ||
    adSpendByPlatformUsingSynthetic;

  // Weekly delta from sparkline (sum last 7d vs prior 7d). Sparkline is
  // 12-weekly buckets so we just compare the last two cells.
  const weeklyDeltaCents =
    trend.length >= 2 ? (trend[trend.length - 1]! - trend[trend.length - 2]!) : 0;
  const todayDeltaCents = 0; // Reserved for daily granularity once wired.
  const spentTodayCents = trend.length > 0 ? Math.round(trend[trend.length - 1]! / 7) : 0;

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <Megaphone className="h-5 w-5" aria-hidden="true" />
              AdFlow dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Trade-first ad performance — money spent, jobs booked, revenue
              earned. Jargon hidden by default.
            </p>
          </div>
          {/* Wave 36 — header buttons demoted; per cross-cutting cleanup #2
              the Notifications button routes to the global prefs page. */}
          <AdvancedOnly product="adflow" elementId="adflow.header-actions">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid="link-adflow-notifications"
              >
                <Link href="/portal/adflow/notifications">
                  <Bell className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Notifications
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid="link-adflow-setup"
              >
                <Link href="/portal/adflow/setup">
                  <SettingsIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Setup wizard
                </Link>
              </Button>
            </div>
          </AdvancedOnly>
        </div>

        {/* Anomaly banner */}
        <AnomalyBanner
          anomalies={anomalies}
          onAction={onAnomalyAction}
          isMutating={runAction.isPending}
        />

        {/* Animated ad-spend hero counter */}
        <Card className="flex flex-col gap-2 p-4" data-testid="kpi-spend-hero">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Spent this week
            </p>
            <span
              className={
                weeklyDeltaCents <= 0
                  ? "text-xs font-medium text-[hsl(var(--chart-2))]"
                  : "text-xs font-medium text-[hsl(var(--destructive))]"
              }
              data-testid="kpi-spend-week-delta"
            >
              {weeklyDeltaCents <= 0 ? "↓" : "↑"} $
              {Math.abs(Math.round(weeklyDeltaCents / 100)).toLocaleString()} vs
              last week
            </span>
          </div>
          <AnimatedCounter
            value={trend.length > 0 ? Math.round(trend[trend.length - 1]! / 100) : 0}
            prefix="$"
            decimals={0}
            className="text-3xl font-bold text-foreground md:text-4xl"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Spent today: ${spentTodayCents.toLocaleString()}
              {todayDeltaCents !== 0 && (
                <span className="ml-2">
                  ({todayDeltaCents > 0 ? "↑" : "↓"} $
                  {Math.abs(todayDeltaCents).toLocaleString()} vs yesterday)
                </span>
              )}
            </p>
            <Sparkline values={trend} className="h-8 w-48" />
          </div>
        </Card>

        {/* ROI funnel + KPI tiles row */}
        <div className="grid auto-rows-fr gap-3 lg:grid-cols-3">
          <div className="h-full lg:col-span-2">
            <ROIFunnel
              moneySpentCents={kpis?.funnel.moneySpent ?? 0}
              customersReached={kpis?.funnel.customersReached ?? 0}
              jobsBooked={kpis?.funnel.jobsBooked ?? 0}
              revenueEarnedCents={kpis?.funnel.revenueEarned ?? 0}
              conversionRates={kpis?.funnel.conversionRates}
            />
          </div>
          {/* Wave 36 — cost-per-booking + jobs-booked sidebars hidden in Simple
              mode. Audit verdict: "already implied by funnel". */}
          <AdvancedOnly product="adflow" elementId="adflow.cost-per-booking-sidebar">
            <div className="flex h-full flex-col gap-3">
              <Card
                className="flex h-full flex-col items-center justify-center gap-2 p-4"
                data-testid="kpi-cost-per-booking"
              >
                <KpiGauge
                  value={Math.round((k?.costPerBooking ?? 0) / 100)}
                  max={300}
                  label={META.costPerBooking.label}
                  unit="$"
                  size="md"
                  color="auto"
                  helpText={META.costPerBooking.helpText}
                  improvementTips={META.costPerBooking.improvementTips}
                  emptyState={kpisLoading || (k?.costPerBooking ?? 0) === 0}
                />
              </Card>
              <Card className="flex h-full flex-col gap-1 p-3" data-testid="kpi-jobs-booked">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {META.jobsBooked.label}
                </p>
                <div className="flex items-baseline gap-2">
                  <AnimatedCounter
                    value={k?.jobsBooked.thisMonth ?? 0}
                    className="text-2xl font-semibold text-foreground"
                  />
                  <span
                    className={
                      (k?.jobsBooked.deltaPct ?? 0) >= 0
                        ? "text-[11px] font-medium text-[hsl(var(--chart-2))]"
                        : "text-[11px] font-medium text-[hsl(var(--destructive))]"
                    }
                  >
                    {(k?.jobsBooked.deltaPct ?? 0) >= 0 ? "+" : ""}
                    {k?.jobsBooked.deltaPct ?? 0}%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  vs last 30 days
                </p>
              </Card>
            </div>
          </AdvancedOnly>
        </div>

        {/* Wave 72 — new KPI primitives row */}
        <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {/* Headline (Simple-mode visible) — leads per month */}
          <Card className="p-4 h-full" data-testid="af-leads-monthly">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Leads per month
              </div>
              <IllustrativeDataBadge show={leadsMonthlyIllustrative} />
            </div>
            <MonthlyBarSeries
              bars={leadsMonthlyBars}
              lede={`${leadsMonthlyBars[leadsMonthlyBars.length - 1]?.value ?? 0}`}
              caption={(() => {
                const cur = leadsMonthlyBars[leadsMonthlyBars.length - 1]?.value ?? 0;
                const prev = leadsMonthlyBars[leadsMonthlyBars.length - 2]?.value ?? 0;
                if (prev === 0) return "Fresh start this month";
                const delta = ((cur - prev) / prev) * 100;
                const sign = delta >= 0 ? "+" : "";
                return `${sign}${delta.toFixed(0)}% vs prior month`;
              })()}
              color="emerald"
              ariaLabel="AdFlow leads per month"
            />
          </Card>

          {/* Advanced — peak ROAS day sparkline */}
          <AdvancedOnly product="adflow" elementId="adflow.peak-roas-sparkline">
            <Card className="p-4 h-full" data-testid="af-peak-roas-sparkline">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Peak ROAS day
                </div>
                <IllustrativeDataBadge show={peakRoasIllustrative} />
              </div>
              {peakRoasSeries.length > 0 ? (
                <SparklineWithPeak
                  data={peakRoasSeries}
                  color="violet"
                  width={260}
                  height={96}
                  ariaLabel="Peak ROAS day in the last 12 weeks"
                />
              ) : (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No spend data yet.
                </div>
              )}
            </Card>
          </AdvancedOnly>

          {/* Advanced — ad spend by platform donut */}
          <AdvancedOnly product="adflow" elementId="adflow.spend-by-platform-donut">
            <Card className="p-4 h-full" data-testid="af-spend-by-platform-donut">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="sr-only">Ad spend by platform</span>
                <IllustrativeDataBadge show={adSpendByPlatformIllustrative} />
              </div>
              <DonutChart
                title="Ad spend by platform"
                segments={adSpendByPlatform}
                size={130}
                formatValue={(n) => `$${n.toLocaleString()}`}
                ariaLabel="Ad spend by platform"
              />
            </Card>
          </AdvancedOnly>
        </div>

        {/* Quick-action row */}
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Quick AI actions
            </h2>
            <span className="text-[11px] text-muted-foreground">
              1-click recommendations — your approval required
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.id}
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                  disabled={runAction.isPending}
                  onClick={() =>
                    runAction.mutate({ action: a.id as QuickActionId })
                  }
                  data-testid={`quick-action-${a.id}`}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.label}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {a.description}
                  </span>
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Campaign cards */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Your campaigns
          </h2>
          {campaigns.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                {hasService
                  ? "No campaigns to show yet"
                  : "AdFlow isn't set up yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasService
                  ? "Once your first campaign runs for a full reporting period, you'll see grade cards here."
                  : "Take the 3-question setup wizard — under 5 minutes — to launch your first campaign."}
              </p>
              <Button asChild size="sm" data-testid="empty-state-setup">
                <Link href="/portal/adflow/setup">
                  Start setup
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  platform={c.platform}
                  status={c.status}
                  score={c.score}
                  grade={c.grade}
                  summary={c.summary}
                  factors={c.factors}
                  stats={c.stats}
                  isMutating={runAction.isPending}
                  onPause={() =>
                    runAction.mutate({
                      action: "pause-campaign",
                      actionId: c.id,
                      params: { campaignName: c.name },
                    })
                  }
                  onResume={() =>
                    runAction.mutate({
                      action: "resume-campaign",
                      actionId: c.id,
                      params: { campaignName: c.name },
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* AI ad-copy composer — Wave 36: demoted to Advanced. The Copilot is
            the canonical surface for generating ad copy now. */}
        <AdvancedOnly product="adflow" elementId="adflow.ad-copy-composer">
          <AdCopyComposer
            defaultTrade="plumbing"
            onUseVariant={async (v) => {
              await runAction.mutateAsync({
                action: "swap-ad-copy",
                actionId: `composer-${v.id}`,
                params: { variantId: v.id, headline: v.headline },
              });
            }}
          />
        </AdvancedOnly>

        {/* Power-analyst heatmaps — Wave 36: hidden by default. */}
        <AdvancedOnly product="adflow" elementId="adflow.power-analyst-heatmaps">
        <ProfitableTradeHeatmap
          rows={tradeHeatmap?.rows ?? []}
          columns={tradeHeatmap?.columns ?? ["google", "meta", "bing"]}
          cells={tradeHeatmap?.cells ?? []}
          hasData={tradeHeatmap?.hasData ?? false}
        />

        <DayPartingHeatmap
          cells={dayParting?.cells ?? []}
          hasEnoughData={dayParting?.hasEnoughData ?? false}
          daysOfData={dayParting?.daysOfData ?? 0}
        />
        </AdvancedOnly>
      </div>
    </PortalLayout>
  );
}
