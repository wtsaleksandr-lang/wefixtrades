/**
 * RankGridMap — the PORTAL MapGuard rank grid rendered on the REAL Google
 * static map with geo-projected pins.
 *
 * Replaces the abstract CSS-box grid (RankGridPulse) as the dashboard's
 * headline visual. This is the same map the public Local Rank Grid tool shows:
 *   - server-proxied Google static map background (/api/audit/static-map)
 *   - 25 numbered, colour-coded rank pins projected onto it via the shared
 *     Web-Mercator projection (rankGridProjection.ts)
 * plus the MapGuard "pulse" affordance: pins whose 7-day rank changed get a
 * small delta badge and (motion-allowed) a pulsing ring — green up / red down.
 *
 * Data contract: each cell carries { row, col, rank, delta7d, lat, lng }. If
 * the grid has no geo coordinates (client's service-area location not set), the
 * caller should render the onboarding empty state instead — this component
 * requires lat/lng to project, and renders an honest empty surface if it can't.
 *
 * DESIGN-SYSTEM: rgb()/rgba() only (pin fills reuse rankPinColor's gradient
 * hex, matching the public tool); help cue top-left; theme-aware chrome via
 * tokens; no 375px overflow (the map is width:100% with a fixed aspect ratio).
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MapPin, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fitRankGridMap,
  rankPinColor,
} from "@/components/marketing/map-snapshot/rankGridProjection";
import type { RankGridCell } from "@/components/mapguard/RankGridPulse";

export interface RankGridMapProps {
  /** Up to 25 cells. Cells WITHOUT lat/lng are skipped (can't be projected). */
  cells: (RankGridCell & { lat?: number; lng?: number })[];
  selected?: { row: number; col: number } | null;
  onSelectCell?: (cell: RankGridCell) => void;
  className?: string;
  /** Centre label shown beneath the map (e.g. "Your service area"). */
  centerLabel?: string;
}

const SM_W = 600;
const SM_H = 440;

/** A cell that has real coordinates and can be drawn on the map. */
type GeoCell = RankGridCell & { lat: number; lng: number };

function hasGeo(c: RankGridCell & { lat?: number; lng?: number }): c is GeoCell {
  return typeof c.lat === "number" && typeof c.lng === "number";
}

export function RankGridMap({
  cells,
  selected,
  onSelectCell,
  className,
  centerLabel,
}: RankGridMapProps) {
  const reduceMotion = useReducedMotion();

  const geoCells = useMemo(() => cells.filter(hasGeo), [cells]);

  const fit = useMemo(() => {
    if (geoCells.length === 0) return null;
    return fitRankGridMap(
      geoCells.map((c) => ({ lat: c.lat, lng: c.lng })),
      SM_W,
      SM_H,
    );
  }, [geoCells]);

  if (!fit) {
    // No projectable cells — render an honest empty surface. Callers that know
    // the location is unset show the richer onboarding copy; this is the safe
    // fallback so we never draw a fake map.
    return (
      <div
        className={cn(
          "flex aspect-[600/440] w-full items-center justify-center rounded-2xl border border-border bg-muted/30",
          className,
        )}
        data-testid="rank-grid-map-empty"
      >
        <p className="px-6 text-center text-xs text-muted-foreground">
          Your live rank grid will appear here once your business location is
          set.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} data-testid="rank-grid-map">
      <div
        className="relative w-full overflow-clip rounded-2xl border border-border"
        style={{
          aspectRatio: `${SM_W} / ${SM_H}`,
          backgroundColor: "rgb(238,242,247)",
        }}
        role="img"
        aria-label="Local rank grid map"
      >
        <img
          src={fit.src(SM_W, SM_H)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />

        {geoCells.map((cell) => {
          const { x, y } = fit.project(cell.lat, cell.lng);
          const leftPct = (x / SM_W) * 100;
          const topPct = (y / SM_H) * 100;
          const isSelected =
            selected?.row === cell.row && selected?.col === cell.col;
          const delta = cell.delta7d ?? null;
          const pulse =
            delta != null && delta !== 0
              ? cell.rank != null
                ? rankPinColor(cell.rank)
                : "rgb(220,38,38)"
              : null;
          const pinColor =
            cell.rank != null ? rankPinColor(cell.rank) : "rgb(148,163,184)";
          const interactive = !!onSelectCell;

          return (
            <button
              key={`${cell.row}-${cell.col}`}
              type="button"
              onClick={() => onSelectCell?.(cell)}
              disabled={!interactive}
              data-testid={`rank-map-pin-${cell.row}-${cell.col}`}
              aria-label={
                cell.rank == null
                  ? `Pin ${cell.row + 1}-${cell.col + 1} unranked`
                  : `Pin ${cell.row + 1}-${cell.col + 1} rank ${cell.rank}${
                      delta && delta !== 0
                        ? `, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} this week`
                        : ""
                    }`
              }
              className={cn(
                "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                interactive && "cursor-pointer",
              )}
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: 26,
                height: 26,
                backgroundColor: pinColor,
                color: "rgb(255,255,255)",
                border: isSelected
                  ? "2px solid rgb(15,23,42)"
                  : "2px solid rgba(255,255,255,0.85)",
                boxShadow: isSelected
                  ? "0 0 0 2px rgb(15,23,42), 0 2px 8px rgba(15,23,42,0.25)"
                  : "0 2px 6px rgba(15,23,42,0.22)",
              }}
            >
              {/* Pulse ring when the 7-day rank changed */}
              {pulse && !reduceMotion && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full"
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.6, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  style={{ boxShadow: `0 0 0 2px ${pulse}` }}
                />
              )}
              <span className="relative z-10">
                {cell.rank == null ? "–" : cell.rank}
              </span>

              {/* Delta arrow badge */}
              {delta != null && delta !== 0 && (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full"
                  style={{
                    backgroundColor:
                      delta > 0 ? "rgb(22,163,74)" : "rgb(220,38,38)",
                    color: "rgb(255,255,255)",
                  }}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {centerLabel && (
        <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden />
          {centerLabel}
        </p>
      )}
    </div>
  );
}
