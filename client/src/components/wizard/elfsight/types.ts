// Shared types for the Elfsight-clone editor shell (Wave H1).
//
// In H1 the new shell carries the minimum state needed to keep the live
// preview reactive — businessName + the layout used for the placeholder
// preview config. Subsequent waves (H2-H7) widen this shape as each tab's
// content is wired up.

import type { TemplateLayout } from '@shared/templatePresets';

export type EditorTab = 'build' | 'style' | 'settings' | 'install';

export const EDITOR_TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
  { id: 'install', label: 'Install' },
];

export type PreviewDevice = 'desktop' | 'mobile';

/** Minimal H1 shell state. State plumbing intentionally mirrors the legacy
 *  `WizardState.businessName` field so the persist round-trip stays compatible. */
export interface ShellState {
  businessName: string;
  layout: TemplateLayout;
}

export const INITIAL_SHELL_STATE: ShellState = {
  businessName: '',
  layout: 'two-column',
};
