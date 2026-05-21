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
import { platformTheme } from '@/theme/platformTheme';
import {
  DEFAULT_SHELL_STYLE,
  FONT_FAMILY_LABELS,
  type ShellStyle,
  type ShellFontFamily,
  type ShellFieldStyle,
  type ShellWidgetWidth,
} from './types';
import FloatField from './FloatField';

const p = platformTheme;

interface Props {
  style: ShellStyle;
  onChange: (next: ShellStyle) => void;
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
      {/* ── Colours ─────────────────────────────────────────────────
       *
       * Wave L S1 — single row of small clickable circles. Each circle is the
       * current swatch colour; click opens a popover with the native picker
       * + the hex text field. Wave L S2 — visible "Colors" heading dropped;
       * the swatch row is self-explanatory. The `<legend>` semantic stays for
       * screen readers (hidden visually). */}
      <fieldset className="qq-style-group qq-style-group--colours" data-testid="style-group-colours">
        <legend className="qq-style-legend qq-style-legend--sr-only">Colours</legend>
        <div className="qq-style-swatches" data-testid="style-swatches-row">
          <ColourSwatch
            label="Accent"
            testid="style-input-accent"
            value={accent}
            fallback={DEFAULT_SHELL_STYLE.accent}
            onChange={(v) => patch({ accent: v })}
          />
          <ColourSwatch
            label="Background"
            testid="style-input-background"
            value={background}
            fallback={DEFAULT_SHELL_STYLE.background}
            onChange={(v) => patch({ background: v })}
          />
          <ColourSwatch
            label="Text"
            testid="style-input-text"
            value={text}
            fallback={DEFAULT_SHELL_STYLE.text}
            onChange={(v) => patch({ text: v })}
          />
          <ColourSwatch
            label="Results bg"
            testid="style-input-resultsbg"
            value={resultsBg}
            fallback={DEFAULT_SHELL_STYLE.resultsBg}
            onChange={(v) => patch({ resultsBg: v })}
          />
        </div>
      </fieldset>

      {/* ── Typography ──────────────────────────────────────────────
       *
       * Wave L S2 — visible "Typography" heading dropped; the font picker
       * speaks for itself. Legend kept for screen readers. */}
      <fieldset className="qq-style-group" data-testid="style-group-typography">
        <legend className="qq-style-legend qq-style-legend--sr-only">Typography</legend>
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
      </fieldset>

      {/* ── Shape ────────────────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="style-group-shape">
        <legend className="qq-style-legend">Shape</legend>
        <p className="qq-style-sectionhint" data-testid="style-shape-hint">
          Tune how inputs and cards look.
        </p>

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
        <p className="qq-style-sectionhint" data-testid="style-layout-hint">
          Choose how wide the widget renders on the page.
        </p>
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
        /* W-SETTINGS-STYLE — subtle all-caps section label, matches the
         * Build tab treatment landed by W-SECTIONS. Sits flush above the
         * first input rather than reading as a bold heading. */
        .qq-style-legend {
          display: block;
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
      `}</style>
    </section>
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
  label, value, fallback, onChange, testid,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  testid: string;
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
