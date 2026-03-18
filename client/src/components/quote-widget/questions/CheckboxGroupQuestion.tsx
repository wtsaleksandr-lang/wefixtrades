import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function CheckboxGroupQuestion({ question, value, onChange }: QuestionComponentProps) {
  const selected: string[] = Array.isArray(value) ? value : [];

  function handleToggle(optionValue: string, checked: boolean) {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((v) => v !== optionValue);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <Label>{question.label}</Label>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="space-y-2">
        {(question.options || []).map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={(checked) => handleToggle(opt.value, !!checked)}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{opt.label}</span>
              {opt.description && (
                <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
