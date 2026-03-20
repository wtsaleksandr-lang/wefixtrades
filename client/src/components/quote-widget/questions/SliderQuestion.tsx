import SliderField from '@/components/calculator/SliderField';
import { eff } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function SliderQuestion({ question, value, onChange, accentColor }: QuestionComponentProps) {
  const numValue = typeof value === 'number' ? value : Number(value) || question.min || 1;

  return (
    <div
      className="eff-slider-wrap"
      style={{
        // Scoped CSS overrides for SliderField's inline styles.
        // SliderField uses inline style so we use CSS custom properties
        // and a wrapper to harmonize fonts/colors without modifying SliderField.
        fontFamily: eff.font,
      }}
    >
      <style>{`
        .eff-slider-wrap > div { margin-bottom: 0 !important; }
        .eff-slider-wrap span[style*="font-size: 13px"] {
          font-family: ${eff.font} !important;
          color: ${eff.text} !important;
          font-size: 14px !important;
        }
        .eff-slider-wrap span[style*="font-size: 15px"] {
          font-family: ${eff.fontMono} !important;
          border-radius: ${eff.radiusSm} !important;
        }
        .eff-slider-wrap span[style*="font-size: 11px"] {
          font-family: ${eff.fontMono} !important;
          color: ${eff.textBody} !important;
        }
      `}</style>
      <SliderField
        label={question.label}
        value={numValue}
        min={question.min ?? 1}
        max={question.max ?? 100}
        step={question.step ?? 1}
        unitSuffix={question.unit_suffix || question.unit || ''}
        onChange={(v) => onChange(v)}
        accentColor={eff.buttonBg}
      />
    </div>
  );
}
