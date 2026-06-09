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
 *
 * ── W5 — match the website theme set ──────────────────────────────────
 * The marketing template pages (`client/src/pages/marketing/template-detail
 * .tsx`) let visitors pick from the SAME 13 `THEME_COMBOS`
 * (`shared/templatePresets.ts`) the wizard's Style tab should offer. Before
 * W5 the wizard shipped 8 hand-rolled presets (Minimal/Soft/Bold/Dark/Glass/
 * Trade/Premium/Coastal) that didn't correspond to ANY of the website's
 * themes, so a user who picked "Crimson" or "Navy" on the marketing page
 * couldn't find it in the builder. We now DERIVE every wizard preset from
 * `THEME_COMBOS` so the two surfaces can never drift: same ids, same names,
 * same colours. Each combo encodes only the colour slots (bg/text/surface/
 * border/resultsBg/accent/ctaColor — see `comboToStyleColors`); the wizard
 * preset layers a sensible, consistent set of shape / typography / density
 * tokens on top so `StyleTab.applyPreset` always receives a full valid
 * `ShellStyle`.
 */

import {
  THEME_COMBOS,
  comboToStyleColors,
  type AdvStyle,
} from '@shared/templatePresets';

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

/**
 * Shape / typography / density tokens layered onto every theme. The website
 * combos only carry colour, so we apply ONE consistent, modern baseline for
 * the non-colour tokens across all 13 themes. This keeps the Style tab grid
 * predictable (picking a theme changes the palette, not the corner radius or
 * the font) and matches the marketing previews, which render every combo with
 * the same neutral shell.
 */
const COMBO_SHELL_BASE = {
  secondary: '#64748b',
  success: '#16a34a',
  error: '#dc2626',
  fontFamily: 'inter',
  fieldStyle: 'filled',
  radius: 12,
  widgetWidth: 'wide',
  headingWeight: 700,
  bodyWeight: 400,
  fontSize: 'medium',
} as const satisfies Partial<AdvStyle>;

/** Per-theme one-line descriptions (tooltip copy). Keyed by combo id so a
 *  new combo without an entry still renders with a generic fallback. */
const COMBO_DESCRIPTIONS: Record<string, string> = {
  'black-yellow': 'Faint graphite-tinted body, black result panel, high-vis yellow CTA.',
  'car-rental': 'Soft crimson-tinted body, crimson result panel + accent, near-black CTA.',
  'mortgage': 'Soft sky-tinted body, sky-tint result panel, blue accent + CTA.',
  'loan': 'Faint red-tinted body, onyx result panel, signal-red accent + CTA.',
  'emi': 'Soft azure-tinted body, azure result panel + accent, dark CTA.',
  'bmi': 'Soft mint-tinted body, mint-tint result panel, green accent + CTA.',
  'profit': 'Soft forest-tinted body, forest-green result panel + accent, dark CTA.',
  'fees': 'Soft blue-tinted body, deep-navy result panel, blue accent + CTA.',
  'reno': 'Warm amber-tinted body, olive result panel, warm-orange accent + CTA.',
  'tshirt': 'Soft violet-tinted body, violet result panel + accent, dark CTA.',
  'wedding': 'Soft royal-blue-tinted body, royal-blue result panel, orange CTA.',
  'carbon': 'Soft teal-tinted body, teal result panel + accent, dark CTA.',
  'cake': 'Soft blush-tinted body, blush result panel, pink accent + CTA.',
};

/**
 * The wizard preset list — DERIVED from the website's `THEME_COMBOS` so the
 * Style tab always offers exactly the themes a visitor sees on the marketing
 * template pages. The colour slots come straight from `comboToStyleColors`
 * (the same mapper the renderer uses); the shape/typography/density tokens
 * come from `COMBO_SHELL_BASE`.
 */
export const QUOTEQUICK_STYLE_PRESETS: ReadonlyArray<QuoteQuickStylePreset> =
  THEME_COMBOS.map((combo) => ({
    id: combo.id,
    name: combo.name,
    description: COMBO_DESCRIPTIONS[combo.id] ?? `${combo.name} theme.`,
    style: {
      ...COMBO_SHELL_BASE,
      ...comboToStyleColors(combo),
    },
  }));

/** Lookup by id — returns undefined for unknown ids (no fallback). */
export function getStylePresetById(id: string | undefined): QuoteQuickStylePreset | undefined {
  if (!id) return undefined;
  return QUOTEQUICK_STYLE_PRESETS.find((p) => p.id === id);
}
