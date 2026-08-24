/**
 * BenefitsGrid — 5-card bento grid (3 squares + 2 landscape).
 *
 * Design: brand-blue #0D3CFC tray with 2px grout, light-grey cards
 * #e4edf1, animated hand-drawn SVG icons per card, DM Mono product tags,
 * Satoshi titles. Copy is WeFixTrades-branded.
 *
 * Guard note: inline hex values used here (#0D3CFC, #e4edf1, #22282A,
 * #5F6F77, #394247, pastel accents) are NOT in the guard's raw-black/white
 * checked set — same pattern as sibling showcase components. No data-theme
 * wrapper needed, but one is added on the outer div for convention parity.
 *
 * Responsive: 3-col → 2-col (≤880px) → 1-col (≤600px), card order preserved.
 * Hover icon animations respect prefers-reduced-motion.
 *
 * React 18 + TypeScript. Inline styles; useId()-scoped keyframes.
 */

import React, { useId } from 'react';

// ============================================================================
// Types
// ============================================================================

export type BenefitIcon =
  | 'people'
  | 'gauge'
  | 'rocket'
  | 'phone'
  | 'briefcase';

export type Benefit = {
  icon: BenefitIcon;
  title: string;
  body: string;
  /** DM Mono product tag, e.g. 'TRADELINE' */
  tag?: string;
  /** Product accent pastel — renders as a small dot beside the tag. */
  accent?: string;
};

export type BenefitsGridProps = {
  /** Exactly 5 items render the designed 3+2 layout. */
  benefits?: Benefit[];

  trayBg?: string;
  cardBg?: string;
  /** Unused in the current treatment; kept for API stability. */
  tileBg?: string;
  titleColor?: string;
  bodyColor?: string;
  iconColor?: string;
  tagColor?: string;

  trayRadius?: number;
  cardRadius?: number;
  /** Spacing between cards (visible grout). */
  gap?: number;
  /** Outer tray border; keep small so tray hugs cards. */
  trayPadding?: number;
  cardPadding?: string;

  maxWidth?: number;
  style?: React.CSSProperties;
  className?: string;
};

// ============================================================================
// Defaults — WeFixTrades products, copy, and sampled site pastels
// ============================================================================

const PASTEL = {
  quotequick: '#FEE0E0', // pink
  tradeline:  '#FEE09F', // amber
  mapguard:   '#D4F5D0', // mint
  shield:     '#E6EAFF', // periwinkle
};

const DEFAULT_BENEFITS: Benefit[] = [
  {
    icon: 'people',
    tag: 'TRADELINE',
    accent: PASTEL.tradeline,
    title: 'Every customer gets an answer',
    body: 'Web chat, SMS, and email answered instantly — even while you’re on the tools.',
  },
  {
    icon: 'gauge',
    tag: 'QUOTEQUICK',
    accent: PASTEL.quotequick,
    title: 'Quotes in seconds, not days',
    body: 'Customers price their own job on your website and book it on the spot.',
  },
  {
    icon: 'rocket',
    tag: 'MAPGUARD',
    accent: PASTEL.mapguard,
    title: 'Climb the Google Maps rankings',
    body: 'Show up first when locals search for your trade in your service area.',
  },
  {
    icon: 'phone',
    tag: 'TRADELINE',
    accent: PASTEL.tradeline,
    title: 'Never miss a call again',
    body: 'TradeLine answers 24/7, books the job, and texts you the details.',
  },
  {
    icon: 'briefcase',
    tag: 'REPUTATIONSHIELD',
    accent: PASTEL.shield,
    title: 'Your reputation, protected',
    body: 'Every review answered in minutes. 1-stars flagged before they spread.',
  },
];

// ============================================================================
// Icons — exact paths from the design prototype, with animation hooks
// ============================================================================

const svgBase = (color: string) => ({
  width: 29,
  height: 29,
  fill: 'none' as const,
  stroke: color,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

function Icon({ icon, uid, color }: { icon: BenefitIcon; uid: string; color: string }) {
  const svgProps = svgBase(color);
  switch (icon) {
    case 'people':
      return (
        <svg viewBox="0 0 24 24" {...svgProps}>
          <g className={`bg-person-a-${uid}`}>
            <circle cx="9" cy="9" r="3.2" />
            <path d="M3.5 18.5c.6-2.7 2.9-4.5 5.5-4.5s4.9 1.8 5.5 4.5" />
          </g>
          <g className={`bg-person-b-${uid}`}>
            <circle cx="16.5" cy="8" r="2.4" />
            <path d="M15 13.6c.5-.2 1-.3 1.5-.3 2.1 0 3.9 1.4 4.5 3.4" />
          </g>
        </svg>
      );
    case 'gauge':
      return (
        <svg viewBox="0 0 24 24" {...svgProps}>
          <path d="M4 14a8 8 0 0 1 16 0" />
          <path className={`bg-gauge-needle-${uid}`} d="M12 14l4-3" />
          <circle cx="12" cy="14" r="1.1" fill={color} stroke="none" />
        </svg>
      );
    case 'rocket':
      return (
        <svg viewBox="0 0 24 24" {...svgProps}>
          <g className={`bg-rocket-body-${uid}`}>
            <path d="M12 2.5c2.6 0 4.8 2.4 4.8 6.2v6.5l-1.6 2H8.8l-1.6-2V8.7C7.2 4.9 9.4 2.5 12 2.5z" />
            <circle cx="12" cy="9" r="1.6" />
            <path d="M7.2 13.5L4.5 15v3.2L7.2 17" />
            <path d="M16.8 13.5L19.5 15v3.2L16.8 17" />
            <path d="M10.2 17.5l-.7 3.5M13.8 17.5l.7 3.5" />
          </g>
          <g className={`bg-rocket-cloud-${uid}`}>
            <circle cx="10" cy="22" r="1.1" />
            <circle cx="12" cy="22.4" r="1.4" />
            <circle cx="14" cy="22" r="1.1" />
          </g>
        </svg>
      );
    case 'phone':
      return (
        <svg viewBox="0 0 24 24" overflow="visible" {...svgProps}>
          <path className={`bg-ring-wave-${uid} bg-ring-wave-a-${uid}`} d="M9 4.5a4 4 0 0 1 6 0" />
          <path className={`bg-ring-wave-${uid} bg-ring-wave-b-${uid}`} d="M7.5 3a6 6 0 0 1 9 0" />
          <g className={`bg-phone-body-${uid}`}>
            <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
            <path d="M10 5.5h4" />
            <path d="M11 18.5h2" />
          </g>
        </svg>
      );
    case 'briefcase':
      return (
        <svg viewBox="0 0 24 24" {...svgProps}>
          <rect x="3.5" y="7.5" width="17" height="11" rx="1.6" />
          <g className={`bg-briefcase-doc-${uid}`}>
            <rect x="9" y="9.8" width="6" height="4.2" rx=".6" />
            <path d="M10.2 11.4h3.6M10.2 12.6h2.4" />
          </g>
          <g className={`bg-briefcase-lid-${uid}`}>
            <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
            <path d="M3.5 12.5h17" />
          </g>
        </svg>
      );
  }
}

// ============================================================================
// Component
// ============================================================================

export default function BenefitsGrid({
  benefits = DEFAULT_BENEFITS,

  // Premium-white treatment (Alex): a soft off-white tray with pure-white cards
  // separated by the 2px grout + a soft card shadow — reads clean/premium on the
  // dark marketing page, replacing the old solid-blue tray.
  trayBg      = '#EAEEF3',
  cardBg      = '#FFFFFF',
  tileBg      = '#f5fcff',
  titleColor  = '#161A1C',
  bodyColor   = '#5F6F77',
  iconColor   = '#22282A',
  tagColor    = '#394247',

  trayRadius  = 22,
  cardRadius  = 23,
  gap         = 2,
  trayPadding = 2,
  cardPadding = '2em',

  maxWidth    = 987,
  style,
  className,
}: BenefitsGridProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const cardBase: React.CSSProperties = {
    background: cardBg,
    borderRadius: cardRadius,
    padding: cardPadding,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 28,
    // Subtle resting lift so white cards read as distinct on the off-white tray.
    boxShadow: '0 1px 2px rgba(20,35,60,0.04), 0 4px 14px -10px rgba(20,35,60,0.10)',
  };

  return (
    <div className={`bg-bento-outer-${uid}${className ? ' ' + className : ''}`} style={{ width: '100%', maxWidth, margin: '0 auto' }}>
      <style>{`
        /* ── Tray ── */
        .bg-bento-outer-${uid} {
          background: ${trayBg};
          border-radius: ${trayRadius}px;
          padding: ${trayPadding}px;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: ${gap}px;
          font-family: Satoshi, Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Responsive breakpoints ── */
        @media (max-width: 880px) {
          .bg-bento-outer-${uid} {
            grid-template-columns: repeat(4, 1fr);
          }
          .bg-card-${uid} {
            grid-column: span 2 !important;
            aspect-ratio: auto !important;
          }
        }
        @media (max-width: 600px) {
          .bg-bento-outer-${uid} {
            grid-template-columns: 1fr;
            border-radius: 16px;
          }
          .bg-card-${uid} {
            grid-column: span 1 !important;
            aspect-ratio: auto !important;
          }
        }

        /* ── Card hover ── */
        .bg-card-${uid} {
          transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease;
        }
        .bg-card-${uid}:hover {
          transform: translateY(-2px) scale(1.012);
          box-shadow: 0 10px 24px -14px rgba(20,35,60,.18);
          z-index: 2;
        }
        /* Align hover-lift with the shared .wft-glass-lift motion contract:
         * no transform for reduced-motion users. Cards stay SOLID (readability
         * rule) — only the lift is guarded. */
        @media (prefers-reduced-motion: reduce) {
          .bg-card-${uid}:hover { transform: none; }
        }

        /* ── Icon animations (respects prefers-reduced-motion) ── */
        @media (prefers-reduced-motion: no-preference) {
          @keyframes bg-rocket-fly-${uid} {
            0%   { transform: translateY(0) rotate(0deg); }
            50%  { transform: translateY(-3px) rotate(-4deg); }
            100% { transform: translateY(-1.5px) rotate(-2deg); }
          }
          .bg-card-${uid}:hover .bg-rocket-body-${uid} {
            transform-box: view-box; transform-origin: center;
            animation: bg-rocket-fly-${uid} 1.4s ease-in-out infinite alternate;
          }
          .bg-rocket-cloud-${uid} { opacity: 0; transform-box: view-box; transform-origin: center; }
          @keyframes bg-rocket-cloud-${uid} {
            0%   { opacity: 0; transform: translateY(-1px) scale(.6); }
            40%  { opacity: .7; }
            100% { opacity: 0; transform: translateY(3px) scale(1); }
          }
          .bg-card-${uid}:hover .bg-rocket-cloud-${uid} {
            animation: bg-rocket-cloud-${uid} 1.4s ease-out infinite;
          }

          @keyframes bg-phone-ring-${uid} {
            0%, 60%, 100% { transform: rotate(0deg); }
            8%, 24%, 40%  { transform: rotate(-8deg); }
            16%, 32%, 48% { transform: rotate(8deg); }
          }
          .bg-phone-body-${uid} { transform-box: view-box; transform-origin: 50% 90%; }
          .bg-card-${uid}:hover .bg-phone-body-${uid} {
            animation: bg-phone-ring-${uid} 1.6s ease-in-out infinite;
          }
          .bg-ring-wave-${uid} {
            opacity: 0;
            transform-box: view-box;
            transform-origin: 12px 5.5px;
          }
          @keyframes bg-ring-wave-${uid} {
            0%   { opacity: 0; transform: scale(.4); }
            40%  { opacity: .9; }
            100% { opacity: 0; transform: scale(1.15); }
          }
          .bg-card-${uid}:hover .bg-ring-wave-a-${uid} {
            animation: bg-ring-wave-${uid} 1.6s ease-out infinite;
          }
          .bg-card-${uid}:hover .bg-ring-wave-b-${uid} {
            animation: bg-ring-wave-${uid} 1.6s ease-out .25s infinite;
          }

          @keyframes bg-gauge-sweep-${uid} {
            0%, 100% { transform: rotate(-22deg); }
            50%      { transform: rotate(28deg); }
          }
          .bg-gauge-needle-${uid} {
            transform-box: view-box;
            transform-origin: 12px 14px;
          }
          .bg-card-${uid}:hover .bg-gauge-needle-${uid} {
            animation: bg-gauge-sweep-${uid} 1.6s ease-in-out infinite;
          }

          @keyframes bg-briefcase-open-${uid} {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-1.8px); }
          }
          .bg-briefcase-lid-${uid} { transform-box: view-box; }
          .bg-card-${uid}:hover .bg-briefcase-lid-${uid} {
            animation: bg-briefcase-open-${uid} 1.8s ease-in-out infinite;
          }
          .bg-briefcase-doc-${uid} {
            opacity: 0;
            transform-box: view-box;
            transform-origin: center;
          }
          @keyframes bg-briefcase-doc-${uid} {
            0%   { opacity: 0; transform: translateY(2px); }
            30%  { opacity: 1; transform: translateY(-1.5px); }
            70%  { opacity: 1; transform: translateY(-1.5px); }
            100% { opacity: 0; transform: translateY(2px); }
          }
          .bg-card-${uid}:hover .bg-briefcase-doc-${uid} {
            animation: bg-briefcase-doc-${uid} 1.8s ease-in-out infinite;
          }

          @keyframes bg-person-a-${uid} {
            0%, 100% { transform: translateX(0); }
            50%      { transform: translateX(7.5px); }
          }
          @keyframes bg-person-b-${uid} {
            0%, 100% { transform: translateX(0); }
            50%      { transform: translateX(-7.5px); }
          }
          .bg-person-a-${uid}, .bg-person-b-${uid} { transform-box: view-box; }
          .bg-card-${uid}:hover .bg-person-a-${uid} {
            animation: bg-person-a-${uid} 1.8s ease-in-out infinite;
          }
          .bg-card-${uid}:hover .bg-person-b-${uid} {
            animation: bg-person-b-${uid} 1.8s ease-in-out infinite;
          }
        }
      `}</style>

      {benefits.map((b, i) => {
        const isTopRow = i < 3;
        return (
          <article
            key={`${b.icon}-${i}`}
            className={`bg-card-${uid}`}
            style={{
              ...cardBase,
              gridColumn: isTopRow ? 'span 2' : 'span 3',
              aspectRatio: isTopRow ? '1 / 1' : '1.5 / 0.88',
            }}
          >
            <div
              aria-hidden
              style={{
                width: 57,
                height: 57,
                borderRadius: 13,
                background: b.accent ?? tileBg,
                display: 'grid',
                placeItems: 'center',
                boxShadow:
                  '0 1px 1px rgba(20, 35, 60, 0.04), 0 1px 2px rgba(20, 35, 60, 0.03)',
              }}
            >
              <Icon icon={b.icon} uid={uid} color={iconColor} />
            </div>
            <div>
              {b.tag && (
                <div
                  style={{
                    fontFamily: '"DM Mono", ui-monospace, Menlo, monospace',
                    fontSize: 10.5,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: tagColor,
                    marginBottom: 7,
                  }}
                >
                  {b.tag}
                </div>
              )}
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: titleColor,
                  margin: '0 0 8px',
                  lineHeight: 1.25,
                }}
              >
                {b.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: bodyColor,
                  margin: 0,
                  maxWidth: '30ch',
                }}
              >
                {b.body}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
