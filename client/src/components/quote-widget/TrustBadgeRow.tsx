/**
 * BF-9 — TrustBadgeRow — render the pre-curated trust-badge pill row.
 *
 * Sits in the widget header area (rendered ABOVE the stepper progress, BELOW
 * the title bar). Each badge is a small subtle chip: thin border + muted
 * icon + short label. Mobile: chips wrap to 2+ rows via `flex-wrap: wrap`
 * (no horizontal scroll), centred on both rows.
 *
 * Receives `badges` from the template via `AdvancedConfigShape.trustBadges`.
 * Absent / empty (and no synthesised badges from the business profile) →
 * render `null` (no placeholder row).
 *
 * P2 UX — replaced BD-2b's separate TrustStripHeader. Business-profile
 * fields (license number) are folded into this row as an auto-synthesised
 * badge so the widget has ONE unified trust strip instead of two competing
 * ones. The visual style is intentionally muted: transparent background,
 * 1 px thin border that adapts to dark vs light surfaces, square-ish 8 px
 * radius, no glow/shadow/accent fill. Hover only brightens the border.
 */
import { useMemo, type CSSProperties } from 'react';
import {
  Shield, ShieldCheck, CheckCircle, CheckCircle2, Award, Lock, Star,
  ThumbsUp, BadgeCheck, Verified, ClipboardCheck, Clock, Leaf, FileBadge,
} from 'lucide-react';
import type { TrustBadge, BusinessProfile } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  badges?: readonly TrustBadge[];
  /** P2 UX — optional business profile. When `licenseNumber` is set we
   *  prepend an auto-synthesised "Licensed #XYZ" badge so the unified
   *  trust row carries the data that used to live in TrustStripHeader. */
  businessProfile?: BusinessProfile;
  theme: WidgetTheme;
  fontFamily?: string;
}

const ICON_MAP = {
  'shield': Shield,
  'shield-check': ShieldCheck,
  'check-circle': CheckCircle,
  'check-circle-2': CheckCircle2,
  'award': Award,
  'lock': Lock,
  'star': Star,
  'thumbs-up': ThumbsUp,
  'badge-check': BadgeCheck,
  'verified': Verified,
  'clipboard-check': ClipboardCheck,
  'clock': Clock,
  'leaf': Leaf,
  'file-badge': FileBadge,
} as const;

/**
 * Best-effort "is this background dark?" check so the chip border can pick
 * an appropriate baseline alpha (white-on-dark vs black-on-light). Accepts
 * hex (`#fff` / `#ffffff`) and rgb/rgba(); anything else falls back to
 * "light" since the historical theme set is light-dominant.
 */
function isDarkSurface(color: string): boolean {
  if (!color) return false;
  const trimmed = color.trim().toLowerCase();
  let r = 255, g = 255, b = 255;
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    if (!/^[0-9a-f]{6}$/.test(full)) return false;
    r = parseInt(full.slice(0, 2), 16);
    g = parseInt(full.slice(2, 4), 16);
    b = parseInt(full.slice(4, 6), 16);
  } else {
    const m = trimmed.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return false;
    r = parseInt(m[1], 10);
    g = parseInt(m[2], 10);
    b = parseInt(m[3], 10);
  }
  // Relative luminance per WCAG (sRGB approximation is fine here).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5;
}

export default function TrustBadgeRow({ badges, businessProfile, theme, fontFamily }: Props) {
  // Combine template badges with any auto-synthesised ones from the
  // business profile. The license-number badge goes FIRST so it reads as
  // the strongest signal (it's a verifiable fact, not a marketing claim).
  const allBadges = useMemo<readonly TrustBadge[]>(() => {
    const license = (businessProfile?.licenseNumber ?? '').trim();
    const synthesised: TrustBadge[] = [];
    if (license.length > 0) {
      synthesised.push({ label: `Licensed #${license}`, icon: 'badge-check' });
    }
    const src = badges ?? [];
    return synthesised.length > 0 ? [...synthesised, ...src] : src;
  }, [badges, businessProfile?.licenseNumber]);

  if (allBadges.length === 0) return null;

  const dark = isDarkSurface(theme.surface);
  const borderAlphaRest = dark ? 0.12 : 0.10;
  const borderAlphaHover = dark ? 0.20 : 0.16;
  const borderColor = dark
    ? `rgba(255, 255, 255, ${borderAlphaRest})`
    : `rgba(0, 0, 0, ${borderAlphaRest})`;
  const borderColorHover = dark
    ? `rgba(255, 255, 255, ${borderAlphaHover})`
    : `rgba(0, 0, 0, ${borderAlphaHover})`;

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    rowGap: 8,
    padding: '8px 20px 10px',
    background: 'transparent',
    fontFamily,
  };

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 8,
    background: 'transparent',
    border: `1px solid ${borderColor}`,
    color: theme.textBody,
    opacity: 0.8,
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    transition: 'border-color 120ms ease, opacity 120ms ease',
  };

  // Per-row scope so the hover rule doesn't leak. Using a small scoped
  // <style> tag avoids pulling in another CSS file for what is one rule.
  const scopeClass = 'qq-trust-chip';

  return (
    <div
      data-testid="trust-badge-row"
      data-component-name="Trust badges"
      data-component-type="trust-badges"
      style={rowStyle}
    >
      <style>{`
        .${scopeClass}:hover {
          border-color: ${borderColorHover} !important;
          opacity: 1 !important;
        }
      `}</style>
      {allBadges.map((badge, i) => {
        const Icon = ICON_MAP[badge.icon] ?? BadgeCheck;
        return (
          <span
            key={`${badge.label}-${i}`}
            data-testid="trust-badge-pill"
            className={scopeClass}
            style={chipStyle}
          >
            <Icon
              size={14}
              aria-hidden="true"
              color="currentColor"
              strokeWidth={2}
            />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}
