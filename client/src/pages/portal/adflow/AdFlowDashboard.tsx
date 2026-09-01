/**
 * /portal/adflow/dashboard
 *
 * HONESTY CONTRACT (guarded by server/services/aiActions/handlers/adflow.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────
 * AdFlow is an agency-brokered managed service. A human runs the customer's
 * campaigns in the customer's own ad accounts; WeFixTrades has no Google Ads or
 * Meta Ads integration, no ad-account OAuth, and no read or write path to any
 * campaign. This page therefore separates, visibly and by name:
 *
 *   "Reported by your ads team"  — figures a person typed into the CRM, shown
 *                                  with the period, the entry date and the name
 *                                  of whoever entered them. A figure that was
 *                                  not entered reads "Not reported", never 0.
 *
 *   "Measured by WeFixTrades"    — quote requests this platform's own widget
 *                                  captured, filtered to paid-ad UTM tagging.
 *
 * DELETED from this page, and must not come back (see the guard):
 *
 *   - the ROI funnel, whose "Revenue Earned" hero was leads × a flat $250 and
 *     whose stage pass-through percentages were the constants 100 / … / 100.
 *   - "Spent today: $X", computed as the 12-week sparkline's last bucket ÷ 7.
 *   - "Spent this week", which read a MONTH's reported total out of that bucket.
 *   - the leads-per-month fallback bars: `jobsBooked × 2` for the two known
 *     months and `anchor × (0.5 + idx × 0.09)` for the four invented ones.
 *   - the ad-spend donut fallback `Google 1800 / Meta 1100 / Bing 400`.
 *   - the trade × platform and day-parting heatmaps (deleted server-side too).
 *
 * There is no "example data" mode here. A chart with no data is absent, and the
 * section says what is missing and who supplies it.
 *
 * Backend:
 *   GET  /api/portal/adflow/dashboard-kpis
 *   GET  /api/portal/adflow/campaigns
 *   GET  /api/portal/adflow/anomalies
 *   GET  /api/portal/adflow/stats/monthly | /peak | /segments
 *   POST /api/portal/adflow/copy/generate
 *   POST /api/portal/adflow/run-action
 */

import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Info,
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
  DonutChart,
  MonthlyBarSeries,
  SparklineWithPeak,
  type DonutSegment,
  type MonthlyBar,
} from "@/components/ui/visual-primitives";
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
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface ReportedFigures {
  hasData: boolean;
  periodLabel: string | null;
  enteredAt: string | null;
  enteredBy: string | null;
  adSpendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  costPerLeadCents: number | null;
  revenueCents: number | null;
  priorPeriodLabel: string | null;
  priorAdSpendCents: number | null;
  priorLeads: number | null;
  spendTrend12w: number[] | null;
}

interface MeasuredFigures {
  supported: boolean;
  windowDays: number;
  quoteRequestsFromAds: number | null;
  quoteRequestsTotal: number | null;
}

interface DashboardKpisResponse {
  previewMode?: boolean;
  hasAdflowService: boolean;
  reported: ReportedFigures;
  measured: MeasuredFigures;
}

interface CampaignsResponse {
  previewMode?: boolean;
  campaigns: Array<{
    id: string;
    name: string;
    platform: CampaignPlatform;
    status: CampaignStatus;
    periodLabel: string | null;
    stats: {
      adSpendCents: number | null;
      leads: number | null;
      impressions: number | null;
      costPerLeadCents: number | null;
    };
  }>;
}

interface AnomaliesResponse {
  previewMode?: boolean;
  anomalies: Anomaly[];
}

/* ─── Formatting ─────────────────────────────────────────────────────── */

/** A figure nobody reported is never rendered as a number. */
const NOT_REPORTED = "Not reported";

function money(cents: number | null): string {
  if (cents === null) return NOT_REPORTED;
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function count(n: number | null): string {
  if (n === null) return NOT_REPORTED;
  return n.toLocaleString();
}

function deltaPct(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function formatEntryDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ─── Quick actions ──────────────────────────────────────────────────── */

// Labels must read as REQUESTS. There is no ad-platform API integration —
// each of these files a task for the ads team, who make the change by hand.
const QUICK_ACTIONS = [
  {
    id: "pause-underperforming-campaign",
    label: "Request: pause worst campaign",
    description: "Ask your ads team to stop the campaign with the highest cost per lead.",
    icon: TrendingDown,
  },
  {
    id: "boost-winning-campaign",
    label: "Request: boost top campaign",
    description: "Ask your ads team to shift budget to your cheapest-per-lead campaign.",
    icon: TrendingUp,
  },
  {
    id: "swap-ad-copy",
    label: "Refresh worst ad copy",
    description: "Open the composer to draft a fresh creative for your ads team.",
    icon: Sparkles,
  },
  {
    id: "expand-to-new-platform",
    label: "Request: expand to new platform",
    description: "Ask your ads team to scope duplicating a campaign to another platform.",
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

  const { data: kpis } = useQuery<DashboardKpisResponse>({
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

  /* Charts render only when the server says the series is real. */
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
      // Title must not assert an outcome — the server message carries the
      // truthful wording (request logged vs. navigation). AdFlow has no
      // ad-platform integration, so nothing here changes a live campaign.
      toast({
        title: "Request logged",
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

  const reported = kpis?.reported;
  const measured = kpis?.measured;
  const hasService = kpis?.hasAdflowService ?? false;
  const campaigns = campaignsData?.campaigns ?? [];
  const anomalies = anomaliesData?.anomalies ?? [];

  const spendDelta = deltaPct(
    reported?.adSpendCents ?? null,
    reported?.priorAdSpendCents ?? null,
  );
  const leadsDelta = deltaPct(
    reported?.leads ?? null,
    reported?.priorLeads ?? null,
  );
  const entryDate = formatEntryDate(reported?.enteredAt ?? null);

  const monthlyIsReal =
    monthlyStats?.data_status === "real" && monthlyStats.data.length > 0;
  const peakIsReal =
    peakStats?.data_status === "real" && peakStats.data.length > 0;
  const segmentsAreReal =
    segmentStats?.data_status === "real" && segmentStats.data.length > 0;

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:gap-5 md:p-6">
        {/* Header — left-aligned */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col text-left">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <Megaphone className="h-5 w-5 shrink-0" aria-hidden="true" />
              AdFlow dashboard
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Your campaigns are built and run by our agency partner in your own
              ad accounts.
            </p>
          </div>
          <AdvancedOnly product="adflow" elementId="adflow.header-actions">
            <div className="flex flex-wrap items-center gap-2">
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

        {/* Where the numbers come from. Stated once, up front. */}
        <Card
          className="flex flex-col gap-1.5 p-4 text-left"
          data-testid="adflow-data-provenance"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            Where these numbers come from
          </h3>
          <p className="max-w-3xl text-xs text-muted-foreground">
            WeFixTrades does not connect to Google Ads or Meta. Spend, impressions
            and lead counts are reported to us by the team running your campaigns
            and entered here by a person — your ad platform billing remains the
            source of truth. Quote requests are the exception: those are captured
            by your own WeFixTrades quote widget, and we measure them directly.
          </p>
        </Card>

        {/* Anomaly banner — computed from reported figures period over period */}
        <AnomalyBanner
          anomalies={anomalies}
          onAction={onAnomalyAction}
          isMutating={runAction.isPending}
        />

        {/* ─── Reported by your ads team ─────────────────────────────── */}
        <section className="flex flex-col gap-2" aria-labelledby="adflow-reported-heading">
          <div className="flex flex-col text-left">
            <h3
              id="adflow-reported-heading"
              className="text-sm font-semibold text-foreground"
            >
              Reported by your ads team
            </h3>
            {reported?.hasData ? (
              <p className="text-xs text-muted-foreground">
                {reported.periodLabel ?? "Latest period"}
                {" · entered "}
                {reported.enteredBy ? `by ${reported.enteredBy}` : "by our ops team"}
                {entryDate ? ` on ${entryDate}` : " (entry date not recorded)"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Figures typed in by our ops team once your ads team reports them.
              </p>
            )}
          </div>

          {!reported?.hasData ? (
            <Card
              className="flex flex-col items-start gap-1.5 p-5 text-left"
              data-testid="adflow-reported-empty"
            >
              <p className="text-sm font-medium text-foreground">
                No ad data entered for this period
              </p>
              <p className="max-w-xl text-xs text-muted-foreground">
                {hasService
                  ? "Your ads team reports each period's spend and leads to us, and we enter them here. Nothing has been entered yet for the current period."
                  : "AdFlow isn't set up yet. Once your campaigns are live, each period's reported figures appear here."}
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                <ReportedTile
                  testId="adflow-reported-spend"
                  label="Ad spend"
                  value={money(reported.adSpendCents)}
                  delta={spendDelta}
                  priorLabel={reported.priorPeriodLabel}
                />
                <ReportedTile
                  testId="adflow-reported-leads"
                  label="Leads"
                  value={count(reported.leads)}
                  delta={leadsDelta}
                  priorLabel={reported.priorPeriodLabel}
                />
                <ReportedTile
                  testId="adflow-reported-cost-per-lead"
                  label="Cost per lead"
                  value={money(reported.costPerLeadCents)}
                />
                <ReportedTile
                  testId="adflow-reported-impressions"
                  label="Impressions"
                  value={count(reported.impressions)}
                />
                <ReportedTile
                  testId="adflow-reported-clicks"
                  label="Clicks"
                  value={count(reported.clicks)}
                  // 5 tiles in a 2-col mobile grid would strand this one alone
                  // on the last row; span both columns there instead.
                  className="col-span-2 md:col-span-1"
                />
              </div>

              {reported.revenueCents !== null && (
                <Card
                  className="flex flex-col gap-0.5 p-4 text-left"
                  data-testid="adflow-reported-revenue"
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Revenue reported against these ads
                  </span>
                  <span className="text-2xl font-semibold text-foreground">
                    {money(reported.revenueCents)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Reported by you or your ads team — not calculated by us.
                  </span>
                </Card>
              )}

              {reported.spendTrend12w && (
                <Card
                  className="flex flex-col gap-2 p-4 text-left"
                  data-testid="adflow-spend-trend"
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Weekly ad spend
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Last 12 weeks, from the day-by-day breakdown your ads team
                      supplied.
                    </span>
                  </div>
                  {/* MonthlyBarSeries measures its container; Sparkline is a
                      fixed-viewBox SVG whose hover wrapper hard-codes a pixel
                      width, which overflowed this card at 375px. */}
                  <MonthlyBarSeries
                    bars={reported.spendTrend12w.map((cents, i) => ({
                      label: `W${i + 1}`,
                      value: Math.round(cents / 100),
                      highlighted: i === reported.spendTrend12w!.length - 1,
                    }))}
                    fillWidth
                    color="emerald"
                    ariaLabel="Reported weekly ad spend over the last 12 weeks"
                  />
                </Card>
              )}
            </>
          )}
        </section>

        {/* ─── Measured by WeFixTrades ───────────────────────────────── */}
        <section className="flex flex-col gap-2" aria-labelledby="adflow-measured-heading">
          <div className="flex flex-col text-left">
            <h3
              id="adflow-measured-heading"
              className="text-sm font-semibold text-foreground"
            >
              Measured by WeFixTrades
            </h3>
            <p className="text-xs text-muted-foreground">
              Counted by us, not reported to us.
            </p>
          </div>

          {!measured?.supported ? (
            <Card
              className="flex flex-col items-start gap-1.5 p-5 text-left"
              data-testid="adflow-measured-unavailable"
            >
              <p className="text-sm font-medium text-foreground">
                Nothing measurable on your account yet
              </p>
              <p className="max-w-xl text-xs text-muted-foreground">
                Put a WeFixTrades quote widget on the page your ads point at and
                we can count the quote requests your ads bring in. Until then the
                only figures we have are the ones your ads team reports.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Card
                className="flex flex-col gap-0.5 p-4 text-left"
                data-testid="adflow-measured-from-ads"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Quote requests from ads
                </span>
                <span className="text-2xl font-semibold text-foreground">
                  {count(measured.quoteRequestsFromAds)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Last {measured.windowDays} days. Counted only when the ad link
                  is tagged as paid traffic (utm_medium=cpc and similar), so
                  untagged ad clicks are missing from this figure.
                </span>
              </Card>
              <Card
                className="flex flex-col gap-0.5 p-4 text-left"
                data-testid="adflow-measured-total"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  All quote requests
                </span>
                <span className="text-2xl font-semibold text-foreground">
                  {count(measured.quoteRequestsTotal)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Last {measured.windowDays} days, from every source — ads,
                  search, direct and referral.
                </span>
              </Card>
            </div>
          )}
        </section>

        {/* ─── Charts, only when the series is real ──────────────────── */}
        {(monthlyIsReal || peakIsReal || segmentsAreReal) && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {monthlyIsReal && (
              <Card className="h-full p-4 text-left" data-testid="af-leads-monthly">
                <div className="mb-3 flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Leads reported per month
                  </span>
                </div>
                <MonthlyBarSeries
                  bars={monthlyStats!.data}
                  fillWidth
                  lede={`${monthlyStats!.data[monthlyStats!.data.length - 1]?.value ?? 0}`}
                  caption={(() => {
                    const bars = monthlyStats!.data;
                    const cur = bars[bars.length - 1]?.value ?? 0;
                    const prev = bars[bars.length - 2]?.value ?? 0;
                    if (prev === 0) return "No prior month to compare against";
                    const delta = ((cur - prev) / prev) * 100;
                    return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs prior month`;
                  })()}
                  color="emerald"
                  ariaLabel="AdFlow leads reported per month"
                />
              </Card>
            )}

            {peakIsReal && (
              <AdvancedOnly product="adflow" elementId="adflow.peak-roas-sparkline">
                <Card className="h-full p-4 text-left" data-testid="af-peak-roas-sparkline">
                  <div className="mb-3 flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Weekly reported revenue minus spend
                    </span>
                  </div>
                  <SparklineWithPeak
                    data={peakStats!.data}
                    color="violet"
                    fillWidth
                    height={140}
                    ariaLabel="Reported weekly revenue minus spend over the last 12 weeks"
                  />
                </Card>
              </AdvancedOnly>
            )}

            {segmentsAreReal && (
              <AdvancedOnly product="adflow" elementId="adflow.spend-by-platform-donut">
                <Card className="h-full p-4 text-left" data-testid="af-spend-by-platform-donut">
                  <div className="mb-3 flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Reported ad spend by platform
                    </span>
                  </div>
                  <DonutChart
                    segments={segmentStats!.data}
                    size={160}
                    fillWidth
                    formatValue={(n) => `$${n.toLocaleString()}`}
                    ariaLabel="Reported ad spend by platform"
                  />
                </Card>
              </AdvancedOnly>
            )}
          </div>
        )}

        {/* Quick-action row */}
        <Card className="flex flex-col gap-2 p-4 text-left">
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-foreground">
              Ask your ads team
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Each button files a request. Nothing changes on a live campaign
              until a person actions it.
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
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {a.label}
                  </span>
                  <span className="whitespace-normal text-[11px] font-normal text-muted-foreground">
                    {a.description}
                  </span>
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Campaign cards */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col text-left">
            <h3 className="text-sm font-semibold text-foreground">
              Your campaigns
            </h3>
            <p className="text-xs text-muted-foreground">
              As reported by your ads team for the latest period.
            </p>
          </div>
          {campaigns.length === 0 ? (
            <Card className="flex flex-col items-start gap-2 p-5 text-left">
              <p className="text-sm font-medium text-foreground">
                {hasService
                  ? "No campaigns reported yet"
                  : "AdFlow isn't set up yet"}
              </p>
              <p className="max-w-xl text-xs text-muted-foreground">
                {hasService
                  ? "Once your ads team reports a period's campaign breakdown, each campaign appears here with its reported spend and leads."
                  : "Take the 3-question setup wizard — under 5 minutes — so we can brief the agency."}
              </p>
              <Button asChild size="sm" data-testid="empty-state-setup">
                <Link href="/portal/adflow/setup">
                  Start setup
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  platform={c.platform}
                  status={c.status}
                  periodLabel={c.periodLabel}
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

        {/* AI ad-copy composer — drafts copy for the ads team to run. */}
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
      </div>
    </PortalLayout>
  );
}

/* ─── Reported tile ──────────────────────────────────────────────────── */

function ReportedTile({
  label,
  value,
  delta,
  priorLabel,
  testId,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  priorLabel?: string | null;
  testId: string;
  className?: string;
}) {
  const showDelta = typeof delta === "number";
  const positive = showDelta && delta! >= 0;
  return (
    <Card
      className={`flex flex-col gap-0.5 p-3 text-left ${className ?? ""}`}
      data-testid={testId}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          value === NOT_REPORTED
            ? "text-sm font-medium text-muted-foreground"
            : "text-xl font-semibold text-foreground"
        }
      >
        {value}
      </span>
      {showDelta && (
        // Direction is carried by the arrow and the sign, not by colour: the
        // chart-2 / destructive tints fell to 3.9:1 and 2.9:1 on the card
        // background in light mode, under the 4.5:1 AA floor for 11px text.
        <span className="text-[11px] font-medium text-foreground">
          <span aria-hidden="true">{positive ? "↑" : "↓"}</span>{" "}
          {positive ? "+" : ""}
          {delta}%{" "}
          <span className="font-normal text-muted-foreground">
            vs {priorLabel ?? "prior period"}
          </span>
        </span>
      )}
    </Card>
  );
}
