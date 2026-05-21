/**
 * CalcAssemblySpinner — Wave AD-3 loading indicator for AI template generation.
 *
 * Pure CSS / SVG (no new deps). ~80×80px. Visualises an abstract widget being
 * assembled: input rows appear one by one, a result panel slides in, a CTA
 * button snaps into place — then the loop restarts. Uses `eff.accent` as the
 * active-step colour so it blends with the widget brand.
 *
 * Accessibility — when `prefers-reduced-motion: reduce` is set the SVG renders
 * the fully-assembled end state statically (no animation). The wrapper has
 * `role="status"` + an offscreen label so screen-readers announce "Building
 * calculator…" instead of seeing an empty graphic.
 *
 * Drop-in for any existing circular spinner that appears while the AI is
 * generating a template (e.g. AdvancedBuilder's full-template generate step,
 * AIBubble's replace_template apply step).
 */

import { useId } from 'react';
import { eff } from './designTokens';

export interface CalcAssemblySpinnerProps {
  /** Override the active-step colour. Defaults to `eff.accent`. */
  accent?: string;
  /** Pixel size of the square viewport. Default 80. */
  size?: number;
  /** Visible-to-screen-reader label. Default "Building calculator". */
  label?: string;
  /** Optional className for outer wrapper. */
  className?: string;
}

export default function CalcAssemblySpinner({
  accent = eff.accent,
  size = 80,
  label = 'Building calculator',
  className,
}: CalcAssemblySpinnerProps) {
  // Stable, unique ids so multiple spinners on one page don't collide.
  const uid = useId().replace(/[:]/g, '');
  const trackId = `cas-track-${uid}`;
  const accentId = `cas-accent-${uid}`;
  const muted = 'rgba(15, 23, 42, 0.10)';
  const mutedFg = 'rgba(15, 23, 42, 0.55)';

  return (
    <span
      role="status"
      aria-live="polite"
      className={className}
      data-testid="calc-assembly-spinner"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        lineHeight: 1,
      }}
    >
      {/* Visually-hidden label so screen-readers don't see an empty graphic. */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {label}
      </span>

      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        {/* Outer card frame — the "widget shell". Always visible. */}
        <rect
          x="6"
          y="6"
          width="68"
          height="68"
          rx="10"
          fill="#ffffff"
          stroke={muted}
          strokeWidth="1.5"
        />

        {/* Title bar — three pills representing the calculator header. */}
        <rect x="12" y="13" width="22" height="4" rx="2" fill={mutedFg} opacity="0.35" />
        <circle cx="65" cy="15" r="2" fill={muted} />
        <circle cx="70" cy="15" r="2" fill={muted} />

        {/* Three input rows that fade in one after another. */}
        <g className={`${trackId}-row ${trackId}-row1`}>
          <rect x="12" y="24" width="56" height="6" rx="2" fill={muted} />
          <rect x="12" y="24" width="36" height="6" rx="2" fill={accent} className={`${accentId}-fill`} />
        </g>
        <g className={`${trackId}-row ${trackId}-row2`}>
          <rect x="12" y="34" width="56" height="6" rx="2" fill={muted} />
          <rect x="12" y="34" width="22" height="6" rx="2" fill={accent} className={`${accentId}-fill`} />
        </g>
        <g className={`${trackId}-row ${trackId}-row3`}>
          <rect x="12" y="44" width="56" height="6" rx="2" fill={muted} />
          <rect x="12" y="44" width="44" height="6" rx="2" fill={accent} className={`${accentId}-fill`} />
        </g>

        {/* Result panel that slides in from the right. */}
        <g className={`${trackId}-result`}>
          <rect x="12" y="54" width="56" height="8" rx="2" fill={accent} opacity="0.16" />
          <rect x="14" y="56" width="22" height="4" rx="1" fill={mutedFg} opacity="0.55" />
          <rect x="50" y="56" width="16" height="4" rx="1" fill={accent} />
        </g>

        {/* CTA button that snaps in last. */}
        <g className={`${trackId}-cta`}>
          <rect x="22" y="64" width="36" height="6" rx="3" fill={accent} />
        </g>
      </svg>

      <style>{`
        /* Each row fades + lifts in sequentially. */
        .${trackId}-row {
          opacity: 0;
          transform: translateY(4px);
          transform-origin: left center;
          animation: ${trackId}-row-in 2400ms ease-out infinite;
        }
        .${trackId}-row1 { animation-delay: 0ms; }
        .${trackId}-row2 { animation-delay: 280ms; }
        .${trackId}-row3 { animation-delay: 560ms; }

        /* Active accent fill scales horizontally to look like the value
           filling in after the field appears. */
        .${accentId}-fill {
          transform-origin: left center;
          transform: scaleX(0);
          animation: ${accentId}-fill-in 2400ms ease-out infinite;
        }
        .${trackId}-row1 .${accentId}-fill { animation-delay: 120ms; }
        .${trackId}-row2 .${accentId}-fill { animation-delay: 400ms; }
        .${trackId}-row3 .${accentId}-fill { animation-delay: 680ms; }

        /* Result panel slides in from the right. */
        .${trackId}-result {
          opacity: 0;
          transform: translateX(8px);
          animation: ${trackId}-result-in 2400ms ease-out infinite;
          animation-delay: 880ms;
        }

        /* CTA snaps in with a tiny scale bounce. */
        .${trackId}-cta {
          opacity: 0;
          transform-origin: 50% 67px;
          transform: scale(0.6);
          animation: ${trackId}-cta-in 2400ms cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
          animation-delay: 1080ms;
        }

        @keyframes ${trackId}-row-in {
          0%   { opacity: 0; transform: translateY(4px); }
          14%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes ${accentId}-fill-in {
          0%   { transform: scaleX(0); }
          22%  { transform: scaleX(1); }
          80%  { transform: scaleX(1); }
          100% { transform: scaleX(1); opacity: 0; }
        }
        @keyframes ${trackId}-result-in {
          0%   { opacity: 0; transform: translateX(8px); }
          18%  { opacity: 1; transform: translateX(0); }
          80%  { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(0); }
        }
        @keyframes ${trackId}-cta-in {
          0%   { opacity: 0; transform: scale(0.6); }
          20%  { opacity: 1; transform: scale(1); }
          80%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
        }

        /* Reduced motion — render the fully-assembled end state statically. */
        @media (prefers-reduced-motion: reduce) {
          .${trackId}-row,
          .${trackId}-result,
          .${trackId}-cta,
          .${accentId}-fill {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </span>
  );
}
