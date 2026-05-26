/**
 * SentimentHeatmap — TradeLine UI upgrade Wave 26.
 *
 * Horizontal heatmap timeline for a completed call's transcript.
 * Each utterance (computed server-side at /api/portal/tradeline/sentiment/:id)
 * appears as a colour-coded segment proportional to its duration:
 *   - positive → chart-2 (green)
 *   - neutral  → chart-1 muted (blue)
 *   - negative → chart-5 (red)
 *
 * Hover: tooltip surfaces the utterance text + exact score.
 * Click: emits `onSeek(startSec)` so the parent (call detail panel) can
 *        jump the audio player to that timestamp.
 *
 * Animation: segments fade-in left→right on mount, staggered. Respects
 * prefers-reduced-motion.
 */

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SentimentSegment {
  startSec: number;
  endSec: number;
  role: string;
  text: string;
  sentiment: "positive" | "neutral" | "negative";
  score: number;
}

export interface SentimentHeatmapProps {
  segments: SentimentSegment[];
  durationSeconds: number;
  onSeek?: (sec: number) => void;
  className?: string;
}

const COLOR_BY_SENTIMENT: Record<SentimentSegment["sentiment"], string> = {
  positive: "bg-[hsl(var(--chart-2)/0.7)] hover:bg-[hsl(var(--chart-2)/0.85)]",
  neutral: "bg-[hsl(var(--chart-1)/0.45)] hover:bg-[hsl(var(--chart-1)/0.6)]",
  negative: "bg-[hsl(var(--chart-5)/0.7)] hover:bg-[hsl(var(--chart-5)/0.85)]",
};

const LABEL_BY_SENTIMENT: Record<SentimentSegment["sentiment"], string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

function formatSec(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function SentimentHeatmap({
  segments,
  durationSeconds,
  onSeek,
  className,
}: SentimentHeatmapProps) {
  const reduceMotion = useReducedMotion();
  const [hover, setHover] = useState<{ idx: number; clientX: number } | null>(
    null,
  );

  const totalSec = Math.max(durationSeconds, segments[segments.length - 1]?.endSec ?? 1, 1);

  const tally = useMemo(() => {
    const t = { positive: 0, neutral: 0, negative: 0 };
    for (const s of segments) {
      const dur = Math.max(1, s.endSec - s.startSec);
      t[s.sentiment] += dur;
    }
    return t;
  }, [segments]);

  const hoverSegment = hover ? segments[hover.idx] : null;

  if (segments.length === 0) {
    return (
      <div
        className={cn("rounded-lg border bg-card p-4", className)}
        data-testid="sentiment-heatmap-empty"
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Sentiment timeline
        </span>
        <p className="mt-2 text-xs text-muted-foreground/80">
          No transcript yet. Sentiment appears here once Vapi finalises the
          call recording.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-lg border bg-card p-4", className)}
      data-testid="sentiment-heatmap"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sentiment timeline
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            Click a segment to jump to that moment
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
          <Legend color="positive" label={`Positive ${Math.round((tally.positive / totalSec) * 100)}%`} />
          <Legend color="neutral" label={`Neutral ${Math.round((tally.neutral / totalSec) * 100)}%`} />
          <Legend color="negative" label={`Negative ${Math.round((tally.negative / totalSec) * 100)}%`} />
        </div>
      </div>

      <div
        className="relative flex h-8 w-full overflow-hidden rounded-md bg-muted/30 ring-1 ring-[color:var(--border)]"
        onMouseLeave={() => setHover(null)}
      >
        {segments.map((seg, i) => {
          const widthPct = ((seg.endSec - seg.startSec) / totalSec) * 100;
          return (
            <motion.button
              key={i}
              type="button"
              aria-label={`${LABEL_BY_SENTIMENT[seg.sentiment]} segment, ${formatSec(seg.startSec)} to ${formatSec(seg.endSec)}`}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.35,
                ease: "easeOut",
                delay: i * 0.02,
              }}
              onClick={() => onSeek?.(seg.startSec)}
              onMouseEnter={(e) => setHover({ idx: i, clientX: e.clientX })}
              className={cn(
                "h-full border-r border-background/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:hsl(var(--ring))]",
                COLOR_BY_SENTIMENT[seg.sentiment],
              )}
              style={{ width: `${widthPct}%` }}
            />
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>0:00</span>
        <span>{formatSec(totalSec)}</span>
      </div>

      {hoverSegment && (
        <div
          role="tooltip"
          className="mt-2 rounded-md border bg-popover p-2 text-[11px] shadow-sm"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">
              {LABEL_BY_SENTIMENT[hoverSegment.sentiment]}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatSec(hoverSegment.startSec)} – {formatSec(hoverSegment.endSec)} · score {hoverSegment.score.toFixed(2)}
            </span>
          </div>
          <p className="text-muted-foreground">
            <span className="mr-1 font-medium uppercase tracking-wide text-muted-foreground/70">
              {hoverSegment.role === "assistant" ? "AI" : "Caller"}:
            </span>
            {hoverSegment.text}
          </p>
        </div>
      )}
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: SentimentSegment["sentiment"];
  label: string;
}) {
  const dot =
    color === "positive"
      ? "bg-[hsl(var(--chart-2))]"
      : color === "negative"
        ? "bg-[hsl(var(--chart-5))]"
        : "bg-[hsl(var(--chart-1)/0.6)]";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-3 w-3 rounded-full", dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

export default SentimentHeatmap;
