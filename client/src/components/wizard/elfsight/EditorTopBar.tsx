// EditorTopBar — Elfsight-clone editor top bar (Wave H1 → BH-2 → BH-5 →
// P2 chrome-fixes 2026-05-22 → tabs-back-to-top 2026-05-22).
//
// 2026-05-22 (revert of PR #535) — Tabs RELOCATED back into the top chrome.
// PR #535 had moved them to a new EditorBottomBar; the "they don't fit"
// complaint that motivated that move is solved here by tightening the tab
// pill sizing (10-11px font / 6px vertical padding / 12px horizontal /
// font-weight 500) and keeping the horizontal-scroll fallback from PR #504.
// The bottom navbar component (EditorBottomBar.tsx) was deleted.
//
// BH-5 — Undo/Redo moved to the right cluster, adjacent to the device
// preset switcher, and the active-tab pill now uses solid brand blue with
// white text (Option A) so the label stays legible in both editor themes.
//
// Layout (left→right):
//
//   brand · | · undo · redo · tabs (scrollable) · spacer · saved ·
//   | · device · launcher · | · theme · help · fold · close
//
// Below 1024px the brand drops its wordmark (icon only). Device /
// undo-redo / save / theme / close stay visible at all widths >= 480px.
// The phone breakpoint (<= 480px) still hides the device preset switcher
// (BH-1) since the user editing on a phone IS on a phone — undo/redo
// collapse with it. Tabs themselves remain horizontal-scrollable on phone
// (the BH-3 mobile bottom sheet is for property panels, not tabs).
//
// Brand styling only — no Elfsight colours. Accent comes from platformTheme.
// All testids stable: quotequick-close, preview-device-desktop,
// preview-device-mobile, editor-floating-launcher-toggle, editor-fold-toggle,
// editor-theme-toggle, editor-undo, editor-redo, editor-tabs,
// editor-tab-build, editor-tab-style, editor-tab-settings, editor-tab-install.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HelpCircle, Minimize2, Monitor, Moon, PanelRightClose, PanelRightOpen,
  Redo2, Smartphone, Sun, Tablet, Undo2, X,
} from 'lucide-react';
import { AE } from './appleEditor';
// Phase 0b — EDITOR_TABS is no longer rendered here; the section nav moved to
// the left icon rail in WizardShell. The EditorTab type is still imported for
// the (still-accepted) activeTab / onTabChange props.
import { type EditorTab, type EditorTheme, type PreviewDevice } from './types';

interface Props {
  justSaved?: boolean;
  device: PreviewDevice;
  onDeviceChange: (d: PreviewDevice) => void;
  /** Wave J — current editor chrome theme. */
  editorTheme: EditorTheme;
  /** Wave J — flip the chrome theme. */
  onEditorThemeChange: (t: EditorTheme) => void;
  /** DEPRECATED (2026-06-04) — the top-bar Help button now opens a
   *  self-contained popover owned by EditorTopBar (with Escape + backdrop +
   *  click-outside dismissal) instead of the WizardShell `showHelp` overlay,
   *  which was a focus/click trap with no Escape handler. The prop is still
   *  accepted so the WizardShell call site stays type-valid; it is no longer
   *  invoked by the top-bar button. (Other entry points — e.g. the mobile
   *  action bar — may still call it.) */
  onHelp?: () => void;
  onClose: () => void;
  /** IA-1 (2026-05-22) — minimize the WHOLE wizard back to the
   *  dashboard the user came from. A floating "QQ" badge appears on
   *  that dashboard so they can resume editing in one click. If absent
   *  the minimize button isn't rendered (e.g. embed mode). */
  onMinimize?: () => void;
  /** BD-3a fix 1 — Undo/Redo wired to a draft-config history stack. */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** BH-2 — preview fold/unfold (formerly on the standalone tab bar). */
  previewCollapsed?: boolean;
  onTogglePreview?: () => void;
  /** DEPRECATED (2026-06-04) — the "Preview as bubble" toggle was removed
   *  from the top bar (it hogged ~151px and squeezed the right cluster).
   *  These props are still accepted so the WizardShell call site stays
   *  type-valid, but they are intentionally ignored / unrendered. The
   *  floating-launcher preview lens itself still lives in PreviewPane and
   *  WizardShell state — only its top-bar entry point is gone. */
  floatingLauncherPreview?: boolean;
  onToggleFloatingLauncherPreview?: () => void;
  /** Revert of PR #535 — wizard tab strip lives in the top chrome again. */
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
}

export default function EditorTopBar({
  justSaved, device, onDeviceChange,
  editorTheme, onEditorThemeChange,
  onClose, onMinimize,
  canUndo = false, canRedo = false, onUndo, onRedo,
  previewCollapsed = false, onTogglePreview,
  // onHelp intentionally NOT destructured — the top-bar Help button now drives
  // a self-contained popover (see `helpOpen` below) instead of the WizardShell
  // overlay, so Escape / backdrop / click-outside all close it reliably.
  // floatingLauncherPreview / onToggleFloatingLauncherPreview intentionally
  // NOT destructured — the "Preview as bubble" button was removed (2026-06-04).
  activeTab, onTabChange,
}: Props) {
  const nextTheme: EditorTheme = editorTheme === 'dark' ? 'light' : 'dark';
  const ThemeIcon = editorTheme === 'dark' ? Sun : Moon;

  // 2026-06-04 — self-contained Help popover. The previous implementation
  // called `onHelp()` which flipped WizardShell's `showHelp` overlay: that
  // overlay had NO Escape handler and, because it's a fixed inset:0 layer at
  // z-index 1100, it captured every pointer event until dismissed. We replace
  // it with a local modal that closes on (a) Escape, (b) backdrop click, and
  // (c) the explicit "Got it" button. Rendered via a portal to document.body
  // so the wizard-shell-modal's transform doesn't reparent its fixed layer.
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setHelpOpen(false);
      }
    };
    // Capture phase so this wins even if an ancestor also listens for Escape.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [helpOpen]);
  // BD-3a fix 1 — Mac-style shortcut label is purely cosmetic; the keyboard
  // listener in WizardShell handles both ⌘ and Ctrl.
  const isMac = typeof navigator !== 'undefined'
    && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';
  return (
    <div className="qq-editor-topbar" data-testid="editor-top-bar">
      <a href="/" className="qq-editor-brand" aria-label="WeFixTrades home">
        <img
          src="/favicon.svg"
          alt=""
          style={{ width: 16, height: 16 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="qq-editor-brand-label">QuoteQuick</span>
      </a>

      <span className="qq-editor-divider" aria-hidden="true" />

      {/* BH-5 — Undo / Redo. Sits adjacent to the brand on the left so the
       *  history pair anchors the tab strip on the right of it. Disabled
       *  until the stack has entries. */}
      <div className="qq-editor-group" role="group" aria-label="History">
        <button
          type="button"
          onClick={() => onUndo && onUndo()}
          disabled={!canUndo}
          className="qq-editor-icon-btn qq-editor-history-btn"
          data-testid="editor-undo"
          aria-label="Undo"
          title={`Undo (${modKey}Z)`}
        >
          <Undo2 style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onRedo && onRedo()}
          disabled={!canRedo}
          className="qq-editor-icon-btn qq-editor-history-btn"
          data-testid="editor-redo"
          aria-label="Redo"
          title={`Redo (${modKey}⇧Z)`}
        >
          <Redo2 style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
      </div>

      {/* Phase 0b (2026-06-05) — the wizard section tabs (Build · Style ·
       *  Settings · Install) MOVED OUT of the top chrome into a left vertical
       *  ICON RAIL (Elfsight-style), rendered by WizardShell as the first
       *  column of the desktop editor frame. The top bar no longer renders
       *  the pill strip. The activeTab / onTabChange props are still accepted
       *  (the rail in WizardShell drives the same state) so the parent call
       *  site stays type-valid. The editor-tabs tablist + editor-tab-(id)
       *  testids now live on the rail buttons. */}

      <div className="qq-editor-spacer" aria-hidden="true" />

      <span
        className="qq-editor-saved"
        data-testid="editor-saved-state"
        style={{ opacity: justSaved ? 1 : 0 }}
      >
        ✓ Saved
      </span>

      <span className="qq-editor-divider" aria-hidden="true" />

      {/* BH-1 — device preset switcher. Three presets (1280 / 768 / 375).
       *  Hidden on phone-sized wizard windows (<= 480px) — a user editing
       *  on their phone doesn't need a device-preset switcher. */}
      <div className="qq-editor-device" data-testid="editor-device-toggle">
        {([
          ['desktop', Monitor, 'Desktop'],
          ['tablet', Tablet, 'Tablet'],
          ['mobile', Smartphone, 'Mobile'],
        ] as const).map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            data-testid={`preview-device-${mode}`}
            onClick={() => onDeviceChange(mode)}
            aria-label={`${label} preview`}
            aria-pressed={device === mode}
            title={`${label} preview`}
            style={{ background: device === mode ? AE.color.bg : 'transparent' }}
          >
            <Icon
              style={{
                width: 14, height: 14,
                color: device === mode ? AE.color.accent : AE.color.secondary,
              }}
            />
          </button>
        ))}
      </div>

      {/* 2026-06-04 — the "Preview as bubble" toggle was removed from the top
       *  bar. It consumed ~151px (16px icon + visible label + pill padding)
       *  and squeezed the right-side controls (theme · help · fold · close)
       *  at common editor widths. The floating-launcher preview lens still
       *  exists in PreviewPane / WizardShell state; only this redundant
       *  top-bar entry point is gone. */}

      <span className="qq-editor-divider" aria-hidden="true" />

      <div className="qq-editor-group" role="group" aria-label="Tools">
        <button
          type="button"
          onClick={() => onEditorThemeChange(nextTheme)}
          className="qq-editor-icon-btn"
          data-testid="editor-theme-toggle"
          data-theme-state={editorTheme}
          aria-label={`Switch editor to ${nextTheme} mode`}
          title={`Switch to ${nextTheme} mode`}
        >
          <ThemeIcon style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="qq-editor-icon-btn"
          data-testid="editor-help"
          aria-label="Help"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          title="Help"
        >
          <HelpCircle style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>

        {onTogglePreview && (
          <button
            type="button"
            className={`qq-editor-icon-btn qq-editor-fold${previewCollapsed ? ' is-collapsed' : ''}`}
            onClick={onTogglePreview}
            data-testid="editor-fold-toggle"
            data-collapsed={previewCollapsed ? 'true' : 'false'}
            aria-pressed={previewCollapsed}
            aria-label={previewCollapsed ? 'Show preview pane' : 'Hide preview pane'}
            title={previewCollapsed ? 'Show preview' : 'Hide preview'}
          >
            {previewCollapsed ? (
              <PanelRightOpen style={{ width: 14, height: 14 }} aria-hidden="true" />
            ) : (
              <PanelRightClose style={{ width: 14, height: 14 }} aria-hidden="true" />
            )}
          </button>
        )}

        {/* IA-1 (2026-05-22) — minimize the whole wizard back to the
         *  user's dashboard. Distinct from the "Floating" launcher
         *  preview toggle above (that one previews how visitors see
         *  the widget; this one collapses the wizard itself). On the
         *  destination dashboard a floating "QQ" badge appears so the
         *  user can resume editing in one click. */}
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            className="qq-editor-icon-btn"
            data-testid="quotequick-minimize"
            aria-label="Minimize wizard to dashboard"
            title="Minimize to dashboard"
          >
            <Minimize2 style={{ width: 14, height: 14 }} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="qq-editor-icon-btn"
          data-testid="quotequick-close"
          aria-label="Close QuoteQuick"
          title="Close"
        >
          <X style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
      </div>

      {/* 2026-06-04 — self-contained Help modal (replaces the WizardShell
       *  trap overlay). Portaled to <body> so the wizard-shell-modal's
       *  open-animation transform doesn't reparent this fixed layer.
       *  Dismissal: Escape (capture-phase listener above), backdrop click,
       *  or the "Got it" button. data-theme mirrors the editor chrome so the
       *  card reads correctly in both light and dark mode. */}
      {helpOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="qq-editor-help"
          role="dialog"
          aria-modal="true"
          aria-label="Editor help"
          data-theme={editorTheme}
          data-testid="editor-help-overlay"
          onClick={closeHelp}
        >
          <div
            className="qq-editor-help-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: AE.color.text }}>
              QuoteQuick editor
            </p>
            <p style={{ fontSize: 13, color: AE.color.secondary, margin: '8px 0 0', lineHeight: 1.5 }}>
              Build your calculator on the left, preview it live on the right.
              Use the tabs to switch between Build, Style, Settings, and Install.
              Press Esc or click outside this box to close.
            </p>
            <button
              type="button"
              onClick={closeHelp}
              data-testid="editor-help-dismiss"
              className="qq-editor-btn"
              style={{ marginTop: 14 }}
              autoFocus
            >
              Got it
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
