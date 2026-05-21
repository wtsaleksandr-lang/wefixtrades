/**
 * useCountUp — animate a number from its previous value to a new target.
 *
 * Wave AA — the calculator's headline result was snapping to its new value
 * the instant a slider changed or the widget booted, with no visual
 * acknowledgement that the number had recomputed. This hook animates the
 * value over ~600ms with an ease-out cubic curve so the digits visibly
 * "run up" (or down) to the new total, drawing the customer's attention to
 * what just changed.
 *
 * Behaviour:
 *   - First mount: animates from 0 → target (the "boot" animation Alex called
 *     out specifically).
 *   - Subsequent target changes: animates from the previously-rendered value
 *     to the new target — so dragging a slider feels live.
 *   - Respects `prefers-reduced-motion`: returns the target value verbatim
 *     with no animation when the user has reduced-motion set.
 *
 * The hook is intentionally tiny + dependency-free — no `framer-motion` /
 * `react-spring`. The visible widget bundle stays lean.
 */

import { useEffect, useRef, useState } from 'react';

/** ease-out cubic; nice "settles into place" curve. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useCountUp(target: number, durationMs: number = 600): number {
  // Track the value we're currently rendering. Starts at 0 so first-mount
  // animation runs from 0 → target (the boot animation).
  const [value, setValue] = useState<number>(0);
  // Animation start state — captured fresh each time target changes.
  const fromRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  // Keep the latest rendered value in a ref so the next animation can read
  // it without a stale closure.
  const valueRef = useRef<number>(0);
  valueRef.current = value;

  useEffect(() => {
    // Reduced-motion users get the value verbatim with no animation.
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    // Skip a no-op (target unchanged) to avoid restarting the animation
    // when a parent re-renders.
    if (Math.abs(valueRef.current - target) < 0.001) {
      setValue(target);
      return;
    }

    fromRef.current = valueRef.current;
    startRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    let frame: number;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        // Snap to the exact target so any tiny floating-point drift from
        // the eased interpolation doesn't show up in the formatted output.
        setValue(target);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // We deliberately omit `value` from deps — only target changes should
    // restart the animation; the value updates *during* the animation are
    // its own side effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
