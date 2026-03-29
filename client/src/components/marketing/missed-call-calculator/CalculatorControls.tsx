import { motion } from 'framer-motion';
import { SlidersHorizontal, ChevronLeft } from 'lucide-react';
import { mkt, colors, radius, shadows } from '@/theme/tokens';
import SliderField from '@/components/calculator/SliderField';
import type { TradePreset } from '@/data/missedCallTradePresets';

const DARK_TRACK = 'rgba(255,255,255,0.08)';

export interface SliderValues {
  missedCallsPerWeek: number;
  closeRatePercent: number;
  avgJobValue: number;
}

interface CalculatorControlsProps {
  preset: TradePreset;
  values: SliderValues;
  onChange: (next: SliderValues) => void;
  onChangeTrade: () => void;
}

export default function CalculatorControls({
  preset,
  values,
  onChange,
  onChangeTrade,
}: CalculatorControlsProps) {
  const { sliderBounds } = preset;

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
          onClick={onChangeTrade}
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
            padding: '4px 8px',
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
        <SliderField
          label="Missed calls per week"
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

        <SliderField
          label="Close rate"
          value={values.closeRatePercent}
          min={sliderBounds.closeRate.min}
          max={sliderBounds.closeRate.max}
          step={sliderBounds.closeRate.step}
          unitSuffix="%"
          onChange={v => onChange({ ...values, closeRatePercent: v })}
          accentColor={mkt.accent}
          trackBg={DARK_TRACK}
          labelColor={mkt.textMuted}
          minMaxColor={mkt.textFaint}
        />

        <SliderField
          label="Average job value"
          value={values.avgJobValue}
          min={sliderBounds.avgJobValue.min}
          max={sliderBounds.avgJobValue.max}
          step={sliderBounds.avgJobValue.step}
          unitSuffix=""
          showMinMaxLabels
          onChange={v => onChange({ ...values, avgJobValue: v })}
          accentColor={mkt.accent}
          trackBg={DARK_TRACK}
          labelColor={mkt.textMuted}
          minMaxColor={mkt.textFaint}
        />

        {/* Assumption context */}
        <p style={{
          fontSize: 12,
          color: mkt.textFaint,
          lineHeight: 1.5,
          margin: '12px 0 0',
          paddingTop: 12,
          borderTop: `1px solid ${mkt.border}`,
        }}>
          Defaults are based on industry averages for {preset.label.toLowerCase()} businesses.
          Adjust sliders to match your experience.
        </p>
      </div>
    </motion.div>
  );
}
