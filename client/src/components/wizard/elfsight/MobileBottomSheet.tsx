// MobileBottomSheet — Elfsight-clone mobile editor panel sheet.
//
// 2026-06-07 rebuild: DOCKED drag-to-resize panel (supersedes the fixed 70vh
// overlay). On phones (≤768px) the work area sits between the 64px clean top
// bar and the 60px persistent dark bottom tab bar (BottomTabBar). The sheet
// DOCKS at the bottom of that work area; the preview ALWAYS occupies the space
// ABOVE the sheet and scrolls independently — there is no blur and no dim
// scrim, so the preview is never obscured.
//
// Resize model (FREE resize — 2026-06-07):
//   - The sheet rests at ANY height the user drags it to. There are no discrete
//     snap points anymore. Dragging the handle tracks the finger continuously
//     (live pixel height); on release the sheet STAYS at the released height
//     (clamped to [MIN_OPEN_PX, maxPx]) and that height is persisted as a
//     FRACTION of the work area (localStorage 'qq_wizard_sheet_height_frac') so
//     it restores proportionally across viewports/orientations.
//   - A tap (movement < 6px) TOGGLES between a collapsed peek (~64px =
//     drag handle + active-tab title) and the last open height.
//   - The "full" extent is clamped so the preview keeps ≥ MIN_PREVIEW_PX (280)
//     visible at all times — the template/result never gets squeezed away.
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
// largest sheet height. The sheet's max height is clamped to workArea − this,
// so the template's fields stay visible (and the pane scrolls to the CTA).
const MIN_PREVIEW_PX = 280;

// Smallest persisted *open* resting height. Dragging below this is still
// allowed (down to COLLAPSED_PX as a peek), but the sheet never RESTS open
// below this — so reopening is never a useless sliver.
const MIN_OPEN_PX = 120;

// Default resting height as a fraction of the work area for a first-time /
// unpersisted open. ~0.42 → sheet ≈ 42% so the template/preview gets ≈ 58%.
const DEFAULT_HEIGHT_FRAC = 0.42;

// Tap vs drag threshold (px of total movement).
const TAP_THRESHOLD_PX = 6;

const STORAGE_KEY = 'qq_wizard_sheet_height_frac';

// Legacy key (3-value snap enum) — ignored/migrated to the default fraction.
const LEGACY_SNAP_KEY = 'qq_wizard_sheet_snap';

// One-time-per-session flag: once the drag-handle "you can drag me" hint has
// played on the first open, we don't nag again for the rest of the session.
const HINT_SHOWN_KEY = 'qq_wizard_sheet_drag_hint_shown';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

// Whether the one-time drag-affordance hint has already played this session.
// sessionStorage so it hints once on first open then stays quiet — and resets
// for a fresh session (so a returning user still gets the cue next visit).
function hasHintPlayed(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.sessionStorage.getItem(HINT_SHOWN_KEY) === '1'; }
  catch { return false; }
}

function markHintPlayed(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(HINT_SHOWN_KEY, '1'); }
  catch { /* private mode — fine, the hint just plays again next open */ }
}

// Load the persisted resting height as a fraction (0..1) of the work area.
// A legacy 3-value snap enum under the old key is ignored — we just fall back
// to the default fraction rather than crashing or mis-reading it.
function loadHeightFrac(initial: number): number {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0 && n <= 1) return n;
    }
    // Migrate away from the legacy 3-value snap enum: if present, drop it and
    // use the default fraction (never crash on the old shape).
    if (window.localStorage.getItem(LEGACY_SNAP_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_SNAP_KEY);
    }
  } catch (err) {
    // localStorage may throw in private mode / sandboxed iframes — fall back
    // to the default fraction rather than crashing the editor.
    if (typeof console !== 'undefined') console.warn('[wizard-sheet] loadHeightFrac failed', err);
  }
  return initial;
}

function persistHeightFrac(frac: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(frac) || frac <= 0) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clamp(frac, 0.05, 1)));
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[wizard-sheet] persistHeightFrac failed', err);
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

  // ── Mirror the editor shell's live theme onto the portal ───────────
  // The sheet portals to document.body — OUTSIDE `.qq-editor-shell` — so the
  // editor's dark rules (scoped under `.qq-editor-shell[data-theme="dark"] …`)
  // never match it and the whole sheet renders light even in dark mode. Same
  // fix AIBubble/AddFieldMenu use: read the shell's real data-theme and put a
  // `qq-editor-shell` wrapper (with the mirrored theme) AROUND the portal
  // content so every existing editor dark rule applies inside the sheet too.
  // The wrapper is out-of-flow-collapsing (its only child is position:fixed),
  // so the shell's `background !important` paints nothing visible. Light mode
  // is unaffected — the mirror just resolves to "light" and nothing changes.
  const [portalTheme, setPortalTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const shell = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.qq-editor-shell[data-theme]')
      : null;
    const read = () =>
      setPortalTheme(shell?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    read();
    if (!shell) return;
    const mo = new MutationObserver(read);
    mo.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [open]);

  // Persisted resting height as a fraction of the work area (0..1).
  const heightFracRef = useRef<number>(loadHeightFrac(DEFAULT_HEIGHT_FRAC));
  // The current OPEN resting height in px (derived from the fraction, clamped
  // to the live geometry). This is the source of truth for the open height.
  const [openHeightPx, setOpenHeightPx] = useState<number>(0);
  // When true the sheet rests at a collapsed peek (COLLAPSED_PX) instead of its
  // open height. Toggled by a tap on the handle; cleared by a drag/expand.
  const [peeked, setPeeked] = useState(false);
  // Live pixel height during a drag. When null we render the resting height.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // One-time-per-session drag affordance: when the sheet first opens this
  // session, the grab handle plays a subtle "you can drag me" bob/glow so users
  // realize the panel is resizable. It plays once, then a sessionStorage flag
  // keeps it quiet for the rest of the session. Disabled under reduced-motion.
  const [hintActive, setHintActive] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutGuard(contentRef, { maxGapPx: 24, label: 'wizard-sheet-content' });

  // ── Geometry helpers ──────────────────────────────────────────────
  // workAreaPx = innerHeight − topbar − bottombar − safeArea. maxPx is clamped
  // so the preview keeps ≥ MIN_PREVIEW_PX visible at the largest sheet height.
  const geomRef = useRef({ workAreaPx: 0, maxPx: 0 });
  const computeGeom = useCallback(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const safe = readSafeAreaBottom();
    const workAreaPx = Math.max(0, vh - TOPBAR_PX - BOTTOM_BAR_PX - safe);
    // Largest sheet height fills the full work area — the sheet can drag all the
    // way up to just under the top bar, covering the preview. (Previously this
    // reserved MIN_PREVIEW_PX of preview, which capped the sheet at ~50%.)
    const maxPx = Math.max(COLLAPSED_PX, workAreaPx);
    geomRef.current = { workAreaPx, maxPx };
    return geomRef.current;
  }, []);

  // Derive the open resting height (px) from the persisted fraction, clamped to
  // the current geometry. The open upper bound is maxPx (preview floor honored).
  const openPxFromFrac = useCallback((): number => {
    const { workAreaPx, maxPx } = geomRef.current;
    const upper = Math.max(MIN_OPEN_PX, maxPx);
    return clamp(heightFracRef.current * workAreaPx, MIN_OPEN_PX, upper);
  }, []);

  // Recompute geometry on mount + resize/orientation change, then re-derive the
  // open height from the persisted fraction so it stays proportional.
  useEffect(() => {
    computeGeom();
    setOpenHeightPx(openPxFromFrac());
    const onResize = () => {
      computeGeom();
      // Re-derive the resting open height proportionally to the new geometry.
      setOpenHeightPx(openPxFromFrac());
      // Keep any live drag height within the new max.
      setDragHeight((cur) => (cur === null ? null : Math.min(cur, geomRef.current.maxPx)));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [computeGeom, openPxFromFrac]);

  // Reopening the sheet always shows its open resting height, never a stale
  // peek left over from a previous session.
  useEffect(() => {
    if (open) setPeeked(false);
  }, [open]);

  // ── One-time drag-affordance hint ─────────────────────────────────
  // On the FIRST open of the session (and only if motion is allowed), play the
  // grab-handle bob/glow once, then mark it shown so it never nags again. The
  // animation is ~2 gentle cycles (~2.4s) then we drop the class.
  useEffect(() => {
    if (!open || reduceMotion) return;
    if (hasHintPlayed()) return;
    markHintPlayed();
    setHintActive(true);
    hintTimerRef.current = setTimeout(() => setHintActive(false), 2600);
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [open, reduceMotion]);

  // Any real interaction (drag start) cancels the hint immediately — once the
  // user has grabbed the handle, the cue has done its job.
  const dismissHint = useCallback(() => {
    if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null; }
    setHintActive(false);
  }, []);

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

  // The current rendered height: live drag override → collapsed peek → open
  // resting height. Clamped to maxPx so --qq-sheet-h never starves the preview
  // below MIN_PREVIEW_PX; a live drag may peek down to COLLAPSED_PX.
  const currentHeightPx = useMemo(() => {
    if (!open) return 0;
    const { maxPx } = geomRef.current;
    if (dragHeight !== null) return clamp(dragHeight, COLLAPSED_PX, maxPx || dragHeight);
    if (peeked) return COLLAPSED_PX;
    return Math.min(openHeightPx, maxPx || openHeightPx);
  }, [open, dragHeight, peeked, openHeightPx]);

  // Remember the last OPEN rendered height. On close we keep the sheet pinned
  // to this height so the close is a pure `transform` slide-down — without it,
  // dropping the inline `height` lets the flex column snap to its full content
  // height for the 240ms transition, which reads as a brief full-screen UNFOLD
  // right before the panel slides away (the glitch Alex flagged). We never want
  // the height to animate UP while closing, only the transform to play.
  const lastOpenHeightRef = useRef<number>(0);
  if (open && currentHeightPx > 0) lastOpenHeightRef.current = currentHeightPx;

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

  // ── Open-height helpers ────────────────────────────────────────────
  // Set the resting open height (px) and persist it as a fraction of work area.
  const setOpenHeight = useCallback((px: number) => {
    const { workAreaPx, maxPx } = geomRef.current;
    const upper = Math.max(MIN_OPEN_PX, maxPx);
    const rested = clamp(px, MIN_OPEN_PX, upper);
    setOpenHeightPx(rested);
    if (workAreaPx > 0) {
      const frac = rested / workAreaPx;
      heightFracRef.current = frac;
      persistHeightFrac(frac);
    }
  }, []);

  // Set true when a pointer sequence resolved to a real drag, so the synthetic
  // click that follows pointerup doesn't ALSO toggle.
  const suppressClickRef = useRef(false);
  // Tap toggles between a collapsed peek and the last open height. The peek
  // does NOT disturb the persisted open height — reopening restores it exactly.
  const toggleCollapsed = useCallback(() => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    setPeeked((cur) => !cur);
  }, []);

  // ── Drag-to-resize (pointer) ──────────────────────────────────────
  const dragRef = useRef<{ startY: number; startH: number; moved: number } | null>(null);

  const onHandlePointerDown = useCallback((ev: React.PointerEvent) => {
    dismissHint();
    computeGeom();
    // Start from whatever is currently rendered (peek or open resting height).
    const startH = peeked ? COLLAPSED_PX : Math.min(openHeightPx, geomRef.current.maxPx || openHeightPx);
    dragRef.current = { startY: ev.clientY, startH, moved: 0 };
    setIsDragging(true);
    setDragHeight(startH);
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* capture unsupported */ }
  }, [computeGeom, peeked, openHeightPx, dismissHint]);

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
      // Treated as a tap → let the synthetic click toggle the peek; just drop
      // the live height so the resting height renders.
      setDragHeight(null);
      return;
    }
    // Real drag → REST at the released height (free resize, no snap-back).
    // Clamp into [MIN_OPEN_PX, maxPx] and persist it as a fraction. If the user
    // dragged down to a peek, collapse instead of resting at a useless sliver.
    suppressClickRef.current = true;
    const live = dragHeight ?? drag.startH;
    const { maxPx } = geomRef.current;
    if (live <= MIN_OPEN_PX) {
      // Dragged below the usable open minimum → treat as a collapse peek.
      setPeeked(true);
    } else {
      setOpenHeight(clamp(live, MIN_OPEN_PX, maxPx));
      setPeeked(false);
    }
    setDragHeight(null);
  }, [dragHeight, setOpenHeight]);

  // ── `qq-wizard:focus-field` listener ──────────────────────────────
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ev = e as CustomEvent<{ tabId?: EditorTab; sectionId?: string; fieldId?: string }>;
      const { tabId, sectionId, fieldId } = ev.detail ?? {};
      if (tabId) onTabChange(tabId);
      // Ensure the panel is open at a usable height so the field is reachable
      // (un-peek + guarantee the resting height is at least MIN_OPEN_PX).
      setPeeked(false);
      setOpenHeightPx((cur) => Math.max(cur, openPxFromFrac(), MIN_OPEN_PX));
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
  }, [onTabChange, reduceMotion, openPxFromFrac]);

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

  // Collapsed-peek visual state: resting at the peek (not mid-drag). At this
  // height the body + footer hide and only the handle + title row show.
  const isCollapsed = peeked && dragHeight === null;

  // Portal to document.body so the fixed-position sheet anchors to the
  // VIEWPORT, not to any transformed/filtered editor ancestor.
  return createPortal(
    // Wrap the portal in a `qq-editor-shell` carrying the editor's MIRRORED
    // theme so every `.qq-editor-shell[data-theme="dark"] .qq-…` rule (the
    // sheet's own surfaces AND each tab body's controls/labels/inputs) applies
    // inside the off-tree sheet. `qq-editor-shell` base only declares CSS vars;
    // its dark `background !important` paints nothing because this wrapper has
    // no flow size (its only child is position:fixed). Light mode is unchanged.
    <div className="qq-editor-shell qq-sheet-portal" data-theme={portalTheme}>
      {/* No backdrop: the sheet is docked, not modal — the preview must stay
          fully visible, unblurred, and interactive at every snap. */}

      <div
        ref={sheetRef}
        className={`qq-sheet${open ? ' is-open' : ''}${isDragging ? ' is-dragging' : ''}${isCollapsed ? ' is-collapsed' : ''}${reduceMotion ? ' is-reduced-motion' : ''}${hintActive ? ' is-hinting' : ''}`}
        data-testid="wizard-bottom-sheet"
        data-open={open ? 'true' : 'false'}
        data-collapsed={isCollapsed ? 'true' : 'false'}
        role="dialog"
        aria-label={`${activeTabLabel} settings`}
        aria-hidden={open ? undefined : true}
        /* Keep an explicit pixel height even while closed (pinned to the last
           open height) so closing is a pure transform slide-down. Leaving it
           unset would let the flex column snap to full content height for the
           transition — the momentary full-screen "unfold" before the panel
           closes. The closed sheet is translated fully off-screen, so this
           pinned height is never visible; it only prevents the height jump. */
        style={{
          height: `${Math.round(open ? currentHeightPx : lastOpenHeightRef.current)}px`,
        }}
      >
        {/* ── Drag handle row — grabber + title + close chevron ───────── */}
        <div className="qq-sheet-header">
          <button
            type="button"
            className="qq-sheet-grabber"
            data-testid="wizard-sheet-handle"
            aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!isCollapsed}
            onClick={toggleCollapsed}
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
            /* Slightly wider/taller than a hairline so the pill reads as an
               interactive, grabbable control rather than a decorative divider. */
            width: 38px; height: 4px; border-radius: ${AE.radius.pill};
            background: ${AE.color.hairlineStrong};
            transition: background 0.16s ease, transform 0.16s ease,
                        width 0.16s ease;
          }
          /* Pressed/active → darken + nudge the pill so the grab registers. */
          .qq-sheet-grabber:active .qq-sheet-grabber-bar {
            background: ${AE.color.secondary};
            width: 44px;
          }

          /* ── One-time drag-affordance hint ─────────────────────────
             On first open this session the pill gently bobs + glows a few
             times to signal "drag me", then the class is dropped. Honors
             reduced-motion (the whole branch is gated off below + the JS
             never sets the class when reduced-motion is on). */
          .qq-sheet.is-hinting .qq-sheet-grabber-bar {
            animation: qq-sheet-drag-hint 1.3s ease-in-out 2;
          }
          @keyframes qq-sheet-drag-hint {
            0%, 100% {
              transform: translateY(0) scaleX(1);
              background: ${AE.color.hairlineStrong};
            }
            50% {
              /* Soft upward bob + slight widen + accent-tinted glow. Quiet,
                 not a loud bounce — Tesla/Apple-simplicity standard. */
              transform: translateY(-3px) scaleX(1.12);
              background: ${AE.color.accent};
              box-shadow: 0 0 0 4px ${AE.color.accentTint};
            }
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
          /* No drag-hint bob/glow under reduced-motion (JS also never arms it). */
          .qq-sheet.is-hinting .qq-sheet-grabber-bar,
          .qq-sheet-grabber-bar {
            animation: none !important;
            transition: none !important;
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

        /* The portal wrapper carries the mirrored editor theme so the sheet's
           dark rules match off-tree. It must NOT establish a containing block
           or paint a backdrop: it has no flow size (only a fixed child) and is
           kept fully transparent / non-interactive so it never intercepts taps
           on the preview that shows through around the docked sheet. */
        .qq-sheet-portal {
          background: transparent !important;
          pointer-events: none;
        }
        .qq-sheet-portal > .qq-sheet { pointer-events: none; }
        .qq-sheet-portal > .qq-sheet.is-open { pointer-events: auto; }
      `}</style>
    </div>,
    document.body,
  );
}
