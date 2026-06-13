// buildLeadFormConfig — single source of truth for the calculator's
// `calculator_settings.lead_form` block that carries owner-defined custom
// lead-form fields.
//
// Why this exists (LEAD-FORM-FIELDS):
//   The published widget's LeadCaptureStep reads
//   `calculator_settings.lead_form.custom_fields[]` and renders each entry
//   below the standard Name / Email / Phone inputs, merging submitted values
//   into the /api/leads `answers` payload. The wizard's Action tab lets the
//   owner author those fields (settings.leadFields). This helper maps the
//   wizard slot onto the exact server-schema shape
//   (shared/schemas/calculator.ts → lead_form.custom_fields) so the live
//   PREVIEW and the persisted/published widget render byte-identical fields —
//   the two can never drift.
//
// Pure + typed: no React, no side effects.

import type { LeadCustomField, LeadFieldType, ShellSettings } from './types';

const LEAD_FIELD_TYPES: ReadonlySet<LeadFieldType> = new Set<LeadFieldType>([
  'text', 'email', 'phone', 'number', 'select', 'textarea', 'checkbox',
]);

/** One server-schema custom_fields[] entry (mirrors lead_form.custom_fields). */
export interface LeadFormCustomFieldOut {
  id: string;
  type: LeadFieldType;
  label: string;
  required: boolean;
  options: string[];
}

/**
 * Normalise a wizard `LeadCustomField` into the persisted shape, dropping
 * anything malformed (blank label, unknown type) so a half-authored row never
 * reaches the published widget. `select` keeps only non-empty option strings.
 */
function normalizeField(f: LeadCustomField): LeadFormCustomFieldOut | null {
  if (!f || typeof f !== 'object') return null;
  const label = (f.label ?? '').trim();
  if (!label) return null;
  if (!LEAD_FIELD_TYPES.has(f.type)) return null;
  const options =
    f.type === 'select'
      ? (Array.isArray(f.options) ? f.options.map((o) => String(o ?? '').trim()).filter(Boolean) : [])
      : [];
  // A select with no usable options would render an empty dropdown — drop it.
  if (f.type === 'select' && options.length === 0) return null;
  return {
    id: String(f.id || label),
    type: f.type,
    label,
    required: f.required === true,
    options,
  };
}

/**
 * Build the `calculator_settings.lead_form` block from the wizard settings.
 * Returns `undefined` when there are no valid custom fields, so callers can
 * spread it conditionally and leave the payload byte-identical to before when
 * the owner hasn't added any (no empty `lead_form` object churn).
 */
export function buildLeadFormConfig(
  settings: ShellSettings | undefined,
): { custom_fields: LeadFormCustomFieldOut[] } | undefined {
  const raw = settings?.leadFields;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const custom_fields = raw
    .map(normalizeField)
    .filter((f): f is LeadFormCustomFieldOut => f !== null);
  if (custom_fields.length === 0) return undefined;
  return { custom_fields };
}
