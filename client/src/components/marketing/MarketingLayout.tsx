import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";

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

/* ─── Desktop nav item with optional dropdown ─── */
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
            fontWeight: 600,
            color: isHighlighted ? "#111827" : "#374151",
            background: isHighlighted ? "#e5e7eb" : "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 0.15s ease, color 0.15s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            if (!isHighlighted) {
              (e.currentTarget as HTMLElement).style.background = "#e5e7eb";
              (e.currentTarget as HTMLElement).style.color = "#111827";
            }
          }}
          onMouseLeave={(e) => {
            if (!isHighlighted) {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#374151";
            }
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
            fontWeight: 600,
            color: isActive ? "#111827" : "#374151",
            background: isActive ? "#e5e7eb" : "transparent",
            textDecoration: "none",
            transition: "background 0.15s ease, color 0.15s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = "#e5e7eb";
              (e.currentTarget as HTMLElement).style.color = "#111827";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#374151";
            }
          }}
        >
          {label}
        </Link>
      )}

      {/* Dropdown panel */}
      {hasDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            left: "50%",
            transform: open ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-6px)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            background: "#FFFFFF",
            borderRadius: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
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
                color: "#374151",
                textDecoration: "none",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                (e.currentTarget as HTMLElement).style.color = "#111827";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "#374151";
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

/* ─── Mobile accordion item ─── */
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
    <div style={{ borderBottom: "1px solid #F1F5F9" }}>
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
              color: isActive || expanded ? "#2D6A4F" : "#0F172A",
              textAlign: "left",
            }}
          >
            {label}
            <ChevronDown
              size={18}
              style={{ transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", color: "#94A3B8" }}
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
                    color: "#475569",
                    textDecoration: "none",
                    background: "#f3f4f6",
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
            color: isActive ? "#2D6A4F" : "#0F172A",
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
      {/* ─── Fixed Navbar ─── */}
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

          {/* Center: pill capsule containing nav links */}
          {!isMobile && (
            <nav
              aria-label="Main navigation"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                background: "#f3f4f6",
                borderRadius: 9999,
                padding: "5px 6px",
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

          {/* Right: Login + CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <Link
                  href="/Dashboard"
                  data-testid="nav-login"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#374151",
                    textDecoration: "none",
                    padding: "7px 12px",
                    borderRadius: 9999,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#111827")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#374151")}
                >
                  Log in
                </Link>
                <Link
                  href="/Wizard"
                  className="mkt-btn-primary"
                  data-testid="nav-cta-start-free"
                  style={{
                    padding: "9px 20px",
                    borderRadius: 9999,
                    background: "#2D6A4F",
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-block",
                    whiteSpace: "nowrap",
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
                aria-expanded={menuOpen}
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

      {/* ─── Mobile slide-down menu panel ─── */}
      {isMobile && (
        <div
          data-testid="nav-mobile-menu"
          style={{
            position: "fixed",
            top: navHeight,
            left: 0,
            right: 0,
            background: "#FFFFFF",
            zIndex: 199,
            borderBottom: menuOpen ? "1px solid #E2E8F0" : "none",
            boxShadow: menuOpen ? "0 8px 32px rgba(0,0,0,0.08)" : "none",
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
                borderRadius: 9999,
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
        </div>
      )}

      {/* Spacer for fixed nav */}
      <div style={{ height: navHeight, flexShrink: 0, transition: "height 0.3s ease" }} />

      <main style={{ flex: 1 }}>{children}</main>

      {/* ─── Footer (unchanged) ─── */}
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
