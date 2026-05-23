import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Animation duration in ms */
  duration?: number;
}

/** Format as full USD with commas: $1,234 */
function formatCurrencyFull(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Smoothly animates between number values using requestAnimationFrame.
 * Renders as formatted USD currency. Respects prefers-reduced-motion.
 *
 * Relocated from `components/marketing/missed-call-calculator/AnimatedNumber.tsx`
 * during the tools-consolidation cleanup (Missed Call Calculator removed; this
 * lives at the marketing root because ReportView still uses it for the
 * friendly-hero revenue count-up).
 */
export default function AnimatedNumber({ value, duration = 500 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;

    if (from === to) return;

    // Respect reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(to);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * ease));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{formatCurrencyFull(display)}</>;
}
