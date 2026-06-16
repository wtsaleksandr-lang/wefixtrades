// BottomTabBar — Elfsight-clone mobile editor bottom tab bar (2026-06-05).
//
// Faithful structural replica of Elfsight's mobile editor bottom bar (see
// tools/design-teardown/out/elfsight-builder/cap/mobile/03-editor-default.png):
// a PERSISTENT, fixed-to-bottom dark bar with FIVE evenly-spaced items, each an
// icon above a small label. Inactive items read muted light-grey; the active
// item is highlighted with the brand accent.
//
// This is mobile-only (≤768px). On desktop the section nav lives in the left
// icon rail (WizardShell), so this component is hidden entirely at that
// breakpoint via the parent's mobile gate (it is only RENDERED when isMobile).
//
// Mapping (our features, Elfsight's layout):
//   Build · Style · Settings · Install  → the four EDITOR_TABS
//   Help                                → opens the editor help overlay
//
// Tapping a panel tab (Build/Style/Settings/Install) tells the parent to open
// that tab's bottom sheet over the preview; tapping the ACTIVE panel tab again
// toggles the sheet closed (back to full preview). Help always opens the help
// overlay (never a sheet). The bar stays visible at all times so the user can
// switch sections without dismissing first.
//
// Testids preserved for Playwright / guards: the tablist carries
// data-testid="editor-tabs" and each panel button data-testid="editor-tab-${id}"
// — identical to the desktop rail, so existing checks keep passing on mobile.
//
// Colour note: the dark bar hexes (#1d1d1f surface, #a1a1a6 inactive) are
// intentional literals per the brief (they are NOT the banned bare
// white/black). The accent + font come from the AE token module.

import {
  SlidersHorizontal, MousePointerClick, Palette, Settings as SettingsIcon, HelpCircle,
  Code2,
} from 'lucide-react';
import { AE } from './appleEditor';
import { EDITOR_TABS, type EditorTab } from './types';

interface Props {
  /** The currently-selected panel tab (drives the active highlight). */
  activeTab: EditorTab;
  /** True when the panel sheet is open over the preview. The active highlight
   *  only paints when the sheet is actually open — in the default full-preview
   *  state nothing is highlighted, matching Elfsight's default capture. */
  sheetOpen: boolean;
  /** Tap a panel tab → open (or toggle) that tab's sheet. */
  onSelectTab: (tab: EditorTab) => void;
  /** Tap Help → open the editor help overlay. */
  onHelp: () => void;
  /**
   * Click-to-edit (2026-06-06) — when set, this tab briefly PULSES (accent
   * glow) to hint that a spot the user just tapped on the preview is editable
   * in that tab. The parent clears it on a timer / when the sheet opens. The
   * pulse is purely a visual hint; it doesn't change which tab is active.
   */
  pulseTab?: EditorTab | null;
}

const TAB_ICON: Record<EditorTab, typeof SlidersHorizontal> = {
  build: SlidersHorizontal,
  action: MousePointerClick,
  style: Palette,
  settings: SettingsIcon,
  install: Code2,
};

export default function BottomTabBar({
  activeTab, sheetOpen, onSelectTab, onHelp, pulseTab = null,
}: Props) {
  return (
    <nav
      className="qq-bottom-tabbar"
      role="tablist"
      aria-label="Editor sections"
      data-testid="editor-tabs"
    >
      {EDITOR_TABS.map(({ id, label }) => {
        const Icon = TAB_ICON[id];
        // Highlight only while the sheet is open on this tab — the default
        // full-preview state shows no active item (Elfsight parity).
        const isActive = sheetOpen && id === activeTab;
        // Click-to-edit — pulse this tab when the parent flags it (and it's
        // not the already-open active tab, where the pulse would be moot).
        const isPulsing = pulseTab === id && !isActive;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`editor-tab-${id}`}
            data-pulsing={isPulsing ? 'true' : undefined}
            className={`qq-bottom-tab${isActive ? ' is-active' : ''}${isPulsing ? ' is-pulsing' : ''}`}
            onClick={() => onSelectTab(id)}
            title={label}
          >
            <Icon
              className="qq-bottom-tab-icon"
              style={{ width: 24, height: 24 }}
              aria-hidden="true"
            />
            <span className="qq-bottom-tab-label">{label}</span>
          </button>
        );
      })}

      {/* Help — 5th item. Opens the help overlay rather than a sheet. */}
      <button
        type="button"
        className="qq-bottom-tab qq-bottom-tab-help"
        data-testid="editor-tab-help"
        onClick={onHelp}
        aria-label="Help"
        title="Help"
      >
        <HelpCircle
          className="qq-bottom-tab-icon"
          style={{ width: 24, height: 24 }}
          aria-hidden="true"
        />
        <span className="qq-bottom-tab-label">Help</span>
      </button>

      <style>{`
        /* Mobile-only — desktop uses the left icon rail, so this bar is never
           rendered above the breakpoint (parent gates on isMobile) and is also
           hidden defensively here. */
        .qq-bottom-tabbar { display: none; }

        @media (max-width: 768px) {
          .qq-bottom-tabbar {
            display: flex;
            position: fixed; left: 0; right: 0; bottom: 0;
            z-index: 9999;
            /* #14 — frosted-glass translucent dark bar so the preview is
               partly visible behind it (a sibling of the AI side tab's frosted
               surface). The #1d1d1f / #a1a1a6 hexes are intentional dark-chrome
               literals (not banned bare white/black); here #1d1d1f is taken at
               ~62% alpha and the backdrop-filter blurs+darkens what shows
               through, keeping the icons+labels readable. */
            background: rgba(29, 29, 31, 0.62);
            -webkit-backdrop-filter: blur(18px) saturate(135%);
            backdrop-filter: blur(18px) saturate(135%);
            font-family: ${AE.font.family};
            /* Clear the iOS home indicator. */
            padding-bottom: env(safe-area-inset-bottom, 0px);
            /* Hairline top edge so it reads as a distinct zone over the
               preview above. */
            box-shadow: 0 -0.5px 0 rgba(255,255,255,0.10);
          }
          /* Fallback — browsers without backdrop-filter get the original
             solid dark bar so contrast/readability never regress. */
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .qq-bottom-tabbar { background: #1d1d1f; }
          }
          .qq-bottom-tab {
            flex: 1 1 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 3px;
            min-height: 60px;
            padding: 8px 2px 6px;
            background: transparent; border: none; cursor: pointer;
            font: inherit;
            /* Inactive = muted light-grey icon + label. */
            color: #a1a1a6;
            transition: color 0.12s ease;
            -webkit-tap-highlight-color: transparent;
          }
          .qq-bottom-tab-icon { display: block; }
          .qq-bottom-tab-label {
            font-size: 11px; font-weight: 500; line-height: 1;
            letter-spacing: -0.01em;
          }
          .qq-bottom-tab:active { color: rgba(255,255,255,0.85); }
          /* Active = white label + accent icon, with a top accent indicator
             bar so the selected section is unmistakable. */
          .qq-bottom-tab.is-active {
            color: rgba(255,255,255,1);
            position: relative;
          }
          .qq-bottom-tab.is-active .qq-bottom-tab-icon {
            color: ${AE.color.accent};
          }
          .qq-bottom-tab.is-active::before {
            content: "";
            position: absolute; top: 0; left: 22%; right: 22%;
            height: 2px; border-radius: 0 0 2px 2px;
            background: ${AE.color.accent};
          }
          .qq-bottom-tab:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -2px;
            border-radius: 8px;
          }
          /* Click-to-edit — accent pulse hinting "the spot you tapped is
             editable in this tab". Subtle (Apple-like): the icon brightens to
             accent and a soft glow breathes a few times, then the parent
             clears the flag. Disabled under prefers-reduced-motion (a steady
             accent tint is shown instead so the hint still reads). */
          .qq-bottom-tab.is-pulsing { color: rgba(255,255,255,0.95); }
          .qq-bottom-tab.is-pulsing .qq-bottom-tab-icon {
            color: ${AE.color.accent};
            animation: qq-tab-pulse 0.9s ease-out 3;
            border-radius: 10px;
          }
          @keyframes qq-tab-pulse {
            0%   { transform: scale(1);    filter: drop-shadow(0 0 0 ${AE.color.accent}); }
            35%  { transform: scale(1.18); filter: drop-shadow(0 0 6px ${AE.color.accent}); }
            100% { transform: scale(1);    filter: drop-shadow(0 0 0 ${AE.color.accent}); }
          }
          @media (prefers-reduced-motion: reduce) {
            .qq-bottom-tab.is-pulsing .qq-bottom-tab-icon {
              animation: none;
            }
          }
        }
      `}</style>
    </nav>
  );
}
