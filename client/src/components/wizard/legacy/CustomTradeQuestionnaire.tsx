// FROZEN — scheduled for rebuild in Phase 3 (Builder Wizard). Do not add features.
import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, CreditCard } from 'lucide-react';
import { type CustomTradeData, type CalculatorSettings, type BookingSettings, bookingSettingsSchema } from '@shared/schema';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';

const p = platformTheme;

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DAY_LABELS: { key: BookingSettings['availability']['working_days'][number]; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${mStr} ${suffix}`;
}

interface CustomTradeQuestionnaireProps {
  data: CustomTradeData;
  onChange: (data: CustomTradeData) => void;
  calculatorSettings?: CalculatorSettings;
  onSettingsChange?: (settings: CalculatorSettings) => void;
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

export default function CustomTradeQuestionnaire({ data, onChange, calculatorSettings, onSettingsChange }: CustomTradeQuestionnaireProps) {
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
                  border: 'none',
                  boxShadow: selected ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                  background: selected ? p.colors.accentLighter : d.colors.card,
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
                  border: 'none',
                  boxShadow: checked ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                  background: checked ? p.colors.accentLighter : d.colors.card,
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
              border: 'none',
              boxShadow: (data.price_factors || []).includes('Other') ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
              background: (data.price_factors || []).includes('Other') ? p.colors.accentLighter : d.colors.card,
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
                  border: 'none',
                  boxShadow: selected ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                  background: selected ? p.colors.accentLighter : d.colors.card,
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

      {calculatorSettings && onSettingsChange && (
        <BookingToggleSection
          settings={calculatorSettings}
          onSettingsChange={onSettingsChange}
        />
      )}
    </div>
  );
}

function BookingToggleSection({
  settings,
  onSettingsChange,
}: {
  settings: CalculatorSettings;
  onSettingsChange: (s: CalculatorSettings) => void;
}) {
  const bookingEnabled = settings.calculator_type === 'estimate_plus_booking';
  const bs = settings.booking_settings ?? bookingSettingsSchema.parse({});
  const [expanded, setExpanded] = useState(bookingEnabled);

  const toggleBooking = (enabled: boolean) => {
    onSettingsChange({
      ...settings,
      calculator_type: enabled ? 'estimate_plus_booking' : 'estimate_only',
      booking_settings: {
        ...bs,
        enabled,
      },
    });
    if (enabled) setExpanded(true);
  };

  const updateBooking = (partial: Partial<BookingSettings>) => {
    onSettingsChange({
      ...settings,
      booking_settings: { ...bs, ...partial },
    });
  };

  const updateAvailability = (partial: Partial<BookingSettings['availability']>) => {
    onSettingsChange({
      ...settings,
      booking_settings: {
        ...bs,
        availability: { ...bs.availability, ...partial },
      },
    });
  };

  const toggleDay = (day: BookingSettings['availability']['working_days'][number]) => {
    const current = bs.availability.working_days;
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    updateAvailability({ working_days: next as typeof current });
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${p.colors.borderLight}`,
        paddingTop: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: bookingEnabled ? '10px' : '0' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
            Allow customers to book instantly after seeing estimate?
          </div>
          <div style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>
            {bookingEnabled ? 'Yes (Estimate + Booking)' : 'No (Estimate only)'}
          </div>
        </div>
        <ToggleSwitch
          data-testid="toggle-booking-enabled"
          checked={bookingEnabled}
          onChange={toggleBooking}
        />
      </div>

      {bookingEnabled && (
        <div
          style={{
            border: 'none',
            boxShadow: d.shadows.card,
            borderRadius: p.radius.md,
            background: p.colors.surfaceRaised,
            overflow: 'hidden',
          }}
        >
          <button
            data-testid="button-booking-settings-toggle"
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>
              Booking Settings
            </span>
            {expanded ? (
              <ChevronUp style={{ width: '16px', height: '16px', color: p.colors.muted }} />
            ) : (
              <ChevronDown style={{ width: '16px', height: '16px', color: p.colors.muted }} />
            )}
          </button>

          {expanded && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>
                    Require deposit?
                  </span>
                  <ToggleSwitch
                    data-testid="toggle-require-deposit"
                    checked={bs.require_deposit}
                    onChange={v => updateBooking({ require_deposit: v, ...(!v ? { deposit_value: 0 } : {}) })}
                  />
                </div>
                {bs.require_deposit && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['fixed', 'percentage'] as const).map(dt => {
                        const selected = bs.deposit_type === dt;
                        return (
                          <button
                            key={dt}
                            data-testid={`button-deposit-type-${dt}`}
                            type="button"
                            onClick={() => updateBooking({ deposit_type: dt })}
                            style={{
                              padding: '6px 14px',
                              borderRadius: p.radius.sm,
                              border: 'none', boxShadow: selected ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                              background: selected ? p.colors.accentLighter : d.colors.card,
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: selected ? 500 : 400,
                              color: p.colors.body,
                              outline: 'none',
                              transition: p.transitions.fast,
                            }}
                          >
                            {dt === 'fixed' ? 'Fixed $' : 'Percentage %'}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      data-testid="input-deposit-value"
                      type="number"
                      min="0"
                      className="premium-input"
                      placeholder={bs.deposit_type === 'fixed' ? 'e.g. 50' : 'e.g. 25'}
                      value={bs.deposit_value || ''}
                      onChange={e => updateBooking({ deposit_value: e.target.value ? Number(e.target.value) : 0 })}
                      style={{ flex: 1, minWidth: '80px' }}
                    />
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '8px' }}>
                  Slot duration
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[30, 60].map(dur => {
                    const selected = bs.slot_duration_minutes === dur;
                    return (
                      <button
                        key={dur}
                        data-testid={`button-slot-duration-${dur}`}
                        type="button"
                        onClick={() => updateBooking({ slot_duration_minutes: dur })}
                        style={{
                          padding: '6px 14px',
                          borderRadius: p.radius.sm,
                          border: 'none', boxShadow: selected ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                          background: selected ? p.colors.accentLighter : d.colors.card,
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: selected ? 500 : 400,
                          color: p.colors.body,
                          outline: 'none',
                          transition: p.transitions.fast,
                        }}
                      >
                        {dur} min
                      </button>
                    );
                  })}
                  <button
                    data-testid="button-slot-duration-custom"
                    type="button"
                    onClick={() => updateBooking({ slot_duration_minutes: bs.slot_duration_minutes === 30 || bs.slot_duration_minutes === 60 ? 45 : bs.slot_duration_minutes })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: p.radius.sm,
                      border: 'none',
                      boxShadow: bs.slot_duration_minutes !== 30 && bs.slot_duration_minutes !== 60 ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                      background: bs.slot_duration_minutes !== 30 && bs.slot_duration_minutes !== 60 ? p.colors.accentLighter : d.colors.card,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: bs.slot_duration_minutes !== 30 && bs.slot_duration_minutes !== 60 ? 500 : 400,
                      color: p.colors.body,
                      outline: 'none',
                      transition: p.transitions.fast,
                    }}
                  >
                    Custom
                  </button>
                  {bs.slot_duration_minutes !== 30 && bs.slot_duration_minutes !== 60 && (
                    <input
                      data-testid="input-slot-duration-custom"
                      type="number"
                      min="15"
                      max="480"
                      className="premium-input"
                      placeholder="minutes"
                      value={bs.slot_duration_minutes}
                      onChange={e => updateBooking({ slot_duration_minutes: e.target.value ? Number(e.target.value) : 60 })}
                      style={{ width: '80px' }}
                    />
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '8px' }}>
                  Working days
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map(day => {
                    const active = bs.availability.working_days.includes(day.key);
                    return (
                      <button
                        key={day.key}
                        data-testid={`toggle-day-${day.key}`}
                        type="button"
                        onClick={() => toggleDay(day.key)}
                        style={{
                          width: '42px',
                          height: '36px',
                          borderRadius: p.radius.sm,
                          border: 'none',
                          boxShadow: active ? `0 0 0 1.5px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                          background: active ? p.colors.accentLighter : d.colors.card,
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: active ? 600 : 400,
                          color: active ? p.colors.accent : p.colors.muted,
                          outline: 'none',
                          transition: p.transitions.fast,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '8px' }}>
                  Working hours
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    data-testid="select-start-time"
                    className="premium-input"
                    value={bs.availability.start_time}
                    onChange={e => updateAvailability({ start_time: e.target.value })}
                    style={{ flex: 1, minWidth: '120px' }}
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '13px', color: p.colors.muted, fontWeight: 500 }}>to</span>
                  <select
                    data-testid="select-end-time"
                    className="premium-input"
                    value={bs.availability.end_time}
                    onChange={e => updateAvailability({ end_time: e.target.value })}
                    style={{ flex: 1, minWidth: '120px' }}
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '8px' }}>
                  Buffer between appointments (minutes)
                </div>
                <input
                  data-testid="input-buffer-minutes"
                  type="number"
                  min="0"
                  max="120"
                  className="premium-input"
                  placeholder="e.g. 15"
                  value={bs.availability.buffer_minutes || ''}
                  onChange={e => updateAvailability({ buffer_minutes: e.target.value ? Number(e.target.value) : 0 })}
                  style={{ width: '120px' }}
                />
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, marginBottom: '8px' }}>
                  Timezone
                </div>
                <select
                  data-testid="select-timezone"
                  className="premium-input"
                  value={bs.availability.timezone}
                  onChange={e => updateAvailability({ timezone: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {bs.require_deposit && !bs.stripe_account_id && (
                <button
                  data-testid="button-connect-stripe"
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/connect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ calculator_id: 0 }),
                      });
                      const data = await res.json();
                      if (data.url) window.open(data.url, '_blank');
                    } catch {}
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: p.radius.sm,
                    border: `1.5px solid ${p.colors.accent}`,
                    background: p.colors.accent,
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    outline: 'none',
                    transition: p.transitions.fast,
                    width: '100%',
                  }}
                >
                  <CreditCard style={{ width: '16px', height: '16px' }} />
                  Connect Stripe
                </button>
              )}

              {bs.stripe_account_id && (
                <div
                  data-testid="text-stripe-connected"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: p.radius.sm,
                    background: p.colors.successLight,
                    fontSize: '13px',
                    fontWeight: 500,
                    color: p.colors.success,
                  }}
                >
                  <Check style={{ width: '14px', height: '14px' }} />
                  Stripe connected
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
