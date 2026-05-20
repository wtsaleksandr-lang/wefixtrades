// TabPlaceholder — H1 stub for each editor tab.
//
// The Build placeholder includes a labelled `input-business-name` field whose
// value flows up to the shell's state so the live preview header stays
// reactive (proves the wiring is intact end-to-end). Other tabs render a
// "Coming soon — Wave H<n>" empty state.

import { platformTheme } from '@/theme/platformTheme';
import type { EditorTab } from './types';

const p = platformTheme;

interface Props {
  tab: EditorTab;
  businessName: string;
  onBusinessNameChange: (v: string) => void;
}

const WAVE_BY_TAB: Record<EditorTab, string> = {
  build: 'Wave H2-H4',
  style: 'Wave H5', // implemented — but kept as a fallback waypoint
  settings: 'Wave H6',
  install: 'Wave H7',
};

export default function TabPlaceholder({ tab, businessName, onBusinessNameChange }: Props) {
  return (
    <div
      className="qq-editor-tabpanel"
      data-testid={`editor-tabpanel-${tab}`}
      role="tabpanel"
    >
      {tab === 'build' && (
        <div className="qq-editor-build-stub">
          <label
            htmlFor="qq-shell-business-name"
            style={{
              display: 'block', fontSize: 12, fontWeight: 700,
              color: p.colors.heading, marginBottom: 6, letterSpacing: '-0.005em',
            }}
          >
            Business name
          </label>
          <input
            id="qq-shell-business-name"
            type="text"
            value={businessName}
            onChange={(e) => onBusinessNameChange(e.target.value)}
            placeholder="Your business name"
            data-testid="input-business-name"
            style={{
              width: '100%', padding: '9px 12px', boxSizing: 'border-box',
              fontSize: 13, color: p.colors.body, background: '#fff',
              border: `1px solid ${p.colors.border}`, borderRadius: 8,
              outline: 'none',
            }}
          />
          <p
            style={{
              fontSize: 11.5, color: p.colors.subtle, margin: '8px 0 0',
              lineHeight: 1.5,
            }}
          >
            Typing here updates the live preview on the right. The remaining
            Build tab sections (Fields · Calculations · Header &amp; Results)
            land in Wave H2-H4.
          </p>
        </div>
      )}

      {tab !== 'build' && (
        <div
          className="qq-editor-empty"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            gap: 8, padding: '24px 4px', color: p.colors.muted,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: p.colors.heading, margin: 0 }}>
            {tab === 'style' && 'Style'}
            {tab === 'settings' && 'Settings'}
            {tab === 'install' && 'Install'}
          </p>
          <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
            Coming in {WAVE_BY_TAB[tab]}.
          </p>
        </div>
      )}
    </div>
  );
}
