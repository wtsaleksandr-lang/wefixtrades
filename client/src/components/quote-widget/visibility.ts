import type { VisibilityCondition, StepDefinition } from '@shared/wizardSchema';
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

    case 'in':
      if (Array.isArray(cond.value)) {
        return cond.value.includes(String(actual));
      }
      return false;

    case 'not_in':
      if (Array.isArray(cond.value)) {
        return !cond.value.includes(String(actual));
      }
      return true;

    default:
      return false;
  }
}

/* ─── Step Navigation Helpers ─── */

/** Find the next visible step index after `currentIndex`. Returns `currentIndex` if none found. */
export function getNextVisibleStepIndex(
  steps: StepDefinition[],
  currentIndex: number,
  answers: WidgetAnswers,
): number {
  for (let i = currentIndex + 1; i < steps.length; i++) {
    if (evaluateVisibility(steps[i].visible_when, answers)) return i;
  }
  return currentIndex;
}

/** Find the previous visible step index before `currentIndex`. Returns `currentIndex` if none found. */
export function getPrevVisibleStepIndex(
  steps: StepDefinition[],
  currentIndex: number,
  answers: WidgetAnswers,
): number {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (evaluateVisibility(steps[i].visible_when, answers)) return i;
  }
  return currentIndex;
}

/** Count of steps that are currently visible. */
export function countVisibleSteps(
  steps: StepDefinition[],
  answers: WidgetAnswers,
): number {
  return steps.filter((s) => evaluateVisibility(s.visible_when, answers)).length;
}

/** 1-based position of `currentIndex` among visible steps. */
export function getVisibleStepPosition(
  steps: StepDefinition[],
  currentIndex: number,
  answers: WidgetAnswers,
): number {
  let position = 0;
  for (let i = 0; i <= currentIndex && i < steps.length; i++) {
    if (evaluateVisibility(steps[i].visible_when, answers)) position++;
  }
  return position;
}

/** Snap to the nearest visible step. Tries forward first, then backward. Falls back to 0. */
export function getNearestVisibleStepIndex(
  steps: StepDefinition[],
  currentIndex: number,
  answers: WidgetAnswers,
): number {
  if (steps[currentIndex] && evaluateVisibility(steps[currentIndex].visible_when, answers)) {
    return currentIndex;
  }
  const next = getNextVisibleStepIndex(steps, currentIndex, answers);
  if (next !== currentIndex) return next;
  const prev = getPrevVisibleStepIndex(steps, currentIndex, answers);
  if (prev !== currentIndex) return prev;
  return 0;
}
