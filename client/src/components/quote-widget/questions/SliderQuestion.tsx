import SliderField from '@/components/calculator/SliderField';
import type { QuestionComponentProps } from './QuestionProps';

export default function SliderQuestion({ question, value, onChange, accentColor }: QuestionComponentProps) {
  const numValue = typeof value === 'number' ? value : Number(value) || question.min || 1;

  return (
    <SliderField
      label={question.label}
      value={numValue}
      min={question.min ?? 1}
      max={question.max ?? 100}
      step={question.step ?? 1}
      unitSuffix={question.unit_suffix || question.unit || ''}
      onChange={(v) => onChange(v)}
      accentColor={accentColor}
    />
  );
}
