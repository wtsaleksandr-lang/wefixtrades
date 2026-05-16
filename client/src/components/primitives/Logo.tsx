import { useState, useEffect, type CSSProperties } from "react";
import { Link } from "wouter";

const ACCENT = "#0d3cfc";
// Logo renders on dark surfaces (the wordmark is near-white), so the
// open-checkbox box uses the light stroke; the check stays brand blue.
const BOX_STROKE = "#F9F9F9";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
// Path lengths drive the draw-on animation (stroke-dash trick).
const BOX_LEN = 39; // "M12 7 H4 V20 H17 V12.5" ≈ 5 + 13 + 13 + 7.5
const CHECK_LEN = 20; // "M8 13 11.5 16.5 21 5" ≈ 4.95 + 14.92

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { icon: number; fontSize: number }> = {
  sm: { icon: 32, fontSize: 16 },
  md: { icon: 42, fontSize: 20 },
  lg: { icon: 56, fontSize: 24 },
};

// Inject animation keyframes once into <head>
let _cssInjected = false;
function ensureCSS() {
  if (_cssInjected || typeof document === "undefined") return;
  _cssInjected = true;
  const el = document.createElement("style");
  el.dataset.id = "wft-logo-anim";
  el.textContent = [
    `@keyframes wft-draw-box{from{stroke-dashoffset:${BOX_LEN}}to{stroke-dashoffset:0}}`,
    `@keyframes wft-draw-check{from{stroke-dashoffset:${CHECK_LEN}}to{stroke-dashoffset:0}}`,
    `@keyframes wft-icon-pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}`,
    `@keyframes wft-wordmark-in{from{opacity:0}to{opacity:1}}`,
  ].join("\n");
  document.head.appendChild(el);
}

interface LogoProps {
  size?: Size;
  showWordmark?: boolean;
  /** Set false for instances that should render static (no boot replay). */
  animate?: boolean;
}

export default function Logo({ size = "md", showWordmark = true, animate = true }: LogoProps) {
  const { icon: iconPx, fontSize } = SIZES[size];
  const [booted, setBooted] = useState(false);
  // Incrementing this key remounts the checkmark path, re-triggering its animation.
  const [checkKey, setCheckKey] = useState(0);

  useEffect(() => {
    ensureCSS();
    if (animate) setBooted(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseEnter = () => setCheckKey((k) => k + 1);

  // Box outline: draws in during boot, static otherwise.
  const boxStyle: CSSProperties = booted
    ? {
        strokeDasharray: BOX_LEN,
        strokeDashoffset: BOX_LEN,
        animation: `wft-draw-box 450ms 0ms ${EASE} forwards`,
      }
    : {};

  // Checkmark: boot animation (key=0) or hover redraw (key>0)
  const checkStyle: CSSProperties =
    checkKey > 0
      ? {
          strokeDasharray: CHECK_LEN,
          strokeDashoffset: CHECK_LEN,
          animation: `wft-draw-check 350ms 0ms ${EASE} forwards`,
        }
      : booted
      ? {
          strokeDasharray: CHECK_LEN,
          strokeDashoffset: CHECK_LEN,
          animation: `wft-draw-check 350ms 450ms ${EASE} forwards`,
        }
      : {};

  // Icon: scale pulse at t=700ms during boot
  const iconAnimStyle: CSSProperties = booted
    ? { animation: `wft-icon-pulse 200ms 700ms ${EASE} both` }
    : {};

  // Wordmark: fade in at t=850ms during boot, hidden before that
  const wordmarkStyle: CSSProperties = animate
    ? booted
      ? { opacity: 0, animation: `wft-wordmark-in 350ms 850ms ${EASE} forwards` }
      : { opacity: 0 }
    : {};

  return (
    <Link
      href="/"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        flexShrink: 0,
      }}
      onMouseEnter={handleMouseEnter}
    >
      {/* Bare icon — no badge box around it */}
      <svg
        viewBox="0 0 24 24"
        width={iconPx}
        height={iconPx}
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, ...iconAnimStyle }}
      >
        {/* Open checkbox — box outline with the top-right corner left open */}
        <path
          d="M12 7 H4 V20 H17 V12.5"
          stroke={BOX_STROKE}
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={boxStyle}
        />
        {/* Checkmark — exits through the open corner; redraws on hover */}
        <path
          key={checkKey}
          d="M8 13 11.5 16.5 21 5"
          stroke={ACCENT}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={checkStyle}
        />
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span
          style={{
            fontWeight: 700,
            fontSize,
            letterSpacing: "-0.025em",
            color: "#FAFAFA",
            whiteSpace: "nowrap",
            ...wordmarkStyle,
          }}
        >
          We<span style={{ color: ACCENT }}>Fix</span>Trades
        </span>
      )}
    </Link>
  );
}
