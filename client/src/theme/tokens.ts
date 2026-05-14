export const colors = {
  text: {
    primary: '#111827',
    secondary: '#6B7280',
  },
  surface: {
    page: '#F6F7F9',
    muted: '#F1F3F6',
    overlay: 'rgba(64,64,64,0.06)',
  },
  border: {
    default: '#E5E7EB',
    hover: '#D1D5DB',
    light: '#F0F1F3',
  },
  brand: {
    dark: '#102126',
    darkHover: '#17343A',
    onDark: '#FFFFFF',
    onDarkMuted: 'rgba(255,255,255,0.72)',
    onDarkFaint: 'rgba(255,255,255,0.45)',
    onDarkBorder: 'rgba(255,255,255,0.08)',
  },
  accent: {
    blue: '#2F6BFF',
    blueHover: '#2557E6',
    blueTint: '#EAF1FF',
    blueGlow: 'rgba(47,107,255,0.2)',
    orange: '#FA4E1D',
    orangeTint: 'rgba(250,78,29,0.08)',
    cyan: '#0d3cfc',
    cyanTint: 'rgba(13,60,252,0.08)',
  },
  header: {
    frost: 'rgba(246,247,249,0.80)',
    borderBottom: 'rgba(20,20,20,0.08)',
    scrollShadow: '0 6px 16px rgba(0,0,0,0.06)',
    navHover: 'rgba(20,20,20,0.06)',
  },
  status: {
    success: '#10B981',
    successLight: '#ECFDF5',
    danger: '#EF4444',
    dangerLight: '#FEF2F2',
    warning: '#D97706',
    warningLight: '#FFFBEB',
  },
  platform: {
    accent: '#2D6A4F',
    accentDark: '#1B4332',
    accentLight: '#40916C',
    accentLighter: '#F0F7F4',
    accentTint: 'rgba(45,106,79,0.06)',
    accentGlow: 'rgba(45,106,79,0.18)',
    pageBg: '#F6F7F9',
    pageBgSubtle: '#F1F3F6',
    heading: '#111827',
    body: '#374151',
    muted: '#6B7280',
    subtle: '#9CA3AF',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    borderHover: '#D1D5DB',
    surface: '#FFFFFF',
    surfaceRaised: '#FAFBFC',
    surfaceHover: '#F8F9FB',
  },
  widget: {
    defaultAccent: '#2F6BFF',
    heading: '#111827',
    body: '#374151',
    muted: '#6B7280',
    subtle: '#9CA3AF',
    border: '#E5E7EB',
    borderLight: '#F1F5F9',
    borderHover: '#D1D5DB',
    surface: '#FFFFFF',
    surfaceRaised: '#FAFBFC',
    background: '#F6F7F9',
  },
  chart: {
    c1: '#2F6BFF',
    c2: '#0d3cfc',
    c3: '#FA4E1D',
    c4: '#D97706',
    c5: '#EF4444',
  },
  effortel: {
    n100: '#F5FCFF',
    n200: '#E4EDF1',
    n300: '#D5E1E7',
    n400: '#B1C5CE',
    n500: '#92A6B0',
    n600: '#5F6F77',
    n700: '#394247',
    n800: '#22282A',
    n900: '#171818',
    /* Accent ramp — formerly teal/cyan, swapped to primary blue
     * (#0d3cfc / #0b34d6 hover). Naming kept ("a100…a700") to avoid
     * a rename storm; semantic is now "blue accent" not "cyan". */
    a100: '#E6EAFF',
    a200: '#0b34d6',
    a400: '#0d3cfc',
    a500: '#0d3cfc',
    a700: '#0b34d6',
  },
} as const;

export const typography = {
  fontFamily: 'Satoshi, Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSerif: 'Georgia, serif',
  fontMono: 'Menlo, monospace',
  h1: { fontSize: '56px', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: colors.effortel.n300 },
  h2: { fontSize: '40px', fontWeight: 650, lineHeight: 1.12, letterSpacing: '-0.02em', color: colors.effortel.n300 },
  h3: { fontSize: '28px', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', color: colors.effortel.n300 },
  body: { fontSize: '16px', fontWeight: 400, lineHeight: 1.55, color: colors.effortel.n400 },
  small: { fontSize: '14px', fontWeight: 400, lineHeight: 1.45, color: colors.effortel.n400 },
  button: { fontSize: '15px', fontWeight: 500, lineHeight: 1.1, textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: colors.effortel.n400 },
  label: { fontSize: '12px', fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.04em', textTransform: 'uppercase' as const },
} as const;

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
} as const;

export const shadows = {
  xs: '0 1px 2px rgba(0,0,0,0.04)',
  sm: '0 2px 6px rgba(0,0,0,0.05)',
  md: '0 6px 16px rgba(0,0,0,0.06)',
  lg: '0 12px 30px rgba(0,0,0,0.08)',
  xl: '0 16px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04)',
  card: '0 10px 20px #33314833',
  cardHover: '0 20px 36px #3331484d',
  button: '0 4px 10px rgba(0,0,0,0.08)',
  buttonHover: '0 6px 16px rgba(0,0,0,0.1)',
  focus: '0 0 0 3px rgba(13,60,252,0.25)',
  frost: '0 6px 16px rgba(0,0,0,0.06)',
  mega: '0 16px 50px rgba(0,0,0,0.10)',
} as const;

export const transitions = {
  fast: 'all 0.15s ease-out',
  normal: 'all 0.2s ease',
  slow: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export const mkt = {
  bg: '#181D1F',
  surface: colors.effortel.n700,
  surfaceAlt: '#2E3638',
  text: colors.effortel.n300,
  textMuted: colors.effortel.n400,
  textFaint: colors.effortel.n600,
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.04)',
  /* Accent: primary blue (#0d3cfc), hover dark blue (#0b34d6).
   * Glow tint kept low-opacity for ambient gradients ONLY — do not use
   * for hover halos. Hover affordance is a white border (see uses below). */
  accent: colors.effortel.a400,
  accentHover: colors.effortel.a200,
  accentDark: colors.effortel.a700,
  accentTint: 'rgba(13,60,252,0.10)',
  accentGlow: 'rgba(13,60,252,0.20)',
  dark: colors.effortel.n900,
  darkHover: colors.effortel.n800,
  onDark: colors.effortel.n100,
  onDarkMuted: colors.effortel.n400,
  onDarkFaint: colors.effortel.n600,
  onDarkBorder: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(255,255,255,0.05)',
  frost: 'rgba(34,40,42,0.85)',
  navHover: 'rgba(255,255,255,0.06)',
  success: colors.status.success,
  danger: colors.status.danger,
  warning: colors.status.warning,
  orange: '#F7B430',
  orangeTint: 'rgba(247,180,48,0.10)',
  cyan: colors.effortel.a500,
  cyanTint: 'rgba(13,60,252,0.10)',
  cardBg: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
  /* PRIMARY BUTTON — DOSS pattern (Sprint: marketing-polish).
   * Warm off-white cream button. Replaces the previous blue primary CTA.
   * The old buttonBg/Text/HoverBg fields below are deprecated and kept as
   * aliases of the cream tokens for backwards-compat during migration —
   * existing callers see the new cream button automatically; new code
   * should reference ctaBg / ctaText / ctaBgHover directly. */
  ctaBg: '#E6E3E0',
  ctaBgHover: '#D4CFC9',
  ctaText: '#1E1E1E',
  /* Secondary (ghost/outline) — used for "See demo" / "Learn more" buttons */
  ctaSecondaryBgHover: 'rgba(230,227,224,0.06)',
  ctaSecondaryBorder: 'rgba(224,220,216,0.5)',
  ctaSecondaryBorderHover: 'rgba(224,220,216,0.9)',
  ctaSecondaryText: '#F9F9F9',

  /* Deprecated — old blue button tokens. Now alias to the cream button
   * so anywhere that still reads buttonBg/Text/HoverBg picks up the new
   * design without a code change. Will be removed once all callers are
   * migrated to ctaBg/Text/Hover. Blue is still available via
   * mkt.accent / mkt.accentHover for decorative use. */
  buttonBg: '#E6E3E0',
  buttonText: '#1E1E1E',
  buttonHoverBg: '#D4CFC9',

  /* Dark canvas elevation layers (DOSS pattern).
   * Maintained alongside legacy bg/surface/sectionLight/sectionLighter for
   * gradual migration. New code should prefer these. */
  bgBase: '#161616',        // page bg — true near-black, not warmed gray
  bgDeeper: '#111111',      // deepest sections, hero backgrounds
  bgElevated: '#1C1C1C',    // cards, dashboard tiles
  bgHigher: '#242424',      // hover states, dropdowns, modal surfaces
  bgOverlay: 'rgba(22,22,22,0.92)',

  /* Hairline border scale. Was previously ad-hoc rgba(*,*,*,0.04…0.12).
   * These three values cover every existing case + the DOSS pattern. */
  hairline: 'rgba(133,128,123,0.18)',
  hairlineStrong: 'rgba(133,128,123,0.32)',
  hairlineDashed: 'rgba(133,128,123,0.08)',
  focusRing: 'rgba(13,60,252,0.5)',

  /* Text hierarchy aligned to DOSS — warm grays, never pure white/black.
   * Existing onDark/onDarkMuted/onDarkFaint kept for compat; these are
   * the canonical names going forward. */
  fg: '#F9F9F9',
  fgSecondary: '#A39E99',
  fgTertiary: '#78736E',
  fgDisabled: '#6B6662',

  darkBg: '#0d1514',
  lightBg: '#dfe8e6',
  /** Lighter section background — visible contrast against mkt.bg */
  sectionLight: '#242d30',
  /** Even lighter — for alternating sections that need clear pop */
  sectionLighter: '#2e393c',
} as const;

export const tokens = {
  colors,
  typography,
  radius,
  shadows,
  transitions,
  mkt,
} as const;

export type Tokens = typeof tokens;
