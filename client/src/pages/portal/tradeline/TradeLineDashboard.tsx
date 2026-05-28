/**
 * /portal/tradeline/dashboard — Wave 26 TradeLine UI upgrade.
 *
 * Customer-facing live operations dashboard built on Wave 22A primitives
 * plus the bespoke Wave 26 components (BookingFunnel, LiveCallMonitor,
 * SentimentHeatmap). The existing /portal/tradeline/* surfaces
 * (knowledge, voice, setup, chat-widget) remain unchanged.
 *
 * 6 enhancements per WORKSTREAMS/ui-upgrade-roadmap.md + competitive-tradeline-research.md:
 *   1. Animated call-volume counter (Wave 22A AnimatedCounter)
 *   2. Booking conversion funnel (new BookingFunnel)
 *   3. LIVE call monitor with waveform (new LiveCallMonitor — THE moat)
 *   4. Sentiment heatmap for transcripts (new SentimentHeatmap)
 *   5. Cost-per-booking gauge (Wave 22A KpiGauge)
 *   6. "No overage surprises" badge (added to /products/tradeline marketing
 *      page in EffortelProductPage.tsx — not on this dashboard)
 *
 * Backend (Wave 26):
 *   GET /api/portal/tradeline/dashboard-kpis
 *   GET /api/portal/tradeline/active-calls
 *   GET /api/portal/tradeline/sentiment/:callId
 *   GET /api/portal/tradeline/funnel
 *
 * Plus the existing GET /api/portal/tradeline/:csId/calls (Wave 12) for
 * the recent-calls list under the dashboard.
 *
 * Polling cadences:
 *  - dashboard-kpis  — 30s
 *  - funnel          — 60s
 *  - active-calls    — 5s  (THE live monitor)
 *  - recent calls    — 30s
 *
 * No raw hex, no hover-shift, semantic tokens only, 2px gaps. All
 * animations respect prefers-reduced-motion.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Settings,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import {
  BarComparisonCard,
  KpiGauge,
  MonthlyBarSeries,
  ProgressRing,
  SemiGauge,
  SparklineWithPeak,
  StatusPill,
  type MonthlyBar,
} from "@/components/ui/visual-primitives";
import { BookingFunnel } from "@/components/tradeline/BookingFunnel";
import {
  LiveCallMonitor,
  type ActiveCallSummary,
} from "@/components/tradeline/LiveCallMonitor";
import {
  SentimentHeatmap,
  type SentimentSegment,
} from "@/components/tradeline/SentimentHeatmap";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import { IllustrativeDataBadge } from "@/components/portal/IllustrativeDataBadge";

/* Wave 26.6: registry-driven gauge meta. Same strings the Copilot reads. */
const META = {
  answeredToday: getMetricMeta("tradeline", "answeredToday")!,
  bookingsThisMonth: getMetricMeta("tradeline", "bookingsThisMonth")!,
  callsToday: getMetricMeta("tradeline", "callsToday")!,
  costPerBooking: getMetricMeta("tradeline", "costPerBooking")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  empty?: boolean;
  kpis: {
    callsToday: number;
    callsYesterday: number;
    callsSameTimeLastWeek: number;
    answeredToday: number;
    missedToday: number;
    monthSubscriptionCost: number;
    bookingsThisMonth: number;
    costPerBooking: number;
    avgJobValue: number;
    estimatedMissedRevenue: number;
  };
}

interface FunnelResponse {
  previewMode?: boolean;
  empty?: boolean;
  funnel: {
    calls: number;
    qualified: number;
    bookings: number;
    completed: number;
    aggregateRevenue: number;
    windowLabel?: string;
  };
}

interface ActiveCallsResponse {
  previewMode?: boolean;
  empty?: boolean;
  calls: ActiveCallSummary[];
  upstreamError: string | null;
  lastEndedAgoMinutes: number | null;
}

interface RecentCallsResponse {
  calls: Array<{
    id: number;
    caller_number: string | null;
    outcome: string;
    duration_seconds: number;
    summary: string | null;
    started_at: string | null;
    created_at: string | null;
  }>;
}

interface SentimentResponse {
  callId: number;
  durationSeconds: number;
  segments: SentimentSegment[];
  empty?: boolean;
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function TradeLineDashboard() {
  usePageTitle("TradeLine — Dashboard");
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/tradeline/dashboard-kpis"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/tradeline/dashboard-kpis");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const funnelQuery = useQuery<FunnelResponse>({
    queryKey: ["/api/portal/tradeline/funnel"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/tradeline/funnel");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const activeCallsQuery = useQuery<ActiveCallsResponse>({
    queryKey: ["/api/portal/tradeline/active-calls"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/tradeline/active-calls");
      return res.json();
    },
    refetchInterval: 5_000,
  });

  const recentCallsQuery = useQuery<RecentCallsResponse>({
    queryKey: ["/api/portal/tradeline/recent-calls"],
    queryFn: async () => {
      // The recent-calls list uses the existing Wave 12 endpoint which
      // requires :clientServiceId. We pick the first one returned from
      // /api/portal/services for the customer; until we wire that, the
      // dashboard renders a graceful empty state. Future work: surface
      // a service picker in the header for multi-TradeLine customers.
      try {
        const servicesRes = await apiRequest("GET", "/api/portal/services");
        const services = (await servicesRes.json()) as { services?: Array<{ id: number; service_id: string }> };
        const tl = services.services?.find((s) => s.service_id.startsWith("tradeline"));
        if (!tl) return { calls: [] };
        const r = await apiRequest("GET", `/api/portal/tradeline/${tl.id}/calls?limit=10`);
        return r.json();
      } catch {
        return { calls: [] };
      }
    },
    refetchInterval: 30_000,
  });

  const sentimentQuery = useQuery<SentimentResponse>({
    queryKey: ["/api/portal/tradeline/sentiment", selectedCallId],
    enabled: selectedCallId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/portal/tradeline/sentiment/${selectedCallId}`,
      );
      return res.json();
    },
  });

  /* ─── Wave 73a — real KPI stat endpoints ──────────────────────────── */
  type TlScoreResponse = {
    value: number;
    verdict: string;
    advice: string;
    data_status: "real" | "illustrative";
  };
  type TlPeakResponse = {
    data: number[];
    peakLabel: string;
    peakIndex: number;
    data_status: "real" | "illustrative";
  };
  type TlMonthlyResponse = {
    data: MonthlyBar[];
    data_status: "real" | "illustrative";
  };
  const scoreStatsQuery = useQuery<TlScoreResponse>({
    queryKey: ["portal", "tradeline", "stats", "score"],
    queryFn: () =>
      fetch("/api/portal/tradeline/stats/score", { credentials: "include" }).then(
        (r) => r.json(),
      ),
  });
  const peakStatsQuery = useQuery<TlPeakResponse>({
    queryKey: ["portal", "tradeline", "stats", "peak"],
    queryFn: () =>
      fetch("/api/portal/tradeline/stats/peak", { credentials: "include" }).then(
        (r) => r.json(),
      ),
  });
  const monthlyStatsQuery = useQuery<TlMonthlyResponse>({
    queryKey: ["portal", "tradeline", "stats", "monthly"],
    queryFn: () =>
      fetch("/api/portal/tradeline/stats/monthly?months=6", {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const kpis = kpisQuery.data?.kpis;
  const funnel = funnelQuery.data?.funnel;
  const isAdmin = useMemo(() => {
    // The active-calls route only returns listenUrl when the user is admin.
    // We surface the "Listen in" button only when a listenUrl is present —
    // belt + suspenders with the route's server-side check.
    const c = activeCallsQuery.data?.calls?.[0];
    return c?.listenUrl != null;
  }, [activeCallsQuery.data]);

  /* ─── Wave 72 — derived series for new KPI primitives ───────────────── */

  // Customer Satisfaction Score — Wave 73a: backed by /stats/score.
  const csatScoreFallback = useMemo(() => {
    const calls = kpis?.callsToday ?? 0;
    const answered = kpis?.answeredToday ?? 0;
    const bookings = kpis?.bookingsThisMonth ?? 0;
    if (calls === 0 && bookings === 0) return 0;
    const answeredShare = calls > 0 ? (answered / calls) * 100 : 50;
    const bookingBonus = Math.min(20, bookings * 0.6);
    return Math.round(Math.min(100, Math.max(0, answeredShare * 0.85 + bookingBonus)));
  }, [kpis?.callsToday, kpis?.answeredToday, kpis?.bookingsThisMonth]);
  const csatScore = scoreStatsQuery.data?.value ?? csatScoreFallback;
  const csatIllustrative = scoreStatsQuery.data?.data_status === "illustrative";
  const csatVerdict =
    scoreStatsQuery.data?.verdict ??
    (csatScore >= 80 ? "Excellent" : csatScore >= 50 ? "Good, room to improve" : "Needs attention");
  const csatAdvice =
    scoreStatsQuery.data?.advice ??
    (csatScore >= 80
      ? "Customers are happy — keep response times tight."
      : csatScore >= 50
        ? "Focus on faster pickup times to push above 80."
        : "Many calls are going unanswered — review staffing and AI escalation rules.");

  // Peak call hour — Wave 73a: backed by /stats/peak (24-hour series).
  const peakCallHourFallback = useMemo(() => {
    const anchor = Math.max(kpis?.callsToday ?? 0, 1);
    const curve = [
      0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 1, 0.9,
      0.85, 0.8, 0.7, 0.65, 0.55, 0.4, 0.3, 0.25, 0.15, 0.1, 0.08,
    ];
    return curve.map((c) => Math.round(c * anchor));
  }, [kpis?.callsToday]);
  const peakCallHourSeries =
    peakStatsQuery.data?.data && peakStatsQuery.data.data.length > 0
      ? peakStatsQuery.data.data
      : peakCallHourFallback;
  const peakCallHourIllustrative =
    peakStatsQuery.data?.data_status === "illustrative";
  const peakCallHourLabels = [
    "12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a",
    "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p",
  ];

  // Calls per month — Wave 73a: backed by /stats/monthly.
  const callsMonthlyBarsFallback: MonthlyBar[] = useMemo(() => {
    const now = new Date();
    const labels: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString(undefined, { month: "short" }));
    }
    const anchor = Math.max((kpis?.callsToday ?? 0) * 22, 1);
    return labels.map((label, idx) => {
      const isCurrent = idx === labels.length - 1;
      const ratio = isCurrent ? 1 : 0.55 + idx * 0.08;
      return {
        label,
        value: Math.round(anchor * ratio),
        highlighted: isCurrent,
      };
    });
  }, [kpis?.callsToday]);
  const callsMonthlyBars: MonthlyBar[] =
    monthlyStatsQuery.data?.data && monthlyStatsQuery.data.data.length > 0
      ? monthlyStatsQuery.data.data
      : callsMonthlyBarsFallback;
  const callsMonthlyIllustrative =
    monthlyStatsQuery.data?.data_status === "illustrative";

  /* ─── Render ────────────────────────────────────────────────────────── */

  return (
    <PortalLayout>
      <div className="max-w-7xl space-y-4">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--border)] pb-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              TradeLine — Dashboard
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Live call activity, booking funnel, and cost-per-booking — at a glance.{" "}
              <Link href="/portal/tradeline/voice" className="underline">
                Voice settings
              </Link>
              {" · "}
              <Link href="/portal/tradeline/knowledge" className="underline">
                Knowledge base
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/portal/tradeline/setup">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" /> Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* ─── Hero KPI row (Wave 26.5 — KpiGauge w/ helpText + palette rotation) ── */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-4">
          <CallVolumeCard
            value={kpis?.callsToday ?? 0}
            yesterday={kpis?.callsYesterday ?? 0}
            sameTimeLastWeek={kpis?.callsSameTimeLastWeek ?? 0}
          />
          {/* Wave 26.7 polish-mix: "X of callsToday" → ProgressRing */}
          <Card
            className="flex h-full flex-col items-center justify-center gap-0.5 p-3"
            data-testid="kpi-answered-today"
          >
            <ProgressRing
              value={kpis?.answeredToday ?? 0}
              max={Math.max(1, kpis?.callsToday ?? 1)}
              unit={`of ${kpis?.callsToday ?? 0}`}
              label={META.answeredToday.label}
              size="sm"
              color="emerald"
              helpText={META.answeredToday.helpText}
              improvementTips={META.answeredToday.improvementTips}
              emptyState={(kpis?.answeredToday ?? 0) === 0}
            />
            <span className="text-[10px] text-muted-foreground/80">
              vs {kpis?.missedToday ?? 0} missed
            </span>
          </Card>
          <Card
            className="flex h-full flex-col items-center justify-center gap-0.5 p-3"
            data-testid="kpi-bookings-month"
          >
            <KpiGauge
              value={kpis?.bookingsThisMonth ?? 0}
              min={0}
              max={Math.max(30, (kpis?.bookingsThisMonth ?? 0) + 5)}
              label={META.bookingsThisMonth.label}
              size="sm"
              palette="violet"
              helpText={META.bookingsThisMonth.helpText}
              improvementTips={META.bookingsThisMonth.improvementTips}
              emptyState={(kpis?.bookingsThisMonth ?? 0) === 0}
            />
            <span className="text-[10px] text-muted-foreground/80">
              From AI-handled calls
            </span>
          </Card>
          {/* Cost-per-booking — power-user (Wave 36). */}
          <AdvancedOnly product="tradeline" elementId="tradeline.cost-per-booking-card">
            <CostPerBookingCard
              cost={kpis?.costPerBooking ?? 0}
              avgJobValue={kpis?.avgJobValue ?? 0}
              estimatedMissedRevenue={kpis?.estimatedMissedRevenue ?? 0}
              subscriptionCost={kpis?.monthSubscriptionCost ?? 0}
            />
          </AdvancedOnly>
        </div>

        {/* ─── Wave 72 — new KPI primitives row ────────────────────────── */}
        <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {/* Headline (Simple-mode visible) — CSAT SemiGauge */}
          <Card className="p-4 h-full flex flex-col items-center justify-center gap-2" data-testid="tl-csat-semigauge">
            <div className="self-end">
              <IllustrativeDataBadge show={csatIllustrative} />
            </div>
            <SemiGauge
              value={csatScore}
              max={100}
              label="Customer satisfaction"
              verdict={csatVerdict}
              advice={csatAdvice}
              unit=""
              size={200}
            />
          </Card>

          {/* Advanced — answered vs missed */}
          <AdvancedOnly product="tradeline" elementId="tradeline.answered-vs-missed-bars">
            <Card className="p-4 h-full" data-testid="tl-answered-vs-missed">
              <BarComparisonCard
                title="Answered vs missed today"
                items={[
                  { label: "Answered", value: kpis?.answeredToday ?? 0, color: "emerald" },
                  { label: "Missed", value: kpis?.missedToday ?? 0, color: "crimson" },
                ]}
              />
            </Card>
          </AdvancedOnly>

          {/* Advanced — peak call hour sparkline */}
          <AdvancedOnly product="tradeline" elementId="tradeline.peak-call-hour-sparkline">
            <Card className="p-4 h-full" data-testid="tl-peak-call-hour">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Peak call hour today
                </div>
                <IllustrativeDataBadge show={peakCallHourIllustrative} />
              </div>
              <SparklineWithPeak
                data={peakCallHourSeries}
                pointLabels={peakCallHourLabels}
                color="amber"
                width={260}
                height={96}
                ariaLabel="Hourly call volume with peak hour callout"
              />
            </Card>
          </AdvancedOnly>

          {/* Advanced — calls per month */}
          <AdvancedOnly product="tradeline" elementId="tradeline.calls-monthly-bars">
            <Card className="p-4 h-full" data-testid="tl-calls-monthly">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Calls per month
                </div>
                <IllustrativeDataBadge show={callsMonthlyIllustrative} />
              </div>
              <MonthlyBarSeries
                bars={callsMonthlyBars}
                color="sapphire"
                ariaLabel="TradeLine calls per month"
              />
            </Card>
          </AdvancedOnly>
        </div>

        {/* ─── Two-col layout: main + live monitor ────────────────────── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {/* Booking funnel */}
            <BookingFunnel
              data={{
                calls: funnel?.calls ?? 0,
                qualified: funnel?.qualified ?? 0,
                bookings: funnel?.bookings ?? 0,
                completed: funnel?.completed ?? 0,
                aggregateRevenue: funnel?.aggregateRevenue ?? 0,
                windowLabel: funnel?.windowLabel,
              }}
            />

            {/* Recent calls */}
            <Card className="p-4" data-testid="recent-calls-card">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recent calls
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  Click a row to view sentiment
                </span>
              </div>
              <RecentCallsList
                calls={recentCallsQuery.data?.calls ?? []}
                loading={recentCallsQuery.isLoading}
                selectedCallId={selectedCallId}
                onSelect={(id) => setSelectedCallId(id)}
              />
            </Card>

            {/* Sentiment heatmap — power-user analyst tool. */}
            <AdvancedOnly product="tradeline" elementId="tradeline.sentiment-heatmap">
              {selectedCallId != null && (
                <SentimentHeatmap
                  segments={sentimentQuery.data?.segments ?? []}
                  durationSeconds={sentimentQuery.data?.durationSeconds ?? 0}
                  onSeek={(sec) => {
                    // eslint-disable-next-line no-console
                    console.info("[TradeLine] seek requested", { sec, callId: selectedCallId });
                  }}
                />
              )}
            </AdvancedOnly>
          </div>

          {/* Right-rail: live monitor */}
          <LiveCallMonitor
            calls={activeCallsQuery.data?.calls ?? []}
            lastEndedAgoMinutes={activeCallsQuery.data?.lastEndedAgoMinutes ?? null}
            upstreamError={activeCallsQuery.data?.upstreamError ?? null}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </PortalLayout>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────── */

function CallVolumeCard({
  value,
  yesterday,
  sameTimeLastWeek,
}: {
  value: number;
  yesterday: number;
  sameTimeLastWeek: number;
}) {
  const delta = sameTimeLastWeek > 0 ? value - sameTimeLastWeek : 0;
  // Wave 26.5: Calls Today now uses KpiGauge so it gets help popover + boot
  // animation + palette rotation matching the rest of the row. Delta context
  // remains as the small caption below.
  return (
    <Card
      className="flex h-full flex-col items-center justify-center gap-0.5 p-3"
      data-testid="kpi-calls-today"
    >
      <KpiGauge
        value={value}
        min={0}
        max={Math.max(20, value + 5, sameTimeLastWeek + 5)}
        label={META.callsToday.label}
        size="sm"
        palette="sapphire"
        helpText={META.callsToday.helpText}
        improvementTips={META.callsToday.improvementTips}
        emptyState={value === 0}
      />
      <span className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
        <Phone className="h-3 w-3" aria-hidden="true" />
        Yesterday: {yesterday} · 7d ago: {sameTimeLastWeek}
        {delta !== 0 && (
          <span
            className={
              delta > 0
                ? "text-[hsl(var(--gauge-emerald))]"
                : "text-[hsl(var(--gauge-crimson))]"
            }
          >
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>
        )}
      </span>
    </Card>
  );
}

function CostPerBookingCard({
  cost,
  avgJobValue,
  estimatedMissedRevenue,
  subscriptionCost,
}: {
  cost: number;
  avgJobValue: number;
  estimatedMissedRevenue: number;
  subscriptionCost: number;
}) {
  const hasData = cost > 0;
  // Target threshold: 1/5 of avg job value (industry benchmark per research).
  // When avgJobValue isn't known, we default to a $50 target as a reasonable
  // anchor for trade businesses.
  const target = avgJobValue > 0 ? avgJobValue / 5 : 50;
  // Gauge max: 2× the target so 50% of the gauge sits at the target.
  const gaugeMax = Math.max(target * 2, cost * 1.2, 100);

  return (
    <Card
      className="flex h-full flex-col items-center gap-1 p-3 text-center"
      data-testid="kpi-cost-per-booking"
    >
      <span className="self-start text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Cost per booking
      </span>
      <KpiGauge
        value={hasData ? cost : 0}
        min={0}
        max={gaugeMax}
        label="$ per booking"
        unit=""
        targetThreshold={target}
        size="sm"
        palette="crimson"
        helpText={META.costPerBooking.helpText}
        improvementTips={META.costPerBooking.improvementTips}
        emptyState={!hasData}
        emptyStateMessage="Awaiting first booking — updates as bookings come in"
      />
      {!hasData && (
        <span className="mt-0.5 text-[10px] text-muted-foreground/60">
          ${subscriptionCost}/mo subscription
        </span>
      )}
      {estimatedMissedRevenue > 0 && (
        <span className="text-[10px] text-muted-foreground/80">
          If you'd missed those calls: ~${estimatedMissedRevenue} lost
        </span>
      )}
    </Card>
  );
}

function RecentCallsList({
  calls,
  loading,
  selectedCallId,
  onSelect,
}: {
  calls: RecentCallsResponse["calls"];
  loading: boolean;
  selectedCallId: number | null;
  onSelect: (id: number) => void;
}) {
  if (loading && calls.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground/80">
        Loading recent calls…
      </p>
    );
  }
  if (calls.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground/80">
        No calls yet. Once your AI receptionist handles its first call, it
        will appear here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-[2px]" data-testid="recent-calls-list">
      {calls.map((c) => {
        const isSelected = selectedCallId === c.id;
        const isMissed = ["missed", "voicemail", "failed"].includes(c.outcome);
        const callerLast4 = c.caller_number
          ? c.caller_number.replace(/\D/g, "").slice(-4)
          : "----";
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md border bg-muted/10 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--ring))] ${
                isSelected ? "ring-1 ring-[color:hsl(var(--ring))]" : ""
              }`}
              data-testid={`recent-call-${c.id}`}
            >
              <span className="flex items-center gap-2">
                {isMissed ? (
                  <PhoneMissed className="h-3.5 w-3.5 text-[hsl(var(--chart-5))]" aria-hidden="true" />
                ) : (
                  <PhoneIncoming className="h-3.5 w-3.5 text-[hsl(var(--chart-2))]" aria-hidden="true" />
                )}
                <span className="flex flex-col">
                  <span className="text-xs font-medium tabular-nums text-foreground">
                    *** {callerLast4}
                  </span>
                  <span className="text-[10px] text-muted-foreground/80">
                    {c.summary?.slice(0, 60) ?? "(no summary)"}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {Math.floor(c.duration_seconds / 60)}:{(c.duration_seconds % 60).toString().padStart(2, "0")}
                </span>
                <StatusPill
                  status={isMissed ? "failed" : "approved"}
                  label={c.outcome}
                />
                <ArrowUpRight className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
