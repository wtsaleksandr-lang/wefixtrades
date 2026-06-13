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
import { ChevronUp, ChevronDown, X, Trash2, Minus, Plus } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import type { TemplateField, TemplateOption, TemplateRateMatrix } from '@shared/templatePresets';
import { FIELD_TYPE_TO_PUBLIC } from './types';
import { useEditorDndSensors, DND_CONTAINERS, DragHandleGlyph } from './dnd';
import { useSelection } from './selection';
import AdvancedSection from './AdvancedSection';
import FloatField from './FloatField';
import RichTextField from './RichTextField';
import RowKebab from './RowKebab';
import { AE } from './appleEditor';

const p = platformTheme;

interface Props {
  field: TemplateField;
  /**
   * CONDITIONAL-FIELDS-1 — the full field list, so the "Show only when…"
   * editor can offer every OTHER field as the controlling field and pull
   * the controller's options for the value picker.
   */
  allFields?: TemplateField[];
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

// CONDITIONAL-FIELDS-1 — option / field labels may carry sanitized rich-text
// HTML; strip tags for the plain-text dropdowns in the "Show only when…"
// editor so the picker reads cleanly.
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// CONDITIONAL-FIELDS-1 — field types that contribute a real, testable answer
// (so they can act as a controlling field). Display-only blocks never can.
const SHOWIF_ELIGIBLE_TYPES: ReadonlyArray<TemplateField['type']> = [
  'number', 'slider', 'select', 'radio', 'image_choice', 'multi_select',
  'toggle', 'text',
];

// CONDITIONAL-FIELDS-1 — controllers whose value picker should be an option
// dropdown (the value is an option id) rather than a free text/number input.
const SHOWIF_OPTION_TYPES: ReadonlyArray<TemplateField['type']> = [
  'select', 'radio', 'image_choice', 'multi_select',
];

const SHOWIF_OPS: ReadonlyArray<{ op: NonNullable<TemplateField['show_if']>['op']; label: string }> = [
  { op: 'eq', label: 'is' },
  { op: 'ne', label: 'is not' },
  { op: 'gt', label: '>' },
  { op: 'lt', label: '<' },
  { op: 'gte', label: '≥' },
  { op: 'lte', label: '≤' },
  { op: 'contains', label: 'contains' },
];

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
  // COMPONENTS-1 — Wave U-F1 display types.
  paragraph: '¶',
  divider: '—',
  image: '◫',
  // BUILDER-COMPONENTS — content/CTA components.
  button: '⬢',
  link: '↗',
  // FIELD-PALETTE — video embed.
  video: '▷',
  // WIZARD-GAPS — contact form.
  contact_form: '✉',
  // PRICING-MODELS (U0) — map entries only, so the exhaustive Record keeps
  // compiling; the dedicated FieldRow config sections land in U3.
  address_distance: '⇥',
  rate_matrix: '⊞',
  photo_upload: '⛶',
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
  paragraph: 'Paragraph',
  divider: 'Divider',
  image: 'Image',
  button: 'Button',
  link: 'Link',
  video: 'Video',
  contact_form: 'Contact form',
  // PRICING-MODELS (U0) — map entries only (see TYPE_ICON note above).
  address_distance: 'Distance',
  rate_matrix: 'Rate matrix',
  photo_upload: 'Photo upload',
};

export default function FieldRow({
  field, allFields, index, total, onChange, onRemove, onMoveUp, onMoveDown,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  // MOBILE-FIELD-CONTROLS — on touch/mobile (≤768px) the portaled RowKebab
  // menu rendered BEHIND the bottom sheet (z 1000 < sheet 9998) and was
  // unreachable, so we swap it for inline up/down/delete controls. Desktop
  // keeps the kebab. Canonical 768px breakpoint via the shared useIsMobile.
  const isMobile = useIsMobile();
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
  // COMPONENTS-1 — Wave U-F1 — type-specific flags for the new field types.
  const isTextInput = field.type === 'text';
  const isParagraph = field.type === 'paragraph';
  const isDivider = field.type === 'divider';
  const isImage = field.type === 'image';
  // BUILDER-COMPONENTS — content/CTA components.
  const isButton = field.type === 'button';
  const isLink = field.type === 'link';
  // FIELD-PALETTE — video embed content component.
  const isVideo = field.type === 'video';
  // WIZARD-GAPS — contact-form content component. Inline name/email/message
  // block; submits via the existing /api/leads path. Full-width like the other
  // content components, so it gets no Width toggle.
  const isContactForm = field.type === 'contact_form';
  // PRICING-MODELS (U3) — distance / rate-matrix / photo-upload pricing
  // inputs. All three render as full-width blocks in the widget (address
  // autocomplete + chip, dropdown pair, thumb grid), so no Width toggle.
  const isAddressDistance = field.type === 'address_distance';
  const isRateMatrix = field.type === 'rate_matrix';
  const isPhotoUpload = field.type === 'photo_upload';
  // COMPONENTS-1 — display-only field types (heading / paragraph / divider
  // / image) don't read the customer-facing `label` the same way an input
  // does — heading uses it as the rendered title, paragraph stores body in
  // `content`, divider/image don't render the label at all. Suppress the
  // Width toggle for display-only types since they always span full row.
  // BUILDER-COMPONENTS — button / link are inline content too: no Width toggle.
  const showsWidthToggle = !isDivider && !isImage && !isParagraph && !isButton && !isLink && !isVideo && !isContactForm
    && !isAddressDistance && !isRateMatrix && !isPhotoUpload;
  const publicType = FIELD_TYPE_TO_PUBLIC[field.type] ?? field.type;

  const update = (patch: Partial<TemplateField>) => onChange({ ...field, ...patch });

  // CONDITIONAL-FIELDS-1 — candidate controlling fields = every OTHER field
  // that actually carries an answer (display-only blocks excluded).
  const showIfCandidates = (allFields ?? []).filter(
    (f) => f.id !== field.id && SHOWIF_ELIGIBLE_TYPES.includes(f.type),
  );
  const showIfEnabled = !!field.show_if;
  const controller = field.show_if
    ? showIfCandidates.find((f) => f.id === field.show_if!.field)
    : undefined;
  // The value picker is an option dropdown when the controller is a
  // select-like field; otherwise a free text/number input.
  const controllerUsesOptions = controller
    ? SHOWIF_OPTION_TYPES.includes(controller.type)
    : false;

  const setShowIfEnabled = (on: boolean) => {
    if (!on) { update({ show_if: undefined }); return; }
    // Default to the first eligible controller; pick a sensible default value.
    const first = showIfCandidates[0];
    if (!first) { update({ show_if: undefined }); return; }
    const firstVal = SHOWIF_OPTION_TYPES.includes(first.type)
      ? (first.options?.[0]?.id ?? '')
      : '';
    update({ show_if: { field: first.id, op: 'eq', value: firstVal } });
  };

  const patchShowIf = (patch: Partial<NonNullable<TemplateField['show_if']>>) => {
    if (!field.show_if) return;
    update({ show_if: { ...field.show_if, ...patch } });
  };

  // When the controlling field changes, reset the value to that field's first
  // option (select-like) or empty (free input) so we never carry a stale id.
  const changeShowIfController = (id: string) => {
    const next = showIfCandidates.find((f) => f.id === id);
    const nextVal = next && SHOWIF_OPTION_TYPES.includes(next.type)
      ? (next.options?.[0]?.id ?? '')
      : '';
    update({ show_if: { field: id, op: field.show_if?.op ?? 'eq', value: nextVal } });
  };

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
      data-theme="light"
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
        {/* Elfsight-clean — quiet drag affordance: a low-opacity 6-dot handle
         * that only surfaces on row hover / focus-within. Drag wiring (dnd-kit
         * attributes + listeners) and the testid are preserved exactly. */}
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
          onClick={() => {
            // Expand/collapse AND set the shared selection so menu→preview
            // sync fires on a normal click (the label lives inside this button,
            // so the row-root's select guard `closest('button')` would
            // otherwise veto it). Guard on !isSel so collapsing an already-
            // selected row doesn't toggle its selection off.
            setExpanded((v) => !v);
            if (!isSel) selection.select({ kind: 'field', id: field.id });
          }}
        >
          <span className="qq-field-type-badge" data-testid={`field-row-type-${field.id}`} aria-label={TYPE_LABEL[field.type]}>
            <span aria-hidden="true">{TYPE_ICON[field.type] ?? '?'}</span>
          </span>
          <span className="qq-field-row-label" data-testid={`field-row-label-${field.id}`}>
            {field.label || <em style={{ color: p.colors.subtle }}>Untitled {publicType}</em>}
          </span>
          {/* Quiet type caption — visible only on row hover/focus so it never
           * dominates the clean single-line row. */}
          <span className="qq-field-row-typename">{TYPE_LABEL[field.type]}</span>
        </button>

        {/* Desktop (>768px): the inline ▲ ▼ ✕ cluster is relocated into a
         * single overflow menu (RowKebab). Move up / Move down / Delete are
         * wired to the same handlers (onMoveUp / onMoveDown / onRemove) the
         * inline buttons used, with the same first/last disabled logic.
         *
         * MOBILE-FIELD-CONTROLS — on mobile (≤768px) the portaled kebab menu
         * rendered behind the bottom sheet and was untappable, so we render
         * INLINE up / down / delete controls instead. Same handlers, same
         * testids — only the affordance differs. The left drag-handle keeps
         * drag-reorder either way. */}
        <div className="qq-field-row-actions">
          {isMobile ? (
            <>
              <button
                type="button"
                className="qq-iconbtn qq-field-row-mobilebtn"
                onClick={onMoveUp}
                disabled={index === 0}
                aria-label={`Move ${field.label || 'field'} up`}
                data-no-select=""
                data-testid={`field-row-up-${field.id}`}
              >
                <ChevronUp aria-hidden="true" width={18} height={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="qq-iconbtn qq-field-row-mobilebtn"
                onClick={onMoveDown}
                disabled={index === total - 1}
                aria-label={`Move ${field.label || 'field'} down`}
                data-no-select=""
                data-testid={`field-row-down-${field.id}`}
              >
                <ChevronDown aria-hidden="true" width={18} height={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="qq-iconbtn qq-field-row-mobilebtn is-danger"
                onClick={onRemove}
                aria-label={`Delete ${field.label || 'field'}`}
                data-no-select=""
                data-testid={`field-row-remove-${field.id}`}
              >
                <Trash2 aria-hidden="true" width={18} height={18} strokeWidth={2} />
              </button>
            </>
          ) : (
            <RowKebab
              testidBase={`field-row-${field.id}`}
              label={`Actions for ${field.label || 'field'}`}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDelete={onRemove}
              disableUp={index === 0}
              disableDown={index === total - 1}
              upTestid={`field-row-up-${field.id}`}
              downTestid={`field-row-down-${field.id}`}
              deleteTestid={`field-row-remove-${field.id}`}
            />
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
              // P2 UX — push-down (not overlay) so the expanded editor
              // doesn't cover the Width toggle / numeric / options rows
              // that sit directly below this label inside the row body.
              expansionMode="inline"
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
          {showsWidthToggle && (
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
          )}

          {supportsNumeric && (
            <>
              <div className="qq-field-grid-3">
                <FloatField label="Minimum" htmlFor={`field-row-input-min-${field.id}`}>
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
                <FloatField label="Maximum" htmlFor={`field-row-input-max-${field.id}`}>
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

          {/* COMPONENTS-1 — text input property editor. Placeholder, max
              length, validation hook. Required flag toggles via a small
              segmented chip alongside the placeholder. */}
          {isTextInput && (
            <>
              <FloatField label="Placeholder" htmlFor={`field-row-input-placeholder-${field.id}`}>
                <input
                  id={`field-row-input-placeholder-${field.id}`}
                  type="text"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.placeholder ?? ''}
                  onChange={(e) => update({ placeholder: e.target.value })}
                  data-testid={`field-row-input-placeholder-${field.id}`}
                />
              </FloatField>
              <div className="qq-field-grid-3">
                <FloatField label="Max length" htmlFor={`field-row-input-maxlength-${field.id}`}>
                  <input
                    id={`field-row-input-maxlength-${field.id}`}
                    type="number"
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.maxLength ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      update({ maxLength: v === '' ? undefined : Math.max(1, Number(v) || 0) });
                    }}
                    data-testid={`field-row-input-maxlength-${field.id}`}
                  />
                </FloatField>
                <FloatField label="Validation" htmlFor={`field-row-input-validation-${field.id}`}>
                  <select
                    id={`field-row-input-validation-${field.id}`}
                    className="premium-input qq-field-input"
                    value={field.validation ?? 'none'}
                    onChange={(e) => update({ validation: e.target.value as TemplateField['validation'] })}
                    data-testid={`field-row-input-validation-${field.id}`}
                  >
                    <option value="none">No check</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="url">URL</option>
                  </select>
                </FloatField>
                <div className="qq-field-required-cluster">
                  <span className="qq-field-width-label">Required</span>
                  <div className="qq-field-width-segmented" role="group" aria-label="Required">
                    <button
                      type="button"
                      className={`qq-field-width-btn${field.required ? ' is-active' : ''}`}
                      aria-pressed={!!field.required}
                      onClick={() => update({ required: true })}
                      data-testid={`field-row-input-required-yes-${field.id}`}
                    >Yes</button>
                    <button
                      type="button"
                      className={`qq-field-width-btn${!field.required ? ' is-active' : ''}`}
                      aria-pressed={!field.required}
                      onClick={() => update({ required: undefined })}
                      data-testid={`field-row-input-required-no-${field.id}`}
                    >No</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* COMPONENTS-1 — paragraph body editor. The `label` from the
              parent input above is the wizard-side "row name"; this
              textarea drives `content`, the customer-facing copy. */}
          {isParagraph && (
            <FloatField label="Body copy" htmlFor={`field-row-input-content-${field.id}`}>
              <textarea
                id={`field-row-input-content-${field.id}`}
                className="premium-input qq-field-input qq-field-textarea"
                placeholder=" "
                rows={4}
                value={field.content ?? ''}
                onChange={(e) => update({ content: e.target.value })}
                data-testid={`field-row-input-content-${field.id}`}
              />
            </FloatField>
          )}

          {/* COMPONENTS-1 — divider styling controls. Two segmented
              controls — thickness (1 / 2 px) and tone (subtle / accent /
              brand). Pure visual settings; no value persisted at runtime. */}
          {isDivider && (
            <div className="qq-field-grid-3">
              <div className="qq-field-required-cluster">
                <span className="qq-field-width-label">Thickness</span>
                <div className="qq-field-width-segmented" role="group" aria-label="Divider thickness">
                  <button
                    type="button"
                    className={`qq-field-width-btn${(field.dividerThickness ?? 1) === 1 ? ' is-active' : ''}`}
                    aria-pressed={(field.dividerThickness ?? 1) === 1}
                    onClick={() => update({ dividerThickness: 1 })}
                    data-testid={`field-row-divider-thickness-1-${field.id}`}
                  >1px</button>
                  <button
                    type="button"
                    className={`qq-field-width-btn${field.dividerThickness === 2 ? ' is-active' : ''}`}
                    aria-pressed={field.dividerThickness === 2}
                    onClick={() => update({ dividerThickness: 2 })}
                    data-testid={`field-row-divider-thickness-2-${field.id}`}
                  >2px</button>
                </div>
              </div>
              <div className="qq-field-required-cluster" style={{ gridColumn: '2 / 4' }}>
                <span className="qq-field-width-label">Tone</span>
                <div className="qq-field-width-segmented" role="group" aria-label="Divider tone">
                  {(['subtle', 'accent', 'brand'] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      className={`qq-field-width-btn${(field.dividerTone ?? 'subtle') === tone ? ' is-active' : ''}`}
                      aria-pressed={(field.dividerTone ?? 'subtle') === tone}
                      onClick={() => update({ dividerTone: tone })}
                      data-testid={`field-row-divider-tone-${tone}-${field.id}`}
                    >{tone.charAt(0).toUpperCase() + tone.slice(1)}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* COMPONENTS-1 — image source + caption. v1 = URL only; upload
              pipeline is a follow-up. Owner pastes a hosted URL, optionally
              adds a caption rendered as muted small text under the image. */}
          {isImage && (
            <>
              <FloatField label="Image URL" htmlFor={`field-row-input-imageurl-${field.id}`}>
                <input
                  id={`field-row-input-imageurl-${field.id}`}
                  type="url"
                  inputMode="url"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.imageUrl ?? ''}
                  onChange={(e) => update({ imageUrl: e.target.value })}
                  data-testid={`field-row-input-imageurl-${field.id}`}
                />
              </FloatField>
              <FloatField label="Caption (optional)" htmlFor={`field-row-input-imagecaption-${field.id}`}>
                <input
                  id={`field-row-input-imagecaption-${field.id}`}
                  type="text"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.imageCaption ?? ''}
                  onChange={(e) => update({ imageCaption: e.target.value })}
                  data-testid={`field-row-input-imagecaption-${field.id}`}
                />
              </FloatField>
              <FloatField label="Alt text (a11y)" htmlFor={`field-row-input-imagealt-${field.id}`}>
                <input
                  id={`field-row-input-imagealt-${field.id}`}
                  type="text"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.imageAlt ?? ''}
                  onChange={(e) => update({ imageAlt: e.target.value })}
                  data-testid={`field-row-input-imagealt-${field.id}`}
                />
              </FloatField>
            </>
          )}

          {/* BUILDER-COMPONENTS — Button config. The top "Label" field above
              is the button TEXT. Here the owner picks the action (open a URL
              / call a number / send an email) and the destination. */}
          {isButton && (
            <>
              <div className="qq-field-required-cluster">
                <span className="qq-field-width-label">Action</span>
                <div className="qq-field-width-segmented" role="group" aria-label="Button action">
                  {([
                    { id: 'url', label: 'Link' },
                    { id: 'tel', label: 'Call' },
                    { id: 'mailto', label: 'Email' },
                  ] as const).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`qq-field-width-btn${(field.buttonAction ?? 'url') === a.id ? ' is-active' : ''}`}
                      aria-pressed={(field.buttonAction ?? 'url') === a.id}
                      onClick={() => update({ buttonAction: a.id })}
                      data-testid={`field-row-button-action-${a.id}-${field.id}`}
                    >{a.label}</button>
                  ))}
                </div>
              </div>
              <FloatField
                label={
                  (field.buttonAction ?? 'url') === 'tel' ? 'Phone number'
                  : (field.buttonAction ?? 'url') === 'mailto' ? 'Email address'
                  : 'URL'
                }
                htmlFor={`field-row-input-href-${field.id}`}
              >
                <input
                  id={`field-row-input-href-${field.id}`}
                  type={(field.buttonAction ?? 'url') === 'tel' ? 'tel'
                    : (field.buttonAction ?? 'url') === 'mailto' ? 'email' : 'url'}
                  inputMode={(field.buttonAction ?? 'url') === 'tel' ? 'tel'
                    : (field.buttonAction ?? 'url') === 'mailto' ? 'email' : 'url'}
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.href ?? ''}
                  onChange={(e) => update({ href: e.target.value })}
                  data-testid={`field-row-input-href-${field.id}`}
                />
              </FloatField>
            </>
          )}

          {/* BUILDER-COMPONENTS — Link config. The top "Label" field is the
              link TEXT; this is the destination URL (opens in a new tab). */}
          {isLink && (
            <FloatField label="URL" htmlFor={`field-row-input-href-${field.id}`}>
              <input
                id={`field-row-input-href-${field.id}`}
                type="url"
                inputMode="url"
                className="premium-input qq-field-input"
                placeholder=" "
                value={field.href ?? ''}
                onChange={(e) => update({ href: e.target.value })}
                data-testid={`field-row-input-href-${field.id}`}
              />
            </FloatField>
          )}

          {/* FIELD-PALETTE — Video config. The owner pastes a YouTube / Vimeo
              URL (or a bare id); the renderer parses it into a sandboxed embed
              src. An optional caption renders beneath the 16:9 frame. */}
          {isVideo && (
            <>
              <FloatField
                label="Video URL"
                htmlFor={`field-row-input-video-url-${field.id}`}
                infoText="Paste a YouTube or Vimeo link — a watch URL, youtu.be short link, or the raw video id all work. Only YouTube and Vimeo are supported."
                infoTestid={`field-row-input-video-url-${field.id}-info`}
              >
                <input
                  id={`field-row-input-video-url-${field.id}`}
                  type="url"
                  inputMode="url"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.videoUrl ?? ''}
                  onChange={(e) => update({ videoUrl: e.target.value })}
                  data-testid={`field-row-input-video-url-${field.id}`}
                />
              </FloatField>
              <FloatField label="Caption (optional)" htmlFor={`field-row-input-video-caption-${field.id}`}>
                <input
                  id={`field-row-input-video-caption-${field.id}`}
                  type="text"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.videoCaption ?? ''}
                  onChange={(e) => update({ videoCaption: e.target.value })}
                  data-testid={`field-row-input-video-caption-${field.id}`}
                />
              </FloatField>
            </>
          )}

          {/* WIZARD-GAPS — Contact form config. The top "Label" field above is
              the form HEADING shown to customers. Here the owner picks which of
              the three inputs (name / email / message) are required. Name +
              email validate as required when listed; an unlisted field is
              optional. The form posts to the existing /api/leads path at
              render time. */}
          {isContactForm && (
            <div className="qq-field-required-cluster" data-testid={`field-row-contact-require-${field.id}`}>
              <span className="qq-field-width-label">Required fields</span>
              <div className="qq-field-width-segmented" role="group" aria-label="Required contact fields">
                {(['name', 'email', 'message'] as const).map((key) => {
                  const current = field.contactRequire ?? ['name', 'email'];
                  const on = current.includes(key);
                  const label = key.charAt(0).toUpperCase() + key.slice(1);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`qq-field-width-btn${on ? ' is-active' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        const next = on
                          ? current.filter((k) => k !== key)
                          : [...current, key];
                        update({ contactRequire: next });
                      }}
                      data-testid={`field-row-contact-require-${key}-${field.id}`}
                    >{label}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PRICING-MODELS (U3) — address_distance config. Default surface
              keeps the ≤3-decision rule: unit + round-trip segmented toggles
              (the Label input above is the customer-facing title). Max
              distance + the manual-entry fallback live behind the shared
              AdvancedSection expander. The origin hint is static text —
              FieldRow can't see ShellSettings, so we point at the Settings
              card instead of live-checking whether the origin is set. */}
          {isAddressDistance && (
            <>
              <div className="qq-field-grid-3" data-testid={`field-distance-config-${field.id}`}>
                <div className="qq-field-required-cluster">
                  <span className="qq-field-width-label">Unit</span>
                  <div className="qq-field-width-segmented" role="group" aria-label="Distance unit">
                    <button
                      type="button"
                      className={`qq-field-width-btn${(field.distanceUnit ?? 'miles') === 'miles' ? ' is-active' : ''}`}
                      aria-pressed={(field.distanceUnit ?? 'miles') === 'miles'}
                      onClick={() => update({ distanceUnit: 'miles' })}
                      data-testid={`field-distance-unit-miles-${field.id}`}
                    >Miles</button>
                    <button
                      type="button"
                      className={`qq-field-width-btn${field.distanceUnit === 'km' ? ' is-active' : ''}`}
                      aria-pressed={field.distanceUnit === 'km'}
                      onClick={() => update({ distanceUnit: 'km' })}
                      data-testid={`field-distance-unit-km-${field.id}`}
                    >Km</button>
                  </div>
                </div>
                <div className="qq-field-required-cluster" style={{ gridColumn: '2 / 4' }}>
                  <span className="qq-field-width-label">Trip</span>
                  <div className="qq-field-width-segmented" role="group" aria-label="Trip type">
                    <button
                      type="button"
                      className={`qq-field-width-btn${!field.roundTrip ? ' is-active' : ''}`}
                      aria-pressed={!field.roundTrip}
                      onClick={() => update({ roundTrip: false })}
                      data-testid={`field-distance-trip-oneway-${field.id}`}
                    >One-way</button>
                    <button
                      type="button"
                      className={`qq-field-width-btn${field.roundTrip ? ' is-active' : ''}`}
                      aria-pressed={!!field.roundTrip}
                      onClick={() => update({ roundTrip: true })}
                      data-testid={`field-distance-trip-round-${field.id}`}
                    >Round trip ×2</button>
                  </div>
                  {field.roundTrip && (
                    <p className="qq-field-hint" data-testid={`field-distance-roundtrip-hint-${field.id}`}>
                      Round trip doubles the billed distance (×2) in your formula.
                    </p>
                  )}
                </div>
              </div>
              <p className="qq-field-hint" data-testid={`field-distance-origin-hint-${field.id}`}>
                Distance is measured from your <strong>Business location</strong>.
                Set it in Settings → Advanced settings → Business location so
                quotes can price by distance.
              </p>
              <AdvancedSection id={`field-distance-${field.id}`} label="Advanced">
                <FloatField
                  label="Max distance (miles)"
                  htmlFor={`field-distance-max-${field.id}`}
                  infoText="Beyond this, customers see “outside our service area”. Their details are still captured as a lead — only the instant price is withheld. Leave blank for no limit."
                  infoTestid={`field-distance-max-${field.id}-info`}
                >
                  <input
                    id={`field-distance-max-${field.id}`}
                    type="number"
                    min={1}
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.maxDistanceMiles ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      update({ maxDistanceMiles: v === '' ? undefined : Math.max(1, Number(v) || 0) });
                    }}
                    data-testid={`field-distance-max-${field.id}`}
                  />
                </FloatField>
                <div className="qq-field-required-cluster">
                  <span className="qq-field-width-label">Manual fallback</span>
                  <div className="qq-field-width-segmented" role="group" aria-label="Manual distance fallback">
                    <button
                      type="button"
                      className={`qq-field-width-btn${field.allowManualDistance !== false ? ' is-active' : ''}`}
                      aria-pressed={field.allowManualDistance !== false}
                      onClick={() => update({ allowManualDistance: true })}
                      data-testid={`field-distance-manual-on-${field.id}`}
                    >Allow</button>
                    <button
                      type="button"
                      className={`qq-field-width-btn${field.allowManualDistance === false ? ' is-active' : ''}`}
                      aria-pressed={field.allowManualDistance === false}
                      onClick={() => update({ allowManualDistance: false })}
                      data-testid={`field-distance-manual-off-${field.id}`}
                    >Off</button>
                  </div>
                  <p className="qq-field-hint">
                    When an address can’t be resolved, customers type the
                    distance themselves instead of getting stuck.
                  </p>
                </div>
              </AdvancedSection>
            </>
          )}

          {/* PRICING-MODELS (U3) — rate_matrix config. Default surface = row
              label + column label + the editable rate grid (3 decisions).
              Missing-cell behaviour + the TSV “Paste from spreadsheet” import
              sit behind the AdvancedSection expander. */}
          {isRateMatrix && (
            <RateMatrixConfig
              fieldId={field.id}
              matrix={normalizedMatrix(field.matrix)}
              onChange={(matrix) => update({ matrix })}
            />
          )}

          {/* PRICING-MODELS (U3) — photo_upload config. Default surface = the
              max-photos stepper (1-5). Per-photo size cap (server hard cap
              8 MB) lives behind the expander. */}
          {isPhotoUpload && (
            <>
              <div className="qq-field-required-cluster" data-testid={`field-photo-config-${field.id}`}>
                <span className="qq-field-width-label">Max photos</span>
                <div className="qq-field-stepper" role="group" aria-label="Maximum photos">
                  <button
                    type="button"
                    className="qq-iconbtn"
                    onClick={() => update({ maxPhotos: Math.max(1, (field.maxPhotos ?? 3) - 1) })}
                    disabled={(field.maxPhotos ?? 3) <= 1}
                    aria-label="Fewer photos"
                    data-testid={`field-photo-max-dec-${field.id}`}
                  >
                    <Minus aria-hidden="true" width={14} height={14} strokeWidth={2} />
                  </button>
                  <span className="qq-field-stepper-value" data-testid={`field-photo-max-value-${field.id}`}>
                    {Math.min(5, Math.max(1, field.maxPhotos ?? 3))}
                  </span>
                  <button
                    type="button"
                    className="qq-iconbtn"
                    onClick={() => update({ maxPhotos: Math.min(5, (field.maxPhotos ?? 3) + 1) })}
                    disabled={(field.maxPhotos ?? 3) >= 5}
                    aria-label="More photos"
                    data-testid={`field-photo-max-inc-${field.id}`}
                  >
                    <Plus aria-hidden="true" width={14} height={14} strokeWidth={2} />
                  </button>
                </div>
                <p className="qq-field-hint">
                  Photos upload as soon as the customer adds them and arrive
                  with the lead — a failed upload never blocks the quote.
                </p>
              </div>
              <AdvancedSection id={`field-photo-${field.id}`} label="Advanced">
                <FloatField
                  label="Max size per photo (MB)"
                  htmlFor={`field-photo-maxmb-${field.id}`}
                  infoText="Per-photo size limit. The server enforces a hard 8 MB cap — values above that are clamped."
                  infoTestid={`field-photo-maxmb-${field.id}-info`}
                >
                  <input
                    id={`field-photo-maxmb-${field.id}`}
                    type="number"
                    min={1}
                    max={8}
                    className="premium-input qq-field-input"
                    placeholder=" "
                    value={field.maxPhotoMb ?? 8}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      update({ maxPhotoMb: v === '' ? undefined : Math.min(8, Math.max(1, Number(v) || 1)) });
                    }}
                    data-testid={`field-photo-maxmb-${field.id}`}
                  />
                </FloatField>
              </AdvancedSection>
            </>
          )}

          {/* COMPONENTS-1 — multi_select selection-count guardrails. Pure
              numeric min / max; the renderer locks further selections once
              max is hit. Lives above the existing options editor so the
              two related controls cluster. */}
          {field.type === 'multi_select' && (
            <div className="qq-field-grid-3">
              <FloatField label="Min selections" htmlFor={`field-row-input-minselect-${field.id}`}>
                <input
                  id={`field-row-input-minselect-${field.id}`}
                  type="number"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.minSelect ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    update({ minSelect: v === '' ? undefined : Math.max(0, Number(v) || 0) });
                  }}
                  data-testid={`field-row-input-minselect-${field.id}`}
                />
              </FloatField>
              <FloatField label="Max selections" htmlFor={`field-row-input-maxselect-${field.id}`}>
                <input
                  id={`field-row-input-maxselect-${field.id}`}
                  type="number"
                  className="premium-input qq-field-input"
                  placeholder=" "
                  value={field.maxSelect ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    update({ maxSelect: v === '' ? undefined : Math.max(1, Number(v) || 0) });
                  }}
                  data-testid={`field-row-input-maxselect-${field.id}`}
                />
              </FloatField>
            </div>
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

          {/* CONDITIONAL-FIELDS-1 — "Show this field only when…". Progressive
              disclosure: a single Always / When toggle; the rule editor (field
              · operator · value) only appears once "When" is chosen. Writes
              `show_if` onto the field; "Always show" clears it back to
              undefined (the default → field always renders, no regression). */}
          <div className="qq-field-showif" data-testid={`field-showif-${field.id}`}>
            <div className="qq-field-required-cluster">
              <span className="qq-field-width-label">Visibility</span>
              <div className="qq-field-width-segmented" role="group" aria-label="Field visibility">
                <button
                  type="button"
                  className={`qq-field-width-btn${!showIfEnabled ? ' is-active' : ''}`}
                  aria-pressed={!showIfEnabled}
                  onClick={() => setShowIfEnabled(false)}
                  data-testid={`field-showif-always-${field.id}`}
                >Always show</button>
                <button
                  type="button"
                  className={`qq-field-width-btn${showIfEnabled ? ' is-active' : ''}`}
                  aria-pressed={showIfEnabled}
                  onClick={() => setShowIfEnabled(true)}
                  disabled={showIfCandidates.length === 0}
                  data-testid={`field-showif-conditional-${field.id}`}
                >Show only when…</button>
              </div>
            </div>

            {showIfEnabled && field.show_if && (
              <div className="qq-field-showif-rule" data-testid={`field-showif-rule-${field.id}`}>
                <FloatField label="Field" htmlFor={`field-showif-field-${field.id}`} variant="select">
                  <select
                    id={`field-showif-field-${field.id}`}
                    className="premium-input qq-field-input"
                    value={field.show_if.field}
                    onChange={(e) => changeShowIfController(e.target.value)}
                    data-testid={`field-showif-field-${field.id}`}
                  >
                    {showIfCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {plainText(c.label) || c.name || c.id}
                      </option>
                    ))}
                  </select>
                </FloatField>
                <FloatField label="Condition" htmlFor={`field-showif-op-${field.id}`} variant="select">
                  <select
                    id={`field-showif-op-${field.id}`}
                    className="premium-input qq-field-input"
                    value={field.show_if.op}
                    onChange={(e) => patchShowIf({ op: e.target.value as NonNullable<TemplateField['show_if']>['op'] })}
                    data-testid={`field-showif-op-${field.id}`}
                  >
                    {SHOWIF_OPS.map((o) => (
                      <option key={o.op} value={o.op}>{o.label}</option>
                    ))}
                  </select>
                </FloatField>
                {controllerUsesOptions ? (
                  <FloatField label="Value" htmlFor={`field-showif-value-${field.id}`} variant="select">
                    <select
                      id={`field-showif-value-${field.id}`}
                      className="premium-input qq-field-input"
                      value={String(field.show_if.value)}
                      onChange={(e) => patchShowIf({ value: e.target.value })}
                      data-testid={`field-showif-value-${field.id}`}
                    >
                      {(controller?.options ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {plainText(o.label) || o.id}
                        </option>
                      ))}
                    </select>
                  </FloatField>
                ) : (
                  <FloatField label="Value" htmlFor={`field-showif-value-${field.id}`}>
                    <input
                      id={`field-showif-value-${field.id}`}
                      type={controller?.type === 'text' ? 'text' : 'number'}
                      inputMode={controller?.type === 'text' ? 'text' : 'numeric'}
                      className="premium-input qq-field-input"
                      placeholder=" "
                      value={String(field.show_if.value ?? '')}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next: string | number =
                          controller?.type === 'text'
                            ? raw
                            : (raw.trim() === '' ? '' : (Number(raw) || 0));
                        patchShowIf({ value: next });
                      }}
                      data-testid={`field-showif-value-${field.id}`}
                    />
                  </FloatField>
                )}
              </div>
            )}
          </div>
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
        /* Wave 60 — selection-flash pulse.
         *
         * SelectionProvider toggles the .qq-selection-flash class on the
         * pane node for ~600 ms after every cross-pane click so the user
         * immediately sees where the matching edit row landed in the
         * editor list. The pulse uses a background-color tween rather
         * than box-shadow so it stacks cleanly over the existing
         * .is-selected outline without double-shadowing. Disabled under
         * prefers-reduced-motion. */
        @keyframes qq-selection-flash {
          0%   { background: ${p.colors.accentLight}; }
          60%  { background: ${p.colors.accentLighter}; }
          100% { background: #fff; }
        }
        .qq-field-row.qq-selection-flash {
          animation: qq-selection-flash 600ms ease-out 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-field-row.qq-selection-flash { animation: none; }
        }
        /* Elfsight-clean — airy single-line row: [icon][name][spacer][kebab].
         * Comfortable ~54px min height, generous horizontal padding (14px). */
        .qq-field-row-head {
          display: flex; align-items: center; gap: 8px;
          min-height: 54px; padding: 7px 14px;
        }
        /* Elfsight-clean — quiet drag handle: hidden at rest, fades in (low
         * opacity) only on row hover / keyboard focus so it never clutters the
         * row. Plain glyph — no boxed/tinted chrome. Drag wiring is unchanged. */
        .qq-field-row-handle {
          display: inline-flex; align-items: center; justify-content: center;
          width: 16px; height: 28px; padding: 0; border-radius: 6px;
          border: none; background: transparent;
          color: ${AE.color.secondary};
          cursor: grab; touch-action: none;
          flex-shrink: 0; margin-left: -4px;
          opacity: 0;
          transition: opacity 0.12s ease, color 0.12s ease;
        }
        .qq-field-row:hover .qq-field-row-handle,
        .qq-field-row:focus-within .qq-field-row-handle,
        .qq-field-row-handle:focus-visible {
          opacity: 0.55;
        }
        .qq-field-row:hover .qq-field-row-handle:hover {
          opacity: 1; color: ${AE.color.text};
        }
        .qq-field-row-handle:active { cursor: grabbing; }
        /* Elfsight-clean — gentle surface tint on row hover (no hard outline). */
        .qq-field-row:hover,
        .qq-field-row[data-hover-outline="true"] {
          border-color: ${AE.color.hairline};
          background: ${AE.color.surface};
        }
        .qq-field-row-toggle {
          flex: 1; min-width: 0;
          display: flex; align-items: center; gap: 12px;
          padding: 6px 0; border: none; background: transparent;
          font: inherit; cursor: pointer; text-align: left;
        }
        .qq-field-type-badge {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700;
        }
        .qq-field-row-label {
          font-size: 14px; font-weight: 500; color: ${AE.color.text};
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          flex: 1; min-width: 0;
        }
        /* Quiet type caption — small, secondary, surfaces only on row hover /
         * focus so the resting row reads as just [icon][name][kebab]. */
        .qq-field-row-typename {
          font-size: 12px; font-weight: 500; color: ${AE.color.secondary};
          letter-spacing: 0.02em; flex-shrink: 0;
          opacity: 0; transition: opacity 0.12s ease;
        }
        .qq-field-row:hover .qq-field-row-typename,
        .qq-field-row:focus-within .qq-field-row-typename {
          opacity: 1;
        }
        .qq-field-row-actions {
          display: flex; align-items: center; gap: 4px; flex-shrink: 0;
        }
        /* MOBILE-FIELD-CONTROLS — inline up / down / delete buttons shown in
         * place of the (untappable-behind-sheet) kebab on mobile. ≥40px touch
         * targets. The delete button shows its destructive token color at rest
         * (not only on hover) so "delete" reads clearly on touch. */
        .qq-field-row-actions .qq-field-row-mobilebtn {
          width: 40px; height: 40px;
          min-width: 40px; min-height: 40px;
          border-radius: 8px;
        }
        .qq-field-row-actions .qq-field-row-mobilebtn svg { width: 18px; height: 18px; }
        .qq-field-row-actions .qq-field-row-mobilebtn.is-danger {
          color: ${p.colors.danger};
        }
        /* Premium-SaaS icon button (shared) — Linear / Stripe / Vercel
         * aesthetic. Still used by the nested per-option editor (option
         * up/down/remove inside the expanded body). See full rules at the
         * bottom of this style block. */
        /* Wave N — on narrow viewports, free horizontal space so long
         * labels like "Local Incentives" / "Professional installation"
         * don't ellipsis-clamp inside the row. We drop the redundant
         * trailing typename caption (the icon-badge already conveys the
         * field type) and tighten the row padding. */
        @media (max-width: 480px) {
          .qq-field-row-head { padding: 6px 10px; gap: 6px; min-height: 50px; }
          .qq-field-row-toggle { gap: 10px; padding: 4px 0; }
          .qq-field-row-typename { display: none; }
          .qq-field-type-badge { width: 26px; height: 26px; font-size: 13px; }
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
        /* BUG-1 — full-word floated labels ("Minimum" / "Maximum" / "Max
         * length" / "Max selections") must fit the narrow grid-3 columns.
         * Keep them on one line and shrink the floated badge so they never
         * clip or wrap inside the cramped third-width inputs, especially on
         * mobile (375px). Targets only the floated state (top:6px). */
        .qq-field-grid-3 .float-field > label {
          white-space: nowrap;
        }
        .qq-field-grid-3 .float-field > .premium-input:focus + label,
        .qq-field-grid-3 .float-field > .premium-input:not(:placeholder-shown) + label,
        .qq-field-grid-3 .float-field > select.premium-input + label {
          font-size: 10px;
          left: 11px;
        }
        @media (max-width: 480px) {
          .qq-field-grid-3 .float-field > .premium-input:focus + label,
          .qq-field-grid-3 .float-field > .premium-input:not(:placeholder-shown) + label,
          .qq-field-grid-3 .float-field > select.premium-input + label {
            font-size: 9.5px;
            left: 10px;
          }
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
          border-radius: 7px; background: #fff;
          /* BUG-2 — :clip (not :hidden) so the rounded container corners
           * survive; combined with the per-segment radii below, this keeps
           * BOTH the left and right corners rounded instead of the first
           * segment's square background/inset-shadow squaring off the left
           * edge. See [project_overflow_clip_for_sticky]. */
          overflow: clip;
        }
        .qq-field-width-btn {
          padding: 5px 12px; border: none; background: transparent;
          font: inherit; font-size: 12px; font-weight: 600;
          color: ${p.colors.body}; cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease;
        }
        /* BUG-2 — match the first / last segment's paint box to the
         * container's rounded corners so an active (tinted bg + inset
         * box-shadow) end segment doesn't paint a square corner over the
         * container's rounded one. Inner radius = outer 7px − 1px border. */
        .qq-field-width-btn:first-child {
          border-top-left-radius: 6px; border-bottom-left-radius: 6px;
        }
        .qq-field-width-btn:last-child {
          border-top-right-radius: 6px; border-bottom-right-radius: 6px;
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
        /* COMPONENTS-1 — paragraph body textarea. Same input chrome as the
         * other premium-input rows, just taller + no fixed height. */
        .qq-field-textarea {
          height: auto; min-height: 72px;
          padding: 8px 10px; line-height: 1.45;
          font-family: inherit;
          resize: vertical;
        }
        /* COMPONENTS-1 — required/thickness/tone cluster.
         *   Vertical stack: label on top (top-left, per DESIGN-SYSTEM
         *   Rule 5), segmented buttons below. Sits inside qq-field-grid-3
         *   so 3 clusters tile across at the same width as the numeric
         *   min/max/step trio. */
        .qq-field-required-cluster {
          display: flex; flex-direction: column; gap: 4px;
          min-width: 0;
        }
        /* CONDITIONAL-FIELDS-1 — "Show only when…" block. Sits under the
         * options editor; the Always/When segmented control reuses the
         * shared .qq-field-width-segmented styling. The rule row tiles the
         * field · operator · value selects across 3 columns (collapses to a
         * single column on narrow viewports). */
        .qq-field-showif {
          display: flex; flex-direction: column; gap: 8px;
          margin-top: 2px; padding-top: 8px;
          border-top: 1px solid ${p.colors.borderLight};
        }
        .qq-field-showif-rule {
          display: grid; grid-template-columns: 1.2fr 0.9fr 1fr; gap: 8px;
          align-items: end;
        }
        @media (max-width: 480px) {
          .qq-field-showif-rule { grid-template-columns: 1fr; }
        }

        /* ── PRICING-MODELS (U3) — distance / rate-matrix / photo-upload ──
         * Shared 2-col pair (row/col labels), the rate grid, the photo
         * stepper, the muted hint line and the TSV import feedback. All
         * tones come from platformTheme so the new blocks track the same
         * light editor surface as the rest of the row body. */
        .qq-field-grid-2 {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        }
        @media (max-width: 480px) {
          .qq-field-grid-2 { grid-template-columns: 1fr; }
        }
        .qq-field-hint {
          margin: 0; padding: 0 2px;
          font-size: 11px; line-height: 1.45;
          color: ${p.colors.subtle};
        }
        .qq-field-hint strong { color: ${p.colors.muted}; }
        .qq-field-matrix {
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-field-matrix-scroll {
          overflow-x: auto;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 8px;
          padding: 6px;
          background: ${p.colors.surfaceRaised};
        }
        .qq-field-matrix-table {
          border-collapse: separate; border-spacing: 4px;
          width: 100%;
        }
        .qq-field-matrix-table th,
        .qq-field-matrix-table td { padding: 0; }
        .qq-field-matrix-corner {
          min-width: 72px;
          font-size: 11px; font-weight: 700; text-align: center;
          color: ${p.colors.subtle};
        }
        .qq-field-matrix-headcell {
          display: flex; align-items: center; gap: 2px;
        }
        .qq-field-matrix-headinput {
          min-width: 72px; font-weight: 600;
        }
        .qq-field-matrix-rate {
          min-width: 64px; text-align: right;
        }
        /* Hide the number spinners — the dense grid cells are too small for
         * them and they obscure the typed rate. */
        .qq-field-matrix-rate::-webkit-outer-spin-button,
        .qq-field-matrix-rate::-webkit-inner-spin-button {
          -webkit-appearance: none; margin: 0;
        }
        .qq-field-matrix-rate { -moz-appearance: textfield; appearance: textfield; }
        .qq-field-matrix-rowactions { vertical-align: middle; }
        .qq-field-matrix-actions {
          display: flex; align-items: center; gap: 6px;
        }
        .qq-field-stepper {
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qq-field-stepper-value {
          min-width: 24px; text-align: center;
          font-size: 13px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-field-tsv {
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-field-tsv-errors {
          margin: 0; padding-left: 16px;
          display: flex; flex-direction: column; gap: 2px;
          font-size: 11px; line-height: 1.45; font-weight: 600;
          color: ${p.colors.danger};
        }
        .qq-field-tsv-success {
          margin: 0;
          font-size: 11px; line-height: 1.45; font-weight: 600;
          color: ${p.colors.success};
        }

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
          // P2 UX — the overlay variant covered adjacent option-row
          // labels; inline mode folds the editor down and pushes the
          // next options below it instead.
          expansionMode="inline"
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
            // P2 UX — same reasoning as the option label: this lives
            // inside a dense per-option block, so the editor pushes the
            // next options down rather than overlaying them.
            expansionMode="inline"
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

/* ── PRICING-MODELS (U3) — rate-matrix editor ──────────────────────────── */

function matrixUid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** A `rate_matrix` field minted by the AI / an older payload may arrive
 *  without its `matrix` slot — normalize to an empty-but-labeled table so
 *  the editor always has a stable shape to patch. */
function normalizedMatrix(m?: TemplateRateMatrix): TemplateRateMatrix {
  return m ?? {
    rowLabel: 'Pickup zone', colLabel: 'Drop-off zone',
    rows: [], cols: [], rates: {},
  };
}

/** TSV import sanity caps — a 50×50 grid is already 2 500 cells; anything
 *  bigger is almost certainly a paste mistake, not a price list. */
const TSV_MAX_AXIS = 50;

type ParsedTsv =
  | { rows: TemplateRateMatrix['rows']; cols: TemplateRateMatrix['cols']; rates: TemplateRateMatrix['rates'] }
  | { errors: string[] };

/**
 * Parse spreadsheet-copied TSV into matrix parts.
 *
 * Contract (mirrors what Excel / Google Sheets put on the clipboard):
 *   - First row    → corner cell (ignored) + column labels.
 *   - Other rows   → row label + one rate per column.
 *   - Blank cell   → missing rate (follows the missing-cell rule).
 *   - Rates accept "$1,200" / " 85 " — currency symbols, commas and spaces
 *     are stripped before the number check.
 * Every problem is reported with its row/column position — the import only
 * applies when the whole paste parses clean (no silent partial imports).
 */
export function parseRateMatrixTsv(text: string): ParsedTsv {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    return { errors: ['Need a header row of column labels plus at least one data row.'] };
  }
  const grid = lines.map((l) => l.split('\t'));
  if (grid[0].length < 2) {
    return { errors: ['No tab-separated columns found — copy the cells directly from Excel or Google Sheets.'] };
  }

  const errors: string[] = [];
  // Header row: first cell = corner (ignored), the rest = column labels.
  const colLabels = grid[0].slice(1).map((s) => s.trim());
  colLabels.forEach((label, i) => {
    if (label === '') errors.push(`Column ${i + 1} label (header row) is empty.`);
  });
  if (colLabels.length > TSV_MAX_AXIS) {
    errors.push(`Too many columns (${colLabels.length}) — the limit is ${TSV_MAX_AXIS}.`);
  }
  if (grid.length - 1 > TSV_MAX_AXIS) {
    errors.push(`Too many rows (${grid.length - 1}) — the limit is ${TSV_MAX_AXIS}.`);
  }

  const cols = colLabels.map((label) => ({ id: matrixUid('col'), label }));
  const rows: TemplateRateMatrix['rows'] = [];
  const rates: TemplateRateMatrix['rates'] = {};

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const rowLabel = (cells[0] ?? '').trim();
    if (rowLabel === '') errors.push(`Row ${r} label (first column) is empty.`);
    if (cells.length - 1 > colLabels.length) {
      errors.push(`Row ${r} has ${cells.length - 1} rate cells but the header has ${colLabels.length} column labels.`);
    }
    const row = { id: matrixUid('row'), label: rowLabel };
    rows.push(row);
    const byCol: Record<string, number> = {};
    for (let c = 0; c < colLabels.length; c++) {
      const raw = (cells[c + 1] ?? '').trim();
      if (raw === '') continue; // blank = missing cell, by design
      const cleaned = raw.replace(/[$,\s]/g, '');
      const n = Number(cleaned);
      if (cleaned === '' || !Number.isFinite(n)) {
        errors.push(`Row ${r}, column ${c + 1}: "${raw}" is not a number.`);
      } else if (n < 0) {
        errors.push(`Row ${r}, column ${c + 1}: rates can't be negative (${raw}).`);
      } else {
        byCol[cols[c].id] = n;
      }
    }
    rates[row.id] = byCol;
  }

  if (errors.length > 0) return { errors };
  return { rows, cols, rates };
}

interface RateMatrixConfigProps {
  fieldId: string;
  matrix: TemplateRateMatrix;
  onChange: (next: TemplateRateMatrix) => void;
}

function RateMatrixConfig({ fieldId, matrix, onChange }: RateMatrixConfigProps) {
  const [tsvText, setTsvText] = useState('');
  const [tsvErrors, setTsvErrors] = useState<string[]>([]);
  const [tsvSuccess, setTsvSuccess] = useState('');

  const patch = (next: Partial<TemplateRateMatrix>) => onChange({ ...matrix, ...next });

  const addRow = () => {
    patch({
      rows: [...matrix.rows, {
        id: matrixUid('row'),
        label: `${(matrix.rowLabel || 'Row').trim()} ${matrix.rows.length + 1}`,
      }],
    });
  };
  const addCol = () => {
    patch({
      cols: [...matrix.cols, {
        id: matrixUid('col'),
        label: `${(matrix.colLabel || 'Column').trim()} ${matrix.cols.length + 1}`,
      }],
    });
  };
  const removeRow = (id: string) => {
    const { [id]: _gone, ...rest } = matrix.rates;
    patch({ rows: matrix.rows.filter((r) => r.id !== id), rates: rest });
  };
  const removeCol = (id: string) => {
    const rates: TemplateRateMatrix['rates'] = {};
    for (const [rowId, byCol] of Object.entries(matrix.rates)) {
      const { [id]: _gone, ...rest } = byCol;
      rates[rowId] = rest;
    }
    patch({ cols: matrix.cols.filter((c) => c.id !== id), rates });
  };
  const setRowLabel = (id: string, label: string) =>
    patch({ rows: matrix.rows.map((r) => (r.id === id ? { ...r, label } : r)) });
  const setColLabel = (id: string, label: string) =>
    patch({ cols: matrix.cols.map((c) => (c.id === id ? { ...c, label } : c)) });
  const setRate = (rowId: string, colId: string, raw: string) => {
    const byCol = { ...(matrix.rates[rowId] ?? {}) };
    const trimmed = raw.trim();
    if (trimmed === '') {
      delete byCol[colId];
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return;
      byCol[colId] = n;
    }
    patch({ rates: { ...matrix.rates, [rowId]: byCol } });
  };

  const applyTsv = () => {
    const result = parseRateMatrixTsv(tsvText);
    if ('errors' in result) {
      setTsvErrors(result.errors);
      setTsvSuccess('');
      return;
    }
    onChange({ ...matrix, rows: result.rows, cols: result.cols, rates: result.rates });
    setTsvErrors([]);
    setTsvText('');
    setTsvSuccess(
      `Imported ${result.rows.length} row${result.rows.length === 1 ? '' : 's'} × ${result.cols.length} column${result.cols.length === 1 ? '' : 's'} — the grid above was replaced.`,
    );
  };

  return (
    <div className="qq-field-matrix" data-testid={`field-matrix-${fieldId}`}>
      <div className="qq-field-grid-2">
        <FloatField
          label="Row label"
          htmlFor={`field-matrix-rowlabel-${fieldId}`}
          infoText='Title over the FIRST dropdown customers see — e.g. "Pickup zone" or "Port".'
          infoTestid={`field-matrix-rowlabel-${fieldId}-info`}
        >
          <input
            id={`field-matrix-rowlabel-${fieldId}`}
            type="text"
            className="premium-input qq-field-input"
            placeholder=" "
            value={matrix.rowLabel}
            onChange={(e) => patch({ rowLabel: e.target.value })}
            data-testid={`field-matrix-rowlabel-${fieldId}`}
          />
        </FloatField>
        <FloatField
          label="Column label"
          htmlFor={`field-matrix-collabel-${fieldId}`}
        >
          <input
            id={`field-matrix-collabel-${fieldId}`}
            type="text"
            className="premium-input qq-field-input"
            placeholder=" "
            value={matrix.colLabel}
            onChange={(e) => patch({ colLabel: e.target.value })}
            data-testid={`field-matrix-collabel-${fieldId}`}
          />
        </FloatField>
      </div>

      <div className="qq-field-matrix-scroll">
        <table className="qq-field-matrix-table" data-testid={`field-matrix-grid-${fieldId}`}>
          <thead>
            <tr>
              <th className="qq-field-matrix-corner" scope="col" aria-label="Rates table corner">$</th>
              {matrix.cols.map((c, ci) => (
                <th key={c.id} scope="col">
                  <div className="qq-field-matrix-headcell">
                    <input
                      type="text"
                      className="qq-field-input qq-field-matrix-headinput"
                      value={c.label}
                      onChange={(e) => setColLabel(c.id, e.target.value)}
                      aria-label={`Column ${ci + 1} label`}
                      data-testid={`field-matrix-col-${fieldId}-${ci}`}
                    />
                    <button
                      type="button"
                      className="qq-iconbtn is-danger"
                      onClick={() => removeCol(c.id)}
                      disabled={matrix.cols.length <= 1}
                      aria-label={`Remove column ${c.label || ci + 1}`}
                      data-testid={`field-matrix-removecol-${fieldId}-${ci}`}
                    >
                      <X aria-hidden="true" width={12} height={12} strokeWidth={2} />
                    </button>
                  </div>
                </th>
              ))}
              {/* Spacer over the per-row remove column so the grid lines up. */}
              <th className="qq-field-matrix-rowactions" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r, ri) => (
              <tr key={r.id}>
                <th scope="row">
                  <input
                    type="text"
                    className="qq-field-input qq-field-matrix-headinput"
                    value={r.label}
                    onChange={(e) => setRowLabel(r.id, e.target.value)}
                    aria-label={`Row ${ri + 1} label`}
                    data-testid={`field-matrix-row-${fieldId}-${ri}`}
                  />
                </th>
                {matrix.cols.map((c, ci) => (
                  <td key={c.id}>
                    <input
                      type="number"
                      className="qq-field-input qq-field-matrix-rate"
                      value={matrix.rates[r.id]?.[c.id] ?? ''}
                      onChange={(e) => setRate(r.id, c.id, e.target.value)}
                      placeholder="—"
                      aria-label={`Rate for ${r.label || `row ${ri + 1}`} × ${c.label || `column ${ci + 1}`}`}
                      data-testid={`field-matrix-rate-${fieldId}-${ri}-${ci}`}
                    />
                  </td>
                ))}
                <td className="qq-field-matrix-rowactions">
                  <button
                    type="button"
                    className="qq-iconbtn is-danger"
                    onClick={() => removeRow(r.id)}
                    disabled={matrix.rows.length <= 1}
                    aria-label={`Remove row ${r.label || ri + 1}`}
                    data-testid={`field-matrix-removerow-${fieldId}-${ri}`}
                  >
                    <X aria-hidden="true" width={12} height={12} strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="qq-field-matrix-actions">
        <button
          type="button"
          className="qq-field-add-option"
          onClick={addRow}
          data-testid={`field-matrix-addrow-${fieldId}`}
        >+ Add row</button>
        <button
          type="button"
          className="qq-field-add-option"
          onClick={addCol}
          data-testid={`field-matrix-addcol-${fieldId}`}
        >+ Add column</button>
      </div>
      <p className="qq-field-hint">
        Blank cells follow the “when a cell is blank” rule under Advanced
        (quoted individually by default — the lead is still captured).
      </p>

      <AdvancedSection id={`field-matrix-${fieldId}`} label="Advanced" hint="blank cells & spreadsheet import">
        <div className="qq-field-required-cluster">
          <span className="qq-field-width-label">When a cell is blank</span>
          <div className="qq-field-width-segmented" role="group" aria-label="Missing-cell behavior">
            <button
              type="button"
              className={`qq-field-width-btn${(matrix.missingCell ?? 'custom_quote') === 'custom_quote' ? ' is-active' : ''}`}
              aria-pressed={(matrix.missingCell ?? 'custom_quote') === 'custom_quote'}
              onClick={() => patch({ missingCell: 'custom_quote' })}
              data-testid={`field-matrix-missing-custom-${fieldId}`}
            >Quote individually</button>
            <button
              type="button"
              className={`qq-field-width-btn${matrix.missingCell === 'zero' ? ' is-active' : ''}`}
              aria-pressed={matrix.missingCell === 'zero'}
              onClick={() => patch({ missingCell: 'zero' })}
              data-testid={`field-matrix-missing-zero-${fieldId}`}
            >Treat as $0</button>
          </div>
        </div>

        <div className="qq-field-tsv" data-testid={`field-matrix-tsv-${fieldId}`}>
          <FloatField
            label="Paste from spreadsheet"
            htmlFor={`field-matrix-tsv-${fieldId}`}
            infoText="Copy cells straight from Excel or Google Sheets and paste here. First row = column labels, first column = row labels, the rest = rates. Applying REPLACES the whole grid above."
            infoTestid={`field-matrix-tsv-${fieldId}-info`}
          >
            <textarea
              id={`field-matrix-tsv-${fieldId}`}
              className="premium-input qq-field-input qq-field-textarea"
              placeholder=" "
              rows={5}
              value={tsvText}
              onChange={(e) => {
                setTsvText(e.target.value);
                if (tsvSuccess) setTsvSuccess('');
              }}
              data-testid={`field-matrix-tsv-input-${fieldId}`}
            />
          </FloatField>
          <button
            type="button"
            className="qq-field-add-option"
            onClick={applyTsv}
            disabled={tsvText.trim() === ''}
            data-testid={`field-matrix-tsv-apply-${fieldId}`}
          >Apply to grid</button>
          {tsvErrors.length > 0 && (
            <ul className="qq-field-tsv-errors" data-testid={`field-matrix-tsv-errors-${fieldId}`}>
              {tsvErrors.slice(0, 8).map((err, i) => <li key={i}>{err}</li>)}
              {tsvErrors.length > 8 && <li>…and {tsvErrors.length - 8} more.</li>}
            </ul>
          )}
          {tsvSuccess && (
            <p className="qq-field-tsv-success" data-testid={`field-matrix-tsv-success-${fieldId}`}>
              {tsvSuccess}
            </p>
          )}
        </div>
      </AdvancedSection>
    </div>
  );
}
