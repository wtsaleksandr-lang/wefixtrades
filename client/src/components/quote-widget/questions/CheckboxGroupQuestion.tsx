import { Checkbox } from '@/components/ui/checkbox';
import { eff, labelStyle, descStyle, optionRowStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

// Wave W-LAYOUT — heuristic for the `options_layout: 'auto'` default.
// Inline (horizontal) makes sense when there are few options and each
// label is short enough to fit two-up on a typical widget container.
// 14 chars covers "Tax Incentives" (14) without spilling.
const MAX_INLINE_LABEL_LEN = 14;
const MAX_INLINE_OPTION_COUNT = 4;

export default function CheckboxGroupQuestion({ question, value, onChange }: QuestionComponentProps) {
  const selected: string[] = Array.isArray(value) ? value : [];

  function handleToggle(optionValue: string, checked: boolean) {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((v) => v !== optionValue);
    onChange(next);
  }

  // Wave W-LAYOUT — decide whether to lay options out horizontally.
  // `options_layout` defaults to 'auto' (see wizardSchema.ts); only
  // 'stack' forces the legacy vertical column.
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
      <div
        style={
          isInline
            ? { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }
            : { display: 'flex', flexDirection: 'column', gap: '8px' }
        }
      >
        {opts.map((opt) => {
          const isChecked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              style={{
                ...optionRowStyle,
                // Wave W-LAYOUT — when inline, each row shrinks to its content
                // rather than spanning full width; min 140px to keep a finger
                // target on mobile and avoid awkward narrow pill rows.
                ...(isInline ? { flex: '1 1 140px', minWidth: 140 } : {}),
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
