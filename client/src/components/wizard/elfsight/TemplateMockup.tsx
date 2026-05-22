// TemplateMockup — data-driven miniature preview of a template.
//
// Replaces the older `TemplateCardMockup` (hero treatment + abstract bars)
// with an Elfsight-style accurate mini render: real title text, real field
// labels, real CTA copy, real category icon, real category-derived palette.
// Two cards in the same category no longer look identical — picking a
// template now actually informs the user what they're picking.
//
// Anatomy (top → bottom inside the 4:5 card mockup area):
//   1. Header strip      ~18% — category icon + truncated template title.
//   2. Progress dots     ~6%  — step count (auto-stepper or template.steps),
//                              cap 5; first dot filled in accent.
//   3. Field list        ~48% — 3-4 real field labels with stub input boxes.
//   4. Result panel      ~28% — resultsBg colour; result label + sample
//                              price + CTA bar in accent colour.
//
// Performance:
//   - Pure render, no state, no effects (the IntersectionObserver lazy-load
//     lives on a thin wrapper, NOT on the inner render). 47 templates ×
//     ~150 LoC, no canvas / no SVG except tiny shapes.
//   - Off-screen cards render a lightweight skeleton until they enter the
//     viewport — keeps initial paint fast on the Browse-all modal grid.
//
// Data sources used:
//   - `template.name` / `template.header.title` — header text
//   - `template.category` + `getCategoryStyle()` — palette fallback
//   - `template.style?.accent / surface / resultsBg` — explicit overrides
//   - `resolveCategoryIcon(template.category, template.categoryIcon)` —
//     header icon (lucide).
//   - `template.steps?.length` — explicit step count when shipped; auto-
//     derived as min(4, ceil(fieldCount / 2)) otherwise. Capped at 5.
//   - `template.fields[0..3].label` — mini field rows
//   - `template.result_calc` / `template.results?.heading` — result label
//   - `template.results?.cta_label` — CTA copy (truncated to 12 chars)
//   - Sample price derived from default + slider midpoint values across
//     fields. No real formula evaluation — just a plausible figure.

import { useEffect, useRef, useState } from 'react';
import type { TemplateConfig, TemplateField } from '@shared/templatePresets';
import { getCategoryStyle } from '@/lib/categoryStyles';
import { resolveCategoryIcon } from '@/components/quote-widget/CategoryIcon';

interface Props {
  template: TemplateConfig;
}

/** Truncate a string with an ellipsis when over `max` chars. */
function trunc(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Cheap sample-price derivation. Walks each field and picks a plausible
 * "default" contribution — slider midpoint, first option's value, on_value
 * when toggled, etc. — and sums. Floors at $150, ceiling $25,000 so the
 * mockup price always reads as a realistic ballpark even for templates
 * with weird formulas. We don't actually evaluate `calculations[]` — too
 * expensive for 47 cards and the mockup is not a live quote.
 */
function sampleSubtotal(fields: TemplateField[]): number {
  let total = 0;
  for (const f of fields) {
    switch (f.type) {
      case 'slider':
      case 'number': {
        const mid = typeof f.default_value === 'number'
          ? f.default_value
          : f.min !== undefined && f.max !== undefined
            ? (f.min + f.max) / 2
            : 1;
        // Treat raw numbers as a quantity; multiply by a modest per-unit
        // factor so a "65 sqm" field doesn't read as "$65".
        total += Math.max(0, mid) * 12;
        break;
      }
      case 'select':
      case 'radio': {
        const first = f.options?.[0];
        if (first && first.value > 0) total += first.value;
        else if (first && first.value === 0 && f.options?.[1]) total += f.options[1].value;
        break;
      }
      case 'multi_select': {
        // Assume one add-on selected.
        const first = f.options?.[0];
        if (first && first.value > 0) total += first.value;
        break;
      }
      case 'toggle': {
        if (typeof f.on_value === 'number' && f.on_value > 0) total += f.on_value;
        break;
      }
      default:
        break;
    }
  }
  if (total <= 0) total = 450;
  if (total < 150) total = 150;
  if (total > 25000) total = 25000;
  // Round to a friendly figure.
  if (total >= 1000) return Math.round(total / 50) * 50;
  return Math.round(total / 10) * 10;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

/** Resolve effective colours from category fallback + explicit overrides. */
function resolveColours(template: TemplateConfig) {
  const cat = getCategoryStyle(template.category);
  const surface = template.style?.surface ?? '#ffffff';
  const accent = template.style?.accent ?? cat.accent ?? cat.ctaFrom;
  // ResultsBg explicit override → category bodyRow tint → soft slate fallback.
  const resultsBg = template.style?.resultsBg
    ?? (cat.isDark ? '#0f172a' : '#f8fafc');
  const accentText = cat.isDark || isDarkHex(accent) ? '#ffffff' : '#ffffff';
  const text = template.style?.text ?? (cat.isDark ? '#e2e8f0' : '#0f172a');
  return { cat, surface, accent, resultsBg, accentText, text };
}

/** Crude perceptual-brightness test on a hex string. */
function isDarkHex(hex: string): boolean {
  const m = hex.replace('#', '');
  if (m.length !== 3 && m.length !== 6) return false;
  const full = m.length === 3
    ? m.split('').map((c) => c + c).join('')
    : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // ITU-R BT.601 luma.
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 128;
}

/** Pure inner render — no state, no effects. */
function MockupInner({ template }: Props) {
  const { cat, surface, accent, resultsBg, accentText, text } =
    resolveColours(template);
  const Icon = resolveCategoryIcon(template.category, template.categoryIcon);

  const title = template.header?.title?.trim() || template.name;
  const visibleTitle = trunc(title, 22);

  // Step count: explicit `steps[]` length when shipped, else estimated from
  // field count (~2 fields per step). Capped at 5 so the dots row never
  // overflows the card width.
  const stepCount = Math.min(
    5,
    Math.max(2, template.steps?.length ?? Math.ceil(template.fields.length / 2)),
  );
  const dots = Array.from({ length: stepCount });

  // First 3-4 fields by label. Filter to fields that actually have a label.
  const labelFields = template.fields
    .filter((f) => f.label && f.type !== 'heading')
    .slice(0, 4);

  const subtotal = sampleSubtotal(template.fields);
  const resultLabel = template.results?.heading?.trim()
    || template.result_calc
    || 'Total Cost';
  const ctaLabel = trunc(
    template.results?.cta_label?.trim() || 'Get Quote',
    14,
  );

  // Soft inset shadow + 8px corners. Surface is white-ish in light themes,
  // slate-900 in dark themes (Automotive / Emergency / Construction hero).
  return (
    <div
      className="qq-tm-card"
      aria-hidden="true"
      data-category-id={cat.id}
      style={{
        background: surface,
        color: text,
      }}
    >
      {/* 1. Header strip — icon + truncated title. */}
      <div className="qq-tm-header">
        <span
          className="qq-tm-icon"
          style={{ color: accent }}
        >
          <Icon size={11} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="qq-tm-title" style={{ color: text }}>
          {visibleTitle}
        </span>
      </div>

      {/* 2. Step dots. */}
      <div className="qq-tm-dots">
        {dots.map((_, i) => (
          <span
            key={i}
            className="qq-tm-dot"
            style={{
              background: i === 0 ? accent : 'rgba(100, 116, 139, 0.35)',
            }}
          />
        ))}
      </div>

      {/* 3. Field list. */}
      <div className="qq-tm-fields">
        {labelFields.map((f) => (
          <div key={f.id} className="qq-tm-field-row">
            <span className="qq-tm-field-label" style={{ color: text }}>
              {trunc(f.label, 18)}
            </span>
            <span
              className="qq-tm-field-stub"
              style={{
                borderColor: isDarkHex(surface) ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.16)',
                background: isDarkHex(surface) ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
              }}
            />
          </div>
        ))}
      </div>

      {/* 4. Result panel — accent label + price + CTA bar. */}
      <div
        className="qq-tm-result"
        style={{
          background: resultsBg,
          color: isDarkHex(resultsBg) ? '#ffffff' : '#0f172a',
        }}
      >
        <div className="qq-tm-result-row">
          <span className="qq-tm-result-label">{trunc(resultLabel, 12)}</span>
          <span className="qq-tm-result-price">{formatCurrency(subtotal)}</span>
        </div>
        <div
          className="qq-tm-cta"
          style={{ background: accent, color: accentText }}
        >
          <span className="qq-tm-cta-label">{ctaLabel}</span>
        </div>
      </div>

      <style>{`
        .qq-tm-card {
          width: 100%;
          height: 100%;
          border-radius: 8px;
          padding: 7px 8px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06),
                      inset 0 1px 0 rgba(255, 255, 255, 0.4);
          overflow: hidden;
          position: relative;
        }

        /* 1. Header strip — ~18% of card. */
        .qq-tm-header {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          min-height: 14px;
        }
        .qq-tm-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px; height: 12px;
          flex-shrink: 0;
        }
        .qq-tm-icon svg { display: block; }
        .qq-tm-title {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.005em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1 1 auto;
          min-width: 0;
        }

        /* 2. Step dots. */
        .qq-tm-dots {
          display: flex;
          gap: 3px;
          padding: 1px 0;
          flex-shrink: 0;
        }
        .qq-tm-dot {
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          flex-shrink: 0;
        }

        /* 3. Field list — fills the middle. */
        .qq-tm-fields {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1 1 auto;
          min-height: 0;
          margin-top: 1px;
        }
        .qq-tm-field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          height: 7px;
        }
        .qq-tm-field-label {
          font-size: 6px;
          font-weight: 500;
          line-height: 1;
          opacity: 0.78;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1 1 auto;
          min-width: 0;
        }
        .qq-tm-field-stub {
          flex: 0 0 30%;
          height: 6px;
          border-radius: 2px;
          border-width: 1px;
          border-style: solid;
        }

        /* 4. Result panel — ~28% of card. */
        .qq-tm-result {
          flex-shrink: 0;
          border-radius: 5px;
          padding: 5px 6px 5px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: auto;
        }
        .qq-tm-result-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 4px;
        }
        .qq-tm-result-label {
          font-size: 6.5px;
          font-weight: 600;
          opacity: 0.72;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .qq-tm-result-price {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 1;
        }
        .qq-tm-cta {
          width: 100%;
          padding: 4px 6px;
          border-radius: 4px;
          font-size: 7.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .qq-tm-cta-label {
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* No animations inside the thumbnail — respects prefers-reduced-motion
         * by default (there's nothing animated to opt out of). */
      `}</style>
    </div>
  );
}

/** Lightweight placeholder shown until the card enters the viewport. */
function MockupSkeleton() {
  return (
    <div
      className="qq-tm-skeleton"
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 8,
        background:
          'linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.06)',
      }}
    />
  );
}

/**
 * Public component — wraps the inner render with an IntersectionObserver
 * lazy-load gate. Once the card scrolls into the viewport once we render
 * the full mockup and KEEP it rendered (no re-flicker on re-scroll).
 *
 * The strip is a single-row horizontal scroller, the modal is a 2-4 col
 * grid. Both benefit from skipping off-screen cards on first paint.
 */
export default function TemplateMockup({ template }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // SSR / no-IO env → render immediately.
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      {
        // Pre-render a viewport-plus margin so cards just off-screen are
        // ready by the time the user scrolls to them.
        rootMargin: '200px 200px',
        threshold: 0.01,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ width: '100%', height: '100%', display: 'block' }}
      data-testid={`template-mockup-${template.id}`}
    >
      {visible ? <MockupInner template={template} /> : <MockupSkeleton />}
    </div>
  );
}
