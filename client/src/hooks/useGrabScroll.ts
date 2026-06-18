import { useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/**
 * useGrabScroll — mouse click-and-drag to scroll a horizontal overflow row,
 * matching the proven HorizontalCarousel behaviour (drag threshold, trailing
 * click-suppression, grab/grabbing cursor). Touch is left to the native
 * scroller (we ignore non-mouse pointers) so iOS swipe + vertical page scroll
 * are unaffected.
 *
 * Usage:
 *   const grab = useGrabScroll<HTMLDivElement>();
 *   <div ref={grab.ref} {...grab.handlers} style={{ ...grab.style, overflowX: "auto" }}>
 *
 * Additive: pair it with existing arrow buttons — drag is just a second way to
 * move the same row.
 */
const DRAG_THRESHOLD = 5; // px before a press counts as a drag (not a click)

export function useGrabScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const st = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });

  const onPointerDown = useCallback((e: ReactPointerEvent<T>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    st.current = { active: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft };
    el.style.cursor = "grabbing";
    // NB: intentionally no setPointerCapture — capturing the pointer on the
    // row swallows clicks on child chips/cards. pointermove still reaches this
    // handler via bubbling while the cursor is over the row, and pointerleave
    // ends the drag if it exits, so scroll-drag works without capture.
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<T>) => {
    if (!st.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - st.current.startX;
    if (!st.current.moved && Math.abs(dx) > DRAG_THRESHOLD) st.current.moved = true;
    if (st.current.moved) {
      e.preventDefault();
      el.scrollLeft = st.current.startScroll - dx;
    }
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<T>) => {
    if (!st.current.active) return;
    const wasMoved = st.current.moved;
    st.current.active = false;
    const el = ref.current;
    if (el) {
      el.style.cursor = "grab";
    }
    // Swallow the click that follows a real drag so chips/cards don't fire.
    if (wasMoved && el) {
      const suppress = (clickEvt: Event) => { clickEvt.preventDefault(); clickEvt.stopPropagation(); };
      el.addEventListener("click", suppress, { capture: true, once: true });
      requestAnimationFrame(() => el.removeEventListener("click", suppress, { capture: true } as EventListenerOptions));
    }
  }, []);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerLeave: endDrag,
  };

  const style: CSSProperties = { cursor: "grab", userSelect: "none", WebkitUserSelect: "none" };

  return { ref, handlers, style };
}

export default useGrabScroll;
