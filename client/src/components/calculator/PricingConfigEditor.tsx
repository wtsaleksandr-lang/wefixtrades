// Full PricingConfigV1 editor — used by the customer Edit page (edit-calculator.tsx).
// Covers all 10 pricing families: family switch, per-family fields, tier/add-on/
// difficulty editors, and the shared optional fees. Always emits a structurally
// valid PricingConfigV1 (the UI prevents invalid intermediate states).
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  PRICING_TYPES,
  FAMILY_LABELS,
  FAMILY_DESCRIPTIONS,
  type PricingConfigV1,
  type PricingType,
  type AddOn,
  type DifficultyTier,
} from '@shared/pricingConfig';

interface Props {
  config: PricingConfigV1;
  onChange: (config: PricingConfigV1) => void;
}

/* ─── Per-family defaults (used on family switch) ─── */
function defaultConfigFor(type: PricingType): PricingConfigV1 {
  switch (type) {
    case 'hourly':         return { pricingType: 'hourly', unitName: 'hour', rate: 0 };
    case 'per_unit':       return { pricingType: 'per_unit', unitName: 'unit', rate: 0 };
    case 'per_sqft':       return { pricingType: 'per_sqft', unitName: 'sq ft', rate: 0 };
    case 'per_linear_ft':  return { pricingType: 'per_linear_ft', unitName: 'linear ft', rate: 0 };
    case 'base_plus_rate': return { pricingType: 'base_plus_rate', unitName: 'unit', baseFee: 0, rate: 0 };
    case 'tiered_packages':return { pricingType: 'tiered_packages', tierMode: 'fixed', tiers: [{ label: 'Basic', price: 0 }] };
    case 'tiered_ranges':  return { pricingType: 'tiered_ranges', tierMode: 'fixed', unitName: 'unit', tiers: [{ min: 0, max: null, price: 0 }] };
    case 'min_charge_plus_addons': return { pricingType: 'min_charge_plus_addons', minCharge: 0 };
    case 'price_range_only': return { pricingType: 'price_range_only', rangeMin: 0, rangeMax: 0 };
    case 'call_for_quote_only': return { pricingType: 'call_for_quote_only', message: 'Request a quote' };
  }
}

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/* ─── Small field primitives ─── */

function MoneyField({ label, hint, value, onChange, testId, step }: {
  label: string; hint?: string; value: number | undefined;
  onChange: (v: number) => void; testId: string; step?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-500">{label}</Label>
      {hint && <p className="text-xs text-slate-400 mt-0.5 mb-1">{hint}</p>}
      <div className="relative w-40 mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <Input
          className="premium-input pl-7"
          type="number"
          min="0"
          step={step || '1'}
          value={value ?? 0}
          onChange={e => onChange(num(e.target.value))}
          data-testid={testId}
        />
      </div>
    </div>
  );
}

function TextField({ label, hint, value, onChange, testId, placeholder }: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; testId: string; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-500">{label}</Label>
      {hint && <p className="text-xs text-slate-400 mt-0.5 mb-1">{hint}</p>}
      <Input
        className="premium-input mt-1 w-56"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

/* ─── Optional scalar fee (clearable) ─── */
function OptionalFee({ label, value, present, onToggle, onChange, testId, isMultiplier }: {
  label: string; value: number | undefined; present: boolean;
  onToggle: (on: boolean) => void; onChange: (v: number) => void;
  testId: string; isMultiplier?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="flex items-center gap-2 cursor-pointer select-none min-w-[180px]">
        <input
          type="checkbox"
          checked={present}
          onChange={e => onToggle(e.target.checked)}
          className="rounded border-slate-300"
          data-testid={`toggle-${testId}`}
        />
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </label>
      {present && (
        <div className="relative w-32">
          {!isMultiplier && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>}
          <Input
            className={`premium-input h-9 text-sm ${isMultiplier ? '' : 'pl-6'}`}
            type="number"
            min={isMultiplier ? '1' : '0'}
            step={isMultiplier ? '0.05' : '1'}
            value={value ?? (isMultiplier ? 1 : 0)}
            onChange={e => {
              const n = parseFloat(e.target.value);
              const safe = Number.isFinite(n) ? n : 0;
              onChange(isMultiplier ? Math.max(1, safe) : Math.max(0, safe));
            }}
            data-testid={`input-${testId}`}
          />
          {isMultiplier && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">×</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Add-ons editor ─── */
function AddOnsEditor({ addOns, onChange }: { addOns: AddOn[]; onChange: (a: AddOn[]) => void }) {
  const update = (i: number, patch: Partial<AddOn>) => {
    const next = addOns.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {addOns.map((a, i) => (
        <div key={a.id} className="flex items-center gap-2" data-testid={`addon-row-${i}`}>
          <Input
            className="premium-input h-9 text-sm flex-1"
            value={a.label}
            placeholder="Add-on name"
            onChange={e => update(i, { label: e.target.value })}
            data-testid={`input-addon-label-${i}`}
          />
          <select
            className="h-9 rounded-md border border-slate-200 text-sm px-2 bg-white"
            value={a.type}
            onChange={e => update(i, { type: e.target.value as 'fixed' | 'pct' })}
            data-testid={`select-addon-type-${i}`}
          >
            <option value="fixed">$ flat</option>
            <option value="pct">% of total</option>
          </select>
          <div className="relative w-24">
            <Input
              className="premium-input h-9 text-sm pr-6"
              type="number"
              min="0"
              value={a.amount}
              onChange={e => update(i, { amount: num(e.target.value) })}
              data-testid={`input-addon-amount-${i}`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              {a.type === 'pct' ? '%' : '$'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(addOns.filter((_, idx) => idx !== i))}
            className="p-1.5 rounded hover:bg-red-50 transition-colors"
            data-testid={`button-remove-addon-${i}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...addOns, { id: `addon_${Date.now()}`, label: '', type: 'fixed', amount: 0 }])}
        className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 py-1"
        data-testid="button-add-addon"
      >
        <Plus className="w-3.5 h-3.5" /> Add an add-on
      </button>
    </div>
  );
}

/* ─── Difficulty tiers editor ─── */
function DifficultyEditor({ tiers, onChange }: { tiers: DifficultyTier[]; onChange: (t: DifficultyTier[]) => void }) {
  const update = (i: number, patch: Partial<DifficultyTier>) => {
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  return (
    <div className="space-y-2">
      {tiers.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2" data-testid={`difficulty-row-${i}`}>
          <Input
            className="premium-input h-9 text-sm flex-1"
            value={t.label}
            placeholder="Level name (e.g. Complex)"
            onChange={e => update(i, { label: e.target.value })}
            data-testid={`input-difficulty-label-${i}`}
          />
          <div className="relative w-24">
            <Input
              className="premium-input h-9 text-sm pr-6"
              type="number"
              min="1"
              step="0.05"
              value={t.multiplier}
              onChange={e => {
                const n = parseFloat(e.target.value);
                update(i, { multiplier: Number.isFinite(n) ? Math.max(1, n) : 1 });
              }}
              data-testid={`input-difficulty-mult-${i}`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">×</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}
            className="p-1.5 rounded hover:bg-red-50 transition-colors"
            data-testid={`button-remove-difficulty-${i}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...tiers, { id: `diff_${Date.now()}`, label: '', multiplier: 1 }])}
        className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 py-1"
        data-testid="button-add-difficulty"
      >
        <Plus className="w-3.5 h-3.5" /> Add a difficulty level
      </button>
    </div>
  );
}

/* ─── Main editor ─── */
export default function PricingConfigEditor({ config, onChange }: Props) {
  const t = config.pricingType;

  // Cast helper — the UI guarantees the resulting shape stays valid for the family.
  const patch = (updates: Record<string, any>) =>
    onChange({ ...config, ...updates } as PricingConfigV1);

  const c = config as any; // narrowed reads below are family-guarded

  const showBaseFeeOpt = ['hourly', 'per_unit', 'per_sqft', 'per_linear_ft'].includes(t);
  const showMinChargeOpt = ['hourly', 'per_unit', 'per_sqft', 'per_linear_ft', 'base_plus_rate'].includes(t);
  const feeFamilies = ['hourly', 'per_unit', 'per_sqft', 'per_linear_ft', 'base_plus_rate', 'tiered_packages', 'tiered_ranges', 'min_charge_plus_addons'];
  const showFees = feeFamilies.includes(t);
  const showCallUsThreshold = showFees || t === 'price_range_only';
  const editableUnitName = t === 'per_unit' || t === 'base_plus_rate' || t === 'tiered_ranges';

  return (
    <div className="space-y-5" data-testid="pricing-config-editor">
      {/* Family selector */}
      <div>
        <Label className="text-xs font-semibold text-slate-500">Pricing Type</Label>
        <select
          className="mt-1.5 block w-full h-10 rounded-md border border-slate-200 text-sm px-3 bg-white"
          value={t}
          onChange={e => onChange(defaultConfigFor(e.target.value as PricingType))}
          data-testid="select-pricing-type"
        >
          {PRICING_TYPES.map(pt => (
            <option key={pt} value={pt}>{FAMILY_LABELS[pt]}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">{FAMILY_DESCRIPTIONS[t]}</p>
        <p className="text-xs text-amber-600 mt-1">Changing the pricing type resets the fields below.</p>
      </div>

      {/* Per-family fields */}
      <div className="space-y-4 border-t border-slate-100 pt-4">
        {editableUnitName && (
          <TextField
            label="Unit name"
            hint="What you charge per — e.g. room, window, fixture."
            value={c.unitName ?? ''}
            onChange={v => patch({ unitName: v || 'unit' })}
            testId="input-unit-name"
            placeholder="unit"
          />
        )}

        {(t === 'hourly' || t === 'per_unit' || t === 'per_sqft' || t === 'per_linear_ft') && (
          <MoneyField
            label={`Rate per ${c.unitName || 'unit'}`}
            value={c.rate}
            onChange={v => patch({ rate: v })}
            testId="input-rate"
            step="any"
          />
        )}

        {t === 'base_plus_rate' && (
          <>
            <MoneyField label="Base fee" hint="Flat fee charged before the per-unit rate."
              value={c.baseFee} onChange={v => patch({ baseFee: v })} testId="input-base-fee" />
            <MoneyField label={`Rate per ${c.unitName || 'unit'}`}
              value={c.rate} onChange={v => patch({ rate: v })} testId="input-rate" step="any" />
          </>
        )}

        {t === 'min_charge_plus_addons' && (
          <MoneyField label="Minimum charge" hint="The base service charge before add-ons."
            value={c.minCharge} onChange={v => patch({ minCharge: v })} testId="input-min-charge" />
        )}

        {t === 'price_range_only' && (
          <div className="flex gap-3">
            <MoneyField label="Range minimum" value={c.rangeMin}
              onChange={v => patch({ rangeMin: v, rangeMax: Math.max(c.rangeMax ?? 0, v) })} testId="input-range-min" />
            <MoneyField label="Range maximum" value={c.rangeMax}
              onChange={v => patch({ rangeMax: Math.max(v, c.rangeMin ?? 0) })} testId="input-range-max" />
          </div>
        )}

        {t === 'call_for_quote_only' && (
          <TextField label="Message shown to visitors"
            value={c.message ?? ''} onChange={v => patch({ message: v || 'Request a quote' })}
            testId="input-cfq-message" placeholder="Request a quote" />
        )}

        {t === 'tiered_packages' && (
          <div>
            <Label className="text-xs font-semibold text-slate-500">Packages</Label>
            <div className="space-y-2 mt-2">
              {(c.tiers || []).map((tier: any, i: number) => (
                <div key={i} className="flex items-center gap-2" data-testid={`package-row-${i}`}>
                  <Input className="premium-input h-9 text-sm flex-1" value={tier.label}
                    placeholder="Package name"
                    onChange={e => patch({ tiers: c.tiers.map((x: any, idx: number) => idx === i ? { ...x, label: e.target.value } : x) })}
                    data-testid={`input-package-label-${i}`} />
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                    <Input className="premium-input h-9 text-sm pl-6" type="number" min="0" value={tier.price}
                      onChange={e => patch({ tiers: c.tiers.map((x: any, idx: number) => idx === i ? { ...x, price: num(e.target.value) } : x) })}
                      data-testid={`input-package-price-${i}`} />
                  </div>
                  {c.tiers.length > 1 && (
                    <button type="button"
                      onClick={() => patch({ tiers: c.tiers.filter((_: any, idx: number) => idx !== i) })}
                      className="p-1.5 rounded hover:bg-red-50 transition-colors"
                      data-testid={`button-remove-package-${i}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => patch({ tiers: [...c.tiers, { label: '', price: 0 }] })}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 py-1"
                data-testid="button-add-package">
                <Plus className="w-3.5 h-3.5" /> Add a package
              </button>
            </div>
          </div>
        )}

        {t === 'tiered_ranges' && (
          <div>
            <Label className="text-xs font-semibold text-slate-500">Quantity tiers</Label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">Leave "max" blank for the final "and up" tier.</p>
            <div className="space-y-2">
              {(c.tiers || []).map((tier: any, i: number) => (
                <div key={i} className="flex items-center gap-2" data-testid={`range-row-${i}`}>
                  <Input className="premium-input h-9 text-sm w-20" type="number" min="0" value={tier.min}
                    placeholder="min"
                    onChange={e => patch({ tiers: c.tiers.map((x: any, idx: number) => idx === i ? { ...x, min: num(e.target.value) } : x) })}
                    data-testid={`input-range-tier-min-${i}`} />
                  <span className="text-xs text-slate-400">to</span>
                  <Input className="premium-input h-9 text-sm w-20" type="number" min="0"
                    value={tier.max ?? ''} placeholder="∞"
                    onChange={e => patch({ tiers: c.tiers.map((x: any, idx: number) => idx === i ? { ...x, max: e.target.value === '' ? null : num(e.target.value) } : x) })}
                    data-testid={`input-range-tier-max-${i}`} />
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                    <Input className="premium-input h-9 text-sm pl-6" type="number" min="0" value={tier.price}
                      onChange={e => patch({ tiers: c.tiers.map((x: any, idx: number) => idx === i ? { ...x, price: num(e.target.value) } : x) })}
                      data-testid={`input-range-tier-price-${i}`} />
                  </div>
                  {c.tiers.length > 1 && (
                    <button type="button"
                      onClick={() => patch({ tiers: c.tiers.filter((_: any, idx: number) => idx !== i) })}
                      className="p-1.5 rounded hover:bg-red-50 transition-colors"
                      data-testid={`button-remove-range-${i}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => patch({ tiers: [...c.tiers, { min: 0, max: null, price: 0 }] })}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 py-1"
                data-testid="button-add-range">
                <Plus className="w-3.5 h-3.5" /> Add a tier
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Optional fees & adjustments */}
      {(showFees || showCallUsThreshold) && (
        <div className="border-t border-slate-100 pt-4">
          <Label className="text-xs font-semibold text-slate-500">Optional Fees & Adjustments</Label>
          <div className="mt-2">
            {showBaseFeeOpt && (
              <OptionalFee label="Base fee" testId="base-fee"
                present={c.baseFee !== undefined} value={c.baseFee}
                onToggle={on => patch({ baseFee: on ? 0 : undefined })}
                onChange={v => patch({ baseFee: v })} />
            )}
            {showMinChargeOpt && (
              <OptionalFee label="Minimum charge" testId="min-charge"
                present={c.minCharge !== undefined} value={c.minCharge}
                onToggle={on => patch({ minCharge: on ? 0 : undefined })}
                onChange={v => patch({ minCharge: v })} />
            )}
            {showFees && (
              <OptionalFee label="Travel / trip fee" testId="travel-fee"
                present={c.travelFee !== undefined} value={c.travelFee}
                onToggle={on => patch({ travelFee: on ? 0 : undefined })}
                onChange={v => patch({ travelFee: v })} />
            )}
            {showFees && (
              <OptionalFee label="After-hours multiplier" testId="after-hours" isMultiplier
                present={c.afterHoursMult !== undefined} value={c.afterHoursMult}
                onToggle={on => patch({ afterHoursMult: on ? 1.5 : undefined })}
                onChange={v => patch({ afterHoursMult: v })} />
            )}
            {showCallUsThreshold && (
              <OptionalFee label="Call-us threshold" testId="call-us-threshold"
                present={c.callUsThreshold !== undefined} value={c.callUsThreshold}
                onToggle={on => patch({ callUsThreshold: on ? 0 : undefined })}
                onChange={v => patch({ callUsThreshold: v })} />
            )}
          </div>

          {showFees && (
            <>
              <div className="mt-4">
                <Label className="text-xs font-semibold text-slate-500">Add-ons</Label>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">Optional extras a customer can select.</p>
                <AddOnsEditor addOns={c.addOns || []} onChange={a => patch({ addOns: a.length ? a : undefined })} />
              </div>
              <div className="mt-4">
                <Label className="text-xs font-semibold text-slate-500">Difficulty levels</Label>
                <p className="text-xs text-slate-400 mt-0.5 mb-2">Multipliers applied for harder jobs.</p>
                <DifficultyEditor tiers={c.difficultyTiers || []} onChange={d => patch({ difficultyTiers: d.length ? d : undefined })} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
