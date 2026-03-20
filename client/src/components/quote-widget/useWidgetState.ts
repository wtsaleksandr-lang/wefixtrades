import { useContext, useCallback, useMemo } from 'react';
import { WidgetContext } from './WidgetContext';
import { calculateEstimate } from '@shared/calculateEstimate';
import type { WidgetAction, LeadFormData } from './types';

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

  /* ─── Navigation ─── */

  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), [dispatch]);
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), [dispatch]);
  const goToStep = useCallback(
    (index: number) => dispatch({ type: 'GO_TO_STEP', index }),
    [dispatch],
  );

  const isFirstStep = state.currentStepIndex === 0;
  const isLastStep = state.currentStepIndex === totalSteps - 1;

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
