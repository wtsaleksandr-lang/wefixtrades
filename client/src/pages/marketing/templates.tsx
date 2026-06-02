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
import { Search } from "lucide-react";
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
          style={{ background: "#C2D0D6", padding: "40px 16px 80px", borderRadius: "28px 28px 0 0" }}
        >
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
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
