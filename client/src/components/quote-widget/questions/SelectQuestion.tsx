import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function SelectQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div className="space-y-2">
      <Label>{question.label}</Label>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <Select value={strValue} onValueChange={(v) => onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder={question.placeholder || 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
          {(question.options || []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
              {opt.description && (
                <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
