import { useEffect, useState } from "react";

/**
 * Scroll-driven visibility for the mobile-only persistent bottom CTA
 * (MobileStickyCta).
 *
 * The DESKTOP scroll pill (MarketingStickyBar via useStickyBarVisible) is
 * restricted to `(min-width: 1024px) and (hover: hover)` — so phones, whose
 * top nav collapses the primary CTA behind a hamburger, have NO always-visible
 * convert action. This hook is the inverse: it drives a slim bottom CTA that
 * shows ONLY on small / touch viewports, so the two affordances are mutually
 * exclusive and never both render.
 *
 * Rules (mirror useStickyBarVisible, tuned for mobile):
 * - Shown only at ≤560px OR on touch / no-hover viewports.
 * - Hidden within the first ~500px of scroll (the hero already carries a CTA,
 *   so we don't stack a second one over it on load).
 * - Hidden within ~520px of the document bottom (the footer + its own CTAs).
 */
const MOBILE_CTA_MQ = "(max-width: 560px), (hover: none), (pointer: coarse)";

export function useMobileCtaVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_CTA_MQ);

    const check = () => {
      if (!mq.matches) {
        setVisible(false);
        return;
      }
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const distFromBottom = docH - (y + winH);
      setVisible(y > 500 && distFromBottom > 520);
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
