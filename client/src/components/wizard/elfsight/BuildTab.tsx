// BuildTab — root of the Build tab content.
//
// Wave H2 introduced the Fields panel. Wave H3 adds the Calculations panel
// directly below. Header & Results (H4) will slot in below that. The Build
// tab also keeps the existing "Business name" input from H1 since it's the
// only top-level identity field — it lives at the top of the column.

import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateCalculation } from '@shared/templatePresets';
import FieldsPanel from './FieldsPanel';
import CalculationsPanel from './CalculationsPanel';
import HeaderResultsPanel from './HeaderResultsPanel';
import TemplateStrip, { type ApplyTemplatePayload } from './TemplateGallery';
import type { ShellHeader, ShellResults } from './types';

const p = platformTheme;

interface Props {
  businessName: string;
  onBusinessNameChange: (v: string) => void;
  fields: TemplateField[];
  onFieldsChange: (next: TemplateField[]) => void;
  calculations: TemplateCalculation[];
  onCalculationsChange: (next: TemplateCalculation[]) => void;
  /** Wave H4. */
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
  results: ShellResults;
  onResultsChange: (next: ShellResults) => void;
  resultCalcId?: string;
  onResultCalcChange: (calcId: string) => void;
  /** Wave H7. */
  activeTemplateId?: string;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
}

export default function BuildTab({
  businessName, onBusinessNameChange,
  fields, onFieldsChange,
  calculations, onCalculationsChange,
  header, onHeaderChange,
  results, onResultsChange,
  resultCalcId, onResultCalcChange,
  activeTemplateId, onApplyTemplate,
}: Props) {
  return (
    <div
      className="qq-editor-tabpanel qq-build-tab"
      data-testid="editor-tabpanel-build"
      role="tabpanel"
    >
      {/* H7 — horizontal template scroller, single-row, at the top. */}
      <TemplateStrip
        activeTemplateId={activeTemplateId}
        onApplyTemplate={onApplyTemplate}
      />

      <div className="qq-build-divider" />

      <section className="qq-build-section" data-testid="editor-business-section">
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
      </section>

      <div className="qq-build-divider" />

      <FieldsPanel fields={fields} onChange={onFieldsChange} />

      <div className="qq-build-divider" />

      <CalculationsPanel
        calculations={calculations}
        fields={fields}
        onChange={onCalculationsChange}
      />

      <div className="qq-build-divider" />

      <HeaderResultsPanel
        header={header}
        onHeaderChange={onHeaderChange}
        results={results}
        onResultsChange={onResultsChange}
        calculations={calculations}
        resultCalcId={resultCalcId}
        onResultCalcChange={onResultCalcChange}
      />

      <style>{`
        .qq-build-tab {
          display: flex; flex-direction: column; gap: 14px;
        }
        .qq-build-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 2px 0;
        }
      `}</style>
    </div>
  );
}
