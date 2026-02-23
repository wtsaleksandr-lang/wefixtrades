import { designTokens } from './designTokens';

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '5,150,105';
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `${r},${g},${b}`;
}

export function getEffectiveTheme(overrides?: any) {
  if (!overrides || Object.keys(overrides).length === 0) {
    return { ...designTokens };
  }

  const effectiveTheme: any = { ...designTokens };

  if (overrides.accent) {
    effectiveTheme.colors = {
      ...effectiveTheme.colors,
      primary: overrides.accent,
      primaryDark: overrides.accent,
      primaryLight: overrides.accent,
      primaryLighter: `rgba(${hexToRgb(overrides.accent)},0.08)`,
      primaryTint: `rgba(${hexToRgb(overrides.accent)},0.05)`,
      primaryGlow: `rgba(${hexToRgb(overrides.accent)},0.25)`,
      gradientStart: overrides.accent,
      gradientEnd: overrides.accent,
      gradientHeader: `linear-gradient(135deg, ${overrides.accent} 0%, ${overrides.accent}cc 100%)`,
      gradientButton: `linear-gradient(135deg, ${overrides.accent} 0%, ${overrides.accent}dd 100%)`,
    };
    effectiveTheme.shadows = {
      ...effectiveTheme.shadows,
      button: `0 2px 8px rgba(${hexToRgb(overrides.accent)},0.25)`,
      buttonHover: `0 4px 16px rgba(${hexToRgb(overrides.accent)},0.35)`,
      focus: `0 0 0 3px rgba(${hexToRgb(overrides.accent)},0.2)`,
      selected: `0 0 0 3px rgba(${hexToRgb(overrides.accent)},0.15)`,
    };
  }

  if (overrides.font) {
    effectiveTheme.typography = {
      ...effectiveTheme.typography,
      fontFamily: overrides.font,
    };
  }

  effectiveTheme.buttonStyle = overrides.buttonStyle || 'rounded';
  effectiveTheme.surfaceVariant = overrides.surfaceVariant || 'solid';

  if (overrides.radius) {
    const radiusMap: Record<string, string> = { sm: '8px', md: '12px', lg: '16px' };
    const radiusPx = radiusMap[overrides.radius] || radiusMap.md;
    effectiveTheme.radius = { sm: radiusPx, md: radiusPx, lg: radiusPx, xl: radiusPx };
  }

  effectiveTheme.logoUrl = overrides.logoUrl || '';
  return effectiveTheme;
}
