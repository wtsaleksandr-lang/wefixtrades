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
  /**
   * Optional layout hint — column span inside the inputs grid. `1` (default)
   * means the field occupies one grid column; `2` makes it span the full
   * width. Combined with the natural auto-fit grid this lets two short
   * fields sit side-by-side on a single row without disturbing other
   * templates (which simply leave it unset). Mobile (<=480px) always
   * collapses to a single column regardless.
   */
  colSpan?: 1 | 2;
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

  /* ══════════════════════════════════════════════════════════════════
     Per-Trade Premium Expansion — 18 verticals × 2 layouts each
     (single-column + two-column). Same structural quality bar as the
     Pro 15 above: real fields, formulas that resolve via runCalculations
     to believable defaults, primary number + breakdown lines, CTA, and a
     warm closing footnote. `multi-column` deliberately skipped to keep
     scope bounded — the unified renderer falls back cleanly when a trade
     only ships two layouts.
     ══════════════════════════════════════════════════════════════════ */

  /* ── Trade 1. HVAC Repair / Replacement (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service_type', name: 'Service Type', label: 'What do you need?', type: 'select',
        options: [opt('Tune-up / maintenance', 120), opt('Diagnostic & repair', 220), opt('Full system replacement', 4800)] },
      { id: 'system_size', name: 'System Size', label: 'System size (tons)', type: 'slider',
        min: 1.5, max: 6, step: 0.5, default_value: 3, unit: 'tons' },
      { id: 'system_age', name: 'System Age', label: 'System age', type: 'radio',
        options: [opt('Under 5 years', 0), opt('5 to 10 years', 80), opt('10 to 15 years', 180), opt('Over 15 years', 320)] },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'select',
        options: [opt('Scheduled visit', 0), opt('Within 24 hours', 75), opt('Same-day emergency', 195)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Refrigerant top-up', 145), opt('Smart thermostat install', 220), opt('Duct cleaning', 320), opt('Annual service plan', 180)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [System Size] * 35 + [System Age]'),
      calc('Add-ons Total', '[Extras]'),
      calc('Estimated Total', '[Service Cost] + [Urgency] + [Add-ons Total]'),
    ];
    const header: TemplateHeader = {
      title: 'HVAC Repair & Replacement Estimator',
      subtitle: 'Heating or cooling acting up? Get a clear price in under a minute.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Final pricing confirmed after on-site diagnostic. Most repairs scheduled within 48 hours.',
      cta_label: 'Book a Technician',
    };
    const base = {
      name: 'HVAC Repair & Replace', description: 'Per-trade HVAC quote covering diagnostics, repairs and full system replacement.',
      category: 'HVAC & Mechanical', trades: ['hvac_repair', 'hvac_installation', 'furnace_replacement', 'emergency_hvac', 'hvac_services'],
      theme: 'midnight', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'hvac_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'hvac_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 2. Plumbing Services (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'job_type', name: 'Job Type', label: 'What plumbing work do you need?', type: 'select',
        options: [opt('Clogged drain', 145), opt('Leaky faucet or fixture', 175), opt('Water heater repair', 285), opt('Pipe repair / replacement', 425), opt('Toilet install', 320), opt('Full bathroom rough-in', 1850)] },
      { id: 'urgency', name: 'Urgency', label: 'How urgent?', type: 'radio',
        options: [opt('Scheduled', 0), opt('Same day', 95), opt('After hours emergency', 245)] },
      { id: 'travel', name: 'Travel Distance', label: 'Travel distance', type: 'slider',
        min: 0, max: 60, step: 5, default_value: 10, unit: 'miles' },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Camera inspection', 145), opt('Water-pressure check', 65), opt('Shut-off valve replacement', 125), opt('Haul old fixtures', 55)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Labor & Materials', '[Job Type] + [Urgency]'),
      calc('Travel Fee', '[Travel Distance] * 2.5'),
      calc('Estimated Total', '[Labor & Materials] + [Travel Fee] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Plumbing Service Quote',
      subtitle: 'Tell us about the issue — get a transparent price in seconds.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed plumbers, upfront pricing, no surprises. Most jobs completed the same day.',
      cta_label: 'Book a Plumber',
    };
    const base = {
      name: 'Plumbing Services', description: 'Per-trade plumbing quote covering common repairs, installs and emergency calls.',
      category: 'HVAC & Mechanical', trades: ['plumbing_services', 'emergency_plumbing'],
      theme: 'light', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'plumbing_services_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'plumbing_services_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 3. Electrical Services (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What needs doing?', type: 'select',
        options: [opt('Outlet or switch replacement', 165), opt('Light fixture install', 195), opt('Ceiling fan install', 245), opt('Circuit / breaker repair', 380), opt('Panel upgrade (200A)', 2200), opt('Whole-home rewire', 5800)] },
      { id: 'rooms', name: 'Rooms Affected', label: 'Number of rooms / locations', type: 'number',
        min: 1, max: 20, step: 1, default_value: 1 },
      { id: 'permit', name: 'Permit Required', label: 'Permit needed', type: 'toggle', on_value: 185 },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled', 0), opt('Within 24 hours', 110), opt('Same-day emergency', 275)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Smart switch upgrade', 95), opt('Surge protector', 145), opt('GFCI outlet add', 75), opt('Whole-home safety inspection', 165)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Job Cost', '[Service Type] * [Rooms Affected]'),
      calc('Compliance & Urgency', '[Permit Required] + [Urgency]'),
      calc('Estimated Total', '[Job Cost] + [Compliance & Urgency] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Electrical Service Estimator',
      subtitle: 'From a single outlet to a full panel upgrade — get a licensed-electrician price now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'All work performed by licensed, insured electricians. Permits handled on your behalf.',
      cta_label: 'Schedule Service',
    };
    const base = {
      name: 'Electrical Services', description: 'Per-trade electrical quote covering common installs, upgrades and emergencies.',
      category: 'HVAC & Mechanical', trades: ['electrical_services', 'emergency_electrical', 'ev_charger'],
      theme: 'midnight', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'electrical_services_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'electrical_services_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 4. Appliance Repair (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'appliance', name: 'Appliance', label: 'Which appliance?', type: 'select',
        options: [opt('Refrigerator', 195), opt('Dishwasher', 165), opt('Washer', 175), opt('Dryer', 165), opt('Oven / range', 215), opt('Microwave (built-in)', 145)] },
      { id: 'issue', name: 'Issue Severity', label: 'How severe is the issue?', type: 'radio',
        options: [opt('Minor (light fix, sensor reset)', 0), opt('Moderate (part replacement)', 145), opt('Major (compressor / motor)', 385)] },
      { id: 'age', name: 'Appliance Age', label: 'Appliance age', type: 'select',
        options: [opt('Under 3 years', 0), opt('3 to 7 years', 35), opt('Over 7 years', 95)] },
      { id: 'trip', name: 'Service Call Fee', label: 'Service call fee included', type: 'toggle', on_value: 95 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Same-day visit', 75), opt('Extended 12-month parts warranty', 95), opt('Vent / hose inspection', 55)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Diagnosis & Repair', '[Appliance] + [Issue Severity] + [Appliance Age]'),
      calc('Estimated Total', '[Diagnosis & Repair] + [Service Call Fee] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Appliance Repair Quote',
      subtitle: 'Broken appliance? Get a fast, fixed-price quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Most repairs completed in a single visit. 90-day workmanship guarantee on all jobs.',
      cta_label: 'Book a Repair',
    };
    const base = {
      name: 'Appliance Repair', description: 'Per-appliance repair quote with severity-based pricing and same-day options.',
      category: 'Repair Services', trades: ['appliance_repair'],
      theme: 'coral', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'appliance_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'appliance_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 5. Drywall & Plaster (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Wall / Ceiling Area', label: 'Area to drywall', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 400, unit: 'sq ft' },
      { id: 'work_type', name: 'Work Type', label: 'Type of work', type: 'select',
        options: [opt('Patch & repair', 1.8), opt('Hang & finish (new)', 3.2), opt('Skim coat / re-plaster', 2.6), opt('Soundproof drywall', 4.4)] },
      { id: 'finish', name: 'Finish Level', label: 'Finish level', type: 'radio',
        options: [opt('Level 3 (textured)', 0), opt('Level 4 (smooth paint-ready)', 0.6), opt('Level 5 (gallery smooth)', 1.4)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Texture matching', 220), opt('Prime coat included', 185), opt('Debris haul-away', 145), opt('Mold-resistant board', 320)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Drywall Subtotal', '[Wall / Ceiling Area] * ([Work Type] + [Finish Level])'),
      calc('Estimated Total', '[Drywall Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Drywall & Plaster Estimator',
      subtitle: 'From a patch to a full hang & finish — get a square-foot price right now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Clean, paint-ready walls in days, not weeks. All debris removed on completion.',
      cta_label: 'Request Quote',
    };
    const base = {
      name: 'Drywall & Plaster', description: 'Square-foot drywall and plaster quote with finish-level pricing.',
      category: 'Construction', trades: ['drywall_plaster'],
      theme: 'mint', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'drywall_plaster_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'drywall_plaster_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 6. Tile Installation (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Tile Area', label: 'Area to tile', type: 'slider',
        min: 20, max: 1500, step: 10, default_value: 120, unit: 'sq ft' },
      { id: 'tile_type', name: 'Tile Type', label: 'Tile type', type: 'select',
        options: [opt('Ceramic', 7), opt('Porcelain', 11), opt('Natural stone', 18), opt('Large-format / luxury', 24)] },
      { id: 'pattern', name: 'Pattern', label: 'Layout pattern', type: 'radio',
        options: [opt('Straight set', 0), opt('Diagonal', 1.5), opt('Herringbone / chevron', 3.5)] },
      { id: 'location', name: 'Location', label: 'Where is it going?', type: 'select',
        options: [opt('Floor', 0), opt('Wall', 1.5), opt('Shower / wet area', 4.5), opt('Backsplash', 2)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Remove existing tile', 320), opt('Subfloor prep', 275), opt('Heated floor system', 850), opt('Sealing & grout finish', 145)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Materials & Labor', '[Tile Area] * ([Tile Type] + [Pattern] + [Location])'),
      calc('Estimated Total', '[Materials & Labor] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Tile Installation Calculator',
      subtitle: 'Floors, walls, showers — get a per-square-foot price for any tile job.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Premium materials, lifetime workmanship warranty. Free measurement visit included.',
      cta_label: 'Get a Detailed Quote',
    };
    const base = {
      name: 'Tile Installation', description: 'Tile install quote by area, type, pattern and location.',
      category: 'Construction', trades: ['tile_installation', 'flooring_installation'],
      theme: 'light', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'tile_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'tile_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 7. Window Replacement (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'windows', name: 'Number of Windows', label: 'Number of windows', type: 'slider',
        min: 1, max: 30, step: 1, default_value: 6, unit: 'windows' },
      { id: 'window_type', name: 'Window Type', label: 'Window type', type: 'select',
        options: [opt('Single-hung vinyl', 425), opt('Double-hung vinyl', 565), opt('Casement', 685), opt('Fiberglass premium', 845), opt('Bay / bow', 1450)] },
      { id: 'glass', name: 'Glass Package', label: 'Glass package', type: 'radio',
        options: [opt('Double-pane standard', 0), opt('Double-pane low-E', 65), opt('Triple-pane', 175)] },
      { id: 'removal', name: 'Removal', label: 'Remove & haul old windows', type: 'toggle', on_value: 245 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Custom trim', 95), opt('Interior blinds', 145), opt('Exterior wrap', 85), opt('Lifetime warranty upgrade', 195)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Windows Subtotal', '[Number of Windows] * ([Window Type] + [Glass Package])'),
      calc('Extras Total', '[Extras] * [Number of Windows]'),
      calc('Estimated Total', '[Windows Subtotal] + [Removal] + [Extras Total]'),
    ];
    const header: TemplateHeader = {
      title: 'Window Replacement Estimator',
      subtitle: 'Energy-efficient new windows — get a per-window price you can trust.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'ENERGY STAR-rated windows installed by certified pros. Lifetime product warranty.',
      cta_label: 'Schedule a Measurement',
    };
    const base = {
      name: 'Window Replacement', description: 'Per-window replacement quote with glass packages and trim add-ons.',
      category: 'Home Improvement', trades: ['window_replacement'],
      theme: 'light', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'window_replacement_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'window_replacement_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 8. Door Installation (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'door_type', name: 'Door Type', label: 'Door type', type: 'select',
        options: [opt('Interior pre-hung', 285), opt('Interior solid-core', 425), opt('Exterior steel', 685), opt('Exterior fiberglass', 845), opt('Sliding patio door', 1250), opt('French double door', 1650)] },
      { id: 'doors', name: 'Number of Doors', label: 'Number of doors', type: 'number',
        min: 1, max: 15, step: 1, default_value: 2 },
      { id: 'removal', name: 'Remove Old Door', label: 'Remove the old door & frame', type: 'toggle', on_value: 95 },
      { id: 'hardware', name: 'Hardware Level', label: 'Hardware level', type: 'radio',
        options: [opt('Standard knob set', 0), opt('Mid-range lever set', 75), opt('Premium smart lock', 245)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Custom trim & casing', 145), opt('Weatherstripping upgrade', 65), opt('Re-frame opening', 320), opt('Paint or stain finish', 125)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Doors Subtotal', '([Door Type] + [Hardware Level]) * [Number of Doors]'),
      calc('Service Total', '[Removal] * [Number of Doors] + [Extras]'),
      calc('Estimated Total', '[Doors Subtotal] + [Service Total]'),
    ];
    const header: TemplateHeader = {
      title: 'Door Installation Cost Calculator',
      subtitle: 'Interior or exterior, single or French — get a clear quote per door.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Pro install, all hardware fitted, debris removed. Most jobs done in a single day.',
      cta_label: 'Get a Detailed Quote',
    };
    const base = {
      name: 'Door Installation', description: 'Per-door install quote covering interior, exterior and patio doors.',
      category: 'Home Improvement', trades: ['door_installation'],
      theme: 'mint', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'door_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'door_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 9. Siding Installation (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Siding Area', label: 'Exterior wall area', type: 'slider',
        min: 200, max: 5000, step: 50, default_value: 1800, unit: 'sq ft' },
      { id: 'material', name: 'Material', label: 'Siding material', type: 'select',
        options: [opt('Vinyl', 5), opt('Fiber-cement', 9), opt('Engineered wood', 11), opt('Cedar', 14), opt('Stone veneer accent', 22)] },
      { id: 'stories', name: 'Home Stories', label: 'Home height', type: 'radio',
        options: [opt('1 story', 0), opt('2 story', 1.5), opt('3 story', 3.5)] },
      { id: 'removal', name: 'Remove Old Siding', label: 'Remove existing siding', type: 'toggle', on_value: 1450 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Insulation wrap (R-3)', 1850), opt('New gutters', 1450), opt('Trim & soffit upgrade', 1250), opt('Lifetime color warranty', 950)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material & Labor', '[Siding Area] * ([Material] + [Home Stories])'),
      calc('Estimated Total', '[Material & Labor] + [Remove Old Siding] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Siding Installation Estimator',
      subtitle: 'Refresh your home exterior with a transparent per-square-foot quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Premium materials, factory-trained installers, manufacturer-backed warranties.',
      cta_label: 'Book a Free Inspection',
    };
    const base = {
      name: 'Siding Installation', description: 'Whole-home siding quote by area, material and number of stories.',
      category: 'Construction', trades: ['siding_installation'],
      theme: 'forest', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'siding_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'siding_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 10. Deck Construction (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Deck Area', label: 'Deck size', type: 'slider',
        min: 50, max: 1500, step: 10, default_value: 300, unit: 'sq ft' },
      { id: 'material', name: 'Decking Material', label: 'Decking material', type: 'select',
        options: [opt('Pressure-treated pine', 22), opt('Cedar', 35), opt('Composite (mid)', 48), opt('Composite (premium)', 62), opt('Hardwood (ipe)', 78)] },
      { id: 'height', name: 'Deck Height', label: 'Deck height', type: 'radio',
        options: [opt('Ground level', 0), opt('Raised (under 8 ft)', 6), opt('Elevated (8 ft+)', 14)] },
      { id: 'railing', name: 'Railing', label: 'Railing style', type: 'select',
        options: [opt('No railing', 0), opt('Wood railing', 28), opt('Aluminum railing', 42), opt('Glass panel railing', 68)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Built-in bench seating', 850), opt('Pergola / shade structure', 1850), opt('LED step lighting', 650), opt('Stairs (one set)', 950)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Deck Subtotal', '[Deck Area] * ([Decking Material] + [Deck Height] + [Railing])'),
      calc('Estimated Total', '[Deck Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Deck Construction Estimator',
      subtitle: 'Design your dream deck — get a transparent material + labor quote in seconds.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Custom-built decks with permits, inspection, and 10-year structural warranty included.',
      cta_label: 'Design My Deck',
    };
    const base = {
      name: 'Deck Construction', description: 'Custom deck build quote by area, material, height and railing style.',
      category: 'Outdoor', trades: ['deck_construction', 'deck_building'],
      theme: 'forest', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'deck_construction_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'deck_construction_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 11. Insulation Installation (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Insulation Area', label: 'Area to insulate', type: 'slider',
        min: 100, max: 4000, step: 50, default_value: 1200, unit: 'sq ft' },
      { id: 'type', name: 'Insulation Type', label: 'Insulation type', type: 'select',
        options: [opt('Fiberglass batt', 1.8), opt('Blown-in cellulose', 2.4), opt('Spray foam (open-cell)', 4.2), opt('Spray foam (closed-cell)', 5.8), opt('Rigid foam board', 3.4)] },
      { id: 'location', name: 'Location', label: 'Where is the insulation going?', type: 'radio',
        options: [opt('Attic', 0), opt('Walls', 0.8), opt('Crawl space / basement', 1.4), opt('Rim joist seal', 2.2)] },
      { id: 'removal', name: 'Remove Old Insulation', label: 'Remove existing insulation', type: 'toggle', on_value: 685 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Air sealing & gap fill', 485), opt('Vapor barrier', 325), opt('Attic baffles', 245), opt('Energy audit report', 295)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Materials & Labor', '[Insulation Area] * ([Insulation Type] + [Location])'),
      calc('Estimated Total', '[Materials & Labor] + [Remove Old Insulation] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Insulation Installation Quote',
      subtitle: 'Lower energy bills, year-round comfort — get a per-square-foot quote now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'BPI-certified installers. Most homeowners see a 15-25% energy bill reduction.',
      cta_label: 'Schedule an Energy Audit',
    };
    const base = {
      name: 'Insulation Installation', description: 'Insulation quote by area, type and location with energy-audit add-on.',
      category: 'Home Improvement', trades: ['insulation_installation'],
      theme: 'mint', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'insulation_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'insulation_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 12. Pest Control (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'pest', name: 'Pest Type', label: 'What pest are you dealing with?', type: 'select',
        options: [opt('General (ants / spiders / roaches)', 145), opt('Rodents (mice / rats)', 245), opt('Bed bugs', 485), opt('Termites', 685), opt('Wasps / hornets', 195), opt('Wildlife removal', 385)] },
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'radio',
        options: [opt('Under 1,500 sq ft', 0), opt('1,500 to 3,000 sq ft', 65), opt('Over 3,000 sq ft', 145)] },
      { id: 'plan', name: 'Service Plan', label: 'Service plan', type: 'select',
        options: [opt('One-time treatment', 0), opt('Quarterly plan (annual)', 95), opt('Monthly premium plan', 245)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Exterior perimeter spray', 85), opt('Attic / crawl-space treatment', 145), opt('Eco-friendly products', 65), opt('Follow-up inspection', 75)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Treatment Cost', '[Pest Type] + [Home Size]'),
      calc('Estimated Total', '[Treatment Cost] + [Service Plan] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Pest Control Service Quote',
      subtitle: 'Identify your pest, get an instant treatment price — protection starts today.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed pest pros, family- and pet-safe options. 30-day satisfaction guarantee.',
      cta_label: 'Schedule a Treatment',
    };
    const base = {
      name: 'Pest Control', description: 'Per-pest treatment quote with home-size sizing and recurring plan options.',
      category: 'Specialty Services', trades: ['pest_control'],
      theme: 'forest', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'pest_control_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'pest_control_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 13. Tree Service (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Trimming / pruning', 285), opt('Tree removal', 685), opt('Stump grinding', 195), opt('Emergency / storm damage', 950)] },
      { id: 'trees', name: 'Number of Trees', label: 'Number of trees', type: 'number',
        min: 1, max: 25, step: 1, default_value: 1 },
      { id: 'size', name: 'Tree Size', label: 'Average tree size', type: 'radio',
        options: [opt('Small (under 25 ft)', 0), opt('Medium (25 to 50 ft)', 185), opt('Large (50 to 75 ft)', 425), opt('Very large (75 ft+)', 850)] },
      { id: 'access', name: 'Access Difficulty', label: 'Site access', type: 'radio',
        options: [opt('Easy access', 0), opt('Tight / fenced yard', 145), opt('Crane required', 685)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Haul wood away', 145), opt('Wood chipping on site', 95), opt('Stump grinding included', 195), opt('Cabling / bracing', 245)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Per-Tree Cost', '[Service Type] + [Tree Size]'),
      calc('Job Subtotal', '[Per-Tree Cost] * [Number of Trees] + [Access Difficulty]'),
      calc('Estimated Total', '[Job Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Tree Service Cost Calculator',
      subtitle: 'Trimming, removal, storm response — get an instant arborist quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Certified arborists, fully insured crews. Emergency response available 24/7.',
      cta_label: 'Request a Site Visit',
    };
    const base = {
      name: 'Tree Service', description: 'Per-tree trimming, removal and stump-grinding quote with access-difficulty sizing.',
      category: 'Outdoor', trades: ['tree_trimming', 'tree_service'],
      theme: 'forest', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'tree_service_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'tree_service_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 14. Junk Removal (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'load_size', name: 'Load Size', label: 'How much junk?', type: 'select',
        options: [opt('Single item pickup', 95), opt('Quarter truck load', 195), opt('Half truck load', 345), opt('Three-quarter truck load', 485), opt('Full truck load', 595)] },
      { id: 'category', name: 'Item Category', label: 'What kind of items?', type: 'radio',
        options: [opt('General household', 0), opt('Furniture / appliances', 65), opt('Construction debris', 145), opt('Yard waste', 45)] },
      { id: 'access', name: 'Access', label: 'Where are the items?', type: 'select',
        options: [opt('Curbside / garage', 0), opt('Inside ground floor', 35), opt('Upstairs / basement', 85)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Same-day pickup', 65), opt('E-waste / electronics', 75), opt('Hazardous item disposal', 145), opt('Light cleaning after', 95)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Pickup Cost', '[Load Size] + [Item Category] + [Access]'),
      calc('Estimated Total', '[Pickup Cost] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Junk Removal Quote',
      subtitle: 'From a single piece to a full truck — fast, transparent, no surprises.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'We load, haul, sweep up, and donate or recycle whenever possible.',
      cta_label: 'Book a Pickup',
    };
    const base = {
      name: 'Junk Removal', description: 'Junk pickup quote by load size, item category and access difficulty.',
      category: 'Specialty Services', trades: ['junk_removal'],
      theme: 'coral', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'junk_removal_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'junk_removal_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 15. Pool Cleaning & Maintenance (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'pool_size', name: 'Pool Size', label: 'Pool size (gallons)', type: 'slider',
        min: 5000, max: 50000, step: 1000, default_value: 15000, unit: 'gal' },
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Weekly maintenance', 110), opt('One-time deep clean', 295), opt('Opening / closing service', 385), opt('Green-to-clean rescue', 485)] },
      { id: 'pool_type', name: 'Pool Type', label: 'Pool type', type: 'radio',
        options: [opt('In-ground concrete', 0), opt('Vinyl liner', -15), opt('Fiberglass', -25), opt('Saltwater system', 25)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Chemical balancing', 45), opt('Filter cleaning', 65), opt('Tile scrubbing', 85), opt('Equipment inspection', 75)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [Pool Type] + [Pool Size] * 0.004'),
      calc('Estimated Total', '[Service Cost] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Pool Cleaning Quote',
      subtitle: 'Crystal-clear water all season — get a per-visit price right now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Trained pool techs, all chemicals included. Discounts on prepaid season packages.',
      cta_label: 'Schedule Pool Service',
    };
    const base = {
      name: 'Pool Cleaning & Maintenance', description: 'Pool service quote by size, type and visit frequency.',
      category: 'Outdoor', trades: ['pool_cleaning', 'pool_service'],
      theme: 'mint', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'pool_cleaning_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'pool_cleaning_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 16. Garage Door (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What needs doing?', type: 'select',
        options: [opt('Spring replacement', 285), opt('Opener repair', 245), opt('Cable / roller replacement', 195), opt('Panel replacement', 485), opt('Full door replacement', 1450), opt('New opener install', 525)] },
      { id: 'door_size', name: 'Door Size', label: 'Door size', type: 'radio',
        options: [opt('Single car', 0), opt('Double car', 145), opt('Oversized / commercial', 385)] },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled', 0), opt('Same day', 75), opt('After hours', 195)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Smart opener upgrade', 195), opt('Insulated panels', 285), opt('New weather seal', 95), opt('Battery backup', 145)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [Door Size]'),
      calc('Estimated Total', '[Service Cost] + [Urgency] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Garage Door Service Estimator',
      subtitle: 'Repair or replace — get a clear, same-day price for your garage door.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Most repairs completed in one visit. Lifetime warranty on springs and openers.',
      cta_label: 'Book a Technician',
    };
    const base = {
      name: 'Garage Door Service', description: 'Garage door repair and replacement quote with same-day options.',
      category: 'Repair Services', trades: ['garage_door'],
      theme: 'midnight', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'garage_door_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'garage_door_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 17. Locksmith (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What do you need?', type: 'select',
        options: [opt('Residential lockout', 95), opt('Car lockout', 145), opt('Re-key locks', 165), opt('New lock install', 195), opt('Smart lock install', 295), opt('Safe opening', 485)] },
      { id: 'locks', name: 'Number of Locks', label: 'How many locks?', type: 'number',
        min: 1, max: 12, step: 1, default_value: 1 },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled appointment', 0), opt('Within the hour', 85), opt('After-hours emergency', 165)] },
      { id: 'travel', name: 'Travel', label: 'Travel distance', type: 'slider',
        min: 0, max: 50, step: 5, default_value: 10, unit: 'miles' },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('High-security keys', 65), opt('Master key system', 145), opt('Security assessment', 95), opt('Spare key set', 35)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] * [Number of Locks]'),
      calc('Trip Charge', '[Travel] * 2 + [Urgency]'),
      calc('Estimated Total', '[Service Cost] + [Trip Charge] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Locksmith Service Quote',
      subtitle: 'Locked out, locked in, or just upgrading — get a price in under a minute.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed, bonded, insured locksmiths. 24/7 mobile response across the metro area.',
      cta_label: 'Request a Locksmith',
    };
    const base = {
      name: 'Locksmith Services', description: 'Locksmith quote covering lockouts, re-keying and lock installs.',
      category: 'Specialty Services', trades: ['locksmith'],
      theme: 'midnight', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'locksmith_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'locksmith_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 18. Chimney Sweep (Cleaning) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Standard chimney sweep', 195), opt('Sweep + Level 2 inspection', 345), opt('Cap / crown repair', 485), opt('Liner replacement', 1850), opt('Creosote removal (heavy)', 425)] },
      { id: 'flues', name: 'Number of Flues', label: 'Number of flues', type: 'number',
        min: 1, max: 6, step: 1, default_value: 1 },
      { id: 'access', name: 'Access', label: 'Roof access', type: 'radio',
        options: [opt('Easy (1 story)', 0), opt('Moderate (2 story)', 65), opt('Difficult / steep pitch', 145)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Chimney cap install', 195), opt('Animal / nest removal', 145), opt('Smoke / camera inspection', 165), opt('Waterproofing seal', 285)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] * [Number of Flues]'),
      calc('Estimated Total', '[Service Cost] + [Access] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Chimney Sweep & Inspection Quote',
      subtitle: 'A safe, clean chimney before fire season — get an instant price.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'CSIA-certified sweeps, no-mess cleanup, written inspection report on every visit.',
      cta_label: 'Schedule Inspection',
    };
    const base = {
      name: 'Chimney Sweep', description: 'Chimney sweep and inspection quote with cap and liner options.',
      category: 'Cleaning', trades: ['chimney_sweep'],
      theme: 'coral', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'chimney_sweep_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'chimney_sweep_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 19. Water Damage Restoration (Restoration) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Affected Area', label: 'Affected area', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 350, unit: 'sq ft' },
      { id: 'water_class', name: 'Water Category', label: 'Water category', type: 'radio',
        options: [opt('Clean water (Cat 1)', 4.5), opt('Gray water (Cat 2)', 7.5), opt('Black water (Cat 3)', 12)] },
      { id: 'damage_level', name: 'Damage Level', label: 'Damage level', type: 'select',
        options: [opt('Class 1 — minor surface', 0), opt('Class 2 — carpet & walls', 485), opt('Class 3 — saturated structure', 1450), opt('Class 4 — specialty materials', 2850)] },
      { id: 'response', name: 'Response Time', label: 'Response time', type: 'radio',
        options: [opt('Within 24 hours', 0), opt('Same-day rapid response', 285), opt('Within 2 hours emergency', 685)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Antimicrobial treatment', 425), opt('Content pack-out & storage', 850), opt('Insurance claim assistance', 0), opt('Air-quality testing', 295)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Extraction & Drying', '[Affected Area] * [Water Category]'),
      calc('Estimated Total', '[Extraction & Drying] + [Damage Level] + [Response Time] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Water Damage Restoration Estimator',
      subtitle: 'Burst pipe, flood, or leak? Get an immediate restoration quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'IICRC-certified techs on call 24/7. We work directly with your insurance carrier.',
      cta_label: 'Get Emergency Help',
    };
    const base = {
      name: 'Water Damage Restoration', description: 'Restoration quote by affected area, water category and damage class.',
      category: 'Restoration', trades: ['water_damage', 'water_damage_restoration'],
      theme: 'coral', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'water_damage_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'water_damage_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 20. Mold Remediation (Restoration) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Affected Area', label: 'Affected area', type: 'slider',
        min: 10, max: 1000, step: 10, default_value: 80, unit: 'sq ft' },
      { id: 'severity', name: 'Severity', label: 'Mold severity', type: 'radio',
        options: [opt('Light surface mold', 8), opt('Moderate growth', 18), opt('Heavy / structural', 32), opt('Toxic black mold', 48)] },
      { id: 'location', name: 'Location', label: 'Where is the mold?', type: 'select',
        options: [opt('Bathroom / single room', 0), opt('Basement / crawl space', 285), opt('HVAC system', 685), opt('Multiple rooms', 485), opt('Attic', 325)] },
      { id: 'testing', name: 'Pre/Post Testing', label: 'Independent lab testing', type: 'toggle', on_value: 385 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Containment barriers', 285), opt('HEPA air scrubbing', 425), opt('Drywall / material replacement', 685), opt('Encapsulation coating', 545)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Remediation Subtotal', '[Affected Area] * [Severity]'),
      calc('Estimated Total', '[Remediation Subtotal] + [Location] + [Pre/Post Testing] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Mold Remediation Quote',
      subtitle: 'Safe, certified mold removal — get a detailed estimate without the guesswork.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'IICRC-certified remediation, EPA-approved products, written clearance on every job.',
      cta_label: 'Book an Inspection',
    };
    const base = {
      name: 'Mold Remediation', description: 'Mold remediation quote by affected area, severity and location.',
      category: 'Restoration', trades: ['mold_remediation'],
      theme: 'magenta', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'mold_remediation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'mold_remediation_two_col', layout: 'two-column' as TemplateLayout, ...base },
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

/**
 * Build a synthetic placeholder `AdvancedConfigShape` for the live preview.
 *
 * Used when the user picks a layout (or Blank) with no real template — the
 * `AdvancedCalculator` renderer needs a real config to render the CSS-Grid
 * layouts, otherwise the preview falls back to the legacy stepper pipeline
 * that doesn't honour `single-column | two-column | multi-column` at all.
 *
 * This config is PREVIEW-ONLY: callers must NOT persist it to a saved
 * calculator. It carries `__preview: true` so persistence layers can filter
 * it out, and `calculator_settings` strips it on Continue.
 */
export function buildBlankPreviewConfig(
  layout: TemplateLayout, _businessName?: string,
): AdvancedConfigShape & { __preview: true } {
  // Leave `header.title` blank so the renderer falls back to the live
  // `calculator.business_name` (which updates as the user types), keeping the
  // preview header reactive. No `subtitle` — Wave G removed the auto-subtitle
  // from the placeholder so the preview header reads as a single clean line.
  // Service type + Quantity share a row (`colSpan: 1`); Add-ons spans the
  // full width below them.
  return {
    enabled: true,
    theme: 'light',
    layout,
    fields: [
      { id: 'service', name: 'Service', label: 'Service type', type: 'select', colSpan: 1,
        options: [opt('Standard', 100), opt('Premium', 180), opt('Deluxe', 260)] },
      { id: 'quantity', name: 'Quantity', label: 'Quantity', type: 'number', colSpan: 1,
        min: 1, max: 50, step: 1, default_value: 1 },
      { id: 'addons', name: 'Add-ons', label: 'Add-ons', type: 'multi_select', colSpan: 2,
        options: [opt('Express', 40), opt('Materials', 60), opt('Warranty', 25)] },
    ],
    calculations: [calc('Estimated Total', '[Service] * [Quantity] + [Add-ons]')],
    result_calc: 'Estimated Total',
    header: { title: '', align: 'left' },
    results: { footnote: 'Preview only — your real numbers appear once you set pricing.' },
    __preview: true,
  } as AdvancedConfigShape & { __preview: true };
}
