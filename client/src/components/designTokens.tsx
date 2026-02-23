const COLORS = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#6366F1',
  primaryLighter: '#EEF2FF',
  primaryTint: 'rgba(79, 70, 229, 0.08)',
  primaryGlow: 'rgba(99, 102, 241, 0.25)',

  gradientStart: '#312E81',
  gradientEnd: '#4F46E5',
  gradientHeader: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #4338CA 100%)',
  gradientButton: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
  gradientButtonHover: 'linear-gradient(135deg, #4338CA 0%, #3730A3 100%)',

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
  borderSelected: '#4F46E5',

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
  button: '0 2px 8px rgba(79,70,229,0.25), 0 1px 3px rgba(79,70,229,0.15)',
  buttonHover: '0 6px 20px rgba(79,70,229,0.35), 0 2px 6px rgba(79,70,229,0.2)',
  focus: '0 0 0 3px rgba(79,70,229,0.2)',
  card: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
  cardHover: '0 8px 25px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.04)',
  selected: '0 0 0 2px rgba(79,70,229,0.2), 0 2px 8px rgba(79,70,229,0.1)',
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
