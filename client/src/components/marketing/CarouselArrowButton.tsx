/**
 * CarouselArrowButton — shared prev/next arrow used by the blog featured
 * swiper, the home reviews section, and the per-product Testimonials
 * carousel.
 *
 * Visual is the existing .cs-arrow / .cs-arrow-group capsule (defined in
 * index.css around L2967) so the blog page's canonical arrow look stays
 * the source of truth. This component adds:
 *
 *   1. A unified <CarouselArrowGroup> wrapper that pairs two arrows
 *      with a hairline divider — same shape as the inline Blog page
 *      arrows.
 *   2. CSS-native :active press state (defined alongside .cs-arrow in
 *      index.css), so clicks visibly depress the button. Snappier than a
 *      JS pressed boolean, respects prefers-reduced-motion automatically.
 *   3. data-theme="light" | "dark" so callers can drop the same arrow on
 *      either surface. Default = "dark" (matches blog/case-studies).
 *
 * Keep this component dumb — no swiper / scrollLeft logic; the parent
 * carousel owns scrolling. Callers wire onClick handlers to whatever
 * mechanism they use (Swiper API, native scrollBy, etc).
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type ArrowDirection = "prev" | "next";
type ArrowTheme = "light" | "dark";

interface CarouselArrowButtonProps {
  direction: ArrowDirection;
  onClick: () => void;
  disabled?: boolean;
  /** Theme of the surface the arrow sits on (NOT the icon color). */
  theme?: ArrowTheme;
  /** Accessible label override; defaults to "Previous"/"Next". */
  label?: string;
  /** Optional test id passthrough for component-level smoke tests. */
  "data-testid"?: string;
}

export function CarouselArrowButton({
  direction,
  onClick,
  disabled = false,
  theme = "dark",
  label,
  "data-testid": testId,
}: CarouselArrowButtonProps) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const ariaLabel = label ?? (direction === "prev" ? "Previous" : "Next");

  /* "Just clicked" highlight — adds a lingering grey wash for ~300ms after
   * release so the user gets visible confirmation the click registered
   * (CSS :active only paints while the pointer is held). */
  const [justClicked, setJustClicked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  const handleClick = () => {
    setJustClicked(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustClicked(false), 300);
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-theme={theme}
      data-testid={testId}
      className={`cs-arrow${disabled ? " cs-arrow--disabled" : ""}${
        justClicked && !disabled ? " cs-arrow--just-clicked" : ""
      }`}
    >
      <Icon size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

interface CarouselArrowGroupProps {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  theme?: ArrowTheme;
  style?: CSSProperties;
  prevLabel?: string;
  nextLabel?: string;
  /** Optional test id applied to the group wrapper. */
  "data-testid"?: string;
}

/** Capsule pairing prev + next with a hairline divider. */
export function CarouselArrowGroup({
  onPrev,
  onNext,
  canPrev,
  canNext,
  theme = "dark",
  style,
  prevLabel,
  nextLabel,
  "data-testid": testId,
}: CarouselArrowGroupProps) {
  return (
    <div
      className="cs-arrow-group"
      data-theme={theme}
      data-testid={testId}
      style={style}
    >
      <CarouselArrowButton
        direction="prev"
        onClick={onPrev}
        disabled={!canPrev}
        theme={theme}
        label={prevLabel}
      />
      <span
        className="cs-arrow-divider"
        data-theme={theme}
        aria-hidden
      />
      <CarouselArrowButton
        direction="next"
        onClick={onNext}
        disabled={!canNext}
        theme={theme}
        label={nextLabel}
      />
    </div>
  );
}

export default CarouselArrowButton;
