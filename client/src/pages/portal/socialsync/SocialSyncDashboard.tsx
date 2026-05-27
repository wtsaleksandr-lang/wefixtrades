/**
 * /portal/socialsync/dashboard — Wave 25 SocialSync UI upgrade.
 *
 * Customer-facing dashboard built on Wave 22A/22B/22C primitives plus the
 * bespoke Wave 25 components (PlatformPreview, PlatformGauge,
 * PostScoreOverlay, ChannelPicker). The existing /portal/socialsync
 * (PortalSocialSync.tsx) remains the legacy "status report" surface; this
 * is the new live "approval triage + content calendar + WhatsApp moat" view.
 *
 * 8 enhancements per WORKSTREAMS/ui-upgrade-roadmap.md + competitive research:
 *   1. Gmail-style ApprovalInbox (Wave 22C) for pending posts (BIG win)
 *   2. Pixel-accurate PlatformPreview (FB/IG/LinkedIn/WhatsApp)
 *   3. Drag-drop VisualCalendar (Wave 22B) for scheduled posts
 *   4. Animated StatusPill + AnimatedCounter on every entry/KPI
 *   5. PlatformGauge — per-platform engagement gauges (KpiGauge under the hood)
 *   6. PostScoreOverlay — 0-100 best-time-to-post scores on calendar slots
 *   7. ChannelPicker — WhatsApp as a first-class tile (moat)
 *   8. 4 hero KPI gauges (Posts/Engagement/Backlog/WhatsApp)
 *
 * Backend:
 *   GET   /api/portal/socialsync/dashboard-kpis
 *   GET   /api/portal/socialsync/approvals
 *   POST  /api/portal/socialsync/approvals/:id/regenerate
 *   GET   /api/portal/socialsync/calendar
 *   PATCH /api/portal/socialsync/calendar/:id/reschedule
 *   GET   /api/portal/socialsync/best-time-scores
 *
 * Action endpoints (approve/edit/reject) reuse the existing Wave 12 routes
 * already shipped in /portal/socialsync (POST :id/approve, :id/reject,
 * PATCH :id) — no duplication.
 *
 * All polling intervals: 30s. No WebSockets.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CheckCircle2,
  Edit3,
  Inbox,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsDown,
  CalendarDays,
  LayoutDashboard,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ApprovalInbox,
  AIDraftEditor,
  AnimatedCounter,
  KpiGauge,
  ProgressRing,
  StatusPill,
  VisualCalendar,
  type CalendarEntry,
  type CalendarEntryStatus,
  type InboxAction,
  type InboxItem,
} from "@/components/ui/visual-primitives";
import {
  PLATFORMS,
  PLATFORM_BY_ID,
  type SocialPlatformId,
} from "@/components/socialsync/platforms";
import { PlatformPreview } from "@/components/socialsync/PlatformPreview";
import { PlatformGauge } from "@/components/socialsync/PlatformGauge";
import { PostScoreOverlay } from "@/components/socialsync/PostScoreOverlay";
import { ChannelPicker } from "@/components/socialsync/ChannelPicker";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";

/* Wave 26.6: registry-driven gauge meta. Same strings the Copilot reads. */
const META = {
  postsThisWeek: getMetricMeta("socialsync", "postsThisWeek")!,
  avgEngagementRate: getMetricMeta("socialsync", "avgEngagementRate")!,
  approvalBacklog: getMetricMeta("socialsync", "approvalBacklog")!,
  whatsappMessagesThisWeek: getMetricMeta("socialsync", "whatsappMessagesThisWeek")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    postsThisWeek: number;
    avgEngagementRate: number;
    approvalBacklog: number;
    whatsappMessagesThisWeek: number;
  };
  perPlatform: Record<
    SocialPlatformId,
    { ratePct: number; empty: boolean }
  >;
  connections: Record<SocialPlatformId, boolean>;
}

interface ApprovalsResponse {
  previewMode?: boolean;
  items: Array<{
    id: string;
    kind: "social_post";
    status: "unread" | "approved" | "archived";
    createdAt: string;
    title: string;
    preview: string;
    thumbnailUrl: string | null;
    channelBadge: string;
    channelColor: string;
    hashtags: string[];
    scheduledFor: string | null;
    platform: string;
  }>;
  total: number;
}

interface CalendarResponse {
  previewMode?: boolean;
  entries: Array<{
    id: string;
    date: string;
    title: string;
    thumbnailUrl?: string;
    channelColor?: string;
    status?: CalendarEntryStatus;
    contentType?: string;
    metadata?: { platform?: string; rawStatus?: string };
  }>;
}

interface BestTimeScoresResponse {
  previewMode?: boolean;
  week: string;
  grid: number[][]; // 7 × 24
  sampleSize: number;
  source: "empty" | "baseline" | "blended" | "history";
}

type DashboardTab = "overview" | "approvals" | "calendar";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function todayDow(): number {
  // Mon=0..Sun=6 to align with the server grid.
  const js = new Date().getDay();
  return (js + 6) % 7;
}

function currentHour(): number {
  return new Date().getHours();
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function SocialSyncDashboard() {
  usePageTitle("Social Media — Dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [editingItem, setEditingItem] = useState<ApprovalsResponse["items"][number] | null>(
    null,
  );

  const kpisQuery = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/socialsync/dashboard-kpis"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/socialsync/dashboard-kpis");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const approvalsQuery = useQuery<ApprovalsResponse>({
    queryKey: ["/api/portal/socialsync/approvals"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/socialsync/approvals?limit=100");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const calendarQuery = useQuery<CalendarResponse>({
    queryKey: ["/api/portal/socialsync/calendar"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/socialsync/calendar?weeks=4");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const bestTimeQuery = useQuery<BestTimeScoresResponse>({
    queryKey: ["/api/portal/socialsync/best-time-scores"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/portal/socialsync/best-time-scores");
      return res.json();
    },
    refetchInterval: 5 * 60_000, // scores move slowly
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/portal/socialsync/approvals"],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/portal/socialsync/dashboard-kpis"],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/portal/socialsync/calendar"],
    });
  };

  /* ─── Mutations ─────────────────────────────────────────────────────── */

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/portal/socialsync/posts/${id}/approve`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Post queued for publishing." });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't approve", description: e?.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/portal/socialsync/posts/${id}/reject`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected" });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't reject", description: e?.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/portal/socialsync/approvals/${id}/regenerate`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Regenerating",
        description: "ContentFlow will draft a replacement shortly.",
      });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't regenerate",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const saveEditMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/portal/socialsync/posts/${id}`,
        { post_text: text },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Edits applied. Post approved for publishing." });
      setEditingItem(null);
      invalidateAll();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: Date }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/portal/socialsync/calendar/${id}/reschedule`,
        { scheduled_for: newDate.toISOString() },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rescheduled" });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't reschedule",
        description: e?.message,
        variant: "destructive",
      }),
  });

  /* ─── Derived values ────────────────────────────────────────────────── */

  const kpis = kpisQuery.data?.kpis;
  const perPlatform = kpisQuery.data?.perPlatform;
  const connections = kpisQuery.data?.connections ?? {
    facebook: false,
    instagram: false,
    linkedin: false,
    whatsapp: false,
  };

  // Map raw approvals to InboxItems for the ApprovalInbox primitive.
  const inboxItems: InboxItem[] = useMemo(() => {
    return (approvalsQuery.data?.items ?? []).map((row) => ({
      id: row.id,
      kind: "social_post" as const,
      status: row.status,
      createdAt: new Date(row.createdAt),
      title: row.title,
      preview: row.preview,
      thumbnailUrl: row.thumbnailUrl ?? undefined,
      channelBadge: row.channelBadge,
      channelColor: row.channelColor,
      metadata: { platform: row.platform, scheduledFor: row.scheduledFor },
    }));
  }, [approvalsQuery.data]);

  const inboxActions: InboxAction[] = useMemo(
    () => [
      {
        id: "approve",
        label: "Approve",
        shortcut: "a",
        variant: "primary",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        handler: (item) => approveMutation.mutateAsync(item.id),
      },
      {
        id: "edit",
        label: "Edit",
        shortcut: "e",
        variant: "secondary",
        icon: <Edit3 className="h-3.5 w-3.5" />,
        handler: (item) => {
          const raw = (approvalsQuery.data?.items ?? []).find(
            (i) => i.id === item.id,
          );
          if (raw) setEditingItem(raw);
        },
      },
      {
        id: "regenerate",
        label: "Regenerate",
        shortcut: "g",
        variant: "ghost",
        icon: <Sparkles className="h-3.5 w-3.5" />,
        handler: (item) => regenerateMutation.mutateAsync(item.id),
      },
      {
        id: "reject",
        label: "Reject",
        shortcut: "r",
        variant: "ghost",
        icon: <ThumbsDown className="h-3.5 w-3.5" />,
        handler: (item) => rejectMutation.mutateAsync(item.id),
      },
    ],
    [approvalsQuery.data, approveMutation, regenerateMutation, rejectMutation],
  );

  const inboxBulkActions: InboxAction[] = useMemo(
    () => [
      {
        id: "bulk-approve",
        label: "Approve all",
        variant: "primary",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        handler: (item) => approveMutation.mutateAsync(item.id),
      },
      {
        id: "bulk-archive",
        label: "Archive all",
        variant: "ghost",
        icon: <ThumbsDown className="h-3.5 w-3.5" />,
        handler: (item) => rejectMutation.mutateAsync(item.id),
      },
    ],
    [approveMutation, rejectMutation],
  );

  // Map calendar API entries → primitive CalendarEntry (Date instance required).
  const calendarEntries: CalendarEntry[] = useMemo(() => {
    return (calendarQuery.data?.entries ?? []).map((e) => ({
      id: e.id,
      date: new Date(e.date),
      title: e.title,
      thumbnailUrl: e.thumbnailUrl,
      channelColor: e.channelColor,
      status: e.status,
      contentType: e.contentType,
      metadata: e.metadata,
    }));
  }, [calendarQuery.data]);

  // Today's hour-row of best-time scores so we can surface a "what's now"
  // hint next to the calendar widget.
  const scoreNow = useMemo(() => {
    const grid = bestTimeQuery.data?.grid;
    if (!grid) return null;
    return grid[todayDow()]?.[currentHour()] ?? null;
  }, [bestTimeQuery.data]);

  const platformEngagementRows = useMemo(() => {
    if (!perPlatform) {
      return PLATFORMS.map((p) => ({
        platform: p.id,
        ratePct: 0,
        empty: true,
      }));
    }
    return PLATFORMS.map((p) => ({
      platform: p.id,
      ratePct: perPlatform[p.id]?.ratePct ?? 0,
      empty: perPlatform[p.id]?.empty ?? true,
    }));
  }, [perPlatform]);

  const connectedSet = useMemo(() => {
    const s = new Set<SocialPlatformId>();
    (Object.keys(connections) as SocialPlatformId[]).forEach((k) => {
      if (connections[k]) s.add(k);
    });
    return s;
  }, [connections]);

  /* ─── Render ────────────────────────────────────────────────────────── */

  return (
    <PortalLayout>
      <div className="max-w-7xl space-y-4">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--border)] pb-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              SocialSync — Dashboard
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Approve, schedule, and preview every channel in one view.
              {/* Wave 36 — "Open legacy report" link removed (exposes internal versioning). */}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/portal/socialsync-setup">
              <Button variant="ghost" size="sm" className="text-xs">
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* ─── Hero KPI row (Wave 26.7 polish-mix — varied primitives) ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Posts This Week → AnimatedCounter (total count). Sparkline
              omitted until we ship daily-history series (Wave 26.8+). */}
          <Card
            className="p-3 flex flex-col items-center justify-center min-h-[120px]"
            data-testid="kpi-posts-this-week"
            title={META.postsThisWeek.helpText ?? undefined}
          >
            <div
              className="text-3xl font-semibold tabular-nums"
              style={{ color: "hsl(var(--gauge-sapphire))" }}
            >
              <AnimatedCounter value={kpis?.postsThisWeek ?? 0} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground text-center">
              {META.postsThisWeek.label}
            </div>
          </Card>

          {/* Engagement % — power-user (jargon to plumbers). */}
          <AdvancedOnly product="socialsync">
            <Card className="p-3 flex items-center justify-center" data-testid="kpi-avg-engagement">
              <KpiGauge
                value={kpis?.avgEngagementRate ?? 0}
                min={0}
                max={10}
                unit="%"
                label={META.avgEngagementRate.label}
                size="sm"
                palette="emerald"
                helpText={META.avgEngagementRate.helpText}
                improvementTips={META.avgEngagementRate.improvementTips}
                emptyState={!kpis || kpis.avgEngagementRate === 0}
              />
            </Card>
          </AdvancedOnly>

          {/* Approval Backlog → ProgressRing (X of typical max) */}
          <Card className="p-3 flex items-center justify-center" data-testid="kpi-approval-backlog">
            <ProgressRing
              value={kpis?.approvalBacklog ?? 0}
              max={Math.max(20, (kpis?.approvalBacklog ?? 0) + 5)}
              unit="pending"
              label={META.approvalBacklog.label}
              size="sm"
              color="amber"
              helpText={META.approvalBacklog.helpText}
              improvementTips={META.approvalBacklog.improvementTips}
              emptyState={(kpis?.approvalBacklog ?? 0) === 0 && (!kpis || kpis.postsThisWeek === 0)}
            />
          </Card>

          {/* WhatsApp Messages — power-user (TradeLine's surface). */}
          <AdvancedOnly product="socialsync">
            <Card className="p-3 flex items-center justify-center" data-testid="kpi-whatsapp-this-week">
              <KpiGauge
                value={kpis?.whatsappMessagesThisWeek ?? 0}
                min={0}
                max={Math.max(50, (kpis?.whatsappMessagesThisWeek ?? 0) + 10)}
                label={META.whatsappMessagesThisWeek.label}
                size="sm"
                palette="violet"
                helpText={META.whatsappMessagesThisWeek.helpText}
                improvementTips={META.whatsappMessagesThisWeek.improvementTips}
                emptyState={(kpis?.whatsappMessagesThisWeek ?? 0) === 0}
              />
            </Card>
          </AdvancedOnly>
        </div>

        {/* ─── Tab nav ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-[color:var(--border)]">
          <TabButton
            id="overview"
            label="Overview"
            icon={<LayoutDashboard className="h-3.5 w-3.5" />}
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            id="approvals"
            label={`Approvals${
              kpis?.approvalBacklog ? ` (${kpis.approvalBacklog})` : ""
            }`}
            icon={<Inbox className="h-3.5 w-3.5" />}
            active={activeTab === "approvals"}
            onClick={() => setActiveTab("approvals")}
          />
          <TabButton
            id="calendar"
            label="Calendar"
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
          />
        </div>

        {/* ─── Tab content ────────────────────────────────────────────── */}
        {activeTab === "overview" ? (
          <OverviewTab
            connections={connectedSet}
            platformEngagementRows={platformEngagementRows}
            scoreNow={scoreNow}
            scoreSource={bestTimeQuery.data?.source}
            recentInbox={inboxItems.slice(0, 3)}
            onOpenApprovals={() => setActiveTab("approvals")}
            onOpenCalendar={() => setActiveTab("calendar")}
          />
        ) : null}

        {activeTab === "approvals" ? (
          <ApprovalsTab
            items={inboxItems}
            actions={inboxActions}
            bulkActions={inboxBulkActions}
            loading={approvalsQuery.isLoading}
          />
        ) : null}

        {activeTab === "calendar" ? (
          <CalendarTab
            entries={calendarEntries}
            grid={bestTimeQuery.data?.grid}
            onReschedule={async (entryId, newDate) => {
              await rescheduleMutation.mutateAsync({ id: entryId, newDate });
            }}
          />
        ) : null}

        {/* ─── Editor modal ───────────────────────────────────────────── */}
        {editingItem ? (
          <EditorModal
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={async (text) =>
              saveEditMutation.mutateAsync({ id: editingItem.id, text })
            }
          />
        ) : null}
      </div>
    </PortalLayout>
  );
}

/* ─── Subcomponents ──────────────────────────────────────────────────── */

// Wave 26.5 (Alex 2026-05-26): KpiCard was replaced by KpiGauge in the hero
// KPI row so it could carry helpText + improvementTips + emptyState messaging
// like the other dashboards. The component definition was removed because it
// is no longer referenced anywhere in the file.

function TabButton({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[hsl(var(--chart-1))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      data-testid={`tab-${id}`}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewTab({
  connections,
  platformEngagementRows,
  scoreNow,
  scoreSource,
  recentInbox,
  onOpenApprovals,
  onOpenCalendar,
}: {
  connections: Set<SocialPlatformId>;
  platformEngagementRows: Array<{
    platform: SocialPlatformId;
    ratePct: number;
    empty: boolean;
  }>;
  scoreNow: number | null;
  scoreSource: BestTimeScoresResponse["source"] | undefined;
  recentInbox: InboxItem[];
  onOpenApprovals: () => void;
  onOpenCalendar: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Per-platform engagement gauges — power-user (aggregate KPI already covers this). */}
      <AdvancedOnly product="socialsync">
        <Card className="p-4 md:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Engagement by platform
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Targets: FB 3% · IG 4% · LinkedIn 2%
            </span>
          </div>
          <PlatformGauge rows={platformEngagementRows} />
        </Card>
      </AdvancedOnly>

      {/* Channels (with WhatsApp first-class) */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Channels
        </h3>
        <ChannelPicker
          connected={connections}
          selected={connections}
          onToggle={() => {
            /* read-only here — Settings drives connect/disconnect */
          }}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Manage connections in{" "}
          <Link href="/portal/socialsync-setup" className="underline">
            Settings
          </Link>
          .
        </p>
      </Card>

      {/* Best-time-to-post snapshot — power-user optimisation. */}
      <AdvancedOnly product="socialsync">
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          Best time to post — right now
        </h3>
        <div className="flex items-baseline gap-2">
          {scoreNow != null ? (
            <PostScoreOverlay score={scoreNow} />
          ) : (
            <span className="text-xl font-bold text-muted-foreground/60">—</span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {scoreSource === "history"
              ? "From your post history"
              : scoreSource === "blended"
              ? "Blended history + baseline"
              : "Industry baseline"}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Higher scores indicate when your audience is most active. Open the{" "}
          <button
            type="button"
            className="underline"
            onClick={onOpenCalendar}
          >
            calendar
          </button>{" "}
          to schedule into a green slot.
        </p>
      </Card>
      </AdvancedOnly>

      {/* Recent approval queue preview — Wave 36 audit: Approvals tab has it,
          so the OverviewTab preview duplicates the surface. Hide by default. */}
      <AdvancedOnly product="socialsync">
      <Card className="p-4 md:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Awaiting your review
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={onOpenApprovals}
          >
            Open inbox
          </Button>
        </div>
        {recentInbox.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing pending. New drafts arrive on your posting cadence.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentInbox.map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-2 rounded-md border border-[color:var(--border)] bg-card p-2"
              >
                {it.thumbnailUrl ? (
                  <img
                    src={it.thumbnailUrl}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-8 w-8 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {it.title}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: it.channelColor }}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {it.channelBadge}
                    </span>
                    <StatusPill status="in_progress" label="awaiting" pulse />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </AdvancedOnly>
    </div>
  );
}

function ApprovalsTab({
  items,
  actions,
  bulkActions,
  loading,
}: {
  items: InboxItem[];
  actions: InboxAction[];
  bulkActions: InboxAction[];
  loading?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Triage</strong> drafts before
          they auto-publish at their scheduled time. Use{" "}
          <kbd className="rounded bg-muted px-1 font-mono">A</kbd> approve,{" "}
          <kbd className="rounded bg-muted px-1 font-mono">E</kbd> edit,{" "}
          <kbd className="rounded bg-muted px-1 font-mono">G</kbd> regenerate,{" "}
          <kbd className="rounded bg-muted px-1 font-mono">R</kbd> reject.
        </p>
      </Card>
      <ApprovalInbox
        items={items}
        actions={actions}
        bulkActions={bulkActions}
        loading={loading}
        emptyStateMessage="No posts awaiting review. New drafts arrive on your cadence."
      />
    </div>
  );
}

function CalendarTab({
  entries,
  grid,
  onReschedule,
}: {
  entries: CalendarEntry[];
  grid: number[][] | undefined;
  onReschedule: (entryId: string, newDate: Date) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Drag a post to a new slot to reschedule. Empty slots show a
            best-time-to-post score (0..100).
          </p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <PostScoreOverlay score={85} compact /> Great
            </span>
            <span className="inline-flex items-center gap-1">
              <PostScoreOverlay score={55} compact /> Okay
            </span>
            <span className="inline-flex items-center gap-1">
              <PostScoreOverlay score={25} compact /> Low
            </span>
          </div>
        </div>
      </Card>
      <VisualCalendar
        entries={entries}
        onEntryReschedule={async (id, newDate) => onReschedule(id, newDate)}
      />
      {grid ? <BestTimeMiniGrid grid={grid} /> : null}
    </div>
  );
}

function BestTimeMiniGrid({ grid }: { grid: number[][] }) {
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <Card className="p-3">
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        Best time to post — this week
      </h3>
      <div className="overflow-x-auto">
        <table
          className="min-w-full text-[10px]"
          data-testid="best-time-grid"
        >
          <thead>
            <tr>
              <th className="w-8 px-1 py-1 text-left text-muted-foreground">
                &nbsp;
              </th>
              {Array.from({ length: 24 }).map((_, h) => (
                <th
                  key={h}
                  className="px-0.5 py-1 text-center font-normal text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, dow) => (
              <tr key={dow}>
                <td className="px-1 py-0.5 text-muted-foreground">
                  {dayLabels[dow]}
                </td>
                {row.map((score, h) => (
                  <td key={h} className="p-0">
                    <span
                      className="block h-3 w-3 rounded-sm"
                      style={{
                        background:
                          score >= 70
                            ? "hsl(var(--chart-2) / 0.7)"
                            : score >= 40
                            ? "hsl(var(--chart-4) / 0.6)"
                            : "hsl(var(--muted-foreground) / 0.15)",
                      }}
                      title={`${dayLabels[dow]} ${h}:00 — score ${score}/100`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EditorModal({
  item,
  onClose,
  onSave,
}: {
  item: ApprovalsResponse["items"][number];
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const platformId =
    (PLATFORM_BY_ID as any)[item.platform] != null
      ? (item.platform as SocialPlatformId)
      : ("facebook" as SocialPlatformId);
  const [draftText, setDraftText] = useState(item.preview);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="grid max-h-[88vh] w-full max-w-5xl grid-cols-1 gap-3 overflow-y-auto rounded-xl border bg-card p-4 shadow-xl md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
        data-testid="editor-modal"
      >
        <div className="md:col-span-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Edit draft — {item.channelBadge}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div>
          <AIDraftEditor
            aiDraft={item.preview}
            context={{ kind: "social_post", metadata: { platform: item.platform } }}
            onSave={async (finalText) => {
              setDraftText(finalText);
              await onSave(finalText);
            }}
          />
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Live preview
          </h4>
          <PlatformPreview
            post={{
              text: draftText,
              imageUrl: item.thumbnailUrl ?? undefined,
              hashtags: item.hashtags,
            }}
            focus={platformId}
          />
        </div>
      </div>
    </div>
  );
}
