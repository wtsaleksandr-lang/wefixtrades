/**
 * SecurityScoreCard — Wave 31 hero card.
 *
 * Renders the A-F Security grade via Wave 22A LetterGradeBadge plus a
 * "Why this grade?" expander that surfaces the weighted factor list:
 *
 *   1. Malware scan clean      (25%)
 *   2. SSL valid + not expiring (15%)
 *   3. WordPress core current   (15%)
 *   4. Plugins current          (15%)
 *   5. Themes current           (10%)
 *   6. Admin 2FA enabled        (10%)
 *   7. No weak passwords        (10%)
 *
 * Trades audience reads a letter grade before any chart — Guardr
 * proved this format. No competitor in the WP-care segment exposes
 * a granular factor breakdown.
 *
 * No raw hex — semantic tokens only.
 */

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LetterGradeBadge } from "@/components/ui/visual-primitives";

export interface SecurityFactor {
  key: string;
  label: string;
  weight: number;
  ok: boolean;
  detail?: string;
}

export interface SecurityScoreCardProps {
  score: number;
  letter: string;
  factors: SecurityFactor[];
  emptyState?: boolean;
}

export function SecurityScoreCard({
  score,
  letter,
  factors,
  emptyState,
}: SecurityScoreCardProps) {
  const [open, setOpen] = useState(false);
  const passed = factors.filter((f) => f.ok).length;

  return (
    <Card
      className="flex h-full flex-col gap-3 p-4"
      data-testid="webcare-security-score"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Security grade
            </p>
            <p className="text-xs text-muted-foreground">
              {emptyState
                ? "Awaiting your first scan — grade refreshes within 15 minutes."
                : `${passed} of ${factors.length} security checks passing.`}
            </p>
          </div>
        </div>
        <LetterGradeBadge
          score={emptyState ? 0 : score}
          size="lg"
          showScore={!emptyState}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 self-start px-2 text-[11px]"
        onClick={() => setOpen((o) => !o)}
        disabled={emptyState || factors.length === 0}
        data-testid="webcare-security-expander"
        aria-expanded={open}
      >
        {open ? (
          <>
            <ChevronUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Hide breakdown
          </>
        ) : (
          <>
            <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Why this grade?
          </>
        )}
      </Button>

      {open && factors.length > 0 && (
        <ul
          className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2"
          data-testid="webcare-security-factors"
        >
          {factors.map((f) => (
            <li
              key={f.key}
              className="flex items-center justify-between gap-2"
              data-testid={`webcare-security-factor-${f.key}`}
            >
              <div className="flex items-center gap-2">
                {f.ok ? (
                  <Check
                    className="h-3.5 w-3.5 text-[hsl(var(--chart-2))]"
                    aria-hidden="true"
                  />
                ) : (
                  <X
                    className="h-3.5 w-3.5 text-[hsl(var(--chart-5))]"
                    aria-hidden="true"
                  />
                )}
                <span className="text-xs text-foreground">{f.label}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {f.weight}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Re-export the grade-letter helper for header copy ("Security: A grade").
export { LetterGradeBadge };
