import { useState, useEffect, useRef, Fragment, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown, Workflow, MessageSquare, PhoneCall, Layers, MapPinned, Wrench, RefreshCcw, ShieldCheck, Layout, Rocket, Calculator, FileText, Code2, Share2, Sparkles, Search, Zap, Home, Fan } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import { useLenis } from "@/hooks/useLenis";
import AnimatedLogo from "./AnimatedLogo";
import { mkt, colors } from "@/theme/tokens";
import { FOOTER_LINKS } from "@/site/siteMap";

const DEBUG_DROPDOWN = false;

type NavChild = {
  label: string;
  href: string;
  description?: string;
  icon?: ReactNode;
};

const DESKTOP_HEADER = {
  navHeight: 72,
  cardHeight: 52,
};


const NAV_LINKS: { label: string; href: string; children?: NavChild[] }[] = [
  {
    label: "Products",
    href: "/products/tradeline",
    children: [
      { label: "TradeLine\u2122 (Overview)", href: "/products/tradeline", description: "24/7 lead handling ecosystem.", icon: <Workflow size={28} strokeWidth={1.6} /> },
      { label: "AI ChatLine\u2122", href: "/products/ai-chatline", description: "Website + SMS chat handling.", icon: <MessageSquare size={28} strokeWidth={1.6} /> },
      { label: "AI CallLine\u2122", href: "/products/ai-callline", description: "24/7 voice answering.", icon: <PhoneCall size={28} strokeWidth={1.6} /> },
      { label: "TradeLine\u2122 Complete", href: "/products/tradeline-complete", description: "Chat + Voice + DMs.", icon: <Layers size={28} strokeWidth={1.6} /> },
      { label: "QuoteQuick Pro\u2122", href: "/products/quotequick", description: "Instant quotes on your site.", icon: <Calculator size={28} strokeWidth={1.6} /> },
      { label: "MapGuard\u2122", href: "/products/mapguard", description: "Google Maps optimization.", icon: <MapPinned size={28} strokeWidth={1.6} /> },
      { label: "ReputationShield\u2122", href: "/products/reputationshield", description: "Reviews + reputation.", icon: <ShieldCheck size={28} strokeWidth={1.6} /> },
      { label: "WebBoost\u2122", href: "/products/webboost", description: "Speed + SEO optimization.", icon: <Rocket size={28} strokeWidth={1.6} /> },
      { label: "SocialSync\u2122", href: "/products/socialsync", description: "Social media automation.", icon: <Share2 size={28} strokeWidth={1.6} /> },
      { label: "SiteLaunch\u2122", href: "/products/sitelaunch", description: "High-converting websites.", icon: <Layout size={28} strokeWidth={1.6} /> },
      { label: "Fix & Optimize\u2122", href: "/products/fix-and-optimize", description: "Quick improvements package.", icon: <Sparkles size={28} strokeWidth={1.6} /> },
    ],
  },
  {
    label: "Solutions",
    href: "/solutions/for-plumbers",
    children: [
      { label: "For Plumbers", href: "/solutions/for-plumbers", description: "Win more plumbing leads.", icon: <Wrench size={28} strokeWidth={1.6} /> },
      { label: "For HVAC", href: "/solutions/for-hvac", description: "Book HVAC service calls.", icon: <Fan size={28} strokeWidth={1.6} /> },
      { label: "For Electricians", href: "/solutions/for-electricians", description: "Automate quotes & follow-ups.", icon: <Zap size={28} strokeWidth={1.6} /> },
      { label: "For Roofers", href: "/solutions/for-roofers", description: "Boost visibility & conversions.", icon: <Home size={28} strokeWidth={1.6} /> },
      { label: "For Cleaners", href: "/solutions/for-cleaners", description: "Get booked on autopilot.", icon: <Sparkles size={28} strokeWidth={1.6} /> },
    ],
  },
  { label: "Templates", href: "/templates" },
  { label: "Plans", href: "/plans" },
  {
    label: "Resources",
    href: "/demos",
    children: [
      { label: "Demo Center", href: "/demos", description: "Try live demos.", icon: <Layout size={28} strokeWidth={1.6} /> },
      { label: "Docs", href: "/docs", description: "Guides & references.", icon: <FileText size={28} strokeWidth={1.6} /> },
      { label: "Blog", href: "/blog", description: "Tips & updates.", icon: <FileText size={28} strokeWidth={1.6} /> },
      { label: "Case Studies", href: "/case-studies", description: "Customer success stories.", icon: <ShieldCheck size={28} strokeWidth={1.6} /> },
    ],
  },
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

function NavItemDesktopV2({
  label,
  href,
  children,
  isActive,
  headerRef,
}: {
  label: string;
  href: string;
  children?: NavChild[];
  isActive: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDropdown = !!(children && children.length > 0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const openDropdown = () => {
    if (!hasDropdown) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
  };

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const measure = () => {
    const el = headerRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
  };

  useEffect(() => {
    if (!open) return;
    measure();

    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onScroll = () => setOpen(false);
    const onResize = () => measure();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const topItemBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
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
    el.style.background = "rgba(255,255,255,0.06)";
    el.style.borderColor = "rgba(255,255,255,0.12)";
  };

  const topHoverOff = (el: HTMLElement) => {
    el.style.background = "transparent";
    el.style.borderColor = "transparent";
  };

  const dropdownNode =
    hasDropdown && open && rect
      ? createPortal(
          <Fragment>
            {/* Page blur overlay */}
            <div
              style={{
                position: "fixed",
                top: rect.bottom,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9998,
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                background: "rgba(0,0,0,0.28)",
                animation: "mktDropdownOverlayIn 0.2s ease-out forwards",
              }}
              onClick={() => setOpen(false)}
            />
            <div
            className="mkt-dropdown-tray"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              left: rect.left + rect.width / 2,
              top: rect.bottom + 6,
              width: Math.min(1080, rect.width),
              maxWidth: "calc(100vw - 24px)",
              // translateX(-50%) centers the panel on the nav bar's midpoint.
              // Kept here in inline style so it's always applied, even before
              // the CSS entrance animation starts.
              transform: "translateX(-50%)",

              padding: 10,
              zIndex: 9999,

              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridAutoFlow: "row",
              gap: 8,

              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              outline: DEBUG_DROPDOWN ? "3px solid rgba(0,120,255,0.85)" : "none",
            }}
          >
            {children!.map(({ label: cl, href: ch, description, icon }) => (
              <Link
                key={ch + cl}
                href={ch}
                className="mkt-menu-card"
                onClick={() => setOpen(false)}
              >
                {/* Icon badge */}
                <div
                  className="mkt-menu-card-icon"
                  style={{
                    color: mkt.accent,
                    background: mkt.accentTint,
                    border: `1px solid rgba(102,232,250,0.18)`,
                  }}
                  aria-hidden
                >
                  {icon ?? null}
                </div>

                {/* Text */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: mkt.text,
                      lineHeight: 1.2,
                      marginBottom: 3,
                    }}
                  >
                    {cl}
                  </div>
                  {description && (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 450,
                        color: mkt.textMuted,
                        lineHeight: 1.35,
                      }}
                    >
                      {description}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
          </Fragment>,
          document.body
        )
      : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {hasDropdown ? (
        <button
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          style={topItemBase}
          onMouseEnter={(e) => { topHoverOn(e.currentTarget as HTMLElement); openDropdown(); }}
          onMouseLeave={(e) => { topHoverOff(e.currentTarget as HTMLElement); scheduleClose(); }}
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

      {dropdownNode}
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
        marginBottom: 4,
        padding: "6px 10px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${mkt.border}`,
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
              padding: "10px 0px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
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
              paddingBottom: expanded ? 10 : 0,
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
                  gap: 12,
                  padding: "10px 10px",
                  marginBottom: 6,
                  borderRadius: 14,
                  textDecoration: "none",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${mkt.border}`,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: mkt.accent,
                    background: mkt.accentTint,
                    border: "1px solid rgba(102,232,250,0.15)",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {icon ?? <span />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
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
                      fontSize: 12,
                      fontWeight: 450,
                      color: mkt.textMuted,
                      lineHeight: 1.25,
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
            padding: "10px 0px",
            fontSize: 15,
            fontWeight: 600,
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
  useLenis();
  const [menuOpen, setMenuOpen] = useState(false);
  const navCardRef = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState<number>(92);

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
      setMenuTop(Math.round(r.bottom + 3));
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [menuOpen, isMobile]);

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
        background: mkt.bg,
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
          padding: isMobile ? "0" : "0 10px 0",
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
            maxWidth: 1600,
            outline: DEBUG_DROPDOWN ? "3px solid rgba(255,0,0,0.8)" : "none",
            width: "calc(100% - 24px)",
            margin: "8px 12px 0",
            height: isMobile ? 64 : DESKTOP_HEADER.cardHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            ...(isMobile
              ? {
                  width: "calc(100% - 20px)",
                  margin: "6px 10px 0",
                  borderRadius: 20,
                  padding: "0 16px",
                  background: "rgba(34,40,42,0.55)",
                  backdropFilter: "blur(12px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                  willChange: "backdrop-filter",
                  transform: "translateZ(0)",
                  border: `1px solid ${mkt.border}`,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
                }
              : {
                  width: "calc(100% - 32px)",
                  maxWidth: 1440,
                  margin: "3px 16px 0",
                  borderRadius: 18,
                  padding: "0 20px",
                  background: "rgba(34,40,42,0.55)",
                  backdropFilter: "blur(12px) saturate(1.3)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.3)",
                  border: `1px solid ${mkt.border}`,
                  boxShadow: scrolled ? "0 14px 38px rgba(0,0,0,0.30)" : "0 12px 30px rgba(0,0,0,0.20)",
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
                <NavItemDesktopV2
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

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <Link
                  href="/login"
                  data-testid="nav-login"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.text,
                    textDecoration: "none",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = mkt.accent)}
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
                    borderRadius: 10,
                    background: mkt.buttonBg,
                    color: mkt.buttonText,
                    fontSize: 13,
                    fontWeight: 500,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.04em",
                    textDecoration: "none",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    transition: "background 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = mkt.buttonHoverBg; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = mkt.buttonBg; }}
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
            background: "rgba(0,0,0,0.45)",
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
            background: "rgba(34,40,42,0.88)",
            backdropFilter: "blur(22px) saturate(1.6)",
            WebkitBackdropFilter: "blur(22px) saturate(1.6)",
            border: `1px solid ${mkt.border}`,
            boxShadow: menuOpen
              ? "0 20px 36px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)"
              : "0 10px 20px rgba(0,0,0,0.25)",
            overflow: "hidden",
            maxHeight: "78vh",
            transform: menuOpen ? "translateY(0px) scale(1)" : "translateY(-12px) scale(0.98)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition:
              "transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, box-shadow 0.25s ease",
          }}
        >
          <div style={{ padding: "10px 16px 14px", overflowY: "auto", maxHeight: "78vh" }}>
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
      <div style={{ height: 24, flexShrink: 0 }} />
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
              gridTemplateColumns: isMobile ? "1fr 1fr" : "2.5fr 1fr 1fr 1fr 1fr",
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
                We<span style={{ color: mkt.accent }}>Fix</span>Trades
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
                {["Plumbing", "Roofing", "Cleaning", "Electrical", "HVAC"].map((t) => (
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

            {(Object.keys(FOOTER_LINKS) as Array<keyof typeof FOOTER_LINKS>).map((section) => (
              <div key={section}>
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
                  {section}
                </div>
                {FOOTER_LINKS[section].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 500,
                      color: mkt.onDarkMuted,
                      textDecoration: "none",
                      marginBottom: 11,
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.accent; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkMuted; }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: mkt.onDarkFaint }}>
                © {new Date().getFullYear()} WeFixTrades
              </span>
              <span style={{ fontSize: 12, color: mkt.onDarkFaint, opacity: 0.7 }}>
                Built for service businesses
              </span>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <Link href="/privacy" style={{ fontSize: 13, color: mkt.onDarkFaint, textDecoration: "none" }}>Privacy</Link>
              <Link href="/terms" style={{ fontSize: 13, color: mkt.onDarkFaint, textDecoration: "none" }}>Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
