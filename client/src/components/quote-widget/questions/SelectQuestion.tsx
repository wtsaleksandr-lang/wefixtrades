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
          className="focus:ring-[#d5e1e7] focus:ring-offset-0 border-[#d5e1e7] hover:border-[#5f6f77]"
          style={{
            height: '48px',
            borderRadius: eff.radiusMd,
            fontSize: '15px',
            fontFamily: eff.font,
            color: eff.text,
            transition: 'border-color 0.15s',
          }}
        >
          <SelectValue placeholder={question.placeholder || 'Select an option'} />
        </SelectTrigger>
        <SelectContent
          className="border-[#d5e1e7]"
          style={{
            borderRadius: eff.radiusMd,
            fontFamily: eff.font,
          }}
        >
          {(question.options || []).map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="focus:bg-[#f5fcff]"
              style={{ fontSize: '14px', fontFamily: eff.font }}
            >
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
