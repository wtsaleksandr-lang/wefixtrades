/**
 * CitationHealthRing — 3-arc donut showing Found / Missing / Inconsistent.
 *
 * Wave 27 MapGuard upgrade. Sibling to the Wave 26.7 ProgressRing
 * primitive but renders three concentric coloured arcs (one per status)
 * so the customer sees the full citation-health composition at a glance.
 * Centre shows the dominant "% healthy" number using AnimatedCounter.
 *
 * Per the competitive research: "Competitors show lists; nobody ships a
 * single-glance gauge." This is the single-glance gauge.
 *
 * No new deps. Pure SVG. Respects `prefers-reduced-motion`.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/visual-primitives";

export interface CitationHealthRingProps {
  found: number;
  missing: number;
  inconsistent: number;
  /** Compact size used inside KPI tile rows. */
  size?: "sm" | "md";
  className?: string;
  /** True when there's no citation data yet (no subscription / pre-scan). */
  emptyState?: boolean;
}

const SIZE_PX: Record<"sm" | "md", number> = { sm: 96, md: 140 };
const THICKNESS: Record<"sm" | "md", number> = { sm: 10, md: 14 };

const COLOR_FOUND = "hsl(var(--gauge-emerald))";
const COLOR_MISSING = "hsl(var(--gauge-crimson))";
const COLOR_INCONSISTENT = "hsl(var(--gauge-amber))";

export function CitationHealthRing({
  found,
  missing,
  inconsistent,
  size = "md",
  className,
  emptyState,
}: CitationHealthRingProps) {
  const reduceMotion = useReducedMotion();
  const px = SIZE_PX[size];
  const stroke = THICKNESS[size];
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const total = found + missing + inconsistent;
  const pct = total === 0 ? 0 : Math.round((found / total) * 100);

  // Convert each segment to a (dashLength, offset) pair on the same circle.
  const segments = useMemo(() => {
    if (total === 0) return [] as Array<{ color: string; length: number; offset: number }>;
    const foundLen = (found / total) * circumference;
    const incLen = (inconsistent / total) * circumference;
    const missLen = (missing / total) * circumference;
    return [
      { color: COLOR_FOUND, length: foundLen, offset: 0 },
      { color: COLOR_INCONSISTENT, length: incLen, offset: foundLen },
      { color: COLOR_MISSING, length: missLen, offset: foundLen + incLen },
    ];
  }, [found, inconsistent, missing, total, circumference]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2",
        emptyState && "opacity-60",
        className,
      )}
      data-testid="citation-health-ring"
    >
      <div
        className="relative"
        style={{ width: px, height: px }}
        role="img"
        aria-label={`Citation health: ${found} found, ${missing} missing, ${inconsistent} inconsistent`}
      >
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
            opacity={0.4}
          />

          {/* Segments */}
          {segments.map((seg, i) => (
            <motion.circle
              key={i}
              cx={px / 2}
              cy={px / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              initial={
                reduceMotion
                  ? false
                  : { strokeDasharray: `0 ${circumference}` }
              }
              animate={{
                strokeDasharray: `${seg.length} ${circumference}`,
              }}
              transition={{
                duration: reduceMotion ? 0 : 1.2,
                delay: reduceMotion ? 0 : 0.1 * i,
                ease: "easeOut",
              }}
              style={{
                strokeDashoffset: -seg.offset,
              }}
            />
          ))}
        </svg>

        {/* Centre */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-semibold leading-none text-foreground",
              size === "sm" ? "text-lg" : "text-2xl",
            )}
          >
            <AnimatedCounter value={pct} suffix="%" duration={1000} />
          </span>
          <span
            className={cn(
              "text-muted-foreground",
              size === "sm" ? "text-[9px]" : "text-[11px]",
            )}
          >
            healthy
          </span>
        </div>
      </div>

      {/* Legend chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Chip color={COLOR_FOUND} label="Found" count={found} />
        <Chip color={COLOR_INCONSISTENT} label="Inconsistent" count={inconsistent} />
        <Chip color={COLOR_MISSING} label="Missing" count={missing} />
      </div>
    </div>
  );
}

function Chip({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-foreground">{count}</span>
      <span>{label}</span>
    </span>
  );
}
