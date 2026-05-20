// InstallTab — Wave H7, then Wave L (done-for-you CTA), then Wave O.
//
// Wave O changes:
//   - New "Hosted link" section at the top of the tab. Surfaces the
//     {slug}.your-quote.net subdomain users get for free, with Copy + Open
//     buttons and a short "this is the no-install option" explainer.
//     Slug is derived from `businessName` via shared/slugUtils.slugify();
//     a "(reserved — activates after publish)" hint signals when the URL
//     isn't live yet. This is the explicit user ask: "users to click and
//     view their version of the widget with their unique sub domain."
//   - The per-platform install guides are now MODAL containers. Each
//     platform is a click card; the existing 3-line inline list is gone.
//     Detail level matches the public /docs/embed guide (numbered steps,
//     tips, common-mistake callouts). See InstallGuideModal.tsx.
//
// Sections, top-to-bottom:
//   1. Hosted link (Wave O — new)
//   2. Language picker (Wave H7)
//   3. Embed snippet (Wave H7)
//   4. Done-for-you install CTA ($75 — Wave L I1)
//   5. Platform guide cards → modal (Wave O — replaces inline tabs)
//
// Translation strings for the live calculator UI (button labels, "Get my
// quote", "Step X of Y") are NOT in scope for H7. The picker only stamps
// `lang="…"` on the embed snippet for the host page.
// TODO(i18n): translation strings — wire SHELL_LANGUAGES to a future
// `translations` map keyed by ISO code; supply translated strings for the
// AdvancedCalculator's hardcoded labels and the wizard headline copy.

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import CheckoutIntakeModal from '@/components/marketing/CheckoutIntakeModal';
import { HOSTING_DOMAIN, slugify, buildHostedUrl } from '@shared/slugUtils';
import {
  DEFAULT_SHELL_LANGUAGE, SHELL_LANGUAGES, getShellLanguage,
  type ShellSettings,
} from './types';
import InstallGuideModal, {
  INSTALL_GUIDES, type InstallGuideId,
} from './InstallGuideModal';

const p = platformTheme;
const d = dashboardTheme;

interface Props {
  /** Current settings (read for `language` + a slug-ish key for the snippet). */
  settings: ShellSettings;
  /** Persist updates to ShellSettings. Same handler as SettingsTab. */
  onChange: (next: ShellSettings) => void;
  /** Optional published-calculator slug to embed; falls back to a draft placeholder. */
  embedSlug?: string;
  /** Wave O — business name from ShellState; used to derive a hosted-link slug
   *  preview when no published slug exists yet. */
  businessName?: string;
  /** Wave O — true when the calculator is already published with the given
   *  slug. Controls the "(reserved — activates after publish)" hint. */
  isPublished?: boolean;
}

export default function InstallTab({
  settings, onChange, embedSlug, businessName = '', isPublished = false,
}: Props) {
  const language = settings.language ?? DEFAULT_SHELL_LANGUAGE;

  // Slug resolution order:
  //   1. real published slug (embedSlug prop)
  //   2. derived from businessName via shared slugify
  //   3. placeholder "YOUR-CALCULATOR-ID"
  const derivedSlug = (embedSlug ?? '').trim()
    || (businessName ? slugify(businessName) : '')
    || 'your-calculator-id';
  const hasRealSlug = !!(embedSlug && embedSlug.trim()) || !!businessName;
  const slug = hasRealSlug ? derivedSlug : 'YOUR-CALCULATOR-ID';

  const [snippetCopyOk, setSnippetCopyOk] = useState(false);
  const [hostedCopyOk, setHostedCopyOk] = useState(false);
  const [activeGuide, setActiveGuide] = useState<InstallGuideId | null>(null);
  // Wave L I1 — done-for-you install CTA. Opens the existing
  // CheckoutIntakeModal with the new $75 quotequick-install SKU
  // (added to shared/pricing.ts under QUOTEQUICK.tiers). Stripe price id is
  // wired server-side via STRIPE_QUOTEQUICK_INSTALL_PRICE env var.
  const [installCheckoutOpen, setInstallCheckoutOpen] = useState(false);

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
  const snippet =
    `<script src="${origin}/embed-widget.js"\n` +
    `  data-calculator-slug="${slug}"\n` +
    `  lang="${language}"\n` +
    `  async>\n` +
    `</script>\n` +
    `<div id="quotequick-widget"></div>`;

  // Wave O — hosted-link URL preview.
  const hostedUrl = buildHostedUrl(derivedSlug);
  const hostedDisplay = `${derivedSlug}.${HOSTING_DOMAIN}`;

  const setLanguage = (code: string) => {
    onChange({ ...settings, language: code });
  };

  const copyText = async (
    text: string,
    setFlag: (v: boolean) => void,
  ) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setFlag(true);
      setTimeout(() => setFlag(false), 1600);
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
      {/* ── 1. Hosted link — Wave O ─────────────────────────────────
       *
       * The "no-install" option. Even users who don't have a website (or
       * don't want to touch one) can share the calculator at a unique
       * subdomain. Three controls:
       *   - URL display (always visible, copy-friendly typography)
       *   - Copy link button
       *   - Open in new tab button (only enabled once published) */}
      <section
        className="qq-install-section qq-install-hosted"
        data-testid="install-section-hosted"
      >
        <h3 className="qq-install-h">Hosted link — no install needed</h3>
        <p className="qq-install-sub">
          Every calculator gets a free hosted URL. Share it in emails, your
          Instagram bio, or your Google Business profile — no website
          required.
        </p>
        <div className="qq-install-hosted-card">
          <div className="qq-install-hosted-url-row">
            <div
              className="qq-install-hosted-url"
              data-testid="install-hosted-url"
              data-slug={derivedSlug}
            >
              {hostedDisplay}
            </div>
            {!isPublished && (
              <span
                className="qq-install-hosted-badge"
                data-testid="install-hosted-badge"
              >
                Reserved — activates after publish
              </span>
            )}
          </div>
          <div className="qq-install-hosted-actions">
            <button
              type="button"
              onClick={() => copyText(hostedUrl, setHostedCopyOk)}
              className="qq-install-hosted-copy"
              data-testid="install-hosted-copy"
              aria-label="Copy hosted link"
            >
              {hostedCopyOk ? 'Link copied' : 'Copy link'}
            </button>
            <a
              href={isPublished ? hostedUrl : undefined}
              target={isPublished ? '_blank' : undefined}
              rel={isPublished ? 'noreferrer noopener' : undefined}
              className={`qq-install-hosted-open${isPublished ? '' : ' is-disabled'}`}
              data-testid="install-hosted-open"
              aria-disabled={!isPublished}
              onClick={(e) => { if (!isPublished) e.preventDefault(); }}
            >
              <ExternalLink size={13} aria-hidden="true" />
              Open
            </a>
          </div>
          <p className="qq-install-hosted-foot">
            Want a custom domain (e.g. <code className="qq-install-code-inline">quotes.yoursite.com</code>)?
            That's available on the Pro plan.
          </p>
        </div>
      </section>

      <div className="qq-install-divider" />

      {/* ── 2. Language picker ──────────────────────────────────────── */}
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

      {/* ── 3. Embed snippet ────────────────────────────────────────── */}
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
            onClick={() => copyText(snippet, setSnippetCopyOk)}
            data-testid="install-copy-snippet"
            className="qq-install-copy-btn"
            aria-label="Copy embed snippet"
          >
            {snippetCopyOk ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <div className="qq-install-divider" />

      {/* ── 4. Done-for-you install service — Wave L I1 ─────────────
       *
       * Sits between the embed snippet and the platform guides so users who
       * don't want to embed the snippet themselves see the CTA before
       * digging into per-CMS instructions. Brand-blue panel, single CTA
       * that opens CheckoutIntakeModal pre-loaded with the install SKU. */}
      <section
        className="qq-install-section qq-install-doneforyou"
        data-testid="install-section-doneforyou"
      >
        <div className="qq-install-doneforyou-card">
          <div className="qq-install-doneforyou-copy">
            <h3 className="qq-install-doneforyou-h">
              Don't want to install it yourself? We'll do it for $75.
            </h3>
            <p className="qq-install-doneforyou-sub">
              We install QuoteQuick on your website, configure it for your trade,
              and verify it's capturing leads — within 24 hours.
            </p>
          </div>
          <button
            type="button"
            className="qq-install-doneforyou-cta"
            onClick={() => setInstallCheckoutOpen(true)}
            data-testid="install-doneforyou-cta"
          >
            Have us install it — $75
          </button>
        </div>
      </section>

      <CheckoutIntakeModal
        open={installCheckoutOpen}
        onClose={() => setInstallCheckoutOpen(false)}
        items={['quotequick-install']}
        bundleName="QuoteQuick Install Service"
        priceLabel="$75 one-time"
      />

      <div className="qq-install-divider" />

      {/* ── 5. Platform install guides (modal-based) — Wave O ───────
       *
       * One click card per platform; clicking opens InstallGuideModal with
       * a detailed numbered walkthrough + tips + common-mistake callouts.
       * Replaces the previous inline 3-line tab list. */}
      <section className="qq-install-section" data-testid="install-section-guides">
        <h3 className="qq-install-h">Platform install guides</h3>
        <p className="qq-install-sub">
          Pick your platform for a detailed step-by-step walkthrough.
        </p>
        <div
          className="qq-install-guide-grid"
          data-testid="install-guide-grid"
        >
          {INSTALL_GUIDES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGuide(g.id)}
              className="qq-install-guide-card"
              data-testid={`install-guide-card-${g.id}`}
              aria-haspopup="dialog"
            >
              <span aria-hidden="true" className="qq-install-guide-card-icon">{g.icon}</span>
              <span className="qq-install-guide-card-body">
                <span className="qq-install-guide-card-label">{g.label}</span>
                <span className="qq-install-guide-card-cta">View guide →</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <InstallGuideModal
        activeId={activeGuide}
        onClose={() => setActiveGuide(null)}
        snippet={snippet}
      />

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

        /* Hosted-link card — Wave O */
        .qq-install-hosted-card {
          padding: 14px 16px;
          background: ${d.colors.canvas};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .qq-install-hosted-url-row {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          min-width: 0;
        }
        .qq-install-hosted-url {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13.5px; font-weight: 700;
          color: ${p.colors.heading};
          padding: 6px 10px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 7px;
          word-break: break-all;
          flex: 1; min-width: 0;
        }
        .qq-install-hosted-badge {
          flex-shrink: 0;
          font-size: 11px; font-weight: 700;
          color: ${p.colors.warning ?? '#a8741b'};
          background: rgba(255, 176, 32, 0.14);
          border: 1px solid rgba(255, 176, 32, 0.32);
          border-radius: 999px;
          padding: 3px 8px;
          line-height: 1.3;
          white-space: nowrap;
        }
        .qq-install-hosted-actions {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        .qq-install-hosted-copy,
        .qq-install-hosted-open {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          font-size: 12.5px; font-weight: 700;
          cursor: pointer;
          min-height: 36px;
          transition: box-shadow 0.12s ease, transform 0.06s ease, background 0.12s ease;
          text-decoration: none;
        }
        .qq-install-hosted-copy {
          background: ${p.colors.accent}; color: #fff;
          border: none;
          box-shadow: ${p.shadows.button};
        }
        .qq-install-hosted-copy:hover { box-shadow: ${p.shadows.buttonHover}; }
        .qq-install-hosted-copy:active { transform: translateY(1px); }
        .qq-install-hosted-open {
          background: #fff;
          color: ${p.colors.heading};
          border: 1px solid ${p.colors.border};
        }
        .qq-install-hosted-open:hover { background: ${d.colors.canvas}; }
        .qq-install-hosted-open.is-disabled {
          color: ${p.colors.muted};
          cursor: not-allowed;
          opacity: 0.65;
        }
        .qq-install-hosted-foot {
          margin: 0;
          font-size: 11.5px; color: ${p.colors.muted};
          line-height: 1.5;
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

        /* Wave O — platform guide cards (modal-based). 2-up grid that
         * collapses to 1-up on mobile. */
        .qq-install-guide-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .qq-install-guide-card {
          display: flex; align-items: center; gap: 10px;
          text-align: left;
          padding: 10px 12px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
          cursor: pointer;
          font: inherit;
          transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
          min-height: 56px;
        }
        .qq-install-guide-card:hover {
          border-color: ${p.colors.accent};
          box-shadow: 0 2px 8px rgba(13, 60, 252, 0.10);
        }
        .qq-install-guide-card:active { transform: translateY(1px); }
        .qq-install-guide-card-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          background: ${d.colors.canvas};
          border-radius: 8px;
          font-size: 18px;
          flex-shrink: 0;
        }
        .qq-install-guide-card-body {
          display: flex; flex-direction: column; min-width: 0; flex: 1;
        }
        .qq-install-guide-card-label {
          font-size: 12.5px; font-weight: 700;
          color: ${p.colors.heading};
          line-height: 1.3;
        }
        .qq-install-guide-card-cta {
          font-size: 11px; color: ${p.colors.accent};
          font-weight: 600;
          margin-top: 2px;
        }

        /* Wave L I1 — done-for-you install panel. Brand-blue tinted card with
         * a copy block on the left and a primary CTA on the right; stacks
         * on mobile. */
        .qq-install-doneforyou-card {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(13,60,252,0.10), rgba(13,60,252,0.04));
          border: 1px solid rgba(13,60,252,0.28);
        }
        .qq-install-doneforyou-copy { flex: 1; min-width: 0; }
        .qq-install-doneforyou-h {
          margin: 0 0 4px;
          font-size: 13.5px; font-weight: 800;
          color: ${p.colors.heading};
          letter-spacing: -0.005em;
          line-height: 1.3;
        }
        .qq-install-doneforyou-sub {
          margin: 0;
          font-size: 12px; color: ${p.colors.muted};
          line-height: 1.55;
        }
        .qq-install-doneforyou-cta {
          flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
          padding: 10px 16px; border-radius: 8px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          background: ${p.colors.accent}; color: #fff; border: none;
          box-shadow: ${p.shadows.button};
          transition: box-shadow 0.12s ease, transform 0.06s ease;
          white-space: nowrap;
        }
        .qq-install-doneforyou-cta:hover { box-shadow: ${p.shadows.buttonHover}; }
        .qq-install-doneforyou-cta:active { transform: translateY(1px); }

        /* Mobile — tap targets ≥44px, picker full width (already), snippet
           wraps without breaking layout, guide grid collapses to 1-up. */
        @media (max-width: 768px) {
          .qq-install-select { min-height: 44px; padding: 11px 12px; font-size: 14px; }
          .qq-install-copy-btn { min-height: 44px; padding: 0 16px; font-size: 13px; }
          .qq-install-snippet { font-size: 12.5px; }
          .qq-install-doneforyou-card {
            flex-direction: column; align-items: stretch;
          }
          .qq-install-doneforyou-cta {
            min-height: 44px; font-size: 14px;
          }
          .qq-install-hosted-copy,
          .qq-install-hosted-open { min-height: 44px; font-size: 13px; }
          .qq-install-guide-grid { grid-template-columns: 1fr; }
          .qq-install-guide-card { min-height: 56px; }
        }
      `}</style>
    </div>
  );
}
