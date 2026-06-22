/**
 * HeroFlywheel
 * ─────────────────────
 * Closed-loop customer journey for the WeFixTrades marketing hero.
 * A glowing packet travels a dashed circuit through seven product nodes,
 * pulsing each on arrival; the dashed path "warms up" after the first loop,
 * and a counter tracks how each lead compounds into more leads.
 *
 * Ported from workspace/src/components/HeroFlywheelAnimation.tsx.
 * Accent: source #00D4C8 (teal) → mkt.accent (#0d3cfc, site fix-blue).
 * Background: mkt.darkBg (#0d1514) — exact match to original BG constant.
 *
 * GSAP MotionPathPlugin drives the packet; it lives in node_modules/gsap.
 * Plugin is registered once at module load (mirrors useLenis/ScrollTrigger pattern).
 *
 * Mobile (375 px): the 1200 × 600 viewBox would shrink node labels to ~4 px.
 * We wrap the SVG in a horizontally-scrollable container with minWidth 640 px
 * so the diagram stays readable and intentional rather than microscopic.
 *
 * prefers-reduced-motion: animation disabled; static lit-up final frame shown.
 * Hover: animation pauses so the design can be inspected.
 */

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { mkt } from "@/theme/tokens";

gsap.registerPlugin(MotionPathPlugin);

// ── Design tokens ──────────────────────────────────────────────────────────
const BG = mkt.darkBg;                          // #0d1514 — exact original
const TEXT = mkt.onDark;                        // #F5FCFF (near-white)
const BORDER = "rgba(255, 255, 255, 0.15)";
const BORDER_SOFT = "rgba(255, 255, 255, 0.10)";

// ── Icon components ────────────────────────────────────────────────────────
type IconProps = { color: string };

const Icons = {
  Magnify: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={-3} cy={-3} r={8} />
      <line x1={3} y1={3} x2={9} y2={9} />
    </g>
  ),
  Pin: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -10 C 6 -10 8 -6 8 -2 C 8 4 0 11 0 11 C 0 11 -8 4 -8 -2 C -8 -6 -6 -10 0 -10 Z" />
      <circle cx={0} cy={-2} r={2.5} />
    </g>
  ),
  Monitor: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={-10} y={-8} width={20} height={14} rx={1.5} />
      <line x1={-4} y1={11} x2={4} y2={11} />
      <line x1={0} y1={6} x2={0} y2={11} />
    </g>
  ),
  Phone: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-9 -8 C -9 -10 -7 -10 -5 -10 L -3 -10 L -1 -5 L -3 -3 C -3 0 0 3 3 3 L 5 1 L 10 3 L 10 5 C 10 7 10 9 8 9 C 1 9 -9 0 -9 -8 Z" />
    </g>
  ),
  Calculator: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={-8} y={-10} width={16} height={20} rx={1.5} />
      <line x1={-5} y1={-6} x2={5} y2={-6} />
      <circle cx={-4} cy={-1} r={0.8} fill={color} />
      <circle cx={0}  cy={-1} r={0.8} fill={color} />
      <circle cx={4}  cy={-1} r={0.8} fill={color} />
      <circle cx={-4} cy={4}  r={0.8} fill={color} />
      <circle cx={0}  cy={4}  r={0.8} fill={color} />
      <circle cx={4}  cy={4}  r={0.8} fill={color} />
    </g>
  ),
  Calendar: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={-9} y={-7} width={18} height={16} rx={1.5} />
      <line x1={-9} y1={-2} x2={9} y2={-2} />
      <line x1={-5} y1={-10} x2={-5} y2={-5} />
      <line x1={5}  y1={-10} x2={5}  y2={-5} />
    </g>
  ),
  Star: ({ color }: IconProps) => (
    <g stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -10 L 2.6 -3 L 10 -2.4 L 4.4 2.6 L 6 10 L 0 6.2 L -6 10 L -4.4 2.6 L -10 -2.4 L -2.6 -3 Z" />
    </g>
  ),
};

// ── Node definitions ───────────────────────────────────────────────────────
type NodeDef = {
  id: string;
  label: string;
  x: number;
  y: number;
  Icon: (p: IconProps) => React.ReactElement;
};

const NODES: NodeDef[] = [
  { id: "need",  label: "Customer Need",    x: 130,  y: 340, Icon: Icons.Magnify    },
  { id: "map",   label: "MapGuard",         x: 290,  y: 175, Icon: Icons.Pin        },
  { id: "site",  label: "SiteLaunch",       x: 490,  y: 125, Icon: Icons.Monitor    },
  { id: "line",  label: "TradeLine",   x: 680,  y: 220, Icon: Icons.Phone      },
  { id: "quote", label: "QuoteQuick Pro",   x: 870,  y: 130, Icon: Icons.Calculator },
  { id: "book",  label: "BookFlow",         x: 1060, y: 285, Icon: Icons.Calendar   },
  { id: "rep",   label: "ReputationShield", x: 660,  y: 480, Icon: Icons.Star       },
];

// Hand-tuned cubic-bezier loop; closed via Z. Starts + ends at NODES[0].
const PATH_D =
  "M 130 340 " +
  "C 170 240 220 200 290 175 " +
  "C 360 150 420 130 490 125 " +
  "C 560 120 610 175 680 220 " +
  "C 750 260 800 165 870 130 " +
  "C 950 95 1030 195 1060 285 " +
  "C 1090 380 920 450 660 480 " +
  "C 420 505 200 460 130 340 Z";

// ── Props ──────────────────────────────────────────────────────────────────
export type HeroFlywheelProps = {
  /** Seconds for one full revolution of the packet. Default 6. */
  loopDuration?: number;
  /** Pause between loops, in seconds. Default 0.5. */
  loopGap?: number;
  /**
   * Accent colour for the pulse, node icons, and counter numbers.
   * Defaults to mkt.accent (fix-blue #0d3cfc). Pass a custom hex to
   * override — the original teal #00D4C8 is preserved as an option.
   */
  accent?: string;
  /** Show the compounding counter in the bottom-right. Default true. */
  showCounter?: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function HeroFlywheel({
  loopDuration = 6,
  loopGap = 0.5,
  accent = mkt.accent,
  showCounter = true,
}: HeroFlywheelProps) {
  const wrapRef       = useRef<HTMLDivElement>(null);
  const pathRef       = useRef<SVGPathElement>(null);
  const pathStrokeRef = useRef<SVGPathElement>(null);
  const packetRef     = useRef<SVGCircleElement>(null);
  const nodeRefs      = useRef<(SVGGElement | null)[]>([]);
  const tlRef         = useRef<gsap.core.Timeline | null>(null);
  const [loopCount, setLoopCount] = useState(1);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Animation ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;

    const path = pathRef.current;
    if (!path) return;
    const total = path.getTotalLength();

    // Sample the path to find each node's fractional progress along it.
    const thresholds: number[] = NODES.map((n) => {
      let bestLen = 0, bestDist = Infinity;
      const STEPS = 600;
      for (let i = 0; i <= STEPS; i++) {
        const len = (i / STEPS) * total;
        const p = path.getPointAtLength(len);
        const d = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
        if (d < bestDist) { bestDist = d; bestLen = len; }
      }
      return bestLen / total;
    });

    const firePulse = (idx: number) => {
      const node = nodeRefs.current[idx];
      if (!node) return;
      const circle   = node.querySelector("[data-node-circle]") as SVGCircleElement | null;
      const iconWrap = node.querySelector("[data-node-icon]")   as SVGGElement       | null;

      if (circle) {
        gsap.fromTo(
          circle,
          { stroke: BORDER },
          {
            stroke: accent, duration: 0.4, ease: "power2.out",
            onComplete: () => { gsap.to(circle, { stroke: BORDER, duration: 0.6, ease: "power2.in" }); },
          }
        );
      }
      gsap.fromTo(
        node,
        { transformOrigin: `${NODES[idx].x}px ${NODES[idx].y}px`, scale: 1 },
        { scale: 1.08, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.out" }
      );
      if (iconWrap) {
        gsap.fromTo(
          iconWrap,
          { filter: `drop-shadow(0 0 0px ${accent})`, opacity: 0.85 },
          {
            filter: `drop-shadow(0 0 8px ${accent})`, opacity: 1,
            duration: 0.2, yoyo: true, repeat: 1, ease: "power2.out",
          }
        );
      }
    };

    let lastIdx = -1;
    const checkThresholds = (progress: number) => {
      let cur = -1;
      for (let i = 0; i < thresholds.length; i++) {
        if (progress >= thresholds[i]) cur = i;
      }
      if (cur !== lastIdx) {
        for (let i = lastIdx + 1; i <= cur; i++) firePulse(i);
        lastIdx = cur;
      }
    };

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: loopGap,
      onRepeat: () => {
        lastIdx = -1;
        setLoopCount((c) => c + 1);
        if (pathStrokeRef.current) {
          gsap.to(pathStrokeRef.current, {
            attr: { "stroke-opacity": 0.3 },
            duration: 0.8,
            ease: "power1.out",
          });
        }
      },
    });

    tl.to(packetRef.current, {
      duration: loopDuration,
      ease: "none",
      motionPath: { path: PATH_D, alignOrigin: [0.5, 0.5] },
      onUpdate: function () { checkThresholds(this.progress()); },
    });

    tlRef.current = tl;
    return () => { tl.kill(); tlRef.current = null; };
  }, [reducedMotion, loopDuration, loopGap, accent]);

  // Pause on hover for inspection.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pause  = () => tlRef.current?.pause();
    const resume = () => tlRef.current?.resume();
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    return () => {
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, []);

  // Counter: each loop, leads compound ×3.
  const base = Math.pow(3, loopCount - 1);
  const next = base * 3;
  const fmt  = (n: number) => n.toLocaleString();
  const word = (n: number, singular: string) => `${singular}${n === 1 ? "" : "s"}`;

  return (
    <div
      ref={wrapRef}
      role="region"
      aria-label="WeFixTrades flywheel — animated journey from Customer Need through MapGuard, SiteLaunch, TradeLine, QuoteQuick Pro, BookFlow and ReputationShield, looping back into more leads."
      style={{
        position: "relative",
        width: "100%",
        background: BG,
        color: TEXT,
        border: `1px solid ${BORDER_SOFT}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/*
       * Mobile scroll wrapper: at 375 px the 1200×600 viewBox would shrink
       * node labels to ~4 px — illegible. We allow horizontal scroll instead
       * so the diagram stays at a readable size (≥ 640 px wide).
       */}
      <div
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ minWidth: 640 }}>
          <svg
            viewBox="0 0 1200 600"
            width="100%"
            style={{ display: "block" }}
            aria-hidden="true"
          >
            {/* Invisible reference path — geometry source for GSAP MotionPath */}
            <path ref={pathRef} d={PATH_D} fill="none" stroke="none" />

            {/* Visible dashed track */}
            <path
              ref={pathStrokeRef}
              d={PATH_D}
              fill="none"
              stroke={mkt.onDark}
              strokeOpacity={0.15}
              strokeWidth={1.5}
              strokeDasharray="6 6"
              strokeLinecap="round"
            />

            {/* Nodes */}
            {NODES.map((n, i) => {
              const Icon = n.Icon;
              return (
                <g
                  key={n.id}
                  ref={(el) => { nodeRefs.current[i] = el; }}
                  transform={`translate(${n.x} ${n.y})`}
                >
                  <circle
                    data-node-circle
                    r={40}
                    fill={BG}
                    stroke={reducedMotion ? accent : BORDER}
                    strokeWidth={1}
                  />
                  <g data-node-icon style={{ opacity: reducedMotion ? 1 : 0.85 }}>
                    <Icon color={accent} />
                  </g>
                  <text
                    y={62}
                    textAnchor="middle"
                    fill={TEXT}
                    fontSize={12}
                    style={{
                      letterSpacing: "0.05em",
                      fontFamily:
                        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
                      fontWeight: 500,
                    }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}

            {/* Animated packet */}
            <circle
              ref={packetRef}
              r={8}
              fill={accent}
              cx={NODES[0].x}
              cy={NODES[0].y}
              style={{ filter: `drop-shadow(0 0 12px ${accent})` }}
            />
          </svg>
        </div>
      </div>

      {showCounter && (
        <div
          aria-live="polite"
          style={{
            padding: "8px 24px 16px",
            fontSize: 13,
            color: mkt.onDarkMuted,
            fontFamily:
              'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace',
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            overflowX: "auto",
          }}
        >
          <span style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{fmt(base)}</span>
          {" "}{word(base, "lead")}{"  →  "}
          <span style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{fmt(base)}</span>
          {" "}paid {word(base, "job")}{"  →  "}
          <span style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{fmt(base)}</span>
          {" "}{word(base, "review")}{"  →  "}
          <span style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{fmt(next)}</span>
          {" "}new {word(next, "lead")}
        </div>
      )}
    </div>
  );
}
