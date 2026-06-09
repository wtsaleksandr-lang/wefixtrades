/**
 * LetterGradeBadge — A++ -> F grade overlay.
 *
 * Part of Wave 22A. Maps a numeric score (0-100) to a letter grade with
 * bold sans-serif typography and a color-coded fill / outline. Used as
 * the at-a-glance verdict on content quality (Waves 23/24), SEO score
 * (RankFlow), or social-post readiness (SocialSync).
 *
 * No raw hex — chart tokens only.
 */

import { cn } from "@/lib/utils";

export type LetterGradeBadgeProps = {
  score: number;
  size?: "sm" | "md" | "lg";
  variant?: "solid" | "outline";
  showScore?: boolean;
  /**
   * "No data yet" flag. When true the badge renders a NEUTRAL grey "—" instead
   * of a grade — so a brand-new account never sees an alarming "F" before any
   * scan has run. Overrides the score-derived grade + tone entirely.
   */
  emptyState?: boolean;
  /** Glyph shown in place of the grade letter when `emptyState`. Default "—". */
  emptyStateLabel?: string;
  className?: string;
};

type GradeBand = {
  letter: string;
  min: number;
  // Token colour name used for both the solid fill and the outline border.
  // Maps to the existing chart-N CSS variables.
  tone: "green" | "amber" | "red";
};

// Highest-min-first; first match wins.
const BANDS: GradeBand[] = [
  { letter: "A++", min: 95, tone: "green" },
  { letter: "A+", min: 90, tone: "green" },
  { letter: "A", min: 85, tone: "green" },
  { letter: "B+", min: 80, tone: "amber" },
  { letter: "B", min: 75, tone: "amber" },
  { letter: "C+", min: 70, tone: "amber" },
  { letter: "C", min: 65, tone: "amber" },
  { letter: "D", min: 55, tone: "red" },
  { letter: "F", min: -Infinity, tone: "red" },
];

const TONE_VAR: Record<GradeBand["tone"], string> = {
  green: "var(--chart-2)",
  amber: "var(--chart-4)",
  red: "var(--chart-5)",
};

function gradeFor(score: number): GradeBand {
  for (const band of BANDS) {
    if (score >= band.min) return band;
  }
  return BANDS[BANDS.length - 1];
}

export function LetterGradeBadge({
  score,
  size = "md",
  variant = "solid",
  showScore = false,
  emptyState = false,
  emptyStateLabel = "—",
  className,
}: LetterGradeBadgeProps) {
  const band = gradeFor(score);
  // Neutral tone for the "no data yet" state so a fresh account never sees "F".
  const tone = emptyState ? "var(--muted-foreground)" : TONE_VAR[band.tone];

  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-0.5 min-w-[2.25rem]"
      : size === "lg"
        ? "text-lg px-3.5 py-1.5 min-w-[3rem]"
        : "text-sm px-2.5 py-1 min-w-[2.5rem]";

  // Solid: token-coloured fill with white text. Outline: transparent fill,
  // token-coloured border + text. Empty-state always renders as a quiet
  // neutral outline (never a solid grey blob) regardless of `variant`.
  const variantStyle =
    variant === "solid" && !emptyState
      ? {
          backgroundColor: `hsl(${tone})`,
          color: "hsl(var(--primary-foreground))",
          borderColor: `hsl(${tone})`,
        }
      : {
          backgroundColor: "transparent",
          color: `hsl(${tone})`,
          borderColor: `hsl(${tone})`,
        };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md border font-bold tracking-tight tabular-nums",
        sizeClass,
        className
      )}
      style={variantStyle}
      data-testid="letter-grade-badge"
      data-grade={emptyState ? "none" : band.letter}
      data-empty-state={emptyState ? "true" : undefined}
      aria-label={
        emptyState
          ? "Grade not available yet — awaiting first scan"
          : `Grade ${band.letter}${showScore ? `, score ${score}` : ""}`
      }
    >
      <span>{emptyState ? emptyStateLabel : band.letter}</span>
      {!emptyState && showScore ? (
        <>
          <span
            className="opacity-50"
            aria-hidden="true"
          >
            ·
          </span>
          <span className="font-semibold">{Math.round(score)}</span>
        </>
      ) : null}
    </span>
  );
}

export default LetterGradeBadge;
