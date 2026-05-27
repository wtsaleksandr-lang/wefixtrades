/**
 * /portal/reputationshield/dashboard — Wave 28 ReputationShield UI upgrade.
 *
 * Customer-facing dashboard built on Wave 22A/22B/22C primitives + Wave
 * 26.5/26.7 polish + new Wave 28 bespoke components (PlatformScorecard,
 * SentimentHeatmap, RequestFunnel, DaysSinceGauge).
 *
 * The big shared-primitive payoff: Wave 22C `ApprovalInbox` + `AIDraftEditor`
 * are finally consumed by their second product. No new inbox / draft-editor
 * code lives here — we just wire the existing primitives.
 *
 * 8 enhancements per WORKSTREAMS/competitive-reputationshield-research.md:
 *   1. Inbox-style review feed (uses Wave 22C ApprovalInbox)
 *   2. Multi-platform health scorecard with deltas
 *   3. Animated star-rating gauge (KpiGauge semi-circular)
 *   4. Sentiment heatmap (GitHub-style 12 weeks × 7 days)
 *   5. Review-request funnel (Sent → Clicked → Posted, honest stages)
 *   6. Days-since-last-review urgency gauge (genuine whitespace)
 *   7. Review-velocity counter with month-over-month delta + sparkline
 *   8. AI reply composer (Wave 22C AIDraftEditor)
 *
 * Backend:
 *   GET   /api/portal/reputationshield/dashboard-kpis
 *   GET   /api/portal/reputationshield/inbox
 *   GET   /api/portal/reputationshield/funnel
 *   POST  /api/portal/reputationshield/run-action
 *   POST  /api/portal/reputationshield/reviews/:id/reply
 *
 * All polling is 60s. No WebSockets per anti-patterns rule.
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  MailWarning,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AnimatedCounter,
  ApprovalInbox,
  AIDraftEditor,
  KpiGauge,
  Sparkline,
  type InboxAction,
  type InboxItem,
  type InboxItemStatus,
  type InboxItemSentiment,
} from "@/components/ui/visual-primitives";
import {
  PlatformScorecard,
  type PlatformStats,
  type ScorecardPlatform,
} from "@/components/reputationshield/PlatformScorecard";
import {
  SentimentHeatmap,
  type HeatmapCell,
} from "@/components/reputationshield/SentimentHeatmap";
// Wave 36 — RequestFunnel removed (audit: internal-team UI; deliberately deleted).
import type { FunnelStage } from "@/components/reputationshield/RequestFunnel";
import { DaysSinceGauge } from "@/components/reputationshield/DaysSinceGauge";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import { getMetricMeta } from "@shared/copilot/metricRegistry";

const META = {
  avgRating: getMetricMeta("reputationshield", "avgRating")!,
  reviewVelocity: getMetricMeta("reputationshield", "reviewVelocity")!,
  daysSinceLastReview: getMetricMeta(
    "reputationshield",
    "daysSinceLastReview",
  )!,
  replyRate: getMetricMeta("reputationshield", "replyRate")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    avgRating: number;
    reviewVelocity: {
      thisMonth: number;
      lastMonth: number;
      deltaPct: number;
    };
    daysSinceLastReview: number | null;
    replyRate: number;
  };
  scorecard: Record<ScorecardPlatform, PlatformStats>;
  heatmap: HeatmapCell[];
  velocityTrend12w: number[];
}

interface InboxResponse {
  previewMode?: boolean;
  items: Array<{
    id: string;
    platform: string;
    reviewer: string;
    rating: number;
    reviewText: string;
    publishedAt: string;
    status: InboxItemStatus;
    sentiment: InboxItemSentiment;
    responseText: string | null;
    draftResponse: string | null;
    draftModel: string | null;
    approvalStatus: string;
  }>;
}

interface FunnelResponse {
  previewMode?: boolean;
  windowDays: 7 | 30 | 90;
  stages: FunnelStage[];
  hasOpenTracking: boolean;
}

/* ─── Page ───────────────────────────────────────────────────────────── */

const CHANNEL_LABEL: Record<string, string> = {
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
  bbb: "BBB",
};

const CHANNEL_COLOR: Record<string, string> = {
  google: "hsl(var(--chart-1))",
  yelp: "hsl(var(--destructive))",
  facebook: "hsl(var(--chart-2))",
  bbb: "hsl(var(--chart-3))",
};

export default function ReputationShieldDashboard() {
  usePageTitle("ReputationShield — Dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [funnelWindow, setFunnelWindow] = useState<7 | 30 | 90>(30);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
  const [draftOpen, setDraftOpen] = useState<boolean>(false);

  /* ── Queries ──────────────────────────────────────────────────────── */

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/reputationshield/dashboard-kpis"],
    queryFn: async () => {
      const res = await fetch(
        "/api/portal/reputationshield/dashboard-kpis",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const inboxQuery = useQuery<InboxResponse>({
    queryKey: ["/api/portal/reputationshield/inbox"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputationshield/inbox", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load inbox");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const funnelQuery = useQuery<FunnelResponse>({
    queryKey: ["/api/portal/reputationshield/funnel", funnelWindow],
    queryFn: async () => {
      const res = await fetch(
        `/api/portal/reputationshield/funnel?window=${funnelWindow}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load funnel");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  /* ── Mutations ────────────────────────────────────────────────────── */

  const runAction = useMutation({
    mutationFn: async (input: {
      actionId: string;
      action:
        | "reply-to-review"
        | "request-reviews-batch"
        | "escalate-to-owner"
        | "flag-as-fake"
        | "acknowledge";
      params?: Record<string, string | number | boolean>;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/portal/reputationshield/run-action",
        input,
      );
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
      if (data.redirectUrl?.startsWith("http")) {
        window.open(data.redirectUrl, "_blank", "noopener");
      } else if (data.redirectUrl) {
        navigate(data.redirectUrl);
      }
    },
    onError: () => {
      toast({
        title: "Could not run action",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const saveReply = useMutation({
    mutationFn: async (input: { reviewId: string; reply: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/portal/reputationshield/reviews/${input.reviewId}/reply`,
        { reply: input.reply },
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/reputationshield/inbox"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/reputationshield/dashboard-kpis"],
      });
      toast({
        title: "Reply approved",
        description: "Posting to the platform within the next sync cycle.",
      });
      setDraftOpen(false);
    },
    onError: () => {
      toast({
        title: "Could not save reply",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  /* ── Derived ──────────────────────────────────────────────────────── */

  const kpis = kpisQuery.data?.kpis;
  const previewMode = !!(
    kpisQuery.data?.previewMode ||
    inboxQuery.data?.previewMode ||
    funnelQuery.data?.previewMode
  );

  const inboxItems: InboxItem[] = useMemo(() => {
    return (inboxQuery.data?.items ?? []).map((r) => ({
      id: r.id,
      kind: "review_reply",
      createdAt: new Date(r.publishedAt),
      status: r.status,
      authorName: r.reviewer,
      title: `${r.rating}-star review`,
      preview: r.reviewText || "(No review body — rating only.)",
      channelBadge: CHANNEL_LABEL[r.platform] ?? r.platform,
      channelColor: CHANNEL_COLOR[r.platform],
      rating: r.rating,
      sentiment: r.sentiment,
      metadata: {
        draftResponse: r.draftResponse ?? "",
        responseText: r.responseText ?? "",
        approvalStatus: r.approvalStatus,
      },
    }));
  }, [inboxQuery.data]);

  const selectedItem = useMemo(
    () => inboxItems.find((i) => i.id === selectedItemId) ?? null,
    [inboxItems, selectedItemId],
  );

  /* ── Inbox actions ────────────────────────────────────────────────── */

  const handleReply = useCallback((item: InboxItem) => {
    setSelectedItemId(item.id);
    setDraftOpen(true);
  }, []);

  const handleEscalate = useCallback(
    (item: InboxItem) => {
      runAction.mutate({
        actionId: `escalate-review-${item.id}`,
        action: "escalate-to-owner",
        params: { reviewId: item.id },
      });
    },
    [runAction],
  );

  const handleFlagFake = useCallback(
    (item: InboxItem) => {
      runAction.mutate({
        actionId: `flag-review-${item.id}`,
        action: "flag-as-fake",
        params: { reviewId: item.id },
      });
    },
    [runAction],
  );

  const handleArchive = useCallback(
    (item: InboxItem) => {
      runAction.mutate({
        actionId: `archive-review-${item.id}`,
        action: "acknowledge",
        params: { reviewId: item.id },
      });
    },
    [runAction],
  );

  const inboxActions: InboxAction[] = useMemo(
    () => [
      {
        id: "reply",
        label: "Reply",
        variant: "primary",
        shortcut: "e",
        icon: <Sparkles className="h-3.5 w-3.5" />,
        handler: handleReply,
      },
      {
        id: "escalate",
        label: "Escalate",
        variant: "secondary",
        shortcut: "m",
        icon: <MailWarning className="h-3.5 w-3.5" />,
        handler: handleEscalate,
      },
      {
        id: "flag",
        label: "Flag as fake",
        variant: "secondary",
        shortcut: "f",
        icon: <ShieldCheck className="h-3.5 w-3.5" />,
        handler: handleFlagFake,
      },
      {
        id: "archive",
        label: "Archive",
        variant: "ghost",
        shortcut: "x",
        icon: <X className="h-3.5 w-3.5" />,
        handler: handleArchive,
      },
    ],
    [handleReply, handleEscalate, handleFlagFake, handleArchive],
  );

  const requestBatch = useCallback(() => {
    runAction.mutate({
      actionId: "days-since-batch",
      action: "request-reviews-batch",
    });
  }, [runAction]);

  /* ── Render ───────────────────────────────────────────────────────── */

  const draftSeed =
    (selectedItem?.metadata?.draftResponse as string | undefined) ||
    (selectedItem
      ? `Thanks for the ${selectedItem.rating}-star review, ${selectedItem.authorName}!`
      : "");

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
              <Star className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                ReputationShield
              </h1>
              <p className="text-sm text-muted-foreground">
                Gmail-style inbox · AI draft replies · multi-platform health
              </p>
            </div>
          </div>
          {/* Wave 36 — per-product Notifications + Settings demoted; global prefs
              live at /portal/settings#notifications. */}
          <AdvancedOnly product="reputationshield" elementId="reputationshield.header-actions">
            <div className="flex items-center gap-2">
              <Link href="/portal/reputationshield/notifications">
                <Button variant="outline" size="sm">
                  <Bell className="mr-1 h-3.5 w-3.5" />
                  Notifications
                </Button>
              </Link>
              <Link href="/portal/reviews">
                <Button variant="ghost" size="sm">
                  <SettingsIcon className="mr-1 h-3.5 w-3.5" />
                  Settings
                </Button>
              </Link>
            </div>
          </AdvancedOnly>
        </div>

        {previewMode && (
          <Card className="border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            Preview mode — sample data shown. Connect an active
            ReputationShield subscription to populate this dashboard.
          </Card>
        )}

        {/* Hero KPI row — mixed primitives */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* 1. Avg rating — KpiGauge as 0-5 scale */}
          <Card
            className="flex flex-col items-center justify-center gap-0.5 p-3"
            data-testid="reputationshield-kpi-avg-rating"
          >
            <KpiGauge
              value={kpis?.avgRating ?? 0}
              min={0}
              max={5}
              label={META.avgRating.label}
              size="sm"
              palette={
                (kpis?.avgRating ?? 0) >= 4.5
                  ? "emerald"
                  : (kpis?.avgRating ?? 0) >= 3.5
                    ? "amber"
                    : "crimson"
              }
              helpText={META.avgRating.helpText}
              improvementTips={META.avgRating.improvementTips}
              emptyState={(kpis?.avgRating ?? 0) === 0}
            />
            <span className="text-[10px] text-muted-foreground/80">
              across 4 platforms
            </span>
          </Card>

          {/* 2. Review velocity — power-user (Wave 36: analyst-speak). */}
          <AdvancedOnly product="reputationshield" elementId="reputationshield.review-velocity-tile">
          <Card
            className="flex flex-col items-center justify-center gap-1 p-3 text-center"
            data-testid="reputationshield-kpi-velocity"
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title={META.reviewVelocity.helpText}
            >
              {META.reviewVelocity.label}
            </span>
            <span className="text-2xl font-semibold text-foreground">
              <AnimatedCounter
                value={kpis?.reviewVelocity.thisMonth ?? 0}
                duration={900}
              />
            </span>
            <Sparkline
              values={kpisQuery.data?.velocityTrend12w ?? []}
              width={96}
              height={22}
              variant="area"
              color="auto"
              ariaLabel="12-week review velocity trend"
            />
            <span className="text-[10px] text-muted-foreground/80">
              {kpis?.reviewVelocity.lastMonth ?? 0} last month ·{" "}
              <span
                className={
                  (kpis?.reviewVelocity.deltaPct ?? 0) >= 0
                    ? "text-[hsl(var(--chart-2))]"
                    : "text-[hsl(var(--destructive))]"
                }
              >
                {(kpis?.reviewVelocity.deltaPct ?? 0) >= 0 ? "+" : ""}
                {kpis?.reviewVelocity.deltaPct ?? 0}%
              </span>
            </span>
          </Card>
          </AdvancedOnly>

          {/* 3. Days since last review — power-user; AI Copilot can surface
              urgency proactively via push notifications instead. */}
          <AdvancedOnly product="reputationshield" elementId="reputationshield.days-since-tile">
          <Card
            className="flex flex-col items-center justify-center gap-1 p-3 text-center"
            data-testid="reputationshield-kpi-days-since"
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title={META.daysSinceLastReview.helpText}
            >
              {META.daysSinceLastReview.label}
            </span>
            <span
              className={
                "text-2xl font-semibold tabular-nums " +
                ((kpis?.daysSinceLastReview ?? 0) >= 30
                  ? "text-[hsl(var(--destructive))]"
                  : (kpis?.daysSinceLastReview ?? 0) >= 15
                    ? "text-[hsl(var(--chart-4))]"
                    : "text-[hsl(var(--chart-2))]")
              }
            >
              <AnimatedCounter
                value={kpis?.daysSinceLastReview ?? 0}
                duration={900}
              />
            </span>
            <span className="text-[10px] text-muted-foreground/80">
              {kpis?.daysSinceLastReview == null
                ? "No reviews yet"
                : "days · pulse threshold 30+"}
            </span>
          </Card>
          </AdvancedOnly>

          {/* 4. Reply rate — power-user (internal QA metric). */}
          <AdvancedOnly product="reputationshield" elementId="reputationshield.reply-rate-tile">
          <Card
            className="flex flex-col items-center justify-center gap-1 p-3 text-center"
            data-testid="reputationshield-kpi-reply-rate"
          >
            <span
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title={META.replyRate.helpText}
            >
              {META.replyRate.label}
            </span>
            <span className="text-2xl font-semibold text-foreground">
              <AnimatedCounter
                value={kpis?.replyRate ?? 0}
                suffix="%"
                duration={900}
              />
            </span>
            <span className="text-[10px] text-muted-foreground/80">
              {(kpis?.replyRate ?? 0) >= 80
                ? "Excellent"
                : (kpis?.replyRate ?? 0) >= 50
                  ? "Keep it up"
                  : "Reply to more reviews"}
            </span>
          </Card>
          </AdvancedOnly>
        </div>

        {/* Platform scorecard with deltas — power-user (per-platform breakdown). */}
        <AdvancedOnly product="reputationshield" elementId="reputationshield.platform-scorecard">
          <PlatformScorecard
            data={
              kpisQuery.data?.scorecard ?? {
                google: { rating: 0, count: 0, recentCount: 0, delta30d: 0 },
                yelp: { rating: 0, count: 0, recentCount: 0, delta30d: 0 },
                facebook: { rating: 0, count: 0, recentCount: 0, delta30d: 0 },
                bbb: { rating: 0, count: 0, recentCount: 0, delta30d: 0 },
              }
            }
          />
        </AdvancedOnly>

        {/* Wave 36 — RequestFunnel deleted (internal-team UI per audit).
            DaysSinceGauge remains because it carries the 1-click "request reviews"
            action, but only in Advanced mode (hero already shows the metric). */}
        <AdvancedOnly product="reputationshield" elementId="reputationshield.days-since-gauge">
          <DaysSinceGauge
            days={kpis?.daysSinceLastReview ?? null}
            onRequestBatch={requestBatch}
            requesting={runAction.isPending}
            emptyState={previewMode}
          />
        </AdvancedOnly>

        {/* Sentiment heatmap — power-user analyst tool. */}
        <AdvancedOnly product="reputationshield" elementId="reputationshield.sentiment-heatmap">
          <SentimentHeatmap
            cells={kpisQuery.data?.heatmap ?? []}
            emptyState={previewMode || (kpisQuery.data?.heatmap?.length ?? 0) === 0}
          />
        </AdvancedOnly>

        {/* Inbox (Wave 22C ApprovalInbox) + AI draft editor pane */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_460px]">
          <ApprovalInbox
            items={inboxItems}
            selectedItemId={selectedItemId}
            onSelectItem={(item) => setSelectedItemId(item.id)}
            actions={inboxActions}
            loading={inboxQuery.isLoading}
            emptyStateMessage="No reviews yet — once your monitoring is live, new reviews land here for triage."
          />

          <Card
            className="flex flex-col gap-3 p-4"
            data-testid="reputationshield-draft-pane"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  AI reply draft
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Side-by-side diff · edits highlighted in brand blue.
                </p>
              </div>
              {selectedItem && (
                <Link
                  href={`/portal/reviews?focus=${encodeURIComponent(selectedItem.id)}`}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Open full thread
                  <ArrowRight className="ml-1 inline h-3 w-3" />
                </Link>
              )}
            </div>

            {!selectedItem ? (
              <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                Select a review from the inbox to draft an AI reply.
              </div>
            ) : !draftOpen ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {selectedItem.authorName} · {selectedItem.rating}-star ·{" "}
                  {selectedItem.channelBadge}
                </p>
                <p className="rounded-md bg-muted/30 p-3 text-sm text-foreground/90">
                  {selectedItem.preview}
                </p>
                <Button
                  size="sm"
                  onClick={() => setDraftOpen(true)}
                  data-testid="open-draft-editor"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Open AI draft editor
                </Button>
              </div>
            ) : (
              <AIDraftEditor
                aiDraft={draftSeed}
                context={{
                  kind: "review_reply",
                  metadata: { reviewId: selectedItem.id },
                }}
                onSave={async (finalText) => {
                  await saveReply.mutateAsync({
                    reviewId: selectedItem.id,
                    reply: finalText,
                  });
                }}
              />
            )}
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}
