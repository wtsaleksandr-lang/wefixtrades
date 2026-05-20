// CalculationsPanel — Build > Calculations section (Wave H3).
//
// Owns the list of calculations rendered as <CalculationRow/>s. Add / remove /
// reorder / edit all flow through `onChange(nextCalcs)`. The parent
// (`BuildTab`) hands the updated array back up to `WizardShell`, which
// re-renders the preview through `PreviewPane`.
//
// Each calculation's formula editor can reference any field AND any
// calculation defined ABOVE it — that mirrors the runtime `runCalculations`
// engine which evaluates calcs in order.

import { useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateCalculation, TemplateField } from '@shared/templatePresets';
import CalculationRow from './CalculationRow';
import InfoCue from './InfoCue';

const p = platformTheme;

interface Props {
  calculations: TemplateCalculation[];
  fields: TemplateField[];
  onChange: (next: TemplateCalculation[]) => void;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Default calc appended when the user clicks "Add calculation". */
function makeBlankCalc(existing: TemplateCalculation[]): TemplateCalculation {
  // Pick a non-colliding default name.
  const base = 'Subtotal';
  let name = base;
  let n = 2;
  const taken = new Set(existing.map((c) => c.name.toLowerCase()));
  while (taken.has(name.toLowerCase())) name = `${base} ${n++}`;
  return {
    id: uid('calc'),
    name,
    formula: '',
    format: 'number',
  };
}

export default function CalculationsPanel({ calculations, fields, onChange }: Props) {
  const isEmpty = calculations.length === 0;
  // Track which row was JUST added so we can auto-expand it on first render.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  // ID-prefix counter so we don't re-trigger autofocus on later re-renders.
  const seenRef = useRef<Set<string>>(new Set());

  const handleAdd = () => {
    const next = makeBlankCalc(calculations);
    setJustAddedId(next.id);
    seenRef.current.add(next.id);
    onChange([...calculations, next]);
  };

  const handleRowChange = (idx: number, next: TemplateCalculation) => {
    const arr = [...calculations];
    arr[idx] = next;
    onChange(arr);
  };

  const handleRemove = (idx: number) => {
    const arr = calculations.filter((_, i) => i !== idx);
    onChange(arr);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= calculations.length) return;
    const arr = [...calculations];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange(arr);
  };

  return (
    <section
      className="qq-calcs-panel"
      data-testid="editor-calculations-panel"
      aria-label="Calculator calculations"
    >
      <header className="qq-calcs-header">
        <div>
          <h3 className="qq-calcs-title">
            Calculations
            <InfoCue
              testid="calcs-title"
              text="Formulas that turn fields into a price. Reference fields with [Field name] and earlier calcs with [Calc name]."
            />
          </h3>
        </div>
        {!isEmpty && (
          <button
            type="button"
            className="qq-calcs-add"
            onClick={handleAdd}
            data-testid="add-calculation-trigger"
          >
            <span aria-hidden="true">+</span>
            <span>Add calculation</span>
          </button>
        )}
      </header>

      {isEmpty ? (
        <div className="qq-calcs-empty" data-testid="editor-calculations-empty">
          <div className="qq-calcs-empty-illus" aria-hidden="true">∑</div>
          <p className="qq-calcs-empty-title">
            No calculations yet
            <InfoCue
              testid="calcs-empty"
              text="Add your first calculation to turn the visitor's inputs into a price. You can use math operators, functions like ROUND or IF, and reference any field from above."
            />
          </p>
          <button
            type="button"
            className="qq-calcs-add is-emphasis"
            onClick={handleAdd}
            data-testid="add-calculation-trigger-empty"
          >
            <span aria-hidden="true">+</span>
            <span>Add calculation</span>
          </button>
        </div>
      ) : (
        <SortableContext
          items={calculations.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="qq-calcs-list" data-testid="editor-calculations-list">
            {calculations.map((c, i) => (
              <li key={c.id}>
                <CalculationRow
                  calc={c}
                  index={i}
                  total={calculations.length}
                  fields={fields}
                  precedingCalcs={calculations.slice(0, i)}
                  onChange={(next) => handleRowChange(i, next)}
                  onRemove={() => handleRemove(i)}
                  onMoveUp={() => handleMove(i, -1)}
                  onMoveDown={() => handleMove(i, 1)}
                  defaultExpanded={c.id === justAddedId}
                />
              </li>
            ))}
          </ol>
        </SortableContext>
      )}

      <style>{`
        .qq-calcs-panel {
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-calcs-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px;
        }
        .qq-calcs-title {
          margin: 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading}; letter-spacing: -0.005em;
        }
        .qq-calcs-sub {
          margin: 3px 0 0; font-size: 11.5px; color: ${p.colors.subtle};
          line-height: 1.6;
        }
        .qq-calcs-helptoken {
          display: inline-block; margin: 0 3px;
          padding: 0 5px; border-radius: 4px;
          font-size: 10.5px; font-weight: 700;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        }
        .qq-calcs-helptoken--field {
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-calcs-helptoken--calc {
          background: #E6F7F1; color: #0E8a5f;
        }
        .qq-calcs-add {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 8px;
          font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.heading};
          border: 1px dashed ${p.colors.border};
          transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
          flex-shrink: 0;
        }
        .qq-calcs-add:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
          background: ${p.colors.accentLighter};
        }
        .qq-calcs-add.is-emphasis {
          padding: 10px 16px; font-size: 13px;
          background: ${p.colors.accent}; color: #fff;
          border: 1px solid ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-calcs-add.is-emphasis:hover {
          background: ${p.colors.accentDark};
          border-color: ${p.colors.accentDark};
          color: #fff;
          box-shadow: ${p.shadows.buttonHover};
        }
        .qq-calcs-list {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-calcs-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 28px 18px; text-align: center;
          background: ${p.colors.surfaceRaised};
          border: 1px dashed ${p.colors.border}; border-radius: 12px;
        }
        .qq-calcs-empty-illus {
          width: 46px; height: 46px; border-radius: 50%;
          background: #E6F7F1; color: #0E8a5f;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700;
        }
        .qq-calcs-empty-title {
          margin: 4px 0 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-calcs-empty-sub {
          margin: 0 0 10px; max-width: 360px;
          font-size: 12.5px; color: ${p.colors.muted}; line-height: 1.55;
        }
      `}</style>
    </section>
  );
}
