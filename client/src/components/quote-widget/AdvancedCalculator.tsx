/**
 * Advanced (custom-built) calculator — the customer-facing runtime for
 * `calculator_settings.advanced`.
 *
 * Layout follows Elfsight's calculator (centred title, inputs alongside a
 * standing result panel, sliders with a value pill); the visual treatment
 * follows the QuoteQuick design language — rounded, separated panels on a
 * slate-grey surface with a vivid accent.
 *
 * Phases 1c / 2 / visual-parity of the advanced-builder epic.
 */
import { useMemo, useState } from 'react';
import { runCalculations, type FormulaContext } from '@shared/formulaEngine';
import { eff } from './designTokens';

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
}

interface Props {
  businessName?: string;
  logoUrl?: string;
  advanced: AdvancedConfig;
  accentColor?: string;
}

type Answer = number | string | boolean | string[];

function initAnswers(fields: AdvField[]): Record<string, Answer> {
  const a: Record<string, Answer> = {};
  for (const f of fields) {
    if (f.type === 'number' || f.type === 'slider') a[f.name] = f.default_value ?? f.min ?? 0;
    else if (f.type === 'toggle') a[f.name] = false;
    else if (f.type === 'multi_select') a[f.name] = [];
    else if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') a[f.name] = f.options?.[0]?.id ?? '';
    else a[f.name] = '';
  }
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

const labelStyle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '7px',
};

export default function AdvancedCalculator({ businessName, logoUrl, advanced, accentColor }: Props) {
  const accent = accentColor || eff.accent;
  const fields = advanced.fields || [];
  const calcs = advanced.calculations || [];

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => initAnswers(fields));
  const setAnswer = (name: string, value: Answer) => setAnswers((p) => ({ ...p, [name]: value }));

  // Raw values (every field) → visibility → formula context (a hidden field
  // contributes a neutral value so it doesn't skew the total).
  const raw = useMemo(() => {
    const c: FormulaContext = {};
    for (const f of fields) c[f.name] = rawFieldValue(f, answers);
    return c;
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
    const c: FormulaContext = {};
    for (const f of fields) c[f.name] = visibleIds.has(f.id) ? raw[f.name] : emptyFieldValue(f);
    return c;
  }, [fields, raw, visibleIds]);

  const { values } = useMemo(() => runCalculations(calcs, ctx), [calcs, ctx]);

  const resultName = advanced.result_calc || (calcs.length ? calcs[calcs.length - 1].name : '');
  const resultCalc = calcs.find((c) => c.name === resultName);
  const headline = values[resultName] ?? 0;
  const results = advanced.results || {};
  const showBreakdown = results.show_breakdown !== false;
  const resultHeading = (results.heading || '').trim() || resultCalc?.name || 'Total';
  const footnoteText = (results.footnote || '').trim() || 'Instant estimate based on your inputs.';
  const breakdown = calcs.filter((c) => c.name !== resultName);
  const visibleFields = fields.filter((f) => visibleIds.has(f.id));

  return (
    <div data-testid="advanced-calculator" style={{
      background: '#fff', borderRadius: eff.radius2xl,
      border: `1px solid ${eff.buttonBorder}`, boxShadow: eff.shadowCard,
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
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${eff.buttonBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: justify, gap: '10px' }}>
              {logoUrl && (
                <img src={logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: eff.radiusMd, objectFit: 'contain' }} />
              )}
              <p style={{ fontSize: '17px', fontWeight: 800, color: eff.text, margin: 0, letterSpacing: '-0.01em' }}>
                {title}
              </p>
            </div>
            {subtitle && (
              <p style={{ fontSize: '13px', color: eff.textBody, margin: '5px 0 0', textAlign: align, lineHeight: 1.5 }}>
                {subtitle}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Body — inputs alongside a standing result panel ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '20px',
        background: eff.bg,
      }}>
        {/* Inputs */}
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {visibleFields.length === 0 && (
            <p style={{ fontSize: '14px', color: eff.textBody, padding: '20px 0' }}>
              This calculator hasn't been set up yet.
            </p>
          )}
          {visibleFields.map((f) => (
            <FieldInput key={f.id} field={f} value={answers[f.name]} accent={accent}
              onChange={(v) => setAnswer(f.name, v)} />
          ))}
        </div>

        {/* Result panel — a separate rounded container */}
        {calcs.length > 0 && (
          <div style={{
            flex: '1 1 200px', minWidth: 0, alignSelf: 'flex-start',
            borderRadius: eff.radiusXl, background: '#fff',
            border: `1px solid ${eff.buttonBorder}`, boxShadow: eff.shadowCard,
            padding: '20px',
          }}>
            <p style={{
              fontSize: '11px', fontWeight: 700, color: eff.textBody,
              textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px',
            }}>
              {resultHeading}
            </p>
            <p style={{
              fontSize: 'clamp(28px, 6vw, 38px)', fontWeight: 800, color: eff.text,
              margin: 0, fontFamily: eff.fontMono, lineHeight: 1.05, letterSpacing: '-0.02em',
            }}>
              {formatResult(headline, resultCalc?.format || 'currency')}
            </p>

            {showBreakdown && breakdown.length > 0 && (
              <div style={{
                marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${eff.buttonBorder}`,
                display: 'flex', flexDirection: 'column', gap: '9px',
              }}>
                {breakdown.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: eff.textBody }}>{c.name}</span>
                    <span style={{ fontWeight: 700, color: eff.text, fontFamily: eff.fontMono }}>
                      {formatResult(values[c.name] ?? 0, c.format)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p style={{
              fontSize: '11px', color: eff.textMuted, margin: '14px 0 0', lineHeight: 1.5,
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

function FieldInput({ field, value, accent, onChange }: {
  field: AdvField; value: Answer; accent: string; onChange: (v: Answer) => void;
}) {
  const f = field;

  const inputBase: React.CSSProperties = {
    width: '100%', height: '44px', borderRadius: eff.radiusMd,
    border: `1px solid ${eff.buttonBorder}`, padding: '0 14px', fontSize: '14px',
    color: eff.text, background: '#fff', fontFamily: eff.font, outline: 'none',
    boxSizing: 'border-box',
  };

  if (f.type === 'heading') {
    return (
      <p style={{
        fontSize: '15px', fontWeight: 700, color: eff.text, margin: '2px 0 0',
        paddingBottom: '7px', borderBottom: `1px solid ${eff.buttonBorder}`,
      }}>
        {f.label}
      </p>
    );
  }

  if (f.type === 'number') {
    return (
      <div>
        <label style={labelStyle}>{f.label}</label>
        <input type="number" value={value as number} min={f.min} max={f.max} step={f.step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...inputBase, fontFamily: eff.fontMono }} />
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div>
        <label style={labelStyle}>{f.label}</label>
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
          <span style={{ fontSize: '13px', fontWeight: 600, color: eff.text }}>{f.label}</span>
          <span style={{
            fontSize: '13px', fontWeight: 700, color: accent, fontFamily: eff.fontMono,
            background: eff.accentTint, borderRadius: eff.radiusSm, padding: '3px 9px',
          }}>
            {String(value)}{f.unit ? ' ' + f.unit : ''}
          </span>
        </div>
        <input type="range" min={min} max={max} step={f.step || 1} value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: accent }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: '2px',
          fontSize: '11px', color: eff.textMuted, fontFamily: eff.fontMono,
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
        padding: '12px 14px', borderRadius: eff.radiusMd, background: '#fff',
        border: `1px solid ${eff.buttonBorder}`,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: eff.text }}>{f.label}</span>
        <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
          style={{
            width: '44px', height: '26px', borderRadius: '13px', border: 'none', flexShrink: 0,
            background: on ? accent : '#D1D5DB', cursor: 'pointer', position: 'relative',
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
        <label style={labelStyle}>{f.label}</label>
        <select value={value as string} onChange={(e) => onChange(e.target.value)} style={inputBase}>
          {(f.options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (f.type === 'radio') {
    return (
      <div>
        <label style={labelStyle}>{f.label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  padding: '11px 13px', borderRadius: eff.radiusMd, cursor: 'pointer',
                  border: 'none', background: sel ? eff.accentTint : '#fff',
                  boxShadow: sel ? `0 0 0 1.5px ${accent}` : `0 0 0 1px ${eff.buttonBorder}`,
                }}>
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                  border: sel ? `5px solid ${accent}` : `2px solid ${eff.buttonBorder}`, background: '#fff',
                }} />
                <span style={{ fontSize: '14px', color: eff.text }}>{o.label}</span>
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
        <label style={labelStyle}>{f.label}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px',
                  borderRadius: eff.radiusMd, cursor: 'pointer', border: 'none',
                  background: sel ? eff.accentTint : '#fff',
                  boxShadow: sel ? `0 0 0 2px ${accent}` : `0 0 0 1px ${eff.buttonBorder}`,
                }}>
                <div style={{
                  width: '100%', aspectRatio: '3 / 2', borderRadius: eff.radiusSm,
                  background: eff.bg, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {o.image
                    ? <img src={o.image} alt={o.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '11px', color: eff.textMuted }}>No image</span>}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: eff.text, textAlign: 'center' }}>
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
      <label style={labelStyle}>{f.label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(f.options || []).map((o) => {
          const sel = ids.includes(o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => onChange(sel ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '11px 13px', borderRadius: eff.radiusMd, cursor: 'pointer',
                border: 'none', background: sel ? eff.accentTint : '#fff',
                boxShadow: sel ? `0 0 0 1.5px ${accent}` : `0 0 0 1px ${eff.buttonBorder}`,
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? accent : '#fff', border: sel ? 'none' : `2px solid ${eff.buttonBorder}`,
                color: '#fff', fontSize: '12px', fontWeight: 700,
              }}>{sel ? '✓' : ''}</span>
              <span style={{ fontSize: '14px', color: eff.text }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
