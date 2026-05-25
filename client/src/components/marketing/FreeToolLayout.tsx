/**
 * FreeToolLayout — shared shell for the Brightlocal-style /tools/* surface.
 *
 * Used by GoogleReviewLinkGenerator, LocalSearchChecker, CitationChecker,
 * LocalRankflux. Each tool page renders a `<MarketingLayout>` wrapper +
 * `<PageMeta>` + `<FreeToolLayout>` with its own form and result panel
 * slotted in via the `form` / `result` props.
 *
 * Visual standard: keeps the FreeAudit hero rhythm (centered title +
 * subtitle, dotted-grid backdrop, card with form, optional result panel
 * below) so the new surfaces feel like siblings of the Free Audit page
 * instead of orphans. Light theme only — these are public marketing
 * pages and DESIGN-SYSTEM.md fixes them as light surfaces.
 */
import { type ReactNode, useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Search } from "lucide-react";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";

const SITE_URL = "https://wefixtrades.com";

interface FreeToolLayoutProps {
  /** Short eyebrow above the H1 — e.g. "Free Tool". */
  eyebrow?: string;
  /** Page H1. */
  title: string;
  /** One-line subtitle under the H1. */
  subtitle: string;
  /** Path used in the breadcrumb (e.g. /tools/google-review-link-generator). */
  path: string;
  /** Breadcrumb label for the current page. */
  breadcrumbLabel: string;
  /** The form / input area. */
  form: ReactNode;
  /** Result panel — usually rendered conditionally by the caller. */
  result?: ReactNode;
  /** SEO body content + FAQ rendered below the tool. */
  children?: ReactNode;
}

export default function FreeToolLayout({
  eyebrow = "Free Tool",
  title,
  subtitle,
  path,
  breadcrumbLabel,
  form,
  result,
  children,
}: FreeToolLayoutProps) {
  useBreadcrumbSchema([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Free Tools", url: `${SITE_URL}/tools/free-audit` },
    { name: breadcrumbLabel, url: `${SITE_URL}${path}` },
  ]);

  // Scroll-to-top on mount — wouter doesn't reset scroll on route changes by
  // default and these tool pages are often deep-linked from blog / footer.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <style>{`
        .ftool-page {
          min-height: 100vh;
          background: radial-gradient(circle, rgba(0,0,0,0.13) 1px, transparent 1px),
            linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 55%, rgba(236,242,244,1) 100%);
          background-size: 22px 22px, 100% 100%;
          position: relative;
          margin-top: -92px;
          padding-top: 92px;
          box-sizing: border-box;
        }
        .ftool-container {
          position: relative;
          z-index: 1;
          max-width: 880px;
          margin: 0 auto;
          padding: 110px 16px 80px;
        }
        @media (min-width: 768px) {
          .ftool-container { padding: 120px 24px 80px; }
        }
        .ftool-card {
          background: rgba(255,255,255,0.82);
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 18px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
          padding: 20px;
          position: relative;
          overflow: clip;
        }
        @keyframes ftool-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="ftool-page" data-theme="light">
        <div className="ftool-container">
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link href="/tools/free-audit" style={{ color: "#6b7280", textDecoration: "none" }}>Free Tools</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "#111827" }}>{breadcrumbLabel}</span>
          </nav>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0d3cfc",
              marginBottom: 10,
            }}>
              <Search size={12} strokeWidth={2.2} />
              {eyebrow}
            </div>
            <h1 style={{
              fontSize: "clamp(28px, 4.6vw, 38px)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#1E1E1E",
              margin: "0 0 10px",
              lineHeight: 1.08,
            }}>{title}</h1>
            <p style={{
              fontSize: 16,
              color: "rgba(0,0,0,0.62)",
              maxWidth: "60ch",
              margin: "0 auto 4px",
              lineHeight: 1.55,
            }}>{subtitle}</p>
            <div style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(0,0,0,0.48)",
            }}>
              <span>100% free</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>No signup</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>Results in seconds</span>
            </div>
          </div>

          <div className="ftool-card">{form}</div>

          {result && <div style={{ marginTop: 16 }}>{result}</div>}

          {children && (
            <div style={{
              maxWidth: 640,
              margin: "48px auto 0",
              paddingTop: 28,
              borderTop: "1px solid rgba(0,0,0,0.07)",
              color: "rgba(0,0,0,0.65)",
              lineHeight: 1.7,
              fontSize: 15,
            }}>
              {children}
            </div>
          )}

          {/* Cross-link to the paid Full Audit. Every Brightlocal-style
              tool funnels into the upgrade path; keeps the free tool
              honest as a lead magnet rather than a dead-end utility. */}
          <div style={{
            maxWidth: 640,
            margin: "40px auto 0",
            padding: "18px 20px",
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
            border: "1px solid rgba(13,60,252,0.18)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d3cfc", marginBottom: 4 }}>
              Go deeper
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 }}>
              Full WeFixTrades Audit — $9.80
            </div>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", marginBottom: 12, lineHeight: 1.55 }}>
              Want the complete picture? The Full Audit checks 50+ citation
              sources, 20 keyword rankings, your Google Business Profile,
              competitors, website speed, and gives you a prioritised fix list.
            </div>
            <Link
              href="/tools/free-audit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#0d3cfc",
                color: "#fff",
                padding: "9px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Run the Full Audit
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
