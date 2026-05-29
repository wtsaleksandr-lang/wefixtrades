/**
 * /portal/mapguard/dashboard — Wave 27 MapGuard UI upgrade.
 *
 * Customer-facing dashboard built on Wave 22A/22B/22C primitives + Wave
 * 26.5/26.7 polish + new Wave 27 bespoke components (RankGridPulse,
 * CitationHealthRing, ActionsStack, CompetitorAlertFeed).
 *
 * The existing /portal/mapguard (PortalMapguard.tsx) remains the
 * customer's monthly visibility report; this new surface is the live
 * "operate from the van" dashboard.
 *
 * 8 enhancements per WORKSTREAMS/competitive-mapguard-research.md:
 *   1. Heatmap pulse animation on 7-day rank-change points
 *   2. Animated rank-position counters with delta arrows in grid cells
 *   3. Citation Health gauge — 3-arc Found / Missing / Inconsistent donut
 *   4. Animated "Actions to Take" Tinder-style swipe-dismiss stack
 *   5. Competitor outranking-you alert timeline
 *   6. Real-time rank-change push notifications (settings sub-page)
 *   7. 1-click action buttons attached to AI Insights recommendations
 *   8. Dashboard hero KPI row with mixed primitives (KpiGauge / ProgressRing /
 *      LetterGradeBadge / AnimatedCounter + Sparkline)
 *
 * Backend:
 *   GET   /api/portal/mapguard/dashboard-kpis      — 4 hero KPIs + grid + trend
 *   GET   /api/portal/mapguard/competitor-alerts   — competitor timeline
 *   POST  /api/portal/mapguard/run-action          — 1-click action runner
 *   GET   /api/portal/ai-insights                  — actions stack data
 *
 * All polling is 60s. No WebSockets per anti-patterns rule.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  MapPin,
  Settings,
  Shield,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AnimatedCounter,
  BarComparisonCard,
  DonutChart,
  KpiGauge,
  LetterGradeBadge,
  ProgressRing,
  Sparkline,
  SparklineWithPeak,
  type DonutSegment,
} from "@/components/ui/visual-primitives";
import { RankGridPulse, type RankGridCell } from "@/components/mapguard/RankGridPulse";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
// Wave 36 — CitationHealthRing import removed. Audit verdict: third citation
// representation on the page (alongside the hero LetterGradeBadge and the
// numeric breakdown). The hero badge is sufficient.
import {
  ActionsStack,
  type ActionId,
  type StackAction,
  type StackCard,
} from "@/components/mapguard/ActionsStack";
import {
  CompetitorAlertFeed,
  type CompetitorAlertEvent,
} from "@/components/mapguard/CompetitorAlertFeed";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import { IllustrativeDataBadge } from "@/components/portal/IllustrativeDataBadge";

/* Registry-driven metric meta — same strings the Copilot reads. */
const META = {
  avgRank: getMetricMeta("mapguard", "avgRank")!,
  top3Coverage: getMetricMeta("mapguard", "top3Coverage")!,
  citationHealth: getMetricMeta("mapguard", "citationHealth")!,
  gbpHealth: getMetricMeta("mapguard", "gbpHealth")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    avgRank: number;
    top3Coverage: number;
    citationHealth: {
      found: number;
      missing: number;
      inconsistent: number;
      grade: "A" | "B" | "C" | "D" | "F";
    };
    gbpHealth: number;
  };
  grid: RankGridCell[];
  gbpTrend14d: number[];
}

interface CompetitorAlertsResponse {
  previewMode?: boolean;
  events: CompetitorAlertEvent[];
}

interface AiInsightsAction {
  title: string;
  reasoning?: string;
  impact?: string;
  /** Optional 1-click verb attached to the recommendation. */
  action?: ActionId;
  /** Optional pass-through params. */
  params?: Record<string, string | number | boolean>;
}

interface AiInsightsResponse {
  previewMode?: boolean;
  actions: AiInsightsAction[];
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function MapGuardDashboard() {
  usePageTitle("MapGuard — Dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/mapguard/dashboard-kpis"],
    queryFn: async () => {
      const res = await fetch("/api/portal/mapguard/dashboard-kpis", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const alertsQuery = useQuery<CompetitorAlertsResponse>({
    queryKey: ["/api/portal/mapguard/competitor-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/portal/mapguard/competitor-alerts", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load competitor alerts");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const insightsQuery = useQuery<AiInsightsResponse>({
    queryKey: ["/api/portal/ai-insights"],
    queryFn: async () => {
      const res = await fetch("/api/portal/ai-insights", { credentials: "include" });
      if (!res.ok) {
        // 403 = no MapGuard sub. Render empty + upsell on the card.
        if (res.status === 403) return { actions: [] };
        throw new Error("Failed to load AI insights");
      }
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  /* ─── Wave 73a — real KPI stat endpoints ──────────────────────────── */
  type MgSegmentResponse = {
    data: DonutSegment[];
    data_status: "real" | "illustrative";
  };
  type MgPeakResponse = {
    data: number[];
    peakLabel: string;
    peakIndex: number;
    data_status: "real" | "illustrative";
  };
  const segmentStatsQuery = useQuery<MgSegmentResponse>({
    queryKey: ["portal", "mapguard", "stats", "segments"],
    queryFn: () =>
      fetch("/api/portal/mapguard/stats/segments", {
        credentials: "include",
      }).then((r) => r.json()),
  });
  const peakStatsQuery = useQuery<MgPeakResponse>({
    queryKey: ["portal", "mapguard", "stats", "peak"],
    queryFn: () =>
      fetch("/api/portal/mapguard/stats/peak", {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const runAction = useMutation({
    mutationFn: async (input: {
      cardId: string;
      action: ActionId;
      params?: Record<string, unknown>;
    }) => {
      const res = await apiRequest("POST", "/api/portal/mapguard/run-action", {
        actionId: input.cardId,
        action: input.action,
        params: input.params,
      });
      return res as unknown as {
        ok: boolean;
        redirectUrl?: string;
        message: string;
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Action triggered",
        description: data.message,
      });
      if (data.redirectUrl) {
        navigate(data.redirectUrl);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/portal/ai-insights"] });
    },
    onError: () => {
      toast({
        title: "Could not run action",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const dismissAction = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest(
        "POST",
        "/api/portal/ai-insights/dismiss-action",
        { title },
      );
      return res;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/ai-insights"] });
    },
  });

  const kpis = kpisQuery.data?.kpis;
  const previewMode =
    !!kpisQuery.data?.previewMode || !!insightsQuery.data?.previewMode;
  const grid = kpisQuery.data?.grid ?? [];
  const events = alertsQuery.data?.events ?? [];
  const emptyAlerts = events.length === 0 && (alertsQuery.data?.previewMode || !alertsQuery.isLoading);

  const stackCards: StackCard[] = (insightsQuery.data?.actions ?? []).slice(0, 5).map(
    (a) => ({
      id: a.title,
      title: a.title,
      reasoning: a.reasoning ?? "Recommended next step from your AI advisor.",
      impact: a.impact,
      action: a.action
        ? ({ id: a.action, label: "", params: a.params } as StackAction)
        : undefined,
    }),
  );

  /* ─── Wave 72 — derived series for new KPI primitives ───────────────── */

  // Clean vs flagged citations.
  const cleanCitations = kpis?.citationHealth.found ?? 0;
  const flaggedCitations =
    (kpis?.citationHealth.missing ?? 0) + (kpis?.citationHealth.inconsistent ?? 0);

  // Citation directory mix donut — Wave 73a: backed by /stats/segments.
  const citationDirectoryFallback: DonutSegment[] = useMemo(() => {
    const found = kpis?.citationHealth.found ?? 0;
    const missing = kpis?.citationHealth.missing ?? 0;
    const inconsistent = kpis?.citationHealth.inconsistent ?? 0;
    if (found + missing + inconsistent === 0) {
      return [
        { label: "Clean", value: 12 },
        { label: "Missing", value: 4 },
        { label: "Inconsistent", value: 3 },
      ];
    }
    return [
      { label: "Clean", value: found, color: "emerald" },
      { label: "Missing", value: missing, color: "crimson" },
      { label: "Inconsistent", value: inconsistent, color: "amber" },
    ];
  }, [kpis?.citationHealth]);
  const segmentStatsHasData = !!(
    segmentStatsQuery.data?.data && segmentStatsQuery.data.data.length > 0
  );
  const citationTotal =
    (kpis?.citationHealth.found ?? 0) +
    (kpis?.citationHealth.missing ?? 0) +
    (kpis?.citationHealth.inconsistent ?? 0);
  const citationDirectorySegments: DonutSegment[] = segmentStatsHasData
    ? segmentStatsQuery.data!.data
    : citationDirectoryFallback;
  // Wave K2: the donut shows the hardcoded synthetic mix only when both the
  // stat endpoint is empty AND there are no real citation counts to derive.
  const citationDirectoryUsingSynthetic = !segmentStatsHasData && citationTotal === 0;
  const citationDirectoryIllustrative =
    segmentStatsQuery.data?.data_status === "illustrative" ||
    citationDirectoryUsingSynthetic;

  // Best-ranking day across geo grid — Wave 73a: backed by /stats/peak. The
  // fallback here is the customer's *real* 14-day GBP trend, not synthetic, so
  // no illustrative badge when falling back to it.
  const geoBestDaySeries =
    peakStatsQuery.data?.data && peakStatsQuery.data.data.length > 0
      ? peakStatsQuery.data.data
      : kpisQuery.data?.gbpTrend14d ?? [];
  const geoBestDayIllustrative = peakStatsQuery.data?.data_status === "illustrative";

  return (
    <PortalLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              data-theme="light"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-blue"
            >
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                MapGuard
              </h1>
              <p className="text-sm text-muted-foreground">
                Live Google Maps visibility + recommended actions
              </p>
            </div>
          </div>
          {/* Wave 36 — per-product Alerts/Settings demoted to advanced; per cross-cutting
              cleanup #2, notification prefs live at /portal/settings#notifications. */}
          <AdvancedOnly product="mapguard" elementId="mapguard.header-actions">
            <div className="flex items-center gap-2">
              <Link href="/portal/mapguard/alert-settings">
                <Button variant="outline" size="sm">
                  <Bell className="mr-1 h-3.5 w-3.5" />
                  Alerts
                </Button>
              </Link>
              <Link href="/portal/mapguard">
                <Button variant="ghost" size="sm">
                  <Settings className="mr-1 h-3.5 w-3.5" />
                  Full report
                </Button>
              </Link>
            </div>
          </AdvancedOnly>
        </div>

        {previewMode && (
          <Card className="border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            Preview mode — sample data shown. Connect an active MapGuard
            subscription to populate this dashboard with your data.
          </Card>
        )}

        {/* Hero KPI row — mixed primitives per Wave 26.7 polish-mix */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-4">
          {/* 1. Avg rank — KpiGauge (lower=better, inverted palette via amber→emerald threshold) */}
          <Card
            className="flex h-full flex-col items-center justify-center gap-0.5 p-3"
            data-testid="mapguard-kpi-avg-rank"
          >
            <KpiGauge
              value={kpis?.avgRank ?? 0}
              min={0}
              max={20}
              label={META.avgRank.label}
              size="sm"
              palette={(kpis?.avgRank ?? 20) <= 5 ? "emerald" : (kpis?.avgRank ?? 20) <= 10 ? "amber" : "crimson"}
              helpText={META.avgRank.helpText}
              improvementTips={META.avgRank.improvementTips}
              emptyState={(kpis?.avgRank ?? 0) === 0}
            />
            <span className="text-[10px] text-muted-foreground/80">
              Lower is better
            </span>
          </Card>

          {/* 2. Top 3 coverage — power-user (Wave 36: duplicates avg rank). */}
          <AdvancedOnly product="mapguard" elementId="mapguard.top3-coverage-tile">
          <Card
            className="flex h-full flex-col items-center justify-center gap-0.5 p-3"
            data-testid="mapguard-kpi-top3"
          >
            <ProgressRing
              value={kpis?.top3Coverage ?? 0}
              max={100}
              unit="%"
              label={META.top3Coverage.label}
              size="sm"
              color="emerald"
              helpText={META.top3Coverage.helpText}
              improvementTips={META.top3Coverage.improvementTips}
              emptyState={(kpis?.top3Coverage ?? 0) === 0}
            />
            <span className="text-[10px] text-muted-foreground/80">
              of 25 grid pins
            </span>
          </Card>
          </AdvancedOnly>

          {/* 3. Citation health — power-user (Wave 36: SEO jargon). */}
          <AdvancedOnly product="mapguard" elementId="mapguard.citation-health-tile">
          <Card
            className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center"
            data-testid="mapguard-kpi-citation-health"
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title={META.citationHealth.helpText}
            >
              {META.citationHealth.label}
            </span>
            <LetterGradeBadge
              score={(() => {
                const total =
                  (kpis?.citationHealth.found ?? 0) +
                  (kpis?.citationHealth.missing ?? 0) +
                  (kpis?.citationHealth.inconsistent ?? 0);
                if (total === 0) return 0;
                return Math.round(
                  ((kpis?.citationHealth.found ?? 0) / total) * 100,
                );
              })()}
              size="md"
              showScore
            />
            <span className="text-[10px] text-muted-foreground/80">
              {kpis &&
              kpis.citationHealth.found +
                kpis.citationHealth.missing +
                kpis.citationHealth.inconsistent >
                0
                ? `${kpis.citationHealth.found}/${kpis.citationHealth.found + kpis.citationHealth.missing + kpis.citationHealth.inconsistent} directories clean`
                : "Awaiting first scan"}
            </span>
          </Card>
          </AdvancedOnly>

          {/* 4. GBP health — composite metric, hidden by default (Wave 36). */}
          <AdvancedOnly product="mapguard" elementId="mapguard.gbp-health-tile">
          <Card
            className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center"
            data-testid="mapguard-kpi-gbp-health"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {META.gbpHealth.label}
            </span>
            <span className="text-2xl font-semibold text-foreground">
              <AnimatedCounter
                value={kpis?.gbpHealth ?? 0}
                suffix="%"
                duration={900}
              />
            </span>
            <Sparkline
              values={kpisQuery.data?.gbpTrend14d ?? []}
              width={96}
              height={22}
              variant="area"
              color="auto"
              ariaLabel="14-day GBP health trend"
            />
            <span className="text-[10px] text-muted-foreground/80">
              14-day trend
            </span>
          </Card>
          </AdvancedOnly>
        </div>

        {/* Wave 72 — new KPI primitives row */}
        <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {/* Headline (Simple-mode visible) — clean vs flagged citations */}
          <Card className="p-4 h-full" data-testid="mg-clean-vs-flagged">
            <BarComparisonCard
              title="Clean vs flagged citations"
              items={[
                { label: "Clean", value: cleanCitations, color: "emerald" },
                { label: "Flagged", value: flaggedCitations, color: "crimson" },
              ]}
            />
          </Card>

          {/* Advanced — citation directory mix donut */}
          <AdvancedOnly product="mapguard" elementId="mapguard.citation-directory-donut">
            <Card className="p-4 h-full" data-testid="mg-citation-directory-donut">
              <div className="flex items-center justify-end gap-2 mb-2">
                <IllustrativeDataBadge show={citationDirectoryIllustrative} />
              </div>
              <DonutChart
                title="Citation directory mix"
                segments={citationDirectorySegments}
                size={130}
                ariaLabel="MapGuard citation directory mix"
              />
            </Card>
          </AdvancedOnly>

          {/* Advanced — best ranking day sparkline */}
          <AdvancedOnly product="mapguard" elementId="mapguard.best-rank-day-sparkline">
            <Card className="p-4 h-full" data-testid="mg-best-rank-day">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Best-ranking day (geo grid)
                </div>
                <IllustrativeDataBadge show={geoBestDayIllustrative} />
              </div>
              {geoBestDaySeries.length > 0 ? (
                <SparklineWithPeak
                  data={geoBestDaySeries}
                  color="sapphire"
                  width={280}
                  height={96}
                  ariaLabel="Best-ranking day across the geo grid"
                />
              ) : (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No rank data yet.
                </div>
              )}
            </Card>
          </AdvancedOnly>
        </div>

        {/* Main grid: rank heatmap + competitor feed on left, actions stack on right */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {/* Rank-grid heatmap */}
            <Card className="p-4" data-testid="mapguard-rank-grid-card">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    5×5 rank grid
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Cells pulse when rank changed in the last 7 days.
                  </p>
                </div>
                <Link href="/portal/mapguard">
                  <Button variant="ghost" size="sm">
                    Full report
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {/* Wave 36 — Citation Health Ring sibling deleted (was the third
                  citation representation on the page). The grid is now the
                  single dominant visual. */}
              <div className="flex flex-col items-center gap-4">
                <RankGridPulse
                  cells={grid}
                  selected={selectedCell}
                  onSelectCell={(c) => setSelectedCell({ row: c.row, col: c.col })}
                  emptyState={grid.length === 0}
                />
              </div>

              {/* Selected cell drill-down */}
              {selectedCell && grid.length > 0 && (
                <div
                  className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
                  data-testid="rank-cell-detail"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-foreground">
                    Pin ({selectedCell.row + 1},{selectedCell.col + 1})
                  </span>
                  <span className="text-muted-foreground">
                    {(() => {
                      const cell = grid.find(
                        (c) =>
                          c.row === selectedCell.row && c.col === selectedCell.col,
                      );
                      if (!cell || cell.rank == null) return "Not currently ranked.";
                      return `Current rank #${cell.rank}${
                        cell.delta7d
                          ? `, ${cell.delta7d > 0 ? "up" : "down"} ${Math.abs(cell.delta7d)} this week`
                          : ""
                      }.`;
                    })()}
                  </span>
                </div>
              )}

              {/* Wave 36 — mobile Citation Health Ring also deleted. */}
            </Card>

            {/* Competitor alert feed — power-user (Wave 36: reactive surface,
                delivered via push notifications by default). */}
            <AdvancedOnly product="mapguard" elementId="mapguard.competitor-alert-feed">
              <CompetitorAlertFeed
                events={events}
                emptyState={emptyAlerts}
                onSelect={(evt) =>
                  setSelectedCell({ row: evt.pin_row, col: evt.pin_col })
                }
              />
            </AdvancedOnly>
          </div>

          {/* Right rail — Actions stack */}
          <div>
            <ActionsStack
              cards={stackCards}
              previewMode={previewMode}
              onDismiss={async (cardId) => {
                await dismissAction.mutateAsync(cardId);
              }}
              onRunAction={async (cardId, action) => {
                await runAction.mutateAsync({
                  cardId,
                  action: action.id,
                  params: action.params,
                });
              }}
            />
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
