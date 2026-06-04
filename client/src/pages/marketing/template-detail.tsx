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

import { memo, useEffect, useMemo, useState } from "react";
import { Link, useRoute, Redirect } from "wouter";
import { ArrowRight, ArrowLeft, ChevronLeft, Check, Zap, Clock, TrendingUp, ShieldCheck, Monitor, Smartphone } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt } from "@/theme/tokens";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import {
  getTemplatePreset,
  toAdvancedConfig,
  TEMPLATE_PRESETS,
  type BusinessProfile,
  type TemplateConfig,
} from "@shared/templatePresets";
import type { CalculatorData } from "@/components/quote-widget/types";
import { getCategoryStyle } from "@/lib/categoryStyles";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";
import { V7PageShell, V7FinalCta } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";

const BASE = "https://wefixtrades.com";

/* Bright cool-grey panel — the Case Studies "great company" slate, reused here
   so the template page adopts the same V7 layout (dark hero → light slate
   rounded panel → dark CTA). Solid inks hold WCAG AA on the #C2D0D6 ground. */
const CS_LIGHT = {
  bg: "#C2D0D6",
  ink: "#0F1418",
  inkMuted: "#3F4549",
  inkFaint: "#4A5258",
} as const;

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

/* ─── Real template thumbnail — a scaled-down live render of the actual
   widget (Elfsight cards show the real calculator, not an icon). Memoised on
   the template so it only mounts once per card. ─── */
const TemplateThumb = memo(function TemplateThumb({ template }: { template: TemplateConfig }) {
  const calc = useMemo(() => buildPreviewCalculator(template), [template]);
  return (
    <div className="tpl-thumb" aria-hidden>
      <div className="tpl-thumb-scale">
        <QuoteWidget calculator={calc} isEmbed={false} />
      </div>
    </div>
  );
});

/* ─── Template picker rail (Elfsight "Select a Template") ───
   Left column on desktop, horizontal strip at the bottom on mobile. Holds the
   colour selector (top), a paginated 2×2 grid of real thumbnails, a category
   filter, and the Continue CTA (bottom). Clicking a card swaps the live
   preview to that template in place. */
const PER_PAGE = 4;
function TemplateRail({
  selectedSlug,
  onSelect,
  accent,
  setAccent,
}: {
  selectedSlug: string;
  onSelect: (slug: string) => void;
  accent: string;
  setAccent: (color: string) => void;
}) {
  const [category, setCategory] = useState<string>("All");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [category]);

  const categories = useMemo<[string, number][]>(() => {
    const counts = new Map<string, number>();
    for (const t of TEMPLATE_PRESETS) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return [["All", TEMPLATE_PRESETS.length], ...entries];
  }, []);
  const shown = useMemo(
    () =>
      category === "All"
        ? TEMPLATE_PRESETS
        : TEMPLATE_PRESETS.filter((t) => t.category === category),
    [category],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PER_PAGE;
  const pageItems = shown.slice(start, start + PER_PAGE);

  return (
    <aside className="tpl-rail" data-testid="template-rail">
      {/* Colour selector — ABOVE the templates */}
      <div className="tpl-rail-block">
        <div className="tpl-cats-head">Choose a colour</div>
        <div className="tpl-color-row" data-testid="template-color-tabs">
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
                className="tpl-swatch"
                style={{
                  background: p.color,
                  boxShadow: sel
                    ? `0 0 0 2px ${CS_LIGHT.bg}, 0 0 0 4px ${p.color}`
                    : "0 0 0 1px rgba(15,20,24,0.12)",
                }}
              >
                {sel && <Check size={14} color="rgba(255,255,255,1)" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tpl-rail-head">
        <span style={{ opacity: 0.4 }}>(</span> Select a template{" "}
        <span style={{ opacity: 0.4 }}>)</span>
      </div>

      {/* 2×2 grid of real thumbnails */}
      <div className="tpl-rail-grid">
        {pageItems.map((t) => {
          const active = t.id === selectedSlug;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              data-testid={`template-rail-card-${t.id}`}
              aria-pressed={active}
              title={t.name}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
              className="tpl-card"
              style={{
                boxShadow: active
                  ? `0 0 0 2px ${mkt.accent}`
                  : "0 0 0 1px rgba(15,20,24,0.10)",
                background: active ? "rgba(13,60,252,0.05)" : "rgba(255,255,255,0.55)",
              }}
            >
              <span className="tpl-card-thumb-wrap">
                <TemplateThumb template={t} />
                {active && (
                  <span className="tpl-card-check">
                    <Check size={12} strokeWidth={3} color="rgba(255,255,255,1)" />
                  </span>
                )}
              </span>
              <span className="tpl-card-name">{t.name}</span>
            </div>
          );
        })}
      </div>

      {/* Pagination — N–M of total */}
      <div className="tpl-pager">
        <span className="tpl-pager-count">
          {start + 1}–{Math.min(start + PER_PAGE, shown.length)} of {shown.length}
        </span>
        <div className="tpl-pager-btns">
          <button
            type="button"
            aria-label="Previous templates"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="tpl-pager-btn"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="More templates"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="tpl-pager-btn"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Categories filter (Elfsight) */}
      <div className="tpl-cats">
        <div className="tpl-cats-head">Categories</div>
        <div className="tpl-cats-list">
          {categories.map(([name, count]) => {
            const on = category === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                aria-pressed={on}
                className="tpl-cat"
                style={{
                  background: on ? "rgba(13,60,252,0.07)" : "transparent",
                  boxShadow: on
                    ? `inset 0 0 0 1px ${mkt.accent}66`
                    : "inset 0 0 0 1px rgba(15,20,24,0.10)",
                }}
              >
                <span className="tpl-cat-name">{name}</span>
                <span className="tpl-cat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Continue with this template (Elfsight bottom CTA) */}
      <Link
        href={`/wizard?template=${selectedSlug}&accent=${encodeURIComponent(accent)}`}
        className="tpl-rail-cta wft-hover-border-white"
        data-testid="rail-continue"
      >
        Continue with this template <ArrowRight size={16} />
      </Link>
    </aside>
  );
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
  // Elfsight "Edit Widget" template picker: the rail swaps the live preview to
  // any other template in place. The page's SEO (meta/canonical/breadcrumb/
  // JSON-LD) stays anchored to the URL `template`; the VISIBLE hero + preview
  // follow the selected one.
  const [selectedSlug, setSelectedSlug] = useState<string>(template.id);
  useEffect(() => setSelectedSlug(template.id), [template.id]);
  const activeTemplate = useMemo(
    () => getTemplatePreset(selectedSlug) ?? template,
    [selectedSlug, template],
  );
  const cat = getCategoryStyle(activeTemplate.category);
  const Icon = getQuoteQuickIcon(activeTemplate.defaultIcon);

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
        activeTemplate,
        accent,
        effectiveMode === "mobile" ? "single-column" : undefined,
      ),
    [activeTemplate, accent, effectiveMode],
  );

  // Pull key value props from the template's header subtitle (e.g. "Licensed
  // & insured · 24/7 response · Flat-rate per-mile pricing"). Split on
  // common bullet separators so each fragment can render as a chip.
  const valueProps = useMemo(() => {
    const sub = activeTemplate.header.subtitle?.trim() ?? "";
    if (!sub) return [] as string[];
    return sub
      .split(/[·•|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  }, [activeTemplate.header.subtitle]);

  return (
    <MarketingLayout>
      <PageMeta
        title={`${template.name} calculator template`}
        description={`${template.description} Free-to-use calculator template — try the live widget, then customize in our setup wizard.`}
        canonical={`/templates/${template.id}`}
      />
      <V7PageShell>
      <div data-theme="dark">
        {/* Hero / Intro */}
        <div
          style={{
            padding: "56px 28px 40px",
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
                {activeTemplate.category}
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
              {activeTemplate.name}{" "}
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
              {activeTemplate.description} Try the live widget below — adjust the
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
                href={`/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`}
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

        {/* Live preview — V7 "Case Studies" bright slate panel. Dark hero
            above, then this #C2D0D6 rounded panel emerging with rounded top
            corners (matches /case-studies "great company"). Text switches to
            dark ink so it reads on the light ground. */}
        <div
          id="live-preview"
          className="tpl-editor-section"
          style={{
            padding: "64px 24px 72px",
            background: CS_LIGHT.bg,
            borderRadius: "32px 32px 0 0",
            marginTop: 32,
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "baseline",
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: CS_LIGHT.inkMuted,
                marginBottom: 14,
              }}
            >
              <span style={{ opacity: 0.4 }}>(</span>
              <span>Live preview</span>
              <span style={{ opacity: 0.4 }}>)</span>
            </div>
            {/* Two-pane editor: template rail (colour selector + catalogue) on
                the left, the title + live widget on the right. */}
            <div className="tpl-editor">
              <TemplateRail selectedSlug={selectedSlug} onSelect={setSelectedSlug} accent={accent} setAccent={setAccent} />
              <div className="tpl-preview">
                {/* Template title + single device toggle, right above the preview */}
                <div className="tpl-preview-titlebar">
                  <h2 className="tpl-preview-title">{activeTemplate.name}</h2>
                  {!isMobileViewport && (
                    <button
                      type="button"
                      onClick={() => setPreviewMode((m) => (m === "desktop" ? "mobile" : "desktop"))}
                      data-testid="preview-device-toggle"
                      aria-label={previewMode === "desktop" ? "Switch to mobile view" : "Switch to desktop view"}
                      title={previewMode === "desktop" ? "Mobile view" : "Desktop view"}
                      className="tpl-device-toggle"
                    >
                      {previewMode === "desktop"
                        ? <Smartphone size={16} strokeWidth={2.25} />
                        : <Monitor size={16} strokeWidth={2.25} />}
                    </button>
                  )}
                </div>
            {/* Elfsight-style preview: the widget renders directly on a white card. */}
            <div
              data-testid="template-live-preview"
              style={{
                position: "relative",
                maxWidth: 980,
                margin: "0 auto",
                background: "rgba(255,255,255,1)",
                borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.10), 0 30px 70px rgba(0,0,0,0.28)",
                overflow: "hidden",
              }}
            >
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
                color: CS_LIGHT.inkFaint,
                textAlign: "center",
                margin: "16px 0 0",
                fontFamily: MONO,
              }}
            >
              Sample pricing for preview. Your real numbers are configured in
              the wizard.
            </p>
            {/* Deeper-edit note → wizard (carries the chosen template + colour). */}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link
                href={`/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`}
                data-testid="template-deeper-edit"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: mkt.accent, textDecoration: "none" }}
              >
                Need to edit pricing, formulas &amp; logic? Open the full wizard <ArrowRight size={14} />
              </Link>
            </div>
              </div>{/* /.tpl-preview */}
            </div>{/* /.tpl-editor */}
            <style>{`
              /* Equal-height columns: CSS grid stretches the rail to the
                 preview's height (item 1). */
              .tpl-editor {
                display: grid; grid-template-columns: 320px minmax(0, 1fr);
                gap: 18px; align-items: stretch;
              }
              .tpl-rail { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
              .tpl-rail-block { display: flex; flex-direction: column; gap: 8px; }
              .tpl-rail-head, .tpl-cats-head {
                font-family: ${MONO}; font-size: 10.5px; font-weight: 600;
                letter-spacing: 0.10em; text-transform: uppercase; color: ${CS_LIGHT.inkMuted};
                padding-left: 2px;
              }
              .tpl-color-row { display: flex; gap: 8px; }
              .tpl-swatch {
                width: 32px; height: 32px; border-radius: 9px; border: none; cursor: pointer;
                display: grid; place-items: center;
                transition: box-shadow 150ms ease, transform 120ms ease;
              }
              .tpl-swatch:hover { transform: translateY(-1px); }

              /* 2×2 catalogue grid (item 2). */
              .tpl-rail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              .tpl-card {
                display: flex; flex-direction: column; gap: 8px;
                padding: 6px; border: none; border-radius: 14px;
                cursor: pointer; text-align: left;
                transition: box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
              }
              .tpl-card:hover { transform: translateY(-2px); }
              .tpl-card-thumb-wrap { position: relative; width: 100%; }
              /* Real template thumbnail — a scaled live widget HARD-clipped to a
                 fixed frame (item 6). contain:strict + the scale transform keep
                 the widget sticky header / min-height / fixed children from
                 escaping the box. */
              .tpl-thumb {
                position: relative; width: 100%; height: 104px;
                border-radius: 10px; overflow: hidden;
                background: rgba(255,255,255,1);
                box-shadow: inset 0 0 0 1px rgba(15,20,24,0.06);
                contain: strict;
              }
              .tpl-thumb-scale {
                position: absolute; top: 0; left: 0;
                width: calc(100% / 0.30); transform: scale(0.30);
                transform-origin: top left; pointer-events: none;
              }
              .tpl-card-check {
                position: absolute; top: 6px; right: 6px; z-index: 2;
                width: 18px; height: 18px; border-radius: 50%;
                background: ${mkt.accent}; display: grid; place-items: center;
              }
              .tpl-card-name {
                font-family: ${SANS}; font-size: 12px; font-weight: 600; line-height: 1.25;
                color: ${CS_LIGHT.ink}; padding: 0 3px 2px;
                overflow: hidden; text-overflow: ellipsis;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
              }

              /* Pagination (item 2). */
              .tpl-pager { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
              .tpl-pager-count { font-family: ${MONO}; font-size: 11px; font-weight: 600; color: ${CS_LIGHT.inkMuted}; }
              .tpl-pager-btns { display: flex; gap: 6px; }
              .tpl-pager-btn {
                width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
                display: grid; place-items: center;
                background: rgba(255,255,255,0.6); border: none;
                box-shadow: inset 0 0 0 1px rgba(15,20,24,0.12);
                color: ${CS_LIGHT.ink};
                transition: background 140ms ease, opacity 140ms ease;
              }
              .tpl-pager-btn:disabled { opacity: 0.35; cursor: default; }

              .tpl-cats { display: flex; flex-direction: column; gap: 8px; }
              .tpl-cats-list {
                display: flex; flex-direction: column; gap: 6px;
                max-height: 150px; overflow-y: auto; scrollbar-width: thin;
              }
              .tpl-cat {
                display: flex; align-items: center; justify-content: space-between;
                padding: 9px 12px; border: none; border-radius: 10px; cursor: pointer;
                transition: background 140ms ease, box-shadow 140ms ease;
              }
              .tpl-cat-name { font-family: ${SANS}; font-size: 12.5px; font-weight: 600; color: ${CS_LIGHT.ink}; }
              .tpl-cat-count { font-family: ${MONO}; font-size: 11px; font-weight: 700; color: ${mkt.accent}; }
              .tpl-rail-cta {
                margin-top: auto;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                padding: 14px; border-radius: 12px;
                background: ${mkt.accent}; color: rgba(255,255,255,1);
                font-family: ${MONO}; font-size: 12px; font-weight: 600;
                letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none;
              }

              .tpl-preview { min-width: 0; display: flex; flex-direction: column; }
              /* Template title right above the preview (item 4). */
              .tpl-preview-titlebar {
                display: flex; align-items: center; justify-content: space-between;
                gap: 12px; margin-bottom: 14px;
              }
              .tpl-preview-title {
                margin: 0; font-family: ${SANS};
                font-size: clamp(22px, 2.4vw, 30px); font-weight: 700;
                letter-spacing: -0.02em; color: ${CS_LIGHT.ink}; line-height: 1.1;
              }
              /* Single device toggle that swaps its icon (item 5). */
              .tpl-device-toggle {
                flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
                display: grid; place-items: center; cursor: pointer; border: none;
                background: rgba(255,255,255,0.7); color: ${CS_LIGHT.ink};
                box-shadow: inset 0 0 0 1px rgba(15,20,24,0.12);
                transition: background 140ms ease, transform 120ms ease;
              }
              .tpl-device-toggle:hover { transform: translateY(-1px); }

              @media (max-width: 760px) {
                .tpl-editor-section { padding-left: 4px !important; padding-right: 4px !important; }
                .tpl-editor { grid-template-columns: 1fr; gap: 14px; align-items: start; }
                .tpl-rail { order: 2; }
                .tpl-preview { order: 1; }
                .tpl-rail-cta { margin-top: 0; }
              }
            `}</style>
          </div>
        </div>

        {/* Why an instant quote tool wins — KPI row (back on the dark ground) */}
        <div style={{ padding: "72px 28px 64px" }}>
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

        {/* Final CTA — V7 gradient closer (slate rounded card on the dark
            ground), matching the Case Studies / product-page rhythm. */}
        <V7FinalCta
          title="Ready to use this template?"
          sub="Drop in your pricing in our setup wizard. Free to start, no credit card required."
          primaryCta={{
            label: "Use this template",
            href: `/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`,
          }}
        />
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
