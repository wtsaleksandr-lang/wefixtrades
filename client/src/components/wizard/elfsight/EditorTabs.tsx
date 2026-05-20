// EditorTabs — horizontal tab bar for the Elfsight-clone editor (Wave H1).
//
// 4 tabs: Build · Style · Settings · Install.
// In H1 the tab CONTENT is stubbed via <TabPlaceholder/>; this component only
// owns the bar itself. Tab state is lifted to <WizardShell> so the live
// preview can respond to whichever tab is active later.

import { platformTheme } from '@/theme/platformTheme';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;

interface Props {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
}

export default function EditorTabs({ active, onChange }: Props) {
  return (
    <div
      className="qq-editor-tabs"
      role="tablist"
      aria-label="Editor sections"
      data-testid="editor-tabs"
    >
      <div className="qq-editor-tabs-inner">
        {EDITOR_TABS.map(({ id, label }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`editor-tab-${id}`}
              className={`qq-editor-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(id)}
              style={{
                color: isActive ? p.colors.accent : p.colors.muted,
                borderBottomColor: isActive ? p.colors.accent : 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
