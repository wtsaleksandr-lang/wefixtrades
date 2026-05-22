/**
 * Advanced (custom-built) calculator — the customer-facing runtime for
 * `calculator_settings.advanced`.
 *
 * Layout follows Elfsight's calculator (centred title, inputs alongside a
 * standing result panel, sliders with a value pill). Colours come from a
 * resolved `WidgetTheme` (see widgetThemes.ts) so templates can carry a look;
 * structural tokens (radii, fonts) stay in designTokens.
 *
 * Phases 1c / 2 / visual-parity / theming of the advanced-builder epic.
 */
import { useEffect, useMemo, useState } from 'react';
import { runCalculations, type FormulaContext } from '@shared/formulaEngine';
import {
  normalizeLayout, type TemplateLayout,
  type AdvStyle, type AdvFontFamily, type AdvFieldStyle, type AdvWidgetWidth,
  type AdvLogoPlacement, type AdvLogoSize, type AdvFontSize,
  type AdvBgGradientDirection, type AdvResultEmphasis, type AdvResultBorder,
  type AdvStepTransition,
  type TemplateStep,
  resolveTieredConfig,
} from '@shared/templatePresets';
import { eff } from './designTokens';
import { resolveWidgetTheme, type WidgetTheme } from './widgetThemes';
import { useCountUp } from './useCountUp';
import { useCalculatorAnalytics } from './useCalculatorAnalytics';
// Wave W-AH-2 / W-AI-3a — canonical icon map lives in `client/src/data/quoteQuickIcons.ts`
// so the admin trade editor's icon picker shares the exact same finite set.
// Explicit named imports keep Vite's tree-shaker happy — DO NOT switch to
// `import * as LucideIcons from 'lucide-react'` (pulls the full set into the bundle).
import { getQuoteQuickIcon } from '@/data/quoteQuickIcons';
// BD-2a — multi-step renderer, header category icon, final-step contact capture.
import CategoryIcon from './CategoryIcon';
import CalculatorStepper, { StepperControls } from './CalculatorStepper';
import ContactStep from './ContactStep';
// BD-2b — Good/Better/Best tier selector + inline trust signals.
import TierSelector from './TierSelector';
import TrustStripHeader from './TrustStripHeader';
import TrustBlockUnderCTA from './TrustBlockUnderCTA';
// BD-2c — image-card radio + ZIP peer-anchor + AI chat visibility gate.
import ImageRadioStep from './ImageRadioStep';
import PeerAnchorLine from './PeerAnchorLine';

function DefaultLogoIcon({
  name, accent, radius,
}: { name: string; accent: string; radius: number | string }) {
  const Icon = getQuoteQuickIcon(name);
  if (!Icon) return null;
  // Wave W-AP-1 — bumped from 28×28 with 10% tint + no border to 36×36
  // with 18% accent tint, a 1.5px solid accent border, and a soft drop
  // shadow. Alex couldn't see the AH-2 default trade icon in the live
  // widget because the previous treatment was too subtle. The icon
  // itself goes 16 → 20 to match.
  return (
    <div
      aria-hidden="true"
      style={{
        width: 36, height: 36, borderRadius: radius,
        background: `${accent}2e`,
        border: `1.5px solid ${accent}`,
        boxShadow: `0 2px 6px ${accent}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={20} color={accent} strokeWidth={2.25} />
    </div>
  );
}

/**
 * Wave H5 — Style tab integration.
 *
 * Font stacks for the curated `advanced.style.fontFamily` enum.
 * Wave L S3 — expanded set with explicit Satoshi, Geist, Plus Jakarta Sans,
 * IBM Plex Sans, Outfit and Sora. Every stack ends with `system-ui,
 * sans-serif` so a failed webfont request still renders sensibly.
 */
const FONT_STACKS: Record<AdvFontFamily, string> = {
  system: eff.font,
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  satoshi: '"Satoshi Variable", "Satoshi", system-ui, sans-serif',
  geist: '"Geist", "Geist Sans", system-ui, sans-serif',
  jakarta: '"Plus Jakarta Sans", system-ui, sans-serif',
  plex: '"IBM Plex Sans", system-ui, sans-serif',
  outfit: '"Outfit", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
};

/** Map widget-width enum → outer max-width applied to the calculator root. */
const WIDTH_PX: Record<AdvWidgetWidth, string> = {
  narrow: '520px',
  wide: '820px',
  full: '100%',
};

/** W-AO-6b — logo render size → pixel dimensions. */
const LOGO_SIZE_PX: Record<AdvLogoSize, number> = {
  small: 24,
  medium: 36,
  large: 52,
};

/** W-AO-6b — base font size token → pixel value (drives `--qq-font-size-base`). */
const FONT_SIZE_PX: Record<AdvFontSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
};

/**
 * Helper to convert a hex colour to an rgba string with `alpha` so the
 * Style-tab accent can drive a sensible accent tint without the user
 * configuring it explicitly. Falls back to the input string on unparseable
 * input — the renderer just gets a slightly off tint, not a crash.
 */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Compose the user's Style tab choices on top of a resolved `WidgetTheme`.
 * Every field is optional — absent fields fall through to the theme value.
 * Returns a NEW theme object so downstream identity-equality checks stay
 * sound, and recomputes the accent tint from the new accent.
 */
function applyStyleOverrides(base: WidgetTheme, style: AdvStyle | undefined): WidgetTheme {
  if (!style) return base;
  const next: WidgetTheme = { ...base };
  if (style.accent) {
    next.accent = style.accent;
    next.accentTint = hexToRgba(style.accent, 0.10);
  }
  if (style.background) {
    next.bg = style.background;
  }
  if (style.text) {
    next.text = style.text;
  }
  if (style.resultsBg) {
    next.result = style.resultsBg;
    // If the user explicitly picked a non-default results bg, recompute the
    // result text colour for legible contrast. White / very-light backgrounds
    // keep the theme's `text`; everything else uses white for the value.
    const isLight = /^#?(f|e)/i.test(style.resultsBg.replace('#', ''));
    next.resultText = isLight ? next.text : '#ffffff';
    next.resultMuted = isLight ? base.resultMuted : 'rgba(255,255,255,0.82)';
  }
  // W-AO-6b — extra colour tokens. Each is back-compat-safe: when the user
  // hasn't picked one the theme's existing value (or sensible fallback)
  // wins, so pre-AO-6b calculators render unchanged.
  if (style.surface) next.surface = style.surface;
  if (style.border) next.border = style.border;
  if (style.secondary) next.secondary = style.secondary;
  if (style.success) next.success = style.success;
  if (style.error) next.error = style.error;
  return next;
}

/* ─── Config types (mirror calculator_settings.advanced) ─── */

interface AdvOption { id: string; label: string; value: number; image?: string; }
interface AdvField {
  id: string;
  name: string;
  label: string;
  type: 'number' | 'slider' | 'select' | 'radio' | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading';
  help?: string;
  required?: boolean;
  default_value?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  on_value?: number;
  options?: AdvOption[];
  visible_when?: { field: string; op: string; value: number };
  /** Optional grid column span (1 = half width, 2 = full width). */
  colSpan?: 1 | 2;
}
interface AdvCalc {
  id: string; name: string; formula: string;
  format: 'number' | 'currency' | 'percent';
  /** Wave H4 — display-mode flags. All optional / backward-compatible. */
  resultMode?: 'primary' | 'secondary';
  caption?: string;
  showInResults?: boolean;
  divider?: boolean;
}
interface AdvHeader { title?: string; subtitle?: string; align?: 'left' | 'center' | 'right'; }
interface AdvResults { heading?: string; footnote?: string; show_breakdown?: boolean; cta_label?: string; }
/**
 * Wave H6 — Settings tab number-format slot. Drives the renderer's
 * currency / number formatting independent of the user's browser locale.
 * Every field optional so an absent slot renders identically to the pre-H6
 * `en-US` defaults (`1,234.56`, `$` prefix).
 */
export interface AdvNumberFormat {
  /** Thousands separator literal (`","` / `" "` / `""`). */
  thousands?: ',' | ' ' | '';
  /** Decimal separator literal. Must differ from `thousands`. */
  decimal?: '.' | ',';
  /** ISO-4217 3-letter code; used to pick a currency symbol. */
  currency?: string;
}
export interface AdvancedConfig {
  enabled?: boolean;
  fields?: AdvField[];
  calculations?: AdvCalc[];
  result_calc?: string;
  header?: AdvHeader;
  results?: AdvResults;
  theme?: string;
  /**
   * Wave W-AH-2 — Lucide icon name shown in the header's logo slot when no
   * user logo is uploaded. Template-provided default, optional & back-compat.
   */
  defaultIcon?: string;
  /**
   * BD-2a / BD-1 — small category icon name rendered LEFT of the step
   * title (16–20px). Optional override; absent → derived from `category`.
   */
  categoryIcon?: string;
  /** BD-2a — derived/explicit category bucket. Optional & back-compat. */
  category?: string;
  /** BD-2a — explicit step grouping for the multi-step renderer. */
  steps?: TemplateStep[];
  /**
   * BD-2a — owner override: `'single'` reverts to the legacy single-form
   * layout; default behaviour (absent or `'stepper'`) renders multi-step.
   */
  stepLayout?: 'stepper' | 'single';
  /**
   * Real layout: `single-column | two-column | multi-column`. Legacy values
   * (`single_page | two_column | multi_step`) are still accepted on read and
   * coerced via `normalizeLayout()`.
   */
  layout?: TemplateLayout | 'single_page' | 'two_column' | 'multi_step';
  /**
   * Wave H5 — user-driven Style tab overrides. Composed on top of the
   * resolved `WidgetTheme`. Every field optional → fully back-compatible.
   */
  style?: AdvStyle;
  /**
   * Wave H6 — Settings tab number-format overrides (thousands / decimal /
   * currency). Absent slot → pre-H6 en-US defaults.
   */
  numberFormat?: AdvNumberFormat;
  /**
   * BD-2b — Good/Better/Best tier config. Absent → derived from `category`
   * via `resolveTieredConfig()` (scope-spectrum categories default-on).
   */
  tiered?: import('@shared/templatePresets').TemplateTiered;
  /**
   * BD-2b — business profile (license #, Google rating, insured amount,
   * etc.). Absent → trust strip + trust block render `null`.
   */
  businessProfile?: import('@shared/templatePresets').BusinessProfile;
  /**
   * BD-2c — opt-in: render the Google Places address autocomplete field on
   * the contact step. Falls back to a plain text input when the env var
   * `VITE_GOOGLE_PLACES_API_KEY` is missing (graceful degradation).
   */
  requireAddress?: boolean;
}

interface Props {
  businessName?: string;
  logoUrl?: string;
  advanced: AdvancedConfig;
  accentColor?: string;
  /** Wave R-pre v2 — when true (wizard preview), renders a small pencil
   *  icon next to the calculator title so the user knows it's editable.
   *  Public hosted page + actual customer embeds default to false. */
  editableTitle?: boolean;
  /**
   * W-AO-6c — the calculator owner's plan tier. Drives Brand Studio
   * gating: when `planTier` is not Pro / Business / Starter the renderer
   * ignores every Brand Studio field (customCss, bgMode/bgGradient/
   * bgImage*, resultPanel) regardless of what's persisted. Defense in
   * depth alongside the server-side strip in `calculatorRoutes.ts`.
   */
  planTier?: string;
  /**
   * W-AO-6c — unique id used to scope injected `customCss` to this
   * widget instance via a `.qq-widget-${id}` root class. Falls back to a
   * random suffix when absent (preview path) so the scoping rule still
   * fires deterministically per mount.
   */
  calculatorId?: string | number;
  /**
   * BD-2a — booking URL plumbed from the business profile (Calendly link,
   * embedded scheduler URL, etc). Used by the final-step ContactStep's
   * hard CTA ("Book a consultation"). When absent, the hard CTA falls back
   * to a mailto: link via `ownerEmail` or hides entirely.
   */
  bookingUrl?: string;
  /**
   * BD-2a — owner email plumbed from the calculator row. Used as the
   * mailto: fallback for the hard CTA when no `bookingUrl` is configured.
   */
  ownerEmail?: string;
}

/** W-AO-6c — Brand Studio is unlocked on Pro / Business (Starter is the
 *  legacy alias of Pro). Mirrors the matrix used by the server-side
 *  strip + the Settings tab brand-badge gate. */
function isBrandStudioTier(planTier: string | undefined): boolean {
  const t = (planTier ?? 'free').toLowerCase();
  return t === 'pro' || t === 'business' || t === 'starter';
}

/** W-AO-6c — clamp the image-tint percent to 0..50 so a malformed
 *  persisted value can't reach the renderer as a runaway opacity. */
function clampTint(pct: number | undefined): number {
  if (typeof pct !== 'number' || !isFinite(pct)) return 0;
  return Math.max(0, Math.min(50, Math.round(pct)));
}

/** W-AO-6d — derive the per-panel mount transition CSS for the lead-form
 *  step wizard. Pure CSS (no Framer Motion dep). Each panel mounts with
 *  the entering keyframes; transitions back to instant when the kind is
 *  'none' OR the user prefers reduced motion AND respect is on.
 *
 *  The browser handles `prefers-reduced-motion` automatically via the
 *  media query inside the injected keyframes — we DON'T inline the
 *  `matchMedia` check, because that would freeze the rendered value at
 *  mount time. The media query route stays live as the OS preference
 *  changes mid-session. */
function stepTransitionCss(
  scopeClass: string,
  kind: AdvStepTransition,
  durationMs: number,
  respectReducedMotion: boolean,
): string {
  if (kind === 'none') return '';
  const fade = `qq-step-fade-${scopeClass}`;
  const slide = `qq-step-slide-${scopeClass}`;
  const slideFade = `qq-step-slidefade-${scopeClass}`;
  const dur = `${durationMs}ms`;

  const keyframes = `
    @keyframes ${fade} { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ${slide} { from { transform: translateX(16px); } to { transform: translateX(0); } }
    @keyframes ${slideFade} {
      from { opacity: 0; transform: translateX(16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;

  let rule = '';
  if (kind === 'fade') {
    rule = `.${scopeClass} [data-qq-step-enter] { animation: ${fade} ${dur} ease-out both; }`;
  } else if (kind === 'slide') {
    rule = `.${scopeClass} [data-qq-step-enter] { animation: ${slide} ${dur} ease-out both; }`;
  } else if (kind === 'slide-fade') {
    rule = `.${scopeClass} [data-qq-step-enter] { animation: ${slideFade} ${dur} ease-out both; }`;
  }

  const reduced = respectReducedMotion
    ? `@media (prefers-reduced-motion: reduce) {
         .${scopeClass} [data-qq-step-enter] { animation: none !important; }
       }`
    : '';

  return `${keyframes}\n${rule}\n${reduced}`;
}

/** W-AO-6c — translate `AdvBgGradientDirection` into a CSS background
 *  declaration that uses the two stops. Falls back to a sensible default
 *  when an unknown direction sneaks in from a stored config. */
function gradientCss(
  from: string,
  to: string,
  direction: AdvBgGradientDirection | undefined,
): string {
  const dir = direction ?? 'linear-down';
  switch (dir) {
    // Legacy AO-6c shorthand.
    case 'linear-up':    return `linear-gradient(to top, ${from}, ${to})`;
    case 'linear-down':  return `linear-gradient(to bottom, ${from}, ${to})`;
    case 'linear-left':  return `linear-gradient(to left, ${from}, ${to})`;
    case 'linear-right': return `linear-gradient(to right, ${from}, ${to})`;
    case 'radial':       return `radial-gradient(circle at 50% 50%, ${from}, ${to})`;
    // W-AS-1c — CSS-standard linear-gradient direction tokens. Templates
    // use these for diagonals (e.g. Junk Removal's `'to bottom right'`).
    case 'to top':          return `linear-gradient(to top, ${from}, ${to})`;
    case 'to top right':    return `linear-gradient(to top right, ${from}, ${to})`;
    case 'to right':        return `linear-gradient(to right, ${from}, ${to})`;
    case 'to bottom right': return `linear-gradient(to bottom right, ${from}, ${to})`;
    case 'to bottom':       return `linear-gradient(to bottom, ${from}, ${to})`;
    case 'to bottom left':  return `linear-gradient(to bottom left, ${from}, ${to})`;
    case 'to left':         return `linear-gradient(to left, ${from}, ${to})`;
    case 'to top left':     return `linear-gradient(to top left, ${from}, ${to})`;
    default:             return `linear-gradient(to bottom, ${from}, ${to})`;
  }
}

type Answer = number | string | boolean | string[];

/** The default answer for a single field. */
function defaultAnswer(f: AdvField): Answer {
  if (f.type === 'number' || f.type === 'slider') return f.default_value ?? f.min ?? 0;
  if (f.type === 'toggle') return false;
  if (f.type === 'multi_select') return [];
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') return f.options?.[0]?.id ?? '';
  return '';
}

/** True when a stored answer is no longer valid for its field. */
function answerInvalid(f: AdvField, value: Answer): boolean {
  if (value === undefined) return true;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return !(f.options || []).some((o) => o.id === value);
  }
  return false;
}

function initAnswers(fields: AdvField[]): Record<string, Answer> {
  const a: Record<string, Answer> = {};
  for (const f of fields) a[f.name] = defaultAnswer(f);
  return a;
}

/** The numeric/array value a single field contributes to a formula context. */
function rawFieldValue(f: AdvField, answers: Record<string, Answer>): FormulaContext[string] {
  const v = answers[f.name];
  if (f.type === 'heading') return 0;
  if (f.type === 'number' || f.type === 'slider') return Number(v) || 0;
  if (f.type === 'text') return String(v ?? '');
  if (f.type === 'toggle') return v ? (f.on_value ?? 1) : 0;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return f.options?.find((o) => o.id === v)?.value ?? 0;
  }
  const ids = Array.isArray(v) ? v : [];
  return (f.options || []).filter((o) => ids.includes(o.id)).map((o) => o.value);
}

/** The value a hidden field contributes — neutral so formulas ignore it. */
function emptyFieldValue(f: AdvField): FormulaContext[string] {
  return f.type === 'multi_select' ? [] : f.type === 'text' ? '' : 0;
}

function asNumber(v: FormulaContext[string]): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + (typeof x === 'number' ? x : 0), 0);
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/** Whether a field's conditional-visibility rule passes. */
function rulePasses(rule: { op: string; value: number }, controlValue: number): boolean {
  switch (rule.op) {
    case 'eq': return controlValue === rule.value;
    case 'ne': return controlValue !== rule.value;
    case 'gt': return controlValue > rule.value;
    case 'lt': return controlValue < rule.value;
    case 'gte': return controlValue >= rule.value;
    case 'lte': return controlValue <= rule.value;
    default: return true;
  }
}

/** Minimal ISO-4217 → symbol map. Codes outside the map render as the code
 *  itself (e.g. `INR 1,234`), which is still legible. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', CAD: '$', AUD: '$', NZD: '$', SGD: '$', HKD: '$', MXN: '$',
  EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', CHF: 'CHF',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', INR: '₹', BRL: 'R$', ZAR: 'R',
};

/**
 * Format a number using user-chosen thousands/decimal separators.
 * `minFrac` is the floor (so currency stays as `0.00`); `maxFrac` is the
 * rounding ceiling. Negative values keep their sign.
 */
function formatNumber(
  v: number,
  minFrac: number,
  maxFrac: number,
  thousandsSep: string,
  decimalSep: string,
): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  // Locale-agnostic — `toFixed` rounds to `maxFrac`; trailing zeros are then
  // stripped down to `minFrac`. This matches `toLocaleString({ min, max })`.
  const fixed = abs.toFixed(maxFrac);
  let [intPart, fracPart = ''] = fixed.split('.');
  while (fracPart.length > minFrac && fracPart.endsWith('0')) {
    fracPart = fracPart.slice(0, -1);
  }
  const withThousands = thousandsSep
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)
    : intPart;
  return sign + withThousands + (fracPart ? decimalSep + fracPart : '');
}

function formatResult(
  v: number,
  format: AdvCalc['format'],
  numberFormat?: AdvNumberFormat,
): string {
  // Defaults match the pre-H6 en-US behaviour exactly when `numberFormat` is
  // absent (`,` thousands, `.` decimal, `$` symbol).
  const thousandsSep = numberFormat?.thousands ?? ',';
  const decimalSep = numberFormat?.decimal ?? '.';
  const currencyCode = (numberFormat?.currency ?? 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? `${currencyCode} `;

  if (format === 'currency') {
    return symbol + formatNumber(v, 2, 2, thousandsSep, decimalSep);
  }
  if (format === 'percent') {
    return formatNumber(v, 0, 1, thousandsSep, decimalSep) + '%';
  }
  return formatNumber(v, 0, 2, thousandsSep, decimalSep);
}

/**
 * W-BB-3 — range-pricing display mode. Renders the headline as
 * `$LOW – $HIGH` using ±band_pct around the computed value. Bounds round
 * to the nearest $25 for cleaner numbers ($2,300 not $2,287.50). Currency
 * format only; for non-currency calcs we fall back to the single value
 * (a percent or count range adds no value).
 */
function formatResultRange(
  v: number,
  format: AdvCalc['format'],
  bandPct: number,
  numberFormat?: AdvNumberFormat,
): string {
  // Non-currency calcs: range mode is meaningless (ranges of % or count
  // values don't communicate uncertainty in the same way). Fall through.
  if (format !== 'currency') return formatResult(v, format, numberFormat);
  // Clamp band to a sensible UI range.
  const band = Math.max(5, Math.min(25, bandPct)) / 100;
  const roundTo25 = (n: number) => Math.round(n / 25) * 25;
  const low = Math.max(0, roundTo25(v * (1 - band)));
  const high = Math.max(low + 25, roundTo25(v * (1 + band)));
  const thousandsSep = numberFormat?.thousands ?? ',';
  const decimalSep = numberFormat?.decimal ?? '.';
  const currencyCode = (numberFormat?.currency ?? 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? `${currencyCode} `;
  // Whole-dollar formatting (no trailing `.00`) since bounds are $25-rounded.
  const lowStr = symbol + formatNumber(low, 0, 0, thousandsSep, decimalSep);
  const highStr = symbol + formatNumber(high, 0, 0, thousandsSep, decimalSep);
  // U+2013 EN DASH with non-breaking spaces — matches the brief and keeps
  // the range visually grouped on narrow widths.
  return `${lowStr} – ${highStr}`;
}

/**
 * Wave R-pre W-LABELS — small de-emphasised header for grouped fields
 * (radio, multi-select, image_choice, slider). Per Alex's global rule,
 * prominent "above-the-input" titles aren't allowed. Group renderers
 * can't carry a floating label naturally (no single input to float into)
 * so we keep a tiny uppercase caption instead.
 */
const groupHeaderStyle = (c: WidgetTheme): React.CSSProperties => ({
  fontSize: '11px', fontWeight: 600, color: c.textMuted, display: 'block',
  marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em',
});

/**
 * BD-2a-sticky — bottom-stuck action footer with a fold/unfold toggle.
 *
 * Renders the primary action buttons for the current step (Back / Next /
 * Submit, or the contact step's hard CTAs). A chevron toggle in the top-
 * right collapses the bar to a ~32px micro-summary strip showing the
 * running quote estimate (`Est. $2,400 – $2,800`); tapping anywhere on the
 * collapsed strip (or the chevron) restores the full bar.
 *
 * Persisted: fold state writes to `localStorage` under
 * `qq-foot-fold-${calculatorId}` so a returning customer sees their
 * preference. Default = unfolded.
 *
 * Motion: 200ms ease-out height transition; respects
 * `prefers-reduced-motion` (instant snap, no animation).
 *
 * iOS safe area: bottom padding uses
 * `max(12px, env(safe-area-inset-bottom))` so the bar clears the home
 * indicator on iOS Safari + PWA installs.
 */
function StickyActionBar({
  theme, fontFamily, calculatorId, microSummary, children, trustBlock,
}: {
  theme: WidgetTheme;
  fontFamily: string;
  /** Used to derive the localStorage key. When absent, fold state is in-memory only. */
  calculatorId?: string | number;
  /** Short running quote string (e.g. `Est. $2,400 – $2,800`) shown in folded state. */
  microSummary: string;
  /** The full unfolded action buttons (rendered when expanded). */
  children: React.ReactNode;
  /**
   * BD-2b — optional trust block (license #, insured-up-to, icon row) rendered
   * directly beneath the action buttons inside the EXPANDED state. Folded
   * state stays clean (micro-summary only). Pass `null` / omit to hide.
   */
  trustBlock?: React.ReactNode;
}) {
  const storageKey = calculatorId !== undefined
    ? `qq-foot-fold-${calculatorId}` : null;

  // Lazy init from localStorage so the first paint matches the persisted
  // preference (avoids a flash from default→stored). Guarded for SSR.
  const [folded, setFolded] = useState<boolean>(() => {
    if (!storageKey || typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(storageKey) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try { window.localStorage.setItem(storageKey, folded ? '1' : '0'); }
    catch { /* quota / private mode — ignore */ }
  }, [folded, storageKey]);

  // Reduced-motion handling — read at render-time so the OS preference is
  // respected live (no stale mount-time snapshot).
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const transition = prefersReducedMotion
    ? 'none'
    : 'height 200ms ease-out, padding 200ms ease-out';

  // The bar's height is driven by content (auto) when unfolded and a fixed
  // 32px strip when folded. We animate via max-height — a fixed auto target
  // wouldn't transition cleanly. Folded uses `height: 32px`; unfolded uses
  // a generous max-height the content will never exceed.
  return (
    <div
      data-testid="advanced-sticky-bottom"
      data-component-name="Sticky bottom"
      data-folded={folded ? 'true' : 'false'}
      style={{
        position: 'sticky', bottom: 0, zIndex: 40,
        background: theme.surface,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        // iOS safe area — clears the home indicator on Safari + PWA.
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop: folded ? 0 : 12,
        paddingLeft: 14, paddingRight: 14,
        transition,
        fontFamily,
      }}
    >
      {folded ? (
        /* Folded strip — clickable anywhere to unfold. */
        <button
          type="button"
          data-testid="advanced-sticky-bottom-unfold"
          onClick={() => setFolded(false)}
          aria-expanded="false"
          aria-label="Show actions"
          style={{
            width: '100%', height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, color: theme.text, fontFamily,
          }}
        >
          <span style={{
            fontSize: 12, fontWeight: 700, color: theme.textBody,
            letterSpacing: '0.01em',
          }}>
            {microSummary}
          </span>
          <span aria-hidden="true" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            color: theme.textMuted,
          }}>
            {/* chevron-up */}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.4}
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </span>
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
            <button
              type="button"
              data-testid="advanced-sticky-bottom-fold"
              onClick={() => setFolded(true)}
              aria-expanded="true"
              aria-label="Hide actions"
              style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: theme.textMuted,
              }}
            >
              {/* chevron-down */}
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          {/* BD-2b — optional trust block (license #, insured-up-to, icon row)
              renders only in the expanded state and only when the business
              profile carries the relevant fields. Folded micro-summary stays
              clean. */}
          {trustBlock}
        </div>
      )}
    </div>
  );
}

export default function AdvancedCalculator({
  businessName, logoUrl, advanced, accentColor, editableTitle = false,
  planTier, calculatorId, bookingUrl, ownerEmail,
}: Props) {
  // W-AO-6c — Brand Studio gate. When the owner isn't on Pro+ we IGNORE
  // every Brand Studio field even if it's somehow persisted on the row.
  // The server-side strip in `calculatorRoutes.ts` is the primary gate;
  // this is defense in depth so a leaked / direct-database value can't
  // bypass the upsell.
  const brandStudioUnlocked = isBrandStudioTier(planTier);
  const bs = brandStudioUnlocked ? (advanced.style ?? {}) : {};
  const bsCustomCss = brandStudioUnlocked && typeof bs.customCss === 'string'
    ? bs.customCss : '';
  const bsBgMode = brandStudioUnlocked ? bs.bgMode : undefined;
  const bsBgGradient = brandStudioUnlocked ? bs.bgGradient : undefined;
  const bsBgImageUrl = brandStudioUnlocked ? bs.bgImageUrl : undefined;
  const bsBgImageTint = clampTint(brandStudioUnlocked ? bs.bgImageTint : undefined);
  const bsResultPanel = brandStudioUnlocked ? bs.resultPanel : undefined;
  /**
   * BD-2a — range-pricing as default. The `range_mode` slot lives on
   * `style.resultPanel` (alongside the rest of the result-panel overrides),
   * but unlike the rest of Brand Studio it ISN'T Pro-gated — every template
   * gets it on by default via `deriveStyleFromCategory` so the headline reads
   * as `$LOW – $HIGH` out of the box. Owners opt out per template via Style
   * tab → Brand Studio → Result panel → Range mode (the Brand Studio strip
   * leaves the `range_mode` sub-key untouched even for free-tier patches).
   */
  const effectiveRangeMode = (advanced.style ?? {}).resultPanel?.range_mode
    ?? bsResultPanel?.range_mode;
  // W-AO-6d — Brand Studio Wave 2 animations. Pro-gated (same matrix as
  // Wave 1 fields). When absent, transitions render instantly — matches
  // pre-AO-6d behaviour, so existing calculators are unchanged.
  const bsAnimations = brandStudioUnlocked ? bs.animations : undefined;
  const stepTransition: AdvStepTransition = bsAnimations?.step_transition ?? 'none';
  const stepDurationMs = (() => {
    const raw = typeof bsAnimations?.duration_ms === 'number' ? bsAnimations.duration_ms : 250;
    if (!Number.isFinite(raw)) return 250;
    return Math.max(100, Math.min(600, Math.round(raw)));
  })();
  const reducedMotionRespect = bsAnimations?.reduced_motion_respect !== false;

  // Resolve the base theme, then compose the optional `advanced.style`
  // overrides on top. The Wave H5 style slot wins where it sets a value;
  // absent fields fall through to the resolved theme (which itself already
  // honours a top-level `accentColor` override for back-compat).
  const baseTheme = resolveWidgetTheme(advanced.theme, accentColor);
  const c = applyStyleOverrides(baseTheme, advanced.style);
  const accent = c.accent;
  const fields = advanced.fields || [];
  const calcs = advanced.calculations || [];

  // Resolved Style tab choices — used to drive the renderer's structural
  // tokens (font / radius / field-style / widget-width).
  //
  // CRITICAL — per-field fallback to LEGACY pre-H5 tokens. A template
  // persisted without an `advanced.style` slot (the existing 106 templates,
  // and anything authored before Wave H5) must render IDENTICALLY to the
  // pre-H5 build: rounded `eff.radius2xl` outer card, `eff.radiusXl` result
  // panel, `eff.radiusMd` inputs/CTA, Satoshi (`eff.font`), filled inputs,
  // no max-width cap (the outer QuoteWidget wrapper handles sizing).
  //
  // Only when the user has explicitly set a field via the Style tab does
  // that user value win. Don't apply structural defaults blanket; that's
  // what regressed the pre-H5 look for every existing template.
  const style = advanced.style || {};
  const fontFamily = style.fontFamily !== undefined
    ? FONT_STACKS[style.fontFamily]
    : eff.font;
  // Outer card radius — legacy `eff.radius2xl` (~24px) when unset.
  // Result panel uses the same px value when set (matches H5 preview), but
  // falls back to `eff.radiusXl` (~20px) when unset.
  // Inputs / CTA / lead-form inputs use the legacy 2px-inset value when set,
  // or `eff.radiusMd` (~12px) when unset.
  const radiusSet = typeof style.radius === 'number';
  const radiusValue = radiusSet ? (style.radius as number) : 12;
  const radiusOuterPx = radiusSet ? `${radiusValue}px` : eff.radius2xl;
  const radiusResultPx = radiusSet ? `${radiusValue}px` : eff.radiusXl;
  const radiusInnerPx = radiusSet ? `${Math.max(0, radiusValue - 2)}px` : eff.radiusMd;
  // Legacy was filled-only — defaulting to 'filled' is back-compat-safe.
  const fieldStyle: AdvFieldStyle = style.fieldStyle ?? 'filled';
  // `widgetWidth` undefined → no max-width cap (the outer QuoteWidget wrapper
  // handled sizing pre-H5). Only apply a fixed cap when the user picked one.
  const widgetWidth: AdvWidgetWidth | undefined = style.widgetWidth;
  const maxWidthStyle: string | undefined = widgetWidth ? WIDTH_PX[widgetWidth] : undefined;

  // Wave AC-1 — per-viewport pixel overrides. When `widgetWidthDesktop` or
  // `widgetWidthMobile` are set, they take precedence over the `widgetWidth`
  // enum on the matching viewport via the scoped media-query block below.
  // Values are clamped to safe ranges so an out-of-range stored value still
  // renders sensibly (desktop 320–800, mobile 320–440).
  const clampDesktop = (n: number) => Math.max(320, Math.min(800, Math.round(n)));
  const clampMobile = (n: number) => Math.max(320, Math.min(440, Math.round(n)));
  const widgetWidthDesktopPx = typeof style.widgetWidthDesktop === 'number'
    ? clampDesktop(style.widgetWidthDesktop) : undefined;
  const widgetWidthMobilePx = typeof style.widgetWidthMobile === 'number'
    ? clampMobile(style.widgetWidthMobile) : undefined;

  // W-AO-6b — logo placement + size (Style tab "Branding" section).
  // `hidden` placement suppresses the logo+default-icon entirely; absent
  // value falls through to the legacy header-align behaviour.
  const logoPlacement: AdvLogoPlacement | undefined = style.logoPlacement;
  const logoHidden = logoPlacement === 'hidden';
  const logoSizePx = LOGO_SIZE_PX[style.logoSize ?? 'small'];

  // W-AO-6b — typography depth. Emitted as CSS variables so the title bar
  // (h1 weight) + body (button + input weight) inherit cleanly. Falls back
  // to the legacy hard-coded values when unset.
  const headingWeight = style.headingWeight ?? 800; // legacy was 800 on the title
  const bodyWeight = style.bodyWeight ?? 400;
  const fontSizeBasePx = FONT_SIZE_PX[style.fontSize ?? 'medium'];

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => initAnswers(fields));

  // Wave W-BB-4 — conversion analytics tracking. No-op when calculatorId is
  // absent (preview / draft) so the wizard preview path is unaffected.
  const analyticsCalcId =
    typeof calculatorId === 'number'
      ? calculatorId
      : typeof calculatorId === 'string' && /^\d+$/.test(calculatorId)
        ? Number(calculatorId)
        : undefined;
  const { trackFieldChange, trackSubmit } = useCalculatorAnalytics({
    calculatorId: analyticsCalcId,
  });

  const setAnswer = (name: string, value: Answer) => {
    setAnswers((p) => ({ ...p, [name]: value }));
    trackFieldChange(name, value);
  };

  // Result-panel call-to-action — button → inline lead form → thank-you.
  const [leadView, setLeadView] = useState<'cta' | 'form' | 'done'>('cta');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  // BD-2c — captured ZIP from the address autocomplete (or a dedicated ZIP
  // step field, if the template carries one). Drives the peer-anchor line.
  const [capturedZip, setCapturedZip] = useState<string | null>(null);
  // BD-2c — also try to infer a ZIP from any `answers` field whose name
  // hints at "zip" / "postal" (templates that capture ZIP without Places).
  const inferredZip = useMemo(() => {
    if (capturedZip) return capturedZip;
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v !== 'string') continue;
      if (/zip|postal/i.test(k) && /^[0-9A-Za-z\- ]{3,10}$/.test(v.trim())) {
        return v.trim();
      }
    }
    return null;
  }, [capturedZip, answers]);

  // BD-2b — Good/Better/Best tier selection. Resolved from the explicit
  // `advanced.tiered` slot if present, else derived from the category bucket
  // (scope-spectrum categories default-on; flat-fee default-off).
  // `selectedTierIndex` defaults to the middle tier (Most Popular) when one
  // is flagged, else to index 0.
  const tieredConfig = useMemo(
    () => resolveTieredConfig(advanced.tiered, advanced.category),
    [advanced.tiered, advanced.category],
  );
  const defaultTierIndex = useMemo(() => {
    if (!tieredConfig.enabled) return 0;
    const popularIdx = tieredConfig.tiers.findIndex((t) => t.mostPopular === true);
    return popularIdx >= 0 ? popularIdx : Math.floor(tieredConfig.tiers.length / 2);
  }, [tieredConfig.enabled, tieredConfig.tiers]);
  const [selectedTierIndex, setSelectedTierIndex] = useState<number>(defaultTierIndex);
  // Keep the selected index in range when the tier list itself changes
  // (template swap, owner edits the tier shape in StyleTab).
  useEffect(() => {
    setSelectedTierIndex((idx) => {
      if (!tieredConfig.enabled) return 0;
      if (idx < 0 || idx >= tieredConfig.tiers.length) return defaultTierIndex;
      return idx;
    });
  }, [tieredConfig.enabled, tieredConfig.tiers, defaultTierIndex]);

  // Keep answers in sync when the field set changes — a template being
  // applied or fields edited in the builder. A field missing an answer (or
  // holding one no longer valid for its options, e.g. after switching
  // template) is reset to its default — otherwise sliders read "undefined"
  // and totals stay at 0.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next: Record<string, Answer> = { ...prev };
      for (const f of fields) {
        if (answerInvalid(f, next[f.name])) {
          next[f.name] = defaultAnswer(f);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fields]);

  // Raw values (every field) → visibility → formula context (a hidden field
  // contributes a neutral value so it doesn't skew the total).
  const raw = useMemo(() => {
    const ctx: FormulaContext = {};
    for (const f of fields) ctx[f.name] = rawFieldValue(f, answers);
    return ctx;
  }, [fields, answers]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) {
      if (!f.visible_when) { s.add(f.id); continue; }
      if (rulePasses(f.visible_when, asNumber(raw[f.visible_when.field] ?? 0))) s.add(f.id);
    }
    return s;
  }, [fields, raw]);

  const ctx = useMemo(() => {
    const m: FormulaContext = {};
    for (const f of fields) m[f.name] = visibleIds.has(f.id) ? raw[f.name] : emptyFieldValue(f);
    return m;
  }, [fields, raw, visibleIds]);

  const { values } = useMemo(() => runCalculations(calcs, ctx), [calcs, ctx]);

  // Wave H4 — headline selection:
  //  1. The first calc explicitly marked `resultMode: 'primary'` wins.
  //  2. Else the legacy `advanced.result_calc` (by name) wins.
  //  3. Else the last calc in the list (back-compat default).
  const explicitPrimary = calcs.find((cl) => cl.resultMode === 'primary');
  const legacyHeadline = advanced.result_calc
    ? calcs.find((cl) => cl.name === advanced.result_calc)
    : undefined;
  const resultCalc = explicitPrimary || legacyHeadline || (calcs.length ? calcs[calcs.length - 1] : undefined);
  const resultName = resultCalc?.name || '';
  const headline = values[resultName] ?? 0;
  // Wave AA — animated headline. Boots from 0 → headline on mount, then
  // smooth-transitions to each new value as sliders / selects change.
  // Respects prefers-reduced-motion (returns the target value verbatim).
  const animatedHeadline = useCountUp(headline);
  // BD-2b — effective quote value plumbed to ContactStep / micro-summary /
  // lead-form payload. When tiers are off, this is identical to the base
  // headline (back-compat). When tiers are on, it's the SELECTED tier's
  // price (base × multiplier, rounded to $25 — same rounding TierSelector
  // applies to each card so the values match exactly).
  const effectiveQuoteValue = useMemo(() => {
    if (!tieredConfig.enabled) return headline;
    const tier = tieredConfig.tiers[selectedTierIndex] ?? tieredConfig.tiers[0];
    if (!tier) return headline;
    const raw = headline * tier.multiplier;
    return Math.max(0, Math.round(raw / 25) * 25);
  }, [tieredConfig.enabled, tieredConfig.tiers, selectedTierIndex, headline]);
  const selectedTierLabel = tieredConfig.enabled
    ? (tieredConfig.tiers[selectedTierIndex]?.label ?? tieredConfig.tiers[0]?.label ?? null)
    : null;
  const results = advanced.results || {};
  const showBreakdown = results.show_breakdown !== false;
  const resultHeading = (results.heading || '').trim() || resultCalc?.name || 'Total';
  const footnoteText = (results.footnote || '').trim() || 'Instant estimate based on your inputs.';
  // Breakdown rows = every calc visible in the result panel that ISN'T the
  // headline. `showInResults === false` hides explicitly; undefined defaults
  // to shown (preserves pre-H4 behaviour).
  const breakdown = calcs.filter((cl) =>
    cl.name !== resultName && cl.showInResults !== false,
  );
  const visibleFields = fields.filter((f) => visibleIds.has(f.id));

  /* ─── BD-2a — multi-step renderer ───────────────────────────────
   *
   * Goal: ship the biggest CVR lever from BD-0 research (3x conversion vs
   * single-form, 13.85 % vs 4.53 %). The stepper is ON by default for every
   * template; owners can opt back to single-form via Style tab → Step layout.
   *
   * Step list comes from one of two places:
   *   1. Explicit `advanced.steps[]` declared on the template config (uses it
   *      verbatim; any visible field NOT mentioned falls into the first step).
   *   2. Auto-derived from the field list, grouped as: base/required first,
   *      modifiers (selects / toggles / multi_select / image_choice) second,
   *      photos / notes / text third, final = contact capture.
   *
   * The renderer never drops a field — every visible field lands in some
   * step. The contact step is appended AFTER the user-defined / auto-derived
   * data steps so the final step always shows the quote + ContactStep.
   */
  const stepLayoutMode: 'stepper' | 'single' = advanced.stepLayout ?? 'stepper';

  const dataSteps: { id: string; label: string; help?: string; fieldIds: string[] }[] = useMemo(() => {
    if (stepLayoutMode === 'single') return [];

    // 1) Explicit steps declared on the template.
    if (Array.isArray(advanced.steps) && advanced.steps.length > 0) {
      const declared = advanced.steps.map((s) => ({
        id: s.id, label: s.label, help: s.help,
        fieldIds: Array.isArray(s.fields) ? s.fields : [],
      }));
      // Catch-all — any visible field not mentioned lands in step 0.
      const mentioned = new Set<string>();
      declared.forEach((s) => s.fieldIds.forEach((id) => mentioned.add(id)));
      const orphans = visibleFields
        .filter((f) => !mentioned.has(f.id) && !mentioned.has(f.name))
        .map((f) => f.id);
      if (orphans.length > 0 && declared[0]) {
        declared[0] = { ...declared[0], fieldIds: [...declared[0].fieldIds, ...orphans] };
      }
      return declared;
    }

    // 2) Auto-derive — base/required → modifiers → photos/notes.
    if (visibleFields.length <= 1) {
      // Single field — no point chunking; the contact step still gets
      // appended below.
      return [{
        id: 'main', label: 'Basics',
        fieldIds: visibleFields.map((f) => f.id),
      }];
    }
    const baseIds: string[] = [];
    const modIds: string[] = [];
    const notesIds: string[] = [];
    for (const f of visibleFields) {
      const isModifier =
        f.type === 'select' || f.type === 'radio' || f.type === 'multi_select' ||
        f.type === 'toggle' || f.type === 'image_choice';
      const isNotes = f.type === 'text';
      if (isNotes) notesIds.push(f.id);
      else if (isModifier && (baseIds.length > 0)) modIds.push(f.id);
      else baseIds.push(f.id);
    }
    const out: { id: string; label: string; help?: string; fieldIds: string[] }[] = [];
    if (baseIds.length > 0) out.push({ id: 'basics', label: 'Basics', fieldIds: baseIds });
    if (modIds.length > 0) out.push({ id: 'options', label: 'Options', fieldIds: modIds });
    if (notesIds.length > 0) out.push({ id: 'details', label: 'Details', fieldIds: notesIds });
    // Safety — if grouping wiped everything (every field a modifier), put
    // them all in one step.
    if (out.length === 0) {
      out.push({ id: 'main', label: 'Basics', fieldIds: visibleFields.map((f) => f.id) });
    }
    return out;
  }, [stepLayoutMode, advanced.steps, visibleFields]);

  // Contact step is the FINAL step — appended after the data steps when the
  // stepper is enabled. We treat it as a synthetic step (no field ids) so
  // the field iteration logic stays untouched.
  const useStepper = stepLayoutMode !== 'single' && dataSteps.length > 0;
  const totalSteps = useStepper ? dataSteps.length + 1 : 0;
  const [stepIdx, setStepIdx] = useState(0);
  // Clamp the active index whenever the step list shrinks (e.g. visibility
  // rules hid a field that was on its own step).
  useEffect(() => {
    if (useStepper && stepIdx >= totalSteps) setStepIdx(Math.max(0, totalSteps - 1));
  }, [useStepper, totalSteps, stepIdx]);
  // BD-2c — broadcast the active step index so the page-level AIChatBubble
  // can trip its "stuck-customer rescue" visibility gate at step >= 2.
  // Safe in SSR-free contexts (the widget only runs in the browser).
  useEffect(() => {
    if (typeof window === 'undefined' || !useStepper) return;
    window.dispatchEvent(new CustomEvent('quotequick:step', {
      detail: { stepIndex: stepIdx, totalSteps },
    }));
  }, [useStepper, stepIdx, totalSteps]);

  const stepperList = useMemo(() => {
    if (!useStepper) return [];
    return [
      ...dataSteps.map((s) => ({ id: s.id, label: s.label })),
      { id: 'contact', label: 'Contact' },
    ];
  }, [useStepper, dataSteps]);

  const isContactStep = useStepper && stepIdx === dataSteps.length;
  // Field ids visible on the current data step. Empty when on contact step.
  const currentStepFieldIds = useMemo(() => {
    if (!useStepper) return null;
    if (isContactStep) return new Set<string>();
    const step = dataSteps[stepIdx];
    return new Set(step ? step.fieldIds : []);
  }, [useStepper, isContactStep, dataSteps, stepIdx]);

  // Apply the per-step filter to the visible field list. When the stepper
  // is off we render the legacy flat field list.
  const renderedFields = useMemo(() => {
    if (!useStepper || isContactStep || !currentStepFieldIds) return visibleFields;
    return visibleFields.filter(
      (f) => currentStepFieldIds.has(f.id) || currentStepFieldIds.has(f.name),
    );
  }, [useStepper, isContactStep, currentStepFieldIds, visibleFields]);

  // BD-2a — persist user-typed contact data across stepper back/forward so
  // a misclick doesn't wipe what they entered. Reuses leadName / leadEmail
  // from the legacy result-panel form (state declared further up).
  const [contactPhone, setContactPhone] = useState('');

  // A tinted result panel (coral / dark) drops its border and uses a
  // translucent divider; a white panel keeps the theme border.
  const resultTinted = c.result.toLowerCase() !== c.surface.toLowerCase();
  const resultDivider = resultTinted ? 'rgba(255,255,255,0.22)' : c.border;

  // CTA — always high-contrast against the result panel (a solid accent
  // button on a white panel; a white button on a coloured panel).
  const ctaLabel = results.cta_label === undefined ? 'Get My Quote' : results.cta_label;
  const showCta = ctaLabel.trim() !== '';
  const ctaBg = resultTinted ? '#ffffff' : accent;
  const ctaFg = resultTinted ? c.result : '#ffffff';
  const leadEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail.trim());
  const leadReady = leadName.trim() !== '' && leadEmailOk;
  const leadInputStyle: React.CSSProperties = {
    width: '100%', height: '40px', borderRadius: radiusInnerPx,
    border: '1px solid rgba(15,23,42,0.14)', padding: '0 12px', fontSize: '13px',
    background: '#ffffff', color: '#0f172a', fontFamily, outline: 'none',
    boxSizing: 'border-box',
  };

  // ── Layout ──
  // Real, CSS-Grid-backed layouts. Mobile-first: every layout is a single
  // stacked column by default; the wider arrangements switch on at >=560px.
  // Spacing is deliberately tight — no wasted gaps.
  const layout: TemplateLayout = normalizeLayout(advanced.layout);
  const hasResult = calcs.length > 0;
  // A unique scope so the responsive rules don't leak between embeds.
  const gridId = useMemo(
    () => 'advcalc-' + Math.random().toString(36).slice(2, 8),
    [],
  );

  // W-AO-6c — unique class to scope user-supplied customCss to this widget
  // instance (e.g. `.qq-widget-123 .qq-w-input { ... }`). Falls back to a
  // random suffix so the scope is still deterministic in preview / embed
  // contexts where the calculatorId prop isn't threaded.
  const widgetClass = useMemo(
    () => 'qq-widget-' + (calculatorId !== undefined ? String(calculatorId) : gridId),
    [calculatorId, gridId],
  );

  // W-AO-6c — body background composition. `bgMode === 'gradient' | 'image'`
  // overrides the resolved theme's body `bg`; absent / `solid` falls through
  // to the legacy behaviour so pre-AO-6c calculators render unchanged.
  let bodyBackground: string = c.bg;
  if (brandStudioUnlocked && bsBgMode === 'gradient') {
    const from = bsBgGradient?.from || c.bg;
    const to = bsBgGradient?.to || c.surface;
    bodyBackground = gradientCss(from, to, bsBgGradient?.direction);
  } else if (brandStudioUnlocked && bsBgMode === 'image' && bsBgImageUrl) {
    // Compose a linear-gradient tint overlay on top of the image so the
    // brand colour bleeds through at the configured opacity (0..50 %).
    const tintAlpha = bsBgImageTint / 100;
    const tintColor = bsBgImageTint > 0
      ? hexToRgba(c.bg, tintAlpha) : 'transparent';
    bodyBackground =
      `linear-gradient(${tintColor}, ${tintColor}), url("${bsBgImageUrl}") center / cover no-repeat`;
  }

  // W-AO-6c — result-panel overrides. Each field is optional and falls
  // through to the existing renderer default when absent. We compute the
  // tokens here so the JSX block below stays readable.
  const rpAccent = bsResultPanel?.accentOverride ?? accent;
  const rpBg = bsResultPanel?.bgOverride ?? c.result;
  const rpEmphasis: AdvResultEmphasis = bsResultPanel?.emphasis ?? 'normal';
  const rpBorderMode: AdvResultBorder = bsResultPanel?.border ?? 'subtle';
  const rpHeadlineWeight = rpEmphasis === 'bold' ? 900
    : rpEmphasis === 'subtle' ? 600 : 800;
  // Emphasis also nudges the headline font size — 0.9x for subtle, 1.1x for
  // bold. Renderer keeps the existing clamp() for normal so legacy widgets
  // look identical.
  const rpHeadlineFontSize = rpEmphasis === 'bold'
    ? 'clamp(30px, 6.2vw, 38px)'
    : rpEmphasis === 'subtle'
      ? 'clamp(22px, 4.6vw, 28px)'
      : 'clamp(26px, 5.5vw, 34px)';

  return (
    <div
      className={widgetClass}
      data-testid="advanced-calculator"
      data-field-style={fieldStyle}
      data-widget-width={widgetWidth ?? 'legacy'}
      data-widget-width-desktop={widgetWidthDesktopPx ?? ''}
      data-widget-width-mobile={widgetWidthMobilePx ?? ''}
      data-style-radius={radiusSet ? radiusValue : 'legacy'}
      data-qq-width-scope={gridId}
      data-logo-placement={logoPlacement ?? 'legacy'}
      data-logo-size={style.logoSize ?? 'legacy'}
      data-brand-studio={brandStudioUnlocked ? 'true' : 'false'}
      data-bg-mode={brandStudioUnlocked ? (bsBgMode ?? 'solid') : 'solid'}
      style={{
        background: c.surface, borderRadius: radiusOuterPx,
        border: `1px solid ${c.border}`, boxShadow: c.shadow,
        // BD-2a-sticky — `overflow: clip` (not `hidden`) so children with
        // `position: sticky` anchor to the page / iframe scroll container
        // instead of being trapped inside the outer card. `clip` still
        // visually clips square-cornered children against the rounded card,
        // but unlike `hidden` it does NOT establish a scroll container.
        overflow: 'clip', fontFamily,
        // W-AO-6b — Typography depth as CSS variables. `--qq-font-size-base`
        // sets the inherit-able body size; titles + small captions can still
        // pick their own values via the inline styles. fontWeight here drives
        // the body inheritance — the title bar explicitly overrides with
        // --qq-heading-weight where it counts.
        ['--qq-heading-weight' as string]: String(headingWeight),
        ['--qq-body-weight' as string]: String(bodyWeight),
        ['--qq-font-size-base' as string]: `${fontSizeBasePx}px`,
        fontWeight: bodyWeight,
        fontSize: `${fontSizeBasePx}px`,
        ...(maxWidthStyle ? { maxWidth: maxWidthStyle } : null),
        margin: '0 auto', width: '100%',
      }}
    >
      {/* ── BD-2a-sticky — Top sticky region ──
          Wraps the title bar + the stepper progress indicator in a single
          sticky container so they move as one unit. Anchored to the nearest
          scroll context (the page in inline-div embeds; the iframe top in
          iframe embeds). `top: 0; z-index: 40` sits above in-widget controls
          but well below the AI chat bubble (z-index 9998+). Background +
          1px hairline read as a separated bar when content scrolls under. */}
      <div
        data-testid="advanced-sticky-top"
        data-component-name="Sticky top"
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: c.surface,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
      {/* ── Title bar (its own separated bar) ── */}
      {(() => {
        const header = advanced.header || {};
        // W-AO-6b — `logoPlacement` (when set) takes precedence over the
        // legacy `header.align` for positioning the title row. `hidden`
        // suppresses the logo+default-icon entirely while the title text
        // still renders centered (matches the existing header.align
        // behaviour for a calculator with no logo).
        const align = logoPlacement === 'top-left' ? 'left'
          : logoPlacement === 'top-right' ? 'right'
          : logoPlacement === 'top-center' || logoPlacement === 'hidden' ? 'center'
          : header.align || 'center';
        const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const title = (header.title || '').trim() || businessName || 'Get a Quote';
        const subtitle = (header.subtitle || '').trim();
        const logoRadius = Math.min(Math.round(logoSizePx * 0.3), 12);
        return (
          <div
            data-component-name="Header"
            data-component-type="header"
            style={{ padding: '18px 24px', borderBottom: `1px solid ${c.border}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: justify, gap: '10px' }}>
              {/* W-AO-6b — `hidden` placement suppresses logo + default icon.
                  When a user has uploaded a logo it ALWAYS wins over the
                  template `defaultIcon` (per spec: "user's logo wins"). */}
              {logoHidden ? null : logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  data-testid="advanced-logo"
                  data-component-name="Logo"
                  data-component-type="logo"
                  style={{
                    width: logoSizePx, height: logoSizePx,
                    borderRadius: logoRadius, objectFit: 'contain',
                  }}
                />
              ) : advanced.defaultIcon ? (
                <div data-component-name="Logo icon" data-component-type="logo">
                  <DefaultLogoIcon name={advanced.defaultIcon} accent={c.accent} radius={eff.radiusMd} />
                </div>
              ) : null}
              <p
                data-testid="advanced-title"
                data-component-name="Title"
                data-component-type="title"
                style={{ fontSize: '17px', fontWeight: headingWeight, color: c.text, margin: 0, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {/* BD-2a / BD-1 — small category icon LEFT of the title text.
                    Sized 16–20px per the research punch list; derived from
                    `advanced.category` with optional per-template override via
                    `advanced.categoryIcon`. Brand logo (above, 36×36) keeps
                    its existing prominence — this is a complementary glyph,
                    not a replacement. */}
                <CategoryIcon
                  category={advanced.category}
                  override={advanced.categoryIcon}
                  size={18}
                  color={c.accent}
                  strokeWidth={2.25}
                />
                {title}
                {editableTitle && (
                  <span
                    aria-hidden="true"
                    data-testid="advanced-title-edit-hint"
                    title="Click to edit"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: 4,
                      color: c.textBody,
                      opacity: 0.55,
                      transition: 'opacity 0.12s ease',
                    }}
                  >
                    {/* lucide-style pencil glyph (small inline SVG, no
                        extra import on AdvancedCalculator). */}
                    <svg
                      width={12} height={12} viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth={2.4}
                      strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                  </span>
                )}
              </p>
            </div>
            {subtitle && (
              <p
                data-testid="advanced-subtitle"
                data-component-name="Subtitle"
                data-component-type="subtitle"
                style={{ fontSize: '13px', color: c.textBody, margin: '5px 0 0', textAlign: align, lineHeight: 1.5 }}
              >
                {subtitle}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Body ──
          Real CSS-Grid layouts, mobile-first. Base styles below are the
          narrow-screen single-column state; the scoped <style> block widens
          them at >=560px per layout:
            single-column — one column, result below.
            two-column    — inputs column + result column.
            multi-column  — a 3-up auto-fit input grid, result spans full width.
          Tight gaps throughout — no wasted vertical space. */}
      <style>{`
        /* Wave AC-1 — per-viewport pixel-width overrides, scoped to this
           calculator instance via the unique gridId. Empty when the user
           hasn't picked a pixel value — the widgetWidth enum (driving the
           inline maxWidth) still applies as the fallback. */
        ${widgetWidthMobilePx ? '@media (max-width: 559px) { [data-qq-width-scope="' + gridId + '"] { max-width: ' + widgetWidthMobilePx + 'px !important; } }' : ''}
        ${widgetWidthDesktopPx ? '@media (min-width: 560px) { [data-qq-width-scope="' + gridId + '"] { max-width: ' + widgetWidthDesktopPx + 'px !important; } }' : ''}
        .${gridId} {
          display: grid;
          gap: 12px;
          padding: 16px;
          grid-template-columns: 1fr;
        }
        .${gridId}-fields {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start;
          min-width: 0;
        }
        .${gridId}-fields > * { grid-column: span 2; min-width: 0; }
        .${gridId}-fields > [data-colspan="1"] { grid-column: span 1; }
        /* Very narrow screens — collapse all fields to a single column so a
           pair of side-by-side inputs stack cleanly on the smallest phones. */
        @media (max-width: 360px) {
          .${gridId}-fields > [data-colspan="1"] { grid-column: span 2; }
        }
        .${gridId}-result { align-self: start; min-width: 0; }
        @media (min-width: 560px) {
          .${gridId} { gap: 14px; padding: 20px; }
          .${gridId}[data-layout="two-column"] {
            grid-template-columns: 1fr minmax(190px, 0.8fr);
          }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 12px;
          }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields > * { grid-column: auto; }
        }
      `}</style>
      {/* BD-2b — trust strip. Renders BELOW the title bar and ABOVE the
          stepper progress indicator. Shows aggregate Google rating +
          Licensed/Insured pill + years-in-business pill when the business
          profile carries those fields. When the profile is undefined or
          all fields are empty, returns null (no placeholder copy). */}
      <TrustStripHeader
        profile={advanced.businessProfile}
        theme={c}
        fontFamily={fontFamily}
      />
      {/* BD-2a — stepper progress indicator. Rendered when the multi-step
          renderer is active (default for every template; owner can opt to
          single-form via Style tab → Step layout). The indicator sits
          ABOVE the body grid so it spans both columns of `two-column`
          layouts without disturbing their internal alignment. */}
      {useStepper && stepperList.length > 1 && (
        <CalculatorStepper
          steps={stepperList}
          current={stepIdx}
          theme={c}
          variant="bar"
        />
      )}
      </div>
      {/* ── /BD-2a-sticky top region ── */}
      <div className={gridId} data-layout={layout} data-testid="advanced-body"
        data-component-name="Body"
        data-component-type="body"
        data-step-index={useStepper ? stepIdx : 'single'}
        data-step-mode={useStepper ? (isContactStep ? 'contact' : 'data') : 'single'}
        style={{ background: bodyBackground }}>
        {/* Inputs — when the stepper is on the contact step, the fields
            section is replaced by the ContactStep (rendered further below
            so it shares the same column as the result panel on two-column
            layouts). On data steps we render `renderedFields` (the
            per-step slice of `visibleFields`). When the stepper is off
            we render the full `visibleFields` list (legacy behaviour). */}
        {!isContactStep && (
          <div
            className={`${gridId}-fields`}
            data-component-name="Fields"
            data-component-type="fields-section"
            data-qq-step-enter
          >
            {visibleFields.length === 0 && (
              <p style={{ fontSize: '14px', color: c.textBody, padding: '16px 0' }}>
                This calculator hasn't been set up yet.
              </p>
            )}
            {renderedFields.map((f) => (
              <div
                key={f.id}
                data-colspan={f.colSpan === 1 ? '1' : '2'}
                data-component-name={`Field: ${f.label || f.name || f.type}`}
                data-component-type={`field-${f.type}`}
                style={{ minWidth: 0 }}
              >
                <FieldInput
                  field={f}
                  value={answers[f.name]}
                  accent={accent}
                  theme={c}
                  radiusPx={radiusInnerPx}
                  fieldStyle={fieldStyle}
                  fontFamily={fontFamily}
                  onChange={(v) => setAnswer(f.name, v)}
                />
              </div>
            ))}
            {/* BD-2a-sticky — Back / Next controls moved into the bottom
                <StickyActionBar /> rendered as a sibling of the body grid.
                The controls now sit at the bottom edge of the viewport so
                a long step is still actionable without scrolling. */}
          </div>
        )}
        {/* BD-2a — Contact step content. Replaces the inputs section on
            the final (contact) step. Sits in the same grid column the
            inputs occupied so two-column layouts keep their visual rhythm.
            The result panel below stays visible so the user sees the
            quote alongside the contact form. */}
        {isContactStep && (
          <div
            data-component-name="Contact step container"
            data-component-type="contact-step-container"
            data-qq-step-enter
            style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
          >
            <ContactStep
              theme={c}
              fontFamily={fontFamily}
              radiusPx={radiusInnerPx}
              calculatorId={analyticsCalcId}
              bookingUrl={bookingUrl}
              ownerEmail={ownerEmail}
              requireAddress={advanced.requireAddress === true}
              serviceArea={advanced.businessProfile?.serviceArea}
              onAddressSelected={(sel) => {
                if (sel.postalCode) setCapturedZip(sel.postalCode);
              }}
              quoteHeadline={(() => {
                // BD-2b — when tiers are on, the contact-step headline echoes
                // the selected tier name + price ("Standard — $2,500"). When
                // tiers are off, it falls back to the single computed value
                // (legacy behaviour). Range mode still wraps the price when
                // enabled.
                const formatted = bsResultPanel?.range_mode?.enabled
                  ? formatResultRange(effectiveQuoteValue, resultCalc?.format || 'currency',
                      bsResultPanel.range_mode.band_pct ?? 8, advanced.numberFormat)
                  : formatResult(effectiveQuoteValue, resultCalc?.format || 'currency', advanced.numberFormat);
                return selectedTierLabel
                  ? `${selectedTierLabel} — ${formatted}`
                  : formatted;
              })()}
              quoteAmount={typeof effectiveQuoteValue === 'number' ? effectiveQuoteValue : undefined}
              answers={answers as Record<string, unknown>}
              initialName={leadName}
              initialEmail={leadEmail}
              initialPhone={contactPhone}
              onChange={(next) => {
                setLeadName(next.name);
                setLeadEmail(next.email);
                setContactPhone(next.phone);
                // BD-2c — capture address typed manually (no Places suggestion
                // was picked). This still lets the lead form ride along with
                // the address; the peer-anchor needs ZIP, not formatted address,
                // so we only set capturedZip via `onAddressSelected`.
              }}
              onEmailQuoteSent={() => { trackSubmit(); }}
              onBookingRequested={() => { trackSubmit(); }}
            />
            {/* BD-2a-sticky — Back control moved into the bottom
                <StickyActionBar />. The final-step hard CTAs (Email me /
                Book consultation) still live inside ContactStep above. */}
          </div>
        )}

        {/* Result panel — a separate rounded container.
         *
         * Wave L B2 — explicit flex column with a gap so the heading label
         * ("Estimated Total") and the big amount can't overlap on any
         * device / theme combination. Previously each `<p>` used only its
         * own margin which interacted poorly with the inline `lineHeight: 1.05`
         * on the amount — on mobile dark mode the labels were getting clipped.
         */}
        {hasResult && (
          <div
            className={`${gridId}-result`}
            data-testid="advanced-result-panel"
            data-component-name="Results panel"
            data-component-type="results"
            data-result-emphasis={rpEmphasis}
            data-result-border={rpBorderMode}
            style={{
              borderRadius: radiusResultPx, background: rpBg,
              // W-AO-6c — `border` token. `'none'` strips the border entirely;
              // `'accent'` uses the (possibly overridden) accent at 1.5px so
              // the panel reads as an emphasised CTA surface; `'subtle'`
              // (default) preserves the existing tinted/light behaviour.
              // W-AS-1c — `'accent-tinted'` renders the accent at ~22 % opacity
              // so the result panel reads as emphasised but not shouty —
              // midway between the hairline `'subtle'` and full `'accent'`.
              border: rpBorderMode === 'none'
                ? 'none'
                : rpBorderMode === 'accent'
                  ? `1.5px solid ${rpAccent}`
                  : rpBorderMode === 'accent-tinted'
                    ? `1.5px solid ${hexToRgba(rpAccent, 0.22)}`
                    : resultTinted ? 'none' : `1px solid ${c.border}`,
              boxShadow: c.shadow,
              padding: '20px',
              display: 'flex', flexDirection: 'column', gap: '10px',
              // Wave R-pre E — defensive against the reported "quoted amount
              // overlaps other content" — wrap long numeric values rather
              // than punching through the panel's right edge, and let the
              // panel grow rather than clipping.
              overflow: 'visible',
              minWidth: 0,
            }}
          >
            <p
              data-testid="advanced-result-heading"
              style={{
                position: 'relative', zIndex: 1,
                fontSize: '11px', fontWeight: 700, color: c.resultMuted,
                textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0,
                lineHeight: 1.3,
              }}
            >
              {resultHeading}
            </p>
            {/* BD-2b — when Good/Better/Best tiers are enabled the headline
                slot is REPLACED by the 3-card tier selector. The breakdown
                rows below still show the base-tier components so the user
                can see what's in each tier. When tiers are off, the legacy
                single-value headline rendering is preserved verbatim. */}
            {tieredConfig.enabled ? (
              <TierSelector
                tiers={tieredConfig.tiers}
                baseQuote={animatedHeadline}
                selectedIndex={selectedTierIndex}
                onSelect={setSelectedTierIndex}
                theme={c}
                fontFamily={fontFamily}
                radiusPx={radiusInnerPx}
                formatPrice={(value) =>
                  effectiveRangeMode?.enabled
                    ? formatResultRange(
                        value, resultCalc?.format || 'currency',
                        effectiveRangeMode.band_pct ?? 8, advanced.numberFormat,
                      )
                    : formatResult(value, resultCalc?.format || 'currency', advanced.numberFormat)
                }
              />
            ) : (
              <p data-testid="advanced-result" style={{
                position: 'relative', zIndex: 1,
                // W-AO-6c — emphasis tokens drive font-size + weight overrides.
                // Falls back to the legacy clamp(26-34) / weight 800 when the
                // Brand Studio `resultPanel.emphasis` is unset or 'normal'.
                fontSize: rpHeadlineFontSize,
                fontWeight: rpHeadlineWeight,
                // Accent override only affects the headline value colour when
                // an accentOverride is explicitly set (otherwise resultText
                // wins so the contrast logic stays correct on tinted panels).
                color: bsResultPanel?.accentOverride ? rpAccent : c.resultText,
                margin: 0, paddingTop: 0,
                fontFamily: eff.fontMono,
                lineHeight: 1.18,
                letterSpacing: '-0.015em',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}>
                {/* W-BB-3 — range-pricing display mode.
                    BD-2a — promoted from Pro/Brand-Studio-gated to a free-tier
                    default. The category-derivation helper sets
                    `range_mode.enabled = true` for every template that doesn't
                    ship its own `style:` block; owners can opt out per
                    template via Style tab → Brand Studio → Range mode. Falls
                    through to the legacy single-value format when explicitly
                    disabled OR when the resolved style carries no range_mode. */}
                {effectiveRangeMode?.enabled
                  ? formatResultRange(
                      animatedHeadline,
                      resultCalc?.format || 'currency',
                      effectiveRangeMode.band_pct ?? 8,
                      advanced.numberFormat,
                    )
                  : formatResult(animatedHeadline, resultCalc?.format || 'currency', advanced.numberFormat)}
              </p>
            )}
            {/* Wave H4 — optional caption beneath the headline value. */}
            {resultCalc?.caption && resultCalc.caption.trim() !== '' && (
              <p
                data-testid="advanced-result-caption"
                style={{
                  fontSize: '12px', color: c.resultMuted, margin: '4px 0 0',
                  lineHeight: 1.5,
                }}
              >
                {resultCalc.caption}
              </p>
            )}

            {/* BD-2c — Peer-anchor ZIP line. Renders directly below the
                headline (and caption, if present). Self-fetches; renders
                null when no ZIP has been captured. */}
            <PeerAnchorLine
              calculatorId={analyticsCalcId}
              zip={inferredZip}
              baseQuote={typeof headline === 'number' ? headline : undefined}
              theme={c}
              fontFamily={fontFamily}
              brandBlue={accent}
            />

            {showBreakdown && breakdown.length > 0 && (
              <div style={{
                marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${resultDivider}`,
                display: 'flex', flexDirection: 'column', gap: '9px',
              }}>
                {breakdown.map((cl) => (
                  <div
                    key={cl.id}
                    data-testid={`advanced-breakdown-${cl.id}`}
                    data-divider={cl.divider ? 'true' : 'false'}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '3px',
                      // Wave H4 — `divider: true` puts a thin rule above the row.
                      ...(cl.divider ? {
                        paddingTop: '9px',
                        borderTop: `1px solid ${resultDivider}`,
                      } : null),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: c.resultMuted }}>{cl.name}</span>
                      <span style={{ fontWeight: 700, color: c.resultText, fontFamily: eff.fontMono }}>
                        {formatResult(values[cl.name] ?? 0, cl.format, advanced.numberFormat)}
                      </span>
                    </div>
                    {cl.caption && cl.caption.trim() !== '' && (
                      <span
                        data-testid={`advanced-breakdown-caption-${cl.id}`}
                        style={{ fontSize: '11px', color: c.resultMuted, lineHeight: 1.4 }}
                      >
                        {cl.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p style={{
              fontSize: '11px', color: c.resultMuted, margin: '14px 0 0', lineHeight: 1.5,
            }}>
              {footnoteText}
            </p>

            {showCta && !useStepper && (
              // W-AO-6d — `key` is the leadView so React unmounts the
              // previous panel and remounts the new one on each step
              // change. That re-fires the entering animation declared in
              // the injected step-transition <style>. Pro-only; when
              // stepTransition === 'none' the rule below is empty and
              // the mount is instant (legacy behaviour).
              <div style={{ marginTop: '14px' }} key={`leadview-${leadView}`} data-qq-step-enter>
                {leadView === 'cta' && (
                  <button type="button" data-testid="advanced-cta"
                    data-component-name="CTA button"
                    data-component-type="cta"
                    onClick={() => setLeadView('form')}
                    style={{
                      width: '100%', height: '46px', borderRadius: radiusInnerPx, border: 'none',
                      background: ctaBg, color: ctaFg, fontSize: '14px', fontWeight: 800,
                      cursor: 'pointer', fontFamily, letterSpacing: '0.01em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                    }}>
                    {ctaLabel} <span style={{ fontSize: '16px' }}>→</span>
                  </button>
                )}

                {leadView === 'form' && (
                  <div
                    className="qq-lead-form-enter"
                    style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                    data-testid="advanced-lead-form"
                  >
                    {/* Wave R-pre v2 — back button to return from the
                     *  lead-capture form to the calculator inputs.
                     *  Previously the user could only progress; pressing
                     *  "Get a quote" was a one-way trip. */}
                    <button
                      type="button"
                      data-testid="advanced-cta-back"
                      onClick={() => setLeadView('cta')}
                      style={{
                        alignSelf: 'flex-start',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', marginBottom: '4px',
                        background: 'transparent',
                        color: c.resultMuted,
                        border: 'none',
                        fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', fontFamily,
                        borderRadius: 6,
                      }}
                      aria-label="Back to calculator"
                    >
                      <span aria-hidden="true">←</span> Back
                    </button>
                    <input data-testid="advanced-cta-name" type="text" placeholder="Your name"
                      value={leadName} onChange={(e) => setLeadName(e.target.value)}
                      style={leadInputStyle} />
                    <input data-testid="advanced-cta-email" type="email" placeholder="Email address"
                      value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)}
                      style={leadInputStyle} />
                    <button type="button" data-testid="advanced-cta-send"
                      onClick={() => {
                        if (leadReady) {
                          // W-BB-4 — fire conversion event before flipping
                          // the panel so a fast unmount doesn't drop the beacon.
                          trackSubmit();
                          setLeadView('done');
                        }
                      }}
                      style={{
                        width: '100%', height: '44px', borderRadius: radiusInnerPx, border: 'none',
                        background: ctaBg, color: ctaFg, fontSize: '14px', fontWeight: 800,
                        cursor: leadReady ? 'pointer' : 'default', opacity: leadReady ? 1 : 0.6,
                        fontFamily,
                      }}>
                      Send
                    </button>
                  </div>
                )}

                {leadView === 'done' && (
                  <div data-testid="advanced-cta-done" style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '11px 13px', borderRadius: eff.radiusMd,
                    background: resultTinted ? 'rgba(255,255,255,0.16)' : c.accentTint,
                  }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      background: ctaBg, color: ctaFg, fontSize: '12px', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: c.resultText }}>
                      Thanks — we’ll be in touch shortly.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* ── BD-2a-sticky — bottom sticky action bar with fold/unfold ──
          Sits as a sibling of the body grid so it's anchored to the bottom
          of the widget's scroll context. Houses the per-step primary
          actions (Back / Continue / See my quote) and a fold/unfold toggle
          backed by `qq-foot-fold-${calculatorId}` in localStorage. */}
      {useStepper && (() => {
        const microSummary = (() => {
          // BD-2b — micro-summary uses the EFFECTIVE quote value (tier-adjusted
          // when tiers are on, legacy headline otherwise) so a folded sticky bar
          // still shows the price the customer is committing to.
          const fmt = effectiveRangeMode?.enabled
            ? formatResultRange(
                effectiveQuoteValue, resultCalc?.format || 'currency',
                effectiveRangeMode.band_pct ?? 8, advanced.numberFormat,
              )
            : formatResult(effectiveQuoteValue, resultCalc?.format || 'currency', advanced.numberFormat);
          return selectedTierLabel
            ? `Est. ${fmt} · ${selectedTierLabel}`
            : `Est. ${fmt}`;
        })();
        return (
          <StickyActionBar
            theme={c}
            fontFamily={fontFamily}
            calculatorId={calculatorId}
            microSummary={microSummary}
            // BD-2b — inline trust signals beneath the action row (license #,
            // insured-up-to, icon row). Renders null when the business
            // profile is empty so the sticky bar stays compact.
            trustBlock={
              <TrustBlockUnderCTA
                profile={advanced.businessProfile}
                theme={c}
                fontFamily={fontFamily}
                testid="trust-block-sticky"
              />
            }
          >
            <StepperControls
              current={stepIdx}
              total={stepperList.length}
              theme={c}
              radiusPx={radiusInnerPx}
              fontFamily={fontFamily}
              nextLabel={
                stepIdx === dataSteps.length - 1
                  ? 'See my quote'
                  : selectedTierLabel
                    ? `Continue with ${selectedTierLabel}`
                    : 'Continue'
              }
              onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
              onNext={() => setStepIdx((i) => Math.min(stepperList.length - 1, i + 1))}
              hideNextOnFinal
            />
          </StickyActionBar>
        );
      })()}
      {/* W-AO-6c — Brand Studio custom CSS. Author-supplied text rendered
       *  inside a <style> tag and scoped to this widget's unique
       *  `.qq-widget-${id}` root class by prepending the scope selector
       *  to each rule. The CSS is NEVER executed as JS — React renders
       *  the content verbatim inside <style>, so the worst-case payload
       *  is invalid CSS that the browser silently drops. Same pattern
       *  Stripe / Linear use for tenant-supplied styling. */}
      {bsCustomCss.trim() !== '' && (
        <style data-testid="advanced-custom-css">
          {scopeCustomCss(bsCustomCss, widgetClass)}
        </style>
      )}
      {/* W-AO-6d — Brand Studio Wave 2 step-transition keyframes. Empty
       *  when `stepTransition === 'none'` so the existing instant
       *  behaviour is preserved. Scoped to the widget's unique
       *  `.qq-widget-${id}` class so transitions never leak. */}
      {stepTransition !== 'none' && (
        <style data-testid="advanced-step-transitions">
          {stepTransitionCss(widgetClass, stepTransition, stepDurationMs, reducedMotionRespect)}
        </style>
      )}
    </div>
  );
}

/**
 * W-AO-6c — prefix every CSS selector in `raw` with `.${scope}` so the
 * user's customCss can only target nodes inside their own widget root.
 *
 * Implementation: split on `}`, take the selector half of each rule
 * (text before the first `{`), prefix every comma-separated selector,
 * skip `@media` / `@supports` / `@keyframes` blocks (we just leave the
 * inner rules scoped instead — the outer at-rule passes through). This
 * is intentionally simple — a full CSS parser is overkill for a single-
 * tenant author input and the rendered output is still just text inside
 * a <style> tag, so a malformed rule is dropped by the browser, never
 * executed.
 */
function scopeCustomCss(raw: string, scope: string): string {
  // Strip the wizard's most common copy-paste hazard (a wrapping <style>
  // tag) so users who copy-paste a snippet don't blow up the renderer.
  const clean = raw.replace(/<\/?style[^>]*>/gi, '');
  // Walk rule by rule. We split on `}` to keep `@media (...) { ... }`
  // groups intact at the outer level — the prefixer recurses into the
  // inner body of those groups too.
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    buf += ch;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        out.push(prefixRuleBlock(buf, scope));
        buf = '';
      }
    }
  }
  // Anything left over (trailing whitespace, half-finished rule) — drop.
  return out.join('\n');
}

function prefixRuleBlock(block: string, scope: string): string {
  const trimmed = block.trim();
  if (trimmed === '' || trimmed === '}') return '';
  // @media / @supports / @keyframes — recurse into the inner body and
  // leave the outer at-rule alone (so `@media (max-width: …) { … }`
  // continues to gate the inner rules).
  if (trimmed.startsWith('@')) {
    const openIdx = trimmed.indexOf('{');
    if (openIdx === -1) return trimmed;
    const head = trimmed.slice(0, openIdx + 1);
    const inner = trimmed.slice(openIdx + 1, -1); // drop trailing `}`
    // @keyframes — selectors inside are `from`/`to`/`<percent>%`; not
    // selectors we should scope. Pass through.
    if (/^@(keyframes|font-face|charset|import|namespace)/i.test(trimmed)) {
      return trimmed;
    }
    return head + '\n' + scopeCustomCss(inner, scope) + '\n}';
  }
  const openIdx = trimmed.indexOf('{');
  if (openIdx === -1) return '';
  const selectorPart = trimmed.slice(0, openIdx).trim();
  const declarationPart = trimmed.slice(openIdx); // includes the `{...}`
  const prefixed = selectorPart
    .split(',')
    .map((sel) => {
      const s = sel.trim();
      if (s === '') return '';
      // `:root` / `html` / `body` — meaningless inside a scoped widget;
      // map them to the scope root so users still get the expected
      // "style the widget" behaviour.
      if (/^(:root|html|body)$/i.test(s)) return `.${scope}`;
      return `.${scope} ${s}`;
    })
    .filter(Boolean)
    .join(', ');
  return prefixed + ' ' + declarationPart;
}

/* ─── One field ─── */

function FieldInput({ field, value, accent, theme, onChange, radiusPx, fieldStyle, fontFamily }: {
  field: AdvField;
  value: Answer;
  accent: string;
  theme: WidgetTheme;
  onChange: (v: Answer) => void;
  /** Wave H5 — corner radius applied to inputs / cards. */
  radiusPx: string;
  /** Wave H5 — `filled` (default) vs `outline`. */
  fieldStyle: AdvFieldStyle;
  /** Wave H5 — resolved font stack. */
  fontFamily: string;
}) {
  const f = field;
  const c = theme;

  // Wave H5 — field style:
  //   filled   = themed surface fill, single-stroke border (the legacy look).
  //   outline  = transparent fill, thicker stroke so the input reads outlined
  //              against the body background. Both apply the user's radius.
  const isOutline = fieldStyle === 'outline';
  const inputBase: React.CSSProperties = {
    width: '100%', height: '44px', borderRadius: radiusPx,
    border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
    padding: '0 14px', fontSize: '14px',
    color: c.text,
    background: isOutline ? 'transparent' : c.surface,
    fontFamily, outline: 'none',
    boxSizing: 'border-box',
  };

  // Wave R-pre W-LABELS — Alex's global rule: titles INSIDE the field, not
  // above. We wrap text / number / select renderers with `.qq-w-float`
  // (defined in client/src/index.css) and expose the active theme via CSS
  // custom properties on the wrapper itself so the floating label respects
  // light / midnight / coral / sage / teal / blush themes (and any custom
  // Style-tab accent override).
  const floatVars: React.CSSProperties = {
    // CSS variables consumed by .qq-w-float in index.css.
    ['--qq-w-label' as any]: c.textMuted,
    ['--qq-w-label-focus' as any]: accent,
    ['--qq-w-bg' as any]: isOutline ? c.bg : c.surface,
  };

  if (f.type === 'heading') {
    return (
      <p style={{
        fontSize: '15px', fontWeight: 700, color: c.text, margin: '2px 0 0',
        paddingBottom: '7px', borderBottom: `1px solid ${c.border}`,
      }}>
        {f.label}
      </p>
    );
  }

  // Stable id so the `<label>` associates with its control (a11y).
  const inputId = `adv-field-${f.id || f.name?.replace(/[^a-z0-9]+/gi, '_') || 'x'}`;

  if (f.type === 'number') {
    return (
      <div className="qq-w-float" style={floatVars}>
        <input
          id={inputId}
          className="qq-w-input"
          type="number"
          value={value as number}
          min={f.min}
          max={f.max}
          step={f.step}
          placeholder=" "
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...inputBase, fontFamily: eff.fontMono }}
        />
        <label htmlFor={inputId}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div className="qq-w-float" style={floatVars}>
        <input
          id={inputId}
          className="qq-w-input"
          type="text"
          value={value as string}
          placeholder=" "
          onChange={(e) => onChange(e.target.value)}
          style={inputBase}
        />
        <label htmlFor={inputId}>{f.label}</label>
      </div>
    );
  }

  if (f.type === 'slider') {
    const min = f.min ?? 0, max = f.max ?? 100;
    return (
      <div>
        {/* Wave R-pre W-LABELS — slider can't float-label naturally, so we
            keep a small uppercase caption + the live numeric value chip on
            the right. Per Alex's rule we treat this as a "group caption"
            rather than a prominent above-the-input title. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{
            fontSize: '11px', fontWeight: 600, color: c.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{f.label}</span>
          <span style={{
            fontSize: '13px', fontWeight: 700, color: accent, fontFamily: eff.fontMono,
            background: c.accentTint, borderRadius: eff.radiusSm, padding: '3px 9px',
          }}>
            {String(value)}{f.unit ? ' ' + f.unit : ''}
          </span>
        </div>
        <input id={inputId} aria-label={f.label} type="range" min={min} max={max} step={f.step || 1} value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: accent }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: '2px',
          fontSize: '11px', color: c.textMuted, fontFamily: eff.fontMono,
        }}>
          <span>{min}{f.unit ? ' ' + f.unit : ''}</span>
          <span>{max}{f.unit ? ' ' + f.unit : ''}</span>
        </div>
      </div>
    );
  }

  if (f.type === 'toggle') {
    const on = value === true;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '12px 14px', borderRadius: radiusPx,
        background: isOutline ? 'transparent' : c.surface,
        border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: c.text }}>{f.label}</span>
        <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
          style={{
            width: '44px', height: '26px', borderRadius: '13px', border: 'none', flexShrink: 0,
            background: on ? accent : c.border, cursor: 'pointer', position: 'relative',
            transition: 'background 0.15s',
          }}>
          <span style={{
            position: 'absolute', top: '3px', left: on ? '21px' : '3px',
            width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>
    );
  }

  if (f.type === 'select') {
    return (
      <div className="qq-w-float" style={floatVars}>
        <select
          id={inputId}
          className="qq-w-input"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          style={inputBase}
        >
          {(f.options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <label htmlFor={inputId}>{f.label}</label>
      </div>
    );
  }

  if (f.type === 'radio') {
    // BD-2c — when ANY option carries `imageUrl`, switch to the image-card
    // renderer. Text-only options keep the legacy stacked-pill layout.
    const hasImageCards = (f.options || []).some((o: any) => !!o.imageUrl);
    if (hasImageCards) {
      return (
        <ImageRadioStep
          label={f.label}
          options={(f.options || []) as any}
          value={value as string}
          onChange={onChange}
          theme={c}
          radiusPx={radiusPx}
        />
      );
    }
    return (
      <div>
        <label style={groupHeaderStyle(c)}>{f.label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  padding: '11px 13px', borderRadius: radiusPx, cursor: 'pointer',
                  border: 'none',
                  background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                  boxShadow: sel ? `0 0 0 1.5px ${accent}`
                    : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
                }}>
                <span style={{
                  width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                  border: sel ? `5px solid ${accent}` : `2px solid ${c.border}`, background: c.surface,
                }} />
                <span style={{ fontSize: '14px', color: c.text }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (f.type === 'image_choice') {
    // Wave W-R4 — image-answer cards as a first-class field type. Per the
    // competitor audit this is the highest-engagement input for trade biz;
    // we render a responsive grid that flows 3-up on desktop (~≥440px row
    // space) and collapses to 2-up on mobile, with a per-card accent ring
    // for the selected state and a friendly emoji placeholder when no
    // image is uploaded yet. Tap target ≥44px (minHeight 120px covers it).
    return (
      <div>
        <label style={groupHeaderStyle(c)}>{f.label}</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
        }}>
          {(f.options || []).map((o) => {
            const sel = value === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange(o.id)}
                aria-pressed={sel}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  padding: '8px', minHeight: '120px',
                  borderRadius: radiusPx, cursor: 'pointer',
                  border: `2px solid ${sel ? accent : c.border}`,
                  background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                  textAlign: 'left',
                  transition: 'border-color 0.12s ease, background 0.12s ease',
                }}>
                <div style={{
                  width: '100%', aspectRatio: '4 / 3', borderRadius: eff.radiusSm,
                  background: c.bg, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {o.image
                    ? <img src={o.image} alt={o.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span aria-hidden="true" style={{ fontSize: '28px', color: c.textMuted }}>🏠</span>}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // multi_select
  const ids = Array.isArray(value) ? value : [];
  return (
    <div>
      <label style={groupHeaderStyle(c)}>{f.label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(f.options || []).map((o) => {
          const sel = ids.includes(o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => onChange(sel ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '11px 13px', borderRadius: radiusPx, cursor: 'pointer',
                border: 'none',
                background: sel ? c.accentTint : (isOutline ? 'transparent' : c.surface),
                boxShadow: sel ? `0 0 0 1.5px ${accent}`
                  : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? accent : c.surface, border: sel ? 'none' : `2px solid ${c.border}`,
                color: '#fff', fontSize: '12px', fontWeight: 700,
              }}>{sel ? '✓' : ''}</span>
              <span style={{ fontSize: '14px', color: c.text }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
