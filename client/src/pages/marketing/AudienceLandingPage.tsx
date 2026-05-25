/**
 * Shared "audience" landing page template (BrightLocal-style /for-agencies,
 * /for-franchises, /for-solo-traders). Three thin page files import this
 * with their own copy + breadcrumb + meta props.
 *
 * Layout: hero -> 3-4 value-prop cards -> pricing teaser -> testimonial
 * placeholder -> final CTA. Re-uses the existing V7 primitives so it
 * inherits the dark mkt.bg surface, Reveal/MONO/SANS rhythm, and the
 * same hero glow as every other marketing page.
 *
 * SEO: each page passes a unique <PageMeta> + a BreadcrumbList JSON-LD
 * via the shared useBreadcrumbSchema hook. The route gets registered in
 * App.tsx, sitemapRoutes.ts, and the prerender allow-list.
 */
import { type LucideIcon } from "lucide-react";
import { Link } from "wouter";
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

export interface ValueProp {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface AudienceLandingPageProps {
  /** Path the page lives at, e.g. "/for-agencies". */
  path: string;
  /** Human label used in BreadcrumbList. */
  breadcrumbLabel: string;
  /** Page <title> (PageMeta appends " · WeFixTrades"). */
  pageTitle: string;
  /** Page <meta description>. */
  pageDescription: string;
  /** Eyebrow shown above the hero headline (italic). */
  heroEyebrow: string;
  /** Mono uppercase product-name slug shown above eyebrow. */
  productName: string;
  /** Hero headline — JSX so the page can colour the second line. */
  heroHeadline: React.ReactNode;
  /** One-line sub under the headline. */
  heroSub: string;
  /** Section eyebrow + title for the value-prop grid. */
  valueEyebrow: string;
  valueTitle: string;
  /** 3-4 value-prop cards. */
  valueProps: ValueProp[];
  /** Pricing teaser headline (the section that links to /pricing). */
  pricingTeaserTitle: string;
  pricingTeaserBody: string;
  /** Testimonial placeholder quote + attribution. */
  testimonialQuote: string;
  testimonialAttribution: string;
  /** Final CTA headline. */
  finalCtaTitle: React.ReactNode;
  /**
   * Wave 3.5 launch-wiring — inline product CTAs in the body. Each
   * audience page passes 3-4 deep links to the products that matter
   * most to that audience so the page is no longer just a /pricing
   * funnel. Optional — pages without this prop render exactly as
   * before.
   */
  productCtas?: { label: string; href: string; tagline?: string }[];
  /**
   * Wave 3.5 launch-wiring — 2-3 deep links to relevant free tools so
   * an audience visitor can sample the product without signing up.
   */
  recommendedFreeTools?: { label: string; href: string }[];
}

export default function AudienceLandingPage(props: AudienceLandingPageProps) {
  const {
    path,
    breadcrumbLabel,
    pageTitle,
    pageDescription,
    heroEyebrow,
    productName,
    heroHeadline,
    heroSub,
    valueEyebrow,
    valueTitle,
    valueProps,
    pricingTeaserTitle,
    pricingTeaserBody,
    testimonialQuote,
    testimonialAttribution,
    finalCtaTitle,
    productCtas,
    recommendedFreeTools,
  } = props;

  useBreadcrumbSchema([
    { name: "Home", url: SITE_URL },
    { name: breadcrumbLabel, url: `${SITE_URL}${path}` },
  ]);

  return (
    <MarketingLayout>
      <PageMeta
        title={pageTitle}
        description={pageDescription}
        canonical={path}
      />
      <V7PageShell>
        <V7Hero
          productName={productName}
          eyebrow={heroEyebrow}
          headline={heroHeadline}
          sub={heroSub}
          ctas={[
            { label: "Start free trial", href: "/signup" },
            { label: "See pricing", href: "/pricing" },
          ]}
        />

        {/* Value-prop cards */}
        <V7Section variant="subtle" padding="80px">
          <V7Container>
            <V7SectionHeading eyebrow={valueEyebrow} title={valueTitle} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {valueProps.map((v, i) => {
                const Icon = v.icon;
                return (
                  <Reveal key={v.title} delay={i * 0.05}>
                    <div
                      style={{
                        background: mkt.sectionLight,
                        borderRadius: 18,
                        padding: "26px 24px",
                        border: `1px solid ${mkt.onDarkBorder}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        height: "100%",
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(13,60,252,0.10)",
                          color: mkt.accent,
                        }}
                      >
                        <Icon size={24} strokeWidth={1.6} />
                      </div>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: mkt.onDark,
                          margin: 0,
                          lineHeight: 1.3,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {v.title}
                      </h3>
                      <p
                        style={{
                          fontSize: 14,
                          lineHeight: 1.55,
                          color: mkt.onDarkMuted,
                          margin: 0,
                        }}
                      >
                        {v.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </V7Container>
        </V7Section>

        {/* Wave 3.5 — inline product CTAs (deep links to the products
           that matter most for this audience). Renders only when
           productCtas is provided. */}
        {productCtas && productCtas.length > 0 && (
          <V7Section padding="64px">
            <V7Container maxWidth={920}>
              <Reveal>
                <V7SectionHeading eyebrow="START HERE" title="Products built for this workflow" />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 16,
                    marginTop: 24,
                  }}
                >
                  {productCtas.map((cta) => (
                    <Link
                      key={cta.href}
                      href={cta.href}
                      style={{
                        background: mkt.sectionLight,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        borderRadius: 14,
                        padding: "18px 18px",
                        textDecoration: "none",
                        color: mkt.onDark,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{cta.label}</span>
                      {cta.tagline && (
                        <span style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.45 }}>{cta.tagline}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </Reveal>
            </V7Container>
          </V7Section>
        )}

        {/* Wave 3.5 — recommended free tools. */}
        {recommendedFreeTools && recommendedFreeTools.length > 0 && (
          <V7Section padding="48px">
            <V7Container maxWidth={760}>
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
                    Recommended free tools
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    {recommendedFreeTools.map((t) => (
                      <Link
                        key={t.href}
                        href={t.href}
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
                        {t.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </Reveal>
            </V7Container>
          </V7Section>
        )}

        {/* Pricing teaser */}
        <V7Section padding="72px">
          <V7Container maxWidth={760}>
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
                  Pricing
                </p>
                <h2
                  style={{
                    fontSize: "clamp(28px, 4vw, 40px)",
                    fontWeight: 700,
                    color: mkt.onDark,
                    marginBottom: 16,
                    letterSpacing: "-0.025em",
                    lineHeight: 1.15,
                    fontFamily: SANS,
                  }}
                >
                  {pricingTeaserTitle}
                </h2>
                <p
                  style={{
                    fontSize: 16,
                    color: mkt.onDarkMuted,
                    lineHeight: 1.6,
                    margin: "0 auto 24px",
                    maxWidth: 620,
                  }}
                >
                  {pricingTeaserBody}
                </p>
                <Link
                  href="/pricing"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 22px",
                    borderRadius: 10,
                    background: "transparent",
                    color: mkt.onDark,
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    border: `1px solid ${mkt.onDarkBorder}`,
                  }}
                >
                  See full pricing
                </Link>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* Testimonial placeholder */}
        <V7Section variant="subtle" padding="80px">
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

        <V7FinalCta
          title={finalCtaTitle}
          primaryCta={{ label: "Start free trial", href: "/signup" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
