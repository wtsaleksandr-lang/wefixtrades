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
import { Sparkles, FileText, ListChecks, Send, CheckCircle2 } from "lucide-react";
import {
  AnimatedCounter,
  KpiGauge,
  PipelineStrip,
  StatusPill,
  LetterGradeBadge,
  OnboardingWalkthrough,
  VisualCalendar,
  buildEntryDate,
  type WalkthroughStep,
  type PipelineStripStage,
  type CalendarEntry,
} from "@/components/ui/visual-primitives";

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

export default function UiPrimitivesDemo() {
  const [counter, setCounter] = useState<number>(42);
  const [gaugeValue, setGaugeValue] = useState<number>(72);
  const [stageCounts, setStageCounts] = useState<number[]>([12, 4, 2, 1]);
  const [restartTour, setRestartTour] = useState<number>(0);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>(() =>
    buildCalendarSeed()
  );

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
              Visual primitives (Wave 22A)
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Six reusable components — built once, consumed by Waves 23
              (ContentFlow), 24 (RankFlow), 25 (SocialSync). All animations
              respect prefers-reduced-motion. No raw hex; semantic tokens only.
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
