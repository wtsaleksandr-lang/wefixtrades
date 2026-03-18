import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function RadioGroupQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div className="space-y-3">
      <Label>{question.label}</Label>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <RadioGroup value={strValue} onValueChange={(v) => onChange(v)}>
        {(question.options || []).map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value={opt.value} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{opt.label}</span>
              {opt.description && (
                <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
              )}
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
