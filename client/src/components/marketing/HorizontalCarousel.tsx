/**
 * HorizontalCarousel — shared scroll row for every review / testimonial
 * section across the marketing site.
 *
 * Behaviour:
 *   • Native horizontal scroll (touch drag works for free; wheel-y
 *     translates to scroll-x via pointer + wheel handlers).
 *   • Mouse drag — pointerdown + pointermove translates `scrollLeft`,
 *     standard ~20-LOC implementation. Disabled on coarse pointers so
 *     touch devices don't fight the native scroller.
 *   • Snap-scroll: `scroll-snap-type: x mandatory` on the container,
 *     children should set `scrollSnapAlign: "start"` (left to caller).
 *   • Arrow buttons step by one card-width + gap. canPrev/canNext flip
 *     based on scrollLeft + clientWidth + scrollWidth, so the arrows
 *     disable themselves at the ends instead of pointlessly clicking.
 *
 * Visual standard: arrows live in the section's header bar (above the
 * row) on desktop — matches the blog page pattern. Mobile = arrows
 * still rendered (touch users can ignore them) but the row also accepts
 * touch drag.
 *
 * No new dependencies. Inline ~80 LOC of pointer/wheel logic. Re-uses
 * the existing `qq-fade-scroll-row` utility for mask-fade + scrollbar
 * hiding so every row matches the polish on the home reviews section.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { CarouselArrowGroup } from "./CarouselArrowButton";

type ArrowTheme = "light" | "dark";

export interface HorizontalCarouselHandle {
  scrollByCard: (dir: "prev" | "next") => void;
}

interface HorizontalCarouselProps {
  children: ReactNode;
  /** Optional heading area rendered to the LEFT of the arrow group. */
  heading?: ReactNode;
  /** Show the prev/next arrow group above the row. Default true. */
  showArrows?: boolean;
  /** Theme for the arrow capsule. */
  arrowTheme?: ArrowTheme;
  /** Approx card width incl. gap for "step by one card" arrow scroll. */
  cardStep?: number;
  /** Extra style for the scroll row itself. */
  rowStyle?: CSSProperties;
  /** Extra class for the row. `qq-fade-scroll-row` is applied by default. */
  rowClassName?: string;
  /** Extra style for the wrapping section. */
  style?: CSSProperties;
  /** className passthrough on the wrapper section. */
  className?: string;
  "data-testid"?: string;
}

export const HorizontalCarousel = forwardRef<
  HorizontalCarouselHandle,
  HorizontalCarouselProps
>(function HorizontalCarousel(
  {
    children,
    heading,
    showArrows = true,
    arrowTheme = "dark",
    cardStep,
    rowStyle,
    rowClassName,
    style,
    className,
    "data-testid": testId,
  },
  ref,
) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  /* ── Scroll position tracking — drives arrow enable/disable ─────── */
  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setCanPrev(!atStart);
    setCanNext(!atEnd);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateEdges();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateEdges);
    };
  }, [updateEdges]);

  /* ── Step-by-card scroll ────────────────────────────────────────── */
  const scrollByCard = useCallback(
    (dir: "prev" | "next") => {
      const el = scrollerRef.current;
      if (!el) return;
      // If cardStep wasn't supplied, fall back to the first child's
      // measured offsetWidth + the container gap (≈ what a single card
      // occupies). This makes the component robust whether or not the
      // caller passes an explicit step.
      let step = cardStep;
      if (!step) {
        const firstCard = el.querySelector<HTMLElement>(":scope > *");
        const fallback = firstCard?.offsetWidth ?? el.clientWidth * 0.8;
        const gap = 16; // matches design-system card-gap default
        step = fallback + gap;
      }
      el.scrollBy({
        left: dir === "next" ? step : -step,
        behavior: "smooth",
      });
    },
    [cardStep],
  );

  useImperativeHandle(ref, () => ({ scrollByCard }), [scrollByCard]);

  /* ── Mouse drag-to-scroll ────────────────────────────────────────
   * pointerdown on the row captures the cursor and tracks deltaX into
   * scrollLeft. We skip this on coarse pointers (touch) because the
   * native horizontal scroll already handles them — running both leads
   * to fight-the-user jitter on iOS Safari.
   *
   * Fixes (Wave R — Alex couldn't grab+drag reviews):
   *   1. `user-select: none` while dragging — without it, mousedown on
   *      card text starts a text-selection drag which steals the
   *      pointer + cancels our scrollLeft updates the moment the
   *      cursor crosses into another text node.
   *   2. `cursor: grabbing` + `scroll-snap-type: none` during drag —
   *      snap-mandatory fights small deltas mid-drag, so the row
   *      visually jitters back to the snap point even though we set
   *      scrollLeft. Suspending snap while dragging makes the drag
   *      smooth; snap re-engages on release.
   *   3. DRAG_THRESHOLD before we suppress the trailing click —
   *      otherwise a user clicking a CTA inside a card never gets the
   *      click through.
   *   4. preventDefault inside pointermove — suppresses native image
   *      drag ghosting on `<img>` children and stops the browser's
   *      text-selection drag from initiating on the first move.
   */
  const DRAG_THRESHOLD = 5; // px before we consider it a drag
  const dragState = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startScroll: number;
    prevSnap: string;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
    prevSnap: "",
  });

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    // Left button only — right-click / middle-click shouldn't start a drag.
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      prevSnap: el.style.scrollSnapType,
    };
    // Suspend snap so deltas-per-move don't fight the snap points.
    el.style.scrollSnapType = "none";
    el.style.cursor = "grabbing";
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw on detached elements in tests; ignore. */
    }
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - dragState.current.startX;
    if (!dragState.current.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      dragState.current.moved = true;
    }
    if (dragState.current.moved) {
      // Stop the browser's native text-selection / image-drag from
      // hijacking the pointer once we know this is a scroll gesture.
      e.preventDefault();
      el.scrollLeft = dragState.current.startScroll - dx;
    }
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const wasMoved = dragState.current.moved;
    dragState.current.active = false;
    const el = scrollerRef.current;
    if (el) {
      // Restore snap + cursor.
      el.style.scrollSnapType = dragState.current.prevSnap || "x mandatory";
      el.style.cursor = "grab";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore — see onPointerDown comment */
      }
    }
    // If we actually dragged, suppress the trailing click so links
    // inside cards don't navigate after a drag-release.
    if (wasMoved) {
      const suppress = (clickEvt: Event) => {
        clickEvt.preventDefault();
        clickEvt.stopPropagation();
      };
      el?.addEventListener("click", suppress, { capture: true, once: true });
      // Safety net: drop the listener on the next frame if no click
      // arrives (some browsers don't fire click after pointerup with
      // capture, leaving the listener armed for the next real click).
      requestAnimationFrame(() => {
        el?.removeEventListener("click", suppress, { capture: true } as EventListenerOptions);
      });
    }
  }, []);

  /* ── Vertical wheel → horizontal translate ──────────────────────── */
  const onWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Only translate vertical wheel into horizontal scroll; ignore the
    // wheel if the user is intentionally scrolling horizontally (e.g.
    // trackpad two-finger swipe), since the native scroller handles
    // that natively.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <section
      className={className}
      style={style}
      data-testid={testId}
    >
      {heading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 16,
            marginBottom: 18,
          }}
        >
          {heading}
        </div>
      )}
      <div
        ref={scrollerRef}
        className={`qq-fade-scroll-row${rowClassName ? ` ${rowClassName}` : ""}`}
        data-testid={testId ? `${testId}-row` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 16,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
          /* Prevent mousedown from initiating native text selection /
           * image-drag — both kill our pointer-driven scroll loop.
           * Touch behaviour unchanged: we don't intercept touch pointers,
           * so the native horizontal scroller still handles swipes and
           * vertical-page-scroll still works on the row (default
           * touch-action: auto). */
          userSelect: "none",
          WebkitUserSelect: "none",
          ...rowStyle,
        }}
      >
        {children}
      </div>
      {showArrows && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 18,
          }}
        >
          <CarouselArrowGroup
            theme={arrowTheme}
            onPrev={() => scrollByCard("prev")}
            onNext={() => scrollByCard("next")}
            canPrev={canPrev}
            canNext={canNext}
            data-testid={testId ? `${testId}-arrows` : undefined}
          />
        </div>
      )}
    </section>
  );
});

export default HorizontalCarousel;
