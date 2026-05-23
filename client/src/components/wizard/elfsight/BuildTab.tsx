// BuildTab — root of the Build tab content.
//
// Wave H2 introduced the Fields panel. Wave H3 adds the Calculations panel
// directly below. Header & Results (H4) will slot in below that. The Build
// tab also keeps the existing "Business name" input from H1 since it's the
// only top-level identity field — it lives at the top of the column.
//
// Wave J item 5 — the business-name input is now a composite control: a
// 40×40 logo-upload square on the left, and the business name input
// (floating-label) on the right.

import { useCallback, useRef } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateCalculation, TemplateStep } from '@shared/templatePresets';
import FieldsPanel from './FieldsPanel';
import CalculationsPanel from './CalculationsPanel';
import HeaderResultsPanel from './HeaderResultsPanel';
import StepContentPanel from './StepContentPanel';
import TemplateStrip, { type ApplyTemplatePayload } from './TemplateGallery';
import FloatField from './FloatField';
import type { ShellHeader, ShellResults } from './types';

const p = platformTheme;

interface Props {
  businessName: string;
  onBusinessNameChange: (v: string) => void;
  /** Wave J — logo data URL or null. */
  logo: string | null;
  /** Wave J — replace the logo (pass null to clear). */
  onLogoChange: (next: string | null) => void;
  fields: TemplateField[];
  onFieldsChange: (next: TemplateField[]) => void;
  calculations: TemplateCalculation[];
  onCalculationsChange: (next: TemplateCalculation[]) => void;
  /** Wave H4. */
  header: ShellHeader;
  onHeaderChange: (next: ShellHeader) => void;
  results: ShellResults;
  onResultsChange: (next: ShellResults) => void;
  /** Wave H7. */
  activeTemplateId?: string;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
  /**
   * BG-7 Item 4 — explicit `steps[]` from the active template (seeded
   * into shell state on apply). When undefined, the renderer auto-
   * derives steps and the step-content editor stays hidden.
   */
  steps?: TemplateStep[];
  onStepsChange?: (next: TemplateStep[]) => void;
}

// Max raw bytes accepted by the logo upload before we reject (1 MB). The
// data URL inflates ~33% on top of this. Keeps localStorage from blowing up.
const LOGO_MAX_BYTES = 1024 * 1024;

export default function BuildTab({
  businessName, onBusinessNameChange,
  logo, onLogoChange,
  fields, onFieldsChange,
  calculations, onCalculationsChange,
  header, onHeaderChange,
  results, onResultsChange,
  activeTemplateId, onApplyTemplate,
  steps, onStepsChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onLogoFile = useCallback((file: File | null) => {
    if (!file) { onLogoChange(null); return; }
    if (file.size > LOGO_MAX_BYTES) return; // silently skip — UI hint below
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') onLogoChange(result);
    };
    reader.readAsDataURL(file);
  }, [onLogoChange]);

  return (
    <div
      data-theme="light"
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
        {/* Wave J item 5 — composite logo + business-name field. */}
        <div className="qq-business-composite" data-testid="editor-business-composite">
          <button
            type="button"
            className="qq-logo-upload"
            data-testid="editor-logo-upload"
            aria-label={logo ? 'Replace business logo' : 'Upload business logo'}
            onClick={() => fileInputRef.current?.click()}
          >
            {logo ? (
              <img src={logo} alt="" data-testid="editor-logo-preview" />
            ) : (
              <span className="qq-logo-upload-plus" aria-hidden="true">＋</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload business logo"
            data-testid="editor-logo-input"
            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onLogoFile(f);
              // Allow uploading the same file twice in a row.
              e.target.value = '';
            }}
          />
          <FloatField label="Business name" htmlFor="qq-shell-business-name" className="qq-business-namewrap">
            <input
              id="qq-shell-business-name"
              type="text"
              className="premium-input"
              placeholder=" "
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              data-testid="input-business-name"
            />
          </FloatField>
          {logo && (
            <button
              type="button"
              className="qq-logo-clear"
              data-testid="editor-logo-clear"
              aria-label="Remove business logo"
              onClick={() => onLogoChange(null)}
            >×</button>
          )}
        </div>
      </section>

      <div className="qq-build-divider" />

      <FieldsPanel fields={fields} onChange={onFieldsChange} />

      <div className="qq-build-divider" />

      <CalculationsPanel
        calculations={calculations}
        fields={fields}
        onChange={onCalculationsChange}
      />

      {/* BG-7 Item 4 — per-step rich-text descriptions. Renders only
         when the active template ships explicit `steps[]`. */}
      {onStepsChange && steps && steps.length > 0 && (
        <>
          <div className="qq-build-divider" />
          <StepContentPanel steps={steps} onChange={onStepsChange} />
        </>
      )}

      <div className="qq-build-divider" />

      <HeaderResultsPanel
        header={header}
        onHeaderChange={onHeaderChange}
        results={results}
        onResultsChange={onResultsChange}
      />

      <style>{`
        .qq-build-tab {
          /* W-AO-9 — section gap tightened 10px → 2px so containers sit
           * close (1–2px) per the wizard density audit. The hairline
           * .qq-build-divider already gives a visual seam. */
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-build-divider {
          height: 1px; background: ${p.colors.borderLight}; margin: 0;
        }
        /* Wave J item 5 — logo + name composite. */
        .qq-business-composite {
          display: flex; align-items: stretch; gap: 10px; position: relative;
        }
        .qq-business-namewrap {
          flex: 1; min-width: 0;
        }
        .qq-logo-upload {
          flex-shrink: 0;
          width: 48px; min-width: 48px; height: 48px;
          display: inline-flex; align-items: center; justify-content: center;
          background: #FFFFFF; color: ${p.colors.muted};
          border: 1px dashed ${p.colors.border}; border-radius: 10px;
          cursor: pointer; padding: 0; overflow: hidden;
          transition: border-color 0.12s ease, color 0.12s ease;
        }
        .qq-logo-upload:hover {
          border-color: ${p.colors.accent}; color: ${p.colors.accent};
        }
        .qq-logo-upload img {
          width: 100%; height: 100%; object-fit: contain;
        }
        .qq-logo-upload-plus {
          font-size: 22px; line-height: 1; font-weight: 600;
        }
        .qq-logo-clear {
          position: absolute; top: -6px; left: 38px;
          width: 18px; height: 18px;
          background: #fff; border: 1px solid ${p.colors.border};
          border-radius: 50%; cursor: pointer; padding: 0;
          font-size: 12px; line-height: 1; color: ${p.colors.muted};
        }
        .qq-logo-clear:hover { color: ${p.colors.danger}; border-color: ${p.colors.danger}; }
        /* Touch-target ≥44px on mobile (logo upload). */
        @media (max-width: 768px) {
          .qq-logo-upload { min-width: 48px; width: 48px; height: 48px; }
        }
      `}</style>
    </div>
  );
}
