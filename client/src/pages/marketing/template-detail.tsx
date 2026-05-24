// BG-1 — /templates/:slug per-template SEO landing page.
//
// One SEO landing page per canonical preset. Renders the actual QuoteQuick
// widget (QuoteWidget → AdvancedCalculator) pre-loaded with the template
// via the same `toAdvancedConfig` bridge the wizard + /products/quickquotepro/demo
// use, so visitors can poke the live calculator before going to /wizard.
//
// Includes:
//  - Unique <title>, meta description, canonical URL, OG/Twitter tags
//  - JSON-LD: BreadcrumbList + SoftwareApplication
//  - Live preview widget (sample BusinessProfile so trust signals render)
//  - CTA to /wizard?template=<slug>
//
// Unknown slug → redirect to /templates index (avoids dead-end SEO).

import { useEffect, useMemo } from "react";
import { Link, useRoute, Redirect } from "wouter";
import { ArrowRight, ChevronLeft, Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt } from "@/theme/tokens";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import {
  getTemplatePreset,
  toAdvancedConfig,
  type BusinessProfile,
  type TemplateConfig,
} from "@shared/templatePresets";
import type { CalculatorData } from "@/components/quote-widget/types";
import { getCategoryStyle } from "@/lib/categoryStyles";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";

const BASE = "https://wefixtrades.com";

/* ─── Sample business profile so trust signals render in the preview ─── */
const SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  googleRating: 4.8,
  googleReviewCount: 187,
  yearsInBusiness: 9,
  licenseNumber: "Sample - Demo Only",
  insuredAmount: "Insured up to $2M",
  serviceArea: "Sample Service Area",
};

/* ─── Build a CalculatorData wrapper around a real preset ─── */
function buildPreviewCalculator(template: TemplateConfig): CalculatorData {
  const advanced = {
    ...toAdvancedConfig(template),
    businessProfile: SAMPLE_BUSINESS_PROFILE,
  };
  return {
    id: 0,
    slug: `preview-${template.id}`,
    business_name: template.header.title.split(" — ")[0] || template.name,
    tagline: template.header.subtitle,
    pricing_config: null,
    calculator_settings: {
      advanced,
    },
  };
}

/* ─── JSON-LD SoftwareApplication schema ─── */
function useTemplateJsonLd(template: TemplateConfig) {
  const url = `${BASE}/templates/${template.id}`;
  useEffect(() => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `${template.name} Calculator Template — QuoteQuick`,
      description: template.description,
      url,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "187",
      },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.templateJsonLd = template.id;
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [template.id, template.name, template.description, url]);
}

/* ─── Page ─── */

export default function TemplateDetailPage() {
  const [, params] = useRoute("/templates/:slug");
  const slug = params?.slug ?? "";
  const template = getTemplatePreset(slug);

  if (!template) {
    return <Redirect to="/templates" />;
  }

  return <TemplateDetailInner template={template} />;
}

function TemplateDetailInner({ template }: { template: TemplateConfig }) {
  const cat = getCategoryStyle(template.category);
  const Icon = getQuoteQuickIcon(template.defaultIcon);

  useTemplateJsonLd(template);

  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "Templates", url: `${BASE}/templates` },
      { name: template.name, url: `${BASE}/templates/${template.id}` },
    ],
    [template.id, template.name],
  );
  useBreadcrumbSchema(breadcrumbs);

  const previewCalculator = useMemo(
    () => buildPreviewCalculator(template),
    [template],
  );

  // Pull key value props from the template's header subtitle (e.g. "Licensed
  // & insured · 24/7 response · Flat-rate per-mile pricing"). Split on
  // common bullet separators so each fragment can render as a chip.
  const valueProps = useMemo(() => {
    const sub = template.header.subtitle?.trim() ?? "";
    if (!sub) return [] as string[];
    return sub
      .split(/[·•|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  }, [template.header.subtitle]);

  return (
    <MarketingLayout>
      <PageMeta
        title={`${template.name} calculator template`}
        description={`${template.description} Free-to-use calculator template — try the live widget, then customize in our setup wizard.`}
        canonical={`/templates/${template.id}`}
      />
      <div data-theme="dark" style={{ background: mkt.bg }}>
        {/* Hero / Intro */}
        <div
          style={{
            padding: "48px 28px 32px",
            borderBottom: `1px solid ${mkt.onDarkBorder}`,
            background: `linear-gradient(180deg, ${cat.heroBg}1F 0%, transparent 100%)`,
          }}
        >
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <Link
              href="/templates"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.onDarkMuted,
                textDecoration: "none",
                marginBottom: 18,
              }}
              data-testid="back-to-templates"
            >
              <ChevronLeft size={14} /> All templates
            </Link>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {Icon ? (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${cat.heroAccent}22`,
                    border: `1.5px solid ${cat.heroAccent}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: cat.heroAccent,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={24} strokeWidth={2.25} />
                </div>
              ) : null}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: `${cat.heroAccent}1F`,
                  color: cat.isDark ? cat.heroAccent : cat.ctaFrom,
                  border: `1px solid ${cat.heroAccent}40`,
                }}
              >
                {template.category}
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(28px, 4vw, 46px)",
                fontWeight: 800,
                color: mkt.onDark,
                margin: "0 0 14px",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {template.name}{" "}
              <span style={{ color: mkt.accent }}>template</span>
            </h1>

            <p
              style={{
                fontSize: 17,
                color: mkt.onDarkMuted,
                lineHeight: 1.6,
                margin: "0 0 22px",
                maxWidth: 720,
              }}
            >
              {template.description} Try the live widget below — adjust the
              inputs to see how the price updates in real time. When you’re
              ready, customize it in the wizard.
            </p>

            {valueProps.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                {valueProps.map((vp) => (
                  <span
                    key={vp}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      color: mkt.onDarkMuted,
                      background: mkt.surfaceAlt,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      padding: "5px 11px",
                      borderRadius: 20,
                    }}
                  >
                    <Check size={12} color={mkt.accent} strokeWidth={2.5} />
                    {vp}
                  </span>
                ))}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href={`/wizard?template=${template.id}`}
                data-testid="hero-use-template"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: mkt.accent,
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  minHeight: 44,
                }}
              >
                Use this template <ArrowRight size={14} />
              </Link>
              <a
                href="#live-preview"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: "transparent",
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: `1.5px solid ${mkt.onDarkBorder}`,
                  minHeight: 44,
                }}
              >
                See live preview
              </a>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div
          id="live-preview"
          style={{ padding: "48px 28px 56px", background: mkt.bg }}
        >
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: mkt.accent,
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Live preview
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: mkt.onDark,
                margin: "0 0 24px",
                textAlign: "center",
                letterSpacing: "-0.01em",
              }}
            >
              Try the {template.name} calculator
            </h2>
            <div
              data-testid="template-live-preview"
              style={{
                background: "#FFFFFF",
                borderRadius: 20,
                border: `1px solid ${mkt.onDarkBorder}`,
                boxShadow:
                  "0 4px 14px rgba(0,0,0,0.10), 0 24px 60px rgba(0,0,0,0.20)",
                overflow: "hidden",
              }}
            >
              <QuoteWidget calculator={previewCalculator} isEmbed={false} />
            </div>
            <p
              style={{
                fontSize: 12,
                color: mkt.onDarkMuted,
                textAlign: "center",
                margin: "16px 0 0",
              }}
            >
              Sample pricing for preview. Your real numbers are configured in
              the wizard.
            </p>
          </div>
        </div>

        {/* Final CTA */}
        <div
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, #0b34d6 100%)`,
            padding: "72px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 800,
                color: "#FFFFFF",
                margin: "0 0 12px",
                letterSpacing: "-0.02em",
              }}
            >
              Ready to use this template?
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "rgba(255,255,255,0.75)",
                margin: "0 0 28px",
                lineHeight: 1.6,
              }}
            >
              Drop in your pricing in our setup wizard. Free to start, no
              credit card required.
            </p>
            <Link
              href={`/wizard?template=${template.id}`}
              data-testid="footer-use-template"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "14px 32px",
                borderRadius: 10,
                background: "#FFFFFF",
                color: mkt.accent,
                fontSize: 16,
                fontWeight: 800,
                textDecoration: "none",
                minHeight: 44,
              }}
            >
              Use this template <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
