import { useState, useEffect, type CSSProperties } from "react";
import { Link } from "wouter";

const ACCENT = "#66E8FA";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const BRACKET_LEN = 14;
const CHECK_LEN = 11; // M7.5 11.5 L10 14 L14.5 9 ≈ 3.54 + 6.73 ≈ 10.27

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
    `@keyframes wft-draw-bracket{from{stroke-dashoffset:${BRACKET_LEN}}to{stroke-dashoffset:0}}`,
    `@keyframes wft-draw-check{from{stroke-dashoffset:${CHECK_LEN}}to{stroke-dashoffset:0}}`,
    `@keyframes wft-box-pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}`,
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
  const [hovered, setHovered] = useState(false);
  // Incrementing this key remounts the checkmark path, re-triggering its animation.
  const [checkKey, setCheckKey] = useState(0);

  useEffect(() => {
    ensureCSS();
    if (animate) setBooted(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseEnter = () => {
    setHovered(true);
    setCheckKey((k) => k + 1);
  };
  const handleMouseLeave = () => setHovered(false);

  // Bracket paths: draw in during boot, static otherwise
  const bracketStyle = (delay: number): CSSProperties =>
    booted
      ? {
          strokeDasharray: BRACKET_LEN,
          strokeDashoffset: BRACKET_LEN,
          animation: `wft-draw-bracket 250ms ${delay}ms ${EASE} forwards`,
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
          animation: `wft-draw-check 350ms 400ms ${EASE} forwards`,
        }
      : {};

  // Icon box: scale pulse at t=700ms during boot
  const boxAnimStyle: CSSProperties = booted
    ? { animation: `wft-box-pulse 200ms 700ms ${EASE} both` }
    : {};

  // Wordmark: fade in at t=850ms during boot, hidden before that
  const wordmarkStyle: CSSProperties = animate
    ? booted
      ? { opacity: 0, animation: `wft-wordmark-in 350ms 850ms ${EASE} forwards` }
      : { opacity: 0 }
    : {};

  const strokeProps = {
    stroke: ACCENT,
    strokeWidth: 2.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

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
      onMouseLeave={handleMouseLeave}
    >
      {/* Icon box */}
      <div
        style={{
          width: iconPx,
          height: iconPx,
          borderRadius: 11,
          background: "#1a1f1e",
          border: `1.5px solid ${hovered ? "rgba(102,232,250,0.5)" : "rgba(102,232,250,0.15)"}`,
          boxShadow: hovered ? "0 0 0 4px rgba(102,232,250,0.08)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: `border-color 0.2s ${EASE}, box-shadow 0.2s ${EASE}`,
          ...boxAnimStyle,
        }}
      >
        <svg viewBox="0 0 22 22" width={24} height={24} fill="none" aria-hidden="true">
          {/* Top-left bracket — draws at t=0 */}
          <path d="M8 3H4C3.4 3 3 3.4 3 4V8" {...strokeProps} style={bracketStyle(0)} />
          {/* Top-right bracket — draws at t=0 */}
          <path d="M14 3H18C18.6 3 19 3.4 19 4V8" {...strokeProps} style={bracketStyle(0)} />
          {/* Bottom-left bracket — draws at t=200 */}
          <path d="M8 19H4C3.4 19 3 18.6 3 18V14" {...strokeProps} style={bracketStyle(200)} />
          {/* Bottom-right bracket — draws at t=200 */}
          <path d="M14 19H18C18.6 19 19 18.6 19 18V14" {...strokeProps} style={bracketStyle(200)} />
          {/* Checkmark — draws at t=400, redraws on hover via key remount */}
          <path
            key={checkKey}
            d="M7.5 11.5L10 14L14.5 9"
            {...strokeProps}
            style={checkStyle}
          />
        </svg>
      </div>

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
