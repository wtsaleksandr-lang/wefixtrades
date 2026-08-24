import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Menu as MenuIcon, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/primitives/Logo";
import { NAV_LINKS, NAV_MOBILE_BREAKPOINT } from "@/site/navigation";
import { PRIMARY_CTA } from "@/site/cta";
import { Menu, MenuItem } from "@/components/ui/navbar-menu";
import { MobileNavItem } from "./MobileNavItem";
import { mkt, typography } from "@/theme/tokens";
import { useStickyBarVisible } from "@/hooks/useStickyBarVisible";

const DESKTOP_NAV_HEIGHT = 68;
const DESKTOP_CARD_HEIGHT = 50;

function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > threshold);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);
  return scrolled;
}

export function useNavIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined"
      ? window.innerWidth < NAV_MOBILE_BREAKPOINT
      : false,
  );
  useEffect(() => {
    const handler = () =>
      setIsMobile(window.innerWidth < NAV_MOBILE_BREAKPOINT);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export function MarketingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuEpoch, setMenuEpoch] = useState(0);
  const navCardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState<number>(92);
  const prevMenuOpenRef = useRef(false);

  const [location] = useLocation();
  const isMobile = useNavIsMobile();
  const scrolled = useScrolled();
  const { isAuthenticated } = useAuth();
  const stickyBarVisible = useStickyBarVisible();
  // Hide whenever the bottom sticky bar takes over so the two are never
  // shown at the same time.
  const navHidden = stickyBarVisible;

  const isActive = (href: string) => location === href;

  const toggleMenu = useCallback(() => {
    if (!menuOpen) setMenuEpoch((e) => e + 1);
    setMenuOpen((o) => !o);
  }, [menuOpen]);

  // Body scroll lock on mobile when menu is open
  useEffect(() => {
    if (!isMobile || !menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, isMobile]);

  // Compute menu position below nav bar
  useEffect(() => {
    if (!isMobile || !menuOpen) return;
    const compute = () => {
      const el = navCardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuTop(Math.round(r.bottom + 3));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [menuOpen, isMobile]);

  // Close menu on significant scroll
  useEffect(() => {
    if (!menuOpen) return;
    const startY = window.scrollY;
    const handler = () => {
      if (isMobile && Math.abs(window.scrollY - startY) < 60) return;
      setMenuOpen(false);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [menuOpen, isMobile]);

  // Mobile menu accessibility: three effects below handle inert, focus, and
  // focus-trap. The panel is always in the DOM (for CSS transitions), so
  // `inert` is essential to prevent keyboard/AT access to invisible content.
  useEffect(() => {
    const el = menuPanelRef.current;
    if (!el) return;
    if (menuOpen) {
      el.removeAttribute("inert");
    } else {
      el.setAttribute("inert", "");
    }
  }, [menuOpen, isMobile]);

  // Mobile menu: focus management on open/close
  useEffect(() => {
    if (!isMobile) return;
    const wasOpen = prevMenuOpenRef.current;
    prevMenuOpenRef.current = menuOpen;

    if (menuOpen && !wasOpen) {
      // Focus first interactive element after panel starts appearing
      const timer = setTimeout(() => {
        const first = menuPanelRef.current?.querySelector<HTMLElement>(
          "button, a[href]",
        );
        first?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
    if (!menuOpen && wasOpen) {
      hamburgerRef.current?.focus();
    }
  }, [menuOpen, isMobile]);

  // Mobile menu: focus trap + Escape to close
  useEffect(() => {
    if (!menuOpen || !isMobile) return;
    const panel = menuPanelRef.current;
    if (!panel) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, isMobile]);

  return (
    <>
      <nav
        className={`mkt-nav${scrolled ? " scrolled" : ""}`}
        data-testid="nav-marketing"
        style={{
          position: "fixed",
          // S7 fix — offset the fixed header below the announcement banner
          // when one is present. AnnouncementBanner publishes its rendered
          // height as `--wft-announcement-h` (0px when no banner), so on
          // ordinary pages this is `top: 0` unchanged, and on waitlist/
          // announcement pages the header no longer paints over the banner.
          top: "var(--wft-announcement-h, 0px)",
          left: 0,
          right: 0,
          // Sit above the dropdown backdrop (zIndex 9990 in navbar-menu)
          // so the nav bar stays sharp while the rest of the page blurs.
          // The dropdown panel itself is at 9999, still above the nav.
          zIndex: 9991,
          height: isMobile ? "auto" : DESKTOP_NAV_HEIGHT,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 0,
          background: "transparent",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          borderBottom: "none",
          boxShadow: "none",
          opacity: navHidden ? 0 : 1,
          pointerEvents: navHidden ? "none" : "auto",
          transform: navHidden ? "translateY(-12px)" : "translateY(0)",
          transition: "opacity 240ms ease, transform 240ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          ref={navCardRef}
          className="mkt-nav-bar"
          style={{
            height: isMobile ? 66 : DESKTOP_CARD_HEIGHT,
            width: "100%",
            // P0 FIX — nav card flush to viewport top (was marginTop: 4 which
            // left a visible 4px gap between the browser chrome and the card).
            marginTop: 0,
            borderRadius: 12,
            /* Glass bar background + backdrop-filter live in the .mkt-nav-bar
             * CSS rule below (with an @supports solid fallback) so unsupported
             * browsers still get an opaque, legible nav instead of transparent
             * text on a see-through bar. */
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: scrolled
              ? "0 8px 24px rgba(0,0,0,0.25)"
              : "0 6px 20px rgba(0,0,0,0.15)",
            ...(isMobile && {
              willChange: "backdrop-filter",
              transform: "translateZ(0)",
            }),
          }}
        >
          <div
            ref={innerRef}
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              padding: isMobile ? "0 16px" : "0 28px",
            }}
          >
            <Logo />

            {!isMobile && (
              <Menu active={active} setActive={setActive} containerRef={innerRef}>
                {NAV_LINKS.map(({ label, href, children: navChildren, subgroups, footer, flagship }) => (
                  <MenuItem
                    key={href}
                    setActive={setActive}
                    active={active}
                    item={label}
                    href={href}
                    children={navChildren}
                    subgroups={subgroups}
                    footer={footer}
                    flagship={flagship}
                  />
                ))}
              </Menu>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexShrink: 0,
              }}
            >
              {!isMobile && (
                <>
                  <Link
                    href={isAuthenticated ? "/Dashboard" : "/login"}
                    data-testid={
                      isAuthenticated ? "nav-dashboard" : "nav-login"
                    }
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "'DM Mono', monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: mkt.text,
                      textDecoration: "none",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = mkt.accent)
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = mkt.text)
                    }
                  >
                    {isAuthenticated ? "Dashboard" : "Login"}
                  </Link>
                  <Link
                    href={PRIMARY_CTA.href}
                    className="mkt-btn-primary nav-cta-start-free"
                    data-testid="nav-cta-start-free"
                    style={{
                      padding: "8px 18px",
                      borderRadius: 10,
                      background: mkt.buttonBg,
                      color: mkt.buttonText,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: typography.fontFamily,
                      /* Mixed-case canonical label — matches hero + product
                       * pages. No uppercase, no mono tracking. */
                      letterSpacing: "0",
                      textDecoration: "none",
                      display: "inline-block",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {PRIMARY_CTA.label}
                  </Link>
                  <Link
                    href="/demos"
                    className="mkt-btn-demo"
                    data-testid="nav-cta-tradeline"
                    style={{
                      padding: "8px 18px",
                      borderRadius: 10,
                      background: "transparent",
                      color: mkt.ctaSecondaryText,
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: typography.fontFamily,
                      letterSpacing: "0",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      whiteSpace: "nowrap",
                      border: `1px solid ${mkt.ctaSecondaryBorder}`,
                      transition: "background 0.2s ease, border-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = mkt.ctaSecondaryBgHover;
                      el.style.borderColor = mkt.ctaSecondaryBorderHover;
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "transparent";
                      el.style.borderColor = mkt.ctaSecondaryBorder;
                    }}
                  >
                    See it live
                  </Link>
                </>
              )}
              {isMobile && (
                <button
                  ref={hamburgerRef}
                  onClick={toggleMenu}
                  aria-label="Toggle menu"
                  aria-expanded={menuOpen}
                  data-testid="nav-hamburger"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 8,
                    borderRadius: 8,
                    color: mkt.text,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      transform: menuOpen
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                      transition:
                        "transform 0.25s cubic-bezier(0.22,1,0.36,1)",
                      display: "flex",
                    }}
                  >
                    {menuOpen ? (
                      <X size={24} strokeWidth={1.5} />
                    ) : (
                      <MenuIcon size={24} strokeWidth={1.5} />
                    )}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <style>{`
        /* Glass nav bar — standardized to saturate(1.4) (was 1.2) to match the
         * shared .wft-glass-* utilities. @supports fallback keeps the bar
         * opaque where backdrop-filter is unsupported so nav text never sits on
         * a transparent bar. */
        .mkt-nav-bar {
          background: rgba(34,40,42,0.72);
          backdrop-filter: blur(30px) saturate(1.4);
          -webkit-backdrop-filter: blur(30px) saturate(1.4);
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .mkt-nav-bar { background: rgba(34,40,42,0.96); }
        }
        @media (max-width: 768px) {
          .mkt-nav-bar { border-radius: 20px !important; }
        }
        @media (max-width: 430px) {
          .mkt-nav-bar { border-radius: 18px !important; }
        }

        /* ── FIX 1: "Start free — no card" premium hover ───────────────────
         * Override the generic .mkt-btn-primary hover with a more prominent
         * accent-blue variant scoped to the nav button. translateY(-1px) lift
         * + soft blue glow + inset accent ring. 160ms feels snappy but
         * controlled. The base .mkt-btn-primary already carries the
         * transition property so we only override what changes here. */
        .nav-cta-start-free {
          transition:
            background 0.16s ease,
            box-shadow 0.16s ease,
            transform 0.16s ease !important;
        }
        .nav-cta-start-free:hover {
          background: ${mkt.buttonHoverBg} !important;
          transform: translateY(-1px);
          box-shadow:
            inset 0 0 0 1.5px rgba(13,60,252,0.55),
            0 4px 14px rgba(13,60,252,0.22),
            0 1px 3px rgba(0,0,0,0.10) !important;
        }
        .nav-cta-start-free:active {
          transform: translateY(0px) scale(0.985);
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-cta-start-free,
          .nav-cta-start-free:hover {
            transform: none !important;
            transition: background 0.16s ease, box-shadow 0.16s ease !important;
          }
        }

        /* ── FIX 2: Right CTA cluster — both CTAs visible across full desktop ──
         * Previously the secondary "TradeLine Demo" pill was hidden below
         * 1430px (display:none), so every common laptop (1366/1280px) lost the
         * secondary CTA entirely — a conversion leak. The inner row is clamped
         * to maxWidth:1280 (≈1224px of content after 28px×2 padding), so the
         * full cluster — logo + menus + Login + Start free + TradeLine Demo —
         * fits within that box. Across the intermediate desktop band
         * (1256–1429px) we compress the two CTA pills' padding + font a touch
         * so nothing clips.
         *
         * FIX 4: lower bound raised 1130 → 1256 to match the new
         * NAV_MOBILE_BREAKPOINT. Below 1256px the desktop CTAs don't render at
         * all (hamburger takes over, carrying both CTAs in the mobile menu), so
         * the compression band only needs to cover 1256–1429 — the range where
         * both pills are in the bar AND space is tight. The cluster hit its
         * intrinsic min-width ~1251px and overran/clipped below that; handing it
         * to the hamburger at 1256 avoids the impossible squeeze entirely. */
        @media (min-width: 1256px) and (max-width: 1429px) {
          .nav-cta-start-free,
          .mkt-btn-demo {
            padding: 7px 13px !important;
            font-size: 12px !important;
          }
        }

        /* ── FIX 3: "Fix" wordmark glow on dark nav ────────────────────────
         * The Logo component renders:
         *   <span style="color: #0d3cfc">Fix</span>
         * inside the wordmark. On the near-black nav the blue fill is hard
         * to read. A soft luminance halo behind the letterform makes it pop
         * without altering the fill colour or any geometry. Scoped to
         * .mkt-nav-bar so this ONLY applies to the dark nav context. */
        .mkt-nav-bar a span[style*="color: rgb(13, 60, 252)"],
        .mkt-nav-bar a span[style*="color:#0d3cfc"],
        .mkt-nav-bar a span[style*="color: #0d3cfc"] {
          text-shadow:
            0 0 12px rgba(13,60,252,0.60),
            0 0 3px rgba(255,255,255,0.15);
        }
      `}</style>

      {/* Mobile overlay */}
      {isMobile && (
        <div
          aria-hidden="true"
          data-testid="nav-mobile-overlay"
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 290,
            // Heavier darkening so the dimming effect is visible even on flat
            // dark V7 pages where there's no colourful content for the blur
            // to soften — without this the menu appears to float over an
            // unchanged page on /products, /pricing, /about, etc.
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(16px) saturate(1.2)",
            WebkitBackdropFilter: "blur(16px) saturate(1.2)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        />
      )}

      {/* Mobile menu panel */}
      {isMobile && (
        <div
          ref={menuPanelRef}
          role={menuOpen ? "dialog" : undefined}
          aria-modal={menuOpen ? "true" : undefined}
          aria-label={menuOpen ? "Navigation menu" : undefined}
          onClick={(e) => e.stopPropagation()}
          data-testid="nav-mobile-menu"
          style={{
            position: "fixed",
            left: 2,
            right: 2,
            top: menuTop,
            zIndex: 300,
            borderRadius: 20,
            background: "rgba(34,40,42,0.88)",
            backdropFilter: "blur(22px) saturate(1.6)",
            WebkitBackdropFilter: "blur(22px) saturate(1.6)",
            border: `1px solid ${mkt.border}`,
            boxShadow: menuOpen
              ? "0 20px 36px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)"
              : "0 10px 20px rgba(0,0,0,0.25)",
            overflow: "hidden",
            maxHeight: "78vh",
            transform: menuOpen
              ? "translateY(0px) scale(1)"
              : "translateY(-12px) scale(0.98)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition:
              "transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, box-shadow 0.25s ease",
          }}
        >
          <div
            style={{
              padding: "10px 16px 14px",
              overflowY: "auto",
              maxHeight: "78vh",
            }}
          >
            {NAV_LINKS.map(({ label, href, children, subgroups }) => (
              <MobileNavItem
                key={`${href}${label}-${menuEpoch}`}
                label={label}
                href={href}
                children={children}
                subgroups={subgroups}
                isActive={isActive(href)}
                onClose={() => setMenuOpen(false)}
              />
            ))}

            <Link
              href={PRIMARY_CTA.href}
              onClick={() => setMenuOpen(false)}
              data-testid="nav-cta-start-free-mobile"
              className="wft-hover-border-blue"
              style={{
                display: "block",
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: mkt.buttonBg,
                color: mkt.buttonText,
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: "0.02em",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {PRIMARY_CTA.label}
            </Link>
            <Link
              href="/demos"
              onClick={() => setMenuOpen(false)}
              data-testid="nav-cta-tradeline-mobile"
              style={{
                display: "block",
                marginTop: 8,
                padding: "12px 14px",
                borderRadius: 10,
                background: "transparent",
                color: mkt.ctaSecondaryText,
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: "0.01em",
                textAlign: "center",
                textDecoration: "none",
                border: `1px solid ${mkt.ctaSecondaryBorder}`,
              }}
            >
              See it live
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
