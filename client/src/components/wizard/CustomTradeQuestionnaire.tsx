import { Check } from 'lucide-react';
import { type CustomTradeData } from '@shared/schema';
import { platformTheme } from '@/theme/platformTheme';

const p = platformTheme;

interface CustomTradeQuestionnaireProps {
  data: CustomTradeData;
  onChange: (data: CustomTradeData) => void;
}

const CHARGE_OPTIONS: { label: string; value: CustomTradeData['charge_method'] }[] = [
  { label: 'Per hour', value: 'per_hour' },
  { label: 'Per square foot', value: 'per_sqft' },
  { label: 'Per linear foot', value: 'per_linear_ft' },
  { label: 'Per item', value: 'per_item' },
  { label: 'Fixed project price', value: 'fixed_project' },
  { label: 'Base fee + variable', value: 'base_plus_variable' },
  { label: 'Not sure', value: 'not_sure' },
];

const PRICE_FACTORS = [
  'Size',
  'Time required',
  'Materials',
  'Distance',
  'Difficulty level',
  'Quantity',
];

const OUTPUT_PREFERENCES: { label: string; value: CustomTradeData['output_preference'] }[] = [
  { label: 'Show an exact price', value: 'exact_price' },
  { label: 'Show a price range', value: 'price_range' },
  { label: 'Just collect leads (no price shown)', value: 'call_for_quote' },
];

function toFactorTestId(label: string) {
  return label.toLowerCase().replace(/\s+/g, '');
}

export default function CustomTradeQuestionnaire({ data, onChange }: CustomTradeQuestionnaireProps) {
  const update = (partial: Partial<CustomTradeData>) => {
    onChange({ ...data, ...partial });
  };

  const toggleFactor = (factor: string) => {
    const factors = data.price_factors || [];
    const next = factors.includes(factor)
      ? factors.filter(f => f !== factor)
      : [...factors, factor];
    update({ price_factors: next });
  };

  return (
    <div
      className="animate-expand"
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
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>
          How do you usually charge?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CHARGE_OPTIONS.map(opt => {
            const selected = data.charge_method === opt.value;
            return (
              <button
                key={opt.value}
                data-testid={`radio-charge-${opt.value}`}
                type="button"
                onClick={() => update({ charge_method: opt.value })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: p.radius.sm,
                  border: selected ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                  background: selected ? p.colors.accentLighter : 'transparent',
                  cursor: 'pointer',
                  transition: p.transitions.fast,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: selected ? `6px solid ${p.colors.accent}` : `2px solid ${p.colors.borderHover}`,
                    background: selected ? p.colors.surface : p.colors.surface,
                    flexShrink: 0,
                    transition: p.transitions.fast,
                  }}
                />
                <span style={{ fontSize: '14px', fontWeight: selected ? 500 : 400, color: p.colors.body }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
            Do you have a minimum charge?
          </span>
          <ToggleSwitch
            data-testid="toggle-minimum-charge"
            checked={data.has_minimum_charge}
            onChange={v => update({ has_minimum_charge: v, ...(!v ? { minimum_charge_amount: undefined } : {}) })}
          />
        </div>
        {data.has_minimum_charge && (
          <input
            data-testid="input-minimum-charge-amount"
            type="number"
            min="0"
            className="premium-input"
            placeholder="e.g. 75"
            value={data.minimum_charge_amount ?? ''}
            onChange={e => update({ minimum_charge_amount: e.target.value ? Number(e.target.value) : undefined })}
            style={{ marginTop: '4px' }}
          />
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
            Do you charge a service call / trip fee?
          </span>
          <ToggleSwitch
            data-testid="toggle-trip-fee"
            checked={data.has_trip_fee}
            onChange={v => update({ has_trip_fee: v, ...(!v ? { trip_fee_amount: undefined } : {}) })}
          />
        </div>
        {data.has_trip_fee && (
          <input
            data-testid="input-trip-fee-amount"
            type="number"
            min="0"
            className="premium-input"
            placeholder="e.g. 50"
            value={data.trip_fee_amount ?? ''}
            onChange={e => update({ trip_fee_amount: e.target.value ? Number(e.target.value) : undefined })}
            style={{ marginTop: '4px' }}
          />
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
            Do you offer fixed-price packages?
          </span>
          <ToggleSwitch
            data-testid="toggle-offers-packages"
            checked={data.offers_packages}
            onChange={v => update({ offers_packages: v })}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>
          What affects the price most?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {PRICE_FACTORS.map(factor => {
            const checked = (data.price_factors || []).includes(factor);
            return (
              <button
                key={factor}
                data-testid={`checkbox-factor-${toFactorTestId(factor)}`}
                type="button"
                onClick={() => toggleFactor(factor)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: p.radius.sm,
                  border: checked ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                  background: checked ? p.colors.accentLighter : 'transparent',
                  cursor: 'pointer',
                  transition: p.transitions.fast,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: checked ? `none` : `2px solid ${p.colors.borderHover}`,
                    background: checked ? p.colors.accent : p.colors.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: p.transitions.fast,
                  }}
                >
                  {checked && <Check style={{ width: '14px', height: '14px', color: '#FFFFFF' }} />}
                </div>
                <span style={{ fontSize: '14px', fontWeight: checked ? 500 : 400, color: p.colors.body }}>
                  {factor}
                </span>
              </button>
            );
          })}
          <button
            data-testid="checkbox-factor-other"
            type="button"
            onClick={() => toggleFactor('Other')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minHeight: '44px',
              padding: '10px 14px',
              borderRadius: p.radius.sm,
              border: (data.price_factors || []).includes('Other') ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
              background: (data.price_factors || []).includes('Other') ? p.colors.accentLighter : 'transparent',
              cursor: 'pointer',
              transition: p.transitions.fast,
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: (data.price_factors || []).includes('Other') ? `none` : `2px solid ${p.colors.borderHover}`,
                background: (data.price_factors || []).includes('Other') ? p.colors.accent : p.colors.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: p.transitions.fast,
              }}
            >
              {(data.price_factors || []).includes('Other') && <Check style={{ width: '14px', height: '14px', color: '#FFFFFF' }} />}
            </div>
            <span style={{ fontSize: '14px', fontWeight: (data.price_factors || []).includes('Other') ? 500 : 400, color: p.colors.body }}>
              Other
            </span>
          </button>
          {(data.price_factors || []).includes('Other') && (
            <input
              data-testid="input-factor-other"
              type="text"
              className="premium-input"
              placeholder="Describe other factor..."
              value={data.price_factors_other ?? ''}
              onChange={e => update({ price_factors_other: e.target.value })}
              style={{ marginTop: '4px', marginLeft: '30px' }}
            />
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>
          Typical job price range?
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            data-testid="input-price-range-min"
            type="number"
            min="0"
            className="premium-input"
            placeholder="Min $"
            value={data.price_range_min ?? ''}
            onChange={e => update({ price_range_min: e.target.value ? Number(e.target.value) : undefined })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '13px', color: p.colors.muted, fontWeight: 500 }}>to</span>
          <input
            data-testid="input-price-range-max"
            type="number"
            min="0"
            className="premium-input"
            placeholder="Max $"
            value={data.price_range_max ?? ''}
            onChange={e => update({ price_range_max: e.target.value ? Number(e.target.value) : undefined })}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>
          How should the calculator show pricing?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {OUTPUT_PREFERENCES.map(opt => {
            const selected = data.output_preference === opt.value;
            return (
              <button
                key={opt.value}
                data-testid={`radio-output-${opt.value}`}
                type="button"
                onClick={() => update({ output_preference: opt.value })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '44px',
                  padding: '10px 14px',
                  borderRadius: p.radius.sm,
                  border: selected ? `1.5px solid ${p.colors.accent}` : `1px solid ${p.colors.borderLight}`,
                  background: selected ? p.colors.accentLighter : 'transparent',
                  cursor: 'pointer',
                  transition: p.transitions.fast,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: selected ? `6px solid ${p.colors.accent}` : `2px solid ${p.colors.borderHover}`,
                    background: p.colors.surface,
                    flexShrink: 0,
                    transition: p.transitions.fast,
                  }}
                />
                <span style={{ fontSize: '14px', fontWeight: selected ? 500 : 400, color: p.colors.body }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, marginBottom: '10px' }}>
          Short description (optional)
        </div>
        <textarea
          data-testid="input-short-description"
          className="premium-input"
          placeholder="Briefly describe your service and typical pricing..."
          maxLength={200}
          rows={2}
          value={data.short_description ?? ''}
          onChange={e => update({ short_description: e.target.value })}
          style={{ resize: 'none', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  'data-testid': testId,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  'data-testid': string;
}) {
  return (
    <button
      data-testid={testId}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        background: checked ? p.colors.accent : p.colors.borderHover,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: p.transitions.fast,
        flexShrink: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '44px',
        padding: '10px 0',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#FFFFFF',
          position: 'absolute',
          left: checked ? '22px' : '2px',
          transition: p.transitions.fast,
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}
