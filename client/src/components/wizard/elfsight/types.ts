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
} from '@shared/templatePresets';
import { DEFAULT_ADV_STYLE } from '@shared/templatePresets';

export type EditorTab = 'build' | 'style' | 'settings' | 'install';

export const EDITOR_TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
  { id: 'install', label: 'Install' },
];

export type PreviewDevice = 'desktop' | 'mobile';

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
};

/** The brand defaults exported through the shell scope. */
export const DEFAULT_SHELL_STYLE: Required<ShellStyle> = DEFAULT_ADV_STYLE;

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

export const SHELL_LANGUAGES: ReadonlyArray<ShellLanguageOption> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'zh', label: 'Mandarin Chinese', native: '中文' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'it', label: 'Italian', native: 'Italiano' },
  { code: 'ko', label: 'Korean', native: '한국어' },
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
