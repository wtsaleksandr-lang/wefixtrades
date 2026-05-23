/**
 * Shared smoothly-animating number renderer.
 *
 * Surface-agnostic version of the marketing missed-call-calculator
 * <AnimatedNumber>. Accepts a custom format() so callers can render
 * currency, plain integers, percentages, etc. Respects
 * prefers-reduced-motion (jumps to final value).
 *
 * Used by <AdminProductPageShell> for KPI cards. Kept here (not under
 * /marketing/...) so admin surfaces don't import a marketing module.
 */
import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Formatter — defaults to `n.toLocaleString()`. */
  format?: (n: number) => string;
}

export default function AnimatedNumber({
  value,
  duration = 500,
  format = (n) => n.toLocaleString(),
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) return;

    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{format(display)}</>;
}
