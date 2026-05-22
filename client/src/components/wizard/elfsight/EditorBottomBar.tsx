// EditorBottomBar — P2 UX (2026-05-22).
//
// Wizard chrome's BOTTOM navigation bar. Hosts the 4 editor tabs
// (Build / Style / Settings / Install) that previously lived in the
// top chrome's single-row strip.
//
// Why moved: the top chrome packed brand + undo/redo + tabs + device
// preset + launcher toggle + Save into one row. At narrow widths the
// tabs got crowded and frequently scrolled out of view. Splitting
// the chrome into three zones (top / canvas / bottom) gives every
// surface room to breathe.
//
// Layout:
//   - Sticky to the bottom of the wizard frame, above any mobile
//     bottom-sheet (z-index just below the sheet).
//   - Tabs centred horizontally; active tab = brand-blue background
//     + white text (Option A from PR #515).
//   - Inactive tabs use muted text on transparent background, with
//     a subtle hover lift.
//   - At < 480px the tab strip falls back to horizontal scroll so
//     even with all 4 labels visible (and any future 5th tab) the
//     row remains usable.
//
// Height: 44px on desktop, 48px on mobile.
//
// Theme-aware: dark mode flips to surface colour + lighter hairline.
// Stable testids preserved from EditorTopBar:
//   - editor-tabs (container)
//   - editor-tab-build, editor-tab-style, editor-tab-settings,
//     editor-tab-install

import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;
const d = dashboardTheme;

interface Props {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
}

export default function EditorBottomBar({ activeTab, onTabChange }: Props) {
  return (
    <div
      className="qq-editor-bottombar"
      data-testid="editor-bottom-bar"
    >
      <div
        className="qq-editor-bottombar-tabs"
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
              className={`qq-editor-bottombar-tab${isActive ? ' is-active' : ''}`}
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

      <style>{`
        .qq-editor-bottombar {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          min-height: 44px;
          padding: 4px 12px;
          background: ${d.colors.panelHeader};
          border-top: 1px solid ${d.colors.borderLight};
          /* z-index sits below the mobile bottom sheet (9998) and above the
           * canvas content. The W-AO-1 sticky action bar uses 60, so 50
           * keeps us below it on the rare mobile combo where both render. */
          position: relative;
          z-index: 5;
        }
        .qq-editor-shell[data-theme="dark"] .qq-editor-bottombar {
          background: var(--qq-surface);
          border-top-color: var(--qq-border);
        }
        .qq-editor-bottombar-tabs {
          display: flex; align-items: center; gap: 4px;
          /* Horizontal-scroll fallback when 5+ tabs / long labels exceed
           * the row. Tabs themselves white-space: nowrap. */
          overflow-x: auto;
          scrollbar-width: none;
          max-width: 100%;
          padding: 0 4px;
        }
        .qq-editor-bottombar-tabs::-webkit-scrollbar { display: none; }
        .qq-editor-bottombar-tab {
          font: inherit; background: transparent; border: none; cursor: pointer;
          padding: 6px 14px;
          min-height: 32px;
          font-size: 13px; font-weight: 600;
          border-radius: 999px;
          white-space: nowrap;
          transition: color 0.12s ease, background 0.12s ease,
                      transform 0.12s ease;
        }
        .qq-editor-bottombar-tab:hover:not(.is-active) {
          color: ${p.colors.heading};
          background: ${p.colors.surfaceRaised};
          transform: translateY(-1px);
        }
        .qq-editor-shell[data-theme="dark"] .qq-editor-bottombar-tab:hover:not(.is-active) {
          color: var(--qq-text);
          background: rgba(255, 255, 255, 0.06);
        }
        .qq-editor-bottombar-tab.is-active {
          font-weight: 700;
          color: #ffffff !important;
          background: ${p.colors.accent} !important;
        }

        @media (max-width: 768px) {
          .qq-editor-bottombar {
            min-height: 48px;
            padding: 4px 8px;
            /* Wave X / BH-2 — match top-chrome's mobile backdrop blur so
             * the bottom navbar reads as an app-style bottom nav rather
             * than an opaque slab. */
            background: rgba(255, 255, 255, 0.94);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
          .qq-editor-shell[data-theme="dark"] .qq-editor-bottombar {
            background: rgba(15, 23, 42, 0.88);
          }
        }
        @media (max-width: 480px) {
          .qq-editor-bottombar-tab {
            padding: 6px 10px;
            font-size: 12.5px;
          }
        }
      `}</style>
    </div>
  );
}
