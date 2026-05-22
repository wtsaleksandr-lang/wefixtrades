// StyleTab — Build > Style customisation (Wave H5).
//
// Surfaces the user-editable visual knobs that drive the AdvancedCalculator's
// look independently of the chosen template:
//   - Colours: accent / background / text / results-bg
//   - Typography: font family (curated set, no new font packages loaded)
//   - Shape: field style (filled vs outline) + corner radius slider
//   - Layout: widget width (narrow / wide / full)
//
// Every control is a tiny stateless leaf bound to a slice of `state.style`.
// State plumbing lives in WizardShell; the PreviewPane merges `state.style`
// into the `advanced` config so the renderer reflects the choices live.
//
// Brand defaults: accent #0d3cfc, white background, near-black text. These
// are sourced from `DEFAULT_SHELL_STYLE` so the StyleTab, the WizardShell
// initial state and `buildBlankPreviewConfig` can never drift.
//
// Zero new dependencies — colour pickers are native `<input type="color">`
// with a hex text field as a fallback / direct-edit affordance.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MousePointerClick, Square, Type, Receipt,
  Layers, Box, Frame, CheckCircle2, XCircle,
  Lock, Sparkles, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import {
  DEFAULT_SHELL_STYLE,
  FONT_FAMILY_LABELS,
  type ShellStyle,
  type ShellFontFamily,
  type ShellFieldStyle,
  type ShellWidgetWidth,
  type ShellLogoPlacement,
  type ShellLogoSize,
  type ShellHeadingWeight,
  type ShellBodyWeight,
  type ShellFontSize,
} from './types';
import type {
  AdvBgMode, AdvBgGradientDirection,
  AdvResultEmphasis, AdvResultBorder,
  AdvStepTransition,
  AdvPremiumAnimations,
  AdvDeposit, AdvBooking, AdvBranding, AdvBookingSource,
  AdvFloatingLauncher, AdvFloatingLauncherPosition,
  AdvButtonCopy,
  TemplateTiered, TemplateTier,
  TrustBadge,
} from '@shared/templatePresets';
import {
  inferDerivedCategoryFromBgFrom,
  shouldDefaultTiered,
  DEFAULT_TIERS,
} from '@shared/templatePresets';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import RichTextField from './RichTextField';
import {
  Shield, ShieldCheck, CheckCircle, Award,
  Star, ThumbsUp, BadgeCheck, Verified, ClipboardCheck, Clock,
  Leaf, FileBadge, Plus, X as XIcon, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useFoldablePanels } from './useFoldablePanels';
import { QUOTEQUICK_STYLE_PRESETS } from '@/data/quoteQuickStylePresets';

const p = platformTheme;

interface Props {
  style: ShellStyle;
  onChange: (next: ShellStyle) => void;
  /**
   * W-AO-6b — current logo data URL (or null). Plumbed in from WizardShell so
   * the Style tab's Branding section can offer logo upload + placement
   * controls without duplicating the file-reader plumbing already used by
   * BuildTab's logo affordance.
   */
  logo?: string | null;
  /** W-AO-6b — replace the logo (data URL) or clear (null). */
  onLogoChange?: (next: string | null) => void;
  /**
   * W-AO-6c — calculator owner's plan tier. Drives the Brand Studio
   * lock affordance: free-tier users see the controls (so they know
   * what's behind the paywall) but the section header shows a Lock +
   * Upgrade button; clicking edit controls is allowed for preview, but
   * the server strips the fields on save (defensive — see
   * calculatorRoutes.ts).
   */
  planTier?: string;
  /**
   * BD-2a — owner override for the multi-step renderer. `'stepper'`
   * (default, undefined-treated-as-stepper) shows the new multi-step
   * layout; `'single'` reverts to the legacy single-form layout.
   */
  stepLayout?: 'stepper' | 'single';
  /** BD-2a — change the step-layout mode. */
  onStepLayoutChange?: (next: 'stepper' | 'single') => void;
  /**
   * BD-2b — Good/Better/Best 3-tier pricing override. When undefined, the
   * renderer derives the effective tier state from the active template's
   * category (scope-spectrum categories default-on). The StyleTab section
   * shows the resolved state so the owner can flip it explicitly.
   */
  tiered?: TemplateTiered;
  /** BD-2b — change the tiered config (toggle on/off; edit per-tier shape). */
  onTieredChange?: (next: TemplateTiered | undefined) => void;
  /** BD-2b — the active template's category — drives the default-on hint
   *  + the resolved fallback when `tiered` is undefined. */
  templateCategory?: string;
  /**
   * BG-7 Item 1 — trust badges editor. Plumbed in from WizardShell as a
   * sibling slot to `style`, mirroring how `logo` rides alongside
   * `style.logoPlacement`. Free-tier viewers see the 4 defaults from the
   * template seed (read-only); Pro-tier callers get edit/add/remove
   * affordances. When `onTrustBadgesChange` is undefined the section is
   * not rendered at all.
   */
  trustBadges?: readonly TrustBadge[];
  onTrustBadgesChange?: (next: TrustBadge[]) => void;
}

/** BD-2c — discrete values for the AI chat visibility toggle (Pro-tier). */
type AiChatVisibility = 'rescue' | 'always';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Wave X #12 — preset palette in the ColourSwatch popover. Generic
 * brand-friendly hex values spanning the colour wheel; each is a standard
 * web hue (Tailwind-500/600 range) — colour values are uncopyrightable
 * facts, applied through our own picker UI. The custom-hex input + native
 * picker below the preset grid still cover arbitrary values, so power
 * users aren't constrained to the preset list.
 */
const PRESET_COLOURS: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#dc2626', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#fde047', name: 'Yellow' },
  { hex: '#84cc16', name: 'Lime' },
  { hex: '#10b981', name: 'Emerald' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#0ea5e9', name: 'Sky' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#4f46e5', name: 'Indigo' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#d946ef', name: 'Fuchsia' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#64748b', name: 'Slate' },
  { hex: '#1f2937', name: 'Charcoal' },
];

/**
 * Normalise an arbitrary string to a hex colour. Bare 3- or 6-digit hex
 * (with or without `#`) is accepted; anything else is rejected so a
 * partially-typed value doesn't reset the colour to black.
 */
function safeHex(raw: string): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (HEX_RE.test(v)) return v.toLowerCase();
  if (HEX_RE.test('#' + v)) return ('#' + v).toLowerCase();
  return null;
}

/**
 * Pick a high-contrast foreground (icon) colour for a given swatch
 * background. Computes perceived luminance via the standard ITU-R BT.601
 * weights; light backgrounds get a dark slate icon, dark / saturated
 * backgrounds get pure white. Brand Studio lets owners pick any hex, so
 * the icon must adapt — otherwise the lucide glyph vanishes against
 * white / pale custom swatches (Background, Surface, light yellows etc.).
 *
 * Accepts 3- or 6-digit hex (with or without leading `#`). Returns white
 * on any unparseable input so a partially-typed value can't break the UI.
 */
function getContrastingColor(hex: string): string {
  if (!hex) return '#ffffff';
  let v = hex.trim().replace(/^#/, '');
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return '#ffffff';
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

// W-AO-6b — bytes ceiling for the Branding logo upload. Matches the existing
// BuildTab limit so a logo set from either place rejects oversized files
// consistently (data URL inflates ~33% on top of this).
const LOGO_MAX_BYTES = 1024 * 1024;

// W-AO-6b — sensible fallback colour tokens used by the new swatch row.
// Mirror the conservative pan-theme defaults from widgetThemes.ts so the
// Style tab UI matches what the renderer will produce when nothing is set.
// BD-3f Item 4 — `secondary` removed (orphan field; never read).
const TOKEN_FALLBACKS = {
  surface: '#ffffff',
  border: '#e5e7eb',
  success: '#16a34a',
  error: '#dc2626',
} as const;

export default function StyleTab({
  style, onChange, logo, onLogoChange, planTier = 'free',
  stepLayout, onStepLayoutChange,
  tiered, onTieredChange, templateCategory,
  trustBadges, onTrustBadgesChange,
}: Props) {
  // W-AO-6c — Brand Studio is a Pro / Business upsell. Free users see the
  // controls (preview-only) so they understand the value; the section
  // header shows a Lock + Upgrade CTA and the server strips the fields
  // before persistence for non-paid plans.
  const isProTier = planTier === 'pro' || planTier === 'business' || planTier === 'starter';
  /** Patch a single style field (skipping `undefined` so blanks fall through). */
  const patch = useCallback(
    (next: Partial<ShellStyle>) => onChange({ ...style, ...next }),
    [style, onChange],
  );

  const accent = style.accent ?? DEFAULT_SHELL_STYLE.accent;
  const background = style.background ?? DEFAULT_SHELL_STYLE.background;
  const text = style.text ?? DEFAULT_SHELL_STYLE.text;
  const resultsBg = style.resultsBg ?? DEFAULT_SHELL_STYLE.resultsBg;
  // W-AO-6b — extended colour tokens (4 new — Secondary removed in BD-3f
  // Item 4 as it was an orphan field). All optional; show the fallback
  // value as the swatch when the user hasn't picked one.
  const surface = style.surface ?? TOKEN_FALLBACKS.surface;
  const borderColour = style.border ?? TOKEN_FALLBACKS.border;
  const success = style.success ?? TOKEN_FALLBACKS.success;
  const errorColour = style.error ?? TOKEN_FALLBACKS.error;
  const fontFamily = style.fontFamily ?? DEFAULT_SHELL_STYLE.fontFamily;
  const fieldStyle = style.fieldStyle ?? DEFAULT_SHELL_STYLE.fieldStyle;
  const radius = style.radius ?? DEFAULT_SHELL_STYLE.radius;
  const widgetWidth = style.widgetWidth ?? DEFAULT_SHELL_STYLE.widgetWidth;
  // Wave AC-1 — optional per-viewport pixel widths. Undefined → 'Auto'
  // label + the renderer falls back to the `widgetWidth` enum.
  const widgetWidthDesktop = style.widgetWidthDesktop;
  const widgetWidthMobile = style.widgetWidthMobile;
  // W-AO-6b — Branding (logo) + typography depth selections.
  const logoPlacement: ShellLogoPlacement = style.logoPlacement ?? 'top-center';
  const logoSize: ShellLogoSize = style.logoSize ?? 'small';
  const headingWeight: ShellHeadingWeight = style.headingWeight ?? 700;
  const bodyWeight: ShellBodyWeight = style.bodyWeight ?? 400;
  const fontSize: ShellFontSize = style.fontSize ?? 'medium';

  // BD-3k — Inline preview features (deposit / online-booking / "Powered
  // by WeFixTrades" badge). All three are optional renders on the widget;
  // when the corresponding `enabled` flag is false / absent the surface
  // does not appear. Free-tier patches that flip `branding.showPoweredBy`
  // off are stripped server-side (BRAND_STUDIO_STYLE_KEYS), so the badge
  // stays locked on for free. Deposit + Booking aren't tier-gated — they
  // are owner-facing affordances that work in every plan.
  const deposit: AdvDeposit = style.deposit ?? { enabled: false, amount: 200 };
  const depositEnabled = deposit.enabled === true;
  const depositAmount = (() => {
    const raw = deposit.amount;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 200;
    return Math.max(1, Math.min(100000, Math.round(raw)));
  })();
  const depositLabel = typeof deposit.label === 'string' ? deposit.label : '';
  const setDeposit = (next: Partial<AdvDeposit>) => {
    patch({
      deposit: {
        enabled: depositEnabled,
        amount: depositAmount,
        ...(depositLabel ? { label: depositLabel } : null),
        ...(style.deposit ?? {}),
        ...next,
      },
    });
  };

  const booking: AdvBooking = style.booking ?? { enabled: false, source: 'wefixtrades-default' };
  const bookingEnabled = booking.enabled === true;
  const bookingSource: AdvBookingSource = booking.source ?? 'wefixtrades-default';
  const bookingUrl = typeof booking.url === 'string' ? booking.url : '';
  const setBooking = (next: Partial<AdvBooking>) => {
    patch({
      booking: {
        enabled: bookingEnabled,
        source: bookingSource,
        ...(bookingUrl ? { url: bookingUrl } : null),
        ...(style.booking ?? {}),
        ...next,
      },
    });
  };

  // Branding badge — default ON when undefined. Free-tier locks it ON
  // (server-side strip + renderer-side fallback in AdvancedCalculator).
  const branding: AdvBranding = style.branding ?? { showPoweredBy: true };
  const showPoweredBy = branding.showPoweredBy !== false;
  // For free-tier users we display the toggle as disabled with a small
  // "Pro" pill so they understand why they can't turn it off. Pro+ users
  // see a normal interactive checkbox.
  const brandingLocked = !isProTier;
  const setBranding = (next: Partial<AdvBranding>) => {
    patch({
      branding: { showPoweredBy, ...(style.branding ?? {}), ...next },
    });
  };

  // BD-3m — Floating launcher embed mode. `enabled` + `position` are
  // free-tier allowed; `customIconUrl` + `label` are Pro-only (the server
  // route strips them on save, see calculatorRoutes.ts). The StyleTab
  // mirrors that gate visually — free-tier users see the icon-upload +
  // label inputs disabled with a PRO pill.
  const floatingLauncher: AdvFloatingLauncher = style.floatingLauncher ?? {};
  const floatingEnabled = floatingLauncher.enabled === true;
  const floatingPosition: AdvFloatingLauncherPosition = floatingLauncher.position ?? 'bottom-right';
  const floatingCustomIconUrl = typeof floatingLauncher.customIconUrl === 'string'
    ? floatingLauncher.customIconUrl : '';
  const floatingLabel = typeof floatingLauncher.label === 'string' ? floatingLauncher.label : '';
  const setFloatingLauncher = (next: Partial<AdvFloatingLauncher>) => {
    patch({
      floatingLauncher: {
        ...(style.floatingLauncher ?? {}),
        ...next,
      },
    });
  };
  const floatingIconFileRef = useRef<HTMLInputElement | null>(null);
  const onFloatingIconFile = useCallback((file: File | null) => {
    if (!isProTier) return;
    if (!file) { setFloatingLauncher({ customIconUrl: undefined }); return; }
    if (file.size > LOGO_MAX_BYTES) return; // silently skip — UI hint shown
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') setFloatingLauncher({ customIconUrl: result });
    };
    reader.readAsDataURL(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProTier, style.floatingLauncher]);

  // BD-3f Item 5 — ghost preview state. `ghost` holds the current
  // Success / Error demo banner key; null means no ghost mounted. The
  // banner auto-dismisses after 6 s via the timer below, or immediately
  // when the user clicks the × button (the GhostBanner handles its own
  // unmount). Editor-only — never persisted, never reaches the exported
  // widget.
  const [ghost, setGhostRaw] = useState<'success' | 'error' | null>(null);
  const ghostTimerRef = useRef<number | null>(null);
  const setGhost = useCallback((kind: 'success' | 'error' | null) => {
    if (ghostTimerRef.current !== null) {
      window.clearTimeout(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }
    setGhostRaw(kind);
    if (kind !== null) {
      ghostTimerRef.current = window.setTimeout(() => {
        setGhostRaw(null);
        ghostTimerRef.current = null;
      }, 6000);
    }
  }, []);
  useEffect(() => () => {
    if (ghostTimerRef.current !== null) {
      window.clearTimeout(ghostTimerRef.current);
    }
  }, []);

  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const onLogoFile = useCallback((file: File | null) => {
    if (!onLogoChange) return;
    if (!file) { onLogoChange(null); return; }
    if (file.size > LOGO_MAX_BYTES) return; // silently skip — UI hint shown
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') onLogoChange(result);
    };
    reader.readAsDataURL(file);
  }, [onLogoChange]);

  /** W-AO-6b — apply a full preset, overwriting every Style token. */
  const applyPreset = useCallback((next: ShellStyle) => {
    // Preserve per-viewport pixel widths (these are page-layout choices, not
    // visual-design choices), but everything else gets replaced.
    onChange({
      ...next,
      ...(style.widgetWidthDesktop !== undefined ? { widgetWidthDesktop: style.widgetWidthDesktop } : {}),
      ...(style.widgetWidthMobile !== undefined ? { widgetWidthMobile: style.widgetWidthMobile } : {}),
    });
  }, [onChange, style.widgetWidthDesktop, style.widgetWidthMobile]);

  // BD-3g Item 2 — wire fold/unfold behavior onto every <fieldset.qq-style-group>
  // under this panel. Per-panel state persists in sessionStorage keyed by
  // `qq-wizard-panel-style-${panelId}` where panelId is the fieldset's
  // data-testid (see useFoldablePanels for the storage prefix + defaults).
  const stylePanelRef = useRef<HTMLElement | null>(null);
  useFoldablePanels(stylePanelRef, 'style');

  return (
    <section
      ref={stylePanelRef}
      className="qq-style-panel"
      // `editor-tabpanel-style` matches the convention asserted by the H1
      // generic-tab-switching test (`editor-tabpanel-<id>`).
      data-testid="editor-tabpanel-style"
      aria-label="Style"
      role="tabpanel"
    >
      {/* ── W-AO-6d — Brand Kit (Pro) ────────────────────────────────
       *
       * Reusable bundle of Style settings the user can apply across
       * every calculator they own. Sits at the top so it's the first
       * thing a Pro user reaches for; free users see a Lock + upsell.
       * The picker / save dialog talk to /api/portal/brand-kits/* via
       * the cookie-authenticated portal session. If the user isn't
       * portal-authenticated (e.g. token-based edit page), the
       * picker silently degrades to a sign-in CTA. */}
      <BrandKitGroup
        style={style}
        logo={logo ?? null}
        onApply={(next, nextLogo) => {
          onChange({ ...style, ...next });
          if (nextLogo && onLogoChange) onLogoChange(nextLogo);
        }}
        isProTier={isProTier}
      />

      {/* ── Theme presets (W-AO-6b) ─────────────────────────────────
       *
       * One-click bundles that overwrite every Style token. Sits at the top
       * of the panel because picking a preset is the fastest way to a
       * polished look; per-field controls below let the user customise from
       * the chosen baseline. */}
      <fieldset className="qq-style-group" data-testid="style-group-theme">
        <legend className="qq-style-legend">
          Theme
          <InfoCue
            testid="style-section-theme"
            region="background"
            text="One-click theme bundles. Picking one overwrites the colours, typography, shape and density below — customise after if you like."
          />
        </legend>
        <div className="qq-style-group-body">
        <div
          className="qq-style-preset-cards"
          role="listbox"
          aria-label="Theme presets"
          data-testid="style-theme-presets"
        >
          {QUOTEQUICK_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="qq-style-preset-card"
              data-testid={`style-theme-preset-${preset.id}`}
              title={preset.description}
              aria-label={`Apply ${preset.name} theme — ${preset.description}`}
              onClick={() => applyPreset(preset.style)}
            >
              <div
                className="qq-style-preset-card-swatch"
                aria-hidden="true"
                style={{
                  background: preset.style.background ?? '#ffffff',
                  borderColor: preset.style.border ?? '#e5e7eb',
                }}
              >
                <span
                  className="qq-style-preset-card-accent"
                  style={{ background: preset.style.accent ?? '#0d3cfc' }}
                />
                <span
                  className="qq-style-preset-card-text"
                  style={{ color: preset.style.text ?? '#0f172a' }}
                >
                  Aa
                </span>
              </div>
              <span className="qq-style-preset-card-name">{preset.name}</span>
            </button>
          ))}
        </div>
        </div>
      </fieldset>

      {/* ── Branding (W-AO-6b) ──────────────────────────────────────
       *
       * Logo upload + placement + size. The upload writes to `state.logo`
       * (same wire as BuildTab's logo affordance) — the data URL is passed
       * into AdvancedCalculator as `logoUrl`. Placement + size are persisted
       * on the Style slot so they round-trip with the rest of the visual
       * config. */}
      {onLogoChange && (
        <fieldset className="qq-style-group" data-testid="style-group-branding">
          <legend className="qq-style-legend">
            Branding
            <InfoCue
              testid="style-section-branding"
              region="header"
              text="Upload your logo and choose where it sits in the calculator header. The default trade icon is hidden once you upload your own logo."
            />
          </legend>
          <div className="qq-style-group-body">
          <div className="qq-style-logo-row">
            <button
              type="button"
              className="qq-style-logo-upload"
              data-testid="style-logo-upload"
              aria-label={logo ? 'Replace business logo' : 'Upload business logo'}
              onClick={() => logoFileRef.current?.click()}
            >
              {logo ? (
                <img src={logo} alt="" data-testid="style-logo-preview" />
              ) : (
                <span className="qq-style-logo-upload-plus" aria-hidden="true">＋</span>
              )}
            </button>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              aria-label="Upload business logo"
              data-testid="style-logo-input"
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                onLogoFile(f);
                e.target.value = '';
              }}
            />
            <div className="qq-style-logo-meta">
              <div className="qq-style-logo-hint">
                {logo ? 'Drag a file onto the box to replace, or click.' : 'Drop a PNG/SVG here, or click to choose.'}
              </div>
              {logo && (
                <button
                  type="button"
                  className="qq-style-logo-clear"
                  data-testid="style-logo-clear"
                  onClick={() => onLogoChange(null)}
                >Remove logo</button>
              )}
            </div>
          </div>

          <label className="qq-style-label" style={{ marginTop: 12 }}>
            <span className="qq-style-label-text">Placement</span>
          </label>
          <SegmentedControl<ShellLogoPlacement>
            name="logo-placement"
            testid="style-segmented-logo-placement"
            value={logoPlacement}
            options={[
              { value: 'top-left', label: 'Left' },
              { value: 'top-center', label: 'Center' },
              { value: 'top-right', label: 'Right' },
              { value: 'hidden', label: 'Hidden' },
            ]}
            onChange={(v) => patch({ logoPlacement: v })}
          />

          <label className="qq-style-label" style={{ marginTop: 12 }}>
            <span className="qq-style-label-text">Size</span>
          </label>
          <SegmentedControl<ShellLogoSize>
            name="logo-size"
            testid="style-segmented-logo-size"
            value={logoSize}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            onChange={(v) => patch({ logoSize: v })}
          />

          {/* ── BD-3k — "Powered by WeFixTrades" badge toggle ────────────
            *
            * Renders a small text-only badge inside the sticky bottom
            * action bar's footer area. Default ON for free tier (locked);
            * Pro+ can toggle freely. The renderer also applies a defensive
            * fallback: free-tier widgets render the badge regardless of
            * stored value (server-side strip via BRAND_STUDIO_STYLE_KEYS
            * is the primary gate; the renderer's plan check is defense in
            * depth). Section-title pattern per BD-3f; help cue points to
            * the sticky-footer region via the WidgetSchema diagram.
            */}
          <div
            className="qq-bs-sub"
            data-testid="style-sub-branding-powered-by"
            style={{ marginTop: 12 }}
          >
            <p className="qq-bs-sub-title">
              <span className="qq-bs-sub-title-text">
                WeFixTrades badge
                {brandingLocked && (
                  <span
                    className="qq-bs-pill"
                    aria-label="Pro plan feature"
                    style={{ marginLeft: 6 }}
                  >
                    <Sparkles size={10} aria-hidden="true" /> Pro
                  </span>
                )}
              </span>
              <InfoCue
                testid="style-branding-powered-by-info"
                region="sticky-footer"
                text="Shows a small 'Powered by WeFixTrades' link centred under the action buttons in the widget footer. Free-tier calculators have this on by default and can't disable it; Pro plans can switch it off for a fully white-labelled widget."
              />
            </p>
            <p className="qq-bs-sub-hint">
              {brandingLocked
                ? "Free plan widgets always show a small 'Powered by WeFixTrades' badge in the footer. Upgrade to Pro to remove it."
                : "Show the small 'Powered by WeFixTrades' badge in the widget footer. Turn off for a fully white-labelled widget."}
            </p>
            <label
              className="qq-style-label"
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: brandingLocked ? 'not-allowed' : 'pointer',
                opacity: brandingLocked ? 0.7 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={brandingLocked ? true : showPoweredBy}
                disabled={brandingLocked}
                onChange={(e) => setBranding({ showPoweredBy: e.target.checked })}
                data-testid="style-branding-powered-by"
                aria-label="Show 'Powered by WeFixTrades' badge"
              />
              <span className="qq-style-label-text" style={{ margin: 0 }}>
                Show "Powered by WeFixTrades" badge
              </span>
            </label>
          </div>
          </div>
        </fieldset>
      )}

      {/* ── BD-3k — Deposit preview ──────────────────────────────────
        *
        * Renders a small accent-tinted badge above the action buttons
        * on the widget's result step ("$X deposit required to schedule").
        * Tapping the badge opens a Stripe-style preview card (visual
        * only — production checkout is wired elsewhere). Owner-facing
        * surface; not Pro-gated. Schema region: 'result'. */}
      <fieldset className="qq-style-group" data-testid="style-group-deposit">
        <legend className="qq-style-legend">
          Deposit
          <InfoCue
            testid="style-section-deposit"
            region="result"
            text="Show a 'Deposit required to schedule' badge above the action buttons on the result step. Tapping the badge opens a Stripe-style preview card so the owner can see what the customer experiences. The actual checkout flow is wired separately to Stripe — the preview never charges money."
          />
        </legend>
        <div className="qq-style-group-body">
          <label
            className="qq-style-label"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={depositEnabled}
              onChange={(e) => setDeposit({ enabled: e.target.checked })}
              data-testid="style-deposit-enabled"
              aria-label="Require deposit to schedule"
            />
            <span className="qq-style-label-text" style={{ margin: 0, fontWeight: 700 }}>
              Require deposit to schedule
            </span>
          </label>

          {depositEnabled && (
            <div
              style={{
                marginTop: 10, paddingLeft: 12,
                borderLeft: `2px solid ${p.colors.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
              data-testid="style-deposit-sub-fields"
            >
              <FloatField label="Deposit amount (USD)" htmlFor="qq-style-deposit-amount">
                <input
                  id="qq-style-deposit-amount"
                  type="number"
                  className="premium-input"
                  min={1}
                  max={100000}
                  step={1}
                  inputMode="numeric"
                  placeholder=" "
                  value={depositAmount}
                  data-testid="style-deposit-amount"
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    setDeposit({ amount: Math.max(1, Math.min(100000, Math.round(raw))) });
                  }}
                />
              </FloatField>
              <FloatField label="Badge label (optional)" htmlFor="qq-style-deposit-label">
                <input
                  id="qq-style-deposit-label"
                  type="text"
                  className="premium-input"
                  maxLength={120}
                  placeholder=" "
                  value={depositLabel}
                  data-testid="style-deposit-label"
                  onChange={(e) => setDeposit({ label: e.target.value })}
                />
              </FloatField>
            </div>
          )}
        </div>
      </fieldset>

      {/* ── BD-3k — Online-booking calendar ────────────────────────
        *
        * Renders a mock 3-day slot picker beneath the result-step
        * price headline. Default source uses built-in mock slots
        * (delegates to BB-1's `book_appointment` customer tool when
        * available); `cal.com-url` / `calendly-url` open an external
        * scheduler in a new tab. Schema region: 'result'. */}
      <fieldset className="qq-style-group" data-testid="style-group-booking">
        <legend className="qq-style-legend">
          Online booking
          <InfoCue
            testid="style-section-booking"
            region="result"
            text="Adds a 3-day appointment slot picker beneath the price on the result step. Default uses built-in mock slots in the preview (production wires to your scheduler). You can also point it at a Cal.com or Calendly URL — tapping a slot then opens the external scheduler in a new tab."
          />
        </legend>
        <div className="qq-style-group-body">
          <label
            className="qq-style-label"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={bookingEnabled}
              onChange={(e) => setBooking({ enabled: e.target.checked })}
              data-testid="style-booking-enabled"
              aria-label="Show calendar in widget"
            />
            <span className="qq-style-label-text" style={{ margin: 0, fontWeight: 700 }}>
              Show calendar in widget
            </span>
          </label>

          {bookingEnabled && (
            <div
              style={{
                marginTop: 10, paddingLeft: 12,
                borderLeft: `2px solid ${p.colors.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
              data-testid="style-booking-sub-fields"
            >
              <FloatField label="Calendar source" htmlFor="qq-style-booking-source" variant="select">
                <select
                  id="qq-style-booking-source"
                  className="premium-input"
                  value={bookingSource}
                  data-testid="style-booking-source"
                  onChange={(e) => setBooking({ source: e.target.value as AdvBookingSource })}
                >
                  <option value="wefixtrades-default">WeFixTrades default (built-in slots)</option>
                  <option value="cal.com-url">Cal.com URL</option>
                  <option value="calendly-url">Calendly URL</option>
                </select>
              </FloatField>
              {(bookingSource === 'cal.com-url' || bookingSource === 'calendly-url') && (
                <FloatField label="Scheduler URL" htmlFor="qq-style-booking-url">
                  <input
                    id="qq-style-booking-url"
                    type="url"
                    className="premium-input"
                    placeholder=" "
                    value={bookingUrl}
                    data-testid="style-booking-url"
                    onChange={(e) => setBooking({ url: e.target.value })}
                  />
                </FloatField>
              )}
            </div>
          )}
        </div>
      </fieldset>

      {/* ── Colours ─────────────────────────────────────────────────
       *
       * BD-3f Item 2 — 5+4 grid layout (row 1 has 5 swatches, row 2 has 4)
       * via `display: grid; grid-template-columns: repeat(5, 1fr)`. Pure
       * CSS — the 9th item naturally falls onto the second row.
       *
       * BD-3f Item 4 — Secondary swatch REMOVED. The `style.secondary`
       * slot was plumbed into the AdvancedCalculator's resolveTheme()
       * but never read anywhere in the rendered widget, so the picker was
       * misleading the owner. Removed pending an actual consumer in a
       * future wave; the optional field stays on the type for forward
       * compat. Decision documented in the BD-3f PR body.
       *
       * BD-3f Item 5 — Success / Error swatches mount a dismissable
       * "ghost" demo toast onto the preview pane so the owner can SEE the
       * colour they're picking in context. The ghost auto-dismisses after
       * 6s; it's editor-only and never reaches the exported widget. */}
      <fieldset className="qq-style-group qq-style-group--colours" data-testid="style-group-colours">
        <legend className="qq-style-legend">
          Colours
          <InfoCue
            testid="style-section-colours"
            region="background"
            text="Click any swatch to change the calculator's accent, background, body text, or result-card colour. Success / Error briefly preview a demo toast on the canvas."
          />
        </legend>
        <div className="qq-style-group-body">
        <div className="qq-style-swatches qq-style-swatches--grid" data-testid="style-swatches-row">
          <ColourSwatch
            icon={MousePointerClick}
            label="Accent"
            testid="style-input-accent"
            value={accent}
            fallback={DEFAULT_SHELL_STYLE.accent}
            onChange={(v) => patch({ accent: v })}
          />
          <ColourSwatch
            icon={Square}
            label="Background"
            testid="style-input-background"
            value={background}
            fallback={DEFAULT_SHELL_STYLE.background}
            onChange={(v) => patch({ background: v })}
          />
          <ColourSwatch
            icon={Box}
            label="Surface"
            testid="style-input-surface"
            value={surface}
            fallback={TOKEN_FALLBACKS.surface}
            onChange={(v) => patch({ surface: v })}
          />
          <ColourSwatch
            icon={Type}
            label="Text"
            testid="style-input-text"
            value={text}
            fallback={DEFAULT_SHELL_STYLE.text}
            onChange={(v) => patch({ text: v })}
          />
          <ColourSwatch
            icon={Receipt}
            label="Results bg"
            testid="style-input-resultsbg"
            value={resultsBg}
            fallback={DEFAULT_SHELL_STYLE.resultsBg}
            onChange={(v) => patch({ resultsBg: v })}
          />
          {/* Row 2 — secondary tokens. 4 items: Border, Success, Error,
              and a placeholder slot (intentionally empty for now —
              keeps the 5+4 grid balanced. Future colour tokens slot in
              here without re-flowing the layout). */}
          <ColourSwatch
            icon={Frame}
            label="Border"
            testid="style-input-border"
            value={borderColour}
            fallback={TOKEN_FALLBACKS.border}
            onChange={(v) => patch({ border: v })}
          />
          <ColourSwatch
            icon={CheckCircle2}
            label="Success"
            testid="style-input-success"
            value={success}
            fallback={TOKEN_FALLBACKS.success}
            onChange={(v) => patch({ success: v })}
            onOpen={() => setGhost('success')}
          />
          <ColourSwatch
            icon={XCircle}
            label="Error"
            testid="style-input-error"
            value={errorColour}
            fallback={TOKEN_FALLBACKS.error}
            onChange={(v) => patch({ error: v })}
            onOpen={() => setGhost('error')}
          />
        </div>
        </div>
      </fieldset>

      {/* ── Typography ──────────────────────────────────────────────
       *
       * Wave L S2 — visible "Typography" heading dropped; the font picker
       * speaks for itself. Legend kept for screen readers. */}
      <fieldset className="qq-style-group" data-testid="style-group-typography">
        <legend className="qq-style-legend">
          Typography
          <InfoCue
            testid="style-section-typography"
            region="header"
            text="Sets the font family the calculator renders in. We load each option from the host site so widget pages don't pull a new web font."
          />
        </legend>
        <div className="qq-style-group-body">
        <FloatField label="Font family" htmlFor="qq-style-font" variant="select">
          <select
            id="qq-style-font"
            className="premium-input"
            value={fontFamily}
            onChange={(e) => patch({ fontFamily: e.target.value as ShellFontFamily })}
            data-testid="style-select-font"
          >
            {(Object.keys(FONT_FAMILY_LABELS) as ShellFontFamily[]).map((k) => (
              <option key={k} value={k}>{FONT_FAMILY_LABELS[k]}</option>
            ))}
          </select>
        </FloatField>

        {/* W-AO-6b — typography depth. Heading weight, body weight, base
            size. All flow into the renderer as CSS variables so the title
            bar, breakdown rows + body text inherit cleanly. */}
        <label className="qq-style-label" style={{ marginTop: 12 }}>
          <span className="qq-style-label-text">Heading weight</span>
        </label>
        <SegmentedControl<ShellHeadingWeight>
          name="heading-weight"
          testid="style-segmented-heading-weight"
          value={headingWeight}
          options={[
            { value: 500, label: '500' },
            { value: 600, label: '600' },
            { value: 700, label: '700' },
            { value: 800, label: '800' },
          ]}
          onChange={(v) => patch({ headingWeight: v })}
        />

        <label className="qq-style-label" style={{ marginTop: 12 }}>
          <span className="qq-style-label-text">Body weight</span>
        </label>
        <SegmentedControl<ShellBodyWeight>
          name="body-weight"
          testid="style-segmented-body-weight"
          value={bodyWeight}
          options={[
            { value: 400, label: '400' },
            { value: 500, label: '500' },
          ]}
          onChange={(v) => patch({ bodyWeight: v })}
        />

        <label className="qq-style-label" style={{ marginTop: 12 }}>
          <span className="qq-style-label-text">Base size</span>
        </label>
        <SegmentedControl<ShellFontSize>
          name="font-size"
          testid="style-segmented-font-size"
          value={fontSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => patch({ fontSize: v })}
        />
        </div>
      </fieldset>

      {/* ── Shape ────────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-shape">
        <legend className="qq-style-legend">
          Shape
          <InfoCue
            testid="style-section-shape"
            region="step-content"
            text="Controls input style (filled vs outline) and how rounded corners are everywhere — cards, inputs, the CTA button."
          />
        </legend>
        <div className="qq-style-group-body">
        {/* BD-3e Fix 3 — duplicate `<InfoCue testid="style-shape">` removed.
         * The section legend's cue already covers Field style. Matches the
         * Typography section (legend-cue only, per-label cues omitted). */}
        <label className="qq-style-label">
          <span className="qq-style-label-text">
            Field style
          </span>
        </label>
        <SegmentedControl<ShellFieldStyle>
          name="field-style"
          testid="style-segmented-fieldstyle"
          value={fieldStyle}
          options={[
            { value: 'filled', label: 'Filled' },
            { value: 'outline', label: 'Outline' },
          ]}
          onChange={(v) => patch({ fieldStyle: v })}
        />

        <label className="qq-style-label" htmlFor="qq-style-radius" style={{ marginTop: 12 }}>
          Corner radius
          <span className="qq-style-value" data-testid="style-radius-value">
            {radius}px
          </span>
        </label>
        <input
          id="qq-style-radius"
          type="range"
          min={0}
          max={24}
          step={1}
          value={radius}
          onChange={(e) => patch({ radius: Number(e.target.value) })}
          className="qq-style-range"
          data-testid="style-input-radius"
          aria-valuemin={0}
          aria-valuemax={24}
          aria-valuenow={radius}
        />
        </div>
      </fieldset>

      {/* ── Layout ──────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-layout">
        <legend className="qq-style-legend">
          Layout
          <InfoCue
            testid="style-section-layout"
            region="background"
            text="How wide the calculator renders on desktop and mobile. Narrow / Wide / Full controls the breakpoint; the sliders below override with exact pixel values."
          />
        </legend>
        <div className="qq-style-group-body">
        {/* BD-3e Fix 3 — duplicate `<InfoCue testid="style-layout">` removed.
         * The section legend's cue already covers Widget width. */}
        <label className="qq-style-label">
          <span className="qq-style-label-text">
            Widget width
          </span>
        </label>
        <SegmentedControl<ShellWidgetWidth>
          name="widget-width"
          testid="style-segmented-width"
          value={widgetWidth}
          options={[
            { value: 'narrow', label: 'Narrow' },
            { value: 'wide', label: 'Wide' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={(v) => patch({ widgetWidth: v })}
        />

        {/* Wave AC-1 — per-viewport pixel overrides. Optional; when set
         * they win over the enum on the matching viewport. Clamped to safe
         * ranges (desktop 320–800, mobile 320–440). */}
        <label className="qq-style-label" htmlFor="qq-style-width-desktop" style={{ marginTop: 12 }}>
          Desktop width
          <span className="qq-style-value" data-testid="style-width-desktop-value">
            {widgetWidthDesktop !== undefined ? `${widgetWidthDesktop}px` : 'Auto'}
          </span>
        </label>
        <input
          id="qq-style-width-desktop"
          type="range"
          min={320}
          max={800}
          step={10}
          value={widgetWidthDesktop ?? 560}
          onChange={(e) => patch({ widgetWidthDesktop: Number(e.target.value) })}
          className="qq-style-range"
          data-testid="style-input-width-desktop"
          aria-valuemin={320}
          aria-valuemax={800}
          aria-valuenow={widgetWidthDesktop ?? 560}
        />

        <label className="qq-style-label" htmlFor="qq-style-width-mobile" style={{ marginTop: 12 }}>
          Mobile width
          <span className="qq-style-value" data-testid="style-width-mobile-value">
            {widgetWidthMobile !== undefined ? `${widgetWidthMobile}px` : 'Auto'}
          </span>
        </label>
        <input
          id="qq-style-width-mobile"
          type="range"
          min={320}
          max={440}
          step={5}
          value={widgetWidthMobile ?? 380}
          onChange={(e) => patch({ widgetWidthMobile: Number(e.target.value) })}
          className="qq-style-range"
          data-testid="style-input-width-mobile"
          aria-valuemin={320}
          aria-valuemax={440}
          aria-valuenow={widgetWidthMobile ?? 380}
        />

        {/* ── BD-2a — Step layout subsection ───────────────────────
         *
         * Toggle between the multi-step renderer (default — ships the
         * 3x-CVR lever from BD-0 research) and the legacy single-form
         * layout. Owners on conservative templates can opt back; new
         * templates get the stepper out of the box.
         */}
        {onStepLayoutChange && (
          <div
            data-testid="style-step-layout"
            style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--qq-style-divider, rgba(15,23,42,0.06))' }}
          >
            <label className="qq-style-label">
              <span className="qq-style-label-text">
                Step layout
                <InfoCue
                  testid="style-step-layout-info"
                  region="step-content"
                  text="Multi-step (the default) renders one question per screen — ~3x higher quote completion in industry benchmarks. Single form keeps every field on one page."
                />
              </span>
            </label>
            <SegmentedControl<'stepper' | 'single'>
              name="step-layout"
              testid="style-segmented-step-layout"
              value={stepLayout ?? 'stepper'}
              options={[
                { value: 'stepper', label: 'Multi-step' },
                { value: 'single', label: 'Single form' },
              ]}
              onChange={(v) => onStepLayoutChange(v)}
            />
            <p
              style={{
                fontSize: 11, color: 'var(--qq-style-hint, #64748b)',
                margin: '6px 0 0', lineHeight: 1.4,
              }}
            >
              Recommended: Multi-step. Industry data shows multi-step quote forms
              convert at ~13.85% vs ~4.53% for single-page forms.
            </p>
          </div>
        )}

        {/* ── BD-2b — Pricing tiers subsection ──────────────────────
         *
         * Good/Better/Best 3-tier pricing toggle + per-tier editor.
         * Auto-enabled for scope-spectrum categories (Construction, Home
         * Improvement, Outdoor); off by default for flat-fee categories.
         * Owners can flip explicitly.
         *
         * Research (BD-0): tiered presentation consistently outperforms
         * single-price AND 4+-tier alternatives (FieldPulse / Jobber /
         * Journal of Business Research). The middle "Most Popular" tier
         * anchors choice.
         */}
        {onTieredChange && (
          <PricingTiersSubsection
            tiered={tiered}
            onTieredChange={onTieredChange}
            templateCategory={templateCategory}
          />
        )}

        {/* ── BD-2c — AI chat visibility subsection (Pro tier) ────────
         *
         * Toggle between the new "stuck-customer rescue" default (bubble
         * stays hidden until the user has progressed past step 2, idles for
         * 30s on a single step, or explicitly clicks Help) and the legacy
         * "always visible" behaviour. Research (BD-0): always-visible
         * bubbles compete with the form — treating AI as a rescue surface
         * lifts both form completion AND chat engagement.
         *
         * Free-tier calculators always use 'rescue' (server-enforced via
         * BRAND_STUDIO_STYLE_KEYS-style strip in calculatorRoutes).
         */}
        <div
          data-testid="style-ai-chat-visibility"
          style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--qq-style-divider, rgba(15,23,42,0.06))' }}
        >
          <label className="qq-style-label">
            <span className="qq-style-label-text">
              AI chat visibility
              {!isProTier && (
                <span style={{ marginLeft: 6, fontSize: 10, color: '#92400e', fontWeight: 700 }}>
                  PRO
                </span>
              )}
              <InfoCue
                testid="style-ai-chat-visibility-info"
                region="chat-bubble"
                text="Stuck-customer rescue (default) keeps the AI bubble hidden until the user has progressed past step 2, idles for 30s, or clicks Help. Always visible matches the legacy behaviour."
              />
            </span>
          </label>
          <SegmentedControl<AiChatVisibility>
            name="ai-chat-visibility"
            testid="style-segmented-ai-chat-visibility"
            value={(style.aiChatVisibility as AiChatVisibility) ?? 'rescue'}
            options={[
              { value: 'rescue', label: 'Stuck-customer rescue' },
              { value: 'always', label: 'Always visible' },
            ]}
            onChange={(v) => {
              if (!isProTier) return;
              patch({ aiChatVisibility: v });
            }}
          />
          <p
            style={{
              fontSize: 11, color: 'var(--qq-style-hint, #64748b)',
              margin: '6px 0 0', lineHeight: 1.4,
            }}
          >
            Recommended: Stuck-customer rescue. BD-0 research shows always-on
            bubbles compete with the form — treating AI as a rescue surface
            lifts both form completion AND chat engagement.
          </p>
        </div>
        </div>
      </fieldset>

      {/* ── BD-3m — Floating launcher embed mode ───────────────────
       *
       * Section-title-in-container pattern + BD-3h help-cue with
       * region="chat-bubble" (same region the AI chat visibility toggle
       * uses — both controls live in the same neighbourhood of the
       * rendered widget). Master toggle + position dropdown + Pro-tier
       * custom icon + Pro-tier label.
       *
       * Tier gating: master + position are free-tier; the icon upload +
       * label are Pro-only. Server-side strip handles the customIconUrl /
       * label nested keys (calculatorRoutes.ts). The renderer also
       * ignores the Pro fields when planTier is free (defense in depth,
       * mirrored in CalculatorLauncher.tsx). */}
      <fieldset className="qq-style-group" data-testid="style-group-floating-launcher">
        <legend className="qq-style-legend">
          Floating launcher
          <InfoCue
            testid="style-section-floating-launcher"
            region="chat-bubble"
            text="Shows a small circular calculator icon docked in a corner of the page. Clicking the icon expands the full widget into a panel. Use this when the widget shouldn't always be visible — it stays out of the way until the customer asks for it. Pro users can swap the icon for a custom image and change the screen-reader label."
          />
        </legend>
        <div className="qq-style-group-body">
          <label
            className="qq-style-label"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={floatingEnabled}
              onChange={(e) => setFloatingLauncher({ enabled: e.target.checked })}
              data-testid="style-floating-launcher-enabled"
              aria-label="Enable floating launcher embed"
            />
            <span className="qq-style-label-text" style={{ margin: 0, fontWeight: 700 }}>
              Use floating launcher
            </span>
          </label>
          <p
            style={{
              fontSize: 11, color: 'var(--qq-style-hint, #64748b)',
              margin: '6px 0 0', lineHeight: 1.4,
            }}
          >
            Recommended for sites where the widget doesn't fit a hero section. The
            launcher icon docks in a corner; the panel expands on click.
          </p>

          {floatingEnabled && (
            <div
              style={{
                marginTop: 10, paddingLeft: 12,
                borderLeft: `2px solid ${p.colors.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
              data-testid="style-floating-launcher-sub-fields"
            >
              <FloatField label="Corner" htmlFor="qq-style-floating-launcher-position" variant="select">
                <select
                  id="qq-style-floating-launcher-position"
                  className="premium-input"
                  value={floatingPosition}
                  data-testid="style-floating-launcher-position"
                  onChange={(e) => setFloatingLauncher({
                    position: e.target.value as AdvFloatingLauncherPosition,
                  })}
                >
                  <option value="bottom-right">Bottom right (default)</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="top-right">Top right</option>
                  <option value="top-left">Top left</option>
                </select>
              </FloatField>

              {/* Pro-tier — custom icon upload. Mirrors the Branding logo
               *  pattern: 1 MB cap, data URL, silent rejection over the cap.
               *  Free-tier owners see the field disabled with a PRO pill. */}
              <FloatField
                label="Custom icon (optional)"
                htmlFor="qq-style-floating-launcher-icon"
                infoText="Upload a 1 MB max image to replace the default calculator icon. PNG / SVG / JPEG; transparent backgrounds work best. Free tier uses the default brand-blue calculator icon."
                infoTestid="style-floating-launcher-icon"
              >
                <input
                  id="qq-style-floating-launcher-icon"
                  ref={floatingIconFileRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="premium-input"
                  data-testid="style-floating-launcher-icon-file"
                  disabled={!isProTier}
                  onChange={(e) => onFloatingIconFile(e.target.files?.[0] ?? null)}
                  aria-label="Upload custom launcher icon"
                />
              </FloatField>
              {floatingCustomIconUrl && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}
                  data-testid="style-floating-launcher-icon-preview"
                >
                  <img
                    src={floatingCustomIconUrl}
                    alt=""
                    width={36}
                    height={36}
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      objectFit: 'cover', border: `1px solid ${p.colors.border}`,
                      background: '#fff',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setFloatingLauncher({ customIconUrl: undefined })}
                    data-testid="style-floating-launcher-icon-clear"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${p.colors.border}`,
                      borderRadius: 7,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                      color: p.colors.body,
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              {!isProTier && (
                <p
                  style={{
                    fontSize: 11, color: '#92400e',
                    margin: 0, lineHeight: 1.4,
                  }}
                  data-testid="style-floating-launcher-icon-locked"
                >
                  <strong style={{ marginRight: 4 }}>PRO</strong>
                  Custom icon + screen-reader label are part of the Pro plan.
                </p>
              )}

              <FloatField
                label="Screen-reader label (optional)"
                htmlFor="qq-style-floating-launcher-label"
              >
                <input
                  id="qq-style-floating-launcher-label"
                  type="text"
                  className="premium-input"
                  maxLength={120}
                  placeholder=" "
                  value={floatingLabel}
                  data-testid="style-floating-launcher-label"
                  disabled={!isProTier}
                  onChange={(e) => setFloatingLauncher({ label: e.target.value })}
                />
              </FloatField>
            </div>
          )}
        </div>
      </fieldset>

      {/* ── BG-7 Item 1 — Trust badge editor ────────────────────────
       *
       * BF-8+9 (PR #498) pre-loaded 4 trust badges per template into
       * `templatePresets.ts` but never shipped the owner-facing editor.
       * This section closes that loop: owners can re-order, edit, add
       * or remove badges via the inline editor below.
       *
       * Tier gating: Pro-only edits (`BRAND_STUDIO_STYLE_KEYS` doesn't
       * cover trustBadges directly because they live on
       * AdvancedConfigShape rather than AdvStyle — the gating happens
       * here in the UI; free-tier users see the 4 defaults from the
       * template seed but every editor control is disabled). */}
      <TrustBadgesGroup
        badges={trustBadges}
        onChange={onTrustBadgesChange}
        isProTier={isProTier}
      />

      {/* ── BG-7 Item 6 — Button copy override ──────────────────────
       *
       * Per-template overrides for the 5 widget action buttons (Back,
       * Continue, See my quote, Email me, Book a consultation). All
       * five fields are optional — an empty value falls back to the
       * renderer's default copy. Compact RichTextField inputs so the
       * section stays dense.
       *
       * Tier gating: Pro-only — listed in BRAND_STUDIO_STYLE_KEYS so
       * free-tier patches are stripped before persistence. Free-tier
       * owners see disabled inputs + a small PRO pill. */}
      <ButtonCopyGroup
        buttonCopy={style.buttonCopy}
        onChange={(next) => patch({ buttonCopy: next })}
        isProTier={isProTier}
      />

      {/* ── W-AO-6c — Brand Studio (Pro) ────────────────────────────
       *
       * Three Pro-tier features grouped in a single collapsible section
       * at the bottom of the Style tab: Custom CSS, image / gradient
       * background, and result-panel overrides. Free users see the
       * controls (preview-only) but the section header shows a Lock +
       * Upgrade CTA; the server strips the fields before persistence
       * for non-paid plans. */}
      <BrandStudioGroup
        style={style}
        patch={patch}
        isProTier={isProTier}
      />

      {/* BD-3f Item 5 — Success / Error ghost preview. Mounts a demo
       *  toast onto the preview pane so the owner sees the colour they
       *  just picked. Dismissable; auto-clears after 6 s. */}
      {ghost && (
        <GhostBanner
          kind={ghost}
          colour={ghost === 'success' ? success : errorColour}
          onClose={() => setGhost(null)}
        />
      )}

      <style>{`
        /* W-AO-9 — section gap tightened 18px → 2px. The 1px border on
         * each .qq-style-group keeps the visual separation clear; the
         * previous 18px gutter made the Style tab feel under-populated. */
        .qq-style-panel {
          display: flex; flex-direction: column; gap: 2px;
        }
        /* BD-3f Item 1 — section title pattern: title sits INSIDE the
         * container as a header row, separated from the body by a hairline
         * divider. Pattern is uniform across every Style-tab section.
         *
         * The fieldset itself gets padding 0 so the legend's built-in
         * horizontal padding does not collide with the body; the legend
         * becomes a block-level header row with its own 12/14 px padding,
         * then a 1px hairline divider, then the body inner
         * (.qq-style-group-body) gets its own padding. */
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 0;
          background: #fff;
          margin: 0;
        }
        /* BD-3f Item 1 — header row sits flush at the top of the
         * fieldset. display:block + width:100% is required because the
         * legend tag is normally a special inline element that floats on
         * the fieldset border. */
        .qq-style-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          margin: 0;
          border-bottom: 1px solid ${p.colors.borderLight};
          float: left;
        }
        /* BD-3f Item 1 — body wrapper inside every group. Sits below the
         * header divider with its own 12/14 px padding so titles never
         * touch the content. Float clear is needed because the legend
         * floats left to opt out of the default <legend> positioning. */
        .qq-style-group-body {
          clear: both;
          padding: 12px 14px 14px;
        }
        /* Section-level help that used to live in an InfoCue beside the
         * legend. Same muted styling, sits under the legend as a body
         * line so it reads like a caption, not a heading. */
        .qq-style-sectionhint {
          margin: 0 0 8px;
          font-size: 11.5px; line-height: 1.5;
          color: ${p.colors.subtle};
        }
        /* Wave L S2 — screen-reader-only legend (Colors / Typography). The
         * visible text is dropped because the controls below speak for
         * themselves, but the <legend> stays for assistive tech. */
        .qq-style-legend--sr-only {
          position: absolute;
          width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0,0,0,0); white-space: nowrap; border: 0;
        }
        .qq-style-grid {
          display: grid; gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-style-grid { grid-template-columns: 1fr; }
        }

        /* Wave L S1 — single-row swatches. Extra bottom padding so the
         * absolute-positioned label sits inside the fieldset.
         *
         * BD-3f Item 2 — qq-style-swatches--grid variant lays the 9
         * swatches out in a 5-column grid (row 1 = 5 picks, row 2 = the
         * remaining 4). Item 5 — labels constrained to the swatch width
         * via max-width plus ellipsis so they never overlap into
         * adjacent swatches at narrow sidebar widths. */
        .qq-style-swatches {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding-bottom: 16px;
        }
        .qq-style-swatches--grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px 4px;
          padding-bottom: 22px;
          align-items: start;
          justify-items: center;
        }
        /* When the colours fieldset is the swatch-only variant, drop its
         * generous bottom padding since the swatches own the spacing. */
        .qq-style-group--colours {
          padding-bottom: 8px;
        }
        .qq-style-swatch-btn {
          position: relative;
          width: 36px; height: 36px; border-radius: 50%;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px ${p.colors.border}, 0 1px 4px rgba(15,23,42,0.10);
          cursor: pointer; padding: 0;
          /* W-AF-4 — centre the lucide element-icon inside the swatch
             circle. The label still floats below via absolute positioning. */
          display: flex; align-items: center; justify-content: center;
          transition: box-shadow 0.12s ease, transform 0.06s ease;
        }
        .qq-style-swatch-btn:hover {
          box-shadow: 0 0 0 2px var(--qq-accent, ${p.colors.accent}), 0 4px 10px rgba(15,23,42,0.16);
          transform: translateY(-1px);
        }
        .qq-style-swatch-btn[aria-expanded="true"] {
          box-shadow: 0 0 0 2px var(--qq-accent, ${p.colors.accent}), 0 6px 14px rgba(15,23,42,0.20);
        }
        /* BD-3f Item 5 — smaller, clipped swatch labels (10px font, max
         * 36px width matching the swatch, ellipsis on overflow). At the
         * narrow editor sidebar width (~320px) the old labels overlapped
         * into adjacent swatches; this fixes that. */
        .qq-style-swatch-label {
          position: absolute;
          top: 100%; left: 50%; transform: translateX(-50%);
          margin-top: 4px;
          font-size: 10px; font-weight: 600;
          color: ${p.colors.muted};
          letter-spacing: -0.01em;
          max-width: 52px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
        }
        .qq-style-swatches-spacer {
          flex: 1;
        }
        .qq-style-swatch-popover {
          position: fixed;
          z-index: 2000;
          width: 240px;
          padding: 12px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
          box-shadow: 0 16px 40px rgba(15,23,42,0.18);
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-style-swatch-popover-h {
          font-size: 11.5px; font-weight: 700;
          color: ${p.colors.heading};
        }
        /* Wave L S1 — dark-mode popover. */
        .qq-editor-shell[data-theme="dark"] .qq-style-swatch-popover {
          background: #243149;
          border-color: var(--qq-border);
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-style-swatch-popover-h {
          color: var(--qq-text);
        }
        .qq-style-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; font-weight: 700;
          color: ${p.colors.heading};
          margin-bottom: 6px;
        }
        /* W-AF-2 — label-text wrapper so InfoCue sits inline with the
         * label text instead of being pushed to the far right by
         * justify-content: space-between on the parent label. */
        .qq-style-label-text {
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qq-style-value {
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          font-family: 'SF Mono', Menlo, Consolas, monospace;
        }
        .qq-style-select {
          width: 100%; padding: 8px 10px;
          font-size: 13px; color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          outline: none;
        }
        .qq-style-range {
          width: 100%;
          accent-color: ${p.colors.accent};
        }

        /* ColourField */
        .qq-style-colour {
          display: flex; flex-direction: column; gap: 6px; min-width: 0;
        }
        /* Wave X #12 — preset grid inside the colour-picker popover. 4-col
           grid of 22px circular swatches. Active swatch (matches the current
           value) gets a 2px accent ring. */
        .qq-style-preset-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin: 8px 0 12px;
        }
        .qq-style-preset {
          width: 22px; height: 22px; padding: 0;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
          justify-self: center;
        }
        .qq-style-preset:hover {
          transform: scale(1.12);
          border-color: ${p.colors.heading};
        }
        .qq-style-preset.is-active {
          box-shadow: 0 0 0 2px ${p.colors.accent};
          border-color: ${p.colors.accent};
        }
        .qq-editor-shell[data-theme="dark"] .qq-style-preset {
          border-color: rgba(255,255,255,0.18);
        }
        .qq-editor-shell[data-theme="dark"] .qq-style-preset:hover {
          border-color: rgba(255,255,255,0.55);
        }
        .qq-style-colour-row {
          display: flex; align-items: stretch; gap: 8px;
        }
        .qq-style-colour-fieldwrap { flex: 1; min-width: 0; }
        .qq-style-swatch {
          width: 34px; height: 34px;
          border: 1px solid ${p.colors.border};
          border-radius: 8px; padding: 0;
          background: transparent;
          cursor: pointer;
          flex-shrink: 0;
          overflow: hidden;
        }
        .qq-style-swatch::-webkit-color-swatch-wrapper { padding: 0; }
        .qq-style-swatch::-webkit-color-swatch { border: none; border-radius: 6px; }
        .qq-style-hex {
          flex: 1; min-width: 0;
          height: 34px;
          padding: 0 10px;
          font-size: 12.5px;
          font-family: 'SF Mono', Menlo, Consolas, monospace;
          color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          outline: none;
          text-transform: lowercase;
          box-sizing: border-box;
        }
        .qq-style-hex:focus {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }

        /* SegmentedControl
         *
         * BD-3f Item 3 — the active segment now picks up the live accent
         * (--qq-accent, set as an inline style on .qq-editor-shell from
         * style.accent). Falls back to the brand blue if no accent is set
         * (i.e. opening the editor on a template that hasn't been
         * customised). Acts as the wizard's "toggle button" surface — the
         * Pro tier toggle, Brand Studio chevron, animation toggle, etc.
         * all flow through this control. */
        .qq-style-seg {
          display: inline-flex;
          padding: 3px;
          gap: 2px;
          background: #f4f6f9;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
        }
        .qq-style-seg-btn {
          font: inherit; cursor: pointer;
          background: transparent; border: none;
          padding: 7px 14px;
          font-size: 12.5px; font-weight: 600;
          color: ${p.colors.muted};
          border-radius: 7px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .qq-style-seg-btn:hover { color: ${p.colors.heading}; }
        .qq-style-seg-btn[aria-checked="true"] {
          background: var(--qq-accent, ${p.colors.accent});
          color: #fff;
          box-shadow: 0 1px 2px rgba(15,23,42,0.08);
        }
        /* BD-3f Item 3 — native checkboxes (Pricing tiers, Range mode,
         * Animations reduced-motion) follow the accent too. The
         * accent-color CSS property is the modern way to tint the native
         * widget without losing OS a11y affordances. */
        .qq-style-panel input[type="checkbox"] {
          accent-color: var(--qq-accent, ${p.colors.accent});
        }
        /* BD-3f Item 3 — range sliders + Brand Studio chevron pick up the
         * accent too. The chevron is the most visible "dropdown arrow"
         * surface in the StyleTab so Alex's feedback maps directly. */
        .qq-style-range {
          accent-color: var(--qq-accent, ${p.colors.accent});
        }
        .qq-bs-chev {
          color: var(--qq-accent, ${p.colors.muted}) !important;
        }

        /* ── W-AO-6b — theme preset cards ────────────────────────── */
        .qq-style-preset-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 480px) {
          .qq-style-preset-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .qq-style-preset-card {
          display: flex; flex-direction: column; align-items: stretch;
          gap: 4px;
          padding: 6px;
          background: #fff;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.12s ease, transform 0.06s ease, box-shadow 0.12s ease;
          font: inherit;
          text-align: center;
        }
        .qq-style-preset-card:hover {
          border-color: ${p.colors.accent};
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(15,23,42,0.08);
        }
        .qq-style-preset-card-swatch {
          position: relative;
          height: 48px;
          border-radius: 6px;
          border: 1px solid transparent;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .qq-style-preset-card-accent {
          position: absolute;
          top: 4px; right: 4px;
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .qq-style-preset-card-text {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .qq-style-preset-card-name {
          font-size: 11px;
          font-weight: 600;
          color: ${p.colors.heading};
        }

        /* ── W-AO-6b — Branding section ───────────────────────────── */
        .qq-style-logo-row {
          display: flex; align-items: center; gap: 12px;
          position: relative;
        }
        .qq-style-logo-upload {
          flex-shrink: 0;
          width: 56px; height: 56px;
          display: inline-flex; align-items: center; justify-content: center;
          background: #fff; color: ${p.colors.muted};
          border: 1px dashed ${p.colors.border};
          border-radius: 10px;
          cursor: pointer; padding: 0; overflow: hidden;
          transition: border-color 0.12s ease, color 0.12s ease;
        }
        .qq-style-logo-upload:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
        }
        .qq-style-logo-upload img {
          width: 100%; height: 100%; object-fit: contain;
        }
        .qq-style-logo-upload-plus {
          font-size: 24px; line-height: 1; font-weight: 600;
        }
        .qq-style-logo-meta {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 4px;
        }
        .qq-style-logo-hint {
          font-size: 11.5px;
          color: ${p.colors.muted};
        }
        .qq-style-logo-clear {
          align-self: flex-start;
          font: inherit;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.danger};
          background: transparent; border: none; padding: 0; cursor: pointer;
          text-decoration: underline;
        }
        .qq-style-logo-clear:hover { color: ${p.colors.heading}; }

        /* ── W-AO-6c — Brand Studio (Pro) ────────────────────────── */
        .qq-bs-group { position: relative; }
        /* BD-3f Item 1 — header button fills the full legend row so the
         * chevron lives at the far right and the title (with Lock + Pro
         * pill) sits at the far left, matching the uniform section-title
         * pattern. */
        .qq-bs-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px;
          width: 100%; padding: 0;
          background: transparent; border: none;
          cursor: pointer; font: inherit; text-align: left;
          color: inherit;
        }
        .qq-bs-header-title {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
          color: ${p.colors.muted}; text-transform: uppercase;
        }
        .qq-bs-pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; margin-left: 4px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
          color: #fff;
          background: linear-gradient(135deg, ${p.colors.accent}, #7c3aed);
          border-radius: 999px;
          text-transform: none;
        }
        .qq-bs-chev {
          color: ${p.colors.muted};
          transition: transform 0.18s ease;
        }
        .qq-bs-chev.is-open { transform: rotate(90deg); }
        .qq-bs-body {
          display: flex; flex-direction: column; gap: 12px;
          margin-top: 14px;
        }
        .qq-bs-upsell {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px;
          background: linear-gradient(135deg, ${p.colors.accentLighter} 0%, #ffffff 100%);
          border: 1px dashed ${p.colors.accent};
          border-radius: 10px;
        }
        .qq-bs-upsell-icon {
          flex-shrink: 0;
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          background: ${p.colors.accent};
          color: #fff;
          border-radius: 8px;
        }
        .qq-bs-upsell-body {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-bs-upsell-title {
          font-size: 13px; font-weight: 700;
          color: ${p.colors.heading};
          margin: 0;
        }
        .qq-bs-upsell-sub {
          font-size: 11.5px; line-height: 1.45;
          color: ${p.colors.muted};
          margin: 0;
        }
        .qq-bs-upsell-cta {
          align-self: flex-start;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          font: inherit; font-size: 11.5px; font-weight: 700;
          color: #fff; background: ${p.colors.accent};
          border: none; border-radius: 6px;
          cursor: pointer; text-decoration: none;
        }
        .qq-bs-upsell-cta:hover { filter: brightness(1.08); }
        /* BD-3f Item 1 — Brand Studio sub-cards (Custom CSS, Background,
         * Result panel, Animations) adopt the same title-into-container
         * pattern: title is the card's flush-top header row with a
         * hairline divider; the body keeps its own 12 px padding. */
        .qq-bs-sub {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          padding: 0 12px 14px;
          background: #fff;
        }
        .qq-bs-sub-title {
          font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
          color: ${p.colors.muted}; text-transform: uppercase;
          /* Pull the header flush to the card edges, then add its own
           * 12 px padding + a 1 px hairline below. */
          margin: 0 -12px 12px -12px;
          padding: 12px;
          border-bottom: 1px solid ${p.colors.borderLight};
          /* BD-3e Fix 4 — inline-flex so the new InfoCue trigger sits to
           * the right of the title text instead of stacking below. */
          display: flex; align-items: center; gap: 6px;
        }
        .qq-bs-sub-title-text { display: inline-block; }
        .qq-bs-sub-hint {
          font-size: 11px; line-height: 1.5;
          color: ${p.colors.subtle};
          margin: 0 0 8px;
        }
        .qq-bs-css {
          width: 100%;
          height: 200px;
          padding: 10px 12px;
          font: inherit;
          font-family: 'SF Mono', Menlo, Consolas, monospace;
          font-size: 12.5px; line-height: 1.5;
          color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          outline: none;
          resize: vertical;
          box-sizing: border-box;
        }
        .qq-bs-css:focus {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        .qq-bs-bg-image-row {
          display: flex; align-items: center; gap: 10px;
          margin-top: 8px;
        }
        .qq-bs-bg-image-thumb {
          flex-shrink: 0;
          width: 56px; height: 40px;
          border: 1px dashed ${p.colors.border};
          border-radius: 8px;
          background-size: cover; background-position: center;
          background-color: ${p.colors.borderLight};
          cursor: pointer; padding: 0; overflow: hidden;
          display: inline-flex; align-items: center; justify-content: center;
          color: ${p.colors.muted};
        }
        .qq-bs-bg-image-thumb:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
        }
        .qq-bs-bg-image-meta {
          flex: 1; min-width: 0;
          font-size: 11.5px;
          color: ${p.colors.muted};
        }
        .qq-bs-bg-image-clear {
          align-self: flex-start;
          font: inherit; font-size: 11px; font-weight: 600;
          color: ${p.colors.danger};
          background: transparent; border: none; padding: 0;
          cursor: pointer; text-decoration: underline;
        }
        .qq-bs-locked { opacity: 0.55; pointer-events: none; }

        /* BD-3e Fix 5 — dark-mode scoping for the BD-2b/2c-era wizard
         * panel containers Alex called out on the screen-share. The Brand
         * Studio sub-cards (Custom CSS, Background, Result panel,
         * Animations), the custom-CSS textarea, the background-image
         * thumbnail, and the pricing-tier rows all had hardcoded #fff /
         * #fafbfc / #fafafa backgrounds that read as glaring white squares
         * inside the dark-themed editor shell. We map them onto the same
         * --qq-* CSS vars BD-3a established for the calc rows so the
         * Style tab feels coherent end-to-end.
         *
         * Scoped to .qq-editor-shell[data-theme="dark"] so the live
         * customer widget (which is also rendered in this file's preview
         * branch) keeps its real per-theme colours. */
        .qq-editor-shell[data-theme="dark"] .qq-style-group {
          background: #0f172a;
          border-color: rgba(255,255,255,0.08);
          color: #f5f7fa;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-sub {
          background: #1e293b;
          border-color: rgba(255,255,255,0.08);
          color: #f5f7fa;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-sub-title {
          color: #cbd5e1;
          border-bottom-color: rgba(255,255,255,0.08);
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-sub-hint {
          color: #94a3b8;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-css {
          background: #0f172a;
          color: #e2e8f0;
          border-color: rgba(255,255,255,0.12);
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-bg-image-thumb {
          background-color: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.18);
          color: #cbd5e1;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-bg-image-meta {
          color: #cbd5e1;
        }
        .qq-editor-shell[data-theme="dark"] .qq-style-legend {
          color: #cbd5e1;
          border-bottom-color: rgba(255,255,255,0.08);
        }
        /* BD-2b — pricing-tier rows (inline background #fafbfc). */
        .qq-editor-shell[data-theme="dark"] [data-testid^="style-pricing-tier-"] {
          background: #1e293b !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        /* BD-2a-polish — Brand Kit picker / save inline dialogs. */
        .qq-editor-shell[data-theme="dark"] .qq-bk-picker,
        .qq-editor-shell[data-theme="dark"] .qq-bk-save {
          background: #1e293b !important;
          border-color: rgba(255,255,255,0.08) !important;
          color: #f5f7fa;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-upsell {
          background: linear-gradient(135deg, rgba(13,60,252,0.18) 0%, #1e293b 100%);
          border-color: rgba(13,60,252,0.45);
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-upsell-title {
          color: #f5f7fa;
        }
        .qq-editor-shell[data-theme="dark"] .qq-bs-upsell-sub {
          color: #cbd5e1;
        }
      `}</style>
    </section>
  );
}

/* ─── W-AO-6c — Brand Studio (Pro) section ─────────────────────────
 *
 * One collapsible group containing the three Wave 1 features:
 *   1. Custom CSS — textarea (monospace, 200px tall) scoped to the widget.
 *   2. Background — solid / gradient / image with overlay tint.
 *   3. Result panel — accent / bg overrides + emphasis + border treatment.
 *
 * Persistence is on `advanced.style.*` (see AdvStyle in templatePresets.ts).
 * The free-tier preview shows every control — that's the whole point of the
 * upsell — but the section header carries a Lock icon + Upgrade CTA, and
 * the server strips the fields before save for non-paid plans.
 */
function BrandStudioGroup({
  style, patch, isProTier,
}: {
  style: ShellStyle;
  patch: (next: Partial<ShellStyle>) => void;
  isProTier: boolean;
}) {
  const [open, setOpen] = useState(true);
  const bgImageInputRef = useRef<HTMLInputElement | null>(null);

  const customCss = style.customCss ?? '';
  const bgMode: AdvBgMode = style.bgMode ?? 'solid';
  const gradFrom = style.bgGradient?.from ?? style.background ?? '#0d3cfc';
  const gradTo = style.bgGradient?.to ?? '#ffffff';
  const gradDir: AdvBgGradientDirection = style.bgGradient?.direction ?? 'linear-down';
  const bgImageUrl = style.bgImageUrl ?? '';
  const bgImageTint = typeof style.bgImageTint === 'number' ? style.bgImageTint : 0;
  const rpAccent = style.resultPanel?.accentOverride ?? '';
  const rpBg = style.resultPanel?.bgOverride ?? '';
  const rpEmphasis: AdvResultEmphasis = style.resultPanel?.emphasis ?? 'normal';
  const rpBorder: AdvResultBorder = style.resultPanel?.border ?? 'subtle';
  // W-BB-3 — range-pricing display mode.
  const rpRangeEnabled: boolean = style.resultPanel?.range_mode?.enabled === true;
  const rpRangeBand: number = (() => {
    const raw = style.resultPanel?.range_mode?.band_pct;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 8;
    return Math.max(5, Math.min(25, Math.round(raw)));
  })();
  // W-AO-6d — Brand Studio Wave 2 animations bundle.
  const animStep: AdvStepTransition = style.animations?.step_transition ?? 'none';
  const animDuration: number = typeof style.animations?.duration_ms === 'number'
    ? Math.max(100, Math.min(600, Math.round(style.animations.duration_ms)))
    : 250;
  const animReduce: boolean = style.animations?.reduced_motion_respect !== false;

  const onBgImageFile = useCallback((file: File | null) => {
    if (!file) { patch({ bgImageUrl: undefined }); return; }
    if (file.size > LOGO_MAX_BYTES * 2) return; // 2 MB ceiling for bg art
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') patch({ bgImageUrl: result });
    };
    reader.readAsDataURL(file);
  }, [patch]);

  const setGradient = (next: Partial<NonNullable<ShellStyle['bgGradient']>>) => {
    patch({
      bgGradient: {
        from: gradFrom, to: gradTo, direction: gradDir,
        ...style.bgGradient,
        ...next,
      },
    });
  };
  const setResultPanel = (next: Partial<NonNullable<ShellStyle['resultPanel']>>) => {
    patch({
      resultPanel: { ...(style.resultPanel ?? {}), ...next },
    });
  };
  // W-AO-6d — animations setter; merges into the optional bundle.
  const setAnimations = (next: Partial<NonNullable<ShellStyle['animations']>>) => {
    patch({
      animations: {
        step_transition: animStep,
        duration_ms: animDuration,
        reduced_motion_respect: animReduce,
        ...(style.animations ?? {}),
        ...next,
      },
    });
  };

  // BD-3l — Premium Animations Pack values + setter. Each sub-toggle
  // defaults to `true` when the master is on (the master is the opt-in;
  // sub-toggles are opt-OUT). When the master is off, sub-toggle values
  // are read from storage but the resolved gates render as `false` at
  // the widget runtime regardless.
  const premiumPack: AdvPremiumAnimations = style.premiumAnimations ?? { enabled: false };
  const premiumEnabled = premiumPack.enabled === true;
  const premiumSpring = premiumPack.spring !== false;
  const premiumCountUp = premiumPack.countUp !== false;
  const premiumStagger = premiumPack.staggerReveal !== false;
  const premiumCtaPulse = premiumPack.ctaPulse !== false;
  const premiumCardFlip = premiumPack.cardFlip !== false;
  const premiumConfetti = premiumPack.confetti !== false;
  const setPremiumPack = (next: Partial<AdvPremiumAnimations>) => {
    patch({
      premiumAnimations: {
        ...(style.premiumAnimations ?? { enabled: false }),
        ...next,
      },
    });
  };

  return (
    <fieldset
      className="qq-style-group qq-bs-group"
      data-testid="style-group-brand-studio"
      data-pro-tier={isProTier ? 'true' : 'false'}
    >
      <legend className="qq-style-legend">
        <button
          type="button"
          className="qq-bs-header"
          data-testid="style-bs-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="qq-bs-header-title">
            {!isProTier && <Lock size={12} aria-hidden="true" />}
            Brand Studio
            <span className="qq-bs-pill" aria-label="Pro plan feature">
              <Sparkles size={10} aria-hidden="true" /> Pro
            </span>
          </span>
          <ChevronRight
            size={14}
            className={'qq-bs-chev' + (open ? ' is-open' : '')}
            aria-hidden="true"
          />
        </button>
      </legend>

      {open && (
        <div className="qq-style-group-body qq-bs-body">
          {!isProTier && (
            <div className="qq-bs-upsell" data-testid="style-bs-upsell">
              <span className="qq-bs-upsell-icon" aria-hidden="true">
                <Sparkles size={16} />
              </span>
              <div className="qq-bs-upsell-body">
                <p className="qq-bs-upsell-title">Brand Studio is a Pro feature</p>
                <p className="qq-bs-upsell-sub">
                  Preview the controls below — your saved settings keep their existing look.
                  Upgrade to Pro ($29/mo) to publish custom CSS, image / gradient backgrounds,
                  and result-panel styling on your widget.
                </p>
                <a
                  href="/pricing/quotequick"
                  className="qq-bs-upsell-cta"
                  data-testid="style-bs-upgrade"
                >
                  Upgrade to Pro →
                </a>
              </div>
            </div>
          )}

          {/* 1. Custom CSS */}
          <div className="qq-bs-sub" data-testid="style-bs-sub-customcss">
            {/* BD-3e Fix 4 — help cue added (was previously missing). */}
            <p className="qq-bs-sub-title">
              <span className="qq-bs-sub-title-text">Custom CSS</span>
              <InfoCue
                testid="style-bs-customcss-info"
                region="background"
                text="Pro-tier custom CSS scoped to .qq-widget-<id> on your live calculator. Invalid CSS won't break the widget but won't be applied either — the runtime silently drops unparseable rules."
              />
            </p>
            <p className="qq-bs-sub-hint">
              Advanced. Inject custom CSS scoped to your widget. Pro plan required.
            </p>
            <textarea
              className="qq-bs-css"
              data-testid="style-bs-customcss"
              spellCheck={false}
              placeholder="/* Scoped to your widget. Example:
.qq-w-input { border-radius: 16px; }
.qq-bs-result { text-shadow: 0 1px 2px rgba(0,0,0,0.08); } */"
              value={customCss}
              onChange={(e) => patch({ customCss: e.target.value })}
              aria-label="Custom CSS"
            />
          </div>

          {/* 2. Background */}
          <div className="qq-bs-sub" data-testid="style-bs-sub-background">
            {/* BD-3e Fix 4 — help cue added (was previously missing). */}
            <p className="qq-bs-sub-title">
              <span className="qq-bs-sub-title-text">Background</span>
              <InfoCue
                testid="style-bs-background-info"
                region="background"
                text="Override the widget body background. Solid uses the Colours-tab swatch; Gradient and Image are Pro-only and ship custom CSS to the live widget. Invalid CSS or unreachable image URLs are silently ignored at render time."
              />
            </p>
            <p className="qq-bs-sub-hint">
              Override the widget body background. Solid keeps the picker in Colours;
              Gradient and Image are Pro-only and render only on Pro plans.
            </p>
            <SegmentedControl<AdvBgMode>
              name="bs-bg-mode"
              testid="style-bs-bg-mode"
              value={bgMode}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'image', label: 'Image' },
              ]}
              onChange={(v) => patch({ bgMode: v })}
            />

            {bgMode === 'gradient' && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="qq-style-swatches" style={{ paddingBottom: 0 }}>
                  <ColourSwatch
                    icon={Layers}
                    label="From"
                    testid="style-bs-bg-grad-from"
                    value={gradFrom}
                    fallback="#0d3cfc"
                    onChange={(v) => setGradient({ from: v })}
                  />
                  <ColourSwatch
                    icon={Layers}
                    label="To"
                    testid="style-bs-bg-grad-to"
                    value={gradTo}
                    fallback="#ffffff"
                    onChange={(v) => setGradient({ to: v })}
                  />
                </div>
                <label className="qq-style-label" style={{ marginTop: 4 }}>
                  <span className="qq-style-label-text">Direction</span>
                </label>
                <SegmentedControl<AdvBgGradientDirection>
                  name="bs-bg-grad-dir"
                  testid="style-bs-bg-grad-dir"
                  value={gradDir}
                  options={[
                    { value: 'linear-down', label: '↓' },
                    { value: 'linear-up', label: '↑' },
                    { value: 'linear-right', label: '→' },
                    { value: 'linear-left', label: '←' },
                    { value: 'radial', label: '○' },
                  ]}
                  onChange={(v) => setGradient({ direction: v })}
                />
              </div>
            )}

            {bgMode === 'image' && (
              <div style={{ marginTop: 12 }}>
                <div className="qq-bs-bg-image-row">
                  <button
                    type="button"
                    className="qq-bs-bg-image-thumb"
                    data-testid="style-bs-bg-image-upload"
                    aria-label={bgImageUrl ? 'Replace background image' : 'Upload background image'}
                    onClick={() => bgImageInputRef.current?.click()}
                    style={bgImageUrl ? { backgroundImage: `url(${bgImageUrl})` } : undefined}
                  >
                    {!bgImageUrl && <span aria-hidden="true">＋</span>}
                  </button>
                  <input
                    ref={bgImageInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="Upload background image"
                    data-testid="style-bs-bg-image-input"
                    style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      onBgImageFile(f);
                      e.target.value = '';
                    }}
                  />
                  <div className="qq-bs-bg-image-meta">
                    {bgImageUrl ? (
                      <>
                        Background image set.{' '}
                        <button
                          type="button"
                          className="qq-bs-bg-image-clear"
                          data-testid="style-bs-bg-image-clear"
                          onClick={() => patch({ bgImageUrl: undefined })}
                        >Remove</button>
                      </>
                    ) : (
                      <>Drop an image or click to choose. PNG / JPG / SVG up to 2&nbsp;MB.</>
                    )}
                  </div>
                </div>
                <label className="qq-style-label" htmlFor="qq-bs-bg-tint" style={{ marginTop: 12 }}>
                  Overlay tint
                  <span className="qq-style-value" data-testid="style-bs-bg-tint-value">
                    {bgImageTint}%
                  </span>
                </label>
                <input
                  id="qq-bs-bg-tint"
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={bgImageTint}
                  onChange={(e) => patch({ bgImageTint: Number(e.target.value) })}
                  className="qq-style-range"
                  data-testid="style-bs-bg-tint"
                  aria-valuemin={0}
                  aria-valuemax={50}
                  aria-valuenow={bgImageTint}
                />
              </div>
            )}
          </div>

          {/* 3. Result panel */}
          <div className="qq-bs-sub" data-testid="style-bs-sub-resultpanel">
            {/* BD-3e Fix 4 — help cue added (was previously missing). */}
            <p className="qq-bs-sub-title">
              <span className="qq-bs-sub-title-text">Result panel</span>
              <InfoCue
                testid="style-bs-resultpanel-info"
                region="result"
                text="Controls how the final quote renders: a single price, a price range, or 3-tier Good/Better/Best cards (BD-2b). Range and tier modes can stack — the headline stays the base price, with a range band around it inside each tier card. Each override is optional; leave blank to inherit the Colours tab tokens."
              />
            </p>
            <p className="qq-bs-sub-hint">
              Override the result-card colours, headline weight, and border treatment.
              Each control is optional — leave blank to inherit the primary accent /
              results background tokens.
            </p>
            <div className="qq-style-swatches" style={{ paddingBottom: 0 }}>
              <ColourSwatch
                icon={MousePointerClick}
                label="Accent"
                testid="style-bs-rp-accent"
                value={rpAccent || (style.accent ?? '#0d3cfc')}
                fallback={style.accent ?? '#0d3cfc'}
                onChange={(v) => setResultPanel({ accentOverride: v })}
              />
              <ColourSwatch
                icon={Receipt}
                label="Background"
                testid="style-bs-rp-bg"
                value={rpBg || (style.resultsBg ?? '#ffffff')}
                fallback={style.resultsBg ?? '#ffffff'}
                onChange={(v) => setResultPanel({ bgOverride: v })}
              />
            </div>
            <label className="qq-style-label" style={{ marginTop: 12 }}>
              <span className="qq-style-label-text">Emphasis</span>
            </label>
            <SegmentedControl<AdvResultEmphasis>
              name="bs-rp-emphasis"
              testid="style-bs-rp-emphasis"
              value={rpEmphasis}
              options={[
                { value: 'subtle', label: 'Subtle' },
                { value: 'normal', label: 'Normal' },
                { value: 'bold', label: 'Bold' },
              ]}
              onChange={(v) => setResultPanel({ emphasis: v })}
            />
            <label className="qq-style-label" style={{ marginTop: 12 }}>
              <span className="qq-style-label-text">Border</span>
            </label>
            <SegmentedControl<AdvResultBorder>
              name="bs-rp-border"
              testid="style-bs-rp-border"
              value={rpBorder}
              options={[
                { value: 'none', label: 'None' },
                { value: 'subtle', label: 'Subtle' },
                { value: 'accent', label: 'Accent' },
              ]}
              onChange={(v) => setResultPanel({ border: v })}
            />
            {/* W-BB-3 — range-pricing display mode. A common trades-quoting
                pattern: show `$2,300 – $2,700` instead of `$2,500.00` to
                reduce buyer commitment anxiety. Bounds round to $25. */}
            {/* BD-2a-polish — suggestion banner: show only when the
                derived category is high-variance (Construction / Emergency /
                Home Improvement) AND the toggle is currently OFF. Inferred
                from `style.bgGradient.from` via `inferDerivedCategoryFromBgFrom`
                so we don't need to plumb category through the shell props.
                User-customised backgrounds infer 'default' and skip the
                banner — they already know the look they want. */}
            {(() => {
              const derived = inferDerivedCategoryFromBgFrom(style.bgGradient?.from);
              const highVariance =
                derived === 'construction'
                || derived === 'emergency'
                || derived === 'home-improvement';
              if (!highVariance || rpRangeEnabled) return null;
              return (
                <div
                  data-testid="style-bs-rp-range-suggest"
                  style={{
                    marginTop: 10, marginBottom: 2,
                    padding: 12,
                    borderLeft: '4px solid #0d3cfc',
                    background: '#eff6ff',
                    borderRadius: 4,
                    fontSize: 12, lineHeight: 1.5,
                    color: '#1e3a8a',
                  }}
                >
                  <span aria-hidden="true">💡 </span>
                  High-variance work — most homeowners convert better when they
                  see a price range. Consider enabling.
                </div>
              );
            })()}
            <label
              className="qq-style-label"
              style={{
                marginTop: 2, display: 'flex', alignItems: 'center',
                gap: 8, cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={rpRangeEnabled}
                onChange={(e) => setResultPanel({
                  range_mode: {
                    enabled: e.target.checked,
                    band_pct: rpRangeBand,
                  },
                })}
                data-testid="style-bs-rp-range-enabled"
                aria-label="Display result as a price range"
              />
              <span className="qq-style-label-text" style={{ margin: 0 }}>
                Display as range
              </span>
            </label>
            {rpRangeEnabled && (
              <>
                <label
                  className="qq-style-label"
                  htmlFor="qq-bs-rp-range-band"
                  style={{ marginTop: 8 }}
                >
                  <span className="qq-style-label-text">
                    Range band <span className="qq-style-label-meta">±{rpRangeBand}%</span>
                  </span>
                </label>
                <input
                  id="qq-bs-rp-range-band"
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={rpRangeBand}
                  onChange={(e) => setResultPanel({
                    range_mode: {
                      enabled: true,
                      band_pct: Number(e.target.value),
                    },
                  })}
                  className="qq-style-range"
                  data-testid="style-bs-rp-range-band"
                  aria-valuemin={5}
                  aria-valuemax={25}
                  aria-valuenow={rpRangeBand}
                />
              </>
            )}
          </div>

          {/* 4. W-AO-6d — Animations (step transitions, Pro tier) ─────
           *
           * Drives the wizard step transition between the lead-form
           * panels in the renderer. `none` keeps the legacy instant
           * mount; the other three apply scoped CSS keyframes per
           * panel. `Respect prefers-reduced-motion` defaults on so an
           * OS-level a11y setting always wins over the configured
           * value. */}
          <div className="qq-bs-sub" data-testid="style-bs-sub-animations">
            {/* BD-3e Fix 4 — help cue added (was previously missing). */}
            <p className="qq-bs-sub-title">
              <span className="qq-bs-sub-title-text">Animations</span>
              <InfoCue
                testid="style-bs-animations-info"
                region="step-content"
                text="Applies to step transitions (lead form, scheduling, deposit), button taps, and focus rings. Customers whose OS has prefers-reduced-motion enabled see the static UI instead — duration is the only knob, and 250 ms is the sweet spot. Setting Step transition to None disables all motion."
              />
            </p>
            <p className="qq-bs-sub-hint">
              Smooth the transition between calculator steps (lead form, scheduling, etc.).
              Subtle motion makes the widget feel premium. Honours OS-level reduced-motion
              by default.
            </p>
            <label className="qq-style-label">
              <span className="qq-style-label-text">Step transition</span>
            </label>
            <SegmentedControl<AdvStepTransition>
              name="bs-anim-step"
              testid="style-bs-anim-step"
              value={animStep}
              options={[
                { value: 'none', label: 'None' },
                { value: 'fade', label: 'Fade' },
                { value: 'slide', label: 'Slide' },
                { value: 'slide-fade', label: 'Slide + Fade' },
              ]}
              onChange={(v) => {
                setAnimations({ step_transition: v });
                // BD-3g Item 3 — fire a one-shot preview of the chosen
                // animation in the PreviewPane so the user sees what
                // they're picking. Duration uses the current animDuration
                // slider value; the preview replays once, then settles.
                // PreviewPane listens via window.addEventListener.
                if (typeof window !== 'undefined') {
                  try {
                    window.dispatchEvent(new CustomEvent('qq-preview:replay-animation', {
                      detail: { animation: v, durationMs: animDuration },
                    }));
                  } catch { /* ignore */ }
                }
              }}
            />
            <label className="qq-style-label" htmlFor="qq-bs-anim-duration" style={{ marginTop: 12 }}>
              <span className="qq-style-label-text">
                Duration <span className="qq-style-label-meta">{animDuration}ms</span>
              </span>
            </label>
            <input
              id="qq-bs-anim-duration"
              type="range"
              min={100}
              max={600}
              step={10}
              value={animDuration}
              onChange={(e) => setAnimations({ duration_ms: Number(e.target.value) })}
              className="qq-style-range"
              data-testid="style-bs-anim-duration"
              aria-valuemin={100}
              aria-valuemax={600}
              aria-valuenow={animDuration}
            />
            <label
              className="qq-style-label"
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={animReduce}
                onChange={(e) => setAnimations({ reduced_motion_respect: e.target.checked })}
                data-testid="style-bs-anim-reduce"
                aria-label="Respect prefers-reduced-motion"
              />
              <span className="qq-style-label-text" style={{ margin: 0 }}>
                Respect prefers-reduced-motion
              </span>
            </label>

            {/* ── BD-3l — Premium Animations Pack ──────────────────────
              *
              * Sits inside the existing Animations group so owners see
              * the basic step-transitions controls FIRST, then the
              * Premium Pack as an "upgrade your widget" affordance
              * directly below. Master toggle + 6 sub-toggles. The
              * master controls whether the pack runs at all; the sub-
              * toggles let owners mix individual effects in/out.
              *
              * Tier gating: Brand Studio section is already Pro-only —
              * this lives inside that fieldset, so free-tier users see
              * the same upsell affordance that gates the rest of Brand
              * Studio. Server-side strips `premiumAnimations` from
              * free-tier patches via BRAND_STUDIO_STYLE_KEYS.
              *
              * Section-title pattern + InfoCue per BD-3f.
              */}
            <div
              className="qq-bs-sub"
              data-testid="style-bs-sub-premium-animations"
              style={{ marginTop: 14 }}
            >
              <p className="qq-bs-sub-title">
                <span className="qq-bs-sub-title-text">Premium Animations</span>
                <InfoCue
                  testid="style-bs-premium-animations-info"
                  region="step-content"
                  text="Six wow-tier animations — spring physics, number count-up on result, stagger reveal on step entry, pulsing CTA gradient, 3D card flip on step change, and a subtle confetti burst on quote completion. Master toggle turns the whole pack on; sub-toggles let you mix individual effects in or out. Customers whose OS has prefers-reduced-motion enabled see the static UI instead — every animation is disabled defensively."
                />
              </p>
              <p className="qq-bs-sub-hint">
                Premium "wow"-tier motion for your widget — spring physics, number
                count-up, stagger reveal, CTA pulse, 3D card flip, and a tasteful
                confetti burst on completion. Stays subtle. Honours reduced-motion.
              </p>
              <label
                className="qq-style-label"
                style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={premiumEnabled}
                  onChange={(e) => setPremiumPack({ enabled: e.target.checked })}
                  data-testid="style-bs-premium-enabled"
                  aria-label="Enable Premium Animations Pack"
                />
                <span className="qq-style-label-text" style={{ margin: 0, fontWeight: 700 }}>
                  Enable Premium Animations Pack
                </span>
              </label>
              {premiumEnabled && (
                <div
                  style={{
                    marginTop: 10, paddingLeft: 12,
                    borderLeft: `2px solid ${p.colors.border}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                  data-testid="style-bs-premium-sub-toggles"
                >
                  {([
                    { key: 'spring', label: 'Spring-physics transitions', testid: 'style-bs-premium-spring', value: premiumSpring },
                    { key: 'countUp', label: 'Number count-up on result', testid: 'style-bs-premium-countup', value: premiumCountUp },
                    { key: 'staggerReveal', label: 'Stagger reveal on step entry', testid: 'style-bs-premium-stagger', value: premiumStagger },
                    { key: 'ctaPulse', label: 'CTA gradient pulse', testid: 'style-bs-premium-ctapulse', value: premiumCtaPulse },
                    { key: 'cardFlip', label: '3D card flip on step change', testid: 'style-bs-premium-cardflip', value: premiumCardFlip },
                    { key: 'confetti', label: 'Confetti on quote completion', testid: 'style-bs-premium-confetti', value: premiumConfetti },
                  ] as const).map((opt) => (
                    <label
                      key={opt.key}
                      className="qq-style-label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={opt.value}
                        onChange={(e) => setPremiumPack({ [opt.key]: e.target.checked } as Partial<AdvPremiumAnimations>)}
                        data-testid={opt.testid}
                        aria-label={opt.label}
                      />
                      <span className="qq-style-label-text" style={{ margin: 0 }}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* ── /BD-3l ── */}
          </div>
        </div>
      )}
    </fieldset>
  );
}

/* ─── ColourSwatch — Wave L S1 single-row picker ─────────────────────
 *
 * Compact circle showing the current colour. Click opens a portaled
 * popover containing the native picker + the hex text field — same
 * controls the old ColourField had, just packaged behind a smaller
 * affordance. Outside-click / Escape dismiss; positioned via
 * getBoundingClientRect of the trigger. */
function ColourSwatch({
  label, value, fallback, onChange, testid, icon: Icon, onOpen,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  testid: string;
  /** W-AF-4 — optional element-type icon rendered centred in the swatch
   *  circle so the row reads as "Accent / Background / Text / Results bg"
   *  without relying on the tiny label alone. */
  icon?: LucideIcon;
  /** BD-3f Item 5 — fires when the popover is opened (used by Success /
   *  Error swatches to mount a ghost demo banner on the preview pane). */
  onOpen?: () => void;
}) {
  const swatchValue = safeHex(value) || safeHex(fallback) || '#000000';
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const expandedHex = swatchValue.length === 4
    ? '#' + swatchValue.slice(1).split('').map((c) => c + c).join('')
    : swatchValue;

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const POP_W = 240;
      const POP_H = 140;
      let left = r.left;
      if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
      let top = r.bottom + 6;
      if (top + POP_H > window.innerHeight - 8) top = r.top - POP_H - 6;
      setPos({ top, left: Math.max(8, left) });
    };
    measure();
    const onScroll = () => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="qq-style-swatch-btn"
        data-testid={`${testid}-trigger`}
        aria-label={`Edit ${label} colour`}
        aria-expanded={open}
        title={`${label} (${value})`}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next && onOpen) onOpen();
            return next;
          });
        }}
        style={{ background: expandedHex }}
      >
        {Icon && (
          <Icon
            size={14}
            color={getContrastingColor(expandedHex)}
            strokeWidth={2.25}
            aria-hidden="true"
            style={{
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
              display: 'block',
            }}
          />
        )}
        <span className="qq-style-swatch-label">{label}</span>
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="qq-style-swatch-popover"
          data-testid={`${testid}-popover`}
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="qq-style-swatch-popover-h">{label}</div>
          {/* Wave X #12 — preset grid. 16 generic brand-friendly hex values
              in a 4-column grid. Active swatch (matches current value) gets
              a ring. The custom hex input + native picker stay below so any
              arbitrary value is still settable. */}
          <div
            className="qq-style-preset-grid"
            role="listbox"
            aria-label={`${label} preset colours`}
            data-testid={`${testid}-presets`}
          >
            {PRESET_COLOURS.map((p) => {
              const isActive = expandedHex.toLowerCase() === p.hex.toLowerCase();
              return (
                <button
                  key={p.hex}
                  type="button"
                  className={`qq-style-preset${isActive ? ' is-active' : ''}`}
                  style={{ background: p.hex }}
                  aria-label={p.name}
                  aria-pressed={isActive}
                  title={`${p.name} (${p.hex})`}
                  data-testid={`${testid}-preset-${p.hex.slice(1)}`}
                  onClick={() => onChange(p.hex)}
                />
              );
            })}
          </div>
          <div className="qq-style-colour-row">
            <input
              type="color"
              className="qq-style-swatch"
              value={expandedHex}
              aria-label={`${label} colour`}
              data-testid={`${testid}-swatch`}
              onChange={(e) => onChange(e.target.value)}
            />
            <FloatField label="Hex" htmlFor={`${testid}-hex-input`} className="qq-style-colour-fieldwrap">
              <input
                id={`${testid}-hex-input`}
                type="text"
                className="premium-input"
                placeholder=" "
                value={value}
                aria-label={`${label} hex`}
                data-testid={testid}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') { onChange(fallback); return; }
                  const hex = safeHex(raw);
                  if (hex) onChange(hex);
                  else onChange(raw);
                }}
              />
            </FloatField>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ─── SegmentedControl ─── */
function SegmentedControl<T extends string | number>({
  name, value, options, onChange, testid,
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <div
      className="qq-style-seg"
      role="radiogroup"
      aria-label={name}
      data-testid={testid}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            className="qq-style-seg-btn"
            data-testid={`${testid}-${o.value}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── W-AO-6d — Brand Kit (Pro) section ─────────────────────────────
 *
 * Two affordances:
 *   1. Apply Brand Kit — picker modal listing the user's kits.
 *   2. Save current as Brand Kit — small inline dialog (name + desc).
 *
 * On mount we GET /api/portal/brand-kits/. Three response shapes drive
 * the UI:
 *   - 200 → render the kits list + Save dialog.
 *   - 401/403 with `pro_tier_required` → render the Pro upsell.
 *   - 401 (no session) → render a "Sign in to use Brand Kits" CTA so
 *     the token-based edit page doesn't error out.
 *
 * Empty-state CTA is the same Save dialog with the prompt re-worded.
 */
interface BrandKitListItem {
  id: string;
  name: string;
  description: string | null;
  style: Record<string, unknown>;
  logo_url: string | null;
  is_default: boolean;
  created_at: string;
}

function BrandKitGroup({
  style, logo, onApply, isProTier,
}: {
  style: ShellStyle;
  logo: string | null;
  onApply: (nextStyle: Partial<ShellStyle>, nextLogo: string | null) => void;
  isProTier: boolean;
}) {
  const [kits, setKits] = useState<BrandKitListItem[] | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'unauthenticated' | 'pro-required' | 'error'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshKits = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/portal/brand-kits', { credentials: 'include' });
      if (res.status === 401) {
        setKits(null);
        setLoadState('unauthenticated');
        return;
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === 'pro_tier_required') {
          setKits(null);
          setLoadState('pro-required');
          return;
        }
        setKits(null);
        setLoadState('error');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setKits(Array.isArray(body?.kits) ? body.kits : []);
      setLoadState('ready');
    } catch (err: any) {
      setKits(null);
      setLoadState('error');
      setErrorMsg(err?.message ?? 'Failed to load Brand Kits');
    }
  }, []);

  useEffect(() => { void refreshKits(); }, [refreshKits]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/portal/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: saveName.trim(),
          description: saveDesc.trim() || null,
          style,
          logo_url: logo || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setSaveOpen(false);
      setSaveName('');
      setSaveDesc('');
      await refreshKits();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to save Brand Kit');
    } finally {
      setBusy(false);
    }
  }, [saveName, saveDesc, style, logo, refreshKits]);

  const handleApply = useCallback((kit: BrandKitListItem) => {
    onApply(kit.style as Partial<ShellStyle>, kit.logo_url);
    setPickerOpen(false);
  }, [onApply]);

  // Free-tier rendering: lock + upsell. Match BrandStudioGroup styling.
  if (!isProTier || loadState === 'pro-required') {
    return (
      <fieldset className="qq-style-group" data-testid="style-group-brand-kit" data-pro-tier="false">
        <legend className="qq-style-legend">
          <Lock size={12} aria-hidden="true" />
          Brand Kit
          <span className="qq-bs-pill" aria-label="Pro plan feature">
            <Sparkles size={10} aria-hidden="true" /> Pro
          </span>
        </legend>
        <div className="qq-style-group-body">
          <p className="qq-bs-sub-hint" style={{ margin: '6px 0 8px' }}>
            Save your widget's look as a reusable Brand Kit and apply it across every
            calculator you own. Upgrade to Pro ($29/mo) to unlock.
          </p>
          <a
            href="/pricing/quotequick"
            className="qq-bs-upsell-cta"
            data-testid="style-bk-upgrade"
          >
            Upgrade to Pro →
          </a>
        </div>
      </fieldset>
    );
  }

  if (loadState === 'unauthenticated') {
    return (
      <fieldset className="qq-style-group" data-testid="style-group-brand-kit" data-pro-tier="true">
        <legend className="qq-style-legend">
          Brand Kit
          <span className="qq-bs-pill" aria-label="Pro plan feature">
            <Sparkles size={10} aria-hidden="true" /> Pro
          </span>
        </legend>
        <div className="qq-style-group-body">
          <p className="qq-bs-sub-hint" style={{ margin: '6px 0 8px' }}>
            Sign in to the portal to save reusable Brand Kits across your calculators.
          </p>
        </div>
      </fieldset>
    );
  }

  const isEmpty = loadState === 'ready' && (kits?.length ?? 0) === 0;

  return (
    <fieldset className="qq-style-group" data-testid="style-group-brand-kit" data-pro-tier="true">
      <legend className="qq-style-legend">
        Brand Kit
        <span className="qq-bs-pill" aria-label="Pro plan feature">
          <Sparkles size={10} aria-hidden="true" /> Pro
        </span>
      </legend>
      <div className="qq-style-group-body">

      {isEmpty ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="qq-bs-sub-hint" style={{ margin: 0 }}>
            Create your first Brand Kit from this calculator's current style. Apply it
            instantly to your other calculators to keep branding consistent.
          </p>
          <button
            type="button"
            className="qq-bs-upsell-cta"
            data-testid="style-bk-create-first"
            onClick={() => { setSaveOpen(true); setSaveName(''); setSaveDesc(''); }}
            style={{ alignSelf: 'flex-start' }}
          >
            Create Brand Kit
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="qq-bs-upsell-cta"
            data-testid="style-bk-apply"
            onClick={() => setPickerOpen(true)}
            disabled={loadState !== 'ready'}
          >
            Apply Brand Kit
          </button>
          <button
            type="button"
            className="qq-bs-upsell-cta"
            data-testid="style-bk-save"
            onClick={() => { setSaveOpen(true); setSaveName(''); setSaveDesc(''); }}
            disabled={loadState !== 'ready'}
            style={{ background: '#fff', color: p.colors.body, border: `1px solid ${p.colors.borderLight}` }}
          >
            Save current as Brand Kit
          </button>
          {loadState === 'loading' && <span className="qq-bs-sub-hint" style={{ alignSelf: 'center' }}>Loading…</span>}
        </div>
      )}

      {errorMsg && <p className="qq-bs-sub-hint" style={{ color: '#b91c1c', marginTop: 6 }}>{errorMsg}</p>}

      {/* Picker modal — simple inline card list. Avoids the portal stack
       *  the ColourSwatch uses; this is a lightweight inline dropdown
       *  rendered immediately below the action row. */}
      {pickerOpen && kits && (
        <div
          className="qq-bk-picker"
          role="dialog"
          aria-label="Choose a Brand Kit"
          data-testid="style-bk-picker"
          style={{
            marginTop: 10,
            border: `1px solid ${p.colors.borderLight}`,
            borderRadius: 10,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>Choose a Brand Kit</strong>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Close picker"
              data-testid="style-bk-picker-close"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
            >×</button>
          </div>
          {kits.map((kit) => {
            const accentSwatch = (kit.style as any)?.accent ?? '#0d3cfc';
            return (
              <button
                type="button"
                key={kit.id}
                onClick={() => handleApply(kit)}
                data-testid={`style-bk-pick-${kit.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 8,
                  background: '#fff', border: `1px solid ${p.colors.borderLight}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                }}
              >
                {kit.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kit.logo_url}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: '#e5e7eb', display: 'inline-block' }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{kit.name}</span>
                  {kit.description && (
                    <span style={{ display: 'block', fontSize: 11, color: p.colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {kit.description}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 16, borderRadius: '50%', background: String(accentSwatch), border: `1px solid ${p.colors.borderLight}` }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Save dialog */}
      {saveOpen && (
        <div
          className="qq-bk-save"
          role="dialog"
          aria-label="Save current style as a Brand Kit"
          data-testid="style-bk-save-dialog"
          style={{
            marginTop: 10,
            border: `1px solid ${p.colors.borderLight}`,
            borderRadius: 10,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: '#fafafa',
          }}
        >
          <strong style={{ fontSize: 13 }}>Save Brand Kit</strong>
          <input
            type="text"
            placeholder="Name (required)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            data-testid="style-bk-save-name"
            maxLength={120}
            style={{ height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${p.colors.borderLight}` }}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            data-testid="style-bk-save-desc"
            maxLength={2000}
            style={{ height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${p.colors.borderLight}` }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setSaveOpen(false)}
              data-testid="style-bk-save-cancel"
              style={{ background: '#fff', color: p.colors.body, border: `1px solid ${p.colors.borderLight}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !saveName.trim()}
              data-testid="style-bk-save-submit"
              className="qq-bs-upsell-cta"
              style={{ opacity: busy || !saveName.trim() ? 0.6 : 1 }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
      </div>
    </fieldset>
  );
}

/* ─── BD-2b — Pricing tiers subsection ──────────────────────────────
 *
 * Renders the Good/Better/Best toggle + per-tier editor. Pure-presentation;
 * parent (StyleTab via WizardShell) owns the persisted `tiered` slot.
 *
 * Design-system compliance (per CLAUDE.md):
 *   - Floating-label inputs (label inside the field)
 *   - Max 2px vertical gap between stacked inputs
 *   - Help cue (?) at the top of the section, not duplicated per field
 *
 * Inputs are plain native fields styled to match the rest of StyleTab's
 * `.qq-style-input` look; the floating label is rendered with the same
 * `.float-field` helper class used by FloatField. We inline the wrapper
 * here rather than importing the wizard's <FloatField> so the
 * `qq-style-*` rhythm stays consistent.
 */
function PricingTiersSubsection({
  tiered, onTieredChange, templateCategory,
}: {
  tiered?: TemplateTiered;
  onTieredChange: (next: TemplateTiered | undefined) => void;
  templateCategory?: string;
}) {
  const categoryDefaultOn = shouldDefaultTiered(templateCategory);
  // Resolved enabled state — explicit value wins, else the category default.
  const enabled = typeof tiered?.enabled === 'boolean' ? tiered.enabled : categoryDefaultOn;
  // Resolved tier list — explicit list wins, else the default 3.
  const tiers: TemplateTier[] = tiered?.tiers && tiered.tiers.length > 0
    ? tiered.tiers
    : [...DEFAULT_TIERS];

  const setEnabled = (next: boolean) => {
    onTieredChange({ enabled: next, tiers });
  };
  const setTier = (idx: number, patch: Partial<TemplateTier>) => {
    const nextTiers = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onTieredChange({ enabled, tiers: nextTiers });
  };

  return (
    <div
      data-testid="style-pricing-tiers"
      style={{
        marginTop: 16, paddingTop: 12,
        borderTop: '1px solid var(--qq-style-divider, rgba(15,23,42,0.06))',
      }}
    >
      <label className="qq-style-label">
        <span className="qq-style-label-text">
          Pricing tiers
          <InfoCue
            testid="style-pricing-tiers-info"
            region="tier-cards"
            text="Good/Better/Best presentation outperforms single-price AND 4+-tier alternatives. Auto-enabled for scope-spectrum work (roofing, windows, HVAC, landscaping); off for flat-fee categories like cleaning."
          />
        </span>
      </label>
      <label
        className="qq-style-label"
        style={{
          marginTop: 2, display: 'flex', alignItems: 'center',
          gap: 8, cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="style-pricing-tiers-enabled"
          aria-label="Show Good / Better / Best pricing tiers"
        />
        <span className="qq-style-label-text" style={{ margin: 0 }}>
          Show Good / Better / Best tiers
        </span>
      </label>
      <p
        style={{
          fontSize: 11, color: 'var(--qq-style-hint, #64748b)',
          margin: '6px 0 8px', lineHeight: 1.4,
        }}
      >
        {categoryDefaultOn
          ? 'Recommended for this category — scope-spectrum work converts better with 3 price points.'
          : 'Flat-fee category — single price is the safer default.'}
      </p>

      {enabled && (
        <div
          data-testid="style-pricing-tiers-editor"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}
        >
          {tiers.map((tier, idx) => (
            <TierRow
              key={idx}
              idx={idx}
              tier={tier}
              onPatch={(patch) => setTier(idx, patch)}
            />
          ))}
          <p
            style={{
              fontSize: 11, color: 'var(--qq-style-hint, #64748b)',
              margin: '4px 0 0', lineHeight: 1.4,
            }}
          >
            Each tier price = base quote × multiplier, rounded to $25.
            Mark exactly one tier "Most Popular" so it anchors choice.
          </p>
        </div>
      )}
    </div>
  );
}

/** BD-2b — single tier row (multiplier + label + tagline + popular toggle). */
function TierRow({
  idx, tier, onPatch,
}: {
  idx: number;
  tier: TemplateTier;
  onPatch: (patch: Partial<TemplateTier>) => void;
}) {
  const labelId = `qq-tier-${idx}-label`;
  const multId = `qq-tier-${idx}-mult`;
  const taglineId = `qq-tier-${idx}-tagline`;
  return (
    <div
      data-testid={`style-pricing-tier-${idx}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 8,
        background: '#fafbfc',
        borderRadius: 8,
        border: `1px solid ${p.colors.borderLight}`,
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        <FloatField label="Tier name" htmlFor={labelId}>
          <input
            id={labelId}
            data-testid={`style-pricing-tier-${idx}-label`}
            className="premium-input"
            placeholder=" "
            value={tier.label}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </FloatField>
        <FloatField label="Multiplier" htmlFor={multId}>
          <input
            id={multId}
            data-testid={`style-pricing-tier-${idx}-multiplier`}
            className="premium-input"
            type="number"
            step={0.05}
            min={0.1}
            max={5}
            placeholder=" "
            value={tier.multiplier}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) onPatch({ multiplier: v });
            }}
          />
        </FloatField>
      </div>
      <FloatField label="Tagline" htmlFor={taglineId}>
        <input
          id={taglineId}
          data-testid={`style-pricing-tier-${idx}-tagline`}
          className="premium-input"
          placeholder=" "
          value={tier.tagline}
          onChange={(e) => onPatch({ tagline: e.target.value })}
        />
      </FloatField>
      <label
        className="qq-style-label"
        style={{
          marginTop: 2, display: 'flex', alignItems: 'center',
          gap: 6, cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={tier.mostPopular === true}
          onChange={(e) => onPatch({ mostPopular: e.target.checked })}
          data-testid={`style-pricing-tier-${idx}-popular`}
          aria-label={`Mark ${tier.label} as Most Popular`}
        />
        <span className="qq-style-label-text" style={{ margin: 0 }}>
          Most Popular
        </span>
      </label>
    </div>
  );
}

/* ─── BD-3f Item 5 — GhostBanner ────────────────────────────────────
 *
 * Editor-only demo toast that mounts onto the live preview pane when the
 * owner clicks the Success / Error colour pickers. Purely visual; never
 * saved, never reaches the exported widget. Auto-dismissed after 6 s by
 * the parent (StyleTab) or immediately via the × button.
 *
 * Anchored via a portal that locates `.qq-preview-pane` and absolute-
 * positions inside it at top-right. Falls back to a fixed-position
 * top-right anchor on the document body if the preview pane isn't in the
 * DOM (e.g. preview is collapsed). */
function GhostBanner({
  kind, colour, onClose,
}: {
  kind: 'success' | 'error';
  colour: string;
  onClose: () => void;
}) {
  const [host, setHost] = useState<Element | null>(null);

  useLayoutEffect(() => {
    // Find the preview pane each mount — it may not exist (preview
    // collapsed) so fall back to document.body with fixed positioning.
    if (typeof document === 'undefined') return;
    const pane = document.querySelector('.qq-preview-pane');
    setHost(pane ?? document.body);
  }, []);

  if (!host || typeof document === 'undefined') return null;
  const isPane = host !== document.body;
  const message = kind === 'success'
    ? 'Quote saved successfully'
    : 'Couldn’t save quote — try again';
  const testid = kind === 'success' ? 'style-ghost-success' : 'style-ghost-error';

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid={testid}
      style={{
        position: isPane ? 'absolute' : 'fixed',
        top: isPane ? 12 : 80,
        right: 12,
        zIndex: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: colour,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 8px 20px rgba(15,23,42,0.18)',
        animation: 'qqGhostFade 220ms ease-out',
        maxWidth: 320,
      }}
    >
      <span aria-hidden="true">
        {kind === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      </span>
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss preview"
        data-testid={`${testid}-close`}
        onClick={onClose}
        style={{
          marginLeft: 4,
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          opacity: 0.85,
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes qqGhostFade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="${testid}"] { animation: none !important; }
        }
      `}</style>
    </div>,
    host,
  );
}

/* ─── BG-7 Item 1 — Trust Badges editor ─────────────────────────────
 *
 * Section title matches BD-3f section-title-in-container pattern (legend
 * sits flush at the top of the fieldset, body padded below the hairline
 * divider). Help cue uses BD-3h region="trust-strip" so the WidgetSchema
 * diagram highlights the trust-strip slot where the badges render.
 *
 * Pro-tier gating: free users see the 4 defaults from the template seed
 * but every editor control is disabled; Pro users can add (up to 8),
 * remove, reorder and re-icon. The cap exists because the renderer's
 * pill row starts wrapping past ~6-7 badges on a 480px viewport.
 */
const TRUST_ICON_OPTIONS: ReadonlyArray<{ id: TrustBadge['icon']; label: string; Icon: LucideIcon }> = [
  { id: 'shield', label: 'Shield', Icon: Shield },
  { id: 'shield-check', label: 'Shield Check', Icon: ShieldCheck },
  { id: 'check-circle', label: 'Check Circle', Icon: CheckCircle },
  { id: 'check-circle-2', label: 'Check Circle 2', Icon: CheckCircle2 },
  { id: 'award', label: 'Award', Icon: Award },
  { id: 'lock', label: 'Lock', Icon: Lock },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'thumbs-up', label: 'Thumbs Up', Icon: ThumbsUp },
  { id: 'badge-check', label: 'Badge Check', Icon: BadgeCheck },
  { id: 'verified', label: 'Verified', Icon: Verified },
  { id: 'clipboard-check', label: 'Clipboard Check', Icon: ClipboardCheck },
  { id: 'clock', label: 'Clock', Icon: Clock },
  { id: 'leaf', label: 'Leaf', Icon: Leaf },
  { id: 'file-badge', label: 'File Badge', Icon: FileBadge },
];

const TRUST_BADGE_MAX = 8;

function TrustBadgesGroup({
  badges, onChange, isProTier,
}: {
  badges: readonly TrustBadge[] | undefined;
  onChange?: (next: TrustBadge[]) => void;
  isProTier: boolean;
}) {
  // No editor wired in by the parent → don't render the section at all
  // (back-compat for portal pages that haven't plumbed it through yet).
  if (!onChange) return null;

  const list = badges ?? [];
  const canEdit = isProTier;
  const canAdd = canEdit && list.length < TRUST_BADGE_MAX;

  const update = (idx: number, next: Partial<TrustBadge>) => {
    if (!canEdit) return;
    const arr = [...list];
    arr[idx] = { ...arr[idx], ...next } as TrustBadge;
    onChange(arr);
  };
  const add = () => {
    if (!canAdd) return;
    onChange([...list, { label: 'New badge', icon: 'shield-check' }]);
  };
  const remove = (idx: number) => {
    if (!canEdit) return;
    onChange(list.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    if (!canEdit) return;
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const arr = [...list];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange(arr);
  };

  return (
    <fieldset className="qq-style-group" data-testid="style-group-trust-badges">
      <legend className="qq-style-legend">
        Trust badges
        {!canEdit && (
          <span className="qq-bs-pill" aria-label="Pro plan feature">
            <Sparkles size={10} aria-hidden="true" /> Pro
          </span>
        )}
        <InfoCue
          testid="style-section-trust-badges"
          region="trust-strip"
          text="Small pill row rendered between the widget title and the first step. Each badge has a short label and a Lucide icon. Pre-populated per category — Pro users can edit, reorder, add (up to 8 total) or remove."
        />
      </legend>
      <div className="qq-style-group-body">
        {!canEdit && (
          <p className="qq-bs-sub-hint" data-testid="style-trust-badges-pro-hint">
            Free tier displays the 4 default badges seeded by the template.
            Upgrade to Pro to add, edit, reorder or remove.
          </p>
        )}
        <div
          className="qq-trust-badge-list"
          data-testid="style-trust-badge-list"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {list.map((badge, i) => (
            <div
              key={`${badge.label}-${i}`}
              className="qq-trust-badge-row"
              data-testid={`style-trust-badge-row-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 0.9fr) auto auto auto',
                gap: 6,
                alignItems: 'center',
                padding: 6,
                background: '#fff',
                border: `1px solid ${platformTheme.colors.borderLight}`,
                borderRadius: 8,
              }}
            >
              <RichTextField
                label="Label"
                htmlFor={`style-trust-badge-label-${i}`}
                value={badge.label}
                onChange={(next) => update(i, { label: next })}
                testid={`style-trust-badge-label-${i}`}
                compact
              />
              <select
                className="premium-input"
                aria-label="Badge icon"
                data-testid={`style-trust-badge-icon-${i}`}
                value={badge.icon}
                onChange={(e) => update(i, { icon: e.target.value as TrustBadge['icon'] })}
                disabled={!canEdit}
                style={{ fontSize: 12, padding: '5px 8px' }}
              >
                {TRUST_ICON_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Move badge ${i + 1} up`}
                data-testid={`style-trust-badge-up-${i}`}
                onClick={() => move(i, -1)}
                disabled={!canEdit || i === 0}
                style={trustBadgeIconBtn(canEdit && i > 0)}
              >
                <ChevronUp size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move badge ${i + 1} down`}
                data-testid={`style-trust-badge-down-${i}`}
                onClick={() => move(i, 1)}
                disabled={!canEdit || i === list.length - 1}
                style={trustBadgeIconBtn(canEdit && i < list.length - 1)}
              >
                <ChevronDown size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove badge ${i + 1}`}
                data-testid={`style-trust-badge-remove-${i}`}
                onClick={() => remove(i)}
                disabled={!canEdit}
                style={{
                  ...trustBadgeIconBtn(canEdit),
                  color: canEdit ? platformTheme.colors.danger : platformTheme.colors.muted,
                }}
              >
                <XIcon size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="Add trust badge"
          data-testid="style-trust-badge-add"
          onClick={add}
          disabled={!canAdd}
          style={{
            marginTop: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px',
            font: 'inherit', fontSize: 11.5, fontWeight: 700,
            color: canAdd ? platformTheme.colors.accent : platformTheme.colors.muted,
            background: canAdd ? platformTheme.colors.accentLighter : 'transparent',
            border: `1px dashed ${canAdd ? platformTheme.colors.accent : platformTheme.colors.borderLight}`,
            borderRadius: 7,
            cursor: canAdd ? 'pointer' : 'not-allowed',
          }}
        >
          <Plus size={12} aria-hidden="true" />
          Add badge {list.length > 0 ? `(${list.length}/${TRUST_BADGE_MAX})` : ''}
        </button>
      </div>
    </fieldset>
  );
}

function trustBadgeIconBtn(active: boolean): React.CSSProperties {
  return {
    width: 22, height: 22, padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff',
    border: `1px solid ${platformTheme.colors.borderLight}`,
    borderRadius: 6,
    color: platformTheme.colors.muted,
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.4,
  };
}

/* ─── BG-7 Item 6 — Button copy override ────────────────────────────
 *
 * Section-title-in-container pattern (BD-3f). 5 compact RichTextField
 * inputs for each button — Back, Continue, See my quote, Email me,
 * Book a consultation. Placeholders show the renderer defaults so an
 * empty value clearly signals "fall through to default".
 *
 * Pro-tier — listed in `BRAND_STUDIO_STYLE_KEYS`; free-tier patches
 * stripped before persistence. Free-tier owners see disabled-looking
 * inputs with a small PRO pill in the section header.
 */
function ButtonCopyGroup({
  buttonCopy, onChange, isProTier,
}: {
  buttonCopy: AdvButtonCopy | undefined;
  onChange: (next: AdvButtonCopy | undefined) => void;
  isProTier: boolean;
}) {
  const current = buttonCopy ?? {};
  const setField = (key: keyof AdvButtonCopy, value: string) => {
    if (!isProTier) return;
    const trimmed = value.trim();
    const next: AdvButtonCopy = { ...current };
    if (trimmed.length === 0) {
      delete next[key];
    } else {
      next[key] = value;
    }
    // If every override is now empty, clear the slot entirely so the
    // server-side strip is a no-op (and we don't ship an empty object).
    if (Object.keys(next).length === 0) onChange(undefined);
    else onChange(next);
  };
  return (
    <fieldset className="qq-style-group" data-testid="style-group-button-copy">
      <legend className="qq-style-legend">
        Button copy
        {!isProTier && (
          <span className="qq-bs-pill" aria-label="Pro plan feature">
            <Sparkles size={10} aria-hidden="true" /> Pro
          </span>
        )}
        <InfoCue
          testid="style-section-button-copy"
          region="sticky-footer"
          text="Override the wording on the widget's action buttons. Each field is optional — an empty value falls back to the default copy. Pro tier."
        />
      </legend>
      <div className="qq-style-group-body">
        {!isProTier && (
          <p className="qq-bs-sub-hint" data-testid="style-button-copy-pro-hint">
            Free tier uses the default copy ("Back", "Continue", "See my
            quote", "Email me this quote", "Book a consultation"). Upgrade
            to Pro to customise each button.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <RichTextField
            label="Back"
            htmlFor="style-button-copy-back"
            value={current.back ?? ''}
            onChange={(next) => setField('back', next)}
            placeholder="← Back"
            testid="style-button-copy-back"
            compact
          />
          <RichTextField
            label="Continue / Next"
            htmlFor="style-button-copy-next"
            value={current.next ?? ''}
            onChange={(next) => setField('next', next)}
            placeholder="Continue"
            testid="style-button-copy-next"
            compact
          />
          <RichTextField
            label="Submit (final step)"
            htmlFor="style-button-copy-submit"
            value={current.submit ?? ''}
            onChange={(next) => setField('submit', next)}
            placeholder="See my quote"
            testid="style-button-copy-submit"
            compact
          />
          <RichTextField
            label="Email quote CTA"
            htmlFor="style-button-copy-email-quote"
            value={current.emailQuote ?? ''}
            onChange={(next) => setField('emailQuote', next)}
            placeholder="Email me this quote"
            testid="style-button-copy-email-quote"
            compact
          />
          <RichTextField
            label="Book slot CTA"
            htmlFor="style-button-copy-book-slot"
            value={current.bookSlot ?? ''}
            onChange={(next) => setField('bookSlot', next)}
            placeholder="Book a consultation"
            testid="style-button-copy-book-slot"
            compact
          />
        </div>
      </div>
    </fieldset>
  );
}
