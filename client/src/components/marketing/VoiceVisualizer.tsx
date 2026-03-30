/**
 * VoiceVisualizer — Animated audio-level bars inspired by voice AI UIs.
 *
 * Pure CSS animation (no JS RAF or heavy libs). Bars bob up and down at
 * randomised speeds to simulate live audio activity. Respects
 * prefers-reduced-motion by collapsing to a static mid-height state.
 *
 * Props:
 *  - barCount: total bars to render (default 40)
 *  - height: container height in px (default 80)
 *  - active: whether bars are animating (default true)
 *  - variant: "hero" (multicolor, full-width) | "inline" (compact, single-accent)
 *  - className / style: passthrough
 */

import { useMemo } from "react";
import { mkt } from "@/theme/tokens";

/* ─── Brand-derived bar palette ─── */
const BAR_COLORS = [
  mkt.accent,          // cyan #66E8FA
  "#9CF0FC",           // a200 lighter cyan
  "#54A1AB",           // a700 teal
  "#F7B430",           // orange accent
  "#68D4E3",           // a500 mid-cyan
  "#D5E1E7",           // n300 light
  "#B1C5CE",           // n400 muted
  "#E879A0",           // warm pink for variety
  "#A78BFA",           // soft violet
  "#34D399",           // emerald
];

const INLINE_COLORS = [mkt.accent, "#9CF0FC", "#68D4E3", "#54A1AB"];

interface VoiceVisualizerProps {
  barCount?: number;
  height?: number;
  active?: boolean;
  variant?: "hero" | "inline";
  className?: string;
  style?: React.CSSProperties;
}

export default function VoiceVisualizer({
  barCount = 40,
  height = 80,
  active = true,
  variant = "hero",
  className,
  style,
}: VoiceVisualizerProps) {
  const palette = variant === "hero" ? BAR_COLORS : INLINE_COLORS;

  // Generate stable random params per bar (memoised so they don't shift on re-render)
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      // Deterministic pseudo-random from index
      const seed = ((i * 7919 + 104729) % 1000) / 1000;
      const seed2 = ((i * 6151 + 98321) % 1000) / 1000;
      const seed3 = ((i * 3571 + 54881) % 1000) / 1000;
      return {
        color: palette[i % palette.length],
        // Height range: 20%-95% of container
        minH: 15 + seed * 25,        // 15-40%
        maxH: 55 + seed2 * 40,       // 55-95%
        duration: 0.6 + seed3 * 1.4,  // 0.6-2.0s
        delay: seed * -2,             // stagger starts
      };
    });
  }, [barCount, palette]);

  const barWidth = variant === "hero" ? 3 : 2;
  const barGap = variant === "hero" ? 3 : 2;

  return (
    <>
      <style>{`
        @keyframes vbar {
          0%, 100% { transform: scaleY(var(--vbar-min)); }
          50%      { transform: scaleY(var(--vbar-max)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vbar-bar { animation: none !important; transform: scaleY(0.4) !important; }
        }
      `}</style>
      <div
        className={className}
        role="presentation"
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: barGap,
          height,
          overflow: "hidden",
          ...style,
        }}
      >
        {bars.map((bar, i) => (
          <div
            key={i}
            className="vbar-bar"
            style={{
              width: barWidth,
              height: "100%",
              borderRadius: barWidth,
              background: bar.color,
              transformOrigin: "bottom",
              opacity: variant === "hero" ? 0.85 : 0.7,
              ["--vbar-min" as any]: bar.minH / 100,
              ["--vbar-max" as any]: bar.maxH / 100,
              animation: active
                ? `vbar ${bar.duration}s ease-in-out ${bar.delay}s infinite`
                : "none",
              transform: active ? undefined : `scaleY(${bar.minH / 100})`,
              transition: active ? undefined : "transform 0.4s ease",
            }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * HeroSoundBars — Full-width horizontal band of animated bars,
 * designed for use as a hero background / divider element.
 */
export function HeroSoundBars({
  active = true,
  height = 100,
  style,
}: {
  active?: boolean;
  height?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ width: "100%", overflow: "hidden", ...style }}>
      <VoiceVisualizer
        barCount={80}
        height={height}
        active={active}
        variant="hero"
        style={{ width: "100%", maxWidth: 900, margin: "0 auto" }}
      />
    </div>
  );
}
