// CalculationRow — one row in the Build > Calculations list.
//
// Wave H3. Mirrors `FieldRow`'s collapsed/expanded interaction and two-step
// remove confirm so the panel feels coherent. Collapsed: name + format badge
// + up/down/remove. Expanded: editable name + format + FormulaEditor.
//
// Edits propagate via `onChange(updatedCalc)`; the parent (CalculationsPanel)
// owns the array. The formula editor uses `fields` and the calcs preceding
// THIS one as the autocomplete pool — that matches the runtime evaluator
// (`runCalculations` evaluates calcs in order, so a calc can only reference
// earlier calcs).

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateCalculation, TemplateField } from '@shared/templatePresets';
import FormulaEditor from './FormulaEditor';
import { DragHandleGlyph } from './dnd';
import { useSelection } from './selection';
import InfoCue from './InfoCue';

const p = platformTheme;

interface Props {
  calc: TemplateCalculation;
  index: number;
  total: number;
  /** All fields, in current order (used by the formula editor's insert menu). */
  fields: TemplateField[];
  /** Calcs defined ABOVE this row — available for reference. */
  precedingCalcs: TemplateCalculation[];
  onChange: (next: TemplateCalculation) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Force expansion on first mount for freshly-added rows. */
  defaultExpanded?: boolean;
}

const FORMAT_LABEL: Record<TemplateCalculation['format'], string> = {
  number:   'Number',
  currency: 'Currency',
  percent:  'Percent',
};

const FORMAT_ICON: Record<TemplateCalculation['format'], string> = {
  number:   '#',
  currency: '$',
  percent:  '%',
};

export default function CalculationRow({
  calc, index, total, fields, precedingCalcs,
  onChange, onRemove, onMoveUp, onMoveDown, defaultExpanded,
}: Props) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Wave J item 4 — hover outline mirror of FieldRow.
  const [hoverOutline, setHoverOutline] = useState(false);
  const selection = useSelection();
  const isSel = selection.isSelected({ kind: 'calc', id: calc.id });
  const registerSel = selection.registerNode({ kind: 'calc', id: calc.id }, 'pane');

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: calc.id });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : 'auto',
  };

  const update = (patch: Partial<TemplateCalculation>) => onChange({ ...calc, ...patch });

  return (
    <div
      ref={(el) => { setNodeRef(el); registerSel(el); }}
      style={dragStyle}
      className={`qq-calc-row${expanded ? ' is-expanded' : ''}${isSel ? ' is-selected' : ''}`}
      data-testid={`calc-row-${calc.id}`}
      data-calc-row=""
      data-hover-outline={hoverOutline ? 'true' : 'false'}
      onMouseEnter={() => setHoverOutline(true)}
      onMouseLeave={() => setHoverOutline(false)}
      {...(isSel ? { 'data-testid-state': 'selected-in-pane', 'data-selected-in-pane': '' } : {})}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button, input, select, textarea, [data-no-select]')) return;
        selection.select({ kind: 'calc', id: calc.id });
      }}
    >
      <div className="qq-calc-row-head">
        <button
          type="button"
          className="qq-calc-row-handle"
          aria-label={`Drag to reorder ${calc.name}`}
          data-testid={`calc-row-handle-${calc.id}`}
          data-no-select=""
          {...attributes}
          {...listeners}
        >
          <DragHandleGlyph />
        </button>
        <button
          type="button"
          className="qq-calc-row-toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${calc.name}`}
          data-testid={`calc-row-toggle-${calc.id}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <span
            className="qq-calc-row-badge"
            data-testid={`calc-row-format-${calc.id}`}
            aria-label={FORMAT_LABEL[calc.format]}
          >
            <span aria-hidden="true">{FORMAT_ICON[calc.format]}</span>
          </span>
          <span className="qq-calc-row-name" data-testid={`calc-row-name-${calc.id}`}>
            {calc.name || <em style={{ color: p.colors.subtle }}>Untitled calculation</em>}
          </span>
          <span className="qq-calc-row-format">{FORMAT_LABEL[calc.format]}</span>
        </button>
        <div className="qq-calc-row-actions">
          <button
            type="button"
            className="qq-calc-row-iconbtn"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move calculation up"
            data-testid={`calc-row-up-${calc.id}`}
          >▲</button>
          <button
            type="button"
            className="qq-calc-row-iconbtn"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move calculation down"
            data-testid={`calc-row-down-${calc.id}`}
          >▼</button>
          {!confirmRemove ? (
            <button
              type="button"
              className="qq-calc-row-iconbtn is-danger"
              onClick={() => setConfirmRemove(true)}
              aria-label="Remove calculation"
              data-testid={`calc-row-remove-${calc.id}`}
            >×</button>
          ) : (
            <span className="qq-calc-row-confirm">
              <button
                type="button"
                className="qq-calc-row-iconbtn is-danger-solid"
                onClick={onRemove}
                data-testid={`calc-row-remove-confirm-${calc.id}`}
              >Remove</button>
              <button
                type="button"
                className="qq-calc-row-iconbtn"
                onClick={() => setConfirmRemove(false)}
                aria-label="Cancel remove"
                data-testid={`calc-row-remove-cancel-${calc.id}`}
              >↶</button>
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="qq-calc-row-body" data-testid={`calc-row-body-${calc.id}`}>
          {/* Wave X #1/#3 — Format selector hidden. The dropdown sat next
              to Name and showed "Currency" as its selected value, which
              read like a leftover prefilled string. Format defaults to
              'currency' on new calcs (set at creation time), which is the
              right answer for ~95% of calculator rows; the few percent /
              count cases will be inferred from the formula in a follow-up.
              The format field itself stays on the calc shape — only the
              UI control is removed. */}
          <div>
            <Label>Name</Label>
            <input
              type="text"
              className="qq-calc-input"
              value={calc.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. Subtotal"
              data-testid={`calc-row-input-name-${calc.id}`}
            />
          </div>

          <FormulaEditor
            calcId={calc.id}
            value={calc.formula}
            onChange={(next) => update({ formula: next })}
            fields={fields}
            precedingCalcs={precedingCalcs}
            autoFocus={defaultExpanded}
          />

          {/* Wave H4 — Elfsight-style display controls. All optional; default
              behaviour is preserved when nothing is touched. */}
          <div className="qq-calc-display" data-testid={`calc-row-display-${calc.id}`}>
            <div className="qq-calc-display-row">
              <Label
                info="Primary makes this calculation the big headline price shown at the top of the result panel. Secondary renders it as a smaller breakdown row beneath the headline."
                infoTestid={`calc-row-resultmode-info-${calc.id}`}
              >Result mode</Label>
              <div
                className="qq-calc-seg"
                role="radiogroup"
                aria-label="Result mode"
                data-testid={`calc-row-resultmode-${calc.id}`}
              >
                {(['primary', 'secondary'] as const).map((mode) => {
                  // `undefined` defaults to 'secondary' for selection display.
                  const current = calc.resultMode ?? 'secondary';
                  const selected = current === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`qq-calc-seg-btn${selected ? ' is-active' : ''}`}
                      onClick={() => update({ resultMode: mode })}
                      data-testid={`calc-row-resultmode-${mode}-${calc.id}`}
                    >
                      {mode === 'primary' ? 'Primary' : 'Secondary'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="qq-calc-display-row">
              <Label
                info="Optional small subtitle shown beneath this calculation in the result panel. Use it for tax notes, validity windows, or fine print."
                infoTestid={`calc-row-caption-info-${calc.id}`}
              >Caption</Label>
              <input
                type="text"
                className="qq-calc-input"
                value={calc.caption ?? ''}
                onChange={(e) => update({ caption: e.target.value })}
                placeholder="Optional supplementary line"
                data-testid={`calc-row-input-caption-${calc.id}`}
              />
            </div>

            <div className="qq-calc-display-toggles">
              <ToggleField
                testId={`calc-row-toggle-showinresults-${calc.id}`}
                label="Show in results"
                info="When off, this calculation still computes (and other formulas can reference it) but it doesn't appear in the customer-facing result panel. Useful for intermediate values you don't want to expose."
                // Undefined = shown (back-compat default).
                checked={calc.showInResults !== false}
                onChange={(next) => update({ showInResults: next })}
              />
              <ToggleField
                testId={`calc-row-toggle-divider-${calc.id}`}
                label="Divider above"
                info="Draws a thin horizontal line above this row in the breakdown. Use it to visually group related rows (e.g. add a divider above the first 'fee' row to separate subtotal items from adjustments)."
                checked={calc.divider === true}
                onChange={(next) => update({ divider: next })}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qq-calc-row {
          border: 1px solid ${p.colors.borderLight}; border-radius: 10px;
          background: #fff;
          transition: box-shadow 0.12s ease, border-color 0.12s ease;
        }
        .qq-calc-row.is-expanded {
          border-color: ${p.colors.accent};
          box-shadow: ${p.shadows.selected};
        }
        .qq-calc-row.is-selected {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-calc-row-head {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px;
        }
        /* Wave J item 4 — persistent drag-handle. Mirrors FieldRow. */
        .qq-calc-row-handle {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 26px; padding: 0; border-radius: 6px;
          border: 1px solid ${p.colors.borderLight};
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.muted};
          cursor: grab; touch-action: none;
          flex-shrink: 0;
          transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        }
        .qq-calc-row-handle:hover {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accent};
          border-color: ${p.colors.accent};
        }
        .qq-calc-row-handle:active { cursor: grabbing; }
        .qq-calc-row:hover,
        .qq-calc-row[data-hover-outline="true"] {
          border-color: rgba(13, 60, 252, 0.40);
        }
        .qq-calc-row-toggle {
          flex: 1; min-width: 0;
          display: flex; align-items: center; gap: 9px;
          padding: 4px 2px; border: none; background: transparent;
          font: inherit; cursor: pointer; text-align: left;
        }
        .qq-calc-row-badge {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          background: #E6F7F1; color: #0E8a5f;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
        }
        .qq-calc-row-name {
          font-size: 13px; font-weight: 600; color: ${p.colors.heading};
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          flex: 1; min-width: 0;
        }
        .qq-calc-row-format {
          font-size: 11px; font-weight: 600; color: ${p.colors.subtle};
          text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
        }
        .qq-calc-row-actions {
          display: flex; align-items: center; gap: 4px; flex-shrink: 0;
        }
        .qq-calc-row-iconbtn {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 26px; height: 26px; padding: 0 6px; border-radius: 6px;
          font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.muted};
          border: 1px solid ${p.colors.borderLight};
          transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        }
        .qq-calc-row-iconbtn:hover:not(:disabled) {
          background: ${p.colors.surfaceRaised}; color: ${p.colors.heading};
          border-color: ${p.colors.border};
        }
        .qq-calc-row-iconbtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .qq-calc-row-iconbtn.is-danger:hover:not(:disabled) {
          background: ${p.colors.dangerLight}; color: ${p.colors.danger};
          border-color: ${p.colors.danger};
        }
        .qq-calc-row-iconbtn.is-danger-solid {
          background: ${p.colors.danger}; color: #fff; border-color: ${p.colors.danger};
          padding: 0 10px; font-size: 11.5px;
        }
        .qq-calc-row-confirm {
          display: inline-flex; align-items: center; gap: 4px;
        }
        .qq-calc-row-body {
          padding: 4px 12px 14px; display: flex; flex-direction: column; gap: 10px;
          border-top: 1px solid ${p.colors.borderLight};
        }
        .qq-calc-grid-2 {
          display: grid; grid-template-columns: 1fr 140px; gap: 8px;
        }
        .qq-calc-input {
          width: 100%; padding: 7px 10px; box-sizing: border-box;
          font: inherit; font-size: 12.5px; color: ${p.colors.body};
          background: #fff; border: 1px solid ${p.colors.border};
          border-radius: 7px; outline: none;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-calc-input:focus {
          border-color: ${p.colors.accent}; box-shadow: ${p.shadows.focus};
        }

        /* H4 display controls */
        .qq-calc-display {
          display: flex; flex-direction: column; gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.borderLight};
        }
        .qq-calc-display-row {
          display: flex; flex-direction: column; gap: 4px;
        }
        .qq-calc-display-toggles {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .qq-calc-seg {
          display: inline-flex; align-items: stretch;
          padding: 3px; gap: 3px;
          background: #fff;
          border: 1px solid ${p.colors.border}; border-radius: 8px;
          width: fit-content;
        }
        .qq-calc-seg-btn {
          font: inherit; font-size: 11.5px; font-weight: 700;
          padding: 5px 12px; border-radius: 6px;
          border: none; background: transparent; color: ${p.colors.muted};
          cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
        }
        .qq-calc-seg-btn:hover:not(.is-active) {
          background: ${p.colors.surfaceRaised}; color: ${p.colors.heading};
        }
        .qq-calc-seg-btn.is-active {
          background: ${p.colors.accent}; color: #fff;
          box-shadow: ${p.shadows.button};
        }
        .qq-calc-toggle {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 8px;
          background: #fff; border: 1px solid ${p.colors.border};
          cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 600;
          color: ${p.colors.body};
          transition: background 0.1s ease, border-color 0.1s ease;
        }
        .qq-calc-toggle:hover { border-color: ${p.colors.accent}; }
        .qq-calc-toggle-swatch {
          width: 28px; height: 16px; border-radius: 8px; flex-shrink: 0;
          background: ${p.colors.border}; position: relative;
          transition: background 0.12s ease;
        }
        .qq-calc-toggle-swatch::after {
          content: ''; position: absolute;
          top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
          background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          transition: left 0.12s ease;
        }
        .qq-calc-toggle.is-on .qq-calc-toggle-swatch { background: ${p.colors.accent}; }
        .qq-calc-toggle.is-on .qq-calc-toggle-swatch::after { left: 14px; }
      `}</style>
    </div>
  );
}

function ToggleField({
  label, checked, onChange, testId, info, infoTestid,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId: string;
  /** Optional explanatory text shown via an inline `?` InfoCue. Wave AA #5. */
  info?: string;
  infoTestid?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <button
        type="button"
        className={`qq-calc-toggle${checked ? ' is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        data-testid={testId}
      >
        <span className="qq-calc-toggle-swatch" aria-hidden="true" />
        <span>{label}</span>
      </button>
      {info ? <InfoCue testid={infoTestid ?? testId + '-info'} text={info} /> : null}
    </span>
  );
}

function Label({
  children, info, infoTestid,
}: {
  children: React.ReactNode;
  /** Optional explanatory text shown via an inline `?` InfoCue. Wave AA #5. */
  info?: string;
  infoTestid?: string;
}) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: platformTheme.colors.heading,
      letterSpacing: '0.02em', textTransform: 'uppercase',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      marginBottom: 4,
    }}>
      {children}
      {info ? <InfoCue testid={infoTestid ?? 'calc-row-label'} text={info} /> : null}
    </span>
  );
}
