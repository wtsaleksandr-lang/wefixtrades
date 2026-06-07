/**
 * BD-2b — TierSelector — Good/Better/Best 3-tier price card grid.
 *
 * Renders three horizontally-arranged tier cards on desktop and a vertical
 * stack on mobile. Each card shows: tier label, optional "Most Popular"
 * badge, computed price (or price range when `range_mode` is also on),
 * and a one-line tagline. Tapping a card selects it; the parent reads the
 * chosen tier index via `onSelect`.
 *
 * Research (BD-0): tiered pricing consistently outperforms single-value
 * AND 4+-tier alternatives — the middle "Most Popular" tier anchors
 * choice toward the recommended price point.
 *
 * Pure presentational + no side effects. Caller owns the base quote, the
 * selected index, and the format helpers.
 */
import type { CSSProperties } from 'react';
import type { TemplateTier } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';
import { guardTextColor } from '@/lib/contrastGuard';

interface Props {
  /** Resolved tier list (3 entries by default — Essential / Standard / Premium). */
  tiers: TemplateTier[];
  /** The base quote in dollars before multiplier — each tier shows `base * multiplier`. */
  baseQuote: number;
  /** Index of the currently-selected tier. */
  selectedIndex: number;
  /** Fired when the user taps a card. */
  onSelect: (index: number) => void;
  /** Resolved widget theme (accent / borders / text colours). */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Inner radius applied to cards. */
  radiusPx?: string;
  /**
   * Pre-formatted price string for a given numeric value. Caller plugs this
   * in so range-mode + currency formatting stays consistent with the rest
   * of the result panel — TierSelector itself doesn't know about
   * `numberFormat` or `band_pct`.
   */
  formatPrice: (value: number) => string;
  /**
   * The EXACT resolved background colour the CTA button uses (the darkened,
   * WCAG-guarded accent from AdvancedCalculator's `ctaBg`). The selected tier
   * card paints with this so it visually matches the CTA instead of the raw
   * bright accent. Falls back to `theme.accent` when not provided.
   */
  selectedBg?: string;
}

/** Round `n` to the nearest $25 — matches the W-BB-3 range-mode rounding. */
function roundTo25(n: number): number {
  return Math.max(0, Math.round(n / 25) * 25);
}

export default function TierSelector({
  tiers,
  baseQuote,
  selectedIndex,
  onSelect,
  theme,
  fontFamily,
  radiusPx = '10px',
  formatPrice,
  selectedBg,
}: Props) {
  // Selected card fill = the EXACT colour the CTA button uses, so the chosen
  // tier matches the CTA (was raw theme.accent → brighter than the darkened
  // CTA + sub-AA white text). Fall back to accent when no CTA colour is passed.
  const selBg = selectedBg ?? theme.accent;
  // White-family text guarded against the resolved selected fill so the
  // label / price / tagline / badge always clear contrast on `selBg`.
  // Feed the guard SOLID white (not a translucent rgba): guardTextColor drops
  // alpha when measuring, so an `rgba(255,255,255,0.85)` input would "pass" as
  // opaque white yet render at 0.85 → ~4.1:1 (sub-AA) on a saturated card. With
  // solid white the guard's output is applied at full opacity and clears AA on
  // any selBg (stays white on dark cards; darkens to readable on light cards).
  // The label/tagline hierarchy comes from size + weight, not alpha.
  const selLabelColor = guardTextColor('rgba(255,255,255,1)', selBg, 'tierSelectedLabel');
  const selPriceColor = guardTextColor('rgba(255,255,255,1)', selBg, 'tierSelectedPrice');
  const selTaglineColor = guardTextColor('rgba(255,255,255,1)', selBg, 'tierSelectedTagline');
  return (
    <div
      data-testid="tier-selector"
      data-component-name="Tier selector"
      data-component-type="tier-selector"
      data-theme="light"
      style={{
        display: 'grid',
        // ONE column on narrow widgets (the min(100%,200px) forces a single
        // full-width track when the container is < ~400px) and up to 3 across
        // on wide containers — fixes the 2+1 orphan on ~330px mobile.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
        gap: 10,
        width: '100%',
        marginTop: 4,
        // Clearance so the -10px "Most Popular" badge is never clipped at the
        // top by the result panel above.
        paddingTop: 14,
        fontFamily,
      }}
    >
      {tiers.map((tier, idx) => {
        const isSelected = idx === selectedIndex;
        const isMostPopular = tier.mostPopular === true;
        const tierPrice = roundTo25(baseQuote * tier.multiplier);
        const cardStyle: CSSProperties = {
          position: 'relative',
          display: 'flex', flexDirection: 'column',
          alignItems: 'stretch', justifyContent: 'flex-start',
          gap: 4,
          padding: '14px 12px 12px',
          borderRadius: radiusPx,
          // Selected tier = the EXACT CTA fill (selBg) so the chosen card
          // matches the CTA button; guarded white text keeps it high-contrast.
          background: isSelected ? selBg : theme.surface,
          border: isSelected
            ? `2px solid ${selBg}`
            : `1px solid ${theme.border}`,
          // BD-2b — middle / "Most Popular" tier elevated so it anchors choice.
          // Emphasis is carried by border + a deeper shadow only (the old
          // scale(1.04) was removed — it overflowed the grid cell and clipped
          // the badge). Slightly stronger shadow on the popular card replaces
          // the lost lift.
          boxShadow: isMostPopular && !isSelected
            ? '0 8px 20px rgba(13, 60, 252, 0.14)'
            : isSelected
              ? '0 8px 20px rgba(13, 60, 252, 0.16)'
              : '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'box-shadow 150ms ease-out, border-color 150ms ease-out',
          cursor: 'pointer',
          textAlign: 'left',
          color: theme.text,
          fontFamily,
          minWidth: 0,
        };
        return (
          <button
            type="button"
            key={`${tier.label}-${idx}`}
            data-testid={`tier-card-${idx}`}
            data-tier-label={tier.label}
            data-tier-selected={isSelected ? 'true' : 'false'}
            data-tier-popular={isMostPopular ? 'true' : 'false'}
            onClick={() => onSelect(idx)}
            aria-pressed={isSelected}
            style={cardStyle}
          >
            {isMostPopular && (
              <span
                data-testid={`tier-card-${idx}-popular-badge`}
                style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: selBg,
                  color: guardTextColor('#ffffff', selBg, 'tierPopularBadge'),
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                }}
              >
                Most Popular
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isSelected ? selLabelColor : theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: isMostPopular ? 4 : 0,
              }}
            >
              {tier.label}
            </span>
            <span
              data-testid={`tier-card-${idx}-price`}
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: isSelected ? selPriceColor : theme.text,
                lineHeight: 1.15,
                wordBreak: 'break-word',
              }}
            >
              {formatPrice(tierPrice)}
            </span>
            {tier.tagline && (
              <span
                style={{
                  fontSize: 11,
                  color: isSelected ? selTaglineColor : theme.textMuted,
                  lineHeight: 1.4,
                }}
              >
                {tier.tagline}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
