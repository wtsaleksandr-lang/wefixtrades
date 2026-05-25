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
    <div className="mkt-footer-col">
      <div style={ftHeading}>{title}</div>
      <div className="mkt-ft-list">{children}</div>
    </div>
  );
}

/**
 * A footer column that shows the first half of its links, with the rest
 * hidden behind a toggle. The remainder unfolds smoothly via the grid
 * 0fr→1fr technique — no fixed max-height, no JS measurement.
 */
function ExpandableFooterColumn({
  title,
  toggleLabel,
  links,
}: {
  title: string;
  toggleLabel: string;
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const half = Math.ceil(links.length / 2);
  const visible = links.slice(0, half);
  const hidden = links.slice(half);
  return (
    <div className="mkt-footer-col">
      <div style={ftHeading}>{title}</div>
      {/* First half — always visible */}
      <div className="mkt-ft-list">
        {visible.map((l) => (
          <FtLink key={l.href + l.label} href={l.href}>{l.label}</FtLink>
        ))}
      </div>
      {hidden.length > 0 && (
        <>
          {/* Second half — unfolds below the visible half */}
          <div className="mkt-ft-collapse" data-open={open}>
            <div>
              <div className="mkt-ft-list">
                {hidden.map((l) => (
                  <FtLink key={l.href + l.label} href={l.href}>{l.label}</FtLink>
                ))}
              </div>
            </div>
          </div>
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
              marginTop: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {open ? "Show less" : toggleLabel}
            <ChevronDown
              size={12}
              style={{ transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "rotate(0)" }}
            />
          </button>
        </>
      )}
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
          {/* Products — first half shown, rest behind "All Products" */}
          <ExpandableFooterColumn
            title="Products"
            toggleLabel="All Products"
            links={[
              { href: "/products/tradeline", label: "24/7 TradeLine™" },
              { href: "/products/quickquotepro", label: "QuoteQuick™" },
              { href: "/products/mapguard", label: "MapGuard™" },
              { href: "/products/reputationshield", label: "ReputationShield™" },
              { href: "/products/socialsync", label: "SocialSync™" },
              { href: "/products/rankflow", label: "RankFlow™" },
              { href: "/products/sitelaunch", label: "SiteLaunch™" },
              { href: "/products/webcare", label: "WebCare™" },
              { href: "/products/webfix", label: "WebFix™" },
              { href: "/products/contentflow", label: "ContentFlow™" },
              { href: "/products/adflow", label: "AdFlow™" },
              { href: "/products/bookflow", label: "BookFlow™" },
            ]}
          />

          {/* Solutions — first half shown, rest behind "All Solutions" */}
          <ExpandableFooterColumn
            title="Solutions"
            toggleLabel="All Solutions"
            links={[
              { href: "/solutions/for-plumbers", label: "Plumbers" },
              { href: "/solutions/for-hvac", label: "HVAC" },
              { href: "/solutions/for-electricians", label: "Electricians" },
              { href: "/solutions/for-roofers", label: "Roofers" },
              { href: "/solutions/for-cleaners", label: "Cleaners" },
              { href: "/solutions/for-landscapers", label: "Landscapers" },
              { href: "/solutions/for-pest-control", label: "Pest Control" },
              { href: "/solutions/for-garage-door", label: "Garage Door" },
              { href: "/solutions/for-locksmiths", label: "Locksmiths" },
              { href: "/solutions/for-painters", label: "Painters" },
              { href: "/solutions/for-remodelers", label: "Remodelers" },
              { href: "/solutions/for-general-contractors", label: "General Contractors" },
            ]}
          />

          {/* For You — audience landing pages (Brightlocal-style). Sits
              between Solutions and Resources because the buyer persona is
              the next-most-specific filter after "what trade are you in". */}
          <FooterColumn title="For You">
            <FtLink href="/for-agencies">For Agencies</FtLink>
            <FtLink href="/for-franchises">For Franchises</FtLink>
            <FtLink href="/for-solo-traders">For Solo Traders</FtLink>
            <FtLink href="/contentflow">For Marketers</FtLink>
          </FooterColumn>

          {/* Resources */}
          <FooterColumn title="Resources">
            <FtLink href="/about">About Us</FtLink>
            <FtLink href="/contact">Contact Sales</FtLink>
            <FtLink href="/pricing">Pricing</FtLink>
            {/* AJ-7 — API developer docs */}
            <FtLink href="/docs/api">API Docs</FtLink>
            {/* Wave 2 — paid one-time citation submission service. */}
            <FtLink href="/citation-builder">Citation Builder</FtLink>
            {/* Compare — "X alternative" / "X vs Y" SEO entries. */}
            <FtLink href="/wefixtrades-vs-jobber">vs Jobber</FtLink>
            <FtLink href="/wefixtrades-vs-housecall-pro">vs Housecall Pro</FtLink>
            <FtLink href="/wefixtrades-vs-servicetitan">vs ServiceTitan</FtLink>
            <FtLink href="/sitemap">Sitemap</FtLink>
            {!isAuthenticated && <FtLink href="/login">Login</FtLink>}
            {isAuthenticated && <FtLink href="/dashboard">Dashboard</FtLink>}
          </FooterColumn>

          {/* Tools — demos + free tools.
              Tools-consolidation: missed-call deleted, MapSnapshot folded
              into the Free Audit "Rank Grid" tab, Quote Demo + Build-with-AI
              relocated under the QuoteQuick product family. */}
          <FooterColumn title="Free Tools">
            <FtLink href="/tools/free-audit">Free Audit</FtLink>
            {/* Free Tools Wave 1 — Brightlocal-style standalone tools, each
                with its own /tools/* URL + lead-magnet page. */}
            <FtLink href="/tools/google-review-link-generator">Google Review Link Generator</FtLink>
            <FtLink href="/tools/local-search-checker">Local Search Results Checker</FtLink>
            <FtLink href="/tools/citation-checker">Citation Checker</FtLink>
            <FtLink href="/tools/local-rankflux">Local Rankflux</FtLink>
            {/* Wave 2 — single-shot 5x5 geo-grid rank scan; upsell to MapGuard. */}
            <FtLink href="/tools/local-rank-grid">Local Rank Grid</FtLink>
            <FtLink href="/products/quickquotepro/demo">QuoteQuick Demo</FtLink>
            {/* BI-1 — anonymous AI demo: upload an invoice, AI builds your calculator. */}
            <FtLink href="/products/quickquotepro/build-with-ai">Build with AI — From a Photo</FtLink>
            <FtLink href="/tools/plumbing-ai-content-prompts">AI Prompt Library</FtLink>
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
                className="mkt-ft-soft"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
                data-testid="footer-phone"
              >
                <Phone size={12} color={mkt.accent} strokeWidth={2} />
                +1 (915) 615-3280 · answered 24/7
              </a>
              <a
                href="mailto:sales@wefixtrades.com"
                className="mkt-ft-soft"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textDecoration: "none", fontWeight: 500 }}
              >
                ✉️ sales@wefixtrades.com
              </a>
              <a
                href="mailto:support@wefixtrades.com"
                className="mkt-ft-soft"
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
            <Link href="/privacy" className="mkt-ft-soft" style={legalLinkStyle}>Privacy</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" className="mkt-ft-soft" style={legalLinkStyle}>Terms</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" className="mkt-ft-soft" style={legalLinkStyle}>Cookies</Link>
            <span style={legalDividerStyle} />
            <Link href="/sitemap" className="mkt-ft-soft" style={legalLinkStyle}>Sitemap</Link>
            {isAuthenticated && (
              <>
                <span style={legalDividerStyle} />
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
                    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
                  }}
                  className="mkt-ft-soft"
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
          position: relative;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 0;
          padding: 28px 8px;
        }
        /* At narrower desktop widths the 5-col layout starts to squeeze.
           Drop to 3 cols below 1024px so labels keep breathing room. */
        @media (max-width: 1024px) {
          .mkt-footer-grid {
            grid-template-columns: repeat(3, 1fr);
            row-gap: 28px;
          }
        }
        /* Vertical divider line between footer columns. Solid 1px line at 0.32
           opacity with a soft top/bottom fade via linear-gradient — gives a
           crisp visible blueprint-style line that doesn't feel like a hard
           border. Implemented as a ::before pseudo so the line height is
           independent of column content. padding-left supplies the inner
           gap so column content breathes away from the divider. */
        .mkt-footer-grid > * + * {
          position: relative;
          padding-left: 24px;
        }
        .mkt-footer-grid > * + *::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 1px;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(255,255,255,0.32) 15%,
            rgba(255,255,255,0.32) 85%,
            transparent 100%
          );
          pointer-events: none;
        }
        .mkt-footer-grid > * {
          padding-right: 12px;
        }

        /* Blueprint-style "+" corner markers — ONLY at the 4 outer corners
           of the entire grid container (NOT per column). Two pseudo-elements:
           ::before covers the top row (top-left + top-right), ::after covers
           the bottom row (bottom-left + bottom-right). */
        .mkt-footer-grid::before,
        .mkt-footer-grid::after {
          content: "";
          position: absolute;
          left: -8px;
          right: -8px;
          height: 16px;
          pointer-events: none;
          background-repeat: no-repeat;
          background-position: left center, right center;
          background-size: 16px 16px, 16px 16px;
          background-image:
            url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><line x1='2' y1='8' x2='14' y2='8' stroke='rgba(255,255,255,0.45)' stroke-width='1'/><line x1='8' y1='2' x2='8' y2='14' stroke='rgba(255,255,255,0.45)' stroke-width='1'/></svg>"),
            url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><line x1='2' y1='8' x2='14' y2='8' stroke='rgba(255,255,255,0.45)' stroke-width='1'/><line x1='8' y1='2' x2='8' y2='14' stroke='rgba(255,255,255,0.45)' stroke-width='1'/></svg>");
        }
        .mkt-footer-grid::before { top: -8px; }
        .mkt-footer-grid::after  { bottom: -8px; }

        .mkt-footer-col {
          /* No corner markers here — moved to the grid container so only the
             4 outer corners show, not the inner column intersections. */
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

        /* Soft hover for legal links + contact lines (phone / email) — color
           shift only, no underline, no border. Used in the corporate bottom
           bar where the aggressive blue underline felt out of place. */
        .mkt-ft-soft {
          transition: color 0.15s ease;
        }
        .mkt-ft-soft:hover {
          color: rgba(255,255,255,0.92) !important;
          text-decoration: none !important;
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
            row-gap: 24px;
            padding: 24px 8px;
          }
          /* Drop the column divider when items wrap onto multiple rows —
             vertical borders between wrapped rows look chaotic. The 4 outer
             corner "+" markers stay (they're on the grid container). */
          .mkt-footer-grid > * + * {
            padding-left: 0;
          }
          .mkt-footer-grid > * + *::before {
            display: none;
          }
          .mkt-footer-grid > * {
            padding-right: 0;
          }
        }
        @media (max-width: 480px) {
          /* Wave L H5 — keep the 2-column grid on phones so the footer is
           * scannable, not a tall single-column stack. */
          .mkt-footer-grid {
            grid-template-columns: 1fr 1fr;
            row-gap: 20px;
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
      {/* Skip-to-content — sr-only until focused. Lets keyboard users
          jump past the announcement banner + nav straight to the page
          body. WCAG 2.4.1 (Bypass Blocks). Matches AdminLayout pattern. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-brand-blue focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>
      {/* <header role=banner> wraps the global chrome so screen readers
          land in a real banner landmark (axe + WCAG 1.3.1). */}
      <header>
        <AnnouncementBanner />
        <MarketingNav />
      </header>
      <div style={{ height: 24, flexShrink: 0 }} />
      <main id="main-content" tabIndex={-1} style={{ flex: 1 }}>{children}</main>
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
