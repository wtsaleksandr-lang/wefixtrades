import { eff, labelStyle, descStyle, inputStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function TextInputQuestion({ question, value, onChange }: QuestionComponentProps) {
  const strValue = value !== undefined ? String(value) : '';

  return (
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <input
        type="text"
        placeholder={question.placeholder || ''}
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
      />
    </div>
  );
}
