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
} from '@shared/templatePresets';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
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
}

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

// W-AO-6b — bytes ceiling for the Branding logo upload. Matches the existing
// BuildTab limit so a logo set from either place rejects oversized files
// consistently (data URL inflates ~33% on top of this).
const LOGO_MAX_BYTES = 1024 * 1024;

// W-AO-6b — sensible fallback colour tokens used by the new swatch row.
// Mirror the conservative pan-theme defaults from widgetThemes.ts so the
// Style tab UI matches what the renderer will produce when nothing is set.
const TOKEN_FALLBACKS = {
  secondary: '#64748b',
  surface: '#ffffff',
  border: '#e5e7eb',
  success: '#16a34a',
  error: '#dc2626',
} as const;

export default function StyleTab({
  style, onChange, logo, onLogoChange, planTier = 'free',
  stepLayout, onStepLayoutChange,
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
  // W-AO-6b — extended colour tokens (5 new). All optional; show the fallback
  // value as the swatch when the user hasn't picked one.
  const secondary = style.secondary ?? TOKEN_FALLBACKS.secondary;
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

  return (
    <section
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
            text="One-click theme bundles. Picking one overwrites the colours, typography, shape and density below — customise after if you like."
          />
        </legend>
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
              text="Upload your logo and choose where it sits in the calculator header. The default trade icon is hidden once you upload your own logo."
            />
          </legend>
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
        </fieldset>
      )}

      {/* ── Colours ─────────────────────────────────────────────────
       *
       * Wave L S1 — single row of small clickable circles. Each circle is the
       * current swatch colour; click opens a popover with the native picker
       * + the hex text field. Wave L S2 — visible "Colors" heading dropped;
       * the swatch row is self-explanatory. The `<legend>` semantic stays for
       * screen readers (hidden visually).
       *
       * W-AO-6b — expanded from 4 → 9 swatches. The new tokens (Secondary /
       * Surface / Border / Success / Error) all stay optional on the data
       * model; this UI just lets the user set them when they want. */}
      <fieldset className="qq-style-group qq-style-group--colours" data-testid="style-group-colours">
        {/* W-AO-7 — restored a visible legend in the top-left with an
            adjacent InfoCue. The legend was sr-only because the swatch
            row reads as self-explanatory, but the help-cue placement
            audit calls for a `?` next to every section title. */}
        <legend className="qq-style-legend">
          Colours
          <InfoCue
            testid="style-section-colours"
            text="Click any swatch to change the calculator's accent, background, body text, or result-card colour."
          />
        </legend>
        <div className="qq-style-swatches" data-testid="style-swatches-row">
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
          {/* W-AO-6b — five new tokens. Each swatch wires onto an OPTIONAL
              field; the renderer falls back to the resolved theme value
              when the user hasn't picked one. */}
          <ColourSwatch
            icon={Layers}
            label="Secondary"
            testid="style-input-secondary"
            value={secondary}
            fallback={TOKEN_FALLBACKS.secondary}
            onChange={(v) => patch({ secondary: v })}
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
          />
          <ColourSwatch
            icon={XCircle}
            label="Error"
            testid="style-input-error"
            value={errorColour}
            fallback={TOKEN_FALLBACKS.error}
            onChange={(v) => patch({ error: v })}
          />
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
            text="Sets the font family the calculator renders in. We load each option from the host site so widget pages don't pull a new web font."
          />
        </legend>
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
      </fieldset>

      {/* ── Shape ────────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-shape">
        <legend className="qq-style-legend">
          Shape
          <InfoCue
            testid="style-section-shape"
            text="Controls input style (filled vs outline) and how rounded corners are everywhere — cards, inputs, the CTA button."
          />
        </legend>
        <label className="qq-style-label">
          <span className="qq-style-label-text">
            Field style
            <InfoCue
              testid="style-shape"
              text="Tune how inputs and cards look."
            />
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
      </fieldset>

      {/* ── Layout ──────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-layout">
        <legend className="qq-style-legend">
          Layout
          <InfoCue
            testid="style-section-layout"
            text="How wide the calculator renders on desktop and mobile. Narrow / Wide / Full controls the breakpoint; the sliders below override with exact pixel values."
          />
        </legend>
        <label className="qq-style-label">
          <span className="qq-style-label-text">
            Widget width
            <InfoCue
              testid="style-layout"
              text="Choose how wide the widget renders on the page."
            />
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
      </fieldset>

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

      <style>{`
        /* W-AO-9 — section gap tightened 18px → 2px. The 1px border on
         * each .qq-style-group keeps the visual separation clear; the
         * previous 18px gutter made the Style tab feel under-populated. */
        .qq-style-panel {
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 14px 14px 16px;
          background: #fff;
          margin: 0;
        }
        /* W-SETTINGS-STYLE — subtle all-caps section label, matches the
         * Build tab treatment landed by W-SECTIONS. Sits flush above the
         * first input rather than reading as a bold heading.
         *
         * W-AO-7 — inline-flex so the InfoCue trigger sits adjacent to
         * the title text in the top-left of the fieldset (not pushed to
         * the right by block-level rendering). */
        .qq-style-legend {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          margin: 0 0 6px;
          padding: 0;
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
         * absolute-positioned label sits inside the fieldset. */
        .qq-style-swatches {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding-bottom: 16px;
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
          box-shadow: 0 0 0 2px ${p.colors.accent}, 0 4px 10px rgba(15,23,42,0.16);
          transform: translateY(-1px);
        }
        .qq-style-swatch-btn[aria-expanded="true"] {
          box-shadow: 0 0 0 2px ${p.colors.accent}, 0 6px 14px rgba(15,23,42,0.20);
        }
        .qq-style-swatch-label {
          position: absolute;
          top: 100%; left: 50%; transform: translateX(-50%);
          margin-top: 4px;
          font-size: 10px; font-weight: 600;
          color: ${p.colors.muted}; white-space: nowrap;
          letter-spacing: -0.01em;
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

        /* SegmentedControl */
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
          background: #fff;
          color: ${p.colors.heading};
          box-shadow: 0 1px 2px rgba(15,23,42,0.08);
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
        .qq-bs-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px;
          width: 100%; padding: 0;
          background: transparent; border: none;
          cursor: pointer; font: inherit; text-align: left;
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
        .qq-bs-sub {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          padding: 12px 12px 14px;
          background: #fff;
        }
        .qq-bs-sub-title {
          font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
          color: ${p.colors.muted}; text-transform: uppercase;
          margin: 0 0 8px;
        }
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

  return (
    <fieldset
      className="qq-style-group qq-bs-group"
      data-testid="style-group-brand-studio"
      data-pro-tier={isProTier ? 'true' : 'false'}
    >
      <legend className="qq-style-legend" style={{ width: '100%' }}>
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
        <div className="qq-bs-body">
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
            <p className="qq-bs-sub-title">Custom CSS</p>
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
            <p className="qq-bs-sub-title">Background</p>
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
            <p className="qq-bs-sub-title">Result panel</p>
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
            <label
              className="qq-style-label"
              style={{
                marginTop: 12, display: 'flex', alignItems: 'center',
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
            <p className="qq-bs-sub-title">Animations</p>
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
              onChange={(v) => setAnimations({ step_transition: v })}
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
  label, value, fallback, onChange, testid, icon: Icon,
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
        onClick={() => setOpen((v) => !v)}
        style={{ background: expandedHex }}
      >
        {Icon && (
          <Icon
            size={14}
            color="#fff"
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Lock size={12} aria-hidden="true" />
            Brand Kit
            <span className="qq-bs-pill" aria-label="Pro plan feature">
              <Sparkles size={10} aria-hidden="true" /> Pro
            </span>
          </span>
        </legend>
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
        <p className="qq-bs-sub-hint" style={{ margin: '6px 0 8px' }}>
          Sign in to the portal to save reusable Brand Kits across your calculators.
        </p>
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
    </fieldset>
  );
}
