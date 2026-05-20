// HeaderResultsPanel — Build > Header & Results section (Wave H4).
//
// Below the Calculations panel. Surfaces the user-editable knobs that drive
// the AdvancedCalculator's title bar and result panel:
//   - Header.title     → state.header.title
//   - Header.subtitle  → state.header.subtitle
//   - Results.heading  → state.results.heading
//   - Results.footnote → state.results.footnote
//   - Headline calc    → state.resultCalcId (also flips resultMode flags)
//
// Wave G's "no auto-subtitle" preview behaviour is preserved: a blank
// subtitle stays blank and the preview header reads as a single line. Only a
// non-empty subtitle renders. The headline dropdown lists each calc by name;
// selecting one ALSO sets that calc's `resultMode` to 'primary' (and demotes
// any other primaries) so the segmented control in CalculationRow stays in
// sync with the renderer's explicit-primary path.

import { useMemo } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateCalculation } from '@shared/templatePresets';
import type { ShellHeader, ShellResults } from './types';
import { useSelection } from './selection';
import InfoCue from './InfoCue';
import FloatField from './FloatField';

const p = platformTheme;

interface Props {
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
  results: ShellResults;
  onResultsChange: (next: ShellResults) => void;
  calculations: TemplateCalculation[];
  /** The currently-chosen headline calc id (undefined ⇒ auto). */
  resultCalcId?: string;
  /**
   * Persist a new headline by calc id. Also promotes the picked calc's
   * resultMode to 'primary' upstream (see WizardShell.setResultCalc).
   */
  onResultCalcChange: (calcId: string) => void;
}

export default function HeaderResultsPanel({
  header, onHeaderChange,
  results, onResultsChange,
  calculations, resultCalcId, onResultCalcChange,
}: Props) {
  // Resolve the effective headline id used to populate the dropdown:
  //   1. explicit resultCalcId if it still resolves to a calc
  //   2. else the first calc with resultMode === 'primary'
  //   3. else last calc (back-compat)
  const effectiveHeadlineId = useMemo(() => {
    if (resultCalcId && calculations.some((c) => c.id === resultCalcId)) return resultCalcId;
    const explicitPrimary = calculations.find((c) => c.resultMode === 'primary');
    if (explicitPrimary) return explicitPrimary.id;
    if (calculations.length > 0) return calculations[calculations.length - 1].id;
    return '';
  }, [resultCalcId, calculations]);

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
        <h3 className="qq-headres-title">Header</h3>
      </header>

      <div className="qq-headres-grid">
        <FloatField
          label="Title"
          htmlFor="qq-headres-title"
          infoText="Sits at the top of your calculator. Leave blank to fall back to your business name."
          infoTestid="headerresults-header"
        >
          <input
            id="qq-headres-title"
            type="text"
            className="premium-input"
            placeholder=" "
            value={header.title ?? ''}
            onChange={(e) => updateHeader({ title: e.target.value })}
            data-testid="input-header-title"
          />
        </FloatField>
        <FloatField
          label="Subtitle"
          htmlFor="qq-headres-subtitle"
          infoText="Optional. Leave blank to hide the subtitle."
          infoTestid="headerresults-subtitle"
        >
          <input
            id="qq-headres-subtitle"
            type="text"
            className="premium-input"
            placeholder=" "
            value={header.subtitle ?? ''}
            onChange={(e) => updateHeader({ subtitle: e.target.value })}
            data-testid="input-header-subtitle"
          />
        </FloatField>
      </div>

      <div className="qq-headres-divider" />

      <header
        ref={registerResultsPane}
        className={`qq-headres-section qq-headres-select${resultsSelected ? ' is-selected' : ''}`}
        data-testid="editor-headerresults-results-section"
        {...(resultsSelected ? { 'data-selected-in-pane': '' } : {})}
        onClick={() => selection.select({ kind: 'results', id: '__results' })}
      >
        <h3 className="qq-headres-title">Results</h3>
      </header>

      <div className="qq-headres-grid">
        <FloatField
          label="Heading"
          htmlFor="qq-headres-heading"
          infoText="The text shown above the headline number (e.g. 'Estimated total')."
          infoTestid="headerresults-heading"
        >
          <input
            id="qq-headres-heading"
            type="text"
            className="premium-input"
            placeholder=" "
            value={results.heading ?? ''}
            onChange={(e) => updateResults({ heading: e.target.value })}
            data-testid="input-results-heading"
          />
        </FloatField>
        <FloatField
          label="Footer / footnote"
          htmlFor="qq-headres-footnote"
          infoText="Small print under the headline. Use for disclaimers or 'taxes not included'."
          infoTestid="headerresults-footnote"
        >
          <input
            id="qq-headres-footnote"
            type="text"
            className="premium-input"
            placeholder=" "
            value={results.footnote ?? ''}
            onChange={(e) => updateResults({ footnote: e.target.value })}
            data-testid="input-results-footnote"
          />
        </FloatField>
      </div>

      <div className="qq-headres-divider" />

      {calculations.length === 0 ? (
        <p className="qq-headres-empty" data-testid="headerresults-no-calcs">
          Add a calculation above to pick a headline.
        </p>
      ) : (
        /* Wave R-pre v2 — removed the duplicate "Headline result" span
         * that Alex flagged. The FloatField's own label sits inside the
         * <select> already; the InfoCue moves into the field's top-right
         * via FloatField's new `infoText` prop. */
        <FloatField
          label="Headline result"
          htmlFor="qq-headres-headline"
          variant="select"
          infoText="Pick which calculation drives the big number shown on the results panel."
          infoTestid="headerresults-headline"
        >
          <select
            id="qq-headres-headline"
            className="premium-input"
            value={effectiveHeadlineId}
            onChange={(e) => onResultCalcChange(e.target.value)}
            data-testid="select-headline-calc"
          >
            {calculations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '(untitled calculation)'}
              </option>
            ))}
          </select>
        </FloatField>
      )}

      <style>{`
        .qq-headres-panel {
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-headres-section { margin: 0; }
        .qq-headres-select {
          padding: 6px 8px; border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-headres-select.is-selected {
          background: ${p.colors.accentLighter};
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-headres-title {
          margin: 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading}; letter-spacing: -0.005em;
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
