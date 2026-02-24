import { Plus, Minus, X } from 'lucide-react';
import { type CustomTradeData, type Stage2Data } from '@shared/schema';
import { platformTheme } from '@/theme/platformTheme';

const p = platformTheme;

interface PricingIntakeStage2Props {
  stage1: CustomTradeData;
  data: Stage2Data;
  onChange: (data: Stage2Data) => void;
}

const DEFAULT_PACKAGES = [
  { label: 'Basic', price: 0 },
  { label: 'Standard', price: 0 },
  { label: 'Premium', price: 0 },
];

const DEFAULT_DIFFICULTY_TIERS = [
  { label: 'Standard', multiplier: 1 },
  { label: 'Moderate', multiplier: 1.25 },
  { label: 'Complex', multiplier: 1.5 },
];

const PRESET_MARKUPS = [10, 15, 20, 25, 30];

export default function PricingIntakeStage2({ stage1, data, onChange }: PricingIntakeStage2Props) {
  const update = (partial: Partial<Stage2Data>) => {
    onChange({ ...data, ...partial });
  };

  const charge = stage1.charge_method;
  const factors = stage1.price_factors || [];
  const showHourly = charge === 'per_hour';
  const showSqft = charge === 'per_sqft';
  const showLinearFt = charge === 'per_linear_ft';
  const showPerItem = charge === 'per_item';
  const showBaseVariable = charge === 'base_plus_variable';
  const showFixedProject = charge === 'fixed_project';
  const showPackages = stage1.offers_packages || showFixedProject;
  const showMaterials = factors.includes('Materials');
  const showDistance = factors.includes('Distance');
  const showDifficulty = factors.includes('Difficulty level');

  const packages = data.packages || DEFAULT_PACKAGES;
  const diffTiers = data.difficulty_tiers || DEFAULT_DIFFICULTY_TIERS;

  return (
    <div
      className="animate-fade-in-up"
      style={{
        border: `1.5px dashed ${p.colors.border}`,
        borderRadius: p.radius.lg,
        background: p.colors.surface,
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 600, color: p.colors.heading }}>
        Pricing Details
      </div>

      {showHourly && (
        <Section title="Hourly Rate">
          <NumericField
            testId="input-hourly-rate"
            label="Rate per hour ($)"
            placeholder="e.g. 85"
            value={data.hourly_rate}
            onChange={v => update({ hourly_rate: v })}
          />
          <NumericField
            testId="input-crew-size"
            label="Typical crew size"
            placeholder="e.g. 2"
            value={data.crew_size}
            onChange={v => update({ crew_size: v })}
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <NumericField
              testId="input-min-hours"
              label="Min hours"
              placeholder="e.g. 1"
              value={data.min_hours}
              onChange={v => update({ min_hours: v })}
            />
            <NumericField
              testId="input-max-hours"
              label="Max hours"
              placeholder="e.g. 8"
              value={data.max_hours}
              onChange={v => update({ max_hours: v })}
            />
          </div>
        </Section>
      )}

      {showSqft && (
        <Section title="Per Square Foot">
          <NumericField
            testId="input-sqft-rate"
            label="Rate per sq ft ($)"
            placeholder="e.g. 3.50"
            value={data.sqft_rate}
            onChange={v => update({ sqft_rate: v })}
          />
          <ToggleRow
            testId="toggle-materials-included"
            label="Materials included in price?"
            checked={data.materials_included ?? false}
            onChange={v => update({ materials_included: v })}
          />
          <NumericField
            testId="input-setup-fee"
            label="Setup / prep fee ($, optional)"
            placeholder="e.g. 50"
            value={data.setup_fee}
            onChange={v => update({ setup_fee: v })}
          />
        </Section>
      )}

      {showLinearFt && (
        <Section title="Per Linear Foot">
          <NumericField
            testId="input-linearft-rate"
            label="Rate per linear ft ($)"
            placeholder="e.g. 12"
            value={data.unit_rate}
            onChange={v => update({ unit_rate: v })}
          />
          <NumericField
            testId="input-linearft-base-fee"
            label="Base / setup fee ($, optional)"
            placeholder="e.g. 75"
            value={data.base_fee}
            onChange={v => update({ base_fee: v })}
          />
        </Section>
      )}

      {showPerItem && (
        <Section title="Per Item / Unit">
          <div>
            <label style={labelStyle}>What do you call each unit?</label>
            <input
              data-testid="input-unit-name"
              type="text"
              className="premium-input"
              placeholder="e.g. fixture, window, room"
              value={data.unit_name ?? ''}
              onChange={e => update({ unit_name: e.target.value })}
            />
          </div>
          <NumericField
            testId="input-unit-rate"
            label="Price per unit ($)"
            placeholder="e.g. 45"
            value={data.unit_rate}
            onChange={v => update({ unit_rate: v })}
          />
        </Section>
      )}

      {showBaseVariable && (
        <Section title="Base Fee + Variable Rate">
          <NumericField
            testId="input-base-fee"
            label="Base fee ($)"
            placeholder="e.g. 100"
            value={data.base_fee}
            onChange={v => update({ base_fee: v })}
          />
          <div>
            <label style={labelStyle}>What variable unit?</label>
            <input
              data-testid="input-variable-unit-name"
              type="text"
              className="premium-input"
              placeholder="e.g. hour, sq ft, item"
              value={data.unit_name ?? ''}
              onChange={e => update({ unit_name: e.target.value })}
            />
          </div>
          <NumericField
            testId="input-variable-unit-rate"
            label="Rate per unit ($)"
            placeholder="e.g. 25"
            value={data.unit_rate}
            onChange={v => update({ unit_rate: v })}
          />
        </Section>
      )}

      {showPackages && (
        <Section title="Service Packages">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {packages.map((pkg, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  data-testid={`input-package-label-${i}`}
                  type="text"
                  className="premium-input"
                  placeholder="Package name"
                  value={pkg.label}
                  onChange={e => {
                    const next = [...packages];
                    next[i] = { ...next[i], label: e.target.value };
                    update({ packages: next });
                  }}
                  style={{ flex: 2 }}
                />
                <input
                  data-testid={`input-package-price-${i}`}
                  type="number"
                  min="0"
                  className="premium-input"
                  placeholder="$"
                  value={pkg.price || ''}
                  onChange={e => {
                    const next = [...packages];
                    next[i] = { ...next[i], price: Number(e.target.value) || 0 };
                    update({ packages: next });
                  }}
                  style={{ flex: 1 }}
                />
                {packages.length > 2 && (
                  <button
                    data-testid={`button-remove-package-${i}`}
                    type="button"
                    onClick={() => {
                      const next = packages.filter((_, idx) => idx !== i);
                      update({ packages: next });
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      color: p.colors.muted, minHeight: '44px', display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X style={{ width: '16px', height: '16px' }} />
                  </button>
                )}
              </div>
            ))}
            {packages.length < 5 && (
              <button
                data-testid="button-add-package"
                type="button"
                onClick={() => update({ packages: [...packages, { label: '', price: 0 }] })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                  borderRadius: p.radius.sm, border: `1px dashed ${p.colors.borderHover}`,
                  background: 'transparent', cursor: 'pointer', fontSize: '13px',
                  color: p.colors.accent, fontWeight: 500, minHeight: '44px',
                }}
              >
                <Plus style={{ width: '14px', height: '14px' }} /> Add Package
              </button>
            )}
          </div>
        </Section>
      )}

      {showMaterials && (
        <Section title="Materials Markup">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PRESET_MARKUPS.map(pct => {
              const selected = !data.materials_markup_custom && data.materials_markup_pct === pct;
              return (
                <button
                  key={pct}
                  data-testid={`button-markup-${pct}`}
                  type="button"
                  onClick={() => update({ materials_markup_pct: pct, materials_markup_custom: false })}
                  style={{
                    padding: '8px 16px', borderRadius: p.radius.sm, minHeight: '44px',
                    border: selected ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                    background: selected ? p.colors.accentLighter : 'transparent',
                    cursor: 'pointer', fontSize: '14px', fontWeight: selected ? 600 : 400,
                    color: selected ? p.colors.accent : p.colors.body,
                  }}
                >
                  {pct}%
                </button>
              );
            })}
            <button
              data-testid="button-markup-custom"
              type="button"
              onClick={() => update({ materials_markup_custom: true })}
              style={{
                padding: '8px 16px', borderRadius: p.radius.sm, minHeight: '44px',
                border: data.materials_markup_custom ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                background: data.materials_markup_custom ? p.colors.accentLighter : 'transparent',
                cursor: 'pointer', fontSize: '14px', fontWeight: data.materials_markup_custom ? 600 : 400,
                color: data.materials_markup_custom ? p.colors.accent : p.colors.body,
              }}
            >
              Custom
            </button>
          </div>
          {data.materials_markup_custom && (
            <NumericField
              testId="input-markup-custom-pct"
              label="Custom markup %"
              placeholder="e.g. 35"
              value={data.materials_markup_pct}
              onChange={v => update({ materials_markup_pct: v })}
            />
          )}
        </Section>
      )}

      {showDistance && (
        <Section title="Distance / Travel">
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['multiplier', 'flat'] as const).map(mode => {
              const selected = data.distance_mode === mode;
              return (
                <button
                  key={mode}
                  data-testid={`button-distance-${mode}`}
                  type="button"
                  onClick={() => update({ distance_mode: mode })}
                  style={{
                    flex: 1, padding: '10px', borderRadius: p.radius.sm, minHeight: '44px',
                    border: selected ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                    background: selected ? p.colors.accentLighter : 'transparent',
                    cursor: 'pointer', fontSize: '14px', fontWeight: selected ? 500 : 400,
                    color: selected ? p.colors.accent : p.colors.body, textAlign: 'center',
                  }}
                >
                  {mode === 'multiplier' ? 'Multiplier (e.g. 1.5×)' : 'Flat Fee ($)'}
                </button>
              );
            })}
          </div>
          {data.distance_mode && (
            <NumericField
              testId="input-distance-value"
              label={data.distance_mode === 'multiplier' ? 'Distance multiplier' : 'Flat travel fee ($)'}
              placeholder={data.distance_mode === 'multiplier' ? 'e.g. 1.5' : 'e.g. 50'}
              value={data.distance_value}
              onChange={v => update({ distance_value: v })}
            />
          )}
        </Section>
      )}

      {showDifficulty && (
        <Section title="Difficulty Levels">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {diffTiers.map((tier, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  data-testid={`input-difficulty-label-${i}`}
                  type="text"
                  className="premium-input"
                  placeholder="Level name"
                  value={tier.label}
                  onChange={e => {
                    const next = [...diffTiers];
                    next[i] = { ...next[i], label: e.target.value };
                    update({ difficulty_tiers: next });
                  }}
                  style={{ flex: 2 }}
                />
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    data-testid={`input-difficulty-mult-${i}`}
                    type="number"
                    step="0.05"
                    min="1"
                    className="premium-input"
                    placeholder="1.0"
                    value={tier.multiplier || ''}
                    onChange={e => {
                      const next = [...diffTiers];
                      next[i] = { ...next[i], multiplier: Number(e.target.value) || 1 };
                      update({ difficulty_tiers: next });
                    }}
                    style={{ width: '100%', paddingRight: '24px' }}
                  />
                  <span style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    fontSize: '13px', color: p.colors.muted, fontWeight: 500,
                  }}>×</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="After-Hours Rate">
        <NumericField
          testId="input-after-hours-mult"
          label="After-hours multiplier (optional)"
          placeholder="e.g. 1.5"
          value={data.after_hours_multiplier}
          onChange={v => update({ after_hours_multiplier: v })}
        />
        <p style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>
          Leave blank if you don't charge extra for after-hours work.
        </p>
      </Section>
    </div>
  );
}

const labelStyle = {
  fontSize: '13px',
  fontWeight: 500 as const,
  color: platformTheme.colors.body,
  display: 'block' as const,
  marginBottom: '6px',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}

function NumericField({ testId, label, placeholder, value, onChange }: {
  testId: string;
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      <input
        data-testid={testId}
        type="number"
        min="0"
        step="any"
        className="premium-input"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
      />
    </div>
  );
}

function ToggleRow({ testId, label, checked, onChange }: {
  testId: string;
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.body }}>{label}</span>
      <button
        data-testid={testId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px',
          background: checked ? p.colors.accent : p.colors.borderHover,
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: p.transitions.fast, flexShrink: 0, outline: 'none',
          WebkitTapHighlightColor: 'transparent', minHeight: '44px',
          padding: '10px 0', display: 'flex', alignItems: 'center',
        }}
      >
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
          position: 'absolute', left: checked ? '22px' : '2px',
          transition: p.transitions.fast, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }} />
      </button>
    </div>
  );
}
