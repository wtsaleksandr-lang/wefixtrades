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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLayoutGuard } from '@/lib/layoutGuard';
import { Check, ExternalLink, Pencil, X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import CheckoutIntakeModal from '@/components/marketing/CheckoutIntakeModal';
import { HOSTING_DOMAIN, slugify, buildHostedUrl } from '@shared/slugUtils';
import {
  DEFAULT_SHELL_LANGUAGE, SHELL_LANGUAGES, getShellLanguage,
  type ShellSettings, type HostedPageSettings, type ShellStyle,
} from './types';
import type { AdvFloatingLauncherPosition } from '@shared/templatePresets';
import InstallGuideModal, {
  INSTALL_GUIDES, type InstallGuideId,
} from './InstallGuideModal';
import HostedPageSection from './HostedPageSection';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import { StyledSelect } from './StyledSelect';
import { HelpCueRow } from '@/components/primitives';

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

  // BD-3m — embed-mode toggle. Drives the snippet generation + the live
  // preview banner below. Defaults to `inline` to match the historic
  // snippet shape. `floating` mode is the BD-3m floating launcher (icon
  // docked in a corner, expands the full widget on click). The position
  // value mirrors the Style tab's floatingLauncher.position so the
  // wizard preview and the host-page snippet stay in sync.
  const floatingLauncherStyle = style?.floatingLauncher;
  const styleSaysFloating = floatingLauncherStyle?.enabled === true;
  const styleSaysPosition: AdvFloatingLauncherPosition =
    floatingLauncherStyle?.position ?? 'bottom-right';
  const [embedMode, setEmbedMode] = useState<'inline' | 'floating'>(
    styleSaysFloating ? 'floating' : 'inline',
  );
  // Keep the InstallTab toggle in sync if the Style tab flips the master
  // toggle while the user is on a different tab. We only react to the
  // master toggle (not the position) so the user's last InstallTab choice
  // wins for the position. Effect runs only when the boolean flips.
  useEffect(() => {
    setEmbedMode(styleSaysFloating ? 'floating' : 'inline');
  }, [styleSaysFloating]);
  const [embedPosition, setEmbedPosition] = useState<AdvFloatingLauncherPosition>(
    styleSaysPosition,
  );
  useEffect(() => {
    setEmbedPosition(styleSaysPosition);
  }, [styleSaysPosition]);

  // Realistic embed snippet matching the existing repo pattern from
  // `client/public/widget/embed.js` / legacy PublishStep. BD-3m: when the
  // embed-mode toggle is `floating` the snippet includes `data-mode` +
  // `data-position` and DROPS the inline mount-target `<div>` (the
  // launcher is appended to <body> by the script itself).
  const snippet = embedMode === 'floating'
    ? (
      `<script src="${origin}/embed-widget.js"\n` +
      `  data-calculator-slug="${slug}"\n` +
      `  data-mode="floating"\n` +
      `  data-position="${embedPosition}"\n` +
      `  lang="${language}"\n` +
      `  async>\n` +
      `</script>`
    )
    : (
      `<script src="${origin}/embed-widget.js"\n` +
      `  data-calculator-slug="${slug}"\n` +
      `  lang="${language}"\n` +
      `  async>\n` +
      `</script>\n` +
      `<div id="quotequick-widget"></div>`
    );

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

  // LAYOUT-1 — dev-only overlap/crumple detector on the Install panel.
  // Vertical stack of <section.qq-install-section> blocks; section-level
  // 24px gap threshold matches the rest of the editor tabs.
  const installPanelRef = useRef<HTMLDivElement | null>(null);
  useLayoutGuard(installPanelRef, { maxGapPx: 24, label: 'editor-tabpanel-install' });

  return (
    <div
      ref={installPanelRef}
      data-theme="light"
      className="qq-editor-tabpanel qq-install-tab"
      data-testid="editor-tabpanel-install"
      data-section
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
        <h3 className="qq-install-h">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="install-section-hosted"
                  text="A free subdomain that runs your calculator out of the box. Use it if you don't have a website yet, or while you're setting up the embed."
                />
                <span style={{ marginLeft: 6 }}>Hosted link — no install needed</span>
              </>
            }
          />
        </h3>
        <p className="qq-install-sub">
          Every calculator gets a free hosted URL. Share it in emails, your
          Instagram bio, or your Google Business profile — no website
          required.
        </p>
        <div className="qq-install-hosted-card">
          {/* Wave AO-10 — Live badge sits at the top-right CORNER of the
              hosted card (outside the URL input), as a floating pill.
              BD-3j: smaller (8.5px text, 1×6px padding) and tucked tighter
              into the corner (top:4, right:6). */}
          <span
            className="qq-install-hosted-corner-badge is-live"
            data-testid="install-hosted-badge"
            data-state="live"
          >
            <span className="qq-install-hosted-corner-dot" aria-hidden="true" />
            Live
          </span>
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
              <div className="qq-install-hosted-url-wrap">
                <div
                  className="qq-install-hosted-url"
                  data-testid="install-hosted-url"
                  data-slug={derivedSlug}
                >
                  {hostedDisplay}
                </div>
                {/* Wave AO-10 — Live badge moved to top-right corner of the
                 *  surrounding hosted card (see .qq-install-hosted-corner-badge
                 *  above). No longer absolutely positioned inside the input. */}
                <button
                  type="button"
                  onClick={() => { setDraftSlug(preferredSlug || autoDerived || ''); setEditingSlug(true); }}
                  className="qq-install-hosted-edit-trigger"
                  data-testid="install-hosted-slug-edit"
                  aria-label="Customise slug"
                  title="Use a custom slug"
                >
                  <Pencil size={11} aria-hidden="true" />
                </button>
              </div>
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

      {/* ── 3. Embed snippet ──────────────────────────────────────────
       *
       * BD-3m — embed-mode toggle (Inline / Floating) sits above the
       * snippet. Inline (default) drops the legacy `<script>` + mount
       * `<div>` pair. Floating writes `data-mode="floating"` +
       * `data-position` and omits the mount div (the launcher is appended
       * to <body> by the script). Changing the toggle here ALSO patches
       * `style.floatingLauncher` so the Style tab + live preview reflect
       * the choice immediately — kept one-way to avoid feedback loops
       * (Style tab → InstallTab via useEffect above).
       */}
      <section className="qq-install-section" data-testid="install-section-embed">
        <h3 className="qq-install-h">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="install-section-embed"
                  text="Drop this script tag wherever you want the calculator to appear on your own site. The widget loads asynchronously and inherits your page styles. Switch to Floating launcher to dock a small icon in a corner of the page instead of placing the widget inline."
                />
                <span style={{ marginLeft: 6 }}>Embed snippet</span>
              </>
            }
          />
        </h3>

        {/* BD-3m — embed-mode toggle. Radio-style pair so both options
         *  stay visible. When Floating is picked the position dropdown
         *  appears beneath. Both controls also patch the canonical
         *  `style.floatingLauncher` slot via the StyleTab indirectly —
         *  the Style tab is the source of truth, so an explicit "Apply
         *  to Style" callback isn't needed (the snippet is what the
         *  user copies; the live runtime config reads from style). */}
        <div
          className="qq-install-mode"
          data-testid="install-embed-mode"
          role="radiogroup"
          aria-label="Embed mode"
        >
          <label
            className="qq-install-mode-opt"
            data-state={embedMode === 'inline' ? 'on' : 'off'}
          >
            <input
              type="radio"
              name="qq-install-embed-mode"
              value="inline"
              checked={embedMode === 'inline'}
              onChange={() => setEmbedMode('inline')}
              data-testid="install-embed-mode-inline"
            />
            <span className="qq-install-mode-opt-label">Inline</span>
            <span className="qq-install-mode-opt-hint">Renders where you drop the snippet.</span>
          </label>
          <label
            className="qq-install-mode-opt"
            data-state={embedMode === 'floating' ? 'on' : 'off'}
          >
            <input
              type="radio"
              name="qq-install-embed-mode"
              value="floating"
              checked={embedMode === 'floating'}
              onChange={() => setEmbedMode('floating')}
              data-testid="install-embed-mode-floating"
            />
            <span className="qq-install-mode-opt-label">Floating launcher</span>
            <span className="qq-install-mode-opt-hint">Icon docks in a corner; expands on click.</span>
          </label>
        </div>

        {embedMode === 'floating' && (
          <div
            className="qq-install-mode-position"
            data-testid="install-embed-mode-position-wrap"
          >
            <FloatField
              label="Launcher corner"
              htmlFor="qq-install-embed-position"
              variant="select"
              infoText="Which corner the launcher icon docks into. If the AI chat bubble lives in the same corner, the launcher automatically offsets 72px clear so the two affordances never overlap."
              infoTestid="install-embed-mode-position"
            >
              {/* CONFIG-NATIVE-SELECT-1 — was a native <select>; migrated to
                  StyledSelect so the OS sheet stops covering the wizard's
                  install panel on mobile. */}
              <StyledSelect
                value={embedPosition}
                onChange={(next) => setEmbedPosition(next as AdvFloatingLauncherPosition)}
                options={[
                  { value: 'bottom-right', label: 'Bottom right (default)' },
                  { value: 'bottom-left', label: 'Bottom left' },
                  { value: 'top-right', label: 'Top right' },
                  { value: 'top-left', label: 'Top left' },
                ]}
                title="Launcher corner"
                ariaLabel="Launcher corner"
                testId="install-embed-mode-position"
              />
            </FloatField>
          </div>
        )}

        <p className="qq-install-sub" style={{ marginTop: 8 }}>
          {embedMode === 'floating'
            ? 'Paste this snippet anywhere on your page — the launcher icon attaches itself to the body and stays in view as visitors scroll.'
            : 'Paste this snippet on your site where you want the calculator to appear.'}
        </p>
        <div className="qq-install-snippet-wrap">
          <pre
            className="qq-install-snippet"
            data-testid="install-embed-snippet"
            data-embed-mode={embedMode}
            data-embed-position={embedMode === 'floating' ? embedPosition : undefined}
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
       * digging into per-CMS instructions. Brand-blue panel.
       * BD-3j: explainer copy stays here; the CTA button itself was moved
       * out of this card into a sticky bottom-left action anchor (see the
       * .qq-install-cta-anchor at the end of this tabpanel). */}
      <section
        className="qq-install-section qq-install-doneforyou"
        data-testid="install-section-doneforyou"
      >
        <div className="qq-install-doneforyou-card">
          <div className="qq-install-doneforyou-copy">
            <h3 className="qq-install-doneforyou-h">
              {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
              <HelpCueRow
                className="!mb-0"
                cue={
                  <>
                    <InfoCue
                      testid="install-section-doneforyou"
                      text="Our team places the snippet on your website, configures the widget for your trade, and verifies leads flow into your inbox. Turnaround within 24 hours."
                    />
                    <span style={{ marginLeft: 6 }}>Don't want to install it yourself? We'll do it for $75.</span>
                  </>
                }
              />
            </h3>
            <p className="qq-install-doneforyou-sub">
              We install QuoteQuick on your website, configure it for your trade,
              and verify it's capturing leads — within 24 hours. Use the{' '}
              <strong>Have us install it</strong> button at the bottom of this
              tab to start.
            </p>
          </div>
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
        <h3 className="qq-install-h">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="install-section-guides"
                  text="Step-by-step walkthroughs for the most common site builders — pick yours for screenshots and copy-paste-ready instructions."
                />
                <span style={{ marginLeft: 6 }}>Platform install guides</span>
              </>
            }
          />
        </h3>
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

      {/* BD-3j Fix 3 — "Have us install it" CTA anchored at the bottom-left
       *  corner of the Install tab as a sticky action. Sits inside the
       *  scrollable left pane of the wizard editor; doesn't collide with
       *  the canvas-side zoom toolbar from BD-3b (the canvas is a separate
       *  right-pane container). */}
      <div className="qq-install-cta-anchor" aria-hidden="false">
        <button
          type="button"
          className="qq-install-doneforyou-cta"
          onClick={() => setInstallCheckoutOpen(true)}
          data-testid="install-doneforyou-cta"
        >
          Have us install it — $75
        </button>
      </div>

      <style>{`
        /* Wave AA — sector gaps tightened from 16 → 10 (and the sub-headline
           bottom-margin 10 → 6) so the Install tab reads as a cohesive panel
           rather than a sequence of disconnected slabs.
           W-AO-9 — further tightened 10 → 2px. The 1px .qq-install-divider
           already gives a visual seam between sections. */
        .qq-install-tab {
          display: flex; flex-direction: column; gap: 2px;
          /* BD-3j Fix 3 — reserve space at the bottom so the sticky
             "Have us install it" CTA never overlaps the last section. */
          padding-bottom: 72px;
          position: relative;
        }
        /* BD-3j Fix 3 — sticky CTA anchor at the bottom-LEFT of the
           Install tab's scrollable area. Doesn't conflict with BD-3b's
           zoom toolbar because that lives on the canvas (right pane) — the
           Install tab is the left pane. */
        .qq-install-cta-anchor {
          position: sticky;
          bottom: 12px;
          left: 0;
          margin-top: 12px;
          display: flex;
          justify-content: flex-start;
          align-items: center;
          z-index: 2;
          pointer-events: none;
        }
        .qq-install-cta-anchor > .qq-install-doneforyou-cta {
          pointer-events: auto;
        }
        .qq-install-h {
          font-size: 13px; font-weight: 700; color: ${p.colors.heading};
          margin: 0 0 1px; letter-spacing: -0.005em;
          /* W-AO-7 — inline-flex so the InfoCue trigger sits to the
           * immediate right of the heading text (top-left of the section). */
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qq-install-sub {
          font-size: 12px; color: ${p.colors.muted};
          margin: 0 0 8px; line-height: 1.4;
        }
        /* BD-3j Fix 2 — inline code now has a visible border so it doesn't
           blend with the near-white card surfaces around it. */
        .qq-install-code-inline {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11.5px; padding: 1px 5px; border-radius: 4px;
          background: #fff;
          color: ${p.colors.heading};
          border: 1px solid ${p.colors.border};
        }
        .qq-install-section { display: flex; flex-direction: column; }
        .qq-install-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 2px 0;
        }

        /* Hosted-link card — Wave O. Wave AO-10: position:relative so the
           floating "Live" corner badge anchors to this container.
           BD-3j Fix 2: switched from d.colors.canvas (#A2B6BF darker grey-
           blue, which made muted text inside fail WCAG AA) to a near-white
           cardMuted surface so all text/bg pairs hit ≥4.5:1. */
        .qq-install-hosted-card {
          position: relative;
          padding: 14px 16px;
          background: ${d.colors.cardMuted};
          border: 1px solid ${p.colors.border};
          border-radius: 12px;
          display: flex; flex-direction: column; gap: 10px;
        }
        /* BD-3j Fix 1 — Live pill floating at top-right corner of the
           hosted card, OUTSIDE the URL input. Smaller text (8.5px), tighter
           padding (1×6px), tucked into the corner (top:4, right:6). The dot
           keeps the pulsing motion at a reduced scale. */
        .qq-install-hosted-corner-badge {
          position: absolute;
          top: 4px;
          right: 6px;
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 8.5px; font-weight: 700;
          border-radius: 999px;
          padding: 1px 6px;
          line-height: 1.2;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
          z-index: 1;
        }
        .qq-install-hosted-corner-badge.is-live {
          color: #066138;
          background: rgba(34, 197, 94, 0.18);
          border: 1px solid rgba(34, 197, 94, 0.45);
        }
        .qq-install-hosted-corner-dot {
          display: inline-block;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #16a34a;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
          animation: qq-install-live-pulse 1.8s ease-out infinite;
        }
        @keyframes qq-install-live-pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
          70% { box-shadow: 0 0 0 5px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-install-hosted-corner-dot { animation: none; }
        }
        .qq-install-hosted-url-row {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          min-width: 0;
        }
        .qq-install-hosted-url-wrap {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .qq-install-hosted-url {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13.5px; font-weight: 700;
          color: ${p.colors.heading};
          padding: 6px 10px;
          /* Wave AO-10 — Live badge moved out of input; only need clearance
             for the pencil-edit button at right. */
          padding-right: 34px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 7px;
          word-break: break-all;
        }
        /* Wave P-F — custom-slug edit row + live availability hint. */
        .qq-install-hosted-edit-trigger {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px;
          background: transparent; border: 1px solid ${p.colors.border};
          border-radius: 6px;
          color: ${p.colors.muted}; cursor: pointer;
          margin-left: 0;
          flex-shrink: 0;
        }
        .qq-install-hosted-url-wrap .qq-install-hosted-edit-trigger {
          position: absolute;
          top: 4px;
          right: 6px;
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
        /* BD-3j Fix 2 — promoted from muted (#6B7280) to body (#374151) so
           status text reads cleanly against the hosted card. Body on
           cardMuted hits ~10:1 contrast (AA-large + AA-normal). */
        .qq-install-hosted-status {
          margin: 4px 0 0;
          font-size: 11.5px; line-height: 1.5;
          color: ${p.colors.body};
        }
        .qq-install-hosted-status.is-checking { color: ${p.colors.body}; font-style: italic; }
        .qq-install-hosted-status.is-ok { color: #066138; font-weight: 600; }
        .qq-install-hosted-status.is-warn { color: #8a5a0e; font-weight: 600; }
        .qq-install-hosted-status.is-muted { color: ${p.colors.body}; }
        /* AUDIT L5 — was light-theme-only status colors (dark green #066138 +
         * amber #8a5a0e). Add dark-mode pairs so the status reads cleanly on
         * the slate hosted card surface. Light values stay AA against the
         * existing white surface; dark values are the Tailwind-emerald-300 /
         * amber-300 family for contrast on slate-800. */
        .qq-editor-shell[data-theme="dark"] .qq-install-hosted-status.is-ok {
          color: #6ee7b7;
        }
        .qq-editor-shell[data-theme="dark"] .qq-install-hosted-status.is-warn {
          color: #fcd34d;
        }
        .qq-install-hosted-status-link {
          background: transparent; border: none; padding: 0;
          color: ${p.colors.accent}; font: inherit; font-weight: 600;
          cursor: pointer; text-decoration: underline;
        }
        .qq-install-hosted-status-link:hover { color: ${p.colors.accentDark ?? p.colors.accent}; }
        .qq-install-hosted-actions {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        /* Wave AO-10 — shorter CTAs (24px min-height, 4×10 padding, 11px). */
        .qq-install-hosted-copy,
        .qq-install-hosted-open {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 8px;
          font-size: 11px; font-weight: 700;
          cursor: pointer;
          min-height: 24px;
          line-height: 1.2;
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
        /* BD-3j Fix 2 — was muted (#6B7280) which dropped to ~3:1 on the
           old canvas bg. Body (#374151) on the new cardMuted bg is ~10:1. */
        .qq-install-hosted-foot {
          margin: 0;
          font-size: 11.5px; color: ${p.colors.body};
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
        /* BD-3j Fix 2 — code-block contrast. Was canvas (#A2B6BF) bg with
           body (#374151) text — ~5.5:1, technically AA but the code visually
           merged with the surrounding canvas. Promoted to a proper dark
           code block (#0f172a near-black bg, #f5f7fa light text) for
           ~14:1 contrast and clear separation from the panel. */
        .qq-install-snippet-wrap {
          position: relative;
          border: 1px solid #1e293b;
          border-radius: 10px;
          background: #0f172a;
          overflow: hidden;
        }
        /* Wave AO-11 — extra bottom-right padding on the snippet text so
           the absolutely-positioned Copy button never overlaps visible code. */
        .qq-install-snippet {
          margin: 0; padding: 12px 14px;
          padding-bottom: 44px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px; line-height: 1.55;
          color: #f5f7fa;
          white-space: pre-wrap; word-break: break-all;
          background: transparent;
          max-height: 220px; overflow: auto;
        }
        /* Wave AO-11 — Copy snippet button moved from top-right to
           bottom-right corner so it sits cleanly out of the way of the
           snippet content. Subtle by default; gains shadow on hover. */
        .qq-install-copy-btn {
          position: absolute; bottom: 8px; right: 8px;
          background: ${p.colors.accent}; color: #fff;
          font-size: 11px; font-weight: 700;
          border: none; border-radius: 6px; padding: 4px 10px;
          cursor: pointer;
          opacity: 0.92;
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          transition: opacity 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
          min-height: 24px;
          line-height: 1.2;
        }
        .qq-install-copy-btn:hover,
        .qq-install-copy-btn:focus-visible {
          opacity: 1;
          box-shadow: ${p.shadows.buttonHover};
        }
        .qq-install-copy-btn:active { transform: translateY(1px); }

        /* BD-3m — embed-mode radio pair. Sits above the snippet textarea.
           Each option is a card; the active one gets an accent border + tint.
           Two-up grid that collapses to 1-up on mobile (matches the platform
           guide grid pattern below). */
        .qq-install-mode {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin: 0 0 8px;
        }
        .qq-install-mode-opt {
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-rows: auto auto;
          gap: 2px 10px;
          align-items: center;
          padding: 10px 12px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-install-mode-opt[data-state="on"] {
          border-color: ${p.colors.accent};
          background: rgba(13, 60, 252, 0.06);
          box-shadow: 0 0 0 1px ${p.colors.accent} inset;
        }
        .qq-install-mode-opt input[type="radio"] {
          grid-row: 1 / span 2;
          align-self: center;
          margin: 0;
          accent-color: ${p.colors.accent};
        }
        .qq-install-mode-opt-label {
          font-size: 12.5px; font-weight: 700;
          color: ${p.colors.heading};
          line-height: 1.3;
        }
        .qq-install-mode-opt-hint {
          font-size: 11px; color: ${p.colors.muted};
          line-height: 1.35;
          grid-column: 2;
        }
        .qq-install-mode-position {
          margin: 0 0 8px;
        }

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

        /* Wave L I1 — done-for-you install panel. Brand-blue tinted card.
         * BD-3j: CTA moved out of this card to a sticky bottom-left anchor;
         * the card now holds only the explanatory copy and stacks naturally. */
        .qq-install-doneforyou-card {
          display: flex; flex-direction: column;
          gap: 6px;
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
          /* W-AO-7 — inline-flex so the InfoCue trigger sits adjacent to
           * the heading text (top-left of the panel). */
          display: inline-flex; align-items: center; gap: 6px;
          flex-wrap: wrap;
        }
        /* BD-3j Fix 2 — was muted (#6B7280) on a brand-blue-tinted bg
           which dropped to ~3.5:1. Body (#374151) lands ~7:1. */
        .qq-install-doneforyou-sub {
          margin: 0;
          font-size: 12px; color: ${p.colors.body};
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
          .qq-install-doneforyou-cta {
            min-height: 44px; font-size: 14px;
          }
          .qq-install-hosted-copy,
          .qq-install-hosted-open { min-height: 44px; font-size: 13px; }
          .qq-install-guide-grid { grid-template-columns: 1fr; }
          /* BD-3m — embed-mode pair collapses to 1-up on mobile. */
          .qq-install-mode { grid-template-columns: 1fr; }
          .qq-install-guide-card { min-height: 56px; }
        }
      `}</style>
    </div>
  );
}
