import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";

const NAV_LINKS = [
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
      {/* Fixed Navbar */}
      <nav
        className={`mkt-nav${scrolled ? " scrolled" : ""}`}
        data-testid="nav-marketing"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: "#FFFFFF",
          borderBottom: scrolled ? "1px solid #E2E8F0" : "1px solid transparent",
          height: navHeight,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 28px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, lineHeight: 1 }}>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "#0F172A",
                  letterSpacing: "-0.02em",
                }}
              >
                QuickQuote
                <span style={{ color: "#2D6A4F" }}>Pro</span>
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#94A3B8",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}
              >
                by WeFixTrades
              </span>
            </div>
          </Link>

          {/* Center Nav Links */}
          {!isMobile && (
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flex: 1,
                justifyContent: "center",
              }}
            >
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  data-testid={`nav-link-${label.toLowerCase()}`}
                  style={{
                    padding: "7px 13px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: isActive(href) ? 600 : 500,
                    color: isActive(href) ? "#2D6A4F" : "#475569",
                    background: isActive(href) ? "#F0F7F4" : "transparent",
                    textDecoration: "none",
                    transition: "background 0.15s ease, color 0.15s ease",
                    whiteSpace: "nowrap" as const,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive(href)) {
                      (e.target as HTMLElement).style.background = "#F8FAFC";
                      (e.target as HTMLElement).style.color = "#0F172A";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive(href)) {
                      (e.target as HTMLElement).style.background = "transparent";
                      (e.target as HTMLElement).style.color = "#475569";
                    }
                  }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <Link
                  href="/Dashboard"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#475569",
                    textDecoration: "none",
                    padding: "7px 12px",
                  }}
                >
                  Log in
                </Link>
                <Link
                  href="/Wizard"
                  className="mkt-btn-primary"
                  data-testid="nav-cta-start-free"
                  style={{
                    padding: "9px 20px",
                    borderRadius: 9,
                    background: "#2D6A4F",
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Start Free
                </Link>
              </>
            )}
            {isMobile && (
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Toggle menu"
                data-testid="nav-hamburger"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 8,
                  borderRadius: 8,
                  color: "#0F172A",
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

      {/* Mobile full-screen menu */}
      {isMobile && menuOpen && (
        <div
          data-testid="nav-mobile-menu"
          style={{
            position: "fixed",
            top: navHeight,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#FFFFFF",
            zIndex: 199,
            padding: "24px 28px 40px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: "block",
                padding: "16px 0",
                fontSize: 18,
                fontWeight: 600,
                color: isActive(href) ? "#2D6A4F" : "#0F172A",
                textDecoration: "none",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/Wizard"
            onClick={() => setMenuOpen(false)}
            data-testid="nav-cta-start-free"
            style={{
              display: "block",
              marginTop: 28,
              padding: "15px",
              borderRadius: 10,
              background: "#2D6A4F",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Start Free
          </Link>
        </div>
      )}

      {/* Spacer for fixed nav */}
      <div style={{ height: navHeight, flexShrink: 0, transition: "height 0.3s ease" }} />

      <main style={{ flex: 1 }}>{children}</main>

      {/* Footer */}
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
            {/* Brand */}
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
              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  gap: 12,
                }}
              >
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

            {/* Product */}
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

            {/* Company */}
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

            {/* Legal */}
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

          {/* Divider + copyright */}
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
