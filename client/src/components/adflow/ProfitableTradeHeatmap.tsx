/**
 * ProfitableTradeHeatmap — AdFlow trade × platform grid (Wave 30).
 *
 * 2D grid: rows = trade categories (plumbing, hvac, …), columns = ad
 * platforms (google / meta / bing). Each cell colored emerald / amber /
 * crimson by revenue / spend ratio.
 *
 * Click a cell → drills into the per-campaign breakdown (drilling is
 * implemented as an `onCellClick` callback the parent dashboard wires).
 *
 * Per competitive research: "Nobody in this competitive set has this.
 * Trade-niche positioning realized." Genuine whitespace.
 *
 * No raw hex — semantic tokens only.
 */

import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";

type Platform = "google" | "meta" | "bing";

interface Cell {
  trade: string;
  platform: Platform;
  spendCents: number;
  jobsBooked: number;
  revenueCents: number;
  ratio: number;
  tone: "emerald" | "amber" | "crimson" | "neutral";
}

export interface ProfitableTradeHeatmapProps {
  rows: string[];
  columns: Platform[];
  cells: Cell[];
  hasData: boolean;
  onCellClick?: (cell: Cell) => void;
}

const TONE_VAR: Record<Cell["tone"], string> = {
  emerald: "var(--chart-2)",
  amber: "var(--chart-4)",
  crimson: "var(--chart-5)",
  neutral: "var(--muted-foreground)",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  google: "Google",
  meta: "Meta",
  bing: "Bing",
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function ProfitableTradeHeatmap({
  rows,
  columns,
  cells,
  hasData,
  onCellClick,
}: ProfitableTradeHeatmapProps) {
  if (!hasData || rows.length === 0) {
    return (
      <Card
        className="flex flex-col items-center gap-2 p-6 text-center"
        data-testid="trade-heatmap-empty"
      >
        <Sparkles className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          Profitable-trade heatmap unlocks with campaign data
        </p>
        <p className="text-xs text-muted-foreground">
          Once a few campaigns have run, you'll see which platforms book the
          most jobs per trade — emerald = profitable, crimson = unprofitable.
        </p>
      </Card>
    );
  }

  const cellMap = new Map<string, Cell>();
  for (const c of cells) cellMap.set(`${c.trade}|${c.platform}`, c);

  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="trade-heatmap">
      <div className="flex flex-col">
        <h2 className="text-sm font-semibold text-foreground">
          Which trades make money on which platform
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Emerald = profitable. Amber = breakeven. Crimson = losing money.
        </p>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  Trade
                </th>
                {columns.map((p) => (
                  <th
                    key={p}
                    className="px-2 py-1 text-center text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    {PLATFORM_LABEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((trade) => (
                <tr key={trade} className="border-t border-border">
                  <td className="px-2 py-1.5 text-sm font-medium capitalize text-foreground">
                    {trade}
                  </td>
                  {columns.map((p) => {
                    const c = cellMap.get(`${trade}|${p}`);
                    return (
                      <td key={p} className="px-1 py-1">
                        {c ? (
                          <HeatCell
                            cell={c}
                            onClick={() => onCellClick?.(c)}
                          />
                        ) : (
                          <div className="mx-auto h-10 w-full rounded-sm border border-dashed border-border" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
    </Card>
  );
}

function HeatCell({ cell, onClick }: { cell: Cell; onClick: () => void }) {
  const tone = TONE_VAR[cell.tone];
  const label =
    cell.ratio >= 3
      ? "Strong"
      : cell.ratio >= 1.5
        ? "OK"
        : cell.ratio > 0
          ? "Weak"
          : "No spend";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex h-10 w-full flex-col items-center justify-center rounded-sm transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{
            backgroundColor: `hsl(${tone} / 0.18)`,
            border: `1px solid hsl(${tone} / 0.5)`,
          }}
          data-testid={`trade-cell-${cell.trade}-${cell.platform}`}
          aria-label={`${cell.trade} on ${cell.platform}: ${label}`}
        >
          <span className="text-xs font-semibold" style={{ color: `hsl(${tone})` }}>
            {cell.ratio.toFixed(1)}×
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="flex flex-col gap-0.5 text-xs">
          <p className="font-semibold capitalize">
            {cell.trade} · {PLATFORM_LABEL[cell.platform]}
          </p>
          <p>Spent: {dollars(cell.spendCents)}</p>
          <p>Jobs booked: {cell.jobsBooked}</p>
          <p>Revenue est.: {dollars(cell.revenueCents)}</p>
          <p className="text-muted-foreground">{cell.ratio.toFixed(2)}× revenue / spend</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
