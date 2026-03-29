import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Logo from "@/components/primitives/Logo";
import { NAV_LINKS, NAV_MOBILE_BREAKPOINT } from "@/site/navigation";
import { DesktopNavItem } from "./DesktopNavItem";
import { MobileNavItem } from "./MobileNavItem";
import { mkt } from "@/theme/tokens";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const navCardRef = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState<number>(92);

  const [location] = useLocation();
  const isMobile = useNavIsMobile();
  const scrolled = useScrolled();
  const { isAuthenticated } = useAuth();

  const isActive = (href: string) => location === href;

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

  return (
    <>
      <nav
        className={`mkt-nav${scrolled ? " scrolled" : ""}`}
        data-testid="nav-marketing"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 300,
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
        }}
      >
        <div
          ref={navCardRef}
          className="mkt-nav-bar"
          style={{
            height: isMobile ? 66 : DESKTOP_CARD_HEIGHT,
            width: "100%",
            marginTop: 4,
            borderRadius: 12,
            background: "rgba(34,40,42,0.72)",
            backdropFilter: "blur(14px) saturate(1.2)",
            WebkitBackdropFilter: "blur(14px) saturate(1.2)",
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
              <nav
                aria-label="Main navigation"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  flex: "0 1 auto",
                }}
              >
                {NAV_LINKS.map(({ label, href, children }) => (
                  <DesktopNavItem
                    key={href}
                    label={label}
                    href={href}
                    children={children}
                    isActive={isActive(href)}
                    headerRef={navCardRef}
                  />
                ))}
              </nav>
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
                    href="/Wizard"
                    className="mkt-btn-primary"
                    data-testid="nav-cta-start-free"
                    style={{
                      padding: "8px 18px",
                      borderRadius: 9,
                      background: mkt.buttonBg,
                      color: mkt.buttonText,
                      fontSize: 12,
                      fontWeight: 500,
                      fontFamily: "'DM Mono', monospace",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      textDecoration: "none",
                      display: "inline-block",
                      whiteSpace: "nowrap",
                      transition: "background 0.2s ease, box-shadow 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        mkt.buttonHoverBg;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        mkt.buttonBg;
                    }}
                  >
                    START FREE
                  </Link>
                </>
              )}
              {isMobile && (
                <button
                  onClick={() => setMenuOpen((o) => !o)}
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
                      <X size={22} strokeWidth={1.5} />
                    ) : (
                      <Menu size={22} strokeWidth={1.5} />
                    )}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .mkt-nav-bar { border-radius: 20px !important; }
        }
        @media (max-width: 430px) {
          .mkt-nav-bar { border-radius: 18px !important; }
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
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        />
      )}

      {/* Mobile menu panel */}
      {isMobile && (
        <div
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
            {NAV_LINKS.map(({ label, href, children }) => (
              <MobileNavItem
                key={href + label}
                label={label}
                href={href}
                children={children}
                isActive={isActive(href)}
                onClose={() => setMenuOpen(false)}
              />
            ))}

            <Link
              href="/Wizard"
              onClick={() => setMenuOpen(false)}
              data-testid="nav-cta-start-free-mobile"
              style={{
                display: "block",
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: mkt.buttonBg,
                color: mkt.buttonText,
                fontSize: 15,
                fontWeight: 500,
                textTransform: "uppercase" as const,
                letterSpacing: "0.04em",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              START FREE
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
