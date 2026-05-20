// EditorTabs — horizontal tab bar for the Elfsight-clone editor (Wave H1).
//
// 4 tabs: Build · Style · Settings · Install.
// In H1 the tab CONTENT is stubbed via <TabPlaceholder/>; this component only
// owns the bar itself. Tab state is lifted to <WizardShell> so the live
// preview can respond to whichever tab is active later.
//
// Wave M — a fold/unfold control sits at the right edge of the tab row
// (pushed away from the tabs with `margin-left: auto`) and toggles the
// preview pane open/closed. The icon flips between PanelRightClose (open
// state) and PanelRightOpen (collapsed state). Tooltip + aria-label keep
// it discoverable.

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;

interface Props {
  active: EditorTab;
  onChange: (tab: EditorTab) => void;
  /** Wave M — current preview-pane state. */
  previewCollapsed?: boolean;
  /** Wave M — toggle the preview pane. Optional so legacy callers still compile. */
  onTogglePreview?: () => void;
}

export default function EditorTabs({
  active, onChange, previewCollapsed = false, onTogglePreview,
}: Props) {
  // The tablist contains ONLY tab buttons (axe rule aria-required-children).
  // The fold/unfold button is a sibling of the tablist, not a child — both sit
  // inside `.qq-editor-tabs-inner` which is a flex container.
  return (
    <div
      className="qq-editor-tabs"
      data-testid="editor-tabs"
    >
      <div className="qq-editor-tabs-inner">
        <div
          className="qq-editor-tabs-list"
          role="tablist"
          aria-label="Editor sections"
        >
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
        {onTogglePreview && (
          <button
            type="button"
            className={`qq-editor-fold${previewCollapsed ? ' is-collapsed' : ''}`}
            onClick={onTogglePreview}
            data-testid="editor-fold-toggle"
            data-collapsed={previewCollapsed ? 'true' : 'false'}
            aria-pressed={previewCollapsed}
            aria-label={previewCollapsed ? 'Show preview pane' : 'Hide preview pane'}
            title={previewCollapsed ? 'Show preview' : 'Hide preview'}
          >
            {previewCollapsed ? (
              <PanelRightOpen size={16} aria-hidden="true" />
            ) : (
              <PanelRightClose size={16} aria-hidden="true" />
            )}
            <span className="qq-editor-fold-label">Preview</span>
          </button>
        )}
      </div>
    </div>
  );
}
