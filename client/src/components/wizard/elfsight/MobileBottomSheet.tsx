// MobileBottomSheet — Elfsight-clone mobile editor panel sheet.
//
// 2026-06-07 rebuild: DOCKED drag-to-resize panel (supersedes the fixed 70vh
// overlay). On phones (≤768px) the work area sits between the 64px clean top
// bar and the 60px persistent dark bottom tab bar (BottomTabBar). The sheet
// DOCKS at the bottom of that work area; the preview ALWAYS occupies the space
// ABOVE the sheet and scrolls independently — there is no blur and no dim
// scrim, so the preview is never obscured.
//
// Resize model:
//   - Snap points: collapsed (~64px peek = drag handle + active-tab title),
//     half (~50vh), full (clamped so the preview keeps ≥140px visible).
//   - Dragging the handle tracks the finger continuously (live pixel height);
//     releasing snaps to the NEAREST snap point and persists it to
//     localStorage ('qq_wizard_sheet_snap'). A tap (movement < 6px) cycles
//     collapsed → half → full → collapsed.
//   - The sheet publishes its current visible height as the
//     `--qq-sheet-h` CSS custom property on <html>; WizardShell's preview
//     height calc subtracts it so the preview shrinks/grows live. Closing the
//     sheet (or unmount) zeroes it so the preview reclaims the full work area.
//
// Constraints / parity:
//   - Mobile-only (≤768px); desktop continues to use the side-panel.
//   - The sheet docks ABOVE the persistent dark bottom tab bar (~60px + safe
//     area), so its body never hides behind it.
//   - NOT modal (docked, not an overlay) → no aria-modal, no tap-catching
//     backdrop. Preview stays interactive + scrollable at every snap.
//   - GPU-friendly height transitions; transition:none during active drag so
//     it tracks the finger; reduced-motion → instant snaps.
//   - Touch targets ≥ 44px; drag handle is a 40×4px grabber on a ≥44px row.
//   - z-index 9998 (above canvas, below the bottom tab bar at 9999).
//   - Listens for `qq-wizard:focus-field` so a PreviewPane tap auto-opens the
//     sheet, switches tab, and scrolls the field into view.

import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, HelpCircle, RotateCcw } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { AE } from './appleEditor';
import { useLayoutGuard } from '@/lib/layoutGuard';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;

// Height of the persistent dark bottom tab bar (icon+label cell). The sheet
// docks above this so nothing hides behind it.
const BOTTOM_BAR_PX = 60;

// Height of the clean mobile top bar (✕ · name · autosave · Publish).
const TOPBAR_PX = 64;

// Collapsed peek = just the drag handle row + active-tab title.
const COLLAPSED_PX = 64;

// Minimum preview height that must remain visible above the sheet even at the
// "full" snap. The sheet's max height is clamped to workArea − this.
const MIN_PREVIEW_PX = 140;

// Tap vs drag threshold (px of total movement).
const TAP_THRESHOLD_PX = 6;

export type SheetSnap = 'collapsed' | 'half' | 'full';

const STORAGE_KEY = 'qq_wizard_sheet_snap';

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  /** Whether the panel sheet is docked open over/beside the preview. When
   *  false the sheet is hidden and the preview reclaims the full work area. */
  open: boolean;
  /** Dismiss the sheet back to the full preview. */
  onClose: () => void;
  activeTab: EditorTab;
  /** Switch tab + (re)open. Used by the focus-field listener. */
  onTabChange: (tab: EditorTab) => void;
  onResetTab: () => void;
  /** Save draft (relocated here from the removed action bar). */
  onSave: () => void;
  /** Opens the editor help overlay. */
  onHelp?: () => void;
  /** The active tab's body component. */
  children: ReactNode;
  /** When true, Save is busy. */
  isBusy?: boolean;
}

function readPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function loadSnap(initial: SheetSnap): SheetSnap {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'collapsed' || raw === 'half' || raw === 'full') return raw;
  } catch (err) {
    // localStorage may throw in private mode / sandboxed iframes — fall back
    // to the default snap rather than crashing the editor.
    if (typeof console !== 'undefined') console.warn('[wizard-sheet] loadSnap failed', err);
  }
  return initial;
}

function persistSnap(next: SheetSnap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[wizard-sheet] persistSnap failed', err);
  }
}

// Compute the live mobile work-area height (between top bar and bottom tab
// bar, minus safe area). SSR-safe.
function readSafeAreaBottom(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:env(safe-area-inset-bottom,0px);visibility:hidden;';
    document.body.appendChild(probe);
    const v = parseFloat(getComputedStyle(probe).bottom) || 0;
    document.body.removeChild(probe);
    return v;
  } catch {
    return 0;
  }
}

export default function MobileBottomSheet({
  open, onClose, activeTab, onTabChange, onResetTab, onSave, onHelp,
  children, isBusy = false,
}: Props) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const reduceMotion = useMemo(readPrefersReduced, []);

  const [snap, setSnapState] = useState<SheetSnap>(() => loadSnap('half'));
  // Live pixel height during/after a drag. When null we render the snap height.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutGuard(contentRef, { maxGapPx: 24, label: 'wizard-sheet-content' });

  // ── Geometry helpers ──────────────────────────────────────────────
  // workAreaPx = innerHeight − topbar − bottombar − safeArea. maxPx (full
  // snap) is clamped so the preview keeps ≥ MIN_PREVIEW_PX visible.
  const geomRef = useRef({ workAreaPx: 0, maxPx: 0, halfPx: 0 });
  const computeGeom = useCallback(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const safe = readSafeAreaBottom();
    const workAreaPx = Math.max(0, vh - TOPBAR_PX - BOTTOM_BAR_PX - safe);
    // Full snap leaves at least MIN_PREVIEW_PX of preview; never below half.
    const maxPx = Math.max(COLLAPSED_PX, workAreaPx - MIN_PREVIEW_PX);
    // Half ≈ 50vh, but clamped within [collapsed, max].
    const halfPx = Math.min(maxPx, Math.max(COLLAPSED_PX, Math.round(vh * 0.5)));
    geomRef.current = { workAreaPx, maxPx, halfPx };
    return geomRef.current;
  }, []);

  const snapToPx = useCallback((s: SheetSnap): number => {
    const { maxPx, halfPx } = geomRef.current;
    if (s === 'collapsed') return COLLAPSED_PX;
    if (s === 'full') return maxPx;
    return halfPx;
  }, []);

  // Recompute geometry on mount + resize/orientation change.
  useEffect(() => {
    computeGeom();
    const onResize = () => {
      computeGeom();
      // Keep the live height in sync when not actively dragging.
      setDragHeight((cur) => (cur === null ? null : Math.min(cur, geomRef.current.maxPx)));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [computeGeom]);

  // ── Publish current visible height to <html> as --qq-sheet-h ───────
  // The preview's height calc subtracts this var so it shrinks/grows live.
  const publishSheetHeight = useCallback((px: number) => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--qq-sheet-h', `${Math.round(px)}px`);
  }, []);
  const clearSheetHeight = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--qq-sheet-h', '0px');
  }, []);

  // The current rendered height (drag override else snap height).
  const currentHeightPx = useMemo(() => {
    if (!open) return 0;
    if (dragHeight !== null) return dragHeight;
    return snapToPx(snap);
  }, [open, dragHeight, snap, snapToPx]);

  // Sync the CSS var whenever the rendered height changes; zero on close.
  useEffect(() => {
    if (!open) {
      clearSheetHeight();
      return;
    }
    publishSheetHeight(currentHeightPx);
  }, [open, currentHeightPx, publishSheetHeight, clearSheetHeight]);

  // Always zero the var on unmount so a stale value can't shrink the preview.
  useEffect(() => () => { clearSheetHeight(); }, [clearSheetHeight]);

  // ── Snap helpers ──────────────────────────────────────────────────
  const setSnap = useCallback((next: SheetSnap) => {
    setSnapState(next);
    persistSnap(next);
  }, []);

  // Set true when a pointer sequence resolved to a real drag, so the synthetic
  // click that follows pointerup doesn't ALSO cycle the snap.
  const suppressClickRef = useRef(false);
  const cycleSnap = useCallback(() => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    setSnap(snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed');
  }, [snap, setSnap]);

  // Nearest snap to a pixel height (for snap-on-release).
  const nearestSnap = useCallback((px: number): SheetSnap => {
    const { maxPx, halfPx } = geomRef.current;
    const candidates: Array<[SheetSnap, number]> = [
      ['collapsed', COLLAPSED_PX],
      ['half', halfPx],
      ['full', maxPx],
    ];
    let best: SheetSnap = 'half';
    let bestDist = Infinity;
    for (const [s, h] of candidates) {
      const d = Math.abs(px - h);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  }, []);

  // ── Drag-to-resize (pointer) ──────────────────────────────────────
  const dragRef = useRef<{ startY: number; startH: number; moved: number } | null>(null);

  const onHandlePointerDown = useCallback((ev: React.PointerEvent) => {
    computeGeom();
    const startH = snapToPx(snap);
    dragRef.current = { startY: ev.clientY, startH, moved: 0 };
    setIsDragging(true);
    setDragHeight(startH);
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* capture unsupported */ }
  }, [computeGeom, snap, snapToPx]);

  const onHandlePointerMove = useCallback((ev: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = ev.clientY - drag.startY; // down = positive
    drag.moved = Math.max(drag.moved, Math.abs(delta));
    const { maxPx } = geomRef.current;
    // Drag up (negative delta) grows the sheet; clamp to [collapsed, max].
    const next = Math.min(maxPx, Math.max(COLLAPSED_PX, drag.startH - delta));
    setDragHeight(next);
  }, []);

  const endDrag = useCallback((ev: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (!drag) { setDragHeight(null); return; }
    if (drag.moved < TAP_THRESHOLD_PX) {
      // Treated as a tap → let the synthetic click cycle the snap; just drop
      // the live height so the snap height renders.
      setDragHeight(null);
      return;
    }
    // Real drag → snap to nearest + persist, and suppress the trailing click
    // so it doesn't cycle on top of the snap. Drop the live override so the
    // snap height (with its settle transition) takes over.
    suppressClickRef.current = true;
    const target = nearestSnap(dragHeight ?? drag.startH);
    setSnap(target);
    setDragHeight(null);
  }, [dragHeight, nearestSnap, setSnap]);

  // ── `qq-wizard:focus-field` listener ──────────────────────────────
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ev = e as CustomEvent<{ tabId?: EditorTab; sectionId?: string; fieldId?: string }>;
      const { tabId, sectionId, fieldId } = ev.detail ?? {};
      if (tabId) onTabChange(tabId);
      // Ensure the panel is at least half-open so the field is reachable.
      setSnap((cur => (cur === 'collapsed' ? 'half' : cur))(snap));
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
  }, [onTabChange, reduceMotion, setSnap, snap]);

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
    EDITOR_TABS.find((t) => t.id === activeTab)?.label ?? 'Build';

  const isCollapsed = snap === 'collapsed' && dragHeight === null;

  // Portal to document.body so the fixed-position sheet anchors to the
  // VIEWPORT, not to any transformed/filtered editor ancestor.
  return createPortal(
    <>
      {/* No backdrop: the sheet is docked, not modal — the preview must stay
          fully visible, unblurred, and interactive at every snap. */}

      <div
        ref={sheetRef}
        data-theme="light"
        className={`qq-sheet${open ? ' is-open' : ''}${isDragging ? ' is-dragging' : ''}${isCollapsed ? ' is-collapsed' : ''}${reduceMotion ? ' is-reduced-motion' : ''}`}
        data-testid="wizard-bottom-sheet"
        data-open={open ? 'true' : 'false'}
        data-snap={snap}
        role="dialog"
        aria-label={`${activeTabLabel} settings`}
        aria-hidden={open ? undefined : true}
        style={open ? { height: `${Math.round(currentHeightPx)}px` } : undefined}
      >
        {/* ── Drag handle row — grabber + title + close chevron ───────── */}
        <div className="qq-sheet-header">
          <button
            type="button"
            className="qq-sheet-grabber"
            data-testid="wizard-sheet-handle"
            aria-label={
              snap === 'collapsed' ? 'Expand panel'
                : snap === 'half' ? 'Expand panel further'
                  : 'Collapse panel'
            }
            aria-expanded={snap !== 'collapsed'}
            onClick={cycleSnap}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="qq-sheet-grabber-bar" aria-hidden="true" />
          </button>
          <div className="qq-sheet-header-row">
            <span className="qq-sheet-title" data-testid="wizard-sheet-title">
              {activeTabLabel}
            </span>
            <button
              type="button"
              className="qq-sheet-close"
              data-testid="wizard-sheet-close"
              onClick={onClose}
              aria-label="Close panel"
              title="Close panel"
            >
              <ChevronDown size={24} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Scrollable content (active tab's panel only) ───────────── */}
        <div
          ref={contentRef}
          className="qq-sheet-content"
          data-testid="wizard-sheet-content"
        >
          {children}
        </div>

        {/* ── Sticky action footer (Help · Reset · Save) ───────────── */}
        <div className="qq-sheet-footer" data-testid="wizard-sheet-footer">
          <button
            type="button"
            className="qq-sheet-footer-help"
            onClick={() => onHelp?.()}
            data-testid="wizard-sheet-help"
            aria-label="Editor help"
            title="Editor help"
          >
            <HelpCircle size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`qq-sheet-footer-reset${showResetConfirm ? ' is-confirm' : ''}`}
            onClick={onResetClick}
            data-testid="wizard-sheet-reset"
            aria-label={showResetConfirm ? 'Confirm reset to default' : 'Reset to default'}
            title="Reset this tab to default"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>{showResetConfirm ? 'Tap to confirm' : 'Reset'}</span>
          </button>
          <button
            type="button"
            className="qq-sheet-footer-done"
            onClick={onSave}
            data-testid="wizard-sheet-done"
            disabled={isBusy}
          >
            {isBusy ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>

      <style>{`
        /* Mobile-only — desktop continues to use the side-panel pattern. */
        .qq-sheet { display: none; }

        @media (max-width: 768px) {
          .qq-sheet {
            display: flex; flex-direction: column;
            position: fixed; left: 0; right: 0;
            /* Dock ABOVE the persistent dark bottom tab bar. */
            bottom: calc(${BOTTOM_BAR_PX}px + env(safe-area-inset-bottom, 0px));
            /* Height is driven by inline style (live drag / snap px). */
            /* z-index 9998 — above canvas, below the bottom tab bar (9999). */
            z-index: 9998;
            background: ${AE.color.bg};
            font-family: ${AE.font.family};
            color: ${AE.color.text};
            border-top-left-radius: ${AE.radius.lg};
            border-top-right-radius: ${AE.radius.lg};
            box-shadow: ${AE.shadow.pop};
            border-top: 1px solid ${AE.color.hairline};
            /* overflow:clip (not hidden) keeps the sticky footer working in
               embedded widgets (per project_overflow_clip_for_sticky). */
            overflow: clip;
            /* Closed → slide fully off-screen. Open → settle transition only;
               killed during active drag so it tracks the finger. */
            transform: translateY(calc(100% + ${BOTTOM_BAR_PX}px + env(safe-area-inset-bottom, 0px)));
            transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
                        height 240ms cubic-bezier(0.22, 1, 0.36, 1);
            touch-action: pan-y;
            pointer-events: none;
          }
          .qq-sheet.is-open {
            transform: translateY(0);
            pointer-events: auto;
          }
          .qq-sheet.is-dragging {
            transition: none;
            will-change: height;
          }

          /* ── Drag handle + header ──────────────────────────────── */
          .qq-sheet-header {
            flex-shrink: 0;
          }
          .qq-sheet-grabber {
            display: flex; align-items: center; justify-content: center;
            width: 100%; min-height: 28px; padding: 10px 0 4px;
            background: transparent; border: none; cursor: grab;
            touch-action: none;
          }
          .qq-sheet-grabber:active { cursor: grabbing; }
          .qq-sheet-grabber:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -4px;
            border-radius: ${AE.radius.md};
          }
          .qq-sheet-grabber-bar {
            display: block;
            width: 40px; height: 4px; border-radius: ${AE.radius.pill};
            background: ${AE.color.hairlineStrong};
          }
          .qq-sheet-header-row {
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px;
            padding: 0 12px 8px 18px;
            border-bottom: 1px solid ${AE.color.hairline};
            /* Min tap target for the row that carries the close button. */
            min-height: 36px;
          }
          .qq-sheet-title {
            font-size: 17px; font-weight: 600;
            color: ${AE.color.text};
            letter-spacing: -0.01em;
          }
          .qq-sheet-close {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 44px; min-height: 44px; padding: 0;
            background: transparent; border: none; cursor: pointer;
            color: ${AE.color.secondary};
            border-radius: ${AE.radius.md};
          }
          .qq-sheet-close:active { background: ${AE.color.surface}; }
          .qq-sheet-close:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -2px;
          }

          /* Collapsed peek → hide body + footer, keep handle + title row. */
          .qq-sheet.is-collapsed .qq-sheet-content,
          .qq-sheet.is-collapsed .qq-sheet-footer {
            display: none;
          }
          .qq-sheet.is-collapsed .qq-sheet-header-row {
            border-bottom: none;
          }

          /* ── Scrollable content ────────────────────────────────── */
          .qq-sheet-content {
            flex: 1 1 auto; min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 8px 12px;
            scroll-behavior: smooth;
          }
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
            padding: 10px 12px;
            border-top: 1px solid ${AE.color.hairline};
            background: ${AE.color.bg};
            flex-shrink: 0;
            z-index: 2;
          }
          .qq-sheet-footer-reset {
            display: inline-flex; align-items: center; gap: 6px;
            min-height: 44px; padding: 0 14px;
            background: ${AE.color.surface};
            border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
            font: inherit; font-size: 13px; font-weight: 500;
            color: ${AE.color.text};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-reset:hover { background: ${AE.color.surfaceHover}; }
          .qq-sheet-footer-help {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 44px; min-height: 44px; padding: 0 10px;
            background: ${AE.color.surface};
            border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
            color: ${AE.color.text};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-help:hover { background: ${AE.color.surfaceHover}; }
          .qq-sheet-footer-help:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -2px;
          }
          .qq-sheet-footer-reset.is-confirm {
            background: ${AE.color.accentTint};
            border-color: ${AE.color.accent};
            color: ${AE.color.accent};
          }
          .qq-sheet-footer-done {
            flex: 1; min-height: 44px;
            background: ${AE.color.publish};
            color: ${AE.color.publishText};
            border: none;
            border-radius: ${AE.radius.md};
            font: inherit; font-size: 14px; font-weight: 600;
            cursor: pointer;
            box-shadow: none;
            transition: box-shadow 0.12s ease, background 0.12s ease;
          }
          .qq-sheet-footer-done:hover:not(:disabled) {
            background: ${AE.color.accentHover};
          }
          .qq-sheet-footer-done:disabled {
            opacity: 0.55; cursor: not-allowed;
          }

          /* Dark editor theme ── flip surfaces. */
          .qq-editor-shell[data-theme="dark"] .qq-sheet {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-header-row {
            border-bottom-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-title {
            color: var(--qq-text, rgba(255,255,255,1));
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-reset,
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-help {
            background: rgba(255,255,255,0.04);
            border-color: var(--qq-border);
            color: var(--qq-text);
          }
        }

        /* prefers-reduced-motion — instant open/close + snap, no transitions. */
        @media (prefers-reduced-motion: reduce) {
          .qq-sheet, .qq-sheet-content {
            transition: none !important;
            animation: none !important;
          }
          .qq-sheet-content [data-sheet-highlight="true"] {
            animation: none !important;
            outline: 2px solid ${p.colors.accent};
            outline-offset: 2px;
          }
        }
        .qq-sheet.is-reduced-motion {
          transition: none !important;
        }
      `}</style>
    </>,
    document.body,
  );
}
