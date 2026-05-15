import { useEffect, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, Lock, Award, ChevronDown, Phone } from "lucide-react";
import { useState } from "react";
import { usePageView } from "@/hooks/usePageView";
import { useLenis } from "@/hooks/useLenis";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { mkt } from "@/theme/tokens";
import { MarketingNav } from "./navigation/MarketingNav";
import AnnouncementBanner from "./AnnouncementBanner";
import MarketingStickyBar from "./MarketingStickyBar";

const SiteChatWidget = lazy(() => import("@/components/SiteChatWidget"));

/* ─── Footer ─── */

const legalLinkStyle: CSSProperties = {
  fontSize: 10,
  // a11y: 0.55 alpha on dark bg (#22282a) gives ~5.5:1 contrast, passes WCAG AA.
  color: "rgba(255,255,255,0.55)",
  textDecoration: "none",
  // margin (not padding) so the center-out underline spans the text only.
  margin: "0 12px",
  padding: 0,
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
  fontSize: 12,
  fontWeight: 400,
  fontFamily: "'DM Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  // a11y: 0.6 alpha (~6:1) clears WCAG AA for normal text.
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
  letterSpacing: "-0.01em",
  marginBottom: 10,
};

function FtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mkt-ft-underline"
      style={ftLink}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.92)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ftLink.color as string; }}
    >
      {children}
    </Link>
  );
}

/** A plain footer column — heading + always-visible link list. */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={ftHeading}>{title}</div>
      <div className="mkt-ft-list">{children}</div>
    </div>
  );
}

/**
 * A footer column whose link list is hidden behind a toggle button and
 * unfolds smoothly. The smooth height animation uses the grid 0fr→1fr
 * technique — no fixed max-height, no JS measurement.
 */
function ExpandableFooterColumn({
  title,
  toggleLabel,
  children,
}: {
  title: string;
  toggleLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={ftHeading}>{title}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mkt-ft-expand"
        style={{
          ...ftLink,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {toggleLabel}
        <ChevronDown
          size={12}
          style={{ transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>
      <div className="mkt-ft-collapse" data-open={open}>
        <div>
          <div className="mkt-ft-list" style={{ paddingTop: 4 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function MarketingFooter() {
  const { isAuthenticated } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer
      data-testid="footer-marketing"
      style={{
        borderTop: "1px solid var(--hairline)",
        background: "#22282a",
        color: "rgba(255,255,255,0.5)",
      }}
    >
      {/* ── Main footer grid ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 0" }}>
        <div className="mkt-footer-grid">
          {/* Products — list hidden behind the "All Products" toggle */}
          <ExpandableFooterColumn title="Products" toggleLabel="All Products">
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
          </ExpandableFooterColumn>

          {/* Solutions — list hidden behind the "All Solutions" toggle */}
          <ExpandableFooterColumn title="Solutions" toggleLabel="All Solutions">
            <FtLink href="/solutions/for-plumbers">Plumbing</FtLink>
            <FtLink href="/solutions/for-hvac">HVAC</FtLink>
            <FtLink href="/solutions/for-electricians">Electrical</FtLink>
            <FtLink href="/solutions/for-roofers">Roofing</FtLink>
            <FtLink href="/solutions/for-cleaners">Cleaning</FtLink>
          </ExpandableFooterColumn>

          {/* Resources */}
          <FooterColumn title="Resources">
            <FtLink href="/about">About Us</FtLink>
            <FtLink href="/contact">Contact Sales</FtLink>
            <FtLink href="/pricing">Pricing</FtLink>
            {!isAuthenticated && <FtLink href="/login">Login</FtLink>}
            {isAuthenticated && <FtLink href="/dashboard">Dashboard</FtLink>}
          </FooterColumn>

          {/* Tools — demos + free tools */}
          <FooterColumn title="Tools">
            <FtLink href="/tools/free-audit">Free Audit Tool</FtLink>
            <FtLink href="/tools/missed-call-calculator">Missed Call Calculator</FtLink>
            <FtLink href="/tools/quote-demo">Quote Demo</FtLink>
          </FooterColumn>
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
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
                data-testid="footer-phone"
              >
                <Phone size={12} color={mkt.accent} strokeWidth={2} />
                +1 (915) 615-3280 · AI-answered 24/7
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
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.5 }}>
              &copy; {year} WeFixTrades. All rights reserved. Headquartered in Toronto, Canada.
            </p>
          </div>
          <div className="mkt-footer-legal-links" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <Link href="/privacy" className="mkt-ft-underline" style={legalLinkStyle}>Privacy</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" className="mkt-ft-underline" style={legalLinkStyle}>Terms</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" className="mkt-ft-underline" style={legalLinkStyle}>Cookies</Link>
            {isAuthenticated && (
              <>
                <span style={legalDividerStyle} />
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
                    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
                  }}
                  className="mkt-ft-underline"
                  style={{ ...legalLinkStyle, background: "none", border: "none", cursor: "pointer" }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer CSS ─────────────────────────────────────────────── */}
      <style>{`
        .mkt-footer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
        }
        /* Subtle dashed vertical divider between footer columns. */
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
        }

        /* Column link list — stacked, each link only as wide as its text
           so the center-out underline sits under the text. */
        .mkt-ft-list {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        /* Center-out blue underline hover — footer links + legal links.
           Grows from the centre on hover, folds back to the centre on leave. */
        .mkt-ft-underline {
          position: relative;
          display: inline-block;
        }
        .mkt-ft-underline::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 3px;
          height: 1.5px;
          background: #0d3cfc;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.22s ease;
        }
        .mkt-ft-underline:hover::after {
          transform: scaleX(1);
        }

        /* "All Products" / "All Solutions" toggle — subtle brighten on hover. */
        .mkt-ft-expand:hover {
          color: rgba(255,255,255,0.92) !important;
        }

        /* Smooth unfold — grid 0fr → 1fr animates to content height. */
        .mkt-ft-collapse {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s ease;
        }
        .mkt-ft-collapse[data-open="true"] {
          grid-template-rows: 1fr;
        }
        .mkt-ft-collapse > div {
          overflow: hidden;
        }

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
            gap: 20px;
          }
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
      <MarketingFooter />
      <MarketingStickyBar />
      {!hideSiteChat && (
        <Suspense fallback={null}>
          <SiteChatWidget />
        </Suspense>
      )}
    </div>
  );
}
