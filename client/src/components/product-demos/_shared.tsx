/**
 * Shared infrastructure for animated product demos.
 *
 * Every demo in this directory follows the same pattern:
 *   1. `useDemoLoop` hook gates the animation on viewport + hover + reduced-
 *      motion + mobile, exposes a step counter that loops forever.
 *   2. `<DemoFrame>` provides the dark glass card, glow, and consistent
 *      styling — so demos focus on their unique animated content.
 *
 * Drop-in pattern:
 *   const { ref, step, isStatic } = useDemoLoop({ steps: 5, stepMs: 1700 });
 *   return <DemoFrame ref={ref} ariaLabel="..."> ... </DemoFrame>;
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties, forwardRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { mkt } from "@/theme/tokens";

interface UseDemoLoopOpts {
  /** Total number of steps in the animation cycle. */
  steps: number;
  /** Milliseconds between steps. */
  stepMs?: number;
  /** Pause after the last step before resetting. */
  resetMs?: number;
  /** Mobile breakpoint below which to render static. */
  mobileBreakpoint?: number;
}

export function useDemoLoop({ steps, stepMs = 1700, resetMs = 3000, mobileBreakpoint = 640 }: UseDemoLoopOpts) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15%" });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [hovering, setHovering] = useState(false);
  const isMobile = useIsMobile(mobileBreakpoint);

  // Static = render the final frame (no animation)
  const isStatic = !!reduced || isMobile;

  useEffect(() => {
    if (isStatic) {
      setStep(steps - 1);
      return;
    }
    if (!inView || hovering) return;

    if (step < steps - 1) {
      const t = setTimeout(() => setStep((s) => s + 1), stepMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep(0), resetMs);
    return () => clearTimeout(t);
  }, [step, inView, hovering, isStatic, steps, stepMs, resetMs]);

  return {
    ref,
    step,
    isStatic,
    inView,
    onMouseEnter: () => setHovering(true),
    onMouseLeave: () => setHovering(false),
  };
}

function useIsMobile(breakpoint = 640) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return m;
}

/* ─── Glass card frame, identical across demos ─────────────────── */

interface DemoFrameProps {
  ariaLabel: string;
  children: ReactNode;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  glow?: boolean;
  maxWidth?: number | string;
}

export const DemoFrame = forwardRef<HTMLDivElement, DemoFrameProps>(
  ({ ariaLabel, children, style, onMouseEnter, onMouseLeave, glow = true, maxWidth = 420 }, ref) => {
    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ position: "relative", width: "100%", maxWidth, margin: "0 auto" }}
      >
        {glow && (
          <div style={{
            position: "absolute", inset: -40,
            background: "radial-gradient(ellipse, rgba(102,232,250,0.12) 0%, transparent 60%)",
            pointerEvents: "none", filter: "blur(40px)",
          }} />
        )}
        <div style={{
          position: "relative",
          background: mkt.dark, borderRadius: 20, border: `1px solid ${mkt.onDarkBorder}`,
          overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          ...style,
        }}>
          {children}
        </div>
      </div>
    );
  },
);
DemoFrame.displayName = "DemoFrame";

/* ─── Common "app header" used inside DemoFrame ────────────────── */

export function DemoHeader({ icon, title, subtitle, status }: { icon: ReactNode; title: string; subtitle?: string; status?: string }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: `linear-gradient(135deg, ${mkt.accent}, ${mkt.accentDark})`,
        display: "flex", alignItems: "center", justifyContent: "center", color: mkt.dark,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: mkt.onDarkMuted, fontFamily: "'DM Mono', monospace" }}>{subtitle}</div>}
      </div>
      {status && (
        <div style={{ fontSize: 10, color: mkt.success, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: mkt.success, display: "inline-block" }} />
          {status}
        </div>
      )}
    </div>
  );
}
