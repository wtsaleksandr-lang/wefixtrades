/**
 * VoiceVisualizer — Pixelated audio-level bars with mirror reflection.
 *
 * Each bar is a column of stacked square "pixels" that animate up/down.
 * A CSS-reflected copy sits below with fade + blur for a premium mirror effect.
 *
 * Pure CSS animation. Respects prefers-reduced-motion.
 */

import { useMemo } from "react";
import { mkt } from "@/theme/tokens";

/* ─── Brand-derived bar palette ─── */
const BAR_COLORS = [
  mkt.accent,          // cyan #0d3cfc
  "#0b34d6",           // a200 lighter cyan
  "#0b34d6",           // a700 teal
  "#F7B430",           // orange accent
  "#0d3cfc",           // a500 mid-cyan
  "#D5E1E7",           // n300 light
  "#B1C5CE",           // n400 muted
  "#E879A0",           // warm pink for variety
  "#A78BFA",           // soft violet
  "#34D399",           // emerald
];

const INLINE_COLORS = [mkt.accent, "#0b34d6", "#0d3cfc", "#0b34d6"];

const PIXEL_SIZE = 4;   // px — each square pixel
const PIXEL_GAP = 1;    // px — gap between pixels in a column
const BAR_GAP = 2;      // px — gap between bar columns

interface VoiceVisualizerProps {
  barCount?: number;
  height?: number;
  active?: boolean;
  variant?: "hero" | "inline";
  /** Show a mirrored reflection below */
  reflection?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function VoiceVisualizer({
  barCount = 40,
  height = 80,
  active = true,
  variant = "hero",
  reflection = false,
  className,
  style,
}: VoiceVisualizerProps) {
  const palette = variant === "hero" ? BAR_COLORS : INLINE_COLORS;
  const pixelSize = variant === "hero" ? PIXEL_SIZE : 3;
  const pixelStep = pixelSize + PIXEL_GAP;
  const maxPixels = Math.floor(height / pixelStep);

  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const seed = ((i * 7919 + 104729) % 1000) / 1000;
      const seed2 = ((i * 6151 + 98321) % 1000) / 1000;
      const seed3 = ((i * 3571 + 54881) % 1000) / 1000;
      return {
        color: palette[i % palette.length],
        minPixels: Math.max(2, Math.round(maxPixels * (0.12 + seed * 0.22))),
        maxPixels: Math.max(4, Math.round(maxPixels * (0.45 + seed2 * 0.50))),
        duration: 1.2 + seed3 * 2.0,
        delay: seed * -2,
      };
    });
  }, [barCount, palette, maxPixels]);

  const barsElement = (
    <div
      className={className}
      role="presentation"
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-evenly",
        gap: BAR_GAP,
        height,
        overflow: "hidden",
        ...(!reflection ? style : {}),
      }}
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          className="vbar-col"
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            gap: PIXEL_GAP,
            height: "100%",
            alignItems: "center",
            justifyContent: "flex-start",
            ["--vbar-min" as any]: bar.minPixels,
            ["--vbar-max" as any]: bar.maxPixels,
            ["--vbar-dur" as any]: `${bar.duration}s`,
            ["--vbar-del" as any]: `${bar.delay}s`,
          }}
        >
          {Array.from({ length: maxPixels }, (_, pi) => (
            <div
              key={pi}
              className="vbar-px"
              style={{
                width: pixelSize,
                height: pixelSize,
                flexShrink: 0,
                borderRadius: 1,
                background: bar.color,
                opacity: variant === "hero" ? 0.9 : 0.75,
                /* Each pixel's visibility is driven by the column's animated pixel count.
                   We use a CSS custom property + nth-child-based approach.
                   Since pure CSS can't do this cleanly, we inline the initial state
                   and let the animation class handle toggling. */
              }}
              data-pi={pi}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes vbar-pixels {
          0%, 100% { --vbar-active: var(--vbar-min); }
          50%      { --vbar-active: var(--vbar-max); }
        }

        /* Pixel column animation: we animate scaleY on a clip wrapper */
        @keyframes vbar-clip {
          0%, 100% { clip-path: inset(calc(100% - var(--vbar-min-pct)) 0 0 0); }
          50%      { clip-path: inset(calc(100% - var(--vbar-max-pct)) 0 0 0); }
        }

        .vbar-col {
          animation: vbar-clip var(--vbar-dur) ease-in-out var(--vbar-del) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .vbar-col {
            animation: none !important;
            clip-path: inset(60% 0 0 0) !important;
          }
        }
      `}</style>

      {/* Inject per-bar clip percentages as inline style overrides */}
      <style>{
        bars.map((bar, i) => {
          const minPct = `${(bar.minPixels / maxPixels * 100).toFixed(1)}%`;
          const maxPct = `${(bar.maxPixels / maxPixels * 100).toFixed(1)}%`;
          return `.vbar-col:nth-child(${i + 1}) { --vbar-min-pct: ${minPct}; --vbar-max-pct: ${maxPct}; }`;
        }).join("\n")
      }</style>

      {reflection ? (
        <div style={{ ...style }}>
          {/* Main bars */}
          {barsElement}
          {/* Mirror reflection: flipped, faded, blurred */}
          <div style={{
            transform: "scaleY(-1)",
            height: height * 0.5,
            overflow: "hidden",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 85%)",
            filter: "blur(1.5px)",
            opacity: 0.7,
            marginTop: -1,
            pointerEvents: "none",
          }}>
            {barsElement}
          </div>
        </div>
      ) : (
        barsElement
      )}
    </>
  );
}

/**
 * HeroSoundBars — Full-width edge-to-edge animated pixelated bars
 * with mirror reflection beneath and edge fade vignette.
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
    <div style={{
      width: "100vw",
      marginLeft: "calc(-50vw + 50%)",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}>
      {/* Edge fade vignette — fades bars into the background at both sides */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: `linear-gradient(90deg, ${mkt.bg} 0%, transparent 18%, transparent 82%, ${mkt.bg} 100%)`,
      }} />
      <VoiceVisualizer
        barCount={160}
        height={height}
        active={active}
        variant="hero"
        reflection
        style={{ width: "100%" }}
      />
    </div>
  );
}
