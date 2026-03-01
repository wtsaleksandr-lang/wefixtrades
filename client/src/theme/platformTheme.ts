import { colors, radius, shadows, transitions } from './tokens';

const pc = colors.platform;
const st = colors.status;

export const platformTheme = {
  colors: {
    accent: pc.accent,
    accentDark: pc.accentDark,
    accentLight: pc.accentLight,
    accentLighter: pc.accentLighter,
    accentTint: pc.accentTint,
    accentGlow: pc.accentGlow,

    pageBg: pc.pageBg,
    pageBgSubtle: pc.pageBgSubtle,

    surface: pc.surface,
    surfaceRaised: pc.surfaceRaised,
    surfaceHover: pc.surfaceHover,

    heading: pc.heading,
    body: pc.body,
    muted: pc.muted,
    subtle: pc.subtle,

    border: pc.border,
    borderLight: pc.borderLight,
    borderHover: pc.borderHover,
    borderSelected: pc.accent,

    success: st.success,
    successLight: st.successLight,
    danger: st.danger,
    dangerLight: st.dangerLight,
    warning: st.warning,
    warningLight: st.warningLight,
  },

  shadows: {
    xs: shadows.xs,
    sm: shadows.sm,
    card: shadows.card,
    cardHover: shadows.cardHover,
    wizardCard: '0 2px 12px rgba(0,0,0,0.04), 0 0 1px rgba(0,0,0,0.06)',
    lg: shadows.lg,
    xl: shadows.xl,
    button: `0 1px 3px rgba(45,106,79,0.15), 0 1px 2px rgba(0,0,0,0.06)`,
    buttonHover: `0 4px 14px rgba(45,106,79,0.2), 0 1px 3px rgba(0,0,0,0.06)`,
    focus: `0 0 0 3px rgba(45,106,79,0.12)`,
    selected: `0 0 0 2px ${pc.accent}30, 0 1px 4px rgba(45,106,79,0.08)`,
  },

  radius: {
    sm: radius.sm,
    md: radius.md,
    lg: radius.lg,
    xl: radius.xl,
    pill: '999px',
  },

  typography: {
    h1: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, color: pc.heading, letterSpacing: '-0.02em' },
    h2: { fontSize: '20px', fontWeight: 600, lineHeight: 1.35, color: pc.heading },
    h3: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4, color: pc.heading },
    body: { fontSize: '15px', fontWeight: 400, lineHeight: 1.6, color: pc.body },
    bodySm: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5, color: pc.body },
    caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: pc.muted },
    captionSm: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: pc.subtle },
    label: { fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: pc.body, letterSpacing: '0.01em' },
    stepLabel: { fontSize: '12px', fontWeight: 600, lineHeight: 1, color: pc.muted, letterSpacing: '0.04em' },
  },

  transitions: {
    fast: transitions.fast,
    normal: transitions.normal,
    slow: transitions.slow,
    spring: transitions.spring,
  },
};

export type PlatformTheme = typeof platformTheme;
