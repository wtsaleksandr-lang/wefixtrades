import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { eff, labelStyle, descStyle, optionRowStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

// Wave W-LAYOUT — match CheckboxGroupQuestion's inline-options heuristic.
const MAX_INLINE_LABEL_LEN = 14;
const MAX_INLINE_OPTION_COUNT = 4;

export default function RadioGroupQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  const opts = question.options || [];
  const layoutMode = (question as { options_layout?: 'auto' | 'inline' | 'stack' }).options_layout ?? 'auto';
  const autoInline =
    opts.length > 0 &&
    opts.length <= MAX_INLINE_OPTION_COUNT &&
    opts.every((o) => (o.label?.length ?? 0) <= MAX_INLINE_LABEL_LEN);
  const isInline = layoutMode === 'inline' || (layoutMode === 'auto' && autoInline);

  return (
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <RadioGroup value={strValue} onValueChange={(v) => onChange(v)}>
        <div
          style={
            isInline
              ? { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }
              : { display: 'flex', flexDirection: 'column', gap: '8px' }
          }
        >
          {opts.map((opt) => {
            const isActive = strValue === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  ...optionRowStyle,
                  ...(isInline ? { flex: '1 1 140px', minWidth: 140 } : {}),
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
