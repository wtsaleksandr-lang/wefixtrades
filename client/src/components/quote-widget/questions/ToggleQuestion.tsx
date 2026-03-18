import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { QuestionComponentProps } from './QuestionProps';

export default function ToggleQuestion({ question, value, onChange }: QuestionComponentProps) {
  const boolValue = typeof value === 'boolean' ? value : value === 'true';

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label>{question.label}</Label>
        {question.description && (
          <p className="text-sm text-muted-foreground">{question.description}</p>
        )}
      </div>
      <Switch
        checked={boolValue}
        onCheckedChange={(checked) => onChange(checked)}
      />
    </div>
  );
}
