const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '48px',
  '5xl': '64px',
};

const COLORS = {
  blue: '#2563EB',
  blueHover: '#1D4ED8',
  blueLighter: '#EFF6FF',
  blueTint: 'rgba(37, 99, 235, 0.05)',
  success: '#059669',
  successLight: '#ECFDF5',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceRaised: '#FAFBFC',
  heading: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderHover: '#CBD5E1',
  primary: '#2563EB',
  primaryLight: 'rgba(37, 99, 235, 0.08)',
  primaryLighter: 'rgba(37, 99, 235, 0.04)',
  primaryShadow: 'rgba(37, 99, 235, 0.2)',
  primaryHover: 'rgba(37, 99, 235, 0.1)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  backgroundLight: '#F1F5F9',
};

const RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  pill: '999px',
};

const SHADOWS = {
  xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
  lg: '0 8px 30px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.04)',
  button: '0 2px 8px rgba(37,99,235,0.2), 0 1px 3px rgba(37,99,235,0.1)',
  buttonHover: '0 4px 16px rgba(37,99,235,0.3), 0 2px 6px rgba(37,99,235,0.15)',
  hover: '0 8px 24px rgba(37,99,235,0.2)',
  focus: '0 0 0 3px rgba(37,99,235,0.15)',
  card: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
  cardHover: '0 4px 20px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
};

const TYPOGRAPHY: Record<string, Record<string, any>> = {
  display: { fontSize: '36px', fontWeight: 700, lineHeight: 1.2, color: COLORS.heading, letterSpacing: '-0.02em' },
  h1: { fontSize: '28px', fontWeight: 700, lineHeight: 1.3, color: COLORS.heading, letterSpacing: '-0.01em' },
  h2: { fontSize: '22px', fontWeight: 600, lineHeight: 1.35, color: COLORS.heading, letterSpacing: '-0.01em' },
  h3: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4, color: COLORS.heading },
  body: { fontSize: '15px', fontWeight: 400, lineHeight: 1.6, color: COLORS.body },
  bodySm: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5, color: COLORS.body },
  caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: COLORS.muted },
  captionSm: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: COLORS.subtle },
  label: { fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: COLORS.textSecondary, letterSpacing: '0.01em' },
  metric: { fontSize: '40px', fontWeight: 800, lineHeight: 1.1, color: COLORS.heading, letterSpacing: '-0.02em' },
  metricSm: { fontSize: '28px', fontWeight: 700, lineHeight: 1.2, color: COLORS.heading },
};

export const designTokens = {
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  typography: TYPOGRAPHY,
  transitions: {
    fast: 'all 0.15s ease-out',
    normal: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  layout: {
    desktopPadding: SPACING['4xl'],
    mobilePadding: SPACING['2xl'],
    cardPadding: SPACING['3xl'],
    sectionGap: SPACING['4xl'],
  },
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const getTransition = (speed = 'normal') => {
  if (prefersReducedMotion()) return 'none';
  return (designTokens.transitions as any)[speed] || designTokens.transitions.normal;
};
