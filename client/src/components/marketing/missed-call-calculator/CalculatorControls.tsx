import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, ChevronLeft, RotateCcw } from 'lucide-react';
import { mkt, radius, shadows } from '@/theme/tokens';
import { trackEvent } from '@/lib/trackEvent';
import SliderField from '@/components/calculator/SliderField';
import InfoCue from '@/components/wizard/elfsight/InfoCue';
import type { TradePreset } from '@/data/missedCallTradePresets';

const DARK_TRACK = 'rgba(255,255,255,0.08)';

const fmtCurrency = (v: number) => `$${v.toLocaleString()}`;
const fmtCurrencyBound = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v.toLocaleString()}`;
const fmtPct = (v: number) => `${v}%`;

export interface SliderValues {
  missedCallsPerWeek: number;
  closeRatePercent: number;
  avgJobValue: number;
}

/** Step keys for the multi-step slider flow. `null` = render all three at once
 *  (legacy behaviour, retained for backward compat). */
export type SliderStepKey = 'missedCalls' | 'closeRate' | 'avgJobValue' | null;

/** Per-step copy shown above the single slider. Mirrors the QuoteWidget
 *  one-question-per-screen pattern (BD-2a). `cue` is BG-5 — a longer-form
 *  help blurb surfaced via the top-left InfoCue affordance (BD-3h pattern). */
export const SLIDER_STEP_META: Record<Exclude<SliderStepKey, null>, {
  title: string;
  helper: string;
  cue: string;
}> = {
  missedCalls: {
    title: 'How many calls do you miss per week?',
    helper: 'Include after-hours, weekends, and busy periods when no one picks up.',
    // BG-7 Item 2 — reconciled with the slider label "Missed calls per week"
    // (BG-5 originally said "per month" which contradicted the underlying
    // multiplication math; changing the label would require also changing
    // the math, so the cue copy was switched to match the label instead).
    cue: 'Estimated number of calls you miss per week. If unsure, use 10-30% of your total inbound.',
  },
  closeRate: {
    title: 'What’s your close rate on answered calls?',
    helper: 'Industry average for home services is 25–40%.',
    cue: 'Percentage of calls that become customers when you DO answer. Most trades sit between 25%-45%.',
  },
  avgJobValue: {
    title: 'What’s your average job value?',
    helper: 'Typical revenue from a single completed job — materials + labor.',
    cue: "Your typical job's total invoice value. For service trades (plumbing, electrical), often $200-$800. For renovations, $2k-$20k+.",
  },
};

interface CalculatorControlsProps {
  preset: TradePreset;
  values: SliderValues;
  onChange: (next: SliderValues) => void;
  onChangeTrade: () => void;
  /** When set, render only the single slider for that step (BD-2a multi-step
   *  flow). When null/undefined, render all three sliders (legacy). */
  step?: SliderStepKey;
  /** Hide the surrounding chrome (trade pill, change-trade button, footer).
   *  Used by the multi-step shell which renders its own header/footer chrome. */
  hideChrome?: boolean;
}

export default function CalculatorControls({
  preset,
  values,
  onChange,
  onChangeTrade,
  step = null,
  hideChrome = false,
}: CalculatorControlsProps) {
  const { sliderBounds } = preset;

  const isDefault =
    values.missedCallsPerWeek === preset.defaultMissedCallsPerWeek &&
    values.closeRatePercent === preset.defaultCloseRate &&
    values.avgJobValue === preset.avgJobValueMid;

  const handleReset = useCallback(() => {
    trackEvent("calculator_values_reset", { trade: preset.id });
    onChange({
      missedCallsPerWeek: preset.defaultMissedCallsPerWeek,
      closeRatePercent: preset.defaultCloseRate,
      avgJobValue: preset.avgJobValueMid,
    });
  }, [preset, onChange]);

  /** Render a single slider keyed by step name. Extracted so the parent can
   *  use this same component for either the legacy all-in-one card or the
   *  new per-step shell. */
  const renderSlider = (key: Exclude<SliderStepKey, null>) => {
    if (key === 'missedCalls') {
      return (
        <SliderField
          label="Missed calls per week"
          tooltip="The number of inbound calls your business doesn't answer each week — including after-hours, weekends, and busy periods when no one picks up."
          value={values.missedCallsPerWeek}
          min={sliderBounds.missedCalls.min}
          max={sliderBounds.missedCalls.max}
          step={sliderBounds.missedCalls.step}
          unitSuffix="calls"
          onChange={v => onChange({ ...values, missedCallsPerWeek: v })}
          accentColor={mkt.accent}
          trackBg={DARK_TRACK}
          labelColor={mkt.textMuted}
          minMaxColor={mkt.textFaint}
        />
      );
    }
    if (key === 'closeRate') {
      return (
        <SliderField
          label="Close rate"
          tooltip="The percentage of answered calls that turn into a booked job. Industry average for home services is 25–40%."
          value={values.closeRatePercent}
          min={sliderBounds.closeRate.min}
          max={sliderBounds.closeRate.max}
          step={sliderBounds.closeRate.step}
          unitSuffix=""
          formatValue={fmtPct}
          formatBound={fmtPct}
          onChange={v => onChange({ ...values, closeRatePercent: v })}
          accentColor={mkt.accent}
          trackBg={DARK_TRACK}
          labelColor={mkt.textMuted}
          minMaxColor={mkt.textFaint}
        />
      );
    }
    return (
      <SliderField
        label="Average job value"
        tooltip="The typical revenue from a single completed job, including materials and labor."
        value={values.avgJobValue}
        min={sliderBounds.avgJobValue.min}
        max={sliderBounds.avgJobValue.max}
        step={sliderBounds.avgJobValue.step}
        unitSuffix=""
        formatValue={fmtCurrency}
        formatBound={fmtCurrencyBound}
        showMinMaxLabels
        onChange={v => onChange({ ...values, avgJobValue: v })}
        accentColor={mkt.accent}
        trackBg={DARK_TRACK}
        labelColor={mkt.textMuted}
        minMaxColor={mkt.textFaint}
      />
    );
  };

  // ── Multi-step mode: one slider per screen, no surrounding card chrome.
  //    The parent shell owns the trade pill + sticky bottom action bar. ──
  if (step !== null && hideChrome) {
    const meta = SLIDER_STEP_META[step];
    return (
      <motion.div
        key={`slider-step-${step}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h3 style={{
          fontSize: 'clamp(18px, 3vw, 22px)',
          fontWeight: 700,
          color: mkt.onDark,
          letterSpacing: '-0.01em',
          lineHeight: 1.25,
          margin: '0 0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}>
          {/* BG-5 — per-slider help cue top-left. Renders the BD-3h
              step-content widget wireframe + a longer helper blurb. The
              span override neutralises the default `?` button's 6px
              left-margin so the cue sits flush-left and the gap to the
              title stays at the 2px ceiling. */}
          <span style={{ display: 'inline-flex', marginLeft: -6 }}>
            <InfoCue
              testid={`mcc-slider-${step}`}
              region="step-content"
              text={meta.cue}
              label={`More info about ${meta.title.toLowerCase()}`}
            />
          </span>
          {meta.title}
        </h3>
        <p style={{
          fontSize: 13,
          fontWeight: 500,
          color: mkt.textMuted,
          margin: '0 0 22px',
          lineHeight: 1.5,
        }}>
          {meta.helper}
        </p>
        {renderSlider(step)}
      </motion.div>
    );
  }

  // ── Legacy mode: all three sliders + chrome (kept for any caller that
  //    still wants the original single-card layout). ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
    >
      {/* Trade context + change button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: mkt.accentTint,
          border: `1px solid ${mkt.accent}33`,
          borderRadius: 100,
          padding: '5px 14px',
        }}>
          <SlidersHorizontal size={13} color={mkt.accent} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 600, color: mkt.accent }}>
            {preset.label}
          </span>
        </div>

        <button
          onClick={() => { trackEvent("calculator_trade_changed"); onChangeTrade(); }}
          aria-label="Change trade"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            fontWeight: 500,
            color: mkt.textFaint,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 12px',
            minHeight: 44,
            borderRadius: radius.sm,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = mkt.accent; }}
          onMouseLeave={e => { e.currentTarget.style.color = mkt.textFaint; }}
        >
          <ChevronLeft size={14} />
          Change trade
        </button>
      </div>

      {/* Slider card */}
      <div style={{
        background: mkt.cardBg,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: radius.xl,
        padding: 'clamp(20px, 4vw, 32px)',
        boxShadow: shadows.card,
      }}>
        {/* Context helper */}
        <p style={{
          fontSize: 13,
          fontWeight: 500,
          color: mkt.textMuted,
          margin: '0 0 18px',
          lineHeight: 1.4,
        }}>
          Using typical <span style={{ color: mkt.accent }}>{preset.label.toLowerCase()}</span> business ranges
        </p>

        {renderSlider('missedCalls')}
        {renderSlider('closeRate')}
        {renderSlider('avgJobValue')}

        {/* Footer: reset + assumption note */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingTop: 14,
          marginTop: 14,
          borderTop: `1px solid ${mkt.border}`,
        }}>
          <p style={{
            fontSize: 12,
            color: mkt.textFaint,
            lineHeight: 1.5,
            margin: 0,
            flex: 1,
          }}>
            Defaults based on industry averages. Adjust to match your business.
          </p>

          {!isDefault && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              onClick={handleReset}
              aria-label={`Reset to typical ${preset.label} values`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                color: mkt.textFaint,
                background: 'none',
                border: `1px solid ${mkt.border}`,
                borderRadius: radius.sm,
                padding: '8px 14px',
                minHeight: 44,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = mkt.accent;
                e.currentTarget.style.borderColor = mkt.accent + '44';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = mkt.textFaint;
                e.currentTarget.style.borderColor = mkt.border;
              }}
            >
              <RotateCcw size={11} />
              Reset
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
