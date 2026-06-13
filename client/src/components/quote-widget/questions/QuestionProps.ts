import type { QuestionDefinition } from '@shared/wizardSchema';

/**
 * Shared prop contract for all atomic question components.
 * Every question component receives the same shape — the
 * StepRenderer passes these through without knowing the type.
 */
export interface QuestionComponentProps {
  question: QuestionDefinition;
  value: string | number | boolean | string[] | undefined;
  /**
   * Emit a new value, or `undefined` to clear the answer entirely.
   * Clearing removes the answer so pricing falls back to its default
   * (used by number inputs when the field is blanked for re-entry).
   */
  onChange: (value: string | number | boolean | string[] | undefined) => void;
  accentColor?: string;
}
