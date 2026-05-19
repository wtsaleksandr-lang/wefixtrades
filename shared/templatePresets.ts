/**
 * QuoteQuick template catalogue — the SINGLE SOURCE OF TRUTH.
 *
 * Each entry is a complete, Elfsight-shaped `TemplateConfig`: a pure JSON
 * config object (fields, calculations, header, result settings, layout, theme)
 * consumed by ONE generic renderer (`AdvancedCalculator.tsx`). Picking a
 * template in the wizard drops the whole config into the builder, where every
 * part stays editable.
 *
 * Unified schema (builder-foundation refactor):
 *  - One canonical `TemplateConfig` type — fields/calculations/header/results
 *    are TOP-LEVEL (not nested under `advanced`).
 *  - `category` + `trades` added so Phase 2's categorized gallery and Phase 3's
 *    premium templates can filter/recommend without a second taxonomy module.
 *  - `layout` uses the real layout enum (`single-column | two-column |
 *    multi-column`) — see `TemplateLayout` below.
 *
 * The runtime config persisted on a calculator (`calculator_settings.advanced`)
 * is produced from a `TemplateConfig` via `toAdvancedConfig()` — that shape is
 * intentionally unchanged so no stored calculator needs migration.
 */

/* ─── Layout ─── */

/**
 * The three real layouts. Replaces the old fake `single_page | two_column |
 * multi_step` enum. The renderer maps each to a CSS Grid:
 *  - single-column — one stacked column, result below the inputs.
 *  - two-column    — inputs column + result column, side by side.
 *  - multi-column  — a 3-up responsive grid of inputs with the result panel.
 * All three collapse to a clean single column on narrow screens.
 */
export type TemplateLayout = 'single-column' | 'two-column' | 'multi-column';

export const TEMPLATE_LAYOUTS: ReadonlyArray<{
  id: TemplateLayout; name: string; description: string;
}> = [
  { id: 'single-column', name: 'Single column', description: 'Everything stacked top to bottom, with the price below.' },
  { id: 'two-column', name: 'Two column', description: 'Inputs on the left, a live price panel on the right.' },
  { id: 'multi-column', name: 'Multi column', description: 'A 3-up grid of inputs with the result panel — for richer calculators.' },
];

/**
 * Back-compat: map any legacy advanced-layout value to the new enum. Stored
 * calculators created before this refactor carry `single_page | two_column |
 * multi_step`; coerce on read so nothing breaks.
 */
export function normalizeLayout(value: unknown): TemplateLayout {
  switch (value) {
    case 'single-column':
    case 'two-column':
    case 'multi-column':
      return value;
    case 'two_column':
      return 'two-column';
    case 'multi_step':
      return 'multi-column';
    case 'single_page':
      return 'single-column';
    default:
      return 'two-column';
  }
}

/* ─── Field / calculation / header / result types ─── */

export type FieldType =
  | 'number' | 'slider' | 'select' | 'radio'
  | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading';

export interface TemplateOption { id: string; label: string; value: number; }

export interface TemplateField {
  id: string; name: string; label: string; type: FieldType;
  required?: boolean; default_value?: number; min?: number; max?: number;
  step?: number; unit?: string; on_value?: number; options?: TemplateOption[];
}

export interface TemplateCalculation {
  id: string; name: string; formula: string;
  format: 'number' | 'currency' | 'percent';
}

export interface TemplateHeader {
  title: string; subtitle?: string; align: 'left' | 'center' | 'right';
}

export interface TemplateResults {
  heading?: string; footnote?: string; show_breakdown?: boolean;
  /** Result-panel call-to-action button label (empty string hides it). */
  cta_label?: string;
}

/* ─── The canonical template config ─── */

/**
 * The one unified, Elfsight-shaped template config. This single shape replaces
 * the old `TemplatePreset` (themed content) + `TemplateDefinition` (structural
 * taxonomy) split.
 */
export interface TemplateConfig {
  /** Stable unique id. */
  id: string;
  /** Display name shown in the gallery. */
  name: string;
  /** One-line description shown on the template card. */
  description: string;
  /** Domain bucket — drives Phase 2's categorized gallery. */
  category: string;
  /** Trade ids this template suits — drives `getRecommendedTemplate`. */
  trades: string[];
  /** Structural layout (real, renderer-backed). */
  layout: TemplateLayout;
  /** Widget theme id (see client widgetThemes.ts). */
  theme: string;
  /** Input fields. */
  fields: TemplateField[];
  /** Calculations / formulas. */
  calculations: TemplateCalculation[];
  /** Name of the calculation used as the headline result. */
  result_calc: string;
  /** Header (title / subtitle / alignment). */
  header: TemplateHeader;
  /** Optional result-panel customisation. */
  results?: TemplateResults;
}

/* Small helpers to keep the catalogue compact. */
const opt = (label: string, value: number): TemplateOption =>
  ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, value });
const calc = (
  name: string, formula: string, format: TemplateCalculation['format'] = 'currency',
): TemplateCalculation =>
  ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, formula, format });

export const TEMPLATE_PRESETS: TemplateConfig[] = [
  /* ── 1. Car towing ── */
  {
    id: 'car_towing', name: 'Car Towing', description: 'Distance-based tow pricing with add-on services.',
    category: 'Automotive', trades: ['auto_detailing'],
    layout: 'single-column', theme: 'midnight',
    header: { title: 'Car Towing Cost Calculator', subtitle: 'Estimate the cost of your tow in seconds.', align: 'left' },
    fields: [
      { id: 'vehicle_type', name: 'Vehicle Type', label: 'Vehicle Type', type: 'select',
        options: [opt('Car', 0), opt('SUV', 25), opt('Truck', 60), opt('Motorcycle', -10)] },
      { id: 'condition', name: 'Vehicle Condition', label: 'Vehicle Condition', type: 'select',
        options: [opt('Driveable', 0), opt('Not driveable', 45)] },
      { id: 'distance', name: 'Towing Distance', label: 'Towing Distance', type: 'slider',
        min: 1, max: 100, step: 1, default_value: 10, unit: 'miles' },
      { id: 'extras', name: 'Additional Services', label: 'Additional Services', type: 'multi_select',
        options: [opt('Winching', 50), opt('Tire Change', 25), opt('Lockout Service', 35), opt('Fuel Delivery', 30)] },
    ],
    calculations: [calc('Total Towing Cost', '[Towing Distance] * 5 + [Vehicle Type] + [Vehicle Condition] + [Additional Services]')],
    result_calc: 'Total Towing Cost',
    results: { footnote: 'Mileage is charged at $5.00/mile. After-hours surcharges may apply.' },
  },

  /* ── 2. Driveway paving ── */
  {
    id: 'driveway_paving', name: 'Driveway Paving', description: 'Area-based driveway paving estimate.',
    category: 'Construction', trades: ['concrete_driveway', 'concrete_patio'],
    layout: 'single-column', theme: 'midnight',
    header: { title: 'Driveway Paving Cost Calculator', subtitle: 'Estimate your new driveway in seconds.', align: 'left' },
    fields: [
      { id: 'area', name: 'Driveway Area', label: 'Driveway area', type: 'slider',
        min: 10, max: 300, step: 5, default_value: 50, unit: 'sqm' },
      { id: 'material', name: 'Surface Material', label: 'Surface material', type: 'select',
        options: [opt('Asphalt', 45), opt('Concrete', 60), opt('Block paving', 90), opt('Resin', 110)] },
      { id: 'removal', name: 'Old Surface Removal', label: 'Remove the old surface', type: 'toggle', on_value: 600 },
      { id: 'edging', name: 'Decorative Edging', label: 'Add decorative edging', type: 'toggle', on_value: 350 },
    ],
    calculations: [calc('Total Paving Cost', '[Driveway Area] * [Surface Material] + [Old Surface Removal] + [Decorative Edging]')],
    result_calc: 'Total Paving Cost',
  },

  /* ── 3. Property cleaning ── */
  {
    id: 'property_cleaning', name: 'Property Cleaning', description: 'Room-based cleaning quote with extras.',
    category: 'Cleaning', trades: ['house_cleaning', 'office_cleaning', 'deep_cleaning'],
    layout: 'two-column', theme: 'light',
    header: { title: 'Cleaning Price Calculator', subtitle: 'Tell us about your property for an instant price.', align: 'left' },
    fields: [
      { id: 'bedrooms', name: 'Bedrooms', label: 'Number of bedrooms', type: 'number', min: 0, max: 12, step: 1, default_value: 2 },
      { id: 'bathrooms', name: 'Bathrooms', label: 'Number of bathrooms', type: 'number', min: 0, max: 8, step: 1, default_value: 1 },
      { id: 'deep_clean', name: 'Deep Clean', label: 'Add a deep clean', type: 'toggle', on_value: 60 },
      { id: 'frequency', name: 'Frequency', label: 'How often?', type: 'select',
        options: [opt('One-off', 0), opt('Fortnightly', -10), opt('Weekly', -18)] },
    ],
    calculations: [calc('Total Price', '[Bedrooms] * 28 + [Bathrooms] * 22 + [Deep Clean] + [Frequency]')],
    result_calc: 'Total Price',
  },

  /* ── 4. Energy efficiency upgrade ── */
  {
    id: 'energy_upgrade', name: 'Energy Upgrade', description: 'Home efficiency upgrade estimate.',
    category: 'Home Improvement', trades: ['hvac_services'],
    layout: 'multi-column', theme: 'midnight',
    header: { title: 'Energy Efficiency Upgrade Calculator', align: 'left' },
    fields: [
      { id: 'upgrade', name: 'Upgrade Type', label: 'Upgrade Type', type: 'select',
        options: [opt('Insulation', 0), opt('Windows', 1500), opt('HVAC', 4000), opt('Solar', 8000)] },
      { id: 'home_size', name: 'Home Size', label: 'Home Size', type: 'number',
        min: 200, max: 8000, step: 50, default_value: 1500, unit: 'sqft' },
      { id: 'incentives', name: 'Local Incentives', label: 'Local Incentives', type: 'multi_select',
        options: [opt('Rebates', -500), opt('Tax Incentives', -800)] },
      { id: 'install', name: 'Installation', label: 'Professional installation', type: 'toggle', on_value: 1200 },
    ],
    calculations: [calc('Estimated Upgrade Cost', '[Upgrade Type] + [Home Size] * 2 + [Installation] + [Local Incentives]')],
    result_calc: 'Estimated Upgrade Cost',
  },

  /* ── 5. Landscaping ── */
  {
    id: 'landscaping', name: 'Landscaping', description: 'Garden landscaping & maintenance quote.',
    category: 'Outdoor', trades: ['landscaping', 'lawn_mowing', 'garden_maintenance', 'tree_trimming'],
    layout: 'two-column', theme: 'forest',
    header: { title: 'Landscaping & Garden Quote', subtitle: 'Tell us about your garden for an instant price.', align: 'left' },
    fields: [
      { id: 'area', name: 'Garden Area', label: 'Garden area', type: 'slider',
        min: 10, max: 1000, step: 10, default_value: 120, unit: 'sqm' },
      { id: 'service', name: 'Service', label: 'Service needed', type: 'select',
        options: [opt('Mowing & tidy-up', 3), opt('Full maintenance', 7), opt('Garden redesign', 22)] },
      { id: 'extras', name: 'Extras', label: 'Extras', type: 'multi_select',
        options: [opt('Green-waste removal', 90), opt('New turf', 480), opt('Planting & beds', 320)] },
      { id: 'visits', name: 'Visits', label: 'Visits per month', type: 'number',
        min: 1, max: 8, step: 1, default_value: 1, unit: '/mo' },
    ],
    calculations: [calc('Estimated Quote', '[Garden Area] * [Service] * [Visits] + [Extras]')],
    result_calc: 'Estimated Quote',
  },

  /* ── 6. Gutter cleaning ── */
  {
    id: 'gutter_cleaning', name: 'Gutter Cleaning', description: 'Length-based gutter cleaning quote.',
    category: 'Cleaning', trades: ['window_cleaning', 'pressure_washing'],
    layout: 'single-column', theme: 'forest',
    header: { title: 'Gutter Cleaning Cost Calculator', align: 'left' },
    fields: [
      { id: 'length', name: 'Gutter Length', label: 'Gutter length', type: 'slider',
        min: 1, max: 300, step: 1, default_value: 40, unit: 'feet' },
      { id: 'difficulty', name: 'Cleaning Difficulty', label: 'Cleaning difficulty', type: 'radio',
        options: [opt('Easy', 0), opt('Moderate', 35), opt('Difficult', 80)] },
    ],
    calculations: [calc('Estimated Cost', '[Gutter Length] * 2 + [Cleaning Difficulty]')],
    result_calc: 'Estimated Cost',
  },

  /* ── 7. Fence installation ── */
  {
    id: 'fence_installation', name: 'Fence Installation', description: 'Per-metre fencing install estimate.',
    category: 'Outdoor', trades: ['fence_installation', 'deck_building'],
    layout: 'single-column', theme: 'forest',
    header: { title: 'Fence Installation Cost Calculator', subtitle: 'Estimate your new fence in seconds.', align: 'left' },
    fields: [
      { id: 'length', name: 'Fence Length', label: 'Fence length', type: 'slider',
        min: 1, max: 200, step: 1, default_value: 20, unit: 'm' },
      { id: 'material', name: 'Fence Type', label: 'Fence type', type: 'select',
        options: [opt('Timber panel', 38), opt('Closeboard', 52), opt('Composite', 78), opt('Metal railing', 95)] },
      { id: 'gates', name: 'Gates', label: 'Number of gates', type: 'number',
        min: 0, max: 6, step: 1, default_value: 1 },
      { id: 'removal', name: 'Old Fence Removal', label: 'Remove the old fence', type: 'toggle', on_value: 220 },
    ],
    calculations: [calc('Total Fencing Cost', '[Fence Length] * [Fence Type] + [Gates] * 180 + [Old Fence Removal]')],
    result_calc: 'Total Fencing Cost',
  },

  /* ── 8. Roof repair ── */
  {
    id: 'roof_repair', name: 'Roof Repair', description: 'Area + material roof repair estimate.',
    category: 'Construction', trades: ['roofing'],
    layout: 'two-column', theme: 'midnight',
    header: { title: 'Roof Repair & Replacement Cost Estimator', align: 'left' },
    fields: [
      { id: 'roof_size', name: 'Roof Size', label: 'Roof Size', type: 'number',
        min: 100, max: 5000, step: 50, default_value: 500, unit: 'sqft' },
      { id: 'roof_type', name: 'Roof Type', label: 'Roof Type', type: 'select',
        options: [opt('Shingle', 4), opt('Metal', 7), opt('Tile', 9)] },
      { id: 'pitch', name: 'Roof Pitch', label: 'Roof Pitch', type: 'radio',
        options: [opt('Low Slope', 0), opt('Medium Slope', 1), opt('High Slope', 3)] },
      { id: 'features', name: 'Additional Features', label: 'Additional Features', type: 'multi_select',
        options: [opt('Skylights', 500), opt('Gutter Replacement', 600)] },
    ],
    calculations: [calc('Estimated Repair Cost', '[Roof Size] * ([Roof Type] + [Roof Pitch]) + [Additional Features]')],
    result_calc: 'Estimated Repair Cost',
    results: { footnote: 'This is an estimate — actual prices may vary with inspection.' },
  },

  /* ── 9. Solar panels ── */
  {
    id: 'solar_panels', name: 'Solar Panels', description: 'Solar install cost from system size.',
    category: 'Home Improvement', trades: ['hvac_services'],
    layout: 'multi-column', theme: 'light',
    header: { title: 'Solar Panel Cost Calculator', subtitle: 'Estimate the cost of your solar installation.', align: 'left' },
    fields: [
      { id: 'panels', name: 'Panels', label: 'Number of solar panels', type: 'slider',
        min: 1, max: 200, step: 1, default_value: 12, unit: 'panels' },
      { id: 'capacity', name: 'Capacity', label: 'Capacity per panel', type: 'slider',
        min: 200, max: 600, step: 10, default_value: 400, unit: 'W' },
      { id: 'orientation', name: 'Orientation', label: 'Roof orientation', type: 'radio',
        options: [opt('South', 0), opt('South-East', 120), opt('South-West', 120), opt('East / West', 280)] },
      { id: 'battery', name: 'Battery', label: 'Add a battery', type: 'toggle', on_value: 4500 },
    ],
    calculations: [calc('Estimated System Cost', '[Panels] * [Capacity] * 0.9 + [Orientation] + [Battery]')],
    result_calc: 'Estimated System Cost',
  },

  /* ── 10. Interior painting ── */
  {
    id: 'interior_painting', name: 'Interior Painting', description: 'Room + finish interior painting quote.',
    category: 'Home Improvement', trades: ['interior_painting', 'exterior_painting'],
    layout: 'two-column', theme: 'mint',
    header: { title: 'Interior Painting Cost Calculator', subtitle: 'Get an instant price for your paint job.', align: 'left' },
    fields: [
      { id: 'wall_area', name: 'Wall Area', label: 'Wall area to paint', type: 'slider',
        min: 10, max: 500, step: 5, default_value: 80, unit: 'sqm' },
      { id: 'rooms', name: 'Rooms', label: 'Number of rooms', type: 'number',
        min: 1, max: 20, step: 1, default_value: 3 },
      { id: 'finish', name: 'Finish Quality', label: 'Finish quality', type: 'select',
        options: [opt('Standard', 9), opt('Premium', 14), opt('Designer', 20)] },
      { id: 'ceilings', name: 'Ceilings', label: 'Include ceilings', type: 'toggle', on_value: 240 },
    ],
    calculations: [calc('Total Painting Cost', '[Wall Area] * [Finish Quality] + [Rooms] * 35 + [Ceilings]')],
    result_calc: 'Total Painting Cost',
  },

  /* ── 11. House renovation ── */
  {
    id: 'house_renovation', name: 'House Renovation', description: 'Area + labour renovation estimate.',
    category: 'Construction', trades: ['general_renovation', 'kitchen_remodel', 'bathroom_remodel', 'flooring_installation'],
    layout: 'multi-column', theme: 'light',
    header: { title: 'House Renovation Cost Calculator', align: 'left' },
    fields: [
      { id: 'area', name: 'Area to Renovate', label: 'Area to renovate', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 800, unit: 'sqft' },
      { id: 'material', name: 'Material Cost', label: 'Material cost per sq ft', type: 'number',
        min: 5, max: 200, step: 1, default_value: 33, unit: '$' },
      { id: 'labor_rate', name: 'Labor Rate', label: 'Labor rate per hour', type: 'number',
        min: 10, max: 150, step: 1, default_value: 40, unit: '$' },
      { id: 'labor_hours', name: 'Labor Hours', label: 'Estimated labor hours', type: 'slider',
        min: 10, max: 500, step: 5, default_value: 120, unit: 'hrs' },
    ],
    calculations: [
      calc('Material Cost', '[Area to Renovate] * [Material Cost]'),
      calc('Labor Cost', '[Labor Rate] * [Labor Hours]'),
      calc('Total Renovation Cost', '[Material Cost] + [Labor Cost]'),
    ],
    result_calc: 'Total Renovation Cost',
  },

  /* ══════════════════════════════════════════════════════════════════
     Phase 3 — premium reference templates. Five designs, each authored
     in all three layouts (single-column / two-column / multi-column)
     so the gallery can show the same calculator in every arrangement.
     Fields + formulas are identical across a design's three variants;
     only `id`, `name` and `layout` differ.
     ══════════════════════════════════════════════════════════════════ */

  /* ── Premium 1. Wedding Photography ── (blue → `light` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'hours', name: 'Hours of Coverage', label: 'Hours of coverage', type: 'slider',
        min: 4, max: 12, step: 1, default_value: 8, unit: 'hrs' },
      { id: 'album', name: 'Photo Album', label: 'Photo album', type: 'select',
        options: [opt('No Album', 0), opt('Standard', 350), opt('Premium', 750)] },
      { id: 'second_photographer', name: 'Second Photographer', label: 'Add a second photographer', type: 'toggle', on_value: 400 },
      { id: 'travel', name: 'Travel Distance', label: 'Travel distance', type: 'slider',
        min: 0, max: 100, step: 5, default_value: 10, unit: 'miles' },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Total Cost', '[Hours of Coverage] * 150 + [Photo Album] + [Second Photographer] + [Travel Distance] * 2.5'),
      calc('Deposit Required', 'ROUND([Total Cost] * 0.2, 2)'),
    ];
    const header: TemplateHeader = {
      title: 'Wedding Photography Quote Calculator',
      subtitle: 'Book Your Wedding Photographer Today!', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Deposit to be paid upfront to secure your date.',
      cta_label: 'Contact Us',
    };
    const base = {
      name: 'Wedding Photography', description: 'Premium wedding photography quote with album & travel options.',
      category: 'Photography & Events', trades: ['photographer'],
      theme: 'light', fields, calculations, result_calc: 'Total Cost', header, results,
    };
    return [
      { id: 'wedding_photography_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'wedding_photography_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'wedding_photography_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 2. House Renovation ── (dark forest-green → `forest` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Area to Renovate', label: 'Area to renovate', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 500, unit: 'sq ft' },
      { id: 'material_cost', name: 'Material Cost', label: 'Material cost per sq ft', type: 'slider',
        min: 5, max: 50, step: 1, default_value: 20, unit: '$/sq ft' },
      { id: 'labor_rate', name: 'Labor Rate', label: 'Labor rate per hour', type: 'slider',
        min: 10, max: 100, step: 5, default_value: 50, unit: '$/hr' },
      { id: 'labor_hours', name: 'Labor Hours', label: 'Estimated labor hours', type: 'slider',
        min: 10, max: 500, step: 10, default_value: 100, unit: 'hrs' },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material Cost', '[Area to Renovate] * [Material Cost]'),
      calc('Labor Cost', '[Labor Rate] * [Labor Hours]'),
      calc('Total Renovation Cost', '[Material Cost] + [Labor Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'House Renovation Cost Calculator',
      subtitle: 'Ready to Start Your Renovation?', align: 'left',
    };
    const results: TemplateResults = { footnote: 'A clear, itemised estimate — material and labour broken out so you know exactly where your budget goes.', cta_label: 'Contact Us' };
    const base = {
      name: 'House Renovation Pro', description: 'Premium whole-home renovation estimate with material & labour breakdown.',
      category: 'Construction', trades: ['general_contractor', 'handyman'],
      theme: 'forest', fields, calculations, result_calc: 'Total Renovation Cost', header, results,
    };
    return [
      { id: 'house_renovation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'house_renovation_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'house_renovation_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 3. Carpet Cleaning ── (mint/green → `mint` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'room_size', name: 'Room Size', label: 'Average room size', type: 'slider',
        min: 100, max: 500, step: 10, default_value: 250, unit: 'sq ft' },
      { id: 'rooms', name: 'Number of Rooms', label: 'Number of rooms', type: 'slider',
        min: 1, max: 10, step: 1, default_value: 1, unit: 'rooms' },
      { id: 'extras', name: 'Additional Services', label: 'Additional services', type: 'multi_select',
        options: [opt('Stain Removal', 35), opt('Deodorizing', 25), opt('Scotchgard Protection', 45)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Total Cost', '([Room Size] * 0.45 + 25) * [Number of Rooms] + [Additional Services]'),
      calc('Cost per Room', 'ROUND([Total Cost] / [Number of Rooms], 2)'),
    ];
    const header: TemplateHeader = {
      title: 'Carpet Cleaning Cost Calculator',
      subtitle: 'Get Your Carpets Cleaned Now', align: 'left',
    };
    const results: TemplateResults = { footnote: 'Fresh, deep-cleaned carpets — book in minutes with an instant, all-in price.', cta_label: 'Book Now' };
    const base = {
      name: 'Carpet Cleaning Pro', description: 'Premium room-based carpet cleaning quote with optional treatments.',
      category: 'Cleaning', trades: ['house_cleaning'],
      theme: 'mint', fields, calculations, result_calc: 'Total Cost', header, results,
    };
    return [
      { id: 'carpet_cleaning_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'carpet_cleaning_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'carpet_cleaning_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 4. Roof Repair ── (dark forest-green → `forest` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'roof_area', name: 'Roof Area', label: 'Roof area', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1500, unit: 'sq ft' },
      { id: 'material_type', name: 'Material Type', label: 'Material type', type: 'select',
        options: [opt('Asphalt Shingles', 4), opt('Metal', 8), opt('Tile', 12)] },
      { id: 'complexity', name: 'Repair Complexity', label: 'Repair complexity', type: 'radio',
        options: [opt('Simple', 1), opt('Moderate', 1.4), opt('Complex', 1.9)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material Cost', '[Roof Area] * [Material Type]'),
      calc('Labor Cost', 'ROUND([Roof Area] * 3.5 * [Repair Complexity], 2)'),
      calc('Total Roof Repair Cost', '[Material Cost] + [Labor Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'Roof Repair Cost Calculator',
      subtitle: 'Get Your Roof Repaired Now', align: 'left',
    };
    const results: TemplateResults = { footnote: 'A protected, watertight roof — get a transparent estimate with material and labour itemised.', cta_label: 'Schedule Now' };
    const base = {
      name: 'Roof Repair Pro', description: 'Premium roof repair estimate by area, material and job complexity.',
      category: 'Construction', trades: ['roofing'],
      theme: 'forest', fields, calculations, result_calc: 'Total Roof Repair Cost', header, results,
    };
    return [
      { id: 'roof_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'roof_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'roof_repair_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 5. Moving Cost ── (blue → `light` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'distance', name: 'Distance', label: 'Moving distance', type: 'slider',
        min: 0, max: 3000, step: 25, default_value: 50, unit: 'miles' },
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'select',
        options: [opt('1 Bedroom', 400), opt('2 Bedroom', 700), opt('3 Bedroom', 1100), opt('4 Bedroom', 1600)] },
      { id: 'packing', name: 'Packing Service', label: 'Add a full packing service', type: 'toggle', on_value: 350 },
      { id: 'extras', name: 'Additional Services', label: 'Additional services', type: 'multi_select',
        options: [opt('Storage', 200), opt('Fragile Item Handling', 150), opt('Cleaning', 180), opt('Full Value Protection Insurance', 250)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Transportation Cost', '[Distance] * 1.2 + [Home Size]'),
      calc('Packing Service Cost', '[Packing Service]'),
      calc('Additional Services Cost', '[Additional Services]'),
      calc('Total Moving Cost', '[Transportation Cost] + [Packing Service Cost] + [Additional Services Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'Moving Cost Calculator',
      subtitle: 'Ready to Make Your Move?', align: 'left',
    };
    const results: TemplateResults = { footnote: 'One clear price for your whole move — transport, packing and extras itemised.', cta_label: 'Get a Quote Now' };
    const base = {
      name: 'Moving Cost Pro', description: 'Premium end-to-end moving quote with packing and add-on services.',
      category: 'Moving', trades: ['moving_services'],
      theme: 'light', fields, calculations, result_calc: 'Total Moving Cost', header, results,
    };
    return [
      { id: 'moving_cost_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'moving_cost_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'moving_cost_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),
];

/* ─── Lookups ─── */

export function getTemplatePreset(id: string): TemplateConfig | undefined {
  return TEMPLATE_PRESETS.find(t => t.id === id);
}

export function getPresetsByLayout(layout: TemplateLayout): TemplateConfig[] {
  return TEMPLATE_PRESETS.filter(t => t.layout === layout);
}

export function getPresetsByCategory(category: string): TemplateConfig[] {
  return TEMPLATE_PRESETS.filter(t => t.category === category);
}

/** All distinct categories, in first-seen order — for the Phase 2 gallery. */
export function getTemplateCategories(): string[] {
  const seen: string[] = [];
  for (const t of TEMPLATE_PRESETS) if (!seen.includes(t.category)) seen.push(t.category);
  return seen;
}

/* ─── Runtime config bridge ─── */

/**
 * The runtime `calculator_settings.advanced` shape — what the renderer and the
 * builder persist. Kept identical to the pre-refactor shape so no stored
 * calculator needs migration; only the catalogue module shape changed.
 */
export interface AdvancedConfigShape {
  enabled: true;
  theme: string;
  layout: TemplateLayout;
  fields: TemplateField[];
  calculations: TemplateCalculation[];
  result_calc: string;
  header: TemplateHeader;
  results?: TemplateResults;
}

/** Produce a persistable `calculator_settings.advanced` object from a template. */
export function toAdvancedConfig(t: TemplateConfig): AdvancedConfigShape {
  return {
    enabled: true,
    theme: t.theme,
    layout: t.layout,
    fields: t.fields,
    calculations: t.calculations,
    result_calc: t.result_calc,
    header: t.header,
    ...(t.results ? { results: t.results } : {}),
  };
}
