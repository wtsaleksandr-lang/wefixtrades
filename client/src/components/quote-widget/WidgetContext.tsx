import { createContext, useReducer, useMemo, type ReactNode } from 'react';
import type {
  WidgetState,
  WidgetAction,
  WidgetConfig,
  WidgetAnswers,
} from './types';
import type { WizardFlow, StepDefinition } from '@shared/wizardSchema';

/* ─── Initial State ─── */

export const initialWidgetState: WidgetState = {
  currentStepIndex: 0,
  answers: {},
  estimateInputs: {
    quantity: 1,
    selectedTierIndex: 0,
    selectedAddOnIds: [],
    selectedDifficultyId: '',
    isAfterHours: false,
  },
  estimate: null,
  lead: {
    data: { name: '', email: '', phone: '', company: '' },
    smsConsent: false,
    submitted: false,
  },
  coupon: {
    input: '',
    expanded: false,
    loading: false,
    error: null,
    applied: null,
  },
  expiration: {
    generatedAt: null,
    expired: false,
  },
  booking: {
    active: false,
    confirmed: false,
    data: {
      selectedDate: '',
      selectedTime: '',
      customer: { name: '', email: '', phone: '' },
    },
    availableSlots: [],
    loadingSlots: false,
  },
};

/* ─── Estimate Input Mapping ─── */

/**
 * When an answer changes, check if the question has a `maps_to` binding
 * and update the corresponding estimateInputs field.
 */
function updateEstimateInputs(
  current: WidgetState['estimateInputs'],
  flow: WizardFlow,
  questionId: string,
  value: string | number | boolean | string[],
): WidgetState['estimateInputs'] {
  // Find the question definition to check maps_to
  for (const step of flow.steps) {
    if (!Array.isArray(step.questions)) continue;
    for (const q of step.questions) {
      if (q.id === questionId && q.maps_to) {
        const updated = { ...current };
        switch (q.maps_to) {
          case 'quantity':
            updated.quantity = typeof value === 'number' ? value : Number(value) || 1;
            break;
          case 'selected_tier_index':
            updated.selectedTierIndex = typeof value === 'number' ? value : Number(value) || 0;
            break;
          case 'selected_add_on_ids':
            updated.selectedAddOnIds = Array.isArray(value) ? value : [String(value)];
            break;
          case 'selected_difficulty_id':
            updated.selectedDifficultyId = String(value);
            break;
          case 'is_after_hours':
            updated.isAfterHours = Boolean(value);
            break;
        }
        return updated;
      }
    }
  }
  return current;
}

/* ─── Reducer ─── */

function createWidgetReducer(flow: WizardFlow) {
  const totalSteps = flow.steps.length;

  return function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
    switch (action.type) {
      case 'SET_ANSWER':
        return {
          ...state,
          answers: { ...state.answers, [action.questionId]: action.value },
          estimateInputs: updateEstimateInputs(
            state.estimateInputs,
            flow,
            action.questionId,
            action.value,
          ),
        };

      case 'GO_TO_STEP':
        return {
          ...state,
          currentStepIndex: Math.max(0, Math.min(action.index, totalSteps - 1)),
        };

      case 'NEXT_STEP':
        return {
          ...state,
          currentStepIndex: Math.min(state.currentStepIndex + 1, totalSteps - 1),
        };

      case 'PREV_STEP':
        return {
          ...state,
          currentStepIndex: Math.max(state.currentStepIndex - 1, 0),
        };

      case 'SET_ESTIMATE':
        return { ...state, estimate: action.estimate };

      case 'UPDATE_LEAD':
        return {
          ...state,
          lead: {
            ...state.lead,
            data: { ...state.lead.data, [action.field]: action.value },
          },
        };

      case 'SET_SMS_CONSENT':
        return { ...state, lead: { ...state.lead, smsConsent: action.value } };

      case 'MARK_LEAD_SUBMITTED':
        return { ...state, lead: { ...state.lead, submitted: true } };

      case 'SET_COUPON_INPUT':
        return { ...state, coupon: { ...state.coupon, input: action.value } };

      case 'SET_COUPON_EXPANDED':
        return { ...state, coupon: { ...state.coupon, expanded: action.value } };

      case 'SET_COUPON_LOADING':
        return { ...state, coupon: { ...state.coupon, loading: action.value } };

      case 'SET_COUPON_ERROR':
        return { ...state, coupon: { ...state.coupon, error: action.error } };

      case 'APPLY_COUPON':
        return {
          ...state,
          coupon: { ...state.coupon, applied: action.coupon, error: null, loading: false },
        };

      case 'CLEAR_COUPON':
        return {
          ...state,
          coupon: { ...state.coupon, applied: null, input: '', error: null },
        };

      case 'SET_EXPIRATION':
        return {
          ...state,
          expiration: { generatedAt: action.generatedAt, expired: false },
        };

      case 'MARK_EXPIRED':
        return {
          ...state,
          expiration: { ...state.expiration, expired: true },
        };

      case 'SET_BOOKING_ACTIVE':
        return { ...state, booking: { ...state.booking, active: action.value } };

      case 'SET_BOOKING_DATE':
        return {
          ...state,
          booking: {
            ...state.booking,
            data: { ...state.booking.data, selectedDate: action.date },
          },
        };

      case 'SET_BOOKING_TIME':
        return {
          ...state,
          booking: {
            ...state.booking,
            data: { ...state.booking.data, selectedTime: action.time },
          },
        };

      case 'SET_BOOKING_CUSTOMER':
        return {
          ...state,
          booking: {
            ...state.booking,
            data: {
              ...state.booking.data,
              customer: { ...state.booking.data.customer, [action.field]: action.value },
            },
          },
        };

      case 'SET_AVAILABLE_SLOTS':
        return { ...state, booking: { ...state.booking, availableSlots: action.slots } };

      case 'SET_LOADING_SLOTS':
        return { ...state, booking: { ...state.booking, loadingSlots: action.value } };

      case 'CONFIRM_BOOKING':
        return { ...state, booking: { ...state.booking, confirmed: true } };

      default:
        return state;
    }
  };
}

/* ─── Context ─── */

export interface WidgetContextValue {
  state: WidgetState;
  dispatch: React.Dispatch<WidgetAction>;
  config: WidgetConfig;
  /** The current step definition from the flow */
  currentStep: StepDefinition;
  /** Total visible steps (after visibility filtering) */
  totalSteps: number;
}

export const WidgetContext = createContext<WidgetContextValue | null>(null);

/* ─── Provider ─── */

interface WidgetProviderProps {
  config: WidgetConfig;
  children: ReactNode;
}

export function WidgetProvider({ config, children }: WidgetProviderProps) {
  const reducer = useMemo(() => createWidgetReducer(config.flow), [config.flow]);

  // Build initial state with default values from question definitions.
  // This ensures estimateInputs reflect defaults even if the user never
  // interacts with a question (Bug 5+7: defaults not populated on mount).
  const initialState = useMemo(() => {
    let state = { ...initialWidgetState, answers: { ...initialWidgetState.answers } };
    let inputs = { ...state.estimateInputs };

    for (const step of config.flow.steps) {
      // Guard: steps may lack a questions array (e.g. confirmation, booking)
      if (!Array.isArray(step.questions)) continue;
      for (const q of step.questions) {
        if (q.default_value !== undefined) {
          state.answers[q.id] = q.default_value;

          // Mirror default into estimateInputs if question has maps_to
          if (q.maps_to) {
            switch (q.maps_to) {
              case 'quantity':
                inputs.quantity = typeof q.default_value === 'number' ? q.default_value : Number(q.default_value) || 1;
                break;
              case 'selected_tier_index':
                inputs.selectedTierIndex = typeof q.default_value === 'number' ? q.default_value : Number(q.default_value) || 0;
                break;
              case 'selected_add_on_ids':
                inputs.selectedAddOnIds = Array.isArray(q.default_value) ? q.default_value : [String(q.default_value)];
                break;
              case 'selected_difficulty_id':
                inputs.selectedDifficultyId = String(q.default_value);
                break;
              case 'is_after_hours':
                inputs.isAfterHours = Boolean(q.default_value);
                break;
            }
          }
        }
      }
    }

    state.estimateInputs = inputs;
    return state;
  }, [config.flow]);

  const [state, dispatch] = useReducer(reducer, initialState);

  const steps = config.flow.steps;
  const safeIndex = Math.max(0, Math.min(state.currentStepIndex, steps.length - 1));
  const currentStep = steps[safeIndex] ?? steps[0];
  const totalSteps = steps.length;

  const value = useMemo<WidgetContextValue>(
    () => ({ state, dispatch, config, currentStep, totalSteps }),
    [state, config, currentStep, totalSteps],
  );

  return (
    <WidgetContext.Provider value={value}>
      {children}
    </WidgetContext.Provider>
  );
}
