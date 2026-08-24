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
import Logo from "@/components/primitives/Logo";
import AnnouncementBanner from "./AnnouncementBanner";
import MarketingStickyBar from "./MarketingStickyBar";
import MobileStickyCta from "./MobileStickyCta";
import AppStoreBadges from "./AppStoreBadges";

const SiteChatWidget = lazy(() => import("@/components/SiteChatWidget"));

/* ─── Footer ─── */

const legalLinkStyle: CSSProperties = {
  fontSize: 10,
  // a11y: 0.55 alpha on dark bg (#22282a) gives ~5.5:1 contrast, passes WCAG AA.
  color: "rgba(255,255,255,0.55)",
  textDecoration: "none",
  // margin (not padding) so the center-out underline spans the text only.
  // Wave 110 — tightened from 0 12px → 0 6px so all 5 legal links fit on
  // one line on a 320px-wide phone without wrapping (per Alex). Each link
  // also gets whiteSpace: nowrap so individual labels never break mid-word.
  margin: "0 6px",
  padding: 0,
  fontFamily: "'DM Mono', monospace",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
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

/**
 * A footer column that shows the first half of its links, with the rest
 * hidden behind a toggle. The remainder unfolds smoothly via the grid
 * 0fr→1fr technique — no fixed max-height, no JS measurement.
 */
function ExpandableFooterColumn({
  title,
  toggleLabel,
  links,
  visibleCount,
}: {
  title: string;
  toggleLabel: string;
  links: { href: string; label: string }[];
  /** Optional override for the count of always-visible links above the toggle.
      When omitted, defaults to ceil(links.length / 2) so columns split evenly.
      Used to align the visible heights of two adjacent expandable columns. */
  visibleCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const splitAt = Math.min(
    links.length,
    visibleCount ?? Math.ceil(links.length / 2),
  );
  const visible = links.slice(0, splitAt);
  const hidden = links.slice(splitAt);
  // Stable id so the toggle button can reference the collapsible region via
  // aria-controls (a11y — screen readers announce the expand/collapse target).
  const panelId = `ftcol-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
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
          <div className="mkt-ft-collapse" data-open={open} id={panelId}>
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
            aria-controls={panelId}
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
      {/* ── Privacy / consent bar ─────────────────────────────────────
          Dedicated Do-Not-Sell / cookie-consent style bar ABOVE the footer
          proper. Static + link-driven (no new routes) so cookie preferences,
          do-not-sell, and the privacy policy are all one click away. */}
      <div className="mkt-consent-bar">
        <div className="mkt-consent-inner">
          <div className="mkt-consent-msg">
            <ShieldCheck size={16} strokeWidth={1.8} style={{ color: mkt.accent, flexShrink: 0 }} aria-hidden />
            <span>We use cookies to run the site and improve your experience — you control what you share.</span>
          </div>
          <div className="mkt-consent-links">
            <Link href="/cookies" className="mkt-ft-soft mkt-consent-link">Cookie Preferences</Link>
            <span style={legalDividerStyle} />
            <Link href="/privacy" className="mkt-ft-soft mkt-consent-link">Do Not Sell or Share My Info</Link>
            <span style={legalDividerStyle} />
            <Link href="/privacy" className="mkt-ft-soft mkt-consent-link">Privacy Policy</Link>
          </div>
        </div>
      </div>

      {/* ── Brand strip ─────────────────────────────────────────────
          Wave 49 — logo + tagline above the column grid. Provides the
          top padding for the footer; the grid container below now starts
          flush. */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 24px" }}>
        <div
          className="mkt-footer-brand"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 32,
          }}
        >
          {/* Use the shared Logo primitive (same as MarketingNav) — sm size
              keeps the footer mark subtler than the nav's md, and animate=false
              so the boot replay doesn't fire when users scroll into view. */}
          <Logo size="sm" animate={false} />
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.55)",
              maxWidth: 380,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            The all-in-one trade marketing platform — quoting, calls, content,
            reputation, and rankings, in one place.
          </p>
        </div>
      </div>

      {/* ── Main footer grid ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div className="mkt-footer-grid">
          {/* IA restructure — the footer mirrors the slimmed 4-item nav.
              Every link is preserved: a few primary links show per column and
              the long-tail folds IN PLACE behind an accessible "Show more"
              toggle (ExpandableFooterColumn). Nothing was relocated to the
              sitemap; the collapsed view is tidy but contains everything. */}
          <ExpandableFooterColumn
            title="Products"
            toggleLabel="Show all products"
            visibleCount={5}
            links={[
              { href: "/products/tradeline", label: "TradeLine™" },
              { href: "/products/quickquotepro", label: "QuoteQuick™" },
              { href: "/mapguard-suite", label: "MapGuard Suite™" },
              { href: "/products/contentflow", label: "ContentFlow™" },
              { href: "/products/reputationshield", label: "ReputationShield™" },
              { href: "/products/mapguard", label: "MapGuard™" },
              { href: "/products/socialsync", label: "SocialSync™" },
              { href: "/products/rankflow", label: "RankFlow™" },
              { href: "/products/sitelaunch", label: "SiteLaunch™" },
              { href: "/products/webcare", label: "WebCare™" },
              { href: "/products/webfix", label: "WebFix™" },
              { href: "/products/adflow", label: "AdFlow™" },
              { href: "/citation-tracker", label: "CiteTrack" },
              { href: "/citation-builder", label: "CiteFlow" },
              { href: "/free-tools", label: "Free Tools (Hub)" },
            ]}
          />

          {/* Industries (was Solutions) — top trades visible; the rest fold
              in place. Full 40-trade catalogue still linked via "All
              industries →" and reachable on /solutions. */}
          <ExpandableFooterColumn
            title="Industries"
            toggleLabel="More trades"
            visibleCount={5}
            links={[
              { href: "/solutions/for-plumbers", label: "Plumbers" },
              { href: "/solutions/for-hvac", label: "HVAC" },
              { href: "/solutions/for-electricians", label: "Electricians" },
              { href: "/solutions/for-roofers", label: "Roofers" },
              { href: "/solutions/for-cleaners", label: "Cleaners" },
              { href: "/solutions/for-landscapers", label: "Landscapers" },
              { href: "/solutions/for-pest-control", label: "Pest Control" },
              { href: "/solutions/for-garage-door", label: "Garage Door" },
              { href: "/solutions", label: "All industries →" },
            ]}
          />

          {/* Free Tools — a few visible; the full 19-tool set folds in place.
              Hub still linked via "All Free Tools". */}
          <ExpandableFooterColumn
            title="Free Tools"
            toggleLabel="Show all free tools"
            visibleCount={5}
            links={[
              { href: "/free-tools", label: "All Free Tools" },
              { href: "/tools/free-audit", label: "LocalScore" },
              { href: "/tools/local-serp-checker", label: "Rank Checker" },
              { href: "/tools/citation-checker", label: "Citation Checker" },
              { href: "/tools/local-rank-grid", label: "Rank Grid" },
              { href: "/tools/google-review-link-generator", label: "Review Links" },
              { href: "/tools/local-rank-tracker", label: "Rank Tracker" },
              { href: "/tools/local-rankflux", label: "Rankflux" },
              { href: "/products/quickquotepro/demo", label: "Quote Demo" },
              { href: "/products/quickquotepro/build-with-ai", label: "Build with AI" },
              { href: "/tools/plumbing-ai-content-prompts", label: "Prompt Library" },
            ]}
          />

          {/* Company — Resources + For You + Compare + account/legal utility
              links, consolidated so nothing is lost. A few show; the rest
              fold in place. */}
          <ExpandableFooterColumn
            title="Company"
            toggleLabel="More links"
            visibleCount={5}
            links={[
              { href: "/about", label: "About Us" },
              { href: "/contact", label: "Contact Sales" },
              { href: "/pricing", label: "Pricing" },
              { href: "/partners", label: "Affiliates & Referrals" },
              { href: "/for-agencies", label: "For Agencies" },
              { href: "/for-franchises", label: "For Franchises" },
              { href: "/for-solo-traders", label: "For Solo Traders" },
              { href: "/contentflow", label: "For Marketers" },
              { href: "/wefixtrades-vs-jobber", label: "vs Jobber" },
              { href: "/wefixtrades-vs-housecall-pro", label: "vs Housecall Pro" },
              { href: "/wefixtrades-vs-servicetitan", label: "vs ServiceTitan" },
              { href: isAuthenticated ? "/dashboard" : "/login", label: isAuthenticated ? "Dashboard" : "Login" },
              { href: "/docs/api", label: "API Docs" },
              { href: "/security", label: "Security" },
              { href: "/cookies", label: "Cookie Policy" },
              { href: "/sms-consent-disclosure", label: "SMS Consent" },
              { href: "/sitemap", label: "Sitemap" },
            ]}
          />

          {/* Contact — WFT's 24/7 phone + dual email as a dedicated column
              (promoted out of the old cramped bottom bar). */}
          <div className="mkt-footer-col">
            <div style={ftHeading}>Contact</div>
            <div className="mkt-ft-list" style={{ gap: 8 }}>
              <a
                href="tel:+19156153280"
                className="mkt-ft-soft"
                data-testid="footer-phone"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontWeight: 500 }}
              >
                <Phone size={14} color={mkt.accent} strokeWidth={2} />
                +1 (915) 615-3280
              </a>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Answered 24/7</span>
              <a
                href="mailto:sales@wefixtrades.com"
                className="mkt-ft-soft"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontWeight: 500 }}
              >
                ✉️ sales@wefixtrades.com
              </a>
              <a
                href="mailto:support@wefixtrades.com"
                className="mkt-ft-soft"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontWeight: 500 }}
              >
                ✉️ support@wefixtrades.com
              </a>
            </div>
          </div>

          {/* Trusted by / Get the app — social-proof column. The app-store
              badges are promoted here from the old utility row, alongside a
              trust line + the security badges. */}
          <div className="mkt-footer-col">
            <div style={ftHeading}>Trusted by pros</div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 12px", lineHeight: 1.5, maxWidth: 220 }}>
              Growing trades across North America run their front office on WeFixTrades.
            </p>
            <div className="mkt-footer-trust-col" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500 }}>
                <ShieldCheck size={14} strokeWidth={1.5} />
                <span>SOC 2-certified infrastructure</span>
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
            <AppStoreBadges />
          </div>
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8 }} />
      </div>

      {/* ── Corporate bottom bar ─────────────────────────────────────
          IA restructure — trust badges + contact info promoted into the
          column grid above; the bottom bar is now just copyright + a small
          set of core legal links (the full legal set lives in the Company
          column + the privacy/consent bar, so nothing is lost). */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px 20px" }}>
        <div className="mkt-footer-bottom" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.45 }}>
            &copy; {year} WeFixTrades. All rights reserved. Headquartered in Toronto, Canada.
          </p>
          <div className="mkt-footer-legal-links" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 6 }}>
            <Link href="/privacy" className="mkt-ft-soft" style={legalLinkStyle}>Privacy</Link>
            <span style={legalDividerStyle} />
            <Link href="/terms" className="mkt-ft-soft" style={legalLinkStyle}>Terms</Link>
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
          /* Wave 110 — 6 cols (was 5); Compare folded in from a
             standalone row. Padding tightened from 8px to 4px so the
             six cols still breathe at 1100px max-width. */
          grid-template-columns: repeat(6, 1fr);
          gap: 0;
          padding: 28px 4px;
        }
        /* At narrower desktop widths the 6-col layout starts to squeeze.
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

        /* Wave 49 — corner "+" markers removed. They suggested an unfold /
           interaction that wasn't there. */

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

        /* Wave 49 — utility row links (Login / Sitemap / API Docs). Tiny,
           low-opacity, soft brighten on hover, no underline. Mirrors the
           .mkt-ft-soft pattern but smaller and dimmer. */
        .mkt-ft-util {
          font-size: 11px;
          /* 0.55 (≈5.6:1 on #22282a) — 0.45 measured 4.2:1, under AA for
             11px text (night-audit P-A footer batch). */
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.04em;
          padding: 4px 2px;
          transition: color 0.15s ease;
        }
        .mkt-ft-util:hover {
          color: rgba(255,255,255,0.85);
          text-decoration: none;
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
        /* Reduced-motion — no unfold animation for users who ask for less. */
        @media (prefers-reduced-motion: reduce) {
          .mkt-ft-collapse { transition: none; }
        }

        /* ── Privacy / consent bar ─────────────────────────────────── */
        .mkt-consent-bar {
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .mkt-consent-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px 24px;
          flex-wrap: wrap;
        }
        .mkt-consent-msg {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          line-height: 1.4;
          color: rgba(255,255,255,0.6);
        }
        .mkt-consent-links {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          row-gap: 6px;
        }
        .mkt-consent-link {
          font-size: 11px;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.6);
          text-decoration: none;
          white-space: nowrap;
          margin: 0 8px;
        }
        @media (max-width: 640px) {
          .mkt-consent-inner { justify-content: flex-start; }
          .mkt-consent-link:first-child { margin-left: 0; }
        }

        @media (max-width: 768px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr 1fr;
            row-gap: 24px;
            /* Gap between the two columns so the right column sits further
               right and reads as balanced against the left column (its outer
               edge is already symmetric to the left column's via the 8px grid
               padding). */
            column-gap: 28px;
            padding: 24px 8px;
          }
          /* Drop the column divider when items wrap onto multiple rows —
             vertical borders between wrapped rows look chaotic. */
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
          /* Wave 49 — Compare row: "Compare" label sits above the links on
             mobile so the row doesn't collide with the column grid above. */
          .mkt-footer-compare {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 4px 0 !important;
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

export default function MarketingLayout({ children, hideSiteChat = false, hideStickyCtas = false }: { children: ReactNode; hideSiteChat?: boolean; hideStickyCtas?: boolean }) {
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
      {/* Night-audit P-A C3 — hard layout rule 1 (no single-word orphan
          lines in headings). `text-wrap: balance` on every marketing
          heading balances line lengths without adding lines; browsers
          without support simply ignore it. One rule clears 40+ confirmed
          orphans across home/about/blog/products/vs-pages. */}
      <style>{`
        .mkt-layout h1, .mkt-layout h2, .mkt-layout h3 { text-wrap: balance; }
        /* S1/S2 fix — reserve bottom clearance so the persistent bottom CTA
           bar (MobileStickyCta / MarketingStickyBar) and the floating chat
           launcher (SiteChatWidget) never cover the last interactive content
           on a page (final CTAs, result cards, share rows). The bars/FAB
           occupy this reserved band, so it does not read as an empty gap; the
           footer follows immediately after. Only applied when the shared
           bottom chrome is present (pages that own their own bottom edge pass
           hideStickyCtas and are excluded). Values sit on the 8px scale. */
        .mkt-main-clearance {
          padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        }
        @media (min-width: 1024px) {
          .mkt-main-clearance { padding-bottom: 80px; }
        }
      `}</style>
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
      <main
        id="main-content"
        tabIndex={-1}
        className={hideStickyCtas ? undefined : "mkt-main-clearance"}
        style={{ flex: 1 }}
      >{children}</main>
      <MarketingFooter />
      {/* Desktop scroll pill (≥1024px + hover) and the mobile-only bottom CTA
          (≤560px / touch). Each self-gates by breakpoint, so exactly one — or
          neither — shows at a time.
          `hideStickyCtas` suppresses BOTH on pages that own the bottom edge
          with their own fixed launcher (e.g. TradeLine's demo bar) — otherwise
          two fixed-bottom elements collide when scrolled. */}
      {!hideStickyCtas && <MarketingStickyBar />}
      {!hideStickyCtas && <MobileStickyCta />}
      {!hideSiteChat && (
        <Suspense fallback={null}>
          <SiteChatWidget />
        </Suspense>
      )}
    </div>
  );
}
