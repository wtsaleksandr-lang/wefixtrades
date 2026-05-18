import type { StepDefinition } from "./wizardSchema";

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  best_for: string[];
  layout_style: 'single_page' | 'multi_step' | 'two_column';
  defaults: {
    sticky_summary: boolean;
    show_breakdown: boolean;
    show_trust_block: boolean;
    show_testimonials: boolean;
    show_images: boolean;
  };
  features: {
    stepper?: boolean;
    package_cards?: boolean;
    hides_exact_total?: boolean;
    encourages_contact?: boolean;
    booking_cta_emphasis?: boolean;
  };
  /**
   * Optional wizard step definitions for schema-driven rendering.
   * When present, the customer-facing widget renders these steps
   * instead of hardcoded UI. Added in Phase 1 for forward compatibility.
   */
  wizard_steps?: StepDefinition[];
}

export const TEMPLATE_LIBRARY: TemplateDefinition[] = [
  {
    id: 'classic_single',
    name: 'Classic (Single Page)',
    description: 'Simple, scrollable layout — works for everything',
    best_for: ['general', 'small_services', 'mobile_first'],
    layout_style: 'single_page',
    defaults: {
      sticky_summary: false,
      show_breakdown: true,
      show_trust_block: false,
      show_testimonials: false,
      show_images: false,
    },
    features: {},
  },
  {
    id: 'classic_two_column',
    name: 'Classic (Two Column)',
    description: 'Inputs on left, live price summary on right',
    best_for: ['cleaning', 'painting', 'landscaping'],
    layout_style: 'two_column',
    defaults: {
      sticky_summary: true,
      show_breakdown: true,
      show_trust_block: false,
      show_testimonials: false,
      show_images: false,
    },
    features: {},
  },
  {
    id: 'multi_step_progressive',
    name: 'Progressive (Multi-Step)',
    description: 'Step-by-step with progress bar — great for complex quotes',
    best_for: ['renovation', 'concrete', 'higher_ticket'],
    layout_style: 'multi_step',
    defaults: {
      sticky_summary: true,
      show_breakdown: true,
      show_trust_block: true,
      show_testimonials: false,
      show_images: false,
    },
    features: { stepper: true },
    // Proof-of-concept wizard step definitions — will be populated per-trade in Phase 2
    wizard_steps: [
      {
        id: 'scope',
        type: 'question',
        title: 'What do you need?',
        questions: [{
          id: 'service_type',
          type: 'select',
          label: 'Service type',
          options: [],
          default_value: '',
          validation: [{ type: 'required', value: true }],
        }],
        config: { show_progress: true, can_skip: false, auto_advance: false },
      },
      {
        id: 'sizing',
        type: 'question',
        title: 'How big is the job?',
        questions: [{
          id: 'quantity',
          type: 'slider',
          label: 'Size',
          min: 1,
          max: 100,
          step: 1,
          default_value: 10,
          maps_to: 'quantity',
          validation: [],
        }],
        config: { show_progress: true, can_skip: false, auto_advance: false },
      },
      {
        id: 'extras',
        type: 'addon_selection',
        title: 'Any extras?',
        questions: [],
        config: { show_progress: true, can_skip: true, auto_advance: false },
      },
      {
        id: 'result',
        type: 'price_reveal',
        title: 'Your estimate',
        questions: [],
        config: { show_progress: true, can_skip: false, auto_advance: false },
      },
      {
        id: 'contact',
        type: 'lead_capture',
        title: 'Get your detailed quote',
        questions: [],
        config: { show_progress: true, can_skip: false, auto_advance: false },
      },
    ],
  },
  {
    id: 'package_selector',
    name: 'Packages (Cards)',
    description: 'Compare packages side-by-side as cards',
    best_for: ['photography', 'detailing', 'moving'],
    layout_style: 'single_page',
    defaults: {
      sticky_summary: false,
      show_breakdown: true,
      show_trust_block: false,
      show_testimonials: false,
      show_images: false,
    },
    features: { package_cards: true },
  },
  {
    id: 'range_only_leadgate',
    name: 'Range Only (Lead Gate)',
    description: 'Shows price range, encourages contact for exact quote',
    best_for: ['complex_quotes', 'renovation', 'roofing'],
    layout_style: 'single_page',
    defaults: {
      sticky_summary: false,
      show_breakdown: false,
      show_trust_block: true,
      show_testimonials: false,
      show_images: false,
    },
    features: { hides_exact_total: true, encourages_contact: true },
  },
  {
    id: 'estimate_then_book',
    name: 'Estimate → Book',
    description: 'Get estimate, then book instantly — ideal with booking enabled',
    best_for: ['cleaning', 'photography', 'therapy', 'massage'],
    layout_style: 'two_column',
    defaults: {
      sticky_summary: true,
      show_breakdown: true,
      show_trust_block: false,
      show_testimonials: false,
      show_images: false,
    },
    features: { booking_cta_emphasis: true },
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATE_LIBRARY.find(t => t.id === id);
}

/* ─── Layouts ─── */

export type LayoutStyle = 'single_page' | 'two_column' | 'multi_step';

export interface LayoutDefinition {
  id: LayoutStyle;
  name: string;
  description: string;
}

/**
 * The three layout families. Step 2 of the wizard picks a layout first, then a
 * template within it — the layout is the structural skeleton and stays
 * switchable afterwards; templates carry presets + theme.
 */
export const LAYOUTS: LayoutDefinition[] = [
  { id: 'single_page', name: 'Single column', description: 'Everything stacked top to bottom, with the price at the end.' },
  { id: 'two_column', name: 'Two column', description: 'Inputs on the left, a live price panel on the right.' },
  { id: 'multi_step', name: 'Multi-step', description: 'One question at a time, with a progress bar.' },
];

export function getLayoutById(id: string): LayoutDefinition | undefined {
  return LAYOUTS.find(l => l.id === id);
}

export function getTemplatesByLayout(style: LayoutStyle): TemplateDefinition[] {
  return TEMPLATE_LIBRARY.filter(t => t.layout_style === style);
}

const TRADE_TEMPLATE_MAP: Record<string, string> = {
  house_cleaning: 'classic_two_column',
  office_cleaning: 'classic_two_column',
  deep_cleaning: 'classic_two_column',
  carpet_cleaning: 'classic_two_column',
  window_cleaning: 'classic_two_column',
  pressure_washing: 'classic_two_column',
  interior_painting: 'classic_two_column',
  exterior_painting: 'classic_two_column',
  lawn_mowing: 'classic_two_column',
  landscaping: 'classic_two_column',
  tree_trimming: 'classic_two_column',
  garden_maintenance: 'classic_two_column',
  fence_installation: 'classic_two_column',

  photography: 'package_selector',
  auto_detailing: 'package_selector',
  moving_services: 'package_selector',
  personal_training: 'package_selector',
  tutoring: 'package_selector',
  dog_grooming: 'package_selector',
  pet_sitting: 'package_selector',
  dj_services: 'package_selector',

  kitchen_remodel: 'multi_step_progressive',
  bathroom_remodel: 'multi_step_progressive',
  general_renovation: 'multi_step_progressive',
  concrete_driveway: 'multi_step_progressive',
  concrete_patio: 'multi_step_progressive',
  concrete_foundation: 'multi_step_progressive',
  roofing: 'multi_step_progressive',
  deck_building: 'multi_step_progressive',
  flooring_installation: 'multi_step_progressive',

  plumbing_services: 'classic_single',
  electrical_services: 'classic_single',
  hvac_services: 'classic_single',
  appliance_repair: 'classic_single',
  locksmith: 'classic_single',
};

export function getRecommendedTemplate(tradeId: string, bookingEnabled: boolean): string {
  if (bookingEnabled) return 'estimate_then_book';
  return TRADE_TEMPLATE_MAP[tradeId] || 'classic_single';
}
