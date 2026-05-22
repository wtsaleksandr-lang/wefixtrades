/**
 * Wave AO-6b — Style tab preset themes.
 *
 * One-click bundles of every `ShellStyle` token (colours + shape + typography
 * + density + logo placement defaults). Clicking a preset in the Style tab
 * overwrites the user's current Style state — they can still customise after.
 *
 * Each preset is a FULL `ShellStyle` object so applying one resets the state
 * to a known baseline (no partial merges, no stale fields from a previous
 * preset). Where a token doesn't need to differ from the brand default
 * (`DEFAULT_ADV_STYLE`) we still list it explicitly so the preset is
 * self-documenting.
 */

import type { AdvStyle } from '@shared/templatePresets';

/** Stable id + label rendered on the preset card. */
export interface QuoteQuickStylePreset {
  /** Stable id — survives renames; used as the React key. */
  id: string;
  /** Visible label on the card. */
  name: string;
  /** One-line description, surfaced as a card tooltip. */
  description: string;
  /** Full `ShellStyle` payload applied on click. */
  style: AdvStyle;
}

export const QUOTEQUICK_STYLE_PRESETS: ReadonlyArray<QuoteQuickStylePreset> = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'White surface, slate text, blue accent, hairline borders.',
    style: {
      accent: '#2563eb',
      background: '#ffffff',
      text: '#0f172a',
      resultsBg: '#ffffff',
      secondary: '#64748b',
      surface: '#ffffff',
      border: '#e5e7eb',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'outline',
      radius: 8,
      widgetWidth: 'wide',
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
  {
    id: 'soft',
    name: 'Soft',
    description: 'Cream surface, warm-brown text, sage accent, rounded.',
    style: {
      accent: '#84a98c',
      background: '#faf6ef',
      text: '#5a4633',
      resultsBg: '#f5efe3',
      secondary: '#b08968',
      surface: '#fffaf2',
      border: '#e9dfd0',
      success: '#52796f',
      error: '#bc4749',
      fontFamily: 'manrope',
      fieldStyle: 'filled',
      radius: 12,
      widgetWidth: 'wide',
      headingWeight: 600,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Slate-900 surface, electric-blue accent, sharp corners.',
    style: {
      accent: '#3b82f6',
      background: '#0f172a',
      text: '#f8fafc',
      resultsBg: '#1e293b',
      secondary: '#94a3b8',
      surface: '#1e293b',
      border: '#334155',
      success: '#22c55e',
      error: '#ef4444',
      fontFamily: 'satoshi',
      fieldStyle: 'outline',
      radius: 0,
      widgetWidth: 'wide',
      headingWeight: 800,
      bodyWeight: 500,
      fontSize: 'medium',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Pure dark mode, deep-grey surfaces, neon accent.',
    style: {
      accent: '#22d3ee',
      background: '#0a0a0a',
      text: '#fafafa',
      resultsBg: '#171717',
      secondary: '#a3a3a3',
      surface: '#171717',
      border: '#262626',
      success: '#4ade80',
      error: '#f87171',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 8,
      widgetWidth: 'wide',
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Frosted off-white, low-opacity borders, indigo accent.',
    style: {
      accent: '#6366f1',
      background: '#f8fafc',
      text: '#1e1b4b',
      resultsBg: '#eef2ff',
      secondary: '#818cf8',
      surface: '#ffffff',
      border: '#e0e7ff',
      success: '#10b981',
      error: '#f43f5e',
      fontFamily: 'jakarta',
      fieldStyle: 'outline',
      radius: 16,
      widgetWidth: 'wide',
      headingWeight: 600,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
  {
    id: 'trade',
    name: 'Trade',
    description: 'Neutral grey + safety-orange, contractor-credible.',
    style: {
      accent: '#f97316',
      background: '#f5f5f4',
      text: '#1c1917',
      resultsBg: '#ffffff',
      secondary: '#57534e',
      surface: '#ffffff',
      border: '#d6d3d1',
      success: '#15803d',
      error: '#b91c1c',
      fontFamily: 'system',
      fieldStyle: 'filled',
      radius: 4,
      widgetWidth: 'wide',
      headingWeight: 700,
      bodyWeight: 500,
      fontSize: 'medium',
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Black surface, gold accent, serif heading — luxury feel.',
    style: {
      accent: '#c9a44c',
      background: '#000000',
      text: '#f5f5f4',
      resultsBg: '#1c1917',
      secondary: '#a8a29e',
      surface: '#0c0a09',
      border: '#292524',
      success: '#a3e635',
      error: '#fb7185',
      fontFamily: 'plex',
      fieldStyle: 'outline',
      radius: 0,
      widgetWidth: 'wide',
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
  {
    // BD-3e Fix 2 — `resultsBg` was `#cffafe` (pastel cyan, starts with
    // `c`). AdvancedCalculator.applyStyleOverrides flags only first-char
    // `e`/`f` hexes as "light", so Coastal's resultsBg fell through to the
    // dark branch and the headline price rendered white instead of the
    // dark-green `text` token the thumbnail advertises. Nudging the
    // resultsBg one step lighter (`#e3fafe`) keeps the soft-sky look while
    // letting the existing light-detect pass so `resultText = text`.
    id: 'coastal',
    name: 'Coastal',
    description: 'Soft-sky surface, deep-teal accent, breezy feel.',
    style: {
      accent: '#0d9488',
      background: '#ecfeff',
      text: '#0f5132',
      resultsBg: '#e3fafe',
      secondary: '#0891b2',
      surface: '#ffffff',
      border: '#a5f3fc',
      success: '#059669',
      error: '#e11d48',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 14,
      widgetWidth: 'wide',
      headingWeight: 600,
      bodyWeight: 400,
      fontSize: 'medium',
    },
  },
];

/** Lookup by id — returns undefined for unknown ids (no fallback). */
export function getStylePresetById(id: string | undefined): QuoteQuickStylePreset | undefined {
  if (!id) return undefined;
  return QUOTEQUICK_STYLE_PRESETS.find((p) => p.id === id);
}
