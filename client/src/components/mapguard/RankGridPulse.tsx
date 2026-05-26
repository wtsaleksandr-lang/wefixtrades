/**
 * RankGridPulse — 5×5 rank heatmap with animated counters + pulse aura.
 *
 * Wave 27 MapGuard upgrade. Each cell shows the customer's local-pack
 * position at that pin (1-best, 20-no-rank) plus, when the rank changed
 * in the last 7 days, a small delta indicator and a pulsing outer ring
 * (green = improved, red = declined).
 *
 * Animations all respect `prefers-reduced-motion`: pulse stops, counters
 * snap to value. No new npm deps — relies on framer-motion already in
 * the bundle (Wave 22A primitives shipped it).
 *
 * Anti-patterns avoided:
 *  - No raw hex (Wave 26.5 palette tokens only).
 *  - No expansion beyond 5×5 (LocalFalcon's 21×21 is a separate effort).
 *  - No hover-shift on cells — selection uses outline, not bright fill.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/visual-primitives";

export interface RankGridCell {
  /** 0-indexed row (0..4). */
  row: number;
  /** 0-indexed col (0..4). */
  col: number;
  /** Current rank at this pin (1-best). null = not ranked / out of top 20. */
  rank: number | null;
  /** Rank delta vs 7d ago. Positive = improved (rank dropped 7→3 = +4). null = no prior data. */
  delta7d: number | null;
}

export interface RankGridPulseProps {
  /** 25 cells (5×5). Missing cells render as a "no data" tile. */
  cells: RankGridCell[];
  /** Optional centre-of-area label shown beneath the grid (e.g. "Manchester, M1"). */
  centerLabel?: string;
  /** Selected cell row/col index. */
  selected?: { row: number; col: number } | null;
  onSelectCell?: (cell: RankGridCell) => void;
  className?: string;
  /**
   * Empty-state — when no scan has run yet. Renders a dimmed grid instead
   * of 25 "no data" cells.
   */
  emptyState?: boolean;
}

/**
 * Pick the gauge-palette colour token for a rank.
 *  rank 1-3   → emerald  (Map Pack)
 *  rank 4-10  → amber    (page 1)
 *  rank 11-20 → crimson  (page 2+)
 *  null       → muted    (unranked)
 */
function rankColorVar(rank: number | null): string {
  if (rank == null) return "var(--muted)";
  if (rank <= 3) return "hsl(var(--gauge-emerald))";
  if (rank <= 10) return "hsl(var(--gauge-amber))";
  return "hsl(var(--gauge-crimson))";
}

function rankTextClass(rank: number | null): string {
  if (rank == null) return "text-muted-foreground";
  if (rank <= 3) return "text-[hsl(var(--gauge-emerald))]";
  if (rank <= 10) return "text-[hsl(var(--gauge-amber))]";
  return "text-[hsl(var(--gauge-crimson))]";
}

function pulseColorVar(delta: number | null): string | null {
  if (delta == null || delta === 0) return null;
  return delta > 0
    ? "hsl(var(--gauge-emerald))"
    : "hsl(var(--gauge-crimson))";
}

export function RankGridPulse({
  cells,
  centerLabel,
  selected,
  onSelectCell,
  className,
  emptyState,
}: RankGridPulseProps) {
  const reduceMotion = useReducedMotion();

  // Build a 5×5 matrix keyed by row,col so missing cells become null.
  const matrix = useMemo<(RankGridCell | null)[][]>(() => {
    const grid: (RankGridCell | null)[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => null),
    );
    for (const c of cells) {
      if (c.row >= 0 && c.row < 5 && c.col >= 0 && c.col < 5) {
        grid[c.row][c.col] = c;
      }
    }
    return grid;
  }, [cells]);

  return (
    <div
      className={cn("flex flex-col items-center gap-2", className)}
      data-testid="rank-grid-pulse"
    >
      <div
        className={cn(
          "grid grid-cols-5 gap-0.5",
          emptyState && "opacity-60",
        )}
      >
        {matrix.flatMap((row, rIdx) =>
          row.map((cell, cIdx) => {
            const key = `${rIdx}-${cIdx}`;
            const isSelected =
              selected?.row === rIdx && selected?.col === cIdx;
            const rank = cell?.rank ?? null;
            const delta = cell?.delta7d ?? null;
            const pulse = pulseColorVar(delta);

            return (
              <button
                key={key}
                type="button"
                aria-label={
                  rank == null
                    ? `Pin ${rIdx + 1}-${cIdx + 1} unranked`
                    : `Pin ${rIdx + 1}-${cIdx + 1} rank ${rank}${
                        delta && delta !== 0
                          ? `, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`
                          : ""
                      }`
                }
                onClick={() =>
                  cell &&
                  onSelectCell?.(cell)
                }
                disabled={!cell || !onSelectCell}
                data-testid={`rank-cell-${rIdx}-${cIdx}`}
                className={cn(
                  "relative flex h-14 w-14 flex-col items-center justify-center rounded-md border bg-card transition-colors",
                  isSelected
                    ? "border-foreground ring-1 ring-foreground"
                    : "border-border",
                  onSelectCell && cell && "cursor-pointer",
                )}
                style={{
                  backgroundColor:
                    rank != null
                      ? `color-mix(in srgb, ${rankColorVar(rank)} 12%, transparent)`
                      : undefined,
                }}
              >
                {/* Pulse aura when 7d delta is non-zero */}
                {pulse && !reduceMotion && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-md"
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.15, 1] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                    style={{
                      boxShadow: `0 0 0 2px ${pulse}`,
                    }}
                  />
                )}

                <span
                  className={cn(
                    "relative z-10 text-base font-semibold leading-none",
                    rankTextClass(rank),
                  )}
                >
                  {rank == null ? (
                    <Minus className="h-3.5 w-3.5 opacity-50" aria-hidden />
                  ) : (
                    <AnimatedCounter value={rank} duration={600} />
                  )}
                </span>

                {/* Delta badge */}
                {delta != null && delta !== 0 && (
                  <span
                    className={cn(
                      "relative z-10 mt-0.5 flex items-center gap-0.5 text-[10px] font-medium leading-none",
                      delta > 0
                        ? "text-[hsl(var(--gauge-emerald))]"
                        : "text-[hsl(var(--gauge-crimson))]",
                    )}
                  >
                    {delta > 0 ? (
                      <TrendingUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden />
                    )}
                    {Math.abs(delta)}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {centerLabel && (
        <p className="text-[11px] text-muted-foreground">
          Pinned to {centerLabel}
        </p>
      )}
    </div>
  );
}
