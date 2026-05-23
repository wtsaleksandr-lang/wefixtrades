// Wave P — HostedPageSection.
//
// Editor UI for customising the hosted page chrome (the wrapping
// background + optional headline + centered card on
// `{slug}.your-quote.net`). Lives on the Install tab between the
// hosted-link URL and the embed snippet.
//
// Sections inside this section, top-to-bottom:
//   1. Background — preset gallery + flat-color picker + image upload
//   2. Layout    — "Show widget on a centered card" toggle
//   3. Header    — show-logo toggle, headline input, subheadline input
//   4. Live mini-preview at the top right (shows the chosen bg + first
//      ~120 px of the card chrome)

import { useRef } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import {
  DEFAULT_HOSTED_PAGE, HOSTED_BACKGROUND_PRESETS,
  smartDefaultHostedBackgroundId,
  type HostedPageSettings, type HostedBackground,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

interface Props {
  value: HostedPageSettings | undefined;
  onChange: (next: HostedPageSettings) => void;
  /** Current businessName (used for the default-headline placeholder). */
  businessName?: string;
  /** Current logo data URL — surfaces the show-logo toggle disabled state. */
  logoUrl?: string | null;
  /** Wave P — used to pick a smart default preset based on the user's
   *  brand accent (hex) and body background (hex). When `value.background`
   *  is undefined, we default to the smart pick rather than the catalogue's
   *  fallback. */
  accentColor?: string;
  bodyBackgroundColor?: string;
}

const MAX_BG_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB cap, same as logo upload.

export default function HostedPageSection({
  value, onChange, businessName, logoUrl,
  accentColor, bodyBackgroundColor,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Smart default: when the user hasn't picked a background yet (no
  // `value` OR `value.background` undefined), seed from accent + body bg.
  const smartId = smartDefaultHostedBackgroundId(accentColor, bodyBackgroundColor);
  const cur: HostedPageSettings = {
    ...DEFAULT_HOSTED_PAGE,
    background: { kind: 'preset', presetId: smartId },
    ...(value ?? {}),
  };
  const bg: HostedBackground = cur.background ?? { kind: 'preset', presetId: smartId };

  const setBackground = (next: HostedBackground) => {
    onChange({ ...cur, background: next });
  };

  const setShowCard = (next: boolean) => {
    onChange({ ...cur, showCard: next });
  };

  const setShowLogo = (next: boolean) => {
    onChange({ ...cur, showLogo: next });
  };

  const setHeadline = (next: string) => {
    onChange({ ...cur, headline: next });
  };

  const setSubheadline = (next: string) => {
    onChange({ ...cur, subheadline: next });
  };

  const handleSolidColorChange = (color: string) => {
    setBackground({ kind: 'solid', color });
  };

  const handleImageUpload = (file: File) => {
    if (file.size > MAX_BG_IMAGE_BYTES) {
      // eslint-disable-next-line no-alert -- consistent with logo upload UX
      alert('Background image must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackground({ kind: 'image', dataUrl: reader.result, overlay: 0.18 });
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerImagePicker = () => fileInputRef.current?.click();

  const removeImage = () => {
    setBackground({ kind: 'preset', presetId: 'soft-brand-gradient' });
  };

  return (
    <section
      data-theme="light"
      className="qq-install-section qq-hosted-section"
      data-testid="install-section-hosted-page"
    >
      <h3 className="qq-install-h">Hosted page customisation</h3>
      <p className="qq-install-sub">
        Pick the background, optional headline, and layout for your hosted
        page at <code className="qq-install-code-inline">{`{slug}.your-quote.net`}</code>.
        Only the hosted version uses this — embedded widgets render inside
        the host site's own page.
      </p>

      {/* ── Background — preset gallery ─────────────────────────── */}
      <div className="qq-hosted-block">
        <div className="qq-hosted-block-h">
          <InfoCue
            testid="hosted-bg-preset"
            region="background"
            text="Pick a ready-made background for your hosted page. The widget sits on a card in the centre — backgrounds frame it rather than competing with it."
          />
          <span>Background preset</span>
        </div>
        <div
          className="qq-hosted-preset-grid"
          data-testid="hosted-preset-grid"
        >
          {HOSTED_BACKGROUND_PRESETS.map((preset) => {
            const isActive = bg.kind === 'preset' && bg.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setBackground({ kind: 'preset', presetId: preset.id })}
                data-testid={`hosted-preset-${preset.id}`}
                aria-pressed={isActive}
                className={`qq-hosted-preset${isActive ? ' is-active' : ''}`}
                title={preset.label}
              >
                <span className="qq-hosted-preset-swatch" style={{ background: preset.swatch }} />
                <span className="qq-hosted-preset-label">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Background — solid color ────────────────────────────── */}
      <div className="qq-hosted-block">
        <div className="qq-hosted-block-h">
          <InfoCue
            testid="hosted-bg-solid"
            region="background"
            text="Override the preset with a flat colour. Useful for matching a strict brand palette."
          />
          <span>Or pick a solid color</span>
        </div>
        <div className="qq-hosted-solid-row">
          <input
            type="color"
            value={bg.kind === 'solid' ? bg.color : '#0d3cfc'}
            onChange={(e) => handleSolidColorChange(e.target.value)}
            className="qq-hosted-color-input"
            data-testid="hosted-solid-color"
            aria-label="Solid background color"
          />
          <input
            type="text"
            value={bg.kind === 'solid' ? bg.color : ''}
            onChange={(e) => handleSolidColorChange(e.target.value)}
            placeholder="#0d3cfc"
            className="qq-hosted-color-text"
            data-testid="hosted-solid-color-text"
            aria-label="Solid background hex value"
          />
          {bg.kind === 'solid' && (
            <button
              type="button"
              onClick={() => setBackground({ kind: 'preset', presetId: 'soft-brand-gradient' })}
              className="qq-hosted-mini-link"
              data-testid="hosted-solid-clear"
            >
              Use a preset instead
            </button>
          )}
        </div>
      </div>

      {/* ── Background — image upload ──────────────────────────── */}
      <div className="qq-hosted-block">
        <div className="qq-hosted-block-h">
          <InfoCue
            testid="hosted-bg-image"
            region="background"
            text="Upload your own background image (PNG, JPG, WebP, up to 2 MB). Use the darken slider to keep the widget readable on busy photos."
          />
          <span>Or upload a custom background image</span>
        </div>
        <div className="qq-hosted-upload-row">
          <button
            type="button"
            onClick={triggerImagePicker}
            className="qq-hosted-upload-btn"
            data-testid="hosted-image-upload"
          >
            <Upload size={14} aria-hidden="true" />
            {bg.kind === 'image' ? 'Replace image' : 'Upload image'}
          </button>
          {bg.kind === 'image' && (
            <>
              <span className="qq-hosted-thumb" aria-hidden="true">
                <span
                  className="qq-hosted-thumb-img"
                  style={{ backgroundImage: `url(${bg.dataUrl})` }}
                />
              </span>
              <div className="qq-hosted-overlay-control">
                <label
                  htmlFor="qq-hosted-overlay-slider"
                  className="qq-hosted-mini-label"
                >
                  Darken overlay
                </label>
                <input
                  id="qq-hosted-overlay-slider"
                  type="range"
                  min={0} max={70} step={5}
                  value={Math.round(((bg.overlay ?? 0.18)) * 100)}
                  onChange={(e) => setBackground({
                    ...bg,
                    overlay: Number(e.target.value) / 100,
                  })}
                  data-testid="hosted-image-overlay"
                  aria-label="Darken overlay percentage"
                />
              </div>
              <button
                type="button"
                onClick={removeImage}
                className="qq-hosted-icon-btn"
                data-testid="hosted-image-remove"
                aria-label="Remove background image"
                title="Remove background image"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f);
              e.target.value = '';
            }}
            data-testid="hosted-image-file-input"
          />
        </div>
        <p className="qq-hosted-foot">
          PNG, JPG or WebP, up to 2 MB. Keep it busy-but-not-distracting —
          the widget sits on a centered card so the background frames it
          rather than competing with it.
        </p>
      </div>

      {/* ── Layout — centered card toggle ───────────────────────── */}
      <div className="qq-hosted-block">
        <div className="qq-hosted-block-h">
          <InfoCue
            testid="hosted-layout"
            text="Recommended: keep the widget on a centred card so it stays legible over busy backgrounds. Toggle off to let the widget float over the bare background."
          />
          <span>Layout</span>
        </div>
        <label className="qq-hosted-switch-row" data-testid="hosted-card-toggle">
          <input
            type="checkbox"
            checked={cur.showCard !== false}
            onChange={(e) => setShowCard(e.target.checked)}
          />
          <span>
            <span className="qq-hosted-switch-title">Show widget on a centered card</span>
            <span className="qq-hosted-switch-sub">
              Recommended. Keeps the widget legible on busy backgrounds.
            </span>
          </span>
        </label>
      </div>

      {/* ── Header copy ─────────────────────────────────────────────
       *  Wave R-pre v2 — moved to FloatField pattern. The "Headline /
       *  Subheadline" labels live INSIDE the inputs (floating); the
       *  placeholders provide concrete examples. No header text above
       *  the field per Alex's global rule. */}
      <div className="qq-hosted-block">
        <FloatField
          label="Headline (optional)"
          htmlFor="qq-hosted-headline-input"
          infoText="Optional headline rendered above the widget on the hosted page. Leave empty to skip."
          infoTestid="hosted-headline"
        >
          <input
            id="qq-hosted-headline-input"
            type="text"
            value={cur.headline ?? ''}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder=" "
            maxLength={80}
            className="premium-input"
            data-testid="hosted-headline-input"
          />
        </FloatField>
        <div style={{ height: 8 }} />
        <FloatField
          label="Subheadline (optional)"
          htmlFor="qq-hosted-subheadline-input"
          infoText="One-line subtext under the headline. Helps set tone for the visitor."
          infoTestid="hosted-subheadline"
        >
          <input
            id="qq-hosted-subheadline-input"
            type="text"
            value={cur.subheadline ?? ''}
            onChange={(e) => setSubheadline(e.target.value)}
            placeholder=" "
            maxLength={140}
            className="premium-input"
            data-testid="hosted-subheadline-input"
          />
        </FloatField>
        <label className="qq-hosted-switch-row qq-hosted-switch-row-tight" data-testid="hosted-logo-toggle">
          <input
            type="checkbox"
            checked={cur.showLogo !== false}
            onChange={(e) => setShowLogo(e.target.checked)}
            disabled={!logoUrl}
          />
          <span>
            <span className="qq-hosted-switch-title">
              Show business logo above the headline
            </span>
            <span className="qq-hosted-switch-sub">
              {logoUrl ? 'Uses the logo uploaded in the Build tab.' : 'Upload a logo on the Build tab to enable.'}
            </span>
          </span>
        </label>
      </div>

      <style>{`
        .qq-hosted-section {
          display: flex; flex-direction: column; gap: 14px;
          padding: 14px 16px;
          background: ${d.colors.canvas};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
        }
        .qq-hosted-block { display: flex; flex-direction: column; gap: 8px; }
        /* BH-4 rule 2 — block header carries an InfoCue (top-left) +
         * label. Align them on the same baseline. */
        .qq-hosted-block-h {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700;
          color: ${p.colors.heading};
          letter-spacing: -0.005em;
        }
        .qq-hosted-preset-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
        }
        .qq-hosted-preset {
          display: flex; flex-direction: column; align-items: stretch; gap: 4px;
          padding: 4px;
          background: #fff;
          border: 1.5px solid ${p.colors.border};
          border-radius: 9px;
          cursor: pointer;
          font: inherit;
          transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
        }
        .qq-hosted-preset:hover { border-color: ${p.colors.accent}; }
        .qq-hosted-preset.is-active {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-hosted-preset-swatch {
          display: block; width: 100%; height: 36px;
          border-radius: 6px;
          border: 1px solid ${p.colors.borderLight};
        }
        .qq-hosted-preset-label {
          font-size: 10.5px; font-weight: 600;
          color: ${p.colors.muted};
          line-height: 1.25;
          text-align: center;
        }
        .qq-hosted-solid-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .qq-hosted-color-input {
          width: 36px; height: 36px; padding: 0; border: 1px solid ${p.colors.border};
          border-radius: 7px; background: #fff; cursor: pointer;
        }
        .qq-hosted-color-text {
          flex: 1; min-width: 120px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12.5px;
          padding: 7px 10px;
          border: 1px solid ${p.colors.border};
          border-radius: 7px;
          background: #fff;
          color: ${p.colors.body};
        }
        .qq-hosted-color-text:focus { border-color: ${p.colors.accent}; outline: none; }
        .qq-hosted-mini-link {
          font-size: 11.5px;
          background: transparent; border: none; padding: 0;
          color: ${p.colors.accent}; font-weight: 600; cursor: pointer;
        }
        .qq-hosted-mini-link:hover { text-decoration: underline; }
        .qq-hosted-upload-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .qq-hosted-upload-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 7px;
          background: #fff; color: ${p.colors.heading};
          border: 1px solid ${p.colors.border};
          font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
          min-height: 36px;
        }
        .qq-hosted-upload-btn:hover { background: ${d.colors.canvas}; }
        .qq-hosted-thumb {
          display: inline-flex; align-items: center; justify-content: center;
          width: 40px; height: 40px;
          border-radius: 7px;
          background: ${d.colors.canvas};
          border: 1px solid ${p.colors.border};
          overflow: hidden;
        }
        .qq-hosted-thumb-img {
          display: block; width: 100%; height: 100%;
          background-size: cover; background-position: center;
        }
        .qq-hosted-overlay-control { display: flex; flex-direction: column; gap: 2px; }
        .qq-hosted-mini-label {
          font-size: 10.5px; color: ${p.colors.muted}; font-weight: 600;
        }
        .qq-hosted-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          background: #fff; color: ${p.colors.muted};
          border: 1px solid ${p.colors.border};
          border-radius: 7px; cursor: pointer;
        }
        .qq-hosted-icon-btn:hover {
          background: ${p.colors.dangerLight}; color: ${p.colors.danger};
          border-color: ${p.colors.danger};
        }
        .qq-hosted-foot {
          margin: 4px 0 0;
          font-size: 11px; color: ${p.colors.muted};
          line-height: 1.5;
        }
        .qq-hosted-switch-row {
          display: grid; grid-template-columns: 18px 1fr;
          align-items: flex-start; gap: 8px;
          cursor: pointer;
          padding: 4px 0;
        }
        .qq-hosted-switch-row-tight { padding-top: 0; }
        .qq-hosted-switch-row input[type="checkbox"] {
          margin-top: 2px;
          width: 16px; height: 16px;
          accent-color: ${p.colors.accent};
          cursor: pointer;
        }
        .qq-hosted-switch-title {
          display: block;
          font-size: 12.5px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-hosted-switch-sub {
          display: block;
          font-size: 11.5px; color: ${p.colors.muted};
          line-height: 1.45;
        }
        .qq-hosted-text-input {
          width: 100%; padding: 9px 12px; box-sizing: border-box;
          font: inherit; font-size: 13px; color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border}; border-radius: 8px;
          outline: none;
          min-height: 38px;
        }
        .qq-hosted-text-input:focus { border-color: ${p.colors.accent}; }
        .qq-hosted-text-input-sub { font-size: 12.5px; }
        @media (max-width: 600px) {
          .qq-hosted-preset-grid { grid-template-columns: repeat(2, 1fr); }
          .qq-hosted-upload-btn { min-height: 44px; font-size: 13px; }
          .qq-hosted-text-input { min-height: 44px; font-size: 14px; }
          .qq-hosted-icon-btn { width: 44px; height: 44px; }
        }
      `}</style>
    </section>
  );
}
