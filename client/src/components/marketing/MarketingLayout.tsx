import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";

const NAV_LINKS = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Services", href: "/services" },
  { label: "Demo", href: "/demo" },
];

const styles = {
  nav: {
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    height: 60,
    display: "flex",
    alignItems: "center",
  },
  navInner: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "0 24px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  logo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
    textDecoration: "none",
    flexShrink: 0,
  },
  logoName: {
    fontSize: 17,
    fontWeight: 700,
    color: "#2D6A4F",
    lineHeight: 1.2,
    letterSpacing: "-0.01em",
  },
  logoSub: {
    fontSize: 10,
    fontWeight: 500,
    color: "#9CA3AF",
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  navLinks: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  navLink: {
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    textDecoration: "none",
    transition: "background 0.15s ease, color 0.15s ease",
    cursor: "pointer",
  },
  navLinkActive: {
    color: "#2D6A4F",
    background: "#F0F7F4",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  ctaBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    background: "#2D6A4F",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    display: "inline-block",
  },
  hamburger: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 8,
    borderRadius: 8,
    color: "#374151",
    display: "none",
  },
  mobileMenu: {
    position: "fixed" as const,
    top: 60,
    left: 0,
    right: 0,
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    zIndex: 99,
    padding: "16px 24px 20px",
  },
  mobileLink: {
    display: "block",
    padding: "12px 0",
    fontSize: 16,
    fontWeight: 500,
    color: "#111827",
    textDecoration: "none",
    borderBottom: "1px solid #F3F4F6",
  },
  mobileCta: {
    display: "block",
    marginTop: 16,
    padding: "12px",
    borderRadius: 8,
    background: "#2D6A4F",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 600,
    textAlign: "center" as const,
    textDecoration: "none",
  },
  footer: {
    background: "#0B1F3A",
    color: "#FFFFFF",
  },
  footerInner: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "60px 24px 40px",
  },
  footerTop: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    gap: 40,
    marginBottom: 48,
  },
  footerLogoName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  footerTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 1.6,
    maxWidth: 260,
  },
  footerColTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 16,
  },
  footerLink: {
    display: "block",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    textDecoration: "none",
    marginBottom: 10,
    transition: "color 0.15s ease",
  },
  footerDivider: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: 12,
  },
  footerCopy: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const isMobile = useIsMobile();
  usePageView(location);

  const isActive = (href: string) => location === href;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "Inter, system-ui, sans-serif" }}>
      <nav style={styles.nav} data-testid="nav-marketing">
        <div style={styles.navInner}>
          <Link href="/" style={styles.logo}>
            <span style={styles.logoName}>QuickQuotePro</span>
            <span style={styles.logoSub}>by WeFixTrades</span>
          </Link>

          {!isMobile && (
            <div style={styles.navLinks}>
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  style={{ ...styles.navLink, ...(isActive(href) ? styles.navLinkActive : {}) }}
                  data-testid={`nav-link-${label.toLowerCase()}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}

          <div style={styles.navRight}>
            {!isMobile && (
              <Link href="/Wizard" style={styles.ctaBtn} data-testid="nav-cta-start-free">
                Start Free
              </Link>
            )}
            {isMobile && (
              <button
                style={styles.hamburger}
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Toggle menu"
                data-testid="nav-hamburger"
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {isMobile && menuOpen && (
        <div style={styles.mobileMenu} data-testid="nav-mobile-menu">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              style={styles.mobileLink}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link href="/Wizard" style={styles.mobileCta} onClick={() => setMenuOpen(false)} data-testid="nav-cta-start-free">
            Start Free
          </Link>
        </div>
      )}

      <main style={{ flex: 1 }}>
        {children}
      </main>

      <footer style={styles.footer} data-testid="footer-marketing">
        <div style={styles.footerInner}>
          <div style={{
            ...styles.footerTop,
            gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr",
          }}>
            <div>
              <div style={styles.footerLogoName}>QuickQuotePro</div>
              <p style={styles.footerTagline}>
                Instant estimates. Smart booking. AI employees — built for trades businesses.
              </p>
            </div>
            <div>
              <div style={styles.footerColTitle}>Product</div>
              <Link href="/product" style={styles.footerLink}>Product</Link>
              <Link href="/pricing" style={styles.footerLink}>Pricing</Link>
              <Link href="/templates" style={styles.footerLink}>Templates</Link>
              <Link href="/demo" style={styles.footerLink}>Demo</Link>
            </div>
            <div>
              <div style={styles.footerColTitle}>Company</div>
              <Link href="/services" style={styles.footerLink}>Services</Link>
              <Link href="/bundles" style={styles.footerLink}>Bundles</Link>
              <Link href="/contact" style={styles.footerLink}>Contact</Link>
              <Link href="/docs" style={styles.footerLink}>Docs</Link>
            </div>
            <div>
              <div style={styles.footerColTitle}>Legal</div>
              <Link href="/privacy" style={styles.footerLink}>Privacy Policy</Link>
              <Link href="/terms" style={styles.footerLink}>Terms of Service</Link>
            </div>
          </div>
          <div style={styles.footerDivider}>
            <span style={styles.footerCopy}>© 2026 WeFixTrades. All rights reserved.</span>
            <span style={styles.footerCopy}>QuickQuotePro — Estimates, Booking & AI for Trades</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
