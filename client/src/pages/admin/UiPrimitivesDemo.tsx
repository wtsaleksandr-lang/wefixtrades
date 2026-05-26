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
  VisualCalendar,
  buildEntryDate,
  ApprovalInbox,
  AIDraftEditor,
  type WalkthroughStep,
  type PipelineStripStage,
  type CalendarEntry,
  type InboxItem,
  type InboxAction,
} from "@/components/ui/visual-primitives";
import {
  METRIC_REGISTRY,
  type DashboardProduct,
} from "@shared/copilot/metricRegistry";

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
  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-start gap-6">{children}</div>
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
      <div className="space-y-6">
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
