// WizardStructureControls — structural (non-visual) build controls.
//
// These two controls used to live in the Style tab but are STRUCTURE, not
// appearance, so the wizard IA moved them into the Build tab:
//   - StepLayoutControl      → settings.stepLayout (stepper / single)  [state key UNCHANGED]
//   - PricingTiersSubsection → state.tiered (Good / Better / Best)      [state key UNCHANGED]
//
// They are extracted into this shared module (rather than duplicated) so the
// exact same editing UI + state wiring renders from BuildTab. Testids are
// preserved verbatim (`style-step-layout`, `style-segmented-step-layout`,
// `style-pricing-tiers`, `style-pricing-tier-*`, …) so existing tests + the
// preview's click-to-edit mapping keep working after the move.
//
// Self-contained styling: a small scoped <style> defines the segmented control
// + label rhythm so the component doesn't depend on StyleTab's <style> block
// (BuildTab never mounted those rules). Uses the global `premium-input` +
// shared <FloatField> for the inputs.

import { platformTheme } from '@/theme/platformTheme';
import {
  shouldDefaultTiered,
  DEFAULT_TIERS,
  type TemplateTiered,
  type TemplateTier,
} from '@shared/templatePresets';
import FloatField from './FloatField';
import InfoCue from './InfoCue';

const p = platformTheme;

/* ─── Segmented control (self-contained copy of the Style/Settings pattern) ── */
function SegmentedControl<T extends string | number>({
  name, value, options, onChange, testid,
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <div
      className="qq-bstruct-seg"
      role="radiogroup"
      aria-label={name}
      data-testid={testid}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            className="qq-bstruct-seg-btn"
            data-testid={`${testid}-${o.value}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Step layout (RELOCATED from StyleTab — settings.stepLayout) ───────── */
export function StepLayoutControl({
  stepLayout, onStepLayoutChange,
}: {
  stepLayout?: 'stepper' | 'single';
  onStepLayoutChange: (next: 'stepper' | 'single') => void;
}) {
  return (
    <div className="qq-bstruct" data-testid="style-step-layout">
      <label className="qq-bstruct-label">
        <span className="qq-bstruct-label-text">
          Step layout
          <InfoCue
            testid="style-step-layout-info"
            region="step-content"
            text="Multi-step (the default) renders one question per screen — ~3x higher quote completion in industry benchmarks. Single form keeps every field on one page."
          />
        </span>
      </label>
      <SegmentedControl<'stepper' | 'single'>
        name="step-layout"
        testid="style-segmented-step-layout"
        value={stepLayout ?? 'stepper'}
        options={[
          { value: 'stepper', label: 'Multi-step' },
          { value: 'single', label: 'Single form' },
        ]}
        onChange={(v) => onStepLayoutChange(v)}
      />
      <p className="qq-bstruct-hint">
        Recommended: Multi-step. Industry data shows multi-step quote forms
        convert at ~13.85% vs ~4.53% for single-page forms.
      </p>
      <StructureStyles />
    </div>
  );
}

/* ─── Pricing tiers (RELOCATED from StyleTab — state.tiered) ────────────── */
export function PricingTiersSubsection({
  tiered, onTieredChange, templateCategory,
}: {
  tiered?: TemplateTiered;
  onTieredChange: (next: TemplateTiered | undefined) => void;
  templateCategory?: string;
}) {
  const categoryDefaultOn = shouldDefaultTiered(templateCategory);
  // Resolved enabled state — explicit value wins, else the category default.
  const enabled = typeof tiered?.enabled === 'boolean' ? tiered.enabled : categoryDefaultOn;
  // Resolved tier list — explicit list wins, else the default 3.
  const tiers: TemplateTier[] = tiered?.tiers && tiered.tiers.length > 0
    ? tiered.tiers
    : [...DEFAULT_TIERS];

  const setEnabled = (next: boolean) => {
    onTieredChange({ enabled: next, tiers });
  };
  const setTier = (idx: number, patch: Partial<TemplateTier>) => {
    const nextTiers = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onTieredChange({ enabled, tiers: nextTiers });
  };

  return (
    <div className="qq-bstruct" data-testid="style-pricing-tiers" data-edit-key="tiered">
      <label className="qq-bstruct-label">
        <span className="qq-bstruct-label-text">
          Pricing tiers
          <InfoCue
            testid="style-pricing-tiers-info"
            region="tier-cards"
            text="Good/Better/Best presentation outperforms single-price AND 4+-tier alternatives. Auto-enabled for scope-spectrum work (roofing, windows, HVAC, landscaping); off for flat-fee categories like cleaning."
          />
        </span>
      </label>
      <label
        className="qq-bstruct-label"
        style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="style-pricing-tiers-enabled"
          aria-label="Show Good / Better / Best pricing tiers"
        />
        <span className="qq-bstruct-label-text" style={{ margin: 0 }}>
          Show Good / Better / Best tiers
        </span>
      </label>
      <p className="qq-bstruct-hint" style={{ margin: '6px 0 8px' }}>
        {categoryDefaultOn
          ? 'Recommended for this category — scope-spectrum work converts better with 3 price points.'
          : 'Flat-fee category — single price is the safer default.'}
      </p>

      {enabled && (
        <div
          data-testid="style-pricing-tiers-editor"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}
        >
          {tiers.map((tier, idx) => (
            <TierRow
              key={idx}
              idx={idx}
              tier={tier}
              onPatch={(patch) => setTier(idx, patch)}
            />
          ))}
          <p className="qq-bstruct-hint" style={{ margin: '4px 0 0' }}>
            Each tier price = base quote × multiplier, rounded to $25.
            Mark exactly one tier "Most Popular" so it anchors choice.
          </p>
        </div>
      )}
      <StructureStyles />
    </div>
  );
}

/** Single tier row (multiplier + label + tagline + popular toggle). */
function TierRow({
  idx, tier, onPatch,
}: {
  idx: number;
  tier: TemplateTier;
  onPatch: (patch: Partial<TemplateTier>) => void;
}) {
  const labelId = `qq-tier-${idx}-label`;
  const multId = `qq-tier-${idx}-mult`;
  const taglineId = `qq-tier-${idx}-tagline`;
  return (
    <div
      data-testid={`style-pricing-tier-${idx}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 8,
        background: '#fafbfc',
        borderRadius: 8,
        border: `1px solid ${p.colors.borderLight}`,
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        <FloatField label="Tier name" htmlFor={labelId}>
          <input
            id={labelId}
            data-testid={`style-pricing-tier-${idx}-label`}
            className="premium-input"
            placeholder=" "
            value={tier.label}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </FloatField>
        <FloatField label="Multiplier" htmlFor={multId}>
          <input
            id={multId}
            data-testid={`style-pricing-tier-${idx}-multiplier`}
            className="premium-input"
            type="number"
            step={0.05}
            min={0.1}
            max={5}
            placeholder=" "
            value={tier.multiplier}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) onPatch({ multiplier: v });
            }}
          />
        </FloatField>
      </div>
      <FloatField label="Tagline" htmlFor={taglineId}>
        <input
          id={taglineId}
          data-testid={`style-pricing-tier-${idx}-tagline`}
          className="premium-input"
          placeholder=" "
          value={tier.tagline}
          onChange={(e) => onPatch({ tagline: e.target.value })}
        />
      </FloatField>
      <label
        className="qq-bstruct-label"
        style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={tier.mostPopular === true}
          onChange={(e) => onPatch({ mostPopular: e.target.checked })}
          data-testid={`style-pricing-tier-${idx}-popular`}
          aria-label={`Mark ${tier.label} as Most Popular`}
        />
        <span className="qq-bstruct-label-text" style={{ margin: 0 }}>
          Most Popular
        </span>
      </label>
    </div>
  );
}

/* Scoped styles for the relocated controls. Mirrors the Style/Settings
   segmented-control look (subtle accent tint + outline on the active option —
   never a bright fill, per the hard UI rules). */
function StructureStyles() {
  return (
    <style>{`
      .qq-bstruct { display: flex; flex-direction: column; }
      .qq-bstruct-label {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 12px; font-weight: 700;
        color: ${p.colors.heading};
        margin-bottom: 6px;
      }
      .qq-bstruct-label-text {
        display: inline-flex; align-items: center; gap: 6px;
      }
      .qq-bstruct-hint {
        font-size: 11px; color: ${p.colors.muted};
        margin: 6px 0 0; line-height: 1.4;
      }
      .qq-bstruct-seg {
        display: inline-flex;
        padding: 3px; gap: 2px;
        background: #f4f6f9;
        border: 1px solid ${p.colors.border};
        border-radius: 10px;
      }
      .qq-bstruct-seg-btn {
        font: inherit; cursor: pointer;
        background: transparent; border: none;
        padding: 7px 14px;
        font-size: 12.5px; font-weight: 600;
        color: ${p.colors.muted};
        border-radius: 7px;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .qq-bstruct-seg-btn:hover:not([aria-checked="true"]) {
        color: ${p.colors.heading};
        background: rgba(13, 60, 252, 0.04);
      }
      .qq-bstruct-seg-btn[aria-checked="true"] {
        background: ${p.colors.accentLighter};
        color: ${p.colors.accentDark};
        box-shadow: inset 0 0 0 1.5px ${p.colors.accent};
      }
      .qq-editor-shell[data-theme="dark"] .qq-bstruct-label { color: var(--qq-text); }
      .qq-editor-shell[data-theme="dark"] .qq-bstruct-hint { color: var(--qq-muted); }
      .qq-editor-shell[data-theme="dark"] .qq-bstruct-seg {
        background: rgba(255,255,255,0.04);
        border-color: var(--qq-border);
      }
    `}</style>
  );
}
