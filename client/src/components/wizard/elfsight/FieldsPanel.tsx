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
import InfoCue from './InfoCue';
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
    // COMPONENTS-1 — Wave U-F1 factories. Each one ships sensible defaults
    // so the field looks valid in the preview the instant it's dropped in,
    // before the owner customizes it.
    case 'text':
      return {
        id, name: 'Text', label: 'Your answer', type: 'text',
        placeholder: 'Type here…', validation: 'none',
      };
    case 'multiSelect':
      return {
        id, name: 'Add-ons', label: 'Pick any that apply', type: 'multi_select',
        options: defaultOptions(),
      };
    case 'paragraph':
      return {
        id, name: 'Paragraph', label: 'Paragraph', type: 'paragraph',
        content: 'Edit this paragraph to give customers context — pricing notes, what is included, how the quote works.',
      };
    case 'divider':
      return {
        id, name: 'Divider', label: 'Divider', type: 'divider',
        dividerThickness: 1, dividerTone: 'subtle',
      };
    case 'image':
      return {
        id, name: 'Image', label: 'Image', type: 'image',
        imageUrl: '', imageCaption: '',
      };
    // BUILDER-COMPONENTS — content/CTA factories. Both ship a sensible
    // default so the component reads as a real, working control the instant
    // it's dropped in (before the owner sets the destination).
    case 'button':
      return {
        id, name: 'Button', label: 'Call us', type: 'button',
        buttonAction: 'tel', href: '',
      };
    case 'link':
      return {
        id, name: 'Link', label: 'Visit our website', type: 'link',
        href: '',
      };
    // FIELD-PALETTE — surface the existing engine types in the picker.
    case 'toggle':
      return {
        id, name: 'Toggle', label: 'Yes / no option', type: 'toggle',
        on_value: 0, default_value: 0,
      };
    case 'video':
      return {
        id, name: 'Video', label: 'Video', type: 'video',
        videoUrl: '', videoCaption: '',
      };
    // WIZARD-GAPS — contact-form factory. Ships a sensible heading + the
    // default required set (name + email). Submits via the existing /api/leads
    // path at render time (see AdvancedCalculator FieldInput contact_form case).
    case 'contact_form':
      return {
        id, name: 'Contact form', label: 'Get in touch', type: 'contact_form',
        contactRequire: ['name', 'email'],
      };
    // PRICING-MODELS — U0 foundation factories. Sane defaults per the
    // pricing-models spec; the dedicated config editors land in U3.
    case 'address_distance':
      return {
        id, name: 'Distance', label: 'Your address', type: 'address_distance',
        distanceUnit: 'miles', roundTrip: false, allowManualDistance: true,
      };
    case 'rate_matrix': {
      // Seed a filled 2×2 so the widget shows a real rate the instant the
      // field is dropped in (same convention as the other factories).
      const rows = [
        { id: uid('row'), label: 'Zone A' },
        { id: uid('row'), label: 'Zone B' },
      ];
      const cols = [
        { id: uid('col'), label: 'Zone 1' },
        { id: uid('col'), label: 'Zone 2' },
      ];
      return {
        id, name: 'Lane Rate', label: 'Select your route', type: 'rate_matrix',
        matrix: {
          rowLabel: 'Pickup zone', colLabel: 'Drop-off zone',
          rows, cols,
          rates: {
            [rows[0].id]: { [cols[0].id]: 100, [cols[1].id]: 150 },
            [rows[1].id]: { [cols[0].id]: 150, [cols[1].id]: 200 },
          },
          missingCell: 'custom_quote',
        },
      };
    }
    case 'photo_upload':
      return {
        id, name: 'Photos', label: 'Add photos of the job', type: 'photo_upload',
        maxPhotos: 3, maxPhotoMb: 8,
      };
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
      data-theme="light"
      className="qq-fields-panel"
      data-testid="editor-fields-panel"
      data-edit-key="fields"
      aria-label="Calculator fields"
    >
      <header className="qq-fields-header">
        <div>
          <h3 className="qq-fields-title">
            {/* QW-1 — cue moved to FIRST child (top-left of the header) to
             * match the THEME/NUMBER-FORMATTING pattern on every other tab
             * (DESIGN-SYSTEM hard rule §2 + §5: cue always top-left, one
             * pattern per surface). */}
            <InfoCue
              testid="build-section-fields"
              region="step-content"
              text="What customers see and interact with — sliders, dropdowns, image choices, headings, etc. Drag to reorder; each one feeds into your calculations below."
            />
            <span>Fields</span>
          </h3>
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
              <li key={f.id} className="qq-fields-li" data-first={i === 0 ? '1' : '0'}>
                <FieldRow
                  field={f}
                  allFields={fields}
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
          /* W-SECTIONS — tightened gap so the section title sits right
           * above the first input row (6px instead of 12px). */
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-fields-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
          /* W-SECTIONS — keep title flush with the input row below. */
          margin: 0 0 0;
        }
        .qq-fields-title {
          /* W-SECTIONS — subtle all-caps label, per Alex's global rule
           * "section titles smaller, more subtle, closer to inputs".
           * QW-1 — inline-flex with the InfoCue as the FIRST child so the
           * cue sits top-left of the section title (matches every other
           * tab; DESIGN-SYSTEM hard rule §2/§5). */
          margin: 0;
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
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
        .qq-fields-li { position: relative; }
        /* Wave L E6 — stronger drag handle contrast on mobile so it's
         * easier to discover than the desktop subtle treatment. */
        @media (max-width: 768px) {
          .qq-field-row-handle,
          .qq-calc-row-handle {
            color: #475569 !important;
          }
        }
      `}</style>
    </section>
  );
}
