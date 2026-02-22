const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '48px',
};

const COLORS = {
  blue: '#2563EB',
  blueHover: '#1E40AF',
  blueLighter: '#EFF6FF',
  blueTint: 'rgba(37, 99, 235, 0.05)',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#F97316',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  heading: '#111827',
  body: '#374151',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  primary: '#2563EB',
  primaryLight: 'rgba(37, 99, 235, 0.08)',
  primaryLighter: 'rgba(37, 99, 235, 0.03)',
  primaryShadow: 'rgba(37, 99, 235, 0.25)',
  primaryHover: 'rgba(37, 99, 235, 0.1)',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  backgroundLight: '#F3F4F6',
};

const RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '18px',
  pill: '999px',
};

const SHADOWS = {
  xs: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 10px rgba(0, 0, 0, 0.04)',
  sm: '0 8px 20px rgba(0, 0, 0, 0.06)',
  md: '0 12px 28px rgba(0, 0, 0, 0.08)',
  lg: '0 20px 40px rgba(0, 0, 0, 0.1)',
  button: '0 6px 20px rgba(37,99,235,0.25)',
  hover: '0 12px 35px rgba(37,99,235,0.3)',
  focus: '0 10px 30px rgba(37,99,235,0.25)',
};

const TYPOGRAPHY: Record<string, Record<string, any>> = {
  h1: { fontSize: '28px', fontWeight: 600, lineHeight: 1.4, color: COLORS.heading },
  h2: { fontSize: '22px', fontWeight: 600, lineHeight: 1.4, color: COLORS.heading },
  h3: { fontSize: '18px', fontWeight: 600, lineHeight: 1.4, color: COLORS.heading },
  body: { fontSize: '14px', fontWeight: 400, lineHeight: 1.6, color: COLORS.body },
  bodySm: { fontSize: '13px', fontWeight: 400, lineHeight: 1.5, color: COLORS.body },
  caption: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: COLORS.muted },
  metric: { fontSize: '32px', fontWeight: 700, lineHeight: 1.2, color: COLORS.heading },
};

export const designTokens = {
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  typography: TYPOGRAPHY,
  transitions: {
    fast: 'all 0.15s ease-out',
    normal: 'all 0.2s ease-out',
    slow: 'all 0.3s ease-out',
  },
  layout: {
    desktopPadding: SPACING['3xl'],
    mobilePadding: SPACING['2xl'],
    cardPadding: SPACING['2xl'],
    sectionGap: SPACING['3xl'],
  },
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const getTransition = (speed = 'normal') => {
  if (prefersReducedMotion()) return 'none';
  return (designTokens.transitions as any)[speed] || designTokens.transitions.normal;
};
