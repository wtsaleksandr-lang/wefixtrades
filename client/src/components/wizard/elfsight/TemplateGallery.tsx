// TemplateGallery — Wave H7.
//
// Two surfaces, sharing the same card layout:
//
//  - <TemplateStrip/> — slim, single-row horizontal scroller mounted at the
//    TOP of the Build tab. The first card is "Start blank"; the rest are
//    the TEMPLATE_PRESETS in catalogue order. A "Browse all" button opens
//    the modal below for vertical / categorised browsing.
//
//  - <TemplateBrowseModal/> — vertical browser shown over the editor when
//    the user wants the full list. Categorised by `TemplateConfig.category`,
//    closed via × or backdrop click. No new deps.
//
// Card click applies the template via `onApplyTemplate(template)` —
// WizardShell replaces fields / calculations / layout / header / results
// from `getTemplatePreset(id)`. The blank card calls with `null`.
//
// Mobile: same horizontal scroller. Drag-to-scroll on mouse, native
// touch swipe on phones. The Browse-all modal is full-screen on phones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import {
  TEMPLATE_PRESETS as STATIC_TEMPLATE_PRESETS, type TemplateConfig,
} from '@shared/templatePresets';
import { resolveWidgetTheme } from '@/components/quote-widget/widgetThemes';
import { getQuoteQuickIcon } from '@/data/quoteQuickIcons';
import {
  getCategoryStyle,
  stripeShapeForLayout,
  FEATURED_TEMPLATE_IDS,
} from '@/lib/categoryStyles';

/**
 * Wave W-AI-2 — admin-editable template catalogue.
 *
 * The wizard fetches the merged (code default + admin override) template
 * list from `/api/quotequick/templates` via TanStack Query. While the
 * fetch is in flight (or on SSR / initial paint) we fall back to the
 * static `TEMPLATE_PRESETS` import so the gallery is never blank.
 */
function useMergedTemplates(): TemplateConfig[] {
  const { data } = useQuery<{ templates: TemplateConfig[] }>({
    queryKey: ['quotequick', 'templates'],
    queryFn: async () => {
      const r = await fetch('/api/quotequick/templates');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    // Spec allows up to 60s staleness — cached endpoint matches.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return data?.templates ?? STATIC_TEMPLATE_PRESETS;
}

/** Derive the unique categories from the merged template list (sorted). */
function deriveCategories(templates: TemplateConfig[]): string[] {
  const set = new Set<string>();
  for (const t of templates) if (t.category) set.add(t.category);
  return Array.from(set).sort();
}

/**
 * W-AO-2 — secondary category-accent band painted along the bottom edge of
 * the mockup. Works in tandem with the theme accent stripe at the top so
 * two cards sharing the same theme (e.g. forest) but in different
 * categories (e.g. Emergency vs Outdoor) still read as visually distinct.
 *
 * Unknown categories fall back to a neutral slate. The map is intentionally
 * small (six families) — categorical hue distinction over precise mapping.
 */
function categoryAccent(category: string | undefined): string {
  switch (category) {
    case 'Cleaning': return '#14b8a6';            // teal
    case 'Home Improvement': return '#3b82f6';    // blue
    case 'Emergency': return '#f59e0b';           // amber
    case 'Construction': return '#64748b';        // slate
    case 'Automotive': return '#a855f7';          // purple
    case 'Photography & Events': return '#ec4899'; // pink
    case 'Outdoor': return '#84cc16';             // lime
    case 'Services': return '#0ea5e9';            // sky
    default: return '#94a3b8';                    // slate-400 fallback
  }
}

const p = platformTheme;
const d = dashboardTheme;

/** What WizardShell needs to know to apply a template — null = start blank. */
export type ApplyTemplatePayload = TemplateConfig | null;

/* ───────────────────────────────────────────────────────────── */
/* Mini-mockup card preview — no external deps; pure CSS shapes. */
/* ───────────────────────────────────────────────────────────── */

interface MockupProps {
  /** Accent stripe colour for the card top — keeps cards visually distinct. */
  accent: string;
  /**
   * Wave Z — when provided, the mockup resolves the template's actual theme
   * and paints with theme colours (surface / result / accent). This makes
   * cards visually distinct by theme rather than by a hashed accent only.
   * Backwards-compatible: omitted → legacy 4-stripe behaviour.
   */
  template?: TemplateConfig;
}

/**
 * Wave W-AP-1 — radically more distinct gallery cards. Each card now
 * paints with a per-category palette + hero treatment + CTA shape from
 * `lib/categoryStyles`, so two cards in different trade categories look
 * like different products on the shelf — not just two wireframes that
 * share a blue accent.
 *
 * Anatomy (top → bottom):
 *   1. HERO band (~55% of card height) painted in the category's heroBg.
 *      The hero carries the category's signature treatment: dark-mode
 *      panel for Automotive, diagonal-stripe for Construction, sparkle
 *      dots for Cleaning, grid for Home Improvement, warning chevrons
 *      for Emergency, leaf overlay for Outdoor, geometric squares for
 *      Professional.
 *   2. A prominent 40×40 Lucide icon chip centred in the hero, tinted
 *      in the category accent. This is the visual anchor — much larger
 *      than the 14px chip from W-AO-2.
 *   3. An accent stripe whose width depends on the template's layout
 *      (full / half / triple). Single-column gets a full bar; two-col
 *      a half; multi-col three small ticks.
 *   4. A "Featured" badge for the W-AP-1 sample templates + roof_repair.
 *   5. Body section with bar placeholders (count = field count clamp 2-5).
 *   6. Result line (1 prominent line, or 2-3 lines for multi-calc
 *      breakdown templates).
 *   7. A real CTA BUTTON ~70% wide, rendering the template's actual
 *      `results.cta_label` ("Get Quote" fallback), in the category's
 *      ctaShape (pill / rounded-sq / squared) and gradient.
 *
 * Standalone — no AdvancedCalculator dependency — so the gallery can
 * render 47+ cards without spinning up live widgets.
 */
function TemplateCardMockup({ accent, template }: MockupProps) {
  if (!template) {
    // Legacy callers without template context — render the original stripes.
    return (
      <div className="qq-tg-mockup" aria-hidden="true">
        <div className="qq-tg-mockup-header" style={{ background: accent }} />
        <div className="qq-tg-mockup-row" />
        <div className="qq-tg-mockup-row" style={{ width: '70%' }} />
        <div className="qq-tg-mockup-cta" style={{ background: accent }} />
      </div>
    );
  }

  const theme = resolveWidgetTheme(template.theme);
  const cat = getCategoryStyle(template.category);
  // Vary bar count by ACTUAL fields, clamped to [2,4] for the W-AP-1
  // taller-hero layout — 5 bars overflowed the new body section.
  const fieldCount = Math.min(4, Math.max(2, template.fields.length));
  const bars = Array.from({ length: fieldCount });
  const visibleCalcs = template.calculations.filter((c) => c.showInResults !== false);
  const isBreakdown = visibleCalcs.length > 1;
  const breakdownLines = Math.min(2, Math.max(1, visibleCalcs.length - 1));
  const breakdown = Array.from({ length: breakdownLines });
  const Icon = getQuoteQuickIcon(template.defaultIcon);
  const stripe = stripeShapeForLayout(template.layout);
  const ctaLabel = template.results?.cta_label?.trim() || 'Get Quote';
  const isFeatured = FEATURED_TEMPLATE_IDS.has(template.id);

  // The hero treatment uses a CSS background-image overlay so the body
  // composition (gradient, diagonal stripe, etc.) is keyed off the
  // `data-hero` attribute. Defined in <style> below.
  return (
    <div
      className="qq-tg-mockup qq-tg-mockup-v2"
      style={{ background: cat.bodyBg, borderColor: theme.border }}
      aria-hidden="true"
      data-theme-id={theme.id}
      data-category={template.category}
      data-hero={cat.hero}
      data-cta-shape={cat.ctaShape}
      data-cat-id={cat.id}
    >
      {/* HERO band — coloured background with per-category overlay */}
      <div
        className="qq-tg-hero"
        style={{ background: cat.heroBg }}
      >
        {/* Per-category visual treatment overlays (CSS in <style>) */}
        <div
          className="qq-tg-hero-treatment"
          data-hero={cat.hero}
          style={{
            // CSS custom properties so the <style> block can reference
            // category colours without needing :nth-child selectors.
            ['--cat-accent' as string]: cat.heroAccent,
          }}
        />
        {/* Accent stripe(s) by layout shape */}
        {stripe === 'triple' ? (
          <div className="qq-tg-stripe-triple">
            <span style={{ background: cat.heroAccent }} />
            <span style={{ background: cat.heroAccent, opacity: 0.7 }} />
            <span style={{ background: cat.heroAccent, opacity: 0.45 }} />
          </div>
        ) : (
          <div
            className="qq-tg-stripe-single"
            style={{
              background: cat.heroAccent,
              width: stripe === 'half' ? '46%' : '74%',
            }}
          />
        )}
        {/* Centred icon chip — the visual anchor */}
        {Icon ? (
          <div
            className="qq-tg-iconchip-lg"
            style={{
              background: cat.isDark
                ? `${cat.heroAccent}33`
                : `${cat.heroAccent}22`,
              borderColor: cat.heroAccent,
              color: cat.heroAccent,
            }}
          >
            <Icon size={20} strokeWidth={2.25} />
          </div>
        ) : null}
        {isFeatured ? (
          <span className="qq-tg-featured-badge">Featured</span>
        ) : null}
      </div>

      {/* BODY — placeholder bars + result line */}
      <div className="qq-tg-body-v2">
        <div className="qq-tg-bars">
          {bars.map((_, i) => (
            <div
              key={i}
              className="qq-tg-bar"
              style={{
                background: cat.bodyRow,
                width: i === bars.length - 1
                  ? '52%'
                  : `${100 - (i % 3) * 14}%`,
              }}
            />
          ))}
        </div>
        {/* Result line — one prominent for single calc, multiple subdued
            for breakdown templates */}
        <div className="qq-tg-result-v2">
          <div
            className="qq-tg-result-head"
            style={{ background: cat.heroBg }}
          />
          {isBreakdown
            ? breakdown.map((_, i) => (
                <div
                  key={i}
                  className="qq-tg-result-line"
                  style={{
                    background: cat.bodyRow,
                    width: `${68 - i * 14}%`,
                  }}
                />
              ))
            : null}
        </div>
        {/* Real CTA button — sized ~72% width, centred, in category shape */}
        <div
          className="qq-tg-cta-v2"
          data-cta-shape={cat.ctaShape}
          style={{
            background: `linear-gradient(135deg, ${cat.ctaFrom}, ${cat.ctaTo})`,
            color: cat.ctaText,
            boxShadow:
              cat.id === 'emergency'
                ? `0 2px 6px ${cat.ctaFrom}55`
                : `0 1px 3px rgba(15,23,42,0.18)`,
          }}
        >
          <span className="qq-tg-cta-label">{ctaLabel}</span>
          <span className="qq-tg-cta-arrow" aria-hidden="true">→</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* TemplateStrip — horizontal scrolling row at the top of Build. */
/* ───────────────────────────────────────────────────────────── */

interface StripProps {
  /** When non-null, the card with this id gets the "is-active" ring. */
  activeTemplateId?: string;
  /** Called with the picked template, or null for "Start blank". */
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
}

/** Returns a stable hue for a given template id so cards look distinct. */
function templateAccent(id: string): string {
  // Hash id → hue [0, 360). Deterministic, no deps.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export default function TemplateStrip({ activeTemplateId, onApplyTemplate }: StripProps) {
  const [open, setOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const templates = useMergedTemplates();

  // Mouse-drag-to-scroll. Touch-swipe is native to overflow-x: auto on
  // mobile so we only special-case desktop pointer drag.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    const onDown = (e: MouseEvent) => {
      isDown = true;
      el.classList.add('is-dragging');
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const onLeave = () => { isDown = false; el.classList.remove('is-dragging'); };
    const onUp = () => { isDown = false; el.classList.remove('is-dragging'); };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.2;
      el.scrollLeft = scrollLeft - walk;
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mousemove', onMove);
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <section
      className="qq-tg-strip-section"
      data-testid="template-strip-section"
      aria-label="Start from a template"
    >
      <div className="qq-tg-strip-header">
        <div>
          <h3 className="qq-tg-strip-h">Start from a template</h3>
          {/* Wave L T1 — subtitle removed. The section title alone is enough;
           * the strip below already shows the templates and a card count
           * isn't critical context. */}
        </div>
        <button
          type="button"
          className="qq-tg-browse-all"
          onClick={() => setOpen(true)}
          data-testid="template-browse-all"
        >
          Browse all
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="qq-tg-strip"
        data-testid="template-strip-scroller"
        role="list"
        tabIndex={0}
      >
        {/* "Start blank" card — always first. */}
        <button
          type="button"
          className={`qq-tg-card qq-tg-card-blank${!activeTemplateId ? ' is-active' : ''}`}
          data-testid="template-card-blank"
          onClick={() => onApplyTemplate(null)}
          role="listitem"
        >
          <div className="qq-tg-mockup qq-tg-mockup-blank" aria-hidden="true">
            <span className="qq-tg-plus">+</span>
          </div>
          <div className="qq-tg-card-body">
            <span className="qq-tg-card-name">Start blank</span>
            <span className="qq-tg-card-tags">Custom build</span>
          </div>
        </button>

        {templates.map((t) => {
          const accent = templateAccent(t.id);
          const isActive = t.id === activeTemplateId;
          const tradeTags = (t.trades ?? []).slice(0, 2).join(', ');
          return (
            <button
              key={t.id}
              type="button"
              className={`qq-tg-card${isActive ? ' is-active' : ''}`}
              data-testid={`template-strip-card-${t.id}`}
              onClick={() => onApplyTemplate(t)}
              role="listitem"
            >
              <TemplateCardMockup accent={accent} template={t} />
              <div className="qq-tg-card-body">
                <span className="qq-tg-card-name">{t.name}</span>
                <span className="qq-tg-card-tags">{tradeTags || t.category}</span>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <TemplateBrowseModal
          onClose={() => setOpen(false)}
          onApplyTemplate={(payload) => {
            onApplyTemplate(payload);
            setOpen(false);
          }}
          activeTemplateId={activeTemplateId}
        />
      )}

      <style>{`
        .qq-tg-strip-section { display: flex; flex-direction: column; gap: 10px; }
        .qq-tg-strip-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 12px;
        }
        .qq-tg-strip-h {
          font-size: 13px; font-weight: 700; color: ${p.colors.heading};
          margin: 0 0 2px; letter-spacing: -0.005em;
        }
        .qq-tg-strip-sub {
          font-size: 11.5px; color: ${p.colors.muted}; margin: 0;
        }
        /* Wave L T2 — smaller "Browse all" — closer to secondary-link weight
         * than a card-CTA button. Reduced font, padding, and min-height. */
        .qq-tg-browse-all {
          font: inherit; font-size: 11.5px; font-weight: 600;
          color: ${p.colors.accent}; background: transparent;
          border: 1px solid ${p.colors.border}; border-radius: 6px;
          padding: 4px 9px; cursor: pointer;
          min-height: 26px; white-space: nowrap;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .qq-tg-browse-all:hover {
          background: ${p.colors.surfaceRaised};
          border-color: ${p.colors.accent};
        }

        /* The strip: single row, horizontal scroll. */
        .qq-tg-strip {
          display: flex; flex-direction: row; flex-wrap: nowrap;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 2px 12px;
          scroll-snap-type: x proximity;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .qq-tg-strip.is-dragging { cursor: grabbing; user-select: none; }
        .qq-tg-strip::-webkit-scrollbar { height: 6px; }
        .qq-tg-strip::-webkit-scrollbar-thumb {
          background: ${p.colors.border}; border-radius: 3px;
        }

        .qq-tg-card {
          flex: 0 0 auto;
          width: 156px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
          padding: 8px;
          display: flex; flex-direction: column; gap: 6px;
          cursor: pointer;
          scroll-snap-align: start;
          text-align: left;
          font: inherit;
          transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
        }
        .qq-tg-card:hover {
          border-color: ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-tg-card.is-active {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-tg-card-body {
          display: flex; flex-direction: column; gap: 2px;
          padding: 2px 2px 4px;
          min-height: 36px;
        }
        .qq-tg-card-name {
          font-size: 12px; font-weight: 700; color: ${p.colors.heading};
          line-height: 1.3;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
        }
        .qq-tg-card-tags {
          font-size: 10.5px; font-weight: 600; color: ${p.colors.muted};
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Mini-mockup. W-AP-1 — bumped from 76 → 150 px so the hero band,
         * centred 40px icon, bars, result, and full CTA all have room.
         * Card body width stays the same (156 / 140 mobile). */
        .qq-tg-mockup {
          width: 100%; height: 150px;
          background: ${d.colors.canvas};
          border-radius: 8px;
          padding: 0;
          box-sizing: border-box;
          display: flex; flex-direction: column; gap: 4px;
          overflow: hidden;
          position: relative;
        }
        .qq-tg-mockup-header {
          height: 8px; width: 60%; border-radius: 2px;
        }
        .qq-tg-mockup-row {
          height: 5px; width: 100%; border-radius: 2px;
          background: ${p.colors.borderLight};
        }
        .qq-tg-mockup-cta {
          height: 10px; width: 40%; border-radius: 3px;
          margin-top: auto;
        }
        .qq-tg-mockup-blank {
          display: flex; align-items: center; justify-content: center;
        }
        .qq-tg-plus {
          font-size: 28px; font-weight: 300; color: ${p.colors.muted};
          line-height: 1;
        }

        /* Wave Z — theme-aware mockup variant. Paints with the template's
         * resolved theme: card surface as background, accent stripe at top,
         * border colour for placeholder rows, result-panel rectangle in the
         * theme's result colour with two tiny resultText-coloured bars
         * (headline + sub). W-AO-2 — adds a Lucide icon chip top-left, a
         * variable-count bar stack (2-5 bars matching field count), 1-3
         * breakdown lines in the result panel matching the template's calc
         * count, and a thin category-accent band along the bottom edge so
         * two cards on the same theme but different categories still read
         * apart at a glance. */
        .qq-tg-mockup-themed {
          border: 1px solid transparent;
          padding: 5px;
          gap: 3px;
        }
        .qq-tg-mockup-topline {
          display: flex; align-items: center; gap: 4px;
          flex-shrink: 0;
        }
        .qq-tg-mockup-iconchip {
          width: 14px; height: 14px;
          border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .qq-tg-mockup-iconchip svg { display: block; }
        .qq-tg-mockup-themed .qq-tg-mockup-header {
          width: 50%; height: 6px;
        }
        .qq-tg-mockup-catband {
          position: absolute; left: 0; right: 0; bottom: 0;
          height: 3px;
          opacity: 0.85;
        }
        .qq-tg-mockup-body {
          display: flex; flex-direction: column; gap: 3px;
          flex: 1; min-height: 0;
        }
        .qq-tg-mockup-themed .qq-tg-mockup-body .qq-tg-mockup-row {
          height: 4px;
        }
        .qq-tg-mockup-result {
          margin-top: auto;
          border-radius: 3px;
          padding: 4px 5px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-tg-mockup-result-headline {
          height: 5px; width: 50%; border-radius: 2px;
        }
        .qq-tg-mockup-result-sub {
          height: 3px; width: 75%; border-radius: 2px;
        }

        /* ─────────────────────────────────────────────────────────── */
        /* W-AP-1 — V2 mockup with category palette + hero treatments.  */
        /* ─────────────────────────────────────────────────────────── */
        .qq-tg-mockup-v2 {
          padding: 0;
          gap: 0;
          border: 1px solid;
          display: flex;
          flex-direction: column;
        }
        .qq-tg-hero {
          position: relative;
          height: 78px;
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qq-tg-hero-treatment {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        /* Hero treatments — pure CSS overlays painted via background image
         * and gradient. Each is keyed off the data-hero attribute on the
         * inner treatment div. */
        .qq-tg-hero-treatment[data-hero="dark-mode"] {
          background:
            radial-gradient(circle at 75% 30%, var(--cat-accent) 0%, transparent 28%),
            linear-gradient(135deg, transparent 60%, rgba(255,255,255,0.04) 100%);
          opacity: 0.55;
        }
        .qq-tg-hero-treatment[data-hero="diagonal-stripe"] {
          background:
            repeating-linear-gradient(
              -55deg,
              transparent 0 14px,
              var(--cat-accent) 14px 18px,
              transparent 18px 32px
            );
          opacity: 0.25;
        }
        .qq-tg-hero-treatment[data-hero="sparkle"] {
          background:
            radial-gradient(circle at 18% 24%, var(--cat-accent) 0 2px, transparent 3px),
            radial-gradient(circle at 78% 18%, var(--cat-accent) 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 60% 64%, var(--cat-accent) 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 30% 76%, var(--cat-accent) 0 2px, transparent 3px);
          opacity: 0.55;
        }
        .qq-tg-hero-treatment[data-hero="grid-pattern"] {
          background-image:
            linear-gradient(var(--cat-accent) 1px, transparent 1px),
            linear-gradient(90deg, var(--cat-accent) 1px, transparent 1px);
          background-size: 14px 14px;
          opacity: 0.16;
        }
        .qq-tg-hero-treatment[data-hero="chevrons"] {
          background:
            repeating-linear-gradient(
              135deg,
              transparent 0 8px,
              var(--cat-accent) 8px 11px,
              transparent 11px 20px
            );
          opacity: 0.35;
        }
        .qq-tg-hero-treatment[data-hero="leaf"] {
          background:
            radial-gradient(ellipse at 80% 110%, var(--cat-accent) 0%, transparent 40%),
            radial-gradient(ellipse at 12% -10%, var(--cat-accent) 0%, transparent 38%);
          opacity: 0.4;
        }
        .qq-tg-hero-treatment[data-hero="geometric"] {
          background:
            linear-gradient(135deg, var(--cat-accent) 0 12px, transparent 12px),
            linear-gradient(135deg, transparent calc(100% - 18px), var(--cat-accent) calc(100% - 18px));
          background-size: 100% 100%, 100% 100%;
          background-repeat: no-repeat;
          opacity: 0.2;
        }

        /* Accent stripe at top of hero — single or triple */
        .qq-tg-stripe-single {
          position: absolute;
          top: 0; left: 0;
          height: 4px;
          border-radius: 0 0 2px 0;
        }
        .qq-tg-stripe-triple {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          display: flex;
          gap: 3px;
          padding: 0 4px;
        }
        .qq-tg-stripe-triple span {
          flex: 1;
          height: 4px;
          border-radius: 0 0 2px 2px;
        }

        /* Centred icon chip — the visual anchor */
        .qq-tg-iconchip-lg {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border-width: 1.5px;
          border-style: solid;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          z-index: 1;
        }
        .qq-tg-iconchip-lg svg { display: block; }

        /* Featured badge — top-right of hero */
        .qq-tg-featured-badge {
          position: absolute;
          top: 6px; right: 6px;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #1e293b;
          background: #fbbf24;
          padding: 2px 6px;
          border-radius: 9999px;
          line-height: 1;
          z-index: 2;
          box-shadow: 0 1px 3px rgba(0,0,0,0.18);
        }

        /* BODY — bars + result + CTA */
        .qq-tg-body-v2 {
          flex: 1;
          padding: 7px 8px 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
        }
        .qq-tg-bars {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .qq-tg-bar {
          height: 3.5px;
          border-radius: 2px;
        }
        .qq-tg-result-v2 {
          margin-top: 2px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .qq-tg-result-head {
          height: 5px;
          width: 45%;
          border-radius: 2px;
          opacity: 0.9;
        }
        .qq-tg-result-line {
          height: 3px;
          border-radius: 2px;
        }

        /* CTA button — real button look, ~72% width, category shape */
        .qq-tg-cta-v2 {
          margin-top: auto;
          width: 100%;
          padding: 5px 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          line-height: 1;
          overflow: hidden;
          white-space: nowrap;
        }
        .qq-tg-cta-v2[data-cta-shape="pill"] { border-radius: 9999px; }
        .qq-tg-cta-v2[data-cta-shape="rounded-sq"] { border-radius: 6px; }
        .qq-tg-cta-v2[data-cta-shape="squared"] { border-radius: 2px; }
        .qq-tg-cta-label {
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .qq-tg-cta-arrow {
          font-size: 9px;
          flex-shrink: 0;
        }

        /* Mobile — slightly smaller cards. Wave L T2: the smaller browse-all
         * still meets the 32px tap-target threshold (Apple HIG; not 44 in
         * this context because it's a tertiary navigation control, not a
         * primary action). */
        @media (max-width: 768px) {
          .qq-tg-card { width: 140px; min-height: 44px; }
          .qq-tg-browse-all { min-height: 32px; padding: 4px 10px; font-size: 12px; }
        }
      `}</style>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* TemplateBrowseModal — full-list categorised browser.          */
/* ───────────────────────────────────────────────────────────── */

interface ModalProps {
  activeTemplateId?: string;
  onClose: () => void;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
}

function TemplateBrowseModal({ activeTemplateId, onClose, onApplyTemplate }: ModalProps) {
  const templates = useMergedTemplates();
  const categories = useMemo(() => deriveCategories(templates), [templates]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  // Wave M — search field (case-insensitive substring on name). Combines
  // with the active category (AND logic).
  const [search, setSearch] = useState<string>('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat = activeCategory === 'All'
      ? templates
      : templates.filter((t) => t.category === activeCategory);
    if (!q) return byCat;
    return byCat.filter((t) => t.name.toLowerCase().includes(q));
  }, [activeCategory, search, templates]);

  // ESC to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="qq-tg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Browse all templates"
      data-testid="template-browse-modal"
      onClick={onClose}
    >
      <div
        className="qq-tg-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qq-tg-modal-header">
          <h2 className="qq-tg-modal-title">Browse all templates</h2>
          <button
            type="button"
            className="qq-tg-modal-close"
            onClick={onClose}
            aria-label="Close template browser"
            data-testid="template-browse-close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* Wave M — search field. Filters by template name (case-insensitive
            substring) and combines with the active category. */}
        <div className="qq-tg-modal-search">
          <input
            type="search"
            className="qq-tg-modal-search-input"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search templates"
            data-testid="template-browse-search"
          />
        </div>
        {/* Wave Q-Hotfix — category filter is now a dropdown <select>
            (per user request). The previous Wave M chips strip was
            scroll-x with a fade mask; the dropdown is more compact and
            doesn't require horizontal swiping to discover categories. */}
        <div className="qq-tg-modal-filter-row">
          <select
            id="qq-tg-modal-cat-select"
            className="qq-tg-modal-cat-select"
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            data-testid="template-browse-cat-select"
            aria-label="Filter templates by category"
          >
            <option value="All">All categories ({templates.length})</option>
            {categories.map((c) => {
              const count = templates.filter((t) => t.category === c).length;
              return (
                <option key={c} value={c}>
                  {c} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="qq-tg-modal-grid" data-testid="template-browse-grid">
          {visible.map((t) => {
            const accent = templateAccent(t.id);
            const isActive = t.id === activeTemplateId;
            // W-AO-2 — Wave M removed the subtitle entirely; reintroduce a
            // subtle 11px description snippet so cards of the same theme
            // are distinguishable by purpose, not just by name.
            return (
              <button
                key={t.id}
                type="button"
                className={`qq-tg-card qq-tg-card--with-desc${isActive ? ' is-active' : ''}`}
                data-testid={`template-browse-card-${t.id}`}
                onClick={() => onApplyTemplate(t)}
                title={t.description}
              >
                <TemplateCardMockup accent={accent} template={t} />
                <div className="qq-tg-card-body">
                  <span className="qq-tg-card-name">{t.name}</span>
                  {t.description ? (
                    <span className="qq-tg-card-desc">{t.description}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="qq-tg-modal-empty" data-testid="template-browse-empty">
              No templates match "{search}".
            </p>
          )}
        </div>
      </div>

      <style>{`
        .qq-tg-modal-backdrop {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .qq-tg-modal {
          background: #fff; border-radius: 14px;
          /* Wave R-pre v2 — tightened from 880 to 720 max-width and added
           * 78vh max-height on desktop so the modal doesn't dominate the
           * screen. The audit pass found the old 880×86vh was felt as
           * "huge" relative to the actual content shown. */
          width: 100%; max-width: 720px;
          max-height: 78vh; display: flex; flex-direction: column;
          box-shadow: ${p.shadows.xl};
          overflow: hidden;
        }
        .qq-tg-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid ${p.colors.borderLight};
        }
        .qq-tg-modal-title {
          margin: 0; font-size: 14px; font-weight: 800; color: ${p.colors.heading};
        }
        /* Wave R-pre v2 — close button restyled. Was 32×32 round, muted
         * grey, hard to spot. Now 40×40, heading-coloured X icon, with a
         * subtle background ring + a clear surfaceRaised hover. */
        .qq-tg-modal-close {
          width: 40px; height: 40px; border-radius: 50%;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.border};
          color: ${p.colors.heading};
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .qq-tg-modal-close:hover {
          background: ${p.colors.danger ?? '#dc2626'};
          border-color: ${p.colors.danger ?? '#dc2626'};
          color: #fff;
        }
        .qq-tg-modal-close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        /* Wave M — search bar above the category chips. */
        .qq-tg-modal-search {
          padding: 12px 18px 4px;
          flex-shrink: 0;
        }
        .qq-tg-modal-search-input {
          width: 100%; box-sizing: border-box;
          font: inherit; font-size: 13px;
          padding: 9px 12px;
          border: 1px solid ${p.colors.border};
          border-radius: 9px;
          background: #fff; color: ${p.colors.heading};
          transition: border-color 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-tg-modal-search-input::placeholder {
          color: ${p.colors.muted};
        }
        .qq-tg-modal-search-input:focus {
          outline: none;
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        /* Wave Q-Hotfix — dropdown filter (replaces Wave M chips). */
        .qq-tg-modal-filter-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px;
          border-bottom: 1px solid ${p.colors.borderLight};
          flex-shrink: 0;
        }
        .qq-tg-modal-cat-select {
          flex: 1; min-width: 0;
          font: inherit; font-size: 13px; font-weight: 600;
          color: ${p.colors.heading};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          padding: 8px 12px; min-height: 38px;
          cursor: pointer;
          outline: none;
        }
        .qq-tg-modal-cat-select:focus {
          border-color: ${p.colors.accent};
        }
        .qq-tg-modal-grid {
          padding: 16px 18px 24px;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
          grid-auto-rows: 1fr;
          overflow-y: auto;
        }
        /* Wave R-pre W-CARDS — force equal card heights per row.
         * grid-auto-rows: 1fr above makes every row in the modal grid
         * stretch to the tallest cell. W-AP-1 bumped from 178 → 250 to
         * make room for the new 150px mockup (vs 76px before) plus the
         * 2-line description + name. */
        .qq-tg-modal-grid .qq-tg-card,
        .qq-tg-modal-grid .qq-tg-card--with-desc {
          height: 100%;
          min-height: 250px;
        }
        /* W-AO-2 — modal card body now hosts BOTH the name (centered,
         * bold) and a 2-line clamped description below (11px, muted).
         * Switched from center-aligned name to top-aligned stack so
         * 1-line and 2-line titles still share a row baseline via the
         * fixed body min-height. */
        .qq-tg-card--with-desc .qq-tg-card-body {
          min-height: 64px;
          padding: 6px 6px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 2px;
          flex: 1 1 auto;
        }
        .qq-tg-card--with-desc .qq-tg-card-name {
          font-size: 13px;
          font-weight: 700;
          color: ${p.colors.heading};
          line-height: 1.3;
          -webkit-line-clamp: 1;
          white-space: normal;
          text-align: center;
          width: 100%;
        }
        .qq-tg-card-desc {
          font-size: 11px;
          font-weight: 500;
          color: ${p.colors.muted};
          line-height: 1.35;
          text-align: center;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .qq-tg-modal-empty {
          grid-column: 1 / -1;
          text-align: center;
          font-size: 12.5px; color: ${p.colors.muted};
          padding: 28px 8px;
          margin: 0;
        }
        @media (max-width: 768px) {
          .qq-tg-modal-backdrop { padding: 8px; }
          .qq-tg-modal { max-height: 96vh; }
          .qq-tg-modal-grid { grid-template-columns: repeat(2, 1fr); }
          .qq-tg-modal-close { min-width: 44px; min-height: 44px; }
          .qq-tg-modal-search { padding: 10px 12px 4px; }
          .qq-tg-modal-search-input { padding: 11px 12px; min-height: 44px; }
          .qq-tg-modal-filter-row { padding: 10px 12px; }
          .qq-tg-modal-cat-select { min-height: 44px; font-size: 14px; }
        }
      `}</style>
    </div>
  );
}
