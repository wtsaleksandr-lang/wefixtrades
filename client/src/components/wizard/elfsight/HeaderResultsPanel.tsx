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

export default function HeaderResultsPanel({
  header, onHeaderChange,
  results, onResultsChange,
}: Props) {
  const updateHeader = (patch: Partial<ShellHeader>) => onHeaderChange({ ...header, ...patch });
  const updateResults = (patch: Partial<ShellResults>) => onResultsChange({ ...results, ...patch });

  // Wave I (c): selection sync. Clicking inside the "Header" or "Results"
  // sub-section in the left pane outlines the matching block in the preview.
  const selection = useSelection();
  const headerSelected = selection.isSelected({ kind: 'header', id: '__header' });
  const resultsSelected = selection.isSelected({ kind: 'results', id: '__results' });
  const registerHeaderPane = selection.registerNode({ kind: 'header', id: '__header' }, 'pane');
  const registerResultsPane = selection.registerNode({ kind: 'results', id: '__results' }, 'pane');

  return (
    <section
      className="qq-headres-panel"
      data-testid="editor-headerresults-panel"
      aria-label="Header and results"
    >
      <header
        ref={registerHeaderPane}
        className={`qq-headres-section qq-headres-select${headerSelected ? ' is-selected' : ''}`}
        data-testid="editor-headerresults-header-section"
        {...(headerSelected ? { 'data-selected-in-pane': '' } : {})}
        onClick={() => selection.select({ kind: 'header', id: '__header' })}
      >
        <h3 className="qq-headres-title">
          Header
          <InfoCue
            testid="build-section-header"
            region="header"
            text="The title bar visible above the form. Title falls back to your business name; subtitle is optional."
          />
        </h3>
      </header>

      <div className="qq-headres-grid">
        {/* BD-3d Feature 1 — RichTextField replaces the plain input for the
            heading/footer/title/subtitle fields. Stores sanitized HTML;
            sanitizes on both write + read; supports B/I/U, font size,
            color, emoji, inline image (≤2MB). NO custom-code button.
            P1 UX bug sweep — per-field InfoCue dropped (the section
            header cue above already covers both Title and Subtitle).
            One cue per section, matching BD-3e PR #474 Shape/Layout fix. */}
        <RichTextField
          label="Title"
          htmlFor="qq-headres-title"
          value={header.title ?? ''}
          onChange={(next) => updateHeader({ title: next })}
          placeholder="Click to add a title"
          testid="input-header-title"
        />
        <RichTextField
          label="Subtitle"
          htmlFor="qq-headres-subtitle"
          value={header.subtitle ?? ''}
          onChange={(next) => updateHeader({ subtitle: next })}
          placeholder="Click to add a subtitle"
          testid="input-header-subtitle"
        />
      </div>

      <div className="qq-headres-divider" />

      <header
        ref={registerResultsPane}
        className={`qq-headres-section qq-headres-select${resultsSelected ? ' is-selected' : ''}`}
        data-testid="editor-headerresults-results-section"
        {...(resultsSelected ? { 'data-selected-in-pane': '' } : {})}
        onClick={() => selection.select({ kind: 'results', id: '__results' })}
      >
        <h3 className="qq-headres-title">
          Results
          <InfoCue
            testid="build-section-results"
            region="result"
            text="The panel shown after the quote is calculated. Heading sits above the headline number; footnote is small print under it."
          />
        </h3>
      </header>

      <div className="qq-headres-grid">
        {/* BD-3d Feature 1 — rich-text fields for the results pane.
            P1 UX bug sweep — per-field InfoCue dropped (section header
            cue above already covers Heading and Footnote). One cue per
            section, matching BD-3e PR #474 Shape/Layout fix. */}
        <RichTextField
          label="Heading"
          htmlFor="qq-headres-heading"
          value={results.heading ?? ''}
          onChange={(next) => updateResults({ heading: next })}
          placeholder="Click to add a heading"
          testid="input-results-heading"
        />
        <RichTextField
          label="Footer / footnote"
          htmlFor="qq-headres-footnote"
          value={results.footnote ?? ''}
          onChange={(next) => updateResults({ footnote: next })}
          placeholder="Click to add a footer"
          testid="input-results-footnote"
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
        .qq-headres-select {
          /* W-SECTIONS — smaller padding so the subtle label hugs the
           * inputs below. The selection pill still reads clearly. */
          padding: 2px 6px; border-radius: 6px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
        }
        /* P1 RE-FIX — Rule 4: selected section header is an OUTLINE, not a
         * bright fill. The previous accentLighter background + 2px halo
         * made the muted "HEADER" / "RESULTS" all-caps title nearly
         * invisible on focus. Canonical pattern: 8% blue tint + 1px
         * solid outline with negative offset, text colour untouched. */
        .qq-headres-select.is-selected {
          background: rgba(13, 60, 252, 0.08);
          border-color: ${p.colors.accent};
          outline: 1px solid ${p.colors.accent};
          outline-offset: -1px;
          box-shadow: none;
          color: inherit;
        }
        .qq-headres-title {
          /* W-SECTIONS — subtle all-caps label, per Alex's global rule. */
          margin: 0;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          display: inline-flex; align-items: center;
        }
        .qq-headres-grid {
          display: grid; gap: 10px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 520px) {
          .qq-headres-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .qq-headres-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 4px 0;
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
