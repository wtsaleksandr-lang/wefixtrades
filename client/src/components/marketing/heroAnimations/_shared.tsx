/**
 * Shared primitives for SplitHero animations (Wave 13).
 *
 * Each per-product / per-trade animation imports from here so they all share
 * the same frame, reduced-motion handling, and visual language. Keeps each
 * animation file small (< 50KB gzipped per the wave spec).
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

/* ─── prefers-reduced-motion hook ─────────────────────────────────
   Animations call this and disable the motion if it returns true.
   We default to false on the server so the static fallback ships,
   then upgrade after mount once we can read the media query. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/* ─── IntersectionObserver pause-when-offscreen ────────────────────
   Animations call this with their root ref. While the ref is outside
   the viewport, the returned flag is false so animations can pause
   their loops and conserve CPU. */
export function useInView<T extends Element>(ref: React.RefObject<T>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/* ─── Tick hook — drives a 4-6 second loop ─────────────────────────
   Returns a beat index 0..(totalBeats-1) that advances every
   `beatMs` while `active` is true. Used by animations that step
   through 3-4 discrete beats. */
export function useBeat(totalBeats: number, beatMs: number, active: boolean): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setBeat((b) => (b + 1) % totalBeats);
    }, beatMs);
    return () => window.clearInterval(id);
  }, [totalBeats, beatMs, active]);
  return beat;
}

/* ─── Frame — shared shell for every hero animation ────────────────
   Sized to fit the right column on desktop (~440x440) and stack
   naturally on mobile. Subtle dot-grid background gives every
   animation a consistent "in a viewport" feel. */
export function AnimationFrame({
  children,
  ariaLabel,
}: {
  children: ReactNode;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      data-testid="hero-animation-frame"
      style={frameStyle}
    >
      <div style={dotGridStyle} aria-hidden="true" />
      <div style={frameInnerStyle}>{children}</div>
    </div>
  );
}

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 460,
  aspectRatio: "1 / 1",
  borderRadius: 20,
  overflow: "hidden",
  background: mkt.sectionLight,
  border: `1px solid ${mkt.onDarkBorder}`,
  boxShadow: "0 20px 60px rgba(0,0,0,0.32)",
};

const dotGridStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
  pointerEvents: "none",
};

const frameInnerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

/* ─── Common pill / chip / label styles ────────────────────────── */
export const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  background: mkt.accent,
  color: mkt.onDark,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const cardStyle: CSSProperties = {
  background: mkt.dark,
  border: `1px solid ${mkt.onDarkBorder}`,
  borderRadius: 12,
  padding: "12px 14px",
  color: mkt.onDark,
  boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
};

export const monoLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: mkt.onDarkFaint,
};
