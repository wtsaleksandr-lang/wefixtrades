import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { eff, labelStyle, descStyle, optionRowStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function RadioGroupQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <RadioGroup value={strValue} onValueChange={(v) => onChange(v)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(question.options || []).map((opt) => {
            const isActive = strValue === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  ...optionRowStyle,
                  borderColor: isActive ? eff.buttonBg : eff.buttonBorder,
                  background: isActive ? eff.bgSecondary : '#fff',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = eff.textBody; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = eff.buttonBorder; }}
              >
                <RadioGroupItem value={opt.value} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: eff.text }}>{opt.label}</span>
                  {opt.description && (
                    <span style={{ marginLeft: '8px', fontSize: '13px', color: eff.textBody }}>{opt.description}</span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </RadioGroup>
    </div>
  );
}
