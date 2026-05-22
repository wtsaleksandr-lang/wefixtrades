/**
 * BD-2b — TrustBlockUnderCTA — inline trust signals beneath the action button.
 *
 * Renders inside the bottom sticky bar's EXPANDED state (not the folded
 * micro-summary strip) immediately below the action row, AND inside the
 * ContactStep card below the dual CTAs. Layout: license # + insured-up-to
 * on row 1, a tiny shield / lock / clipboard icon row on row 2, gray
 * "no-obligation estimate" microcopy on row 3.
 *
 * Hidden entirely when `profile` is undefined OR no relevant fields are
 * populated. Research (BD-0): CTA-adjacent trust placement converts 40-60%
 * better than the footer; empty placeholders HURT conversion.
 */
import type { CSSProperties } from 'react';
import { Shield, Lock, ClipboardCheck } from 'lucide-react';
import type { BusinessProfile } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  /** Business profile (license #, insured amount). Undefined → render null. */
  profile?: BusinessProfile;
  /** Resolved widget theme. */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Optional `data-testid` override (defaults to `trust-block-under-cta`). */
  testid?: string;
}

export default function TrustBlockUnderCTA({
  profile, theme, fontFamily, testid = 'trust-block-under-cta',
}: Props) {
  if (!profile) return null;

  const licensed = (profile.licenseNumber ?? '').trim();
  const insured = (profile.insuredAmount ?? '').trim();
  const hasLicense = licensed.length > 0;
  const hasInsured = insured.length > 0;

  // When neither the license # nor the insurance line is set, the icon row
  // alone reads as a generic logo strip — skip the whole block.
  if (!hasLicense && !hasInsured) return null;

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 10,
    fontFamily,
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 1.4,
  };

  const topRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    color: theme.text,
    fontSize: 12,
    fontWeight: 600,
  };

  const iconRowStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: theme.textMuted,
    marginTop: 2,
  };

  return (
    <div
      data-testid={testid}
      data-component-name="Trust block under CTA"
      data-component-type="trust-block"
      style={wrapperStyle}
    >
      <div style={topRowStyle}>
        {hasLicense && (
          <span data-testid={`${testid}-license`}>
            License #{licensed}
          </span>
        )}
        {hasLicense && hasInsured && (
          <span aria-hidden="true" style={{ color: theme.border }}>·</span>
        )}
        {hasInsured && (
          <span data-testid={`${testid}-insured`}>{insured}</span>
        )}
      </div>
      <div style={iconRowStyle} aria-hidden="true">
        <Shield size={13} />
        <Lock size={13} />
        <ClipboardCheck size={13} />
        <span style={{ marginLeft: 2, fontSize: 11, color: theme.textMuted }}>
          No-obligation estimate
        </span>
      </div>
    </div>
  );
}
