import { useEffect, useRef, useState } from 'react';
import { formatCurrencyFull } from '@/lib/missedCallCalculator';

interface AnimatedNumberProps {
  value: number;
  /** Animation duration in ms */
  duration?: number;
}

/**
 * Smoothly animates between number values using requestAnimationFrame.
 * Renders as formatted USD currency.
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

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
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
