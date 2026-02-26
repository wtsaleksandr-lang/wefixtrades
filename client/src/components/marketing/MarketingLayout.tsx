import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import AnimatedLogo from "./AnimatedLogo";

const T = {
  bg: "#FFFFFF",
  surface: "#F7F7F6",
  surface2: "#F3F3F2",
  text: "#111111",
  textMuted: "#6B6B6B",
  textFaint: "#999999",
  border: "#E5E5E3",
  accent: "#33956A",
  accentHover: "#2B7D58",
  shadowSoft: "0 10px 30px rgba(0,0,0,0.06)",
  shadowPill: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
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
            color: T.text,
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
            color: T.text,
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
            background: T.bg,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            boxShadow: T.shadowSoft,
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
              fontSize: 16,
              fontWeight: 500,
              color: T.text,
              textAlign: "left",
            }}
          >
            {label}
            <ChevronDown
              size={16}
              strokeWidth={1.5}
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
                    borderRadius: 8,
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
            fontSize: 16,
            fontWeight: 500,
            color: T.text,
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
        fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif",
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
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px 0",
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
            background: "#F2F2F0",
            borderRadius: 0,
            padding: "0 24px",
            transition: "box-shadow 0.25s ease",
          }}
          className="bg-[#ebebeb]">
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
                    color: T.text,
                    textDecoration: "none",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = T.textMuted)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = T.text)}
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
                    background: T.accent,
                    color: "#FFFFFF",
                    fontSize: 13,
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
            top: 60,
            left: 16,
            right: 16,
            background: "#F2F2F0",
            zIndex: 199,
            borderRadius: menuOpen ? "0 0 12px 12px" : 0,
            boxShadow: menuOpen ? "0 8px 32px rgba(0,0,0,0.08)" : "none",
            overflow: "hidden",
            maxHeight: menuOpen ? "80vh" : 0,
            transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s ease",
            overflowY: "auto",
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
                background: T.accent,
                color: "#FFFFFF",
                fontSize: 15,
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
      <div style={{ height: 68, flexShrink: 0 }} />
      <main style={{ flex: 1 }}>{children}</main>
      <footer data-testid="footer-marketing" style={{ background: "#1A1A1A", color: "#FFFFFF" }}>
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
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                QuickQuote<span style={{ color: "#5E9485" }}>Pro</span>
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
                  fontSize: 13,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.4)",
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
                    color: "rgba(255,255,255,0.6)",
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
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
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
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
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.6)",
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
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
                  color: "rgba(255,255,255,0.4)",
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
                    color: "rgba(255,255,255,0.6)",
                    textDecoration: "none",
                    marginBottom: 11,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
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
