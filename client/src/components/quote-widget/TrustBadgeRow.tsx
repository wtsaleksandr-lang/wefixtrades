/**
 * BF-9 — TrustBadgeRow — the pre-curated trust-badge pill row.
 *
 * Sits in the widget header (ABOVE the stepper progress, BELOW the title bar).
 * Each badge is a small chip: thin border + muted icon + short label. The chips
 * are laid out as a CENTERED flex-wrap row — every row (including the last) is
 * centered so the strip stays clean and balanced for any badge count / label
 * length, never ragged-left. Hovering a chip shows a white border; tapping/clicking it opens a
 * small morph-in popover anchored next to that badge with a brief description
 * plus a note that the owner can add any badges + any message of their own.
 *
 * Receives `badges` from the template via `AdvancedConfigShape.trustBadges`.
 * A `licenseNumber` on the business profile synthesises a leading
 * "Licensed #<number>" chip (a verifiable fact, strongest signal).
 */
import { useMemo, useState, useEffect, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, ShieldCheck, CheckCircle, CheckCircle2, Award, Lock, Star,
  ThumbsUp, BadgeCheck, Verified, ClipboardCheck, Clock, Leaf, FileBadge, X,
  // FIX 5b — tradesperson/trust icon additions.
  Wrench, Hammer, HardHat, Truck, Phone, MapPin, Calendar,
  CreditCard, Heart, Users, Zap, Handshake,
} from 'lucide-react';
import type { TrustBadge, BusinessProfile } from '@shared/templatePresets';
import { synthesizeProfileBadges } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';

interface Props {
  badges?: readonly TrustBadge[];
  businessProfile?: BusinessProfile;
  theme: WidgetTheme;
  fontFamily?: string;
  /**
   * Preview fidelity (#6) — the business anchor address (settings.origin
   * .address → advanced.origin.address). When set, synthesises a leading
   * map-pin "location" chip so entering an address shows up in the widget. The
   * address is otherwise only a distance-geocoding anchor with no render
   * surface. Optional; absent → no chip.
   */
  originAddress?: string;
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
  // FIX 5b — tradesperson/trust additions. Keep in sync with the TrustBadge
  // icon union (shared/templatePresets.ts) and TRUST_ICON_OPTIONS (StyleTab.tsx).
  'wrench': Wrench,
  'hammer': Hammer,
  'hard-hat': HardHat,
  'truck': Truck,
  'phone': Phone,
  'map-pin': MapPin,
  'calendar': Calendar,
  'credit-card': CreditCard,
  'heart': Heart,
  'users': Users,
  'zap': Zap,
  'handshake': Handshake,
} as const;

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
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5;
}

/** Short, plain-English explanation per badge (keyword-matched, with a
 *  sensible fallback) shown in the badge's popover. */
function describeBadge(label: string): string {
  const l = label.toLowerCase();
  if (/#/.test(label) || l.startsWith('licensed #')) return "Your verified license number — proof you're licensed for the work.";
  if (l.includes('insured')) return 'You hold the required licenses and carry insurance.';
  if (l.includes('nate')) return 'Technicians certified by NATE — the HVAC competency standard.';
  if (l.includes('epa')) return 'Certified to safely handle refrigerants (EPA Section 608).';
  if (l.includes('workmanship') || l.includes('guarantee') || l.includes('warranty')) return 'Your work is backed by a written guarantee.';
  if (l.includes('bbb')) return 'Accredited by the Better Business Bureau.';
  if (l.includes('osha')) return 'OSHA-compliant safety practices on every job.';
  if (l.includes('iicrc')) return 'IICRC-certified restoration technicians.';
  if (l.includes('ase')) return 'ASE-certified automotive technicians.';
  if (l.includes('bonded')) return 'Bonded for your protection.';
  if (l.includes('star') || l.includes('rated') || l.includes('review')) return 'Highly rated by real customers.';
  return 'A trust signal that reassures customers before they request a quote.';
}

function BadgePopover({
  label, Icon, anchor, accent, onClose,
}: {
  label: string;
  Icon: typeof BadgeCheck;
  anchor: { cx: number; bottom: number };
  accent: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const W = Math.min(248, vw - 24);
  const estH = 168;
  let left = anchor.cx - W / 2;
  left = Math.max(10, Math.min(left, vw - W - 10));
  // Prefer opening below the badge; flip above if it would run off-screen.
  let top = anchor.bottom + 10;
  if (top + estH > vh - 10) top = Math.max(10, anchor.bottom - estH - 28);

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'transparent' }} />
      <motion.div
        role="dialog"
        aria-label={`${label} — what this means`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.82, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        style={{
          position: 'fixed', left, top, width: W, zIndex: 2147483001,
          background: 'rgba(18,24,28,0.97)',
          backdropFilter: 'blur(10px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 13,
          padding: '13px 14px 12px',
          boxShadow: '0 18px 46px rgba(0,0,0,0.5)',
          textAlign: 'left',
          transformOrigin: 'top center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'rgba(255,255,255,0.96)', border: `1px solid ${accent}`,
          }}>
            <Icon size={14} color={accent} strokeWidth={2.2} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,1)', lineHeight: 1.2 }}>{label}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            marginLeft: 'auto', width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.18)', background: 'transparent',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
            <X size={12} />
          </button>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', margin: '0 0 8px' }}>
          {describeBadge(label)}
        </p>
        <p style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.6)', margin: 0, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          These badges are examples — in your own widget you can add any badges you want and write any message right here.
        </p>
      </motion.div>
    </>
  );
}

export default function TrustBadgeRow({ badges, businessProfile, theme, fontFamily, originAddress }: Props) {
  const [open, setOpen] = useState<{ i: number; anchor: { cx: number; bottom: number } } | null>(null);

  const allBadges = useMemo<readonly TrustBadge[]>(() => {
    // Item 13b — every populated business-profile field synthesises a
    // verifiable trust chip so what the owner types in Settings → Business
    // profile (rating, reviews, license #, insured, years in business,
    // service area, BBB) — PLUS the business address (#6) — renders live in the
    // widget preview. The derivation lives in the shared `synthesizeProfileBadges`
    // so the StyleTab editor's "+N auto badges" note counts the SAME chips this
    // row renders (#4 count reconcile). Year clamp (#4) is handled inside that
    // helper (calendar-year → duration).
    const synthesised = synthesizeProfileBadges(businessProfile, originAddress);
    const src = badges ?? [];
    return synthesised.length > 0 ? [...synthesised, ...src] : src;
  }, [
    badges,
    businessProfile?.googleRating,
    businessProfile?.googleReviewCount,
    businessProfile?.licenseNumber,
    businessProfile?.insuredAmount,
    businessProfile?.yearsInBusiness,
    businessProfile?.serviceArea,
    businessProfile?.bbbRating,
    originAddress,
  ]);

  if (allBadges.length === 0) return null;

  const dark = isDarkSurface(theme.surface);
  const borderColor = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)';
  // Hover → a clear white border on dark surfaces (a strong dark one on light).
  const borderColorHover = dark ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.55)';

  // Centered, balanced wrap. The chips have varying widths (label length +
  // optional icon), so a left-packed `flex-wrap` produced ragged rows ("2 on
  // one row, then 1, then 1") that read as misaligned. Centering each row —
  // including the last — keeps the strip looking clean and balanced for ANY
  // badge count (1, 2, 3, 4, 5+) and ANY label length. We wrap (never a single
  // nowrap scroll row) so chips can never push the widget past the viewport on
  // narrow screens; each chip carries minWidth:0 so a pathological label
  // ellipsises instead of overflowing. No horizontal-scroll / edge-fade mask —
  // that machinery only made sense for the old single-line scrolling row and
  // muddied a wrapped, centered layout.
  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 16px 10px',
    background: 'transparent',
    fontFamily,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  };

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 9px',
    borderRadius: 8,
    background: 'transparent',
    border: `1px solid ${borderColor}`,
    color: theme.textBody,
    opacity: 0.85,
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    // Cap a pathologically long single chip to the row width so it can never
    // push past the viewport (label ellipsises instead of overflowing).
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 120ms ease, opacity 120ms ease',
  };

  const scopeClass = 'qq-trust-chip';
  const rowClass = 'qq-trust-row';

  return (
    <div
      data-testid="trust-badge-row"
      data-component-name="Trust badges"
      data-component-type="trust-badges"
      className={rowClass}
      style={rowStyle}
    >
      <style>{`
        .${scopeClass}:hover, .${scopeClass}:focus-visible {
          border-color: ${borderColorHover} !important;
          opacity: 1 !important;
          outline: none;
        }
        /* Item 2 (mobile trust badges) — on NARROW rendered widths the
           centered flex-wrap let long-labelled chips fall to 1-per-row, which
           read as ragged + wasteful. Switch to a balanced 2-column grid so the
           common 4-badge set renders as a clean 2×2. Uses the SAME container
           query as the widget body layout (item 1: the widget root carries
           container: qqwidget / inline-size) so it triggers on the widget's
           OWN rendered width — the bezel-constrained ~375px in the wizard's
           mobile device-preview, and real phones — not the browser viewport.
           Chips fill their cell (justify-content:center, min-width:0 → label
           ellipsises) so two always fit per row. Wide/desktop keeps the
           centered flex-wrap. */
        @container qqwidget (max-width: 559px) {
          .${rowClass} {
            /* !important so these beat the inline display:flex / white-space
               on rowStyle + chipStyle (inline styles outrank a stylesheet
               rule otherwise — the hover rule above uses !important for the
               same reason). */
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .${rowClass} > .${scopeClass} {
            width: 100%;
            max-width: 100%;
            justify-content: center;
            white-space: normal !important;
          }
        }
      `}</style>
      {allBadges.map((badge, i) => {
        const Icon = ICON_MAP[badge.icon] ?? BadgeCheck;
        return (
          <button
            key={`${badge.label}-${i}`}
            type="button"
            data-testid="trust-badge-pill"
            className={scopeClass}
            style={chipStyle}
            aria-haspopup="dialog"
            aria-expanded={open?.i === i}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setOpen({ i, anchor: { cx: r.left + r.width / 2, bottom: r.bottom } });
            }}
          >
            {/* FIX 5c — honour the optional per-badge icon colour; fall back
                to currentColor (the chip's text colour) when unset so existing
                badges look identical. */}
            <Icon
              size={14}
              aria-hidden="true"
              color={badge.color || 'currentColor'}
              strokeWidth={2}
            />
            {badge.label}
          </button>
        );
      })}

      {open && (
        <BadgePopover
          label={allBadges[open.i].label}
          Icon={ICON_MAP[allBadges[open.i].icon] ?? BadgeCheck}
          anchor={open.anchor}
          accent={theme.accent}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
