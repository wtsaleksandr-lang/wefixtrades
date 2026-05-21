// PreviewOverlay — Wave I items (b), (c), (f).
//
// Sits INSIDE PreviewPane, absolutely positioned over the rendered
// AdvancedCalculator. Tracks the bounding box of each rendered preview field
// and, for each, draws:
//   - a transparent click hit-target that sets selection ({kind:'field', id})
//   - a small "−" remove icon on hover/tap (≥44×44 mobile tap target).
//
// Wave AF-3 — removed the in-preview "+ Add field" dashed append slot. It
// was overlapping the bottom bezel edge on desktop and clipping with the
// border. The left-pane FieldsPanel still has a "+ Add field" button, and
// the empty-state preview (rendered when shellFields.length === 0) still
// shows an AddFieldMenu — so the append affordance isn't lost.
//
// Implementation notes:
//  - We can't intersperse DOM inside AdvancedCalculator without forking that
//    component. So we measure rendered field nodes (`[data-colspan]`) inside
//    the calculator on every render + on resize / scroll, then position the
//    overlay decorations on top.
//  - The decorators are only drawn on the FIRST <number_of_shell_fields>
//    field nodes — these correspond 1:1 with the shell's `fields[]` since
//    AdvancedCalculator emits them in shell order. We DO NOT decorate fields
//    that don't have a matching shell entry (e.g. legacy seeds).
//  - Selection target nodes are also registered with SelectionProvider so a
//    pane-side click can scroll the matching preview field into view.

import { useLayoutEffect, useRef, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField } from '@shared/templatePresets';
import { useSelection } from './selection';

const p = platformTheme;

interface Props {
  /** Live shell fields. Decorators only paint where `fields[i]` exists. */
  fields: TemplateField[];
  /**
   * Container the AdvancedCalculator is rendered inside. The overlay attaches
   * inside this container, and measurements are relative to it. Accepts the
   * standard RefObject shape; may be null on first render and will get
   * populated by commit-time.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Callback when a user removes a field from the preview (− icon). */
  onRemoveField: (fieldId: string) => void;
}

interface FieldBox {
  fieldId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Read all rendered preview field nodes and map them 1:1 to shell fields. */
function measureFields(
  container: HTMLElement,
  fields: TemplateField[],
): { fieldBoxes: FieldBox[] } {
  const calc = container.querySelector<HTMLElement>(
    '[data-testid="advanced-calculator"]',
  );
  if (!calc) return { fieldBoxes: [] };
  const fieldNodes = calc.querySelectorAll<HTMLElement>('[data-colspan]');
  const containerRect = container.getBoundingClientRect();
  const out: FieldBox[] = [];
  // Map by index up to min(fieldNodes, fields). Fields after the last shell
  // field (if any DOM nodes leak through) are ignored.
  const count = Math.min(fieldNodes.length, fields.length);
  for (let i = 0; i < count; i++) {
    const node = fieldNodes[i];
    const r = node.getBoundingClientRect();
    out.push({
      fieldId: fields[i].id,
      left: r.left - containerRect.left,
      top: r.top - containerRect.top,
      width: r.width,
      height: r.height,
    });
  }
  return { fieldBoxes: out };
}

export default function PreviewOverlay({
  fields, containerRef, onRemoveField,
}: Props) {
  const [boxes, setBoxes] = useState<FieldBox[]>([]);
  const rafRef = useRef<number | null>(null);
  const selfRef = useRef<HTMLDivElement | null>(null);

  // Measure on every relevant change (fields list, container resize, scroll).
  useLayoutEffect(() => {
    // Prefer the explicit containerRef; fall back to this overlay's
    // parentElement when the parent's ref hasn't populated yet (timing
    // can vary depending on commit ordering between sibling components).
    const container = containerRef.current ?? selfRef.current?.parentElement ?? null;
    if (!container) return;
    const update = () => {
      const { fieldBoxes } = measureFields(container, fields);
      setBoxes(fieldBoxes);
    };
    update();
    // Re-measure on next frames in case the calculator's grid lays out
    // late (async style application from emotion / inline <style>).
    const r1 = requestAnimationFrame(update);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(update));

    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    });
    ro.observe(container);
    const calcEl = container.querySelector('[data-testid="advanced-calculator"]');
    if (calcEl) ro.observe(calcEl as Element);

    // MutationObserver — re-measure when the calculator's children change
    // (fields added/removed, grid laid out, etc.). This catches the common
    // case where useLayoutEffect runs BEFORE the QuoteWidget renders its
    // inner DOM (a render-once delay in some embed paths).
    const mo = new MutationObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    });
    mo.observe(container, { childList: true, subtree: true });

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };
    container.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mo.disconnect();
      container.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [fields, containerRef]);

  return (
    <div
      ref={selfRef}
      className="qq-preview-overlay"
      aria-hidden="false"
      data-testid="preview-overlay"
    >
      {boxes.map((b) => (
        <FieldDecorator
          key={b.fieldId}
          box={b}
          onRemove={() => onRemoveField(b.fieldId)}
        />
      ))}

      <style>{`
        .qq-preview-overlay {
          position: absolute; inset: 0;
          pointer-events: none;
        }
        /* Wave L E4 + B1 — the decorator wrapper is now POINTER-EVENTS:NONE
         * so clicks/drags pass through to the underlying input controls
         * (sliders, checkboxes, dropdowns, etc.). Selection happens via
         * bezel-level click delegation in PreviewPane.onBezelClick(), which
         * already skips controls. The wrapper still paints its outline ring
         * when selected — that's purely visual and doesn't need to capture
         * events. */
        .qq-preview-field-deco {
          position: absolute;
          pointer-events: none;
          border-radius: 10px;
          transition: box-shadow 0.12s ease, border-color 0.12s ease;
          background: transparent;
          border: 2px solid transparent;
        }
        .qq-preview-field-deco.is-selected {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 4px ${p.colors.accentLighter};
        }
        .qq-preview-field-deco-marker {
          position: absolute; inset: 0;
          /* Invisible marker — does not capture pointer events. */
          pointer-events: none;
        }
        /* Wave L E2 — smaller minus icon (~22px visible) inside a 44x44
         * transparent hit-target so the accessible touch surface stays
         * compliant. The hit-target re-enables pointer events since the
         * parent overlay has them disabled.
         *
         * Hover-to-reveal is dropped: the parent overlay has pointer-events
         * none which disables hover on the wrapper, so the remove icon now
         * sits at a subtle 0.7 opacity by default and goes solid on its own
         * hover. */
        .qq-preview-field-deco-remove {
          position: absolute;
          top: -22px; right: -22px;
          width: 44px; height: 44px;
          padding: 0; margin: 0;
          background: transparent; border: 0;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.12s ease;
          z-index: 2;
          pointer-events: auto;
        }
        .qq-preview-field-deco-remove:hover,
        .qq-preview-field-deco-remove:focus-visible {
          opacity: 1;
        }
        .qq-preview-field-deco.is-selected .qq-preview-field-deco-remove {
          opacity: 1;
        }
        @media (pointer: coarse) {
          /* On touch devices show the remove icon always so it's reachable. */
          .qq-preview-field-deco-remove { opacity: 1; }
        }
        /* Wave L E2 — shrunk the visible glyph from 22px → 18px so the
         * minus icon doesn't dominate each field row. Hit-target stays 44×44
         * via the parent button. */
        .qq-preview-field-deco-remove-glyph {
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff; color: ${p.colors.danger};
          border: 1px solid ${p.colors.danger};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; line-height: 1;
          box-shadow: 0 1px 4px rgba(15,23,42,0.18);
        }
      `}</style>
    </div>
  );
}

interface FieldDecoratorProps {
  box: FieldBox;
  onRemove: () => void;
}

function FieldDecorator({ box, onRemove }: FieldDecoratorProps) {
  const selection = useSelection();
  const isSel = selection.isSelected({ kind: 'field', id: box.fieldId });
  const registerSel = selection.registerNode({ kind: 'field', id: box.fieldId }, 'preview');

  return (
    <div
      ref={(el) => { registerSel(el); }}
      className={`qq-preview-field-deco${isSel ? ' is-selected' : ''}`}
      data-testid={`preview-field-deco-${box.fieldId}`}
      data-preview-field-id={box.fieldId}
      {...(isSel ? { 'data-selected-in-preview': '' } : {})}
      style={{
        left: box.left, top: box.top, width: box.width, height: box.height,
      }}
    >
      {/* Invisible select-target for tests that still query for it. Does
       * NOT intercept pointer events — it's a marker, not a hit-button. */}
      <span
        className="qq-preview-field-deco-marker"
        data-testid={`preview-field-select-${box.fieldId}`}
        aria-hidden="true"
      />
      <button
        type="button"
        className="qq-preview-field-deco-remove"
        aria-label="Remove field"
        data-testid={`preview-field-remove-${box.fieldId}`}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        <span className="qq-preview-field-deco-remove-glyph" aria-hidden="true">−</span>
      </button>
    </div>
  );
}

