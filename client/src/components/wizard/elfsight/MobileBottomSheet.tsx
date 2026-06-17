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
import { ChevronDown, ChevronUp, ChevronsUpDown, HelpCircle, RotateCcw } from 'lucide-react';
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
// unpersisted open.
// QW-4 — lowered 0.42 → 0.30 so the sheet rests lower and the preview keeps
// ≈ 70% of the work area (was ≈ 58%). At 0.42 the sheet's top edge landed on
// the preview's "ESTIMATED TOTAL" result panel (clipping the headline total),
// so users edited pricing blind. Dropping the default ~95px clears the whole
// result panel — label AND the headline figure — above the resting sheet.
// Only affects first-time / unpersisted opens — a user who has dragged the
// sheet keeps their persisted fraction.
const DEFAULT_HEIGHT_FRAC = 0.30;

// Tap vs drag threshold (px of total movement).
const TAP_THRESHOLD_PX = 6;

// Downward FLING threshold. If, at pointerup, the recent downward velocity
// (px per ms, measured over the last few move samples) exceeds this, the sheet
// collapses to its peek regardless of how far it was dragged — a quick flick
// down folds it. The matching upward fling expands toward max. Tuned so a
// deliberate flick clears it but a slow controlled drag does not.
const FLING_VELOCITY_PX_PER_MS = 0.5;

const STORAGE_KEY = 'qq_wizard_sheet_height_frac';

// Legacy key (3-value snap enum) — ignored/migrated to the default fraction.
const LEGACY_SNAP_KEY = 'qq_wizard_sheet_snap';

// Show-until-LEARNED drag-affordance teaching. We keep teaching the user that
// the handle is draggable until they ACTUALLY drag the sheet at least once —
// persisted in localStorage so it survives across sessions. A safety cap also
// stops the cue after MAX_HINT_OPENS opens even if they never drag, so a user
// who simply never resizes isn't nagged forever.
const DRAGGED_KEY = 'qq_wizard_sheet_dragged';      // '1' once a real drag happened
const HINT_OPENS_KEY = 'qq_wizard_sheet_hint_opens'; // integer: # of teaching opens
const MAX_HINT_OPENS = 8;

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

// Whether the user has EVER performed a real drag-resize of the sheet. Once
// true we never teach the drag affordance again. localStorage so it persists
// across sessions (the gesture is learned once and stays learned).
function hasDragged(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(DRAGGED_KEY) === '1'; }
  catch { return false; }
}

// Record that the user has actually dragged the sheet — call this only from a
// genuine drag (real movement past the tap threshold), never from a tap.
function markDragged(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DRAGGED_KEY, '1'); }
  catch { /* private mode — fine, the safety cap still bounds the teaching */ }
}

// How many times the teaching hint has played so far (safety-cap counter).
function readHintOpens(): number {
  if (typeof window === 'undefined') return MAX_HINT_OPENS;
  try {
    const n = parseInt(window.localStorage.getItem(HINT_OPENS_KEY) ?? '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

function bumpHintOpens(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(HINT_OPENS_KEY, String(readHintOpens() + 1)); }
  catch { /* private mode — cap can't persist, but hasDragged() still stops it */ }
}

// The teaching cue should play on this open when the user has NOT yet dragged
// AND we're still under the safety cap. Reduced-motion is gated by the caller.
function shouldHintNow(): boolean {
  return !hasDragged() && readHintOpens() < MAX_HINT_OPENS;
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

  // Show-until-learned drag affordance: every time the sheet opens, if the user
  // has never actually dragged it (and we're under the safety cap), the grab
  // handle plays a subtle "you can drag me" bob/glow AND a quiet "Drag to
  // resize" caption appears, so users realize the panel is resizable. Once they
  // perform a real drag the localStorage flag is set and the cue never returns.
  // Disabled under reduced-motion.
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

  // ── Show-until-LEARNED drag-affordance hint (item 2) ───────────────
  // On open, if the user has NOT yet performed a real drag (localStorage
  // 'qq_wizard_sheet_dragged') and we're still under the safety cap
  // (MAX_HINT_OPENS), show the "Drag to resize" caption + grab-handle cue.
  // CHANGED: the cue now PERSISTS until the user actually learns the gesture —
  // it is NOT auto-dismissed on a timer (the old ~2.6s timeout removed). The
  // caption stays visible the whole time the sheet is open until a REAL drag
  // sets the localStorage flag (markDragged → hasDragged), after which it never
  // returns. Reduced-motion is still honored (steady accent tint, no motion —
  // see the CSS reduced-motion block; the bob keyframes are disabled there).
  // The safety cap still bounds total teaching opens so a user who never
  // resizes isn't nagged forever.
  useEffect(() => {
    if (!open) { setHintActive(false); return; }
    if (!shouldHintNow()) { setHintActive(false); return; }
    bumpHintOpens();
    setHintActive(true);
    // No timeout: the hint stays until a real drag is learned (or the sheet
    // closes). It is cleared by markDragged() on the next real drag and by the
    // shouldHintNow() gate on subsequent opens.
  }, [open]);

  // Stop the visible teaching cue (drop the class + caption). Called once a
  // REAL drag has been recorded (markDragged) so the cue clears the instant the
  // gesture is learned. A mere tap or grab does NOT call this — the hint must
  // persist until the user genuinely drags.
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

  // CHANGE A — whether a pointerdown began over the grabber pill. Drag works
  // from the WHOLE header, but a sub-threshold TAP only toggles the peek when
  // it started on the grabber (expanded state) — matching the pill's role as
  // the explicit collapse/expand control. While COLLAPSED, a tap anywhere on
  // the visible peek bar expands (the whole peek bar is the affordance).
  const tapFromGrabberRef = useRef(false);

  // ── Drag-to-resize (pointer) ──────────────────────────────────────
  // `vel` is the instantaneous signed vertical velocity (px/ms, down = +)
  // measured between the two most recent move samples; `lastY`/`lastT` carry
  // the previous sample so each move can update `vel`. On pointerup we use it
  // to detect a downward/upward FLING (item 1). `pointerId` lets us release a
  // stale capture defensively on the next pointerdown (item 3).
  const dragRef = useRef<
    { startY: number; startH: number; moved: number; lastY: number; lastT: number; vel: number; pointerId: number }
    | null
  >(null);

  // CHANGE A — the drag handlers are bound to the WHOLE header (.qq-sheet-header:
  // grabber row + title row), so a drag starting anywhere on the top bar resizes
  // the sheet — not just the 38px grabber pill. A pointerdown that lands on the
  // close chevron is ignored here so the close button's own tap still fires (it
  // must never be hijacked into a resize). Everything else on the header — and
  // the entire peek bar while collapsed — is a drag surface.
  // Item 4 — immediate "grabbed" feedback. Set on pointerdown (NOT after a
  // hold/threshold) so the bar visibly engages the instant the user touches it;
  // cleared on pointerup/cancel. Distinct from `isDragging`, which only turns on
  // once a drag is actually in progress — `isGrabbing` reflects the press alone.
  const [isGrabbing, setIsGrabbing] = useState(false);

  const onHandlePointerDown = useCallback((ev: React.PointerEvent) => {
    // Don't start a drag from the close chevron — let it close on tap. (Also
    // ignore the secondary mouse buttons so a right-click never arms a drag.)
    if (ev.button != null && ev.button !== 0) return;
    const startTarget = ev.target as HTMLElement | null;
    if (startTarget && startTarget.closest('.qq-sheet-close')) return;
    // Item 3 — gesture-race defence. A previous gesture (e.g. a preview
    // momentum scroll, or a drag whose pointerup we never saw because capture
    // was stolen) can leave stale drag/capture state that would otherwise make
    // this fresh pointerdown a no-op. Defensively clear any lingering dragRef
    // and release a stale capture BEFORE arming the new drag, so the FIRST
    // touch after a scroll always starts a drag.
    const headerEl = ev.currentTarget as HTMLElement;
    if (dragRef.current) {
      try { headerEl.releasePointerCapture(dragRef.current.pointerId); } catch { /* already released */ }
      dragRef.current = null;
    }
    // Record whether the gesture began on the grabber pill so a sub-threshold
    // tap there toggles the peek (see endDrag). A tap while collapsed expands
    // from anywhere on the peek bar.
    tapFromGrabberRef.current = !!(startTarget && startTarget.closest('.qq-sheet-grabber'));
    // NOTE: do NOT dismiss the teaching hint here. Per item 2 the cue must
    // persist until a REAL drag is learned — a press/tap alone must not clear
    // it. dismissHint() is now called from endDrag only after markDragged().
    computeGeom();
    // Start from whatever is currently rendered (peek or open resting height).
    const startH = peeked ? COLLAPSED_PX : Math.min(openHeightPx, geomRef.current.maxPx || openHeightPx);
    const now = ev.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    dragRef.current = {
      startY: ev.clientY, startH, moved: 0,
      lastY: ev.clientY, lastT: now, vel: 0, pointerId: ev.pointerId,
    };
    setIsGrabbing(true);
    setIsDragging(true);
    setDragHeight(startH);
    // Capture on THIS pointerdown without waiting for any prior gesture to
    // settle, so move/up events route here even if the preview's scroll
    // container is still finishing its momentum (item 3).
    try { headerEl.setPointerCapture(ev.pointerId); } catch { /* capture unsupported */ }
  }, [computeGeom, peeked, openHeightPx]);

  const onHandlePointerMove = useCallback((ev: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = ev.clientY - drag.startY; // down = positive
    drag.moved = Math.max(drag.moved, Math.abs(delta));
    // Track instantaneous velocity (px/ms, down = +) between samples so a fling
    // can be detected on release (item 1). Ignore zero-dt samples.
    const now = ev.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = now - drag.lastT;
    if (dt > 0) {
      drag.vel = (ev.clientY - drag.lastY) / dt;
      drag.lastY = ev.clientY;
      drag.lastT = now;
    }
    const { maxPx } = geomRef.current;
    // Drag up (negative delta) grows the sheet; clamp to [collapsed, max].
    const next = Math.min(maxPx, Math.max(COLLAPSED_PX, drag.startH - delta));
    setDragHeight(next);
  }, []);

  const endDrag = useCallback((ev: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    setIsGrabbing(false);
    try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (!drag) { setDragHeight(null); return; }
    if (drag.moved < TAP_THRESHOLD_PX) {
      // Treated as a TAP. Toggle the peek when the tap began on the grabber
      // pill (its explicit control role) OR when the sheet is currently
      // collapsed (the whole peek bar expands on tap — CHANGE A/B). A tap on
      // the EXPANDED header's title row is a no-op (it isn't a control). We
      // drive the toggle directly here rather than relying on the grabber's
      // synthetic onClick, because pointer-capture now lives on the header and
      // the click target can differ. suppressClickRef still stops the grabber's
      // own onClick from double-toggling.
      setDragHeight(null);
      // `peeked` is the resting-collapsed source of truth here (dragHeight is
      // being cleared this tick, so the derived isCollapsed isn't usable yet).
      if (tapFromGrabberRef.current || peeked) {
        suppressClickRef.current = true;
        setPeeked((cur) => !cur);
      }
      return;
    }
    // Real drag → the user has now LEARNED the gesture; record it so the
    // teaching cue never plays again (show-until-learned). Set here, not on
    // drag-start, so a mere tap (handled above) never counts as a drag.
    markDragged();
    dismissHint(); // gesture learned → clear the teaching cue immediately
    suppressClickRef.current = true;
    const live = dragHeight ?? drag.startH;
    const { maxPx } = geomRef.current;
    // Item 1 — FLING + drag-down-to-fold resolution. A fast DOWNWARD flick
    // (velocity past the threshold) collapses to the peek even if the absolute
    // distance is small; a fast UPWARD flick expands toward max. Absent a fling,
    // releasing at/below the usable open minimum also collapses (drag-down-to-
    // fold by distance). Otherwise the sheet rests at the released height.
    if (drag.vel >= FLING_VELOCITY_PX_PER_MS) {
      // Downward fling → fold to peek.
      setPeeked(true);
    } else if (drag.vel <= -FLING_VELOCITY_PX_PER_MS) {
      // Upward fling → expand toward the max usable height.
      setOpenHeight(maxPx);
      setPeeked(false);
    } else if (live <= MIN_OPEN_PX) {
      // Dragged/released below the usable open minimum → collapse to peek.
      setPeeked(true);
    } else {
      // Free resize → REST at the released height (no snap-back).
      setOpenHeight(clamp(live, MIN_OPEN_PX, maxPx));
      setPeeked(false);
    }
    setDragHeight(null);
  }, [dragHeight, setOpenHeight, peeked, dismissHint]);

  // ── #8 — drag-to-resize from the SCROLLABLE BODY ───────────────────
  // The header strip is only ~54-71px tall, so a drag that lands on the body
  // below the title row used to hit the scroll container and never moved the
  // sheet. We now couple a drag-to-resize to `.qq-sheet-content`:
  //   - When the body is scrolled to the TOP (overscroll-at-top) a vertical
  //     drag resizes the SHEET (pull DOWN collapses/shrinks, pull UP grows) —
  //     the classic bottom-sheet handoff.
  //   - Otherwise the gesture scrolls the body natively (we never arm a drag),
  //     so reading long panels still works.
  // A small directional threshold decides scroll-vs-resize on the first move so
  // we don't steal a downward scroll the instant the finger lands at the top.
  // touch-action stays `pan-y` on the body so native scroll is available until
  // we explicitly capture for a resize.
  const bodyDragRef = useRef<
    | { startY: number; startH: number; armedAtTop: boolean; engaged: boolean; pointerId: number; vel: number; lastY: number; lastT: number; moved: number }
    | null
  >(null);

  const onContentPointerDown = useCallback((ev: React.PointerEvent) => {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.pointerType === 'mouse') return; // body resize is a touch affordance
    const el = contentRef.current;
    const atTop = !el || el.scrollTop <= 0;
    const now = ev.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    computeGeom();
    const startH = peeked ? COLLAPSED_PX : Math.min(openHeightPx, geomRef.current.maxPx || openHeightPx);
    bodyDragRef.current = {
      startY: ev.clientY, startH, armedAtTop: atTop, engaged: false,
      pointerId: ev.pointerId, vel: 0, lastY: ev.clientY, lastT: now, moved: 0,
    };
  }, [computeGeom, peeked, openHeightPx]);

  const onContentPointerMove = useCallback((ev: React.PointerEvent) => {
    const bd = bodyDragRef.current;
    if (!bd) return;
    const delta = ev.clientY - bd.startY; // down = +
    bd.moved = Math.max(bd.moved, Math.abs(delta));
    const now = ev.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = now - bd.lastT;
    if (dt > 0) { bd.vel = (ev.clientY - bd.lastY) / dt; bd.lastY = ev.clientY; bd.lastT = now; }

    if (!bd.engaged) {
      // Decide scroll-vs-resize once past the tap threshold. We engage a sheet
      // resize only when the body is at the top AND the finger moves DOWN (pull
      // the sheet down) — or moves UP while the sheet isn't already at max
      // (grow it). If the body is scrolled, we never engage → native scroll.
      if (bd.moved < TAP_THRESHOLD_PX) return;
      const el = contentRef.current;
      const atTopNow = !el || el.scrollTop <= 0;
      const pullingDown = delta > 0;
      const { maxPx } = geomRef.current;
      const canGrow = bd.startH < maxPx - 1;
      const wantResize = atTopNow && (pullingDown || (delta < 0 && canGrow));
      if (!wantResize) {
        // Let native scroll own this gesture; disarm so we don't fight it.
        bodyDragRef.current = null;
        return;
      }
      bd.engaged = true;
      setIsDragging(true);
      setIsGrabbing(true);
      setDragHeight(bd.startH);
      try { (ev.currentTarget as HTMLElement).setPointerCapture(bd.pointerId); } catch { /* unsupported */ }
    }

    // Engaged → drive the sheet height (up grows, down shrinks). Same clamp as
    // the header drag.
    ev.preventDefault();
    const { maxPx } = geomRef.current;
    const next = Math.min(maxPx, Math.max(COLLAPSED_PX, bd.startH - delta));
    setDragHeight(next);
  }, []);

  const onContentPointerEnd = useCallback((ev: React.PointerEvent) => {
    const bd = bodyDragRef.current;
    bodyDragRef.current = null;
    if (!bd || !bd.engaged) return;
    setIsDragging(false);
    setIsGrabbing(false);
    try { (ev.currentTarget as HTMLElement).releasePointerCapture(bd.pointerId); } catch { /* ignore */ }
    // A real body-drag also counts as learning the gesture.
    markDragged();
    dismissHint();
    const live = dragHeight ?? bd.startH;
    const { maxPx } = geomRef.current;
    if (bd.vel >= FLING_VELOCITY_PX_PER_MS) {
      setPeeked(true);
    } else if (bd.vel <= -FLING_VELOCITY_PX_PER_MS) {
      setOpenHeight(maxPx);
      setPeeked(false);
    } else if (live <= MIN_OPEN_PX) {
      setPeeked(true);
    } else {
      setOpenHeight(clamp(live, MIN_OPEN_PX, maxPx));
      setPeeked(false);
    }
    setDragHeight(null);
  }, [dragHeight, setOpenHeight, dismissHint]);

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
        className={`qq-sheet${open ? ' is-open' : ''}${isDragging ? ' is-dragging' : ''}${isGrabbing ? ' is-grabbing' : ''}${isCollapsed ? ' is-collapsed' : ''}${reduceMotion ? ' is-reduced-motion' : ''}${hintActive ? ' is-hinting' : ''}`}
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
        {/* ── Drag handle row — grabber + title + close chevron ─────────
            CHANGE A — the drag handlers live on the WHOLE header, so a drag
            starting anywhere on the top bar (grabber row OR title row, and the
            entire peek bar while collapsed) resizes the sheet. A pointerdown on
            the close chevron is ignored in onHandlePointerDown so its tap still
            closes. touch-action:none on the header makes the vertical drag own
            the gesture (no native scroll/zoom fighting it). */}
        <div
          className="qq-sheet-header"
          data-testid="wizard-sheet-header"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            type="button"
            className="qq-sheet-grabber"
            data-testid="wizard-sheet-handle"
            aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!isCollapsed}
            onClick={toggleCollapsed}
          >
            <span className="qq-sheet-grabber-bar" aria-hidden="true" />
            {/* CHANGE B — persistent folded-bar resize affordance. Only rendered
                while collapsed; a faint up-chevron that breathes (steady accent
                tint under reduced-motion) so the peek bar always reads "drag me
                up to resize". Separate from the expanded first-run teaching cue
                above. aria-hidden — the grabber button already announces
                Expand/Collapse. */}
            {isCollapsed && (
              <ChevronUp
                className="qq-sheet-peek-cue"
                size={14}
                aria-hidden="true"
              />
            )}
          </button>
          {/* Teaching caption — only while the cue is active. Absolutely
              positioned over the grabber row so it never shifts layout, never
              causes 375px overflow, and never overlaps the title/close (it sits
              between the pill and the title row, fading in/out with the hint).
              aria-hidden: the button already announces "Expand/Collapse"; the
              caption is a purely visual teaching cue. */}
          {hintActive && (
            <div className="qq-sheet-drag-caption" aria-hidden="true">
              <ChevronsUpDown size={14} aria-hidden="true" />
              <span>Drag to resize</span>
            </div>
          )}
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
          /* #8 — couple a touch drag-to-resize to the body: a vertical drag
             while the body is scrolled to the top resizes the sheet (down =
             shrink/collapse, up = grow); otherwise the body scrolls natively. */
          onPointerDown={onContentPointerDown}
          onPointerMove={onContentPointerMove}
          onPointerUp={onContentPointerEnd}
          onPointerCancel={onContentPointerEnd}
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
            /* FROSTED GLASS resize sheet. The sheet docks OVER the preview, so
               the preview sits behind it — a half-transparent frosted surface
               lets it show through while the user grabs/drags to resize. The
               light editor surface is taken at ~72% alpha and the
               backdrop-filter blurs+lightens what shows through, so the panel's
               own text/controls stay readable while the preview is still
               partly visible. (#1868 deferred this assuming nothing was behind
               the sheet — but the docked sheet sits over the preview.) */
            /* nav-distinction (Alex 2026-06-17) — the frosted sheet used to read
               as the SAME white as the preview widget above it (its top border
               was rgba(255,255,255,0.5) — white on white — and AE.shadow.pop
               casts DOWNWARD, away from the canvas). It now reads as a chrome
               layer docked OVER the canvas: a faint cool tint (vs the pure-white
               widget), a defined hairline top edge, and an UPWARD shadow that
               lifts it off the canvas above. Still frosted/see-through per
               Alex's glass spec — opacity only nudged 0.72 → 0.80. */
            background: rgba(247, 248, 250, 0.80);
            -webkit-backdrop-filter: blur(20px) saturate(150%);
            backdrop-filter: blur(20px) saturate(150%);
            font-family: ${AE.font.family};
            color: ${AE.color.text};
            border-top-left-radius: ${AE.radius.lg};
            border-top-right-radius: ${AE.radius.lg};
            box-shadow: 0 -6px 24px rgba(15, 23, 42, 0.10), 0 -1px 0 ${AE.color.hairline};
            border-top: 1px solid ${AE.color.hairlineStrong};
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
          /* Fallback — browsers without backdrop-filter get a near-solid light
             surface so the panel text/controls never lose contrast (no
             see-through, but never an unreadable wash). */
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .qq-sheet { background: rgba(247, 248, 250, 0.98); }
          }

          /* ── Drag handle + header ──────────────────────────────── */
          .qq-sheet-header {
            flex-shrink: 0;
            /* Anchor the absolutely-positioned teaching caption. */
            position: relative;
            /* CHANGE A — the whole header is the drag surface; touch-action:none
               here (not just on the grabber) so a vertical drag that starts on
               the title row owns the gesture instead of triggering native
               scroll/zoom. The close chevron re-enables auto below so its tap is
               unaffected. */
            touch-action: none;
            cursor: grab;
          }
          .qq-sheet-header:active { cursor: grabbing; }
          /* Item 4 — immediate grab feedback. On pointerdown the JS adds the
             is-grabbing class, giving the whole header an instant pressed-in
             look: a faint accent tint plus a subtle inset shadow + scale-down so
             the bar reads as engaged for dragging the moment it's touched (no
             tap-and-hold). Reduced-motion keeps the colour change but drops the
             transform (handled in the reduced-motion block). The transition is
             fast so it feels button-like, and is killed during an active drag so
             height tracking stays jank-free. */
          .qq-sheet-header {
            transition: background 0.1s ease, box-shadow 0.1s ease,
                        transform 0.1s ease;
            transform-origin: center top;
          }
          .qq-sheet.is-grabbing .qq-sheet-header {
            background: ${AE.color.accentTint};
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.10);
            transform: scaleY(0.97);
          }
          .qq-sheet.is-dragging .qq-sheet-header {
            transition: none;
          }
          .qq-sheet-grabber {
            display: flex; align-items: center; justify-content: center;
            /* Item 5 — drag bar trimmed ~30%: the visible grabber row is shorter
               (min-height 18px + 6px/3px padding vs the old 28px + 10px/4px),
               so the bar reads noticeably slimmer. The ≥44px effective touch
               target is preserved by the invisible padding extension below
               (.qq-sheet-header padding-top) — the TARGET stays large while the
               VISIBLE bar shrinks. */
            /* #8 — enlarge the dedicated drag strip's touch target. The VISIBLE
               grabber bar stays slim (38×4px) but the grabbable row is taller
               (more top/bottom padding) so a drag is easy to land on the bar
               itself, complementing the body-drag handoff below. */
            width: 100%; min-height: 22px; padding: 11px 0 7px;
            background: transparent; border: none; cursor: inherit;
            /* The grabber inherits the header's touch-action:none. */
            position: relative;
          }
          .qq-sheet-grabber:active { cursor: grabbing; }
          .qq-sheet.is-grabbing .qq-sheet-grabber-bar {
            background: ${AE.color.accent};
            width: 44px;
          }
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
          /* ── "Drag to resize" teaching caption ─────────────────────
             Absolutely positioned over the header so it adds NO layout (never
             shifts the pill/title/close and never causes 375px overflow). It's
             horizontally centred and sits just under the pill, in the gap to
             the right of the short left-aligned tab title and left of the close
             chevron, so it overlaps neither. Quiet, accent-tinted, small — it
             fades in with the hint and is unmounted the instant the hint ends
             (or the user drags). Resting state shows ONLY the clean pill. */
          .qq-sheet-drag-caption {
            position: absolute;
            top: 18px; left: 50%;
            transform: translateX(-50%);
            display: inline-flex; align-items: center; gap: 4px;
            padding: 2px 8px;
            border-radius: ${AE.radius.pill};
            background: ${AE.color.accentTint};
            color: ${AE.color.accent};
            font-size: 11px; font-weight: 600; line-height: 1;
            letter-spacing: -0.01em;
            white-space: nowrap;
            pointer-events: none;
            z-index: 1;
            animation: qq-sheet-caption-fade 0.22s ease-out both;
          }
          .qq-sheet-drag-caption svg {
            width: 14px; height: 14px; flex-shrink: 0;
          }
          @keyframes qq-sheet-caption-fade {
            from { opacity: 0; transform: translateX(-50%) translateY(-2px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
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
            /* Re-enable native touch behaviour on the close target so its tap is
               never swallowed by the header's touch-action:none drag region. */
            touch-action: auto;
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

          /* ── CHANGE B — persistent folded-bar resize affordance ──────
             Unlike the one-time "show-until-learned" teaching cue (which only
             plays in the EXPANDED state until the first real drag), the FOLDED
             peek bar must ALWAYS signal it's draggable/resizable. While
             collapsed: the grabber pill takes an accent tint and gently
             breathes upward, and a faint accent up-chevron pulses just below it
             — quiet/Apple-like, reading "drag me up to resize". Both honor
             prefers-reduced-motion (steady accent tint + static up-cue, no
             motion) in the reduced-motion block below. */
          .qq-sheet.is-collapsed .qq-sheet-grabber {
            /* A touch more vertical room so the up-chevron cue has space under
               the pill without growing the 64px peek row. */
            padding-bottom: 2px;
          }
          .qq-sheet.is-collapsed .qq-sheet-grabber-bar {
            background: ${AE.color.accent};
            animation: qq-sheet-peek-breathe 2.4s ease-in-out infinite;
          }
          @keyframes qq-sheet-peek-breathe {
            0%, 100% { transform: translateY(0) scaleX(1); opacity: 0.85; }
            50%      { transform: translateY(-2px) scaleX(1.08); opacity: 1; }
          }
          .qq-sheet-peek-cue {
            position: absolute;
            top: 18px; left: 50%;
            transform: translateX(-50%);
            color: ${AE.color.accent};
            pointer-events: none;
            opacity: 0.9;
            animation: qq-sheet-peek-cue-pulse 2.4s ease-in-out infinite;
          }
          @keyframes qq-sheet-peek-cue-pulse {
            0%, 100% { transform: translateX(-50%) translateY(0);   opacity: 0.45; }
            50%      { transform: translateX(-50%) translateY(-2px); opacity: 0.95; }
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
            border-top: 1px solid rgba(255, 255, 255, 0.5);
            /* Light scrim (not the opaque sheet bg) so the frosted see-through
               carries through the footer too, while the buttons stay readable
               on their own surfaces. */
            background: rgba(255, 255, 255, 0.34);
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

          /* Dark editor theme ── frosted dark surface (keep the see-through). */
          .qq-editor-shell[data-theme="dark"] .qq-sheet {
            background: rgba(22, 27, 38, 0.62);
            border-top-color: rgba(255, 255, 255, 0.12);
          }
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .qq-editor-shell[data-theme="dark"] .qq-sheet {
              background: rgba(15, 23, 42, 0.97);
            }
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-header-row {
            border-bottom-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-title {
            color: var(--qq-text, rgba(255,255,255,1));
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer {
            background: rgba(22, 27, 38, 0.34);
            border-top-color: rgba(255, 255, 255, 0.12);
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
          /* No drag-hint bob/glow under reduced-motion, but KEEP a steady accent
             tint on the bar while hinting so the persistent "Drag to resize" cue
             (item 2) still reads as an affordance without motion. */
          .qq-sheet-grabber-bar {
            animation: none !important;
            transition: none !important;
          }
          .qq-sheet.is-hinting .qq-sheet-grabber-bar {
            animation: none !important;
            background: ${AE.color.accent};
          }
          /* Item 4 under reduced-motion — keep the grab COLOUR change so the
             press still registers, but drop the inset-shadow + scale transform
             (no motion). */
          .qq-sheet-header {
            transition: none !important;
          }
          .qq-sheet.is-grabbing .qq-sheet-header {
            box-shadow: none !important;
            transform: none !important;
          }
          /* CHANGE B under reduced-motion — kill the breathing/pulse but KEEP
             the static accent cue so the folded bar still reads "resizable":
             the pill stays accent-tinted and the up-chevron stays visible. */
          .qq-sheet.is-collapsed .qq-sheet-grabber-bar {
            animation: none !important;
            background: ${AE.color.accent};
          }
          .qq-sheet-peek-cue {
            animation: none !important;
            opacity: 0.7;
          }
          /* Under reduced-motion the caption may still mount (item 2 — the hint
             persists regardless of motion preference), so we kill only its fade
             animation; the steady accent-tinted caption itself stays visible. */
          .qq-sheet-drag-caption {
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
