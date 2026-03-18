import { eff, labelStyle, descStyle, inputStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function NumberInputQuestion({ question, value, onChange }: QuestionComponentProps) {
  const numValue = value !== undefined ? String(value) : '';

  return (
    <div>
      <label style={labelStyle}>
        {question.label}
        {question.unit_suffix && (
          <span style={{ marginLeft: '4px', fontSize: '12px', fontWeight: 400, color: eff.textBody }}>({question.unit_suffix})</span>
        )}
      </label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <input
        type="number"
        placeholder={question.placeholder || ''}
        value={numValue}
        min={question.min}
        max={question.max}
        step={question.step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          onChange(isNaN(parsed) ? 0 : parsed);
        }}
        style={inputStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
      />
    </div>
  );
}
