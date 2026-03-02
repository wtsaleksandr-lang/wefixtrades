import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown, LayoutGrid, Route, Frame, FileText, BadgePercent } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import AnimatedLogo from "./AnimatedLogo";
import { mkt, colors } from "@/theme/tokens";

type NavChild = {
  label: string;
  href: string;
  description?: string;
  icon?: ReactNode;
};

const DESKTOP_HEADER = {
  navHeight: 72,
  cardHeight: 52,
  cardRadius: 18,
  cardBg: "rgba(255,255,255,0.78)",
  cardBorder: "1px solid rgba(0,0,0,0.06)",
  cardShadow: "0 14px 38px rgba(0,0,0,0.10)",
  navPadding: "6px 12px 0",
};


const NAV_LINKS: { label: string; href: string; children?: NavChild[] }[] = [
  {
    label: "Product",
    href: "/product",
    children: [
      {
        label: "QuickQuotePro",
        href: "/product",
        description: "Instant estimates on your site.",
        icon: <LayoutGrid size={28} strokeWidth={1.6} />,
      },
      {
        label: "MapGuard",
        href: "/product",
        description: "Google Maps optimization & visibility.",
        icon: <Route size={28} strokeWidth={1.6} />,
      },
      {
        label: "SiteLaunch",
        href: "/product",
        description: "High-converting website builds.",
        icon: <Frame size={28} strokeWidth={1.6} />,
      },
      {
        label: "ReputationShield",
        href: "/product",
        description: "Reviews + reputation automation.",
        icon: <BadgePercent size={28} strokeWidth={1.6} />,
      },
      {
        label: "Docs",
        href: "/docs",
        description: "Setup guides & integrations.",
        icon: <FileText size={28} strokeWidth={1.6} />,
      },
    ],
  },
  { label: "Templates", href: "/templates" },
  { label: "Solutions", href: "/solutions" },
  { label: "Docs", href: "/docs" },
];

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

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

function NavItemDesktop({
  label,
  href,
  children,
  isActive,
  dropdown,
}: {
  label: string;
  href: string;
  children?: NavChild[];
  isActive: boolean;
  dropdown: { left: number; width: number; top: number };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasDropdown = !!(children && children.length > 0);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const topItemBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 500,
    color: mkt.text,
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.18s ease, border-color 0.18s ease",
  };

  const topHoverOn = (el: HTMLElement) => {
    el.style.background = "rgba(15,59,53,0.06)";
    el.style.borderColor = "rgba(15,59,53,0.16)";
  };

  const topHoverOff = (el: HTMLElement) => {
    el.style.background = "transparent";
    el.style.borderColor = "transparent";
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {hasDropdown ? (
        <button
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          style={topItemBase}
          onMouseEnter={(e) => topHoverOn(e.currentTarget as HTMLElement)}
          onMouseLeave={(e) => topHoverOff(e.currentTarget as HTMLElement)}
        >
          {label}
          <ChevronDown
            size={13}
            strokeWidth={1.5}
            style={{
              transition: "transform 0.2s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              opacity: 0.55,
            }}
          />
        </button>
      ) : (
        <Link
          href={href}
          data-testid={`nav-link-${label.toLowerCase()}`}
          style={{ ...topItemBase, textDecoration: "none" }}
          onMouseEnter={(e) => topHoverOn(e.currentTarget as HTMLElement)}
          onMouseLeave={(e) => topHoverOff(e.currentTarget as HTMLElement)}
        >
          {label}
        </Link>
      )}

      {hasDropdown && (
        <div
          style={{
            position: "fixed",
            top: dropdown.top,
            left: dropdown.left,
            width: dropdown.width,

            transform: open ? "translateY(0)" : "translateY(-6px)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",

            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(18px) saturate(1.25)",
            WebkitBackdropFilter: "blur(18px) saturate(1.25)",
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 18px 46px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.50)",

            padding: "4px",
            zIndex: 400,

            display: "grid",
            gridAutoFlow: "column",
            gridTemplateRows: "repeat(3, auto)",
            gridAutoColumns: "minmax(260px, 1fr)",
            gap: 6,

            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        >
          {children!.map(({ label: cl, href: ch, description, icon }) => (
            <Link
              key={ch + cl}
              href={ch}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 10px",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 500,
                color: mkt.text,
                textDecoration: "none",
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.08)",
                transition: "transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.98)";
                el.style.boxShadow = "0 10px 24px rgba(0,0,0,0.10)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.95)";
                el.style.boxShadow = "none";
                el.style.transform = "translateY(0px)";
              }}
            >
              {icon && (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: mkt.accent,
                    background: "rgba(15,59,53,0.10)",
                    border: "1px solid rgba(15,59,53,0.16)",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {icon}
                </div>
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: mkt.text, lineHeight: 1.2, marginBottom: 2 }}>
                  {cl}
                </div>
                {description && (
                  <div style={{ fontSize: 12, fontWeight: 450, color: mkt.textMuted, lineHeight: 1.35 }}>
                    {description}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNavItem({ label, href, children, isActive, onClose }: {
  label: string;
  href: string;
  children?: NavChild[];
  isActive: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDropdown = children && children.length > 0;

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 18,
        background: "rgba(255,255,255,0.62)",
        border: "1px solid rgba(255,255,255,0.34)",
      }}
    >
      {hasDropdown ? (
        <>
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "12px 2px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 500,
              color: mkt.text,
              textAlign: "left",
            }}
          >
            {label}
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              style={{ transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", color: mkt.textMuted }}
            />
          </button>
          <div
            style={{
              paddingBottom: expanded ? 14 : 0,
              maxHeight: expanded ? 800 : 0,
              overflow: "hidden",
              transition: "max-height 0.28s cubic-bezier(0.22,1,0.36,1), padding 0.2s ease",
            }}
          >
            {children!.map(({ label: cl, href: ch, description, icon }) => (
              <Link
                key={ch + cl}
                href={ch}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 12px",
                  marginBottom: 8,
                  borderRadius: 16,
                  textDecoration: "none",
                  background: "rgba(255,255,255,0.68)",
                  border: "1px solid rgba(255,255,255,0.34)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0C67FF",
                    background: "rgba(12,103,255,0.10)",
                    border: "1px solid rgba(12,103,255,0.18)",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {icon ?? <span />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 650,
                      color: mkt.text,
                      lineHeight: 1.15,
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cl}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 450,
                      color: mkt.textMuted,
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {description ?? ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <Link
          href={href}
          onClick={onClose}
          data-testid={`nav-link-${label.toLowerCase()}-mobile`}
          style={{
            display: "block",
            padding: "12px 2px",
            fontSize: 16,
            fontWeight: 500,
            color: mkt.text,
            textDecoration: "none",
          }}
        >
          {label}
        </Link>
      )}
    </div>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navCardRef = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState<number>(92);

  const [desktopDropdown, setDesktopDropdown] = useState<{ left: number; width: number; top: number }>({
    left: 0,
    width: 0,
    top: 0,
  });
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const scrolled = useScrolled();
  usePageView(location);

  const isActive = (href: string) => location === href;

  useEffect(() => {
    if (!isMobile) return;
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, isMobile]);

  useEffect(() => {
    if (!isMobile || !menuOpen) return;

    const compute = () => {
      const el = navCardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuTop(Math.round(r.bottom + 6));
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [menuOpen, isMobile]);

  useEffect(() => {
    if (isMobile) return;

    const compute = () => {
      const el = navCardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDesktopDropdown({
        left: r.left,
        width: r.width,
        top: r.bottom + 2,
      });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, { passive: true });
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [menuOpen]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (window.location.hash) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [location]);

  return (
    <div
      className="mkt-layout"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
      }}
    >
      <nav
        className={`mkt-nav${scrolled ? " scrolled" : ""}`}
        data-testid="nav-marketing"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 300,
          height: isMobile ? "auto" : DESKTOP_HEADER.navHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "0" : "6px 12px 0",
          background: "transparent",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          borderBottom: "none",
          boxShadow: "none",
        }}
      >
        <div
          ref={navCardRef}
          style={{
            maxWidth: 1680,
            margin: "0 auto",
            height: isMobile ? 64 : DESKTOP_HEADER.cardHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            ...(isMobile
              ? {
                  width: "calc(100% - 20px)",
                  margin: "8px 10px 0",
                  borderRadius: 20,
                  padding: "0 16px",
                  background: "rgba(255,255,255,0.42)",
                  backdropFilter: "blur(20px) saturate(1.6)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.6)",
                  willChange: "backdrop-filter",
                  transform: "translateZ(0)",
                  border: "1px solid rgba(255,255,255,0.30)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                }
              : {
                  width: "calc(100% - 32px)",
                  maxWidth: 1440,
                  margin: "10px 16px 0",
                  borderRadius: 18,
                  padding: "0 20px",
                  background: "rgba(255,255,255,0.78)",
                  backdropFilter: "blur(18px) saturate(1.3)",
                  WebkitBackdropFilter: "blur(18px) saturate(1.3)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  boxShadow: scrolled ? "0 14px 38px rgba(0,0,0,0.12)" : "0 12px 30px rgba(0,0,0,0.10)",
                }),
          }}
        >
          <AnimatedLogo />

          {!isMobile && (
            <nav
              aria-label="Main navigation"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flex: "0 1 auto",
              }}
            >
              {NAV_LINKS.map(({ label, href, children }) => (
                <NavItemDesktop
                  key={href}
                  label={label}
                  href={href}
                  children={children}
                  isActive={isActive(href)}
                  dropdown={desktopDropdown}
                />
              ))}
            </nav>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <Link
                  href="/Dashboard"
                  data-testid="nav-login"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.text,
                    textDecoration: "none",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = mkt.textMuted)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = mkt.text)}
                >
                  Login
                </Link>
                <Link
                  href="/Wizard"
                  className="mkt-btn-primary"
                  data-testid="nav-cta-start-free"
                  style={{
                    padding: "9px 20px",
                    borderRadius: 14,
                    background: mkt.dark,
                    color: mkt.onDark,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    transition: "background 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = mkt.darkHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = mkt.dark; }}
                >
                  Try Free
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
                    transform: menuOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.25s cubic-bezier(0.22,1,0.36,1)",
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
      </nav>
      {isMobile && (
        <div
          aria-hidden="true"
          data-testid="nav-mobile-overlay"
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 290,
            background: "rgba(0,0,0,0.20)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        />
      )}
      {isMobile && (
        <div
          onClick={(e) => e.stopPropagation()}
          data-testid="nav-mobile-menu"
          style={{
            position: "fixed",
            left: 10,
            right: 10,
            top: menuTop,
            zIndex: 300,
            borderRadius: 22,
            background: "rgba(255,255,255,0.52)",
            backdropFilter: "blur(22px) saturate(1.6)",
            WebkitBackdropFilter: "blur(22px) saturate(1.6)",
            border: "1px solid rgba(255,255,255,0.34)",
            boxShadow: menuOpen
              ? "0 22px 60px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.35)"
              : "0 12px 30px rgba(0,0,0,0.08)",
            overflow: "hidden",
            maxHeight: "72vh",
            transform: menuOpen ? "translateY(0px) scale(1)" : "translateY(-12px) scale(0.98)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition:
              "transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, box-shadow 0.25s ease",
          }}
        >
          <div style={{ padding: "10px 18px 18px", overflowY: "auto", maxHeight: "72vh" }}>
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
                marginTop: 18,
                padding: "14px 16px",
                borderRadius: 999,
                background: "#102126",
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 650,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Try Free
            </Link>
          </div>
        </div>
      )}
      <div style={{ height: 72, flexShrink: 0 }} />
      <main style={{ flex: 1 }}>{children}</main>
      <footer data-testid="footer-marketing" style={{ background: colors.brand.dark, color: colors.brand.onDark }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: isMobile ? "56px 24px 36px" : "72px 48px 44px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "2.5fr 1fr 1fr 1fr",
              gap: isMobile ? 32 : 48,
              marginBottom: 56,
            }}
          >
            <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: colors.brand.onDark,
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                QuickQuote<span style={{ color: mkt.accent }}>Pro</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: mkt.onDarkMuted,
                  lineHeight: 1.7,
                  maxWidth: 280,
                  margin: 0,
                }}
              >
                Instant estimates. Smart booking. 24/7 assistants — built for trades businesses.
              </p>
              <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
                {["Plumbing", "Roofing", "Cleaning", "Electrical"].map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: mkt.onDarkFaint,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.onDarkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 18,
                }}
              >
                Product
              </div>
              {[
                { l: "Overview", h: "/product" },
                { l: "Pricing", h: "/pricing" },
                { l: "Templates", h: "/templates" },
                { l: "Demo", h: "/demo" },
                { l: "Docs", h: "/docs" },
              ].map(({ l, h }) => (
                <Link
                  key={h}
                  href={h}
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.onDarkMuted,
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkMuted; }}
                >
                  {l}
                </Link>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.onDarkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 18,
                }}
              >
                Company
              </div>
              {[
                { l: "Solutions", h: "/solutions/visibility" },
                { l: "Contact", h: "/contact" },
              ].map(({ l, h }) => (
                <Link
                  key={h}
                  href={h}
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.onDarkMuted,
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkMuted; }}
                >
                  {l}
                </Link>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.onDarkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 18,
                }}
              >
                Legal
              </div>
              {[
                { l: "Privacy Policy", h: "/privacy" },
                { l: "Terms of Service", h: "/terms" },
              ].map(({ l, h }) => (
                <Link
                  key={h}
                  href={h}
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.onDarkMuted,
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkMuted; }}
                >
                  {l}
                </Link>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: `1px solid ${mkt.onDarkBorder}`,
              paddingTop: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: mkt.onDarkFaint }}>
              © 2026 WeFixTrades Pty Ltd. All rights reserved.
            </span>
            <span style={{ fontSize: 13, color: mkt.onDarkFaint }}>
              QuickQuotePro — Estimates, Booking & Automations for Trades
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
