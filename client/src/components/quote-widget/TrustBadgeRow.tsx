/**
 * BF-9 — TrustBadgeRow — render the pre-curated trust-badge pill row.
 *
 * Sits in the widget header area (rendered ABOVE the stepper progress, BELOW
 * the title bar). Each badge is a small pill: accent-tinted background +
 * accent-coloured icon + short label. Mobile: pills wrap to 2+ rows via
 * `flex-wrap: wrap` (no horizontal scroll).
 *
 * Receives `badges` from the template via `AdvancedConfigShape.trustBadges`.
 * Absent / empty → render `null` (no placeholder row).
 */
import type { CSSProperties } from 'react';
import {
  Shield, ShieldCheck, CheckCircle, CheckCircle2, Award, Lock, Star,
  ThumbsUp, BadgeCheck, Verified, ClipboardCheck, Clock, Leaf, FileBadge,
} from 'lucide-react';
import type { TrustBadge } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  badges?: readonly TrustBadge[];
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

export default function TrustBadgeRow({ badges, theme, fontFamily }: Props) {
  if (!badges || badges.length === 0) return null;

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px 10px',
    borderBottom: `1px solid ${theme.border}`,
    background: theme.surface,
    fontFamily,
  };

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: theme.accentTint,
    color: theme.text,
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };

  return (
    <div
      data-testid="trust-badge-row"
      data-component-name="Trust badges"
      data-component-type="trust-badges"
      style={rowStyle}
    >
      {badges.map((badge, i) => {
        const Icon = ICON_MAP[badge.icon] ?? BadgeCheck;
        return (
          <span
            key={`${badge.label}-${i}`}
            data-testid="trust-badge-pill"
            style={pillStyle}
          >
            <Icon size={13} aria-hidden="true" color={theme.accent} />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}
