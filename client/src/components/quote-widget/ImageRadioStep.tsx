/**
 * BD-2c — Image-card radio renderer.
 *
 * Research (BD-0 punch list):
 *  - Image-card pickers vs text radios: mobile-friendly, no keyboard pops,
 *    faster scanning ([reform.app](https://www.reform.app/blog/make-forms-mobile-friendly-better-leads)).
 *
 * The legacy text-radio renderer in `AdvancedCalculator.tsx` (the
 * `f.type === 'radio'` branch) auto-switches to this component whenever
 * any option in the field carries an `imageUrl`. Text-only radios continue
 * to render the existing layout — back-compat.
 *
 * Layout:
 *  - 2 cards / row on mobile (<480px), 3-up on tablet, 4-up on desktop.
 *  - ~120px square image with `object-cover`, label below.
 *  - Selected state = 2px brand-blue border (`#0d3cfc` / theme.accent)
 *    + 1.02x scale + accent-tinted background (matches the existing
 *    image-choice field type for visual continuity).
 *  - Tap target >= 44px (auto-satisfied by the 120px image + label).
 */
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';

export interface ImageRadioOption {
  id: string;
  label: string;
  /** Remote image URL (CDN, Unsplash, etc). When absent, falls back to a
   *  friendly emoji placeholder so the card still renders. */
  imageUrl?: string;
  /** Data URL fallback (used by the existing `image_choice` field type;
   *  this renderer accepts both so templates can mix sources). */
  image?: string;
}

interface Props {
  label: string;
  options: ImageRadioOption[];
  value: string;
  onChange: (next: string) => void;
  theme: WidgetTheme;
  /** Style-tab radius applied to each card. */
  radiusPx?: string;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Optional test id (defaults to the field label slug). */
  testId?: string;
}

export default function ImageRadioStep({
  label, options, value, onChange,
  theme, radiusPx = '12px', fontFamily, testId,
}: Props) {
  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: 13, fontWeight: 700, color: theme.text,
    margin: '0 0 10px 0',
    letterSpacing: '0.01em',
    fontFamily,
  };
  const gridStyle: CSSProperties = {
    display: 'grid',
    // Mobile (<480px) collapses to 2 columns via the minmax floor; the
    // auto-fit pumps it up to 3-4 columns at wider sizes naturally.
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 10,
  };

  return (
    <div data-testid={testId ?? 'image-radio-step'}>
      <label style={labelStyle}>{label}</label>
      <div style={gridStyle}>
        {options.map((o) => {
          const sel = value === o.id;
          const src = o.imageUrl || o.image || '';
          const cardStyle: CSSProperties = {
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: 8,
            borderRadius: radiusPx, cursor: 'pointer',
            border: `2px solid ${sel ? theme.accent : theme.border}`,
            background: sel ? theme.accentTint : theme.surface,
            textAlign: 'left',
            transition: 'border-color 0.12s ease, background 0.12s ease, transform 0.12s ease',
            transform: sel ? 'scale(1.02)' : 'scale(1)',
            fontFamily,
            minWidth: 0,
          };
          const imgWrapStyle: CSSProperties = {
            width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
            background: theme.bg, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          };
          const imgStyle: CSSProperties = {
            width: '100%', height: '100%', objectFit: 'cover',
          };
          return (
            <button
              key={o.id} type="button" onClick={() => onChange(o.id)}
              aria-pressed={sel}
              data-testid={`image-radio-option-${o.id}`}
              style={cardStyle}
            >
              <div style={imgWrapStyle}>
                {src ? (
                  <img
                    src={src} alt={o.label} style={imgStyle} loading="lazy"
                    // If the remote image fails (rate-limited Unsplash, CDN
                    // down), hide the broken-image icon — the label still
                    // identifies the card.
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span aria-hidden="true" style={{ fontSize: 28, color: theme.textMuted }}>🏠</span>
                )}
              </div>
              <span style={{
                fontSize: 13, fontWeight: 600, color: theme.text, lineHeight: 1.3,
              }}>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
