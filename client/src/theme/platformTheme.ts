const ACCENT = '#2D6A4F';
const ACCENT_DARK = '#1B4332';
const ACCENT_LIGHT = '#40916C';
const ACCENT_LIGHTER = '#F0F7F4';
const ACCENT_TINT = 'rgba(45, 106, 79, 0.06)';
const ACCENT_GLOW = 'rgba(45, 106, 79, 0.18)';

export const platformTheme = {
  colors: {
    accent: ACCENT,
    accentDark: ACCENT_DARK,
    accentLight: ACCENT_LIGHT,
    accentLighter: ACCENT_LIGHTER,
    accentTint: ACCENT_TINT,
    accentGlow: ACCENT_GLOW,

    pageBg: '#F7F8FA',
    pageBgSubtle: '#F2F3F5',

    surface: '#FFFFFF',
    surfaceRaised: '#FAFBFC',
    surfaceHover: '#F8F9FB',

    heading: '#111827',
    body: '#374151',
    muted: '#6B7280',
    subtle: '#9CA3AF',

    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    borderHover: '#D1D5DB',
    borderSelected: ACCENT,

    success: '#059669',
    successLight: '#ECFDF5',
    danger: '#DC2626',
    dangerLight: '#FEF2F2',
    warning: '#D97706',
    warningLight: '#FFFBEB',
  },

  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.04)',
    sm: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
    card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 8px rgba(0,0,0,0.03)',
    cardHover: '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.03)',
    wizardCard: '0 2px 12px rgba(0,0,0,0.04), 0 0 1px rgba(0,0,0,0.06)',
    lg: '0 8px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
    xl: '0 16px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.03)',
    button: `0 1px 3px rgba(45,106,79,0.15), 0 1px 2px rgba(0,0,0,0.06)`,
    buttonHover: `0 4px 14px rgba(45,106,79,0.2), 0 1px 3px rgba(0,0,0,0.06)`,
    focus: `0 0 0 3px rgba(45,106,79,0.12)`,
    selected: `0 0 0 2px ${ACCENT}30, 0 1px 4px rgba(45,106,79,0.08)`,
  },

  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    pill: '999px',
  },

  typography: {
    h1: { fontSize: '24px', fontWeight: 700, lineHeight: 1.3, color: '#111827', letterSpacing: '-0.02em' },
    h2: { fontSize: '20px', fontWeight: 600, lineHeight: 1.35, color: '#111827' },
    h3: { fontSize: '17px', fontWeight: 600, lineHeight: 1.4, color: '#111827' },
    body: { fontSize: '15px', fontWeight: 400, lineHeight: 1.6, color: '#374151' },
    bodySm: { fontSize: '14px', fontWeight: 400, lineHeight: 1.5, color: '#374151' },
    caption: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, color: '#6B7280' },
    captionSm: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, color: '#9CA3AF' },
    label: { fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: '#374151', letterSpacing: '0.01em' },
    stepLabel: { fontSize: '12px', fontWeight: 600, lineHeight: 1, color: '#6B7280', letterSpacing: '0.04em' },
  },

  transitions: {
    fast: 'all 0.15s ease-out',
    normal: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

export type PlatformTheme = typeof platformTheme;
