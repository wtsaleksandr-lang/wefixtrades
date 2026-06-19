import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useHoverIntent — open-on-hover with intent, for the account/settings
 * dropdown. Wraps a controlled `open` boolean so a Radix DropdownMenu can
 * open on pointer hover while staying fully click- and keyboard-accessible.
 *
 * Design notes:
 *  - `onMouseEnter` opens immediately; `onMouseLeave` closes after a short
 *    grace delay so the cursor can travel from the trigger into the menu
 *    panel (which sits in a portal but is positioned flush below the trigger)
 *    without the menu snapping shut mid-travel.
 *  - Touch devices fire no hover events, so the menu falls back to tap —
 *    the Radix trigger's own click toggles `open` via `setOpen`.
 *  - Keyboard + Escape are untouched: Radix still drives `onOpenChange`,
 *    which we forward into the same `open` state.
 */
export function useHoverIntent(closeDelayMs = 140) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    clear();
    setOpen(true);
  }, [clear]);

  const onMouseLeave = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => setOpen(false), closeDelayMs);
  }, [clear, closeDelayMs]);

  // Clear any pending close timer on unmount so we never call setState on an
  // unmounted component (the layout re-mounts on every route change).
  useEffect(() => clear, [clear]);

  return { open, setOpen, onMouseEnter, onMouseLeave };
}

export default useHoverIntent;
