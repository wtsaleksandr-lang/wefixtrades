// Stage 3 — "Build your calculator" pricing/logic step.
// Elfsight-inspired Build list, rebuilt for QuoteQuick: the trade owner never
// writes a formula. They pick a pricing model and see, at a glance, exactly
// what their customer will fill in. Editing happens in a focused drill-down
// panel (the "‹ Back" pattern) instead of one long scrolling form.
//
// Drop-in replacement for <PricingStrategySelector> — identical props.
// Phase 1: Build list + pricing-model panel. Phase 2 adds per-field editing
// and a typed "Add field" picker.
import { useState } from 'react';
import {
  Sparkles, ArrowRight, SlidersHorizontal, Check, Hash, ChevronRight,
  ChevronLeft, Plus, Info, Package, Ruler, Layers, Wrench,
} from 'lucide-react';
import { platformTheme as p } from '@/theme/platformTheme';
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

interface Props {
  trade: string;
  pricingMode: string;
  hourlyRate: number;
  fixedPrice: number;
  rangeMin: number;
  rangeMax: number;
  customConfig?: any;
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
  icon, title, subtitle, badge, onClick, accent, testId,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  badge?: string; onClick?: () => void; accent?: boolean; testId?: string;
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
        padding: '13px 14px', borderRadius: p.radius.md, textAlign: 'left',
        border: `1px solid ${accent ? p.colors.accent : p.colors.borderLight}`,
        background: accent ? p.colors.accentLighter : '#fff',
        cursor: interactive ? 'pointer' : 'default',
        transition: p.transitions.fast,
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
          fontSize: 11, fontWeight: 700, color: p.colors.accentDark,
          background: p.colors.accentLighter, padding: '3px 8px', borderRadius: p.radius.pill,
        }}>{badge}</span>
      )}
      {interactive && <ChevronRight style={{ width: 16, height: 16, color: p.colors.subtle, flexShrink: 0 }} />}
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

/* ── Derive the customer-facing input fields from the active model ── */
type DerivedField = { icon: React.ReactNode; title: string; subtitle: string; badge?: string };

function deriveFields(
  mode: string, customConfig?: any,
): { fields: DerivedField[]; emptyNote?: string } {
  const ic = (C: any) => <C style={{ width: 16, height: 16 }} />;

  if (mode === 'hourly') {
    return { fields: [{ icon: ic(Hash), title: 'Hours needed', subtitle: 'Number input — the customer enters how many hours' }] };
  }
  if (mode === 'fixed') {
    return { fields: [], emptyNote: 'Fixed price shows one number — your customer has nothing to fill in. Great for simple, predictable jobs.' };
  }
  if (mode === 'range') {
    return { fields: [], emptyNote: 'A price range shows a low–high estimate with no inputs — honest for jobs that need a site visit.' };
  }
  if (mode === 'ai_suggested') {
    return { fields: [{ icon: ic(Sparkles), title: 'Inputs chosen for you', subtitle: 'AI picks the right questions for your trade — you review them next' }] };
  }

  // Custom — read the chosen family.
  const t = customConfig?.pricingType as PricingType | undefined;
  if (!t) return { fields: [], emptyNote: 'Open the pricing model to choose a custom setup.' };

  const fields: DerivedField[] = [];
  const unit = customConfig?.unitName || 'unit';

  if (t === 'hourly') fields.push({ icon: ic(Hash), title: 'Hours needed', subtitle: 'Number input' });
  else if (t === 'per_sqft') fields.push({ icon: ic(Ruler), title: 'Square footage', subtitle: 'Number input — area in sq ft' });
  else if (t === 'per_linear_ft') fields.push({ icon: ic(Ruler), title: 'Linear feet', subtitle: 'Number input — length in linear ft' });
  else if (t === 'per_unit' || t === 'base_plus_rate' || t === 'tiered_ranges')
    fields.push({ icon: ic(Hash), title: `Number of ${unit}s`, subtitle: `Number input — counts the ${unit}s` });
  else if (t === 'tiered_packages')
    fields.push({ icon: ic(Package), title: 'Choose a package', subtitle: `Dropdown — ${(customConfig?.tiers || []).length} package${(customConfig?.tiers || []).length === 1 ? '' : 's'}` });

  const addOns = customConfig?.addOns || [];
  if (addOns.length) fields.push({ icon: ic(Plus), title: 'Add-ons', subtitle: 'Checkboxes — optional extras the customer can pick', badge: String(addOns.length) });

  const diff = customConfig?.difficultyTiers || [];
  if (diff.length) fields.push({ icon: ic(Layers), title: 'Job difficulty', subtitle: 'Dropdown — adjusts the price for harder jobs', badge: String(diff.length) });

  let emptyNote: string | undefined;
  if (!fields.length) emptyNote = t === 'call_for_quote_only'
    ? 'This model shows no price — it just collects the lead and you quote them directly.'
    : 'This model shows an estimate with no customer inputs.';

  return { fields, emptyNote };
}

/* ── Field primitives for the model panel ── */
function MoneyInput({ label, hint, value, onChange, testId }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; testId: string;
}) {
  return (
    <div>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: 5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, color: p.colors.subtle,
        }}>$</span>
        <input
          type="number" min="0" value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="premium-input"
          style={{ width: '100%', padding: '10px 14px 10px 26px', fontSize: 14 }}
          data-testid={testId}
        />
      </div>
      {hint && <p style={{ fontSize: 12, color: p.colors.muted, marginTop: 5, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

/* ── Drill-down panel: choose & configure the pricing model ── */
function ModelPanel({
  trade, pricingMode, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig, onChange, onBack,
}: Props & { onBack: () => void }) {
  return (
    <div className="animate-fade-in-up" data-testid="pricing-model-panel">
      {/* Panel header — Elfsight "‹ Back" pattern */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        paddingBottom: 12, borderBottom: `1px solid ${p.colors.borderLight}`,
      }}>
        <button type="button" onClick={onBack} data-testid="button-model-back"
          style={{
            display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none',
            cursor: 'pointer', color: p.colors.accent, fontSize: 13, fontWeight: 600, padding: 0,
          }}>
          <ChevronLeft style={{ width: 16, height: 16 }} /> Back
        </button>
        <span style={{ ...p.typography.h3, flex: 1, textAlign: 'center', marginRight: 48 }}>Pricing model</span>
      </div>

      <p style={{ fontSize: 13, color: p.colors.muted, lineHeight: 1.5, marginBottom: 14 }}>
        Pick how you charge for {trade}. You can change this any time — it won't break a published calculator.
      </p>

      {/* Mode cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {MODES.map(m => {
          const active = pricingMode === m.id;
          return (
            <button key={m.id} type="button" data-testid={`mode-${m.id}`}
              onClick={() => onChange('pricing_mode', m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                borderRadius: p.radius.md, textAlign: 'left', cursor: 'pointer',
                border: active ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                background: active ? p.colors.accentLighter : '#fff',
                transition: p.transitions.fast,
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

      {/* Mode-specific inputs */}
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

/* ── Main step ── */
export default function PricingBuildStep(props: Props) {
  const { trade, pricingMode, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig } = props;
  const [view, setView] = useState<'build' | 'model'>('build');

  if (view === 'model') {
    return <ModelPanel {...props} onBack={() => setView('build')} />;
  }

  const summary = modelSummary(pricingMode, trade, hourlyRate, fixedPrice, rangeMin, rangeMax, customConfig);
  const { fields, emptyNote } = deriveFields(pricingMode, customConfig);

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
      <SectionLabel help="The questions your customer answers on the calculator. They're set by your pricing model — change the model to change these.">
        What your customer fills in
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f, i) => (
          <ListRow key={i} testId={`field-row-${i}`} icon={f.icon} title={f.title} subtitle={f.subtitle} badge={f.badge} />
        ))}

        {emptyNote && (
          <div data-testid="fields-empty-note" style={{
            display: 'flex', gap: 9, padding: '12px 13px', borderRadius: p.radius.md,
            border: `1px dashed ${p.colors.border}`, background: '#fff',
          }}>
            <Info style={{ width: 15, height: 15, color: p.colors.subtle, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12.5, color: p.colors.muted, lineHeight: 1.5, margin: 0 }}>{emptyNote}</p>
          </div>
        )}

        {/* Add-field affordance — opens the model where inputs & add-ons live (Phase 2: typed picker) */}
        <button type="button" data-testid="button-add-field" onClick={() => setView('model')}
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
    </div>
  );
}
