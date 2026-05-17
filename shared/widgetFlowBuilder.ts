import type { PricingConfigV1 } from './pricingConfig';
import type { TemplateDefinition } from './templateLibrary';
import type { WizardFlow, StepDefinition, QuestionDefinition } from './wizardSchema';
import { getSliderConfig } from './sliderMappings';

/**
 * Widget Flow Builder
 *
 * Converts a PricingConfigV1 + TemplateDefinition + calculator settings
 * into a renderable WizardFlow. This is the bridge between "what the
 * business configured" and "what the customer sees".
 *
 * The builder does NOT mutate any input. It produces a fresh WizardFlow
 * that the step renderer consumes.
 */

/* ─── Settings extracted from calculator_settings JSONB ─── */

export interface FlowBuilderSettings {
  /** e.g. 'estimate_only' | 'estimate_plus_booking' */
  calculatorType?: string;
  /** Lead form config from calculator_settings.lead_form */
  leadForm?: {
    fields?: Record<string, boolean>;
    cta_text?: string;
  };
  /**
   * Post-quote action config from calculator_settings.action. When `mode` is
   * 'none' or 'redirect' the lead_capture step is dropped from the flow.
   */
  action?: {
    mode?: 'lead_form' | 'redirect' | 'none';
    redirect?: { heading?: string; caption?: string; button_text?: string; button_url?: string };
  };
  /** Booking enabled */
  bookingEnabled?: boolean;
  /** Promotions/coupon enabled */
  promotionsEnabled?: boolean;
  /** Quote rules (expiration) */
  quoteRules?: {
    expiration_enabled?: boolean;
    valid_days?: number;
  };
  /** Service type options for the service_type select question */
  serviceTypes?: Array<{ value: string; label: string }>;
  /** Trade-specific input definitions */
  tradeInputs?: Record<string, unknown>;
  /**
   * Owner edits to auto-generated fields, keyed by question id
   * (calculator_settings.field_overrides). Applied as a final post-pass.
   */
  fieldOverrides?: Record<string, {
    label?: string; min?: number; max?: number; step?: number; hidden?: boolean;
  }>;
}

/**
 * Apply owner field overrides (label / min / max / step / hidden) to a built
 * flow. A hidden question is dropped; an input step left with no questions is
 * dropped too, so the customer never sees an empty step.
 */
function applyFieldOverrides(flow: WizardFlow, overrides?: FlowBuilderSettings['fieldOverrides']): WizardFlow {
  if (!overrides || Object.keys(overrides).length === 0) return flow;
  const steps: StepDefinition[] = [];
  for (const step of flow.steps) {
    const questions = (step.questions || [])
      .filter((q) => !overrides[q.id]?.hidden)
      .map((q) => {
        const o = overrides[q.id];
        if (!o) return q;
        return {
          ...q,
          ...(o.label !== undefined ? { label: o.label } : {}),
          ...(o.min !== undefined ? { min: o.min } : {}),
          ...(o.max !== undefined ? { max: o.max } : {}),
          ...(o.step !== undefined ? { step: o.step } : {}),
        };
      });
    // Drop input steps that lost their only question.
    const isInputStep = ['question', 'multi_question', 'package_selection', 'addon_selection'].includes(step.type);
    if (isInputStep && (step.questions?.length || 0) > 0 && questions.length === 0) continue;
    steps.push({ ...step, questions });
  }
  return { ...flow, steps };
}

/* ─── Builder ─── */

export function buildWidgetFlow(
  pricingConfig: PricingConfigV1,
  template: TemplateDefinition,
  settings: FlowBuilderSettings = {},
): WizardFlow {
  // Whether the post-quote lead_capture step is part of the flow.
  // 'redirect' / 'none' action modes drop it; default is 'lead_form'.
  const includeLeadCapture = (settings.action?.mode ?? 'lead_form') === 'lead_form';

  // If the template already has wizard_steps, use them directly.
  // This allows fully custom flows defined at the template level.
  // Populate any empty service_type select options from calculator settings.
  if (template.wizard_steps && template.wizard_steps.length > 0) {
    const serviceTypes: Array<{ value: string; label: string }> =
      (settings as any).serviceTypes ?? [];

    const rawSteps = template.wizard_steps.map((step) => {
      if (!serviceTypes.length || step.type !== 'question') return step;
      const questions = step.questions.map((q) => {
        if (q.id === 'service_type' && q.type === 'select' && (!q.options || q.options.length === 0)) {
          return { ...q, options: serviceTypes };
        }
        return q;
      });
      return { ...step, questions };
    });

    const steps = includeLeadCapture
      ? rawSteps
      : rawSteps.filter((s) => s.type !== 'lead_capture');

    return applyFieldOverrides({
      version: 1,
      id: `flow_${template.id}`,
      name: template.name,
      steps,
      settings: {
        progress_style: template.layout_style === 'multi_step' ? 'bar' : 'hidden',
        allow_back_navigation: true,
        show_step_count: template.layout_style === 'multi_step',
        mobile_optimized: true,
      },
    }, settings.fieldOverrides);
  }

  // Otherwise, generate steps from the pricing config
  const steps: StepDefinition[] = [];

  // Step 1: Input questions (pricing-type-specific)
  const inputSteps = buildInputSteps(pricingConfig);
  steps.push(...inputSteps);

  // Step 2: Add-on selection (if config has add-ons)
  const addOnStep = buildAddOnStep(pricingConfig);
  if (addOnStep) steps.push(addOnStep);

  // Step 3: Price reveal
  steps.push(buildPriceRevealStep(pricingConfig));

  // Step 4: Lead capture — present unless the action mode is 'none'/'redirect'
  if (includeLeadCapture) {
    steps.push(buildLeadCaptureStep(settings));
  }

  // Step 5: Booking (if enabled)
  if (settings.bookingEnabled) {
    steps.push(buildBookingStep());
  }

  // Step 6: Confirmation
  steps.push(buildConfirmationStep());

  const isMultiStep = template.layout_style === 'multi_step' || steps.length > 3;

  return applyFieldOverrides({
    version: 1,
    id: `flow_${template.id}_${pricingConfig.pricingType}`,
    name: template.name,
    steps,
    settings: {
      progress_style: isMultiStep ? 'bar' : 'hidden',
      allow_back_navigation: true,
      show_step_count: isMultiStep,
      mobile_optimized: true,
    },
  }, settings.fieldOverrides);
}

/* ─── Input Step Builders (per pricing type) ─── */

function buildInputSteps(config: PricingConfigV1): StepDefinition[] {
  switch (config.pricingType) {
    case 'hourly':
      return [buildRateQuantityStep('How many hours?', 'hour', 'hours', 'hours')];

    case 'per_unit':
      return [buildRateQuantityStep('How many do you need?', config.unitName, `${config.unitName}s`, config.unitName)];

    case 'per_sqft':
      return [buildRateQuantityStep('What\'s the area?', 'sq ft', 'sq ft', 'sqft')];

    case 'per_linear_ft':
      return [buildRateQuantityStep('What\'s the length?', 'linear ft', 'linear ft', 'linear_ft')];

    case 'base_plus_rate':
      return [buildRateQuantityStep('How many do you need?', config.unitName, `${config.unitName}s`, config.unitName)];

    case 'tiered_packages':
      return [buildPackageSelectionStep(config.tiers)];

    case 'tiered_ranges':
      return [buildRateQuantityStep('What quantity?', config.unitName, `${config.unitName}s`, config.unitName)];

    case 'min_charge_plus_addons':
      // No quantity input needed — just show the minimum charge with add-ons
      return [];

    case 'price_range_only':
      // No input needed — skip straight to price reveal
      return [];

    case 'call_for_quote_only':
      // No input needed — skip straight to lead capture
      return [];

    default:
      return [];
  }
}

/* ─── Reusable Step Builders ─── */

function buildRateQuantityStep(
  title: string,
  unitSingular: string,
  unitPlural: string,
  sliderKey: string,
): StepDefinition {
  const sliderConfig = getSliderConfig(sliderKey);
  const question: QuestionDefinition = {
    id: 'quantity',
    type: sliderConfig ? 'slider' : 'number_input',
    label: title,
    maps_to: 'quantity',
    default_value: sliderConfig?.min ?? 1,
    validation: [{ type: 'required', value: true }],
    ...(sliderConfig && {
      min: sliderConfig.min,
      max: sliderConfig.max,
      step: sliderConfig.step,
      unit_suffix: sliderConfig.unitSuffix || unitPlural,
    }),
    ...(!sliderConfig && {
      placeholder: `Enter ${unitPlural}`,
      min: 1,
    }),
  };

  return {
    id: 'input_quantity',
    type: 'question',
    title,
    questions: [question],
    help: {
      title: 'Sizing your job',
      items: [
        { question: 'What if I\'m not sure of the exact amount?', answer: 'Give your best estimate. You can always discuss the details with your service provider before confirming.' },
        { question: 'Does this affect my final price?', answer: 'This gives you a ballpark estimate. Your final quote may vary based on the specifics of your project.' },
        { question: 'Can I change this later?', answer: 'Yes. This is just for your estimate. Nothing is locked in until you confirm with the provider.' },
      ],
      cta: 'Not sure about sizing? The service provider can help you measure and scope your project.',
    },
    config: { show_progress: true, can_skip: false, auto_advance: false },
  };
}

function buildPackageSelectionStep(
  tiers: Array<{ label: string; price: number }>,
): StepDefinition {
  const question: QuestionDefinition = {
    id: 'package_tier',
    type: 'package_card',
    label: 'Choose your package',
    maps_to: 'selected_tier_index',
    default_value: 0,
    packages: tiers.map((tier, i) => ({
      id: String(i),
      label: tier.label,
      price: tier.price,
      features: [],
      highlighted: i === 1, // Middle tier highlighted by default
    })),
    validation: [{ type: 'required', value: true }],
  };

  return {
    id: 'input_packages',
    type: 'package_selection',
    title: 'Select a package',
    questions: [question],
    help: {
      title: 'How do packages work?',
      items: [
        { question: 'What are packages?', answer: 'Packages let you choose between Good, Better, and Best options based on your budget and needs.' },
        { question: 'Can I change my package later?', answer: 'Yes. This is just for your estimate. You can discuss adjustments with your service provider.' },
        { question: 'What\'s included?', answer: 'Each package includes the services listed. Optional add-ons are available on the next step.' },
      ],
      cta: 'Not sure which package is right? The service provider can help you choose the best fit.',
    },
    config: { show_progress: true, can_skip: false, auto_advance: false },
  };
}

function buildAddOnStep(config: PricingConfigV1): StepDefinition | null {
  // Only configs with addOns field can have add-on steps
  if (!('addOns' in config) || !config.addOns?.length) return null;

  const question: QuestionDefinition = {
    id: 'addon_selection',
    type: 'checkbox_group',
    label: 'Add extras to your service',
    maps_to: 'selected_add_on_ids',
    default_value: config.addOns.filter(a => a.default).map(a => a.id),
    options: config.addOns.map(addon => ({
      value: addon.id,
      label: addon.label,
      description: addon.type === 'pct' ? `+${addon.amount}%` : `+$${addon.amount}`,
    })),
    validation: [],
  };

  return {
    id: 'input_addons',
    type: 'addon_selection',
    title: 'Any extras?',
    questions: [question],
    help: {
      title: 'How do add-ons work?',
      items: [
        { question: 'Are add-ons required?', answer: 'No. Add-ons are completely optional. Skip this step if you don\'t need any extras.' },
        { question: 'How do percentages work?', answer: 'Percentage-based add-ons are calculated on your base service cost before other fees.' },
        { question: 'Should I add anything?', answer: 'Add-ons help you get a more accurate estimate. Choose the ones relevant to your project.' },
      ],
      cta: 'Need help deciding? The service provider can recommend the right extras for your project.',
    },
    config: { show_progress: true, can_skip: true, auto_advance: false },
  };
}

function buildPriceRevealStep(config: PricingConfigV1): StepDefinition {
  const isCallOnly = config.pricingType === 'call_for_quote_only';
  return {
    id: 'price_reveal',
    type: 'price_reveal',
    title: isCallOnly ? 'Request a Quote' : 'Your Estimate',
    questions: [],
    help: {
      title: 'About this estimate',
      items: [
        { question: 'Is this my final price?', answer: 'This is an estimate based on what you entered. Final pricing may vary after an on-site or detailed review.' },
        { question: 'How accurate is this?', answer: 'Most estimates are within 10–15% of the final cost for standard jobs.' },
        { question: 'What happens next?', answer: 'Enter your details on the next step to receive a full breakdown and connect with the provider.' },
      ],
      cta: 'Want an exact quote? Share your details and the provider will follow up with a precise number.',
    },
    config: { show_progress: true, can_skip: false, auto_advance: false },
  };
}

function buildLeadCaptureStep(settings: FlowBuilderSettings): StepDefinition {
  return {
    id: 'lead_capture',
    type: 'lead_capture',
    title: 'Get your detailed quote',
    subtitle: settings.leadForm?.cta_text || 'Enter your details and we\'ll send you a full breakdown.',
    questions: [],
    help: {
      title: 'Why do we need your details?',
      items: [
        { question: 'Why do you need my email?', answer: 'We\'ll send your full quote breakdown so you have it saved for reference.' },
        { question: 'Will I get spammed?', answer: 'No. Your info is only shared with this service provider for your quote request.' },
        { question: 'Can I get a quote without signing up?', answer: 'This form just sends your estimate — no account or payment required.' },
      ],
      cta: 'Your information is kept private and only shared with this service provider.',
    },
    config: { show_progress: true, can_skip: false, auto_advance: false },
  };
}

function buildBookingStep(): StepDefinition {
  return {
    id: 'booking',
    type: 'booking',
    title: 'Book your appointment',
    subtitle: 'Choose a date and time that works for you.',
    questions: [],
    config: { show_progress: true, can_skip: true, auto_advance: false },
  };
}

function buildConfirmationStep(): StepDefinition {
  return {
    id: 'confirmation',
    type: 'confirmation',
    title: 'You\'re all set!',
    questions: [],
    config: { show_progress: false, can_skip: false, auto_advance: false },
  };
}
