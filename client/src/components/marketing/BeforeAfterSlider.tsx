import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * BeforeAfterSlider — horizontal reveal slider with a draggable divider.
 *
 * Two image layers stacked; the "after" image is clipped via clip-path to
 * reveal the "before" image underneath as the user drags the divider.
 *
 * Touch + mouse input supported. Keyboard accessible (Left/Right adjust by
 * 5%, Home/End jump to extremes). Respects prefers-reduced-motion (no
 * transition on programmatic position changes — drag itself is always
 * direct).
 *
 * Used inside the audit Website tab to show how a site looks now vs how it
 * could look after our WebCare fixes (or a CSS-only projection overlay if
 * a real "after" image isn't available).
 */

export interface BeforeAfterSliderProps {
  /** URL of the "before" image (rendered on the bottom layer, fully visible). */
  beforeSrc: string;
  /** URL of the "after" image (rendered on the top layer, clipped). When
   * the audit has no real "after", pass the same `beforeSrc` and use
   * `afterFilter` / `afterOverlayColor` to generate a CSS-only projection. */
  afterSrc: string;
  /** Accessible label for the before image. */
  beforeAlt?: string;
  /** Accessible label for the after image. */
  afterAlt?: string;
  /** Optional labels rendered as small pills in opposing corners. */
  beforeLabel?: string;
  afterLabel?: string;
  /** Initial divider position as a percentage from the left (0–100). */
  initialPosition?: number;
  /** Optional fixed height (px). When omitted, uses aspect-ratio of the wrapper. */
  height?: number;
  /** Disclaimer text rendered below the slider. */
  caption?: string;
  /** CSS filter applied to the after image (e.g. "contrast(1.08) saturate(1.15)").
   *  Used to generate a CSS-only projection when no real "after" image exists. */
  afterFilter?: string;
  /** Optional translucent color rendered on top of the after image (e.g.
   *  "rgba(34,197,94,0.10)") for a "polished" tint. */
  afterOverlayColor?: string;
}

const ACCENT = '#0d3cfc';
const DARK = '#0d1514';
const LIGHT = '#FFFFFF';

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt = 'Before',
  afterAlt = 'After',
  beforeLabel = 'Before',
  afterLabel = 'After',
  initialPosition = 50,
  height,
  caption,
  afterFilter,
  afterOverlayColor,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState<number>(() =>
    Math.max(0, Math.min(100, initialPosition)),
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  }, []);

  // Pointer events cover mouse + touch on modern browsers in one path.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Keyboard support — divider can be focused as a slider.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setPosition(100);
    }
  }, []);

  // Detect reduced motion at mount; affects only the smooth-snap behaviour
  // (we never animate during an active drag).
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (ev: MediaQueryListEvent) => setReducedMotion(ev.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
    };
  }, []);

  const clipInsetRight = 100 - position;

  return (
    <div data-theme="light">
      <div
        ref={wrapperRef}
        role="region"
        aria-label="Before and after website comparison"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'relative',
          width: '100%',
          height: height ?? undefined,
          aspectRatio: height ? undefined : '16 / 9',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#F3F4F6',
          border: '1px solid #E5E7EB',
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* BEFORE image — bottom layer, fully visible */}
        <img
          src={beforeSrc}
          alt={beforeAlt}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
        {/* AFTER image — top layer, clipped from the right */}
        <img
          src={afterSrc}
          alt={afterAlt}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
            display: 'block',
            pointerEvents: 'none',
            filter: afterFilter,
            clipPath: `inset(0 ${clipInsetRight}% 0 0)`,
            WebkitClipPath: `inset(0 ${clipInsetRight}% 0 0)`,
            transition: reducedMotion || draggingRef.current ? 'none' : 'clip-path 0.05s linear',
          }}
        />
        {/* Optional translucent overlay on the after side — used for the
            CSS-only "projection" tint when no real after-image exists. */}
        {afterOverlayColor && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: afterOverlayColor,
              pointerEvents: 'none',
              clipPath: `inset(0 ${clipInsetRight}% 0 0)`,
              WebkitClipPath: `inset(0 ${clipInsetRight}% 0 0)`,
              transition: reducedMotion || draggingRef.current ? 'none' : 'clip-path 0.05s linear',
            }}
          />
        )}

        {/* Corner labels — outline-only pills (Rule 4: selected = outline) */}
        {beforeLabel && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: LIGHT,
              background: 'rgba(13,21,20,0.6)',
              border: '1px solid rgba(255,255,255,0.4)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              pointerEvents: 'none',
            }}
          >
            {beforeLabel}
          </span>
        )}
        {afterLabel && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: LIGHT,
              background: ACCENT,
              border: `1px solid ${ACCENT}`,
              pointerEvents: 'none',
            }}
          >
            {afterLabel}
          </span>
        )}

        {/* Divider line + handle */}
        <div
          role="slider"
          aria-label="Reveal slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)}% revealed`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${position}%`,
            width: 2,
            background: LIGHT,
            transform: 'translateX(-1px)',
            boxShadow: '0 0 0 1px rgba(13,21,20,0.18)',
            outline: 'none',
            cursor: 'ew-resize',
          }}
        >
          {/* Handle knob — outline ring on the accent fill (Rule 4 compliant). */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: LIGHT,
              border: `2px solid ${ACCENT}`,
              boxShadow: '0 2px 8px rgba(13,21,20,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: ACCENT,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            <span aria-hidden="true">{'↔'}</span>
          </div>
        </div>
      </div>

      {caption && (
        <div
          style={{
            fontSize: 11,
            color: '#6B7280',
            marginTop: 8,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
