// RowKebab — Apple-clean overflow menu for Build-panel rows.
//
// Elfsight-clean rows collapse the old inline ▲ ▼ ✕ button cluster into a
// single `⋯` kebab on the right of each FieldRow / CalculationRow. Clicking
// the kebab opens a small portaled popover (white card, hairline, 10px radius,
// AE.shadow.pop) with 40px option rows: Move up · Move down · Delete (danger).
//
// The menu items are thin wrappers around the SAME handlers the inline buttons
// used (onMoveUp / onMoveDown / onDelete), so every capability is preserved —
// only the affordance is relocated. Move-up disables on the first row and
// Move-down on the last (mirrors the previous disabled logic).
//
// Reuses InfoCue's proven popover plumbing: portal to document.body,
// getBoundingClientRect placement (auto-flip above), outside-pointerdown +
// Escape dismiss, reposition on scroll/resize.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { AE } from './appleEditor';

interface Props {
  /** Stable id used to build the trigger + menu data-testids. */
  testidBase: string;
  /** Accessible label for the trigger (e.g. "Field actions"). */
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  /** Disable Move up on the first row. */
  disableUp: boolean;
  /** Disable Move down on the last row. */
  disableDown: boolean;
  /**
   * Preserved testids for the relocated actions. We pass the ORIGINAL inline-
   * button testids (`field-row-up-…`, `field-row-remove-…`, etc.) straight
   * onto the matching menu items so existing selectors keep resolving to the
   * live control — only the affordance moved (inline → menu), not the hook.
   */
  upTestid: string;
  downTestid: string;
  deleteTestid: string;
}

const MENU_W = 184;
const MENU_H_EST = 132;

export default function RowKebab({
  testidBase, label, onMoveUp, onMoveDown, onDelete, disableUp, disableDown,
  upTestid, downTestid, deleteTestid,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuId = useId();

  const place = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    // Right-align the menu to the trigger, clamp into the viewport (8px margin).
    const desiredLeft = r.right - MENU_W;
    const left = Math.max(8, Math.min(desiredLeft, vw - 8 - MENU_W));
    const fitsBelow = r.bottom + 6 + MENU_H_EST <= vh - 8;
    const top = fitsBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - MENU_H_EST);
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = () => place();
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, place]);

  // Detect editor-shell theme so the portaled menu can match dark/light chrome.
  const editorTheme = (() => {
    if (typeof document === 'undefined') return 'light';
    const t = triggerRef.current?.closest('.qq-editor-shell') as HTMLElement | null;
    return t?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  })();

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="qq-row-kebab"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-no-select=""
        data-testid={`${testidBase}-menu-trigger`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal aria-hidden="true" width={20} height={20} strokeWidth={2} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="qq-row-kebab-menu"
          data-theme={editorTheme}
          data-testid={`${testidBase}-menu`}
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="qq-row-kebab-item"
            disabled={disableUp}
            onClick={() => run(onMoveUp)}
            data-testid={upTestid}
          >
            <ChevronUp aria-hidden="true" width={16} height={16} strokeWidth={2} />
            <span>Move up</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="qq-row-kebab-item"
            disabled={disableDown}
            onClick={() => run(onMoveDown)}
            data-testid={downTestid}
          >
            <ChevronDown aria-hidden="true" width={16} height={16} strokeWidth={2} />
            <span>Move down</span>
          </button>
          <div className="qq-row-kebab-sep" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="qq-row-kebab-item is-danger"
            onClick={() => run(onDelete)}
            data-testid={deleteTestid}
          >
            <Trash2 aria-hidden="true" width={16} height={16} strokeWidth={2} />
            <span>Delete</span>
          </button>
        </div>,
        document.body,
      )}
      <style>{`
        .qq-row-kebab {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; flex-shrink: 0;
          padding: 0; border-radius: ${AE.radius.sm};
          border: 1px solid transparent; background: transparent;
          color: ${AE.color.secondary}; cursor: pointer; font: inherit;
          transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
        }
        .qq-row-kebab:hover {
          background: ${AE.color.surface};
          color: ${AE.color.text};
        }
        .qq-row-kebab[aria-expanded="true"] {
          background: ${AE.color.surface};
          color: ${AE.color.text};
          border-color: ${AE.color.hairline};
        }
        .qq-row-kebab svg { display: block; }

        .qq-row-kebab-menu {
          position: fixed; z-index: 1000;
          min-width: ${MENU_W}px;
          padding: 6px;
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          box-shadow: ${AE.shadow.pop};
          display: flex; flex-direction: column; gap: 2px;
          font-family: ${AE.font.family};
        }
        .qq-row-kebab-menu[data-theme="dark"] {
          background: #1d1d1f;
          border-color: rgba(255,255,255,0.12);
        }
        .qq-row-kebab-item {
          display: flex; align-items: center; gap: 10px;
          height: 40px; padding: 0 12px; width: 100%;
          border: none; background: transparent; border-radius: ${AE.radius.sm};
          font: inherit; font-size: 14px; font-weight: 500;
          color: ${AE.color.text}; cursor: pointer; text-align: left;
          transition: background 0.1s ease, color 0.1s ease;
        }
        .qq-row-kebab-item:hover:not(:disabled) {
          background: ${AE.color.surface};
        }
        .qq-row-kebab-item:disabled {
          opacity: 0.4; cursor: not-allowed;
        }
        .qq-row-kebab-item.is-danger { color: ${AE.color.danger}; }
        .qq-row-kebab-item.is-danger:hover:not(:disabled) {
          background: rgba(212,51,46,0.08);
        }
        .qq-row-kebab-menu[data-theme="dark"] .qq-row-kebab-item {
          color: rgba(255,255,255,0.92);
        }
        .qq-row-kebab-menu[data-theme="dark"] .qq-row-kebab-item:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
        }
        .qq-row-kebab-item svg { display: block; flex-shrink: 0; }
        .qq-row-kebab-sep {
          height: 1px; margin: 4px 8px;
          background: ${AE.color.hairline};
        }
        .qq-row-kebab-menu[data-theme="dark"] .qq-row-kebab-sep {
          background: rgba(255,255,255,0.12);
        }
      `}</style>
    </>
  );
}
