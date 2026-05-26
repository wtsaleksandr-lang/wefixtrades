/**
 * CompetitorCard — side-by-side rank comparison (Wave 24).
 *
 * Per competitive research: "No competitor surfaces this prominently — clear
 * win." For each tracked keyword we render the customer's position vs the
 * top-ranking competitor, with a visual delta bar between the two positions
 * and an expandable "Why?" panel sourced from the Wave 21 SerpAware brief.
 *
 * Behaviour:
 *  - Closed: "You: #5 — Top competitor: #2", delta bar
 *  - Expanded: 3-row rationale (their word count, terms you're missing,
 *    common headings)
 *  - No async fetches inside the card — everything comes from props
 *
 * No raw hex. Chart tokens only. Honours prefers-reduced-motion via the
 * underlying StatusPill / AnimatedCounter primitives.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/ui/visual-primitives";

export interface CompetitorCardProps {
  keyword: string;
  yourPosition: number | null;
  previousPosition?: number | null;
  topCompetitor: {
    position: number;
    title: string;
    url: string;
    headings: string[];
  } | null;
  rationale?: {
    competitorWordCount: number;
    missingTerms: string[];
    commonHeadings: string[];
  } | null;
  className?: string;
}

/**
 * Bar fill = your position. Bar width = competitor position (worse = wider).
 * We clamp to a 50-position range so the bar always renders something sane.
 */
function positionBarWidthPct(position: number | null): number {
  if (position === null) return 100;
  const clamped = Math.max(1, Math.min(50, position));
  // closer to #1 = wider bar (visualising "you're closer to the top")
  return Math.round(((50 - clamped) / 49) * 100);
}

export function CompetitorCard({
  keyword,
  yourPosition,
  previousPosition,
  topCompetitor,
  rationale,
  className,
}: CompetitorCardProps) {
  const [open, setOpen] = useState(false);

  const yourWidth = positionBarWidthPct(yourPosition);
  const competitorWidth = topCompetitor
    ? positionBarWidthPct(topCompetitor.position)
    : 100;

  // delta arrow vs previous reading
  let deltaNode: JSX.Element | null = null;
  if (
    typeof previousPosition === "number" &&
    typeof yourPosition === "number" &&
    previousPosition !== yourPosition
  ) {
    const movedUp = yourPosition < previousPosition; // lower = better
    const diff = Math.abs(previousPosition - yourPosition);
    const colorClass = movedUp
      ? "text-[hsl(var(--chart-2))]"
      : "text-[hsl(var(--destructive))]";
    deltaNode = (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}
        aria-label={movedUp ? "moved up" : "moved down"}
      >
        {movedUp ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        )}
        {diff}
      </span>
    );
  } else if (
    typeof previousPosition === "number" &&
    typeof yourPosition === "number"
  ) {
    deltaNode = (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground"
        aria-label="unchanged"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
        0
      </span>
    );
  }

  return (
    <Card
      className={`p-4 ${className ?? ""}`}
      data-testid={`competitor-card-${keyword}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            title={keyword}
          >
            {keyword}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tracked keyword
          </div>
        </div>
        {deltaNode}
      </div>

      {/* You row */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-muted-foreground">You</span>
          <span className="text-sm font-semibold tabular-nums">
            {yourPosition !== null ? (
              <AnimatedCounter value={yourPosition} prefix="#" />
            ) : (
              "Unranked"
            )}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[hsl(var(--chart-1))] transition-[width] duration-500"
            style={{ width: `${yourWidth}%` }}
          />
        </div>
      </div>

      {/* Competitor row */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-muted-foreground">Top competitor</span>
          <span className="text-sm font-semibold tabular-nums">
            {topCompetitor ? (
              <AnimatedCounter value={topCompetitor.position} prefix="#" />
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[hsl(var(--chart-2))] transition-[width] duration-500"
            style={{ width: `${competitorWidth}%` }}
          />
        </div>
      </div>

      {/* Why expander */}
      {rationale ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 -mx-2 text-xs"
            onClick={() => setOpen((v) => !v)}
            data-testid={`competitor-why-toggle-${keyword}`}
          >
            {open ? (
              <ChevronUp className="h-3 w-3 mr-1" />
            ) : (
              <ChevronDown className="h-3 w-3 mr-1" />
            )}
            Why?
          </Button>
          {open ? (
            <div className="mt-2 space-y-2 text-xs">
              {rationale.competitorWordCount > 0 ? (
                <div className="text-muted-foreground">
                  Their article averages{" "}
                  <span className="font-medium text-foreground">
                    {rationale.competitorWordCount.toLocaleString()} words
                  </span>
                </div>
              ) : null}
              {rationale.missingTerms.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-0.5">
                    They use, you might be missing
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rationale.missingTerms.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] text-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {rationale.commonHeadings.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-0.5">
                    Common section headings
                  </div>
                  <ul className="space-y-0.5">
                    {rationale.commonHeadings.slice(0, 3).map((h) => (
                      <li
                        key={h}
                        className="text-foreground truncate"
                        title={h}
                      >
                        · {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {topCompetitor ? (
                <a
                  href={topCompetitor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[hsl(var(--chart-1))] hover:underline"
                >
                  Visit leader <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export default CompetitorCard;
