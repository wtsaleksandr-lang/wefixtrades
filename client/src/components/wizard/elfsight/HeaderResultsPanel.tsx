// HeaderResultsPanel — Build > Header & Results section (Wave H4).
//
// Below the Calculations panel. Surfaces the user-editable knobs that drive
// the AdvancedCalculator's title bar and result panel:
//   - Header.title     → state.header.title
//   - Header.subtitle  → state.header.subtitle
//   - Results.heading  → state.results.heading
//   - Results.footnote → state.results.footnote
//
// Wave G's "no auto-subtitle" preview behaviour is preserved: a blank
// subtitle stays blank and the preview header reads as a single line. Only a
// non-empty subtitle renders.
//
// W-AO-5 — the "Headline result" calc-picker dropdown that previously lived
// at the bottom of this panel was removed. It duplicated the per-row
// "Result mode: Primary / Secondary" segmented control inside each
// CalculationRow, which is the canonical surface for choosing the headline
// calculation (it sits next to the calc it controls, so it's more
// discoverable). Both surfaces wrote to the same state via
// WizardShell.setResultCalc, so removing the dropdown causes no behaviour
// change — the per-row toggle continues to drive `calculations[*].resultMode`
// and the preview reads it via the explicit-primary path in PreviewPane.

import { useEffect, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { ShellHeader, ShellResults } from './types';
import { useSelection } from './selection';
import InfoCue from './InfoCue';
import RichTextField from './RichTextField';

const p = platformTheme;

interface Props {
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
  results: ShellResults;
  onResultsChange: (next: ShellResults) => void;
}

// Issue 7 — single tabbed full-width editor. Each tab maps to one of the four
// editable strings and to its parent selection group: Title/Subtitle belong to
// the HEADER selection node (data-edit-key="header"); Heading/Footer belong to
// the RESULTS selection node (data-edit-key="results"). The `group` drives
// which preview block lights up + which click-to-edit anchor a preview click
// scrolls the left pane to.
type TabKey = 'title' | 'subtitle' | 'heading' | 'footnote';
type TabGroup = 'header' | 'results';

interface TabDef {
  key: TabKey;
  group: TabGroup;
  label: string;
  htmlFor: string;
  placeholder: string;
  testid: string;
}

const TABS: TabDef[] = [
  { key: 'title',    group: 'header',  label: 'Header Title',     htmlFor: 'qq-headres-title',    placeholder: 'Click to add a title',     testid: 'input-header-title' },
  { key: 'subtitle', group: 'header',  label: 'Subtitle',         htmlFor: 'qq-headres-subtitle', placeholder: 'Click to add a subtitle',  testid: 'input-header-subtitle' },
  { key: 'heading',  group: 'results', label: 'Results Heading',  htmlFor: 'qq-headres-heading',  placeholder: 'Click to add a heading',   testid: 'input-results-heading' },
  { key: 'footnote', group: 'results', label: 'Footer',           htmlFor: 'qq-headres-footnote', placeholder: 'Click to add a footer',    testid: 'input-results-footnote' },
];

export default function HeaderResultsPanel({
  header, onHeaderChange,
  results, onResultsChange,
}: Props) {
  const updateHeader = (patch: Partial<ShellHeader>) => onHeaderChange({ ...header, ...patch });
  const updateResults = (patch: Partial<ShellResults>) => onResultsChange({ ...results, ...patch });

  const [activeTab, setActiveTab] = useState<TabKey>('title');
  const active = TABS.find(t => t.key === activeTab) ?? TABS[0];

  // Wave I (c): selection sync. Clicking inside the "Header" or "Results"
  // group in the left pane outlines the matching block in the preview — and a
  // preview-block click routes here. Both anchors stay in the DOM so the
  // WizardShell highlight logic can resolve targetKey 'header' / 'results' to a
  // node (PreviewPane click-to-edit + scroll-into-view).
  const selection = useSelection();
  const headerSelected = selection.isSelected({ kind: 'header', id: '__header' });
  const resultsSelected = selection.isSelected({ kind: 'results', id: '__results' });
  const registerHeaderPane = selection.registerNode({ kind: 'header', id: '__header' }, 'pane');
  const registerResultsPane = selection.registerNode({ kind: 'results', id: '__results' }, 'pane');

  // Preview → left-pane sync: when the user clicks the preview HEADER, the
  // shared selection becomes the header node; surface a header tab. Likewise a
  // preview RESULTS click surfaces a results tab. Only retarget when the active
  // tab's group doesn't already match the selected group, so manual tab
  // switching within a group isn't fought by this effect.
  useEffect(() => {
    if (headerSelected && active.group !== 'header') setActiveTab('title');
    else if (resultsSelected && active.group !== 'results') setActiveTab('heading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerSelected, resultsSelected]);

  // Clicking a tab selects its parent group so the matching preview block
  // outlines (and the left-pane anchor scrolls into view on cross-pane sync).
  const selectTab = (tab: TabDef) => {
    setActiveTab(tab.key);
    selection.select({ kind: tab.group === 'header' ? 'header' : 'results', id: tab.group === 'header' ? '__header' : '__results' });
  };

  const currentValue =
    active.key === 'title'    ? (header.title ?? '')
    : active.key === 'subtitle' ? (header.subtitle ?? '')
    : active.key === 'heading'  ? (results.heading ?? '')
    : (results.footnote ?? '');

  const handleChange = (next: string) => {
    if (active.key === 'title') updateHeader({ title: next });
    else if (active.key === 'subtitle') updateHeader({ subtitle: next });
    else if (active.key === 'heading') updateResults({ heading: next });
    else updateResults({ footnote: next });
  };

  return (
    <section
      data-theme="light"
      className="qq-headres-panel"
      data-testid="editor-headerresults-panel"
      aria-label="Titles and result text"
    >
      <header className="qq-headres-section">
        <h3 className="qq-headres-title">
          Titles &amp; result text
          <InfoCue
            testid="build-section-headres"
            region="header"
            text="The title bar above the form (Title falls back to your business name; Subtitle is optional) and the result panel after a quote is calculated (Heading above the headline number; Footer is the small print)."
          />
        </h3>
      </header>

      {/* data-edit-key anchors stay in the DOM so PreviewPane click-to-edit +
          the WizardShell scroll-into-view resolve targetKey 'header'/'results'
          to a node. They wrap the tab strip rather than separate field blocks
          now, but the contract (an element carrying each key, registered to its
          selection node) is unchanged. */}
      <div
        ref={registerHeaderPane}
        data-testid="editor-headerresults-header-section"
        data-edit-key="header"
        {...(headerSelected ? { 'data-selected-in-pane': '' } : {})}
        style={{ display: 'contents' }}
      />
      <div
        ref={registerResultsPane}
        data-testid="editor-headerresults-results-section"
        data-edit-key="results"
        {...(resultsSelected ? { 'data-selected-in-pane': '' } : {})}
        style={{ display: 'contents' }}
      />

      {/* Issue 7 — single full-width tabbed editor. The old 2-col grid squeezed
          each RichTextField; one editor driven by activeTab keeps every field
          full width. Tab strip is a segmented control; the selected tab reads
          as an OUTLINE/underline (NOT a bright fill) per the hard UI rules. */}
      <div className="qq-headres-tabs" role="tablist" aria-label="Choose which text to edit">
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`qq-headres-tab${isActive ? ' is-active' : ''}`}
              data-testid={`headres-tab-${tab.key}`}
              {...(isActive ? { 'data-active': '' } : {})}
              onClick={() => selectTab(tab)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="qq-headres-editor-wrap">
        <RichTextField
          key={active.key}
          label={active.label}
          htmlFor={active.htmlFor}
          value={currentValue}
          onChange={handleChange}
          placeholder={active.placeholder}
          testid={active.testid}
          /* The active tab above already names this field ("Header Title"
             etc.), so the field's own notched eyebrow label would just
             repeat it. Hide the visible label; aria-label stays for a11y. */
          hideFloatingLabel
        />
      </div>

      {/* W-AO-5 — the "Headline result" dropdown previously rendered here
       * was removed. To pick which calculation is the big headline number,
       * use the Primary / Secondary segmented control on each calculation
       * row inside the Calculations section above. */}

      <style>{`
        .qq-headres-panel {
          /* W-SECTIONS — tightened gap (12 → 6px). The "Header" and
           * "Results" titles below should sit right against their input
           * grid; the divider already provides the visual break. */
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-headres-section { margin: 0; }
        .qq-headres-title {
          /* W-SECTIONS — subtle all-caps label, per Alex's global rule. */
          margin: 0;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          display: inline-flex; align-items: center;
        }

        /* Issue 7 — segmented tab strip. Selected tab is an OUTLINE + bottom
         * underline accent (NOT a bright fill), per the hard UI rules. Wraps
         * gracefully at narrow widths instead of clipping. Help cue lives once
         * on the section title above (top-left), not per tab. */
        .qq-headres-tabs {
          display: flex; flex-wrap: wrap; gap: 2px;
          padding: 2px;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 8px;
        }
        .qq-headres-tab {
          flex: 1 1 auto;
          min-width: 0;
          padding: 6px 10px;
          font: inherit;
          font-size: 12px; font-weight: 600;
          color: ${p.colors.muted};
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .qq-headres-tab:hover {
          color: ${p.colors.body};
          background: rgba(13, 60, 252, 0.05);
        }
        .qq-headres-tab.is-active {
          color: ${p.colors.accent};
          background: #fff;
          border-color: ${p.colors.accent};
          outline: 1px solid ${p.colors.accent};
          outline-offset: -1px;
          box-shadow: inset 0 -2px 0 ${p.colors.accent};
        }
        .qq-headres-tab:focus-visible {
          outline: 2px solid ${p.colors.accent};
          outline-offset: 1px;
        }
        .qq-headres-editor-wrap {
          /* Single full-width column — no 2-col squeeze. */
          display: block;
        }
        .qq-headres-input {
          width: 100%; padding: 9px 12px; box-sizing: border-box;
          font: inherit; font-size: 13px; color: ${p.colors.body};
          background: #fff; border: 1px solid ${p.colors.border};
          border-radius: 8px; outline: none;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-headres-input:focus {
          border-color: ${p.colors.accent}; box-shadow: ${p.shadows.focus};
        }
        .qq-headres-empty {
          margin: 0; font-size: 12px; color: ${p.colors.subtle};
          padding: 9px 12px;
          background: ${p.colors.surfaceRaised};
          border: 1px dashed ${p.colors.border}; border-radius: 8px;
        }
        .qq-headres-label {
          display: flex; align-items: center; font-size: 11px; font-weight: 700;
          color: ${p.colors.heading};
          letter-spacing: 0.02em; text-transform: uppercase; margin-bottom: 4px;
        }
      `}</style>
    </section>
  );
}
