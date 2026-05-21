// Wave O — InstallGuideModal.
//
// Per-platform install walkthrough dialog opened from InstallTab.
// Replaces the previous inline 3-line tab list with a click-to-open modal
// per platform, carrying the same detail level as the public docs at
// /docs/embed (steps + tips + common-mistake callouts).
//
// Brand voice borrowed from `pages/marketing/docs/embed.tsx`:
// task-focused, conversational, assumes non-technical audience. Each
// platform has its own GUIDE entry with numbered steps and optional
// notes. Copy + snippet uses the existing platformTheme tokens.

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';

const p = platformTheme;
const d = dashboardTheme;

export type InstallGuideId =
  | 'wordpress-elementor'
  | 'wordpress-gutenberg'
  | 'wix'
  | 'squarespace'
  | 'shopify'
  | 'webflow'
  | 'html';

interface GuideStep {
  /** Action verb headline; the bold lead-in of each numbered step. */
  title: string;
  /** Plain copy expanded under the title. Can include a literal click-path. */
  body: string;
}

interface GuideNote {
  type: 'tip' | 'warn' | 'info';
  body: string;
}

interface PlatformGuide {
  id: InstallGuideId;
  label: string;
  icon: string;
  /** One-line lead-in shown under the title in the dialog. */
  lede: string;
  steps: GuideStep[];
  notes?: GuideNote[];
}

export const INSTALL_GUIDES: ReadonlyArray<PlatformGuide> = [
  {
    id: 'wordpress-elementor',
    label: 'WordPress · Elementor',
    icon: '📝',
    lede: 'Drop the calculator into any Elementor section using the HTML widget.',
    steps: [
      { title: 'Open the page in Elementor', body: 'In WordPress admin, open the page you want the calculator on and click "Edit with Elementor".' },
      { title: 'Add the HTML widget', body: 'In the left widget panel, search for "HTML" and drag the HTML widget onto the page where you want the calculator to appear.' },
      { title: 'Paste the embed snippet', body: 'Click the new widget. In its panel on the left, paste the embed snippet from the Install tab into the HTML Code field.' },
      { title: 'Update', body: 'Click "Update" at the bottom of the Elementor panel. The calculator loads on the live page within seconds.' },
    ],
    notes: [
      { type: 'tip', body: 'You can place multiple HTML widgets on the same page — the calculator loads only where you paste the snippet.' },
    ],
  },
  {
    id: 'wordpress-gutenberg',
    label: 'WordPress · Block Editor',
    icon: '🟦',
    lede: 'Use the Custom HTML block in the default WordPress block editor.',
    steps: [
      { title: 'Edit the page or post', body: 'From WordPress admin → Pages, open the page in the block editor.' },
      { title: 'Add a Custom HTML block', body: 'Click the "+" icon, type "Custom HTML", and select that block. (Important — not the Paragraph or HTML widget.)' },
      { title: 'Paste the snippet', body: 'Paste the embed snippet from the Install tab directly into the Custom HTML block.' },
      { title: 'Update', body: 'Click "Update" at the top right. The calculator appears on the live page immediately.' },
    ],
    notes: [
      { type: 'warn', body: 'Don\'t paste the script in the Visual editor of the Classic Editor plugin — switch to the Code editor view first, or use the Custom HTML block in the modern editor.' },
    ],
  },
  {
    id: 'wix',
    label: 'Wix',
    icon: '🔷',
    lede: 'Add an Embed HTML element from the Wix Add panel.',
    steps: [
      { title: 'Open your page in the Wix Editor', body: 'Click "Edit Site" from the Wix dashboard for the site you want the calculator on.' },
      { title: 'Add an Embed HTML element', body: 'Click "Add Elements" (+) → "Embed Code" → "Embed HTML". An empty HTML iframe element appears on the page.' },
      { title: 'Enter the code', body: 'Click the element, then "Enter Code". Paste the embed snippet from the Install tab into the dialog. Click "Update".' },
      { title: 'Resize and publish', body: 'Drag the corners of the HTML element so it\'s at least 600px tall — the calculator needs vertical room. Click "Publish" at the top right.' },
    ],
    notes: [
      { type: 'tip', body: 'Set the HTML element height to at least 600px so the multi-step calculator has room to display without scrolling inside the embed.' },
    ],
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    icon: '⬛',
    lede: 'Drop a Code block into the page and paste the snippet.',
    steps: [
      { title: 'Edit the page', body: 'In Squarespace admin, open the page you want the calculator on and click "Edit".' },
      { title: 'Add a Code block', body: 'Hover where you want the calculator, click the (+) icon, scroll to "More" and choose the "Code" block.' },
      { title: 'Paste the snippet (HTML mode)', body: 'Paste the embed snippet into the Code block. In the block\'s settings, make sure the dropdown is set to HTML (not Markdown).' },
      { title: 'Save', body: 'Click "Save" in the page editor. The calculator appears on the live page.' },
    ],
    notes: [
      { type: 'warn', body: 'The Code block defaults to Markdown on some templates — toggle it to HTML or the script tag is rendered as plain text.' },
    ],
  },
  {
    id: 'shopify',
    label: 'Shopify',
    icon: '🛍️',
    lede: 'Add the snippet inside a Custom Liquid section or a theme template.',
    steps: [
      { title: 'Open the theme code editor', body: 'In Shopify admin → Online Store → Themes, click the "…" menu next to your live theme and choose "Edit code".' },
      { title: 'Pick the right template', body: 'Open the section or page template where the calculator should appear (e.g. sections/custom-liquid.liquid, or a specific page template).' },
      { title: 'Paste the snippet', body: 'Paste the embed snippet from the Install tab inline with the HTML for that template, where you want the calculator to render.' },
      { title: 'Save', body: 'Click "Save" in the top right. The calculator goes live immediately on your storefront.' },
    ],
    notes: [
      { type: 'info', body: 'Prefer a no-code option? Add a "Custom Liquid" section from the theme editor and paste the snippet — no template editing required.' },
    ],
  },
  {
    id: 'webflow',
    label: 'Webflow',
    icon: '🌊',
    lede: 'Use the Embed component on any page.',
    steps: [
      { title: 'Open the page in Designer', body: 'In Webflow, open the project and the page where you want the calculator.' },
      { title: 'Drag in an Embed component', body: 'From the Add panel (Add menu → "Components" or "Elements"), drag the "Embed" element onto your page.' },
      { title: 'Paste the snippet', body: 'A code dialog opens — paste the embed snippet from the Install tab. Click "Save & Close".' },
      { title: 'Publish', body: 'Click "Publish" in the top right of the Designer and confirm the domain(s) to publish to.' },
    ],
    notes: [
      { type: 'tip', body: 'Custom code on the free Webflow plan only runs on the *.webflow.io staging site. Embed code via the Embed element works on any plan and any domain.' },
    ],
  },
  {
    id: 'html',
    label: 'Plain HTML / static site',
    icon: '🧾',
    lede: 'Paste the snippet anywhere inside your <body> tag.',
    steps: [
      { title: 'Open the file', body: 'Open the .html file (or your template) where the calculator should appear, in your editor of choice.' },
      { title: 'Paste the snippet inside <body>', body: 'Paste the embed snippet from the Install tab anywhere between the opening <body> and closing </body> tags, exactly where you want the calculator to render.' },
      { title: 'Upload', body: 'Save the file and upload it to your server (FTP, your hosting dashboard, a static-site deploy command — whatever you normally use).' },
    ],
    notes: [
      { type: 'info', body: 'The snippet works with any static-site generator (Hugo, Astro, 11ty, plain HTML) and any host (Netlify, Vercel, Cloudflare Pages, classic shared hosting).' },
    ],
  },
];

interface Props {
  /** Controlled — the dialog is open whenever this is non-null. */
  activeId: InstallGuideId | null;
  onClose: () => void;
  /** The same embed snippet the InstallTab shows — passed through so the
   *  modal can include a final "Copy snippet" CTA without recomputing it. */
  snippet: string;
}

export default function InstallGuideModal({ activeId, onClose, snippet }: Props) {
  const guide = activeId ? INSTALL_GUIDES.find((g) => g.id === activeId) ?? null : null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeId) setCopied(false);
  }, [activeId]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
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
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard is convenience */ }
  };

  // Root cause of "Install tab freezes on any click" (May 2026):
  //   The wizard root (.wizard-shell-modal) is z-index: 1000. Our previous
  //   shadcn <Dialog> wrapper renders its overlay + content at z-index: 50
  //   — so when a guide card was clicked, Radix opened the modal *behind*
  //   the wizard (invisible to the user) and `react-remove-scroll` set
  //   `pointer-events: none` on every body child outside the portal,
  //   including the wizard. Result: the user saw no dialog and every
  //   subsequent click on the wizard did nothing — i.e. "frozen".
  //
  // Fix: render the Radix primitives directly with explicit z-index above
  //   the wizard shell (1300, matching the wizard's other internal
  //   overlays in PreviewPane/TemplateGallery) so the dialog paints on
  //   top and the click-shield is consistent with what the user sees.
  return (
    <DialogPrimitive.Root open={!!guide} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="qq-install-guide-overlay"
          data-testid="install-guide-modal-overlay"
        />
        <DialogPrimitive.Content
          className="qq-install-guide-dialog"
          data-testid="install-guide-modal"
          data-platform={guide?.id ?? ''}
        >
          <DialogPrimitive.Title className="qq-install-guide-modal-sr-title">
            {guide?.label ?? 'Install guide'}
          </DialogPrimitive.Title>
          {guide && (
          <div className="qq-install-guide-modal-body">
            <header className="qq-install-guide-modal-header">
              <span aria-hidden="true" className="qq-install-guide-modal-icon">{guide.icon}</span>
              <div>
                <h2 className="qq-install-guide-modal-title">{guide.label}</h2>
                <p className="qq-install-guide-modal-lede">{guide.lede}</p>
              </div>
            </header>
            <ol className="qq-install-guide-modal-steps">
              {guide.steps.map((s, i) => (
                <li key={i} className="qq-install-guide-modal-step">
                  <div className="qq-install-guide-modal-step-n" aria-hidden="true">{i + 1}</div>
                  <div className="qq-install-guide-modal-step-text">
                    <div className="qq-install-guide-modal-step-title">{s.title}</div>
                    <div className="qq-install-guide-modal-step-body">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
            {guide.notes && guide.notes.length > 0 && (
              <div className="qq-install-guide-modal-notes">
                {guide.notes.map((n, i) => (
                  <div
                    key={i}
                    className={`qq-install-guide-modal-note is-${n.type}`}
                    data-note-type={n.type}
                  >
                    <strong>
                      {n.type === 'tip' ? 'Tip' : n.type === 'warn' ? 'Common mistake' : 'Note'}:
                    </strong>{' '}
                    {n.body}
                  </div>
                ))}
              </div>
            )}
            <footer className="qq-install-guide-modal-footer">
              <button
                type="button"
                onClick={handleCopy}
                className="qq-install-guide-modal-copy"
                data-testid="install-guide-modal-copy"
              >
                {copied ? 'Snippet copied' : 'Copy embed snippet'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="qq-install-guide-modal-close"
                data-testid="install-guide-modal-done"
              >
                Done
              </button>
            </footer>
          </div>
          )}
          <DialogPrimitive.Close
            className="qq-install-guide-modal-x"
            aria-label="Close"
            data-testid="install-guide-modal-x"
          >
            <X size={16} aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <style>{`
          .qq-install-guide-modal-body {
            display: flex; flex-direction: column; gap: 14px;
          }
          .qq-install-guide-modal-header {
            display: flex; align-items: flex-start; gap: 12px;
            padding-right: 36px; /* room for Radix close X */
          }
          .qq-install-guide-modal-icon {
            font-size: 26px; line-height: 1;
            display: inline-flex; align-items: center; justify-content: center;
            width: 40px; height: 40px;
            border-radius: 10px;
            background: ${d.colors.canvas};
            border: 1px solid ${p.colors.borderLight};
            flex-shrink: 0;
          }
          .qq-install-guide-modal-title {
            margin: 0 0 2px;
            font-size: 16px; font-weight: 800;
            color: ${p.colors.heading};
            letter-spacing: -0.01em;
          }
          .qq-install-guide-modal-lede {
            margin: 0;
            font-size: 13px; color: ${p.colors.muted};
            line-height: 1.5;
          }
          .qq-install-guide-modal-steps {
            list-style: none;
            margin: 0; padding: 0;
            display: flex; flex-direction: column; gap: 12px;
          }
          .qq-install-guide-modal-step {
            display: flex; align-items: flex-start; gap: 12px;
            padding: 12px 12px 12px 10px;
            background: ${d.colors.canvas};
            border: 1px solid ${p.colors.borderLight};
            border-radius: 10px;
          }
          .qq-install-guide-modal-step-n {
            flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            width: 22px; height: 22px;
            background: ${p.colors.accent}; color: #fff;
            font-size: 11.5px; font-weight: 800;
            border-radius: 999px;
            margin-top: 1px;
          }
          .qq-install-guide-modal-step-text { flex: 1; min-width: 0; }
          .qq-install-guide-modal-step-title {
            font-size: 13.5px; font-weight: 700;
            color: ${p.colors.heading};
            margin-bottom: 3px;
            letter-spacing: -0.005em;
          }
          .qq-install-guide-modal-step-body {
            font-size: 12.5px; color: ${p.colors.body};
            line-height: 1.55;
          }
          .qq-install-guide-modal-notes {
            display: flex; flex-direction: column; gap: 8px;
          }
          .qq-install-guide-modal-note {
            padding: 10px 12px;
            border-radius: 8px;
            font-size: 12.5px; line-height: 1.5;
            color: ${p.colors.body};
          }
          .qq-install-guide-modal-note.is-tip {
            background: rgba(13,60,252,0.06);
            border: 1px solid rgba(13,60,252,0.18);
          }
          .qq-install-guide-modal-note.is-warn {
            background: rgba(255,176,32,0.10);
            border: 1px solid rgba(255,176,32,0.30);
          }
          .qq-install-guide-modal-note.is-info {
            background: ${d.colors.canvas};
            border: 1px solid ${p.colors.borderLight};
          }
          .qq-install-guide-modal-footer {
            display: flex; gap: 8px; justify-content: flex-end;
            padding-top: 4px;
          }
          .qq-install-guide-modal-copy {
            background: ${p.colors.accent}; color: #fff;
            border: none; border-radius: 8px;
            padding: 9px 14px;
            font-size: 13px; font-weight: 700;
            cursor: pointer;
            box-shadow: ${p.shadows.button};
            transition: box-shadow 0.12s ease, transform 0.06s ease;
            min-height: 38px;
          }
          .qq-install-guide-modal-copy:hover { box-shadow: ${p.shadows.buttonHover}; }
          .qq-install-guide-modal-copy:active { transform: translateY(1px); }
          .qq-install-guide-modal-close {
            background: transparent; color: ${p.colors.body};
            border: 1px solid ${p.colors.border}; border-radius: 8px;
            padding: 9px 14px;
            font-size: 13px; font-weight: 600;
            cursor: pointer;
            min-height: 38px;
          }
          .qq-install-guide-modal-close:hover { background: ${d.colors.canvas}; }

          /* Wave R-pre G — base positioning + z-index for the bespoke
             Radix portal. Previously inherited from the shadcn DialogContent
             wrapper, which set z-index: 50 — invisible behind the wizard
             root (.wizard-shell-modal, z-index: 1000) and triggering the
             "Install tab freezes on any click" bug because Radix's
             react-remove-scroll then pointer-events:none'd the wizard while
             the modal was open. Now rendered at z-index 1300, matching
             AddFieldMenu / TemplateGallery overlays. */
          .qq-install-guide-overlay {
            position: fixed; inset: 0; z-index: 1300;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
          }
          .qq-install-guide-overlay[data-state="open"] {
            animation: qq-install-guide-fade-in 160ms ease-out;
          }
          .qq-install-guide-dialog {
            position: fixed;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%);
            z-index: 1301;
            width: calc(100vw - 32px);
            max-width: 560px;
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            padding: 22px 22px 18px;
            background: #fff;
            border-radius: 14px;
            border: 1px solid ${p.colors.borderLight};
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
          }
          .qq-install-guide-dialog[data-state="open"] {
            animation: qq-install-guide-pop-in 160ms ease-out;
          }
          @keyframes qq-install-guide-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes qq-install-guide-pop-in {
            from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
            to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
          /* The Radix Title carries the dialog's aria label but is visually
             redundant (we have a styled <h2> in the body). Hide it from
             sighted users while keeping it in the a11y tree. */
          .qq-install-guide-modal-sr-title {
            position: absolute;
            width: 1px; height: 1px;
            padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0,0,0,0);
            white-space: nowrap; border: 0;
          }
          .qq-install-guide-modal-x {
            position: absolute;
            top: 14px; right: 14px;
            display: inline-flex; align-items: center; justify-content: center;
            width: 28px; height: 28px;
            border-radius: 8px;
            background: transparent;
            border: 1px solid transparent;
            color: ${p.colors.muted};
            cursor: pointer;
            transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
          }
          .qq-install-guide-modal-x:hover {
            background: ${d.colors.canvas};
            color: ${p.colors.heading};
            border-color: ${p.colors.border};
          }
          @media (max-width: 600px) {
            .qq-install-guide-dialog {
              max-width: calc(100vw - 16px);
              padding: 18px 16px 14px;
            }
            .qq-install-guide-modal-copy,
            .qq-install-guide-modal-close { min-height: 44px; font-size: 14px; }
            .qq-install-guide-modal-x { width: 36px; height: 36px; }
          }
        `}</style>
    </DialogPrimitive.Root>
  );
}
