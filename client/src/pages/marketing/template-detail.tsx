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

import { useEffect, useMemo, useState } from "react";
import { Link, useRoute, Redirect } from "wouter";
import { ArrowRight, ChevronLeft, Check, Zap, Clock, TrendingUp, ShieldCheck, Monitor, Smartphone } from "lucide-react";
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

/* ─── Sample business profile for the preview. License # and insured amount
   are intentionally omitted: they synthesise a "Licensed #…" trust chip + a
   bottom trust strip that clutter the clean Elfsight-style preview. ─── */
const SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  googleRating: 4.8,
  googleReviewCount: 187,
  yearsInBusiness: 9,
  serviceArea: "Sample Service Area",
};

/* Mix a hex accent toward white to produce a soft, opaque tint — used to wash
   the whole widget background in the chosen accent (premium, not garish). */
function tintToward(hex: string, strength: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (ch: number) => Math.round(ch * strength + 255 * (1 - strength));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/* ─── Build a CalculatorData wrapper around a real preset ─── */
function buildPreviewCalculator(
  template: TemplateConfig,
  accent?: string,
  forceLayout?: "single-column",
): CalculatorData {
  const base = toAdvancedConfig(template);
  // When a light template is recoloured, wash the whole widget (body + field
  // surfaces + result panel) in a soft tint of the chosen accent so the colour
  // change is felt everywhere, not just on the CTA. Layered strengths keep the
  // fields + result panel reading as distinct cards over the body wash.
  const isLight = base.theme === "light";
  const bgTint =
    accent && isLight
      ? {
          bgMode: "solid" as const,
          background: tintToward(accent, 0.04),
          surface: tintToward(accent, 0.09),
          resultsBg: tintToward(accent, 0.13),
        }
      : {};
  const advanced = {
    ...base,
    // The fold toggle reflows by container width, but the widget's responsive
    // breakpoints are viewport-keyed (matchMedia), so a narrowed container
    // alone would still render the desktop two-column layout — misrepresenting
    // real mobile. Forcing single-column in mobile preview makes the toggle
    // truthful: inputs + result stack exactly as they do on a real phone.
    ...(forceLayout ? { layout: forceLayout } : {}),
    // Drop the subtitle in the preview — the clean Elfsight layout is title +
    // inputs + result only.
    header: { ...(base.header ?? {}), subtitle: "" },
    businessProfile: SAMPLE_BUSINESS_PROFILE,
    // The website color tabs override the widget accent live; absent => the
    // template's own theme accent. (The wizard exposes the full palette.)
    // labelLayout 'stacked' = the Elfsight title-above + help-below field
    // style, scoped to the marketing previews (live widgets keep float).
    style: { ...(base.style ?? {}), ...(accent ? { accent } : {}), ...bgTint, labelLayout: "stacked" as const },
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

/* ─── Website color palette (4 premium, industry-agnostic accents). The wizard
   exposes the full picker; the site offers these four, reused on every
   template. Default = Brand Blue. ─── */
const SITE_PALETTE: { name: string; color: string }[] = [
  { name: "Brand Blue", color: "#0D3CFC" },
  { name: "Slate", color: "#334155" },
  { name: "Emerald", color: "#10B981" },
  { name: "Amber", color: "#D97706" },
];

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

  const [accent, setAccent] = useState<string>(SITE_PALETTE[0].color);
  // Elfsight-style in-place desktop↔mobile fold for the live preview.
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  // On a real phone the desktop/mobile toggle is pointless (you're already on
  // mobile) — hide it below the widget's own 560px breakpoint.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const effectiveMode: "desktop" | "mobile" = isMobileViewport ? "mobile" : previewMode;
  // The phone-frame chrome (padding, rounded frame, shadow) only makes sense
  // when previewing mobile FROM a desktop screen. On a real phone we render the
  // widget plainly at full width.
  const showPhoneFrame = !isMobileViewport && previewMode === "mobile";
  const previewCalculator = useMemo(
    () =>
      buildPreviewCalculator(
        template,
        accent,
        effectiveMode === "mobile" ? "single-column" : undefined,
      ),
    [template, accent, effectiveMode],
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
                href={`/wizard?template=${template.id}&accent=${encodeURIComponent(accent)}`}
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
            {/* Color tabs — recolor the preview live. Four site-wide accents
                (the wizard exposes the full picker). Buttons use the shared
                .cs-arrow capsule styling from the blog carousel arrows. */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.onDarkMuted }}>
                Choose a colour
              </span>
              <div className="cs-arrow-group" data-theme="dark" style={{ padding: 5, gap: 6 }} data-testid="template-color-tabs">
                {SITE_PALETTE.map((p) => {
                  const sel = accent === p.color;
                  return (
                    <button
                      key={p.color}
                      type="button"
                      aria-label={p.name}
                      aria-pressed={sel}
                      title={p.name}
                      onClick={() => setAccent(p.color)}
                      style={{
                        width: 34, height: 34, borderRadius: 9, border: "none", cursor: "pointer",
                        background: p.color, display: "grid", placeItems: "center",
                        boxShadow: sel
                          ? "0 0 0 2px rgba(11,13,15,1), 0 0 0 4px rgba(255,255,255,0.9)"
                          : "none",
                        transition: "box-shadow 150ms ease, transform 120ms ease",
                      }}
                    >
                      {sel && <Check size={16} color="rgba(255,255,255,1)" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Elfsight-style floating preview container: white rounded card with a
                toolbar + desktop/mobile fold toggle. The toggle smoothly shrinks the
                LIVE widget into a phone frame in place (the widget reflows by
                container width, so it works for any template/layout). */}
            <div
              data-testid="template-live-preview"
              style={{
                maxWidth: 980,
                margin: "0 auto",
                background: "rgba(255,255,255,1)",
                borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.10), 0 30px 70px rgba(0,0,0,0.28)",
                overflow: "hidden",
              }}
            >
              {/* Toolbar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(0,0,0,0.07)",
                  background: "rgba(255,255,255,1)",
                }}
              >
                <span style={{ width: 70 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.55)", letterSpacing: "0.02em" }}>
                  Live preview
                </span>
                <div
                  role="group"
                  aria-label="Preview device"
                  style={{ display: isMobileViewport ? "none" : "flex", gap: 2, padding: 3, borderRadius: 9, background: "rgba(0,0,0,0.05)", width: 70, justifyContent: "flex-end" }}
                >
                  {([["desktop", Monitor, "Desktop view"], ["mobile", Smartphone, "Mobile view"]] as const).map(([mode, Icon, label]) => {
                    const on = previewMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-label={label}
                        aria-pressed={on}
                        title={label}
                        onClick={() => setPreviewMode(mode)}
                        data-testid={`preview-device-${mode}`}
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: "none",
                          cursor: "pointer",
                          background: on ? "rgba(255,255,255,1)" : "transparent",
                          boxShadow: on ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
                          color: on ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.40)",
                          transition: "background 140ms ease, color 140ms ease",
                        }}
                      >
                        <Icon size={16} strokeWidth={2.25} />
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Fold viewport — the live widget shrinks into a phone frame in place */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: showPhoneFrame ? "28px 16px" : "0",
                  background: showPhoneFrame ? "rgba(0,0,0,0.03)" : "transparent",
                  transition: "padding 500ms cubic-bezier(0.22,1,0.36,1), background 500ms ease",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: showPhoneFrame ? 390 : 980,
                    borderRadius: showPhoneFrame ? 24 : 0,
                    overflow: "hidden",
                    boxShadow: showPhoneFrame ? "0 10px 40px rgba(0,0,0,0.22)" : "none",
                    transition: "max-width 520ms cubic-bezier(0.22,1,0.36,1), border-radius 300ms ease, box-shadow 300ms ease",
                  }}
                >
                  <QuoteWidget calculator={previewCalculator} isEmbed={false} />
                </div>
              </div>
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
            {/* Deeper-edit note → wizard (carries the chosen template + colour). */}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link
                href={`/wizard?template=${template.id}&accent=${encodeURIComponent(accent)}`}
                data-testid="template-deeper-edit"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: mkt.accent, textDecoration: "none" }}
              >
                Need to edit pricing, formulas &amp; logic? Open the full wizard <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* Why an instant quote tool wins — KPI row */}
        <div style={{ padding: "64px 28px", borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, color: mkt.onDark, textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Why trades win with an instant quote tool
            </h2>
            <p style={{ fontSize: 15, color: mkt.onDarkMuted, textAlign: "center", maxWidth: 560, margin: "0 auto 36px" }}>
              An online calculator turns website visitors into booked jobs — automatically, around the clock.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))", gap: 16 }}>
              {[
                { Icon: Zap, stat: "21×", title: "Respond first, win more", sub: "Leads contacted within 5 minutes convert 21× more often than slow follow-ups." },
                { Icon: Clock, stat: "24/7", title: "Never miss a job", sub: "Your calculator captures and prices leads overnight and on weekends, while you sleep." },
                { Icon: TrendingUp, stat: "2×", title: "Quotes beat forms", sub: "An interactive quote tool converts 2× more website visitors than a plain contact form." },
                { Icon: ShieldCheck, stat: "Pre-qualified", title: "Fewer tire-kickers", sub: "Upfront pricing filters out mismatched budgets so you only quote serious buyers." },
              ].map(({ Icon, stat, title, sub }) => (
                <div key={title} style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 16,
                  padding: "24px 20px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(13,60,252,0.14)" }}>
                    <Icon size={20} color={mkt.accent} />
                  </span>
                  <div style={{ fontSize: 30, fontWeight: 800, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{stat}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark }}>{title}</div>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0 }}>{sub}</p>
                </div>
              ))}
            </div>
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
              href={`/wizard?template=${template.id}&accent=${encodeURIComponent(accent)}`}
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
