import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function NumberInputQuestion({ question, value, onChange }: QuestionComponentProps) {
  const numValue = value !== undefined ? String(value) : '';

  return (
    <div className="space-y-2">
      <Label>
        {question.label}
        {question.unit_suffix && (
          <span className="ml-1 text-xs text-muted-foreground">({question.unit_suffix})</span>
        )}
      </Label>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <Input
        type="number"
        placeholder={question.placeholder || ''}
        value={numValue}
        min={question.min}
        max={question.max}
        step={question.step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          onChange(isNaN(parsed) ? 0 : parsed);
        }}
      />
    </div>
  );
}
