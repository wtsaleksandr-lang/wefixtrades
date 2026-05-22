// Shared types for the Elfsight-clone editor shell.
//
// Wave H1 — minimum: businessName + layout (drives the placeholder preview).
// Wave H2 — adds `fields: TemplateField[]` and `calculations: TemplateCalculation[]`
// so the Build > Fields panel can drive the live preview directly. Calculations
// are seeded but not yet user-editable (lands in H3).
// Wave H5 — adds `style: ShellStyle` (alias for `AdvStyle`) so the Style tab
// can drive the preview's look directly.

import type {
  TemplateLayout, TemplateField, TemplateCalculation,
  AdvStyle, AdvFontFamily, AdvFieldStyle, AdvWidgetWidth,
  AdvLogoPlacement, AdvLogoSize,
  AdvHeadingWeight, AdvBodyWeight, AdvFontSize,
  TemplateTiered, BusinessProfile,
} from '@shared/templatePresets';
import { DEFAULT_ADV_STYLE } from '@shared/templatePresets';

export type EditorTab = 'build' | 'style' | 'settings' | 'install';

export const EDITOR_TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
  { id: 'install', label: 'Install' },
];

/**
 * BH-1 — wizard preview device preset. `tablet` was added alongside the
 * device-preset switcher in EditorTopBar; the canvas wrapper fixes the widget
 * preview width to 1280 / 768 / 375 px respectively. Persisted in
 * sessionStorage under `qq-wizard-device-preset` so the user's pick survives
 * tab navigation inside the editor.
 */
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

/** BH-1 — fixed widget-mockup width per device preset. The wizard canvas
 *  wrapper renders the QuoteWidget at this width; fit-to-canvas auto-zoom
 *  then scales it to the available pane size. Matches industry-standard
 *  Figma / Webflow / Builder.io presets. */
export const DEVICE_PRESET_WIDTH: Record<PreviewDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

/** BH-1 — sessionStorage key for the device preset. Lives in sessionStorage
 *  so the pick is per-tab (multiple browser tabs editing different
 *  calculators don't collide) but survives the user navigating between
 *  Build / Style / Settings / Install tabs. */
export const DEVICE_PRESET_STORAGE_KEY = 'qq-wizard-device-preset';

/**
 * The 6 public field-type slots in the Build > Fields > Add picker.
 *
 * The spec uses friendly names (`dropdown`, `choice`, `imageChoice`) while
 * the canonical `TemplateField['type']` enum uses the engine names
 * (`select`, `radio`, `image_choice`). Map between them with
 * `PUBLIC_TO_FIELD_TYPE` / `FIELD_TYPE_TO_PUBLIC` below.
 */
export type PublicFieldType =
  | 'slider' | 'number' | 'dropdown' | 'choice' | 'imageChoice' | 'heading';

export const PUBLIC_TO_FIELD_TYPE: Record<PublicFieldType, TemplateField['type']> = {
  slider: 'slider',
  number: 'number',
  dropdown: 'select',
  choice: 'radio',
  imageChoice: 'image_choice',
  heading: 'heading',
};

export const FIELD_TYPE_TO_PUBLIC: Partial<Record<TemplateField['type'], PublicFieldType>> = {
  slider: 'slider',
  number: 'number',
  select: 'dropdown',
  radio: 'choice',
  image_choice: 'imageChoice',
  heading: 'heading',
};

/** Header overrides — Wave H4. Both optional; blank values fall back to
 *  the AdvancedCalculator's defaults (businessName / no subtitle). */
export interface ShellHeader {
  title?: string;
  subtitle?: string;
}

/** Results overrides — Wave H4. Optional. */
export interface ShellResults {
  heading?: string;
  footnote?: string;
}

/**
 * Style overrides — Wave H5. Alias of the shared `AdvStyle` so the wizard
 * state, the PreviewPane merge, and the persisted `advanced.style` slot all
 * speak the same shape. Every field stays optional so an in-flight edit can
 * partial-update without forcing every field.
 */
export type ShellStyle = AdvStyle;
export type {
  AdvFontFamily as ShellFontFamily,
  AdvFieldStyle as ShellFieldStyle,
  AdvWidgetWidth as ShellWidgetWidth,
  AdvLogoPlacement as ShellLogoPlacement,
  AdvLogoSize as ShellLogoSize,
  AdvHeadingWeight as ShellHeadingWeight,
  AdvBodyWeight as ShellBodyWeight,
  AdvFontSize as ShellFontSize,
};

/**
 * Brand defaults exported through the shell scope.
 *
 * Wave AC-1 / W-AO-6b — only the always-set tokens carry defaults; new
 * optional tokens (per-viewport widths, the 5 extra colour tokens, logo
 * placement/size, typography depth) are intentionally absent so unsaved
 * calculators render identically to the pre-AO-6b build.
 */
export const DEFAULT_SHELL_STYLE: typeof DEFAULT_ADV_STYLE = DEFAULT_ADV_STYLE;

/**
 * Curated font families.
 *
 * Wave L S3 — added Satoshi (explicit), Geist, Plus Jakarta Sans, IBM Plex
 * Sans, Outfit, Sora. Every stack ends with `system-ui, sans-serif` so a
 * failed webfont request still renders the calculator in a sensible
 * fallback. Loaders live in client/index.html.
 */
export const FONT_FAMILY_STACKS: Record<AdvFontFamily, string> = {
  system: '"Satoshi Variable", system-ui, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  satoshi: '"Satoshi Variable", "Satoshi", system-ui, sans-serif',
  geist: '"Geist", "Geist Sans", system-ui, sans-serif',
  jakarta: '"Plus Jakarta Sans", system-ui, sans-serif',
  plex: '"IBM Plex Sans", system-ui, sans-serif',
  outfit: '"Outfit", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
};

export const FONT_FAMILY_LABELS: Record<AdvFontFamily, string> = {
  system: 'System (Satoshi)',
  inter: 'Inter',
  manrope: 'Manrope',
  satoshi: 'Satoshi',
  geist: 'Geist',
  jakarta: 'Plus Jakarta Sans',
  plex: 'IBM Plex Sans',
  outfit: 'Outfit',
  sora: 'Sora',
};

/**
 * Pricing model — Wave H6. A slimmer take on the legacy wizard's
 * Pricing step. The Elfsight clone exposes three top-level modes; per-mode
 * value inputs map onto the canonical `PricingConfigV1` shapes at save time.
 *  - `hourly` → `{ pricingType: 'hourly', rate }`
 *  - `fixed`  → `{ pricingType: 'min_charge_plus_addons', minCharge }`
 *  - `custom` → `{ pricingType: 'per_unit', unitName: label, rate }`
 */
export type ShellPricingMode = 'hourly' | 'fixed' | 'custom';

export interface ShellPricing {
  mode: ShellPricingMode;
  /** Hourly rate (mode = 'hourly') or custom per-unit rate (mode = 'custom'). */
  rate?: number;
  /** Fixed price (mode = 'fixed'). */
  value?: number;
  /** Custom unit label (mode = 'custom'). */
  label?: string;
}

/**
 * Number formatting — Wave H6. Drives the renderer's currency formatting in
 * the preview and the persisted calculator config. `thousands` and `decimal`
 * must differ (the picker enforces this); `currency` is a 3-letter code that
 * defaults to `USD`.
 */
export type ShellThousandsSep = 'comma' | 'space' | 'none';
export type ShellDecimalSep = 'dot' | 'comma';

export interface ShellNumberFormat {
  thousands: ShellThousandsSep;
  decimal: ShellDecimalSep;
  currency: string;
}

export const DEFAULT_SHELL_NUMBER_FORMAT: Readonly<ShellNumberFormat> = {
  thousands: 'comma',
  decimal: 'dot',
  currency: 'USD',
};

/**
 * Settings tab state — Wave H6. Every field optional so older persisted state
 * pre-dating H6 still parses cleanly. Defaults are applied lazily by readers
 * (StyleTab pattern) — there is no per-field migration required.
 */
export interface ShellSettings {
  /** WeFixTrades trade id (matches `client/src/data/trades.ts`). */
  tradeId?: string;
  /** Lead notification email — single recipient. Basic format check only. */
  leadEmail?: string;
  /** Pricing model + per-mode value inputs. */
  pricing?: ShellPricing;
  /** Number formatting (thousands / decimal / currency). */
  numberFormat?: ShellNumberFormat;
  /**
   * Custom CTA label — when set, overrides `results.cta_label` in the
   * preview/save payload (the AdvancedCalculator already honours that field).
   */
  ctaLabel?: string;
  /**
   * Wave H7 — render-time language for the embedded widget. ISO 639-1 code
   * (e.g. `en`, `es`, `zh`). Defaults to `en`. Used by the Install tab to
   * stamp `lang="…"` on the embed snippet and to set `document.documentElement
   * .lang` on the live preview. Translation strings for UI labels are out of
   * scope for H7 — only the picker + LANG attribute persist for now.
   */
  language?: string;
  /**
   * Wave P — hosted-page chrome. Drives the wrapping background +
   * optional headline / centered card on `{slug}.your-quote.net` and the
   * direct `/calculator?slug=…` URL. Embedded widgets (via `embed-widget
   * .js`) bypass this entirely — they render the bare widget so it sits
   * inside whatever container the host page provides.
   */
  hostedPage?: HostedPageSettings;
  /**
   * Wave P-F — user-chosen slug override. When set, the wizard sends it
   * as `preferred_slug` on save and the server uses it verbatim (if
   * valid + unique). When undefined, the server derives a slug from
   * businessName via slugify. Stored at the wizard level so the user can
   * pick a slug before the calculator exists server-side.
   */
  preferredSlug?: string;
  /**
   * Wave R-pre D — owner's preference for the WeFixTrades brand badge.
   * `true` (default) shows the badge on hosted + embed; `false` hides it.
   * The server-side gate (Wave Q-D) strips a `false` value for free-tier
   * calculators, so this only takes effect for Pro / Business plans.
   * Maps to calculator_settings.appearance.show_powered_by on save.
   */
  brandBadge?: boolean;
  /**
   * Wave R-1 — Calendly-style online booking. When enabled, the widget
   * surfaces a scheduling step after the price reveal. Persists into
   * `calculator_settings.appearance.scheduling` (+ a server-side
   * availability_rules row on save).
   */
  scheduling?: ShellSchedulingSettings;
  /**
   * Wave R-2 — Stripe deposit step config. Maps to
   * `calculator_settings.appearance.deposit` on save. When `enabled` is
   * true (and the calculator has a connected Stripe account), the widget
   * inserts a "Secure your slot" deposit panel after the price reveal.
   */
  deposit?: ShellDeposit;
  /**
   * Wave R-2 — whether the underlying calculator owner has finished the
   * Stripe Connect onboarding. Set by upstream consumers from the
   * server-side connect/status check; the SettingsTab reads it to
   * disable the Deposit fieldset when no Connect account exists.
   */
  stripeConnected?: boolean;
  /**
   * BD-2b — business profile fields driving the inline trust strip + trust
   * block under the CTA. Optional everywhere; the renderer hides the trust
   * UI entirely when the object is undefined OR every field is empty.
   */
  businessProfile?: BusinessProfile;
}

/**
 * Wave R-2 — Stripe deposit config. `mode='percent'` interprets `value`
 * as a percentage of the customer's quote; `mode='fixed'` interprets it
 * as a dollar amount. `label` overrides the panel headline; `required`
 * forces payment before advancing (when false a "Skip" link is shown).
 */
export interface ShellDeposit {
  enabled?: boolean;
  mode?: 'percent' | 'fixed';
  value?: number;
  label?: string;
  required?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────
 * Wave R-1 — Online booking settings
 * ───────────────────────────────────────────────────────────────────── */

export type ShellSlotDurationMinutes = 15 | 30 | 45 | 60;
export type ShellBufferMinutes = 0 | 5 | 10 | 15;
/** 0 = Sunday … 6 = Saturday (matches JS Date.getDay()). */
export type ShellWorkingDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ShellSchedulingSettings {
  enabled: boolean;
  /** Days of the week the business takes bookings. */
  workingDays: ShellWorkingDay[];
  /** "HH:MM" 24h. */
  workingHoursStart: string;
  /** "HH:MM" 24h. */
  workingHoursEnd: string;
  /** Length of one booking slot. */
  slotDurationMinutes: ShellSlotDurationMinutes;
  /** Gap between slots. */
  bufferMinutes: ShellBufferMinutes;
}

export const DEFAULT_SHELL_SCHEDULING: Readonly<ShellSchedulingSettings> = {
  enabled: false,
  workingDays: [1, 2, 3, 4, 5],
  workingHoursStart: '09:00',
  workingHoursEnd: '17:00',
  slotDurationMinutes: 30,
  bufferMinutes: 0,
};

/* ─────────────────────────────────────────────────────────────────────
 * Wave P — hosted-page chrome (Install tab "Hosted page" section).
 * ───────────────────────────────────────────────────────────────────── */

export type HostedBackgroundPresetId =
  | 'flat-white'
  | 'flat-midnight'
  | 'soft-brand-gradient'
  | 'dotted-grid-light'
  | 'dotted-grid-dark'
  | 'mesh-blur'
  | 'topo-lines'
  | 'diagonal-stripes';

export type HostedBackground =
  | { kind: 'preset'; presetId: HostedBackgroundPresetId }
  | { kind: 'solid'; color: string }
  | { kind: 'image'; dataUrl: string; overlay?: number /* 0..1 darken */ };

export interface HostedPageSettings {
  background?: HostedBackground;
  /** True = widget sits on a centered card with shadow. False = full-bleed. */
  showCard?: boolean;
  /** Optional headline rendered above the widget (e.g. "Get a quote from Joe's Plumbing"). */
  headline?: string;
  /** Optional subhead under the headline. */
  subheadline?: string;
  /** Show the business logo above the headline (uses ShellState.logo data URL). */
  showLogo?: boolean;
}

export const DEFAULT_HOSTED_PAGE: HostedPageSettings = {
  background: { kind: 'preset', presetId: 'soft-brand-gradient' },
  showCard: true,
  headline: '',
  subheadline: '',
  showLogo: true,
};

/** Catalogue of background presets — referenced by the wizard picker and
 *  the public-page renderer. Keep label + cssBackground in sync; the
 *  `cssBackground` runs inside HostedPageFrame's style attribute. The
 *  `swatch` is a smaller-resolution CSS for the preset gallery thumbnails. */
export const HOSTED_BACKGROUND_PRESETS: ReadonlyArray<{
  id: HostedBackgroundPresetId;
  label: string;
  cssBackground: string;
  swatch: string;
  /** True = dark preset; the headline/subhead flip to a light foreground. */
  dark?: boolean;
}> = [
  {
    id: 'flat-white',
    label: 'Flat white',
    cssBackground: '#f7f8fa',
    swatch: '#f7f8fa',
  },
  {
    id: 'flat-midnight',
    label: 'Flat midnight',
    cssBackground: '#0b1020',
    swatch: '#0b1020',
    dark: true,
  },
  {
    id: 'soft-brand-gradient',
    label: 'Soft brand gradient',
    cssBackground: 'linear-gradient(160deg, rgba(13,60,252,0.10) 0%, rgba(13,60,252,0.02) 60%, #fff 100%)',
    swatch: 'linear-gradient(160deg, rgba(13,60,252,0.18) 0%, rgba(13,60,252,0.04) 70%, #fff 100%)',
  },
  {
    id: 'dotted-grid-light',
    label: 'Dotted grid · light',
    cssBackground:
      'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.10) 1px, transparent 0) 0 0 / 22px 22px, #fafbfc',
    swatch:
      'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.18) 1px, transparent 0) 0 0 / 8px 8px, #fafbfc',
  },
  {
    id: 'dotted-grid-dark',
    label: 'Dotted grid · dark',
    cssBackground:
      'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 0) 0 0 / 22px 22px, #0b1020',
    swatch:
      'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.20) 1px, transparent 0) 0 0 / 8px 8px, #0b1020',
    dark: true,
  },
  {
    id: 'mesh-blur',
    label: 'Mesh blur',
    cssBackground:
      'radial-gradient(at 20% 20%, rgba(13,60,252,0.30) 0px, transparent 50%),' +
      'radial-gradient(at 80% 0%, rgba(34,211,238,0.22) 0px, transparent 50%),' +
      'radial-gradient(at 70% 80%, rgba(244,114,182,0.20) 0px, transparent 50%),' +
      'radial-gradient(at 0% 100%, rgba(168,85,247,0.18) 0px, transparent 50%),' +
      '#f8fafc',
    swatch:
      'radial-gradient(at 20% 20%, rgba(13,60,252,0.40) 0px, transparent 50%),' +
      'radial-gradient(at 80% 0%, rgba(34,211,238,0.30) 0px, transparent 50%),' +
      'radial-gradient(at 70% 80%, rgba(244,114,182,0.28) 0px, transparent 50%),' +
      '#f8fafc',
  },
  {
    id: 'topo-lines',
    label: 'Topographic',
    cssBackground:
      'repeating-linear-gradient(0deg, transparent 0 23px, rgba(15,23,42,0.045) 23px 24px),' +
      'repeating-linear-gradient(90deg, transparent 0 23px, rgba(15,23,42,0.045) 23px 24px),' +
      '#fbfcfd',
    swatch:
      'repeating-linear-gradient(0deg, transparent 0 7px, rgba(15,23,42,0.10) 7px 8px),' +
      'repeating-linear-gradient(90deg, transparent 0 7px, rgba(15,23,42,0.10) 7px 8px),' +
      '#fbfcfd',
  },
  {
    id: 'diagonal-stripes',
    label: 'Diagonal stripes',
    cssBackground:
      'repeating-linear-gradient(135deg, rgba(15,23,42,0.04) 0 14px, transparent 14px 28px), #fafbfc',
    swatch:
      'repeating-linear-gradient(135deg, rgba(15,23,42,0.10) 0 6px, transparent 6px 12px), #fafbfc',
  },
];

export function getHostedBackgroundPreset(id: HostedBackgroundPresetId) {
  return HOSTED_BACKGROUND_PRESETS.find((p) => p.id === id) ?? HOSTED_BACKGROUND_PRESETS[0];
}

/**
 * Wave P — smart default background.
 *
 * Picks a sensible preset for the hosted page based on the user's chosen
 * accent color + body background. Goals:
 *  - Dark body  → dark preset.
 *  - Cool / neutral accents → soft brand gradient (uses the accent).
 *  - Warm accents (red/orange/yellow) → mesh-blur (looks premium without
 *    clashing with the accent).
 *  - Green / earthy accents → dotted-grid-light (subtle, doesn't compete).
 *
 * The picker is intentionally simple — a hand-tuned hue-bucket map — so
 * the result is predictable for users iterating colors in the Style tab.
 */
export function smartDefaultHostedBackgroundId(
  accentHex: string | undefined,
  bodyBgHex: string | undefined,
): HostedBackgroundPresetId {
  const bodyDark = isHexDarkForSmartDefault(bodyBgHex);
  if (bodyDark) return 'dotted-grid-dark';
  const hue = hexToHue(accentHex ?? '#0d3cfc');
  if (hue === null) return 'soft-brand-gradient';
  // Hue buckets (HSL degrees):
  //   0–30  red       → mesh-blur (warm-on-warm clashes with gradient)
  //   30–70 orange/yellow → mesh-blur
  //   70–170 green/teal   → dotted-grid-light
  //   170–260 blue/purple → soft-brand-gradient
  //   260–340 magenta     → mesh-blur
  //   340–360 red         → mesh-blur
  if (hue < 30 || hue >= 340) return 'mesh-blur';
  if (hue < 70) return 'mesh-blur';
  if (hue < 170) return 'dotted-grid-light';
  if (hue < 260) return 'soft-brand-gradient';
  return 'mesh-blur';
}

function isHexDarkForSmartDefault(hex: string | undefined): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 110;
}

function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/**
 * Wave H7 — supported render languages for the embedded widget.
 *
 * The picker exposes these top-12 most-common quote-form locales worldwide.
 * Only the LANG attribute is wired in H7 — translation strings land in a
 * dedicated i18n build-out.
 */
export interface ShellLanguageOption {
  /** ISO 639-1 code (occasionally extended e.g. `pt-BR`). */
  code: string;
  /** English label shown in the dropdown. */
  label: string;
  /** Native-language label (shown as a hint in the option). */
  native: string;
}

// Wave R-pre v2 — trimmed from 12 to the 5 most-spoken/most-common
// target languages for North-American + European trade businesses. Per
// user feedback ("reduce to 5 most popular"). The translation strings
// themselves are still a TODO; this picker stamps lang="…" on the embed
// snippet today.
export const SHELL_LANGUAGES: ReadonlyArray<ShellLanguageOption> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
];

export const DEFAULT_SHELL_LANGUAGE = 'en';

/** Look up a language by ISO code; falls back to English. */
export function getShellLanguage(code: string | undefined): ShellLanguageOption {
  const target = (code ?? DEFAULT_SHELL_LANGUAGE).trim().toLowerCase();
  return SHELL_LANGUAGES.find(l => l.code === target) ?? SHELL_LANGUAGES[0];
}

/** Wave J — chrome theme for the editor surfaces only (NOT the template/preview). */
export type EditorTheme = 'light' | 'dark';

/**
 * H2 shell state — carries the live, editable fields list. H4 adds optional
 * header / results overrides + a `resultCalcId` carrying the user's
 * explicit headline choice (an id rather than a name, to survive renames).
 * H5 adds optional `style` overrides for the Style tab.
 * H6 adds optional `settings` for the Settings tab.
 * Wave J — adds optional `editorTheme` (chrome only) and `logo` (data URL).
 */
export interface ShellState {
  businessName: string;
  layout: TemplateLayout;
  fields: TemplateField[];
  calculations: TemplateCalculation[];
  /** H4 — header overrides (title / subtitle). */
  header?: ShellHeader;
  /** H4 — result-panel overrides (heading / footnote). */
  results?: ShellResults;
  /** H4 — the calc id (not name) chosen as the headline. */
  resultCalcId?: string;
  /** H5 — Style tab overrides. Seeded to brand defaults on first load. */
  style?: ShellStyle;
  /** H6 — Settings tab values (trade / lead email / pricing / number format / CTA label). */
  settings?: ShellSettings;
  /** H7 — id of the last-applied TEMPLATE_PRESETS entry (or undefined = blank). */
  activeTemplateId?: string;
  /** Wave J — editor chrome theme (light/dark). Only the chrome flips; the
   *  preview/template honours its own template-level theme. */
  editorTheme?: EditorTheme;
  /** Wave J — business logo (data URL or null). Persisted in shell state and
   *  surfaced into save-draft payload alongside business name. */
  logo?: string | null;
  /**
   * BD-2a — owner override for the multi-step renderer. `'stepper'` (default)
   * renders the new step-by-step layout; `'single'` reverts to the legacy
   * single-form layout. Stored at the shell level so the Style tab toggle
   * persists across template loads.
   */
  stepLayout?: 'stepper' | 'single';
  /**
   * BD-2b — Good/Better/Best 3-tier pricing override. When undefined, the
   * renderer derives the effective shape from the template's category
   * (scope-spectrum default-on; flat-fee default-off). When set, the explicit
   * value wins. Stored at the shell level so the StyleTab toggle persists
   * across template loads.
   */
  tiered?: TemplateTiered;
  /**
   * BG-7 Item 1 — owner-edited trust badge row. When the user applies a
   * template, the wizard seeds this from `template.trustBadges`. The
   * StyleTab Trust Badges editor mutates this slot directly.
   */
  trustBadges?: readonly import('@shared/templatePresets').TrustBadge[];
  /**
   * BG-7 Item 4 — owner-edited per-step content. Seeded from the active
   * template's `steps[]` (when present); owner edits flow through the
   * BuildTab "Step content" panel and propagate to the preview via
   * PreviewPane.
   */
  steps?: import('@shared/templatePresets').TemplateStep[];
}

export const INITIAL_SHELL_STATE: ShellState = {
  businessName: '',
  layout: 'two-column',
  fields: [],
  calculations: [],
  header: {},
  results: {},
  style: { ...DEFAULT_ADV_STYLE },
  settings: {
    numberFormat: { ...DEFAULT_SHELL_NUMBER_FORMAT },
    pricing: { mode: 'hourly', rate: 75 },
    language: DEFAULT_SHELL_LANGUAGE,
  },
  // Wave J — editorTheme + logo are left undefined so loaders can detect
  // "user hasn't picked yet" vs "user explicitly chose light".
  logo: null,
};
