/**
 * Shared "WeFixTrades vs {Competitor}" comparison landing template.
 *
 * Each per-competitor page (/wefixtrades-vs-jobber, /wefixtrades-vs-housecall-pro,
 * /wefixtrades-vs-servicetitan) is a thin wrapper that hands this component
 * its competitor data + meta. Layout follows the existing V7 primitives so
 * the page inherits the dark mkt.bg surface, Reveal/MONO/SANS rhythm, the
 * hero glow, and the same final CTA used by /for-agencies and /contentflow.
 *
 * Tone: honest. We acknowledge the competitor's strengths. Biased "we win
 * everything" comparisons get penalised by Google AND undermine the trust
 * we're trying to build with intent searches ("X alternative" / "X vs Y").
 *
 * SEO:
 *   - PageMeta with canonical
 *   - BreadcrumbList JSON-LD (Home › Compare › vs X)
 *   - FAQPage JSON-LD (5-7 Q&As)
 *   - Article JSON-LD (long-form ~1500-2000 words)
 *   - Internal links to /products/* feature pages
 *
 * Registered in:
 *   - client/src/App.tsx
 *   - server/routes/sitemapRoutes.ts
 *   - scripts/seo/prerender-routes.mjs
 *   - client/src/pages/marketing/SitemapPage.tsx
 *   - client/src/components/marketing/MarketingLayout.tsx (footer)
 */
import { type ReactNode } from "react";
import { Link } from "wouter";
import { Check, X as XIcon, Minus } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import {
  V7Hero,
  V7Section,
  V7Container,
  V7PageShell,
  V7SectionHeading,
  V7FinalCta,
} from "@/components/marketing/v7";
import { Reveal, MONO, SANS } from "@/components/effortel-blocks";
import { mkt } from "@/theme/tokens";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { SITE_URL } from "@/lib/seo/pageMeta";
import {
  faqSchema,
  articleSchema,
  type FaqItem,
} from "@/lib/seo/jsonLd";

/* ─── Types ────────────────────────────────────────────────────── */

export type MatrixValue = true | false | "partial" | string;

export interface TldrRow {
  label: string;
  us: string;
  them: string;
}

export interface MatrixRow {
  feature: string;
  us: MatrixValue;
  them: MatrixValue;
  /** Optional fine-print note shown under the feature label. */
  note?: string;
}

export interface CompareLandingPageProps {
  /** Path the page lives at, e.g. "/wefixtrades-vs-jobber". */
  path: string;
  /** Competitor name as users search for it, e.g. "Jobber". */
  competitorName: string;
  /** Possessive for headings: "Jobber's", "Housecall Pro's". */
  competitorPossessive: string;
  /** Page <title>. */
  pageTitle: string;
  /** Page <meta description> — under 160 chars. */
  pageDescription: string;
  /** Keywords for SERPs. */
  keywords: string[];
  /** Hero headline (JSX so the second line can be accent-coloured). */
  heroHeadline: ReactNode;
  /** One-line sub under the headline. */
  heroSub: string;
  /** 8-10 row TL;DR table (pricing, AI, target customer, setup, etc.). */
  tldrRows: TldrRow[];
  /** 20-30 row side-by-side feature matrix. */
  matrixRows: MatrixRow[];
  /** Pricing bullets per side. */
  ourPricing: string[];
  theirPricing: string[];
  /** "When {Competitor} is better" — honest 3-4 bullet list. */
  whenThemBetter: string[];
  /** "When WeFixTrades is better" — 3-4 bullet list. */
  whenUsBetter: string[];
  /** Testimonial placeholder. */
  testimonialQuote: string;
  testimonialAttribution: string;
  /** 5-7 FAQ items. Rendered + emitted as FAQPage JSON-LD. */
  faqItems: FaqItem[];
  /** Final CTA headline. */
  finalCtaTitle: ReactNode;
  /** ISO date for Article JSON-LD. */
  publishedDate: string;
  /**
   * Wave 3.5 launch-wiring — products referenced in body copy. The
   * page renders these as a "Products mentioned" link strip above the
   * FAQ so every named product (MapGuard, ContentFlow, TradeLine,
   * ReputationShield) becomes deep-linkable from the compare page
   * instead of being plain text inside data tables. Optional.
   */
  productsMentioned?: { label: string; href: string }[];
}

/* ─── Cell renderer for the matrix ─────────────────────────────── */

function MatrixCell({ value }: { value: MatrixValue }) {
  if (value === true) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "rgba(34,197,94,0.14)",
          color: "rgb(74,222,128)",
        }}
        aria-label="Yes"
      >
        <Check size={16} strokeWidth={2.5} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "rgba(248,113,113,0.10)",
          color: "rgb(248,113,113)",
        }}
        aria-label="No"
      >
        <XIcon size={16} strokeWidth={2.5} />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "rgba(250,204,21,0.14)",
          color: "rgb(250,204,21)",
        }}
        aria-label="Partial"
      >
        <Minus size={16} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        color: mkt.onDarkMuted,
        letterSpacing: "0.02em",
      }}
    >
      {value}
    </span>
  );
}

/* ─── Internal links — keep the topic clusters tight ────────────── */
const INTERNAL_LINKS = [
  { href: "/products/tradeline", label: "24/7 TradeLine (AI voice)" },
  { href: "/products/contentflow", label: "ContentFlow (AI content)" },
  { href: "/products/mapguard", label: "MapGuard (Google Business)" },
  { href: "/products/reputationshield", label: "ReputationShield" },
  { href: "/products/quickquotepro", label: "QuoteQuick" },
  { href: "/pricing", label: "Full pricing" },
];

/* ════════════════════════════════════════════════════════════════ */

export default function CompareLandingPage(props: CompareLandingPageProps) {
  const {
    path,
    competitorName,
    competitorPossessive,
    pageTitle,
    pageDescription,
    keywords,
    heroHeadline,
    heroSub,
    tldrRows,
    matrixRows,
    ourPricing,
    theirPricing,
    whenThemBetter,
    whenUsBetter,
    testimonialQuote,
    testimonialAttribution,
    faqItems,
    finalCtaTitle,
    publishedDate,
    productsMentioned,
  } = props;

  const canonical = `${SITE_URL}${path}`;

  // No bare /compare index route exists (only /compare/:slug), so an
  // intermediate "Compare" breadcrumb pointed at a 404 in the BreadcrumbList
  // JSON-LD. Drop the level → Home › vs X (both resolve).
  useBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: `vs ${competitorName}`, url: canonical },
  ]);

  const jsonLd = [
    faqSchema(faqItems),
    articleSchema({
      title: pageTitle,
      description: pageDescription,
      datePublished: publishedDate,
      author: "WeFixTrades",
      url: canonical,
    }),
  ];

  return (
    <MarketingLayout>
      <PageMeta
        title={pageTitle}
        description={pageDescription}
        canonical={path}
        keywords={keywords}
        ogType="article"
        jsonLd={jsonLd}
      />
      <V7PageShell>
        {/* ── Hero ──────────────────────────────────────────── */}
        <V7Hero
          productName={`vs ${competitorName}`}
          eyebrow={`Honest comparison — we're better in some categories, ${competitorName} is better in others.`}
          headline={heroHeadline}
          sub={heroSub}
          ctas={[
            { label: "Start free trial", href: "/signup" },
            { label: "See full pricing", href: "/pricing" },
          ]}
        />

        {/* ── TL;DR table ───────────────────────────────────── */}
        <V7Section variant="subtle" padding="72px">
          <V7Container maxWidth={980}>
            <V7SectionHeading
              eyebrow="TL;DR"
              title={
                <>
                  At a glance: WeFixTrades vs {competitorName}
                </>
              }
              sub="The eight to ten things most operators ask about before they switch."
            />
            <Reveal>
              <div
                style={{
                  background: mkt.sectionLight,
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                {/* Wave 113 — inner horizontal-scroll viewport so narrow
                    phones scroll the "them" column into view instead of the
                    card's overflow:hidden clipping it. Desktop fits, so no
                    scrollbar appears and the layout is unchanged. */}
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(104px, 1.2fr) 1fr 1fr",
                      minWidth: 0,
                      background: "rgba(255,255,255,0.04)",
                      borderBottom: `1px solid ${mkt.onDarkBorder}`,
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: mkt.onDarkFaint,
                    }}
                  >
                    <div style={{ padding: "14px 18px" }}>Category</div>
                    <div style={{ padding: "14px 18px", color: mkt.accent }}>WeFixTrades</div>
                    <div style={{ padding: "14px 18px" }}>{competitorName}</div>
                  </div>
                  {tldrRows.map((r, i) => (
                    <div
                      key={r.label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(104px, 1.2fr) 1fr 1fr",
                        minWidth: 0,
                        borderBottom: i < tldrRows.length - 1 ? `1px solid ${mkt.onDarkBorder}` : undefined,
                        // Wave 112 — fontSize bumped 14 → 15 and body cells
                        // promoted from onDarkMuted → onDark for max readability.
                        // Alex flagged "text must be visible very well".
                        fontSize: 15,
                        fontFamily: SANS,
                      }}
                    >
                      <div
                        style={{
                          padding: "16px 18px",
                          color: mkt.onDark,
                          fontWeight: 600,
                        }}
                      >
                        {r.label}
                      </div>
                      <div style={{ padding: "16px 18px", color: mkt.onDark, lineHeight: 1.5 }}>
                        {r.us}
                      </div>
                      <div style={{ padding: "16px 18px", color: "rgba(232,239,238,0.78)", lineHeight: 1.5 }}>
                        {r.them}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* ── Feature matrix ────────────────────────────────── */}
        <V7Section padding="80px">
          <V7Container maxWidth={1080}>
            <V7SectionHeading
              eyebrow="Feature matrix"
              title={<>Side-by-side: every feature that matters</>}
              sub={`Twenty-plus capabilities trades operators evaluate when they shortlist WeFixTrades against ${competitorName}. Yellow = partial / lighter implementation.`}
            />
            <Reveal>
              <div
                style={{
                  background: mkt.sectionLight,
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 18,
                  overflow: "hidden",
                }}
              >
                {/* Wave 113 — inner horizontal-scroll viewport so narrow
                    phones scroll the competitor column into view instead of
                    the card's overflow:hidden clipping it. The grid is ~440px
                    min (220+110+110); desktop fits with no scrollbar. */}
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(120px, 1.6fr) minmax(0, 1fr) minmax(0, 1fr)",
                      minWidth: 0,
                      background: "rgba(255,255,255,0.04)",
                      borderBottom: `1px solid ${mkt.onDarkBorder}`,
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: mkt.onDarkFaint,
                    }}
                  >
                    <div style={{ padding: "14px 18px" }}>Feature</div>
                    <div style={{ padding: "14px 12px", color: mkt.accent, textAlign: "center" }}>
                      WeFixTrades
                    </div>
                    <div style={{ padding: "14px 12px", textAlign: "center" }}>
                      {competitorName}
                    </div>
                  </div>
                  {matrixRows.map((row, i) => (
                    <div
                      key={row.feature}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(120px, 1.6fr) minmax(0, 1fr) minmax(0, 1fr)",
                        minWidth: 0,
                        borderBottom: i < matrixRows.length - 1 ? `1px solid ${mkt.onDarkBorder}` : undefined,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ padding: "14px 18px", fontSize: 15, color: mkt.onDark, fontFamily: SANS }}>
                        {/* Wave 112 — bumped fontSize 14 → 15, note 12 → 13,
                            note color faint → muted (still secondary but legible). */}
                        <div style={{ fontWeight: 500 }}>{row.feature}</div>
                        {row.note && (
                          <div
                            style={{
                              fontSize: 13,
                              color: mkt.onDarkMuted,
                              marginTop: 3,
                              lineHeight: 1.45,
                            }}
                          >
                            {row.note}
                          </div>
                        )}
                      </div>
                      <div style={{ padding: "12px 12px", display: "flex", justifyContent: "center" }}>
                        <MatrixCell value={row.us} />
                      </div>
                      <div style={{ padding: "12px 12px", display: "flex", justifyContent: "center" }}>
                        <MatrixCell value={row.them} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: mkt.onDarkFaint,
                  textAlign: "center",
                  marginTop: 16,
                  fontFamily: SANS,
                }}
              >
                Public pricing + feature data as of {publishedDate}. Spotted something out of date?{" "}
                <a href="/contact" style={{ color: mkt.accent, textDecoration: "none" }}>
                  Tell us
                </a>{" "}
                and we&rsquo;ll fix it.
              </p>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* ── Pricing comparison ────────────────────────────── */}
        <V7Section variant="subtle" padding="80px">
          <V7Container maxWidth={980}>
            <V7SectionHeading
              eyebrow="Pricing"
              title={<>What you actually pay</>}
              sub={`Our pricing as of ${publishedDate}. ${competitorName}'s enterprise tiers are quote-on-request and not publicly listed — any figures shown for them are third-party estimates, not official pricing.`}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              <Reveal>
                <div
                  style={{
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.accent}`,
                    borderRadius: 18,
                    padding: "28px 26px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: mkt.accent,
                      marginBottom: 10,
                    }}
                  >
                    WeFixTrades
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {ourPricing.map((line) => (
                      <li
                        key={line}
                        style={{
                          fontSize: 14,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.5,
                          paddingLeft: 18,
                          position: "relative",
                          fontFamily: SANS,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 7,
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: mkt.accent,
                          }}
                        />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={0.05}>
                <div
                  style={{
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 18,
                    padding: "28px 26px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: mkt.onDarkFaint,
                      marginBottom: 10,
                    }}
                  >
                    {competitorName}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {theirPricing.map((line) => (
                      <li
                        key={line}
                        style={{
                          fontSize: 14,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.5,
                          paddingLeft: 18,
                          position: "relative",
                          fontFamily: SANS,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 7,
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: mkt.onDarkFaint,
                          }}
                        />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </V7Container>
        </V7Section>

        {/* ── Honest "when they're better / when we're better" ── */}
        <V7Section padding="80px">
          <V7Container>
            <V7SectionHeading
              eyebrow="Honest take"
              title={<>Pick the right tool for the job</>}
              sub={`We don't think WeFixTrades is the right call for every trades business. Here's a straight read on when ${competitorName} is actually the smarter pick — and when we are.`}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              <Reveal>
                <div
                  style={{
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 18,
                    padding: "28px 26px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: mkt.onDark,
                      margin: "0 0 14px",
                      letterSpacing: "-0.01em",
                      fontFamily: SANS,
                    }}
                  >
                    When {competitorName} is the better choice
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {whenThemBetter.map((line) => (
                      <li
                        key={line}
                        style={{
                          fontSize: 14,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.55,
                          paddingLeft: 20,
                          position: "relative",
                          fontFamily: SANS,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 2,
                            color: mkt.onDarkFaint,
                          }}
                        >
                          —
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={0.05}>
                <div
                  style={{
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.accent}`,
                    borderRadius: 18,
                    padding: "28px 26px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: mkt.onDark,
                      margin: "0 0 14px",
                      letterSpacing: "-0.01em",
                      fontFamily: SANS,
                    }}
                  >
                    When WeFixTrades is the better choice
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {whenUsBetter.map((line) => (
                      <li
                        key={line}
                        style={{
                          fontSize: 14,
                          color: mkt.onDarkMuted,
                          lineHeight: 1.55,
                          paddingLeft: 20,
                          position: "relative",
                          fontFamily: SANS,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 2,
                            color: mkt.accent,
                          }}
                        >
                          +
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </V7Container>
        </V7Section>

        {/* ── Testimonial ───────────────────────────────────── */}
        <V7Section variant="subtle" padding="72px">
          <V7Container maxWidth={820}>
            <Reveal>
              <div
                style={{
                  background: mkt.sectionLight,
                  borderRadius: 24,
                  padding: "48px 32px",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: mkt.accent,
                    marginBottom: 18,
                  }}
                >
                  In their words
                </p>
                <blockquote
                  style={{
                    fontSize: "clamp(20px, 2.6vw, 26px)",
                    lineHeight: 1.35,
                    color: mkt.onDark,
                    margin: "0 0 20px",
                    letterSpacing: "-0.01em",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{testimonialQuote}&rdquo;
                </blockquote>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: mkt.onDarkFaint,
                    margin: 0,
                  }}
                >
                  {testimonialAttribution}
                </p>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* Wave 3.5 launch-wiring — products referenced anywhere in this
           page (matrix rows, FAQ answers) get deep-linkable anchors here
           so the compare page is no longer a dead-end for product
           discovery. Optional prop; renders nothing when absent. */}
        {productsMentioned && productsMentioned.length > 0 && (
          <V7Section padding="48px">
            <V7Container maxWidth={820}>
              <Reveal>
                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: mkt.accent,
                      marginBottom: 14,
                    }}
                  >
                    Products mentioned
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    {productsMentioned.map((p) => (
                      <Link
                        key={p.href}
                        href={p.href}
                        style={{
                          fontSize: 13,
                          padding: "8px 14px",
                          borderRadius: 999,
                          background: "transparent",
                          color: mkt.onDark,
                          border: `1px solid ${mkt.onDarkBorder}`,
                          textDecoration: "none",
                        }}
                      >
                        {p.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </Reveal>
            </V7Container>
          </V7Section>
        )}

        {/* ── FAQ — also emitted as FAQPage JSON-LD ─────────── */}
        <V7Section padding="80px">
          <V7Container maxWidth={820}>
            <V7SectionHeading
              eyebrow="Common questions"
              title={<>FAQ</>}
              sub={`The questions trades operators ask most often before switching from ${competitorPossessive} platform.`}
            />
            <Reveal>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {faqItems.map((item) => (
                  <details
                    key={item.question}
                    style={{
                      background: mkt.sectionLight,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 14,
                      padding: "18px 22px",
                    }}
                  >
                    <summary
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: mkt.onDark,
                        cursor: "pointer",
                        listStyle: "none",
                        fontFamily: SANS,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {item.question}
                    </summary>
                    <p
                      style={{
                        marginTop: 12,
                        marginBottom: 0,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: mkt.onDarkMuted,
                        fontFamily: SANS,
                      }}
                    >
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* ── Internal links — feed the topic cluster ───────── */}
        <V7Section variant="subtle" padding="60px">
          <V7Container maxWidth={980}>
            <Reveal>
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: mkt.accent,
                    marginBottom: 14,
                  }}
                >
                  Dig deeper
                </p>
                <h2
                  style={{
                    fontSize: "clamp(24px, 3vw, 32px)",
                    fontWeight: 700,
                    color: mkt.onDark,
                    margin: "0 0 24px",
                    letterSpacing: "-0.02em",
                    fontFamily: SANS,
                  }}
                >
                  Explore the products behind the comparison
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "center",
                  }}
                >
                  {INTERNAL_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "10px 18px",
                        borderRadius: 999,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        background: "transparent",
                        color: mkt.onDark,
                        fontFamily: MONO,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textDecoration: "none",
                      }}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        <V7FinalCta
          title={finalCtaTitle}
          primaryCta={{ label: "Start free trial", href: "/signup" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
