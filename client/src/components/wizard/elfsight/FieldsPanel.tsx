// FieldsPanel — Build > Fields section.
//
// Owns the list of fields rendered as <FieldRow/>s. Add/remove/reorder/edit
// all flow through `onChange(nextFields)`. The parent (`BuildTab`) hands the
// updated array back up to `WizardShell` which re-renders the preview.
//
// Wave I:
//  - Renders inside a SortableContext (id = DND_CONTAINERS.fields). The
//    enclosing DndContext lives in WizardShell so cross-section drags from
//    `AddFieldMenu` into the preview can route through a single onDragEnd.
//  - Up/Down arrow buttons remain as keyboard / a11y fallback (see FieldRow).

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateOption } from '@shared/templatePresets';
import AddFieldMenu from './AddFieldMenu';
import FieldRow from './FieldRow';
import { PUBLIC_TO_FIELD_TYPE, type PublicFieldType } from './types';

const p = platformTheme;

interface Props {
  fields: TemplateField[];
  onChange: (next: TemplateField[]) => void;
}

/* ── default-field factories per public type ──────────────────────────── */

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultOptions(): TemplateOption[] {
  return [
    { id: uid('opt'), label: 'Option 1', value: 0 },
    { id: uid('opt'), label: 'Option 2', value: 25 },
    { id: uid('opt'), label: 'Option 3', value: 50 },
  ];
}

export function makeField(publicType: PublicFieldType): TemplateField {
  const type = PUBLIC_TO_FIELD_TYPE[publicType];
  const id = uid(type);
  switch (publicType) {
    case 'slider':
      return { id, name: 'Quantity', label: 'Quantity', type: 'slider', min: 1, max: 100, step: 1, default_value: 1 };
    case 'number':
      return { id, name: 'Amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 1, default_value: 1 };
    case 'dropdown':
      return { id, name: 'Choice', label: 'Choose one', type: 'select', options: defaultOptions() };
    case 'choice':
      return { id, name: 'Choice', label: 'Pick one', type: 'radio', options: defaultOptions() };
    case 'imageChoice':
      return { id, name: 'Visual', label: 'Visual choice', type: 'image_choice', options: defaultOptions() };
    case 'heading':
      return { id, name: 'Section', label: 'Section heading', type: 'heading' };
  }
}

/* ── component ────────────────────────────────────────────────────────── */

export default function FieldsPanel({ fields, onChange }: Props) {
  const isEmpty = fields.length === 0;

  const handleAdd = (publicType: PublicFieldType) => {
    onChange([...fields, makeField(publicType)]);
  };

  const handleRowChange = (idx: number, next: TemplateField) => {
    const arr = [...fields];
    arr[idx] = next;
    onChange(arr);
  };

  const handleRemove = (idx: number) => {
    const arr = fields.filter((_, i) => i !== idx);
    onChange(arr);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const arr = [...fields];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange(arr);
  };

  return (
    <section
      className="qq-fields-panel"
      data-testid="editor-fields-panel"
      aria-label="Calculator fields"
    >
      <header className="qq-fields-header">
        <div>
          <h3 className="qq-fields-title">Fields</h3>
          <p className="qq-fields-sub">Inputs the visitor fills in. Edits update the preview live.</p>
        </div>
        {!isEmpty && <AddFieldMenu onPick={handleAdd} />}
      </header>

      {isEmpty ? (
        <div className="qq-fields-empty" data-testid="editor-fields-empty">
          <div className="qq-fields-empty-illus" aria-hidden="true">＋</div>
          <p className="qq-fields-empty-title">No fields yet</p>
          <p className="qq-fields-empty-sub">
            Add your first field to start building the calculator. You can mix
            sliders, dropdowns, image choices and more.
          </p>
          <AddFieldMenu onPick={handleAdd} emphasis />
        </div>
      ) : (
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="qq-fields-list" data-testid="editor-fields-list">
            {fields.map((f, i) => (
              <li key={f.id}>
                <FieldRow
                  field={f}
                  index={i}
                  total={fields.length}
                  onChange={(next) => handleRowChange(i, next)}
                  onRemove={() => handleRemove(i)}
                  onMoveUp={() => handleMove(i, -1)}
                  onMoveDown={() => handleMove(i, 1)}
                />
              </li>
            ))}
          </ol>
        </SortableContext>
      )}

      <style>{`
        .qq-fields-panel {
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-fields-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px;
        }
        .qq-fields-title {
          margin: 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading}; letter-spacing: -0.005em;
        }
        .qq-fields-sub {
          margin: 3px 0 0; font-size: 11.5px; color: ${p.colors.subtle};
          line-height: 1.5;
        }
        .qq-fields-list {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-fields-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 28px 18px; text-align: center;
          background: ${p.colors.surfaceRaised};
          border: 1px dashed ${p.colors.border}; border-radius: 12px;
        }
        .qq-fields-empty-illus {
          width: 46px; height: 46px; border-radius: 50%;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700;
        }
        .qq-fields-empty-title {
          margin: 4px 0 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-fields-empty-sub {
          margin: 0 0 10px; max-width: 320px;
          font-size: 12.5px; color: ${p.colors.muted}; line-height: 1.55;
        }
      `}</style>
    </section>
  );
}
