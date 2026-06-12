/**
 * PRICING-MODELS (U2) — `rate_matrix` runtime field.
 *
 * Two themed dropdowns (the existing `WidgetSelect`) labelled with the
 * owner's `matrix.rowLabel` / `matrix.colLabel` — e.g. "Pickup zone" ×
 * "Drop-off zone", or for drayage "Port / ramp" × "Zip zone". The lane rate
 * resolves CLIENT-side from `matrix.rates[rowId][colId]` (the rates ship in
 * the public widget config — they're the customer-facing prices, no secret).
 *
 * Layout: CSS grid `auto-fit/minmax` so the two selects sit side-by-side on
 * desktop and stack naturally in narrow containers (≤480 px) — container-
 * driven, no media query needed inside the embed iframe. A single-axis
 * matrix (1 column or 1 row) renders just one dropdown; the other axis is
 * pinned to its only id by the parent's `defaultAnswer`.
 *
 * Missing cell:
 *   - `custom_quote` (default) → muted "quoted individually" note; the flow
 *     proceeds with a NULL quote amount (parent suppresses `quote_amount`
 *     on the lead payload; the formula receives 0 so it never NaNs).
 *   - `'zero'` → contributes 0, no note.
 *
 * The parent owns the `{rowId, colId}` answer; this component is a pure
 * controlled input.
 */
import type { CSSProperties } from 'react';
import type { TemplateRateMatrix } from '@shared/templatePresets';
import type { WidgetTheme } from './widgetThemes';
import WidgetSelect from './WidgetSelect';
import { guardTextColor } from '@/lib/contrastGuard';

/** The persisted answer for a `rate_matrix` field. `''` = unselected. */
export interface MatrixAnswer {
  rowId: string;
  colId: string;
}

/** Runtime type guard — answers round-trip through JSON / template swaps. */
export function isMatrixAnswer(v: unknown): v is MatrixAnswer {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof (v as MatrixAnswer).rowId === 'string'
    && typeof (v as MatrixAnswer).colId === 'string';
}

/**
 * Resolve the selected lane rate. Returns:
 *   - `undefined` while either axis is unselected,
 *   - `null` when both are selected but the cell is missing/non-finite,
 *   - the finite rate otherwise.
 */
export function resolveMatrixRate(
  matrix: TemplateRateMatrix | undefined,
  answer: MatrixAnswer,
): number | null | undefined {
  if (!matrix || !answer.rowId || !answer.colId) return undefined;
  const rate = matrix.rates?.[answer.rowId]?.[answer.colId];
  return typeof rate === 'number' && isFinite(rate) ? rate : null;
}

interface Props {
  /** Owner's field title — rendered as the group caption above the selects. */
  label: string;
  /** Caption style from the parent (groupHeaderStyle / stackedLabelStyle). */
  labelStyle: CSSProperties;
  matrix?: TemplateRateMatrix;
  value: MatrixAnswer;
  onChange: (next: MatrixAnswer) => void;
  theme: WidgetTheme;
  /** Field-style base (filled/outline + radius) shared with sibling inputs. */
  inputBase: CSSProperties;
  radiusPx: string;
  fontFamily?: string;
  /** Contrast-guarded floated-label colour (matches sibling selects). */
  labelColor: string;
  labelLayout?: 'float' | 'stacked';
  fieldId: string;
}

const PLACEHOLDER = { id: '', label: 'Select…' };

export default function MatrixField({
  label, labelStyle, matrix, value, onChange,
  theme, inputBase, radiusPx, fontFamily, labelColor,
  labelLayout = 'float', fieldId,
}: Props) {
  const c = theme;

  if (!matrix || matrix.rows.length === 0 || matrix.cols.length === 0) {
    // Owner hasn't filled the grid yet (editor parity with the image/video
    // empty-slot placeholders). Customers shouldn't normally hit this.
    return (
      <div
        data-testid={`adv-matrix-placeholder-${fieldId}`}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4, padding: '24px 12px',
          border: `1px dashed ${c.border}`, borderRadius: radiusPx,
          color: c.textMuted, fontSize: '12px', fontFamily,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '22px' }}>▦</span>
        <span>Add rows, columns and rates in the field settings.</span>
      </div>
    );
  }

  const showRow = matrix.rows.length > 1 || matrix.cols.length <= 1;
  const showCol = matrix.cols.length > 1;
  const rowOptions = [PLACEHOLDER, ...matrix.rows.map((r) => ({ id: r.id, label: r.label }))];
  const colOptions = [PLACEHOLDER, ...matrix.cols.map((col) => ({ id: col.id, label: col.label }))];

  const rate = resolveMatrixRate(matrix, value);
  const missingCell = rate === null;
  const missingRule = matrix.missingCell ?? 'custom_quote';
  const noteFg = guardTextColor(c.textMuted, c.bg, 'matrixMissingCellNote');

  return (
    <div data-testid={`adv-matrix-${fieldId}`}>
      {label ? (
        <label className="qq-w-grouplabel" style={labelStyle}>{label}</label>
      ) : null}
      {/* auto-fit/minmax — side-by-side when the container affords ~2×210px,
          stacked otherwise (375 px mobile gets the stacked layout for free). */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '10px',
      }}>
        {showRow && (
          <WidgetSelect
            id={`adv-matrix-row-${fieldId}`}
            value={value.rowId}
            options={rowOptions}
            onChange={(id) => onChange({ ...value, rowId: id })}
            label={matrix.rowLabel || 'From'}
            theme={c}
            inputBase={inputBase}
            radiusPx={radiusPx}
            fontFamily={fontFamily}
            labelColor={labelColor}
            labelLayout={labelLayout}
          />
        )}
        {showCol && (
          <WidgetSelect
            id={`adv-matrix-col-${fieldId}`}
            value={value.colId}
            options={colOptions}
            onChange={(id) => onChange({ ...value, colId: id })}
            label={matrix.colLabel || 'To'}
            theme={c}
            inputBase={inputBase}
            radiusPx={radiusPx}
            fontFamily={fontFamily}
            labelColor={labelColor}
            labelLayout={labelLayout}
          />
        )}
      </div>
      {missingCell && missingRule === 'custom_quote' && (
        <p
          data-testid={`adv-matrix-customquote-${fieldId}`}
          style={{
            margin: '8px 0 0', fontSize: '12.5px', lineHeight: 1.45,
            color: noteFg, fontFamily,
          }}
        >
          This route is quoted individually — request a quote below and
          we&apos;ll get back to you with an exact price.
        </p>
      )}
    </div>
  );
}
