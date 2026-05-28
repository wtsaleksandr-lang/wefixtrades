/**
 * Wave 22A — admin demo route for the shared visual-primitives library.
 *
 * Static preview surface so Alex can review the 6 new components in
 * isolation before Waves 23/24/25 consume them. Not customer-facing.
 *
 * Route: /admin/ui-primitives (RequirePortal-gated in App.tsx)
 */

import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  FileText,
  ListChecks,
  Send,
  CheckCircle2,
  Archive,
  Check,
  Edit3,
  CalendarClock,
} from "lucide-react";
import {
  AnimatedCounter,
  KpiGauge,
  PipelineStrip,
  StatusPill,
  LetterGradeBadge,
  OnboardingWalkthrough,
  OnboardingWizard,
  VisualCalendar,
  buildEntryDate,
  ApprovalInbox,
  AIDraftEditor,
  AIActionCard,
  Sparkline,
  ProgressRing,
  SparklineWithPeak,
  BarComparisonCard,
  MonthlyBarSeries,
  DonutChart,
  SemiGauge,
  type WalkthroughStep,
  type PipelineStripStage,
  type CalendarEntry,
  type InboxItem,
  type InboxAction,
  type OnboardingStep,
  type WizardState,
} from "@/components/ui/visual-primitives";
import {
  TradePickerStep,
  validateTradePicker,
  ServiceAreaStep,
  validateServiceArea,
  renderPlatformConnect,
  validatePlatformConnect,
} from "@/components/onboarding/steps";
import {
  METRIC_REGISTRY,
  type DashboardProduct,
} from "@shared/copilot/metricRegistry";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    target: "[data-tour='gauge']",
    title: "KpiGauge",
    content:
      "Semi-circular dial with animated needle sweep. Auto-colors by threshold.",
    placement: "bottom",
  },
  {
    target: "[data-tour='counter']",
    title: "AnimatedCounter",
    content:
      "Smooth ease-out count-up with optional up/down delta indicator.",
    placement: "bottom",
  },
  {
    target: "[data-tour='pipeline']",
    title: "PipelineStrip",
    content:
      "Horizontal pipeline of named stages with live counts and animated in-flight dotted connectors.",
    placement: "top",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // Wave 71.5 — mobile fix: min-w-0 + overflow-hidden so a wide child
  // (e.g. a fixed-pixel SVG primitive) can't push the Section past the
  // viewport. Reduce padding on phones so the inner usable width stays
  // closer to the viewport. Inner flex stacks (gap-4) on mobile, wraps
  // back to gap-6 from sm: up.
  return (
    <Card className="p-4 sm:p-6 space-y-4 min-w-0 overflow-hidden">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-start gap-4 sm:gap-6 min-w-0">
        {children}
      </div>
    </Card>
  );
}

function buildCalendarSeed(): CalendarEntry[] {
  const today = new Date();
  return [
    {
      id: "ce-1",
      date: buildEntryDate(today, 9, 0),
      title: "Spring boiler maintenance promo",
      status: "scheduled",
      contentType: "article",
      channelColor: "hsl(var(--chart-1))",
    },
    {
      id: "ce-2",
      date: buildEntryDate(today, 14, 30),
      title: "Twitter thread — heat-pump rebates 2026",
      status: "draft",
      contentType: "social",
      channelColor: "hsl(var(--chart-4))",
    },
    {
      id: "ce-3",
      date: buildEntryDate(new Date(today.getTime() + 1 * 86400000), 10, 0),
      title: "Reels short — emergency plumber call-out",
      status: "in_progress",
      contentType: "video",
      channelColor: "hsl(var(--chart-2))",
    },
    {
      id: "ce-4",
      date: buildEntryDate(new Date(today.getTime() + 2 * 86400000), 11, 30),
      title: "LinkedIn — case study, 27 vans saved fuel",
      status: "approved",
      contentType: "article",
      channelColor: "hsl(var(--chart-1))",
    },
    {
      id: "ce-5",
      date: buildEntryDate(new Date(today.getTime() + 3 * 86400000), 8, 0),
      title: "Instagram carousel — before/after kitchens",
      status: "scheduled",
      contentType: "image",
      channelColor: "hsl(var(--chart-3))",
    },
    {
      id: "ce-6",
      date: buildEntryDate(new Date(today.getTime() + 4 * 86400000), 13, 0),
      title: "Blog — top 7 trades to outsource in 2026",
      status: "published",
      contentType: "article",
      channelColor: "hsl(var(--chart-1))",
    },
    {
      id: "ce-7",
      date: buildEntryDate(new Date(today.getTime() + 5 * 86400000), 15, 45),
      title: "TikTok — drain unblocking timelapse",
      status: "draft",
      contentType: "video",
      channelColor: "hsl(var(--chart-2))",
    },
    {
      id: "ce-8",
      date: buildEntryDate(new Date(today.getTime() + 7 * 86400000), 9, 30),
      title: "Newsletter — boiler grants closing soon",
      status: "scheduled",
      contentType: "article",
      channelColor: "hsl(var(--chart-1))",
    },
    {
      id: "ce-9",
      date: buildEntryDate(new Date(today.getTime() + 8 * 86400000), 12, 0),
      title: "Threads — 'AI gave my plumber a 5-star year'",
      status: "draft",
      contentType: "social",
      channelColor: "hsl(var(--chart-4))",
    },
    {
      id: "ce-10",
      date: buildEntryDate(new Date(today.getTime() + 10 * 86400000), 16, 30),
      title: "Press release — Series A WeFixTrades close",
      status: "approved",
      contentType: "article",
      channelColor: "hsl(var(--chart-5))",
    },
  ];
}

function buildInboxSeed(): InboxItem[] {
  const now = Date.now();
  return [
    {
      id: "inb-1",
      kind: "review_reply",
      createdAt: new Date(now - 12 * 60_000),
      status: "unread",
      authorName: "Sarah K.",
      title: "5-star Google review — boiler swap",
      preview:
        "Absolutely brilliant service from start to finish. Came out same day, sorted the boiler in under two hours, and even tidied up. Couldn't ask for more.",
      channelBadge: "Google",
      channelColor: "hsl(var(--chart-1))",
      rating: 5,
      sentiment: "positive",
    },
    {
      id: "inb-2",
      kind: "social_post",
      createdAt: new Date(now - 45 * 60_000),
      status: "starred",
      authorName: "AI Draft",
      title: "Instagram — heat-pump rebate carousel",
      preview:
        "Heat-pump grants are still open — but the window is closing. Tap in to see if your home qualifies. #HeatPump #UKGrants2026",
      channelBadge: "Instagram",
      channelColor: "hsl(var(--chart-3))",
    },
    {
      id: "inb-3",
      kind: "review_reply",
      createdAt: new Date(now - 3 * 3_600_000),
      status: "unread",
      authorName: "Mark T.",
      title: "2-star Yelp review — late arrival",
      preview:
        "Engineer arrived 90 minutes late and didn't call ahead. The work itself was fine, but the experience left a sour taste.",
      channelBadge: "Yelp",
      channelColor: "hsl(var(--destructive))",
      rating: 2,
      sentiment: "negative",
    },
    {
      id: "inb-4",
      kind: "social_post",
      createdAt: new Date(now - 6 * 3_600_000),
      status: "replied",
      authorName: "AI Draft",
      title: "Facebook — emergency call-out testimonial",
      preview:
        "When you've got water pouring through the ceiling at midnight, you don't want voicemail. You want an engineer. We answered 387 emergency calls last month — zero went unanswered.",
      channelBadge: "Facebook",
      channelColor: "hsl(var(--chart-4))",
    },
    {
      id: "inb-5",
      kind: "article",
      createdAt: new Date(now - 22 * 3_600_000),
      status: "approved",
      authorName: "AI Draft",
      title: "Blog — top 7 trades to outsource in 2026",
      preview:
        "From plumbing emergencies to boiler servicing — the seven trades UK homeowners overwhelmingly say they wish they'd outsourced sooner.",
      channelBadge: "Blog",
      channelColor: "hsl(var(--chart-5))",
    },
    {
      id: "inb-6",
      kind: "review_reply",
      createdAt: new Date(now - 2 * 24 * 3_600_000),
      status: "unread",
      authorName: "Priya R.",
      title: "4-star Google review — heat pump install",
      preview:
        "Mostly happy with the install. Team was professional, system runs quietly. Took a day longer than quoted, but that's typical for the industry.",
      channelBadge: "Google",
      channelColor: "hsl(var(--chart-1))",
      rating: 4,
      sentiment: "neutral",
    },
  ];
}

export default function UiPrimitivesDemo() {
  const [counter, setCounter] = useState<number>(42);
  const [gaugeValue, setGaugeValue] = useState<number>(72);
  const [stageCounts, setStageCounts] = useState<number[]>([12, 4, 2, 1]);
  const [restartTour, setRestartTour] = useState<number>(0);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>(() =>
    buildCalendarSeed()
  );
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(() =>
    buildInboxSeed()
  );
  const [inboxLog, setInboxLog] = useState<string[]>([]);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);

  const inboxActions: InboxAction[] = [
    {
      id: "approve",
      label: "Approve",
      icon: <Check className="h-3.5 w-3.5" />,
      shortcut: "a",
      variant: "primary",
      handler: (item) => {
        setInboxItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "approved" } : i
          )
        );
        setInboxLog((l) => [`approved ${item.id}`, ...l].slice(0, 5));
      },
    },
    {
      id: "edit",
      label: "Edit",
      icon: <Edit3 className="h-3.5 w-3.5" />,
      shortcut: "e",
      variant: "secondary",
      handler: (item) => {
        setInboxLog((l) => [`edit ${item.id}`, ...l].slice(0, 5));
      },
    },
    {
      id: "reschedule",
      label: "Reschedule",
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      shortcut: "r",
      variant: "secondary",
      handler: (item) => {
        setInboxLog((l) => [`reschedule ${item.id}`, ...l].slice(0, 5));
      },
    },
    {
      id: "archive",
      label: "Archive",
      icon: <Archive className="h-3.5 w-3.5" />,
      shortcut: "x",
      variant: "ghost",
      handler: (item) => {
        setInboxItems((prev) => prev.filter((i) => i.id !== item.id));
        setInboxLog((l) => [`archived ${item.id}`, ...l].slice(0, 5));
      },
    },
  ];

  const bulkInboxActions: InboxAction[] = [
    {
      id: "approve-all",
      label: "Approve all",
      icon: <Check className="h-3.5 w-3.5" />,
      variant: "primary",
      handler: (item) => {
        setInboxItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "approved" } : i
          )
        );
      },
    },
    {
      id: "archive-all",
      label: "Archive",
      icon: <Archive className="h-3.5 w-3.5" />,
      variant: "ghost",
      handler: (item) => {
        setInboxItems((prev) => prev.filter((i) => i.id !== item.id));
      },
    },
  ];

  const stages: PipelineStripStage[] = [
    {
      id: "drafts",
      label: "Drafts",
      count: stageCounts[0],
      icon: <FileText className="h-3.5 w-3.5" />,
      status: "complete",
    },
    {
      id: "queued",
      label: "Queued",
      count: stageCounts[1],
      icon: <ListChecks className="h-3.5 w-3.5" />,
      status: "active",
    },
    {
      id: "publishing",
      label: "Publishing",
      count: stageCounts[2],
      icon: <Send className="h-3.5 w-3.5" />,
      status: "idle",
    },
    {
      id: "live",
      label: "Live",
      count: stageCounts[3],
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      status: "idle",
    },
  ];

  return (
    <AdminLayout pageContext={{ page: "ui-primitives" }}>
      {/* Wave 71.5 — mobile fix: min-w-0 + overflow-x-hidden so no demo
          block (some primitives ship at fixed pixel widths) can push the
          whole page wider than the viewport, which produced the "white
          shade" overflow Alex hit at ≤480px. */}
      <div className="space-y-6 min-w-0 overflow-x-hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[hsl(var(--chart-1))]" />
              Visual primitives (Waves 22A / 22B / 22C)
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Shared components — built once, consumed by Waves 23
              (ContentFlow), 24 (RankFlow), 25 (SocialSync), 28
              (ReputationShield). All animations respect prefers-reduced-motion.
              No raw hex; semantic tokens only.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.localStorage.removeItem("ui-primitives-tour-v1");
              setRestartTour((n) => n + 1);
            }}
            data-testid="restart-walkthrough"
          >
            Replay walkthrough
          </Button>
        </div>

        <Section title="KpiGauge">
          <div data-tour="gauge" className="flex flex-wrap items-end gap-8">
            <KpiGauge value={gaugeValue} label="Approval Rate" unit="%" size="md" />
            <KpiGauge value={92} label="Quality" unit="%" size="md" color="green" targetThreshold={85} />
            <KpiGauge value={48} label="Risk" unit="%" size="md" color="auto" />
            <KpiGauge value={68} label="Cache hit" unit="%" size="sm" />
            <KpiGauge value={85} label="Health" unit="%" size="lg" targetThreshold={80} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setGaugeValue((v) => Math.max(0, v - 10))}>
              −10
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGaugeValue((v) => Math.min(100, v + 10))}>
              +10
            </Button>
            <span className="text-xs text-muted-foreground">Click to retrigger the needle sweep.</span>
          </div>

          {/* Wave 26.5 — 6 brand palettes (Alex 2026-05-26).
              Hover any gauge for >500ms (or long-press on touch) to see the
              help popover with helpText + improvementTips. Boot animation
              runs a full min→max→value cycle on mount. */}
          <div className="mt-6 border-t pt-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Wave 26.5 — Premium palettes + hover help + empty-state
            </div>
            <div className="flex flex-wrap items-end gap-8">
              <KpiGauge
                value={72}
                label="Sapphire"
                unit="%"
                size="md"
                palette="sapphire"
                helpText="Brand-blue gauge. The default palette across primary KPIs."
                improvementTips={[
                  "Hover for ~500ms to see this popover",
                  "Tab to focus, then press Space/Enter",
                  "Mobile: long-press to reveal",
                ]}
              />
              <KpiGauge
                value={88}
                label="Emerald"
                unit="%"
                size="md"
                palette="emerald"
                targetThreshold={80}
                helpText="Trade-green palette. Used for success / growth KPIs."
                improvementTips={[
                  "Use on metrics where higher = better",
                  "Rotate alongside sapphire in 4-gauge rows",
                ]}
              />
              <KpiGauge
                value={54}
                label="Amber"
                unit="%"
                size="md"
                palette="amber"
                helpText="Warm yellow palette. For watch-list / neutral KPIs."
                improvementTips={[
                  "Use on metrics that need attention but aren't critical",
                  "Pairs well with emerald + crimson in a single row",
                ]}
              />
              <KpiGauge
                value={28}
                label="Crimson"
                unit="%"
                size="md"
                palette="crimson"
                helpText="Red-warning palette. For cost / risk / churn KPIs."
                improvementTips={[
                  "Use when lower = better (e.g. cost per booking)",
                  "Pair with target threshold marker",
                ]}
              />
              <KpiGauge
                value={66}
                label="Violet"
                unit="%"
                size="md"
                palette="violet"
                helpText="Purple accent palette. For premium / engagement KPIs."
                improvementTips={[
                  "Use sparingly — one gauge per row at most",
                  "Great for highlighting differentiators",
                ]}
              />
              <KpiGauge
                value={45}
                label="Teal"
                unit="%"
                size="md"
                palette="teal"
                helpText="Cyan accent palette. For technical / system KPIs."
                improvementTips={[
                  "Use on infra / latency / cache hit rate",
                  "Reads cleanly on both light and dark themes",
                ]}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-8">
              <KpiGauge
                value={0}
                max={100}
                label="Empty state"
                unit="%"
                size="md"
                palette="sapphire"
                emptyState
                helpText="Shown when there's no data yet — gauge is dimmed at 0 and a clock icon + caption appears below the label."
                improvementTips={[
                  "Useful for new accounts pre-onboarding",
                  "Stays consistent with populated gauges (no layout shift)",
                ]}
              />
              <KpiGauge
                value={73}
                max={100}
                label="With popover"
                unit="%"
                size="md"
                palette="emerald"
                targetThreshold={80}
                helpText="Hover this gauge for 500ms to see the full help card with bulleted improvement tips."
                improvementTips={[
                  "Refine your campaign targeting",
                  "Increase budget on top-performing ads",
                  "A/B test creative against control",
                  "Review competitor benchmarks",
                ]}
              />
            </div>
          </div>

          {/* Wave 26.6 — Copilot metric-reader preview (Alex 2026-05-26).
              Shows the live JSON payload the Copilot would receive when the
              customer opens it from a product dashboard. Helps verify the
              metric registry has accurate helpText for every gauge across
              the 4 instrumented dashboards. */}
          <div className="mt-6 border-t pt-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Wave 26.6 — Copilot metric-reader context preview
            </div>
            <CopilotMetricsPreview />
          </div>
        </Section>

        <Section title="AnimatedCounter">
          <div data-tour="counter" className="flex flex-wrap items-center gap-8">
            <div className="space-y-1">
              <div className="text-3xl font-semibold">
                <AnimatedCounter value={counter} prefix="$" decimals={2} />
              </div>
              <div className="text-xs text-muted-foreground">Revenue</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-semibold">
                <AnimatedCounter
                  value={counter}
                  suffix="%"
                  deltaIndicator={{ previous: 40, showArrow: true }}
                />
              </div>
              <div className="text-xs text-muted-foreground">CSAT vs last week</div>
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-semibold">
                <AnimatedCounter value={counter * 1000} />
              </div>
              <div className="text-xs text-muted-foreground">Impressions</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setCounter((n) => n + 17)}>
              +17
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCounter((n) => Math.max(0, n - 13))}>
              −13
            </Button>
          </div>
        </Section>

        <Section title="Sparkline (Wave 26.7)">
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Tiny inline trend chart. ~50 LOC pure SVG. The{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                color="auto"
              </code>{" "}
              picker reads trend direction — rising = emerald, falling =
              crimson, flat = sapphire. No hover popover (too small);
              context lives on the parent tile.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <Sparkline values={[3, 4, 4, 6, 8, 10, 12]} color="sapphire" />
                <span className="text-[10px] text-muted-foreground">sapphire / line</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[12, 10, 11, 8, 7, 5, 4]}
                  color="emerald"
                  variant="area"
                />
                <span className="text-[10px] text-muted-foreground">emerald / area</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[8, 8.2, 8.1, 8, 8.3, 8.1, 8]}
                  color="amber"
                />
                <span className="text-[10px] text-muted-foreground">amber / flat</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[20, 18, 15, 10, 12, 6, 4]}
                  color="crimson"
                  variant="area"
                />
                <span className="text-[10px] text-muted-foreground">crimson / falling</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[5, 9, 3, 12, 2, 14, 7, 11, 4, 13]}
                  color="violet"
                />
                <span className="text-[10px] text-muted-foreground">violet / volatile</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[2, 4, 5, 7, 9, 12, 16, 19, 22]}
                  color="teal"
                  variant="area"
                />
                <span className="text-[10px] text-muted-foreground">teal / rising</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline
                  values={[10, 12, 14, 13, 16, 18, 21, 24]}
                  color="auto"
                />
                <span className="text-[10px] text-muted-foreground">auto → emerald</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Sparkline values={[]} ariaLabel="No data sparkline" />
                <span className="text-[10px] text-muted-foreground">empty</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="ProgressRing (Wave 26.7)">
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Apple-Watch-style full ring. Best for "X of Y" or "% of quota"
              metrics. Same hover popover pattern as KpiGauge (500ms delay,
              long-press on touch). Boot animation matches KpiGauge — 0 →
              max → settles at value (~1.5s).
            </p>
            <div className="flex flex-wrap items-start gap-8">
              <ProgressRing
                value={10}
                max={100}
                unit="%"
                label="Just started"
                color="crimson"
              />
              <ProgressRing
                value={45}
                max={100}
                unit="%"
                label="On track"
                color="amber"
              />
              <ProgressRing
                value={78}
                max={100}
                unit="%"
                label="Healthy"
                color="emerald"
              />
              <ProgressRing
                value={100}
                max={100}
                unit="%"
                label="Complete"
                color="sapphire"
              />
              <ProgressRing
                value={4}
                max={6}
                unit="of 6"
                label="Distribution reach"
                color="violet"
                helpText="Number of distribution platforms currently receiving your content. Each platform expands your reach to a unique audience."
                improvementTips={[
                  "Connect at least 3 channels to start (Twitter, LinkedIn, Medium).",
                  "Enable WordPress auto-publish if you operate a blog.",
                  "Add the Google Business Profile connector for local reach.",
                ]}
              />
              <ProgressRing
                value={0}
                max={100}
                unit="%"
                label="Quota usage"
                color="teal"
                emptyState
              />
            </div>
          </div>
        </Section>

        <Section title="PipelineStrip">
          <div data-tour="pipeline" className="w-full">
            <PipelineStrip stages={stages} highlightCurrent="queued" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setStageCounts(([d, q, p, l]) => [Math.max(0, d - 1), q + 1, p, l])
              }
            >
              Move 1 to queue
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setStageCounts(([d, q, p, l]) => [d, Math.max(0, q - 1), p, l + 1])
              }
            >
              Promote 1 to live
            </Button>
          </div>
        </Section>

        <Section title="StatusPill">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status="draft" />
            <StatusPill status="scheduled" />
            <StatusPill status="in_progress" pulse />
            <StatusPill status="approved" />
            <StatusPill status="published" />
            <StatusPill status="failed" />
            <StatusPill status="in_progress" pulse label="Generating content..." />
          </div>
        </Section>

        <Section title="LetterGradeBadge">
          <div className="flex flex-wrap items-center gap-3">
            <LetterGradeBadge score={97} />
            <LetterGradeBadge score={92} />
            <LetterGradeBadge score={87} />
            <LetterGradeBadge score={82} showScore />
            <LetterGradeBadge score={77} variant="outline" />
            <LetterGradeBadge score={68} showScore variant="outline" />
            <LetterGradeBadge score={58} showScore />
            <LetterGradeBadge score={42} showScore />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LetterGradeBadge score={97} size="sm" />
            <LetterGradeBadge score={87} size="md" showScore />
            <LetterGradeBadge score={77} size="lg" showScore />
          </div>
        </Section>

        <Section title="VisualCalendar">
          <div className="w-full space-y-2">
            <p className="text-sm text-muted-foreground">
              Drag-and-drop content calendar. 3 view modes (month / week / day),
              thumbnails, channel-color dots, status pills, filter chips.
              Shared by Wave 23 (ContentFlow) + Wave 25 (SocialSync).
            </p>
            <VisualCalendar
              entries={calendarEntries}
              filters={{
                contentTypes: ["article", "social", "image", "video"],
                statuses: ["draft", "scheduled", "approved"],
              }}
              onEntryReschedule={async (id, newDate) => {
                setCalendarEntries((prev) =>
                  prev.map((e) =>
                    e.id === id
                      ? {
                          ...e,
                          date: new Date(
                            newDate.getFullYear(),
                            newDate.getMonth(),
                            newDate.getDate(),
                            e.date.getHours(),
                            e.date.getMinutes()
                          ),
                        }
                      : e
                  )
                );
              }}
              onEntryClick={(e) => {
                // demo: no-op
                void e;
              }}
              onSlotClick={(d) => {
                void d;
              }}
            />
          </div>
        </Section>

        <Section title="ApprovalInbox (Wave 22C)">
          <div className="w-full space-y-2">
            <p className="text-sm text-muted-foreground">
              Gmail-style 2-pane triage queue. Shared by Wave 25 (SocialSync)
              and Wave 28 (ReputationShield). Keyboard:{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">j/k</kbd>{" "}
              navigate,{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">Enter</kbd>{" "}
              focus detail,{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">Esc</kbd>{" "}
              clear,{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">A/E/R/X</kbd>{" "}
              per-item actions. Shift-click or Cmd/Ctrl-click for multi-select.
            </p>
            <ApprovalInbox
              items={inboxItems}
              actions={inboxActions}
              bulkActions={bulkInboxActions}
              emptyStateMessage="Inbox zero. Take a breath."
            />
            {inboxLog.length ? (
              <div className="rounded-md border bg-muted/30 p-2 text-xs font-mono text-muted-foreground">
                <div className="mb-1 font-sans font-medium not-italic text-foreground">
                  Recent actions
                </div>
                {inboxLog.map((entry, i) => (
                  <div key={i}>{entry}</div>
                ))}
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="AIDraftEditor (Wave 22C)">
          <div className="w-full space-y-2">
            <p className="text-sm text-muted-foreground">
              Side-by-side diff editor for AI-generated drafts. Left pane =
              AI's version (strikethrough = removed). Right pane = user's
              edit (brand-blue underline = added). Pure-JS word-level LCS
              diff — no new deps. Keyboard:{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">⌘↵</kbd>{" "}
              save,{" "}
              <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">⌘R</kbd>{" "}
              regenerate.
            </p>
            <AIDraftEditor
              aiDraft="Thank you for your wonderful feedback! We're thrilled to hear you had a positive experience."
              initialUserEdit="Thanks so much, Sarah — really glad the boiler swap went smoothly. We'll let the team know you noticed the tidy-up!"
              context={{ kind: "review_reply" }}
              maxLength={500}
              onSave={async (text) => {
                await new Promise((r) => setTimeout(r, 600));
                setSavedDraft(text);
              }}
              onRegenerate={async () => {
                await new Promise((r) => setTimeout(r, 700));
                return "Thank you so much for the kind review! We're delighted you had a great experience with our team.";
              }}
            />
            {savedDraft ? (
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Last saved:</span>{" "}
                {savedDraft}
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="OnboardingWalkthrough">
          <p className="text-sm text-muted-foreground">
            The walkthrough auto-runs once per browser (storageKey
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">ui-primitives-tour-v1</code>).
            Click <em>Replay walkthrough</em> in the top-right to see it again.
          </p>
        </Section>

        <Section title="OnboardingWizard (Wave 33)">
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Universal 3-question setup scaffold for every product. Consumes
              the shared step renderers in
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                @/components/onboarding/steps
              </code>
              . The 5 existing product wizards (TradeLine excluded —
              multi-mode), ContentFlow, RankFlow, SocialSync, and MapGuard
              all mount this same primitive.
            </p>
            <OnboardingWizardDemo />
          </div>
        </Section>

        <Section title="AIActionCard (Wave 34)">
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Universal "AI says do X, click to approve" card. Reads the
              shared registry at{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                @shared/aiActions
              </code>{" "}
              for label, description, icon, and confirmation level. Used by
              every product's AI Insights surface AND the admin alerts table.
              Three confirmation strengths + destructive variant + loading /
              success / failure states below.
            </p>
            <AIActionCardDemo />
          </div>
        </Section>

        <Section title="Wave 71 — KPI primitives + shared ChartTooltip">
          <div className="w-full space-y-6">
            <p className="text-sm text-muted-foreground max-w-3xl">
              Five new chart primitives inspired by premium dashboards
              (Stripe / Linear / Notion). All share the new{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                ChartTooltip
              </code>{" "}
              hover system — light, cursor-follow, theme-aware. The existing
              Sparkline + ProgressRing are also retrofitted: hover anywhere
              on a sparkline or progress ring to see exact values. KpiGauge
              keeps its richer explanation popover (Wave 26.5) — that's a
              different pattern (the "what is this metric &amp; how do I
              improve it" surface), not an exact-value tooltip.
            </p>
            <Wave71Showcase />
          </div>
        </Section>

        <Section title="AdvancedOnly + Display Mode (Wave 36)">
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground">
              Wraps power-user sections. In Simple mode (default), the
              component renders nothing. Toggle Advanced mode in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                /portal/settings?tab=display
              </code>{" "}
              and enable the matching product to reveal wrapped sections.
              The example below renders one panel that is always visible,
              and a sibling panel that only appears when ContentFlow advanced
              is enabled — your toggle preference is honoured live.
            </p>
            <AdvancedOnlyDemo />
          </div>
        </Section>
      </div>

      <OnboardingWalkthrough
        key={restartTour}
        steps={WALKTHROUGH_STEPS}
        storageKey="ui-primitives-tour-v1"
      />
    </AdminLayout>
  );
}

/* ─── Wave 26.6: Copilot metric-reader context preview ──────────────── */
/**
 * Shows the JSON payload structure the Copilot receives when the customer
 * opens it from a product dashboard. Sample values are illustrative — the
 * helpText + improvementTips strings are the LIVE registry data, so this
 * panel doubles as an audit tool: if a gauge's strings are stale, they
 * show up wrong here too (single source of truth).
 */
function CopilotMetricsPreview() {
  const products: DashboardProduct[] = ["contentflow", "rankflow", "socialsync", "tradeline"];
  const [selected, setSelected] = useState<DashboardProduct>("contentflow");

  // Sample illustrative values — purely for the preview JSON.
  const SAMPLE: Record<DashboardProduct, Record<string, number | string>> = {
    contentflow: { articlesThisMonth: 47, approvalRate: 87, detectionScore: 92, distributionReach: 4 },
    rankflow: { avgPosition: 11.4, keywordsImproved: 9, seoScore: 72 },
    socialsync: { postsThisWeek: 12, avgEngagementRate: 0, approvalBacklog: 3, whatsappMessagesThisWeek: 18 },
    tradeline: { answeredToday: 14, callsToday: 17, bookingsThisMonth: 22, costPerBooking: 24.5, estimatedMissedRevenue: 0 },
    mapguard: {},
    reputationshield: {},
    quotequick: { quotesSent: 42, avgDepositPaidRate: 8, revenueThisMonth: 0, activeEmbeds: 2 },
    adflow: { moneySpent: 147_000, jobsBooked: 18, revenueEarned: 450_000, customersReached: 12_400, costPerBooking: 8_200 },
    webcare: { securityGrade: 92, uptimePct: 99.97, daysWithoutIncident: 47, performanceScore: 86, pendingUpdates: 2 },
  };

  const productMeta = METRIC_REGISTRY[selected] ?? {};
  const sampleValues = SAMPLE[selected];
  const previewPayload = {
    product: selected,
    pagePath: `/portal/${selected}/dashboard`,
    metrics: Object.entries(productMeta).map(([key, meta]) => {
      const value = sampleValues[key] ?? 0;
      return {
        key,
        label: meta.label,
        value,
        display: meta.unit ? `${value} ${meta.unit}` : String(value),
        unit: meta.unit ?? null,
        emptyState: value === 0 || value === "",
        helpText: meta.helpText,
        improvementTips: meta.improvementTips,
      };
    }),
    generatedAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Product:</span>
        {products.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={selected === p ? "default" : "outline"}
            onClick={() => setSelected(p)}
            data-testid={`copilot-preview-product-${p}`}
          >
            {p}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        This is the metric block injected into the Copilot system prompt when the customer is on{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/portal/{selected}/dashboard</code>.
        Values shown here are sample illustrations; helpText and improvementTips are pulled live from the shared registry.
      </p>
      <pre
        className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed"
        data-testid="copilot-preview-json"
      >
        {JSON.stringify(previewPayload, null, 2)}
      </pre>
    </div>
  );
}

/* ─── Wave 33: OnboardingWizard interactive demo ─────────────────────── */
/**
 * Mounts a 3-step sample wizard wired to the live shared step renderers.
 * Persistence is a no-op (logs to console) so the demo is safe to click
 * through repeatedly. Reset clears the localStorage draft.
 */
function OnboardingWizardDemo() {
  const steps: OnboardingStep[] = [
    {
      id: "trade",
      title: "What's your trade?",
      description: "TradePickerStep — shared across every product.",
      render: TradePickerStep,
      validate: validateTradePicker,
    },
    {
      id: "area",
      title: "Where do you serve?",
      description: "ServiceAreaStep — business name, ZIP, radius.",
      render: ServiceAreaStep,
      validate: validateServiceArea,
    },
    {
      id: "platforms",
      title: "Which platforms are we monitoring?",
      description: "PlatformConnectStep (reviews mode).",
      render: renderPlatformConnect("reviews"),
      validate: validatePlatformConnect,
    },
  ];

  async function onComplete(state: WizardState) {

    console.info("[demo] OnboardingWizard complete", state);
  }

  return (
    <OnboardingWizard
      product="reputationshield"
      productLabel="Demo product"
      steps={steps}
      onComplete={onComplete}
      onSkip={() => console.info("[demo] OnboardingWizard skipped")}
      conciergeHref="/contact?topic=demo"
      livePreview={(state) => (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-foreground">
            {(state.businessName as string) || "Your business"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {(state.tradeName as string) ?? "Pick a trade →"}
            {state.zip ? ` • ${state.zip as string}` : ""}
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-card p-2 text-[10px] text-muted-foreground">
            {JSON.stringify(state, null, 2)}
          </pre>
        </div>
      )}
    />
  );
}

/* ─── Wave 34: AIActionCard demo ─────────────────────────────────────── */
/**
 * Demonstrates the universal AI-action-with-approval card primitive in
 * the four key states:
 *   1. confirmationLevel: "none"  — fires immediately
 *   2. confirmationLevel: "soft"  — 2-step inline confirm
 *   3. confirmationLevel: "hard"  — modal confirmation
 *   4. destructive variant        — red-tinted, modal, click-only
 * Plus a forced-failure card so reviewers can see the error-restore path,
 * and an admin-context card so reviewers can see it works for both
 * portal AND admin surfaces (Alex's 2026-05-26 directive).
 *
 * onApprove is mocked in-page (no real network) — clicking "Working…"
 * resolves after 800ms with success, except for "force-fail" which
 * resolves with success=false so the error toast is visible.
 */
function AIActionCardDemo() {
  // Each preset mirrors a real registered entry from
  // shared/aiActions/actionRegistry.ts. The card resolves the registry
  // entry itself from (product, context, actionKey).
  const presets: Array<{
    label: string;
    description: string;
    rec: import("@/components/ui/visual-primitives").AIActionRecommendation;
    forceFail?: boolean;
  }> = [
    {
      label: "confirmationLevel: none",
      description: "Acknowledge — fires immediately on click.",
      rec: {
        id: "demo-rec-1",
        title: "You have one unread recommendation",
        reasoning:
          "AI noticed this insight has been pending for 7 days. Acknowledging clears it.",
        actionKey: "acknowledge",
        product: "mapguard",
        context: "portal",
      },
    },
    {
      label: "confirmationLevel: soft",
      description: "Request reviews — 2-step inline confirm (4s window).",
      rec: {
        id: "demo-rec-2",
        title: "Send review requests to recent jobs",
        reasoning:
          "Your last 10 completed jobs haven't been asked to leave a review. The average customer is most willing within 72h of completion.",
        actionKey: "request-reviews-batch",
        product: "reputationshield",
        context: "portal",
      },
    },
    {
      label: "confirmationLevel: hard",
      description: "Harden security — modal confirm, click only.",
      rec: {
        id: "demo-rec-3",
        title: "Enable recommended security defaults",
        reasoning:
          "Your site lacks 2FA, login throttling, and file-edit lockdown. Together they prevent 89% of brute-force attempts.",
        actionKey: "harden-security",
        product: "webcare",
        context: "portal",
      },
    },
    {
      label: "destructive (forced hard + red)",
      description: "Pause campaign — destructive, modal, Enter-key blocked.",
      rec: {
        id: "demo-rec-4",
        title: "Pause underperforming campaign",
        reasoning:
          "Costs $80/booking vs your $45 target. 14-day window. Pausing won't refund already-spent budget.",
        actionKey: "pause-underperforming-campaign",
        product: "adflow",
        context: "portal",
        actionParams: { campaignName: "Spring boiler promo" },
      },
    },
    {
      label: "failure-restore (forced)",
      description: "Forced error so you can see the red-toast + button restored.",
      rec: {
        id: "demo-rec-5",
        title: "Nudge customer who didn't book",
        reasoning:
          "Customer started a quote 6 days ago but didn't complete. A 1-tap nudge brings ~22% back.",
        actionKey: "nudge-customer",
        product: "quotequick",
        context: "portal",
      },
      forceFail: true,
    },
    {
      label: "admin context",
      description: "Wave 12D admin alert — same primitive, admin role.",
      rec: {
        id: "demo-rec-6",
        title: "Vapi assistant provisioning failed for client #42",
        reasoning:
          "The provisioning call returned 429. Most common fix: re-run the request — Vapi was rate-limiting.",
        actionKey: "retry-vapi-assistant",
        product: "system",
        context: "admin",
        actionParams: { alertId: 9999 },
      },
    },
  ];

  const [log, setLog] = useState<string[]>([]);

  async function mockApprove(
    actionKey: string,
    params: Record<string, unknown>,
    forceFail: boolean,
  ) {
    await new Promise((r) => window.setTimeout(r, 800));
    if (forceFail) {
      setLog((l) =>
        [`failed ${actionKey} ${JSON.stringify(params)}`, ...l].slice(0, 6),
      );
      return { success: false, message: "Demo: forced failure for QA." };
    }
    setLog((l) =>
      [`ok ${actionKey} ${JSON.stringify(params)}`, ...l].slice(0, 6),
    );
    return { success: true, message: "Demo: action completed." };
  }

  return (
    <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
      {presets.map((p) => (
        <div key={p.rec.id} className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {p.label}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {p.description}
          </div>
          <AIActionCard
            recommendation={p.rec}
            onApprove={(k, params) => mockApprove(k, params, !!p.forceFail)}
            onDismiss={() => {
              setLog((l) =>
                [`dismissed ${p.rec.id}`, ...l].slice(0, 6),
              );
            }}
          />
        </div>
      ))}
      <div className="col-span-full">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Last 6 events
        </div>
        <pre className="mt-1 overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px]">
          {log.length ? log.join("\n") : "(none yet — click an action above)"}
        </pre>
      </div>
    </div>
  );
}

/* ─── Wave 71: KPI primitives + ChartTooltip showcase ────────────────── */

function Wave71Block({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2 min-w-0 overflow-hidden">
      <div className="space-y-0.5">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground leading-snug max-w-prose">
          {caption}
        </div>
      </div>
      {/* Wave 71.5 — mobile fix: each demo chart can be a fixed-pixel
          SVG. Allow horizontal scroll within the block so the chart is
          still inspectable on narrow viewports without blowing out the
          page width. */}
      <div className="pt-2 max-w-full overflow-x-auto">{children}</div>
    </div>
  );
}

function Wave71Showcase() {
  // Sample data — synthetic, realistic-looking. No PII / no live wiring.
  const revenueSeries = [820, 1050, 980, 1340, 1180, 1520, 1690, 1430, 1810, 2050, 1880, 2240];
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
      <Wave71Block
        title="SparklineWithPeak"
        caption="Hero trend chart that celebrates the best moment in the series. Use when one peak is the story — pricing wins, traffic spikes, MRR records. Hover anywhere to read the exact value at that point."
      >
        <SparklineWithPeak
          data={revenueSeries}
          pointLabels={monthLabels}
          peakLabel="+$2,240"
          color="emerald"
          formatValue={(n) => `$${n.toLocaleString()}`}
          width={360}
          height={108}
        />
      </Wave71Block>

      <Wave71Block
        title="BarComparisonCard"
        caption="Two-bar side-by-side comparison. Use for traffic-source splits, channel mix, A/B winners. The larger value fills the full width; the smaller scales proportionally. Hover a bar for value + percent of total."
      >
        <BarComparisonCard
          title="Order sources this month"
          items={[
            { label: "Direct Store", value: 302, color: "sapphire" },
            { label: "Referral", value: 184, color: "violet" },
          ]}
        />
      </Wave71Block>

      <Wave71Block
        title="MonthlyBarSeries"
        caption="Compact row of period bars (5-12). One bar is highlighted in accent — typically the latest or peak period. Pairs well with a big-number lede + growth caption above."
      >
        <MonthlyBarSeries
          lede="$42,810"
          caption="↑ 9.2% growth this quarter"
          color="sapphire"
          bars={[
            { label: "Jul", value: 28 },
            { label: "Aug", value: 32 },
            { label: "Sep", value: 36 },
            { label: "Oct", value: 30 },
            { label: "Nov", value: 38 },
            { label: "Dec", value: 42, highlighted: true },
          ]}
          formatValue={(n) => `$${(n * 1000).toLocaleString()}`}
        />
      </Wave71Block>

      <Wave71Block
        title="DonutChart"
        caption="Donut with right-side legend. Use for segmentation — visitor sources, plan mix, lead categories. Arcs draw clockwise on mount; hover or focus a segment / legend row to see share + value."
      >
        <DonutChart
          title="Visitor segmentation"
          centerLabel="14.2k"
          centerSub="visits"
          segments={[
            { label: "Organic search", value: 5600 },
            { label: "Direct", value: 3800 },
            { label: "Paid social", value: 2400 },
            { label: "Referral", value: 1500 },
            { label: "Email", value: 900 },
          ]}
        />
      </Wave71Block>

      <Wave71Block
        title="SemiGauge"
        caption="Half-arc speedometer for satisfaction / health-score / NPS surfaces. Verdict color-shifts at 80% (emerald) / 50% (amber) / below (crimson). Advice line below explains the recommended next step."
      >
        <SemiGauge
          value={73}
          max={100}
          unit="%"
          label="Customer satisfaction"
          verdict="Good, room for improvement"
          advice="Focus on faster shipping and clearer order status updates to push toward 80%+."
        />
      </Wave71Block>

      <Wave71Block
        title="Retrofitted hover — Sparkline + ProgressRing"
        caption="The existing decorative primitives now expose exact values on hover via the shared ChartTooltip. KpiGauge keeps its richer Wave 26.5 explanation popover (different pattern, intentional)."
      >
        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sparkline (hover the line)
            </div>
            <Sparkline
              values={revenueSeries}
              pointLabels={monthLabels}
              formatValue={(n) => `$${n.toLocaleString()}`}
              variant="area"
              color="sapphire"
              width={200}
              height={48}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              ProgressRing (hover the ring)
            </div>
            <ProgressRing
              value={72}
              max={100}
              unit="%"
              label="Quota"
              size="md"
              color="violet"
              valueTooltipCaption="Active deals"
            />
          </div>
        </div>
      </Wave71Block>
    </div>
  );
}

/* ─── Wave 36: AdvancedOnly + Display Mode demo ──────────────────────── */

function AdvancedOnlyDemo() {
  const { preferences, isAdvancedMode, updateAsync, isSaving } = useDisplayPreferences();

  return (
    <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-md border p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Always visible
        </div>
        <p className="mt-1 text-sm">
          This panel renders regardless of Display Mode. Treat it like a
          dashboard's hero KPI.
        </p>
      </div>
      <AdvancedOnly
        product="contentflow"
        fallback={
          <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            (Hidden in Simple mode — turn on ContentFlow advanced in Settings.)
          </div>
        }
      >
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            Advanced — ContentFlow
          </div>
          <p className="mt-1 text-sm text-emerald-900">
            Visible because you have Advanced mode on AND ContentFlow advanced
            toggled on. Wrapped sections like this disappear in Simple mode.
          </p>
        </div>
      </AdvancedOnly>
      <div className="col-span-full flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-xs">
        <span>
          Current mode:{" "}
          <strong>{isAdvancedMode ? "Advanced" : "Simple"}</strong>
        </span>
        <span>
          ContentFlow advanced:{" "}
          <strong>
            {preferences.contentflow_show_advanced ? "on" : "off"}
          </strong>
        </span>
        <button
          type="button"
          disabled={isSaving}
          className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
          onClick={() =>
            updateAsync({
              mode: isAdvancedMode ? "simple" : "advanced",
              contentflow_show_advanced: !isAdvancedMode,
            })
          }
          data-testid="advanced-only-demo-toggle"
        >
          {isAdvancedMode ? "Switch to Simple" : "Enable Advanced + ContentFlow"}
        </button>
      </div>
    </div>
  );
}
