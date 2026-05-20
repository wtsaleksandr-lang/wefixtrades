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

import { useCallback } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import {
  DEFAULT_SHELL_STYLE,
  FONT_FAMILY_LABELS,
  type ShellStyle,
  type ShellFontFamily,
  type ShellFieldStyle,
  type ShellWidgetWidth,
} from './types';

const p = platformTheme;

interface Props {
  style: ShellStyle;
  onChange: (next: ShellStyle) => void;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

export default function StyleTab({ style, onChange }: Props) {
  /** Patch a single style field (skipping `undefined` so blanks fall through). */
  const patch = useCallback(
    (next: Partial<ShellStyle>) => onChange({ ...style, ...next }),
    [style, onChange],
  );

  const accent = style.accent ?? DEFAULT_SHELL_STYLE.accent;
  const background = style.background ?? DEFAULT_SHELL_STYLE.background;
  const text = style.text ?? DEFAULT_SHELL_STYLE.text;
  const resultsBg = style.resultsBg ?? DEFAULT_SHELL_STYLE.resultsBg;
  const fontFamily = style.fontFamily ?? DEFAULT_SHELL_STYLE.fontFamily;
  const fieldStyle = style.fieldStyle ?? DEFAULT_SHELL_STYLE.fieldStyle;
  const radius = style.radius ?? DEFAULT_SHELL_STYLE.radius;
  const widgetWidth = style.widgetWidth ?? DEFAULT_SHELL_STYLE.widgetWidth;

  return (
    <section
      className="qq-style-panel"
      // `editor-tabpanel-style` matches the convention asserted by the H1
      // generic-tab-switching test (`editor-tabpanel-<id>`).
      data-testid="editor-tabpanel-style"
      aria-label="Style"
      role="tabpanel"
    >
      {/* ── Colours ─────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-colours">
        <legend className="qq-style-legend">Colours</legend>
        <p className="qq-style-sub">
          The accent colour drives the primary CTA and slider track.
        </p>
        <div className="qq-style-grid">
          <ColourField
            label="Accent"
            testid="style-input-accent"
            value={accent}
            fallback={DEFAULT_SHELL_STYLE.accent}
            onChange={(v) => patch({ accent: v })}
          />
          <ColourField
            label="Background"
            testid="style-input-background"
            value={background}
            fallback={DEFAULT_SHELL_STYLE.background}
            onChange={(v) => patch({ background: v })}
          />
          <ColourField
            label="Text"
            testid="style-input-text"
            value={text}
            fallback={DEFAULT_SHELL_STYLE.text}
            onChange={(v) => patch({ text: v })}
          />
          <ColourField
            label="Results background"
            testid="style-input-resultsbg"
            value={resultsBg}
            fallback={DEFAULT_SHELL_STYLE.resultsBg}
            onChange={(v) => patch({ resultsBg: v })}
          />
        </div>
      </fieldset>

      {/* ── Typography ──────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-typography">
        <legend className="qq-style-legend">Typography</legend>
        <p className="qq-style-sub">Pick a font family from the curated set.</p>
        <label className="qq-style-label" htmlFor="qq-style-font">Font family</label>
        <select
          id="qq-style-font"
          className="qq-style-select"
          value={fontFamily}
          onChange={(e) => patch({ fontFamily: e.target.value as ShellFontFamily })}
          data-testid="style-select-font"
        >
          {(Object.keys(FONT_FAMILY_LABELS) as ShellFontFamily[]).map((k) => (
            <option key={k} value={k}>{FONT_FAMILY_LABELS[k]}</option>
          ))}
        </select>
      </fieldset>

      {/* ── Shape ────────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-shape">
        <legend className="qq-style-legend">Shape</legend>
        <p className="qq-style-sub">Tune how inputs and cards look.</p>

        <label className="qq-style-label">Field style</label>
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
        <legend className="qq-style-legend">Layout</legend>
        <p className="qq-style-sub">Choose how wide the widget renders on the page.</p>
        <label className="qq-style-label">Widget width</label>
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
      </fieldset>

      <style>{`
        .qq-style-panel {
          display: flex; flex-direction: column; gap: 18px;
        }
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 14px 14px 16px;
          background: #fff;
          margin: 0;
        }
        .qq-style-legend {
          font-size: 13px; font-weight: 800;
          color: ${p.colors.heading};
          padding: 0 6px;
          letter-spacing: -0.005em;
        }
        .qq-style-sub {
          font-size: 12px; color: ${p.colors.muted};
          margin: 0 0 12px; line-height: 1.5;
        }
        .qq-style-grid {
          display: grid; gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-style-grid { grid-template-columns: 1fr; }
        }
        .qq-style-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; font-weight: 700;
          color: ${p.colors.heading};
          margin-bottom: 6px;
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
        .qq-style-colour-row {
          display: flex; align-items: center; gap: 8px;
        }
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
      `}</style>
    </section>
  );
}

/* ─── ColourField — native colour input + hex text field ─── */
function ColourField({
  label, value, fallback, onChange, testid,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  testid: string;
}) {
  // The native swatch demands a strict 7-char hex; if the typed-in value is
  // anything else we feed it the fallback so the swatch stays useful while
  // the user is mid-type.
  const swatchValue = safeHex(value) || safeHex(fallback) || '#000000';
  return (
    <div className="qq-style-colour">
      <span className="qq-style-label" style={{ marginBottom: 0 }}>
        {label}
      </span>
      <div className="qq-style-colour-row">
        <input
          type="color"
          className="qq-style-swatch"
          value={swatchValue.length === 4
            // expand #abc → #aabbcc for the native picker
            ? '#' + swatchValue.slice(1).split('').map((c) => c + c).join('')
            : swatchValue}
          aria-label={`${label} colour`}
          data-testid={`${testid}-swatch`}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="qq-style-hex"
          value={value}
          aria-label={`${label} hex`}
          placeholder={fallback}
          data-testid={testid}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow the user to type freely; only persist when it parses to
            // a hex. If they clear the field, fall back to the brand default.
            if (raw.trim() === '') { onChange(fallback); return; }
            const hex = safeHex(raw);
            if (hex) onChange(hex);
            else onChange(raw); // keep the in-progress text in state
          }}
        />
      </div>
    </div>
  );
}

/* ─── SegmentedControl ─── */
function SegmentedControl<T extends string>({
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
            key={o.value}
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
