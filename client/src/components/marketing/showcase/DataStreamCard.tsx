/**
 * DataStreamCard — "Where your reputation data comes from" visual for the
 * ReputationShield product page.
 *
 * Ported from workspace/data-stream.html.
 *
 * Adaptations vs. original:
 *   - Copy updated for ReputationShield (Google, Facebook, Yelp → "Review
 *     Sites 150+"; social channels → "Social Channels 10+")
 *   - Dashboard renamed to ReputationShield
 *   - Scoped light-island surface using data-theme="light" + qq-paper-surface
 *     class, matching the pattern already established in this codebase
 *   - All JS segment animations converted to CSS @keyframes
 *   - Reduced-motion guard on all animations
 *   - No inline HTML canvas — pure React/CSS
 */

import { useId, useEffect, useRef } from "react";
import { Star, Shield } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

// Light palette (matches the original design)
const L = {
  bg:           "#f5f6f8",
  card:         "#ffffff",
  ink:          "#1a1a2e",
  inkSoft:      "#6b7280",
  skeleton:     "#e5e7eb",
  skeleton2:    "#eef0f3",
  purple:       "#7c4dff",
  purpleSoft:   "rgba(124,77,255,0.12)",
  purpleBorder: "rgba(124,77,255,0.35)",
  blue:         "#2f8cff",
  blueSoft:     "rgba(47,140,255,0.12)",
  blueBorder:   "rgba(47,140,255,0.35)",
};

const SEGMENTS = 7;
const SEG_XS   = [10, 22, 32, 48, 60, 76, 90]; // % positions in SVG viewBox 0-100

interface SegConfig {
  y1: number;
  y2: number;
  opacity: number;
  delay: string;
  duration: string;
}

/** Seeded pseudo-random so SSR & client agree */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function buildSegs(seed: number): SegConfig[] {
  const rnd = seeded(seed);
  return SEG_XS.map(() => {
    const len  = 16 + rnd() * 42;
    const y2   = 62;
    const y1   = Math.max(2, y2 - len);
    return {
      y1,
      y2,
      opacity: parseFloat((0.45 + rnd() * 0.5).toFixed(2)),
      delay: (-rnd() * 1.4).toFixed(2) + "s",
      duration: (1.0 + rnd() * 1.2).toFixed(2) + "s",
    };
  });
}

const SEGS1 = buildSegs(42);
const SEGS2 = buildSegs(99);

function GraphSVG({ segs, color }: { segs: SegConfig[]; color: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <>
      <style>{`
        @keyframes ds-march-${uid} {
          from { stroke-dashoffset: 0;   }
          to   { stroke-dashoffset: -18; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ds-seg-${uid} { animation: none !important; }
        }
      `}</style>
      <svg
        viewBox="0 0 100 64"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
        aria-hidden
      >
        {segs.map((s, i) => (
          <line
            key={i}
            className={`ds-seg-${uid}`}
            x1={SEG_XS[i]} y1={s.y1}
            x2={SEG_XS[i]} y2={s.y2}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray="3 3"
            opacity={s.opacity}
            style={{
              animation: `ds-march-${uid} ${s.duration} ease-in-out infinite alternate`,
              animationDelay: s.delay,
            }}
          />
        ))}
      </svg>
    </>
  );
}

// Result rows: staggered drop-in, then loop
function ResultRows({ uid }: { uid: string }) {
  const WIDTHS = ["86%", "74%", "92%", "68%", "80%", "60%"];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;

    function render() {
      if (!el) return;
      el.innerHTML = "";
      WIDTHS.forEach((w, i) => {
        const row = document.createElement("div");
        row.className = `ds-result-row-${uid}`;
        row.style.cssText = `
          width: ${w};
          height: 10px;
          border-radius: 5px;
          background: ${L.skeleton};
          margin-bottom: 14px;
          position: relative;
          overflow: hidden;
          opacity: 0;
          animation: ds-drop-in-${uid} 0.55s cubic-bezier(.2,.7,.2,1) both;
          animation-delay: ${(0.15 + i * 0.18).toFixed(2)}s;
        `;
        // shimmer child
        const shimmer = document.createElement("span");
        shimmer.style.cssText = `
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%);
          transform: translateX(-100%);
          animation: ds-shimmer-${uid} 2.2s ease-in-out infinite;
        `;
        row.appendChild(shimmer);
        el.appendChild(row);
      });
    }

    render();
    const interval = setInterval(render, 5200);
    return () => { clearInterval(interval); if (timer) clearTimeout(timer); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} />;
}

export default function DataStreamCard() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    /* qq-paper-surface provides the scoped light token reset
       (data-theme="light" is the selector that activates it).
       This is the same pattern used for other light islands on
       marketing dark pages — avoids a global reset on the 212
       existing usages of portal/dashboard light surfaces. */
    <div
      data-theme="light"
      className="qq-paper-surface"
      style={{
        background: L.bg,
        borderRadius: 14,
        padding: "8px",
        border: `1px dashed rgba(124,77,255,0.28)`,
        width: "100%",
        maxWidth: 560,
        fontFamily: "Inter, system-ui, sans-serif",
        color: L.ink,
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes ds-drop-in-${uid} {
          0%   { opacity: 0; transform: translateY(-6px) scaleX(0.6); }
          100% { opacity: 1; transform: translateY(0)    scaleX(1);   }
        }
        @keyframes ds-shimmer-${uid} {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(120%);  }
          100% { transform: translateX(120%);  }
        }
        @keyframes ds-lbl-shimmer-${uid} {
          0%   { transform: translateX(-100%); }
          60%  { transform: translateX(120%);  }
          100% { transform: translateX(120%);  }
        }
        @media (prefers-reduced-motion: reduce) {
          .ds-result-row-${uid} { animation: none !important; opacity: 1 !important; }
          .ds-result-row-${uid} span { animation: none !important; }
        }
      `}</style>

      {/* Source pills row — wraps on narrow phones so the two pills can't
          force the island wider than the viewport */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, paddingLeft: 32, marginBottom: 6, position: "relative", zIndex: 2 }}>
        {/* Purple: Review Sites */}
        <div style={{
          background: L.card,
          borderRadius: 10,
          padding: "9px 12px 9px 14px",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 6px 14px -10px rgba(0,0,0,0.08)",
          border: `1px dashed ${L.purpleBorder}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: L.purple, boxShadow: `0 0 8px ${L.purple}`,
          }} />
          Review Sites
          <span style={{
            marginLeft: 4,
            fontSize: 11, fontWeight: 600,
            padding: "2px 7px", borderRadius: 999,
            background: "#f0f1f4", color: L.inkSoft,
            fontVariantNumeric: "tabular-nums",
          }}>150+</span>
        </div>

        {/* Blue: Social Channels */}
        <div style={{
          background: L.card,
          borderRadius: 10,
          padding: "9px 12px 9px 14px",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 6px 14px -10px rgba(0,0,0,0.08)",
          border: `1px dashed ${L.blueBorder}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: L.blue, boxShadow: `0 0 8px ${L.blue}`,
          }} />
          Social Channels
          <span style={{
            marginLeft: 4,
            fontSize: 11, fontWeight: 600,
            padding: "2px 7px", borderRadius: 999,
            background: "#f0f1f4", color: L.inkSoft,
            fontVariantNumeric: "tabular-nums",
          }}>10+</span>
        </div>
      </div>

      {/* Animated segment graphs */}
      <div style={{ display: "flex", gap: 22, paddingLeft: 32, margin: "4px 0 14px", position: "relative", zIndex: 1 }}>
        <div style={{ flex: 1, height: 64, position: "relative" }}>
          <GraphSVG segs={SEGS1} color={L.purple} />
        </div>
        <div style={{ flex: 1, height: 64, position: "relative" }}>
          <GraphSVG segs={SEGS2} color={L.blue} />
        </div>
      </div>

      {/* Dashboard card */}
      <div style={{
        position: "relative",
        background: L.card,
        borderRadius: 14,
        padding: "26px 28px 32px",
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 24px 40px -28px rgba(20,25,50,0.18), 0 12px 20px -20px rgba(20,25,50,0.12)",
        overflow: "hidden",
      }}>
        {/* Logo row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em",
          marginBottom: 22, color: L.ink,
        }}>
          <span style={{ color: "#10b981", display: "flex", alignItems: "center" }}>
            <Shield size={20} strokeWidth={2} />
          </span>
          ReputationShield
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 28 }}>
          {/* Left: search + filters */}
          <div>
            <div style={{ marginBottom: 26 }}>
              <p style={{ fontSize: 13, color: L.inkSoft, fontWeight: 500, margin: "0 0 14px" }}>Search</p>
              <div style={{
                height: 36, borderRadius: 6, background: L.skeleton2,
                display: "flex", alignItems: "center", padding: "0 10px", color: "#b7bcc4",
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={11} cy={11} r={7}/><line x1={16.5} y1={16.5} x2={21} y2={21}/>
                </svg>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 13, color: L.inkSoft, fontWeight: 500, margin: "0 0 14px" }}>Filters</p>
              {[120, 140, 100].map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: "1.4px solid #c8cdd5", flexShrink: 0,
                  }} />
                  <span style={{
                    flex: 1, height: 8, borderRadius: 4,
                    background: L.skeleton, maxWidth: w, position: "relative", overflow: "hidden",
                  }}>
                    <span style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
                      transform: "translateX(-100%)",
                      animation: `ds-lbl-shimmer-${uid} 2.2s ease-in-out infinite`,
                    }} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: results */}
          <div>
            <p style={{ fontSize: 13, color: L.inkSoft, fontWeight: 500, margin: "0 0 14px" }}>Results</p>
            <ResultRows uid={uid} />
          </div>
        </div>
      </div>
    </div>
  );
}
