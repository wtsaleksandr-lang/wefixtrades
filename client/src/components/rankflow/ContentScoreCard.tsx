/**
 * ContentScoreCard — hybrid SEO score widget (Wave 24).
 *
 * Combines a Surfer-style 0..100 gauge (numeric, gamified) with a Clearscope
 * letter-grade overlay (intuitive for non-SEO trades audiences). Per the
 * competitive research doc: trades owners read grades, not 0..100 scores.
 *
 * Renders:
 *   ┌──────────────────────────────────────────────┐
 *   │ [B+]   ╭──────╮   Missing terms              │
 *   │ Grade  │  82  │   • water heater repair      │
 *   │        ╰──────╯   • leaking faucet           │
 *   │                   Missing headings           │
 *   │                   • How long does it take    │
 *   │                                               │
 *   │ Score 82 / 100 · 12 of 15 target terms used  │
 *   └──────────────────────────────────────────────┘
 *
 * Pure presentational — accepts a fully-resolved score + missing-terms
 * list. The dashboard's site-wide summary calls it with the aggregated
 * `seoScore`; the article-detail view calls it with per-page numbers.
 *
 * No raw hex; chart tokens via the wrapped primitives. Respects
 * prefers-reduced-motion (delegated to KpiGauge).
 */

import { Card } from "@/components/ui/card";
import {
  KpiGauge,
  LetterGradeBadge,
} from "@/components/ui/visual-primitives";

export interface ContentScoreCardProps {
  score: number;
  /** Optional target threshold drawn on the gauge as a needle marker. */
  targetThreshold?: number;
  /** Total number of target terms (for the "X of Y used" caption). */
  totalTerms?: number;
  /** How many of those target terms are currently present. */
  termsUsed?: number;
  missingTerms?: string[];
  missingHeadings?: string[];
  /** "Site-wide" vs an article title. */
  title?: string;
  /** Short helper line under the title. */
  description?: string;
  size?: "md" | "lg";
  className?: string;
}

export function ContentScoreCard({
  score,
  targetThreshold,
  totalTerms,
  termsUsed,
  missingTerms = [],
  missingHeadings = [],
  title = "Site-wide SEO score",
  description = "Aggregated across all tracked keywords",
  size = "md",
  className,
}: ContentScoreCardProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const captionTerms =
    typeof termsUsed === "number" && typeof totalTerms === "number"
      ? `${termsUsed} of ${totalTerms} target terms used`
      : null;

  return (
    <Card
      className={`p-4 ${className ?? ""}`}
      data-testid="content-score-card"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
        <LetterGradeBadge
          score={clamped}
          size={size === "lg" ? "lg" : "md"}
          variant="solid"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
        <KpiGauge
          value={clamped}
          max={100}
          label="SEO score"
          size={size === "lg" ? "lg" : "md"}
          color="auto"
          targetThreshold={targetThreshold}
        />
        <div className="space-y-2 min-w-0">
          {missingTerms.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-1">
                Missing terms
              </div>
              <ul className="space-y-0.5">
                {missingTerms.slice(0, 5).map((t) => (
                  <li
                    key={t}
                    className="text-xs text-foreground truncate"
                    title={t}
                  >
                    · {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {missingHeadings.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 mb-1">
                Missing headings
              </div>
              <ul className="space-y-0.5">
                {missingHeadings.slice(0, 3).map((h) => (
                  <li
                    key={h}
                    className="text-xs text-foreground truncate"
                    title={h}
                  >
                    · {h}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {missingTerms.length === 0 && missingHeadings.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No gaps detected — keep publishing.
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground tabular-nums">
        Score {clamped} / 100
        {captionTerms ? ` · ${captionTerms}` : null}
      </div>
    </Card>
  );
}

export default ContentScoreCard;
