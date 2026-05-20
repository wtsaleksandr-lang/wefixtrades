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

  return (
    <section
      className="qq-headres-panel"
      data-testid="editor-headerresults-panel"
      aria-label="Header and results"
    >
      <header className="qq-headres-section">
        <h3 className="qq-headres-title">Header</h3>
        <p className="qq-headres-sub">
          Sits at the top of your calculator. Leave the title blank to fall
          back to your business name — leave the subtitle blank to hide it.
        </p>
      </header>

      <div className="qq-headres-grid">
        <Field
          label="Title"
          htmlFor="qq-headres-title"
        >
          <input
            id="qq-headres-title"
            type="text"
            className="qq-headres-input"
            value={header.title ?? ''}
            onChange={(e) => updateHeader({ title: e.target.value })}
            placeholder="Falls back to your business name"
            data-testid="input-header-title"
          />
        </Field>
        <Field
          label="Subtitle"
          htmlFor="qq-headres-subtitle"
        >
          <input
            id="qq-headres-subtitle"
            type="text"
            className="qq-headres-input"
            value={header.subtitle ?? ''}
            onChange={(e) => updateHeader({ subtitle: e.target.value })}
            placeholder="Optional — hidden when blank"
            data-testid="input-header-subtitle"
          />
        </Field>
      </div>

      <div className="qq-headres-divider" />

      <header className="qq-headres-section">
        <h3 className="qq-headres-title">Results</h3>
        <p className="qq-headres-sub">
          What the headline price panel says. The headline value comes from
          the calculation you pick below.
        </p>
      </header>

      <div className="qq-headres-grid">
        <Field
          label="Heading"
          htmlFor="qq-headres-heading"
        >
          <input
            id="qq-headres-heading"
            type="text"
            className="qq-headres-input"
            value={results.heading ?? ''}
            onChange={(e) => updateResults({ heading: e.target.value })}
            placeholder="e.g. Your Total"
            data-testid="input-results-heading"
          />
        </Field>
        <Field
          label="Footer / footnote"
          htmlFor="qq-headres-footnote"
        >
          <input
            id="qq-headres-footnote"
            type="text"
            className="qq-headres-input"
            value={results.footnote ?? ''}
            onChange={(e) => updateResults({ footnote: e.target.value })}
            placeholder="e.g. Final price subject to inspection"
            data-testid="input-results-footnote"
          />
        </Field>
      </div>

      <div className="qq-headres-divider" />

      <Field
        label="Headline result"
        htmlFor="qq-headres-headline"
        sub="Which calculation is the big number?"
      >
        {calculations.length === 0 ? (
          <p className="qq-headres-empty" data-testid="headerresults-no-calcs">
            Add a calculation above to pick a headline.
          </p>
        ) : (
          <select
            id="qq-headres-headline"
            className="qq-headres-input"
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
        )}
      </Field>

      <style>{`
        .qq-headres-panel {
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-headres-section { margin: 0; }
        .qq-headres-title {
          margin: 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading}; letter-spacing: -0.005em;
        }
        .qq-headres-sub {
          margin: 3px 0 0; font-size: 11.5px; color: ${p.colors.subtle};
          line-height: 1.5;
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
          display: block; font-size: 11px; font-weight: 700;
          color: ${p.colors.heading};
          letter-spacing: 0.02em; text-transform: uppercase; margin-bottom: 4px;
        }
        .qq-headres-fieldsub {
          margin: 0 0 4px; font-size: 11px; color: ${p.colors.subtle};
        }
      `}</style>
    </section>
  );
}

function Field({
  label, htmlFor, sub, children,
}: {
  label: string;
  htmlFor: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="qq-headres-label" htmlFor={htmlFor}>{label}</label>
      {sub && <p className="qq-headres-fieldsub">{sub}</p>}
      {children}
    </div>
  );
}
