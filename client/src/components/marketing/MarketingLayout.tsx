import { useEffect, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, Lock, Award, ChevronDown } from "lucide-react";
import { useState } from "react";
import { usePageView } from "@/hooks/usePageView";
import { useLenis } from "@/hooks/useLenis";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { mkt } from "@/theme/tokens";
import { MarketingNav, useNavIsMobile } from "./navigation/MarketingNav";
import AnnouncementBanner from "./AnnouncementBanner";
import MarketingStickyBar from "./MarketingStickyBar";

const SiteChatWidget = lazy(() => import("@/components/SiteChatWidget"));

/* ─── Footer ─── */

const legalLinkStyle: CSSProperties = {
  fontSize: 10,
  // a11y: 0.55 alpha on dark bg (#22282a) gives ~5.5:1 contrast, passes WCAG AA
  // for normal text. Previously 0.32 (~2.5:1 — failed).
  color: "rgba(255,255,255,0.55)",
  textDecoration: "none",
  padding: "0 12px",
  fontFamily: "'DM Mono', monospace",
  letterSpacing: "0.06em",
};

const legalDividerStyle: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: 10,
  background: "rgba(255,255,255,0.12)",
};

const ftLink: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 400,
  fontFamily: "'DM Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  // a11y: bumped from 0.35 (~2.7:1) to 0.6 (~6:1) to clear WCAG AA for normal text.
  color: "rgba(255,255,255,0.6)",
  textDecoration: "none",
  lineHeight: 1.3,
  padding: "5px 0",
  transition: "color 0.15s ease",
};

const ftHeading: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#f5fcff",
  textTransform: "none",
  letterSpacing: "-0.01em",
  paddingBottom: 12,
  marginBottom: 12,
  borderBottom: "none",
};

function FtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={ftLink}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ftLink.color as string; }}
    >
      {children}
    </Link>
  );
}

function CollapsibleFooterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="mkt-ft-toggle"
        style={{ ...ftHeading, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <span>{title}</span>
        <ChevronDown size={12} className="mkt-ft-chevron" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)", opacity: 0.4 }} />
      </button>
      {open && <div className="mkt-ft-list">{children}</div>}
    </div>
  );
}

function MarketingFooter({ isMobile }: { isMobile: boolean }) {
  const { isAuthenticated, isPortalUser } = useAuth();

  return (
    <footer
      data-testid="footer-marketing"
      style={{
        /* PR 2: hairline top border per DOSS pattern — gives the footer
         * a clear structural boundary from the page content above. */
        borderTop: "1px solid var(--hairline)",
        background: "#22282a",
        color: "rgba(255,255,255,0.5)",
      }}
    >
      {/* ── Main footer grid ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 0" }}>
        <div className="mkt-footer-grid">
          {/* Col 1 — Products */}
          <CollapsibleFooterSection title="Products" defaultOpen={!isMobile}>
            <FtLink href="/products/tradeline">24/7 TradeLine™</FtLink>
            <FtLink href="/products/quickquotepro">QuoteQuick Pro™</FtLink>
            <FtLink href="/products/mapguard">MapGuard™</FtLink>
            <FtLink href="/products/reputationshield">ReputationShield™</FtLink>
            <FtLink href="/products/socialsync">SocialSync™</FtLink>
            <FtLink href="/products/rankflow">RankFlow™</FtLink>
            <FtLink href="/products/sitelaunch">SiteLaunch™</FtLink>
            <FtLink href="/products/webcare">WebCare™</FtLink>
            <FtLink href="/products/webfix">WebFix™</FtLink>
            <FtLink href="/products/contentflow">ContentFlow™</FtLink>
            <FtLink href="/products/adflow">AdFlow™</FtLink>
            <FtLink href="/products/bookflow">BookFlow™</FtLink>
          </CollapsibleFooterSection>

          {/* Col 2 — Solutions */}
          <CollapsibleFooterSection title="Solutions" defaultOpen={!isMobile}>
            <FtLink href="/solutions/for-plumbers">Plumbing</FtLink>
            <FtLink href="/solutions/for-hvac">HVAC</FtLink>
            <FtLink href="/solutions/for-electricians">Electrical</FtLink>
            <FtLink href="/solutions/for-roofers">Roofing</FtLink>
            <FtLink href="/solutions/for-cleaners">Cleaning</FtLink>
            <Link
              href="/products"
              style={{ ...ftLink, fontSize: 12, fontWeight: 500, color: mkt.accent, marginTop: 6, opacity: 0.7 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            >
              All Solutions →
            </Link>
          </CollapsibleFooterSection>

          {/* Col 3 — Resources + Tools */}
          <CollapsibleFooterSection title="Resources" defaultOpen={!isMobile}>
            <FtLink href="/about">About Us</FtLink>
            <FtLink href="/contact">Contact Sales</FtLink>
            <FtLink href="/pricing">Pricing</FtLink>
            <FtLink href="/tools/free-audit">Free Audit Tool</FtLink>
            <FtLink href="/tools/missed-call-calculator">Missed Call Calculator</FtLink>
            <FtLink href="/tools/quote-demo">Quote Demo</FtLink>
            {!isAuthenticated && <FtLink href="/login">Login</FtLink>}
            {isAuthenticated && <FtLink href="/dashboard">Dashboard</FtLink>}
          </CollapsibleFooterSection>

          {/* Col 4 — Legal */}
          <CollapsibleFooterSection title="Legal" defaultOpen={!isMobile}>
            <FtLink href="/privacy">Privacy Policy</FtLink>
            <FtLink href="/terms">Terms of Service</FtLink>
            <FtLink href="/terms">Cookie Policy</FtLink>
            <FtLink href="/terms">GDPR</FtLink>
            {isAuthenticated && (
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
                  queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
                }}
                style={{
                  ...ftLink,
                  fontSize: 12,
                  // a11y: bumped from 0.28 to 0.6 to clear WCAG AA.
                  color: "rgba(255,255,255,0.6)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 0",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
              >
                Sign out
              </button>
            )}
          </CollapsibleFooterSection>
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 36 }} />
      </div>

      {/* ── Corporate bottom bar ───────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 16px" }}>
        {/* Trust badges */}
        <div className="mkt-footer-trust" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500 }}>
            <ShieldCheck size={14} strokeWidth={1.5} />
            <span>SOC 2 Compliant</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500 }}>
            <Lock size={14} strokeWidth={1.5} />
            <span>256-bit SSL Encrypted</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500 }}>
            <Award size={14} strokeWidth={1.5} />
            <span>GDPR Ready</span>
          </div>
        </div>

        {/* Company info + copyright */}
        <div className="mkt-footer-bottom" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
              <a
                href="tel:+19156153280"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
                data-testid="footer-phone"
              >
                📞 +1 (915) 615-3280 · AI-answered 24/7
              </a>
              <a
                href="mailto:sales@wefixtrades.com"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
              >
                ✉️ sales@wefixtrades.com
              </a>
              <a
                href="mailto:support@wefixtrades.com"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
              >
                ✉️ support@wefixtrades.com
              </a>
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: "0 0 4px", lineHeight: 1.5 }}>
              &copy; {new Date().getFullYear()} WeFixTrades. All rights reserved.
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5, maxWidth: 480 }}>
              WeFixTrades is headquartered in Toronto, Canada.
            </p>
          </div>
          <div className="mkt-footer-legal-links" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <Link href="/privacy" style={legalLinkStyle}>Privacy</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" style={legalLinkStyle}>Terms</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" style={legalLinkStyle}>Cookies</Link>
          </div>
        </div>
      </div>

      {/* ── Responsive CSS ─────────────────────────────────────────── */}
      <style>{`
        .mkt-footer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
        }
        /* Subtle dashed vertical divider between footer columns.
           PR 2: switched from bright rgba(255,255,255,0.22) to the
           warm-gray hairline so it matches the rest of the DOSS system. */
        .mkt-footer-grid > * + * {
          background-image: linear-gradient(
            to bottom,
            var(--hairline) 0,
            var(--hairline) 6px,
            transparent 6px,
            transparent 12px
          );
          background-repeat: repeat-y;
          background-size: 1px 12px;
          background-position: -16px top;
          padding-left: 0;
        }
        /* Desktop: hide chevrons, always show content */
        .mkt-ft-chevron { display: none; }
        .mkt-ft-toggle { cursor: default !important; }

        @media (max-width: 768px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr 1fr;
            gap: 24px 20px;
          }
          /* Drop the column divider when items wrap onto multiple rows */
          .mkt-footer-grid > * + * {
            background-image: none;
          }
        }
        @media (max-width: 480px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          /* On small mobile: show chevrons for collapsible behavior */
          .mkt-ft-chevron { display: block !important; }
          .mkt-ft-toggle { cursor: pointer !important; }
          .mkt-footer-bottom {
            flex-direction: column !important;
          }
          .mkt-footer-trust {
            gap: 12px !important;
          }
        }
        @media (max-width: 640px) {
          .mkt-footer-bottom {
            flex-direction: column !important;
          }
        }
      `}</style>
    </footer>
  );
}

export default function MarketingLayout({ children, hideSiteChat = false }: { children: ReactNode; hideSiteChat?: boolean }) {
  useLenis();
  const [location] = useLocation();
  const isMobile = useNavIsMobile();
  usePageView(location);

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
      <AnnouncementBanner />
      <MarketingNav />
      <div style={{ height: 24, flexShrink: 0 }} />
      <main style={{ flex: 1 }}>{children}</main>
      <MarketingFooter isMobile={isMobile} />
      <MarketingStickyBar />
      {!hideSiteChat && (
        <Suspense fallback={null}>
          <SiteChatWidget />
        </Suspense>
      )}
    </div>
  );
}
