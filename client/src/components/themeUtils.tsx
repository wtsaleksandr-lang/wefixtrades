import { designTokens } from './designTokens';

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '13,148,136';
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
      primaryLight: `rgba(${hexToRgb(overrides.accent)},0.08)`,
      primaryLighter: `rgba(${hexToRgb(overrides.accent)},0.03)`,
      primaryShadow: `rgba(${hexToRgb(overrides.accent)},0.25)`,
      primaryHover: `rgba(${hexToRgb(overrides.accent)},0.1)`,
    };
    effectiveTheme.shadows = {
      ...effectiveTheme.shadows,
      md: `0 8px 20px rgba(${hexToRgb(overrides.accent)},0.12)`,
      hover: `0 12px 35px rgba(${hexToRgb(overrides.accent)},0.3)`,
      focus: `0 10px 30px rgba(${hexToRgb(overrides.accent)},0.25)`,
      button: `0 6px 20px rgba(${hexToRgb(overrides.accent)},0.25)`,
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
