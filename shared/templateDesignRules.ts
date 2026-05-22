/**
 * Global template design rule v2 — the SINGLE SOURCE OF TRUTH for visual
 * decisions shared by every QuoteQuick template.
 *
 * This module exports pure helpers / tokens that every template (and the
 * renderer) consults so the catalogue stays visually consistent without each
 * template re-inventing its own colour, padding, and layout choices.
 *
 * Phase 1 (this PR) — defines the rule and applies it ONLY to the Window
 * Replacement Estimator reference template (`window_replacement_quote`).
 * Phase 2 will roll the rule across the rest of the catalogue.
 *
 * Design references: Elfsight catalogue cards + vivid per-category result
 * panels (deep teal for Home Improvement, navy for Finance, red for
 * Construction, etc.) and tight, scannable input layouts.
 */

/* ─── Category ids ─── */

/**
 * Machine-style category id used for design-rule lookups. The template
 * catalogue uses display-cased category strings (e.g. `'Home Improvement'`,
 * `'HVAC & Mechanical'`); `categoryIdFromDisplay()` below maps either form
 * into a `CategoryId` so callers don't need to remember the conversion.
 */
export type CategoryId =
  | 'construction'
  | 'finance'
  | 'automotive'
  | 'cleaning'
  | 'homeImprovement'
  | 'emergency'
  | 'outdoor'
  | 'professional'
  | 'default';

/**
 * Result-card palette (Elfsight-inspired). Each entry is a vivid background +
 * white text + an accent used for value pills, primary CTAs, and ring focus
 * states. These ship templates with a high-contrast, branded result panel
 * without each template needing to declare its own colours.
 */
export const RESULT_CARD_BG: Record<CategoryId, { bg: string; text: string; accent: string }> = {
  construction:    { bg: '#B91C1C', text: '#ffffff', accent: '#FCD34D' }, // deep red
  finance:         { bg: '#1E3A8A', text: '#ffffff', accent: '#60A5FA' }, // navy
  automotive:      { bg: '#0F172A', text: '#ffffff', accent: '#FB923C' }, // black + orange
  cleaning:        { bg: '#047857', text: '#ffffff', accent: '#34D399' }, // emerald
  homeImprovement: { bg: '#0F4A52', text: '#ffffff', accent: '#5EEAD4' }, // teal
  emergency:       { bg: '#B45309', text: '#ffffff', accent: '#FCD34D' }, // amber
  outdoor:         { bg: '#15803D', text: '#ffffff', accent: '#86EFAC' }, // green
  professional:    { bg: '#5B21B6', text: '#ffffff', accent: '#C4B5FD' }, // purple
  default:         { bg: '#1E40AF', text: '#ffffff', accent: '#60A5FA' }, // blue
};

/**
 * Normalise a display-cased category string (as stored on `TemplateConfig`)
 * into the rule's `CategoryId`. Unknown values fall back to `'default'` so
 * the renderer never receives an undefined palette.
 */
export function categoryIdFromDisplay(category: string | undefined): CategoryId {
  const norm = (category ?? '').trim().toLowerCase();
  if (!norm) return 'default';
  if (norm.startsWith('home')) return 'homeImprovement';
  if (norm.startsWith('construction')) return 'construction';
  if (norm.startsWith('automotive')) return 'automotive';
  if (norm.startsWith('cleaning')) return 'cleaning';
  if (norm.startsWith('emergency') || norm.startsWith('restoration')) return 'emergency';
  if (norm.startsWith('outdoor')) return 'outdoor';
  if (
    norm.startsWith('professional') ||
    norm.startsWith('photography') ||
    norm.startsWith('moving')
  ) return 'professional';
  if (norm.startsWith('finance')) return 'finance';
  return 'default';
}

/**
 * Convenience accessor — palette lookup by display-cased category string.
 * Templates almost always call this rather than `RESULT_CARD_BG` directly so
 * the renderer doesn't need to import `categoryIdFromDisplay()` everywhere.
 */
export function resultCardPalette(category: string | undefined): { bg: string; text: string; accent: string } {
  return RESULT_CARD_BG[categoryIdFromDisplay(category)];
}

/* ─── Layout heuristics ─── */

/**
 * Pick the renderer's stepper mode based on input field count. A template
 * with 4+ fields converts better as a multi-step flow (research: ~3x lift
 * vs single page); fewer fields stay single-step.
 */
export function recommendStepperMode(fieldCount: number): 'single' | 'multi' {
  return fieldCount >= 4 ? 'multi' : 'single';
}

/**
 * Pick the column layout for the input/result region. Single column when
 * there is no result panel at all, or fewer than three input fields; two
 * columns otherwise so the result panel has room to live side-by-side.
 */
export function recommendColumnLayout(fieldCount: number, hasResultPanel: boolean): '1col' | '2col' {
  if (!hasResultPanel) return '1col';
  return fieldCount >= 3 ? '2col' : '1col';
}

/* ─── Card / panel style tokens ─── */

/**
 * Shared card-style tokens. Used by every template's outer/inner card so
 * radii, padding, and the subtle hairline border are consistent across the
 * catalogue. Numbers are in pixels.
 */
export const TEMPLATE_CARD_STYLE = {
  outerRadius: 16,
  innerRadius: 12,
  outerPadding: 24,
  innerPadding: 16,
  hairlineColor: 'rgba(0,0,0,0.06)',
} as const;
