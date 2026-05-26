/**
 * DayPartingHeatmap — AdFlow 24h × 7d grid (Wave 30).
 *
 * 7 columns (days) × 24 rows (hours). Each cell colored by the chosen
 * metric — jobs booked / spend / score. Hover surfaces the metric value
 * for that day-hour. Reveals "Friday 2-4pm is your gold zone"-style
 * insights.
 *
 * Per the Wave 30 anti-patterns: hide this surface (empty state) when
 * there's less than 14 days of source data.
 *
 * No raw hex — semantic tokens only.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock4 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DayPartingMetric = "score" | "jobs" | "spend";

interface DayPartingCell {
  day: number; // 0=Sun
  hour: number; // 0-23
  spendCents: number;
  jobsBooked: number;
  score: number;
  tone: "emerald" | "amber" | "crimson" | "neutral";
}

export interface DayPartingHeatmapProps {
  cells: DayPartingCell[];
  hasEnoughData: boolean;
  daysOfData: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TONE_VAR: Record<DayPartingCell["tone"], string> = {
  emerald: "var(--chart-2)",
  amber: "var(--chart-4)",
  crimson: "var(--chart-5)",
  neutral: "var(--muted-foreground)",
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

export function DayPartingHeatmap({
  cells,
  hasEnoughData,
  daysOfData,
}: DayPartingHeatmapProps) {
  const [metric, setMetric] = useState<DayPartingMetric>("score");

  const grid = useMemo(() => {
    const map = new Map<string, DayPartingCell>();
    for (const c of cells) map.set(`${c.day}|${c.hour}`, c);
    return map;
  }, [cells]);

  if (!hasEnoughData) {
    return (
      <Card
        className="flex flex-col items-center gap-2 p-6 text-center"
        data-testid="dayparting-empty"
      >
        <Clock4 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          Best-time heatmap unlocks at 14 days of data
        </p>
        <p className="text-xs text-muted-foreground">
          You're at {daysOfData} day{daysOfData === 1 ? "" : "s"} of campaign
          history. We need at least 14 days to spot day-of-week + hour-of-day
          patterns reliably.
        </p>
      </Card>
    );
  }

  const peak = useMemo(() => {
    let best: DayPartingCell | null = null;
    for (const c of cells) {
      const cur = metric === "score" ? c.score : metric === "jobs" ? c.jobsBooked : c.spendCents;
      const bestVal = best
        ? metric === "score"
          ? best.score
          : metric === "jobs"
            ? best.jobsBooked
            : best.spendCents
        : -1;
      if (cur > bestVal) best = c;
    }
    return best;
  }, [cells, metric]);

  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="dayparting-heatmap">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-foreground">
            Your gold-zone hours
          </h2>
          {peak && (
            <p className="text-[11px] text-muted-foreground">
              Peak {metric === "spend" ? "spend" : metric === "jobs" ? "bookings" : "score"}:{" "}
              <span className="font-medium text-foreground">
                {DAY_LABELS[peak.day]} {hourLabel(peak.hour)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <MetricToggle current={metric} onChange={setMetric} value="score" label="Score" />
          <MetricToggle current={metric} onChange={setMetric} value="jobs" label="Jobs" />
          <MetricToggle current={metric} onChange={setMetric} value="spend" label="Spend" />
        </div>
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="overflow-x-auto">
          <div className="flex min-w-[36rem] flex-col">
            <div className="flex">
              <div className="w-10" />
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="flex-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="flex">
                <div className="w-10 py-0.5 text-right text-[10px] text-muted-foreground">
                  {h % 3 === 0 ? hourLabel(h) : ""}
                </div>
                {DAY_LABELS.map((_d, dow) => {
                  const cell = grid.get(`${dow}|${h}`);
                  return (
                    <div key={dow} className="flex-1 p-0.5">
                      <HeatCell cell={cell} metric={metric} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>
    </Card>
  );
}

function MetricToggle({
  current,
  onChange,
  value,
  label,
}: {
  current: DayPartingMetric;
  onChange: (m: DayPartingMetric) => void;
  value: DayPartingMetric;
  label: string;
}) {
  const active = current === value;
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-6 px-2 text-[11px]"
      onClick={() => onChange(value)}
      data-testid={`dayparting-toggle-${value}`}
    >
      {label}
    </Button>
  );
}

function HeatCell({
  cell,
  metric,
}: {
  cell?: DayPartingCell;
  metric: DayPartingMetric;
}) {
  if (!cell) {
    return <div className="h-3.5 rounded-sm border border-dashed border-border" />;
  }
  const tone = TONE_VAR[cell.tone];
  const intensity = Math.max(
    0.06,
    Math.min(0.9, (cell.score / 100) * 0.85 + 0.06),
  );
  const valueLabel =
    metric === "score"
      ? `${cell.score}/100`
      : metric === "jobs"
        ? `${cell.jobsBooked} jobs`
        : dollars(cell.spendCents);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-3.5 w-full rounded-sm transition-opacity hover:opacity-80",
          )}
          style={{
            backgroundColor: `hsl(${tone} / ${intensity})`,
            border: `1px solid hsl(${tone} / 0.4)`,
          }}
          aria-label={valueLabel}
        />
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="flex flex-col gap-0.5 text-xs">
          <p className="font-semibold">
            {DAY_LABELS[cell.day]} · {hourLabel(cell.hour)}
          </p>
          <p>Score: {cell.score}/100</p>
          <p>Bookings: {cell.jobsBooked}</p>
          <p>Spend: {dollars(cell.spendCents)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
