import type { WizardFlow, StepDefinition } from '@shared/wizardSchema';
import type { EstimateResult } from '@shared/calculateEstimate';
import type { PricingConfigV1 } from '@shared/pricingConfig';
import type { TemplateDefinition } from '@shared/templateLibrary';

/* ─── Calculator Data (passed from page) ─── */

export interface CalculatorData {
  id: number;
  slug: string;
  business_name: string;
  tagline?: string;
  logo_url?: string;
  primary_color?: string;
  pricing_config: unknown;
  theme_overrides?: Record<string, unknown>;
  cta_button_text?: string;
  lead_thank_you_message?: string;
  calculator_settings?: Record<string, unknown>;
}

/* ─── Answer Collection ─── */

/** All answers keyed by question ID */
export type WidgetAnswers = Record<string, string | number | boolean | string[]>;

/* ─── Lead Form ─── */

export interface LeadFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
}

/* ─── Coupon ─── */

export interface AppliedCoupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  applies_to: string;
}

/* ─── Booking ─── */

export interface BookingData {
  selectedDate: string;
  selectedTime: string;
  customer: { name: string; email: string; phone: string };
}

/* ─── Widget State ─── */

export interface WidgetState {
  /** Current step index in the flow */
  currentStepIndex: number;

  /** All user answers keyed by question ID */
  answers: WidgetAnswers;

  /** Pricing engine inputs derived from answers */
  estimateInputs: {
    quantity: number;
    selectedTierIndex: number;
    selectedAddOnIds: string[];
    selectedDifficultyId: string;
    isAfterHours: boolean;
  };

  /** Cached estimate result from calculateEstimate() */
  estimate: EstimateResult | null;

  /** Lead capture state */
  lead: {
    data: LeadFormData;
    smsConsent: boolean;
    submitted: boolean;
  };

  /** Coupon state */
  coupon: {
    input: string;
    expanded: boolean;
    loading: boolean;
    error: string | null;
    applied: AppliedCoupon | null;
  };

  /** Quote expiration state */
  expiration: {
    generatedAt: number | null;
    expired: boolean;
  };

  /** Booking state */
  booking: {
    active: boolean;
    confirmed: boolean;
    data: BookingData;
    availableSlots: string[];
    loadingSlots: boolean;
  };
}

/* ─── Widget Actions (useReducer dispatch) ─── */

export type WidgetAction =
  | { type: 'SET_ANSWER'; questionId: string; value: string | number | boolean | string[] }
  | { type: 'GO_TO_STEP'; index: number }
  | { type: 'CLEAR_HIDDEN_ANSWERS'; questionIds: string[] }
  | { type: 'SET_ESTIMATE'; estimate: EstimateResult }
  // NEXT_STEP / PREV_STEP removed — all navigation uses GO_TO_STEP
  // via visibility-aware helpers in useWidgetState.ts
  | { type: 'UPDATE_LEAD'; field: keyof LeadFormData; value: string }
  | { type: 'SET_SMS_CONSENT'; value: boolean }
  | { type: 'MARK_LEAD_SUBMITTED' }
  | { type: 'SET_COUPON_INPUT'; value: string }
  | { type: 'SET_COUPON_EXPANDED'; value: boolean }
  | { type: 'SET_COUPON_LOADING'; value: boolean }
  | { type: 'SET_COUPON_ERROR'; error: string | null }
  | { type: 'APPLY_COUPON'; coupon: AppliedCoupon }
  | { type: 'CLEAR_COUPON' }
  | { type: 'SET_EXPIRATION'; generatedAt: number }
  | { type: 'MARK_EXPIRED' }
  | { type: 'SET_BOOKING_ACTIVE'; value: boolean }
  | { type: 'SET_BOOKING_DATE'; date: string }
  | { type: 'SET_BOOKING_TIME'; time: string }
  | { type: 'SET_BOOKING_CUSTOMER'; field: keyof BookingData['customer']; value: string }
  | { type: 'SET_AVAILABLE_SLOTS'; slots: string[] }
  | { type: 'SET_LOADING_SLOTS'; value: boolean }
  | { type: 'CONFIRM_BOOKING' };

/* ─── Widget Config (derived at mount, not state) ─── */

export interface WidgetConfig {
  calculator: CalculatorData;
  pricingConfig: PricingConfigV1;
  template: TemplateDefinition;
  flow: WizardFlow;
  isEmbed: boolean;
}
