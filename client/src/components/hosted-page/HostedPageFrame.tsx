// Wave P — HostedPageFrame.
//
// Wraps the QuoteWidget on the public hosted page (`{slug}.your-quote.net`
// and `wefixtrades.com/calculator?slug=…`) so the widget sits inside the
// background / headline / centered-card chrome the user picked in the
// wizard Install tab. Iframe / `embed-widget.js` embeds bypass this
// component entirely — they render the bare widget so it inherits the
// host page's layout.
//
// Inputs (all optional; sensible defaults for legacy calculators):
//   - settings: HostedPageSettings (from calculator_settings.shell_settings.hostedPage)
//   - logoUrl: string | undefined (calculator.logo_url)
//   - businessName: string (for sensible default headline + alt text)
//
// Decisions:
//   - Background is applied via inline `style.background` so preset CSS
//     (radial-gradients, repeating-linear, etc.) survives the React →
//     vanilla-CSS handoff with no per-preset class plumbing.
//   - When a custom image background is in use, an optional darken overlay
//     keeps headline + widget legible.
//   - The centered-card wrapper is opt-in via `showCard` and uses
//     `max-width: 720px` so it doesn't go full-bleed even on ultra-wide.

import type { CSSProperties, ReactNode } from 'react';
import {
  type HostedPageSettings,
  DEFAULT_HOSTED_PAGE,
  getHostedBackgroundPreset,
} from '@/components/wizard/elfsight/types';

interface Props {
  settings?: HostedPageSettings | null;
  logoUrl?: string | null;
  businessName?: string;
  children: ReactNode;
}

function resolveBackgroundCss(s: HostedPageSettings): { background: string; dark: boolean } {
  const bg = s.background ?? DEFAULT_HOSTED_PAGE.background!;
  if (bg.kind === 'solid') {
    // crude dark-detection — solid hex with a low average luminance is dark.
    const dark = isHexDark(bg.color);
    return { background: bg.color, dark };
  }
  if (bg.kind === 'image') {
    const overlay = typeof bg.overlay === 'number' ? Math.min(Math.max(bg.overlay, 0), 1) : 0.18;
    const overlayCss = `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay}))`;
    return {
      background: `${overlayCss}, url(${JSON.stringify(bg.dataUrl)}) center/cover no-repeat`,
      dark: overlay >= 0.32,
    };
  }
  const preset = getHostedBackgroundPreset(bg.presetId);
  return { background: preset.cssBackground, dark: !!preset.dark };
}

function isHexDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  // Rec. 709 luma.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 110;
}

export default function HostedPageFrame({
  settings, logoUrl, businessName, children,
}: Props) {
  const resolved: HostedPageSettings = { ...DEFAULT_HOSTED_PAGE, ...(settings ?? {}) };
  const { background, dark } = resolveBackgroundCss(resolved);

  const headline = (resolved.headline ?? '').trim();
  const subheadline = (resolved.subheadline ?? '').trim();
  const showLogo = resolved.showLogo !== false && !!logoUrl;
  const showHeader = !!headline || !!subheadline || showLogo;

  const fg = dark ? '#e5e7eb' : '#0f172a';
  const fgMuted = dark ? 'rgba(229,231,235,0.72)' : 'rgba(15,23,42,0.65)';

  const wrapperStyle: CSSProperties = {
    minHeight: '100vh',
    background,
    padding: '40px 16px',
    boxSizing: 'border-box',
    color: fg,
  };

  return (
    <div
      className="qq-hosted-frame"
      data-testid="hosted-page-frame"
      data-bg-kind={resolved.background?.kind ?? 'preset'}
      data-show-card={resolved.showCard !== false ? 'true' : 'false'}
      data-dark={dark ? 'true' : 'false'}
      style={wrapperStyle}
    >
      <div className="qq-hosted-inner">
        {showHeader && (
          <header className="qq-hosted-header">
            {showLogo && logoUrl && (
              <img
                src={logoUrl}
                alt={businessName ? `${businessName} logo` : 'Business logo'}
                className="qq-hosted-logo"
                data-testid="hosted-page-logo"
              />
            )}
            {headline && (
              <h1
                className="qq-hosted-headline"
                data-testid="hosted-page-headline"
                style={{ color: fg }}
              >
                {headline}
              </h1>
            )}
            {subheadline && (
              <p
                className="qq-hosted-subheadline"
                data-testid="hosted-page-subheadline"
                style={{ color: fgMuted }}
              >
                {subheadline}
              </p>
            )}
          </header>
        )}
        {resolved.showCard !== false ? (
          <div className="qq-hosted-card" data-testid="hosted-page-card">
            {children}
          </div>
        ) : (
          <div className="qq-hosted-bleed">
            {children}
          </div>
        )}
      </div>
      <style>{`
        .qq-hosted-inner {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .qq-hosted-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .qq-hosted-logo {
          height: 56px; width: auto;
          object-fit: contain;
          margin-bottom: 4px;
        }
        .qq-hosted-headline {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          line-height: 1.22;
          letter-spacing: -0.015em;
        }
        .qq-hosted-subheadline {
          margin: 0;
          font-size: 15px;
          line-height: 1.55;
          max-width: 540px;
        }
        .qq-hosted-card {
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 30px 60px -20px rgba(15, 23, 42, 0.18),
                      0 6px 18px -8px rgba(15, 23, 42, 0.12);
          padding: 24px;
          overflow: hidden;
        }
        .qq-hosted-bleed { width: 100%; }
        @media (max-width: 640px) {
          .qq-hosted-frame { padding: 24px 12px; }
          .qq-hosted-headline { font-size: 22px; }
          .qq-hosted-subheadline { font-size: 14px; }
          .qq-hosted-card { padding: 16px; border-radius: 14px; }
        }
      `}</style>
    </div>
  );
}
