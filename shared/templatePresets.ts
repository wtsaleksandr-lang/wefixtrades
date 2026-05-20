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
