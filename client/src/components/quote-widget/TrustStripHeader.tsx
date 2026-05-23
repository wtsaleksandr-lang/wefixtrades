/**
 * BD-2b — TrustStripHeader — aggregate trust signals shown above the step content.
 *
 * Sits BELOW the sticky header bar (which BD-2a-sticky shipped) and ABOVE
 * the first step. One row showing:
 *   - Aggregate Google rating: `4.8 ★ from 2,134 Google reviews`
 *   - Trust badge pills: "Licensed & Insured", years-in-business
 *   - Optional BBB rating pill (when applicable)
 *
 * Hidden entirely when `profile` is undefined OR carries no displayable
 * signals — we render `null`, never placeholder copy ("Rating coming soon"
 * etc.). Research (BD-0): empty trust strips read as a warning sign and
 * HURT conversion.
 */
import type { CSSProperties } from 'react';
import { Star, BadgeCheck } from 'lucide-react';
import type { BusinessProfile } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  /** Business profile (license #, Google rating, etc.). Undefined → render null. */
  profile?: BusinessProfile;
  /** Resolved widget theme. */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
}

/** Format an integer review count with thousands separators. */
function formatReviewCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('en-US');
}

export default function TrustStripHeader({ profile, theme, fontFamily }: Props) {
  if (!profile) return null;

  const rating = typeof profile.googleRating === 'number' && profile.googleRating > 0
    ? profile.googleRating : null;
  const reviewCount = typeof profile.googleReviewCount === 'number' && profile.googleReviewCount > 0
    ? profile.googleReviewCount : null;
  const yearsInBusiness = typeof profile.yearsInBusiness === 'number' && profile.yearsInBusiness > 0
    ? profile.yearsInBusiness : null;
  const insured = (profile.insuredAmount ?? '').trim();
  const licensed = (profile.licenseNumber ?? '').trim();
  const bbb = (profile.bbbRating ?? '').trim();
  const area = (profile.serviceArea ?? '').trim();

  const hasRating = rating !== null;
  const hasLicensed = licensed.length > 0 || insured.length > 0;
  const hasYears = yearsInBusiness !== null;
  const hasBbb = bbb.length > 0;

  // No displayable signals → render nothing (per spec). Don't surface
  // placeholder copy when the owner hasn't filled anything in yet.
  if (!hasRating && !hasLicensed && !hasYears && !hasBbb) return null;

  const stripStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    padding: '8px 20px 10px',
    borderBottom: `1px solid ${theme.border}`,
    background: theme.surface,
    fontFamily,
    color: theme.text,
    fontSize: 12,
    lineHeight: 1.4,
  };

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 999,
    background: theme.accentTint,
    color: theme.text,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      data-testid="trust-strip-header"
      data-component-name="Trust strip"
      data-component-type="trust-strip"
      style={stripStyle}
    >
      {hasRating && (
        <span
          data-testid="trust-strip-rating"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontWeight: 700,
          }}
        >
          <Star size={14} aria-hidden="true" fill="#f59e0b" stroke="#f59e0b" />
          <span>{rating!.toFixed(1)}</span>
          {reviewCount !== null && (
            <span style={{ fontWeight: 500, color: theme.textMuted }}>
              from {formatReviewCount(reviewCount)} Google reviews
            </span>
          )}
        </span>
      )}
      {hasLicensed && (
        <span data-testid="trust-strip-licensed" style={pillStyle}>
          <BadgeCheck size={12} aria-hidden="true" />
          Licensed & Insured
        </span>
      )}
      {hasYears && (
        <span data-testid="trust-strip-years" style={pillStyle}>
          {yearsInBusiness} {yearsInBusiness === 1 ? 'year' : 'years'}
          {area ? ` serving ${area}` : ' in business'}
        </span>
      )}
      {hasBbb && (
        <span data-testid="trust-strip-bbb" style={pillStyle}>
          BBB {bbb}
        </span>
      )}
    </div>
  );
}
