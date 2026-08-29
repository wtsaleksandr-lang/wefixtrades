/**
 * SiteLaunch — colour maths for brand-driven theming.
 *
 * A customer's brand colour arrives from a `brand_kits` row or from
 * `clients.metadata.content_brand` and is unconstrained: it can be near-white,
 * near-black, neon, or a colour that fails contrast against every surface in
 * the theme. The renderer must never emit a page where the CTA label is
 * illegible on the CTA fill, so every derived token (hover, tint, on-accent
 * ink) is COMPUTED here rather than hand-picked per theme.
 *
 * Deliberately dependency-free — no `node-vibrant` / `color-thief`. This file
 * does not extract a palette from a logo image; it only derives a coherent,
 * contrast-checked ramp from an already-known base colour.
 *
 * All functions are pure and total: an unparseable input falls back rather
 * than throwing, because a bad hex in a customer record must not 500 a page.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse `#rgb` / `#rrggbb` (with or without `#`). Returns null when invalid. */
export function parseHex(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `rgba(r, g, b, a)` — used for tints and overlays where a flat hex would
 *  lose the underlying surface. */
export function rgba(c: Rgb, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${clamp255(c.r)}, ${clamp255(c.g)}, ${clamp255(c.b)}, ${Number(a.toFixed(3))})`;
}

/** WCAG relative luminance. */
export function luminance(c: Rgb): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear blend: `amount` 0 → a, 1 → b. */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/* Near-white / near-black anchors. Deliberately NOT pure #ffffff / #000000:
 * pure black text on pure white is harsh at large type sizes, and every
 * theme here uses a slightly warmed or cooled anchor instead. */
const LIGHT_ANCHOR: Rgb = { r: 253, g: 253, b: 252 };
const DARK_ANCHOR: Rgb = { r: 17, g: 20, b: 24 };

export function lighten(c: Rgb, amount: number): Rgb {
  return mix(c, LIGHT_ANCHOR, amount);
}

export function darken(c: Rgb, amount: number): Rgb {
  return mix(c, DARK_ANCHOR, amount);
}

/**
 * Pick the readable ink for text sitting ON `bg`, choosing between the
 * theme's own light and dark ink rather than a generic white/black. When
 * neither clears 4.5:1 the better of the two is pushed further until it does
 * (or until it bottoms out), so the result is always the most legible option
 * available — never a silently-failing one.
 */
export function readableInk(bg: Rgb, lightInk: Rgb, darkInk: Rgb): Rgb {
  const lightRatio = contrastRatio(bg, lightInk);
  const darkRatio = contrastRatio(bg, darkInk);
  const best = lightRatio >= darkRatio ? lightInk : darkInk;
  const bestRatio = Math.max(lightRatio, darkRatio);
  if (bestRatio >= 4.5) return best;

  // Push the winner away from the background in 8 steps until it passes.
  const towards = lightRatio >= darkRatio ? LIGHT_ANCHOR : DARK_ANCHOR;
  let candidate = best;
  for (let i = 1; i <= 8; i++) {
    candidate = mix(best, towards, i / 8);
    if (contrastRatio(bg, candidate) >= 4.5) return candidate;
  }
  return candidate;
}

/**
 * Given a raw brand colour, produce an accent that is usable as a solid
 * button fill. A near-white or near-black brand colour is nudged into a
 * legible range instead of being rendered as-is (an invisible CTA is the
 * single most common failure of naive brand theming).
 */
export function usableAccent(raw: Rgb): Rgb {
  const lum = luminance(raw);
  if (lum > 0.72) return darken(raw, 0.45); // too pale to hold white-ish text
  if (lum < 0.035) return lighten(raw, 0.22); // effectively black — lift it
  return raw;
}

/** Full derived accent ramp for a brand colour. */
export interface AccentRamp {
  base: string;
  hover: string;
  active: string;
  /** Very light wash for section bands and badge fills. */
  tint: string;
  /** Slightly stronger wash for borders on tinted surfaces. */
  tintStrong: string;
  /** Ink that is legible on `base`. */
  onBase: string;
  /** Focus ring colour (translucent base). */
  ring: string;
}

export function buildAccentRamp(rawHex: string, fallbackHex: string, lightInkHex: string, darkInkHex: string): AccentRamp {
  const parsed = parseHex(rawHex) ?? parseHex(fallbackHex) ?? { r: 13, g: 60, b: 252 };
  const base = usableAccent(parsed);
  const lightInk = parseHex(lightInkHex) ?? LIGHT_ANCHOR;
  const darkInk = parseHex(darkInkHex) ?? DARK_ANCHOR;
  return {
    base: toHex(base),
    hover: toHex(darken(base, 0.14)),
    active: toHex(darken(base, 0.26)),
    tint: rgba(base, 0.08),
    tintStrong: rgba(base, 0.22),
    onBase: toHex(readableInk(base, lightInk, darkInk)),
    ring: rgba(base, 0.35),
  };
}
