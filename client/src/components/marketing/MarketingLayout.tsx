import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import AnimatedLogo from "./AnimatedLogo";

const T = {
  bg: "#FFFFFF",
  surface: "#F6F7F8",
  surface2: "#F1F3F4",
  text: "#0B0D0E",
  textMuted: "#5F6368",
  textFaint: "#8A9096",
  border: "#E6E8EB",
  accent: "#16A34A",
  accentHover: "#15803D",
  shadowSoft: "0 10px 30px rgba(0,0,0,0.06)",
  shadowPill: "0 6px 20px rgba(0,0,0,0.08)",
  rXl: 28,
  rLg: 18,
  rMd: 14,
};

const NAV_LINKS: { label: string; href: string; children?: { label: string; href: string }[] }[] = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Templates", href: "/templates" },
  { label: "Services", href: "/services" },
  { label: "Demo", href: "/demo" },
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

  const isHighlighted = isActive || open;

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
            padding: "7px 14px",
            borderRadius: 9999,
            fontSize: 14,
            fontWeight: 500,
            color: T.text,
            background: isHighlighted ? T.surface2 : "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 0.15s ease, opacity 0.15s ease",
            whiteSpace: "nowrap",
            opacity: isHighlighted ? 1 : 0.85,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            if (!isHighlighted) (e.currentTarget as HTMLElement).style.opacity = "0.85";
          }}
        >
          {label}
          <ChevronDown
            size={14}
            style={{ transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      ) : (
        <Link
          href={href}
          data-testid={`nav-link-${label.toLowerCase()}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "7px 14px",
            borderRadius: 9999,
            fontSize: 14,
            fontWeight: 500,
            color: T.text,
            background: isActive ? T.surface2 : "transparent",
            textDecoration: "none",
            transition: "background 0.15s ease, opacity 0.15s ease",
            whiteSpace: "nowrap",
            opacity: isActive ? 1 : 0.85,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            if (!isActive) (e.currentTarget as HTMLElement).style.opacity = "0.85";
          }}
        >
          {label}
        </Link>
      )}

      {hasDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            left: "50%",
            transform: open ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-6px)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            background: T.bg,
            borderRadius: T.rLg,
            border: `1px solid ${T.border}`,
            boxShadow: T.shadowSoft,
            padding: "8px",
            minWidth: 200,
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
                padding: "10px 16px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: T.textMuted,
                textDecoration: "none",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = T.surface;
                (e.currentTarget as HTMLElement).style.color = T.text;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = T.textMuted;
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
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
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
              fontSize: 18,
              fontWeight: 600,
              color: isActive || expanded ? T.text : T.textMuted,
              textAlign: "left",
            }}
          >
            {label}
            <ChevronDown
              size={18}
              style={{ transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", color: T.textFaint }}
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
                    borderRadius: 9999,
                    fontSize: 15,
                    fontWeight: 500,
                    color: T.textMuted,
                    textDecoration: "none",
                    background: T.surface,
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
            fontSize: 18,
            fontWeight: 600,
            color: isActive ? T.text : T.textMuted,
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

  const navHeight = scrolled ? 56 : 72;
  const isActive = (href: string) => location === href;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
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
          height: navHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          padding: isMobile ? "0 12px" : "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1160,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            background: T.surface,
            borderRadius: T.rXl,
            padding: isMobile ? "8px 16px" : "8px 10px 8px 20px",
            boxShadow: scrolled ? T.shadowPill : "0 4px 16px rgba(0,0,0,0.04)",
            transition: "box-shadow 0.3s ease",
          }}
        >
          <AnimatedLogo />

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

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <Link
                  href="/Dashboard"
                  data-testid="nav-login"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: T.text,
                    textDecoration: "none",
                    padding: "7px 12px",
                    borderRadius: 9999,
                    transition: "opacity 0.15s ease",
                    opacity: 0.75,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
                >
                  Log in
                </Link>
                <Link
                  href="/Wizard"
                  className="mkt-btn-primary"
                  data-testid="nav-cta-start-free"
                  style={{
                    padding: "9px 20px",
                    borderRadius: T.rMd,
                    background: T.accent,
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                  }}
                >
                  Try for Free
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
                  color: T.text,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
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
            top: navHeight,
            left: 0,
            right: 0,
            background: T.bg,
            zIndex: 199,
            borderBottom: menuOpen ? `1px solid ${T.border}` : "none",
            boxShadow: menuOpen ? T.shadowSoft : "none",
            overflow: "hidden",
            maxHeight: menuOpen ? "80vh" : 0,
            transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s ease",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "8px 28px 32px" }}>
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
                marginTop: 24,
                padding: "15px",
                borderRadius: T.rMd,
                background: T.accent,
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Try for Free
            </Link>
          </div>
        </div>
      )}

      <div style={{ height: navHeight, flexShrink: 0, transition: "height 0.3s ease" }} />

      <main style={{ flex: 1 }}>{children}</main>

      <footer data-testid="footer-marketing" style={{ background: "#0B1F3A", color: "#FFFFFF" }}>
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
                  fontWeight: 800,
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                QuickQuote<span style={{ color: "#40916C" }}>Pro</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.7,
                  maxWidth: 280,
                  margin: 0,
                }}
              >
                Instant estimates. Smart booking. AI employees — built for trades businesses.
              </p>
              <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
                {["Plumbing", "Roofing", "Cleaning", "Electrical"].map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.35)",
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
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
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
                    color: "rgba(255,255,255,0.65)",
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                >
                  {l}
                </Link>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 18,
                }}
              >
                Company
              </div>
              {[
                { l: "Services", h: "/services" },
                { l: "Bundles", h: "/bundles" },
                { l: "Contact", h: "/contact" },
              ].map(({ l, h }) => (
                <Link
                  key={h}
                  href={h}
                  style={{
                    display: "block",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.65)",
                    textDecoration: "none",
                    marginBottom: 11,
                  }}
                >
                  {l}
                </Link>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
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
                    color: "rgba(255,255,255,0.65)",
                    textDecoration: "none",
                    marginBottom: 11,
                  }}
                >
                  {l}
                </Link>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
              © 2026 WeFixTrades Pty Ltd. All rights reserved.
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
              QuickQuotePro — Estimates, Booking & AI for Trades
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
