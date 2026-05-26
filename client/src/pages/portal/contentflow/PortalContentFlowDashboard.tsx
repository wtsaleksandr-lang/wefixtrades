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
  Sparkles,
  Wand2,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  KpiGauge,
  PipelineStrip,
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
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" data-tour="cf-style-link">
              <Link href="/portal/content-preferences">Content style</Link>
            </Button>
            <Button asChild variant="outline" size="sm" data-tour="cf-approvals-link">
              <Link href="/portal/articles">Approvals</Link>
            </Button>
            <Button asChild variant="outline" size="sm" data-tour="cf-examples-link">
              <Link href="/portal/contentflow/examples">Examples</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/portal/contentflow">
                <Wand2 className="h-4 w-4 mr-2" />
                New from template
              </Link>
            </Button>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiGauge
                  value={kpis?.articlesThisMonth ?? 0}
                  max={Math.max(kpis?.articlesQuota ?? 10, kpis?.articlesThisMonth ?? 0, 1)}
                  label={META.articlesThisMonth.label}
                  size="md"
                  palette="sapphire"
                  targetThreshold={kpis?.articlesQuota}
                  helpText={META.articlesThisMonth.helpText}
                  improvementTips={META.articlesThisMonth.improvementTips}
                  emptyState={(kpis?.articlesThisMonth ?? 0) === 0}
                />
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
                <KpiGauge
                  value={kpis?.detectionScore ?? 0}
                  max={100}
                  label={META.detectionScore.label}
                  size="md"
                  palette="amber"
                  targetThreshold={80}
                  helpText={META.detectionScore.helpText}
                  improvementTips={META.detectionScore.improvementTips}
                  emptyState={(kpis?.detectionScore ?? 0) === 0}
                />
                <KpiGauge
                  value={kpis?.distributionReach ?? 0}
                  max={Math.max(kpis?.distributionReach ?? 5, 5)}
                  label={META.distributionReach.label}
                  size="md"
                  palette="violet"
                  helpText={META.distributionReach.helpText}
                  improvementTips={META.distributionReach.improvementTips}
                  emptyState={(kpis?.distributionReach ?? 0) === 0}
                />
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

            {/* Recent creations grid */}
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
                          {r.aiDetectionScore != null && (
                            <div
                              title="Higher = more human-like. Lower scores may flag as AI-generated."
                              data-testid="trust-gauge"
                            >
                              <KpiGauge
                                value={r.aiDetectionScore}
                                max={100}
                                label="Trust"
                                size="sm"
                                color="auto"
                              />
                            </div>
                          )}
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

            {/* Template gallery hint */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Browse the template gallery
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    1,800 trade-tuned prompts across 30 trades. Pick your niche, hit Generate.
                  </div>
                </div>
                <Button asChild variant="default" size="sm">
                  <Link href="/portal/contentflow">Open templates</Link>
                </Button>
              </div>
            </Card>
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
