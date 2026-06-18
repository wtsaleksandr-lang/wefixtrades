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
import { Link, useLocation } from "wouter";
import { Search, Upload } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { colors, mkt, shadows } from "@/theme/tokens";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import {
  TEMPLATE_PRESETS,
  collapseLayoutVariants,
  type TemplateConfig,
} from "@shared/templatePresets";
import {
  getCategoryStyle,
  type CategoryStyleId,
} from "@/lib/categoryStyles";
import CalculatorTemplateCard from "@/components/marketing/CalculatorTemplateCard";

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

/* ─── Page ─── */

export default function TemplatesPage() {
  useScrollReveal();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<CategoryStyleId | "all">(
    "all",
  );
  const [search, setSearch] = useState("");

  // Title + meta tags handled by <PageMeta> below.

  // Collapse per-layout variants (…_single_col/_two_col/_multi_col sharing a
  // display name) so the same template title shows as ONE card. Counts,
  // filtering and search all operate on this collapsed catalogue. Layout is an
  // in-editor choice, not a separate listing entry.
  const templates = useMemo(() => collapseLayoutVariants(TEMPLATE_PRESETS), []);

  // Per-family counts (excluding "all")
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      const f = familyOf(t);
      counts[f] = (counts[f] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (activeFilter !== "all" && familyOf(t) !== activeFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [activeFilter, search, templates]);

  const totalCount = templates.length;

  return (
    <MarketingLayout>
      <PageMeta
        title={`${totalCount} calculator templates for trades`}
        description={`${totalCount} ready-to-use quote calculator templates. Pick one, drop in your pricing, and go live in minutes — instant quotes, no signup needed to preview.`}
        canonical="/templates"
        keywords={["quote calculator templates", "trades calculator templates", "instant quote templates"]}
      />
      <V7PageShell>
        <V7Hero
          productName={`${totalCount} Templates`}
          headline={
            <>
              {totalCount} high-converting
              <br />
              <span style={{ color: mkt.accentOnDark }}>
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

        {/* ── AI Upload card ──────────────────────────────────────────
             Sits above the filter strip so it's the first thing visible
             after the hero. A distinct card with an upload icon, 2-line
             copy, and a CTA that lands on /wizard?ai-upload=1. Theme-aware:
             uses mkt tokens so it reads correctly in both light/dark page
             surfaces. No hardcoded hex outside the existing mkt token set. */}
        <div
          style={{
            // Full-width gutter wrapper; the inner maxWidth:1180 then centers to
            // the SAME left edge as the V7Hero column above (hero = 1180 centred).
            // Previously this used maxWidth:1160 + 28px padding, which pushed the
            // card ~38px to the right of the hero headline/buttons (misaligned),
            // and padding-bottom:0 jammed it against the light filter strip.
            padding: "32px 24px 40px",
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div
            data-testid="templates-ai-upload-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 24px",
              borderRadius: 16,
              background: `linear-gradient(135deg, rgba(13,60,252,0.10) 0%, rgba(13,60,252,0.04) 100%)`,
              border: `1.5px solid rgba(13,60,252,0.28)`,
              flexWrap: "wrap" as const,
            }}
          >
            {/* Icon */}
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "rgba(13,60,252,0.14)",
                color: mkt.accent,
              }}
            >
              <Upload size={24} />
            </span>

            {/* Copy */}
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 800,
                  color: mkt.onDark,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.3,
                }}
              >
                Upload your quote — AI builds your calculator
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: mkt.onDarkMuted,
                  lineHeight: 1.5,
                }}
              >
                Have a quote or price list already? Upload a photo, PDF or spreadsheet
                and AI turns it into a working calculator in seconds.
              </p>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={() => navigate("/wizard?ai-upload=1")}
              data-testid="templates-ai-upload-cta"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 22px",
                borderRadius: 10,
                background: mkt.accent,
                color: colors.brand.onDark,
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 44,
                lineHeight: 1.3,
                whiteSpace: "nowrap" as const,
              }}
            >
              <Upload size={16} aria-hidden="true" />
              Try it free
            </button>
          </div>
          </div>
        </div>

        {/* Filter + search strip — LIGHT surface so it reads as part of the
            light template-browsing area below (theme-contrast rule), using
            the canonical dashboard light palette from theme/tokens. Sticks
            flush under the fixed 68px nav — the previous top:72 left a 4px
            see-through slit. */}
        <div
          style={{
            background: colors.dashboard.panel,
            borderBottom: `1px solid ${colors.dashboard.border}`,
            boxShadow: shadows.sm,
            position: "sticky",
            top: 68,
            zIndex: 20,
            // full-bleed light bar; 24px gutter so the inner 1180 column lines
            // up with the hero / upload card (one consistent page column).
            padding: "0 24px",
          }}
        >
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "14px 0",
              display: "flex",
              flexDirection: "column" as const,
              gap: 10,
            }}
          >
            {/* Search — top-left help cue */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 320,
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: colors.dashboard.muted,
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
                  border: `1.5px solid ${colors.dashboard.border}`,
                  background: colors.dashboard.card,
                  color: colors.dashboard.heading,
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Category filter — small, subtle, single scrollable line (swipe). */}
            <div
              role="tablist"
              aria-label="Filter templates by category"
              className="qq-fade-scroll-row"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
                const idx = tabs.findIndex((t) => t === document.activeElement);
                if (idx < 0) return;
                const next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
                tabs[next].focus();
                tabs[next].click();
                e.preventDefault();
              }}
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                flexWrap: "nowrap" as const,
                WebkitOverflowScrolling: "touch",
                paddingBottom: 1,
              }}
            >
              {FILTER_FAMILIES.map((f) => {
                const count =
                  f.id === "all" ? totalCount : (familyCounts[f.id] ?? 0);
                if (f.id !== "all" && count === 0) return null;
                const active = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveFilter(f.id)}
                    data-testid={`filter-${f.id}`}
                    style={{
                      flex: "0 0 auto",
                      padding: "4px 11px",
                      borderRadius: 999,
                      // Selected = accent OUTLINE + subtle tint (locked rule:
                      // never a bright fill); dark-on-light text for the
                      // light bar surface.
                      border: `1px solid ${active ? mkt.accent : colors.dashboard.border}`,
                      background: active ? colors.dashboard.accentTint : "transparent",
                      color: active ? colors.dashboard.heading : colors.dashboard.body,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.5,
                      whiteSpace: "nowrap" as const,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {f.label}
                    <span style={{ marginLeft: 5, opacity: 0.55, fontWeight: 500, fontSize: 11 }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Template grid */}
        <div
          id="template-grid"
          className="templates-grid-section"
          // scrollMarginTop ≈ fixed nav (68) + sticky filter bar, so the
          // "Browse Templates ↓" hero anchor lands below the fixed chrome
          // instead of underneath it (same pattern as ApiDocsPage.tsx).
          style={{ background: "#C2D0D6", padding: "40px 16px 80px", borderRadius: "28px 28px 0 0", scrollMarginTop: 140 }}
        >
          {/* 1180 (not 1160) so the grid column shares the hero / upload-card
              left edge — one consistent page column top-to-bottom. */}
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <p
              style={{
                fontSize: 14,
                color: "#3F4549",
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
                  border: "1px dashed rgba(15,20,24,0.22)",
                  textAlign: "center",
                  color: "#3F4549",
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
                    "repeat(auto-fill, minmax(168px, 1fr))",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                {filtered.map((template) => (
                  <CalculatorTemplateCard key={template.id} template={template} />
                ))}
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
                color: colors.brand.onDark,
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
                  background: colors.platform.surface,
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
                  color: colors.brand.onDark,
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
