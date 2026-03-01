import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import AnimatedLogo from "./AnimatedLogo";
import { mkt, colors, shadows, radius } from "@/theme/tokens";

const NAV_LINKS: { label: string; href: string; children?: { label: string; href: string }[] }[] = [
  { label: "Product", href: "/product" },
  { label: "Templates", href: "/templates" },
  { label: "Solutions", href: "/solutions/visibility" },
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
  children?: { label: string; href: string }[];
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
            borderRadius: 12,
            border: `1px solid ${mkt.border}`,
            boxShadow: shadows.md,
            padding: "6px",
            minWidth: 180,
            transition: "opacity 0.15s ease, transform 0.15s ease",
            zIndex: 300,
          }}
        >
          {children!.map(({ label: cl, href: ch }) => (
            <Link
              key={ch}
              href={ch}
              style={{
                display: "block",
                padding: "9px 14px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: mkt.textMuted,
                textDecoration: "none",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = mkt.surface;
                (e.currentTarget as HTMLElement).style.color = mkt.text;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = mkt.textMuted;
              }}
            >
              {cl}
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
  children?: { label: string; href: string }[];
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
            <div style={{ paddingBottom: 12 }}>
              {children!.map(({ label: cl, href: ch }) => (
                <Link
                  key={ch}
                  href={ch}
                  onClick={onClose}
                  style={{
                    display: "block",
                    padding: "10px 16px",
                    marginBottom: 4,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    color: mkt.textMuted,
                    textDecoration: "none",
                    background: mkt.surface,
                  }}
                >
                  {cl}
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
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const scrolled = useScrolled();
  usePageView(location);

  const isActive = (href: string) => location === href;

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
          zIndex: 200,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
          background: mkt.frost,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${colors.header.borderBottom}`,
          boxShadow: scrolled ? colors.header.scrollShadow : "none",
          transition: "box-shadow 0.25s ease",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            width: "100%",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            padding: "0 24px",
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
                    borderRadius: 9999,
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
      {isMobile && (
        <div
          data-testid="nav-mobile-menu"
          style={{
            position: "fixed",
            top: 64,
            left: 0,
            right: 0,
            background: mkt.bg,
            zIndex: 199,
            borderRadius: 0,
            boxShadow: menuOpen ? shadows.lg : "none",
            overflow: "hidden",
            maxHeight: menuOpen ? "80vh" : 0,
            transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s ease",
            overflowY: "auto",
            borderBottom: menuOpen ? `1px solid ${mkt.border}` : "none",
          }}
        >
          <div style={{ padding: "8px 24px 28px" }}>
            {NAV_LINKS.map(({ label, href, children }) => (
              <MobileNavItem
                key={href}
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
                marginTop: 20,
                padding: "12px",
                borderRadius: 9999,
                background: mkt.dark,
                color: mkt.onDark,
                fontSize: 15,
                fontWeight: 600,
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
