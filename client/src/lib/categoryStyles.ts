// Wave W-AP-1 — per-category visual identity for the template gallery.
//
// The previous gallery mockups were theme-only (light / midnight / forest /
// coral / mint / magenta) so two cards in the same theme looked identical
// regardless of trade. PR #411 added a thin category-accent stripe but it
// wasn't enough — Alex still read the gallery as "all white cards with blue
// buttons". This module gives every TemplateConfig.category a distinct
// palette + hero treatment + CTA shape, used by `TemplateCardMockup` to
// paint a card that looks like a poster for its trade, not a wireframe.
//
// IMPORTANT: these palettes are for the GALLERY mockup ONLY. The live
// rendered widget still uses the resolved `WidgetTheme` from the
// template's own `theme` field. The mockup palette is a marketing
// composition; the widget theme is the runtime look-and-feel.

export type CategoryStyleId =
  | 'automotive'
  | 'construction'
  | 'cleaning'
  | 'home-improvement'
  | 'emergency'
  | 'outdoor'
  | 'professional'
  | 'default';

export type HeroTreatment =
  | 'dark-mode'         // solid dark hero, light icon on top — Automotive
  | 'diagonal-stripe'   // bold diagonal accent across hero — Construction
  | 'sparkle'           // soft light hero with sparkle dots — Cleaning
  | 'grid-pattern'      // subtle grid overlay — Home Improvement
  | 'chevrons'          // warning chevrons — Emergency
  | 'leaf'              // leaf accent — Outdoor
  | 'geometric';        // minimal squares — Professional

export type CtaShape =
  | 'pill'         // fully rounded — default, friendly
  | 'rounded-sq'   // 6px radius — industrial / construction
  | 'squared';     // 2px radius — minimal professional

export interface CategoryStyle {
  id: CategoryStyleId;
  /** Hero background colour — fills the top ~55% of the mockup. */
  heroBg: string;
  /** Foreground / accent colour painted over the hero. */
  heroAccent: string;
  /** Card body background (below the hero). */
  bodyBg: string;
  /** Body text / row colour. */
  bodyRow: string;
  /** CTA fill — usually heroAccent with a gradient companion. */
  ctaFrom: string;
  ctaTo: string;
  /** CTA text colour. */
  ctaText: string;
  /** Hero composition style. */
  hero: HeroTreatment;
  /** CTA button shape. */
  ctaShape: CtaShape;
  /** Whether the hero is on a dark base (icon needs light tinting). */
  isDark: boolean;
}

const STYLES: Record<CategoryStyleId, CategoryStyle> = {
  automotive: {
    id: 'automotive',
    heroBg: '#0f172a',          // slate-900
    heroAccent: '#fb923c',       // orange-400
    bodyBg: '#ffffff',
    bodyRow: '#e2e8f0',
    ctaFrom: '#f97316',          // orange-500
    ctaTo: '#ea580c',            // orange-600
    ctaText: '#ffffff',
    hero: 'dark-mode',
    ctaShape: 'pill',
    isDark: true,
  },
  construction: {
    id: 'construction',
    heroBg: '#1e293b',           // slate-800
    heroAccent: '#fbbf24',       // amber-400
    bodyBg: '#fffbeb',           // amber-50
    bodyRow: '#fde68a',          // amber-200
    ctaFrom: '#f59e0b',          // amber-500
    ctaTo: '#d97706',            // amber-600
    ctaText: '#1e293b',
    hero: 'diagonal-stripe',
    ctaShape: 'rounded-sq',
    isDark: true,
  },
  cleaning: {
    id: 'cleaning',
    heroBg: '#ecfdf5',           // emerald-50
    heroAccent: '#10b981',       // emerald-500
    bodyBg: '#ffffff',
    bodyRow: '#d1fae5',          // emerald-100
    ctaFrom: '#10b981',          // emerald-500
    ctaTo: '#059669',            // emerald-600
    ctaText: '#ffffff',
    hero: 'sparkle',
    ctaShape: 'pill',
    isDark: false,
  },
  'home-improvement': {
    id: 'home-improvement',
    heroBg: '#eff6ff',           // blue-50
    heroAccent: '#2563eb',       // blue-600
    bodyBg: '#ffffff',
    bodyRow: '#dbeafe',          // blue-100
    ctaFrom: '#2563eb',          // blue-600
    ctaTo: '#1d4ed8',            // blue-700
    ctaText: '#ffffff',
    hero: 'grid-pattern',
    ctaShape: 'pill',
    isDark: false,
  },
  emergency: {
    id: 'emergency',
    heroBg: '#7f1d1d',           // red-900
    heroAccent: '#fbbf24',       // amber-400
    bodyBg: '#fef2f2',           // red-50
    bodyRow: '#fecaca',          // red-200
    ctaFrom: '#dc2626',          // red-600
    ctaTo: '#991b1b',            // red-800
    ctaText: '#ffffff',
    hero: 'chevrons',
    ctaShape: 'pill',
    isDark: true,
  },
  outdoor: {
    id: 'outdoor',
    heroBg: '#14532d',           // green-900
    heroAccent: '#bef264',       // lime-300
    bodyBg: '#f7fee7',           // lime-50
    bodyRow: '#d9f99d',          // lime-200
    ctaFrom: '#16a34a',          // green-600
    ctaTo: '#15803d',            // green-700
    ctaText: '#ffffff',
    hero: 'leaf',
    ctaShape: 'pill',
    isDark: true,
  },
  professional: {
    id: 'professional',
    heroBg: '#faf5ff',           // purple-50
    heroAccent: '#7c3aed',       // violet-600
    bodyBg: '#fffbeb',           // cream
    bodyRow: '#ede9fe',          // violet-100
    ctaFrom: '#7c3aed',          // violet-600
    ctaTo: '#6d28d9',            // violet-700
    ctaText: '#ffffff',
    hero: 'geometric',
    ctaShape: 'squared',
    isDark: false,
  },
  default: {
    id: 'default',
    heroBg: '#f1f5f9',           // slate-100
    heroAccent: '#475569',       // slate-600
    bodyBg: '#ffffff',
    bodyRow: '#e2e8f0',
    ctaFrom: '#475569',
    ctaTo: '#334155',
    ctaText: '#ffffff',
    hero: 'geometric',
    ctaShape: 'pill',
    isDark: false,
  },
};

/**
 * Map a `TemplateConfig.category` string to one of the curated style
 * families. The category set in templatePresets has expanded over time
 * (Driveway, HVAC, Restoration, Renewable Energy, etc.); we collapse
 * them into the 7 visual families so the gallery stays coherent.
 */
export function getCategoryStyle(category: string | undefined): CategoryStyle {
  if (!category) return STYLES.default;
  const c = category.toLowerCase();
  if (c.includes('automotive') || c.includes('moving') || c.includes('mechanical')) {
    return STYLES.automotive;
  }
  if (c.includes('construction') || c.includes('driveway') || c.includes('renovation')) {
    return STYLES.construction;
  }
  if (c.includes('cleaning')) return STYLES.cleaning;
  if (c.includes('home improvement') || c.includes('hvac')) {
    return STYLES['home-improvement'];
  }
  if (c.includes('emergency') || c.includes('restoration') || c.includes('repair')) {
    return STYLES.emergency;
  }
  if (c.includes('outdoor') || c.includes('renewable')) return STYLES.outdoor;
  if (c.includes('professional') || c.includes('photography') || c.includes('specialty')) {
    return STYLES.professional;
  }
  return STYLES.default;
}

/**
 * Templates flagged "Featured" or "New" in the gallery. Keep this list
 * tiny (3-5 ids) — the badge loses meaning if every card has it. The
 * three Wave AP-1 sample templates plus one anchor original.
 */
export const FEATURED_TEMPLATE_IDS = new Set<string>([
  'junk_removal_quote',
  'window_replacement_quote',
  'mold_remediation_quote',
  'roof_repair',
]);

/**
 * Helper — accent stripe geometry per layout. Single-column = full-width
 * top stripe; two-column = half-width left; multi-column = three small
 * stripes. Returned as raw style fragments so the mockup can paint them
 * via inline style without extra DOM complexity.
 */
export type StripeShape = 'full' | 'half' | 'triple';

export function stripeShapeForLayout(layout: string | undefined): StripeShape {
  if (layout === 'two-column') return 'half';
  if (layout === 'multi-column') return 'triple';
  return 'full';
}
