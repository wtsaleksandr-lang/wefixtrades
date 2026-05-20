// AddFieldMenu — type picker for Build > Fields > "Add field".
//
// Shows 6 field types matching Elfsight's Build tab: slider, number, dropdown,
// choice (radio), imageChoice, heading. The trigger button toggles a popover;
// clicking a type fires `onPick` with the public type id and the parent
// (`FieldsPanel`) maps it to the canonical TemplateField and appends it.
//
// Wave I:
//  - (e) Renders into a React PORTAL on document.body, positioned via the
//    trigger's `getBoundingClientRect()`. This kills the pane-clipping bug
//    where the popover got cropped by the left pane / mobile viewport.
//  - (e) On mobile (≤768px), the menu renders as a full-width BOTTOM SHEET
//    with large tap targets and a backdrop instead of a fiddly dropdown.
//  - (b) Each menu item is also a draggable source via @dnd-kit's
//    `useDraggable`. Dragging an item over the preview pane (DnD root in
//    WizardShell) drops a new field at that position. The simple click-pick
//    path stays the dominant interaction — drag is a power-user shortcut.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { platformTheme } from '@/theme/platformTheme';
import { DND_CONTAINERS } from './dnd';
import type { PublicFieldType } from './types';

const p = platformTheme;

interface Props {
  onPick: (type: PublicFieldType) => void;
  /** True when there are no fields yet — render as the large empty-state CTA. */
  emphasis?: boolean;
}

interface TypeMeta {
  id: PublicFieldType;
  label: string;
  hint: string;
  icon: string;
}

const TYPES: ReadonlyArray<TypeMeta> = [
  { id: 'slider', label: 'Slider', hint: 'Numeric range input', icon: '⇋' },
  { id: 'number', label: 'Number', hint: 'Exact integer / decimal', icon: '#' },
  { id: 'dropdown', label: 'Dropdown', hint: 'Pick one from a list', icon: '▾' },
  { id: 'choice', label: 'Choice', hint: 'Radio-style options', icon: '◉' },
  { id: 'imageChoice', label: 'Image choice', hint: 'Visual option cards', icon: '◧' },
  { id: 'heading', label: 'Heading', hint: 'Section divider text', icon: 'T' },
];

const MOBILE_BREAKPOINT = 768;

/** Window-relative coordinates and metrics for the portal-positioned menu. */
interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
  viewportWidth: number;
  viewportHeight: number;
}

export default function AddFieldMenu({ onPick, emphasis = false }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  });
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  // Track viewport size — switches between dropdown (desktop) and bottom sheet (mobile).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  // Compute anchor position when the popover opens. Re-measure on scroll /
  // resize so the menu tracks the trigger when the user moves the page.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const measure = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setAnchor({
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, isMobile]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock body scroll when the mobile bottom-sheet is open so backdrop taps
  // don't accidentally scroll the underlying editor.
  useEffect(() => {
    if (!open || !isMobile || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  // Compute desktop popover style — anchored below the trigger when there's
  // room, above when there isn't. Clamped within the viewport.
  const desktopMenuStyle: React.CSSProperties | null = (() => {
    if (!anchor) return null;
    const MENU_W = 260;
    const MENU_H_EST = 320;
    const flipUp = anchor.bottom + MENU_H_EST > anchor.viewportHeight - 8;
    let left = anchor.left;
    if (left + MENU_W > anchor.viewportWidth - 8) {
      left = Math.max(8, anchor.viewportWidth - MENU_W - 8);
    }
    return {
      position: 'fixed',
      left,
      top: flipUp ? Math.max(8, anchor.top - 6 - MENU_H_EST) : anchor.bottom + 6,
      width: MENU_W,
      zIndex: 1200,
    };
  })();

  const handlePick = (type: PublicFieldType) => { onPick(type); setOpen(false); };

  const menu = open ? (
    isMobile ? (
      // ── Mobile bottom sheet ───────────────────────────────────────────
      <div
        data-testid="add-field-portal"
        className="qq-addfield-sheet-root"
        role="presentation"
        onMouseDown={(e) => {
          // Tap on the backdrop (root) closes; taps inside the sheet stop.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          ref={menuRef}
          role="menu"
          data-testid="add-field-menu"
          data-add-field-variant="sheet"
          className="qq-addfield-sheet"
        >
          <div className="qq-addfield-sheet-handle" aria-hidden="true" />
          <p className="qq-addfield-sheet-title">Add a field</p>
          {TYPES.map((t) => (
            <DraggableMenuItem
              key={t.id}
              type={t}
              variant="sheet"
              onPick={() => handlePick(t.id)}
            />
          ))}
          <button
            type="button"
            className="qq-addfield-sheet-cancel"
            onClick={() => setOpen(false)}
            data-testid="add-field-cancel"
          >Cancel</button>
        </div>
      </div>
    ) : desktopMenuStyle ? (
      // ── Desktop dropdown in portal ───────────────────────────────────
      <div
        ref={menuRef}
        role="menu"
        data-testid="add-field-menu"
        data-add-field-variant="dropdown"
        className="qq-addfield-menu"
        style={desktopMenuStyle}
      >
        {TYPES.map((t) => (
          <DraggableMenuItem
            key={t.id}
            type={t}
            variant="dropdown"
            onPick={() => handlePick(t.id)}
          />
        ))}
      </div>
    ) : null
  ) : null;

  return (
    <div className="qq-addfield-root" data-testid="add-field-root">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="add-field-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`qq-addfield-trigger${emphasis ? ' is-emphasis' : ''}`}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        <span>Add field</span>
      </button>

      {typeof document !== 'undefined' && menu
        ? createPortal(menu, document.body)
        : null}

      <style>{`
        .qq-addfield-root { position: relative; display: inline-block; }
        .qq-addfield-trigger {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 8px;
          font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.heading};
          border: 1px dashed ${p.colors.border};
          transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
        }
        .qq-addfield-trigger:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
          background: ${p.colors.accentLighter};
        }
        .qq-addfield-trigger.is-emphasis {
          padding: 10px 16px; font-size: 13px;
          background: ${p.colors.accent}; color: #fff;
          border: 1px solid ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-addfield-trigger.is-emphasis:hover {
          background: ${p.colors.accentDark};
          border-color: ${p.colors.accentDark};
          color: #fff;
          box-shadow: ${p.shadows.buttonHover};
        }

        /* Desktop popover (portaled into body, position:fixed) */
        .qq-addfield-menu {
          padding: 6px;
          background: #fff; border-radius: 10px;
          border: 1px solid ${p.colors.borderLight};
          box-shadow: ${p.shadows.lg};
          display: flex; flex-direction: column; gap: 2px;
          animation: qq-addfield-fade-in 140ms ease-out;
        }
        @keyframes qq-addfield-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-addfield-menu { animation: none; }
        }
        .qq-addfield-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 7px;
          font: inherit; cursor: pointer; text-align: left;
          background: transparent; border: none; color: ${p.colors.body};
          transition: background 0.1s ease;
          touch-action: none;
        }
        .qq-addfield-item:hover { background: ${p.colors.surfaceRaised}; }
        .qq-addfield-icon {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
        }
        .qq-addfield-text {
          display: flex; flex-direction: column; gap: 1px; min-width: 0;
        }
        .qq-addfield-label {
          font-size: 12.5px; font-weight: 700; color: ${p.colors.heading};
        }
        .qq-addfield-hint {
          font-size: 11px; font-weight: 500; color: ${p.colors.subtle};
        }

        /* Mobile bottom sheet — full-width, anchored to viewport bottom. */
        .qq-addfield-sheet-root {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(15,23,42,0.45);
          display: flex; align-items: flex-end; justify-content: stretch;
          animation: qq-addfield-sheet-fade 160ms ease-out;
        }
        .qq-addfield-sheet {
          width: 100%; padding: 10px 14px 18px; box-sizing: border-box;
          background: #fff;
          border-radius: 18px 18px 0 0;
          box-shadow: 0 -6px 24px rgba(15,23,42,0.18);
          display: flex; flex-direction: column; gap: 4px;
          animation: qq-addfield-sheet-slide 180ms ease-out;
        }
        @keyframes qq-addfield-sheet-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes qq-addfield-sheet-slide {
          from { transform: translateY(16px); } to { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-addfield-sheet-root, .qq-addfield-sheet { animation: none; }
        }
        .qq-addfield-sheet-handle {
          width: 42px; height: 4px; border-radius: 3px;
          background: ${p.colors.borderLight};
          margin: 0 auto 6px;
        }
        .qq-addfield-sheet-title {
          margin: 4px 4px 8px; font-size: 13px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-addfield-sheet .qq-addfield-item {
          padding: 12px 12px; border-radius: 10px; min-height: 48px;
        }
        .qq-addfield-sheet .qq-addfield-icon {
          width: 32px; height: 32px; font-size: 15px;
        }
        .qq-addfield-sheet .qq-addfield-label { font-size: 13.5px; }
        .qq-addfield-sheet .qq-addfield-hint { font-size: 11.5px; }
        .qq-addfield-sheet-cancel {
          margin-top: 6px; padding: 12px;
          font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.heading};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          min-height: 48px;
        }
      `}</style>
    </div>
  );
}

/* ── one menu item, draggable for item (b) ─────────────────────────────── */

interface DraggableMenuItemProps {
  type: TypeMeta;
  variant: 'dropdown' | 'sheet';
  onPick: () => void;
}

function DraggableMenuItem({ type, variant, onPick }: DraggableMenuItemProps) {
  const {
    attributes, listeners, setNodeRef, isDragging,
  } = useDraggable({
    // Container prefix `addfield:` lets WizardShell's onDragEnd recognise this
    // is a NEW field source vs an existing field id being reordered.
    id: `addfield:${type.id}`,
    data: { source: DND_CONTAINERS.addFieldMenu, publicType: type.id },
  });
  // Spread @dnd-kit attributes (which include role='button'), then explicitly
  // re-assert role='menuitem' after for the parent's role='menu' a11y contract.
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`add-field-${type.id}`}
      data-add-field-variant={variant}
      className="qq-addfield-item"
      onClick={onPick}
      style={{ opacity: isDragging ? 0.55 : 1 }}
      {...attributes}
      {...listeners}
      role="menuitem"
    >
      <span className="qq-addfield-icon" aria-hidden="true">{type.icon}</span>
      <span className="qq-addfield-text">
        <span className="qq-addfield-label">{type.label}</span>
        <span className="qq-addfield-hint">{type.hint}</span>
      </span>
    </button>
  );
}
