import { useEffect, useState } from 'react';
import { eff, labelStyle, descStyle, inputStyle } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

export default function NumberInputQuestion({ question, value, onChange }: QuestionComponentProps) {
  // Keep the raw string locally so the customer can clear-and-retype
  // without the committed numeric value (and the live quote) snapping to 0.
  const [draft, setDraft] = useState<string>(value !== undefined ? String(value) : '');

  // Re-sync the draft when the committed value changes from the outside
  // (e.g. an answer reset), but not while the user is mid-edit on a value
  // that already parses to the same number.
  useEffect(() => {
    const committed = value !== undefined ? String(value) : '';
    const draftNum = draft.trim() === '' ? undefined : Number(draft);
    if (value !== draftNum) {
      setDraft(committed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number): number => {
    let out = n;
    if (typeof question.min === 'number' && out < question.min) out = question.min;
    if (typeof question.max === 'number' && out > question.max) out = question.max;
    return out;
  };

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === '') {
      // Blank → clear the answer so pricing falls back to its default
      // instead of being driven to 0.
      onChange(undefined);
      return;
    }
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      // Intermediate non-numeric state (e.g. "-", "."): keep the draft
      // visible but don't emit a corrupting value.
      onChange(undefined);
      return;
    }
    onChange(clamp(parsed));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = eff.buttonBorder;
    e.currentTarget.style.boxShadow = 'none';
    // On blur, normalise the visible draft to the clamped committed value.
    if (draft.trim() === '') return;
    const parsed = parseFloat(draft);
    if (Number.isNaN(parsed)) {
      setDraft('');
      onChange(undefined);
      return;
    }
    const clamped = clamp(parsed);
    setDraft(String(clamped));
    onChange(clamped);
  };

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
        inputMode="decimal"
        placeholder={question.placeholder || ''}
        value={draft}
        min={question.min}
        max={question.max}
        step={question.step}
        aria-label={question.label}
        onChange={(e) => handleChange(e.target.value)}
        style={inputStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
        onBlur={handleBlur}
      />
    </div>
  );
}
