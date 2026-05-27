/**
 * /portal/contentflow/dashboard — Wave 23 ContentFlow UI upgrade.
 *
 * Hero customer-facing dashboard built on Wave 22A/22B/22C shared primitives:
 *   1. Drag-drop content calendar tab (VisualCalendar — Wave 22B)
 *   2. 4 animated KPI gauges (KpiGauge — Wave 22A)
 *   3. Animated pipeline strip (PipelineStrip — Wave 22A)
 *   4. Trade-niche template gallery link (existing prompt library)
 *   5. AI co-pilot suggestions panel — surfaced inside the existing approval
 *      editor (see PortalArticles); this dashboard links to it.
 *   6. AI-detection trust gauge — small KpiGauge per recent card
 *   7. Recent creations grid
 *   8. Onboarding walkthrough (OnboardingWalkthrough — Wave 22A)
 *
 * Pure additive. The existing prompt library at /portal/contentflow remains
 * untouched; this dashboard is reachable at /portal/contentflow/dashboard.
 *
 * Backend:
 *   GET /api/portal/contentflow/dashboard-kpis  — 4 KPI numbers + stage counts
 *   GET /api/portal/contentflow/pipeline        — existing, used for calendar
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  MoreHorizontal,
  Wand2,
} from "lucide-react";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AnimatedCounter,
  KpiGauge,
  LetterGradeBadge,
  PipelineStrip,
  ProgressRing,
  Sparkline,
  StatusPill,
  VisualCalendar,
  OnboardingWalkthrough,
  type PipelineStripStage,
  type PipelineStripStatus,
  type CalendarEntry,
  type CalendarEntryStatus,
  type WalkthroughStep,
  type StatusPillStatus,
} from "@/components/ui/visual-primitives";
import { getMetricMeta } from "@shared/copilot/metricRegistry";

/* Wave 26.6: single source of truth for the dashboard gauge meta. Same
 * strings the Copilot reads, so explanations never drift. */
const META = {
  articlesThisMonth: getMetricMeta("contentflow", "articlesThisMonth")!,
  approvalRate: getMetricMeta("contentflow", "approvalRate")!,
  detectionScore: getMetricMeta("contentflow", "detectionScore")!,
  distributionReach: getMetricMeta("contentflow", "distributionReach")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    articlesThisMonth: number;
    articlesQuota: number;
    approvalRate: number;          // 0..100
    detectionScore: number;        // 0..100 (already inverted: higher = safer)
    distributionReach: number;     // platform count last 30d
    /** Wave 26.7 — 14 daily counts (oldest first) for the Sparkline. */
    articlesHistory?: number[];
  };
  pipeline: {
    requested: number;
    generating: number;
    humanizing: number;
    quality_check: number;
    awaiting_approval: number;
    approved: number;
    published: number;
  };
  recent: Array<{
    id: number;
    title: string;
    thumbnailUrl: string | null;
    contentType: string;           // article | social_post | image | video
    status: string;                // draft | scheduled | approved | published | failed | in_progress
    trade: string | null;
    aiDetectionScore: number | null; // 0..100 human-likeness (already inverted)
    createdAt: string;
    scheduledFor: string | null;
  }>;
}

interface PipelineApiResponse {
  items: Array<{
    requestId: string;
    type: string;
    topic: string;
    currentStage: string;
    payload?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

const STAGE_TO_PIPELINE: Array<{
  id: string;
  label: string;
  countKey: keyof DashboardKpisResponse["pipeline"];
}> = [
  { id: "requested", label: "Generated", countKey: "requested" },
  { id: "humanizing", label: "Humanized", countKey: "humanizing" },
  { id: "quality_check", label: "Quality-gated", countKey: "quality_check" },
  { id: "awaiting_approval", label: "Awaiting approval", countKey: "awaiting_approval" },
  { id: "approved", label: "Approved", countKey: "approved" },
  { id: "published", label: "Published", countKey: "published" },
];

function mapPipelineToCalendarEntries(items: PipelineApiResponse["items"]): CalendarEntry[] {
  return items.map((it) => {
    const sched = (it.payload as any)?.scheduled_for ?? (it.payload as any)?.scheduled_at;
    const date = sched ? new Date(sched) : new Date(it.createdAt);
    const status: CalendarEntryStatus =
      it.currentStage === "approved" ? "approved"
      : it.currentStage === "published" ? "published"
      : it.currentStage === "failed" ? "failed"
      : it.currentStage === "requested" ? "draft"
      : "in_progress";
    const channelColor =
      it.type === "article" ? "hsl(var(--chart-1))"
      : it.type === "social_post" ? "hsl(var(--chart-2))"
      : it.type === "image" ? "hsl(var(--chart-4))"
      : "hsl(var(--chart-5))";
    return {
      id: it.requestId,
      date,
      title: it.topic || "(untitled)",
      thumbnailUrl: ((it.payload as any)?.thumbnail_url as string | undefined) ?? undefined,
      channelColor,
      status,
      contentType: it.type,
    };
  });
}

function statusForCard(status: string): StatusPillStatus {
  switch (status) {
    case "draft": return "draft";
    case "scheduled": return "scheduled";
    case "approved": return "approved";
    case "published": return "published";
    case "failed": return "failed";
    default: return "in_progress";
  }
}

function highlightStage(pipeline: DashboardKpisResponse["pipeline"]): string {
  const entries = STAGE_TO_PIPELINE.map((s) => ({
    id: s.id,
    count: pipeline[s.countKey] ?? 0,
  }));
  const top = entries.reduce((a, b) => (b.count > a.count ? b : a), { id: "", count: -1 });
  return top.id;
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

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    target: "[data-tour='cf-kpis']",
    title: "Your AI content factory",
    content: "Live numbers from your last 30 days — articles published, approval rate, AI-detection safety, and the platforms you reach.",
    placement: "bottom",
  },
  {
    target: "[data-tour='cf-pipeline']",
    title: "Watch the production line",
    content: "Each piece moves from Generated → Humanized → Quality-gated → Approval → Published. The highlighted stage is where the queue is deepest.",
    placement: "bottom",
  },
  {
    target: "[data-tour='cf-style-link']",
    title: "Tune your voice once",
    content: "Set the tone, trade niche, and brand details that every generation inherits.",
    placement: "right",
  },
  {
    target: "[data-tour='cf-approvals-link']",
    title: "Approve before it ships",
    content: "Drafts arrive here. Edit, accept AI co-pilot suggestions, then approve to publish.",
    placement: "left",
  },
  {
    target: "[data-tour='cf-examples-link']",
    title: "See what we generate",
    content: "Real examples of articles, social posts, and images we've made for trades like yours.",
    placement: "top",
  },
];

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function PortalContentFlowDashboard() {
  usePageTitle("ContentFlow — Dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "calendar">("overview");

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/contentflow/dashboard-kpis"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/dashboard-kpis");
      return res.json();
    },
  });

  const pipelineQuery = useQuery<PipelineApiResponse>({
    queryKey: ["/api/portal/contentflow/pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/contentflow/pipeline");
      return res.json();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ requestId, date }: { requestId: string; date: Date }) => {
      const res = await apiRequest("PATCH", `/api/portal/contentflow/pipeline/${encodeURIComponent(requestId)}`, {
        scheduled_for: date.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/contentflow/pipeline"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not reschedule",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const calendarEntries = useMemo(
    () => mapPipelineToCalendarEntries(pipelineQuery.data?.items ?? []),
    [pipelineQuery.data],
  );

  const kpis = kpisQuery.data?.kpis;
  const pipeline = kpisQuery.data?.pipeline ?? {
    requested: 0, generating: 0, humanizing: 0, quality_check: 0,
    awaiting_approval: 0, approved: 0, published: 0,
  };
  const recent = kpisQuery.data?.recent ?? [];

  const pipelineStages: PipelineStripStage[] = STAGE_TO_PIPELINE.map((s) => {
    const count = pipeline[s.countKey] ?? 0;
    const status: PipelineStripStatus =
      count === 0 ? "idle"
      : s.id === "published" ? "complete"
      : "active";
    return { id: s.id, label: s.label, count, status };
  });
  const currentHighlight = highlightStage(pipeline);

  return (
    <PortalLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">ContentFlow</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your AI content factory — generate, approve, publish.
            </p>
          </div>
          {/* Wave 36 — single primary button + overflow per the universal header rule. */}
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/portal/contentflow">
                <Wand2 className="h-4 w-4 mr-2" />
                New from template
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More ContentFlow actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/portal/content-preferences" data-tour="cf-style-link">Content style</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/portal/articles" data-tour="cf-approvals-link">Approvals</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/portal/contentflow/examples" data-tour="cf-examples-link">Examples</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/portal/settings?tab=display">Show advanced</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs: Overview / Calendar */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Calendar
            </TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB ────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* 4 KPI gauges */}
            <Card className="p-4" data-tour="cf-kpis">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                Last 30 days
              </div>
              {/* Wave 26.7 polish-mix: 4 different primitives across the row
                  for visual rhythm — counter+spark / gauge / grade / ring. */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Articles This Month → AnimatedCounter + Sparkline */}
                <div
                  className="flex flex-col items-center justify-center text-center gap-2 min-h-[140px]"
                  data-testid="cf-tile-articles"
                >
                  <div
                    className="text-3xl font-semibold tabular-nums"
                    style={{ color: "hsl(var(--gauge-sapphire))" }}
                  >
                    <AnimatedCounter value={kpis?.articlesThisMonth ?? 0} />
                  </div>
                  {(kpis?.articlesHistory?.length ?? 0) > 0 && (
                    <Sparkline
                      values={kpis!.articlesHistory!}
                      width={120}
                      height={28}
                      color="auto"
                      variant="area"
                      ariaLabel={`${META.articlesThisMonth.label} — 14-day trend`}
                    />
                  )}
                  <div className="text-xs text-muted-foreground px-1">
                    {META.articlesThisMonth.label}
                    {kpis?.articlesQuota
                      ? ` (quota ${kpis.articlesQuota})`
                      : ""}
                  </div>
                </div>

                {/* Approval Rate → KpiGauge (kept semi-circular) */}
                <KpiGauge
                  value={kpis?.approvalRate ?? 0}
                  max={100}
                  unit="%"
                  label={META.approvalRate.label}
                  size="md"
                  palette="emerald"
                  targetThreshold={80}
                  helpText={META.approvalRate.helpText}
                  improvementTips={META.approvalRate.improvementTips}
                  emptyState={(kpis?.approvalRate ?? 0) === 0}
                />

                {/* AI-Detection Score → power-user; hidden in Simple mode (Wave 36). */}
                <AdvancedOnly product="contentflow">
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center text-center gap-2 min-h-[140px]",
                      (kpis?.detectionScore ?? 0) === 0 && "opacity-60",
                    )}
                    data-testid="cf-tile-detection"
                    title={META.detectionScore.helpText ?? undefined}
                  >
                    <LetterGradeBadge
                      score={kpis?.detectionScore ?? 0}
                      size="lg"
                      showScore={false}
                    />
                    <div className="text-xs tabular-nums text-muted-foreground">
                      <AnimatedCounter
                        value={kpis?.detectionScore ?? 0}
                        suffix=" / 100"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground px-1">
                      {META.detectionScore.label}
                    </div>
                  </div>
                </AdvancedOnly>

                {/* Distribution Reach → power-user; hidden in Simple mode (Wave 36). */}
                <AdvancedOnly product="contentflow">
                  <div className="flex justify-center">
                    <ProgressRing
                      value={kpis?.distributionReach ?? 0}
                      max={Math.max(kpis?.distributionReach ?? 5, 5)}
                      unit=""
                      label={META.distributionReach.label}
                      size="md"
                      color="violet"
                      helpText={META.distributionReach.helpText}
                      improvementTips={META.distributionReach.improvementTips}
                      emptyState={(kpis?.distributionReach ?? 0) === 0}
                    />
                  </div>
                </AdvancedOnly>
              </div>
            </Card>

            {/* Pipeline strip */}
            <Card className="p-4" data-tour="cf-pipeline">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Production pipeline</div>
                  <div className="text-xs text-muted-foreground">
                    Live counts across stages. Highlight = where your queue is deepest.
                  </div>
                </div>
              </div>
              <PipelineStrip stages={pipelineStages} highlightCurrent={currentHighlight} />
            </Card>

            {/* Recent creations grid — power-user surface, hidden in Simple mode (Wave 36). */}
            <AdvancedOnly product="contentflow">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Recent creations</div>
                  <div className="text-xs text-muted-foreground">
                    Latest pieces from your factory.
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/portal/articles">
                    View all
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>

              {recent.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No recent content yet — start one from a template.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {recent.slice(0, 8).map((r) => (
                    <Card key={r.id} className="overflow-hidden" data-testid={`recent-card-${r.id}`}>
                      <div className="relative bg-muted" style={{ aspectRatio: "24 / 9" }}>
                        {r.thumbnailUrl ? (
                          // eslint-disable-next-line jsx-a11y/alt-text
                          <img
                            src={r.thumbnailUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                            {r.contentType === "image" ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">
                          {r.title}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <StatusPill status={statusForCard(r.status)} />
                          {/* Wave 36 — per-card trust gauge removed (audit: duplicates the
                              hero AI-detection score and bloats every card). */}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{r.trade ?? r.contentType}</span>
                          <span>{relativeTime(r.createdAt)}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
            </AdvancedOnly>

            {/* Wave 36 — template-gallery hero card deleted per Wave 35 audit
                ("textbook overwhelming"). Auto-pick by trade is the default
                AI behavior; expose Browse-all as a single text link only. */}
            <div className="text-center">
              <Link
                href="/portal/contentflow"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                data-testid="cf-browse-templates-link"
              >
                Browse all templates
              </Link>
            </div>
          </TabsContent>

          {/* ─── CALENDAR TAB ────────────────────────────────────────── */}
          <TabsContent value="calendar" className="mt-4">
            <Card className="p-4">
              <VisualCalendar
                entries={calendarEntries}
                onEntryReschedule={async (id, newDate) => {
                  await rescheduleMutation.mutateAsync({ requestId: id, date: newDate });
                }}
                onSlotClick={() => {
                  toast({
                    title: "Create new content",
                    description: "Pick a template to schedule into this slot.",
                  });
                }}
                emptyStateMessage="Drag scheduled drafts here, or start one from the template gallery."
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Onboarding walkthrough (one-time per user via localStorage) */}
      <OnboardingWalkthrough
        steps={WALKTHROUGH_STEPS}
        storageKey="contentflow_onboarding_v1"
      />
    </PortalLayout>
  );
}
