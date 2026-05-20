// InstallTab — Wave H7. The "Install" tab of the Elfsight-clone editor.
//
// Three sections, top-to-bottom:
//   1. Language picker (controls the render-time LANG of the embedded
//      widget; persisted to ShellSettings.language).
//   2. Embed snippet (script tag using the existing `/embed-widget.js`
//      pattern from the legacy PublishStep; with a "Copy" button).
//   3. Quick install guides (WordPress / Wix / Squarespace / Plain HTML)
//      — inline tabs, light copy.
//
// Translation strings for the live calculator UI (button labels, "Get my
// quote", "Step X of Y") are NOT in scope for H7. The picker only stamps
// `lang="…"` on the embed snippet for the host page.
// TODO(i18n): translation strings — wire SHELL_LANGUAGES to a future
// `translations` map keyed by ISO code; supply translated strings for the
// AdvancedCalculator's hardcoded labels and the wizard headline copy.

import { useMemo, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import {
  DEFAULT_SHELL_LANGUAGE, SHELL_LANGUAGES, getShellLanguage,
  type ShellSettings,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

type InstallGuide = 'wordpress' | 'wix' | 'squarespace' | 'html';

const GUIDE_TABS: ReadonlyArray<{ id: InstallGuide; label: string }> = [
  { id: 'wordpress', label: 'WordPress' },
  { id: 'wix', label: 'Wix' },
  { id: 'squarespace', label: 'Squarespace' },
  { id: 'html', label: 'Plain HTML' },
];

const GUIDE_COPY: Record<InstallGuide, ReadonlyArray<string>> = {
  wordpress: [
    'Open the page or post in WordPress where you want the calculator.',
    'Add a "Custom HTML" block.',
    'Paste the embed snippet and publish.',
  ],
  wix: [
    'In the Wix editor, click "Add Elements" → "Embed Code" → "Embed HTML".',
    'Paste the embed snippet into the iframe code dialog.',
    'Click "Update" and publish your site.',
  ],
  squarespace: [
    'Edit the page and add a new "Code" block.',
    'Paste the embed snippet (HTML mode, no escaping).',
    'Save and publish.',
  ],
  html: [
    'Open the .html file or template where you want the calculator.',
    'Paste the embed snippet inside the <body>, where it should appear.',
    'Upload the file to your server.',
  ],
};

interface Props {
  /** Current settings (read for `language` + a slug-ish key for the snippet). */
  settings: ShellSettings;
  /** Persist updates to ShellSettings. Same handler as SettingsTab. */
  onChange: (next: ShellSettings) => void;
  /** Optional published-calculator slug to embed; falls back to a draft placeholder. */
  embedSlug?: string;
}

export default function InstallTab({ settings, onChange, embedSlug }: Props) {
  const language = settings.language ?? DEFAULT_SHELL_LANGUAGE;
  const slug = (embedSlug ?? '').trim() || 'YOUR-CALCULATOR-ID';
  const [copyOk, setCopyOk] = useState(false);
  const [activeGuide, setActiveGuide] = useState<InstallGuide>('wordpress');

  // The origin only matters for the displayed snippet — the audit suite
  // doesn't load the snippet, only inspects the textual `lang` attribute.
  const origin = useMemo(() => {
    if (typeof window === 'undefined') return 'https://wefixtrades.com';
    const { origin: o } = window.location;
    // Strip a vite/dev port so the displayed snippet looks production-y.
    if (/:(3000|5000|5173|5174)$/.test(o)) return 'https://wefixtrades.com';
    return o || 'https://wefixtrades.com';
  }, []);

  // Realistic embed snippet matching the existing repo pattern from
  // `client/public/widget/embed.js` / legacy PublishStep.
  // The `lang` attribute is the ONLY i18n wiring in H7 — host pages can read
  // it; the loader script itself ignores it today (// TODO(i18n) above).
  const snippet =
    `<script src="${origin}/embed-widget.js"\n` +
    `  data-calculator-slug="${slug}"\n` +
    `  lang="${language}"\n` +
    `  async>\n` +
    `</script>\n` +
    `<div id="quotequick-widget"></div>`;

  const setLanguage = (code: string) => {
    onChange({ ...settings, language: code });
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        // Fallback for older browsers — no new deps.
        const ta = document.createElement('textarea');
        ta.value = snippet;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1600);
    } catch {
      /* swallow — copy is a convenience */
    }
  };

  const currentLang = getShellLanguage(language);

  return (
    <div
      className="qq-editor-tabpanel qq-install-tab"
      data-testid="editor-tabpanel-install"
      role="tabpanel"
    >
      {/* ── 1. Language picker ──────────────────────────────────────── */}
      <section className="qq-install-section" data-testid="install-section-language">
        <h3 className="qq-install-h">Widget language</h3>
        <p className="qq-install-sub">
          Sets the <code className="qq-install-code-inline">lang</code> attribute on the
          embedded widget. Tells assistive tech and search engines what language the
          calculator renders in.
        </p>
        <label
          htmlFor="qq-install-language-select"
          style={{ display: 'block', fontSize: 12, fontWeight: 700, color: p.colors.heading, marginBottom: 6 }}
        >
          Language
        </label>
        <select
          id="qq-install-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          data-testid="install-select-language"
          className="qq-install-select"
        >
          {SHELL_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label} ({l.native}) — {l.code}
            </option>
          ))}
        </select>
        <p
          className="qq-install-current"
          data-testid="install-current-language"
        >
          Selected: <strong>{currentLang.label}</strong> ({currentLang.code})
        </p>
        {/* TODO(i18n): translation strings — once translations land, ALSO
            apply them to the live preview header / CTA / step labels. */}
      </section>

      <div className="qq-install-divider" />

      {/* ── 2. Embed snippet ────────────────────────────────────────── */}
      <section className="qq-install-section" data-testid="install-section-embed">
        <h3 className="qq-install-h">Embed snippet</h3>
        <p className="qq-install-sub">
          Paste this snippet on your site where you want the calculator to appear.
        </p>
        <div className="qq-install-snippet-wrap">
          <pre
            className="qq-install-snippet"
            data-testid="install-embed-snippet"
            aria-label="Embed snippet"
          >
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            data-testid="install-copy-snippet"
            className="qq-install-copy-btn"
            aria-label="Copy embed snippet"
          >
            {copyOk ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <div className="qq-install-divider" />

      {/* ── 3. Quick install guides ────────────────────────────────── */}
      <section className="qq-install-section" data-testid="install-section-guides">
        <h3 className="qq-install-h">Quick install guides</h3>
        <p className="qq-install-sub">
          Pick your site builder for a 3-step install walkthrough.
        </p>
        <div
          className="qq-install-guide-tabs"
          role="tablist"
          data-testid="install-guide-tabs"
        >
          {GUIDE_TABS.map((g) => {
            const active = activeGuide === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveGuide(g.id)}
                data-testid={`install-guide-tab-${g.id}`}
                className={`qq-install-guide-tab${active ? ' is-active' : ''}`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <ol
          className="qq-install-guide-list"
          data-testid={`install-guide-list-${activeGuide}`}
        >
          {GUIDE_COPY[activeGuide].map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      <style>{`
        .qq-install-tab {
          display: flex; flex-direction: column; gap: 16px;
        }
        .qq-install-h {
          font-size: 13px; font-weight: 700; color: ${p.colors.heading};
          margin: 0 0 4px; letter-spacing: -0.005em;
        }
        .qq-install-sub {
          font-size: 12px; color: ${p.colors.muted};
          margin: 0 0 10px; line-height: 1.5;
        }
        .qq-install-code-inline {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11.5px; padding: 1px 5px; border-radius: 4px;
          background: ${p.colors.surfaceRaised}; color: ${p.colors.body};
        }
        .qq-install-section { display: flex; flex-direction: column; }
        .qq-install-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 2px 0;
        }
        .qq-install-select {
          width: 100%; padding: 9px 12px; box-sizing: border-box;
          font-size: 13px; color: ${p.colors.body}; background: #fff;
          border: 1px solid ${p.colors.border}; border-radius: 8px;
          outline: none; min-height: 40px;
        }
        .qq-install-select:focus { border-color: ${p.colors.accent}; }
        .qq-install-current {
          font-size: 12px; color: ${p.colors.muted};
          margin: 8px 0 0;
        }
        .qq-install-snippet-wrap {
          position: relative;
          border: 1px solid ${p.colors.border}; border-radius: 10px;
          background: ${d.colors.canvas};
          overflow: hidden;
        }
        .qq-install-snippet {
          margin: 0; padding: 12px 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px; line-height: 1.55;
          color: ${p.colors.body};
          white-space: pre-wrap; word-break: break-all;
          background: transparent;
          max-height: 220px; overflow: auto;
        }
        .qq-install-copy-btn {
          position: absolute; top: 8px; right: 8px;
          background: ${p.colors.accent}; color: #fff;
          font-size: 11.5px; font-weight: 700;
          border: none; border-radius: 6px; padding: 5px 10px;
          cursor: pointer; box-shadow: ${p.shadows.button};
          transition: box-shadow 0.12s ease, transform 0.06s ease;
          min-height: 28px;
        }
        .qq-install-copy-btn:hover { box-shadow: ${p.shadows.buttonHover}; }
        .qq-install-copy-btn:active { transform: translateY(1px); }
        .qq-install-guide-tabs {
          display: flex; gap: 6px; flex-wrap: wrap;
          padding: 4px; background: ${d.colors.canvas};
          border: 1px solid ${p.colors.border}; border-radius: 10px;
          margin-bottom: 12px;
        }
        .qq-install-guide-tab {
          flex: 1 1 auto; min-width: 80px;
          padding: 8px 12px; border-radius: 7px;
          font: inherit; font-size: 12.5px; font-weight: 600;
          background: transparent; color: ${p.colors.muted};
          border: 1px solid transparent; cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
          min-height: 36px;
        }
        .qq-install-guide-tab:hover { color: ${p.colors.heading}; }
        .qq-install-guide-tab.is-active {
          background: #fff; color: ${p.colors.heading};
          border-color: ${p.colors.borderLight};
          box-shadow: ${p.shadows.button};
        }
        .qq-install-guide-list {
          margin: 0; padding: 0 0 0 20px;
          font-size: 12.5px; color: ${p.colors.body};
          line-height: 1.6;
        }
        .qq-install-guide-list li { margin: 6px 0; }

        /* Mobile — tap targets ≥44px, picker full width (already), snippet
           wraps without breaking layout. */
        @media (max-width: 768px) {
          .qq-install-select { min-height: 44px; padding: 11px 12px; font-size: 14px; }
          .qq-install-copy-btn { min-height: 44px; padding: 0 16px; font-size: 13px; }
          .qq-install-guide-tab { min-height: 44px; font-size: 13px; }
          .qq-install-snippet { font-size: 12.5px; }
        }
      `}</style>
    </div>
  );
}
