/**
 * MobileStickyCta — mobile-only persistent bottom CTA for the marketing site.
 *
 * Why this exists: on desktop the marketing chrome has a scroll-triggered
 * hover pill (MarketingStickyBar, gated to `(min-width:1024px) and
 * (hover:hover)`). On MOBILE the top nav collapses to logo + hamburger, hiding
 * the primary CTA behind the menu — so phones have no always-visible convert
 * action once the hero scrolls away. This slim, thumb-reachable bottom bar
 * restores it.
 *
 * - Renders ONLY on small / touch viewports (see useMobileCtaVisible); the
 *   desktop pill and this bar are mutually exclusive, never both shown.
 * - Uses the shared PRIMARY_CTA (one label + one destination everywhere).
 * - Theme tokens only (mkt.*) — no hardcoded white/black.
 * - Coexists with the chat bubble (SiteChatWidget): while visible it publishes
 *   `--mkt-sticky-bar-h` (the same variable the desktop bar uses), which the
 *   chat bubble's mobile positioning reads to lift itself ABOVE this bar so
 *   the two never overlap. Cleared to 0 when hidden so the bubble glides back.
 */

import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { PRIMARY_CTA } from "@/site/cta";
import { useMobileCtaVisible } from "@/hooks/useMobileCtaVisible";

/* Bar height (excluding the safe-area inset, which the chat bubble adds on
 * its own). Kept in sync with the padding + button height below. Published as
 * --mkt-sticky-bar-h so the chat bubble lifts clear of the bar. */
const BAR_H = "72px";

export default function MobileStickyCta() {
  const visible = useMobileCtaVisible();

  useEffect(() => {
    const root = document.documentElement;
    if (visible) {
      root.style.setProperty("--mkt-sticky-bar-h", BAR_H);
    } else {
      root.style.setProperty("--mkt-sticky-bar-h", "0px");
    }
    return () => {
      root.style.setProperty("--mkt-sticky-bar-h", "0px");
    };
  }, [visible]);

  return (
    <div
      data-testid="mobile-sticky-cta"
      aria-hidden={!visible}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        // Below the chat bubble (9998) + panel (9999) so both float above this
        // bar; above ordinary page content. The desktop pill (9991) never
        // renders at these widths, so there is no collision.
        zIndex: 9990,
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        background: mkt.frost,
        backdropFilter: "blur(30px) saturate(1.2)",
        WebkitBackdropFilter: "blur(30px) saturate(1.2)",
        borderTop: `1px solid ${mkt.border}`,
        transform: visible ? "translateY(0)" : "translateY(110%)",
        opacity: visible ? 1 : 0,
        transition: visible
          ? "transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease"
          : "transform 300ms cubic-bezier(0.4, 0, 0.6, 1), opacity 200ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Link
        href={PRIMARY_CTA.href}
        data-testid="mobile-sticky-cta-link"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flex: 1,
          minWidth: 0,
          height: 48,
          padding: "0 18px",
          borderRadius: 12,
          background: mkt.ctaBg,
          color: mkt.ctaText,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "'DM Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textDecoration: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {PRIMARY_CTA.label}
        <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
      </Link>
    </div>
  );
}
