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
