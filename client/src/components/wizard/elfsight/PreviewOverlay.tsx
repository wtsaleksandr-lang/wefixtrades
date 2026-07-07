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
  /**
   * feat/inline-editing — click the per-field pencil to inline-edit that
   * field's LABEL directly on the preview. When provided, each decorator draws
   * a small pencil affordance (hover/focus revealed, like the remove badge) at
   * the field's top-left corner. PreviewPane wires this to its shared section
   * editor (commits via onUpdateField(id, { label })). Optional — when absent
   * no pencil is drawn (the overlay stays remove-only). This overlay is mounted
   * ONLY inside the editor preview, never on the published widget, so the
   * affordance is inherently preview-only (no editableTitle gate needed).
   */
  onEditLabel?: (fieldId: string) => void;
  /**
   * Apple-mobile-clean (2026-06-05) — on a real ≤768px viewport the preview
   * is a clean Elfsight-style scrollable calculator with no editor chrome;
   * field removal happens in the Build panel sheet instead. When true the
   * per-field remove (−) badge is not rendered. The selection ring + select
   * markers are kept so live selection / scroll-into-view still work. Desktop
   * passes this falsey so the badge renders exactly as before. */
  hideRemove?: boolean;
}

interface FieldBox {
  fieldId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Read all rendered preview field nodes and map them to shell fields BY ID.
 *
 * Wave 60 — switched from positional-index mapping to a stable ID lookup.
 * Previously this iterated `fieldNodes` and `fields` in lockstep, assigning
 * `fields[i].id` to `fieldNodes[i]`. That assumption broke once the multi-
 * step renderer filtered `visibleFields → renderedFields` (the widget only
 * paints the current step's fields, so DOM node `i` could correspond to
 * `fields[i + k]` for some offset `k`). Clicking the second visible widget
 * field in the preview therefore selected the wrong editor row.
 *
 * AdvancedCalculator now emits `data-shell-field-id={f.id}` on each rendered
 * field wrapper; we read that attribute and resolve the matching
 * `TemplateField` from the shell's `fields[]` by id. Nodes without a known
 * id are skipped (e.g. legacy seed placeholders the shell doesn't track).
 */
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
  // Desktop-zoom fix (fix/preview-selection-rect) — on desktop the overlay
  // host lives inside `.qq-preview-stage`, which carries
  // `transform: scale(zoom)` (scale-to-fit / the zoom pill). Every
  // getBoundingClientRect() below returns POST-transform (scaled) screen
  // coordinates, but the decorators are absolutely-positioned children of
  // the host and therefore live in the host's UNSCALED local coordinate
  // space. Without normalising, each selection ring was drawn at
  // `zoom ×` its true offset/size — at zoom < 1 the blue ring floated
  // up-left over the WRONG components (Alex's stray-rectangle screenshots).
  // Derive the effective scale empirically from the host itself
  // (rect width ÷ offsetWidth — the exact technique measureTitle uses in
  // PreviewPane), so it's exactly 1 on the mobile-clean / fullscreen paths
  // (no scaled ancestor → behaviour unchanged) and equals `zoom` on the
  // desktop stage. scrollTop/Left are already unscaled layout px, so they
  // are added AFTER the division. The resulting content coordinates are
  // zoom-invariant, so a later zoom change needs no re-measure (the
  // ancestor transform scales fields and decorators together).
  const rawScale = container.offsetWidth > 0
    ? containerRect.width / container.offsetWidth
    : 1;
  const s = rawScale > 0 ? rawScale : 1;
  const out: FieldBox[] = [];
  // Build an O(1) lookup so each DOM node's id check is constant-time.
  const knownIds = new Set(fields.map((f) => f.id));
  for (let i = 0; i < fieldNodes.length; i++) {
    const node = fieldNodes[i];
    const fieldId = node.getAttribute('data-shell-field-id');
    if (!fieldId || !knownIds.has(fieldId)) continue;
    const r = node.getBoundingClientRect();
    // Phone-frame fix — the container (overlayHost) is now a real scroll
    // container on mobile. This overlay is absolutely positioned INSIDE it,
    // so it scrolls along with the content; decorator coordinates must be
    // CONTENT offsets, not viewport-relative deltas. Adding scrollTop/Left
    // converts the rect delta (which shrinks as the host scrolls) back to
    // the content coordinate. At scroll 0 this is a no-op, so desktop and
    // the unscrolled mobile frame behave exactly as before.
    out.push({
      fieldId,
      left: (r.left - containerRect.left) / s + container.scrollLeft,
      top: (r.top - containerRect.top) / s + container.scrollTop,
      width: r.width / s,
      height: r.height / s,
    });
  }
  return { fieldBoxes: out };
}

export default function PreviewOverlay({
  fields, containerRef, onRemoveField, onEditLabel, hideRemove = false,
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
      data-theme="light"
      className="qq-preview-overlay"
      aria-hidden="false"
      data-testid="preview-overlay"
    >
      {boxes.map((b) => (
        <FieldDecorator
          key={b.fieldId}
          box={b}
          onRemove={() => onRemoveField(b.fieldId)}
          onEditLabel={onEditLabel ? () => onEditLabel(b.fieldId) : undefined}
          hideRemove={hideRemove}
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
         * Remove-glyph visibility fix — the badge used to rest at opacity:0.7
         * (ALWAYS visible). On dark templates the faint "−" chips floating at
         * each field's corner read as "broken". It's now a proper hover/
         * selection affordance: HIDDEN by default on desktop (pointer:fine),
         * revealed only when (a) the field cell is hovered, (b) the remove
         * button itself is hovered/focused (keyboard), or (c) the field is
         * selected. The wrapper is pointer-events:none for CLICKS (so controls
         * underneath stay interactive). The button itself keeps
         * pointer-events:auto, so its own :hover reveals it and clicking it
         * removes the field; :focus-within still fires on a pointer-events:none
         * wrapper (focus isn't pointer-gated), so keyboard users get it too.
         * Selection (.is-selected, set by the bezel click delegation in
         * PreviewPane) also reveals it — so a single click on a field surfaces
         * its remove. Mobile (pointer:coarse) keeps the badge always visible
         * since there's no hover and the tap target must be reachable. */
        .qq-preview-field-deco-remove {
          position: absolute;
          top: -22px; right: -22px;
          width: 44px; height: 44px;
          padding: 0; margin: 0;
          background: transparent; border: 0;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.12s ease;
          z-index: 2;
          pointer-events: auto;
        }
        /* Desktop / fine-pointer: reveal on button hover or keyboard
         * focus-within ONLY. (The wrapper is pointer-events:none so a wrapper
         * :hover can't fire — button :hover is the corner reveal.)
         * BUG 4B — selection no longer reveals it: a plain click-select used
         * to pop a stray red "−" chip at the corner on EVERY field click. The
         * remove affordance is now hover/keyboard-only, so selection alone is
         * clean. Delete stays reachable via hover (pointer) and focus (kbd). */
        @media (pointer: fine) {
          .qq-preview-field-deco:focus-within .qq-preview-field-deco-remove,
          .qq-preview-field-deco-remove:hover,
          .qq-preview-field-deco-remove:focus-visible {
            opacity: 1;
          }
        }
        @media (pointer: coarse) {
          /* On touch devices show the remove icon always so it's reachable
           * (no hover state to reveal it). */
          .qq-preview-field-deco-remove { opacity: 1; }
        }
        /* Wave L E2 — shrunk the visible glyph from 22px → 18px so the
         * minus icon doesn't dominate each field row. Hit-target stays 44×44
         * via the parent button. */
        .qq-preview-field-deco-remove-glyph {
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(255,255,255,1); color: ${p.colors.muted};
          border: 1px solid ${p.colors.border};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; line-height: 1;
          box-shadow: 0 1px 4px rgba(15,23,42,0.18);
          transition: color 0.12s ease, border-color 0.12s ease;
        }
        /* Destructive intent is revealed on intent only: the resting glyph is a
         * neutral grey outline (reads as a plain control, not an error), and it
         * turns red on hover/focus of the remove button itself.
         * BUG 4B — selection no longer turns it red: the stray red corner chip
         * on every field click came from the is-selected rule here. Red is now
         * strictly a hover/focus affordance, keeping a plain select neutral. */
        .qq-preview-field-deco-remove:hover .qq-preview-field-deco-remove-glyph,
        .qq-preview-field-deco-remove:focus-visible .qq-preview-field-deco-remove-glyph {
          color: ${p.colors.danger};
          border-color: ${p.colors.danger};
        }

        /* feat/inline-editing — per-field LABEL edit pencil. Mirrors the remove
         * badge's affordance model exactly (44×44 tap target, hover/focus
         * revealed on fine pointers, always visible on coarse) but sits at the
         * field's TOP-LEFT corner so it never collides with the remove (−) badge
         * at top-right. The wrapper stays pointer-events:none (clicks pass to the
         * field control); the button re-enables pointer events for its own
         * hover/click. Editor-only overlay ⇒ never on the published widget. */
        .qq-preview-field-deco-edit {
          position: absolute;
          top: -22px; left: -22px;
          width: 44px; height: 44px;
          padding: 0; margin: 0;
          background: transparent; border: 0;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.12s ease;
          z-index: 2;
          pointer-events: auto;
        }
        @media (pointer: fine) {
          .qq-preview-field-deco:focus-within .qq-preview-field-deco-edit,
          .qq-preview-field-deco-edit:hover,
          .qq-preview-field-deco-edit:focus-visible {
            opacity: 1;
          }
        }
        @media (pointer: coarse) {
          .qq-preview-field-deco-edit { opacity: 1; }
        }
        .qq-preview-field-deco-edit-glyph {
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(255,255,255,1); color: ${p.colors.muted};
          border: 1px solid ${p.colors.border};
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 1px 4px rgba(15,23,42,0.18);
          transition: color 0.12s ease, border-color 0.12s ease;
        }
        .qq-preview-field-deco-edit:hover .qq-preview-field-deco-edit-glyph,
        .qq-preview-field-deco-edit:focus-visible .qq-preview-field-deco-edit-glyph {
          color: ${p.colors.accent};
          border-color: ${p.colors.accent};
        }
      `}</style>
    </div>
  );
}

interface FieldDecoratorProps {
  box: FieldBox;
  onRemove: () => void;
  /** feat/inline-editing — inline-edit this field's label (pencil). Optional. */
  onEditLabel?: () => void;
  /** Hide the remove (−) badge on real mobile — see Props.hideRemove. */
  hideRemove?: boolean;
}

function FieldDecorator({ box, onRemove, onEditLabel, hideRemove = false }: FieldDecoratorProps) {
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
      {onEditLabel && (
        <button
          type="button"
          className="qq-preview-field-deco-edit"
          aria-label="Edit field label"
          title="Edit label"
          data-testid={`preview-field-edit-${box.fieldId}`}
          onClick={(e) => { e.stopPropagation(); onEditLabel(); }}
        >
          <span className="qq-preview-field-deco-edit-glyph" aria-hidden="true">
            <svg
              width={11} height={11} viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
            </svg>
          </span>
        </button>
      )}
      {!hideRemove && (
        <button
          type="button"
          className="qq-preview-field-deco-remove"
          aria-label="Remove field"
          data-testid={`preview-field-remove-${box.fieldId}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <span className="qq-preview-field-deco-remove-glyph" aria-hidden="true">−</span>
        </button>
      )}
    </div>
  );
}

