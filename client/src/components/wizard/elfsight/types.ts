// Shared types for the Elfsight-clone editor shell.
//
// Wave H1 — minimum: businessName + layout (drives the placeholder preview).
// Wave H2 — adds `fields: TemplateField[]` and `calculations: TemplateCalculation[]`
// so the Build > Fields panel can drive the live preview directly. Calculations
// are seeded but not yet user-editable (lands in H3).

import type { TemplateLayout, TemplateField, TemplateCalculation } from '@shared/templatePresets';

export type EditorTab = 'build' | 'style' | 'settings' | 'install';

export const EDITOR_TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
  { id: 'install', label: 'Install' },
];

export type PreviewDevice = 'desktop' | 'mobile';

/**
 * The 6 public field-type slots in the Build > Fields > Add picker.
 *
 * The spec uses friendly names (`dropdown`, `choice`, `imageChoice`) while
 * the canonical `TemplateField['type']` enum uses the engine names
 * (`select`, `radio`, `image_choice`). Map between them with
 * `PUBLIC_TO_FIELD_TYPE` / `FIELD_TYPE_TO_PUBLIC` below.
 */
export type PublicFieldType =
  | 'slider' | 'number' | 'dropdown' | 'choice' | 'imageChoice' | 'heading';

export const PUBLIC_TO_FIELD_TYPE: Record<PublicFieldType, TemplateField['type']> = {
  slider: 'slider',
  number: 'number',
  dropdown: 'select',
  choice: 'radio',
  imageChoice: 'image_choice',
  heading: 'heading',
};

export const FIELD_TYPE_TO_PUBLIC: Partial<Record<TemplateField['type'], PublicFieldType>> = {
  slider: 'slider',
  number: 'number',
  select: 'dropdown',
  radio: 'choice',
  image_choice: 'imageChoice',
  heading: 'heading',
};

/** Header overrides — Wave H4. Both optional; blank values fall back to
 *  the AdvancedCalculator's defaults (businessName / no subtitle). */
export interface ShellHeader {
  title?: string;
  subtitle?: string;
}

/** Results overrides — Wave H4. Optional. */
export interface ShellResults {
  heading?: string;
  footnote?: string;
}

/**
 * H2 shell state — carries the live, editable fields list. H4 adds optional
 * header / results overrides + a `resultCalcId` carrying the user's
 * explicit headline choice (an id rather than a name, to survive renames).
 */
export interface ShellState {
  businessName: string;
  layout: TemplateLayout;
  fields: TemplateField[];
  calculations: TemplateCalculation[];
  /** H4 — header overrides (title / subtitle). */
  header?: ShellHeader;
  /** H4 — result-panel overrides (heading / footnote). */
  results?: ShellResults;
  /** H4 — the calc id (not name) chosen as the headline. */
  resultCalcId?: string;
}

export const INITIAL_SHELL_STATE: ShellState = {
  businessName: '',
  layout: 'two-column',
  fields: [],
  calculations: [],
  header: {},
  results: {},
};
