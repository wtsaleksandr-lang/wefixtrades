/**
 * SentimentHeatmap — Wave 28.
 *
 * GitHub-style 12-week × 7-day contribution grid colored by daily review
 * sentiment. Each cell:
 *   - emerald: mostly positive (4-5 star reviews, no negatives)
 *   - sapphire: neutral or no reviews
 *   - amber: mixed (positive + at least one negative)
 *   - crimson: dominated by negative reviews
 *
 * Hover shows the breakdown via title attribute. Click bubbles up to the
 * parent so the dashboard can filter the inbox to that day.
 *
 * Hard cap at 12 weeks per spec — that's the data-density sweet spot.
 *
 * DESIGN-SYSTEM: semantic tokens only, no hover-shift, respects
 * prefers-reduced-motion via cell render (no animation).
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HeatmapSentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "mixed"
  | "none";

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  sentiment: HeatmapSentiment;
}

export interface SentimentHeatmapProps {
  cells: HeatmapCell[];
  onSelectDate?: (date: string) => void;
  emptyState?: boolean;
  className?: string;
}

const SENTIMENT_CLASS: Record<HeatmapSentiment, string> = {
  positive: "bg-[hsl(var(--chart-2)/0.85)] hover:bg-[hsl(var(--chart-2))]",
  neutral: "bg-[hsl(var(--chart-1)/0.45)] hover:bg-[hsl(var(--chart-1)/0.7)]",
  negative: "bg-[hsl(var(--destructive)/0.85)] hover:bg-[hsl(var(--destructive))]",
  mixed: "bg-[hsl(var(--chart-4)/0.85)] hover:bg-[hsl(var(--chart-4))]",
  none: "bg-muted hover:bg-muted/80",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function tooltipFor(c: HeatmapCell): string {
  if (c.count === 0) return `${c.date} · no reviews`;
  return `${c.date} · ${c.count} review${c.count === 1 ? "" : "s"} (${c.positive}+/${c.neutral}~/${c.negative}-)`;
}

export function SentimentHeatmap({
  cells,
  onSelectDate,
  emptyState,
  className,
}: SentimentHeatmapProps) {
  // Reshape into 12 columns × 7 rows. Cells arrive oldest → newest, so
  // we group sequentially.
  const columns = useMemo(() => {
    const weeks: HeatmapCell[][] = [];
    for (let w = 0; w < 12; w++) {
      const start = w * 7;
      weeks.push(cells.slice(start, start + 7));
    }
    return weeks;
  }, [cells]);

  if (emptyState || cells.length === 0) {
    return (
      <Card
        className={cn("flex flex-col gap-2 p-4", className)}
        data-testid="reputationshield-sentiment-heatmap"
      >
        <Header />
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          No reviews in the last 12 weeks yet.
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn("flex flex-col gap-2 p-4", className)}
      data-testid="reputationshield-sentiment-heatmap"
    >
      <Header />
      <div className="flex gap-2">
        {/* Day-of-week column */}
        <div
          className="flex flex-col gap-[2px] pt-1 text-[9px] text-muted-foreground/70"
          aria-hidden="true"
        >
          {DAY_LABELS.map((d, idx) => (
            <span
              key={idx}
              className="flex h-[14px] items-center justify-center"
              style={{ width: 10 }}
            >
              {idx % 2 === 1 ? d : ""}
            </span>
          ))}
        </div>

        {/* 12 week columns */}
        <div className="flex flex-1 gap-[2px]">
          {columns.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-1 flex-col gap-[2px]">
              {Array.from({ length: 7 }).map((_, dIdx) => {
                const cell = week[dIdx];
                if (!cell) {
                  return (
                    <span
                      key={dIdx}
                      className="block h-[14px] rounded-sm bg-transparent"
                      aria-hidden="true"
                    />
                  );
                }
                return (
                  <button
                    type="button"
                    key={dIdx}
                    onClick={() => onSelectDate?.(cell.date)}
                    title={tooltipFor(cell)}
                    aria-label={tooltipFor(cell)}
                    className={cn(
                      "block h-[14px] rounded-sm ring-1 ring-inset ring-[color:var(--border)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--chart-1))]",
                      SENTIMENT_CLASS[cell.sentiment],
                    )}
                    data-testid={`heatmap-cell-${cell.date}`}
                    data-sentiment={cell.sentiment}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Legend />
    </Card>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Sentiment heatmap
        </h3>
        <p
          className="text-[11px] text-muted-foreground"
          title="Each cell is one day in the last 12 weeks. Color = daily review sentiment."
        >
          12 weeks · click a day to filter the inbox
        </p>
      </div>
    </div>
  );
}

function Legend() {
  const items: { key: HeatmapSentiment; label: string }[] = [
    { key: "none", label: "None" },
    { key: "positive", label: "Positive" },
    { key: "neutral", label: "Neutral" },
    { key: "mixed", label: "Mixed" },
    { key: "negative", label: "Negative" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1">
          <span
            className={cn("inline-block h-3 w-3 rounded-sm", SENTIMENT_CLASS[i.key])}
            aria-hidden="true"
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export default SentimentHeatmap;
