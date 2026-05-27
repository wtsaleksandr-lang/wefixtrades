// InlineStyleToolbar — Wave 61.
//
// Webflow / Framer / Figma-style floating toolbar that appears next to the
// currently-selected element in the wizard preview. Clicking a widget field
// surfaces inline cosmetic controls (bold / italic / underline / colour /
// font size / alignment / overflow) RIGHT THERE — no scrolling the left
// pane to find the right tab + section + style sub-panel.
//
// Triggering
//  - Mounted by PreviewPane whenever a field (`kind:'field'`) is selected.
//  - Dismisses on click-outside (anywhere not inside the toolbar OR the
//    selected element), on Escape, and when selection changes to a
//    different element (re-positions for the new one) or to nothing.
//
// Positioning
//  - `position: fixed` against the viewport so the toolbar follows the
//    element even when the preview pane scrolls.
//  - Floats ABOVE the element with an 8 px gap; flips BELOW when the
//    element's top is within 60 px of the viewport top.
//  - Centered horizontally over the element; clamped to viewport edges
//    so the toolbar never overflows the canvas.
//  - Re-measures on scroll / resize / selection change (capture-phase
//    scroll listener catches nested-scroll inside the preview).
//
// Wiring
//  - Reads the current selected field from `useSelection()` and resolves
//    it to a TemplateField via the `fields` prop.
//  - Calls `onUpdateField(fieldId, partial)` for every mutation so the
//    wizard's existing undo stack stays the source of truth.
//
// Honest scope
//  - Wave 61 keeps the toolbar's controls focused on text-style edits
//    (bold / italic / underline / colour / font size / alignment / font
//    family / letter spacing / line height). Wave 62 owns pruning the
//    duplicate controls from the left pane.
//  - The toolbar deliberately does NOT add a dependency on Floating UI;
//    vanilla `getBoundingClientRect` + viewport clamping is enough for
//    the 36 px-tall row.

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  Bold, Italic, Underline, Type,
  AlignLeft, AlignCenter, AlignRight,
  Minus, Plus, MoreHorizontal, ChevronDown,
} from 'lucide-react';
import type { TemplateField, InlineElementStyle, AdvFontFamily } from '@shared/templatePresets';
import { useSelection } from './selection';
import { FONT_FAMILY_LABELS } from './types';

// 8 px gap between the toolbar and the selected element's bounding box.
const TOOLBAR_GAP_PX = 8;
// Approximate toolbar dimensions (used for the flip / clamp math before
// the toolbar lays out its first paint). Real measurements take over on
// the next layout effect.
const TOOLBAR_HEIGHT_PX = 36;
const TOOLBAR_ESTIMATED_WIDTH_PX = 360;
// Flip below the element when there's less than this much room above.
const FLIP_BELOW_THRESHOLD_PX = TOOLBAR_HEIGHT_PX + TOOLBAR_GAP_PX + 8;
// Clamp toolbar this many pixels from the viewport edge so it never
// touches the page chrome.
const VIEWPORT_EDGE_PAD_PX = 8;
// Font size clamp (matches the shared spec).
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;
const FONT_SIZE_DEFAULT = 16;
// Brand-blue active state.
const ACTIVE_BG = '#0d3cfc';

interface Props {
  /** Live shell fields — used to resolve the selected id → TemplateField. */
  fields: TemplateField[];
  /**
   * Container the preview widget is rendered inside. We measure rendered
   * `[data-shell-field-id]` nodes inside this container; the toolbar then
   * fixed-positions itself in viewport space.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Partial update for the selected field. WizardShell maps this to its
   * `setFields` (immutable swap by id) so the existing undo stack picks
   * it up.
   */
  onUpdateField: (fieldId: string, partial: Partial<TemplateField>) => void;
}

interface ToolbarRect {
  /** Selected element bounding rect in VIEWPORT coordinates. */
  elemLeft: number; elemTop: number; elemWidth: number; elemHeight: number;
  /** Toolbar viewport coordinates. */
  left: number; top: number;
  /** True when the toolbar is below the element (top-of-viewport flip). */
  flipped: boolean;
}

/** Read the selected element's bounding rect (viewport coords). */
function measureSelected(
  container: HTMLElement,
  fieldId: string,
  toolbarWidth: number,
  toolbarHeight: number,
): ToolbarRect | null {
  const node = container.querySelector<HTMLElement>(
    `[data-shell-field-id="${cssEscape(fieldId)}"]`,
  );
  if (!node) return null;
  const r = node.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;

  // Decide flip: prefer ABOVE; flip BELOW when there's not enough room.
  const wantAbove = r.top - TOOLBAR_GAP_PX - toolbarHeight >= FLIP_BELOW_THRESHOLD_PX;
  const flipped = !wantAbove;
  const top = flipped
    ? r.bottom + TOOLBAR_GAP_PX
    : r.top - toolbarHeight - TOOLBAR_GAP_PX;

  // Center horizontally over the element, then clamp to viewport edges.
  const centerX = r.left + r.width / 2;
  let left = centerX - toolbarWidth / 2;
  const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1280)
    - toolbarWidth - VIEWPORT_EDGE_PAD_PX;
  if (left < VIEWPORT_EDGE_PAD_PX) left = VIEWPORT_EDGE_PAD_PX;
  if (left > maxLeft) left = maxLeft;

  return {
    elemLeft: r.left, elemTop: r.top, elemWidth: r.width, elemHeight: r.height,
    left, top, flipped,
  };
}

/** Minimal CSS.escape polyfill — TemplateField ids are nanoid-style today
 *  (alphanumeric + dash) but we stay defensive in case a legacy id slipped
 *  in with quoted chars. Native CSS.escape is available in every browser
 *  the wizard targets, but jsdom (tests) sometimes lacks it. */
function cssEscape(s: string): string {
  if (typeof window !== 'undefined' && typeof (window as { CSS?: { escape?: (v: string) => string } }).CSS?.escape === 'function') {
    return (window as { CSS: { escape: (v: string) => string } }).CSS.escape(s);
  }
  return s.replace(/["\\]/g, '\\$&');
}

export default function InlineStyleToolbar({
  fields, containerRef, onUpdateField,
}: Props) {
  const selection = useSelection();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<ToolbarRect | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Resolve selection → field (or null if not a field selection).
  const selectedField = useMemo<TemplateField | null>(() => {
    const sel = selection.selected;
    if (!sel || sel.kind !== 'field') return null;
    return fields.find((f) => f.id === sel.id) ?? null;
  }, [selection.selected, fields]);

  // Re-measure on selection change, scroll, resize, mutation.
  useLayoutEffect(() => {
    if (!selectedField) {
      setRect(null);
      setMoreOpen(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      // Use the toolbar's own measured size when laid out; fall back to the
      // estimated width / height during the first paint.
      const toolbar = toolbarRef.current;
      const w = toolbar?.offsetWidth ?? TOOLBAR_ESTIMATED_WIDTH_PX;
      const h = toolbar?.offsetHeight ?? TOOLBAR_HEIGHT_PX;
      const next = measureSelected(container, selectedField.id, w, h);
      setRect(next);
    };
    update();
    // Re-run on the next frame so the toolbar's real width feeds into the
    // clamp math after the first paint.
    const r1 = requestAnimationFrame(update);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(update));

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };
    // Capture-phase so nested-scroll inside the preview re-positions us.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(container);

    // Re-measure when the calculator's DOM changes (fields added / removed
    // / step transition / etc).
    const mo = new MutationObserver(onScroll);
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [selectedField, containerRef]);

  // Esc dismisses; click-outside dismisses (anywhere not inside the
  // toolbar OR the selected element).
  useEffect(() => {
    if (!selectedField) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        selection.select(null);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const toolbar = toolbarRef.current;
      if (toolbar && toolbar.contains(target)) return;
      const container = containerRef.current;
      if (container) {
        const selectedNode = container.querySelector<HTMLElement>(
          `[data-shell-field-id="${cssEscape(selectedField.id)}"]`,
        );
        if (selectedNode && selectedNode.contains(target)) return;
      }
      // Click landed outside both — clear selection. Use a microtask so
      // that any selection-establishing click (e.g. on a sibling field)
      // still wins over the dismiss.
      selection.select(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [selectedField, selection, containerRef]);

  // Helpers — read current value with sensible fallbacks; write via
  // onUpdateField.
  const inline = selectedField?.inlineStyle ?? {};
  const apply = useCallback((partial: Partial<InlineElementStyle>) => {
    if (!selectedField) return;
    const nextInline: InlineElementStyle = { ...inline, ...partial };
    // Strip explicit `undefined` values so the persisted JSON stays clean.
    (Object.keys(nextInline) as Array<keyof InlineElementStyle>).forEach((k) => {
      if (nextInline[k] === undefined) delete nextInline[k];
    });
    onUpdateField(selectedField.id, { inlineStyle: nextInline });
  }, [selectedField, inline, onUpdateField]);

  const toggleBold = useCallback(() => apply({ bold: !inline.bold }), [apply, inline.bold]);
  const toggleItalic = useCallback(() => apply({ italic: !inline.italic }), [apply, inline.italic]);
  const toggleUnderline = useCallback(() => apply({ underline: !inline.underline }), [apply, inline.underline]);
  const setColor = useCallback((c: string) => {
    if (/^#[0-9a-f]{6}$/i.test(c)) apply({ color: c });
  }, [apply]);
  const currentSize = inline.fontSize ?? FONT_SIZE_DEFAULT;
  const setSize = useCallback((n: number) => {
    if (!Number.isFinite(n)) return;
    apply({ fontSize: Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(n))) });
  }, [apply]);
  const setAlign = useCallback((a: 'left' | 'center' | 'right') => apply({ textAlign: a }), [apply]);
  const setFontFamily = useCallback((f: AdvFontFamily) => apply({ fontFamily: f }), [apply]);
  const setLetterSpacing = useCallback((n: number) => {
    if (Number.isFinite(n)) apply({ letterSpacing: n });
  }, [apply]);
  const setLineHeight = useCallback((n: number) => {
    if (Number.isFinite(n) && n > 0) apply({ lineHeight: n });
  }, [apply]);

  // Don't render anything when there's no field selection or no rect.
  if (!selectedField || !rect) return null;

  return (
    <div
      ref={toolbarRef}
      data-theme="dark"
      className="qq-inline-style-toolbar"
      data-testid="inline-style-toolbar"
      data-flipped={rect.flipped ? 'true' : 'false'}
      role="toolbar"
      aria-label="Inline style toolbar"
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        zIndex: 8000,
      }}
      // Block selection-clear: clicks inside the toolbar shouldn't bubble
      // to the bezel-level click handler that clears widgetSelected.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <ToolbarButton
        label="Bold"
        active={!!inline.bold}
        onClick={toggleBold}
        testId="inline-toolbar-bold"
      >
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={!!inline.italic}
        onClick={toggleItalic}
        testId="inline-toolbar-italic"
      >
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={!!inline.underline}
        onClick={toggleUnderline}
        testId="inline-toolbar-underline"
      >
        <Underline size={14} />
      </ToolbarButton>

      <Divider />

      <ColorPicker value={inline.color ?? null} onChange={setColor} />

      <Divider />

      <FontSizeControl value={currentSize} onChange={setSize} />

      <Divider />

      <ToolbarButton
        label="Align left"
        active={inline.textAlign === 'left'}
        onClick={() => setAlign('left')}
        testId="inline-toolbar-align-left"
      >
        <AlignLeft size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={inline.textAlign === 'center'}
        onClick={() => setAlign('center')}
        testId="inline-toolbar-align-center"
      >
        <AlignCenter size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={inline.textAlign === 'right'}
        onClick={() => setAlign('right')}
        testId="inline-toolbar-align-right"
      >
        <AlignRight size={14} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="More options"
        active={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
        testId="inline-toolbar-more"
      >
        <MoreHorizontal size={14} />
      </ToolbarButton>

      {moreOpen && (
        <MorePopover
          fontFamily={inline.fontFamily}
          letterSpacing={inline.letterSpacing ?? 0}
          lineHeight={inline.lineHeight ?? 1.4}
          onFontFamilyChange={setFontFamily}
          onLetterSpacingChange={setLetterSpacing}
          onLineHeightChange={setLineHeight}
        />
      )}

      <ToolbarStyles />
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  testId?: string;
  children: React.ReactNode;
}

function ToolbarButton({ label, active, onClick, testId, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`qq-ist-btn${active ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={active ? 'true' : 'false'}
      title={label}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="qq-ist-divider" aria-hidden="true" />;
}

interface ColorPickerProps {
  value: string | null;
  onChange: (c: string) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  // Native color input is enough for Wave 61 — keeps zero new deps. The
  // swatch surfaces the current colour; clicking opens the system picker.
  const id = useId('qq-ist-color');
  const swatch = value ?? '#000000';
  return (
    <label
      htmlFor={id}
      className="qq-ist-color"
      title="Text colour"
      data-testid="inline-toolbar-color"
    >
      <span
        className="qq-ist-color-swatch"
        style={{ background: swatch }}
        aria-hidden="true"
      />
      <ChevronDown size={12} aria-hidden="true" />
      <input
        id={id}
        type="color"
        className="qq-ist-color-input"
        value={swatch}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Text colour"
      />
    </label>
  );
}

interface FontSizeControlProps {
  value: number;
  onChange: (n: number) => void;
}

function FontSizeControl({ value, onChange }: FontSizeControlProps) {
  const [draft, setDraft] = useState<string>(String(value));
  // Reconcile draft when external value changes (e.g. undo / redo).
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) onChange(n);
  }, [onChange]);

  return (
    <div className="qq-ist-size" data-testid="inline-toolbar-fontsize">
      <button
        type="button"
        className="qq-ist-btn qq-ist-size-step"
        aria-label="Decrease font size"
        title="Decrease font size"
        onClick={() => onChange(value - 1)}
        data-testid="inline-toolbar-fontsize-minus"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        className="qq-ist-size-input"
        value={draft}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Font size in pixels"
      />
      <button
        type="button"
        className="qq-ist-btn qq-ist-size-step"
        aria-label="Increase font size"
        title="Increase font size"
        onClick={() => onChange(value + 1)}
        data-testid="inline-toolbar-fontsize-plus"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

interface MorePopoverProps {
  fontFamily: AdvFontFamily | undefined;
  letterSpacing: number;
  lineHeight: number;
  onFontFamilyChange: (f: AdvFontFamily) => void;
  onLetterSpacingChange: (n: number) => void;
  onLineHeightChange: (n: number) => void;
}

function MorePopover({
  fontFamily, letterSpacing, lineHeight,
  onFontFamilyChange, onLetterSpacingChange, onLineHeightChange,
}: MorePopoverProps) {
  return (
    <div
      className="qq-ist-more"
      role="dialog"
      aria-label="Advanced text styling"
      data-testid="inline-toolbar-more-popover"
    >
      <div className="qq-ist-more-row">
        <label className="qq-ist-more-label">
          <Type size={12} aria-hidden="true" />
          Font
        </label>
        <select
          className="qq-ist-more-select"
          value={fontFamily ?? ''}
          onChange={(e) => {
            const v = e.target.value as AdvFontFamily;
            if (v) onFontFamilyChange(v);
          }}
          aria-label="Font family"
        >
          <option value="">Inherit</option>
          {(Object.keys(FONT_FAMILY_LABELS) as AdvFontFamily[]).map((k) => (
            <option key={k} value={k}>{FONT_FAMILY_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="qq-ist-more-row">
        <label className="qq-ist-more-label">Letter spacing</label>
        <input
          type="number"
          step={0.5}
          className="qq-ist-more-number"
          value={letterSpacing}
          onChange={(e) => onLetterSpacingChange(parseFloat(e.target.value))}
          aria-label="Letter spacing in pixels"
        />
      </div>
      <div className="qq-ist-more-row">
        <label className="qq-ist-more-label">Line height</label>
        <input
          type="number"
          step={0.1}
          min={0.8}
          max={3}
          className="qq-ist-more-number"
          value={lineHeight}
          onChange={(e) => onLineHeightChange(parseFloat(e.target.value))}
          aria-label="Line height"
        />
      </div>
    </div>
  );
}

/** Lightweight `useId` shim — React 18 ships `useId`, but we keep this
 *  module-local helper so the toolbar stays drop-in for older RSC
 *  consumers if any survive (the rest of the wizard targets React 18+,
 *  so this is belt + braces). */
function useId(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    ref.current = `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return ref.current;
}

function ToolbarStyles() {
  // All toolbar chrome lives inside a `data-theme="dark"` wrapper so the
  // CONTRAST-2 guard doesn't flag the white-on-dark icon colours.
  return (
    <style>{`
      [data-theme="dark"].qq-inline-style-toolbar {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        height: 36px;
        padding: 6px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(20px) saturate(1.1);
        -webkit-backdrop-filter: blur(20px) saturate(1.1);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      [data-theme="dark"] .qq-ist-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 24px;
        min-width: 24px;
        padding: 0 4px;
        border-radius: 6px;
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      [data-theme="dark"] .qq-ist-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
      [data-theme="dark"] .qq-ist-btn:focus-visible {
        outline: 2px solid ${ACTIVE_BG};
        outline-offset: 1px;
      }
      [data-theme="dark"] .qq-ist-btn.is-active {
        background: ${ACTIVE_BG};
        color: #fff;
      }
      [data-theme="dark"] .qq-ist-divider {
        display: inline-block;
        width: 1px;
        height: 18px;
        background: rgba(255, 255, 255, 0.1);
        margin: 0 4px;
      }
      [data-theme="dark"] .qq-ist-color {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        height: 24px;
        padding: 0 4px;
        border-radius: 6px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.8);
        transition: background-color 0.12s ease;
      }
      [data-theme="dark"] .qq-ist-color:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
      [data-theme="dark"] .qq-ist-color-swatch {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      [data-theme="dark"] .qq-ist-color-input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
        width: 100%;
        height: 100%;
      }
      [data-theme="dark"] .qq-ist-size {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      [data-theme="dark"] .qq-ist-size-input {
        width: 32px;
        height: 24px;
        padding: 0;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: #fff;
        font-size: 12px;
        text-align: center;
        -moz-appearance: textfield;
      }
      [data-theme="dark"] .qq-ist-size-input::-webkit-outer-spin-button,
      [data-theme="dark"] .qq-ist-size-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      [data-theme="dark"] .qq-ist-size-input:focus-visible {
        outline: 2px solid ${ACTIVE_BG};
        outline-offset: 1px;
      }
      [data-theme="dark"] .qq-ist-more {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 6px;
        min-width: 220px;
        padding: 10px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      [data-theme="dark"][data-flipped="true"] .qq-ist-more {
        top: auto;
        bottom: 100%;
        margin-top: 0;
        margin-bottom: 6px;
      }
      [data-theme="dark"] .qq-ist-more-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      [data-theme="dark"] .qq-ist-more-label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      [data-theme="dark"] .qq-ist-more-select,
      [data-theme="dark"] .qq-ist-more-number {
        height: 24px;
        padding: 0 6px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: #fff;
        font-size: 12px;
        min-width: 100px;
      }
      [data-theme="dark"] .qq-ist-more-number {
        width: 64px;
        min-width: 64px;
        text-align: right;
      }
    `}</style>
  );
}
