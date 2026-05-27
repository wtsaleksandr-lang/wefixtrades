/**
 * MarketingStickyBar — fixed-bottom toolbar inspired by Effortel's
 * pill-shaped bottom nav.
 *
 * - Hover-driven dropdowns reuse the same Menu/MenuItem components and
 *   NAV_LINKS data as the top MarketingNav, so panel content + look are
 *   inherited automatically.
 * - The dropdown panel renders ABOVE the bar (placement="above") so it
 *   doesn't fall off the bottom of the screen.
 * - Mutually exclusive with the top nav via useStickyBarVisible.
 * - Background, blur, and border match the top navigation card so the
 *   two bars are visually the same toolbar in different positions.
 * - Show/hide animates as a "pop from a dot": transform scale 0 ↔ 1
 *   with a slight spring, paired with opacity fade.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowUp, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { Menu, MenuItem } from "@/components/ui/navbar-menu";
import { NAV_LINKS } from "@/site/navigation";
import { useStickyBarVisible } from "@/hooks/useStickyBarVisible";

// Pull the canonical entries for the items we want to surface — Products,
// Solutions, Tools, Pricing — so the bottom bar inherits exactly what the
// top nav shows.
const PICK = ["Products", "Solutions", "Tools", "Pricing"] as const;
const STICKY_LINKS = PICK
  .map((label) => NAV_LINKS.find((l) => l.label === label))
  .filter((x): x is (typeof NAV_LINKS)[number] => Boolean(x));

export default function MarketingStickyBar() {
  const visible = useStickyBarVisible();
  const [active, setActive] = useState<string | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const goTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  /* Wave 50 — publish the sticky-bar height as a CSS variable so the chat
   * bubble (SiteChatWidget) can lift above the bar on mobile and glide
   * back down when the bar hides. 62px ≈ rendered bar height (~44px) +
   * the bottom: 18 offset. */
  useEffect(() => {
    const root = document.documentElement;
    if (visible) {
      root.style.setProperty('--mkt-sticky-bar-h', '62px');
    } else {
      root.style.setProperty('--mkt-sticky-bar-h', '0px');
    }
    return () => { root.style.setProperty('--mkt-sticky-bar-h', '0px'); };
  }, [visible]);

  return (
    <div
      data-testid="marketing-sticky-bar"
      style={{
        position: "fixed",
        bottom: 18,
        left: "50%",
        transform: `translateX(-50%) scale(${visible ? 1 : 0})`,
        opacity: visible ? 1 : 0,
        transformOrigin: "50% 50%",
        transition: visible
          ? "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 240ms ease"
          : "transform 320ms cubic-bezier(0.4, 0, 0.6, 1), opacity 220ms ease",
        // Sit above the dropdown backdrop (zIndex 9990 in navbar-menu)
        // so the bar stays sharp while the rest of the page blurs.
        // The dropdown panel itself is at 9999, still above this bar.
        zIndex: 9991,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        ref={innerRef}
        // Same colour + transparency + blur + border + radius as the top
        // navigation card (see MarketingNav: rgba(34,40,42,0.72), blur(30px)).
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 6px",
          background: "rgba(34,40,42,0.72)",
          backdropFilter: "blur(30px) saturate(1.2)",
          WebkitBackdropFilter: "blur(30px) saturate(1.2)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Scroll-to-top arrow — leftmost utility button */}
        <button
          onClick={goTop}
          aria-label="Scroll to top"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32, height: 32,
            borderRadius: 9,
            background: "transparent",
            border: "1px solid transparent",
            color: mkt.accent,
            cursor: "pointer",
            transition: "background 0.18s ease, border-color 0.18s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <ArrowUp size={14} strokeWidth={2.2} />
        </button>

        {/* Menu — same component the top nav uses, so dropdowns render
            with the identical card grid. placement="above" floats the
            panel up from the bar instead of dropping down off-screen.
            Wave 50: wrapper hides the 4 dropdowns on ≤480px so the bar
            fits (CTA + scroll-to-top) on 390px phones. The links remain
            reachable via the top nav. */}
        <div className="mkt-sticky-menu-wrap">
          <Menu active={active} setActive={setActive} containerRef={innerRef}>
            {STICKY_LINKS.map(({ label, href, children }) => (
              <MenuItem
                key={href}
                setActive={setActive}
                active={active}
                item={label}
                href={href}
                children={children}
                placement="above"
              />
            ))}
          </Menu>
        </div>

        {/* Primary CTA — cream/off-white per DOSS pattern. Color comes
         * from mkt.buttonBg/Text which were re-aliased to the cream
         * tokens in tokens.ts; this component's structure is unchanged. */}
        <Link
          href="/wizard"
          className="wft-hover-border-blue"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 10,
            background: mkt.buttonBg,
            color: mkt.buttonText,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textDecoration: "none",
            whiteSpace: "nowrap",
            transition: "background 0.18s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = mkt.buttonHoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = mkt.buttonBg;
          }}
        >
          Start Free <ArrowRight size={12} strokeWidth={2.4} />
        </Link>
      </div>
      <style>{`
        @media (max-width: 480px) {
          .mkt-sticky-menu-wrap { display: none !important; }
        }
      `}</style>
    </div>
  );
}
