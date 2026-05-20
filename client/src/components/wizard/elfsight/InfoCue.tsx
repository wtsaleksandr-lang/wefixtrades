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

interface Props {
  text: string;
  /** Optional aria-label for the trigger (defaults to "More info"). */
  label?: string;
  /** Optional testid suffix — final testid is `info-cue-<testid>`. */
  testid?: string;
}

export default function InfoCue({ text, label = 'More info', testid }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the most recent open was sticky (click) or transient
  // (hover/focus). Sticky opens ignore mouseleave so the popover doesn't
  // vanish under the user the moment they move toward it.
  const stickyRef = useRef(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverId = useId();
  const tid = testid ? `info-cue-${testid}` : 'info-cue';

  const placePopover = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const top = r.bottom + 6;
    const desiredLeft = r.left + r.width / 2 - 140; // 280px-wide card centred
    const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1024) - 12 - 280;
    const left = Math.max(8, Math.min(desiredLeft, maxLeft));
    setPos({ top, left });
  }, []);

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
        onMouseEnter={() => { if (!open) setOpen(true); }}
        onMouseLeave={(e) => {
          if (stickyRef.current) return; // click-driven open ignores hover-out
          const rel = e.relatedTarget as Node | null;
          if (rel && popoverRef.current?.contains(rel)) return;
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (stickyRef.current) return;
          setOpen(false);
        }}
        onClick={(e) => {
          e.preventDefault();
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
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          className="qq-info-cue-popover"
          data-testid={`${tid}-popover`}
          style={{ top: pos.top, left: pos.left }}
          onMouseLeave={() => {
            if (stickyRef.current) return;
            setOpen(false);
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}
