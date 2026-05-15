import { useEffect, useState } from "react";

/**
 * Shared scroll-driven visibility for the bottom MarketingStickyBar.
 *
 * Returns true when the sticky bar should be visible. The top
 * MarketingNav subscribes to the same hook and hides itself whenever
 * this returns true, so the two bars are mutually exclusive.
 *
 * Rules:
 * - Hidden when scrolled within 240px of the top of the page (the
 *   main header nav is still in view).
 * - Hidden when within 520px of the document bottom (footer area).
 * - Hidden entirely on narrow or touch-only viewports: the bar is a
 *   hover-driven affordance (its dropdowns open on hover, with no tap
 *   fallback) and the pill overflows phone widths. It is restricted to
 *   wide, hover-capable screens — matching the top nav's 1024px
 *   desktop breakpoint.
 */
const STICKY_BAR_MQ = "(min-width: 1024px) and (hover: hover)";

export function useStickyBarVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(STICKY_BAR_MQ);

    const check = () => {
      if (!mq.matches) {
        setVisible(false);
        return;
      }
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distFromBottom = docH - (y + winH);
      setVisible(y > 240 && distFromBottom > 520);
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    mq.addEventListener("change", check);
    check();
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      mq.removeEventListener("change", check);
    };
  }, []);

  return visible;
}
