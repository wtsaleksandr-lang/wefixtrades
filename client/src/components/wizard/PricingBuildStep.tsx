// Stage 3 — "Build your calculator" pricing/logic step.
// Elfsight-inspired Build list, rebuilt for QuoteQuick: the trade owner never
// writes a formula. They pick a pricing model and see, at a glance, exactly
// what their customer will fill in — and can now rename, re-range, hide or
// add fields, all in focused drill-down panels (the "‹ Back" pattern).
//
// Drop-in replacement for <PricingStrategySelector>.
// Phase 1: Build list + pricing-model panel.
// Phase 2: per-field editing (field_overrides) + typed "Add field" picker.
import { useState } from 'react';
import {
  Sparkles, ArrowRight, SlidersHorizontal, Check, Hash, ChevronRight,
  ChevronLeft, Plus, Info, Package, Ruler, Layers, Wrench, Pencil, EyeOff, RotateCcw,
} from 'lucide-react';
import { platformTheme as p } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';
import { FAMILY_LABELS, type PricingType } from '@shared/pricingConfig';
import PricingConfigEditor from '@/components/calculator/PricingConfigEditor';

/* lucide ships these, but WizardCard local-defines them — keep parity/safety. */
const Clock = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const DollarSign = ({ style }: { style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export interface FieldOverride {
  label?: string; min?: number; max?: number; step?: number; hidden?: boolean;
}

interface Props {
  trade: string;
  pricingMode: string;
  hourlyRate: number;
  fixedPrice: number;
  rangeMin: number;
  rangeMax: number;
  customConfig?: any;
  fieldOverrides: Record<string, FieldOverride>;
  onChange: (key: string, val: any) => void;
}

type Mode = 'ai_suggested' | 'hourly' | 'fixed' | 'range' | 'custom';

const MODES: { id: Mode; label: string; desc: string; Icon: any }[] = [
  { id: 'ai_suggested', label: 'AI Suggested', desc: 'We build the pricing from trade-industry data — fastest start.', Icon: Sparkles },
  { id: 'hourly', label: 'Hourly Rate', desc: 'Charge by the hour, with an optional base fee.', Icon: Clock },
  { id: 'fixed', label: 'Fixed Price', desc: 'One flat starting price for the job.', Icon: DollarSign },
  { id: 'range', label: 'Price Range', desc: 'Show customers a low–high estimate.', Icon: ArrowRight },
  { id: 'custom', label: 'Custom Logic', desc: 'Full control — rates, tiers, add-ons and fees.', Icon: SlidersHorizontal },
];

const money = (n: number) => `$${(n || 0).toLocaleString()}`;

/* ── A single row in the FIELDS / model list ── */
function ListRow({
  icon, title, subtitle, badge, onClick, accent, faded, testId,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  badge?: string; onClick?: () => void; accent?: boolean; faded?: boolean; testId?: string;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={!interactive}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '13px 14px', borderRadius: d.radius.card, textAlign: 'left', border: 'none',
        background: accent ? d.colors.accentLighter : d.colors.card,
        boxShadow: accent
          ? `0 0 0 1.5px ${d.colors.accent}, ${d.shadows.card}`
          : d.shadows.card,
        cursor: interactive ? 'pointer' : 'default',
        opacity: faded ? 0.6 : 1,
        transition: d.transitions.fast,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accent ? p.colors.accent : p.colors.surfaceRaised,
        color: accent ? '#fff' : p.colors.muted,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: p.colors.heading, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: p.colors.muted, margin: 0, lineHeight: 1.4 }}>{subtitle}</p>
      </div>
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: d.colors.badgeBlueText,
          background: d.colors.badgeBlueBg, padding: '3px 8px', borderRadius: d.radius.pill,
        }}>{badge}</span>
      )}
      {interactive && (badge === 'Hidden'
        ? null
        : <ChevronRight style={{ width: 16, height: 16, color: p.colors.subtle, flexShrink: 0 }} />)}
    </button>
  );
}

/* ── Section label with an optional help cue ── */
function SectionLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: p.colors.subtle,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>{children}</span>
        {help && (
          <button type="button" onClick={() => setOpen(o => !o)}
            aria-label="More info"
            style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
            <Info style={{ width: 13, height: 13, color: p.colors.subtle }} />
          </button>
        )}
      </div>
      {help && open && (
        <p style={{
          fontSize: 12, color: p.colors.muted, lineHeight: 1.5, margin: '6px 0 0',
          padding: '8px 10px', background: p.colors.surfaceRaised, borderRadius: p.radius.sm,
        }}>{help}</p>
      )}
    </div>
  );
}

/* ── Panel header — Elfsight "‹ Back" pattern ── */
function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      paddingBottom: 12, borderBottom: `1px solid ${p.colors.borderLight}`,
    }}>
      <button type="button" onClick={onBack} data-testid="button-panel-back"
        style={{
          display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none',
          cursor: 'pointer', color: p.colors.accent, fontSize: 13, fontWeight: 600, padding: 0,
        }}>
        <ChevronLeft style={{ width: 16, height: 16 }} /> Back
      </button>
      <span style={{ ...p.typography.h3, flex: 1, textAlign: 'center', marginRight: 48 }}>{title}</span>
    </div>
  );
}

/* ── Derive the human summary of the active pricing model ── */
function modelSummary(
  mode: string, trade: string, hourlyRate: number, fixedPrice: number,
  rangeMin: number, rangeMax: number, customConfig?: any,
): { label: string; detail: string; Icon: any } {
  switch (mode) {
    case 'hourly':
      return { label: 'Hourly Rate', detail: `${money(hourlyRate)} per hour`, Icon: Clock };
    case 'fixed':
      return { label: 'Fixed Price', detail: `Starting from ${money(fixedPrice)}`, Icon: DollarSign };
    case 'range':
      return { label: 'Price Range', detail: `${money(rangeMin)} – ${money(rangeMax)} estimate`, Icon: ArrowRight };
    case 'custom': {
      const t = customConfig?.pricingType as PricingType | undefined;
      return {
        label: t ? FAMILY_LABELS[t] : 'Custom Logic',
        detail: t ? 'Custom rates, tiers & fees' : 'Tap to set it up',
        Icon: SlidersHorizontal,
      };
    }
    default:
      return { label: 'AI Suggested', detail: `Built from ${trade} industry data`, Icon: Sparkles };
  }
}

/* ── A customer-facing field derived from the active model ── */
type DerivedField = {
  id?: string;           // question id — present means the field is editable
  Icon: any;
  title: string;         // default title
  subtitle: string;
  badge?: string;
  numeric?: boolean;     // supports min / max / step editing
};

function deriveFields(mode: string, customConfig?: any): { fields: DerivedField[]; emptyNote?: string } {
  if (mode === 'hourly') {
    return { fields: [{ id: 'quantity', Icon: Hash, title: 'Hours needed', subtitle: 'Slider — the customer picks how many hours', numeric: true }] };
  }
  if (mode === 'fixed') {
    return { fields: [], emptyNote: 'A fixed price shows one number — your customer has nothing to fill in. Great for simple, predictable jobs.' };
  }
  if (mode === 'range') {
    return { fields: [], emptyNote: 'A price range shows a low–high estimate with no inputs — honest for jobs that need a site visit.' };
  }
  if (mode === 'ai_suggested') {
    return { fields: [{ Icon: Sparkles, title: 'Inputs chosen for you', subtitle: 'AI picks the right questions for your trade — you review them next' }] };
  }

  // Custom — read the chosen family.
  const t = customConfig?.pricingType as PricingType | undefined;
  if (!t) return { fields: [], emptyNote: 'Open the pricing model to choose a custom setup.' };

  const fields: DerivedField[] = [];
  const unit = customConfig?.unitName || 'unit';

  if (t === 'hourly') fields.push({ id: 'quantity', Icon: Hash, title: 'Hours needed', subtitle: 'Number the customer enters', numeric: true });
  else if (t === 'per_sqft') fields.push({ id: 'quantity', Icon: Ruler, title: 'Square footage', subtitle: 'Number the customer enters — area in sq ft', numeric: true });
  else if (t === 'per_linear_ft') fields.push({ id: 'quantity', Icon: Ruler, title: 'Linear feet', subtitle: 'Number the customer enters — length', numeric: true });
  else if (t === 'per_unit' || t === 'base_plus_rate' || t === 'tiered_ranges')
    fields.push({ id: 'quantity', Icon: Hash, title: `Number of ${unit}s`, subtitle: `Number the customer enters`, numeric: true });
  else if (t === 'tiered_packages')
    fields.push({ id: 'package_tier', Icon: Package, title: 'Choose a package', subtitle: `Dropdown — ${(customConfig?.tiers || []).length} package${(customConfig?.tiers || []).length === 1 ? '' : 's'}` });

  const addOns = customConfig?.addOns || [];
  if (addOns.length) fields.push({ id: 'addon_selection', Icon: Plus, title: 'Add-ons', subtitle: 'Checkboxes — optional extras the customer picks', badge: String(addOns.length) });

  const diff = customConfig?.difficultyTiers || [];
  if (diff.length) fields.push({ Icon: Layers, title: 'Job difficulty', subtitle: 'Dropdown — adjusts price for harder jobs', badge: String(diff.length) });

  let emptyNote: string | undefined;
  if (!fields.length) emptyNote = t === 'call_for_quote_only'
    ? 'This model shows no price — it just collects the lead and you quote them directly.'
    : 'This model shows an estimate with no customer inputs.';

  return { fields, emptyNote };
}

/* ── Field primitives ── */
function MoneyInput({ label, hint, value, onChange, testId }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; testId: string;
}) {
  return (
    <div>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: p.colors.subtle }}>$</span>
        <input type="number" min="0" value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="premium-input" style={{ width: '100%', padding: '10px 14px 10px 26px', fontSize: 14, fontFamily: d.typography.fontMono }}
          data-testid={testId} />
      </div>
      {hint && <p style={{ fontSize: 12, color: p.colors.muted, marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

function PlainInput({ label, value, placeholder, onChange, type = 'text', testId }: {
  label: string; value: string | number; placeholder?: string;
  onChange: (v: string) => void; type?: string; testId: string;
}) {
  return (
    <div>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="premium-input" style={{ width: '100%', padding: '10px 14px', fontSize: 14 }}
        data-testid={testId} />
    </div>
  );
}

/* ── Drill-down panel: choose & configure the pricing model ── */
function ModelPanel({
  trade, pricingMode, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig, onChange, onBack,
}: Props & { onBack: () => void }) {
  return (
    <div className="animate-fade-in-up" data-testid="pricing-model-panel">
      <PanelHeader title="Pricing model" onBack={onBack} />
      <p style={{ fontSize: 13, color: p.colors.muted, lineHeight: 1.5, marginBottom: 14 }}>
        Pick how you charge for {trade}. You can change this any time — it won't break a published calculator.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {MODES.map(m => {
          const active = pricingMode === m.id;
          return (
            <button key={m.id} type="button" data-testid={`mode-${m.id}`}
              onClick={() => onChange('pricing_mode', m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                borderRadius: d.radius.card, textAlign: 'left', cursor: 'pointer', border: 'none',
                background: active ? d.colors.accentLighter : d.colors.card,
                boxShadow: active ? `0 0 0 2px ${d.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                transition: d.transitions.fast,
              }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? p.colors.accent : p.colors.surfaceRaised,
              }}>
                <m.Icon style={{ width: 16, height: 16, color: active ? '#fff' : p.colors.muted }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: p.colors.heading, margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 12, color: p.colors.muted, margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
              </div>
              {active && <Check style={{ width: 16, height: 16, color: p.colors.accent, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {pricingMode === 'ai_suggested' && (
        <div style={{
          display: 'flex', gap: 10, padding: 13, borderRadius: p.radius.md,
          background: p.colors.accentLighter, border: `1px solid ${p.colors.accent}22`,
        }}>
          <Sparkles style={{ width: 16, height: 16, color: p.colors.accent, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: p.colors.accentDark, lineHeight: 1.5, margin: 0 }}>
            We'll generate optimized {trade} pricing from industry benchmarks. You review and fine-tune everything before going live.
          </p>
        </div>
      )}
      {pricingMode === 'hourly' && (
        <MoneyInput label="Hourly rate" testId="input-hourly-rate"
          value={hourlyRate} onChange={v => onChange('manual_hourly_rate', v)}
          hint={`A 2–4 hour job would quote ${money(hourlyRate * 2)}–${money(hourlyRate * 4)}.`} />
      )}
      {pricingMode === 'fixed' && (
        <MoneyInput label="Base price" testId="input-fixed-price"
          value={fixedPrice} onChange={v => onChange('manual_fixed_price', v)}
          hint={`Customers see "Starting from ${money(fixedPrice)}".`} />
      )}
      {pricingMode === 'range' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <MoneyInput label="Low estimate" testId="input-range-min"
                value={rangeMin} onChange={v => onChange('manual_range_min', v)} />
            </div>
            <div style={{ flex: 1 }}>
              <MoneyInput label="High estimate" testId="input-range-max"
                value={rangeMax} onChange={v => onChange('manual_range_max', v)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: p.colors.muted, margin: 0 }}>
            Customers see "{money(rangeMin)} – {money(rangeMax)}" as the estimated range.
          </p>
        </div>
      )}
      {pricingMode === 'custom' && (
        <div style={{ marginTop: 2 }}>
          <PricingConfigEditor
            config={(customConfig && customConfig.pricingType)
              ? customConfig
              : { pricingType: 'hourly', unitName: 'hour', rate: 0 } as any}
            onChange={c => onChange('manual_custom_config', c)}
          />
        </div>
      )}
    </div>
  );
}

/* ── Drill-down panel: edit one customer-facing field ── */
function FieldEditPanel({
  field, override, onSave, onBack,
}: {
  field: DerivedField;
  override: FieldOverride;
  onSave: (next: FieldOverride) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<FieldOverride>(override || {});
  const patch = (u: Partial<FieldOverride>) => setDraft(d => ({ ...d, ...u }));
  const numField = (key: 'min' | 'max' | 'step', label: string) => (
    <div style={{ flex: 1 }}>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>{label}</label>
      <input type="number" value={draft[key] ?? ''} placeholder="default"
        onChange={e => patch({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
        className="premium-input" style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: d.typography.fontMono }}
        data-testid={`input-field-${key}`} />
    </div>
  );
  const hidden = !!draft.hidden;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(override || {});

  return (
    <div className="animate-fade-in-up" data-testid="field-edit-panel">
      <PanelHeader title="Edit field" onBack={onBack} />

      <div style={{
        display: 'flex', gap: 10, padding: 12, borderRadius: p.radius.md,
        background: p.colors.surfaceRaised, marginBottom: 16,
      }}>
        <field.Icon style={{ width: 16, height: 16, color: p.colors.accent, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12.5, color: p.colors.body, lineHeight: 1.5, margin: 0 }}>
          This is what your customer sees on the calculator. Changes here don't affect the price math — only how the question reads.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PlainInput label="Question label" testId="input-field-label"
          value={draft.label ?? ''} placeholder={field.title}
          onChange={v => patch({ label: v || undefined })} />

        {field.numeric && (
          <div>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>Range &amp; steps</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {numField('min', 'Minimum')}
              {numField('max', 'Maximum')}
              {numField('step', 'Step')}
            </div>
            <p style={{ fontSize: 12, color: p.colors.muted, marginTop: 6, lineHeight: 1.5 }}>
              Leave blank to keep the smart defaults. "Step" is how much each tick of the slider moves.
            </p>
          </div>
        )}

        {/* Show / hide */}
        <button type="button" data-testid="toggle-field-hidden"
          onClick={() => patch({ hidden: !hidden })}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px',
            borderRadius: d.radius.card, cursor: 'pointer', textAlign: 'left', border: 'none',
            background: hidden ? d.colors.accentLighter : d.colors.card,
            boxShadow: hidden ? `0 0 0 1.5px ${d.colors.accent}, ${d.shadows.card}` : d.shadows.card,
          }}>
          <EyeOff style={{ width: 16, height: 16, color: hidden ? p.colors.accent : p.colors.muted, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: p.colors.heading, margin: 0 }}>Hide this field</p>
            <p style={{ fontSize: 11.5, color: p.colors.muted, margin: 0 }}>The customer won't see or fill it in</p>
          </div>
          <div style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
            border: `1.5px solid ${hidden ? p.colors.accent : p.colors.border}`,
            background: hidden ? p.colors.accent : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {hidden && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
          </div>
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" data-testid="button-field-reset"
            onClick={() => { onSave({}); onBack(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 14px', borderRadius: p.radius.md, cursor: 'pointer',
              border: `1px solid ${p.colors.border}`, background: '#fff',
              color: p.colors.muted, fontSize: 13, fontWeight: 600,
            }}>
            <RotateCcw style={{ width: 14, height: 14 }} /> Reset
          </button>
          <button type="button" data-testid="button-field-save"
            onClick={() => { onSave(draft); onBack(); }}
            disabled={!isDirty}
            style={{
              flex: 1, padding: '11px', borderRadius: p.radius.md, border: 'none',
              background: p.colors.accent, color: '#fff',
              cursor: isDirty ? 'pointer' : 'default', opacity: isDirty ? 1 : 0.55,
              fontSize: 13, fontWeight: 700,
            }}>
            Save field
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Drill-down panel: add a new field ── */
const ADD_TYPES = [
  { id: 'addon', Icon: Plus, label: 'Add-on', desc: 'An optional paid extra the customer can tick — e.g. "Eco-friendly products".' },
  { id: 'difficulty', Icon: Layers, label: 'Job difficulty', desc: 'A dropdown that scales the price up for harder jobs.' },
] as const;

function AddFieldPanel({ isCustom, onPickPricingField, onBack }: {
  isCustom: boolean; onPickPricingField: () => void; onBack: () => void;
}) {
  return (
    <div className="animate-fade-in-up" data-testid="add-field-panel">
      <PanelHeader title="Add a field" onBack={onBack} />
      <p style={{ fontSize: 13, color: p.colors.muted, lineHeight: 1.5, marginBottom: 14 }}>
        Add-ons and difficulty levels are part of <strong>Custom Logic</strong> pricing. Pick one and we'll
        {isCustom ? ' open the editor.' : ' switch you to Custom Logic so you can set it up.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ADD_TYPES.map(t => (
          <button key={t.id} type="button" data-testid={`addtype-${t.id}`}
            onClick={onPickPricingField}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px',
              borderRadius: d.radius.card, textAlign: 'left', cursor: 'pointer', border: 'none',
              background: d.colors.card, boxShadow: d.shadows.card, transition: d.transitions.fast,
            }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: p.colors.surfaceRaised, color: p.colors.muted,
            }}>
              <t.Icon style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: p.colors.heading, margin: 0 }}>{t.label}</p>
              <p style={{ fontSize: 12, color: p.colors.muted, margin: 0, lineHeight: 1.4 }}>{t.desc}</p>
            </div>
            <ChevronRight style={{ width: 16, height: 16, color: p.colors.subtle, flexShrink: 0 }} />
          </button>
        ))}
      </div>
      <div style={{
        display: 'flex', gap: 9, padding: '12px 13px', borderRadius: p.radius.md, marginTop: 14,
        border: `1px dashed ${p.colors.border}`, background: '#fff',
      }}>
        <Info style={{ width: 15, height: 15, color: p.colors.subtle, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: p.colors.muted, lineHeight: 1.5, margin: 0 }}>
          Want headings or custom questions? Those are coming next — for now, branding text lives in the Design step.
        </p>
      </div>
    </div>
  );
}

/* ── Main step ── */
export default function PricingBuildStep(props: Props) {
  const { trade, pricingMode, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig, fieldOverrides, onChange } = props;
  const [view, setView] = useState<'build' | 'model' | 'field' | 'add'>('build');
  const [editId, setEditId] = useState<string | null>(null);

  const overrides = fieldOverrides || {};
  const { fields, emptyNote } = deriveFields(pricingMode, customConfig);

  const saveOverride = (id: string, next: FieldOverride) => {
    const cleaned: FieldOverride = {};
    if (next.label) cleaned.label = next.label;
    if (next.min !== undefined) cleaned.min = next.min;
    if (next.max !== undefined) cleaned.max = next.max;
    if (next.step !== undefined) cleaned.step = next.step;
    if (next.hidden) cleaned.hidden = true;
    const map = { ...overrides };
    if (Object.keys(cleaned).length === 0) delete map[id];
    else map[id] = cleaned;
    onChange('field_overrides', map);
  };

  if (view === 'model') {
    return <ModelPanel {...props} onBack={() => setView('build')} />;
  }
  if (view === 'add') {
    return (
      <AddFieldPanel
        isCustom={pricingMode === 'custom'}
        onBack={() => setView('build')}
        onPickPricingField={() => {
          if (pricingMode !== 'custom') onChange('pricing_mode', 'custom');
          setView('model');
        }}
      />
    );
  }
  if (view === 'field' && editId) {
    const field = fields.find(f => f.id === editId);
    if (field) {
      return (
        <FieldEditPanel
          field={field}
          override={overrides[editId] || {}}
          onSave={(next) => saveOverride(editId, next)}
          onBack={() => { setView('build'); setEditId(null); }}
        />
      );
    }
  }

  const summary = modelSummary(pricingMode, trade, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig);

  return (
    <div className="animate-fade-in-up" data-testid="pricing-build-step">
      {/* Intro help cue */}
      <div style={{
        display: 'flex', gap: 10, padding: 12, borderRadius: p.radius.md,
        background: p.colors.surfaceRaised, marginBottom: 18,
      }}>
        <Wrench style={{ width: 16, height: 16, color: p.colors.accent, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12.5, color: p.colors.body, lineHeight: 1.5, margin: 0 }}>
          Set how your quote is calculated. No formulas — pick a pricing model and we'll show you exactly what your customer fills in.
        </p>
      </div>

      {/* PRICING MODEL */}
      <SectionLabel help="This is the math behind every quote. Tap the card to switch models or edit your rates.">
        Pricing model
      </SectionLabel>
      <div style={{ marginBottom: 20 }}>
        <ListRow
          testId="card-pricing-model"
          accent
          icon={<summary.Icon style={{ width: 17, height: 17 }} />}
          title={summary.label}
          subtitle={summary.detail}
          onClick={() => setView('model')}
        />
      </div>

      {/* FIELDS */}
      <SectionLabel help="The questions your customer answers on the calculator. Tap one to rename it, change its range, or hide it.">
        What your customer fills in
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f, i) => {
          const ov = f.id ? overrides[f.id] : undefined;
          const isHidden = !!ov?.hidden;
          return (
            <ListRow
              key={f.id || i}
              testId={`field-row-${f.id || i}`}
              icon={<f.Icon style={{ width: 16, height: 16 }} />}
              title={ov?.label || f.title}
              subtitle={isHidden ? 'Hidden from customers — tap to restore' : f.subtitle}
              badge={isHidden ? 'Hidden' : f.badge}
              faded={isHidden}
              onClick={f.id ? () => { setEditId(f.id!); setView('field'); } : undefined}
            />
          );
        })}

        {emptyNote && (
          <div data-testid="fields-empty-note" style={{
            display: 'flex', gap: 9, padding: '12px 13px', borderRadius: p.radius.md,
            border: `1px dashed ${p.colors.border}`, background: '#fff',
          }}>
            <Info style={{ width: 15, height: 15, color: p.colors.subtle, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12.5, color: p.colors.muted, lineHeight: 1.5, margin: 0 }}>{emptyNote}</p>
          </div>
        )}

        {/* hint: editable fields show a pencil affordance via subtitle; add button below */}
        <button type="button" data-testid="button-add-field" onClick={() => setView('add')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px', borderRadius: p.radius.md, cursor: 'pointer',
            border: `1px dashed ${p.colors.borderHover}`, background: '#fff',
            color: p.colors.accent, fontSize: 13, fontWeight: 600,
            transition: p.transitions.fast,
          }}>
          <Plus style={{ width: 15, height: 15 }} /> Add a field
        </button>
      </div>

      {/* edit affordance hint */}
      {fields.some(f => f.id) && (
        <p style={{
          display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center',
          fontSize: 11, color: p.colors.subtle, margin: '12px 0 0',
        }}>
          <Pencil style={{ width: 11, height: 11 }} /> Tap any field to rename or adjust it
        </p>
      )}
    </div>
  );
}
