// Advanced custom-calculator builder — phase 1d of the advanced-builder epic.
// The "build it yourself" UI shown in the Logic step when advanced mode is on:
// a Fields editor + a Calculations editor (formula input with insert chips and
// live validation). Edits write straight to calculator_settings.advanced, so
// the wizard's live-preview pane renders the result instantly.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { platformTheme as p } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';
import { validateFormula, runCalculations, type FormulaContext } from '@shared/formulaEngine';
import {
  Plus, Trash2, ChevronLeft, Hash, SlidersHorizontal, List, CircleDot,
  CheckSquare, ToggleLeft, Type, Sigma, Eye, Sparkles, Loader2,
  Image as ImageIcon, Heading, Search, X, ChevronDown, Info,
} from 'lucide-react';

/* ─── Types (mirror calculator_settings.advanced) ─── */

type FieldType = 'number' | 'slider' | 'select' | 'radio' | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading';
interface AdvOption { id: string; label: string; value: number; image?: string; }
type RuleOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';
interface VisRule { field: string; op: RuleOp; value: number; }
interface AdvField {
  id: string; name: string; label: string; type: FieldType;
  required?: boolean; default_value?: number; min?: number; max?: number;
  step?: number; unit?: string; on_value?: number; options?: AdvOption[];
  visible_when?: VisRule;
}

const RULE_OPS: { id: RuleOp; label: string }[] = [
  { id: 'eq', label: 'is' },
  { id: 'ne', label: 'is not' },
  { id: 'gt', label: 'is over' },
  { id: 'lt', label: 'is under' },
  { id: 'gte', label: 'is at least' },
  { id: 'lte', label: 'is at most' },
];
interface AdvCalc { id: string; name: string; formula: string; format: 'number' | 'currency' | 'percent'; }
export interface AdvancedConfigData {
  enabled?: boolean; fields?: AdvField[]; calculations?: AdvCalc[]; result_calc?: string;
}

interface Props {
  advanced: AdvancedConfigData;
  onChange: (next: AdvancedConfigData) => void;
  onExitAdvanced: () => void;
}

/** Catalogue used both by the type dropdown and the visual field picker. */
const FIELD_TYPES: { id: FieldType; label: string; desc: string; Icon: any; cat: string }[] = [
  { id: 'number', label: 'Number', desc: 'A numeric value the customer types in', Icon: Hash, cat: 'Basic inputs' },
  { id: 'slider', label: 'Slider', desc: 'Pick a value by dragging along a range', Icon: SlidersHorizontal, cat: 'Basic inputs' },
  { id: 'text', label: 'Text', desc: 'Free text — not used in the pricing math', Icon: Type, cat: 'Basic inputs' },
  { id: 'select', label: 'Dropdown', desc: 'Choose one option from a compact list', Icon: List, cat: 'Choices' },
  { id: 'radio', label: 'Radio buttons', desc: 'Choose one — every option stays visible', Icon: CircleDot, cat: 'Choices' },
  { id: 'multi_select', label: 'Checkboxes', desc: 'Choose any number of options', Icon: CheckSquare, cat: 'Choices' },
  { id: 'toggle', label: 'Toggle', desc: 'A simple on / off switch', Icon: ToggleLeft, cat: 'Choices' },
  { id: 'image_choice', label: 'Image choice', desc: 'Pick an option shown as an image card', Icon: ImageIcon, cat: 'Visual' },
  { id: 'heading', label: 'Heading', desc: 'A section title — not an input', Icon: Heading, cat: 'Layout' },
];
const FIELD_CATS = ['Basic inputs', 'Choices', 'Visual', 'Layout'];
const OPTION_TYPES = new Set<FieldType>(['select', 'radio', 'multi_select', 'image_choice']);

const gid = (pfx: string) => `${pfx}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function newField(type: FieldType = 'number'): AdvField {
  const base: AdvField = {
    id: gid('fld'), type,
    name: type === 'heading' ? 'Section heading' : 'New field',
    label: type === 'heading' ? 'Section heading' : 'New field',
    options: [], on_value: 1,
  };
  if (type === 'number' || type === 'slider') { base.default_value = 0; base.min = 0; base.max = 100; base.step = 1; }
  if (OPTION_TYPES.has(type)) {
    base.options = [
      { id: gid('opt'), label: 'Option 1', value: 0 },
      { id: gid('opt'), label: 'Option 2', value: 0 },
    ];
  }
  return base;
}
function newCalc(): AdvCalc {
  return { id: gid('calc'), name: 'Total', formula: '', format: 'currency' };
}

/* ─── Small UI helpers ─── */

const cardStyle: React.CSSProperties = {
  borderRadius: d.radius.card, background: d.colors.card, boxShadow: d.shadows.card,
  padding: '14px', border: 'none',
};
const inputCls = 'premium-input';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: p.colors.subtle,
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

/* ─── Main ─── */

export default function AdvancedBuilder({ advanced, onChange, onExitAdvanced }: Props) {
  const fields = advanced.fields || [];
  const calcs = advanced.calculations || [];

  const patch = (next: Partial<AdvancedConfigData>) => onChange({ ...advanced, ...next });

  /* AI generator */
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiGenerate = async () => {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/generate-advanced-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.advanced) {
        setAiError(data?.error || 'Could not generate a calculator. Try rephrasing.');
      } else {
        onChange({ ...advanced, ...data.advanced, enabled: true });
        setAiText('');
      }
    } catch {
      setAiError('Something went wrong. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  /* fields */
  const [showPicker, setShowPicker] = useState(false);
  const addField = (type: FieldType) => {
    patch({ fields: [...fields, newField(type)] });
    setShowPicker(false);
  };
  const updateField = (id: string, u: Partial<AdvField>) =>
    patch({ fields: fields.map((f) => (f.id === id ? { ...f, ...u } : f)) });
  const removeField = (id: string) => patch({ fields: fields.filter((f) => f.id !== id) });

  /* calcs */
  const addCalc = () => patch({ calculations: [...calcs, newCalc()] });
  const updateCalc = (id: string, u: Partial<AdvCalc>) =>
    patch({ calculations: calcs.map((c) => (c.id === id ? { ...c, ...u } : c)) });
  const removeCalc = (id: string) => patch({ calculations: calcs.filter((c) => c.id !== id) });

  // Sample context (field defaults) for live formula previews.
  const sampleCtx = useMemo<FormulaContext>(() => {
    const ctx: FormulaContext = {};
    for (const f of fields) {
      if (f.type === 'number' || f.type === 'slider') ctx[f.name] = f.default_value ?? f.min ?? 0;
      else if (f.type === 'toggle') ctx[f.name] = 0;
      else if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') ctx[f.name] = f.options?.[0]?.value ?? 0;
      else if (f.type === 'multi_select') ctx[f.name] = [];
      else ctx[f.name] = '';
    }
    return ctx;
  }, [fields]);
  const calcValues = useMemo(() => runCalculations(calcs, sampleCtx).values, [calcs, sampleCtx]);

  return (
    <div className="animate-fade-in-up wizard-step-fill" data-testid="advanced-builder">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sigma style={{ width: 18, height: 18, color: p.colors.accent }} />
          <span style={{ ...p.typography.h3, margin: 0 }}>Custom calculator</span>
        </div>
        <button type="button" data-testid="button-exit-advanced" onClick={onExitAdvanced}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
            cursor: 'pointer', color: p.colors.accent, fontSize: 13, fontWeight: 600,
          }}>
          <ChevronLeft style={{ width: 15, height: 15 }} /> Simple mode
        </button>
      </div>
      <p style={{ fontSize: 13, color: p.colors.muted, lineHeight: 1.5, margin: '0 0 14px' }}>
        Build your own fields and pricing formulas. The preview updates as you go.
      </p>

      {/* ─── AI generator ─── */}
      <div style={{
        borderRadius: d.radius.card, background: p.colors.accentLighter,
        padding: 14, marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: p.colors.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: p.colors.accentDark }}>
            Describe it, let AI build it
          </span>
        </div>
        <textarea data-testid="input-ai-describe" value={aiText}
          onChange={(e) => setAiText(e.target.value)} rows={3} className={inputCls}
          placeholder="e.g. A moving quote — number of rooms, distance in miles, optional packing service, then 10% tax."
          style={{ width: '100%', fontSize: 13, resize: 'vertical', padding: '10px 12px' }} />
        {aiError && (
          <p style={{ fontSize: 12, color: p.colors.danger, margin: '6px 0 0' }}>{aiError}</p>
        )}
        <button type="button" data-testid="button-ai-generate" onClick={aiGenerate}
          disabled={aiLoading || !aiText.trim()}
          style={{
            marginTop: 8, width: '100%', padding: '10px', borderRadius: d.radius.control,
            border: 'none', cursor: aiLoading || !aiText.trim() ? 'default' : 'pointer',
            background: p.colors.accent, color: '#fff', fontSize: 13, fontWeight: 700,
            opacity: aiLoading || !aiText.trim() ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
          {aiLoading
            ? <><Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> Generating…</>
            : <><Sparkles style={{ width: 15, height: 15 }} /> {(fields.length || calcs.length) ? 'Regenerate' : 'Generate calculator'}</>}
        </button>
      </div>

      {/* ─── FIELDS ─── */}
      <div style={{ marginBottom: 10 }}><SectionLabel>Fields the customer fills in</SectionLabel></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f) => (
          <FieldCard key={f.id} field={f} allFields={fields}
            onChange={(u) => updateField(f.id, u)} onRemove={() => removeField(f.id)} />
        ))}
        <button type="button" data-testid="button-add-adv-field" onClick={() => setShowPicker(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px', borderRadius: d.radius.card, cursor: 'pointer',
            border: `1px dashed ${p.colors.borderHover}`, background: '#fff',
            color: p.colors.accent, fontSize: 13, fontWeight: 600,
          }}>
          <Plus style={{ width: 15, height: 15 }} /> Add field
        </button>
      </div>

      {/* ─── CALCULATIONS ─── */}
      <div style={{ margin: '22px 0 10px' }}><SectionLabel>Calculations</SectionLabel></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {calcs.map((c, idx) => (
          <CalcCard key={c.id} calc={c} fields={fields} otherCalcs={calcs.slice(0, idx)}
            preview={calcValues[c.name]}
            onChange={(u) => updateCalc(c.id, u)} onRemove={() => removeCalc(c.id)} />
        ))}
        <button type="button" data-testid="button-add-adv-calc" onClick={addCalc}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px', borderRadius: d.radius.card, cursor: 'pointer',
            border: `1px dashed ${p.colors.borderHover}`, background: '#fff',
            color: p.colors.accent, fontSize: 13, fontWeight: 600,
          }}>
          <Plus style={{ width: 15, height: 15 }} /> Add calculation
        </button>
      </div>

      {/* Result picker */}
      {calcs.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>
            Headline result
          </label>
          <select className={inputCls} data-testid="select-result-calc"
            value={advanced.result_calc || calcs[calcs.length - 1].name}
            onChange={(e) => patch({ result_calc: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}>
            {calcs.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      )}

      {showPicker && <FieldPickerModal onPick={addField} onClose={() => setShowPicker(false)} />}
    </div>
  );
}

/* ─── Field picker modal — visual, searchable, categorised ─── */

function FieldPickerModal({ onPick, onClose }: {
  onPick: (type: FieldType) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const matches = (t: typeof FIELD_TYPES[number]) =>
    !query || t.label.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(17,24,39,0.45)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="field-picker"
        style={{
          width: '100%', maxWidth: 540, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: d.colors.panel, borderRadius: d.radius.panel, boxShadow: d.shadows.panel,
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 12px',
        }}>
          <div>
            <p style={{ ...p.typography.h3, margin: 0 }}>Add a field</p>
            <p style={{ fontSize: 12, color: p.colors.muted, margin: '2px 0 0' }}>
              Pick what the customer fills in.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: d.radius.control, flexShrink: 0,
              border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X style={{ width: 15, height: 15, color: p.colors.muted }} />
          </button>
        </div>

        {/* search */}
        <div style={{ padding: '0 18px 12px', position: 'relative' }}>
          <Search style={{
            width: 15, height: 15, color: p.colors.subtle,
            position: 'absolute', left: 30, top: 11,
          }} />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search field types…" className={inputCls}
            data-testid="field-picker-search"
            style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13 }}
          />
        </div>

        {/* categorised list */}
        <div style={{ overflowY: 'auto', padding: '4px 18px 18px' }}>
          {FIELD_CATS.map((cat) => {
            const items = FIELD_TYPES.filter((t) => t.cat === cat && matches(t));
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <p style={{
                  fontSize: 11, fontWeight: 700, color: p.colors.subtle,
                  letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 7px',
                }}>{cat}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {items.map((t) => (
                    <button key={t.id} type="button" data-testid={`field-picker-${t.id}`}
                      onClick={() => onPick(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                        padding: '11px 13px', borderRadius: d.radius.card, textAlign: 'left',
                        border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
                        cursor: 'pointer', transition: p.transitions.fast,
                      }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: p.colors.accentLighter, color: p.colors.accent,
                      }}>
                        <t.Icon style={{ width: 17, height: 17 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: p.colors.heading, margin: 0 }}>{t.label}</p>
                        <p style={{ fontSize: 12, color: p.colors.muted, margin: 0, lineHeight: 1.4 }}>{t.desc}</p>
                      </div>
                      <Plus style={{ width: 15, height: 15, color: p.colors.subtle, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {FIELD_TYPES.every((t) => !matches(t)) && (
            <p style={{ fontSize: 13, color: p.colors.muted, textAlign: 'center', padding: '16px 0' }}>
              No field types match “{q}”.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Field card ─── */

function FieldCard({ field, allFields, onChange, onRemove }: {
  field: AdvField; allFields: AdvField[];
  onChange: (u: Partial<AdvField>) => void; onRemove: () => void;
}) {
  const f = field;
  const setOptions = (options: AdvOption[]) => onChange({ options });

  return (
    <div style={cardStyle} data-testid={`adv-field-${f.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className={inputCls} value={f.label}
          onChange={(e) => onChange({ label: e.target.value, name: e.target.value })}
          placeholder="Field name" style={{ flex: 1, fontSize: 13 }} />
        <select className={inputCls} value={f.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          style={{ width: 124, fontSize: 13, flexShrink: 0 }}>
          {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button type="button" onClick={onRemove} aria-label="Remove field"
          style={{
            width: 32, height: 32, borderRadius: d.radius.control, flexShrink: 0,
            border: `1px solid ${p.colors.borderLight}`, background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Trash2 style={{ width: 14, height: 14, color: p.colors.muted }} />
        </button>
      </div>

      {/* type-specific config */}
      {(f.type === 'number' || f.type === 'slider') && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {([['min', 'Min'], ['max', 'Max'], ['step', 'Step'], ['default_value', 'Default']] as const).map(([k, lbl]) => (
            <div key={k} style={{ flex: 1 }}>
              <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 3 }}>{lbl}</label>
              <input className={inputCls} type="number" value={(f as any)[k] ?? ''}
                onChange={(e) => onChange({ [k]: e.target.value === '' ? undefined : Number(e.target.value) } as any)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: d.typography.fontMono }} />
            </div>
          ))}
        </div>
      )}
      {f.type === 'toggle' && (
        <div style={{ marginTop: 8 }}>
          <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 3 }}>Value when on</label>
          <input className={inputCls} type="number" value={f.on_value ?? 1}
            onChange={(e) => onChange({ on_value: Number(e.target.value) || 0 })}
            style={{ width: 120, padding: '8px 10px', fontSize: 13, fontFamily: d.typography.fontMono }} />
        </div>
      )}
      {OPTION_TYPES.has(f.type) && (
        <div style={{ marginTop: 8 }}>
          <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: 5 }}>
            {f.type === 'image_choice' ? 'Options (label · value · image URL)' : 'Options (label + value)'}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(f.options || []).map((o, i) => (
              <div key={o.id}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className={inputCls} value={o.label} placeholder="Option label"
                    onChange={(e) => setOptions((f.options || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    style={{ flex: 1, fontSize: 13 }} />
                  <input className={inputCls} type="number" value={o.value}
                    onChange={(e) => setOptions((f.options || []).map((x, j) => j === i ? { ...x, value: Number(e.target.value) || 0 } : x))}
                    style={{ width: 84, fontSize: 13, fontFamily: d.typography.fontMono }} />
                  <button type="button" aria-label="Remove option"
                    onClick={() => setOptions((f.options || []).filter((_, j) => j !== i))}
                    style={{
                      width: 30, height: 30, flexShrink: 0, borderRadius: d.radius.control,
                      border: `1px solid ${p.colors.borderLight}`, background: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Trash2 style={{ width: 13, height: 13, color: p.colors.muted }} />
                  </button>
                </div>
                {f.type === 'image_choice' && (
                  <input className={inputCls} value={o.image || ''} placeholder="https://image-url…"
                    onChange={(e) => setOptions((f.options || []).map((x, j) => j === i ? { ...x, image: e.target.value } : x))}
                    style={{ width: '100%', fontSize: 12, marginTop: 4 }} />
                )}
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => setOptions([...(f.options || []), { id: gid('opt'), label: 'Option', value: 0 }])}
            style={{
              marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, border: 'none',
              background: 'none', cursor: 'pointer', color: p.colors.accent, fontSize: 12, fontWeight: 600,
            }}>
            <Plus style={{ width: 13, height: 13 }} /> Add option
          </button>
        </div>
      )}

      {/* Conditional visibility */}
      <VisibilityRule field={f} allFields={allFields} onChange={onChange} />
    </div>
  );
}

/* ─── Conditional-visibility rule editor ─── */

function VisibilityRule({ field, allFields, onChange }: {
  field: AdvField; allFields: AdvField[]; onChange: (u: Partial<AdvField>) => void;
}) {
  const others = allFields.filter((x) => x.id !== field.id);
  const rule = field.visible_when;
  const setRule = (u: Partial<VisRule>) =>
    onChange({ visible_when: { field: rule?.field ?? '', op: rule?.op ?? 'eq', value: rule?.value ?? 0, ...u } });

  if (!rule) {
    if (others.length === 0) return null;
    return (
      <button type="button" data-testid={`adv-field-addrule-${field.id}`}
        onClick={() => onChange({ visible_when: { field: others[0].name, op: 'eq', value: 0 } })}
        style={{
          marginTop: 8, paddingTop: 8, width: '100%',
          borderTop: `1px solid ${p.colors.borderLight}`,
          display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-start',
          border: 'none', borderTopWidth: 1, borderTopStyle: 'solid',
          borderTopColor: p.colors.borderLight, background: 'none', cursor: 'pointer',
          color: p.colors.accent, fontSize: 12, fontWeight: 600,
        }}>
        <Eye style={{ width: 13, height: 13 }} /> Show only when…
      </button>
    );
  }

  const ctrl = others.find((x) => x.name === rule.field);
  const ctrlIsOptions = !!ctrl && OPTION_TYPES.has(ctrl.type);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${p.colors.borderLight}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ ...p.typography.captionSm }}>Show only when</span>
        <button type="button" onClick={() => onChange({ visible_when: undefined })}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: p.colors.muted, fontSize: 11, fontWeight: 600 }}>
          Always show
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select className={inputCls} value={rule.field} onChange={(e) => setRule({ field: e.target.value })}
          style={{ flex: '1 1 108px', fontSize: 12 }}>
          {others.map((o) => <option key={o.id} value={o.name}>{o.label}</option>)}
        </select>
        <select className={inputCls} value={rule.op} onChange={(e) => setRule({ op: e.target.value as RuleOp })}
          style={{ flex: '0 0 94px', fontSize: 12 }}>
          {RULE_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {ctrlIsOptions ? (
          <select className={inputCls} value={rule.value} onChange={(e) => setRule({ value: Number(e.target.value) })}
            style={{ flex: '1 1 88px', fontSize: 12 }}>
            {(ctrl!.options || []).map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className={inputCls} type="number" value={rule.value}
            onChange={(e) => setRule({ value: Number(e.target.value) || 0 })}
            style={{ flex: '0 0 78px', fontSize: 12, fontFamily: d.typography.fontMono }} />
        )}
      </div>
    </div>
  );
}

/* ─── Calculation card ─── */

type TermOp = '+' | '-' | '*' | '/';
interface GuidedTerm { id: string; op: TermOp; kind: 'field' | 'calc' | 'number'; ref: string; num: number; }

const TERM_OPS: { id: TermOp; label: string }[] = [
  { id: '+', label: '+' }, { id: '-', label: '−' }, { id: '*', label: '×' }, { id: '/', label: '÷' },
];
const OP_CHIPS = ['+', '−', '×', '÷', '(', ')', '^'];
const OP_MAP: Record<string, string> = { '−': '-', '×': '*', '÷': '/' };
const FN_CHIPS = ['SUM(', 'IF(', 'MIN(', 'MAX(', 'ROUND('];
const FN_REF: { sig: string; desc: string }[] = [
  { sig: 'SUM(a, b, …)', desc: 'Adds every value together.' },
  { sig: 'IF(test, yes, no)', desc: 'Uses one value when the test is true, another when false.' },
  { sig: 'MIN(…) / MAX(…)', desc: 'The smallest / largest of the values.' },
  { sig: 'ROUND(value, places)', desc: 'Rounds to the nearest number — ROUNDUP / ROUNDDOWN force the direction.' },
  { sig: 'ABS(value)', desc: 'Drops a negative sign.' },
];

/**
 * Try to read a formula as a simple left-to-right chain of values joined by
 * `+ − × ÷` (what the guided builder can show as steps). Returns `null` for
 * anything with brackets, functions or comparisons — the caller then falls
 * back to Formula mode.
 */
function parseLinear(formula: string, calcNames: string[]): GuidedTerm[] | null {
  const s = (formula || '').trim();
  if (!s) return [];
  const toks: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '[') {
      const end = s.indexOf(']', i);
      if (end === -1) return null;
      toks.push(s.slice(i, end + 1));
      i = end + 1; continue;
    }
    if ('+-*/'.includes(c)) { toks.push(c); i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      toks.push(s.slice(i, j));
      i = j; continue;
    }
    return null; // paren, function, comparison, bare identifier → not linear
  }
  const terms: GuidedTerm[] = [];
  let expectValue = true;
  let pendingOp: TermOp = '+';
  for (const tk of toks) {
    if (expectValue) {
      if ('+-*/'.includes(tk)) return null;
      if (tk.startsWith('[')) {
        const ref = tk.slice(1, -1).trim();
        if (!ref) return null;
        terms.push({ id: gid('trm'), op: pendingOp, kind: calcNames.includes(ref) ? 'calc' : 'field', ref, num: 0 });
      } else {
        const num = parseFloat(tk);
        if (!isFinite(num)) return null;
        terms.push({ id: gid('trm'), op: pendingOp, kind: 'number', ref: '', num });
      }
      expectValue = false;
    } else {
      if (!'+-*/'.includes(tk)) return null;
      pendingOp = tk as TermOp;
      expectValue = true;
    }
  }
  if (expectValue) return null; // trailing operator
  return terms;
}

function compileTerms(terms: GuidedTerm[]): string {
  return terms
    .map((t, i) => {
      const tok = t.kind === 'number' ? String(t.num || 0) : `[${t.ref}]`;
      return i === 0 ? tok : `${t.op} ${tok}`;
    })
    .join(' ');
}

function CalcCard({ calc, fields, otherCalcs, preview, onChange, onRemove }: {
  calc: AdvCalc; fields: AdvField[]; otherCalcs: AdvCalc[]; preview?: number;
  onChange: (u: Partial<AdvCalc>) => void; onRemove: () => void;
}) {
  const c = calc;
  const calcNames = useMemo(() => otherCalcs.map((x) => x.name), [otherCalcs]);
  const check = validateFormula(c.formula);
  const linear = useMemo(() => parseLinear(c.formula, calcNames), [c.formula, calcNames]);
  const hasFormula = c.formula.trim() !== '';

  const [mode, setMode] = useState<'guided' | 'formula'>(linear !== null ? 'guided' : 'formula');
  const [showRef, setShowRef] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

  const insert = (token: string) => onChange({ formula: (c.formula ? c.formula.trimEnd() + ' ' : '') + token });

  const aiGenerate = async () => {
    if (!aiText.trim() || aiBusy) return;
    setAiBusy(true);
    setAiErr('');
    try {
      const res = await fetch('/api/ai/generate-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: aiText.trim(),
          fields: fields.map((f) => ({ name: f.name, type: f.type })),
          calculations: otherCalcs.map((x) => ({ name: x.name })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.formula) {
        setAiErr(data?.error || 'Could not build a formula. Try rephrasing.');
      } else {
        onChange({ formula: data.formula });
        setAiOpen(false);
        setAiText('');
        if (parseLinear(data.formula, calcNames) === null) setMode('formula');
      }
    } catch {
      setAiErr('Something went wrong. Please try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const previewText = useMemo(() => {
    const v = preview ?? 0;
    if (c.format === 'currency') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (c.format === 'percent') return v.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
    return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }, [c.format, preview]);

  return (
    <div style={cardStyle} data-testid={`adv-calc-${c.id}`}>
      {/* name + format + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className={inputCls} value={c.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Calculation name" style={{ flex: 1, fontSize: 13 }} />
        <select className={inputCls} value={c.format}
          onChange={(e) => onChange({ format: e.target.value as AdvCalc['format'] })}
          style={{ width: 110, fontSize: 13, flexShrink: 0 }}>
          <option value="currency">Currency</option>
          <option value="number">Number</option>
          <option value="percent">Percent</option>
        </select>
        <button type="button" onClick={onRemove} aria-label="Remove calculation"
          style={{
            width: 32, height: 32, borderRadius: d.radius.control, flexShrink: 0,
            border: `1px solid ${p.colors.borderLight}`, background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Trash2 style={{ width: 14, height: 14, color: p.colors.muted }} />
        </button>
      </div>

      {/* mode toggle */}
      <div style={{
        display: 'flex', gap: 3, marginTop: 10, padding: 3, width: 'fit-content',
        borderRadius: d.radius.control, background: p.colors.surfaceRaised,
      }}>
        {([['guided', 'Guided'], ['formula', 'Formula']] as const).map(([m, lbl]) => (
          <button key={m} type="button" data-testid={`adv-calc-mode-${m}-${c.id}`}
            onClick={() => setMode(m)}
            style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? p.colors.accentDark : p.colors.muted,
              boxShadow: mode === m ? d.shadows.card : 'none',
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* GUIDED mode */}
      {mode === 'guided' && (
        <div style={{ marginTop: 10 }}>
          {linear !== null ? (
            <GuidedBuilder terms={linear} fields={fields} calcNames={calcNames}
              onChange={(terms) => onChange({ formula: compileTerms(terms) })} />
          ) : (
            <div style={{
              display: 'flex', gap: 8, padding: '10px 12px',
              borderRadius: d.radius.control, background: p.colors.accentLighter,
            }}>
              <Info style={{ width: 15, height: 15, color: p.colors.accent, flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12.5, color: p.colors.body, margin: 0, lineHeight: 1.5 }}>
                  This formula uses functions or grouping that the guided builder can’t show as steps.
                </p>
                <button type="button" onClick={() => setMode('formula')}
                  style={{
                    border: 'none', background: 'none', padding: '4px 0 0', cursor: 'pointer',
                    color: p.colors.accent, fontSize: 12, fontWeight: 700,
                  }}>
                  Edit in Formula mode →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FORMULA mode */}
      {mode === 'formula' && (
        <div style={{ marginTop: 10 }}>
          <textarea className={inputCls} data-testid={`adv-calc-formula-${c.id}`}
            value={c.formula} onChange={(e) => onChange({ formula: e.target.value })}
            rows={2} placeholder="e.g. [Rooms] * 50 + [Extras]"
            style={{
              width: '100%', padding: '10px 12px', fontSize: 13, resize: 'vertical',
              fontFamily: d.typography.fontMono, lineHeight: 1.5,
              borderColor: hasFormula && !check.valid ? p.colors.danger : undefined,
            }} />

          {/* insert chip groups */}
          <ChipGroup label="Fields">
            {fields.filter((f) => f.type !== 'heading' && f.type !== 'text').map((f) => (
              <Chip key={f.id} onClick={() => insert(`[${f.name}]`)} accent>{f.name}</Chip>
            ))}
            {fields.filter((f) => f.type !== 'heading' && f.type !== 'text').length === 0 && (
              <span style={{ fontSize: 11.5, color: p.colors.subtle }}>Add fields above first</span>
            )}
          </ChipGroup>
          {calcNames.length > 0 && (
            <ChipGroup label="Calcs">
              {calcNames.map((n) => <Chip key={n} onClick={() => insert(`[${n}]`)} accent>{n}</Chip>)}
            </ChipGroup>
          )}
          <ChipGroup label="Operators">
            {OP_CHIPS.map((op) => <Chip key={op} onClick={() => insert(OP_MAP[op] || op)}>{op}</Chip>)}
          </ChipGroup>
          <ChipGroup label="Functions">
            {FN_CHIPS.map((fn) => <Chip key={fn} onClick={() => insert(fn)}>{fn}</Chip>)}
          </ChipGroup>

          {/* AI + reference */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" data-testid={`adv-calc-ai-${c.id}`}
              onClick={() => { setAiOpen((v) => !v); setAiErr(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none',
                cursor: 'pointer', color: p.colors.accent, fontSize: 12, fontWeight: 700,
              }}>
              <Sparkles style={{ width: 13, height: 13 }} /> Generate with AI
            </button>
            <button type="button" onClick={() => setShowRef((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
                cursor: 'pointer', color: p.colors.muted, fontSize: 12, fontWeight: 600,
              }}>
              <ChevronDown style={{
                width: 13, height: 13, transition: p.transitions.fast,
                transform: showRef ? 'none' : 'rotate(-90deg)',
              }} />
              Functions &amp; syntax
            </button>
          </div>

          {aiOpen && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: d.radius.control, background: p.colors.accentLighter,
            }}>
              <input className={inputCls} value={aiText} onChange={(e) => setAiText(e.target.value)}
                data-testid={`adv-calc-ai-input-${c.id}`}
                placeholder="Describe the maths — e.g. rooms times 50, plus 30 when packing is on"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aiGenerate(); } }}
                style={{ width: '100%', fontSize: 12.5, padding: '9px 11px' }} />
              {aiErr && <p style={{ fontSize: 11.5, color: p.colors.danger, margin: '6px 0 0' }}>{aiErr}</p>}
              <button type="button" onClick={aiGenerate} disabled={aiBusy || !aiText.trim()}
                style={{
                  marginTop: 8, padding: '8px 14px', borderRadius: d.radius.control, border: 'none',
                  background: p.colors.accent, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: aiBusy || !aiText.trim() ? 'default' : 'pointer',
                  opacity: aiBusy || !aiText.trim() ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {aiBusy
                  ? <><Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> Building…</>
                  : <><Sparkles style={{ width: 13, height: 13 }} /> Build formula</>}
              </button>
            </div>
          )}

          {showRef && (
            <div style={{
              marginTop: 8, padding: '10px 12px', borderRadius: d.radius.control,
              background: p.colors.surfaceRaised, display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {FN_REF.map((fn) => (
                <div key={fn.sig} style={{ lineHeight: 1.45 }}>
                  <code style={{ fontSize: 11.5, fontFamily: d.typography.fontMono, fontWeight: 700, color: p.colors.body }}>
                    {fn.sig}
                  </code>
                  <span style={{ fontSize: 11.5, color: p.colors.muted }}> — {fn.desc}</span>
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: p.colors.subtle, margin: '2px 0 0', lineHeight: 1.45 }}>
                Reference any field by its name in [square brackets]. Operators: + − × ÷ ^ and ( ).
              </p>
            </div>
          )}
        </div>
      )}

      {/* live preview / validation */}
      <div style={{ marginTop: 10 }}>
        {!hasFormula ? (
          <p style={{ fontSize: 12, color: p.colors.subtle, margin: 0 }}>
            Build the formula above — the sample result will appear here.
          </p>
        ) : !check.valid ? (
          <div style={{
            display: 'flex', gap: 7, padding: '8px 11px', borderRadius: d.radius.control,
            background: 'rgba(239,68,68,0.08)',
          }}>
            <X style={{ width: 14, height: 14, color: p.colors.danger, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: p.colors.danger }} data-testid={`adv-calc-error-${c.id}`}>
              {check.error}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 11px',
            borderRadius: d.radius.control, background: p.colors.accentLighter,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: p.colors.accentDark,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Sample result
            </span>
            <span style={{
              fontSize: 14, fontWeight: 800, color: p.colors.accentDark, fontFamily: d.typography.fontMono,
            }} data-testid={`adv-calc-preview-${c.id}`}>
              {previewText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Guided (step-by-step) formula builder ─── */

function GuidedBuilder({ terms, fields, calcNames, onChange }: {
  terms: GuidedTerm[]; fields: AdvField[]; calcNames: string[];
  onChange: (terms: GuidedTerm[]) => void;
}) {
  const valueFields = fields.filter((f) => f.type !== 'heading' && f.type !== 'text');
  const validValues = new Set<string>([
    'num',
    ...valueFields.map((f) => `f:${f.name}`),
    ...calcNames.map((n) => `c:${n}`),
  ]);

  const updateTerm = (id: string, u: Partial<GuidedTerm>) =>
    onChange(terms.map((t) => (t.id === id ? { ...t, ...u } : t)));
  const removeTerm = (id: string) => onChange(terms.filter((t) => t.id !== id));
  const addTerm = () => {
    const first = valueFields[0];
    onChange([...terms, {
      id: gid('trm'), op: '+',
      kind: first ? 'field' : 'number', ref: first ? first.name : '', num: 0,
    }]);
  };

  const termValue = (t: GuidedTerm) =>
    t.kind === 'number' ? 'num' : t.kind === 'calc' ? `c:${t.ref}` : `f:${t.ref}`;
  const onValueChange = (t: GuidedTerm, raw: string) => {
    if (raw === 'num') updateTerm(t.id, { kind: 'number' });
    else if (raw.startsWith('c:')) updateTerm(t.id, { kind: 'calc', ref: raw.slice(2) });
    else updateTerm(t.id, { kind: 'field', ref: raw.slice(2) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {terms.length === 0 && (
        <p style={{ fontSize: 12, color: p.colors.muted, margin: '0 0 2px', lineHeight: 1.5 }}>
          Start with a field or a number, then add steps to build up the price.
        </p>
      )}
      {terms.map((t, i) => {
        const cur = termValue(t);
        const missing = !validValues.has(cur);
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }} data-testid={`adv-term-${t.id}`}>
            {i === 0 ? (
              <span style={{
                width: 34, flexShrink: 0, fontSize: 13, fontWeight: 700,
                color: p.colors.subtle, textAlign: 'center',
              }}>=</span>
            ) : (
              <select className={inputCls} value={t.op}
                onChange={(e) => updateTerm(t.id, { op: e.target.value as TermOp })}
                style={{ width: 44, flexShrink: 0, fontSize: 14, padding: '8px 4px' }}>
                {TERM_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            <select className={inputCls} value={cur}
              onChange={(e) => onValueChange(t, e.target.value)}
              style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              {missing && <option value={cur}>⚠ {t.ref || 'unknown'} (missing)</option>}
              {valueFields.length > 0 && (
                <optgroup label="Fields">
                  {valueFields.map((f) => <option key={f.id} value={`f:${f.name}`}>{f.label || f.name}</option>)}
                </optgroup>
              )}
              {calcNames.length > 0 && (
                <optgroup label="Other calculations">
                  {calcNames.map((n) => <option key={n} value={`c:${n}`}>{n}</option>)}
                </optgroup>
              )}
              <option value="num">A number…</option>
            </select>
            {t.kind === 'number' && (
              <input className={inputCls} type="number" value={t.num}
                onChange={(e) => updateTerm(t.id, { num: Number(e.target.value) || 0 })}
                style={{ width: 84, flexShrink: 0, fontSize: 13, fontFamily: d.typography.fontMono }} />
            )}
            <button type="button" aria-label="Remove step" onClick={() => removeTerm(t.id)}
              style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: d.radius.control,
                border: `1px solid ${p.colors.borderLight}`, background: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Trash2 style={{ width: 13, height: 13, color: p.colors.muted }} />
            </button>
          </div>
        );
      })}
      <button type="button" data-testid="adv-add-term" onClick={addTerm}
        style={{
          marginTop: 2, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5,
          border: 'none', background: 'none', cursor: 'pointer',
          color: p.colors.accent, fontSize: 12, fontWeight: 600,
        }}>
        <Plus style={{ width: 13, height: 13 }} /> Add step
      </button>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.06em',
        textTransform: 'uppercase', flexShrink: 0, width: 56, paddingTop: 5, lineHeight: 1.3,
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '4px 9px', borderRadius: d.radius.pill, cursor: 'pointer', border: 'none',
        fontSize: 12, fontWeight: 600,
        fontFamily: accent ? 'inherit' : d.typography.fontMono,
        background: accent ? p.colors.accentLighter : p.colors.surfaceRaised,
        color: accent ? p.colors.accentDark : p.colors.body,
      }}>
      {children}
    </button>
  );
}
