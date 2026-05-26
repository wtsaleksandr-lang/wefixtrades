/**
 * /portal/rankflow/dashboard — Wave 24 RankFlow UI upgrade.
 *
 * Customer-facing dashboard built on Wave 22A primitives + Wave 24 bespoke
 * RankFlow components. The existing /portal/rankflow (PortalRankFlow.tsx)
 * remains the monthly-status report; this new surface is the live
 * "AI brain" view.
 *
 * 8 enhancements per WORKSTREAMS/ui-upgrade-roadmap.md:
 *   1. PipelineStrip (Queued → Generating → Review → Published → Tracking)
 *   2. ContentScoreCard (gauge + letter grade hybrid)
 *   3. AnimatedCounter rank tiles with delta arrows
 *   4. CompetitorCard grid (your rank vs top SERP result)
 *   5. KeywordOpportunityHeatmap (keyword × location)
 *   6. Semi-circular KpiGauge (site SEO score + targets)
 *   7. AIBrainPanel (reasoning + 1-click action)
 *   8. Activity feed (StatusPill-driven timeline)
 *
 * Backend:
 *   GET  /api/portal/rankflow/dashboard-kpis
 *   GET  /api/portal/rankflow/competitor-comparison
 *   GET  /api/portal/rankflow/ai-brain
 *   POST /api/portal/rankflow/ai-brain/dispatch
 *   GET  /api/portal/rankflow/activity-feed
 *
 * All polling is 30s. No WebSockets per anti-patterns rule.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  TrendingUp,
  MapPin,
  Search,
  Globe,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AnimatedCounter,
  KpiGauge,
  PipelineStrip,
  ProgressRing,
  StatusPill,
  type PipelineStripStage,
  type PipelineStripStatus,
  type StatusPillStatus,
} from "@/components/ui/visual-primitives";
import { ContentScoreCard } from "@/components/rankflow/ContentScoreCard";
import { CompetitorCard } from "@/components/rankflow/CompetitorCard";
import {
  KeywordOpportunityHeatmap,
  type HeatmapRow,
} from "@/components/rankflow/KeywordOpportunityHeatmap";
import {
  AIBrainPanel,
  type AIBrainRecommendation,
} from "@/components/rankflow/AIBrainPanel";
import { getMetricMeta } from "@shared/copilot/metricRegistry";

/* Wave 26.6: registry-driven gauge meta. Same strings the Copilot reads. */
const META = {
  avgPosition: getMetricMeta("rankflow", "avgPosition")!,
  keywordsImproved: getMetricMeta("rankflow", "keywordsImproved")!,
  seoScore: getMetricMeta("rankflow", "seoScore")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    keywordsTracked: number;
    keywordsTop10: number;
    keywordsTop20: number;
    keywordsImproved: number;
    avgPosition: number;
    pagesIndexed: number;
    pagesTotal: number;
    seoScore: number;
    previousSeoScore: number;
  };
  pipeline: {
    queued: number;
    generating: number;
    review: number;
    published: number;
    tracking: number;
  };
}

interface CompetitorComparisonResponse {
  previewMode?: boolean;
  cards: Array<{
    keywordId: number;
    keyword: string;
    yourPosition: number | null;
    previousPosition: number | null;
    topCompetitor: {
      position: number;
      title: string;
      url: string;
      headings: string[];
    } | null;
    rationale: {
      competitorWordCount: number;
      missingTerms: string[];
      commonHeadings: string[];
    } | null;
  }>;
}

interface AiBrainResponse {
  previewMode?: boolean;
  recommendations: AIBrainRecommendation[];
}

interface ActivityFeedResponse {
  previewMode?: boolean;
  items: Array<{
    id: string;
    kind: string;
    pillStatus: StatusPillStatus;
    title: string;
    detail: string;
    occurredAt: string;
  }>;
}

/* ─── Pipeline stage definition ──────────────────────────────────────── */

const STAGE_DEFS: Array<{
  id: keyof DashboardKpisResponse["pipeline"];
  label: string;
}> = [
  { id: "queued", label: "Queued" },
  { id: "generating", label: "Generating" },
  { id: "review", label: "Review" },
  { id: "published", label: "Published" },
  { id: "tracking", label: "Tracking" },
];

function highlightStage(
  pipeline: DashboardKpisResponse["pipeline"],
): string | undefined {
  let bestId: string | undefined;
  let best = -1;
  for (const s of STAGE_DEFS) {
    const n = pipeline[s.id] ?? 0;
    if (n > best) {
      best = n;
      bestId = s.id;
    }
  }
  return best > 0 ? bestId : undefined;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function RankFlowDashboard() {
  usePageTitle("RankFlow — Dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/rankflow/dashboard-kpis"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/rankflow/dashboard-kpis");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const compQuery = useQuery<CompetitorComparisonResponse>({
    queryKey: ["/api/portal/rankflow/competitor-comparison"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/portal/rankflow/competitor-comparison",
      );
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const brainQuery = useQuery<AiBrainResponse>({
    queryKey: ["/api/portal/rankflow/ai-brain"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/rankflow/ai-brain");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const feedQuery = useQuery<ActivityFeedResponse>({
    queryKey: ["/api/portal/rankflow/activity-feed"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/rankflow/activity-feed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({
      topic,
      targetKeyword,
    }: {
      topic: string;
      targetKeyword: string;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/portal/rankflow/ai-brain/dispatch",
        { topic, targetKeyword },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Article queued",
        description: "RankFlow will start generating shortly.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/rankflow/dashboard-kpis"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/rankflow/activity-feed"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/rankflow/ai-brain"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not queue article",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const kpis = kpisQuery.data?.kpis;
  const pipeline = kpisQuery.data?.pipeline ?? {
    queued: 0,
    generating: 0,
    review: 0,
    published: 0,
    tracking: 0,
  };

  const pipelineStages: PipelineStripStage[] = STAGE_DEFS.map((s) => {
    const count = pipeline[s.id] ?? 0;
    let status: PipelineStripStatus;
    if (count === 0) status = "idle";
    else if (s.id === "published" || s.id === "tracking") status = "complete";
    else status = "active";
    return { id: s.id, label: s.label, count, status };
  });
  const currentHighlight = highlightStage(pipeline);

  /* ─── Heatmap: keywords × first 3 locations (best-effort) ────────── */
  const heatmap = useMemo<{
    locations: string[];
    rows: HeatmapRow[];
  }>(() => {
    const cards = compQuery.data?.cards ?? [];
    if (cards.length === 0) return { locations: [], rows: [] };
    // We don't have per-location ranks on the API yet (single-location
    // tracking is the current MVP). To demonstrate the heatmap pattern
    // without a synthetic table, render one column "Primary area" and a
    // row per keyword. When per-location data arrives this expands
    // without UI changes.
    const locations = ["Primary area"];
    const rows: HeatmapRow[] = cards.map((c) => ({
      keyword: c.keyword,
      cells: [{ position: c.yourPosition }],
    }));
    return { locations, rows };
  }, [compQuery.data]);

  const competitorCards = compQuery.data?.cards ?? [];
  const recommendations = brainQuery.data?.recommendations ?? [];
  const feedItems = feedQuery.data?.items ?? [];

  return (
    <PortalLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">RankFlow</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Done-for-you SEO. Watch the AI brain choose, write, and rank.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/rankflow">Monthly report</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/articles">
                <Search className="h-4 w-4 mr-2" />
                Articles
              </Link>
            </Button>
          </div>
        </div>

        {/* 1. Pipeline strip */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Content pipeline</div>
              <div className="text-xs text-muted-foreground">
                From keyword to published page — and into rank tracking.
              </div>
            </div>
          </div>
          <PipelineStrip
            stages={pipelineStages}
            highlightCurrent={currentHighlight}
          />
        </Card>

        {/* 3 + 6. Animated counter tiles + semi-circular SEO gauge + score card */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
              Live rank stats
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CounterTile
                icon={<Search className="h-4 w-4" />}
                label="Keywords tracked"
                value={kpis?.keywordsTracked ?? 0}
              />
              <CounterTile
                icon={<TrendingUp className="h-4 w-4" />}
                label="Top 10"
                value={kpis?.keywordsTop10 ?? 0}
                accent="green"
              />
              <CounterTile
                icon={<MapPin className="h-4 w-4" />}
                label="Top 20"
                value={kpis?.keywordsTop20 ?? 0}
                accent="amber"
              />
              <CounterTile
                icon={<Globe className="h-4 w-4" />}
                label="Pages indexed"
                value={kpis?.pagesIndexed ?? 0}
                accent="blue"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <KpiGauge
                value={Math.round((kpis?.avgPosition ?? 0) * 10) / 10}
                min={1}
                max={50}
                label={META.avgPosition.label}
                size="md"
                palette="sapphire"
                helpText={META.avgPosition.helpText}
                improvementTips={META.avgPosition.improvementTips}
                emptyState={(kpis?.avgPosition ?? 0) === 0}
              />
              {/* Wave 26.7 polish-mix: "X of Y" pattern → ProgressRing */}
              <div className="flex justify-center" data-testid="rf-tile-keywords-improved">
                <ProgressRing
                  value={kpis?.keywordsImproved ?? 0}
                  max={Math.max(1, kpis?.keywordsTracked ?? 10)}
                  unit={`of ${kpis?.keywordsTracked ?? 0}`}
                  label={META.keywordsImproved.label}
                  size="md"
                  color="emerald"
                  helpText={META.keywordsImproved.helpText}
                  improvementTips={META.keywordsImproved.improvementTips}
                  emptyState={(kpis?.keywordsImproved ?? 0) === 0}
                />
              </div>
              <KpiGauge
                value={kpis?.seoScore ?? 0}
                max={100}
                label={META.seoScore.label}
                size="md"
                palette="amber"
                targetThreshold={80}
                helpText={META.seoScore.helpText}
                improvementTips={META.seoScore.improvementTips}
                emptyState={(kpis?.seoScore ?? 0) === 0}
              />
            </div>
          </Card>
          <ContentScoreCard
            score={kpis?.seoScore ?? 0}
            targetThreshold={80}
            totalTerms={kpis?.keywordsTracked}
            termsUsed={kpis?.keywordsTop20}
            missingTerms={[]}
            missingHeadings={[]}
            title="SEO score"
            description="Hybrid grade × numeric"
            size="md"
            className="self-start min-w-[280px]"
          />
        </div>

        {/* 7. AI brain panel */}
        <AIBrainPanel
          recommendations={recommendations}
          isLoading={brainQuery.isLoading}
          onDispatch={async ({ topic, targetKeyword }) => {
            await dispatchMutation.mutateAsync({ topic, targetKeyword });
          }}
        />

        {/* 4. Competitor comparison grid */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Competitor comparison</div>
              <div className="text-xs text-muted-foreground">
                Your position vs the top SERP result for each tracked keyword.
              </div>
            </div>
          </div>
          {competitorCards.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No tracked keywords yet — add some to compare against competitors.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {competitorCards.slice(0, 6).map((c) => (
                <CompetitorCard
                  key={c.keywordId}
                  keyword={c.keyword}
                  yourPosition={c.yourPosition}
                  previousPosition={c.previousPosition}
                  topCompetitor={c.topCompetitor}
                  rationale={c.rationale}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 5. Keyword opportunity heatmap */}
        <KeywordOpportunityHeatmap
          locations={heatmap.locations}
          rows={heatmap.rows}
        />

        {/* 8. Activity feed */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Activity feed</div>
                <div className="text-xs text-muted-foreground">
                  Recent publishes, rank moves, and SEO work.
                </div>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/portal/rankflow">
                Full report
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
          {feedItems.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No activity yet — once RankFlow starts publishing, events will appear here.
            </div>
          ) : (
            <ul className="space-y-2">
              {feedItems.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start gap-3 rounded-md border p-2"
                  data-testid={`feed-item-${it.id}`}
                >
                  <StatusPill status={it.pillStatus} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={it.title}>
                      {it.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.detail}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {relativeTime(it.occurredAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PortalLayout>
  );
}

/* ─── Local CounterTile (animated number + label) ────────────────────── */

function CounterTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: "green" | "amber" | "blue";
}) {
  const accentClass =
    accent === "green"
      ? "text-[hsl(var(--chart-2))]"
      : accent === "amber"
        ? "text-[hsl(var(--chart-4))]"
        : accent === "blue"
          ? "text-[hsl(var(--chart-1))]"
          : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>
        <AnimatedCounter value={value} />
      </div>
    </div>
  );
}
