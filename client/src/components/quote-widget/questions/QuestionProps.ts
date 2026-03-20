import type { QuestionDefinition } from '@shared/wizardSchema';

/**
 * Shared prop contract for all atomic question components.
 * Every question component receives the same shape — the
 * StepRenderer passes these through without knowing the type.
 */
export interface QuestionComponentProps {
  question: QuestionDefinition;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[]) => void;
  accentColor?: string;
}
