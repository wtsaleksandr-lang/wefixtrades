/**
 * Wave 25 — Best-time-to-post score overlay for empty calendar slots.
 *
 * Per competitive research, Sprout Social uses a 1-5 star "ViralPost" score
 * for best-time-to-post. Going to a 0-100 gauge is more legible and feels
 * tighter alongside the existing KpiGauge / engagement gauges.
 *
 * The score (0..100) is computed server-side from:
 *   - the customer's historical engagement-by-hour-of-week (when present)
 *   - platform-typical "best time" defaults when historical data is thin
 *
 * Rendering: a compact pill sized to fit inside an empty VisualCalendar
 * slot. Color tier:
 *   - >=70 green  ("great time")
 *   - >=40 amber  ("okay")
 *   - <40  muted  ("low engagement window")
 *
 * Click → composer pre-fills with that timestamp + a Claude-generated
 * suggestion via ContentFlow.
 */

import { cn } from "@/lib/utils";

export interface PostScoreOverlayProps {
  score: number; // 0..100
  onClick?: () => void;
  className?: string;
  /** Compact mode: smaller font + no label. Used inside calendar month cells. */
  compact?: boolean;
}

function tier(score: number): "green" | "amber" | "muted" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "muted";
}

const TIER_CLASS: Record<ReturnType<typeof tier>, string> = {
  green:
    "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] ring-[hsl(var(--chart-2)/0.4)]",
  amber:
    "bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] ring-[hsl(var(--chart-4)/0.4)]",
  muted:
    "bg-muted text-muted-foreground ring-[color:var(--border)]",
};

export function PostScoreOverlay({
  score,
  onClick,
  className,
  compact,
}: PostScoreOverlayProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const t = tier(clamped);
  const label =
    t === "green" ? "Great" : t === "amber" ? "Okay" : "Low";
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        TIER_CLASS[t],
        compact ? "py-0" : "",
        onClick ? "transition-colors hover:bg-opacity-30" : "",
        className,
      )}
      data-testid="post-score-overlay"
      data-score={clamped}
      aria-label={`Post score ${clamped} of 100 (${label})`}
      title={`${label} time to post — score ${clamped}/100`}
    >
      <span aria-hidden="true">{clamped}</span>
      {!compact ? <span className="opacity-70">/100</span> : null}
    </Comp>
  );
}

export default PostScoreOverlay;
