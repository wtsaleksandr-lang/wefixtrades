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
import { eff } from './designTokens';
import { resolveWidgetTheme, type WidgetTheme } from './widgetThemes';

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
}
interface AdvCalc { id: string; name: string; formula: string; format: 'number' | 'currency' | 'percent'; }
interface AdvHeader { title?: string; subtitle?: string; align?: 'left' | 'center' | 'right'; }
interface AdvResults { heading?: string; footnote?: string; show_breakdown?: boolean; }
export interface AdvancedConfig {
  enabled?: boolean;
  fields?: AdvField[];
  calculations?: AdvCalc[];
  result_calc?: string;
  header?: AdvHeader;
  results?: AdvResults;
  theme?: string;
  layout?: 'single_page' | 'two_column' | 'multi_step';
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
  const c = resolveWidgetTheme(advanced.theme, accentColor);
  const accent = c.accent;
  const fields = advanced.fields || [];
  const calcs = advanced.calculations || [];

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => initAnswers(fields));
  const setAnswer = (name: string, value: Answer) => setAnswers((p) => ({ ...p, [name]: value }));

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

  const resultName = advanced.result_calc || (calcs.length ? calcs[calcs.length - 1].name : '');
  const resultCalc = calcs.find((cl) => cl.name === resultName);
  const headline = values[resultName] ?? 0;
  const results = advanced.results || {};
  const showBreakdown = results.show_breakdown !== false;
  const resultHeading = (results.heading || '').trim() || resultCalc?.name || 'Total';
  const footnoteText = (results.footnote || '').trim() || 'Instant estimate based on your inputs.';
  const breakdown = calcs.filter((cl) => cl.name !== resultName);
  const visibleFields = fields.filter((f) => visibleIds.has(f.id));

  // A tinted result panel (coral / dark) drops its border and uses a
  // translucent divider; a white panel keeps the theme border.
  const resultTinted = c.result.toLowerCase() !== c.surface.toLowerCase();
  const resultDivider = resultTinted ? 'rgba(255,255,255,0.22)' : c.border;

  return (
    <div data-testid="advanced-calculator" style={{
      background: c.surface, borderRadius: eff.radius2xl,
      border: `1px solid ${c.border}`, boxShadow: c.shadow,
      overflow: 'hidden', fontFamily: eff.font,
    }}>
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
              <p style={{ fontSize: '17px', fontWeight: 800, color: c.text, margin: 0, letterSpacing: '-0.01em' }}>
                {title}
              </p>
            </div>
            {subtitle && (
              <p style={{ fontSize: '13px', color: c.textBody, margin: '5px 0 0', textAlign: align, lineHeight: 1.5 }}>
                {subtitle}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Body — two_column puts the result beside the inputs; single_page
            and multi_step stack it below. ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        flexDirection: (advanced.layout || 'two_column') === 'two_column' ? 'row' : 'column',
        gap: '16px', padding: '20px', background: c.bg,
      }}>
        {/* Inputs */}
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {visibleFields.length === 0 && (
            <p style={{ fontSize: '14px', color: c.textBody, padding: '20px 0' }}>
              This calculator hasn't been set up yet.
            </p>
          )}
          {visibleFields.map((f) => (
            <FieldInput key={f.id} field={f} value={answers[f.name]} accent={accent} theme={c}
              onChange={(v) => setAnswer(f.name, v)} />
          ))}
        </div>

        {/* Result panel — a separate rounded container */}
        {calcs.length > 0 && (
          <div style={{
            flex: '1 1 200px', minWidth: 0, alignSelf: 'flex-start',
            borderRadius: eff.radiusXl, background: c.result,
            border: resultTinted ? 'none' : `1px solid ${c.border}`, boxShadow: c.shadow,
            padding: '20px',
          }}>
            <p style={{
              fontSize: '11px', fontWeight: 700, color: c.resultMuted,
              textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px',
            }}>
              {resultHeading}
            </p>
            <p style={{
              fontSize: 'clamp(28px, 6vw, 38px)', fontWeight: 800, color: c.resultText,
              margin: 0, fontFamily: eff.fontMono, lineHeight: 1.05, letterSpacing: '-0.02em',
            }}>
              {formatResult(headline, resultCalc?.format || 'currency')}
            </p>

            {showBreakdown && breakdown.length > 0 && (
              <div style={{
                marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${resultDivider}`,
                display: 'flex', flexDirection: 'column', gap: '9px',
              }}>
                {breakdown.map((cl) => (
                  <div key={cl.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: c.resultMuted }}>{cl.name}</span>
                    <span style={{ fontWeight: 700, color: c.resultText, fontFamily: eff.fontMono }}>
                      {formatResult(values[cl.name] ?? 0, cl.format)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p style={{
              fontSize: '11px', color: c.resultMuted, margin: '14px 0 0', lineHeight: 1.5,
            }}>
              {footnoteText}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── One field ─── */

function FieldInput({ field, value, accent, theme, onChange }: {
  field: AdvField; value: Answer; accent: string; theme: WidgetTheme; onChange: (v: Answer) => void;
}) {
  const f = field;
  const c = theme;

  const inputBase: React.CSSProperties = {
    width: '100%', height: '44px', borderRadius: eff.radiusMd,
    border: `1px solid ${c.border}`, padding: '0 14px', fontSize: '14px',
    color: c.text, background: c.surface, fontFamily: eff.font, outline: 'none',
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

  if (f.type === 'number') {
    return (
      <div>
        <label style={labelStyle(c)}>{f.label}</label>
        <input type="number" value={value as number} min={f.min} max={f.max} step={f.step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...inputBase, fontFamily: eff.fontMono }} />
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div>
        <label style={labelStyle(c)}>{f.label}</label>
        <input type="text" value={value as string}
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
        <input type="range" min={min} max={max} step={f.step || 1} value={value as number}
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
        padding: '12px 14px', borderRadius: eff.radiusMd, background: c.surface,
        border: `1px solid ${c.border}`,
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
        <label style={labelStyle(c)}>{f.label}</label>
        <select value={value as string} onChange={(e) => onChange(e.target.value)} style={inputBase}>
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
                  padding: '11px 13px', borderRadius: eff.radiusMd, cursor: 'pointer',
                  border: 'none', background: sel ? c.accentTint : c.surface,
                  boxShadow: sel ? `0 0 0 1.5px ${accent}` : `0 0 0 1px ${c.border}`,
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
                  borderRadius: eff.radiusMd, cursor: 'pointer', border: 'none',
                  background: sel ? c.accentTint : c.surface,
                  boxShadow: sel ? `0 0 0 2px ${accent}` : `0 0 0 1px ${c.border}`,
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
                padding: '11px 13px', borderRadius: eff.radiusMd, cursor: 'pointer',
                border: 'none', background: sel ? c.accentTint : c.surface,
                boxShadow: sel ? `0 0 0 1.5px ${accent}` : `0 0 0 1px ${c.border}`,
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
