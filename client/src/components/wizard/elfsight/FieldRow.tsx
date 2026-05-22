// FieldRow — one row in the Build > Fields list.
//
// Collapsed row shows: drag-handle · type icon · inline label · up/down/remove
// buttons + a chevron to expand. Expanded row reveals a type-specific editor:
//   - slider / number  → label, default, min, max, step
//   - select / radio / image_choice → label + options list (add/remove/move +
//     drag-and-drop reorder via @dnd-kit, with arrow-button fallbacks kept).
//   - heading → label only
//
// Edits propagate via `onChange(updatedField)`; the parent owns the array.
//
// Wave I:
//  - Drag handle (`field-row-handle-<id>`) wired via @dnd-kit's useSortable
//    (handled by FieldsPanel's SortableContext). Arrows kept as a11y fallback.
//  - Options list is its own sortable list (DndContext at FieldRow level so
//    it doesn't interfere with the outer Fields drag). Touch sensor enabled.
//  - Selection sync: tapping the row body or the type badge sets selection.

import { useRef, useState } from 'react';
import {
  DndContext, type DragEndEvent, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronUp, ChevronDown, X, CornerUpLeft } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateOption } from '@shared/templatePresets';
import { FIELD_TYPE_TO_PUBLIC } from './types';
import { useEditorDndSensors, DND_CONTAINERS, DragHandleGlyph } from './dnd';
import { useSelection } from './selection';
import FloatField from './FloatField';
import RichTextField from './RichTextField';

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

// BG-7 Item 3 — `optionIdFromLabel` was the auto-id heuristic used when a
// user typed into the option label `<input>`. Rich-text labels (compact
// RichTextField) can carry HTML markup that doesn't map cleanly onto a
// stable id, so we now keep the original id and let `newOption` mint a
// fresh uid for new entries. Helper kept around as a comment-only
// reference for the bisect history.
function _optionIdFromLabel_unused(label: string, fallback: string): string {
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
  // Wave J item 4 — exposes hover state as a data attribute so the spec can
  // assert "row gets a hover outline" without sniffing computed CSS.
  const [hoverOutline, setHoverOutline] = useState(false);
  const selection = useSelection();
  const isSel = selection.isSelected({ kind: 'field', id: field.id });
  const registerSel = selection.registerNode({ kind: 'field', id: field.id }, 'pane');

  // @dnd-kit sortable wiring — the SortableContext lives in FieldsPanel.
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: field.id });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : 'auto',
  };

  // BG-7 Item 5 — multi_select (the add-on items field type) now uses the
  // same options editor as select / radio / image_choice so owners can
  // edit add-on labels (rich-text) + add an optional description.
  const supportsOptions = field.type === 'select' || field.type === 'radio'
    || field.type === 'image_choice' || field.type === 'multi_select';
  // BG-7 Item 5 — only the multi_select editor surfaces the "description"
  // RichTextField (standard variant, full toolbar). Other option-bearing
  // fields keep the compact label-only row to stay dense.
  const supportsOptionDescription = field.type === 'multi_select';
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

  // Options sortable handler — local DndContext (own sensors) so the outer
  // Fields drag isn't disrupted while editing nested options.
  const optionSensors = useEditorDndSensors();
  const handleOptionsDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const arr = [...(field.options || [])];
    const oldIdx = arr.findIndex((o) => o.id === active.id);
    const newIdx = arr.findIndex((o) => o.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    update({ options: arrayMove(arr, oldIdx, newIdx) });
  };

  return (
    <div
      ref={(el) => { setNodeRef(el); registerSel(el); }}
      style={dragStyle}
      className={`qq-field-row${expanded ? ' is-expanded' : ''}${isSel ? ' is-selected' : ''}`}
      data-testid={`field-row-${field.id}`}
      data-field-type={field.type}
      data-hover-outline={hoverOutline ? 'true' : 'false'}
      onMouseEnter={() => setHoverOutline(true)}
      onMouseLeave={() => setHoverOutline(false)}
      {...(isSel ? { 'data-testid-state': 'selected-in-pane', 'data-selected-in-pane': '' } : {})}
      onClick={(e) => {
        // Only set selection when the user clicked the row chrome itself —
        // not when they hit a button or expanded body (which has its own
        // affordances). Lets users tap an empty stretch of the row to focus.
        const t = e.target as HTMLElement;
        if (t.closest('button, input, select, textarea, [data-no-select]')) return;
        selection.select({ kind: 'field', id: field.id });
      }}
    >
      <div className="qq-field-row-head">
        <button
          type="button"
          className="qq-field-row-handle"
          aria-label={`Drag to reorder ${field.label}`}
          data-testid={`field-row-handle-${field.id}`}
          data-no-select=""
          {...attributes}
          {...listeners}
        >
          <DragHandleGlyph />
        </button>
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
            className="qq-iconbtn qq-field-row-iconbtn"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            data-testid={`field-row-up-${field.id}`}
          >
            <ChevronUp aria-hidden="true" width={14} height={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="qq-iconbtn qq-field-row-iconbtn"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            data-testid={`field-row-down-${field.id}`}
          >
            <ChevronDown aria-hidden="true" width={14} height={14} strokeWidth={2} />
          </button>
          {!confirmRemove ? (
            <button
              type="button"
              className="qq-iconbtn qq-field-row-iconbtn is-danger"
              onClick={() => setConfirmRemove(true)}
              aria-label="Remove field"
              data-testid={`field-row-remove-${field.id}`}
            >
              <X aria-hidden="true" width={14} height={14} strokeWidth={2} />
            </button>
          ) : (
            <span className="qq-field-row-confirm">
              <button
                type="button"
                className="qq-iconbtn qq-field-row-iconbtn is-danger-solid"
                onClick={onRemove}
                data-testid={`field-row-remove-confirm-${field.id}`}
              >Remove</button>
              <button
                type="button"
                className="qq-iconbtn qq-field-row-iconbtn"
                onClick={() => setConfirmRemove(false)}
                data-testid={`field-row-remove-cancel-${field.id}`}
                aria-label="Cancel remove"
              >
                <CornerUpLeft aria-hidden="true" width={14} height={14} strokeWidth={2} />
              </button>
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="qq-field-row-body" data-testid={`field-row-body-${field.id}`}>
          {/* Wave L L1 — embedded floating labels. Each input title now sits
           * inside the field, not as a separate label above it.
           *
           * BF-11 — for `heading` fields the label is the entire section
           * divider text shown to customers, so it gets the full rich-text
           * editor (B/I/U, color, emoji, inline image). Other field types
           * keep the plain input because their label renders inside a
           * constrained `<label>` element where rich HTML can break layout
           * (line-height, vertical alignment with the inline control). */}
          {field.type === 'heading' ? (
            <RichTextField
              label="Label"
              htmlFor={`field-row-input-label-${field.id}`}
              value={field.label}
              onChange={(next) => update({ label: next })}
              placeholder="Click to add a heading"
              testid={`field-row-input-label-${field.id}`}
            />
          ) : (
            <FloatField label="Label" htmlFor={`field-row-input-label-${field.id}`}>
              <input
                id={`field-row-input-label-${field.id}`}
                type="text"
                className="premium-input qq-field-input"
                placeholder=" "
                value={field.label}
                onChange={(e) => update({ label: e.target.value })}
                data-testid={`field-row-input-label-${field.id}`}
              />
            </FloatField>
          )}

          {/* Wave W-LAYOUT — Width toggle.
              field.colSpan === 1   → half (one of two grid columns)
              field.colSpan === 2 / undefined → full (spans both)
              Picking "Full" sets colSpan to undefined (cleaner — no
              stored value when the field uses the default). The
              widget's grid (AdvancedCalculator data-colspan="1" / wizard
              MultiQuestionStep data-question-width="half") and the
              admin preview pane both honor this. Mobile (<=360px /
              <=480px) always collapses to one column regardless. */}
          <div className="qq-field-width" data-testid={`field-row-width-${field.id}`}>
            <span className="qq-field-width-label">Width</span>
            <div className="qq-field-width-segmented" role="group" aria-label="Field width">
              <button
                type="button"
                className={`qq-field-width-btn${field.colSpan === 1 ? ' is-active' : ''}`}
                aria-pressed={field.colSpan === 1}
                onClick={() => update({ colSpan: 1 })}
                data-testid={`field-row-width-half-${field.id}`}
              >
                ½
              </button>
              <button
                type="button"
                className={`qq-field-width-btn${field.colSpan !== 1 ? ' is-active' : ''}`}
                aria-pressed={field.colSpan !== 1}
                onClick={() => update({ colSpan: undefined })}
                data-testid={`field-row-width-full-${field.id}`}
              >
                Full
              </button>
            </div>
          </div>

          {supportsNumeric && (
            <>
              <div className="qq-field-grid-3">
                <FloatField label="Min" htmlFor={`field-row-input-min-${field.id}`}>
                  <input
                    id={`field-row-input-min-${field.id}`}
                    type="number"
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.min ?? 0}
                    onChange={(e) => update({ min: Number(e.target.value) })}
                    data-testid={`field-row-input-min-${field.id}`}
                  />
                </FloatField>
                <FloatField label="Max" htmlFor={`field-row-input-max-${field.id}`}>
                  <input
                    id={`field-row-input-max-${field.id}`}
                    type="number"
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.max ?? 100}
                    onChange={(e) => update({ max: Number(e.target.value) })}
                    data-testid={`field-row-input-max-${field.id}`}
                  />
                </FloatField>
                <FloatField label="Step" htmlFor={`field-row-input-step-${field.id}`}>
                  <input
                    id={`field-row-input-step-${field.id}`}
                    type="number"
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.step ?? 1}
                    onChange={(e) => update({ step: Number(e.target.value) })}
                    data-testid={`field-row-input-step-${field.id}`}
                  />
                </FloatField>
              </div>
              <FloatField label="Default" htmlFor={`field-row-input-default-${field.id}`}>
                <input
                  id={`field-row-input-default-${field.id}`}
                  type="number"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.default_value ?? 0}
                  onChange={(e) => update({ default_value: Number(e.target.value) })}
                  data-testid={`field-row-input-default-${field.id}`}
                />
              </FloatField>
            </>
          )}

          {supportsOptions && (
            <div className="qq-field-options" data-testid={`field-row-options-${field.id}`}>
              <Label>Options</Label>
              <DndContext
                sensors={optionSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleOptionsDragEnd}
                id={DND_CONTAINERS.fieldOptions(field.id)}
              >
                <SortableContext
                  items={(field.options || []).map((o) => o.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="qq-field-options-list">
                    {(field.options || []).map((o, i) => (
                      <SortableOptionRow
                        key={o.id}
                        fieldId={field.id}
                        option={o}
                        index={i}
                        total={(field.options || []).length}
                        imageMode={field.type === 'image_choice'}
                        descriptionMode={supportsOptionDescription}
                        onLabelChange={(label) => {
                          // BG-7 Item 3 — labels are now sanitized HTML
                          // (compact RichTextField). The auto-id heuristic
                          // (regenerate the option id from the label slug)
                          // is dropped because rich-text labels can contain
                          // HTML markup that doesn't map cleanly to an id.
                          // Existing options keep their id; new options
                          // generated via `newOption` already carry a
                          // unique uid.
                          updateOption(o.id, { label });
                        }}
                        onValueChange={(value) => updateOption(o.id, { value })}
                        onImageChange={(image) => updateOption(o.id, { image })}
                        onDescriptionChange={(description) =>
                          updateOption(o.id, { description })
                        }
                        onMoveUp={() => moveOption(o.id, -1)}
                        onMoveDown={() => moveOption(o.id, 1)}
                        onRemove={() => removeOption(o.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
        .qq-field-row.is-selected {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-field-row-head {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px;
        }
        /* Wave J item 4 — persistent drag-handle. Always visible (no
         * hover-only opacity), more contrasted base colour, and a tinted
         * background so mobile users can see it without hovering. */
        .qq-field-row-handle {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 26px; padding: 0; border-radius: 6px;
          border: 1px solid ${p.colors.borderLight};
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.muted};
          cursor: grab; touch-action: none;
          flex-shrink: 0;
          transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        }
        .qq-field-row-handle:hover {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accent};
          border-color: ${p.colors.accent};
        }
        .qq-field-row-handle:active { cursor: grabbing; }
        /* Wave J item 4 — subtle outlined border on row hover. */
        .qq-field-row:hover,
        .qq-field-row[data-hover-outline="true"] {
          border-color: rgba(13, 60, 252, 0.40);
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
        /* Premium-SaaS icon button (shared) — Linear / Stripe / Vercel
         * aesthetic. See full rules at the bottom of this style block.
         * The .qq-field-row-iconbtn modifier is retained for backwards-compat
         * (existing testids / DOM hooks) but the shared .qq-iconbtn class is
         * the source of truth for the look. */
        .qq-field-row-iconbtn.is-danger-solid {
          background: ${p.colors.danger}; color: #fff; border-color: ${p.colors.danger};
          padding: 0 10px; font-size: 11.5px;
          width: auto; min-width: 24px;
        }
        .qq-field-row-iconbtn.is-danger-solid:hover:not(:disabled) {
          background: ${p.colors.danger}; color: #fff; border-color: ${p.colors.danger};
        }
        .qq-field-row-confirm {
          display: inline-flex; align-items: center; gap: 4px;
        }
        /* Wave N — on narrow viewports, free horizontal space so long
         * labels like "Local Incentives" / "Professional installation"
         * don't ellipsis-clamp inside the row. We drop the redundant
         * trailing typename badge (the icon-badge already conveys the
         * field type), tighten the row padding, and shrink the action
         * iconbtns from 26 → 22 px. */
        @media (max-width: 480px) {
          .qq-field-row-head { padding: 7px 7px; gap: 4px; }
          .qq-field-row-handle { width: 18px; height: 24px; }
          .qq-field-row-toggle { gap: 6px; padding: 3px 0; }
          .qq-field-row-typename { display: none; }
          .qq-field-type-badge { width: 22px; height: 22px; font-size: 12px; }
          .qq-field-row-actions { gap: 2px; }
          .qq-iconbtn.qq-field-row-iconbtn { width: 22px; height: 22px; min-width: 22px; }
          .qq-field-row-iconbtn.is-danger-solid { padding: 0 8px; font-size: 10.5px; width: auto; }
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
        /* Wave W-LAYOUT — Width toggle (½ / Full). Sits inline as a row
           of its own under the Label field. Visually matches the
           SegmentedControl in SettingsTab but compressed for the dense
           Build > Fields panel. */
        .qq-field-width {
          display: flex; align-items: center; gap: 10px;
          padding: 2px 2px 0;
        }
        .qq-field-width-label {
          font-size: 11.5px; font-weight: 600; color: ${p.colors.subtle};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .qq-field-width-segmented {
          display: inline-flex; border: 1px solid ${p.colors.border};
          border-radius: 7px; overflow: hidden; background: #fff;
        }
        .qq-field-width-btn {
          padding: 5px 12px; border: none; background: transparent;
          font: inherit; font-size: 12px; font-weight: 600;
          color: ${p.colors.body}; cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
        }
        .qq-field-width-btn + .qq-field-width-btn {
          border-left: 1px solid ${p.colors.border};
        }
        .qq-field-width-btn:hover {
          background: ${p.colors.accentLighter};
        }
        /* BH-4 rule 4 — selected/active = subtle outline + 4% blue tint,
         * NEVER a bright fill that hides the text. Mirrors the daychip
         * pattern in SettingsTab. */
        .qq-field-width-btn.is-active {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accentDark};
          box-shadow: inset 0 0 0 1px ${p.colors.accent};
        }
        .qq-field-options-list {
          display: flex; flex-direction: column; gap: 5px;
        }
        .qq-field-option-row {
          display: grid; gap: 5px; align-items: center;
          grid-template-columns: 22px minmax(0, 1.6fr) minmax(0, 0.8fr) auto auto auto;
        }
        /* Wave W-R4 — image_choice options reserve a 32×32 thumbnail column
           between the drag handle and the label input. */
        .qq-field-option-row.is-image-mode {
          grid-template-columns: 22px 32px minmax(0, 1.6fr) minmax(0, 0.8fr) auto auto auto;
        }
        .qq-field-option-thumb {
          position: relative; width: 32px; height: 32px;
          padding: 0; border-radius: 6px; overflow: hidden;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.borderLight};
          cursor: pointer; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-field-option-thumb:hover {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-field-option-thumb img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .qq-field-option-thumb-empty {
          font-size: 16px; line-height: 1; color: ${p.colors.muted};
        }
        .qq-field-option-thumb-overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(15,23,42,0.55); color: #fff;
          font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0; transition: opacity 0.1s ease;
        }
        .qq-field-option-thumb:hover .qq-field-option-thumb-overlay,
        .qq-field-option-thumb:focus-visible .qq-field-option-thumb-overlay {
          opacity: 1;
        }
        .qq-field-option-error {
          grid-column: 1 / -1;
          font-size: 11px; font-weight: 600; color: ${p.colors.danger};
          padding: 2px 4px;
        }
        @media (max-width: 480px) {
          .qq-field-option-row.is-image-mode {
            grid-template-columns: 22px 32px minmax(0, 1fr) minmax(0, 0.7fr) auto auto auto;
          }
        }
        .qq-field-add-option {
          align-self: flex-start; padding: 6px 10px; border-radius: 7px;
          font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          border: 1px dashed ${p.colors.accent};
          transition: background 0.1s ease;
        }
        .qq-field-add-option:hover { background: ${p.colors.accentLight}; }

        /* ── Premium-SaaS icon button (shared)
         *
         * Mirror of the rules in CalculationRow's style block. Defined here
         * too so the look applies even when only FieldRow is mounted (e.g.
         * an option-only test render). When both mount, the rules collapse
         * — they're identical. See CalculationRow.tsx for the rationale. */
        .qq-iconbtn {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          color: ${p.colors.muted};
          cursor: pointer;
          padding: 0;
          font: inherit;
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 80ms ease;
        }
        .qq-iconbtn:hover:not(:disabled) {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.16);
          color: ${p.colors.heading};
        }
        .qq-iconbtn:active:not(:disabled) {
          background: rgba(13,60,252,0.08);
          border-color: #0d3cfc;
          color: #0d3cfc;
          transform: scale(0.96);
        }
        .qq-iconbtn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .qq-iconbtn.is-danger:hover:not(:disabled) {
          background: ${p.colors.dangerLight};
          color: ${p.colors.danger};
          border-color: ${p.colors.danger};
        }
        .qq-editor-shell[data-theme="light"] .qq-iconbtn,
        :root:not([data-theme="dark"]) .qq-iconbtn {
          border-color: rgba(0,0,0,0.08);
        }
        .qq-editor-shell[data-theme="light"] .qq-iconbtn:hover:not(:disabled),
        :root:not([data-theme="dark"]) .qq-iconbtn:hover:not(:disabled) {
          background: rgba(0,0,0,0.04);
          border-color: rgba(0,0,0,0.16);
        }
        .qq-iconbtn svg { display: block; }
      `}</style>
    </div>
  );
}

interface SortableOptionRowProps {
  fieldId: string;
  option: TemplateOption;
  index: number;
  total: number;
  /** Wave W-R4 — when true, render the per-option image upload column. */
  imageMode?: boolean;
  /**
   * BG-7 Item 5 — when true, render an additional standard-variant
   * RichTextField for the per-option description. Only set for
   * multi_select fields (the add-on items field type); the other option-
   * bearing fields keep the dense label-only row.
   */
  descriptionMode?: boolean;
  onLabelChange: (label: string) => void;
  onValueChange: (value: number) => void;
  onImageChange?: (image: string | undefined) => void;
  /** BG-7 Item 5 — propagate description edits when descriptionMode is on. */
  onDescriptionChange?: (description: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const OPTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap, same as logo upload.

function SortableOptionRow({
  fieldId, option: o, index: i, total, imageMode, descriptionMode,
  onLabelChange, onValueChange,
  onImageChange, onDescriptionChange, onMoveUp, onMoveDown, onRemove,
}: SortableOptionRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: o.id });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : 'auto',
  };

  const handleFile = (file: File | undefined) => {
    if (!file || !onImageChange) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image.');
      return;
    }
    if (file.size > OPTION_IMAGE_MAX_BYTES) {
      setUploadError('Image must be under 2 MB.');
      return;
    }
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') onImageChange(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`qq-field-option-row${imageMode ? ' is-image-mode' : ''}`}
      data-testid={`field-row-option-${fieldId}-${o.id}`}
    >
      <button
        type="button"
        className="qq-field-row-handle"
        aria-label="Drag to reorder option"
        data-testid={`field-row-option-handle-${fieldId}-${i}`}
        data-no-select=""
        {...attributes}
        {...listeners}
      >
        <DragHandleGlyph />
      </button>
      {imageMode && (
        <button
          type="button"
          className="qq-field-option-thumb"
          onClick={() => fileInputRef.current?.click()}
          aria-label={o.image ? 'Replace option image' : 'Upload option image'}
          data-testid={`field-row-option-image-${fieldId}-${i}`}
          data-has-image={o.image ? 'true' : 'false'}
        >
          {o.image
            ? <img src={o.image} alt="" />
            : <span className="qq-field-option-thumb-empty" aria-hidden="true">🏠</span>}
          <span className="qq-field-option-thumb-overlay" aria-hidden="true">
            {o.image ? 'Replace' : 'Upload'}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            data-testid={`field-row-option-image-input-${fieldId}-${i}`}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </button>
      )}
      {/* BG-7 Item 3 — option labels now flow through the compact
       *  RichTextField so owners can apply inline B/I/U/size/color/emoji
       *  formatting to each option (dropdown / radio / image_choice /
       *  multi_select). The compact variant is roughly half the height
       *  of the standard editor so the option row stays dense. */}
      <div className="qq-field-option-label-rich">
        <RichTextField
          label="Label"
          htmlFor={`field-row-option-label-${fieldId}-${i}`}
          value={o.label}
          onChange={(next) => onLabelChange(next)}
          placeholder="Label"
          testid={`field-row-option-label-${fieldId}-${i}`}
          compact
        />
      </div>
      <input
        type="number"
        className="qq-field-input qq-field-option-value"
        value={o.value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        placeholder="Value"
        data-testid={`field-row-option-value-${fieldId}-${i}`}
      />
      <button
        type="button"
        className="qq-iconbtn qq-field-row-iconbtn"
        onClick={onMoveUp}
        disabled={i === 0}
        aria-label="Move option up"
        data-testid={`field-row-option-up-${fieldId}-${i}`}
      >
        <ChevronUp aria-hidden="true" width={14} height={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="qq-iconbtn qq-field-row-iconbtn"
        onClick={onMoveDown}
        disabled={i === total - 1}
        aria-label="Move option down"
        data-testid={`field-row-option-down-${fieldId}-${i}`}
      >
        <ChevronDown aria-hidden="true" width={14} height={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="qq-iconbtn qq-field-row-iconbtn is-danger"
        onClick={onRemove}
        aria-label="Remove option"
        data-testid={`field-row-option-remove-${fieldId}-${i}`}
      >
        <X aria-hidden="true" width={14} height={14} strokeWidth={2} />
      </button>
      {imageMode && uploadError && (
        <span
          className="qq-field-option-error"
          data-testid={`field-row-option-image-error-${fieldId}-${i}`}
        >{uploadError}</span>
      )}
      {/* BG-7 Item 5 — per-option description (standard RichTextField).
       *  Spans the whole row beneath the label / value / actions; absent
       *  on non-multi_select fields. */}
      {descriptionMode && onDescriptionChange && (
        <div
          className="qq-field-option-description"
          style={{ gridColumn: '1 / -1', marginTop: 4 }}
          data-testid={`field-row-option-description-wrap-${fieldId}-${i}`}
        >
          <RichTextField
            label="Description (optional)"
            htmlFor={`field-row-option-description-${fieldId}-${i}`}
            value={o.description ?? ''}
            onChange={(next) => onDescriptionChange(next)}
            placeholder="Optional description — shown beneath the label."
            testid={`field-row-option-description-${fieldId}-${i}`}
          />
        </div>
      )}
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
