/**
 * Themeable colour palettes for the QuoteQuick advanced calculator widget.
 *
 * A theme only recolours the widget — structural tokens (radii, fonts,
 * spacing) stay in designTokens.ts. Templates carry a theme id; the widget
 * resolves it to a palette and renders against it instead of fixed slate-grey.
 */

export interface WidgetTheme {
  id: string;
  name: string;
  /** Calculator body background — the canvas the inputs sit on. */
  bg: string;
  /** Card surface — title bar, input fields, the result panel base. */
  surface: string;
  /** Primary text. */
  text: string;
  /** Secondary text. */
  textBody: string;
  /** Tertiary / hint text. */
  textMuted: string;
  /** Dividers and input borders. */
  border: string;
  /** Fallback accent when the owner hasn't set a brand colour. */
  accent: string;
  /** Soft accent wash — selected option backgrounds. */
  accentTint: string;
  /** Result-panel background. */
  result: string;
  /** Result-panel headline / values. */
  resultText: string;
  /** Result-panel secondary text. */
  resultMuted: string;
  /** Card shadow. */
  shadow: string;
}

const SHADOW_LIGHT = '0 12px 40px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)';
const SHADOW_DARK = '0 12px 40px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.26)';

export const WIDGET_THEMES: Record<string, WidgetTheme> = {
  light: {
    id: 'light', name: 'Light',
    bg: '#eef1f6', surface: '#ffffff',
    text: '#0f172a', textBody: '#5b6573', textMuted: '#94a3b8', border: '#e1e7ef',
    accent: '#0d3cfc', accentTint: 'rgba(13,60,252,0.08)',
    result: '#ffffff', resultText: '#0f172a', resultMuted: '#94a3b8',
    shadow: SHADOW_LIGHT,
  },
  midnight: {
    id: 'midnight', name: 'Midnight',
    bg: '#161a23', surface: '#232834',
    text: '#f1f5f9', textBody: '#aab3c0', textMuted: '#7c8696', border: '#353c4a',
    accent: '#5b8cff', accentTint: 'rgba(255,255,255,0.07)',
    result: '#ef6b5e', resultText: '#ffffff', resultMuted: 'rgba(255,255,255,0.82)',
    shadow: SHADOW_DARK,
  },
  coral: {
    id: 'coral', name: 'Coral',
    bg: '#fff5f3', surface: '#ffffff',
    text: '#2b1d1a', textBody: '#7a6660', textMuted: '#b3a09a', border: '#f3ddd7',
    accent: '#ef6b5e', accentTint: 'rgba(239,107,94,0.10)',
    result: '#ef6b5e', resultText: '#ffffff', resultMuted: 'rgba(255,255,255,0.85)',
    shadow: SHADOW_LIGHT,
  },
  forest: {
    id: 'forest', name: 'Forest',
    bg: '#eef3ec', surface: '#ffffff',
    text: '#1d2b1a', textBody: '#5c6b56', textMuted: '#93a08c', border: '#dde6d8',
    accent: '#3f9d52', accentTint: 'rgba(63,157,82,0.10)',
    result: '#2f3e2c', resultText: '#ffffff', resultMuted: 'rgba(255,255,255,0.80)',
    shadow: SHADOW_LIGHT,
  },
  mint: {
    id: 'mint', name: 'Mint',
    bg: '#e3f3ef', surface: '#ffffff',
    text: '#14322c', textBody: '#557068', textMuted: '#8aa39b', border: '#cfe7e0',
    accent: '#0ea5a3', accentTint: 'rgba(14,165,163,0.10)',
    result: '#0ea5a3', resultText: '#ffffff', resultMuted: 'rgba(255,255,255,0.85)',
    shadow: SHADOW_LIGHT,
  },
  magenta: {
    id: 'magenta', name: 'Magenta',
    bg: '#fdf0f6', surface: '#ffffff',
    text: '#3a1228', textBody: '#8a5e74', textMuted: '#bd97aa', border: '#f3d6e4',
    accent: '#c0186b', accentTint: 'rgba(192,24,107,0.10)',
    result: '#c0186b', resultText: '#ffffff', resultMuted: 'rgba(255,255,255,0.85)',
    shadow: SHADOW_LIGHT,
  },
};

export const WIDGET_THEME_LIST: WidgetTheme[] = Object.values(WIDGET_THEMES);

/**
 * Resolve a theme id into a palette. Unknown ids fall back to `light`. When the
 * owner has set a brand colour it overrides the theme's accent, so interactive
 * elements stay on-brand while the theme controls surfaces and the result panel.
 */
export function resolveWidgetTheme(themeId: string | undefined, accentColor?: string): WidgetTheme {
  const base = (themeId && WIDGET_THEMES[themeId]) || WIDGET_THEMES.light;
  return accentColor ? { ...base, accent: accentColor } : base;
}
