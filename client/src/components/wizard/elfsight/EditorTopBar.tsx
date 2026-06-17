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

import { useCallback, useState } from 'react';
import {
  CheckCircle2, CloudUpload, HelpCircle, Minimize2,
  Monitor, Moon, PanelRightClose, PanelRightOpen, Redo2, Smartphone, Sun,
  Tablet, Undo2, X,
} from 'lucide-react';
import { AE } from './appleEditor';
import HelpModal from './HelpModal';
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
  /** Elfsight-mobile rebuild (2026-06-05) — when true, the top bar renders a
   *  STRIPPED mobile chrome (close ✕ + editable name + autosave indicator +
   *  Publish) and nothing else. Desktop (false/undefined) renders the full
   *  chrome below, unchanged. */
  mobile?: boolean;
  /** Mobile top bar — the editable calculator/business name. */
  businessName?: string;
  onBusinessNameChange?: (v: string) => void;
  /** Mobile top bar — the primary commit action (mapped to Save draft). */
  onPublish?: () => void;
  /** Mobile top bar — Publish busy state (shows "Publishing…"). */
  isPublishing?: boolean;
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
  mobile = false,
  businessName, onBusinessNameChange,
  onPublish, isPublishing = false,
}: Props) {
  const nextTheme: EditorTheme = editorTheme === 'dark' ? 'light' : 'dark';
  const ThemeIcon = editorTheme === 'dark' ? Sun : Moon;

  // 2026-06-04 — self-contained Help popover (2026-06-12: extracted to the
  // shared <HelpModal>, which now owns the portal + Escape/backdrop
  // dismissal). The top bar only keeps the open flag.
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  // BD-3a fix 1 — Mac-style shortcut label is purely cosmetic; the keyboard
  // listener in WizardShell handles both ⌘ and Ctrl.
  const isMac = typeof navigator !== 'undefined'
    && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // ── Elfsight-mobile rebuild (2026-06-05) — clean mobile top bar ──────
  // Exactly three things, far-left → far-right: close ✕ · editable name +
  // autosave indicator · Publish. No tabs, no undo/redo, no theme/fold/device
  // icons — those move to the bottom tab bar (nav) or stay in state only. The
  // desktop chrome below is untouched; this branch only fires when mobile.
  if (mobile) {
    return (
      <div
        className="qq-editor-topbar--mobile"
        data-testid="editor-top-bar"
      >
        <button
          type="button"
          onClick={onClose}
          className="qq-mtopbar-close"
          data-testid="quotequick-close"
          aria-label="Close QuoteQuick"
          title="Close"
        >
          <X style={{ width: 24, height: 24 }} aria-hidden="true" />
        </button>

        <div className="qq-mtopbar-name">
          <input
            type="text"
            className="qq-mtopbar-name-input"
            data-testid="editor-mobile-name"
            value={businessName ?? ''}
            placeholder="Untitled calculator"
            onChange={(e) => onBusinessNameChange?.(e.target.value)}
            aria-label="Calculator name"
            spellCheck={false}
          />
          {/* Autosave indicator — cloud when idle, check when just saved. The
              existing `justSaved` flag drives the swap. */}
          <span
            className="qq-mtopbar-autosave"
            data-testid="editor-saved-state"
            data-saved={justSaved ? 'true' : 'false'}
            aria-label={justSaved ? 'Saved' : 'Autosave on'}
            title={justSaved ? 'Saved' : 'Changes save automatically'}
          >
            {justSaved
              ? <CheckCircle2 style={{ width: 20, height: 20 }} aria-hidden="true" />
              : <CloudUpload style={{ width: 20, height: 20 }} aria-hidden="true" />}
          </span>
        </div>

        {/* Restore (2026-06-05) — subtle undo / redo + day-night editor-theme
            toggle. Quiet icon buttons sit BETWEEN the autosave indicator and
            the prominent Publish action. Same handlers / aria-labels as the
            desktop branch; disabled (greyed + aria-disabled) when the history
            stack is empty. */}
        <div className="qq-mtopbar-tools" role="group" aria-label="Editor tools">
          <button
            type="button"
            onClick={() => onUndo && onUndo()}
            disabled={!canUndo}
            aria-disabled={!canUndo}
            className="qq-mtopbar-tool-btn"
            data-testid="editor-undo"
            aria-label="Undo"
            title={`Undo (${modKey}Z)`}
          >
            <Undo2 style={{ width: 19, height: 19 }} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onRedo && onRedo()}
            disabled={!canRedo}
            aria-disabled={!canRedo}
            className="qq-mtopbar-tool-btn"
            data-testid="editor-redo"
            aria-label="Redo"
            title={`Redo (${modKey}⇧Z)`}
          >
            <Redo2 style={{ width: 19, height: 19 }} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onEditorThemeChange(nextTheme)}
            className="qq-mtopbar-tool-btn"
            data-testid="editor-theme-toggle"
            data-theme-state={editorTheme}
            aria-label={`Switch editor to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode`}
          >
            <ThemeIcon style={{ width: 19, height: 19 }} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onPublish?.()}
          disabled={isPublishing}
          className="qq-mtopbar-publish"
          data-testid="quotequick-publish"
        >
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>

        <style>{`
          @media (max-width: 768px) {
            .qq-editor-topbar--mobile {
              display: flex; align-items: center; gap: 10px;
              padding: 6px 12px;
              min-height: 64px;
              /* nav-distinction (Alex 2026-06-17) — the white top bar used to
                 melt into the white preview canvas below it (only a faint
                 hairline between them). It now reads as a distinct ELEVATED
                 chrome layer: a faint cool tint (so the bar is no longer the
                 same pure white as the canvas), a defined stronger hairline, and
                 a soft downward shadow so it visibly floats above the canvas —
                 clearer layout scanning (top chrome ▸ canvas ▸ bottom sheet). */
              background: ${AE.color.surface};
              border-bottom: 1px solid ${AE.color.hairlineStrong};
              box-shadow: 0 3px 12px rgba(0,0,0,0.06);
              font-family: ${AE.font.family};
              /* Stays pinned to the top of the editor frame above the preview.
                 z-index above the sheet (9998) + backdrop (9997) so the close
                 ✕ / name / Publish stay reachable while a panel is open. */
              position: sticky; top: 0;
              z-index: 10000;
              flex-shrink: 0;
            }
            .qq-mtopbar-close {
              flex-shrink: 0;
              display: inline-flex; align-items: center; justify-content: center;
              width: 40px; height: 40px; padding: 0;
              background: transparent; border: none; cursor: pointer;
              color: ${AE.color.text};
              border-radius: ${AE.radius.md};
            }
            .qq-mtopbar-close:active { background: ${AE.color.surfaceHover}; }
            .qq-mtopbar-name {
              flex: 1 1 auto; min-width: 0;
              display: flex; align-items: center; gap: 6px;
            }
            .qq-mtopbar-name-input {
              flex: 0 1 auto; min-width: 0;
              max-width: 100%;
              border: none; background: transparent;
              font-family: ${AE.font.family};
              font-size: 17px; font-weight: 600;
              color: ${AE.color.text};
              padding: 4px 2px;
              text-overflow: ellipsis;
            }
            .qq-mtopbar-name-input::placeholder { color: ${AE.color.secondary}; }
            .qq-mtopbar-name-input:focus {
              outline: none;
              box-shadow: ${AE.shadow.focus};
              border-radius: ${AE.radius.sm};
            }
            .qq-mtopbar-autosave {
              flex-shrink: 0;
              display: inline-flex; align-items: center; justify-content: center;
              color: ${AE.color.secondary};
            }
            .qq-mtopbar-autosave[data-saved="true"] { color: ${AE.color.success}; }
            .qq-mtopbar-tools {
              flex-shrink: 0;
              display: inline-flex; align-items: center; gap: 2px;
            }
            .qq-mtopbar-tool-btn {
              flex-shrink: 0;
              display: inline-flex; align-items: center; justify-content: center;
              width: 32px; height: 32px; padding: 0;
              background: transparent; border: none; cursor: pointer;
              color: ${AE.color.secondary};
              border-radius: ${AE.radius.sm};
              transition: background 0.12s ease;
            }
            .qq-mtopbar-tool-btn:hover:not(:disabled) { background: ${AE.color.surfaceHover}; }
            .qq-mtopbar-tool-btn:active:not(:disabled) { background: ${AE.color.surfaceHover}; }
            .qq-mtopbar-tool-btn:disabled {
              opacity: 0.4; cursor: not-allowed;
            }
            /* Narrow phones — shrink the tap target so the trio never
               overlaps the Publish button. */
            @media (max-width: 380px) {
              .qq-mtopbar-tool-btn { width: 28px; height: 28px; }
            }
            .qq-mtopbar-publish {
              flex-shrink: 0;
              min-height: 44px; padding: 0 22px;
              background: ${AE.color.accent};
              color: ${AE.color.publishText};
              border: none; border-radius: ${AE.radius.md};
              font-family: ${AE.font.family};
              font-size: 15px; font-weight: 600;
              cursor: pointer;
              transition: background 0.12s ease;
            }
            .qq-mtopbar-publish:active:not(:disabled) { background: ${AE.color.accentHover}; }
            .qq-mtopbar-publish:disabled { opacity: 0.6; cursor: not-allowed; }
            /* Dark editor chrome — flip the mobile top bar surfaces. */
            .qq-editor-shell[data-theme="dark"] .qq-editor-topbar--mobile {
              background: var(--qq-surface);
              border-bottom-color: var(--qq-border);
            }
            .qq-editor-shell[data-theme="dark"] .qq-mtopbar-close,
            .qq-editor-shell[data-theme="dark"] .qq-mtopbar-name-input {
              color: var(--qq-text, rgba(255,255,255,1));
            }
            .qq-editor-shell[data-theme="dark"] .qq-mtopbar-tool-btn {
              color: var(--qq-text-secondary, ${AE.color.secondary});
            }
            .qq-editor-shell[data-theme="dark"] .qq-mtopbar-tool-btn:hover:not(:disabled) {
              background: var(--qq-surface-hover, rgba(255,255,255,0.08));
            }
          }
        `}</style>
      </div>
    );
  }

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
              className="qq-editor-device-icon"
              data-active={device === mode ? 'true' : 'false'}
              style={{
                width: 14, height: 14,
                // Active stays brand blue. Inactive uses a token that defaults
                // to the Apple light gray (#6e6e73) but is overridden to a
                // lighter slate under the dark editor shell (see <style> below)
                // so it clears 4.5:1 on the dark top bar instead of ~2.9.
                color: device === mode
                  ? AE.color.accent
                  : `var(--qq-device-inactive, ${AE.color.secondary})`,
              }}
            />
          </button>
        ))}
      </div>

      {/* Dark editor chrome — lift the INACTIVE device-toggle icons off the
          dark top bar. Active icon keeps its inline brand blue (unaffected by
          this var). Light mode is untouched (the var only resolves here). */}
      <style>{`
        .qq-editor-shell[data-theme="dark"] .qq-editor-device {
          --qq-device-inactive: var(--qq-muted, #94a3b8);
        }
      `}</style>

      {/* 2026-06-04 — the "Preview as bubble" toggle was removed from the top
       *  bar. It consumed ~151px (16px icon + visible label + pill padding)
       *  and squeezed the right-side controls (theme · help · fold · close)
       *  at common editor widths. The floating-launcher preview lens still
       *  exists in PreviewPane / WizardShell state; only this redundant
       *  top-bar entry point is gone. */}

      {/* 2026-06-05 — desktop Publish entry point. Install/embed was folded
       *  into the Publish flow (Elfsight parity), so the desktop top bar now
       *  needs the same primary action the mobile bar already has. Opens the
       *  Publish modal (hosted link · embed · install) via onPublish. */}
      {onPublish && (
        <button
          type="button"
          onClick={() => onPublish?.()}
          disabled={isPublishing}
          data-testid="quotequick-publish"
          style={{
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: 30, padding: '0 16px',
            background: AE.color.accent,
            color: AE.color.publishText,
            border: 'none', borderRadius: AE.radius.sm,
            fontFamily: AE.font.family,
            fontSize: 13, fontWeight: 600,
            cursor: isPublishing ? 'not-allowed' : 'pointer',
            opacity: isPublishing ? 0.6 : 1,
          }}
          title="Publish — get your embed code & share link"
        >
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      )}

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

      {/* 2026-06-12 — shared Help modal (HelpModal.tsx). Replaces the inline
       *  mailto: card that was duplicated here and in WizardShell. The modal
       *  portals itself to <body> and owns its Escape/backdrop dismissal;
       *  its two actions are in-app: open the builder chat, or submit a
       *  support message without leaving the editor. */}
      {helpOpen && <HelpModal editorTheme={editorTheme} onClose={closeHelp} />}
    </div>
  );
}
