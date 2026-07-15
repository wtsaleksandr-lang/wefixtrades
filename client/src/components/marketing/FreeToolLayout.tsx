/**
 * FreeToolLayout — shared shell for the Brightlocal-style /tools/* surface.
 *
 * Used by GoogleReviewLinkGenerator, LocalSearchChecker, CitationChecker,
 * LocalRankflux. Each tool page renders a `<MarketingLayout>` wrapper +
 * `<PageMeta>` + `<FreeToolLayout>` with its own form and result panel
 * slotted in via the `form` / `result` props.
 *
 * Visual standard: matches the FreeAudit hero rhythm AND the hard layout
 * rules 4/5 — eyebrow top-left, title LEFT with the tool visual RIGHT
 * (P2-4, night audit 2026-06-11), dotted-grid backdrop, form card in the
 * left column, optional result panel below. Mobile stacks title → form →
 * illustration so the input never sinks below the fold behind artwork.
 * Light theme only — these are public marketing pages and DESIGN-SYSTEM.md
 * fixes them as light surfaces.
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
  /**
   * Wave 15 — optional AI-generated brand visual rendered between the
   * subtitle/trust strip and the form card. Absent → unchanged hero. When
   * supplied the layout shows the image inside a soft brand-aligned frame
   * so every tool page has a distinct visual identity that matches the
   * marketing site palette.
   */
  heroImageSrc?: string;
  /** Alt text for the hero image (required when heroImageSrc is set). */
  heroImageAlt?: string;
  /**
   * Optional rich hero visual (e.g. a <DemoVideo> captured tool loop) rendered
   * in the right-hand hero slot in place of `heroImageSrc`. When supplied it
   * takes precedence over the image and gets the same wide two-column hero
   * treatment. Renders its own framing, so it is dropped straight in.
   */
  heroMedia?: ReactNode;
  /**
   * Give the right-hand hero visual extra width (and a wider container) so a
   * large preview doesn't sit dwarfed next to a tall left column (e.g. tools
   * with a 3-field form). Opt-in per page; leaves the other tool heroes
   * untouched.
   */
  wideVisual?: boolean;
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
  heroImageSrc,
  heroImageAlt,
  heroMedia,
  wideVisual = false,
}: FreeToolLayoutProps) {
  const hasVisual = Boolean(heroMedia) || Boolean(heroImageSrc);
  const wide = wideVisual && hasVisual;
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
        /* P2-4 (night audit 2026-06-11) — hard layout rules 4/5: eyebrow
           top-left, title LEFT + visual RIGHT (was a centered hero with the
           illustration full-width below). Mobile stacks title-first, with
           the FORM above the decorative illustration (P2-5: the input must
           not land below the fold behind artwork). */
        .ftool-container--wide { max-width: 1080px; }
        .ftool-container--xwide { max-width: 1180px; }
        .ftool-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 28px;
          align-items: center;
          margin-bottom: 16px;
        }
        @media (min-width: 900px) {
          .ftool-hero--with-visual {
            grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
            gap: 44px;
          }
          /* wideVisual: shift the balance toward the visual so a large preview
             matches the left column's weight instead of floating small. */
          .ftool-hero--wide-visual {
            grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
            gap: 48px;
          }
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
        @media (prefers-reduced-motion: reduce) {
          @keyframes ftool-spin { to { transform: none; } }
        }
      `}</style>
      <div className="ftool-page" data-theme="light">
        <div className={`ftool-container${hasVisual ? (wide ? " ftool-container--xwide" : " ftool-container--wide") : ""}`}>
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link href="/tools/free-audit" style={{ color: "#6b7280", textDecoration: "none" }}>Free Tools</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "#111827" }}>{breadcrumbLabel}</span>
          </nav>

          {/* Hero — title-left / visual-right (hard rules 4/5). On mobile the
              DOM order gives title → form → illustration. */}
          <div className={`ftool-hero${hasVisual ? " ftool-hero--with-visual" : ""}${wide ? " ftool-hero--wide-visual" : ""}`}>
            <div>
              <div style={{ marginBottom: 24 }}>
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
                  margin: "0 0 4px",
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
            </div>

            {heroMedia ? (
              <div>{heroMedia}</div>
            ) : (
              heroImageSrc && (
                <div
                  style={{
                    borderRadius: 18,
                    overflow: "clip",
                    border: "1px solid rgba(13,60,252,0.18)",
                    background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
                    boxShadow: "0 14px 40px rgba(13,60,252,0.10)",
                    aspectRatio: "16 / 9",
                  }}
                >
                  <img
                    src={heroImageSrc}
                    alt={heroImageAlt ?? ""}
                    loading="lazy"
                    decoding="async"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )
            )}
          </div>

          {result && <div style={{ marginTop: 16 }}>{result}</div>}

          {children && (
            <div style={{
              maxWidth: 820,
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
            maxWidth: 820,
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
