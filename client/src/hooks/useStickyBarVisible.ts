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
 */
export function useStickyBarVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distFromBottom = docH - (y + winH);
      setVisible(y > 240 && distFromBottom > 520);
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return visible;
}
