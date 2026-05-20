// EditorTopBar — Elfsight-clone editor top bar (Wave H1 → Wave J).
//
// Layout (left→right):
//   • QuoteQuick brand mark + "Saved" pill (when present)
//   • spacer
//   • desktop / mobile device toggle (reuses Wave G's compact sizing)
//   • sun / moon  day-night toggle  (Wave J item 3)
//   • ?  help
//   • X  close (history.back fallback to /)
//
// Brand styling only — no Elfsight colours. Accent comes from platformTheme.
// All testids stable: quotequick-close, preview-device-desktop, preview-device-mobile.
// Wave J adds: editor-theme-toggle.

import { HelpCircle, Monitor, Moon, Smartphone, Sun, X } from 'lucide-react';
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
}

export default function EditorTopBar({
  justSaved, device, onDeviceChange,
  editorTheme, onEditorThemeChange,
  onHelp, onClose,
}: Props) {
  const nextTheme: EditorTheme = editorTheme === 'dark' ? 'light' : 'dark';
  const Icon = editorTheme === 'dark' ? Sun : Moon;
  return (
    <div className="qq-editor-topbar" data-testid="editor-top-bar">
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
