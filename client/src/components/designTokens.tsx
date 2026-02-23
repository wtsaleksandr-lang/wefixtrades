const COLORS = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#3B82F6',
  primaryLighter: '#EFF6FF',
  primaryTint: 'rgba(37, 99, 235, 0.06)',
  primaryGlow: 'rgba(37, 99, 235, 0.2)',

  navy: '#0B1F3A',
  navyLight: '#132D4F',

  gradientStart: '#0B1F3A',
  gradientEnd: '#132D4F',
  gradientHeader: 'linear-gradient(135deg, #0B1F3A 0%, #132D4F 50%, #1A3A5C 100%)',
  gradientButton: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
  gradientButtonHover: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',

  success: '#059669',
  successLight: '#ECFDF5',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  warning: '#D97706',
  warningLight: '#FFFBEB',

  background: '#F8FAFC',
  backgroundAlt: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FAFBFC',

  heading: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  subtle: '#94A3B8',

  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderHover: '#CBD5E1',
  borderSelected: '#2563EB',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
};

const SHADOWS = {
  xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 12px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
  xl: '0 16px 40px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.04)',
  button: '0 2px 8px rgba(37,99,235,0.2), 0 1px 3px rgba(37,99,235,0.12)',
  buttonHover: '0 6px 20px rgba(37,99,235,0.3), 0 2px 6px rgba(37,99,235,0.15)',
  focus: '0 0 0 3px rgba(37,99,235,0.15)',
  card: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
  cardHover: '0 8px 25px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.04)',
  wizardCard: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)',
  selected: '0 0 0 2px rgba(37,99,235,0.15), 0 2px 8px rgba(37,99,235,0.08)',
};

const RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  pill: '999px',
};

const TYPOGRAPHY: Record<string, Record<string, any>> = {
  display: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2, color: COLORS.heading, letterSpacing: '-0.02em' },
  h1: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, color: COLORS.heading, letterSpacing: '-0.01em' },
  h2: { fontSize: '20px', fontWeight: 600, lineHeight: 1.35, color: COLORS.heading },
  h3: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4, color: COLORS.heading },
  body: { fontSize: '15px', fontWeight: 400, lineHeight: 1.6, color: COLORS.body },
  bodySm: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5, color: COLORS.body },
  caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: COLORS.muted },
  captionSm: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: COLORS.subtle },
  label: { fontSize: '12px', fontWeight: 700, lineHeight: 1.4, color: COLORS.textSecondary, letterSpacing: '0.04em', textTransform: 'uppercase' as const },
  stepLabel: { fontSize: '11px', fontWeight: 700, lineHeight: 1, color: COLORS.subtle, letterSpacing: '0.1em', textTransform: 'uppercase' as const },
};

export const designTokens = {
  colors: COLORS,
  shadows: SHADOWS,
  radius: RADIUS,
  typography: TYPOGRAPHY,
  transitions: {
    fast: 'all 0.15s ease-out',
    normal: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
