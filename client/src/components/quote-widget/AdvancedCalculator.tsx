/**
 * Advanced (custom-built) calculator — the customer-facing runtime for
 * `calculator_settings.advanced`. Renders owner-defined fields on a single
 * page and shows an instant total computed by the phase-1a formula engine.
 *
 * Phase 1c of the advanced-builder epic. The QuoteWidget renders this instead
 * of the pricing-family flow when `advanced.enabled` is true.
 */
import { useMemo, useState } from 'react';
import { runCalculations, type FormulaContext } from '@shared/formulaEngine';
import { eff, inputStyle } from './designTokens';

/* ─── Config types (mirror calculator_settings.advanced) ─── */

interface AdvOption { id: string; label: string; value: number; }
interface AdvField {
  id: string;
  name: string;
  label: string;
  type: 'number' | 'slider' | 'select' | 'radio' | 'multi_select' | 'toggle' | 'text';
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
export interface AdvancedConfig {
  enabled?: boolean;
  fields?: AdvField[];
  calculations?: AdvCalc[];
  result_calc?: string;
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
    else if (f.type === 'select' || f.type === 'radio') a[f.name] = f.options?.[0]?.id ?? '';
    else a[f.name] = '';
  }
  return a;
}

/** The numeric/array value a single field contributes to a formula context. */
function rawFieldValue(f: AdvField, answers: Record<string, Answer>): FormulaContext[string] {
  const v = answers[f.name];
  if (f.type === 'number' || f.type === 'slider') return Number(v) || 0;
  if (f.type === 'text') return String(v ?? '');
  if (f.type === 'toggle') return v ? (f.on_value ?? 1) : 0;
  if (f.type === 'select' || f.type === 'radio') return f.options?.find((o) => o.id === v)?.value ?? 0;
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
  fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '6px',
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
  const breakdown = calcs.filter((c) => c.name !== resultName);

  return (
    <div style={{
      background: '#fff', borderRadius: eff.radius2xl,
      border: `1px solid ${eff.buttonBorder}`, boxShadow: eff.shadowCard,
      overflow: 'hidden', fontFamily: eff.font,
    }}>
      {/* Header */}
      {(businessName || logoUrl) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '18px 24px', borderBottom: `1px solid ${eff.buttonBorder}`,
        }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ width: 34, height: 34, borderRadius: eff.radiusMd, objectFit: 'contain' }} />
          )}
          <p style={{ fontSize: '15px', fontWeight: 700, color: eff.text, margin: 0 }}>{businessName}</p>
        </div>
      )}

      <div style={{ padding: '24px' }}>
        {fields.length === 0 && (
          <p style={{ fontSize: '14px', color: eff.textBody, textAlign: 'center', padding: '24px 0' }}>
            This calculator hasn't been set up yet.
          </p>
        )}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {fields.filter((f) => visibleIds.has(f.id)).map((f) => (
            <FieldInput key={f.id} field={f} value={answers[f.name]} accent={accent}
              onChange={(v) => setAnswer(f.name, v)} />
          ))}
        </div>

        {/* Result */}
        {calcs.length > 0 && (
          <div style={{
            marginTop: '24px', borderRadius: eff.radiusXl,
            border: `1px solid ${eff.buttonBorder}`, background: eff.bgSecondary,
            padding: '20px',
          }}>
            <p style={{
              fontSize: '12px', fontWeight: 600, color: eff.textBody,
              textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px',
            }}>
              {resultCalc?.name || 'Total'}
            </p>
            <p style={{
              fontSize: 'clamp(26px, 7vw, 34px)', fontWeight: 800, color: eff.text,
              margin: 0, fontFamily: eff.fontMono, lineHeight: 1, letterSpacing: '-0.02em',
            }}>
              {formatResult(headline, resultCalc?.format || 'currency')}
            </p>

            {breakdown.length > 0 && (
              <div style={{
                marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${eff.buttonBorder}`,
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                {breakdown.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: eff.textBody }}>{c.name}</span>
                    <span style={{ fontWeight: 600, color: eff.text, fontFamily: eff.fontMono }}>
                      {formatResult(values[c.name] ?? 0, c.format)}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
  const labelEl = (
    <label style={labelStyle}>
      {f.label}
      {!f.required && <span style={{ fontWeight: 400, color: eff.textBody }}> (optional)</span>}
    </label>
  );

  if (f.type === 'number') {
    return (
      <div>
        {labelEl}
        <input type="number" value={value as number} min={f.min} max={f.max} step={f.step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...inputStyle, fontFamily: eff.fontMono }} />
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div>
        {labelEl}
        <input type="text" value={value as string}
          onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      </div>
    );
  }

  if (f.type === 'slider') {
    const min = f.min ?? 0, max = f.max ?? 100;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          {labelEl}
          <span style={{ fontSize: '13px', fontWeight: 700, color: accent, fontFamily: eff.fontMono }}>
            {String(value)}{f.unit ? ' ' + f.unit : ''}
          </span>
        </div>
        <input type="range" min={min} max={max} step={f.step || 1} value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: accent }} />
      </div>
    );
  }

  if (f.type === 'toggle') {
    const on = value === true;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ ...labelStyle, marginBottom: 0 }}>{f.label}</span>
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
        {labelEl}
        <select value={value as string} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {(f.options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (f.type === 'radio') {
    return (
      <div>
        {labelEl}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  padding: '12px 14px', borderRadius: eff.radiusMd, cursor: 'pointer',
                  border: 'none', boxShadow: sel ? `0 0 0 2px ${accent}` : `0 0 0 1px ${eff.buttonBorder}`,
                  background: sel ? eff.accentTint : '#fff',
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

  // multi_select
  const ids = Array.isArray(value) ? value : [];
  return (
    <div>
      {labelEl}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(f.options || []).map((o) => {
          const sel = ids.includes(o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => onChange(sel ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '12px 14px', borderRadius: eff.radiusMd, cursor: 'pointer',
                border: 'none', boxShadow: sel ? `0 0 0 2px ${accent}` : `0 0 0 1px ${eff.buttonBorder}`,
                background: sel ? eff.accentTint : '#fff',
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
