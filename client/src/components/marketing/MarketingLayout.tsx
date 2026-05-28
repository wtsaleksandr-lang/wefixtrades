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
          {/* Wave 11D D5 — MapGuard Suite + Free Tools surface at the top
              of the Products column. BookFlow standalone link dropped (bundled
              inside QuoteQuick per D2). */}
          <ExpandableFooterColumn
            title="Products"
            toggleLabel="All Products"
            links={[
              { href: "/mapguard-suite", label: "MapGuard Suite™" },
              { href: "/free-tools", label: "Free Tools (Hub)" },
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
              { href: "/citation-tracker", label: "Citation Tracker" },
              { href: "/citation-builder", label: "Citation Builder" },
            ]}
          />

          {/* Solutions — first 8 shown above the fold so the visible link
              count matches the Products column (which also surfaces 8 of 15).
              Remaining trades unfold behind "All Solutions". */}
          <ExpandableFooterColumn
            title="Solutions"
            toggleLabel="All Solutions"
            visibleCount={8}
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
              // Wave 16 — long-tail trade pages.
              { href: "/solutions/for-carpenters", label: "Carpenters" },
              { href: "/solutions/for-cabinet-installers", label: "Cabinet Installers" },
              { href: "/solutions/for-chimney-sweeps", label: "Chimney Sweeps" },
              { href: "/solutions/for-concrete", label: "Concrete" },
              { href: "/solutions/for-countertop-installers", label: "Countertop Installers" },
              { href: "/solutions/for-deck-builders", label: "Deck Builders" },
              { href: "/solutions/for-door-installers", label: "Door Installers" },
              { href: "/solutions/for-drywall", label: "Drywall" },
              { href: "/solutions/for-fencing", label: "Fencing" },
              { href: "/solutions/for-flooring", label: "Flooring" },
              { href: "/solutions/for-foundation-repair", label: "Foundation Repair" },
              { href: "/solutions/for-gutter-services", label: "Gutter Services" },
              { href: "/solutions/for-insulation", label: "Insulation" },
              { href: "/solutions/for-masonry", label: "Masonry" },
              { href: "/solutions/for-mold-remediation", label: "Mold Remediation" },
              { href: "/solutions/for-moving-services", label: "Moving Services" },
              { href: "/solutions/for-pool-service", label: "Pool Service" },
              { href: "/solutions/for-septic-services", label: "Septic Services" },
              { href: "/solutions/for-siding", label: "Siding" },
              { href: "/solutions/for-solar", label: "Solar" },
              { href: "/solutions/for-tile-installers", label: "Tile Installers" },
              { href: "/solutions/for-tree-service", label: "Tree Service" },
              { href: "/solutions/for-water-damage-restoration", label: "Water Damage" },
              { href: "/solutions/for-waterproofing", label: "Waterproofing" },
              { href: "/solutions/for-well-water", label: "Well Water" },
              { href: "/solutions/for-window-installers", label: "Window Installers" },
              { href: "/solutions/for-appliance-repair", label: "Appliance Repair" },
              { href: "/solutions/for-junk-removal", label: "Junk Removal" },
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

          {/* Resources — Wave 49: Citation Builder dropped (dupe; already in
              Products and it's a paid service, not a free resource).
              Competitor comparisons moved to the dedicated "Compare" row.
              Login / Dashboard / Sitemap / API Docs moved to the small
              utility row above the divider. */}
          <FooterColumn title="Resources">
            <FtLink href="/about">About Us</FtLink>
            <FtLink href="/contact">Contact Sales</FtLink>
            <FtLink href="/pricing">Pricing</FtLink>
          </FooterColumn>

          {/* Tools — demos + free tools.
              Tools-consolidation: missed-call deleted, MapSnapshot folded
              into the Free Audit "Rank Grid" tab, Quote Demo + Build-with-AI
              relocated under the QuoteQuick product family.
              Wave 11D D5 — top entry now links to the /free-tools hub. */}
          <FooterColumn title="Free Tools">
            <FtLink href="/free-tools">All Free Tools</FtLink>
            <FtLink href="/tools/free-audit">Free Audit</FtLink>
            {/* Free Tools Wave 1 — Brightlocal-style standalone tools, each
                with its own /tools/* URL + lead-magnet page. */}
            {/* Wave 49 — labels shortened so each fits one line at the
                current column width. hrefs unchanged. */}
            <FtLink href="/tools/google-review-link-generator">Review Link Generator</FtLink>
            {/* Wave 6E — BrightLocal-parity SERP viewer (Google + Maps, multi-country / language). */}
            <FtLink href="/tools/local-serp-checker">SERP Checker</FtLink>
            {/* Wave 6F — single-business multi-engine rank snapshot (Google + Brave + Maps). */}
            <FtLink href="/tools/local-rank-tracker">Rank Tracker</FtLink>
            <FtLink href="/tools/citation-checker">Citation Checker</FtLink>
            <FtLink href="/tools/local-rankflux">Rankflux</FtLink>
            {/* Wave 2 — single-shot 5x5 geo-grid rank scan; upsell to MapGuard. */}
            <FtLink href="/tools/local-rank-grid">Rank Grid</FtLink>
            <FtLink href="/products/quickquotepro/demo">Quote Demo</FtLink>
            {/* BI-1 — anonymous AI demo: upload an invoice, AI builds your calculator. */}
            <FtLink href="/products/quickquotepro/build-with-ai">Build with AI</FtLink>
            <FtLink href="/tools/plumbing-ai-content-prompts">Prompt Library</FtLink>
          </FooterColumn>
        </div>
      </div>

      {/* ── Compare row ─────────────────────────────────────────────
          Wave 49 — competitor comparison pages pulled out of the Resources
          column into their own inline row. "Compare" label uses the same
          monospace caps treatment as the column headings but at the link
          font-size so the whole row reads as one unit. */}
      <div className="mkt-footer-compare-wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 0" }}>
        <div
          className="mkt-footer-compare"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "0 20px",
            rowGap: 6,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            Compare
          </div>
          <FtLink href="/wefixtrades-vs-jobber">vs Jobber</FtLink>
          <FtLink href="/wefixtrades-vs-housecall-pro">vs Housecall Pro</FtLink>
          <FtLink href="/wefixtrades-vs-servicetitan">vs ServiceTitan</FtLink>
        </div>
      </div>

      {/* ── Utility row ─────────────────────────────────────────────
          Wave 49 — small Linear/Vercel-style row above the divider for
          Login / Sitemap / API Docs. No heading, low-opacity, dot-
          separated, centred. */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div
          className="mkt-footer-util-row"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "0 16px",
            marginTop: 28,
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          {!isAuthenticated && <Link href="/login" className="mkt-ft-util">Login</Link>}
          {isAuthenticated && <Link href="/dashboard" className="mkt-ft-util">Dashboard</Link>}
          <span style={{ opacity: 0.3 }}>·</span>
          <Link href="/sitemap" className="mkt-ft-util">Sitemap</Link>
          <span style={{ opacity: 0.3 }}>·</span>
          <Link href="/docs/api" className="mkt-ft-util">API Docs</Link>
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
            <Link href="/sms-consent-disclosure" className="mkt-ft-soft" style={legalLinkStyle}>SMS Consent</Link>
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
          color: rgba(255,255,255,0.45);
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

        @media (max-width: 768px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr 1fr;
            row-gap: 24px;
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
