import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function TextInputQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div className="space-y-2">
      <Label>{question.label}</Label>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <Input
        type="text"
        placeholder={question.placeholder || ''}
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
