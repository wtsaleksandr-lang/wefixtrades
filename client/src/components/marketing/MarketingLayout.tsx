import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown, LayoutGrid, Route, Frame, FileText, BadgePercent } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import AnimatedLogo from "./AnimatedLogo";
import { mkt, colors, shadows, radius } from "@/theme/tokens";

type NavChild = {
  label: string;
  href: string;
  description?: string;
  icon?: React.ReactNode;
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

function NavItem({ label, href, children, isActive }: {
  label: string;
  href: string;
  children?: NavChild[];
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasDropdown = children && children.length > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", keyHandler); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {hasDropdown ? (
        <button
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 500,
            color: mkt.text,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "opacity 0.2s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.6";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
        >
          {label}
          <ChevronDown
            size={13}
            strokeWidth={1.5}
            style={{ transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)", opacity: 0.5 }}
          />
        </button>
      ) : (
        <Link
          href={href}
          data-testid={`nav-link-${label.toLowerCase()}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 500,
            color: mkt.text,
            background: "transparent",
            textDecoration: "none",
            transition: "opacity 0.2s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.6";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
        >
          {label}
        </Link>
      )}

      {hasDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "50%",
            transform: open ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-4px)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            background: mkt.bg,
            borderRadius: 16,
            border: `1px solid ${mkt.border}`,
            boxShadow: shadows.lg,
            padding: "8px",
            minWidth: 300,
            transition: "opacity 0.15s ease, transform 0.15s ease",
            zIndex: 300,
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
                padding: "10px 12px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                color: mkt.text,
                textDecoration: "none",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = mkt.surface;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {icon && (
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
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {icon}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: mkt.text, lineHeight: 1.2, marginBottom: 2 }}>
                  {cl}
                </div>
                {description && (
                  <div style={{ fontSize: 12, fontWeight: 400, color: mkt.textMuted, lineHeight: 1.35 }}>
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
    <div style={{ borderBottom: `1px solid ${mkt.border}` }}>
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
              padding: "16px 0",
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
          {expanded && (
            <div style={{ paddingBottom: 14 }}>
              {children!.map(({ label: cl, href: ch, description, icon }) => (
                <Link
                  key={ch + cl}
                  href={ch}
                  onClick={onClose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 14px",
                    marginBottom: 10,
                    borderRadius: 18,
                    textDecoration: "none",
                    background: "rgba(64,64,64,0.06)",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
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
          )}
        </>
      ) : (
        <Link
          href={href}
          onClick={onClose}
          data-testid={`nav-link-${label.toLowerCase()}-mobile`}
          style={{
            display: "block",
            padding: "16px 0",
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
          height: isMobile ? "auto" : 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "0" : "0 16px",
          background: isMobile ? mkt.surface : mkt.frost,
          backdropFilter: isMobile ? "none" : "blur(12px)",
          WebkitBackdropFilter: isMobile ? "none" : "blur(12px)",
          borderBottom: isMobile ? "none" : `1px solid ${colors.header.borderBottom}`,
          boxShadow: isMobile ? "none" : (scrolled ? colors.header.scrollShadow : "none"),
          transition: "box-shadow 0.25s ease",
        }}
      >
        <div
          ref={navCardRef}
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            ...(isMobile
              ? {
                  width: "calc(100% - 20px)",
                  margin: "8px 10px 0",
                  borderRadius: 24,
                  padding: "0 16px",
                  background: "rgba(255,255,255,0.58)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                }
              : {
                  width: "100%",
                  padding: "0 24px",
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
                <NavItem
                  key={href}
                  label={label}
                  href={href}
                  children={children}
                  isActive={isActive(href)}
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
                {menuOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
              </button>
            )}
          </div>
        </div>
      </nav>
      {isMobile && menuOpen && (
        <div
          data-testid="nav-mobile-overlay"
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 240,
            background: "rgba(0,0,0,0.08)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              top: menuTop,
              zIndex: 290,
              borderRadius: 28,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
              overflow: "hidden",
              maxHeight: "72vh",
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
