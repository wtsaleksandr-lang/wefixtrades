/**
 * Advanced (custom-built) calculator — the customer-facing runtime for
 * `calculator_settings.advanced`.
 *
 * Layout follows Elfsight's calculator (centred title, inputs alongside a
 * standing result panel, sliders with a value pill). Colours come from a
 * resolved `WidgetTheme` (see widgetThemes.ts) so templates can carry a look;
 * structural tokens (radii, fonts) stay in designTokens.
 *
 * Phases 1c / 2 / visual-parity / theming of the advanced-builder epic.
 */
import { useEffect, useMemo, useState } from 'react';
import { runCalculations, type FormulaContext } from '@shared/formulaEngine';
import {
  normalizeLayout, type TemplateLayout,
  type AdvStyle, type AdvFontFamily, type AdvFieldStyle, type AdvWidgetWidth,
} from '@shared/templatePresets';
import { eff } from './designTokens';
import { resolveWidgetTheme, type WidgetTheme } from './widgetThemes';

/**
 * Wave H5 — Style tab integration.
 *
 * Font stacks for the curated `advanced.style.fontFamily` enum. Only system /
 * Inter / Manrope — no new web-font packages loaded; system stack is the
 * default Satoshi-led one already used across the widget.
 */
const FONT_STACKS: Record<AdvFontFamily, string> = {
  system: eff.font,
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
};

/** Map widget-width enum → outer max-width applied to the calculator root. */
const WIDTH_PX: Record<AdvWidgetWidth, string> = {
  narrow: '520px',
  wide: '820px',
  full: '100%',
};

/**
 * Helper to convert a hex colour to an rgba string with `alpha` so the
 * Style-tab accent can drive a sensible accent tint without the user
 * configuring it explicitly. Falls back to the input string on unparseable
 * input — the renderer just gets a slightly off tint, not a crash.
 */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Compose the user's Style tab choices on top of a resolved `WidgetTheme`.
 * Every field is optional — absent fields fall through to the theme value.
 * Returns a NEW theme object so downstream identity-equality checks stay
 * sound, and recomputes the accent tint from the new accent.
 */
function applyStyleOverrides(base: WidgetTheme, style: AdvStyle | undefined): WidgetTheme {
  if (!style) return base;
  const next: WidgetTheme = { ...base };
  if (style.accent) {
    next.accent = style.accent;
    next.accentTint = hexToRgba(style.accent, 0.10);
  }
  if (style.background) {
    next.bg = style.background;
  }
  if (style.text) {
    next.text = style.text;
  }
  if (style.resultsBg) {
    next.result = style.resultsBg;
    // If the user explicitly picked a non-default results bg, recompute the
    // result text colour for legible contrast. White / very-light backgrounds
    // keep the theme's `text`; everything else uses white for the value.
    const isLight = /^#?(f|e)/i.test(style.resultsBg.replace('#', ''));
    next.resultText = isLight ? next.text : '#ffffff';
    next.resultMuted = isLight ? base.resultMuted : 'rgba(255,255,255,0.82)';
  }
  return next;
}

/* ─── Config types (mirror calculator_settings.advanced) ─── */

interface AdvOption { id: string; label: string; value: number; image?: string; }
interface AdvField {
  id: string;
  name: string;
  label: string;
  type: 'number' | 'slider' | 'select' | 'radio' | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading';
  help?: string;
  required?: boolean;
  default_value?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  on_value?: number;
  options?: AdvOption[];
  visible_when?: { field: string; op: string; value: number };
  /** Optional grid column span (1 = half width, 2 = full width). */
  colSpan?: 1 | 2;
}
interface AdvCalc {
  id: string; name: string; formula: string;
  format: 'number' | 'currency' | 'percent';
  /** Wave H4 — display-mode flags. All optional / backward-compatible. */
  resultMode?: 'primary' | 'secondary';
  caption?: string;
  showInResults?: boolean;
  divider?: boolean;
}
interface AdvHeader { title?: string; subtitle?: string; align?: 'left' | 'center' | 'right'; }
interface AdvResults { heading?: string; footnote?: string; show_breakdown?: boolean; cta_label?: string; }
export interface AdvancedConfig {
  enabled?: boolean;
  fields?: AdvField[];
  calculations?: AdvCalc[];
  result_calc?: string;
  header?: AdvHeader;
  results?: AdvResults;
  theme?: string;
  /**
   * Real layout: `single-column | two-column | multi-column`. Legacy values
   * (`single_page | two_column | multi_step`) are still accepted on read and
   * coerced via `normalizeLayout()`.
   */
  layout?: TemplateLayout | 'single_page' | 'two_column' | 'multi_step';
  /**
   * Wave H5 — user-driven Style tab overrides. Composed on top of the
   * resolved `WidgetTheme`. Every field optional → fully back-compatible.
   */
  style?: AdvStyle;
}

interface Props {
  businessName?: string;
  logoUrl?: string;
  advanced: AdvancedConfig;
  accentColor?: string;
}

type Answer = number | string | boolean | string[];

/** The default answer for a single field. */
function defaultAnswer(f: AdvField): Answer {
  if (f.type === 'number' || f.type === 'slider') return f.default_value ?? f.min ?? 0;
  if (f.type === 'toggle') return false;
  if (f.type === 'multi_select') return [];
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') return f.options?.[0]?.id ?? '';
  return '';
}

/** True when a stored answer is no longer valid for its field. */
function answerInvalid(f: AdvField, value: Answer): boolean {
  if (value === undefined) return true;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return !(f.options || []).some((o) => o.id === value);
  }
  return false;
}

function initAnswers(fields: AdvField[]): Record<string, Answer> {
  const a: Record<string, Answer> = {};
  for (const f of fields) a[f.name] = defaultAnswer(f);
  return a;
}

/** The numeric/array value a single field contributes to a formula context. */
function rawFieldValue(f: AdvField, answers: Record<string, Answer>): FormulaContext[string] {
  const v = answers[f.name];
  if (f.type === 'heading') return 0;
  if (f.type === 'number' || f.type === 'slider') return Number(v) || 0;
  if (f.type === 'text') return String(v ?? '');
  if (f.type === 'toggle') return v ? (f.on_value ?? 1) : 0;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return f.options?.find((o) => o.id === v)?.value ?? 0;
  }
  const ids = Array.isArray(v) ? v : [];
  return (f.options || []).filter((o) => ids.includes(o.id)).map((o) => o.value);
}

/** The value a hidden field contributes — neutral so formulas ignore it. */
function emptyFieldValue(f: AdvField): FormulaContext[string] {
  return f.type === 'multi_select' ? [] : f.type === 'text' ? '' : 0;
}

function asNumber(v: FormulaContext[string]): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + (typeof x === 'number' ? x : 0), 0);
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/** Whether a field's conditional-visibility rule passes. */
function rulePasses(rule: { op: string; value: number }, controlValue: number): boolean {
  switch (rule.op) {
    case 'eq': return controlValue === rule.value;
    case 'ne': return controlValue !== rule.value;
    case 'gt': return controlValue > rule.value;
    case 'lt': return controlValue < rule.value;
    case 'gte': return controlValue >= rule.value;
    case 'lte': return controlValue <= rule.value;
    default: return true;
  }
}

function formatResult(v: number, format: AdvCalc['format']): string {
  if (format === 'currency') {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (format === 'percent') return v.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const labelStyle = (c: WidgetTheme): React.CSSProperties => ({
  fontSize: '13px', fontWeight: 600, color: c.text, display: 'block', marginBottom: '7px',
});

export default function AdvancedCalculator({ businessName, logoUrl, advanced, accentColor }: Props) {
  // Resolve the base theme, then compose the optional `advanced.style`
  // overrides on top. The Wave H5 style slot wins where it sets a value;
  // absent fields fall through to the resolved theme (which itself already
  // honours a top-level `accentColor` override for back-compat).
  const baseTheme = resolveWidgetTheme(advanced.theme, accentColor);
  const c = applyStyleOverrides(baseTheme, advanced.style);
  const accent = c.accent;
  const fields = advanced.fields || [];
  const calcs = advanced.calculations || [];

  // Resolved Style tab choices — used to drive the renderer's structural
  // tokens (font / radius / field-style / widget-width).
  //
  // CRITICAL — per-field fallback to LEGACY pre-H5 tokens. A template
  // persisted without an `advanced.style` slot (the existing 106 templates,
  // and anything authored before Wave H5) must render IDENTICALLY to the
  // pre-H5 build: rounded `eff.radius2xl` outer card, `eff.radiusXl` result
  // panel, `eff.radiusMd` inputs/CTA, Satoshi (`eff.font`), filled inputs,
  // no max-width cap (the outer QuoteWidget wrapper handles sizing).
  //
  // Only when the user has explicitly set a field via the Style tab does
  // that user value win. Don't apply structural defaults blanket; that's
  // what regressed the pre-H5 look for every existing template.
  const style = advanced.style || {};
  const fontFamily = style.fontFamily !== undefined
    ? FONT_STACKS[style.fontFamily]
    : eff.font;
  // Outer card radius — legacy `eff.radius2xl` (~24px) when unset.
  // Result panel uses the same px value when set (matches H5 preview), but
  // falls back to `eff.radiusXl` (~20px) when unset.
  // Inputs / CTA / lead-form inputs use the legacy 2px-inset value when set,
  // or `eff.radiusMd` (~12px) when unset.
  const radiusSet = typeof style.radius === 'number';
  const radiusValue = radiusSet ? (style.radius as number) : 12;
  const radiusOuterPx = radiusSet ? `${radiusValue}px` : eff.radius2xl;
  const radiusResultPx = radiusSet ? `${radiusValue}px` : eff.radiusXl;
  const radiusInnerPx = radiusSet ? `${Math.max(0, radiusValue - 2)}px` : eff.radiusMd;
  // Legacy was filled-only — defaulting to 'filled' is back-compat-safe.
  const fieldStyle: AdvFieldStyle = style.fieldStyle ?? 'filled';
  // `widgetWidth` undefined → no max-width cap (the outer QuoteWidget wrapper
  // handled sizing pre-H5). Only apply a fixed cap when the user picked one.
  const widgetWidth: AdvWidgetWidth | undefined = style.widgetWidth;
  const maxWidthStyle: string | undefined = widgetWidth ? WIDTH_PX[widgetWidth] : undefined;

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => initAnswers(fields));
  const setAnswer = (name: string, value: Answer) => setAnswers((p) => ({ ...p, [name]: value }));

  // Result-panel call-to-action — button → inline lead form → thank-you.
  const [leadView, setLeadView] = useState<'cta' | 'form' | 'done'>('cta');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');

  // Keep answers in sync when the field set changes — a template being
  // applied or fields edited in the builder. A field missing an answer (or
  // holding one no longer valid for its options, e.g. after switching
  // template) is reset to its default — otherwise sliders read "undefined"
  // and totals stay at 0.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next: Record<string, Answer> = { ...prev };
      for (const f of fields) {
        if (answerInvalid(f, next[f.name])) {
          next[f.name] = defaultAnswer(f);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fields]);

  // Raw values (every field) → visibility → formula context (a hidden field
  // contributes a neutral value so it doesn't skew the total).
  const raw = useMemo(() => {
    const ctx: FormulaContext = {};
    for (const f of fields) ctx[f.name] = rawFieldValue(f, answers);
    return ctx;
  }, [fields, answers]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) {
      if (!f.visible_when) { s.add(f.id); continue; }
      if (rulePasses(f.visible_when, asNumber(raw[f.visible_when.field] ?? 0))) s.add(f.id);
    }
    return s;
  }, [fields, raw]);

  const ctx = useMemo(() => {
    const m: FormulaContext = {};
    for (const f of fields) m[f.name] = visibleIds.has(f.id) ? raw[f.name] : emptyFieldValue(f);
    return m;
  }, [fields, raw, visibleIds]);

  const { values } = useMemo(() => runCalculations(calcs, ctx), [calcs, ctx]);

  // Wave H4 — headline selection:
  //  1. The first calc explicitly marked `resultMode: 'primary'` wins.
  //  2. Else the legacy `advanced.result_calc` (by name) wins.
  //  3. Else the last calc in the list (back-compat default).
  const explicitPrimary = calcs.find((cl) => cl.resultMode === 'primary');
  const legacyHeadline = advanced.result_calc
    ? calcs.find((cl) => cl.name === advanced.result_calc)
    : undefined;
  const resultCalc = explicitPrimary || legacyHeadline || (calcs.length ? calcs[calcs.length - 1] : undefined);
  const resultName = resultCalc?.name || '';
  const headline = values[resultName] ?? 0;
  const results = advanced.results || {};
  const showBreakdown = results.show_breakdown !== false;
  const resultHeading = (results.heading || '').trim() || resultCalc?.name || 'Total';
  const footnoteText = (results.footnote || '').trim() || 'Instant estimate based on your inputs.';
  // Breakdown rows = every calc visible in the result panel that ISN'T the
  // headline. `showInResults === false` hides explicitly; undefined defaults
  // to shown (preserves pre-H4 behaviour).
  const breakdown = calcs.filter((cl) =>
    cl.name !== resultName && cl.showInResults !== false,
  );
  const visibleFields = fields.filter((f) => visibleIds.has(f.id));

  // A tinted result panel (coral / dark) drops its border and uses a
  // translucent divider; a white panel keeps the theme border.
  const resultTinted = c.result.toLowerCase() !== c.surface.toLowerCase();
  const resultDivider = resultTinted ? 'rgba(255,255,255,0.22)' : c.border;

  // CTA — always high-contrast against the result panel (a solid accent
  // button on a white panel; a white button on a coloured panel).
  const ctaLabel = results.cta_label === undefined ? 'Get My Quote' : results.cta_label;
  const showCta = ctaLabel.trim() !== '';
  const ctaBg = resultTinted ? '#ffffff' : accent;
  const ctaFg = resultTinted ? c.result : '#ffffff';
  const leadEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail.trim());
  const leadReady = leadName.trim() !== '' && leadEmailOk;
  const leadInputStyle: React.CSSProperties = {
    width: '100%', height: '40px', borderRadius: radiusInnerPx,
    border: '1px solid rgba(15,23,42,0.14)', padding: '0 12px', fontSize: '13px',
    background: '#ffffff', color: '#0f172a', fontFamily, outline: 'none',
    boxSizing: 'border-box',
  };

  // ── Layout ──
  // Real, CSS-Grid-backed layouts. Mobile-first: every layout is a single
  // stacked column by default; the wider arrangements switch on at >=560px.
  // Spacing is deliberately tight — no wasted gaps.
  const layout: TemplateLayout = normalizeLayout(advanced.layout);
  const hasResult = calcs.length > 0;
  // A unique scope so the responsive rules don't leak between embeds.
  const gridId = useMemo(
    () => 'advcalc-' + Math.random().toString(36).slice(2, 8),
    [],
  );

  return (
    <div
      data-testid="advanced-calculator"
      data-field-style={fieldStyle}
      data-widget-width={widgetWidth ?? 'legacy'}
      data-style-radius={radiusSet ? radiusValue : 'legacy'}
      style={{
        background: c.surface, borderRadius: radiusOuterPx,
        border: `1px solid ${c.border}`, boxShadow: c.shadow,
        overflow: 'hidden', fontFamily,
        ...(maxWidthStyle ? { maxWidth: maxWidthStyle } : null),
        margin: '0 auto', width: '100%',
      }}
    >
      {/* ── Title bar (its own separated bar) ── */}
      {(() => {
        const header = advanced.header || {};
        const align = header.align || 'center';
        const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const title = (header.title || '').trim() || businessName || 'Get a Quote';
        const subtitle = (header.subtitle || '').trim();
        return (
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: justify, gap: '10px' }}>
              {logoUrl && (
                <img src={logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: eff.radiusMd, objectFit: 'contain' }} />
              )}
              <p
                data-testid="advanced-title"
                style={{ fontSize: '17px', fontWeight: 800, color: c.text, margin: 0, letterSpacing: '-0.01em' }}
              >
                {title}
              </p>
            </div>
            {subtitle && (
              <p
                data-testid="advanced-subtitle"
                style={{ fontSize: '13px', color: c.textBody, margin: '5px 0 0', textAlign: align, lineHeight: 1.5 }}
              >
                {subtitle}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Body ──
          Real CSS-Grid layouts, mobile-first. Base styles below are the
          narrow-screen single-column state; the scoped <style> block widens
          them at >=560px per layout:
            single-column — one column, result below.
            two-column    — inputs column + result column.
            multi-column  — a 3-up auto-fit input grid, result spans full width.
          Tight gaps throughout — no wasted vertical space. */}
      <style>{`
        .${gridId} {
          display: grid;
          gap: 12px;
          padding: 16px;
          grid-template-columns: 1fr;
        }
        .${gridId}-fields {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start;
          min-width: 0;
        }
        .${gridId}-fields > * { grid-column: span 2; min-width: 0; }
        .${gridId}-fields > [data-colspan="1"] { grid-column: span 1; }
        /* Very narrow screens — collapse all fields to a single column so a
           pair of side-by-side inputs stack cleanly on the smallest phones. */
        @media (max-width: 360px) {
          .${gridId}-fields > [data-colspan="1"] { grid-column: span 2; }
        }
        .${gridId}-result { align-self: start; min-width: 0; }
        @media (min-width: 560px) {
          .${gridId} { gap: 14px; padding: 20px; }
          .${gridId}[data-layout="two-column"] {
            grid-template-columns: 1fr minmax(190px, 0.8fr);
          }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 12px;
          }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields > * { grid-column: auto; }
        }
      `}</style>
      <div className={gridId} data-layout={layout} data-testid="advanced-body"
        style={{ background: c.bg }}>
        {/* Inputs */}
        <div className={`${gridId}-fields`}>
          {visibleFields.length === 0 && (
            <p style={{ fontSize: '14px', color: c.textBody, padding: '16px 0' }}>
              This calculator hasn't been set up yet.
            </p>
          )}
          {visibleFields.map((f) => (
            <div key={f.id} data-colspan={f.colSpan === 1 ? '1' : '2'} style={{ minWidth: 0 }}>
              <FieldInput
                field={f}
                value={answers[f.name]}
                accent={accent}
                theme={c}
                radiusPx={radiusInnerPx}
                fieldStyle={fieldStyle}
                fontFamily={fontFamily}
                onChange={(v) => setAnswer(f.name, v)}
              />
            </div>
          ))}
        </div>

        {/* Result panel — a separate rounded container */}
        {hasResult && (
          <div
            className={`${gridId}-result`}
            data-testid="advanced-result-panel"
            style={{
              borderRadius: radiusResultPx, background: c.result,
              border: resultTinted ? 'none' : `1px solid ${c.border}`, boxShadow: c.shadow,
              padding: '18px',
            }}
          >
            <p
              data-testid="advanced-result-heading"
              style={{
                fontSize: '11px', fontWeight: 700, color: c.resultMuted,
                textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px',
              }}
            >
              {resultHeading}
            </p>
            <p data-testid="advanced-result" style={{
              fontSize: 'clamp(28px, 6vw, 38px)', fontWeight: 800, color: c.resultText,
              margin: 0, fontFamily: eff.fontMono, lineHeight: 1.05, letterSpacing: '-0.02em',
            }}>
              {formatResult(headline, resultCalc?.format || 'currency')}
            </p>
            {/* Wave H4 — optional caption beneath the headline value. */}
            {resultCalc?.caption && resultCalc.caption.trim() !== '' && (
              <p
                data-testid="advanced-result-caption"
                style={{
                  fontSize: '12px', color: c.resultMuted, margin: '4px 0 0',
                  lineHeight: 1.5,
                }}
              >
                {resultCalc.caption}
              </p>
            )}


            {showBreakdown && breakdown.length > 0 && (
              <div style={{
                marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${resultDivider}`,
                display: 'flex', flexDirection: 'column', gap: '9px',
              }}>
                {breakdown.map((cl) => (
                  <div
                    key={cl.id}
                    data-testid={`advanced-breakdown-${cl.id}`}
                    data-divider={cl.divider ? 'true' : 'false'}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '3px',
                      // Wave H4 — `divider: true` puts a thin rule above the row.
                      ...(cl.divider ? {
                        paddingTop: '9px',
                        borderTop: `1px solid ${resultDivider}`,
                      } : null),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: c.resultMuted }}>{cl.name}</span>
                      <span style={{ fontWeight: 700, color: c.resultText, fontFamily: eff.fontMono }}>
                        {formatResult(values[cl.name] ?? 0, cl.format)}
                      </span>
                    </div>
                    {cl.caption && cl.caption.trim() !== '' && (
                      <span
                        data-testid={`advanced-breakdown-caption-${cl.id}`}
                        style={{ fontSize: '11px', color: c.resultMuted, lineHeight: 1.4 }}
                      >
                        {cl.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p style={{
              fontSize: '11px', color: c.resultMuted, margin: '14px 0 0', lineHeight: 1.5,
            }}>
              {footnoteText}
            </p>

            {showCta && (
              <div style={{ marginTop: '14px' }}>
                {leadView === 'cta' && (
                  <button type="button" data-testid="advanced-cta"
                    onClick={() => setLeadView('form')}
                    style={{
                      width: '100%', height: '46px', borderRadius: radiusInnerPx, border: 'none',
                      background: ctaBg, color: ctaFg, fontSize: '14px', fontWeight: 800,
                      cursor: 'pointer', fontFamily, letterSpacing: '0.01em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                    }}>
                    {ctaLabel} <span style={{ fontSize: '16px' }}>→</span>
                  </button>
                )}

                {leadView === 'form' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input data-testid="advanced-cta-name" type="text" placeholder="Your name"
                      value={leadName} onChange={(e) => setLeadName(e.target.value)}
                      style={leadInputStyle} />
                    <input data-testid="advanced-cta-email" type="email" placeholder="Email address"
                      value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)}
                      style={leadInputStyle} />
                    <button type="button" data-testid="advanced-cta-send"
                      onClick={() => { if (leadReady) setLeadView('done'); }}
                      style={{
                        width: '100%', height: '44px', borderRadius: radiusInnerPx, border: 'none',
                        background: ctaBg, color: ctaFg, fontSize: '14px', fontWeight: 800,
                        cursor: leadReady ? 'pointer' : 'default', opacity: leadReady ? 1 : 0.6,
                        fontFamily,
                      }}>
                      Send
                    </button>
                  </div>
                )}

                {leadView === 'done' && (
                  <div data-testid="advanced-cta-done" style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '11px 13px', borderRadius: eff.radiusMd,
                    background: resultTinted ? 'rgba(255,255,255,0.16)' : c.accentTint,
                  }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      background: ctaBg, color: ctaFg, fontSize: '12px', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: c.resultText }}>
                      Thanks — we’ll be in touch shortly.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── One field ─── */

function FieldInput({ field, value, accent, theme, onChange, radiusPx, fieldStyle, fontFamily }: {
  field: AdvField;
  value: Answer;
  accent: string;
  theme: WidgetTheme;
  onChange: (v: Answer) => void;
  /** Wave H5 — corner radius applied to inputs / cards. */
  radiusPx: string;
  /** Wave H5 — `filled` (default) vs `outline`. */
  fieldStyle: AdvFieldStyle;
  /** Wave H5 — resolved font stack. */
  fontFamily: string;
}) {
  const f = field;
  const c = theme;

  // Wave H5 — field style:
  //   filled   = themed surface fill, single-stroke border (the legacy look).
  //   outline  = transparent fill, thicker stroke so the input reads outlined
  //              against the body background. Both apply the user's radius.
  const isOutline = fieldStyle === 'outline';
  const inputBase: React.CSSProperties = {
    width: '100%', height: '44px', borderRadius: radiusPx,
    border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
    padding: '0 14px', fontSize: '14px',
    color: c.text,
    background: isOutline ? 'transparent' : c.surface,
    fontFamily, outline: 'none',
    boxSizing: 'border-box',
  };

  if (f.type === 'heading') {
    return (
      <p style={{
        fontSize: '15px', fontWeight: 700, color: c.text, margin: '2px 0 0',
        paddingBottom: '7px', borderBottom: `1px solid ${c.border}`,
      }}>
        {f.label}
      </p>
    );
  }

  // Stable id so the `<label>` associates with its control (a11y).
  const inputId = `adv-field-${f.id || f.name?.replace(/[^a-z0-9]+/gi, '_') || 'x'}`;

  if (f.type === 'number') {
    return (
      <div>
        <label htmlFor={inputId} style={labelStyle(c)}>{f.label}</label>
        <input id={inputId} type="number" value={value as number} min={f.min} max={f.max} step={f.step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...inputBase, fontFamily: eff.fontMono }} />
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div>
        <label htmlFor={inputId} style={labelStyle(c)}>{f.label}</label>
        <input id={inputId} type="text" value={value as string}
          onChange={(e) => onChange(e.target.value)} style={inputBase} />
      </div>
    );
  }

  if (f.type === 'slider') {
    const min = f.min ?? 0, max = f.max ?? 100;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>{f.label}</span>
          <span style={{
            fontSize: '13px', fontWeight: 700, color: accent, fontFamily: eff.fontMono,
            background: c.accentTint, borderRadius: eff.radiusSm, padding: '3px 9px',
          }}>
            {String(value)}{f.unit ? ' ' + f.unit : ''}
          </span>
        </div>
        <input id={inputId} aria-label={f.label} type="range" min={min} max={max} step={f.step || 1} value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: accent }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: '2px',
          fontSize: '11px', color: c.textMuted, fontFamily: eff.fontMono,
        }}>
          <span>{min}{f.unit ? ' ' + f.unit : ''}</span>
          <span>{max}{f.unit ? ' ' + f.unit : ''}</span>
        </div>
      </div>
    );
  }

  if (f.type === 'toggle') {
    const on = value === true;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '12px 14px', borderRadius: radiusPx,
        background: isOutline ? 'transparent' : c.surface,
        border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>{f.label}</span>
        <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
          style={{
            width: '44px', height: '26px', borderRadius: '13px', border: 'none', flexShrink: 0,
            background: on ? accent : c.border, cursor: 'pointer', position: 'relative',
            transition: 'background 0.15s',
          }}>
          <span style={{
            position: 'absolute', top: '3px', left: on ? '21px' : '3px',
            width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>
    );
  }

  if (f.type === 'select') {
    return (
      <div>
        <label htmlFor={inputId} style={labelStyle(c)}>{f.label}</label>
        <select id={inputId} value={value as string} onChange={(e) => onChange(e.target.value)} style={inputBase}>
          {(f.options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (f.type === 'radio') {
    return (
      <div>
        <label style={labelStyle(c)}>{f.label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  padding: '11px 13px', borderRadius: radiusPx, cursor: 'pointer',
                  border: 'none',
                  background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                  boxShadow: sel ? `0 0 0 1.5px ${accent}`
                    : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
                }}>
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                  border: sel ? `5px solid ${accent}` : `2px solid ${c.border}`, background: c.surface,
                }} />
                <span style={{ fontSize: '14px', color: c.text }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (f.type === 'image_choice') {
    return (
      <div>
        <label style={labelStyle(c)}>{f.label}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px',
                  borderRadius: radiusPx, cursor: 'pointer', border: 'none',
                  background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                  boxShadow: sel ? `0 0 0 2px ${accent}`
                    : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
                }}>
                <div style={{
                  width: '100%', aspectRatio: '3 / 2', borderRadius: eff.radiusSm,
                  background: c.bg, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {o.image
                    ? <img src={o.image} alt={o.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '11px', color: c.textMuted }}>No image</span>}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: c.text, textAlign: 'center' }}>
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // multi_select
  const ids = Array.isArray(value) ? value : [];
  return (
    <div>
      <label style={labelStyle(c)}>{f.label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(f.options || []).map((o) => {
          const sel = ids.includes(o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => onChange(sel ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '11px 13px', borderRadius: radiusPx, cursor: 'pointer',
                border: 'none',
                background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                boxShadow: sel ? `0 0 0 1.5px ${accent}`
                  : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? accent : c.surface, border: sel ? 'none' : `2px solid ${c.border}`,
                color: '#fff', fontSize: '12px', fontWeight: 700,
              }}>{sel ? '✓' : ''}</span>
              <span style={{ fontSize: '14px', color: c.text }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
