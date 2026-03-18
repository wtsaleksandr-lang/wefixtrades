import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { eff, labelStyle, descStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function SelectQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <Select value={strValue} onValueChange={(v) => onChange(v)}>
        <SelectTrigger
          style={{
            height: '48px',
            borderRadius: eff.radiusMd,
            borderColor: eff.buttonBorder,
            fontSize: '15px',
            fontFamily: eff.font,
          }}
        >
          <SelectValue placeholder={question.placeholder || 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
          {(question.options || []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
              {opt.description && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: eff.textBody }}>{opt.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
