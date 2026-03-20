import { Switch } from '@/components/ui/switch';
import { eff, optionRowStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function ToggleQuestion({ question, value, onChange }: QuestionComponentProps) {
  const boolValue = typeof value === 'boolean' ? value : value === 'true';

  return (
    <div
      style={{
        ...optionRowStyle,
        justifyContent: 'space-between',
      }}
    >
      <div>
        <span style={{ fontSize: '14px', fontWeight: 600, color: eff.text }}>{question.label}</span>
        {question.description && (
          <p style={{ fontSize: '13px', color: eff.textBody, margin: '4px 0 0', lineHeight: 1.4 }}>{question.description}</p>
        )}
      </div>
      <Switch
        checked={boolValue}
        onCheckedChange={(checked) => onChange(checked)}
        className="data-[state=checked]:bg-[#394247] data-[state=unchecked]:bg-[#d5e1e7] focus-visible:ring-[#d5e1e7]"
      />
    </div>
  );
}
