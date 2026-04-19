import { useContext, useCallback } from 'react';
import { WidgetContext } from './WidgetContext';
import { calculateEstimate } from '@shared/calculateEstimate';
import type { LeadFormData } from './types';
import {
  getNextVisibleStepIndex,
  getPrevVisibleStepIndex,
  countVisibleSteps,
  getVisibleStepPosition,
} from './visibility';

/**
 * Convenience hook for accessing widget state and dispatching actions.
 * Must be used within a <WidgetProvider>.
 */
export function useWidgetState() {
  const ctx = useContext(WidgetContext);
  if (!ctx) {
    throw new Error('useWidgetState must be used within a <WidgetProvider>');
  }

  const { state, dispatch, config, currentStep, totalSteps } = ctx;

  /* ─── Answer Helpers ─── */

  const setAnswer = useCallback(
    (questionId: string, value: string | number | boolean | string[]) => {
      dispatch({ type: 'SET_ANSWER', questionId, value });
    },
    [dispatch],
  );

  const getAnswer = useCallback(
    (questionId: string) => state.answers[questionId],
    [state.answers],
  );

  /* ─── Navigation (visibility-aware) ─── */

  const steps = config.flow.steps;

  const nextStep = useCallback(() => {
    const target = getNextVisibleStepIndex(steps, state.currentStepIndex, state.answers);
    if (target !== state.currentStepIndex) {
      dispatch({ type: 'GO_TO_STEP', index: target });
    }
  }, [dispatch, steps, state.currentStepIndex, state.answers]);

  const prevStep = useCallback(() => {
    const target = getPrevVisibleStepIndex(steps, state.currentStepIndex, state.answers);
    if (target !== state.currentStepIndex) {
      dispatch({ type: 'GO_TO_STEP', index: target });
    }
  }, [dispatch, steps, state.currentStepIndex, state.answers]);

  const goToStep = useCallback(
    (index: number) => dispatch({ type: 'GO_TO_STEP', index }),
    [dispatch],
  );

  const isFirstStep = getPrevVisibleStepIndex(steps, state.currentStepIndex, state.answers) === state.currentStepIndex;
  const isLastStep = getNextVisibleStepIndex(steps, state.currentStepIndex, state.answers) === state.currentStepIndex;

  const visibleStepCount = countVisibleSteps(steps, state.answers);
  const visibleStepPosition = getVisibleStepPosition(steps, state.currentStepIndex, state.answers);

  /* ─── Pricing ─── */

  const recalculate = useCallback(() => {
    const result = calculateEstimate(config.pricingConfig, state.estimateInputs);
    dispatch({ type: 'SET_ESTIMATE', estimate: result });
    return result;
  }, [config.pricingConfig, state.estimateInputs, dispatch]);

  /* ─── Lead Form ─── */

  const updateLead = useCallback(
    (field: keyof LeadFormData, value: string) => {
      dispatch({ type: 'UPDATE_LEAD', field, value });
    },
    [dispatch],
  );

  return {
    // Raw state + dispatch for edge cases
    state,
    dispatch,

    // Config (immutable after mount)
    config,

    // Current step
    currentStep,
    totalSteps,
    currentStepIndex: state.currentStepIndex,

    // Answers
    answers: state.answers,
    setAnswer,
    getAnswer,

    // Navigation
    nextStep,
    prevStep,
    goToStep,
    isFirstStep,
    isLastStep,
    visibleStepCount,
    visibleStepPosition,

    // Pricing
    estimate: state.estimate,
    estimateInputs: state.estimateInputs,
    recalculate,

    // Lead
    leadData: state.lead.data,
    leadSubmitted: state.lead.submitted,
    updateLead,

    // Coupon
    coupon: state.coupon,

    // Booking
    booking: state.booking,

    // Expiration
    expiration: state.expiration,
  };
}
