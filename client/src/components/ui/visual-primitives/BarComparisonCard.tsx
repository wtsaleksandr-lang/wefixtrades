/**
 * BarComparisonCard — side-by-side bar comparison (Wave 71).
 *
 * Two thick horizontal bars comparing two related values
 * (e.g. "302 Direct Store" vs "184 Referral"). The larger value fills the
 * full track width; the smaller scales proportionally to its share. Each
 * bar shows a large number above the label, then the bar itself.
 *
 * Boot animation: each bar's width tweens from 0 → target over ~600ms
 * with a cubic-bezier ease (Wave 26.5 token-aligned). Hover a bar to see
 * exact value + percent of total via ChartTooltip.
 *
 * Theme tokens only — accepts a `color` palette key per item. Respects
 * `prefers-reduced-motion`.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

export type BarComparisonPalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type BarComparisonItem = {
  label: string;
  value: number;
  /** Palette token. Defaults to sapphire / emerald alternation if omitted. */
  color?: BarComparisonPalette;
  /** Optional formatter override for the headline number. */
  formatValue?: (n: number) => string;
};

export type BarComparisonCardProps = {
  /** Exactly 2 items required — validated at runtime. */
  items: [BarComparisonItem, BarComparisonItem] | BarComparisonItem[];
  /** Section title shown above the bars. Optional. */
  title?: string;
  /** Pixel height of each bar. Default 18. */
  barHeight?: number;
  className?: string;
};

const PALETTE_VAR: Record<BarComparisonPalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

const DEFAULT_COLORS: BarComparisonPalette[] = ["sapphire", "violet"];

function defaultFormat(n: number): string {
  return n.toLocaleString();
}

export function BarComparisonCard({
  items,
  title,
  barHeight = 18,
  className,
}: BarComparisonCardProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;

  if (items.length !== 2) {
    // Strict at runtime so misuse is loud, not silent.
    // eslint-disable-next-line no-console
    console.warn(
      `[BarComparisonCard] requires exactly 2 items, got ${items.length}.`
    );
  }
  const safeItems = items.slice(0, 2);
  if (safeItems.length < 2) return null;

  const [a, b] = safeItems;
  const total = Math.max(0.0001, a.value + b.value);
  const peak = Math.max(a.value, b.value, 0.0001);

  // Width percentage relative to peak — bigger value = 100%, smaller scales.
  const aPct = (a.value / peak) * 100;
  const bPct = (b.value / peak) * 100;
  const aColor = a.color ?? DEFAULT_COLORS[0];
  const bColor = b.color ?? DEFAULT_COLORS[1];

  // Boot animation — bars grow from 0 over ~600ms.
  const [bootDone, setBootDone] = useState(!shouldAnimate);
  useEffect(() => {
    if (!shouldAnimate) {
      setBootDone(true);
      return;
    }
    setBootDone(false);
    const id = setTimeout(() => setBootDone(true), 20);
    return () => clearTimeout(id);
  }, [shouldAnimate, a.value, b.value]);

  // Hover tracking — position tooltip above the hovered bar.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTooltipState | null>(null);

  function showTip(
    e: React.MouseEvent<HTMLDivElement>,
    item: BarComparisonItem,
    pct: number,
    accent: BarComparisonPalette
  ) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      label: item.label,
      value: (item.formatValue ?? defaultFormat)(item.value),
      detail: `${pct.toFixed(1)}% of total`,
      accent: `hsl(${PALETTE_VAR[accent]})`,
    });
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full max-w-md rounded-lg border bg-card p-4 space-y-4",
        className
      )}
      data-testid="bar-comparison-card"
    >
      {title && (
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
      )}
      {[
        { item: a, pct: aPct, color: aColor, share: (a.value / total) * 100 },
        { item: b, pct: bPct, color: bColor, share: (b.value / total) * 100 },
      ].map(({ item, pct, color, share }, i) => {
        const colorVar = PALETTE_VAR[color];
        const formatted = (item.formatValue ?? defaultFormat)(item.value);
        return (
          <div
            key={`${item.label}-${i}`}
            className="space-y-1.5"
            data-testid={`bar-comparison-row-${i}`}
            onMouseMove={(e) => showTip(e, item, share, color)}
            onMouseLeave={() => setTip(null)}
            role="group"
            aria-label={`${item.label}: ${formatted}, ${share.toFixed(1)} percent of total`}
          >
            <div className="flex items-baseline gap-2">
              <div
                className="text-2xl font-semibold tabular-nums leading-none"
                style={{ color: `hsl(${colorVar})` }}
              >
                <AnimatedCounter
                  value={item.value}
                  duration={shouldAnimate ? 600 : 0}
                  decimals={0}
                />
              </div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
            <div
              className="relative w-full overflow-hidden rounded-full"
              style={{
                height: barHeight,
                background: "hsl(var(--foreground) / 0.06)",
              }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, hsl(${colorVar} / 0.85), hsl(${colorVar}))`,
                }}
                initial={shouldAnimate ? { width: "0%" } : { width: `${pct}%` }}
                animate={{ width: bootDone ? `${pct}%` : "0%" }}
                transition={{
                  duration: shouldAnimate ? 0.6 : 0,
                  ease: [0.16, 1, 0.3, 1],
                  // Stagger the second bar so the comparison reads top-to-bottom.
                  delay: shouldAnimate ? i * 0.12 : 0,
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        );
      })}
      <ChartTooltip state={tip} />
    </div>
  );
}

export default BarComparisonCard;
