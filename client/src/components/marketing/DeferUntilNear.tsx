/**
 * DeferUntilNear — render children only when the placeholder enters the
 * viewport (or comes within `rootMargin`). Wave 45.
 *
 * Why: `React.lazy()` chunks start fetching as soon as React commits the
 * `<Suspense>` boundary, which on the marketing homepage was triggering
 * vendor-globe (~520 KiB gzipped Three.js bundle), vendor-charts, and
 * other heavy below-the-fold chunks during the first paint — they
 * competed for bandwidth with the LCP image and gated the perf score.
 *
 * This component renders an empty (height-reserving) placeholder div
 * first, then swaps in the real children once the IntersectionObserver
 * fires. Result: vendor-globe et al. don't request bytes until the
 * visitor actually scrolls into their region, giving the hero LCP
 * exclusive bandwidth.
 *
 * Honors CLS — the placeholder reserves the same `minHeight` as the
 * Suspense fallback for the section, so layout doesn't shift.
 *
 * SSR/prerender safe: the prerender runtime ran without
 * IntersectionObserver previously, so we fall back to "mount immediately"
 * if it's missing.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferUntilNearProps {
  children: ReactNode;
  /** Reserved height while not mounted — should match the section's natural height. */
  minHeight: number;
  /** How far ahead of the viewport (CSS units) to begin mounting. Default 600px. */
  rootMargin?: string;
}

export default function DeferUntilNear({
  children,
  minHeight,
  rootMargin = "600px",
}: DeferUntilNearProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return typeof IntersectionObserver === "undefined";
  });

  useEffect(() => {
    if (shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);

  if (shown) return <>{children}</>;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ minHeight, background: "transparent" }}
    />
  );
}
