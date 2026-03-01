import { colors, radius } from './tokens';

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '100,100,100';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export interface WidgetThemeConfig {
  accent?: string;
  font?: string;
  buttonStyle?: string;
  surfaceVariant?: string;
  radius?: string;
  logoUrl?: string;
}

const wc = colors.widget;

export function getWidgetTheme(overrides?: WidgetThemeConfig, primaryColor?: string) {
  const accent = primaryColor || overrides?.accent || wc.defaultAccent;
  const rgb = hexToRgb(accent);

  return {
    colors: {
      primary: accent,
      primaryDark: accent,
      primaryLight: accent,
      primaryLighter: `rgba(${rgb},0.08)`,
      primaryTint: `rgba(${rgb},0.05)`,
      primaryGlow: `rgba(${rgb},0.25)`,
      gradientButton: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,

      surface: wc.surface,
      surfaceRaised: wc.surfaceRaised,
      background: wc.background,

      heading: wc.heading,
      body: wc.body,
      muted: wc.muted,
      subtle: wc.subtle,

      border: wc.border,
      borderLight: wc.borderLight,
      borderHover: wc.borderHover,

      success: colors.status.success,
      danger: colors.status.danger,
    },
    shadows: {
      card: '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
      button: `0 2px 8px rgba(${rgb},0.25)`,
      buttonHover: `0 4px 16px rgba(${rgb},0.35)`,
      focus: `0 0 0 3px rgba(${rgb},0.2)`,
      selected: `0 0 0 3px rgba(${rgb},0.15)`,
    },
    radius: {
      sm: radius.sm,
      md: radius.md,
      lg: radius.lg,
      xl: radius.xl,
    },
    typography: {
      fontFamily: overrides?.font || 'Inter, system-ui, sans-serif',
    },
    buttonStyle: overrides?.buttonStyle || 'rounded',
    surfaceVariant: overrides?.surfaceVariant || 'solid',
    logoUrl: overrides?.logoUrl || '',
  };
}
