/**
 * KeywordOpportunityHeatmap — keyword × location grid (Wave 24).
 *
 * Per competitive research: "Trades are geo-bound, so a heatmap of 'kitchen
 * plumber' performance across postcodes is uniquely valuable here."
 *
 * Rows: tracked keywords. Columns: customer's service areas. Each cell is
 * colour-coded by rank:
 *   - green  ≤ 3
 *   - amber  4-10
 *   - red    > 10
 *   - grey   unranked / no data
 *
 * Hover shows exact position + searches/mo if supplied. Click drills into
 * the keyword × location detail (caller supplies `onCellClick`).
 *
 * Empty-state friendly: when no keywords are tracked we render an
 * onboarding hint instead of an empty grid.
 *
 * Pure presentational + token-safe. Animations limited to a small fade-in
 * via CSS; respects prefers-reduced-motion through Tailwind defaults.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";

export type HeatmapCell = {
  position: number | null;
  searchesPerMonth?: number | null;
};

export interface HeatmapRow {
  keyword: string;
  cells: HeatmapCell[];
}

export interface KeywordOpportunityHeatmapProps {
  /** Column headers, e.g. ["Hamilton", "Burlington", "Oakville"] */
  locations: string[];
  rows: HeatmapRow[];
  onCellClick?: (input: {
    keyword: string;
    location: string;
    position: number | null;
  }) => void;
  className?: string;
}

type Band = "top3" | "page1" | "off-page-1" | "unranked";

function bandFor(position: number | null): Band {
  if (position === null) return "unranked";
  if (position <= 3) return "top3";
  if (position <= 10) return "page1";
  return "off-page-1";
}

const BAND_CLASS: Record<Band, string> = {
  // chart-2 = teal/green for healthy, chart-4 = amber, destructive = red
  top3: "bg-[hsl(var(--chart-2)/0.7)] text-[hsl(var(--primary-foreground))]",
  page1: "bg-[hsl(var(--chart-4)/0.6)] text-foreground",
  "off-page-1": "bg-[hsl(var(--destructive)/0.45)] text-foreground",
  unranked: "bg-muted text-muted-foreground",
};

const BAND_LABEL: Record<Band, string> = {
  top3: "Top 3",
  page1: "Page 1",
  "off-page-1": "Off page 1",
  unranked: "No data",
};

export function KeywordOpportunityHeatmap({
  locations,
  rows,
  onCellClick,
  className,
}: KeywordOpportunityHeatmapProps) {
  const isEmpty = rows.length === 0 || locations.length === 0;

  // Pre-compute summary counts for the legend chip row.
  const summary = useMemo(() => {
    const counts: Record<Band, number> = {
      top3: 0,
      page1: 0,
      "off-page-1": 0,
      unranked: 0,
    };
    for (const r of rows) {
      for (const c of r.cells) {
        counts[bandFor(c.position)]++;
      }
    }
    return counts;
  }, [rows]);

  if (isEmpty) {
    return (
      <Card
        className={`p-4 ${className ?? ""}`}
        data-testid="keyword-heatmap-empty"
      >
        <div className="text-sm font-medium mb-1">
          Keyword opportunity heatmap
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          Performance for each tracked keyword across the areas you serve.
        </div>
        <div className="rounded-md border border-dashed p-6 text-center">
          <div className="text-sm font-medium mb-1">
            No keywords tracked yet
          </div>
          <div className="text-xs text-muted-foreground">
            Add tracked keywords and service areas to populate the heatmap.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`p-4 ${className ?? ""}`}
      data-testid="keyword-heatmap"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">Keyword opportunity heatmap</div>
          <div className="text-xs text-muted-foreground">
            Tracked keywords × service areas. Click a cell for detail.
          </div>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {(["top3", "page1", "off-page-1", "unranked"] as Band[]).map((b) => (
            <span
              key={b}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${BAND_CLASS[b]}`}
              data-testid={`heatmap-legend-${b}`}
            >
              {BAND_LABEL[b]} · {summary[b]}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs" role="grid">
          <thead>
            <tr>
              <th
                scope="col"
                className="text-left font-medium text-muted-foreground pr-2 py-1 sticky left-0 bg-card"
              >
                Keyword
              </th>
              {locations.map((loc) => (
                <th
                  scope="col"
                  key={loc}
                  className="text-left font-medium text-muted-foreground px-1 py-1"
                >
                  {loc}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.keyword}>
                <th
                  scope="row"
                  className="text-left font-normal text-foreground pr-2 py-0.5 sticky left-0 bg-card max-w-[200px] truncate"
                  title={row.keyword}
                >
                  {row.keyword}
                </th>
                {row.cells.map((cell, i) => {
                  const location = locations[i] ?? "";
                  const band = bandFor(cell.position);
                  const label =
                    cell.position === null
                      ? "no data"
                      : `#${cell.position}`;
                  const hover =
                    cell.position === null
                      ? `${row.keyword} in ${location}: no data`
                      : `${row.keyword} in ${location}: rank #${cell.position}${
                          typeof cell.searchesPerMonth === "number"
                            ? ` · ${cell.searchesPerMonth.toLocaleString()} searches/mo`
                            : ""
                        }`;
                  return (
                    <td key={i} className="p-0.5">
                      <button
                        type="button"
                        title={hover}
                        aria-label={hover}
                        onClick={
                          onCellClick
                            ? () =>
                                onCellClick({
                                  keyword: row.keyword,
                                  location,
                                  position: cell.position,
                                })
                            : undefined
                        }
                        className={`w-full h-7 min-w-[3.5rem] rounded-md text-[11px] font-medium tabular-nums ${BAND_CLASS[band]} ${onCellClick ? "hover:ring-2 hover:ring-[hsl(var(--chart-1)/0.4)]" : "cursor-default"}`}
                        data-testid={`heatmap-cell-${row.keyword}-${location}`}
                      >
                        {label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default KeywordOpportunityHeatmap;
