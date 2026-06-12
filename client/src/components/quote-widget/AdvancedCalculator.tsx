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
  type TemplateRateMatrix,
  resolveTieredConfig,
  inlineElementStyleToCss,
  parseVideoEmbedSrc,
} from '@shared/templatePresets';
import { eff } from './designTokens';
import { resolveWidgetTheme, type WidgetTheme } from './widgetThemes';
import { useCountUp } from './useCountUp';
// BD-3l — Premium Animations Pack (Pro tier). Provider + leaf
// components live in PremiumAnimations.tsx; CSS keyframes are loaded
// transitively via that module. Free-tier widgets pay zero cost — the
// CSS rules are gated behind `data-qq-premium="on"`.
import {
  FlipCard,
  ConfettiBurst,
} from './PremiumAnimations';
import { useCalculatorAnalytics } from './useCalculatorAnalytics';
// Wave W-AH-2 / W-AI-3a — canonical icon map lives in `client/src/data/quoteQuickIcons.ts`
// so the admin trade editor's icon picker shares the exact same finite set.
// Explicit named imports keep Vite's tree-shaker happy — DO NOT switch to
// `import * as LucideIcons from 'lucide-react'` (pulls the full set into the bundle).
import { getQuoteQuickIcon } from '@/data/quoteQuickIcons';
/* P2 UX — deposit badge icon picker. Explicit named imports keep
 * Vite's tree-shaker happy; the icons match `AdvDepositIconName` 1:1
 * and the renderer falls back to `Lock` for unknown names. */
import {
  Lock as LucideLock, Shield as LucideShield, ShieldCheck as LucideShieldCheck,
  Check as LucideCheck, CheckCircle as LucideCheckCircle,
  Calendar as LucideCalendar, Clock as LucideClock,
  BadgeCheck as LucideBadgeCheck, FileCheck as LucideFileCheck,
  Award as LucideAward,
  type LucideIcon,
} from 'lucide-react';
// BD-2a — multi-step renderer, header category icon, final-step contact capture.
import CategoryIcon from './CategoryIcon';
import CalculatorStepper, { StepperControls } from './CalculatorStepper';
import ContactStep from './ContactStep';
// Short modal lead-capture opened by the primary CTA (name / phone / email).
import LeadModal, { type Lead } from './LeadModal';
// BD-2b — Good/Better/Best tier selector + inline trust signals.
import TierSelector from './TierSelector';
import TrustBlockUnderCTA from './TrustBlockUnderCTA';
// BF-9 — pre-curated trust-badge pill row (Licensed & Insured, BBB, etc.).
// P2 UX — TrustBadgeRow is now the single trust strip; the old
// TrustStripHeader was retired because both rendered overlapping content.
// Business-profile fields (license #) are folded into TrustBadgeRow.
import TrustBadgeRow from './TrustBadgeRow';
import WidgetSelect from './WidgetSelect';
// PRICING-MODELS (U2) — the 3 computed-token field renderers. Each owns its
// hooks (so FieldInput never calls hooks conditionally) and its answer-shape
// type guard; the value plumbing below (defaultAnswer / rawFieldValue /
// answerInvalid) consumes the guards.
import DistanceField, {
  isDistanceAnswer, MILES_TO_KM, type DistanceAnswer,
} from './DistanceField';
import MatrixField, {
  isMatrixAnswer, resolveMatrixRate, type MatrixAnswer,
} from './MatrixField';
import PhotoUploadField, { isPhotoAnswer, type PhotoAnswer } from './PhotoUploadField';
// BD-2c — image-card radio + ZIP peer-anchor + AI chat visibility gate.
import ImageRadioStep from './ImageRadioStep';
import PeerAnchorLine from './PeerAnchorLine';
// BD-3d Feature 1 — sanitize rich HTML before dangerouslySetInnerHTML on the
// owner-configured heading/footer/title/subtitle copy. Defense-in-depth: the
// wizard also sanitizes on write, so this is a second pass at render time.
import { sanitizeRichHtml, richHtmlToPlainText } from '@/components/wizard/elfsight/richTextSanitize';
// CONTRAST-1 — runtime contrast guard. Every text/background pair that
// reaches the renderer is funneled through `guardTextColor` so the widget
// is self-healing against bright-on-bright Brand Studio picks. The
// original user-saved tokens are NOT mutated — only the final rendered
// colour is corrected. See `client/src/lib/contrastGuard.ts`.
import { guardTextColor, getRelativeLuminance, darkenBgForWhiteText, darkenBgForTextColor } from '@/lib/contrastGuard';

/**
 * BD-3d — owner-configured heading/footer/title/subtitle may be rich HTML
 * (B/I/U, font-size, color, emoji, inline image). Plain strings (the
 * overwhelming majority of historic configs) are returned untouched; any
 * payload containing tags goes through the sanitizer and renders via
 * dangerouslySetInnerHTML. The check is purely textual — anything with `<`
 * is treated as candidate HTML.
 */
function richTextRenderProps(raw: string): { __html?: string; text?: string } {
  if (!raw) return { text: '' };
  if (raw.indexOf('<') < 0) return { text: raw };
  const safe = sanitizeRichHtml(raw);
  // If sanitization stripped everything to plain text (no tags survived),
  // emit as text — keeps the DOM identical to the legacy path.
  if (safe.indexOf('<') < 0) return { text: richHtmlToPlainText(safe) };
  return { __html: safe };
}

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
      data-theme="light"
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
  // BD-3f Item 4 — `style.secondary` was unused at render time; the Style-tab
  // picker has been removed. Field stays on the type for forward compat.
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
  type: 'number' | 'slider' | 'select' | 'radio' | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading'
    // COMPONENTS-1 — Wave U-F1. Display-only types (paragraph / divider /
    // image) carry no answer; the renderer emits inline JSX for them.
    | 'paragraph' | 'divider' | 'image'
    // BUILDER-COMPONENTS — content/CTA components (button / link). No answer;
    // emitted as inline JSX and excluded from the formula context.
    | 'button' | 'link'
    // FIELD-PALETTE — video embed (YouTube / Vimeo). No answer; emitted as an
    // inline 16:9 iframe and excluded from the formula context.
    | 'video'
    // WIZARD-GAPS — contact form. No quote answer; renders an inline
    // name + email + message block that submits via the existing /api/leads
    // path and is excluded from the formula context.
    | 'contact_form'
    // PRICING-MODELS (U0 — type union only; the renderer branches +
    // rawFieldValue/defaultAnswer handling land in U2). Until U2 ships, the
    // existing if-chains fall through safely (contributes the neutral value).
    | 'address_distance' | 'rate_matrix' | 'photo_upload';
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
  /**
   * CONDITIONAL-FIELDS-1 — conditional visibility. See `TemplateField.show_if`
   * in shared/templatePresets.ts for the authoring docs. When set, the field
   * renders only while the rule passes against the current answers; when it
   * fails the field is dropped from the layout AND contributes a neutral value
   * to the formula context (never a stale answer). Absent → always shown.
   */
  show_if?: {
    field: string;
    op: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
    value: string | number;
  };
  /** Optional grid column span (1 = half width, 2 = full width). */
  colSpan?: 1 | 2;
  // COMPONENTS-1 — see `TemplateField` in shared/templatePresets.ts for full
  // docs. These are echoed onto AdvField so the runtime renderer can read
  // them straight off the persisted config without an intermediate cast.
  placeholder?: string;
  maxLength?: number;
  validation?: 'none' | 'email' | 'phone' | 'url';
  minSelect?: number;
  maxSelect?: number;
  content?: string;
  dividerThickness?: 1 | 2;
  dividerTone?: 'subtle' | 'accent' | 'brand';
  imageUrl?: string;
  imageCaption?: string;
  imageAlt?: string;
  // BUILDER-COMPONENTS — button / link destination. See `TemplateField` in
  // shared/templatePresets.ts for the authoring docs. Echoed onto AdvField so
  // the renderer reads them straight off the persisted config.
  href?: string;
  buttonAction?: 'url' | 'tel' | 'mailto';
  // FIELD-PALETTE — video embed source + caption. See `TemplateField` in
  // shared/templatePresets.ts for the authoring docs. Echoed onto AdvField so
  // the renderer reads them straight off the persisted config.
  videoUrl?: string;
  videoCaption?: string;
  // WIZARD-GAPS — contact form. Which of name/email/message are required.
  // See `TemplateField.contactRequire` in shared/templatePresets.ts. Echoed
  // onto AdvField so the renderer reads it straight off the persisted config.
  contactRequire?: Array<'name' | 'email' | 'message'>;
  // PRICING-MODELS (U2) — config slots for the 3 computed-token types. See
  // `TemplateField` in shared/templatePresets.ts (U0) for the authoring docs.
  // Echoed onto AdvField so the renderer reads them off the persisted config.
  /** address_distance — display/contribution unit ('miles' default | 'km'). */
  distanceUnit?: 'miles' | 'km';
  /** address_distance — double the contributed distance. */
  roundTrip?: boolean;
  /** address_distance — beyond this → "outside our service area" (lead still
   *  captures; quote_amount nulls). Always in MILES. */
  maxDistanceMiles?: number;
  /** address_distance — manual "Distance in miles" fallback (default true). */
  allowManualDistance?: boolean;
  /** rate_matrix — the row × col rate table (rates resolve client-side). */
  matrix?: TemplateRateMatrix;
  /** photo_upload — max photos (default 3, clamped 1–5 at render time). */
  maxPhotos?: number;
  /** photo_upload — per-photo MB cap (default 8; server enforces too). */
  maxPhotoMb?: number;
  /**
   * Wave 61 — per-element cosmetic style overrides. Authored via the
   * floating <InlineStyleToolbar /> in the wizard preview. The renderer
   * spreads `inlineElementStyleToCss(f.inlineStyle)` into the field
   * wrapper's inline style; sub-fields are independently optional.
   */
  inlineStyle?: import('@shared/templatePresets').InlineElementStyle;
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
interface AdvResults { heading?: string; footnote?: string; show_breakdown?: boolean; cta_label?: string; cta_heading?: string; cta_sub?: string;
  /** Action tab — success line shown in the lead modal after submit. Absent →
   *  LeadModal's built-in default copy. */
  submit_success?: string; }
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
  /**
   * BF-9 — pre-curated trust badges shown as a pill row above the stepper.
   * Pre-populated by `shared/templatePresets.ts` per category/trade; the
   * owner can override via the Style tab.
   */
  trustBadges?: readonly import('@shared/templatePresets').TrustBadge[];
  /**
   * Action tab — Spam protection. Client-side honeypot on the lead modal.
   * Absent / `true` → ON (protect by default); `false` → OFF. Drives the
   * LeadModal `honeypot` prop. No backend involvement.
   */
  spamProtection?: boolean;
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
  /** When true, the widget body connects to a brand bar above it: the root's
   *  TOP corners go flat (the brand bar supplies the rounded top), so the two
   *  read as one continuous rounded unit. */
  connectedTop?: boolean;
}

/** W-AO-6c — Brand Studio used to be Pro-only.
 *
 *  Wave 57 — strategic gating pivot. Brand Studio (custom CSS, gradient
 *  backgrounds, image backgrounds, animation bundle, result-panel
 *  overrides, button copy, premium animations) is now a BUILDER-TIME
 *  free feature. The renderer therefore always honours the persisted
 *  values regardless of plan tier. The "Powered by WeFixTrades" badge
 *  in `branding.showPoweredBy` is the only remaining OUTCOME gate and
 *  is enforced separately (see `showPoweredByBadge` below + the server
 *  strip in calculatorRoutes.ts).
 *
 *  Note: the `planTier` parameter is still consumed by callers — kept
 *  for the signature stability + so the function can re-tighten later
 *  if a specific Brand Studio sub-feature ever needs to go back behind
 *  the paywall (a single line change here covers the whole renderer).
 */
function isBrandStudioTier(_planTier: string | undefined): boolean {
  return true;
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

// PRICING-MODELS (U2) — the 3 computed-token types persist OBJECT answers
// (defined + type-guarded in their component files) that ride the lead's
// `answers` jsonb untouched. Every other consumer (inferredZip, show_if
// coercion, breakdown) already skips / string-coerces non-primitive values.
type Answer = number | string | boolean | string[]
  | DistanceAnswer | MatrixAnswer | PhotoAnswer;

/** The default answer for a single field. */
function defaultAnswer(f: AdvField): Answer {
  if (f.type === 'number' || f.type === 'slider') return f.default_value ?? f.min ?? 0;
  if (f.type === 'toggle') return false;
  if (f.type === 'multi_select') return [];
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') return f.options?.[0]?.id ?? '';
  // PRICING-MODELS (U2) — object answers start empty/unselected. A single-
  // axis matrix (one row or one col) pins the trivial axis to its only id so
  // the renderer can show just one dropdown and still resolve a cell.
  if (f.type === 'address_distance') {
    return { address: '', distanceMiles: null, status: 'idle' } satisfies DistanceAnswer;
  }
  if (f.type === 'rate_matrix') {
    return {
      rowId: f.matrix && f.matrix.rows.length === 1 ? f.matrix.rows[0].id : '',
      colId: f.matrix && f.matrix.cols.length === 1 ? f.matrix.cols[0].id : '',
    } satisfies MatrixAnswer;
  }
  if (f.type === 'photo_upload') return { photos: [] } satisfies PhotoAnswer;
  // COMPONENTS-1 — display-only fields (paragraph / divider / image) and
  // the heading field render JSX with no persisted customer value. An
  // empty string is the safest neutral so downstream consumers (formula
  // engine, breakdown serialisation) treat them as a no-op.
  return '';
}

/**
 * True when a stored answer is STRUCTURALLY wrong for its field — the
 * reset-worthy condition the `[fields]` sync effect acts on (replace with
 * `defaultAnswer`). Covers: missing answers, select-family answers whose
 * option id no longer exists, and (U2) object answers whose shape is
 * malformed or whose matrix row/col ids went stale after a template swap.
 */
function answerMalformed(f: AdvField, value: Answer): boolean {
  if (value === undefined) return true;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return !(f.options || []).some((o) => o.id === value);
  }
  // PRICING-MODELS (U2) — object-shape + stale-id checks. An IN-PROGRESS
  // answer (row picked, col pending; address typed, lookup in flight) is NOT
  // malformed — resetting it would clobber live customer input whenever the
  // field list identity changes (every keystroke in the wizard editor).
  if (f.type === 'address_distance') return !isDistanceAnswer(value);
  if (f.type === 'rate_matrix') {
    if (!isMatrixAnswer(value)) return true;
    const m = f.matrix;
    if (value.rowId && m && !m.rows.some((r) => r.id === value.rowId)) return true;
    if (value.colId && m && !m.cols.some((col) => col.id === value.colId)) return true;
    return false;
  }
  if (f.type === 'photo_upload') return !isPhotoAnswer(value);
  return false;
}

/**
 * True when a stored answer is no longer valid for its field. Superset of
 * {@link answerMalformed}: for the U2 types it ALSO reports required-but-
 * incomplete answers (distance needs a resolved or manual value, matrix
 * needs both selections, photo needs ≥1 upload) so step/submit gating can
 * consume one predicate. The reset effect deliberately uses
 * `answerMalformed` instead — incomplete ≠ reset-worthy.
 */
export function answerInvalid(f: AdvField, value: Answer): boolean {
  if (answerMalformed(f, value)) return true;
  if (!f.required) return false;
  if (f.type === 'address_distance') {
    const a = value as DistanceAnswer;
    return !(typeof a.distanceMiles === 'number' && isFinite(a.distanceMiles));
  }
  if (f.type === 'rate_matrix') {
    const a = value as MatrixAnswer;
    return !(a.rowId && a.colId);
  }
  if (f.type === 'photo_upload') {
    return (value as PhotoAnswer).photos.length === 0;
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
  // COMPONENTS-1 — display-only field types (heading + new
  // paragraph/divider/image) contribute nothing to the formula context.
  // Text inputs flow through as their string value (formula engine
  // already coerces strings to 0 when summed).
  if (f.type === 'heading' || f.type === 'paragraph'
      || f.type === 'divider' || f.type === 'image'
      // BUILDER-COMPONENTS — button / link are content-only; never feed the calc.
      || f.type === 'button' || f.type === 'link'
      // FIELD-PALETTE — video embed is content-only; never feeds the calc.
      || f.type === 'video'
      // WIZARD-GAPS — contact form is content-only; never feeds the calc.
      || f.type === 'contact_form'
      // PRICING-MODELS (U2) — photos are answer-only (ride the lead's
      // `answers` jsonb); they never feed the calc.
      || f.type === 'photo_upload') return 0;
  // PRICING-MODELS (U2) — address_distance contributes the resolved (or
  // manual) distance in the field's DISPLAY unit so `[Distance]*3` means
  // $3/mile or $3/km per the owner's setting; ×2 when roundTrip. Unresolved
  // → 0 (neutral) so the total never NaNs mid-lookup.
  if (f.type === 'address_distance') {
    if (!isDistanceAnswer(v) || typeof v.distanceMiles !== 'number' || !isFinite(v.distanceMiles)) {
      return 0;
    }
    const unitValue = f.distanceUnit === 'km' ? v.distanceMiles * MILES_TO_KM : v.distanceMiles;
    return (f.roundTrip ? 2 : 1) * unitValue;
  }
  // PRICING-MODELS (U2) — rate_matrix contributes the client-resolved lane
  // rate. Unselected OR missing cell → 0; the custom_quote missing-cell rule
  // additionally nulls the lead's quote_amount (see quoteSuppressed below) —
  // the formula itself always gets a finite number.
  if (f.type === 'rate_matrix') {
    if (!isMatrixAnswer(v)) return 0;
    const rate = resolveMatrixRate(f.matrix, v);
    return typeof rate === 'number' ? rate : 0;
  }
  if (f.type === 'number' || f.type === 'slider') return Number(v) || 0;
  if (f.type === 'text') return String(v ?? '');
  if (f.type === 'toggle') return v ? (f.on_value ?? 1) : 0;
  if (f.type === 'select' || f.type === 'radio' || f.type === 'image_choice') {
    return f.options?.find((o) => o.id === v)?.value ?? 0;
  }
  const ids = Array.isArray(v) ? v : [];
  return (f.options || []).filter((o) => ids.includes(o.id)).map((o) => o.value);
}

/** The value a hidden field contributes — neutral so formulas ignore it.
 *  (U2: a `show_if`-hidden address_distance / rate_matrix lands in the
 *  default 0 branch, so a hidden computed field contributes exactly 0.) */
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

/**
 * CONDITIONAL-FIELDS-1 — evaluate a field's `show_if` rule against the
 * current answers. Pure + side-effect-free so it re-runs cleanly on every
 * answer change (the renderer already re-derives on state change).
 *
 * The rule's `field` is the CONTROLLING field's `id`; we resolve it to the
 * answer (keyed by the controlling field's `name`). Comparison reads the
 * RAW answer, not the formula contribution:
 *   - select / radio / image_choice → the selected OPTION ID (string)
 *   - number / slider               → the number
 *   - toggle                        → coerced to 1 / 0 so a `value: 1` rule works
 *   - multi_select                  → the array of selected option ids
 *
 * Semantics:
 *   - No `show_if`            → visible.
 *   - Controller not found    → visible (fail-open; a dangling ref must not
 *                               permanently hide a field the owner can see in
 *                               the editor).
 *   - Controller unanswered   → eq/gt/lt/gte/lte/contains are FALSE (hidden);
 *                               `ne` is TRUE (an absent answer is "not equal").
 *
 * `eq` / `ne` compare loosely-by-string so `'premium' === 'premium'` and
 * `value: 1` matches a numeric `1`. `gt/lt/gte/lte` are numeric. `contains`
 * is substring (string answer) or membership (multi_select array answer).
 */
function isFieldVisible(
  field: AdvField,
  fieldsById: Map<string, AdvField>,
  answers: Record<string, Answer>,
): boolean {
  const rule = field.show_if;
  if (!rule) return true;
  const ctrl = fieldsById.get(rule.field);
  if (!ctrl) return true; // dangling reference → fail open.

  const answer = answers[ctrl.name];
  const unanswered =
    answer === undefined || answer === null || answer === ''
    || (Array.isArray(answer) && answer.length === 0);

  switch (rule.op) {
    case 'eq':
      if (unanswered) return false;
      return looseEquals(answer, rule.value);
    case 'ne':
      if (unanswered) return true;
      return !looseEquals(answer, rule.value);
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte': {
      if (unanswered) return false;
      const a = answerToNumber(answer);
      const b = Number(rule.value);
      if (!isFinite(a) || !isFinite(b)) return false;
      if (rule.op === 'gt') return a > b;
      if (rule.op === 'lt') return a < b;
      if (rule.op === 'gte') return a >= b;
      return a <= b;
    }
    case 'contains': {
      if (unanswered) return false;
      const needle = String(rule.value);
      if (Array.isArray(answer)) return answer.map(String).includes(needle);
      return String(answer).includes(needle);
    }
    default:
      return true;
  }
}

/** Loose equality for show_if eq/ne — compares by string so `1` == `'1'`
 *  and `true`/toggle answers coerce predictably. */
function looseEquals(answer: Answer, value: string | number): boolean {
  if (typeof answer === 'boolean') {
    // Toggle answers compare against 1/0 (or 'true'/'false').
    const n = answer ? 1 : 0;
    return String(n) === String(value) || String(answer) === String(value);
  }
  return String(answer) === String(value);
}

/** Coerce a raw answer to a number for the numeric show_if operators. */
function answerToNumber(answer: Answer): number {
  if (typeof answer === 'number') return answer;
  if (typeof answer === 'boolean') return answer ? 1 : 0;
  if (Array.isArray(answer)) return answer.length;
  const n = parseFloat(String(answer));
  return isFinite(n) ? n : NaN;
}

/** P2 UX — deposit-badge icon name → lucide component. Mirrors the
 *  whitelist in `shared/templatePresets.ts:AdvDepositIconName`. Unknown
 *  / absent names fall back to `Lock` at the call site. */
const DEPOSIT_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Lock: LucideLock,
  Shield: LucideShield,
  ShieldCheck: LucideShieldCheck,
  Check: LucideCheck,
  CheckCircle: LucideCheckCircle,
  Calendar: LucideCalendar,
  Clock: LucideClock,
  BadgeCheck: LucideBadgeCheck,
  FileCheck: LucideFileCheck,
  Award: LucideAward,
};

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
/** Luminance test on the FIRST colour of a (possibly gradient) background
 *  string. Templates carry different body gradients — some light, some dark,
 *  independent of the theme — so a fixed label colour goes invisible on half
 *  of them. This lets the group label adapt. */
function bodyIsDarkBg(bg: string | undefined): boolean {
  if (!bg) return true;
  const rgb = bg.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  let r = 22, g = 26, b = 35;
  if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
  else {
    const hex = bg.match(/#([0-9a-fA-F]{6})/);
    if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

// Add-ons-label fix — grouped fields (radio / multi-select / image_choice /
// slider / toggle) can't host a floating in-field label, so they render this
// caption above the control. The caption was previously a tiny (11px) grey,
// CENTERED chip — which read as "under-styled" next to the proper field labels
// on sibling inputs (Service type / Quantity get the blue resting field label,
// left-aligned, 13px). Normalise it to MATCH the field-label treatment: same
// resting field-label colour (theme-aware, contrast-guarded — passed in by the
// caller as `labelColor`, which is `restingLabelColor` = guarded `textBody`),
// same left alignment, same weight. This makes "Add-ons" sit consistently with
// its sibling field labels instead of looking like a different, lesser element.
const groupHeaderStyle = (
  c: WidgetTheme, bodyIsDark: boolean, labelColor?: string,
): React.CSSProperties => {
  // Prefer the field-label resting colour the caller resolved (matches the
  // floated/resting label on sibling single-input fields). Fall back to the
  // body-bg-adaptive choice when a caller doesn't pass one — still readable on
  // light AND dark bodies, run through the contrast guard either way.
  const resolved = labelColor ?? guardTextColor(
    bodyIsDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)',
    c.bg,
    'groupHeader',
  );
  return {
  fontSize: '13px', fontWeight: 700,
  color: resolved,
  // Mirror the resolved colour into a CSS var so the editor-dark-mode override
  // (index.css `.qq-w-grouplabel`) can re-assert it past the editor chrome's
  // blanket `label { color: var(--qq-text) !important }` rule, which would
  // otherwise paint this caption near-white on the light widget surface.
  ['--qq-w-grouplabel' as any]: resolved,
  display: 'block',
  // Sentence case (natural config casing) to MATCH the stacked select labels —
  // every field/group caption in the widget now uses one consistent treatment.
  // Left-aligned to match the field labels on sibling inputs (was centered).
  marginBottom: '8px', letterSpacing: '-0.005em',
  textAlign: 'left',
  } as React.CSSProperties;
};

/**
 * BD-2a-sticky — bottom-stuck action footer.
 *
 * The primary action buttons (Back / Next / Submit, or the contact step's
 * hard CTAs) are ALWAYS visible — the bar never hides the CTA. On desktop
 * (>=480px) the full bar always shows with no chevron. On narrow mobile
 * (<480px) a chevron collapses ONLY the reassurance rows (trust block +
 * "Powered by") into a compact running-estimate strip
 * (`Est. $2,400 – $2,800`) so the bar doesn't gobble the screen; tapping the
 * strip or the chevron restores them. The buttons stay put either way.
 *
 * Persisted: fold state writes to `localStorage` under
 * `qq-foot-fold-${calculatorId}` so a returning mobile customer sees their
 * preference. Default = folded on first mobile visit (BH-1), unfolded otherwise.
 *
 * iOS safe area: bottom padding uses
 * `max(12px, env(safe-area-inset-bottom))` so the bar clears the home
 * indicator on iOS Safari + PWA installs.
 */
function StickyActionBar({
  theme, fontFamily, calculatorId, microSummary, children, trustBlock, footerSlot, radiusPx,
}: {
  theme: WidgetTheme;
  fontFamily: string;
  /** Used to derive the localStorage key. When absent, fold state is in-memory only. */
  calculatorId?: string | number;
  /** Outer widget radius so the bottom of the bar rounds to match the card. */
  radiusPx?: number | string;
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
  /**
   * BD-3k — optional footer slot rendered at the very bottom of the
   * expanded sticky bar (below the action row + trust block). Used for
   * the "Powered by WeFixTrades" badge so it doesn't compete with the
   * primary CTA. Folded micro-summary stays clean (slot is hidden).
   */
  footerSlot?: React.ReactNode;
}) {
  const storageKey = calculatorId !== undefined
    ? `qq-foot-fold-${calculatorId}` : null;

  // Lazy init from localStorage so the first paint matches the persisted
  // preference (avoids a flash from default→stored). Guarded for SSR.
  //
  // BH-1 — mobile-default-fold (Drift / Intercom / Calendly pattern):
  // when there's no saved preference AND the viewport is < 480 px wide,
  // start FOLDED so the sticky action bar doesn't gobble half the screen
  // on first visit. Saved preferences (from a returning customer or a
  // user who explicitly toggled state) always win — we only override the
  // implicit "no preference yet" default.
  const [folded, setFolded] = useState<boolean>(() => {
    if (!storageKey || typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
      // No saved preference — fall through to viewport-derived default.
    } catch { /* ignore — fall through */ }
    try {
      return typeof window.innerWidth === 'number' && window.innerWidth < 480;
    } catch { return false; }
  });

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try { window.localStorage.setItem(storageKey, folded ? '1' : '0'); }
    catch { /* quota / private mode — ignore */ }
  }, [folded, storageKey]);

  // BH-2 — desktop never folds. The fold affordance only exists on narrow
  // (<480px) viewports where the reassurance rows would otherwise gobble the
  // screen. On desktop the full bar always shows (no chevron). Live-tracked so
  // a resize across the breakpoint flips behaviour without a reload.
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 479px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 479px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The primary actions (Back / Continue) are ALWAYS rendered — the fold only
  // ever collapses the reassurance rows (trust block + "Powered by"), never the
  // CTA. On mobile, folded swaps those rows for the compact estimate strip.
  const showFoldToggle = isMobile;
  const showDetail = !isMobile || !folded;

  return (
    <div
      data-testid="advanced-sticky-bottom"
      data-component-name="Sticky bottom"
      data-folded={isMobile && folded ? 'true' : 'false'}
      style={{
        position: 'sticky', bottom: 0, zIndex: 40,
        background: theme.surface,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        // iOS safe area — clears the home indicator on Safari + PWA.
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop: 12,
        paddingLeft: 14, paddingRight: 14,
        // Footer fills flush to the widget edges; its bottom corners round to
        // the SAME radius as the outer card so the footer's corner IS the
        // widget's corner — nothing shows behind it.
        borderBottomLeftRadius: radiusPx,
        borderBottomRightRadius: radiusPx,
        fontFamily,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
          {showFoldToggle && (
            <button
              type="button"
              data-testid="advanced-sticky-bottom-fold"
              onClick={() => setFolded((f) => !f)}
              aria-expanded={!folded}
              aria-label={folded ? 'Show details' : 'Hide details'}
              style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: theme.textMuted,
              }}
            >
              {/* chevron-down when expanded (click to hide), up when folded (click to show) */}
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 180ms ease', transform: folded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
        {showDetail ? (
          <>
            {/* BD-2b — trust block (license #, insured-up-to, icon row) + BD-3k
                footer slot ("Powered by WeFixTrades"). On desktop these always
                show; on mobile they collapse behind the chevron. */}
            {trustBlock}
            {footerSlot}
          </>
        ) : (
          /* Folded (mobile only) — compact running-estimate strip; tap to expand. */
          <button
            type="button"
            data-testid="advanced-sticky-bottom-summary"
            onClick={() => setFolded(false)}
            aria-label={`${microSummary} — show details`}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 0, color: theme.textBody, fontFamily,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
            }}
          >
            {microSummary}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * BD-3k — Deposit preview badge + Stripe-style card.
 *
 * Renders a small accent-tinted "lock" badge above the action buttons on
 * the result step. Clicking opens an inline preview card with a fake
 * credit-card form (visual only — every input is `disabled` and no
 * payment processing happens). The badge has 8px padding, 1px accent
 * border, and an accent-tinted background at ~10% opacity.
 *
 * Production deposit checkout is owned by a separate Stripe integration
 * (this component does NOT call any Stripe API or open Stripe Checkout —
 * the prompt explicitly carves that out as DON'T BUILD HERE territory).
 */
function DepositPreviewBadge({
  amount, label, accent, theme, fontFamily, radiusPx, currencyFormatter,
  IconComponent,
}: {
  amount: number;
  label: string;
  accent: string;
  theme: WidgetTheme;
  fontFamily: string;
  /** Border radius — accepts CSS length string (e.g. `'10px'`) or number (px). */
  radiusPx: number | string;
  currencyFormatter: (n: number) => string;
  /** P2 UX — owner-selected lucide icon. Defaults to `Lock` at the call
   *  site so the badge keeps its legacy appearance when no icon was
   *  saved. */
  IconComponent: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const formattedAmount = currencyFormatter(amount);
  // Accent-tinted background at ~10% opacity. Hex → rgba conversion is
  // inline so we don't pull a new helper into the file.
  const tintBg = hexToRgba(accent, 0.10);
  return (
    <div
      data-testid="advanced-deposit-block"
      data-component-name="Deposit preview"
      style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <button
        type="button"
        data-testid="advanced-deposit-badge"
        aria-expanded={open}
        aria-controls="advanced-deposit-card"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: radiusPx,
          border: `1px solid ${accent}`, background: tintBg,
          color: theme.textBody, fontFamily,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          textAlign: 'left', lineHeight: 1.35,
          alignSelf: 'flex-start',
        }}
      >
        {/* P2 UX — owner-selected lucide glyph. Defaults to Lock at the
            call site so the legacy appearance is preserved when the
            stored config has no `iconName`. 14 px, accent-coloured. */}
        <IconComponent
          aria-hidden="true"
          size={14}
          color={accent}
          strokeWidth={2.25}
          style={{ flexShrink: 0 }}
        />
        <span>
          <span style={{ color: accent, fontWeight: 800 }}>{formattedAmount}</span>{' '}
          {label} — fully refundable
        </span>
      </button>
      {open && (
        <div
          id="advanced-deposit-card"
          data-testid="advanced-deposit-card"
          role="region"
          aria-label="Deposit preview card"
          style={{
            borderRadius: radiusPx, background: theme.surface,
            border: `1px solid ${theme.border}`,
            padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
            boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
            fontFamily,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 13, color: theme.textBody, fontWeight: 700,
          }}>
            <span>Deposit · {formattedAmount}</span>
            <button
              type="button"
              data-testid="advanced-deposit-card-close"
              aria-label="Close deposit preview"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent', border: 'none', color: theme.textMuted,
                fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <input
            type="text" disabled readOnly value="4242 4242 4242 4242"
            data-testid="advanced-deposit-card-number"
            aria-label="Card number (preview only — disabled)"
            style={{
              padding: '10px 12px', borderRadius: radiusPx,
              border: `1px solid ${theme.border}`, background: theme.bg,
              color: theme.textBody, fontFamily, fontSize: 13,
              letterSpacing: '0.06em',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" disabled readOnly value="12/34"
              data-testid="advanced-deposit-card-exp"
              aria-label="Expiry (preview only — disabled)"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: radiusPx,
                border: `1px solid ${theme.border}`, background: theme.bg,
                color: theme.textBody, fontFamily, fontSize: 13,
              }}
            />
            <input
              type="text" disabled readOnly value="CVC"
              data-testid="advanced-deposit-card-cvc"
              aria-label="CVC (preview only — disabled)"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: radiusPx,
                border: `1px solid ${theme.border}`, background: theme.bg,
                color: theme.textMuted, fontFamily, fontSize: 13,
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
            This is a preview — your actual checkout uses Stripe. No money is
            charged from this card form.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * BD-3k — Online-booking calendar preview.
 *
 * Renders a 3-day strip of available appointment slots beneath the price
 * headline on the result step. Source is one of:
 *
 *   - `wefixtrades-default` → built-in mock slots; production wires to
 *     BB-1's `book_appointment` customer tool. Tapping a slot highlights
 *     it (purely visual in this preview surface).
 *   - `cal.com-url` / `calendly-url` → tapping a slot opens the owner-
 *     supplied scheduler URL in a new tab.
 *
 * The grid is 3 columns on desktop and collapses to 1 column on mobile
 * via a CSS grid auto-fit. All slots are mock data — no real backend
 * calendar is consulted.
 */
function BookingCalendarPreview({
  source, url, accent, theme, fontFamily, radiusPx,
}: {
  source: 'wefixtrades-default' | 'cal.com-url' | 'calendly-url';
  url: string;
  accent: string;
  theme: WidgetTheme;
  fontFamily: string;
  /** Border radius — accepts CSS length string (e.g. `'10px'`) or number (px). */
  radiusPx: number | string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // Three calendar days starting "tomorrow". We compute days dynamically
  // so the preview always shows upcoming dates (vs hard-coded stale dates
  // in 2026-01). Mock slot times are realistic 9-5 windows with varying
  // density per day.
  const days = useMemo(() => {
    const now = new Date();
    const out: { id: string; dayLabel: string; dateLabel: string; slots: string[] }[] = [];
    const slotLayouts = [
      ['9:00 AM', '10:30 AM', '2:00 PM'],
      ['9:00 AM', '11:00 AM', '3:30 PM'],
      ['9:00 AM', '2:00 PM', '4:00 PM'],
    ];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
      const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      out.push({
        id: d.toISOString().slice(0, 10),
        dayLabel, dateLabel,
        slots: slotLayouts[(i - 1) % slotLayouts.length],
      });
    }
    return out;
  }, []);
  const isExternal = source === 'cal.com-url' || source === 'calendly-url';

  return (
    <div
      data-testid="advanced-booking-block"
      data-component-name="Booking calendar"
      data-component-type="online-booking"
      data-booking-source={source}
      style={{
        marginTop: 16, paddingTop: 14,
        borderTop: `1px solid ${theme.border}`,
        display: 'flex', flexDirection: 'column', gap: 10,
        fontFamily,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* lucide Calendar icon (inline SVG, accent-coloured) */}
        <svg
          aria-hidden="true"
          width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke={accent} strokeWidth={2.25}
          strokeLinecap="round" strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span style={{
          // BUG-4 (fix/preview-fullscreen-canvas-booking): this heading sits
          // directly on the booking block container, which has no background of
          // its own and therefore inherits the RESULT-PANEL surface (rpBg). The
          // theme's `textBody` token is contrast-guarded against the OUTER card
          // surface, so on themes whose result panel is a saturated blue/dark
          // (e.g. result: #1e40af) it resolved to a dark value and the heading
          // went invisible. `resultText` is the sibling token already guarded
          // against the result-panel background (see `cc.resultText` derivation),
          // so it stays readable on every theme — matching the day-card values.
          fontSize: 13, fontWeight: 700, color: theme.resultText,
          letterSpacing: '0.01em',
        }}>
          Schedule your appointment
        </span>
      </div>
      <div
        data-testid="advanced-booking-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
        }}
      >
        {days.map((day) => (
          <div
            key={day.id}
            data-testid={`advanced-booking-day-${day.id}`}
            style={{
              borderRadius: radiusPx, background: theme.surface,
              border: `1px solid ${theme.border}`,
              padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: theme.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {day.dayLabel}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: theme.textBody }}>
                {day.dateLabel}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {day.slots.map((slot) => {
                const slotKey = `${day.id}__${slot}`;
                const isSelected = selected === slotKey;
                return (
                  <button
                    key={slot}
                    type="button"
                    data-testid={`advanced-booking-slot-${day.id}-${slot.replace(/[: ]/g, '')}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      // External scheduler — open the owner-supplied URL
                      // in a new tab; nothing to "select" inside the widget.
                      if (isExternal && url) {
                        try {
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch {
                          /* popup blocked / non-browser env — ignore */
                        }
                        return;
                      }
                      setSelected(isSelected ? null : slotKey);
                    }}
                    style={{
                      padding: '7px 10px', borderRadius: radiusPx,
                      border: `1px solid ${isSelected ? accent : theme.border}`,
                      background: isSelected ? hexToRgba(accent, 0.12) : 'transparent',
                      color: isSelected ? accent : theme.textBody,
                      fontFamily, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 120ms ease-out, border-color 120ms ease-out',
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {isExternal && url && (
        <p style={{ margin: 0, fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
          Slots open your scheduler in a new tab.
        </p>
      )}
    </div>
  );
}

/* BD-3k — The "Powered by WeFixTrades" sticky-bar footer badge component was
 * removed: the attribution now renders exactly once at the widget root
 * (`advanced-powered-by-root`) so it can't duplicate on desktop and stays
 * visible on mobile when the sticky bar folds. See the root badge below. */

/* feat/inline-edit-all-sections (2026-06-08) — reusable pencil "edit hint"
 * affordance, factored out of the title's inline pencil so EVERY inline-editable
 * text section (subtitle, results heading, footnote) shows the SAME glyph + tap
 * target + tooltip. Rendered ONLY in the wizard editor preview (gated on
 * `editableTitle` at every call site); the live/published widget never mounts it.
 * The `data-testid` is the hook PreviewPane's onBezelClick delegation matches to
 * open the right section editor (mirrors `advanced-title-edit-hint`). `color`
 * keeps it theme-aware (callers pass the section's body token — no hardcoded hex). */
function EditHint({ testId, color }: { testId: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      title="Click to edit"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 28, minHeight: 28, borderRadius: 7,
        color, opacity: 0.55, cursor: 'pointer', flexShrink: 0,
        verticalAlign: 'middle', marginLeft: 4,
        transition: 'opacity 0.12s ease, background 0.12s ease',
      }}
    >
      <svg
        width={14} height={14} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth={2.4}
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
      </svg>
    </span>
  );
}

export default function AdvancedCalculator({
  businessName, logoUrl, advanced, accentColor, editableTitle = false,
  planTier, calculatorId, bookingUrl, ownerEmail, connectedTop = false,
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
  // BD-3l — Premium Animations Pack. Pro-gated identically to the rest
  // of Brand Studio. When the owner isn't on Pro the field is treated
  // as absent so a stored config can't bypass the gate.
  const bsPremiumAnimations = brandStudioUnlocked ? bs.premiumAnimations : undefined;
  const premiumPackEnabled = bsPremiumAnimations?.enabled === true;
  // BD-3l — flatten the resolved per-effect gates so the JSX below can
  // attach the data-attrs without recomputing the booleans. Sub-toggles
  // default to true when the master is on (the master is the opt-in;
  // individual toggles are opt-OUT). The provider also computes these
  // for its own consumers; mirrored here for the case where the
  // attribute needs to live on the widget root for CSS scoping.
  const premiumDataAttrs: Record<string, string> = premiumPackEnabled
    ? {
        'data-qq-premium': 'on',
        'data-qq-premium-spring': bsPremiumAnimations?.spring !== false ? 'on' : 'off',
        'data-qq-premium-countup': bsPremiumAnimations?.countUp !== false ? 'on' : 'off',
        'data-qq-premium-stagger': bsPremiumAnimations?.staggerReveal !== false ? 'on' : 'off',
        'data-qq-premium-ctapulse': bsPremiumAnimations?.ctaPulse !== false ? 'on' : 'off',
        'data-qq-premium-cardflip': bsPremiumAnimations?.cardFlip !== false ? 'on' : 'off',
        'data-qq-premium-confetti': bsPremiumAnimations?.confetti !== false ? 'on' : 'off',
      }
    : { 'data-qq-premium': 'off' };
  const premiumConfettiOn =
    premiumPackEnabled && bsPremiumAnimations?.confetti !== false;
  const premiumCtaPulseOn =
    premiumPackEnabled && bsPremiumAnimations?.ctaPulse !== false;

  // BD-3k — Inline preview surfaces (deposit / online booking / WeFixTrades
  // branding badge). Deposit + Booking are NOT Pro-gated — they are
  // owner-facing affordances available on every tier. Branding is gated
  // server-side via BRAND_STUDIO_STYLE_KEYS so that free-tier patches that
  // attempt to hide the badge are stripped before persistence; the
  // renderer below also defensively forces the badge ON for non-Pro tiers.
  const styleSlot = advanced.style ?? {};
  const bsDeposit = styleSlot.deposit;
  const depositEnabled = bsDeposit?.enabled === true;
  const depositAmount = (() => {
    const raw = bsDeposit?.amount;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    return Math.max(1, Math.min(100000, Math.round(raw)));
  })();
  const depositLabelText = (typeof bsDeposit?.label === 'string' && bsDeposit.label.trim() !== '')
    ? bsDeposit.label
    : 'Deposit required to schedule';
  /* P2 UX — deposit-badge icon resolution. Maps the saved name to a
   * lucide component; unknown / absent → Lock (legacy default). */
  const depositIconComponent: LucideIcon = (
    (bsDeposit?.iconName && DEPOSIT_ICON_COMPONENTS[bsDeposit.iconName])
      ?? LucideLock
  );

  const bsBooking = styleSlot.booking;
  const bookingPreviewEnabled = bsBooking?.enabled === true;
  const bookingPreviewSource = bsBooking?.source ?? 'wefixtrades-default';
  const bookingPreviewUrl = (typeof bsBooking?.url === 'string' && bsBooking.url.trim() !== '')
    ? bsBooking.url.trim() : '';

  // Branding badge — free-tier always shows the badge regardless of
  // stored value. Pro+ honours the persisted toggle.
  //
  // Wave 57 — `brandStudioUnlocked` is now always true (the builder is
  // free), so we can't use it to gate the OUTCOME-tier branding badge
  // anymore. Derive the badge gate from `planTier` directly so the live
  // widget still forces the "Powered by WeFixTrades" badge ON for free.
  const bsBranding = styleSlot.branding;
  const _resolvedPlanTier = (planTier ?? 'free').toLowerCase();
  const isPaidPlanForBranding =
    _resolvedPlanTier === 'pro' ||
    _resolvedPlanTier === 'business' ||
    _resolvedPlanTier === 'starter';
  const showPoweredByBadge = isPaidPlanForBranding
    ? bsBranding?.showPoweredBy !== false
    : true;

  /* BG-7 Item 6 — per-template button-copy overrides.
   *
   * Pro-tier only. Free-tier patches that set `style.buttonCopy` are
   * stripped before persistence (`BRAND_STUDIO_STYLE_KEYS`); the
   * renderer also defensively ignores the slot when Brand Studio isn't
   * unlocked (defense in depth, same pattern as the rest of the Pro
   * features above). Every field is sanitized on read — the wizard
   * writer also sanitizes on write, so the value should already be
   * safe, but we sanitize again here per the rule "sanitize on write
   * AND on read". */
  const sanitizedButtonCopy = (() => {
    const raw = brandStudioUnlocked ? (styleSlot.buttonCopy ?? {}) : {};
    const out: { back?: string; next?: string; submit?: string; emailQuote?: string; bookSlot?: string } = {};
    const keys: Array<keyof typeof raw> = ['back', 'next', 'submit', 'emailQuote', 'bookSlot'];
    for (const k of keys) {
      const v = raw[k];
      if (typeof v !== 'string') continue;
      const cleaned = sanitizeRichHtml(v).trim();
      if (cleaned !== '') out[k] = cleaned;
    }
    return out;
  })();
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
  // Label placement: `float` (title-in-field, the legacy default) vs `stacked`
  // (Elfsight-style title-above + help-below). Opt-in; live widgets keep float.
  const labelLayout: 'float' | 'stacked' = style.labelLayout ?? 'float';
  // Wave width-uniform — `widgetWidth` undefined → fall back to the standard
  // `'wide'` (820px) cap so EVERY default template renders at the same width.
  // Previously undefined meant "no cap" (full-bleed), which made the 39 trade
  // templates that ship without a `style` block — and the 5 premium templates
  // whose `style` block omits `widgetWidth` — render wider than the templates
  // that explicitly carry `widgetWidth: 'wide'`. Alex flagged "some templates
  // are changing the width"; this is the root cause (renderer default, not a
  // per-template override — no template sets a *different* width). An owner who
  // deliberately picks `'full'` or `'narrow'` in the Style tab still overrides.
  const widgetWidth: AdvWidgetWidth = style.widgetWidth ?? 'wide';
  const maxWidthStyle: string | undefined = WIDTH_PX[widgetWidth];

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
  // Short modal lead-capture (name / phone / email) opened by the primary CTA.
  const [leadModalOpen, setLeadModalOpen] = useState(false);
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
  // and totals stay at 0. Uses `answerMalformed` (NOT `answerInvalid`):
  // a required-but-incomplete U2 answer is live customer input, not a
  // reset-worthy stale value.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next: Record<string, Answer> = { ...prev };
      for (const f of fields) {
        if (answerMalformed(f, next[f.name])) {
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

  // CONDITIONAL-FIELDS-1 — id→field map so `show_if.field` (a controlling
  // field id) resolves to that field (and its answer key, `name`).
  const fieldsById = useMemo(() => {
    const m = new Map<string, AdvField>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of fields) {
      // Legacy numeric `visible_when` rule (kept for back-compat).
      if (f.visible_when
        && !rulePasses(f.visible_when, asNumber(raw[f.visible_when.field] ?? 0))) {
        continue;
      }
      // CONDITIONAL-FIELDS-1 — `show_if` rule (string-or-number aware).
      if (!isFieldVisible(f, fieldsById, answers)) continue;
      s.add(f.id);
    }
    return s;
  }, [fields, raw, fieldsById, answers]);

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
  //
  // BD-3l — when the Premium Animations Pack is on AND its `countUp`
  // sub-effect is enabled, the boot animation runs over 800 ms (per
  // spec) for a more deliberate result-reveal feel. The hook still
  // boots from 0 → target so the rAF animation kicks in on first mount.
  const useLongCountUp = premiumPackEnabled
    && bsPremiumAnimations?.countUp !== false;
  const animatedHeadline = useCountUp(headline, useLongCountUp ? 800 : 600);
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

  // PRICING-MODELS (U2) — the displayed total can be meaningless in two
  // honest-quote situations:
  //   1. address_distance resolved BEYOND `maxDistanceMiles` → "outside our
  //      service area" (the field shows the note);
  //   2. rate_matrix landed on a missing cell under the `custom_quote` rule
  //      → "quoted individually".
  // In both, the lead still captures (answers intact) but `quote_amount`
  // goes NULL so the dashboard never shows a fabricated price. Applied to
  // all three lead paths (inline CTA, LeadModal, ContactStep).
  const quoteSuppressed = useMemo(() => fields.some((f) => {
    if (!visibleIds.has(f.id)) return false;
    if (f.type === 'address_distance') {
      const a = answers[f.name];
      return isDistanceAnswer(a)
        && typeof a.distanceMiles === 'number' && isFinite(a.distanceMiles)
        && typeof f.maxDistanceMiles === 'number' && f.maxDistanceMiles > 0
        && a.distanceMiles > f.maxDistanceMiles;
    }
    if (f.type === 'rate_matrix') {
      const a = answers[f.name];
      return isMatrixAnswer(a)
        && resolveMatrixRate(f.matrix, a) === null
        && (f.matrix?.missingCell ?? 'custom_quote') === 'custom_quote';
    }
    return false;
  }), [fields, visibleIds, answers]);
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
  // FIX #6 — few-field calculators should NOT paginate. A 1-field-per-step
  // stepper with large blank areas reads as broken. So below this many
  // INTERACTIVE fields we collapse to a single page (everything + the result
  // together) UNLESS the owner has explicitly opted into the stepper.
  const SINGLE_PAGE_FIELD_THRESHOLD = 4;

  // Count only fields that actually take an answer — display-only blocks
  // (heading / paragraph / divider / image) don't justify a step of their own.
  const interactiveFieldCount = useMemo(
    () => visibleFields.filter(
      (f) => f.type !== 'heading' && f.type !== 'paragraph'
        && f.type !== 'divider' && f.type !== 'image'
        // BUILDER-COMPONENTS — button / link are display-only; no own step.
        && f.type !== 'button' && f.type !== 'link'
        // FIELD-PALETTE — video embed is display-only; no own step.
        && f.type !== 'video'
        // WIZARD-GAPS — contact form is content-only; no own step.
        && f.type !== 'contact_form',
    ).length,
    [visibleFields],
  );

  // Resolve the effective layout:
  //   - explicit 'stepper'  → always stepper (owner opt-in wins, even for 1 field).
  //   - explicit 'single'   → always single.
  //   - unset / auto        → single when few fields (≤ threshold), else stepper.
  const explicitLayout = advanced.stepLayout; // 'stepper' | 'single' | undefined
  const fewFields = interactiveFieldCount <= SINGLE_PAGE_FIELD_THRESHOLD;
  const stepLayoutMode: 'stepper' | 'single' =
    explicitLayout === 'stepper'
      ? 'stepper'
      : explicitLayout === 'single'
        ? 'single'
        : (fewFields ? 'single' : 'stepper');

  const dataSteps: { id: string; label: string; help?: string; description?: string; fieldIds: string[] }[] = useMemo(() => {
    if (stepLayoutMode === 'single') return [];

    // 1) Explicit steps declared on the template.
    if (Array.isArray(advanced.steps) && advanced.steps.length > 0) {
      const declared = advanced.steps.map((s) => ({
        // BG-7 Item 4 — `description` is the new owner-edited rich-text
        // blurb beneath the step title. Optional; absent on legacy
        // templates. Sanitized at render time below.
        id: s.id, label: s.label, help: s.help, description: s.description,
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
  // BD-3l — track previous step index so the 3D card-flip animation
  // knows whether the user advanced (forward) or returned (back). Set
  // synchronously in the Back/Next handlers so the flip direction is
  // ready by the time React re-renders the new step content. Defaults
  // to `forward` for the initial mount and step-index resets.
  const [flipDir, setFlipDir] = useState<'forward' | 'back'>('forward');
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

  /* Wave 60 — `quotequick:goto-field` listener.
   *
   * The wizard editor's SelectionProvider dispatches this event whenever
   * the user clicks a field row in the left pane (or selects a field via
   * any other path). When the widget is rendered in multi-step mode the
   * field may live on a step that isn't currently visible — without this
   * listener the user would think the field is "missing" from the
   * preview (Alex's Issue 2 — "Roadside Add-ons" field exists in editor
   * but not visible in widget). We resolve the field's owning step and
   * advance `stepIdx` so the preview matches the editor selection. */
  useEffect(() => {
    if (typeof window === 'undefined' || !useStepper) return;
    const onGoto = (e: Event) => {
      const ce = e as CustomEvent<{ fieldId?: string }>;
      const fieldId = ce.detail?.fieldId;
      if (!fieldId) return;
      // Resolve the data-step that contains this field. Match by id OR by
      // name because the explicit-steps path stores `fieldIds` populated
      // from either source (see dataSteps construction above).
      const ownerIdx = dataSteps.findIndex(
        (s) => s.fieldIds.includes(fieldId) || s.fieldIds.some((k) => {
          const f = visibleFields.find((v) => v.id === fieldId);
          return f ? k === f.name : false;
        }),
      );
      if (ownerIdx >= 0 && ownerIdx !== stepIdx) {
        setFlipDir(ownerIdx > stepIdx ? 'forward' : 'back');
        setStepIdx(ownerIdx);
      }
    };
    window.addEventListener('quotequick:goto-field', onGoto as EventListener);
    return () => window.removeEventListener('quotequick:goto-field', onGoto as EventListener);
  }, [useStepper, dataSteps, visibleFields, stepIdx]);

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
  // A tint can be DARK (coral/midnight) or LIGHT (the Elfsight-style accent
  // wash). The white-on-dark treatment only reads on a dark panel; on a light
  // tint the dividers + CTA must use dark/accent tokens instead.
  const resultIsDark = bodyIsDarkBg(c.result);
  const resultDivider = resultTinted && resultIsDark ? 'rgba(255,255,255,0.22)' : c.border;

  // CTA — always high-contrast against the result panel (a solid accent
  // button on a white panel; a white button on a coloured panel).
  // BF-11 — owners can now author the CTA label as rich text (B/I/U,
  // color, emoji, inline image). Plain strings still work — richTextRenderProps
  // returns { text } for non-HTML input so the legacy code path is preserved.
  const ctaLabel = results.cta_label === undefined ? 'Get My Quote' : results.cta_label;
  const ctaProps = richTextRenderProps(ctaLabel);
  const ctaLabelPlain = ctaProps.text ?? richHtmlToPlainText(ctaLabel);
  const showCta = ctaLabel.trim() !== '';
  // Solid accent CTA on white/light panels; a white CTA only on a DARK tinted
  // panel (where it pops). Previously every tint got a white CTA, which read as
  // a weak ghost button on the light Elfsight-style wash.
  //
  // TWO-ZONE THEMING — Colour A. When a template sets `style.ctaColor` it
  // OWNS the CTA background (Colour A), independent of accent (Colour B) and
  // the result-panel tint. The foreground is then derived purely from the
  // CTA background's luminance: a BRIGHT ctaColor (e.g. yellow #ffd60a) gets
  // DARK text rgb(17,17,17) — never white-on-yellow; a DARK ctaColor gets
  // white. `guardTextColor` (applied below as `ctaFgGuarded`) enforces the
  // contrast floor on top. Templates that DON'T set `ctaColor` fall through
  // to the exact legacy derivation — no regression.
  const ctaBgRaw = style.ctaColor ?? (resultTinted && resultIsDark ? '#ffffff' : accent);
  const ctaFg = style.ctaColor !== undefined
    ? (getRelativeLuminance(style.ctaColor) >= 0.5 ? 'rgb(17,17,17)' : 'rgb(255,255,255)')
    : (resultTinted && resultIsDark ? c.result : '#ffffff');
  // CONTRAST — when the resolved CTA foreground is WHITE (the legacy
  // white-on-accent path, or a custom DARK `ctaColor` that derived white text),
  // mid-tone accent fills (orange #E8821E, green #2E9E3F, red #ED3237) leave
  // white below WCAG AA (≈2.7–4.1:1). Deepen the rendered button background just
  // until white clears 4.5:1, preserving the "white on brand colour" button.
  // `darkenBgForWhiteText` is a no-op when the fill is already dark enough, so
  // dark accents / dark custom ctaColors are unchanged. The dark-text-on-bright
  // path (e.g. yellow ctaColor → rgb(17,17,17)) is NOT touched — those pass and
  // the condition below excludes them. `ctaFgGuarded` (computed later) derives
  // against this darkened `ctaBg`, so the label is evaluated on the final fill.
  const ctaFgIsWhite = ctaFg === '#ffffff' || ctaFg === 'rgb(255,255,255)';
  const ctaBg = ctaFgIsWhite ? darkenBgForWhiteText(ctaBgRaw, 4.5) : ctaBgRaw;
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
  // Whether the resolved body (often a per-template gradient, light or dark
  // independent of the theme) is dark — drives readable group-label colour.
  const bodyIsDark = bodyIsDarkBg(bodyBackground);

  // W-AO-6c — result-panel overrides. Each field is optional and falls
  // through to the existing renderer default when absent. We compute the
  // tokens here so the JSX block below stays readable.
  const rpAccent = bsResultPanel?.accentOverride ?? accent;
  // CONTRAST — result-panel background. When the panel intends WHITE text (a
  // DARK-classified tint, per `resultTinted && resultIsDark` below — the same
  // branch that drives the white dividers / white CTA), mid-tone brand colours
  // (light-blue #29ABE2, teal #1A9B8E, green #4A7A4E) classify as "dark" but
  // aren't dark enough for white text to clear WCAG AA (≈2.6–4.0:1). We deepen
  // the RENDERED panel background just until white reaches 4.5:1, keeping the
  // "white on brand colour" look — only a touch richer. `darkenBgForWhiteText`
  // returns the input UNCHANGED when it already passes (navy/charcoal/olive →
  // no change). LIGHT tints with DARK text (resultIsDark false) are untouched.
  // Critically, this runs BEFORE the text tokens below derive against `rpBg`,
  // so resultText/resultMuted/resultValueColor/headlineTotalColor are all
  // evaluated against — and stay white on — the darkened surface.
  const rpBgRaw = bsResultPanel?.bgOverride ?? c.result;
  // Darken for the WORST-CASE panel text — the muted caption token, which is
  // typically translucent white (e.g. rgba(255,255,255,0.82)). Solid-white
  // headline/values clear AA at a lighter shade, but the translucent caption
  // needs the bg a touch darker; `darkenBgForTextColor` composites the muted
  // token's alpha and deepens the bg just until the COMPOSITED caption clears
  // 4.5:1 — which also satisfies the solid-white text. Already-dark panels and
  // light (dark-text) panels are returned unchanged.
  const rpBg = resultTinted && resultIsDark
    ? darkenBgForTextColor(rpBgRaw, c.resultMuted, 4.5)
    : rpBgRaw;
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

  // ── CONTRAST-1 — runtime contrast guard ──
  // Resolve every text/background pair the renderer is about to paint
  // through `guardTextColor`. Each call returns the original token when the
  // pair already passes WCAG (the common case — themes are pre-vetted),
  // and an auto-corrected hex when the pair fails. Iteration cap + safe
  // fallbacks live inside the guard; here we just thread results into a
  // derived `cc` theme that the JSX consumes in place of `c`.
  //
  // 7 guarded pairs:
  //   1. resultsText   — result-panel headline + breakdown values
  //   2. resultsMuted  — result-panel secondary copy / heading caption
  //   3. ctaText       — primary CTA button label
  //   4. headingText   — title bar / step heading
  //   5. labelText     — field labels, group captions, hint copy
  //   6. badgeText     — trust badge chip copy (over the widget surface)
  //   7. footerText    — sticky bottom bar micro-summary / fold chevron
  //
  // BD-2b TierSelector + BD-2a sticky-bar already receive the guarded
  // theme via `theme={cc}` below, so their tier-card text / footer copy
  // inherits the corrected tokens transparently.
  const guardedHeadlineText = bsResultPanel?.accentOverride ? rpAccent : c.resultText;
  // POLISH-1 — secondary copy should read near-black (high-contrast), not
  // dimmed, on LIGHT surfaces. The theme's muted tokens are intentionally
  // low-contrast grays (e.g. `#94a3b8`); Alex wants the result-panel
  // captions / cta_sub / field captions to read crisply on light widgets.
  // We promote a muted token to a dark neutral ONLY when its own surface is
  // light (luminance ≥ 0.5). On DARK surfaces the original light/translucent
  // muted token is preserved untouched, so dark themes stay legible. The
  // result still flows through `guardTextColor`, so the contrast floor is
  // enforced and an unreadable combo can never escape.
  const MUTED_DARK = 'rgb(38,38,38)';
  const darkenMutedOnLight = (token: string, surface: string): string =>
    getRelativeLuminance(surface) >= 0.5 ? MUTED_DARK : token;
  const cc: WidgetTheme = {
    ...c,
    // Result panel pairs — both critical-pair sites + headline emphasis.
    resultText: guardTextColor(guardedHeadlineText, rpBg, 'resultsText', { largeText: true }),
    resultMuted: guardTextColor(darkenMutedOnLight(c.resultMuted, rpBg), rpBg, 'resultsMuted'),
    // Heading + field labels render on the outer card surface.
    text: guardTextColor(c.text, c.surface, 'headingText'),
    textBody: guardTextColor(c.textBody, c.surface, 'labelText'),
    textMuted: guardTextColor(darkenMutedOnLight(c.textMuted, c.surface), c.surface, 'labelMuted'),
  };
  // CONTRAST RULE: never bright-on-bright or dark-on-dark — foreground
  // luminance must oppose its background. The `cc` theme above routes the
  // result/heading/label/body pairings through `guardTextColor`; this CTA
  // pair completes the set — `ctaBg` was computed above, and we re-derive the
  // foreground so a custom CTA background still produces a readable label.
  const ctaFgGuarded = guardTextColor(ctaFg, ctaBg, 'ctaText', { largeText: true });

  // Breakdown line-item values: always the plain result text (white on the
  // dark panel / dark on light), guarded for contrast — NOT the optional
  // Brand-Studio headline accent, which previously bled a low-contrast blue
  // into the breakdown values on the result panel.
  const resultValueColor = guardTextColor(c.resultText, rpBg, 'resultsText');

  // ── CONTRAST RULE: never bright-on-bright or dark-on-dark — foreground
  //    luminance must oppose its background. ──
  // CHANGE-1 — the big headline TOTAL must read as a FLAT, high-contrast
  // neutral relative to the result-panel background — never the accent /
  // brand colour and never a tinted, low-contrast value. We derive it purely
  // from the panel-background luminance (≥0.5 → near-black; <0.5 → white),
  // then route it through `guardTextColor` against the SAME panel bg so it
  // can never slip below the WCAG large-text floor. This OVERRIDES the
  // accent-aware `cc.resultText` at the headline total site ONLY — secondary
  // captions (`cc.resultMuted`) and breakdown values (`resultValueColor`)
  // keep their existing handling. No #fff/#000 literals — rgb() per guard.
  const headlineTotalColor = guardTextColor(
    getRelativeLuminance(rpBg) >= 0.5 ? 'rgb(17,17,17)' : 'rgb(255,255,255)',
    rpBg,
    'resultsTotal',
    { largeText: true },
  );

  return (
    <div
      className={widgetClass}
      data-testid="advanced-calculator"
      data-field-style={fieldStyle}
      data-widget-width={widgetWidth}
      data-widget-width-desktop={widgetWidthDesktopPx ?? ''}
      data-widget-width-mobile={widgetWidthMobilePx ?? ''}
      data-style-radius={radiusSet ? radiusValue : 'legacy'}
      data-qq-width-scope={gridId}
      data-logo-placement={logoPlacement ?? 'legacy'}
      data-logo-size={style.logoSize ?? 'legacy'}
      data-brand-studio={brandStudioUnlocked ? 'true' : 'false'}
      data-bg-mode={brandStudioUnlocked ? (bsBgMode ?? 'solid') : 'solid'}
      // BD-3l — Premium Animations Pack data-attrs. Mirrored from the
      // provider for the case where the provider isn't rendered (e.g.
      // free-tier path); the CSS rules only match when the master is
      // 'on' so a free-tier widget pays zero cost. The provider below
      // re-applies these on its own wrapper so descendants always see
      // the resolved gates regardless of where they sit.
      {...premiumDataAttrs}
      style={{
        background: c.surface,
        // connectedTop → flat TOP corners so the brand bar above supplies the
        // rounded top and the two read as one continuous unit; rounded bottom.
        borderRadius: connectedTop ? `0 0 ${radiusOuterPx} ${radiusOuterPx}` : radiusOuterPx,
        border: `1px solid ${c.border}`, boxShadow: c.shadow,
        // 2px inner gap so the brand bar + body never sit flush against the
        // widget's outer edge/border — a thin breathing strip inside the
        // rounded card. Minimal (2px) so the two-zone left/right layout is
        // untouched.
        padding: 2,
        // BD-2a-sticky — `overflow: clip` (not `hidden`) so children with
        // `position: sticky` anchor to the page / iframe scroll container
        // instead of being trapped inside the outer card. `clip` still
        // visually clips square-cornered children against the rounded card,
        // but unlike `hidden` it does NOT establish a scroll container.
        // MUST stay 'clip' not 'hidden' — see memory/project_overflow_clip_for_sticky.md
        overflow: 'clip', fontFamily,
        // BD-3l — `position: relative` so the ConfettiBurst's absolutely-
        // positioned canvas anchors to the widget root rather than the
        // page. `position: relative` does NOT establish a scroll
        // container, so the BD-2a-sticky shells inside still anchor to
        // the page / iframe scroll context.
        position: 'relative',
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
        // P2 UX fix (2026-05-22): when the wizard owner deletes every field,
        // the widget mockup collapsed to a tiny height which let the "+ Add
        // field" empty-state CTA collide with the BD-2a-sticky bottom action
        // bar (Back / See my quote). Locked the root to a min-height that
        // comfortably holds: sticky top (~96px) + step indicator + an empty
        // state CTA in the middle + sticky bottom action bar — with vertical
        // breathing room between each. 540px is the floor for both wizard
        // preview and the live customer-facing widget (single component).
        minHeight: '540px',
        // BD-2a-badge-pin — root is a flex COLUMN so the body region can flex
        // and push the sticky bottom bar + root Powered-by badge flush to the
        // bottom edge on every template, even when content is shorter than the
        // 540px floor. Without this the badge floated up, leaving empty space
        // below it on short templates. See FIX 1 (badge bottom-pin).
        display: 'flex',
        flexDirection: 'column',
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
          // TWO-ZONE — the top brand bar (the QuoteQuick header row) reads as a
          // separated, ROUNDED bar with a clearly VISIBLE thin dark hairline on
          // every side. A near-black rgba hairline (never a #000/black literal)
          // stays crisp on the light brand bar across themes — the bar itself
          // is light, so a dark hairline reads as a clean rounded outline.
          border: '1px solid rgba(15,23,42,0.12)',
          // Self-contained rounded box — all four corners use the inner radius
          // so the brand bar reads as a distinct, fully rounded bordered bar
          // sitting at the top of the widget (border + rounding on every side).
          borderRadius: radiusInnerPx,
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
                style={{
                  fontSize: '17px', fontWeight: headingWeight, color: cc.text, margin: 0,
                  letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 6,
                  // AE mobile (2026-06-05) — when the title is editable (wizard
                  // preview only), make the WHOLE name+pencil row a comfortable
                  // tap target so tapping anywhere on it opens the inline title
                  // editor (the onBezelClick delegation matches advanced-title).
                  // Live/published widget never gets editableTitle, so this adds
                  // no chrome there. cursor:pointer + min tap height read it as
                  // editable; the per-element CSS in PreviewPane scopes the
                  // larger 44px touch height + active affordance to ≤768px.
                  ...(editableTitle
                    ? { cursor: 'pointer', padding: '4px 6px', borderRadius: 6, minHeight: 32 }
                    : null),
                }}
              >
                {/* Small category glyph LEFT of the title — shown ONLY as a
                    fallback when there's no brand logo / default icon above, so
                    the header never shows two icons (Alex: "must be only one").
                    When the brand logo (uploaded logo or template defaultIcon)
                    is present, that single icon stands alone. */}
                {(logoHidden || (!logoUrl && !advanced.defaultIcon)) && (
                  <CategoryIcon
                    category={advanced.category}
                    override={advanced.categoryIcon}
                    size={18}
                    color={c.accent}
                    strokeWidth={2.25}
                  />
                )}
                {/* BD-3d Feature 1 — title may carry sanitized rich HTML. */}
                {(() => {
                  const props = richTextRenderProps(title);
                  return props.__html
                    ? <span dangerouslySetInnerHTML={{ __html: props.__html }} />
                    : <>{props.text}</>;
                })()}
                {editableTitle && (
                  <span
                    aria-hidden="true"
                    data-testid="advanced-title-edit-hint"
                    title="Click to edit"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      // AE mobile (2026-06-05) — the pencil was a 18x18 box with a
                      // 12px glyph: too small to reliably tap on a phone, so users
                      // thought tap-to-edit was dead. Bump the tap target to 40x40
                      // (min) with a ~18px glyph. The onBezelClick delegation
                      // matches advanced-title-edit-hint, so a tap anywhere on this
                      // box opens the inline editor. cursor:pointer + a subtle tint
                      // make it read as a button.
                      minWidth: 40, minHeight: 40, borderRadius: 8,
                      color: cc.textBody,
                      opacity: 0.6,
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'opacity 0.12s ease, background 0.12s ease',
                    }}
                  >
                    {/* lucide-style pencil glyph (small inline SVG, no
                        extra import on AdvancedCalculator). */}
                    <svg
                      width={18} height={18} viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth={2.4}
                      strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                  </span>
                )}
              </p>
            </div>
            {subtitle && (() => {
              const props = richTextRenderProps(subtitle);
              // 13px → 12px and slightly tighter line-height: the trust line was
              // reading as a dense run-on. Colour stays the theme body token
              // (cc.textBody) — no hardcoded hex.
              // feat/inline-edit-all-sections — in the wizard editor preview the
              // subtitle is click-to-edit (same UX as the title): cursor:pointer
              // + a small comfortable tap pad so the whole line reads as
              // editable. PreviewPane's onBezelClick matches data-component-type
              // ="subtitle" to open the inline editor + select the header section.
              const baseStyle = {
                fontSize: '12px', color: cc.textBody, margin: '5px 0 0', textAlign: align, lineHeight: 1.4,
                ...(editableTitle ? { cursor: 'pointer', borderRadius: 6 } : null),
              } as React.CSSProperties;
              if (props.__html) {
                return (
                  <p
                    data-testid="advanced-subtitle"
                    data-component-name="Subtitle"
                    data-component-type="subtitle"
                    style={baseStyle}
                  >
                    <span dangerouslySetInnerHTML={{ __html: props.__html }} />
                    {editableTitle && <EditHint testId="advanced-subtitle-edit-hint" color={cc.textBody} />}
                  </p>
                );
              }
              const plain = props.text ?? '';
              // If the trust line is mid-dot / bullet separated, render each
              // claim as its own span with a muted dividing dot between them
              // (flex-wrap so it reflows on mobile) instead of one run-on
              // sentence. The divider reuses the same theme body token (no hex).
              const segments = plain
                .split(/\s*[·•]\s*/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (segments.length > 1) {
                return (
                  <div
                    data-testid="advanced-subtitle"
                    data-component-name="Subtitle"
                    data-component-type="subtitle"
                    style={{
                      ...baseStyle,
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                      justifyContent: justify, gap: '2px 0',
                    }}
                  >
                    {segments.map((seg, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {i > 0 && (
                          <span aria-hidden="true" style={{ opacity: 0.4, margin: '0 6px' }}>·</span>
                        )}
                        <span>{seg}</span>
                      </span>
                    ))}
                    {editableTitle && <EditHint testId="advanced-subtitle-edit-hint" color={cc.textBody} />}
                  </div>
                );
              }
              return (
                <p
                  data-testid="advanced-subtitle"
                  data-component-name="Subtitle"
                  data-component-type="subtitle"
                  style={baseStyle}
                >
                  {plain}
                  {editableTitle && <EditHint testId="advanced-subtitle-edit-hint" color={cc.textBody} />}
                </p>
              );
            })()}
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
          gap: 2px;
          padding: 2px;
          grid-template-columns: 1fr;
        }
        /* Mobile spacing tune — on the single-column ≤559px layout the body
           grid blocks (fields panel, result panel, CTA) should breathe, not
           sit flush to the widget edges. ~16px outer gutters + a comfortable
           12px gap BETWEEN the blocks. NOTE: the 2px gap between STACKED
           INPUTS (the fields grid) is a locked design-system rule and is
           deliberately left untouched here. Desktop (≥560px) keeps its
           deliberate 2px grey-seam rule below — this override is mobile-only. */
        @media (max-width: 559px) {
          .${gridId} { gap: 12px; padding: 16px; }
          /* Mobile keeps the NATURAL order: inputs first, then the result
             panel (total -> secondary rows -> CTA) at the bottom — you fill
             the inputs, then see the total. No order override. */
        }
        .${gridId}-fields {
          display: grid;
          gap: 2px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-content: start;
          /* Top-align fields so their captions + first controls line up across
             columns. Toggles now carry a matching group caption (see the toggle
             renderer) so a toggle's control card aligns with a neighbour's
             first option card — Alex's page-2 "selector fields misaligned". */
          align-items: start;
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
        /* POLISH-2 — CTA block default spacing. Lives in CSS (not inline) so
           the two-column media-query rule can override it to margin-top:auto
           and bottom-pin the CTA. In single-column / mobile-stacked this is
           the only rule that applies, preserving the original 14px gap. */
        .${gridId}-cta { margin-top: 14px; }
        @media (min-width: 560px) {
          /* All-round 2px padding AND 2px grid gap so the inner containers
             (fields + result panel) nearly fill the widget body — only a thin
             2px seam of the body surface shows between and around every block
             (Alex: "only a 2px gap of grey must remain", on every side). */
          .${gridId} { gap: 2px; padding: 2px; }
          .${gridId}[data-layout="two-column"] {
            grid-template-columns: 1fr minmax(190px, 0.8fr);
            /* POLISH-2 — equal-height columns so the result panel grows to
               match the (usually taller) inputs column. Combined with the
               result panel being a flex column + the CTA block's
               margin-top:auto below, the CTA bottom-aligns to where the
               inputs column ends. Only in the desktop two-column layout. */
            align-items: stretch;
          }
          /* The result panel defaults to align-self:start (top-aligned, its
             natural height). In two-column we let it stretch to the row
             height so the flex auto-margin has slack to push the CTA down. */
          .${gridId}[data-layout="two-column"] .${gridId}-result { align-self: stretch; }
          /* Push the CTA block to the very bottom of the stretched panel.
             Scoped to two-column + this >=560px media query, so single-column
             and mobile-stacked layouts keep their natural marginTop and never
             open a huge gap. */
          .${gridId}[data-layout="two-column"] .${gridId}-cta { margin-top: auto; }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 2px;
          }
          .${gridId}[data-layout="multi-column"] .${gridId}-fields > * { grid-column: auto; }
        }
        /* Premium DEFAULT CTA hover — works on EVERY template + theme.
           Color-agnostic (transform + shadow + brightness only) so it reads
           well on both light and dark CTA backgrounds. The base transition is
           inline on the button; this rule supplies the hover/active deltas.
           Additive to the paid pulse ::after (that animates the background
           gradient; this animates the box) so the two never fight. The hover
           lift is SUBTLE-but-noticeable: a 2px rise, a stronger elevated
           shadow, and a slight brightness bump. */
        /* !important: out-specifies a global button:hover rule in index.css
           (button[style*=background][style*=border-radius]:hover) that would
           otherwise cap the lift at -1px and leak the transform under
           reduced-motion. */
        .qq-w-cta:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 28px rgba(0,0,0,0.28);
          filter: brightness(1.06);
        }
        /* Press feel — settle back flush on click. */
        .qq-w-cta:active { transform: translateY(0) !important; }
        /* Accessibility — honour reduced-motion: no transform/transition, keep
           just the elevated shadow as a static hover affordance. */
        @media (prefers-reduced-motion: reduce) {
          .qq-w-cta { transition: none; }
          .qq-w-cta:hover {
            transform: none !important;
            filter: none;
            box-shadow: 0 12px 28px rgba(0,0,0,0.28);
          }
          .qq-w-cta:active { transform: none !important; }
        }
        /* Premium slider — Apple/Stripe-style.
           Thin 4px track, brand-blue progress fill, ~18px white thumb with
           a soft brand-blue border + subtle shadow. Hover scales the thumb
           and adds a brand-blue glow; focus shows an accessibility ring.
           Custom property contract (set on each <input> via inline style):
             --qq-slider-accent    brand color  (filled portion + thumb border)
             --qq-slider-track     muted track  (unfilled portion)
             --qq-slider-pct       0%..100%     (the progress break-point)
             --qq-slider-thumb-bg  thumb fill   (white in light, near-white in dark)
           The thumb-bg variable is provided per-element so the hardcoded
           color guard never sees a raw #fff inside this scoped <style>. */
        .qq-w-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          background: transparent;
          cursor: pointer;
          height: 24px;
          padding: 0;
          margin: 0;
        }
        .qq-w-slider:focus { outline: none; }
        .qq-w-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            var(--qq-slider-accent) 0%,
            var(--qq-slider-accent) var(--qq-slider-pct, 0%),
            var(--qq-slider-track) var(--qq-slider-pct, 0%),
            var(--qq-slider-track) 100%
          );
        }
        .qq-w-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--qq-slider-thumb-bg);
          border: 1.5px solid var(--qq-slider-accent);
          box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
          margin-top: -7px;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-w-slider:hover::-webkit-slider-thumb {
          transform: scale(1.10);
          box-shadow: 0 1px 3px rgba(0,0,0,0.14), 0 4px 10px rgba(13,60,252,0.20);
        }
        .qq-w-slider:active::-webkit-slider-thumb,
        .qq-w-slider:focus-visible::-webkit-slider-thumb {
          transform: scale(1.12);
          box-shadow: 0 0 0 4px rgba(13,60,252,0.20);
        }
        .qq-w-slider::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: var(--qq-slider-track);
        }
        .qq-w-slider::-moz-range-progress {
          height: 4px;
          border-radius: 999px;
          background: var(--qq-slider-accent);
        }
        .qq-w-slider::-moz-range-thumb {
          width: 18px; height: 18px;
          border-radius: 50%;
          background: var(--qq-slider-thumb-bg);
          border: 1.5px solid var(--qq-slider-accent);
          box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-w-slider:hover::-moz-range-thumb {
          transform: scale(1.10);
          box-shadow: 0 1px 3px rgba(0,0,0,0.14), 0 4px 10px rgba(13,60,252,0.20);
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-w-slider::-webkit-slider-thumb,
          .qq-w-slider::-moz-range-thumb { transition: none; }
        }
      `}</style>
      {/* BF-9 / P2 UX — unified trust-badge row. Pre-populated per template
          (Licensed & Insured, BBB, OSHA, IICRC, ASE, etc.) PLUS an
          auto-synthesised "Licensed #XYZ" chip when the business profile
          carries a license number. The old TrustStripHeader was retired
          here because its content overlapped this row; license # is the
          only signal not already covered by the per-template trustBadges
          array, hence the synthesis. Wraps to multiple rows on narrow
          widths; absent + no profile data → renders null. */}
      {/* Only render the trust strip when the owner hasn't disabled it.
          `showTrustBadges` is defined on AdvStyle by the editor (sibling); read
          loosely so this compiles regardless of when that field lands, and
          treat `!== false` as "show" (default-on). */}
      {(style as { showTrustBadges?: boolean }).showTrustBadges !== false && (
        <TrustBadgeRow
          badges={advanced.trustBadges}
          businessProfile={advanced.businessProfile}
          theme={cc}
          fontFamily={fontFamily}
        />
      )}
      {/* BD-2a — stepper progress indicator. Rendered when the multi-step
          renderer is active (default for every template; owner can opt to
          single-form via Style tab → Step layout). The indicator sits
          ABOVE the body grid so it spans both columns of `two-column`
          layouts without disturbing their internal alignment. */}
      {useStepper && stepperList.length > 1 && (
        <CalculatorStepper
          steps={stepperList}
          current={stepIdx}
          theme={cc}
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
        style={{
          background: bodyBackground,
          // BD-2a-badge-pin — flex-grow the body so it absorbs all spare
          // vertical space inside the flex-column root. This pushes the sticky
          // bottom bar + root Powered-by badge to the bottom edge on short
          // templates while leaving tall/scrolling templates unaffected.
          // `min-height: 0` lets the grid shrink correctly inside the flex
          // column instead of overflowing.
          flex: '1 1 auto',
          minHeight: 0,
        }}>
        {/* Inputs — when the stepper is on the contact step, the fields
            section is replaced by the ContactStep (rendered further below
            so it shares the same column as the result panel on two-column
            layouts). On data steps we render `renderedFields` (the
            per-step slice of `visibleFields`). When the stepper is off
            we render the full `visibleFields` list (legacy behaviour). */}
        {!isContactStep && (
          // BD-3l — Wrap the per-step fields in a FlipCard so the 3D flip
          // animation plays on step change (Pro pack only — CSS rules
          // are gated behind `data-qq-premium-cardflip="on"`). The
          // existing `${gridId}-fields` className still drives the
          // grid/column layout. `data-qq-stagger-parent` lets the
          // children cascade-reveal when the stagger sub-effect is on.
          <FlipCard
            flipKey={`step-${stepIdx}`}
            dir={flipDir}
            className={`${gridId}-fields`}
            style={{ minWidth: 0 }}
          >
            {/* Wave 10 — `display: contents` so this wrapper carries the
             *  data-component / step-enter / stagger-parent attributes
             *  without breaking the parent grid layout. Without it, the
             *  wrapper would be the ONLY grid child (spanning full
             *  width), forcing every field-row onto its own line and
             *  defeating `data-colspan="1"` half-width pairs. */}
            <div
              data-component-name="Fields"
              data-component-type="fields-section"
              data-qq-step-enter
              data-qq-stagger-parent
              style={{ display: 'contents' }}
            >
              {/* P2 UX — empty-state cleanup. The wizard preview shows
                  PreviewEmptyState (a dashed-container "Add your first field"
                  CTA) on top of this canvas. The old "This calculator hasn't
                  been set up yet" hint stacked underneath it and looked like
                  a duplicate label. Suppressed: when there are zero visible
                  fields the empty-state owner is PreviewEmptyState (or, on
                  published widgets with zero fields, the calculator simply
                  renders no body — which is the correct fallback because a
                  published widget with no fields is a misconfiguration the
                  owner should never have shipped). */}
              {/* BG-7 Item 4 — per-step rich-text description. Sanitized
                 on read (the wizard also sanitizes on write). Renders
                 above the field list so it reads as introductory copy
                 for the step. Absent on legacy templates / steps
                 without an owner-edited description. */}
              {useStepper && !isContactStep && dataSteps[stepIdx]?.description && (() => {
                const rp = richTextRenderProps(dataSteps[stepIdx].description as string);
                const styleProps = {
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: cc.textBody,
                  margin: '0 0 12px 0',
                } as const;
                return rp.__html
                  ? <div
                      data-testid={`advanced-step-description-${stepIdx}`}
                      style={styleProps}
                      dangerouslySetInnerHTML={{ __html: rp.__html }}
                    />
                  : <p
                      data-testid={`advanced-step-description-${stepIdx}`}
                      style={styleProps}
                    >{rp.text}</p>;
              })()}
              {renderedFields.map((f, idx) => (
                <div
                  key={f.id}
                  data-colspan={f.colSpan === 1 ? '1' : '2'}
                  /* Wave 60 — stable shell-field id so PreviewOverlay can map
                   * a rendered DOM node back to the editor's TemplateField by
                   * ID rather than by array index. Index-based mapping broke
                   * the highlight sync when the multi-step renderer filtered
                   * `visibleFields` → `renderedFields` (only the current
                   * step's fields render, so DOM node N ≠ fields[N]). */
                  data-shell-field-id={f.id}
                  data-component-name={`Field: ${f.label || f.name || f.type}`}
                  data-component-type={`field-${f.type}`}
                  style={{
                    minWidth: 0,
                    // Apply the column span INLINE. The CSS `> [data-colspan]`
                    // rules can't reach these field divs because they sit behind
                    // a `display:contents` FlipCard wrapper, so colSpan was being
                    // ignored (everything auto-placed half-width). colSpan:2 =>
                    // full width; otherwise half (default pairing). Use
                    // `1 / -1` (not `span 2`) so it spans the whole row even in
                    // the auto-fit multi-column layout (which has >2 columns).
                    // multi_select always spans full width: it renders a tall
                    // stack of option cards, so pairing it half-width beside a
                    // short field leaves an ugly empty gap (catalogue-wide fix).
                    // Editor-width fix: the "Full" width button sets colSpan to
                    // `undefined` (see FieldRow — "Picking Full sets colSpan to
                    // undefined"), so full = "not explicitly half". Treat
                    // `undefined` as full (`!== 1`); otherwise the preview never
                    // reflowed when the owner picked Full (it stayed half).
                    gridColumn:
                      f.colSpan !== 1 || f.type === 'multi_select' ? '1 / -1' : 'auto',
                    // BD-3l — per-child stagger index (capped at 7) read
                    // by `.qq-stagger-in` keyframes. No-op when the pack
                    // is off (CSS rule doesn't match).
                    ['--qq-i' as string]: String(Math.min(idx, 7)),
                    // Wave 61 — per-element cosmetic overrides driven by
                    // the floating <InlineStyleToolbar />. Sub-fields are
                    // optional; when absent the field inherits the
                    // resolved widget style (theme + AdvStyle tokens).
                    // Spread last so explicit overrides win over base.
                    ...inlineElementStyleToCss(f.inlineStyle),
                  }}
                >
                  <FieldInput
                    field={f}
                    value={answers[f.name]}
                    accent={accent}
                    theme={cc}
                    bodyIsDark={bodyIsDark}
                    radiusPx={radiusInnerPx}
                    fieldStyle={fieldStyle}
                    fontFamily={fontFamily}
                    labelLayout={labelLayout}
                    onChange={(v) => setAnswer(f.name, v)}
                    /* WIZARD-GAPS — plumb the lead path into the contact_form
                       content component (POSTs to the same /api/leads as the CTA). */
                    calculatorId={analyticsCalcId}
                    onLeadSubmitted={trackSubmit}
                    /* PRICING-MODELS (U2) — country hint for the
                       address_distance Places autocomplete. */
                    serviceArea={advanced.businessProfile?.serviceArea}
                  />
                </div>
              ))}
            </div>
            {/* BD-2a-sticky — Back / Next controls moved into the bottom
                <StickyActionBar /> rendered as a sibling of the body grid.
                The controls now sit at the bottom edge of the viewport so
                a long step is still actionable without scrolling. */}
          </FlipCard>
        )}
        {/* BD-2a — Contact step content. Replaces the inputs section on
            the final (contact) step. Sits in the same grid column the
            inputs occupied so two-column layouts keep their visual rhythm.
            The result panel below stays visible so the user sees the
            quote alongside the contact form. */}
        {isContactStep && (
          // BD-3l — Contact step also rides the 3D-flip animation when
          // the Premium pack is on. flipKey is constant ('contact') so
          // the card flips IN once when the user arrives at the final
          // step; subsequent re-renders (e.g. typing in the form) don't
          // restart the animation. The inner div keeps the existing
          // step-enter hook + data attributes intact.
          <FlipCard
            flipKey="contact-step"
            dir={flipDir}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
          >
          <div
            data-component-name="Contact step container"
            data-component-type="contact-step-container"
            data-qq-step-enter
            style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
          >
            <ContactStep
              theme={cc}
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
              quoteAmount={!quoteSuppressed && typeof effectiveQuoteValue === 'number'
                ? effectiveQuoteValue : undefined}
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
              /* BG-7 Item 6 — owner overrides for the contact-step
                 hard/soft CTAs. Pro-tier only; the sanitized values fall
                 through to undefined for free-tier widgets so the default
                 copy stays. */
              emailQuoteLabelHtml={sanitizedButtonCopy.emailQuote}
              bookSlotLabelHtml={sanitizedButtonCopy.bookSlot}
            />
            {/* BD-2a-sticky — Back control moved into the bottom
                <StickyActionBar />. The final-step hard CTAs (Email me /
                Book consultation) still live inside ContactStep above. */}
          </div>
          </FlipCard>
        )}

        {/* Result panel — a separate rounded container.
         *
         * Wave L B2 — explicit flex column with a gap so the heading label
         * ("Estimated Total") and the big amount can't overlap on any
         * device / theme combination. Previously each `<p>` used only its
         * own margin which interacted poorly with the inline `lineHeight: 1.05`
         * on the amount — on mobile dark mode the labels were getting clipped.
         */}
        {hasResult && visibleFields.length > 0 && (
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
            {(() => {
              const props = richTextRenderProps(resultHeading);
              // feat/inline-edit-all-sections — the result heading / total-cost
              // label is click-to-edit in the wizard preview. data-component-type
              // ="results-heading" routes onBezelClick to the inline editor (which
              // commits to results.heading) AND selects the result section.
              const baseStyle = {
                position: 'relative' as const, zIndex: 1,
                fontSize: '11px', fontWeight: 700, color: cc.resultMuted,
                textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: 0,
                lineHeight: 1.3,
                ...(editableTitle ? { cursor: 'pointer', borderRadius: 6, display: 'inline-flex', alignItems: 'center' } : null),
              };
              if (props.__html) {
                return (
                  <p data-testid="advanced-result-heading" data-component-type="results-heading" style={baseStyle}>
                    <span dangerouslySetInnerHTML={{ __html: props.__html }} />
                    {editableTitle && <EditHint testId="advanced-result-heading-edit-hint" color={cc.resultMuted} />}
                  </p>
                );
              }
              return (
                <p data-testid="advanced-result-heading" data-component-type="results-heading" style={baseStyle}>
                  {props.text}
                  {editableTitle && <EditHint testId="advanced-result-heading-edit-hint" color={cc.resultMuted} />}
                </p>
              );
            })()}
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
                theme={cc}
                fontFamily={fontFamily}
                radiusPx={radiusInnerPx}
                // Selected tier card paints with the SAME darkened/guarded
                // colour the CTA button uses, so the chosen tier matches the
                // CTA instead of the raw (brighter) accent.
                selectedBg={ctaBg}
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
                // CHANGE-1 / CONTRAST RULE — the headline TOTAL renders in a
                // FLAT high-contrast neutral (near-black on a light panel,
                // white on a dark panel), NEVER the accent/brand colour and
                // never a tinted low-contrast value. `headlineTotalColor` is
                // derived from the result-panel background luminance and
                // already routed through `guardTextColor`, so it can never
                // fail WCAG. This deliberately overrides the accent-aware
                // `cc.resultText` at the headline total ONLY — secondary /
                // muted copy and breakdown values are unaffected.
                color: headlineTotalColor,
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
                  fontSize: '12px', color: cc.resultMuted, margin: '4px 0 0',
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
              theme={cc}
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
                      <span style={{ color: cc.resultMuted }}>{cl.name}</span>
                      <span style={{ fontWeight: 700, color: resultValueColor, fontFamily: eff.fontMono }}>
                        {formatResult(values[cl.name] ?? 0, cl.format, advanced.numberFormat)}
                      </span>
                    </div>
                    {cl.caption && cl.caption.trim() !== '' && (
                      <span
                        data-testid={`advanced-breakdown-caption-${cl.id}`}
                        style={{ fontSize: '11px', color: cc.resultMuted, lineHeight: 1.4 }}
                      >
                        {cl.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── BD-3k — Online-booking calendar preview ──
                Renders a 3-day slot picker beneath the price/breakdown
                block. Mock slots in `wefixtrades-default` mode; external
                URL modes open Cal.com / Calendly in a new tab on click.
                Hidden entirely when the StyleTab toggle is off. */}
            {bookingPreviewEnabled && (
              <BookingCalendarPreview
                source={bookingPreviewSource}
                url={bookingPreviewUrl}
                accent={accent}
                theme={cc}
                fontFamily={fontFamily}
                radiusPx={radiusInnerPx}
              />
            )}

            {(() => {
              const props = richTextRenderProps(footnoteText);
              // feat/inline-edit-all-sections — the result footnote / footer copy
              // is click-to-edit in the wizard preview. data-component-type
              // ="footnote" routes onBezelClick to the inline editor (which commits
              // to results.footnote) AND selects the result section.
              const baseStyle = {
                fontSize: '11px', color: cc.resultMuted, margin: '14px 0 0', lineHeight: 1.5,
                ...(editableTitle ? { cursor: 'pointer', borderRadius: 6 } : null),
              };
              if (props.__html) {
                return (
                  <p data-testid="advanced-footnote" data-component-type="footnote" style={baseStyle}>
                    <span dangerouslySetInnerHTML={{ __html: props.__html }} />
                    {editableTitle && <EditHint testId="advanced-footnote-edit-hint" color={cc.resultMuted} />}
                  </p>
                );
              }
              return (
                <p data-testid="advanced-footnote" data-component-type="footnote" style={baseStyle}>
                  {props.text}
                  {editableTitle && <EditHint testId="advanced-footnote-edit-hint" color={cc.resultMuted} />}
                </p>
              );
            })()}

            {/* ── BD-3k — Deposit preview badge + Stripe-style card ──
                Sits above the action buttons (CTA) on the result step
                so the owner / customer sees the deposit affordance
                before they commit. Tap to expand a fake card form.
                Hidden entirely when the StyleTab toggle is off. */}
            {depositEnabled && depositAmount > 0 && (
              <DepositPreviewBadge
                amount={depositAmount}
                label={depositLabelText}
                accent={accent}
                theme={cc}
                fontFamily={fontFamily}
                radiusPx={radiusInnerPx}
                currencyFormatter={(n) => formatResult(n, 'currency', advanced.numberFormat)}
                IconComponent={depositIconComponent}
              />
            )}

            {showCta && !useStepper && (
              // W-AO-6d — `key` is the leadView so React unmounts the
              // previous panel and remounts the new one on each step
              // change. That re-fires the entering animation declared in
              // the injected step-transition <style>. Pro-only; when
              // stepTransition === 'none' the rule below is empty and
              // the mount is instant (legacy behaviour).
              <div className={`${gridId}-cta`} key={`leadview-${leadView}`} data-qq-step-enter>
                {/* Elfsight-style marketing block above the CTA button:
                    a bold heading + a short paragraph (both optional). */}
                {leadView === 'cta' && (results.cta_heading || results.cta_sub) && (
                  <div data-testid="advanced-cta-pitch" style={{ marginBottom: '14px' }}>
                    {results.cta_heading && (
                      <p style={{
                        margin: 0, fontSize: '18px', fontWeight: 800,
                        color: cc.resultText, lineHeight: 1.2, letterSpacing: '-0.01em',
                      }}>{results.cta_heading}</p>
                    )}
                    {results.cta_sub && (
                      <p style={{
                        margin: '7px 0 0', fontSize: '13px', fontWeight: 400,
                        color: cc.resultMuted, lineHeight: 1.5,
                      }}>{results.cta_sub}</p>
                    )}
                  </div>
                )}
                {leadView === 'cta' && (
                  <button type="button" data-testid="advanced-cta"
                    className="qq-w-cta"
                    data-component-name="CTA button"
                    data-component-type="cta"
                    // BD-3l — `data-qq-cta-pulse` plus `--qq-cta-base`
                    // light up the conic-gradient rotation in
                    // premiumAnimations.css. The attribute is harmless
                    // when the pack is off (CSS rule doesn't match);
                    // when the pulse is on it overrides background-image
                    // with the conic gradient. Solid background colour
                    // stays as the fallback for browsers without
                    // `@property` support.
                    {...(premiumCtaPulseOn ? { 'data-qq-cta-pulse': '' } : null)}
                    onClick={() => setLeadModalOpen(true)}
                    style={{
                      width: '100%', height: '46px', borderRadius: radiusInnerPx, border: 'none',
                      background: ctaBg, color: ctaFgGuarded, fontSize: '14px', fontWeight: 800,
                      cursor: 'pointer', fontFamily, letterSpacing: '0.01em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                      // Premium default CTA hover — smooth transition for the
                      // lift + elevated shadow + brightness defined in the
                      // scoped <style> `.qq-w-cta:hover` rule. Color-agnostic
                      // (transform/shadow/filter only) so it reads well on both
                      // light and dark CTA backgrounds and never fights the
                      // paid pulse ::after. Disabled via prefers-reduced-motion
                      // in the scoped block.
                      transition:
                        'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease',
                      // BD-3l — position relative so the pulse shimmer
                      // ::after pseudo-element anchors correctly. No
                      // visual change when the pack is off.
                      position: 'relative',
                      // CSS var consumed by the conic gradient. Falls
                      // back to the accent colour when undefined.
                      ['--qq-cta-base' as string]: String(ctaBg),
                    }}>
                    {ctaProps.__html
                      ? <span dangerouslySetInnerHTML={{ __html: ctaProps.__html }} />
                      : ctaLabelPlain}
                    {' '}<span style={{ fontSize: '16px' }}>→</span>
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
                        color: cc.resultMuted,
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
                      onClick={async () => {
                        if (!leadReady) return;
                        // W-BB-4 — fire conversion event before flipping
                        // the panel so a fast unmount doesn't drop the beacon.
                        trackSubmit();
                        try {
                          if (analyticsCalcId != null) {
                            const resp = await fetch('/api/leads', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                calculator_id: analyticsCalcId,
                                name: leadName.trim(),
                                email: leadEmail.trim(),
                                quote_amount: !quoteSuppressed
                                  && typeof effectiveQuoteValue === 'number'
                                  && Number.isFinite(effectiveQuoteValue)
                                  ? effectiveQuoteValue : null,
                                answers: answers ?? null,
                              }),
                            });
                            if (!resp.ok) {
                              console.warn('[QQ] inline lead POST failed', resp.status);
                            }
                          }
                        } catch (e) {
                          console.warn('[QQ] inline lead POST error', e);
                        }
                        setLeadView('done');
                      }}
                      style={{
                        width: '100%', height: '44px', borderRadius: radiusInnerPx, border: 'none',
                        background: ctaBg, color: ctaFgGuarded, fontSize: '14px', fontWeight: 800,
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
                    background: resultTinted && resultIsDark ? 'rgba(255,255,255,0.16)' : c.accentTint,
                  }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      // CONTRAST RULE: never bright-on-bright or dark-on-dark —
                      // foreground luminance must oppose its background. The ✓
                      // badge shares the CTA's bg/fg pair, so it uses the SAME
                      // guarded foreground (`ctaFgGuarded`) the CTA buttons use
                      // — was the raw `ctaFg`, which could collide on an
                      // opposite-luminance custom CTA colour. No-op where the
                      // pair already passes.
                      background: ctaBg, color: ctaFgGuarded, fontSize: '12px', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: cc.resultText }}>
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
            theme={cc}
            fontFamily={fontFamily}
            calculatorId={calculatorId}
            microSummary={microSummary}
            radiusPx={radiusOuterPx}
            // BD-2b — inline trust signals beneath the action row (license #,
            // insured-up-to, icon row). Renders null when the business
            // profile is empty so the sticky bar stays compact.
            trustBlock={
              <TrustBlockUnderCTA
                profile={advanced.businessProfile}
                theme={cc}
                fontFamily={fontFamily}
                testid="trust-block-sticky"
              />
            }
            // BD-3k — "Powered by WeFixTrades" badge is NO LONGER emitted from
            // the sticky bar. It is rendered once, persistently, at the widget
            // root (`advanced-powered-by-root`, below) so it can't duplicate on
            // desktop (where the sticky detail rows are also visible) and stays
            // present on mobile when the sticky bar is folded. Gate logic
            // (showPoweredByBadge, free-tier forced ON) is unchanged — it now
            // governs only the single root badge.
            footerSlot={null}
          >
            <StepperControls
              current={stepIdx}
              total={stepperList.length}
              theme={cc}
              radiusPx={radiusInnerPx}
              fontFamily={fontFamily}
              nextLabel={
                // BG-7 Item 6 — per-template overrides take precedence
                // over the default copy. Sanitized HTML (sanitizer is
                // applied on both write + read; the same value is
                // exposed via `buttonCopyIsHtml` so the renderer can
                // dangerouslySetInnerHTML it cleanly).
                stepIdx === dataSteps.length - 1
                  ? (sanitizedButtonCopy.submit ?? 'See my quote')
                  : selectedTierLabel
                    ? (sanitizedButtonCopy.next ?? `Continue with ${selectedTierLabel}`)
                    : (sanitizedButtonCopy.next ?? 'Continue')
              }
              backLabel={sanitizedButtonCopy.back}
              buttonCopyIsHtml
              onBack={() => {
                setFlipDir('back');
                setStepIdx((i) => Math.max(0, i - 1));
              }}
              onNext={() => {
                setFlipDir('forward');
                setStepIdx((i) => Math.min(stepperList.length - 1, i + 1));
              }}
              hideNextOnFinal
              ctaPulse={premiumCtaPulseOn}
            />
          </StickyActionBar>
        );
      })()}
      {/* Root-level "Powered by WeFixTrades" attribution. Sits at the very
          bottom of the widget root as a persistent, low-contrast-but-legible
          line — distinct from the sticky-bar footer slot, which collapses on
          mobile fold. Gated by the same showPoweredByBadge resolution
          (free tier forced ON; Pro+ honours branding.showPoweredBy). */}
      {showPoweredByBadge && (
        <div
          data-testid="advanced-powered-by-root"
          data-component-name="Powered by WeFixTrades (root)"
          style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '6px 8px',
            fontFamily,
          }}
        >
          <a
            href="https://wefixtrades.com"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="advanced-powered-by-root-link"
            style={{
              fontSize: 11, fontWeight: 600,
              color: guardTextColor(cc.textMuted, cc.surface, 'poweredByRoot'),
              letterSpacing: '0.02em',
              textDecoration: 'none',
            }}
          >
            {/* Brand the "Fix" in WeFixTrades the brand blue (#0d3cfc),
                matching the wordmark; the rest stays the muted footer colour. */}
            Powered by We<span style={{ color: '#0d3cfc' }}>Fix</span>Trades
          </a>
        </div>
      )}
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
      {/* BD-3l — Premium Animations Pack: confetti burst on quote
       *  completion. Fires once per session per calculator when the user
       *  reaches the contact (final) step. The component handles the
       *  sessionStorage gate + reduced-motion skip internally, so
       *  mounting it here is safe even when the pack is off. */}
      {premiumConfettiOn && (
        <ConfettiBurst
          trigger={useStepper && isContactStep ? 1 : 0}
          accent={accent}
          scopeKey={String(calculatorId ?? widgetClass)}
        />
      )}

      {/* Short modal lead-capture (name / phone / email) opened by the primary
          CTA. Theme + contrast come through the guarded `cc` theme and the
          CTA's guarded bg/fg pair. `position: fixed` overlays the viewport so
          the mount point here (widget root) is fine. */}
      <LeadModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        theme={cc}
        ctaBg={ctaBg}
        ctaFg={ctaFgGuarded}
        fontFamily={fontFamily}
        radiusPx={radiusInnerPx}
        /* Action tab — owner success copy (absent → LeadModal default). */
        successMessage={(results.submit_success || '').trim() || undefined}
        /* Action tab — spam honeypot. Default ON (protect by default); only
           an explicit `false` disables it. */
        honeypot={advanced.spamProtection !== false}
        onSubmit={analyticsCalcId ? async (lead: Lead) => {
          const resp = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              calculator_id: analyticsCalcId,
              name: lead.name,
              email: lead.email,
              phone: lead.phone || null,
              quote_amount: !quoteSuppressed
                && typeof effectiveQuoteValue === 'number' && Number.isFinite(effectiveQuoteValue)
                ? effectiveQuoteValue : null,
              answers: Object.keys(answers).length > 0 ? answers : null,
            }),
          });
          if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            throw new Error(body?.error || `Request failed (${resp.status})`);
          }
          trackSubmit();
        } : undefined}
      />
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
  // Also strip @import entirely: an imported stylesheet's rules cannot be
  // scoped to the widget root, so they would hit the whole host page.
  const clean = raw
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import\b[^;]*(;|$)/gi, '');
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
    // selectors we should scope. Pass through. (`import` removed from this
    // list — @import is stripped at scopeCustomCss entry, never passed through.)
    if (/^@(keyframes|font-face|charset|namespace)/i.test(trimmed)) {
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

/**
 * WIZARD-GAPS — `contact_form` content component.
 *
 * Renders an inline name + email + message block the owner can place anywhere
 * in the widget. On submit it POSTs to the SAME `/api/leads` endpoint the CTA
 * LeadModal / ContactStep use (reuse, not a parallel path) with the canonical
 * payload (`calculator_id`, `name`, `email`, optional message folded into
 * `answers`). When no `calculatorId` exists (preview / unsaved draft) the form
 * still renders + validates but the submit is disabled, mirroring the LeadModal
 * pattern (which only POSTs when an id is present).
 *
 * Required fields come from `field.contactRequire` (defaults to name + email).
 * The block carries NO quote answer — it is excluded from the formula context
 * alongside the other content components.
 */
function ContactFormField({
  field, theme, accent, fontFamily, radiusPx, fieldStyle, calculatorId, onLeadSubmitted,
}: {
  field: AdvField;
  theme: WidgetTheme;
  accent: string;
  fontFamily: string;
  radiusPx: string;
  fieldStyle: AdvFieldStyle;
  calculatorId?: number;
  onLeadSubmitted?: () => void;
}) {
  const c = theme;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  const require = field.contactRequire ?? ['name', 'email'];
  const heading = (field.label ?? '').trim() || 'Get in touch';
  const isOutline = fieldStyle === 'outline';
  const idBase = `adv-contact-form-${field.id}`;

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    minHeight: 44, borderRadius: radiusPx,
    border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
    padding: '0 14px', fontSize: '14px',
    color: c.text, background: isOutline ? 'transparent' : c.surface,
    fontFamily, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600,
    color: guardTextColor(c.textMuted, c.bg, 'contactFormLabel'),
    margin: '0 0 4px', fontFamily,
  };

  // Mirror the CTA button: accent fill with contrast-guarded text. Darken the
  // accent background when it's too light for white text — otherwise a pale /
  // near-white accent yields an invisible button (same pattern as the primary
  // CTA above). No-op when the accent is already dark enough.
  const btnBg = darkenBgForWhiteText(accent, 4.5);
  const btnFg = guardTextColor('#ffffff', btnBg, 'contactFormButtonText', { largeText: true });

  const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const validate = (): string | null => {
    if (require.includes('name') && name.trim() === '') return 'Please enter your name.';
    // Email is effectively required for submission regardless of contactRequire:
    // the /api/leads endpoint needs email || phone, and this form never sends a
    // phone — so without an email the request is un-submittable (400 at submit).
    if (email.trim() === '') return 'Please enter your email.';
    if (!emailValid(email)) return 'Please enter a valid email.';
    if (require.includes('message') && message.trim() === '') return 'Please enter a message.';
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    const err = validate();
    if (err) { setErrorText(err); setStatus('error'); return; }
    // No id (preview / unsaved) → can't POST. Surface a gentle note instead of
    // faking success.
    if (typeof calculatorId !== 'number') {
      setErrorText('Save your calculator to start collecting these messages.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setErrorText('');
    try {
      // Reuse the EXISTING lead-capture endpoint + payload shape. The message
      // rides in `answers` so the lead record keeps it without a schema change.
      const resp = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: calculatorId,
          name: name.trim(),
          email: email.trim(),
          phone: null,
          quote_amount: null,
          answers: message.trim() !== '' ? { message: message.trim() } : null,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${resp.status})`);
      }
      setStatus('done');
      onLeadSubmitted?.();
    } catch (err2) {
      setErrorText(err2 instanceof Error ? err2.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <div
        data-testid={idBase}
        data-contact-form-state="done"
        style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '16px 14px', borderRadius: radiusPx,
          border: `1px solid ${c.border}`, background: c.surface,
          color: c.text, fontFamily, fontSize: '14px',
        }}
      >
        <strong style={{ fontWeight: 700 }}>Thanks — message sent.</strong>
        <span style={{ color: c.textMuted, fontSize: '13px' }}>We&apos;ll be in touch shortly.</span>
      </div>
    );
  }

  return (
    <form
      data-testid={idBase}
      data-contact-form-state={status}
      onSubmit={onSubmit}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily }}
    >
      {heading ? (
        <div style={{
          fontSize: '15px', fontWeight: 700,
          color: guardTextColor(c.text, c.bg, 'contactFormHeading', { largeText: true }),
        }}>{heading}</div>
      ) : null}

      <div>
        <label htmlFor={`${idBase}-name`} style={labelStyle}>
          Name{require.includes('name') ? ' *' : ''}
        </label>
        <input
          id={`${idBase}-name`}
          type="text"
          autoComplete="name"
          value={name}
          required={require.includes('name')}
          onChange={(e) => setName(e.target.value)}
          data-testid={`${idBase}-name`}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-email`} style={labelStyle}>
          Email{require.includes('email') ? ' *' : ''}
        </label>
        <input
          id={`${idBase}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          required={require.includes('email')}
          onChange={(e) => setEmail(e.target.value)}
          data-testid={`${idBase}-email`}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-message`} style={labelStyle}>
          Message{require.includes('message') ? ' *' : ''}
        </label>
        <textarea
          id={`${idBase}-message`}
          rows={3}
          value={message}
          required={require.includes('message')}
          onChange={(e) => setMessage(e.target.value)}
          data-testid={`${idBase}-message`}
          style={{ ...inputStyle, minHeight: 76, padding: '10px 14px', resize: 'vertical', lineHeight: 1.4 }}
        />
      </div>

      {status === 'error' && errorText ? (
        <p
          role="alert"
          data-testid={`${idBase}-error`}
          style={{ margin: 0, fontSize: '12.5px', color: guardTextColor('#dc2626', c.bg, 'contactFormError'), fontFamily }}
        >{errorText}</p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        data-testid={`${idBase}-submit`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 44, padding: '0 18px', borderRadius: radiusPx,
          background: btnBg, color: btnFg, border: 'none',
          fontSize: '14px', fontWeight: 700, fontFamily, letterSpacing: '0.01em',
          cursor: status === 'submitting' ? 'default' : 'pointer',
          opacity: status === 'submitting' ? 0.7 : 1,
        }}
      >{status === 'submitting' ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}

function FieldInput({ field, value, accent, theme, bodyIsDark, onChange, radiusPx, fieldStyle, fontFamily, labelLayout = 'float', calculatorId, onLeadSubmitted, serviceArea }: {
  field: AdvField;
  value: Answer;
  accent: string;
  theme: WidgetTheme;
  /** Whether the widget body is dark — keeps group labels readable. */
  bodyIsDark: boolean;
  onChange: (v: Answer) => void;
  /** Wave H5 — corner radius applied to inputs / cards. */
  radiusPx: string;
  /** Wave H5 — `filled` (default) vs `outline`. */
  fieldStyle: AdvFieldStyle;
  /** Wave H5 — resolved font stack. */
  fontFamily: string;
  /** `float` (title-in-field) vs `stacked` (Elfsight title-above + help-below). */
  labelLayout?: 'float' | 'stacked';
  /**
   * WIZARD-GAPS — numeric calculator id, plumbed from the outer
   * `analyticsCalcId`. Required for the `contact_form` content component to
   * POST to /api/leads. When absent (preview / unsaved), the contact form
   * still renders + validates but its submit is disabled (same pattern as the
   * CTA LeadModal, which only POSTs when an id exists).
   */
  calculatorId?: number;
  /** WIZARD-GAPS — fired after a contact_form lead POST succeeds (→ trackSubmit). */
  onLeadSubmitted?: () => void;
  /** PRICING-MODELS (U2) — business service-area hint plumbed from
   *  `advanced.businessProfile.serviceArea`; the address_distance field's
   *  Places autocomplete uses it for the country restriction (same as
   *  ContactStep's address input). */
  serviceArea?: string;
}) {
  const f = field;
  const c = theme;
  // Elfsight-style stacked layout — bold dark title above the field, a small
  // grey help line below. Gated behind `labelLayout === 'stacked'` so the
  // legacy title-in-field float pattern is the unchanged default.
  const stacked = labelLayout === 'stacked';
  // Guard the stacked title against the body bg it renders on (c.bg — no
  // dedicated body-bg var is in this component's scope). 14px bold → large
  // text floor.
  const stackedLabelColor = guardTextColor(c.text, c.bg, 'fieldLabelStacked', { largeText: true });
  const stackedLabelStyle: React.CSSProperties = {
    display: 'block', fontSize: '14px', fontWeight: 700,
    color: stackedLabelColor,
    // Mirror into the group-label var so the editor-dark-mode override
    // (`.qq-w-grouplabel`) re-asserts THIS colour (not `inherit`) when a
    // grouped field uses the stacked layout — keeps stacked captions correct.
    ['--qq-w-grouplabel' as any]: stackedLabelColor,
    margin: '0 0 7px', letterSpacing: '-0.005em', lineHeight: 1.3,
    fontFamily,
  };
  const stackedHelp = stacked && f.help
    ? <p style={{
        margin: '7px 0 0', fontSize: '12px', fontWeight: 400,
        color: guardTextColor(c.textMuted, c.bg, 'fieldHelpStacked'),
        lineHeight: 1.45, fontFamily,
      }}>{f.help}</p>
    : null;
  // Wrap a bare control in the stacked label + help scaffold.
  const wrapStacked = (control: React.ReactNode, labelText?: string) => (
    <div>
      {(labelText ?? f.label) ? (
        <label htmlFor={inputId} style={stackedLabelStyle}>{labelText ?? f.label}</label>
      ) : null}
      {control}
      {stackedHelp}
    </div>
  );

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
  // FIX #3 — title-in-field label MUST always contrast its field background.
  // The floated label colour was raw `accent`; bright accents (e.g. the
  // "lemon" theme's #fde047, or an owner-picked white accent) rendered
  // invisible bright-on-white. Likewise an overridden `textBody` could land
  // near-white on a light surface. Funnel BOTH label colours through the
  // contrast guard against the SURFACE each one actually sits on:
  //   - resting label sits over the visible field fill: c.bg when the field
  //     is outline (input is transparent → body shows through), else c.surface.
  //   - floated label sits over the punch-through chip (--qq-w-bg below),
  //     which is c.bg (outline) / c.surface (filled) — same surface.
  // Large-text floor (≥12px bold floated / ~14px resting) is appropriate here.
  const labelChipBg = isOutline ? c.bg : c.surface;
  const restingLabelColor = guardTextColor(c.textBody, labelChipBg, 'fieldLabelResting');
  const floatedLabelColor = guardTextColor(accent, labelChipBg, 'fieldLabelFloated', { largeText: true });
  // GROUP-LABEL contrast fix — grouped fields (radio / multi-select /
  // image_choice / toggle) render their caption ABOVE the control via
  // `groupHeaderStyle`, so it paints on the BODY background (c.bg), NOT on the
  // input fill (labelChipBg = c.surface for filled fields). Re-guarding the
  // same `textBody` against c.bg means the "Add-ons" / radio captions are
  // legible against the surface they ACTUALLY sit on. When surface == bg (the
  // common light-theme case) this resolves identically to restingLabelColor;
  // it only diverges when the two differ (e.g. a tinted body bg, or an
  // owner-overridden text token that passes on one surface but not the other),
  // which is exactly when the wrong reference produced a washed-out caption.
  // Dark themes (dark c.bg) still yield a light, readable caption.
  const groupLabelColor = guardTextColor(c.textBody, c.bg, 'fieldGroupLabel');
  const floatVars: React.CSSProperties = {
    // CSS variables consumed by .qq-w-float in index.css.
    // Resting label uses textBody (not textMuted) so it stays readable — the
    // muted grey failed AA contrast on the dark themes (e.g. midnight).
    // Both colours are contrast-guarded so they're never bright-on-bright /
    // white-on-white regardless of theme, accent, or field style.
    ['--qq-w-label' as any]: restingLabelColor,
    ['--qq-w-label-focus' as any]: floatedLabelColor,
    ['--qq-w-bg' as any]: labelChipBg,
  };

  if (f.type === 'heading') {
    // BF-11 — heading fields support rich text (B/I/U, color, emoji, inline
    // image) just like header.title. Plain strings fall through unchanged.
    const headingProps = richTextRenderProps(f.label || '');
    const headingStyle = {
      fontSize: '15px', fontWeight: 700,
      // Heading sits on the body bg (c.bg). 15px bold → large-text floor.
      color: guardTextColor(c.text, c.bg, 'headingField', { largeText: true }),
      margin: '2px 0 0',
      paddingBottom: '7px', borderBottom: `1px solid ${c.border}`,
    } as const;
    return headingProps.__html
      ? <p style={headingStyle} dangerouslySetInnerHTML={{ __html: headingProps.__html }} />
      : <p style={headingStyle}>{headingProps.text ?? ''}</p>;
  }

  // COMPONENTS-1 — display-only branches. None of these persist an answer;
  // they're owner-curated content blocks that flow between input fields.
  if (f.type === 'paragraph') {
    const body = f.content ?? '';
    return (
      <p
        data-testid={`adv-paragraph-${f.id}`}
        style={{
          margin: 0, fontSize: '14px', lineHeight: 1.55, color: c.text,
          fontFamily, whiteSpace: 'pre-wrap',
        }}
      >{body}</p>
    );
  }

  if (f.type === 'divider') {
    const thickness = f.dividerThickness === 2 ? 2 : 1;
    const tone = f.dividerTone ?? 'subtle';
    const color = tone === 'accent' ? accent
      : tone === 'brand' ? '#0d3cfc'
      : c.border;
    return (
      <hr
        data-testid={`adv-divider-${f.id}`}
        data-tone={tone}
        aria-hidden="true"
        style={{
          margin: '12px 0', border: 0,
          borderTop: `${thickness}px solid ${color}`,
        }}
      />
    );
  }

  if (f.type === 'image') {
    const url = (f.imageUrl ?? '').trim();
    const caption = f.imageCaption ?? '';
    const alt = f.imageAlt ?? f.label ?? '';
    if (!url) {
      // Empty placeholder so wizard owners can SEE the slot they added
      // before pasting a URL. Customers shouldn't usually hit this — the
      // widget's renderer only fires after the owner publishes.
      return (
        <div
          data-testid={`adv-image-placeholder-${f.id}`}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4,
            padding: '24px 12px',
            border: `1px dashed ${c.border}`, borderRadius: radiusPx,
            color: c.textMuted, fontSize: '12px', fontFamily,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '22px' }}>🖼</span>
          <span>Add an image URL in the field settings.</span>
        </div>
      );
    }
    return (
      <figure
        data-testid={`adv-image-${f.id}`}
        style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          style={{
            display: 'block', maxWidth: '100%', height: 'auto',
            borderRadius: radiusPx,
          }}
        />
        {caption ? (
          <figcaption style={{
            fontSize: '12px', color: c.textMuted, lineHeight: 1.45,
            fontFamily,
          }}>{caption}</figcaption>
        ) : null}
      </figure>
    );
  }

  // BUILDER-COMPONENTS — content/CTA components. Neither persists an answer.
  // The owner's `label` is the visible text; `href` is the destination.
  if (f.type === 'button') {
    const text = (f.label ?? '').trim() || 'Button';
    const action = f.buttonAction ?? 'url';
    const raw = (f.href ?? '').trim();
    // Build the resolved href per action type. `tel:` / `mailto:` strip an
    // accidental scheme the owner may have typed so we never double-prefix.
    const href = raw === '' ? ''
      : action === 'tel' ? `tel:${raw.replace(/^tel:/i, '')}`
      : action === 'mailto' ? `mailto:${raw.replace(/^mailto:/i, '')}`
      : raw;
    // Reuse the CTA styling pattern (accent fill, guarded contrast). The
    // button text colour is contrast-guarded against the accent fill so a
    // bright/owner-picked accent never renders unreadable text.
    const btnFg = guardTextColor('#ffffff', accent, 'componentButtonText', { largeText: true });
    const shared: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, maxWidth: '100%', boxSizing: 'border-box',
      minHeight: 44, padding: '0 18px', borderRadius: radiusPx,
      background: accent, color: btnFg, border: 'none',
      fontSize: '14px', fontWeight: 700, fontFamily, letterSpacing: '0.01em',
      cursor: href ? 'pointer' : 'not-allowed', textDecoration: 'none',
      lineHeight: 1.2,
    };
    const label = <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>;
    // URL action opens in a new tab; tel/mailto navigate the current context.
    if (!href) {
      return (
        <button type="button" disabled data-testid={`adv-button-${f.id}`}
          aria-disabled="true" style={{ ...shared, opacity: 0.6 }}>{label}</button>
      );
    }
    if (action === 'url') {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer"
          data-testid={`adv-button-${f.id}`} data-button-action="url" style={shared}>{label}</a>
      );
    }
    return (
      <a href={href} data-testid={`adv-button-${f.id}`} data-button-action={action} style={shared}>{label}</a>
    );
  }

  if (f.type === 'link') {
    const text = (f.label ?? '').trim() || 'Link';
    const raw = (f.href ?? '').trim();
    // Themed inline anchor. The link colour is the widget accent, contrast-
    // guarded against the body background so it stays readable on any theme.
    const linkColor = guardTextColor(accent, c.bg, 'componentLink');
    const linkStyle: React.CSSProperties = {
      color: linkColor, fontFamily, fontSize: '14px', fontWeight: 600,
      textDecoration: 'underline', textUnderlineOffset: '2px',
      cursor: raw ? 'pointer' : 'not-allowed', overflowWrap: 'anywhere',
    };
    if (!raw) {
      return (
        <span data-testid={`adv-link-${f.id}`} aria-disabled="true"
          style={{ ...linkStyle, opacity: 0.6, textDecorationStyle: 'dashed' }}>{text}</span>
      );
    }
    return (
      <a href={raw} target="_blank" rel="noopener noreferrer"
        data-testid={`adv-link-${f.id}`} style={linkStyle}>{text}</a>
    );
  }

  // FIELD-PALETTE — video embed. Display-only; persists no answer. The owner
  // pastes a YouTube/Vimeo URL which is parsed into a sandboxed embed src
  // (only those two hosts are ever produced — no arbitrary-iframe injection).
  // Renders a responsive 16:9 iframe; an empty / unparseable URL shows a
  // small placeholder so owners can SEE the slot before pasting a link.
  if (f.type === 'video') {
    const embedSrc = parseVideoEmbedSrc(f.videoUrl);
    const caption = (f.videoCaption ?? '').trim();
    const title = (f.label ?? '').trim() || 'Embedded video';
    if (!embedSrc) {
      return (
        <div
          data-testid={`adv-video-${f.id}`}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4,
            padding: '24px 12px',
            border: `1px dashed ${c.border}`, borderRadius: radiusPx,
            color: c.textMuted, fontSize: '12px', fontFamily,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '22px' }}>▷</span>
          <span>Add a YouTube or Vimeo URL in the field settings.</span>
        </div>
      );
    }
    return (
      <figure
        data-testid={`adv-video-${f.id}`}
        style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <div
          style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 9',
            borderRadius: radiusPx, overflow: 'hidden',
            background: c.surface,
          }}
        >
          <iframe
            src={embedSrc}
            title={title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              border: 'none',
            }}
          />
        </div>
        {caption ? (
          <figcaption style={{
            fontSize: '12px', color: c.textMuted, lineHeight: 1.45,
            fontFamily,
          }}>{caption}</figcaption>
        ) : null}
      </figure>
    );
  }

  // WIZARD-GAPS — contact form content component. Persists no quote answer;
  // renders an inline name + email + message block that submits to the EXISTING
  // /api/leads endpoint (same path as the CTA LeadModal / ContactStep). Hooks
  // live in the dedicated ContactFormField component so they're never called
  // conditionally inside FieldInput.
  if (f.type === 'contact_form') {
    return (
      <ContactFormField
        field={f}
        theme={c}
        accent={accent}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
        fieldStyle={fieldStyle}
        calculatorId={calculatorId}
        onLeadSubmitted={onLeadSubmitted}
      />
    );
  }

  // PRICING-MODELS (U2) — the 3 computed-token field types. Each renders a
  // dedicated component (their hooks live there, so FieldInput never calls
  // hooks conditionally — same split as ContactFormField above). Value flow
  // stays parent-owned: `answers[f.name]` in, `onChange(answer)` out.
  if (f.type === 'address_distance') {
    const dv: DistanceAnswer = isDistanceAnswer(value)
      ? value : { address: '', distanceMiles: null, status: 'idle' };
    const control = (
      <DistanceField
        label={f.label}
        theme={c}
        accent={accent}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
        value={dv}
        onChange={onChange}
        calculatorId={calculatorId}
        fieldId={f.id}
        distanceUnit={f.distanceUnit}
        roundTrip={f.roundTrip === true}
        maxDistanceMiles={f.maxDistanceMiles}
        allowManualDistance={f.allowManualDistance !== false}
        serviceArea={serviceArea}
      />
    );
    // Title-in-field everywhere — the address input floats `f.label` itself.
    // Stacked mode only appends the help line (no duplicate outer title).
    if (stacked) return wrapStacked(control, '');
    return control;
  }

  if (f.type === 'rate_matrix') {
    const mv: MatrixAnswer = isMatrixAnswer(value) ? value : { rowId: '', colId: '' };
    return (
      <div>
        <MatrixField
          label={f.label}
          labelStyle={stacked ? stackedLabelStyle : groupHeaderStyle(c, bodyIsDark, groupLabelColor)}
          matrix={f.matrix}
          value={mv}
          onChange={onChange}
          theme={c}
          inputBase={inputBase}
          radiusPx={radiusPx}
          fontFamily={fontFamily}
          labelColor={floatedLabelColor}
          labelLayout={labelLayout}
          fieldId={f.id}
        />
        {stackedHelp}
      </div>
    );
  }

  if (f.type === 'photo_upload') {
    const pv: PhotoAnswer = isPhotoAnswer(value) ? value : { photos: [] };
    return (
      <div>
        <PhotoUploadField
          label={f.label}
          labelStyle={stacked ? stackedLabelStyle : groupHeaderStyle(c, bodyIsDark, groupLabelColor)}
          theme={c}
          accent={accent}
          fontFamily={fontFamily}
          radiusPx={radiusPx}
          value={pv}
          onChange={onChange}
          calculatorId={calculatorId}
          fieldId={f.id}
          maxPhotos={f.maxPhotos}
          maxPhotoMb={f.maxPhotoMb}
        />
        {stackedHelp}
      </div>
    );
  }

  // Stable id so the `<label>` associates with its control (a11y).
  const inputId = `adv-field-${f.id || f.name?.replace(/[^a-z0-9]+/gi, '_') || 'x'}`;

  if (f.type === 'number') {
    const numStep = Number(f.step) || 1;
    const curNum = Number(value) || 0;
    const bump = (dir: 1 | -1) => {
      let nv = curNum + dir * numStep;
      if (typeof f.max === 'number') nv = Math.min(f.max, nv);
      if (typeof f.min === 'number') nv = Math.max(f.min, nv);
      onChange(nv);
    };
    // Subtle up/down steppers — premium, understated; let customers nudge
    // the value without typing. tabIndex -1 so keyboard users still type.
    const steppers = (
      <div
        aria-hidden
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        }}
      >
        {([1, -1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            data-testid={`adv-number-step-${dir === 1 ? 'up' : 'down'}-${f.id}`}
            onClick={() => bump(dir)}
            style={{
              display: 'grid', placeItems: 'center', width: 18, height: 14,
              padding: 0, border: 'none', background: 'transparent',
              color: c.textMuted, cursor: 'pointer', lineHeight: 0,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24">
              <path
                d={dir === 1 ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
                fill="none" stroke="currentColor" strokeWidth={2.25}
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>
    );
    const numberInput = (extra?: React.CSSProperties) => (
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
        style={{ ...inputBase, fontFamily: eff.fontMono, paddingRight: 34, ...extra }}
      />
    );
    if (stacked) {
      return wrapStacked(
        <div style={{ position: 'relative' }}>
          {numberInput()}
          {steppers}
        </div>,
        `${f.label}${f.unit && !f.label.includes(`(${f.unit})`) ? ` (${f.unit})` : ''}`,
      );
    }
    return (
      <div className="qq-w-float" style={{ ...floatVars, position: 'relative' }}>
        {numberInput()}
        {/* Only append the unit when the label doesn't already include it —
            several presets put the unit in the label too (e.g. "Home size
            (sqft)" + unit "sqft"), which produced a doubled "(sqft) (sqft)".
            NOTE: the <label> MUST stay the immediate next sibling of the
            <input> — the float CSS uses `input + label`. The steppers go
            AFTER it (both are absolutely positioned, so DOM order is free). */}
        <label htmlFor={inputId}>{f.label}{f.unit && !f.label.includes(`(${f.unit})`) ? ` (${f.unit})` : ''}</label>
        {steppers}
      </div>
    );
  }

  if (f.type === 'text') {
    // COMPONENTS-1 — placeholder + maxLength + soft validation hint
    // (HTML5 type="email" / "tel" / "url" picks the right mobile keyboard
    // without forcing strict pattern enforcement). Title-in-field float
    // label is preserved.
    const htmlType = f.validation === 'email' ? 'email'
      : f.validation === 'phone' ? 'tel'
      : f.validation === 'url' ? 'url'
      : 'text';
    const textInput = (
      <input
        id={inputId}
        className="qq-w-input"
        type={htmlType}
        value={value as string}
        placeholder={f.placeholder ? f.placeholder : ' '}
        maxLength={typeof f.maxLength === 'number' && f.maxLength > 0 ? f.maxLength : undefined}
        required={f.required ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={inputBase}
        data-validation={f.validation ?? 'none'}
      />
    );
    if (stacked) return wrapStacked(textInput);
    return (
      <div className="qq-w-float" style={floatVars}>
        {textInput}
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
          <span style={stacked ? { ...stackedLabelStyle, margin: 0 } : {
            // Resting (non-stacked) slider caption sits on the body bg (c.bg).
            // The stacked branch reuses stackedLabelStyle, already guarded.
            fontSize: '11px', fontWeight: 600,
            color: guardTextColor(c.textMuted, c.bg, 'sliderLabelResting'),
            // Sentence case to match every other field/group label (was uppercase).
            letterSpacing: '0.02em',
          }}>{f.label}</span>
          <span style={stacked ? {
            fontSize: '13px', fontWeight: 700, color: c.text, fontFamily: eff.fontMono,
            background: 'rgba(15, 23, 42, 0.06)', borderRadius: eff.radiusSm, padding: '3px 9px',
          } : {
            fontSize: '13px', fontWeight: 700, color: accent, fontFamily: eff.fontMono,
            background: c.accentTint, borderRadius: eff.radiusSm, padding: '3px 9px',
          }}>
            {String(value)}{f.unit ? ' ' + f.unit : ''}
          </span>
        </div>
        <input
          id={inputId}
          aria-label={f.label}
          type="range"
          min={min} max={max} step={f.step || 1}
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="qq-w-slider"
          style={{
            width: '100%',
            accentColor: accent,
            ['--qq-slider-accent' as any]: accent,
            ['--qq-slider-track' as any]: 'rgba(15, 23, 42, 0.10)',
            ['--qq-slider-thumb-bg' as any]: '#ffffff',
            ['--qq-slider-pct' as any]: `${((Number(value) - min) / Math.max(1, max - min)) * 100}%`,
          }}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: '2px',
          fontSize: '11px', color: c.textMuted, fontFamily: eff.fontMono,
        }}>
          <span>{min}{f.unit ? ' ' + f.unit : ''}</span>
          <span>{max}{f.unit ? ' ' + f.unit : ''}</span>
        </div>
        {stackedHelp}
      </div>
    );
  }

  if (f.type === 'toggle') {
    const on = value === true;
    return (
      <div>
        {/* Group caption (same style as a multi-select's group label) so when a
            toggle sits beside a labelled field its control card lines up with
            that field's option cards instead of floating (Alex's page-2
            alignment). In FLOAT mode the toggle title gets its OWN single-line,
            left-aligned style (NOT the centered groupHeaderStyle) so a long
            label like "Add a deep clean (inside oven, fridge, baseboards)" stays
            on one line (ellipsized) with the toggle card under it, instead of
            centering + wrapping to 2-3 lines and colliding. */}
        <label
          className="qq-w-grouplabel"
          title={f.label}
          style={stacked ? stackedLabelStyle : {
            ...groupHeaderStyle(c, bodyIsDark, groupLabelColor),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >{f.label}</label>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '12px 14px', borderRadius: radiusPx,
          background: isOutline ? 'transparent' : c.surface,
          border: isOutline ? `2px solid ${c.border}` : `1px solid ${c.border}`,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: c.text, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{on ? 'Included' : 'Not included'}</span>
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
        {stackedHelp}
      </div>
    );
  }

  if (f.type === 'select') {
    // Custom dropdown (WidgetSelect) instead of a native <select>: a visible
    // themed chevron + a rounded, smoothly-animated options panel. Option
    // labels are projected to plain text (native parity — they were never
    // rich-HTML in the dropdown).
    const selectOptions = (f.options || []).map((o) => ({ id: o.id, label: richHtmlToPlainText(o.label) }));
    const select = (
      <WidgetSelect
        id={inputId}
        value={value as string}
        options={selectOptions}
        onChange={(id) => onChange(id)}
        label={f.label}
        theme={c}
        inputBase={inputBase}
        radiusPx={radiusPx}
        fontFamily={fontFamily}
        // W-LABELS contrast fix — pass the CONTRAST-GUARDED floated label
        // colour, not the raw `accent`. WidgetSelect paints this directly as
        // the floated label's `color` over the select button fill (c.surface
        // filled / c.bg outline = the same `labelChipBg` this colour is guarded
        // against). Passing raw `accent` here bypassed the guard, so an
        // owner-picked near-white accent rendered the "Service type" label
        // invisible (bright-on-white). `floatedLabelColor` is already guarded
        // against the real surface, so it stays readable on light AND dark.
        labelColor={floatedLabelColor}
        labelLayout={labelLayout}
      />
    );
    if (stacked) return wrapStacked(select);
    return select;
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
        <label className="qq-w-grouplabel" style={stacked ? stackedLabelStyle : groupHeaderStyle(c, bodyIsDark, groupLabelColor)}>{f.label}</label>
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
                {/* BG-7 Item 3 — sanitized rich-text label. */}
                {(() => {
                  const rp = richTextRenderProps(o.label);
                  // Guard against the option row's EFFECTIVE opaque bg. The
                  // selected fill is a ~10% accentTint composited over the LIGHT
                  // base (c.bg / c.surface), so the real background is near the
                  // base, not the alpha-dropped (opaque) accent. guardTextColor
                  // drops alpha, so passing accentTint would make it see the
                  // dark opaque accent and leave white text on a near-white fill
                  // (invisible). A 10% tint barely shifts base luminance, so the
                  // base is a faithful proxy and forces light text to dark.
                  // Outline → c.bg (transparent shows body through), else surface.
                  const optBg = isOutline ? c.bg : c.surface;
                  const optColor = guardTextColor(c.text, optBg, 'radioOptionLabel');
                  // One clean line — ellipsis instead of wrapping to 2 rows.
                  // minWidth:0 lets the span shrink so ellipsis engages and the
                  // control + label row stays aligned.
                  const optLabelStyle: React.CSSProperties = {
                    fontSize: '14px', color: optColor,
                    minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  };
                  return rp.__html
                    ? <span style={optLabelStyle} dangerouslySetInnerHTML={{ __html: rp.__html }} />
                    : <span style={optLabelStyle}>{rp.text}</span>;
                })()}
              </button>
            );
          })}
        </div>
        {stackedHelp}
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
        <label className="qq-w-grouplabel" style={stacked ? stackedLabelStyle : groupHeaderStyle(c, bodyIsDark, groupLabelColor)}>{f.label}</label>
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
                aria-label={richHtmlToPlainText(o.label)}
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
                    ? <img src={o.image} alt={richHtmlToPlainText(o.label)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span aria-hidden="true" style={{ fontSize: '28px', color: c.textMuted }}>🏠</span>}
                </div>
                {/* BG-7 Item 3 — sanitized rich-text label. */}
                {(() => {
                  const rp = richTextRenderProps(o.label);
                  // Same selected-fill trap as the radio rows: when selected the
                  // card bg is a ~10% accentTint over the LIGHT base (c.surface /
                  // body), so the effective bg is near-white. Guard the label
                  // against the opaque light base (guardTextColor drops alpha, so
                  // passing accentTint would see the dark opaque accent and leave
                  // white text invisible on the near-white fill).
                  const cardBg = isOutline ? c.bg : c.surface;
                  const cardColor = guardTextColor(c.text, cardBg, 'imageChoiceCardLabel');
                  // One clean line — ellipsis if the label is too long for the card.
                  const cardLabelStyle: React.CSSProperties = {
                    fontSize: '13px', fontWeight: 600, color: cardColor,
                    maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  };
                  return rp.__html
                    ? <span style={cardLabelStyle} dangerouslySetInnerHTML={{ __html: rp.__html }} />
                    : <span style={cardLabelStyle}>{rp.text}</span>;
                })()}
              </button>
            );
          })}
        </div>
        {stackedHelp}
      </div>
    );
  }

  // multi_select
  const ids = Array.isArray(value) ? value : [];
  // COMPONENTS-1 — min/max selection count guardrails. The renderer locks
  // further selections once `maxSelect` is hit (already-selected chips
  // remain togglable so customers can deselect to free a slot). The hint
  // line under the group label communicates the bounds; the formula engine
  // is unaffected (each picked option still contributes its `value`).
  const minSelect = typeof f.minSelect === 'number' && f.minSelect > 0 ? f.minSelect : 0;
  const maxSelect = typeof f.maxSelect === 'number' && f.maxSelect > 0 ? f.maxSelect : undefined;
  const atCap = maxSelect !== undefined && ids.length >= maxSelect;
  let hint = '';
  if (minSelect && maxSelect) hint = `Pick ${minSelect}–${maxSelect}`;
  else if (minSelect) hint = `Pick at least ${minSelect}`;
  else if (maxSelect) hint = `Pick up to ${maxSelect}`;
  return (
    <div>
      <label className="qq-w-grouplabel" style={stacked ? stackedLabelStyle : groupHeaderStyle(c, bodyIsDark, groupLabelColor)}>{f.label}</label>
      {hint && (
        <p
          data-testid={`adv-multiselect-hint-${f.id}`}
          style={{
            margin: '0 0 6px', fontSize: '11.5px', color: c.textMuted,
            fontFamily,
          }}
        >{hint}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(f.options || []).map((o) => {
          const sel = ids.includes(o.id);
          const locked = !sel && atCap;
          return (
            <button key={o.id} type="button"
              onClick={() => {
                if (sel) onChange(ids.filter((x) => x !== o.id));
                else if (!atCap) onChange([...ids, o.id]);
              }}
              aria-pressed={sel}
              aria-disabled={locked || undefined}
              disabled={locked}
              data-testid={`adv-multiselect-option-${f.id}-${o.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                // Match the toggle card exactly (padding + min-height) so all
                // selector cards on a step are identical (Alex).
                padding: '12px 14px', minHeight: 52, boxSizing: 'border-box',
                borderRadius: radiusPx,
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.55 : 1,
                border: 'none',
                // Selected = accent OUTLINE ring, NOT a bright fill (Alex's hard
                // rule). Keep the same dark surface so the white label never
                // drops onto a near-white accentTint and vanishes.
                background: isOutline ? 'transparent' : c.surface,
                boxShadow: sel ? `0 0 0 2px ${accent}`
                  : (isOutline ? `0 0 0 2px ${c.border}` : `0 0 0 1px ${c.border}`),
              }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? accent : c.surface, border: sel ? 'none' : `2px solid ${c.border}`,
                color: '#fff', fontSize: '12px', fontWeight: 700,
              }}>{sel ? '✓' : ''}</span>
              {/* BG-7 Item 3 / 5 — sanitized rich-text label + optional
                 *  description for multi_select (add-on items). */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {(() => {
                  const rp = richTextRenderProps(o.label);
                  // Multi-select row bg does NOT switch to accentTint on select
                  // (see comment above) — it stays surface/transparent. Outline →
                  // c.bg (body shows through), else c.surface.
                  const optBg = isOutline ? c.bg : c.surface;
                  const optColor = guardTextColor(c.text, optBg, 'multiSelectOptionLabel');
                  // Single line + ellipsis (parent column already minWidth:0).
                  const msLabelStyle: React.CSSProperties = {
                    fontSize: '14px', color: optColor,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  };
                  return rp.__html
                    ? <span style={msLabelStyle} dangerouslySetInnerHTML={{ __html: rp.__html }} />
                    : <span style={msLabelStyle}>{rp.text}</span>;
                })()}
                {(o as any).description && (() => {
                  const rp = richTextRenderProps((o as any).description as string);
                  const descBg = isOutline ? c.bg : c.surface;
                  const descColor = guardTextColor(c.textMuted, descBg, 'multiSelectOptionDesc');
                  return rp.__html
                    ? <span style={{ fontSize: '12px', color: descColor, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: rp.__html }} />
                    : <span style={{ fontSize: '12px', color: descColor, lineHeight: 1.4 }}>{rp.text}</span>;
                })()}
              </span>
            </button>
          );
        })}
      </div>
      {stackedHelp}
    </div>
  );
}
