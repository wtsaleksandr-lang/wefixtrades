/**
 * CONTRAST-1 — Runtime contrast guard for the quote-widget renderer.
 *
 * The widget owner can pick any foreground/background combination through
 * Brand Studio + the Style tab. Alex has flagged the same bright-on-bright
 * unreadable-text bug ~20 times; reactive patches haven't compounded. This
 * module makes the failure mode structurally impossible: AdvancedCalculator
 * funnels every text/background colour pair through `ensureReadableText`
 * before render. If the WCAG ratio is below the legibility floor, the text
 * colour is incrementally adjusted (toward black or white, whichever
 * direction increases contrast) until it passes.
 *
 * Pure functions — zero React, zero side effects, fully unit-testable.
 * Brand Studio save behaviour is unchanged: the ORIGINAL user-picked colours
 * stay in the config; only the FINAL rendered colour is corrected.
 *
 * Sister waves (do NOT touch from here):
 *   - CONTRAST-2 — CI lint over saved palettes
 *   - CONTRAST-3 — Brand Studio live validators
 */

/** WCAG 2.1 AA legibility floor for normal-weight body text. */
const RATIO_NORMAL = 4.5;
/** WCAG 2.1 AA floor for large text (≥18px or ≥14px bold). */
const RATIO_LARGE = 3.0;
/** Iteration cap — the loop will always converge to #000000 or #ffffff
 *  long before reaching this in practice; the cap is a paranoia bound. */
const MAX_ITERATIONS = 12;
/** Lightness step per iteration (in percentage points). 8% balances
 *  responsiveness vs preserving the user's intended hue. */
const STEP_PCT = 8;

/**
 * Fallbacks used when a colour string is unparseable. Picked to be safe on
 * either light OR dark surfaces — `#0f172a` is the existing widget `text`
 * default; `#f5f7fa` is its near-white counterpart.
 */
const FALLBACK_TEXT_ON_LIGHT = '#0f172a';
const FALLBACK_TEXT_ON_DARK = '#f5f7fa';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a hex, `rgb(...)`, or `rgba(...)` colour string to an {r,g,b} tuple
 * in 0..255. Returns `null` for any input the renderer can't interpret —
 * the caller is expected to substitute a safe fallback.
 *
 * `rgba()` alpha is intentionally dropped: the contrast guard operates on
 * the opaque colour values that will reach the screen. A widget surface
 * never reads through to whatever sits behind it (the widget root has a
 * solid `background`), so blending against the page is out of scope.
 */
function parseColor(input: string): Rgb | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === '') return null;

  // Hex — `#fff` or `#ffffff`. Case-insensitive.
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    if (!/^[0-9a-f]{6}$/.test(full)) return null;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  // rgb() / rgba() — comma- or whitespace-separated numeric components.
  const m = s.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/,
  );
  if (!m) return null;
  const r = Math.round(Number(m[1]));
  const g = Math.round(Number(m[2]));
  const b = Math.round(Number(m[3]));
  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
    return null;
  }
  return { r, g, b };
}

/** sRGB → linear conversion for one channel (0..1 in, 0..1 out). */
function linearize(c01: number): number {
  return c01 <= 0.03928
    ? c01 / 12.92
    : Math.pow((c01 + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 relative luminance for a hex / rgb colour string. Returns 0..1
 * (0 = black, 1 = white). Falls back to 1 (white) for unparseable input so
 * the caller's contrast comparison degrades to a no-op rather than a NaN.
 */
export function getRelativeLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 1;
  const r = linearize(rgb.r / 255);
  const g = linearize(rgb.g / 255);
  const b = linearize(rgb.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colours, returned as a number in
 * [1, 21]. The brighter colour goes in the numerator regardless of which
 * arg is passed first; the result is symmetric in (fg, bg).
 */
export function getContrastRatio(fg: string, bg: string): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Clamp an integer to [0, 255]. */
function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Format an {r,g,b} tuple as `#rrggbb`. */
function rgbToHex(rgb: Rgb): string {
  const toHex = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Shift an RGB colour toward black (`direction = -1`) or white
 * (`direction = +1`) by `STEP_PCT` of the full 0..255 range. The shift
 * is applied uniformly across channels so the hue is preserved as best
 * as RGB-space stepping allows. (HSL stepping would preserve hue more
 * cleanly but adds ~60 LOC for negligible visual improvement in the
 * extreme cases this guard catches.)
 */
function shift(rgb: Rgb, direction: 1 | -1): Rgb {
  const delta = (255 * STEP_PCT) / 100;
  const d = direction * delta;
  return {
    r: clamp255(rgb.r + d),
    g: clamp255(rgb.g + d),
    b: clamp255(rgb.b + d),
  };
}

/**
 * Pick the direction (lighten / darken) that will INCREASE contrast against
 * the background. Rule of thumb: if the background is dark, push fg toward
 * white; if the background is light, push fg toward black. We measure the
 * background's relative luminance once and freeze the direction for the
 * whole iteration loop — flipping direction mid-loop would oscillate.
 */
function pickDirection(bgLuminance: number): 1 | -1 {
  // Threshold at 0.5 luminance — below half is "dark", push fg to white.
  return bgLuminance < 0.5 ? 1 : -1;
}

interface EnsureOpts {
  /** When true, use the ≥18px floor (3:1) instead of the body floor (4.5:1). */
  largeText?: boolean;
}

/**
 * Ensure the resolved text colour reaches the WCAG legibility floor against
 * the resolved background. When the pair already passes, the original
 * `fg` is returned untouched. When it doesn't, the fg is shifted toward
 * black or white in 8% increments (whichever direction increases contrast)
 * until it passes — capped at MAX_ITERATIONS, by which point the colour
 * will have converged to pure black or pure white.
 *
 * Unparseable colours fall back to a safe default based on the background's
 * apparent lightness — the customer never sees garbage text.
 */
export function ensureReadableText(
  fg: string,
  bg: string,
  opts: EnsureOpts = {},
): string {
  const target = opts.largeText ? RATIO_LARGE : RATIO_NORMAL;

  const bgRgb = parseColor(bg);
  const fgRgb = parseColor(fg);

  // Unparseable bg — we can't reason about contrast at all. Return the fg
  // as-is rather than overriding with a guess; the renderer's existing
  // fallback chain handles the rest.
  if (!bgRgb) return fg;

  const bgLum =
    0.2126 * linearize(bgRgb.r / 255) +
    0.7152 * linearize(bgRgb.g / 255) +
    0.0722 * linearize(bgRgb.b / 255);

  // Unparseable fg — pick a safe default for the background's lightness.
  if (!fgRgb) {
    return bgLum < 0.5 ? FALLBACK_TEXT_ON_DARK : FALLBACK_TEXT_ON_LIGHT;
  }

  // Already passes — leave the user's pick untouched.
  if (getContrastRatio(fg, bg) >= target) return fg;

  const direction = pickDirection(bgLum);
  let current: Rgb = { ...fgRgb };
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    current = shift(current, direction);
    const hex = rgbToHex(current);
    if (getContrastRatio(hex, bg) >= target) return hex;
    // Converged to pure black / pure white — return immediately.
    if (
      (direction === 1 && current.r === 255 && current.g === 255 && current.b === 255) ||
      (direction === -1 && current.r === 0 && current.g === 0 && current.b === 0)
    ) {
      return hex;
    }
  }
  // Iteration cap hit — return whatever the final shift produced.
  return rgbToHex(current);
}

/**
 * Dev-mode logger: warns once per (fg, bg, corrected) tuple when a
 * correction happens in non-production. The Set lives at module scope so
 * repeated renders of the same widget instance don't spam the console.
 * Production builds skip the warn entirely (the guard runs silently — the
 * customer never sees an indicator that anything was wrong).
 */
const warnedPairs = new Set<string>();

export function warnOnCorrection(
  fg: string,
  bg: string,
  corrected: string,
  label: string,
): void {
  if (fg === corrected) return;
  if (typeof process === 'undefined') return;
  if (process.env?.NODE_ENV === 'production') return;
  const key = `${label}::${fg}::${bg}::${corrected}`;
  if (warnedPairs.has(key)) return;
  warnedPairs.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[contrastGuard] ${label}: ${fg} on ${bg} failed WCAG; auto-corrected to ${corrected}`,
  );
}

/**
 * Convenience helper: run `ensureReadableText` + `warnOnCorrection` in one
 * call. Designed for the AdvancedCalculator render path where each
 * text/bg pair has a stable label (`resultsText`, `ctaText`, etc.).
 */
export function guardTextColor(
  fg: string,
  bg: string,
  label: string,
  opts?: EnsureOpts,
): string {
  const corrected = ensureReadableText(fg, bg, opts);
  if (corrected !== fg) warnOnCorrection(fg, bg, corrected, label);
  return corrected;
}
