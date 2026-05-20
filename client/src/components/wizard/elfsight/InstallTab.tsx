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

import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import CheckoutIntakeModal from '@/components/marketing/CheckoutIntakeModal';
import { HOSTING_DOMAIN, slugify, buildHostedUrl } from '@shared/slugUtils';
import {
  DEFAULT_SHELL_LANGUAGE, SHELL_LANGUAGES, getShellLanguage,
  type ShellSettings, type HostedPageSettings, type ShellStyle,
} from './types';
import InstallGuideModal, {
  INSTALL_GUIDES, type InstallGuideId,
} from './InstallGuideModal';
import HostedPageSection from './HostedPageSection';
import FloatField from './FloatField';

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
  /** Wave P — logo data URL from ShellState; surfaced into the hosted page
   *  customisation section to enable/disable the show-logo toggle. */
  logoUrl?: string | null;
  /** Wave P — current ShellStyle (accent + body bg) so the hosted-page
   *  section can pick a smart default background preset for the user. */
  style?: ShellStyle;
}

export default function InstallTab({
  settings, onChange, embedSlug, businessName = '', logoUrl = null, style,
}: Props) {
  const language = settings.language ?? DEFAULT_SHELL_LANGUAGE;

  // Slug resolution order (Wave P-F):
  //   1. real published slug (embedSlug prop)
  //   2. user-chosen preferred slug (settings.preferredSlug)
  //   3. derived from businessName via shared slugify
  //   4. placeholder "YOUR-CALCULATOR-ID"
  const preferredSlug = (settings.preferredSlug ?? '').trim();
  const autoDerived = businessName ? slugify(businessName) : '';
  const derivedSlug = (embedSlug ?? '').trim()
    || preferredSlug
    || autoDerived
    || 'your-calculator-id';
  const hasRealSlug = !!(embedSlug && embedSlug.trim()) || !!preferredSlug || !!businessName;
  const slug = hasRealSlug ? derivedSlug : 'YOUR-CALCULATOR-ID';

  // Wave P-F — debounced availability check + custom-slug editor.
  // Wave R-pre B — 'error' kind added so a 500 from the server (e.g. DB
  // migration not yet applied) reads as "couldn't check" instead of
  // misleading the user into thinking their slug is taken.
  type SlugStatus =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'available'; slug: string }
    | { kind: 'taken'; slug: string; alternative?: string }
    | { kind: 'invalid'; reason: string }
    | { kind: 'error' };
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: 'idle' });
  const [editingSlug, setEditingSlug] = useState(false);
  const [draftSlug, setDraftSlug] = useState(preferredSlug || autoDerived || '');

  useEffect(() => {
    if (!hasRealSlug || derivedSlug === 'your-calculator-id') {
      setSlugStatus({ kind: 'idle' });
      return;
    }
    setSlugStatus({ kind: 'checking' });
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/calculators/check-slug?slug=${encodeURIComponent(derivedSlug)}`,
        );
        // Wave R-pre B — distinguish a transport / server error from
        // "slug is taken." Without this, a 500 (e.g. DB migration not
        // applied) makes the wizard say "this slug is in use" which is
        // exactly what bit Alex on the lestorna.your-quote.net attempt.
        if (!res.ok) {
          setSlugStatus({ kind: 'error' });
          return;
        }
        const data = await res.json();
        if (data?.available) {
          setSlugStatus({ kind: 'available', slug: derivedSlug });
        } else if (data?.error) {
          // Reserved-words / invalid-format come back with a descriptive
          // reason. "Failed to check slug" / generic server errors land
          // in the error state instead so we don't lie to the user.
          const looksLikeServerError = /failed|unknown|error|database/i.test(data.error);
          const looksLikeReserved = /reserved|invalid|hyphen|character/i.test(data.error);
          if (looksLikeServerError) {
            setSlugStatus({ kind: 'error' });
          } else if (looksLikeReserved) {
            setSlugStatus({ kind: 'invalid', reason: data.error });
          } else {
            setSlugStatus({ kind: 'taken', slug: derivedSlug, alternative: `${derivedSlug}-2` });
          }
        } else {
          setSlugStatus({ kind: 'taken', slug: derivedSlug, alternative: `${derivedSlug}-2` });
        }
      } catch {
        // Wave R-pre B — network failure isn't "idle"; the user should
        // see that we couldn't verify instead of nothing.
        setSlugStatus({ kind: 'error' });
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [derivedSlug, hasRealSlug]);

  const commitDraftSlug = () => {
    const cleaned = slugify(draftSlug.trim());
    if (!cleaned) {
      onChange({ ...settings, preferredSlug: undefined });
    } else {
      onChange({ ...settings, preferredSlug: cleaned });
    }
    setEditingSlug(false);
  };

  const clearPreferred = () => {
    onChange({ ...settings, preferredSlug: undefined });
    setDraftSlug(autoDerived);
    setEditingSlug(false);
  };

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
          {editingSlug ? (
            <div className="qq-install-hosted-edit-row" data-testid="install-hosted-edit-row">
              <div className="qq-install-hosted-edit-prefix">https://</div>
              <input
                type="text"
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraftSlug();
                  if (e.key === 'Escape') { setEditingSlug(false); setDraftSlug(preferredSlug || autoDerived); }
                }}
                className="qq-install-hosted-edit-input"
                data-testid="install-hosted-slug-input"
                aria-label="Custom slug"
                spellCheck={false}
                autoFocus
              />
              <div className="qq-install-hosted-edit-suffix">.{HOSTING_DOMAIN}</div>
              <button
                type="button"
                onClick={commitDraftSlug}
                className="qq-install-hosted-edit-save"
                data-testid="install-hosted-slug-save"
                aria-label="Save slug"
                title="Save"
              >
                <Check size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => { setEditingSlug(false); setDraftSlug(preferredSlug || autoDerived); }}
                className="qq-install-hosted-edit-cancel"
                data-testid="install-hosted-slug-cancel"
                aria-label="Cancel slug edit"
                title="Cancel"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="qq-install-hosted-url-row">
              <div
                className="qq-install-hosted-url"
                data-testid="install-hosted-url"
                data-slug={derivedSlug}
              >
                {hostedDisplay}
              </div>
              {/* Wave P — every save auto-publishes server-side, so the page
               *  goes live the moment the user lands on Install. Show a
               *  positive "live" confirmation instead of the old, misleading
               *  "Reserved — activates after publish" pill. */}
              <span
                className="qq-install-hosted-badge is-live"
                data-testid="install-hosted-badge"
                data-state="live"
              >
                Live
              </span>
              <button
                type="button"
                onClick={() => { setDraftSlug(preferredSlug || autoDerived || ''); setEditingSlug(true); }}
                className="qq-install-hosted-edit-trigger"
                data-testid="install-hosted-slug-edit"
                aria-label="Customise slug"
                title="Use a custom slug"
              >
                <Pencil size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Wave P-F — live availability hint based on /api/calculators/check-slug. */}
          {!editingSlug && slugStatus.kind === 'checking' && (
            <p className="qq-install-hosted-status is-checking" data-testid="install-hosted-slug-status" data-state="checking">
              Checking availability…
            </p>
          )}
          {!editingSlug && slugStatus.kind === 'available' && (
            <p className="qq-install-hosted-status is-ok" data-testid="install-hosted-slug-status" data-state="available">
              ✓ This slug is available — yours on first save.
            </p>
          )}
          {!editingSlug && slugStatus.kind === 'taken' && (
            <p className="qq-install-hosted-status is-warn" data-testid="install-hosted-slug-status" data-state="taken">
              <strong>{slugStatus.slug}</strong> is already in use. Your link will be{' '}
              <code className="qq-install-code-inline">{slugStatus.alternative}</code>{' '}
              unless you{' '}
              <button
                type="button"
                onClick={() => { setDraftSlug(preferredSlug || autoDerived || ''); setEditingSlug(true); }}
                className="qq-install-hosted-status-link"
                data-testid="install-hosted-slug-status-customise"
              >
                pick a custom slug
              </button>.
            </p>
          )}
          {/* Wave R-pre B — explicit server-error state so a 500 from
              check-slug doesn't masquerade as "taken". */}
          {!editingSlug && slugStatus.kind === 'error' && (
            <p
              className="qq-install-hosted-status is-muted"
              data-testid="install-hosted-slug-status"
              data-state="error"
            >
              Couldn't verify availability right now — try again in a moment.
              Your slug isn't necessarily taken.
            </p>
          )}
          {!editingSlug && slugStatus.kind === 'invalid' && (
            <p className="qq-install-hosted-status is-warn" data-testid="install-hosted-slug-status" data-state="invalid">
              {slugStatus.reason}.{' '}
              <button
                type="button"
                onClick={() => { setDraftSlug(autoDerived || ''); setEditingSlug(true); }}
                className="qq-install-hosted-status-link"
                data-testid="install-hosted-slug-status-customise"
              >
                Pick a custom slug
              </button>.
            </p>
          )}
          {!editingSlug && preferredSlug && (
            <p className="qq-install-hosted-status is-muted" data-testid="install-hosted-slug-preferred">
              You picked a custom slug.{' '}
              <button
                type="button"
                onClick={clearPreferred}
                className="qq-install-hosted-status-link"
                data-testid="install-hosted-slug-clear-preferred"
              >
                Use the auto-derived one instead
              </button>.
            </p>
          )}
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
              href={hostedUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="qq-install-hosted-open"
              data-testid="install-hosted-open"
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

      {/* ── Wave P — hosted page customisation ─────────────────────
       *
       * Lives between the hosted link and the language picker. Lets the
       * user pick a background preset / solid color / custom image, a
       * centered-card vs full-bleed layout, and an optional headline +
       * subhead + logo for the hosted page only. */}
      <HostedPageSection
        value={settings.hostedPage}
        onChange={(next: HostedPageSettings) => onChange({ ...settings, hostedPage: next })}
        businessName={businessName}
        logoUrl={logoUrl}
        accentColor={style?.accent}
        bodyBackgroundColor={style?.background}
      />

      <div className="qq-install-divider" />

      {/* ── 2. Language picker ──────────────────────────────────────
       *  Wave R-pre v2 — promoted to FloatField; "Language" is now the
       *  floating label inside the field. InfoCue moves to the field's
       *  top-right corner. No "Widget language" heading above. */}
      <section className="qq-install-section" data-testid="install-section-language">
        <FloatField
          label="Widget language"
          htmlFor="qq-install-language-select"
          variant="select"
          infoText="Sets the lang attribute on the embedded widget so assistive tech and search engines know what language the calculator renders in."
          infoTestid="install-language"
        >
          <select
            id="qq-install-language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            data-testid="install-select-language"
            className="premium-input"
          >
            {SHELL_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.native}) — {l.code}
              </option>
            ))}
          </select>
        </FloatField>
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
        /* Wave P — every save auto-publishes; the badge is now a positive
         * "Live" pill instead of the old "Reserved — activates after
         * publish" warning pill. */
        .qq-install-hosted-badge.is-live {
          color: #097a4a;
          background: rgba(34, 197, 94, 0.13);
          border-color: rgba(34, 197, 94, 0.35);
        }
        /* Wave P-F — custom-slug edit row + live availability hint. */
        .qq-install-hosted-edit-trigger {
          display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
          background: transparent; border: 1px solid ${p.colors.border};
          border-radius: 6px;
          color: ${p.colors.muted}; cursor: pointer;
          margin-left: 4px;
          flex-shrink: 0;
        }
        .qq-install-hosted-edit-trigger:hover {
          background: ${d.colors.canvas};
          color: ${p.colors.heading};
          border-color: ${p.colors.accent};
        }
        .qq-install-hosted-edit-row {
          display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        }
        .qq-install-hosted-edit-prefix,
        .qq-install-hosted-edit-suffix {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12.5px; color: ${p.colors.muted};
        }
        .qq-install-hosted-edit-input {
          flex: 1; min-width: 100px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13.5px; font-weight: 700;
          padding: 6px 8px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 7px;
          color: ${p.colors.heading};
          outline: none;
        }
        .qq-install-hosted-edit-input:focus { border-color: ${p.colors.accent}; }
        .qq-install-hosted-edit-save,
        .qq-install-hosted-edit-cancel {
          width: 28px; height: 28px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 7px; cursor: pointer;
          flex-shrink: 0;
        }
        .qq-install-hosted-edit-save {
          background: ${p.colors.accent}; color: #fff; border: none;
          box-shadow: ${p.shadows.button};
        }
        .qq-install-hosted-edit-cancel {
          background: #fff; color: ${p.colors.muted};
          border: 1px solid ${p.colors.border};
        }
        .qq-install-hosted-status {
          margin: 4px 0 0;
          font-size: 11.5px; line-height: 1.5;
          color: ${p.colors.muted};
        }
        .qq-install-hosted-status.is-checking { color: ${p.colors.muted}; font-style: italic; }
        .qq-install-hosted-status.is-ok { color: #097a4a; font-weight: 600; }
        .qq-install-hosted-status.is-warn { color: ${p.colors.warning ?? '#a8741b'}; }
        .qq-install-hosted-status.is-muted { color: ${p.colors.muted}; }
        .qq-install-hosted-status-link {
          background: transparent; border: none; padding: 0;
          color: ${p.colors.accent}; font: inherit; font-weight: 600;
          cursor: pointer; text-decoration: underline;
        }
        .qq-install-hosted-status-link:hover { color: ${p.colors.accentDark ?? p.colors.accent}; }
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
