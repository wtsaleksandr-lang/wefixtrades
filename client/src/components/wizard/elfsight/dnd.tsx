// dnd.tsx — Wave I shared DnD helpers.
//
// Centralises the sensor + sortable wiring so FieldsPanel, CalculationsPanel,
// and the per-field option list inside FieldRow stay consistent. Also exports
// helpers used by item (b) — drag from AddFieldMenu directly into the preview.
//
// Why centralised: we have one DndContext mounted at the WizardShell level
// (so cross-section drags from the menu into the preview work). Each list
// declares its own SortableContext with a unique container id. The single
// `handleDragEnd` callback in WizardShell routes by container id.
//
// Sensors:
//   - PointerSensor — desktop mouse. activationConstraint.distance: 4 so a
//     plain click on the drag handle still selects/expands the row.
//   - TouchSensor — phones / tablets. delay: 250ms, tolerance: 5 — long-press
//     to initiate so scrolling stays unaffected.
//   - KeyboardSensor — a11y. Combined with the explicit up/down arrows that
//     still live on each row, this keeps the keyboard story strong.
//
// Performance: arrayMove is the dnd-kit standard for reordering and is O(n).

import { useMemo } from 'react';
import {
  KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Shared sensor config for every DnD surface in the editor. Pointer + Touch
 * + Keyboard sensors with sensible activation thresholds so:
 *  - desktop drag-handle click still toggles the row (4px before drag begins)
 *  - mobile long-press to drag (250ms) leaves regular taps untouched
 *  - keyboard users can reorder via Space-to-grab + arrow keys.
 */
export function useEditorDndSensors() {
  const pointer = useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const keyboard = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  return useSensors(pointer, touch, keyboard);
}

/* ── container ids for the cross-section DnD router ──────────────────────
 *
 * Every sortable list and every droppable surface gets a unique container
 * id so the WizardShell's single `onDragEnd` handler can route the event.
 */
export const DND_CONTAINERS = {
  /** Build > Fields sortable list. */
  fields: 'qq-dnd-fields',
  /** Build > Calculations sortable list. */
  calculations: 'qq-dnd-calculations',
  /** Per-field option list inside a FieldRow body. id is field id. */
  fieldOptions: (fieldId: string) => `qq-dnd-options-${fieldId}`,
  /** AddFieldMenu types (draggable, not sortable). */
  addFieldMenu: 'qq-dnd-add-field-menu',
  /** Per-field preview slot id for positional drop. id is field id. */
  previewFieldSlot: (fieldId: string) => `qq-dnd-preview-slot-${fieldId}`,
} as const;

/** Drag-handle visual — kept tiny so it doesn't crowd the row chrome. */
export function DragHandleGlyph() {
  return (
    <svg
      aria-hidden="true" focusable="false"
      width="10" height="14" viewBox="0 0 10 14"
      style={{ display: 'block' }}
    >
      <circle cx="2" cy="2" r="1.4" fill="currentColor" />
      <circle cx="8" cy="2" r="1.4" fill="currentColor" />
      <circle cx="2" cy="7" r="1.4" fill="currentColor" />
      <circle cx="8" cy="7" r="1.4" fill="currentColor" />
      <circle cx="2" cy="12" r="1.4" fill="currentColor" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Stable transition + transform style applied to sortable items. */
export function useSortableStyle(opts: {
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition: string | undefined;
  isDragging: boolean;
}) {
  return useMemo(
    () => ({
      transform: opts.transform
        ? `translate3d(${opts.transform.x}px, ${opts.transform.y}px, 0)`
        : undefined,
      transition: opts.transition,
      opacity: opts.isDragging ? 0.55 : 1,
      zIndex: opts.isDragging ? 2 : 'auto' as const,
    }),
    [opts.transform, opts.transition, opts.isDragging],
  );
}
