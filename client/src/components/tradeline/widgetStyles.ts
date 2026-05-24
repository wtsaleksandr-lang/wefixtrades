/**
 * TradeLine chat-widget visual style presets.
 *
 * Each preset is a small bundle of token-sourced CSS-variable overrides that
 * the `TradeLineHeroPhone` component reads (`--tlhp-accent`, `--tlhp-paper`,
 * `--tlhp-ink`, etc). Picking a preset in the portal customizer updates the
 * stored `accent_color` (the one persisted field today); the rest of the
 * variables are purely visual and only affect the live preview surface.
 *
 * No new hex literals — all colors come from `mkt` and `colors.*` tokens.
 */

import { mkt, colors } from "@/theme/tokens";

export interface TradelineWidgetStyle {
  /** Stable id — used as picker key + selection state. */
  id: string;
  /** Short display name shown in the picker row + modal header. */
  name: string;
  /** One-line description for the picker row. */
  description: string;
  /** Persisted accent color when this style is applied. */
  accentColor: string;
  /**
   * CSS-variable overrides applied to the `.tlhp-wrap` of the previewed
   * widget. Only `--tlhp-*` vars defined in `TradeLineHeroPhone` are honored.
   */
  cssVars: Record<string, string>;
}

/**
 * Curated set — 5 distinct visual treatments built from brand tokens:
 *   1. Classic Blue — default brand
 *   2. Midnight     — dark surface, brand-blue accent
 *   3. Sunrise      — orange accent on white (status.warning-adjacent)
 *   4. Emerald      — success-green accent
 *   5. Mono Ink     — minimal black/white, no accent color
 */
export const TRADELINE_WIDGET_STYLES: TradelineWidgetStyle[] = [
  {
    id: "classic-blue",
    name: "Classic Blue",
    description: "Default brand — blue accent on white.",
    accentColor: colors.platform.accent,
    cssVars: {
      "--tlhp-accent": colors.platform.accent,
      "--tlhp-accent-hover": colors.platform.accentDark,
      "--tlhp-accent-glow": colors.platform.accentGlow,
      "--tlhp-accent-ring": colors.platform.accentTint,
      "--tlhp-paper": colors.platform.surface,
      "--tlhp-ink": mkt.bgBase,
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Dark slate surface with brand-blue accent.",
    accentColor: colors.platform.accent,
    cssVars: {
      "--tlhp-accent": colors.platform.accent,
      "--tlhp-accent-hover": colors.platform.accentLight,
      "--tlhp-accent-glow": colors.platform.accentGlow,
      "--tlhp-accent-ring": colors.platform.accentTint,
      "--tlhp-paper": colors.effortel.n800,
      "--tlhp-ink": colors.effortel.n100,
      "--tlhp-canvas": colors.effortel.n900,
      "--tlhp-canvas-dot": "rgba(255,255,255,0.06)",
    },
  },
  {
    id: "sunrise",
    name: "Sunrise",
    description: "Warm orange accent — high-energy CTA feel.",
    accentColor: colors.accent.orange,
    cssVars: {
      "--tlhp-accent": colors.accent.orange,
      "--tlhp-accent-hover": colors.status.warning,
      "--tlhp-accent-glow": colors.accent.orangeTint,
      "--tlhp-accent-ring": colors.accent.orangeTint,
      "--tlhp-paper": colors.platform.surface,
      "--tlhp-ink": mkt.bgBase,
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Calm green accent — trust + reassurance.",
    accentColor: colors.status.success,
    cssVars: {
      "--tlhp-accent": colors.status.success,
      "--tlhp-accent-hover": colors.status.success,
      "--tlhp-accent-glow": "rgba(16,185,129,0.20)",
      "--tlhp-accent-ring": colors.status.successLight,
      "--tlhp-paper": colors.platform.surface,
      "--tlhp-ink": mkt.bgBase,
    },
  },
  {
    id: "mono-ink",
    name: "Mono Ink",
    description: "Minimal black-on-white. No accent color.",
    accentColor: mkt.bgBase,
    cssVars: {
      "--tlhp-accent": mkt.bgBase,
      "--tlhp-accent-hover": colors.effortel.n800,
      "--tlhp-accent-glow": "rgba(22,22,22,0.18)",
      "--tlhp-accent-ring": "rgba(22,22,22,0.10)",
      "--tlhp-paper": colors.platform.surface,
      "--tlhp-ink": mkt.bgBase,
    },
  },
];

export function findTradelineWidgetStyle(id: string | null | undefined): TradelineWidgetStyle | undefined {
  if (!id) return undefined;
  return TRADELINE_WIDGET_STYLES.find((s) => s.id === id);
}
