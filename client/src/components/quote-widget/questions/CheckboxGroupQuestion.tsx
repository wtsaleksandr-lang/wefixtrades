import { Checkbox } from '@/components/ui/checkbox';
import { eff, labelStyle, descStyle, optionRowStyle } from '../designTokens';
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
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(question.options || []).map((opt) => {
          const isChecked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              style={{
                ...optionRowStyle,
                borderColor: isChecked ? eff.buttonBg : eff.buttonBorder,
                background: isChecked ? eff.bgSecondary : '#fff',
              }}
              onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.borderColor = eff.textBody; }}
              onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.borderColor = eff.buttonBorder; }}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(opt.value, !!checked)}
                className="h-5 w-5 rounded border-[#d5e1e7] data-[state=checked]:bg-[#394247] data-[state=checked]:border-[#394247] data-[state=checked]:text-[#e4edf1] focus-visible:ring-[#d5e1e7]"
              />
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
    </div>
  );
}
