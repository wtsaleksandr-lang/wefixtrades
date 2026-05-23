// MobileBottomSheet — Wave BH-3 (simplified by BH-3-fix).
//
// Mobile-only (≤768px) replacement for the desktop side-panel. On phones the
// wizard config panel becomes a bottom sheet à la Notion / Canva / Builder.io
// / Framer / Figma's mobile editor — the canvas stays visible above, the
// sheet slides up from the bottom and snaps between three heights.
//
// Snap heights:
//   - collapsed: ~56px (just the handle + active-tab label)
//   - half:      62vh
//   - full:      88vh
//
// BH-3-fix removed two over-engineered features from the original BH-3 ship:
//   1. The in-sheet search bar — not enough features to justify it.
//   2. The in-sheet tab strip — duplicate of the top chrome's tabs (BH-2).
// The sheet now simply renders the active tab's panel body. Tab switching
// happens UP TOP in the unified chrome; the sheet just reflects whatever
// the parent passes as `children` for the current `activeTab`.
//
// Features retained:
//   1. Sliding sheet with drag handle + tap/swipe to expand/collapse.
//   2. Sticky action footer (Reset / Done) honouring safe-area-inset-bottom.
//   3. Canvas above stays interactive and re-renders live (parent owns the
//      live-preview pane).
//   4. Listens for `qq-wizard:focus-field` so PreviewPane taps can auto-open
//      + switch tab. Section/field scroll is best-effort.
//
// Constraints:
//   - Hidden above 768px via CSS — desktop side-panel stays the path.
//   - GPU-accelerated `transform: translateY()`, 240ms ease-out.
//   - prefers-reduced-motion → no transform animation, snap state changes.
//   - Touch targets >= 44px.
//   - No new deps; native CSS transitions only.
//   - z-index 9998 (above canvas, below AIBubble).

import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { RotateCcw } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;
const d = dashboardTheme;

export type SheetSnap = 'collapsed' | 'half' | 'full';

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onResetTab: () => void;
  onDone: () => void;
  /** Slot containing the active tab's body component (whichever Tab the
   *  top-chrome tab nav has selected). */
  children: ReactNode;
  /** When true, the parent indicates Save is busy. */
  isBusy?: boolean;
  /** Optional initial snap state (defaults to 'collapsed'). */
  initialSnap?: SheetSnap;
}

const STORAGE_KEY = 'qq_wizard_sheet_snap';

function readPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function loadSnap(initial: SheetSnap): SheetSnap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'collapsed' || raw === 'half' || raw === 'full') return raw;
  } catch { /* private mode */ }
  return initial;
}

export default function MobileBottomSheet({
  activeTab, onTabChange, onResetTab, onDone,
  children, isBusy = false, initialSnap = 'collapsed',
}: Props) {
  const [snap, setSnapInner] = useState<SheetSnap>(() => loadSnap(initialSnap));
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const reduceMotion = useMemo(readPrefersReduced, []);

  const setSnap = useCallback((next: SheetSnap) => {
    setSnapInner(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // ── Cycle on handle tap: collapsed → half → full → collapsed ──────
  const cycleSnap = useCallback(() => {
    setSnap(snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed');
  }, [snap, setSnap]);

  // ── Drag-to-resize (touch) ────────────────────────────────────────
  const dragStartYRef = useRef<number | null>(null);
  const dragStartSnapRef = useRef<SheetSnap>('collapsed');
  const sheetRef = useRef<HTMLDivElement>(null);

  const onHandlePointerDown = useCallback((ev: React.PointerEvent) => {
    dragStartYRef.current = ev.clientY;
    dragStartSnapRef.current = snap;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }, [snap]);

  const onHandlePointerMove = useCallback((ev: React.PointerEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = ev.clientY - dragStartYRef.current;
    // Threshold-based snap selection. Up = expand, down = collapse.
    if (Math.abs(delta) < 24) return;
    const start = dragStartSnapRef.current;
    if (delta < -48) {
      // Drag UP
      if (start === 'collapsed') setSnap('half');
      else if (start === 'half') setSnap('full');
    } else if (delta > 48) {
      // Drag DOWN
      if (start === 'full') setSnap('half');
      else if (start === 'half') setSnap('collapsed');
    }
  }, [setSnap]);

  const onHandlePointerUp = useCallback((ev: React.PointerEvent) => {
    dragStartYRef.current = null;
    try { (ev.target as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
  }, []);

  // Scroll container ref kept so `qq-wizard:focus-field` can scroll into view.
  const contentRef = useRef<HTMLDivElement>(null);

  // ── BH-3 — `qq-wizard:focus-field` listener ───────────────────────
  //
  // PreviewPane can dispatch `new CustomEvent('qq-wizard:focus-field', {
  //   detail: { tabId, sectionId, fieldId } })` and we'll:
  //   - switch active tab
  //   - expand to 'half' snap (if currently collapsed)
  //   - scroll the section / field into view + transient highlight
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ev = e as CustomEvent<{ tabId?: EditorTab; sectionId?: string; fieldId?: string }>;
      const { tabId, sectionId, fieldId } = ev.detail ?? {};
      if (tabId) onTabChange(tabId);
      setSnap(snap === 'collapsed' ? 'half' : snap);
      // Defer scroll until the tab body re-renders.
      requestAnimationFrame(() => {
        const root = contentRef.current;
        if (!root) return;
        const target =
          (sectionId && root.querySelector(`[data-testid="${sectionId}"]`))
          ?? (fieldId && root.querySelector(`[data-testid="${fieldId}"]`))
          ?? null;
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
          target.setAttribute('data-sheet-highlight', 'true');
          setTimeout(() => target.removeAttribute('data-sheet-highlight'), 1400);
        }
      });
    };
    window.addEventListener('qq-wizard:focus-field', onFocus as EventListener);
    return () => window.removeEventListener('qq-wizard:focus-field', onFocus as EventListener);
  }, [onTabChange, setSnap, snap, reduceMotion]);

  // Reset confirm flow — show inline pill for ~3s; confirming fires onResetTab.
  const onResetClick = useCallback(() => {
    if (showResetConfirm) {
      onResetTab();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3000);
    }
  }, [onResetTab, showResetConfirm]);

  const activeTabLabel =
    EDITOR_TABS.find((t) => t.id === activeTab)?.label ?? 'Style';

  // Backdrop click — collapses to handle. Only intercepts taps on the
  // backdrop element itself (not on the sheet or canvas above).
  const onBackdropClick = useCallback(() => {
    setSnap('collapsed');
  }, [setSnap]);

  return (
    <>
      {/* Backdrop — only paints when sheet is expanded. */}
      {snap !== 'collapsed' && (
        <div
          className="qq-sheet-backdrop"
          data-testid="wizard-sheet-backdrop"
          onClick={onBackdropClick}
          aria-hidden="true"
        />
      )}

      <div
        ref={sheetRef}
        data-theme="light"
        className={`qq-sheet qq-sheet--${snap}${reduceMotion ? ' is-reduced-motion' : ''}`}
        data-testid="wizard-bottom-sheet"
        data-snap={snap}
        role="dialog"
        aria-label="Wizard configuration"
        aria-modal={snap === 'full' ? 'true' : 'false'}
      >
        {/* ── Drag handle ────────────────────────────────────────── */}
        <button
          type="button"
          className="qq-sheet-handle"
          data-testid="wizard-sheet-handle"
          aria-label={
            snap === 'collapsed' ? 'Expand wizard panel'
              : snap === 'half' ? 'Expand wizard panel further'
                : 'Collapse wizard panel'
          }
          aria-expanded={snap !== 'collapsed'}
          onClick={cycleSnap}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="qq-sheet-handle-bar" aria-hidden="true" />
          {snap === 'collapsed' && (
            <span className="qq-sheet-handle-label">
              {activeTabLabel}
              <span className="qq-sheet-handle-caret" aria-hidden="true" />
            </span>
          )}
        </button>

        {/* ── Scrollable content (active tab's panel only) ───────── */}
        <div
          ref={contentRef}
          className="qq-sheet-content"
          data-testid="wizard-sheet-content"
        >
          {children}
        </div>

        {/* ── Sticky action footer ───────────────────────────────── */}
        <div className="qq-sheet-footer" data-testid="wizard-sheet-footer">
          <button
            type="button"
            className={`qq-sheet-footer-reset${showResetConfirm ? ' is-confirm' : ''}`}
            onClick={onResetClick}
            data-testid="wizard-sheet-reset"
            aria-label={showResetConfirm ? 'Confirm reset to default' : 'Reset to default'}
            title="Reset this tab to default"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{showResetConfirm ? 'Tap to confirm' : 'Reset'}</span>
          </button>
          <button
            type="button"
            className="qq-sheet-footer-done"
            onClick={onDone}
            data-testid="wizard-sheet-done"
            disabled={isBusy}
          >
            {isBusy ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>

      <style>{`
        /* Mobile-only — desktop continues to use the side-panel pattern. */
        .qq-sheet, .qq-sheet-backdrop { display: none; }

        @media (max-width: 768px) {
          .qq-sheet-backdrop {
            display: block;
            position: fixed; inset: 0;
            z-index: 9997;
            background: rgba(15, 23, 42, 0.35);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            animation: qq-sheet-backdrop-in 240ms ease-out;
          }
          @keyframes qq-sheet-backdrop-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }

          .qq-sheet {
            display: flex; flex-direction: column;
            position: fixed; left: 0; right: 0; bottom: 0;
            z-index: 9998;
            background: ${d.colors.panel};
            border-top-left-radius: 18px;
            border-top-right-radius: 18px;
            box-shadow: 0 -10px 40px rgba(15, 23, 42, 0.18);
            border-top: 1px solid ${d.colors.borderLight};
            /* GPU-accelerated transform-based snap transitions. */
            transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
                        height 240ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: transform, height;
            transform: translate3d(0, 0, 0);
            /* Touch action — let inner content scroll; the handle itself
             * captures vertical pans for drag-resize. */
            touch-action: pan-y;
          }

          /* ── Three snap states ─────────────────────────────────── */
          .qq-sheet--collapsed {
            height: calc(56px + env(safe-area-inset-bottom, 0px));
          }
          .qq-sheet--half {
            height: 62vh;
          }
          .qq-sheet--full {
            height: 88vh;
          }
          /* Hide content / footer in collapsed state — only the handle remains. */
          .qq-sheet--collapsed .qq-sheet-content,
          .qq-sheet--collapsed .qq-sheet-footer {
            display: none;
          }

          /* ── Drag handle ───────────────────────────────────────── */
          .qq-sheet-handle {
            position: relative;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center;
            width: 100%; min-height: 44px;
            padding: 8px 12px 4px;
            background: transparent; border: none; cursor: grab;
            touch-action: none;
            font: inherit;
          }
          .qq-sheet-handle:active { cursor: grabbing; }
          .qq-sheet-handle:focus-visible {
            outline: 2px solid ${p.colors.accent};
            outline-offset: -4px;
            border-radius: 12px;
          }
          /* P2 UX (2026-05-22) — Drag-handle breathing animation.
           *
           * The small 40×4 handle bar was easy to miss, especially on
           * first open when the sheet is collapsed (BH-3). A subtle
           * scale + opacity pulse every 2.4s draws the eye without
           * being obnoxious; a small outer glow gives it depth so it
           * stands out from the surrounding chrome.
           *
           * Cancellation rules:
           *  - During active drag (.qq-sheet-handle:active .bar) the
           *    animation pauses so the bar reads as "I am being
           *    handled" instead of "I am still attracting attention".
           *  - When the sheet is in the half/full snap state the
           *    animation is suppressed entirely — the bar's job is
           *    discoverability when collapsed; once the user is in,
           *    further pulsing is noise.
           *  - prefers-reduced-motion disables the animation
           *    (kept-in-place at rest size + opacity). */
          .qq-sheet-handle-bar {
            display: block;
            width: 40px; height: 4px; border-radius: 999px;
            background: ${p.colors.border};
            margin-bottom: 2px;
            opacity: 0.5;
            transform-origin: center;
            box-shadow: 0 0 8px rgba(13, 60, 252, 0.18);
            animation: qq-handle-breathe 2.4s ease-in-out infinite;
            will-change: transform, opacity;
          }
          @keyframes qq-handle-breathe {
            0%, 100% { opacity: 0.5; transform: scaleX(1); }
            50%      { opacity: 0.9; transform: scaleX(1.15); }
          }
          /* Pause pulse while the user is actively dragging the
           * handle (pointer captured). */
          .qq-sheet-handle:active .qq-sheet-handle-bar {
            animation-play-state: paused;
            opacity: 1;
            transform: scaleX(1);
          }
          /* Once the sheet is open the bar doesn't need to attract
           * attention any more. Lock to a neutral rest state. */
          .qq-sheet--half .qq-sheet-handle-bar,
          .qq-sheet--full .qq-sheet-handle-bar {
            animation: none;
            opacity: 0.55;
            transform: scaleX(1);
            box-shadow: none;
          }
          .qq-sheet-handle-label {
            font-size: 13px; font-weight: 700;
            color: ${p.colors.heading};
            display: inline-flex; align-items: center; gap: 4px;
          }
          .qq-sheet-handle-caret {
            display: inline-block;
            width: 0; height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 5px solid ${p.colors.muted};
            margin-left: 2px;
          }

          /* ── Scrollable content ────────────────────────────────── */
          .qq-sheet-content {
            flex: 1; min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 4px 12px 8px;
            scroll-behavior: smooth;
          }
          /* Section highlight after a focus-field event. */
          .qq-sheet-content [data-sheet-highlight="true"] {
            animation: qq-sheet-highlight 1.4s ease-out;
          }
          @keyframes qq-sheet-highlight {
            0%   { box-shadow: 0 0 0 0 ${p.colors.accent}; }
            50%  { box-shadow: 0 0 0 4px ${p.colors.accentLighter}; }
            100% { box-shadow: 0 0 0 0 ${p.colors.accentLighter}; }
          }

          /* ── Sticky action footer ──────────────────────────────── */
          .qq-sheet-footer {
            position: sticky; bottom: 0;
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
            border-top: 1px solid ${d.colors.borderLight};
            background: ${d.colors.panel};
            flex-shrink: 0;
            z-index: 2;
          }
          .qq-sheet-footer-reset {
            display: inline-flex; align-items: center; gap: 6px;
            min-height: 44px; padding: 0 14px;
            background: #fff;
            border: 1px solid ${p.colors.border};
            border-radius: 10px;
            font: inherit; font-size: 13px; font-weight: 600;
            color: ${p.colors.heading};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-reset:hover {
            background: ${p.colors.surfaceRaised};
          }
          .qq-sheet-footer-reset.is-confirm {
            background: ${p.colors.accentLighter};
            border-color: ${p.colors.accent};
            color: ${p.colors.accentDark};
          }
          .qq-sheet-footer-done {
            flex: 1; min-height: 44px;
            background: ${p.colors.accent};
            color: #fff;
            border: none;
            border-radius: 10px;
            font: inherit; font-size: 14px; font-weight: 700;
            cursor: pointer;
            box-shadow: ${p.shadows.button};
            transition: box-shadow 0.12s ease, background 0.12s ease;
          }
          .qq-sheet-footer-done:hover:not(:disabled) {
            box-shadow: ${p.shadows.buttonHover};
          }
          .qq-sheet-footer-done:disabled {
            opacity: 0.55; cursor: not-allowed;
          }

          /* Dark editor theme ── flip surfaces. */
          .qq-editor-shell[data-theme="dark"] .qq-sheet {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-reset {
            background: rgba(255,255,255,0.04);
            border-color: var(--qq-border);
            color: var(--qq-text);
          }
        }

        /* prefers-reduced-motion — instant snap, no transitions. */
        @media (prefers-reduced-motion: reduce) {
          .qq-sheet, .qq-sheet-content {
            transition: none !important;
            animation: none !important;
          }
          .qq-sheet-backdrop { animation: none !important; }
          .qq-sheet-content [data-sheet-highlight="true"] {
            animation: none !important;
            outline: 2px solid ${p.colors.accent};
            outline-offset: 2px;
          }
          /* P2 UX (2026-05-22) — kill the handle breathing pulse when
           * the user prefers reduced motion. Handle stays at its
           * resting opacity + scale + glow is dropped. */
          .qq-sheet-handle-bar {
            animation: none !important;
            opacity: 0.55 !important;
            transform: scaleX(1) !important;
            box-shadow: none !important;
          }
        }
        /* Direct class-driven override (Web Animations API friendly) when
         * the prefers-reduced-motion media query is unreliable. */
        .qq-sheet.is-reduced-motion {
          transition: none !important;
        }
      `}</style>
    </>
  );
}
