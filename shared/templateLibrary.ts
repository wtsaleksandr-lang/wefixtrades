/**
 * Template library — legacy structural taxonomy for the pricing-family
 * STEPPER flow (`buildWidgetFlow` / `StepRenderer`).
 *
 * ⚠️  This file is NOT the template catalogue. The single source of truth for
 * QuoteQuick's themed calculator templates is `shared/templatePresets.ts`
 * (`TemplateConfig` / `TEMPLATE_PRESETS`).
 *
 * What lives here, and why:
 *  - `TemplateDefinition` / `TEMPLATE_LIBRARY` — structural definitions the
 *    *legacy non-advanced stepper path* still consumes (it needs
 *    `layout_style` + optional `wizard_steps`). That path is out of scope for
 *    the builder-foundation refactor; leave it intact.
 *  - `TRADE_TEMPLATE_MAP` / `getRecommendedTemplate` — trade → recommended
 *    template id. Still used by the wizard to pre-pick a template.
 *  - `getTemplateById` — resolves an id to a `TemplateDefinition`. It now ALSO
 *    resolves a unified `TemplateConfig` preset id (from `templatePresets.ts`)
 *    by bridging it to a structural definition, so `QuoteWidget` no longer
 *    silently falls back to `classic_single` for a preset id.
 *
 * The `LayoutStyle` here is the *flow* layout for the stepper (`single_page |
 * two_column | multi_step`) — a different concept from the advanced renderer's
 * `TemplateLayout`. The real advanced layout catalogue lives in
 * `templatePresets.ts` (`TEMPLATE_LAYOUTS`).
 */
import type { StepDefinition } from "./wizardSchema";
import { TEMPLATE_PRESETS, getTemplatePreset } from "./templatePresets";

/* ─── Legacy stepper template definitions ─── */

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
   * instead of hardcoded UI.
   */
  wizard_steps?: StepDefinition[];
}

/** The `layout_style` of the legacy stepper flow — not the advanced layout. */
export type LayoutStyle = TemplateDefinition['layout_style'];

const DEFAULT_DEFAULTS: TemplateDefinition['defaults'] = {
  sticky_summary: false,
  show_breakdown: true,
  show_trust_block: false,
  show_testimonials: false,
  show_images: false,
};

export const TEMPLATE_LIBRARY: TemplateDefinition[] = [
  {
    id: 'classic_single',
    name: 'Classic (Single Page)',
    description: 'Simple, scrollable layout — works for everything',
    best_for: ['general', 'small_services', 'mobile_first'],
    layout_style: 'single_page',
    defaults: { ...DEFAULT_DEFAULTS },
    features: {},
  },
  {
    id: 'classic_two_column',
    name: 'Classic (Two Column)',
    description: 'Inputs on left, live price summary on right',
    best_for: ['cleaning', 'painting', 'landscaping'],
    layout_style: 'two_column',
    defaults: { ...DEFAULT_DEFAULTS, sticky_summary: true },
    features: {},
  },
  {
    id: 'multi_step_progressive',
    name: 'Progressive (Multi-Step)',
    description: 'Step-by-step with progress bar — great for complex quotes',
    best_for: ['renovation', 'concrete', 'higher_ticket'],
    layout_style: 'multi_step',
    defaults: { ...DEFAULT_DEFAULTS, sticky_summary: true, show_trust_block: true },
    features: { stepper: true },
    // Proof-of-concept wizard step definitions — populated per-trade in Phase 2
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
    defaults: { ...DEFAULT_DEFAULTS },
    features: { package_cards: true },
  },
  {
    id: 'range_only_leadgate',
    name: 'Range Only (Lead Gate)',
    description: 'Shows price range, encourages contact for exact quote',
    best_for: ['complex_quotes', 'renovation', 'roofing'],
    layout_style: 'single_page',
    defaults: { ...DEFAULT_DEFAULTS, show_breakdown: false, show_trust_block: true },
    features: { hides_exact_total: true, encourages_contact: true },
  },
  {
    id: 'estimate_then_book',
    name: 'Estimate → Book',
    description: 'Get estimate, then book instantly — ideal with booking enabled',
    best_for: ['cleaning', 'photography', 'therapy', 'massage'],
    layout_style: 'two_column',
    defaults: { ...DEFAULT_DEFAULTS, sticky_summary: true },
    features: { booking_cta_emphasis: true },
  },
];

/**
 * Map a unified `TemplateConfig` layout to a stepper `layout_style`. A themed
 * template carrying `multi-column` maps onto the stepper's `multi_step`.
 */
function presetLayoutToStyle(layout: string): LayoutStyle {
  if (layout === 'two-column') return 'two_column';
  if (layout === 'multi-column') return 'multi_step';
  return 'single_page';
}

/**
 * Bridge a unified `TemplateConfig` preset to a structural `TemplateDefinition`
 * so the legacy stepper/flow code can consume it. Presets are themed/advanced
 * calculators — they have no `wizard_steps`, so the flow builder generates a
 * flow from the pricing config as usual.
 */
function presetAsDefinition(id: string): TemplateDefinition | undefined {
  const preset = getTemplatePreset(id);
  if (!preset) return undefined;
  const layout_style = presetLayoutToStyle(preset.layout);
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    best_for: preset.trades,
    layout_style,
    defaults: {
      ...DEFAULT_DEFAULTS,
      sticky_summary: layout_style !== 'single_page',
      show_breakdown: preset.results?.show_breakdown !== false,
    },
    features: {},
  };
}

/**
 * Resolve a template id to a `TemplateDefinition`. Accepts BOTH a structural
 * `TEMPLATE_LIBRARY` id AND a unified `TEMPLATE_PRESETS` id — the two id
 * namespaces are now reconciled, so a preset id no longer silently collapses
 * to `classic_single`. Returns `undefined` for a genuinely unknown id; callers
 * decide how to fall back.
 */
export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATE_LIBRARY.find(t => t.id === id) ?? presetAsDefinition(id);
}

/* ─── Trade → recommended template ─── */

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

/**
 * Recommend a unified themed template (`TemplateConfig` id) for a trade, by
 * scanning each preset's `trades` list. Phase 2's categorized gallery uses
 * this to pre-pick a themed template. Returns `undefined` if no preset claims
 * the trade — the caller can then fall back to the structural recommendation.
 */
export function getRecommendedPreset(tradeId: string): string | undefined {
  return TEMPLATE_PRESETS.find(t => t.trades.includes(tradeId))?.id;
}
