// EditorTopBar — Elfsight-clone editor top bar (Wave H1 → BH-2 → BH-5).
//
// BH-5 — Undo/Redo moved to the right cluster, adjacent to the device
// preset switcher, and the active-tab pill now uses solid brand blue with
// white text (Option A) so the label stays legible in both editor themes.
//
// Layout (left→right):
//
//   brand · | · tabs · spacer · saved · undo · redo · | · device · |
//   · theme · help · fold · close
//
// Below 1024px the brand drops its wordmark (icon only) and the tab strip
// scrolls horizontally inside a clipped flex region. Device / undo-redo /
// save / theme / close stay visible at all widths >= 480px. The phone
// breakpoint (<= 480px) still hides the device preset switcher (BH-1) since
// the user editing on a phone IS on a phone — undo/redo collapse with it.
//
// Brand styling only — no Elfsight colours. Accent comes from platformTheme.
// All testids stable: quotequick-close, preview-device-desktop, preview-device-mobile,
// editor-tab-*, editor-fold-toggle, editor-theme-toggle, editor-undo, editor-redo.

import {
  HelpCircle, MessageSquare, Monitor, Moon, PanelRightClose, PanelRightOpen,
  Redo2, Smartphone, Sun, Tablet, Undo2, X,
} from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { EDITOR_TABS, type EditorTab, type EditorTheme, type PreviewDevice } from './types';

const p = platformTheme;

interface Props {
  justSaved?: boolean;
  device: PreviewDevice;
  onDeviceChange: (d: PreviewDevice) => void;
  /** Wave J — current editor chrome theme. */
  editorTheme: EditorTheme;
  /** Wave J — flip the chrome theme. */
  onEditorThemeChange: (t: EditorTheme) => void;
  onHelp: () => void;
  onClose: () => void;
  /** BD-3a fix 1 — Undo/Redo wired to a draft-config history stack. */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** BH-2 — tab state, lifted in from WizardShell so the tabs sit on the
   *  same row as the rest of the chrome. */
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  /** BH-2 — preview fold/unfold (formerly on the standalone tab bar). */
  previewCollapsed?: boolean;
  onTogglePreview?: () => void;
  /** P2 UX — Floating launcher preview mode. When on, the canvas dims and
   *  the widget shrinks to a 56×56 bubble in the bottom-right of the
   *  preview pane (mimicking the BD-3m floating launcher visitors see).
   *  Click bubble = expand; click outside = collapse back to bubble. */
  floatingLauncherPreview?: boolean;
  onToggleFloatingLauncherPreview?: () => void;
}

export default function EditorTopBar({
  justSaved, device, onDeviceChange,
  editorTheme, onEditorThemeChange,
  onHelp, onClose,
  canUndo = false, canRedo = false, onUndo, onRedo,
  activeTab, onTabChange,
  previewCollapsed = false, onTogglePreview,
  floatingLauncherPreview = false, onToggleFloatingLauncherPreview,
}: Props) {
  const nextTheme: EditorTheme = editorTheme === 'dark' ? 'light' : 'dark';
  const ThemeIcon = editorTheme === 'dark' ? Sun : Moon;
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

      {/* BH-2 — tabs inline. Wraps in its own flex container that scrolls
       *  horizontally on narrow widths so the rest of the bar stays
       *  reachable; the surrounding chrome never scrolls. */}
      <div
        className="qq-editor-tabstrip"
        role="tablist"
        aria-label="Editor sections"
        data-testid="editor-tabs"
      >
        {EDITOR_TABS.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`editor-tab-${id}`}
              className={`qq-editor-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onTabChange(id)}
              style={{
                color: isActive ? '#ffffff' : p.colors.muted,
                background: isActive ? p.colors.accent : 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="qq-editor-spacer" aria-hidden="true" />

      <span
        className="qq-editor-saved"
        data-testid="editor-saved-state"
        style={{ opacity: justSaved ? 1 : 0 }}
      >
        ✓ Saved
      </span>

      {/* BH-5 — Undo / Redo. Moved here from the left of the chrome so the
       *  history pair sits adjacent to the device preset switcher on the
       *  right side. Disabled until the stack has entries. */}
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
            style={{ background: device === mode ? p.colors.accentLighter : 'transparent' }}
          >
            <Icon
              style={{
                width: 14, height: 14,
                color: device === mode ? p.colors.accent : p.colors.muted,
              }}
            />
          </button>
        ))}
      </div>

      {/* P1 UX — Floating launcher preview toggle.
       *
       * Discoverability fix (P1, 2026-05-22): previously rendered as a
       * bare 14px icon button that visually disappeared into the
       * surrounding tool cluster. Alex reported he couldn't find it.
       *
       * Changes:
       *  - Icon bumped to 16px and paired with a visible "Floating"
       *    label on widths >= 1024px (desktop wizard chrome).
       *  - Pill shape (not a circle) so it reads as a distinct toggle
       *    instead of just another icon button.
       *  - Tooltip explains WHAT floating launcher mode IS, not just
       *    a one-word reminder.
       *  - At-rest accent pulse (CSS) draws the eye on first paint.
       *  - Always renders (no feature flag gating) so it can't be
       *    accidentally hidden behind a config flip.
       *  - On <= 480px the pill collapses to an icon-only chip
       *    (label hidden via CSS) to avoid crowding the mobile chrome
       *    while staying visible. */}
      {onToggleFloatingLauncherPreview && (
        <button
          type="button"
          onClick={onToggleFloatingLauncherPreview}
          className={`qq-editor-icon-btn qq-editor-launcher-toggle${floatingLauncherPreview ? ' is-active' : ''}`}
          data-testid="editor-floating-launcher-toggle"
          data-active={floatingLauncherPreview ? 'true' : 'false'}
          aria-pressed={floatingLauncherPreview}
          aria-label={floatingLauncherPreview
            ? 'Exit floating launcher preview'
            : 'Preview as floating launcher'}
          title="Preview as floating launcher (closes the widget into a tiny bubble that visitors click to expand)"
        >
          <MessageSquare style={{ width: 16, height: 16 }} aria-hidden="true" />
          <span className="qq-editor-launcher-toggle-label">Floating</span>
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
          onClick={onHelp}
          className="qq-editor-icon-btn"
          data-testid="editor-help"
          aria-label="Help"
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
    </div>
  );
}
