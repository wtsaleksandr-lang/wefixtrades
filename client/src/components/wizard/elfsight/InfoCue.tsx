// InfoCue — Wave J item 2.
//
// Small `?` icon shown next to a section title. Hover (desktop) OR tap
// (mobile / coarse-pointer) reveals a popover with helper copy. Tap again
// or tap outside dismisses on mobile. Used everywhere the editor previously
// rendered a small grey explanatory subtitle below a section header.
//
// Click ALWAYS opens the popover; mouseleave on the trigger (and the
// popover itself) closes it. Click-outside or Escape also dismisses. The
// result: a single click always leaves the popover visible (good for
// Playwright + mobile), while desktop hover keeps the open-on-hover feel.
//
// Zero new dependencies — pure React state + a fixed-position popover
// anchored to the icon via getBoundingClientRect().

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import WidgetSchema, { type WidgetRegion } from './WidgetSchema';

interface Props {
  text: string;
  /** Optional aria-label for the trigger (defaults to "More info"). */
  label?: string;
  /** Optional testid suffix — final testid is `info-cue-<testid>`. */
  testid?: string;
  /**
   * BD-3h — when set, the popover renders a small wireframe diagram of the
   * calculator widget with the named region highlighted, ABOVE the helper
   * text. Backwards compatible: cues without `region` render text-only.
   */
  region?: WidgetRegion;
}

/** UX fix bundle (2026-05-22) — Alex flagged the popover was firing too
 *  easily on casual mouse-overs. Industry standard is 300–400ms; we go with
 *  350ms. Only the HOVER branch is delayed — focus and click remain instant
 *  so keyboard users and explicit tappers don't notice the change. Touch
 *  devices don't fire hover so they're unaffected. */
const HOVER_OPEN_DELAY_MS = 350;

export default function InfoCue({ text, label = 'More info', testid, region }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the most recent open was sticky (click) or transient
  // (hover/focus). Sticky opens ignore mouseleave so the popover doesn't
  // vanish under the user the moment they move toward it.
  const stickyRef = useRef(false);
  // Pending hover-open timer. Cleared if the cursor leaves before the
  // 350ms threshold elapses.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverId = useId();
  const tid = testid ? `info-cue-${testid}` : 'info-cue';
  // Wave L P2 — detect the nearest editor-shell theme so the portaled
  // popover can apply matching dark-mode styles (its parent in the DOM is
  // now document.body, so it can't inherit the [data-theme] selector
  // chained off .qq-editor-shell).
  const editorTheme = (() => {
    if (typeof document === 'undefined') return 'light';
    const t = triggerRef.current?.closest('.qq-editor-shell') as HTMLElement | null;
    return t?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  })();

  // Wave L P2 — position immediately adjacent to the icon.
  // Width is clamped to min(280, viewportWidth - 32) and centred on the
  // trigger; auto-flips above when there's no room below. Tracking is via
  // getBoundingClientRect of the trigger button. Since the popover is now
  // portaled to document.body (not inside the wizard-shell-modal which has
  // its own `transform` from the open animation), `position: fixed` resolves
  // to the actual viewport.
  const placePopover = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const popW = Math.min(280, vw - 32);
    // BD-3h — popovers with a wireframe diagram are taller (~220px) than
    // text-only ones (~100px). Bump the estimate when `region` is set so the
    // auto-flip-above logic picks the right side of the trigger.
    const popHEst = region ? 220 : 100;
    // Centre on the trigger horizontally, then clamp to viewport with 8px
    // margin.
    const desiredLeft = r.left + r.width / 2 - popW / 2;
    const left = Math.max(8, Math.min(desiredLeft, vw - 8 - popW));
    // Prefer below the trigger; flip above when there isn't room.
    const fitsBelow = r.bottom + 6 + popHEst <= vh - 8;
    const top = fitsBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - popHEst);
    setPos({ top, left });
  }, [region]);

  // Tap-outside / Escape dismiss.
  useEffect(() => {
    if (!open) return;
    placePopover();
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      stickyRef.current = false;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stickyRef.current = false;
        setOpen(false);
      }
    };
    const onScroll = () => placePopover();
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
  }, [open, placePopover]);

  // Wave L P1 — defensive guard: an InfoCue with no text shouldn't render
  // the trigger at all, otherwise the user clicks a `?` and nothing happens.
  if (!text || !text.trim()) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="qq-info-cue"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        data-testid={tid}
        onMouseEnter={() => {
          if (open) return;
          // UX fix bundle — defer the open by 350ms so the popover doesn't
          // fire on casual mouse-overs. Cleared if the cursor leaves first.
          clearHoverTimer();
          hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null;
            setOpen(true);
          }, HOVER_OPEN_DELAY_MS);
        }}
        onMouseLeave={(e) => {
          // Always abort a pending hover-open — cursor is gone.
          clearHoverTimer();
          if (stickyRef.current) return; // click-driven open ignores hover-out
          const rel = e.relatedTarget as Node | null;
          if (rel && popoverRef.current?.contains(rel)) return;
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          clearHoverTimer();
          if (stickyRef.current) return;
          setOpen(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          // Click is an explicit signal — bypass the hover delay entirely.
          clearHoverTimer();
          // BD-3d Feature 2 — broadcast a help-cue click so the AI chat
          // bubble can surface a proactive nudge ("Need a hand?"). Dispatched
          // even on the dismissing second click — the signal is "user is
          // engaging with help affordances", which is exactly when the
          // assistant should offer help.
          if (typeof window !== 'undefined') {
            try { window.dispatchEvent(new CustomEvent('quotequick:help-cue-clicked')); } catch { /* ignore */ }
          }
          // Toggle the sticky branch. A second click with the popover open
          // dismisses; the first click pins it open.
          if (stickyRef.current) {
            stickyRef.current = false;
            setOpen(false);
          } else {
            stickyRef.current = true;
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          className="qq-info-cue-popover"
          data-testid={`${tid}-popover`}
          data-theme={editorTheme}
          style={{ top: pos.top, left: pos.left }}
          onMouseLeave={() => {
            if (stickyRef.current) return;
            setOpen(false);
          }}
        >
          {region ? (
            <div className="qq-info-cue-schema-wrap" data-testid={`${tid}-schema`}>
              <WidgetSchema highlight={region} />
            </div>
          ) : null}
          <div className="qq-info-cue-text">{text}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
