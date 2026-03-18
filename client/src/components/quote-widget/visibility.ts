import type { VisibilityCondition } from '@shared/wizardSchema';
import type { WidgetAnswers } from './types';

/**
 * Evaluates an array of visibility conditions against current answers.
 * All conditions must pass (AND logic).
 */
export function evaluateVisibility(
  conditions: VisibilityCondition[],
  answers: WidgetAnswers,
): boolean {
  return conditions.every((cond) => evaluateCondition(cond, answers));
}

function evaluateCondition(cond: VisibilityCondition, answers: WidgetAnswers): boolean {
  const actual = answers[cond.field];
  if (actual === undefined) return false;

  switch (cond.operator) {
    case 'equals':
      return actual === cond.value;

    case 'not_equals':
      return actual !== cond.value;

    case 'greater_than':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;

    case 'less_than':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;

    case 'includes':
      if (Array.isArray(actual) && typeof cond.value === 'string') {
        return actual.includes(cond.value);
      }
      if (typeof actual === 'string' && typeof cond.value === 'string') {
        return actual.includes(cond.value);
      }
      return false;

    case 'not_includes':
      if (Array.isArray(actual) && typeof cond.value === 'string') {
        return !actual.includes(cond.value);
      }
      if (typeof actual === 'string' && typeof cond.value === 'string') {
        return !actual.includes(cond.value);
      }
      return true;

    default:
      return false;
  }
}
