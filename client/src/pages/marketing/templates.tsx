// BG-1 — /templates marketing index.
//
// Refresh: replaces the deprecated 10-template marketing registry
// (`@/config/templateConfig`) with the canonical 44-preset catalogue from
// `@shared/templatePresets`. Visuals unified with QuoteQuick gold standard:
// per-category palette (BB-2 deriveStyleFromCategory hero treatments),
// 7-family filter chips, search, and a per-template SEO landing route at
// `/templates/<slug>`.
//
// Cards link to `/templates/<slug>` (SEO landing page) for the primary CTA
// and `/wizard?template=<slug>` for "Use this template". The deprecated
// `/demo/:templateId` route is untouched (handled by a later wave).

import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Search, ArrowRight, Sparkles } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import {
  TEMPLATE_PRESETS,
  type TemplateConfig,
} from "@shared/templatePresets";
import {
  getCategoryStyle,
  FEATURED_TEMPLATE_IDS,
  type CategoryStyleId,
} from "@/lib/categoryStyles";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";

/* ─── Canonical 7-family filter chips (BB-2 palette families) ─── */

interface FilterFamily {
  id: CategoryStyleId | "all";
  label: string;
}

const FILTER_FAMILIES: FilterFamily[] = [
  { id: "all", label: "All" },
  { id: "construction", label: "Construction" },
  { id: "home-improvement", label: "Home Improvement" },
  { id: "cleaning", label: "Cleaning" },
  { id: "outdoor", label: "Outdoor" },
  { id: "emergency", label: "Emergency" },
  { id: "automotive", label: "Automotive" },
  { id: "professional", label: "Professional" },
];

/** Resolve a preset's family id via the same logic the wizard gallery uses. */
function familyOf(t: TemplateConfig): CategoryStyleId {
  return getCategoryStyle(t.category).id;
}

/* ─── Template card preview — uses category palette + Lucide icon ─── */

/**
 * Wave 42 — REAL calculator screenshots for the first row of templates on
 * /templates. Pre-rendered PNGs live in `client/public/ai-thumbnails/
 * templates/<id>.png` and are captured via Playwright against the dev-only
 * `/internal/template-render/:templateId` route (see
 * `scripts/capture-template-screenshots.mjs`). Re-run that script when this
 * set changes so the thumbnails stay in sync with the live widgets.
 *
 * Replaces the Wave 15 AI-generated illustrations which Alex rejected for
 * misrepresenting the product on a customer-facing marketing surface — the
 * thumbnails now show the actual calculator each template renders.
 */
const AI_THUMBNAIL_TEMPLATE_IDS = new Set<string>([
  "car_towing",
  "driveway_paving",
  "property_cleaning",
  "energy_upgrade",
]);

function aiThumbnailUrl(id: string): string {
  return `/ai-thumbnails/templates/${encodeURIComponent(id)}.png`;
}

function TemplateHero({ template }: { template: TemplateConfig }) {
  const cat = getCategoryStyle(template.category);
  const Icon = getQuoteQuickIcon(template.defaultIcon);
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasAiThumb = AI_THUMBNAIL_TEMPLATE_IDS.has(template.id) && !thumbFailed;

  return (
    <div
      style={{
        position: "relative",
        height: 132,
        background: cat.heroBg,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Subtle accent stripe across hero */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: cat.heroAccent,
          zIndex: 2,
        }}
      />

      {hasAiThumb ? (
        /* Real calculator screenshot (Wave 42 — replaces Wave 15 illustrations).
           `onError` falls back to the icon-chip if the PNG is missing. */
        <img
          src={aiThumbnailUrl(template.id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setThumbFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : Icon ? (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: cat.isDark
              ? `${cat.heroAccent}33`
              : `${cat.heroAccent}22`,
            border: `1.5px solid ${cat.heroAccent}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: cat.heroAccent,
          }}
        >
          <Icon size={24} strokeWidth={2.25} />
        </div>
      ) : (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: cat.isDark
              ? `${cat.heroAccent}33`
              : `${cat.heroAccent}22`,
            border: `1.5px solid ${cat.heroAccent}`,
          }}
        />
      )}
      {/* Featured badge */}
      {FEATURED_TEMPLATE_IDS.has(template.id) ? (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 20,
            background: cat.ctaFrom,
            color: cat.ctaText,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            zIndex: 3,
          }}
        >
          <Sparkles size={12} /> Featured
        </span>
      ) : null}
    </div>
  );
}

/* ─── Page ─── */

export default function TemplatesPage() {
  useScrollReveal();
  const [activeFilter, setActiveFilter] = useState<CategoryStyleId | "all">(
    "all",
  );
  const [search, setSearch] = useState("");

  // Title + meta tags handled by <PageMeta> below.

  // Per-family counts (excluding "all")
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of TEMPLATE_PRESETS) {
      const f = familyOf(t);
      counts[f] = (counts[f] ?? 0) + 1;
    }
    return counts;
  }, []);

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATE_PRESETS.filter((t) => {
      if (activeFilter !== "all" && familyOf(t) !== activeFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [activeFilter, search]);

  const totalCount = TEMPLATE_PRESETS.length;

  return (
    <MarketingLayout>
      <PageMeta
        title={`${totalCount} calculator templates for trades`}
        description={`${totalCount} ready-to-use quote calculator templates. Pick one, drop in your pricing, and go live in minutes — instant quotes, no signup needed to preview.`}
        canonical="/templates"
        keywords={["quote calculator templates", "trades calculator templates", "instant quote templates"]}
      />
      <V7PageShell data-theme="light">
        <V7Hero
          productName={`${totalCount} Templates`}
          eyebrow={`${totalCount} ready-to-use calculator templates — pick one and customize`}
          headline={
            <>
              {totalCount} high-converting
              <br />
              <span style={{ color: mkt.accent }}>
                calculator templates.
              </span>
            </>
          }
          sub="Drop in your pricing and go live in minutes. Every template has its own preview page — try the live widget before you commit."
          ctas={[
            { label: "Build Yours Free", href: "/wizard" },
            { label: "Browse Templates ↓", href: "#template-grid" },
          ]}
        />

        {/* Filter + search strip */}
        <div
          style={{
            background: mkt.bg,
            borderBottom: `1px solid ${mkt.onDarkBorder}`,
            position: "sticky",
            top: 72,
            zIndex: 20,
          }}
        >
          <div
            style={{
              maxWidth: 1160,
              margin: "0 auto",
              padding: "14px 28px",
              display: "flex",
              gap: 12,
              flexWrap: "wrap" as const,
              alignItems: "center",
            }}
          >
            {/* Search — top-left help cue */}
            <div
              style={{
                position: "relative",
                flex: "0 1 280px",
                minWidth: 200,
                marginRight: 8,
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: mkt.onDarkMuted,
                  pointerEvents: "none",
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                aria-label="Search calculator templates"
                data-testid="templates-search-input"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 34px",
                  borderRadius: 10,
                  border: `1.5px solid ${mkt.onDarkBorder}`,
                  background: mkt.surfaceAlt,
                  color: mkt.onDark,
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: mkt.onDarkMuted,
                marginRight: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Filter:
            </span>
            {FILTER_FAMILIES.map((f) => {
              const count =
                f.id === "all" ? totalCount : (familyCounts[f.id] ?? 0);
              if (f.id !== "all" && count === 0) return null;
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  data-testid={`filter-${f.id}`}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: `1.5px solid ${active ? mkt.accent : mkt.onDarkBorder}`,
                    background: active ? mkt.accent : "transparent",
                    color: active ? "#FFFFFF" : mkt.onDarkMuted,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    minHeight: 44,
                    display: "inline-flex",
                    alignItems: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  {f.label}
                  <span style={{ marginLeft: 6, opacity: 0.75, fontWeight: 500 }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template grid */}
        <div
          id="template-grid"
          className="templates-grid-section"
          style={{ background: mkt.bg, padding: "56px 16px 96px" }}
        >
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <p
              style={{
                fontSize: 14,
                color: mkt.onDarkMuted,
                marginBottom: 28,
              }}
            >
              Showing <strong>{filtered.length}</strong> of {totalCount} template
              {filtered.length !== 1 ? "s" : ""}
              {activeFilter !== "all"
                ? ` in ${FILTER_FAMILIES.find((f) => f.id === activeFilter)?.label}`
                : ""}
              {search.trim() ? ` matching "${search.trim()}"` : ""}
            </p>

            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  borderRadius: 16,
                  border: `1px dashed ${mkt.onDarkBorder}`,
                  textAlign: "center",
                  color: mkt.onDarkMuted,
                }}
              >
                No templates match. Try a different category or clear search.
              </div>
            ) : (
              <div
                className="templates-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                {filtered.map((template, i) => {
                  const cat = getCategoryStyle(template.category);
                  return (
                    <div
                      key={template.id}
                      data-testid={`template-card-${template.id}`}
                      data-reveal="fade-up"
                      data-delay={String(((i % 3) + 1) * 100)}
                      className="mkt-feature-card"
                      style={{
                        background: mkt.sectionLight ?? mkt.surface,
                        borderRadius: 18,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        overflow: "hidden",
                        boxShadow:
                          "0 1px 3px rgba(0,0,0,0.06), 0 4px 18px rgba(0,0,0,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        maxWidth: 320,
                        minWidth: 0,
                        justifySelf: "center",
                      }}
                    >
                      <TemplateHero template={template} />

                      {/* Card content */}
                      <div
                        style={{
                          padding: "18px 20px 20px",
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <h3
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: mkt.onDark,
                              margin: 0,
                              lineHeight: 1.3,
                            }}
                          >
                            {template.name}
                          </h3>
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              padding: "3px 9px",
                              borderRadius: 20,
                              background: `${cat.heroAccent}1A`,
                              color: cat.isDark ? cat.heroAccent : cat.ctaFrom,
                              whiteSpace: "nowrap" as const,
                              border: `1px solid ${cat.heroAccent}33`,
                            }}
                          >
                            {template.category}
                          </span>
                        </div>

                        <p
                          style={{
                            fontSize: 13,
                            color: mkt.onDarkMuted,
                            lineHeight: 1.55,
                            margin: "0 0 16px",
                            flex: 1,
                          }}
                        >
                          {template.description}
                        </p>

                        {/* CTAs */}
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: "auto",
                          }}
                        >
                          <Link
                            href={`/templates/${template.id}`}
                            data-testid={`preview-cta-${template.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              flex: 1,
                              padding: "10px 0",
                              borderRadius: 10,
                              background: mkt.ctaBg,
                              color: mkt.ctaText,
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: "none",
                              minHeight: 44,
                            }}
                          >
                            Try this template
                          </Link>
                          <Link
                            href={`/wizard?template=${template.id}`}
                            data-testid={`use-cta-${template.id}`}
                            aria-label={`Use ${template.name} template in the wizard`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "10px 14px",
                              borderRadius: 10,
                              background: "transparent",
                              color: mkt.ctaSecondaryText,
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: "none",
                              border: `1px solid ${mkt.ctaSecondaryBorder}`,
                              minHeight: 44,
                            }}
                          >
                            Use <ArrowRight size={12} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <style>{`
            /* Auto-fill grid scales naturally; widen padding + gap on larger viewports */
            @media(min-width:640px){
              .templates-grid-section{padding-left:28px!important;padding-right:28px!important;}
              .templates-grid{gap:16px!important;}
            }
            @media(min-width:900px){
              .templates-grid{gap:24px!important;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))!important;}
            }
          `}</style>
        </div>

        {/* CTA band */}
        <div
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, #0b34d6 100%)`,
            padding: "96px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 40px)",
                fontWeight: 800,
                color: "#FFFFFF",
                margin: "0 0 14px",
                letterSpacing: "-0.02em",
              }}
            >
              Not sure which template to use?
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(255,255,255,0.72)",
                margin: "0 0 36px",
                lineHeight: 1.65,
              }}
            >
              Our setup wizard recommends the best template for your trade,
              pricing model, and goals — then configures it for you.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/wizard"
                style={{
                  display: "inline-block",
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
                Get a Recommendation
              </Link>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 24px",
                  borderRadius: 10,
                  background: "transparent",
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  minHeight: 44,
                }}
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
