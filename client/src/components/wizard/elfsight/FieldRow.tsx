// FieldRow — one row in the Build > Fields list.
//
// Collapsed row shows: type icon · inline label · up/down/remove buttons + a
// chevron to expand. Expanded row reveals a type-specific editor:
//   - slider / number  → label, default, min, max, step
//   - select / radio / image_choice → label + options list (add/remove/move)
//   - heading → label only
//
// Edits propagate via `onChange(updatedField)`; the parent owns the array.

import { useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateOption } from '@shared/templatePresets';
import { FIELD_TYPE_TO_PUBLIC } from './types';

const p = platformTheme;

interface Props {
  field: TemplateField;
  index: number;
  total: number;
  onChange: (next: TemplateField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function optionIdFromLabel(label: string, fallback: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return base || fallback;
}

function newOption(prev: TemplateOption[]): TemplateOption {
  const n = prev.length + 1;
  return { id: `option_${n}_${Date.now().toString(36).slice(-4)}`, label: `Option ${n}`, value: 0 };
}

const TYPE_ICON: Record<TemplateField['type'], string> = {
  slider: '⇋',
  number: '#',
  select: '▾',
  radio: '◉',
  image_choice: '◧',
  heading: 'T',
  multi_select: '☷',
  toggle: '◐',
  text: 'A',
};

const TYPE_LABEL: Record<TemplateField['type'], string> = {
  slider: 'Slider',
  number: 'Number',
  select: 'Dropdown',
  radio: 'Choice',
  image_choice: 'Image choice',
  heading: 'Heading',
  multi_select: 'Multi-select',
  toggle: 'Toggle',
  text: 'Text',
};

export default function FieldRow({
  field, index, total, onChange, onRemove, onMoveUp, onMoveDown,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const supportsOptions = field.type === 'select' || field.type === 'radio' || field.type === 'image_choice';
  const supportsNumeric = field.type === 'slider' || field.type === 'number';
  const publicType = FIELD_TYPE_TO_PUBLIC[field.type] ?? field.type;

  const update = (patch: Partial<TemplateField>) => onChange({ ...field, ...patch });

  const updateOption = (id: string, patch: Partial<TemplateOption>) => {
    update({
      options: (field.options || []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  };
  const addOption = () => update({ options: [...(field.options || []), newOption(field.options || [])] });
  const removeOption = (id: string) => update({ options: (field.options || []).filter((o) => o.id !== id) });
  const moveOption = (id: string, dir: -1 | 1) => {
    const arr = [...(field.options || [])];
    const i = arr.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ options: arr });
  };

  return (
    <div
      className={`qq-field-row${expanded ? ' is-expanded' : ''}`}
      data-testid={`field-row-${field.id}`}
      data-field-type={field.type}
    >
      <div className="qq-field-row-head">
        <button
          type="button"
          className="qq-field-row-toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${field.label}`}
          data-testid={`field-row-toggle-${field.id}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="qq-field-type-badge" data-testid={`field-row-type-${field.id}`} aria-label={TYPE_LABEL[field.type]}>
            <span aria-hidden="true">{TYPE_ICON[field.type] ?? '?'}</span>
          </span>
          <span className="qq-field-row-label" data-testid={`field-row-label-${field.id}`}>
            {field.label || <em style={{ color: p.colors.subtle }}>Untitled {publicType}</em>}
          </span>
          <span className="qq-field-row-typename">{TYPE_LABEL[field.type]}</span>
        </button>

        <div className="qq-field-row-actions">
          <button
            type="button"
            className="qq-field-row-iconbtn"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            data-testid={`field-row-up-${field.id}`}
          >▲</button>
          <button
            type="button"
            className="qq-field-row-iconbtn"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            data-testid={`field-row-down-${field.id}`}
          >▼</button>
          {!confirmRemove ? (
            <button
              type="button"
              className="qq-field-row-iconbtn is-danger"
              onClick={() => setConfirmRemove(true)}
              aria-label="Remove field"
              data-testid={`field-row-remove-${field.id}`}
            >×</button>
          ) : (
            <span className="qq-field-row-confirm">
              <button
                type="button"
                className="qq-field-row-iconbtn is-danger-solid"
                onClick={onRemove}
                data-testid={`field-row-remove-confirm-${field.id}`}
              >Remove</button>
              <button
                type="button"
                className="qq-field-row-iconbtn"
                onClick={() => setConfirmRemove(false)}
                data-testid={`field-row-remove-cancel-${field.id}`}
                aria-label="Cancel remove"
              >↶</button>
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="qq-field-row-body" data-testid={`field-row-body-${field.id}`}>
          <Label>Label</Label>
          <input
            type="text"
            className="qq-field-input"
            value={field.label}
            onChange={(e) => update({ label: e.target.value })}
            data-testid={`field-row-input-label-${field.id}`}
          />

          {supportsNumeric && (
            <>
              <div className="qq-field-grid-3">
                <div>
                  <Label>Min</Label>
                  <input
                    type="number"
                    className="qq-field-input"
                    value={field.min ?? 0}
                    onChange={(e) => update({ min: Number(e.target.value) })}
                    data-testid={`field-row-input-min-${field.id}`}
                  />
                </div>
                <div>
                  <Label>Max</Label>
                  <input
                    type="number"
                    className="qq-field-input"
                    value={field.max ?? 100}
                    onChange={(e) => update({ max: Number(e.target.value) })}
                    data-testid={`field-row-input-max-${field.id}`}
                  />
                </div>
                <div>
                  <Label>Step</Label>
                  <input
                    type="number"
                    className="qq-field-input"
                    value={field.step ?? 1}
                    onChange={(e) => update({ step: Number(e.target.value) })}
                    data-testid={`field-row-input-step-${field.id}`}
                  />
                </div>
              </div>
              <Label>Default</Label>
              <input
                type="number"
                className="qq-field-input"
                value={field.default_value ?? 0}
                onChange={(e) => update({ default_value: Number(e.target.value) })}
                data-testid={`field-row-input-default-${field.id}`}
              />
            </>
          )}

          {supportsOptions && (
            <div className="qq-field-options">
              <Label>Options</Label>
              <div className="qq-field-options-list">
                {(field.options || []).map((o, i) => (
                  <div key={o.id} className="qq-field-option-row" data-testid={`field-row-option-${field.id}-${o.id}`}>
                    <input
                      type="text"
                      className="qq-field-input qq-field-option-label"
                      value={o.label}
                      onChange={(e) => {
                        const nextLabel = e.target.value;
                        // Keep id stable but refresh it only if it was clearly auto-derived.
                        const wasAuto = o.id === optionIdFromLabel(o.label, o.id);
                        updateOption(o.id, {
                          label: nextLabel,
                          ...(wasAuto ? { id: optionIdFromLabel(nextLabel, o.id) } : {}),
                        });
                      }}
                      placeholder="Label"
                      data-testid={`field-row-option-label-${field.id}-${i}`}
                    />
                    <input
                      type="number"
                      className="qq-field-input qq-field-option-value"
                      value={o.value}
                      onChange={(e) => updateOption(o.id, { value: Number(e.target.value) })}
                      placeholder="Value"
                      data-testid={`field-row-option-value-${field.id}-${i}`}
                    />
                    <button
                      type="button"
                      className="qq-field-row-iconbtn"
                      onClick={() => moveOption(o.id, -1)}
                      disabled={i === 0}
                      aria-label="Move option up"
                      data-testid={`field-row-option-up-${field.id}-${i}`}
                    >▲</button>
                    <button
                      type="button"
                      className="qq-field-row-iconbtn"
                      onClick={() => moveOption(o.id, 1)}
                      disabled={i === (field.options || []).length - 1}
                      aria-label="Move option down"
                      data-testid={`field-row-option-down-${field.id}-${i}`}
                    >▼</button>
                    <button
                      type="button"
                      className="qq-field-row-iconbtn is-danger"
                      onClick={() => removeOption(o.id)}
                      aria-label="Remove option"
                      data-testid={`field-row-option-remove-${field.id}-${i}`}
                    >×</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="qq-field-add-option"
                onClick={addOption}
                data-testid={`field-row-add-option-${field.id}`}
              >+ Add option</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .qq-field-row {
          border: 1px solid ${p.colors.borderLight}; border-radius: 10px;
          background: #fff;
          transition: box-shadow 0.12s ease, border-color 0.12s ease;
        }
        .qq-field-row.is-expanded {
          border-color: ${p.colors.accent};
          box-shadow: ${p.shadows.selected};
        }
        .qq-field-row-head {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
        }
        .qq-field-row-toggle {
          flex: 1; min-width: 0;
          display: flex; align-items: center; gap: 9px;
          padding: 4px 2px; border: none; background: transparent;
          font: inherit; cursor: pointer; text-align: left;
        }
        .qq-field-type-badge {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
        }
        .qq-field-row-label {
          font-size: 13px; font-weight: 600; color: ${p.colors.heading};
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          flex: 1; min-width: 0;
        }
        .qq-field-row-typename {
          font-size: 11px; font-weight: 600; color: ${p.colors.subtle};
          text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
        }
        .qq-field-row-actions {
          display: flex; align-items: center; gap: 4px; flex-shrink: 0;
        }
        .qq-field-row-iconbtn {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 26px; height: 26px; padding: 0 6px; border-radius: 6px;
          font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.muted};
          border: 1px solid ${p.colors.borderLight};
          transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        }
        .qq-field-row-iconbtn:hover:not(:disabled) {
          background: ${p.colors.surfaceRaised}; color: ${p.colors.heading};
          border-color: ${p.colors.border};
        }
        .qq-field-row-iconbtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .qq-field-row-iconbtn.is-danger:hover:not(:disabled) {
          background: ${p.colors.dangerLight}; color: ${p.colors.danger};
          border-color: ${p.colors.danger};
        }
        .qq-field-row-iconbtn.is-danger-solid {
          background: ${p.colors.danger}; color: #fff; border-color: ${p.colors.danger};
          padding: 0 10px; font-size: 11.5px;
        }
        .qq-field-row-confirm {
          display: inline-flex; align-items: center; gap: 4px;
        }
        .qq-field-row-body {
          padding: 4px 12px 14px; display: flex; flex-direction: column; gap: 8px;
          border-top: 1px solid ${p.colors.borderLight};
        }
        .qq-field-input {
          width: 100%; padding: 7px 10px; box-sizing: border-box;
          font: inherit; font-size: 12.5px; color: ${p.colors.body};
          background: #fff; border: 1px solid ${p.colors.border};
          border-radius: 7px; outline: none;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-field-input:focus {
          border-color: ${p.colors.accent}; box-shadow: ${p.shadows.focus};
        }
        .qq-field-grid-3 {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
        }
        .qq-field-options-list {
          display: flex; flex-direction: column; gap: 5px;
        }
        .qq-field-option-row {
          display: grid; gap: 5px; align-items: center;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 0.8fr) auto auto auto;
        }
        .qq-field-add-option {
          align-self: flex-start; padding: 6px 10px; border-radius: 7px;
          font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          border: 1px dashed ${p.colors.accent};
          transition: background 0.1s ease;
        }
        .qq-field-add-option:hover { background: ${p.colors.accentLight}; }
      `}</style>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: platformTheme.colors.heading,
      letterSpacing: '0.02em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}
