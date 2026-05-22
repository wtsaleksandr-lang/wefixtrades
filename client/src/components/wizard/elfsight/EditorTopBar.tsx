// EditorTopBar — Elfsight-clone editor top bar (Wave H1 → Wave J / BD-3a).
//
// Layout (left→right):
//   • Undo / Redo icon buttons (BD-3a fix 1)
//   • QuoteQuick brand mark + "Saved" pill (when present)
//   • spacer
//   • desktop / mobile device toggle (reuses Wave G's compact sizing)
//   • sun / moon  day-night toggle  (Wave J item 3)
//   • ?  help
//   • X  close (history.back fallback to /)
//
// Brand styling only — no Elfsight colours. Accent comes from platformTheme.
// All testids stable: quotequick-close, preview-device-desktop, preview-device-mobile.
// Wave J adds: editor-theme-toggle. BD-3a adds: editor-undo, editor-redo.

import { HelpCircle, Monitor, Moon, Redo2, Smartphone, Sun, Undo2, X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import type { EditorTheme, PreviewDevice } from './types';

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
}

export default function EditorTopBar({
  justSaved, device, onDeviceChange,
  editorTheme, onEditorThemeChange,
  onHelp, onClose,
  canUndo = false, canRedo = false, onUndo, onRedo,
}: Props) {
  const nextTheme: EditorTheme = editorTheme === 'dark' ? 'light' : 'dark';
  const Icon = editorTheme === 'dark' ? Sun : Moon;
  // BD-3a fix 1 — Mac-style shortcut label is purely cosmetic; the keyboard
  // listener in WizardShell handles both ⌘ and Ctrl.
  const isMac = typeof navigator !== 'undefined'
    && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';
  return (
    <div className="qq-editor-topbar" data-testid="editor-top-bar">
      {/* BD-3a fix 1 — Undo / Redo. Disabled until the stack has entries. */}
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

      <a href="/" className="qq-editor-brand" aria-label="WeFixTrades home">
        <img
          src="/favicon.svg"
          alt=""
          style={{ width: 16, height: 16 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span>QuoteQuick</span>
      </a>

      <span
        className="qq-editor-saved"
        data-testid="editor-saved-state"
        style={{ opacity: justSaved ? 1 : 0 }}
      >
        ✓ Saved
      </span>

      <div className="qq-editor-spacer" aria-hidden="true" />

      <div className="qq-editor-device" data-testid="editor-device-toggle">
        {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([mode, Icon]) => (
          <button
            key={mode}
            type="button"
            data-testid={`preview-device-${mode}`}
            onClick={() => onDeviceChange(mode)}
            aria-label={`${mode} preview`}
            aria-pressed={device === mode}
            title={`${mode === 'desktop' ? 'Desktop' : 'Mobile'} preview`}
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

      <button
        type="button"
        onClick={() => onEditorThemeChange(nextTheme)}
        className="qq-editor-icon-btn"
        data-testid="editor-theme-toggle"
        data-theme-state={editorTheme}
        aria-label={`Switch editor to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
      >
        <Icon style={{ width: 14, height: 14 }} aria-hidden="true" />
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
  );
}
