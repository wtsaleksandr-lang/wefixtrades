import type { VisibilityCondition } from '@shared/wizardSchema';
import type { WidgetAnswers } from './types';

/**
 * Evaluates an array of visibility conditions against current answers.
 * All conditions must pass (AND logic).
 */
export function evaluateVisibility(
  conditions: VisibilityCondition[] | undefined | null,
  answers: WidgetAnswers,
): boolean {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((cond) => evaluateCondition(cond, answers));
}

function evaluateCondition(cond: VisibilityCondition, answers: WidgetAnswers): boolean {
  const actual = answers[cond.field];
  if (actual === undefined || actual === null) return false;

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
