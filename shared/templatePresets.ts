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

export interface TemplateOption {
  id: string;
  label: string;
  value: number;
  /** Wave W-R4 — optional image (data URL) for `image_choice` field cards. */
  image?: string;
}

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
  /**
   * Wave H4 — Elfsight-style display fields. ALL optional and backward-
   * compatible: every existing template (66 entries at time of writing) is
   * valid without setting any of these.
   *
   * - `resultMode`    — controls where this calc renders in the result panel.
   *   `'primary'`     → renders as the large headline value (the calc that
   *                     "is" the price).
   *   `'secondary'`   → renders as a breakdown row beneath the headline.
   *   `undefined`     → treated as `'secondary'` for rendering, but the
   *                     legacy `result_calc` field still wins when no calc
   *                     is explicitly marked primary.
   * - `caption`       — optional supplementary line rendered below this
   *                     calc's value (e.g. "incl. tax", "per visit").
   * - `showInResults` — `false` hides this calc from the result panel
   *                     (formula still evaluates so later calcs can chain
   *                     off it). `undefined` or `true` shows it — preserving
   *                     current behaviour.
   * - `divider`       — when `true`, render a thin divider above this row
   *                     in the result panel for visual grouping.
   */
  resultMode?: 'primary' | 'secondary';
  caption?: string;
  showInResults?: boolean;
  divider?: boolean;
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
  /**
   * Wave W-AH-2 — default trade-relevant Lucide icon name rendered in the
   * widget header's logo slot when no user logo has been uploaded. Keeps
   * templates looking polished out of the box. Optional & back-compat.
   */
  defaultIcon?: string;
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
  /**
   * W-AS-1 — optional template-level Style overrides.
   *
   * When a template ships with a `style` block, `toAdvancedConfig()` carries
   * it through to the runtime `AdvancedConfigShape` so the rendered widget
   * picks up the template's visual identity (accent, surface, typography,
   * logo placement, etc.) instead of defaulting to the bare theme. Users can
   * still override per-field via the Style tab after the template is loaded.
   */
  style?: AdvStyle;
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
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Truck',
    header: { title: 'Dispatch a Tow Truck in 60 Seconds', subtitle: 'Licensed & insured · 24/7 response · Flat-rate per-mile pricing', align: 'left' },
    fields: [
      { id: 'vehicle_type', name: 'Vehicle Type', label: 'What are we towing?', type: 'select',
        options: [opt('Car', 0), opt('SUV', 25), opt('Truck', 60), opt('Motorcycle', -10)] },
      { id: 'condition', name: 'Vehicle Condition', label: 'Is the vehicle driveable?', type: 'select',
        options: [opt('Driveable', 0), opt('Not driveable', 45)] },
      { id: 'distance', name: 'Towing Distance', label: 'Distance to destination', type: 'slider',
        min: 1, max: 100, step: 1, default_value: 8, unit: 'miles' },
      { id: 'extras', name: 'Additional Services', label: 'Roadside add-ons', type: 'multi_select',
        options: [opt('Winching', 50), opt('Tire Change', 25), opt('Lockout Service', 35), opt('Fuel Delivery', 30)] },
    ],
    calculations: [
      calc('Hook-up Fee', '45 + [Vehicle Type] + [Vehicle Condition]'),
      calc('Mileage Charge', '[Towing Distance] * 5'),
      calc('Roadside Add-ons', '[Additional Services]'),
      calc('Total Towing Cost', '[Hook-up Fee] + [Mileage Charge] + [Roadside Add-ons]'),
    ],
    result_calc: 'Total Towing Cost',
    results: {
      heading: 'Your Tow Estimate',
      show_breakdown: true,
      cta_label: 'Dispatch a Truck Now',
      footnote: 'Mileage is charged at $5.00/mile. After-hours and storage surcharges quoted on dispatch.',
    },
  },

  /* ── 2. Driveway paving ── */
  {
    id: 'driveway_paving', name: 'Driveway Paving', description: 'Area-based driveway paving estimate.',
    category: 'Construction', trades: ['concrete_driveway', 'concrete_patio'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Construction',
    header: { title: 'Get Your Driveway Paving Quote in 60 Seconds', subtitle: 'Licensed paving contractors · 10-year workmanship warranty · Free on-site survey', align: 'left' },
    fields: [
      { id: 'area', name: 'Driveway Area', label: 'Driveway size (sqm)', type: 'slider',
        min: 10, max: 300, step: 5, default_value: 65, unit: 'sqm' },
      { id: 'material', name: 'Surface Material', label: 'Driveway surface material', type: 'select',
        options: [opt('Asphalt', 45), opt('Concrete', 60), opt('Block paving', 90), opt('Resin', 110)] },
      { id: 'removal', name: 'Old Surface Removal', label: 'Remove the existing surface', type: 'toggle', on_value: 600 },
      { id: 'edging', name: 'Decorative Edging', label: 'Add decorative edging', type: 'toggle', on_value: 350 },
    ],
    calculations: [
      calc('Materials & Surface', '[Driveway Area] * [Surface Material]'),
      calc('Prep & Removal', '[Old Surface Removal]'),
      calc('Finishing Touches', '[Decorative Edging]'),
      calc('Total Paving Cost', '[Materials & Surface] + [Prep & Removal] + [Finishing Touches]'),
    ],
    result_calc: 'Total Paving Cost',
    results: {
      heading: 'Your Driveway Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Survey',
      footnote: 'Includes excavation, sub-base, surface, and clean-up. Final price confirmed during free on-site survey. Quote locked for 30 days.',
    },
  },

  /* ── 3. Property cleaning ── */
  {
    id: 'property_cleaning', name: 'Property Cleaning', description: 'Room-based cleaning quote with extras.',
    category: 'Cleaning', trades: ['house_cleaning', 'office_cleaning', 'deep_cleaning'],
    layout: 'two-column', theme: 'light', defaultIcon: 'Sparkles',
    header: { title: 'Get an Instant Cleaning Quote', subtitle: 'Bonded & insured cleaners · 4.9★ from 1,800+ jobs · 100% satisfaction re-clean guarantee', align: 'left' },
    fields: [
      { id: 'bedrooms', name: 'Bedrooms', label: 'How many bedrooms?', type: 'number', min: 0, max: 12, step: 1, default_value: 3 },
      { id: 'bathrooms', name: 'Bathrooms', label: 'How many bathrooms?', type: 'number', min: 0, max: 8, step: 1, default_value: 2 },
      { id: 'deep_clean', name: 'Deep Clean', label: 'Add a deep clean (inside oven, fridge, baseboards)', type: 'toggle', on_value: 60 },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'select',
        options: [opt('One-off', 0), opt('Fortnightly', -10), opt('Weekly', -18)] },
    ],
    calculations: [
      calc('Bedroom Cleaning', '[Bedrooms] * 28'),
      calc('Bathroom Cleaning', '[Bathrooms] * 22'),
      calc('Deep Clean Add-on', '[Deep Clean]'),
      calc('Frequency Discount', '[Frequency]'),
      calc('Total Price', '[Bedroom Cleaning] + [Bathroom Cleaning] + [Deep Clean Add-on] + [Frequency Discount]'),
    ],
    result_calc: 'Total Price',
    results: {
      heading: 'Your Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Cleaning',
      footnote: 'Includes all supplies and a bonded cleaning team. 24-hour re-clean guarantee — if you find a spot, we come back free.',
    },
  },

  /* ── 4. Energy efficiency upgrade ── */
  {
    id: 'energy_upgrade', name: 'Energy Upgrade', description: 'Home efficiency upgrade estimate.',
    category: 'Home Improvement', trades: ['hvac_services'],
    layout: 'multi-column', theme: 'midnight', defaultIcon: 'Leaf',
    header: { title: 'Cut Your Energy Bill — Get a Free Upgrade Quote', subtitle: 'BPI-certified · ENERGY STAR partner · Most homeowners save 20–30% on monthly bills', align: 'left' },
    fields: [
      { id: 'upgrade', name: 'Upgrade Type', label: 'Which upgrade are you considering?', type: 'select',
        options: [opt('Insulation', 0), opt('Windows', 1500), opt('HVAC', 4000), opt('Solar', 8000)] },
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'number',
        min: 200, max: 8000, step: 50, default_value: 1800, unit: 'sqft' },
      { id: 'incentives', name: 'Local Incentives', label: 'Available rebates & tax credits', type: 'multi_select',
        options: [opt('Rebates', -500), opt('Tax Incentives', -800)] },
      { id: 'install', name: 'Installation', label: 'Include professional installation', type: 'toggle', on_value: 1200 },
    ],
    calculations: [
      calc('Equipment & Materials', '[Upgrade Type] + [Home Size] * 2'),
      calc('Professional Installation', '[Installation]'),
      calc('Incentives Applied', '[Local Incentives]'),
      calc('Estimated Upgrade Cost', '[Equipment & Materials] + [Professional Installation] + [Incentives Applied]'),
    ],
    result_calc: 'Estimated Upgrade Cost',
    results: {
      heading: 'Your Net Upgrade Cost',
      show_breakdown: true,
      cta_label: 'Schedule My Free Energy Audit',
      footnote: 'Eligible for the 30% federal energy tax credit on most upgrades. Free home energy audit included with every install.',
    },
  },

  /* ── 5. Landscaping ── */
  {
    id: 'landscaping', name: 'Landscaping', description: 'Garden landscaping & maintenance quote.',
    category: 'Outdoor', trades: ['landscaping', 'lawn_mowing', 'garden_maintenance', 'tree_trimming'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'Trees',
    header: { title: 'Design Your Dream Garden — Instant Quote', subtitle: 'Award-winning landscapers · Fully insured crews · Free design consultation', align: 'left' },
    fields: [
      { id: 'area', name: 'Garden Area', label: 'Garden size (sqm)', type: 'slider',
        min: 10, max: 1000, step: 10, default_value: 150, unit: 'sqm' },
      { id: 'service', name: 'Service', label: 'Which service do you need?', type: 'select',
        options: [opt('Mowing & tidy-up', 3), opt('Full maintenance', 7), opt('Garden redesign', 22)] },
      { id: 'extras', name: 'Extras', label: 'Optional extras', type: 'multi_select',
        options: [opt('Green-waste removal', 90), opt('New turf', 480), opt('Planting & beds', 320)] },
      { id: 'visits', name: 'Visits', label: 'How many visits per month?', type: 'number',
        min: 1, max: 8, step: 1, default_value: 2, unit: '/mo' },
    ],
    calculations: [
      calc('Maintenance Cost', '[Garden Area] * [Service] * [Visits]'),
      calc('Optional Extras', '[Extras]'),
      calc('Estimated Quote', '[Maintenance Cost] + [Optional Extras]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Monthly Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Consultation',
      footnote: 'Includes all labor, equipment, and standard green-waste disposal. Annual contracts save 10%.',
    },
  },

  /* ── 6. Gutter cleaning ── */
  {
    id: 'gutter_cleaning', name: 'Gutter Cleaning', description: 'Length-based gutter cleaning quote.',
    category: 'Cleaning', trades: ['window_cleaning', 'pressure_washing'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'Droplets',
    header: { title: 'Get Your Gutter Cleaning Quote in 60 Seconds', subtitle: 'Fully insured · OSHA-trained ladder crews · Free downspout flush included', align: 'left' },
    fields: [
      { id: 'length', name: 'Gutter Length', label: 'Total gutter length (feet)', type: 'slider',
        min: 1, max: 300, step: 1, default_value: 120, unit: 'feet' },
      { id: 'difficulty', name: 'Cleaning Difficulty', label: 'How tough is the access?', type: 'radio',
        options: [opt('Easy', 0), opt('Moderate', 35), opt('Difficult', 80)] },
    ],
    calculations: [
      calc('Linear-foot Cleaning', '[Gutter Length] * 2'),
      calc('Access Surcharge', '[Cleaning Difficulty]'),
      calc('Estimated Cost', '[Linear-foot Cleaning] + [Access Surcharge]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Gutter Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Cleaning',
      footnote: 'Includes hand-removal of debris, downspout flush, and before/after photos. Free leaf-guard inspection on every visit.',
    },
  },

  /* ── 7. Fence installation ── */
  {
    id: 'fence_installation', name: 'Fence Installation', description: 'Per-metre fencing install estimate.',
    category: 'Outdoor', trades: ['fence_installation', 'deck_building'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'Fence',
    header: { title: 'Get Your Fence Installation Quote in 60 Seconds', subtitle: 'Licensed fence contractors · 10-year structural warranty · Free property-line survey', align: 'left' },
    fields: [
      { id: 'length', name: 'Fence Length', label: 'Fence length (metres)', type: 'slider',
        min: 1, max: 200, step: 1, default_value: 30, unit: 'm' },
      { id: 'material', name: 'Fence Type', label: 'Fence material', type: 'select',
        options: [opt('Timber panel', 38), opt('Closeboard', 52), opt('Composite', 78), opt('Metal railing', 95)] },
      { id: 'gates', name: 'Gates', label: 'How many gates?', type: 'number',
        min: 0, max: 6, step: 1, default_value: 1 },
      { id: 'removal', name: 'Old Fence Removal', label: 'Remove the existing fence', type: 'toggle', on_value: 220 },
    ],
    calculations: [
      calc('Materials & Labor', '[Fence Length] * [Fence Type]'),
      calc('Gates', '[Gates] * 180'),
      calc('Old Fence Removal', '[Old Fence Removal]'),
      calc('Total Fencing Cost', '[Materials & Labor] + [Gates] + [Old Fence Removal]'),
    ],
    result_calc: 'Total Fencing Cost',
    results: {
      heading: 'Your Fence Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Survey',
      footnote: 'Includes posts, panels, hardware, and disposal of old fencing. 10-year workmanship warranty on every install.',
    },
  },

  /* ── 8. Roof repair ── */
  {
    id: 'roof_repair', name: 'Roof Repair', description: 'Area + material roof repair estimate.',
    category: 'Construction', trades: ['roofing'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Home',
    header: { title: 'Get Your Roof Repair Quote in 60 Seconds', subtitle: 'Licensed & insured roofers · 4.9★ from 1,200+ jobs · Free written estimate', align: 'left' },
    fields: [
      { id: 'roof_size', name: 'Roof Size', label: 'Roof size (sqft)', type: 'number',
        min: 100, max: 5000, step: 50, default_value: 1500, unit: 'sqft' },
      { id: 'roof_type', name: 'Roof Type', label: 'Roof material', type: 'select',
        options: [opt('Shingle', 4), opt('Metal', 7), opt('Tile', 9)] },
      { id: 'pitch', name: 'Roof Pitch', label: 'Roof pitch', type: 'radio',
        options: [opt('Low Slope', 0), opt('Medium Slope', 1), opt('High Slope', 3)] },
      { id: 'features', name: 'Additional Features', label: 'Additional repairs', type: 'multi_select',
        options: [opt('Skylights', 500), opt('Gutter Replacement', 600)] },
    ],
    calculations: [
      calc('Materials cost', '[Roof Size] * [Roof Type]'),
      calc('Labor & Pitch', '[Roof Size] * [Roof Pitch]'),
      calc('Additional Features', '[Additional Features]'),
      calc('Estimated Repair Cost', '[Materials cost] + [Labor & Pitch] + [Additional Features]'),
    ],
    result_calc: 'Estimated Repair Cost',
    results: {
      heading: 'Your Roof Repair Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Inspection',
      footnote: 'Final price confirmed during free on-site inspection. 12-month workmanship warranty + manufacturer materials warranty.',
    },
  },

  /* ── 9. Solar panels ── */
  {
    id: 'solar_panels', name: 'Solar Panels', description: 'Solar install cost from system size.',
    category: 'Home Improvement', trades: ['hvac_services'],
    layout: 'multi-column', theme: 'light', defaultIcon: 'Sun',
    header: { title: 'Get Your Solar Install Quote — Plus Your Tax Credit', subtitle: 'NABCEP-certified installers · 25-year panel warranty · 30% federal tax credit eligible', align: 'left' },
    fields: [
      { id: 'panels', name: 'Panels', label: 'Number of solar panels', type: 'slider',
        min: 1, max: 200, step: 1, default_value: 20, unit: 'panels' },
      { id: 'capacity', name: 'Capacity', label: 'Capacity per panel (W)', type: 'slider',
        min: 200, max: 600, step: 10, default_value: 400, unit: 'W' },
      { id: 'orientation', name: 'Orientation', label: 'Primary roof orientation', type: 'radio',
        options: [opt('South', 0), opt('South-East', 120), opt('South-West', 120), opt('East / West', 280)] },
      { id: 'battery', name: 'Battery', label: 'Add battery storage', type: 'toggle', on_value: 4500 },
    ],
    calculations: [
      calc('Panel System', '[Panels] * [Capacity] * 0.9'),
      calc('Orientation Adjustment', '[Orientation]'),
      calc('Battery Storage', '[Battery]'),
      calc('Estimated System Cost', '[Panel System] + [Orientation Adjustment] + [Battery Storage]'),
    ],
    result_calc: 'Estimated System Cost',
    results: {
      heading: 'Your Solar Install Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Site Survey',
      footnote: 'Eligible for the 30% federal solar tax credit. Includes panels, inverter, permits, and interconnection. 25-year production guarantee.',
    },
  },

  /* ── 10. Interior painting ── */
  {
    id: 'interior_painting', name: 'Interior Painting', description: 'Room + finish interior painting quote.',
    category: 'Home Improvement', trades: ['interior_painting', 'exterior_painting'],
    layout: 'two-column', theme: 'mint', defaultIcon: 'PaintBucket',
    header: { title: 'Get an Instant Interior Painting Quote', subtitle: 'Licensed & insured · Sherwin-Williams certified · 2-year workmanship warranty', align: 'left' },
    fields: [
      { id: 'wall_area', name: 'Wall Area', label: 'Wall area to paint (sqm)', type: 'slider',
        min: 10, max: 500, step: 5, default_value: 120, unit: 'sqm' },
      { id: 'rooms', name: 'Rooms', label: 'How many rooms?', type: 'number',
        min: 1, max: 20, step: 1, default_value: 3 },
      { id: 'finish', name: 'Finish Quality', label: 'Paint finish quality', type: 'select',
        options: [opt('Standard', 9), opt('Premium', 14), opt('Designer', 20)] },
      { id: 'ceilings', name: 'Ceilings', label: 'Include ceilings', type: 'toggle', on_value: 240 },
    ],
    calculations: [
      calc('Walls — Paint & Labor', '[Wall Area] * [Finish Quality]'),
      calc('Per-room Prep', '[Rooms] * 35'),
      calc('Ceilings', '[Ceilings]'),
      calc('Total Painting Cost', '[Walls — Paint & Labor] + [Per-room Prep] + [Ceilings]'),
    ],
    result_calc: 'Total Painting Cost',
    results: {
      heading: 'Your Painting Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Slot',
      footnote: 'Includes premium paint, all prep, drop cloths, and clean-up. 2-year workmanship warranty on every job.',
    },
  },

  /* ── 11. House renovation ── */
  {
    id: 'house_renovation', name: 'House Renovation', description: 'Area + labour renovation estimate.',
    category: 'Construction', trades: ['general_renovation', 'kitchen_remodel', 'bathroom_remodel', 'flooring_installation'],
    layout: 'multi-column', theme: 'light', defaultIcon: 'Hammer',
    header: { title: 'Start Your Home Renovation — Free Itemised Estimate', subtitle: 'Licensed general contractor · Bonded crews · Transparent material + labor breakdown', align: 'left' },
    fields: [
      { id: 'area', name: 'Area to Renovate', label: 'Area to renovate (sqft)', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1200, unit: 'sqft' },
      { id: 'material', name: 'Material Cost', label: 'Material cost per sqft', type: 'number',
        min: 5, max: 200, step: 1, default_value: 33, unit: '$' },
      { id: 'labor_rate', name: 'Labor Rate', label: 'Labor rate per hour', type: 'number',
        min: 10, max: 150, step: 1, default_value: 55, unit: '$' },
      { id: 'labor_hours', name: 'Labor Hours', label: 'Estimated labor hours', type: 'slider',
        min: 10, max: 500, step: 5, default_value: 180, unit: 'hrs' },
    ],
    calculations: [
      calc('Material Cost', '[Area to Renovate] * [Material Cost]'),
      calc('Labor Cost', '[Labor Rate] * [Labor Hours]'),
      calc('Total Renovation Cost', '[Material Cost] + [Labor Cost]'),
    ],
    result_calc: 'Total Renovation Cost',
    results: {
      heading: 'Your Renovation Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Walk-through',
      footnote: 'Includes materials, labor, project management, and clean-up. Permits and structural work quoted separately during walk-through.',
    },
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

  /* ── Wave Y Batch 1 — Cleaning category expansion ──
     Four functional quote calculators covering the cleaning trades
     already present in client/src/data/trades.ts. Each uses generic
     industry inputs (square footage, level of soiling, add-ons) — no
     copy or visual identity borrowed from any external source. */

  /* ── 15. Deep home cleaning ── */
  {
    id: 'deep_home_cleaning', name: 'Deep Home Cleaning',
    description: 'Square-footage + room-count deep clean estimate with add-ons.',
    category: 'Cleaning', trades: ['deep_cleaning', 'house_cleaning'],
    layout: 'two-column', theme: 'light', defaultIcon: 'Sparkles',
    header: { title: 'Book Your Top-to-Bottom Deep Clean', subtitle: 'Bonded & insured · Eco-friendly products · 24-hour re-clean guarantee', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 400, max: 6000, step: 50, default_value: 1800, unit: 'sqft' },
      { id: 'bedrooms', name: 'Bedrooms', label: 'How many bedrooms?', type: 'number',
        min: 0, max: 10, step: 1, default_value: 3 },
      { id: 'bathrooms', name: 'Bathrooms', label: 'How many bathrooms?', type: 'number',
        min: 0, max: 8, step: 1, default_value: 2 },
      { id: 'condition', name: 'Condition', label: 'Current condition', type: 'select',
        options: [opt('Lightly soiled', 0), opt('Average', 60), opt('Heavily soiled', 180)] },
      { id: 'extras', name: 'Add-ons', label: 'Add-on services', type: 'multi_select',
        options: [opt('Inside fridge', 35), opt('Inside oven', 40), opt('Inside cabinets', 55), opt('Windows (interior)', 70)] },
    ],
    calculations: [
      calc('Home Size Base', '[Home Size] * 0.18'),
      calc('Bedrooms & Bathrooms', '[Bedrooms] * 25 + [Bathrooms] * 30'),
      calc('Condition Surcharge', '[Condition]'),
      calc('Add-ons', '[Add-ons]'),
      calc('Estimated Quote', '[Home Size Base] + [Bedrooms & Bathrooms] + [Condition Surcharge] + [Add-ons]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Deep Clean Quote',
      show_breakdown: true,
      cta_label: 'Book My Deep Clean',
      footnote: 'Final price confirmed after a 5-minute walk-through. 24-hour re-clean guarantee — find a spot we missed, we come back free.',
    },
  },

  /* ── 16. Move-in / move-out cleaning ── */
  {
    id: 'move_out_cleaning', name: 'Move-Out Cleaning',
    description: 'Lease-handover clean priced by home size + urgency.',
    category: 'Cleaning', trades: ['move_in_out_cleaning', 'deep_cleaning'],
    layout: 'single-column', theme: 'light', defaultIcon: 'PackageOpen',
    header: { title: 'Get Your Full Deposit Back — Instant Move-Out Quote', subtitle: 'Landlord-checklist clean · Bonded crews · Same-day availability', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 300, max: 5000, step: 50, default_value: 1400, unit: 'sqft' },
      { id: 'condition', name: 'Move-Out Condition', label: 'How is the home being left?', type: 'select',
        options: [opt('Fairly clean', 0), opt('Average', 80), opt('Rough', 220)] },
      { id: 'urgency', name: 'Urgency', label: 'When do you need it done?', type: 'radio',
        options: [opt('Within a week', 0), opt('Within 48 hours', 60), opt('Same-day rush', 150)] },
      { id: 'extras', name: 'Extras', label: 'Add-on services', type: 'multi_select',
        options: [opt('Inside appliances', 60), opt('Carpet shampoo', 120), opt('Wall touch-up wash', 50), opt('Garage', 80)] },
    ],
    calculations: [
      calc('Home Size Base', '[Home Size] * 0.22'),
      calc('Condition & Urgency', '[Move-Out Condition] + [Urgency]'),
      calc('Add-on Services', '[Extras]'),
      calc('Estimated Quote', '[Home Size Base] + [Condition & Urgency] + [Add-on Services]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Move-Out Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Move-Out Clean',
      footnote: 'Built around your landlord\'s standard checklist. If your inspection fails, we re-clean free within 48 hours.',
    },
  },

  /* ── 17. Office / commercial cleaning ── */
  {
    id: 'office_cleaning', name: 'Office Cleaning',
    description: 'Recurring commercial cleaning by square footage + visit cadence.',
    category: 'Cleaning', trades: ['office_cleaning', 'commercial_cleaning'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Building2',
    header: { title: 'Get a Per-Visit Office Cleaning Quote', subtitle: 'Bonded janitorial crews · OSHA-compliant · Flexible scheduling around your business hours', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Office Size', label: 'Office size (sqft)', type: 'slider',
        min: 500, max: 25000, step: 100, default_value: 4000, unit: 'sqft' },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'select',
        options: [opt('Daily (5x/wk)', 1.0), opt('Three times a week', 0.85), opt('Weekly', 0.65), opt('Bi-weekly', 0.55)] },
      { id: 'time', name: 'Time of Service', label: 'When should our team come?', type: 'radio',
        options: [opt('Business hours', 0), opt('After hours', 35), opt('Weekends only', 60)] },
      { id: 'extras', name: 'Extras', label: 'Included services', type: 'multi_select',
        options: [opt('Restroom sanitation', 25), opt('Trash removal', 15), opt('Floor buffing', 65), opt('Window interior', 45)] },
    ],
    calculations: [
      calc('Office Cleaning Base', '[Office Size] * 0.06 * [Frequency]'),
      calc('Time-of-service Surcharge', '[Time of Service]'),
      calc('Included Services', '[Extras]'),
      calc('Per-Visit Cost', '[Office Cleaning Base] + [Time-of-service Surcharge] + [Included Services]'),
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Quote',
      show_breakdown: true,
      cta_label: 'Schedule a Walk-through',
      footnote: 'Includes all supplies, bonded staff, and full liability coverage. 6- and 12-month contracts unlock 8–15% savings.',
    },
  },

  /* ── 18. Window cleaning ── */
  {
    id: 'window_cleaning_quote', name: 'Window Cleaning',
    description: 'Per-window pricing with story-height and access modifiers.',
    category: 'Cleaning', trades: ['window_cleaning', 'pressure_washing'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'RectangleHorizontal',
    header: { title: 'Get a Streak-Free Window Cleaning Quote', subtitle: 'Fully insured · Pure-water poles · 100% streak-free guarantee', align: 'left' },
    fields: [
      { id: 'windows', name: 'Windows', label: 'Number of windows', type: 'slider',
        min: 1, max: 60, step: 1, default_value: 18, unit: 'windows' },
      { id: 'stories', name: 'Stories', label: 'Building height', type: 'radio',
        options: [opt('Single-story', 0), opt('Two-story', 4), opt('Three+ story', 9)] },
      { id: 'sides', name: 'Sides', label: 'Which sides should we clean?', type: 'select',
        options: [opt('Exterior only', 1.0), opt('Interior + exterior', 1.7)] },
      { id: 'screens', name: 'Screens', label: 'Include window screens', type: 'toggle', on_value: 45 },
      { id: 'tracks', name: 'Tracks', label: 'Detail-clean the tracks & sills', type: 'toggle', on_value: 35 },
    ],
    calculations: [
      calc('Window Cleaning', '[Windows] * (8 + [Stories]) * [Sides]'),
      calc('Screens & Tracks', '[Screens] + [Tracks]'),
      calc('Estimated Quote', '[Window Cleaning] + [Screens & Tracks]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Window Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Window Clean',
      footnote: 'Streak-free guarantee — find a smudge in the first 7 days, we come back free. Fully insured for residential & commercial.',
    },
  },

  /* ── Wave Y Batch 2 — Renovation category ── */

  /* ── 19. Kitchen renovation ── */
  {
    id: 'kitchen_renovation', name: 'Kitchen Renovation',
    description: 'Full-kitchen remodel estimate by size, cabinet grade and finishes.',
    category: 'Renovation', trades: ['kitchen_remodel', 'general_renovation', 'general_contractor'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'ChefHat',
    header: { title: 'Design Your Dream Kitchen — Free Estimate', subtitle: 'NKBA-certified designers · Licensed contractors · 3D rendering with every consultation', align: 'left' },
    fields: [
      { id: 'kitchen_size', name: 'Kitchen Size', label: 'Kitchen size (sqft)', type: 'slider',
        min: 80, max: 600, step: 10, default_value: 200, unit: 'sqft' },
      { id: 'cabinets', name: 'Cabinets', label: 'Cabinet grade', type: 'select',
        options: [opt('Stock', 90), opt('Semi-custom', 160), opt('Custom built-in', 280)] },
      { id: 'counters', name: 'Countertops', label: 'Countertop material', type: 'select',
        options: [opt('Laminate', 30), opt('Quartz', 75), opt('Granite', 85), opt('Marble', 130)] },
      { id: 'appliances', name: 'Appliances', label: 'Appliance package', type: 'radio',
        options: [opt('Keep existing', 0), opt('Mid-range refresh', 4500), opt('Pro-grade upgrade', 12000)] },
      { id: 'plumbing_electric', name: 'Plumbing/Electric', label: 'Plumbing & electrical add-ons', type: 'multi_select',
        options: [opt('Move sink', 850), opt('Add island circuit', 700), opt('Under-cabinet lighting', 450), opt('New backsplash', 600)] },
    ],
    calculations: [
      calc('Cabinets & Countertops', '[Kitchen Size] * ([Cabinets] + [Countertops])'),
      calc('Appliance Package', '[Appliances]'),
      calc('Plumbing & Electrical', '[Plumbing/Electric]'),
      calc('Estimated Project Cost', '[Cabinets & Countertops] + [Appliance Package] + [Plumbing & Electrical]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Kitchen Estimate',
      show_breakdown: true,
      cta_label: 'Book My Design Consultation',
      footnote: 'Includes 3D design, cabinets, counters, fixtures, and labor. Permits & structural work confirmed during free on-site consultation.',
    },
  },

  /* ── 20. Bathroom renovation ── */
  {
    id: 'bathroom_renovation', name: 'Bathroom Renovation',
    description: 'Bathroom remodel pricing by fixture tier and tile coverage.',
    category: 'Renovation', trades: ['bathroom_remodel', 'general_renovation'],
    layout: 'two-column', theme: 'light', defaultIcon: 'Bath',
    header: { title: 'Get Your Bathroom Renovation Quote', subtitle: 'Licensed plumbers & tile pros · 5-year leak guarantee · Most baths done in 7–10 days', align: 'left' },
    fields: [
      { id: 'size', name: 'Bathroom Size', label: 'Bathroom size', type: 'select',
        options: [opt('Half bath', 1.0), opt('Full bath (60-80 sqft)', 2.2), opt('Primary suite (100+ sqft)', 3.5)] },
      { id: 'tier', name: 'Finish Tier', label: 'Finish tier', type: 'radio',
        options: [opt('Standard', 3500), opt('Premium', 7200), opt('Luxury', 14500)] },
      { id: 'shower', name: 'Shower / Tub', label: 'Shower & tub change', type: 'select',
        options: [opt('Keep existing', 0), opt('New tub-shower combo', 1800), opt('Walk-in shower', 3400), opt('Freestanding tub', 4200)] },
      { id: 'extras', name: 'Extras', label: 'Premium add-ons', type: 'multi_select',
        options: [opt('Heated floor', 1400), opt('Double vanity', 1900), opt('Smart toilet', 1200), opt('Recessed lighting', 700)] },
    ],
    calculations: [
      calc('Materials & Labor', '[Finish Tier] * [Bathroom Size]'),
      calc('Shower / Tub', '[Shower / Tub]'),
      calc('Premium Add-ons', '[Extras]'),
      calc('Estimated Quote', '[Materials & Labor] + [Shower / Tub] + [Premium Add-ons]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Bathroom Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Design Visit',
      footnote: 'Includes demolition, tile, fixtures, plumbing, and clean-up. 5-year leak warranty and 2-year workmanship guarantee.',
    },
  },

  /* ── 21. Basement finishing ── */
  {
    id: 'basement_finishing', name: 'Basement Finishing',
    description: 'Per-sqft basement finish estimate with ceiling + scope modifiers.',
    category: 'Renovation', trades: ['basement_finishing', 'general_renovation'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Wrench',
    header: { title: 'Turn Your Basement Into Living Space — Free Quote', subtitle: 'Licensed general contractor · Permit handling included · Adds avg. 70% ROI at resale', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Basement Size', label: 'Basement size (sqft)', type: 'slider',
        min: 200, max: 2500, step: 50, default_value: 900, unit: 'sqft' },
      { id: 'ceiling', name: 'Ceiling', label: 'Ceiling treatment', type: 'select',
        options: [opt('Exposed (painted)', 8), opt('Drop tile', 14), opt('Full drywall', 22)] },
      { id: 'rooms', name: 'Rooms', label: 'Rooms to add', type: 'multi_select',
        options: [opt('Bedroom', 4200), opt('Bathroom', 7800), opt('Wet bar / kitchenette', 5600), opt('Home theater', 3900)] },
      { id: 'egress', name: 'Egress Window', label: 'Add code-required egress window', type: 'toggle', on_value: 3200 },
    ],
    calculations: [
      calc('Framing & Ceiling', '[Basement Size] * [Ceiling]'),
      calc('Rooms', '[Rooms]'),
      calc('Egress Window', '[Egress Window]'),
      calc('Estimated Project Cost', '[Framing & Ceiling] + [Rooms] + [Egress Window]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Basement Finishing Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Walk-through',
      footnote: 'Includes framing, electrical, drywall, flooring, and finish work. Permits and inspections handled on your behalf.',
    },
  },

  /* ── 22. Interior painting (Pro — granular prep + coats + height) ──
     Wave Y added this as a more detailed variant of the original
     `interior_painting` template (line 349). Renamed from `interior_painting`
     → `interior_painting_pro` to resolve the duplicate-ID conflict caught by
     the deep per-template Playwright spec (PR #372). */
  {
    id: 'interior_painting_pro', name: 'Interior Painting (Pro)',
    description: 'Per-sqft interior paint quote with prep and ceiling-height modifiers.',
    category: 'Renovation', trades: ['painting', 'interior_painting'],
    layout: 'two-column', theme: 'light', defaultIcon: 'Paintbrush2',
    header: { title: 'Get a Professional Painting Quote', subtitle: 'Sherwin-Williams certified · Lead-safe certified · 3-year workmanship warranty', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Wall Area', label: 'Wall area to paint (sqft)', type: 'slider',
        min: 200, max: 5000, step: 50, default_value: 1600, unit: 'sqft' },
      { id: 'coats', name: 'Coats', label: 'Number of paint coats', type: 'radio',
        options: [opt('One coat', 1.0), opt('Two coats (recommended)', 1.6)] },
      { id: 'ceiling_height', name: 'Ceiling Height', label: 'Ceiling height', type: 'select',
        options: [opt('Standard (8 ft)', 1.0), opt('High (9-10 ft)', 1.15), opt('Vaulted (12+ ft)', 1.35)] },
      { id: 'prep', name: 'Prep', label: 'Prep work required', type: 'multi_select',
        options: [opt('Patch holes', 120), opt('Sand & prime', 180), opt('Remove wallpaper', 400)] },
      { id: 'trim', name: 'Trim', label: 'Include trim & doors', type: 'toggle', on_value: 350 },
    ],
    calculations: [
      calc('Paint & Labor', '[Wall Area] * 1.3 * [Coats] * [Ceiling Height]'),
      calc('Prep Work', '[Prep]'),
      calc('Trim & Doors', '[Trim]'),
      calc('Estimated Quote', '[Paint & Labor] + [Prep Work] + [Trim & Doors]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Painting Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Slot',
      footnote: 'Includes premium paint, all prep, drop cloths, and one accent wall. 3-year workmanship warranty. Final scope confirmed on-site.',
    },
  },

  /* ── Wave Y Batch 3 — Mechanical / Systems category ── */

  /* ── 23. HVAC installation ── */
  {
    id: 'hvac_installation', name: 'HVAC Installation',
    description: 'New HVAC system estimate by home size and equipment tier.',
    category: 'Mechanical', trades: ['hvac_services', 'hvac_installation'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Thermometer',
    header: { title: 'Get Your HVAC Installation Quote', subtitle: 'NATE-certified technicians · 10-year parts & labor warranty · Same-week install available', align: 'left' },
    fields: [
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 6000, step: 100, default_value: 2000, unit: 'sqft' },
      { id: 'system_type', name: 'System Type', label: 'Which system do you need?', type: 'select',
        options: [opt('Central AC only', 4500), opt('Furnace only', 4200), opt('Central AC + furnace', 7800), opt('Heat pump (all-in-one)', 9500), opt('Ductless mini-split', 5800)] },
      { id: 'efficiency', name: 'Efficiency Tier', label: 'Efficiency tier', type: 'radio',
        options: [opt('Standard (14 SEER)', 1.0), opt('High-efficiency (18 SEER)', 1.25), opt('Top tier (20+ SEER)', 1.5)] },
      { id: 'extras', name: 'Add-ons', label: 'Comfort add-ons', type: 'multi_select',
        options: [opt('Smart thermostat', 380), opt('Whole-home humidifier', 750), opt('UV air purifier', 620), opt('Duct cleaning', 450)] },
    ],
    calculations: [
      calc('Equipment', '[System Type] * [Efficiency Tier]'),
      calc('Installation Labor', '[Home Size] * 0.8'),
      calc('Comfort Add-ons', '[Add-ons]'),
      calc('Estimated Project Cost', '[Equipment] + [Installation Labor] + [Comfort Add-ons]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your HVAC Install Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Sizing Visit',
      footnote: 'Includes equipment, standard installation, refrigerant, and start-up. 10-year parts warranty + 2-year labor warranty.',
    },
  },

  /* ── 24. Plumbing service ── */
  {
    id: 'plumbing_service', name: 'Plumbing Service',
    description: 'Per-job plumbing estimate by service type + urgency.',
    category: 'Mechanical', trades: ['plumbing_services', 'emergency_plumbing'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Wrench',
    header: { title: 'Get an Upfront Plumbing Quote in 60 Seconds', subtitle: 'Licensed master plumbers · No hidden fees · Same-day & 24/7 emergency response', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What plumbing work do you need?', type: 'select',
        options: [opt('Leak repair', 220), opt('Drain clearing', 180), opt('Faucet replacement', 280), opt('Toilet replacement', 420), opt('Water heater install', 1800)] },
      { id: 'units', name: 'Units', label: 'How many fixtures?', type: 'number',
        min: 1, max: 10, step: 1, default_value: 1 },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'radio',
        options: [opt('Within a week', 0), opt('Within 24 hours', 75), opt('Emergency / same-day', 220)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Hauling away old fixture', 60), opt('Pressure test', 90), opt('Camera inspection', 140)] },
    ],
    calculations: [
      calc('Labor & Materials', '[Service] * [Units]'),
      calc('Urgency Surcharge', '[Urgency]'),
      calc('Add-ons', '[Extras]'),
      calc('Estimated Cost', '[Labor & Materials] + [Urgency Surcharge] + [Add-ons]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Plumbing Quote',
      show_breakdown: true,
      cta_label: 'Dispatch a Plumber',
      footnote: 'Flat-rate pricing locked before work begins. Licensed, bonded, insured. 1-year warranty on parts and labor.',
    },
  },

  /* ── 25. Electrical work ── */
  {
    id: 'electrical_work', name: 'Electrical Work',
    description: 'Per-job electrical estimate covering common residential scopes.',
    category: 'Mechanical', trades: ['electrical_services', 'emergency_electrical'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Zap',
    header: { title: 'Get a Licensed Electrician Quote in 60 Seconds', subtitle: 'Licensed master electricians · Permits handled · 100% code-compliant guaranteed', align: 'left' },
    fields: [
      { id: 'job_type', name: 'Job Type', label: 'What electrical work do you need?', type: 'select',
        options: [opt('Add outlet / switch', 175), opt('New light fixture', 220), opt('Ceiling fan install', 290), opt('Panel upgrade (200A)', 2400), opt('Whole-home rewire', 8500)] },
      { id: 'quantity', name: 'Quantity', label: 'How many?', type: 'number',
        min: 1, max: 20, step: 1, default_value: 2 },
      { id: 'access', name: 'Access', label: 'Wiring access difficulty', type: 'radio',
        options: [opt('Easy (open wall / accessible)', 0), opt('Moderate', 45), opt('Difficult (finished wall, tight crawl)', 120)] },
      { id: 'permit', name: 'Permit', label: 'Pull permits & arrange inspection', type: 'toggle', on_value: 220 },
    ],
    calculations: [
      calc('Labor & Materials', '[Job Type] * [Quantity]'),
      calc('Access Difficulty', '[Access] * [Quantity]'),
      calc('Permit & Inspection', '[Permit]'),
      calc('Estimated Cost', '[Labor & Materials] + [Access Difficulty] + [Permit & Inspection]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Electrical Quote',
      show_breakdown: true,
      cta_label: 'Schedule Service',
      footnote: 'All work performed by licensed electricians and inspected for code compliance. 1-year workmanship warranty on every job.',
    },
  },

  /* ── 26. EV charger installation ── */
  {
    id: 'ev_charger_install', name: 'EV Charger Installation',
    description: 'Level-2 EV charger install with electrical-scope modifiers.',
    category: 'Mechanical', trades: ['ev_charger', 'electrical_services'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'BatteryCharging',
    header: { title: 'Charge at Home — EV Install Quote in 60 Seconds', subtitle: 'Tesla & ChargePoint certified · Licensed electricians · Most installs done same-day', align: 'left' },
    fields: [
      { id: 'charger_level', name: 'Charger Level', label: 'Charger level', type: 'radio',
        options: [opt('Level 1 (120V)', 350), opt('Level 2 (240V, 32A)', 950), opt('Level 2 (240V, 50A)', 1250)] },
      { id: 'wire_distance', name: 'Wire Distance', label: 'Distance from electrical panel (ft)', type: 'slider',
        min: 5, max: 120, step: 5, default_value: 30, unit: 'ft' },
      { id: 'panel_upgrade', name: 'Panel Upgrade', label: 'Panel capacity available?', type: 'radio',
        options: [opt('No (panel has capacity)', 0), opt('Subpanel add', 1100), opt('Full panel upgrade', 2400)] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        options: [opt('Permit + inspection', 220), opt('Trenching (outdoor)', 380), opt('Smart load-management module', 280)] },
    ],
    calculations: [
      calc('Charger & Install', '[Charger Level] + [Wire Distance] * 8'),
      calc('Panel Upgrade', '[Panel Upgrade]'),
      calc('Permits & Add-ons', '[Extras]'),
      calc('Estimated Project Cost', '[Charger & Install] + [Panel Upgrade] + [Permits & Add-ons]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your EV Charger Install Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Install',
      footnote: 'Many utilities offer EV-charger rebates of $200–$1,000. We file the paperwork for you — credit applied after install.',
    },
  },

  /* ── Wave Y Batch 4 — Outdoor / Driveway category ── */

  /* ── 27. Lawn care subscription ── */
  {
    id: 'lawn_care_subscription', name: 'Lawn Care Subscription',
    description: 'Recurring lawn maintenance with visit-cadence pricing.',
    category: 'Outdoor', trades: ['lawn_mowing', 'landscaping', 'garden_maintenance'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'Trees',
    header: { title: 'Get an Instant Lawn Care Quote', subtitle: 'Licensed & insured crews · Eco-friendly options · Cancel anytime with 30 days notice', align: 'left' },
    fields: [
      { id: 'lawn_size', name: 'Lawn Size', label: 'Lawn size (sqft)', type: 'slider',
        min: 500, max: 30000, step: 100, default_value: 7000, unit: 'sqft' },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'select',
        options: [opt('Weekly', 1.0), opt('Bi-weekly', 0.65), opt('Monthly', 0.45)] },
      { id: 'services', name: 'Services', label: 'Included services per visit', type: 'multi_select',
        options: [opt('Mow', 25), opt('Edge + trim', 18), opt('Blow-off cleanup', 12), opt('Fertilizer', 35), opt('Weed control', 30)] },
      { id: 'season', name: 'Season Length', label: 'Service season length', type: 'radio',
        options: [opt('Full season (8 months)', 1.0), opt('Spring + summer (5 months)', 0.7), opt('Maintenance-only (3 months)', 0.45)] },
    ],
    calculations: [
      calc('Lawn Size Base', '[Lawn Size] * 0.008 * [Frequency]'),
      calc('Included Services', '[Services]'),
      calc('Per-Visit Cost', '[Lawn Size Base] + [Included Services]'),
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Lawn Quote',
      show_breakdown: true,
      cta_label: 'Start My Lawn Service',
      footnote: 'Includes labor, equipment, and standard fertilizer when selected. Seasonal pre-pay saves 8%. Cancel anytime with 30 days notice.',
    },
  },

  /* ── 28. Concrete driveway replacement ── */
  {
    id: 'concrete_driveway_replacement', name: 'Concrete Driveway',
    description: 'New concrete driveway with finish + removal modifiers.',
    category: 'Driveway', trades: ['concrete_driveway', 'concrete_patio', 'concrete_slab'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Construction',
    header: { title: 'Get Your New Concrete Driveway Quote', subtitle: 'ACI-certified concrete pros · 25-year structural warranty · Free on-site measurement', align: 'left' },
    fields: [
      { id: 'area', name: 'Driveway Area', label: 'Driveway size (sqft)', type: 'slider',
        min: 100, max: 2000, step: 25, default_value: 600, unit: 'sqft' },
      { id: 'finish', name: 'Finish', label: 'Concrete finish type', type: 'select',
        options: [opt('Standard broom', 7), opt('Exposed aggregate', 11), opt('Stamped pattern', 14), opt('Colored + stamped', 18)] },
      { id: 'thickness', name: 'Thickness', label: 'Concrete thickness', type: 'radio',
        options: [opt('4" (light residential)', 1.0), opt('5" (recommended)', 1.18), opt('6" (heavy vehicle)', 1.35)] },
      { id: 'extras', name: 'Extras', label: 'Prep & reinforcement', type: 'multi_select',
        options: [opt('Remove old surface', 1100), opt('Reinforce with rebar', 480), opt('Add drainage channel', 620)] },
    ],
    calculations: [
      calc('Pour & Finish', '[Driveway Area] * [Finish] * [Thickness]'),
      calc('Prep & Reinforcement', '[Extras]'),
      calc('Estimated Project Cost', '[Pour & Finish] + [Prep & Reinforcement]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Concrete Driveway Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Measurement',
      footnote: 'Includes form work, pour, finish, and 28-day cure. 25-year structural warranty on every install.',
    },
  },

  /* ── 29. Tree service ── */
  {
    id: 'tree_service', name: 'Tree Service',
    description: 'Trimming or removal estimate per tree with height + access modifiers.',
    category: 'Outdoor', trades: ['tree_service', 'tree_trimming'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'TreeDeciduous',
    header: { title: 'Get a Certified Arborist Quote in 60 Seconds', subtitle: 'ISA-certified arborists · $2M liability insurance · 24/7 emergency storm response', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What service do you need?', type: 'radio',
        options: [opt('Trim / prune', 200), opt('Removal (no stump)', 600), opt('Removal + stump grind', 850)] },
      { id: 'trees', name: 'Trees', label: 'How many trees?', type: 'number',
        min: 1, max: 20, step: 1, default_value: 1 },
      { id: 'height', name: 'Height', label: 'Tallest tree height', type: 'select',
        options: [opt('Under 25 ft', 1.0), opt('25-50 ft', 1.4), opt('50-75 ft', 1.9), opt('75+ ft', 2.6)] },
      { id: 'access', name: 'Access', label: 'Site access difficulty', type: 'radio',
        options: [opt('Easy (truck access)', 0), opt('Moderate (gate / yard work)', 120), opt('Difficult (over house / power lines)', 350)] },
      { id: 'haul', name: 'Haul Away', label: 'Haul away debris', type: 'toggle', on_value: 180 },
    ],
    calculations: [
      calc('Tree Work', '[Service] * [Trees] * [Height]'),
      calc('Access Surcharge', '[Access]'),
      calc('Debris Haul-away', '[Haul Away]'),
      calc('Estimated Quote', '[Tree Work] + [Access Surcharge] + [Debris Haul-away]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Tree Service Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Free Assessment',
      footnote: 'ISA-certified arborists, fully insured to $2M. Free on-site assessment for jobs over $1,500. 24/7 emergency response.',
    },
  },

  /* ── 30. Pressure washing ── */
  {
    id: 'pressure_washing_quote', name: 'Pressure Washing',
    description: 'Per-sqft exterior surface clean with multi-surface support.',
    category: 'Cleaning', trades: ['pressure_washing', 'window_cleaning'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'Droplets',
    header: { title: 'Restore Your Curb Appeal — Free Wash Quote', subtitle: 'Soft-wash certified · Surface-safe pressure · Driveway, siding, deck, patio in one visit', align: 'left' },
    fields: [
      { id: 'area', name: 'Area', label: 'Total area to wash (sqft)', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1200, unit: 'sqft' },
      { id: 'surface', name: 'Surface Type', label: 'Surface type', type: 'select',
        options: [opt('Concrete / driveway', 0.30), opt('Wood deck', 0.45), opt('Vinyl siding', 0.35), opt('Brick / stone', 0.40), opt('Roof (soft wash)', 0.55)] },
      { id: 'extras', name: 'Extras', label: 'Add-on treatments', type: 'multi_select',
        options: [opt('Mildew / mold treatment', 80), opt('Sealing after wash', 220), opt('Stairs / railings', 95)] },
      { id: 'access', name: 'Access', label: 'Site access', type: 'radio',
        options: [opt('Standard', 0), opt('Second story', 75), opt('Hard-to-reach', 150)] },
    ],
    calculations: [
      calc('Surface Cleaning', '[Area] * [Surface Type]'),
      calc('Access Surcharge', '[Access]'),
      calc('Add-on Treatments', '[Extras]'),
      calc('Estimated Quote', '[Surface Cleaning] + [Access Surcharge] + [Add-on Treatments]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Pressure Washing Quote',
      show_breakdown: true,
      cta_label: 'Book My Wash',
      footnote: 'Surface-safe soft-wash and pressure-wash methods. Fully insured. Before-and-after photos with every job.',
    },
  },

  /* ── Wave Y Batch 5 — Auto / Emergency category ── */

  /* ── 31. Mobile car detailing ── */
  {
    id: 'mobile_car_detail', name: 'Mobile Car Detailing',
    description: 'Per-vehicle detail with package tiers and add-on services.',
    category: 'Automotive', trades: ['mobile_car_detailing', 'auto_detailing'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Car',
    header: { title: 'Book a Mobile Detail — We Come to You', subtitle: 'IDA-certified detailers · Eco-safe products · Fully self-contained — no water hookup needed', align: 'left' },
    fields: [
      { id: 'vehicle', name: 'Vehicle Size', label: 'Vehicle size', type: 'radio',
        options: [opt('Sedan / coupe', 1.0), opt('SUV / mid-size', 1.25), opt('Truck / full-size SUV', 1.5), opt('Van / 3-row SUV', 1.75)] },
      { id: 'package', name: 'Package', label: 'Detail package', type: 'select',
        options: [opt('Exterior only', 65), opt('Interior only', 85), opt('Full detail (in + out)', 145), opt('Premium (clay bar + wax)', 220), opt('Showroom (ceramic top-up)', 350)] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        options: [opt('Engine bay clean', 45), opt('Headlight restoration', 60), opt('Pet hair removal', 35), opt('Odor elimination', 50), opt('Leather conditioning', 40)] },
      { id: 'condition', name: 'Condition', label: 'Current vehicle condition', type: 'radio',
        options: [opt('Light (regular cleaning)', 0), opt('Moderate (3-6 months neglect)', 30), opt('Heavy (over a year)', 75)] },
    ],
    calculations: [
      calc('Detail Package', '[Package] * [Vehicle Size]'),
      calc('Optional Add-ons', '[Extras]'),
      calc('Condition Surcharge', '[Condition]'),
      calc('Estimated Quote', '[Detail Package] + [Optional Add-ons] + [Condition Surcharge]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Mobile Detail Quote',
      show_breakdown: true,
      cta_label: 'Book My Detail',
      footnote: 'We bring water, power, and pro-grade products to your driveway. 24-hour satisfaction guarantee — we re-do anything you\'re not happy with.',
    },
  },

  /* ── 32. Locksmith service ── */
  {
    id: 'locksmith_service', name: 'Locksmith Service',
    description: 'Per-service locksmith pricing with urgency modifier.',
    category: 'Emergency', trades: ['locksmith'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'KeyRound',
    header: { title: 'Get a Locksmith on the Way — Upfront Quote', subtitle: 'Licensed · Bonded · Insured · 24/7 mobile response across the metro area', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What do you need?', type: 'select',
        options: [opt('Home lockout', 95), opt('Car lockout', 110), opt('Rekey lock', 65), opt('New deadbolt install', 180), opt('Smart lock install', 280), opt('Key duplication', 25)] },
      { id: 'quantity', name: 'Quantity', label: 'How many locks?', type: 'number',
        min: 1, max: 10, step: 1, default_value: 1 },
      { id: 'urgency', name: 'Urgency', label: 'How urgent?', type: 'radio',
        options: [opt('Within a few days', 0), opt('Within 24 hours', 35), opt('Now (within 1 hour)', 95)] },
      { id: 'time', name: 'Time of Service', label: 'Time of service', type: 'radio',
        options: [opt('Business hours', 0), opt('After hours / weekend', 45), opt('Overnight / holiday', 95)] },
    ],
    calculations: [
      calc('Service & Materials', '[Service] * [Quantity]'),
      calc('Urgency & Time', '[Urgency] + [Time of Service]'),
      calc('Estimated Cost', '[Service & Materials] + [Urgency & Time]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Locksmith Quote',
      show_breakdown: true,
      cta_label: 'Request a Locksmith',
      footnote: 'Price locked before the truck rolls — no surprises on arrival. Licensed, bonded, $1M insured.',
    },
  },

  /* ── 33. Water damage restoration ── */
  {
    id: 'water_damage_restoration', name: 'Water Damage Restoration',
    description: 'Emergency water-damage scoping by affected area and severity.',
    category: 'Emergency', trades: ['water_damage_restoration', 'water_damage'],
    layout: 'two-column', theme: 'magenta', defaultIcon: 'Droplet',
    header: { title: 'Get Emergency Water Damage Help — Free Estimate', subtitle: 'IICRC-certified technicians · 24/7 emergency dispatch · Direct insurance billing', align: 'left' },
    fields: [
      { id: 'area', name: 'Affected Area', label: 'Affected area (sqft)', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 350, unit: 'sqft' },
      { id: 'severity', name: 'Severity', label: 'Water category', type: 'radio',
        options: [opt('Class 1 (clean, minor)', 1.0), opt('Class 2 (gray water)', 1.4), opt('Class 3 (extensive saturation)', 2.0), opt('Class 4 (sewage / hazardous)', 2.8)] },
      { id: 'response', name: 'Response Time', label: 'How fast do you need us?', type: 'select',
        options: [opt('Next business day', 0), opt('Within 24 hours', 220), opt('Within 4 hours (emergency)', 580)] },
      { id: 'services', name: 'Services', label: 'Services needed', type: 'multi_select',
        options: [opt('Water extraction', 350), opt('Structural drying', 480), opt('Mold prevention', 280), opt('Contents pack-out', 620), opt('Reconstruction estimate', 0)] },
    ],
    calculations: [
      calc('Extraction & Drying', '[Affected Area] * 2.2 * [Severity]'),
      calc('Response Surcharge', '[Response Time]'),
      calc('Restoration Services', '[Services]'),
      calc('Estimated Cost', '[Extraction & Drying] + [Response Surcharge] + [Restoration Services]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Restoration Estimate',
      show_breakdown: true,
      cta_label: 'Get Emergency Help',
      footnote: 'IICRC-certified technicians on call 24/7. We bill your insurance carrier directly when possible — most homeowners pay only their deductible.',
    },
  },

  /* ── 34. Emergency HVAC repair ── */
  {
    id: 'emergency_hvac', name: 'Emergency HVAC',
    description: 'After-hours HVAC repair with diagnostic + parts modifiers.',
    category: 'Emergency', trades: ['emergency_hvac', 'hvac_services'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Flame',
    header: { title: 'Dispatch an HVAC Tech Now — Same-Day Service', subtitle: 'NATE-certified technicians · 24/7 emergency response · Diagnostic credit applied to repair', align: 'left' },
    fields: [
      { id: 'system', name: 'System', label: 'Which system is failing?', type: 'radio',
        options: [opt('AC / cooling', 0), opt('Furnace / heating', 0), opt('Heat pump', 30), opt('Mini-split', 45)] },
      { id: 'time', name: 'Time of Service', label: 'When do you need us?', type: 'select',
        options: [opt('Business hours', 95), opt('Evening (5-10 PM)', 175), opt('Overnight (10 PM-7 AM)', 295), opt('Weekend / holiday', 220)] },
      { id: 'issue', name: 'Symptom', label: 'What\'s the symptom?', type: 'select',
        options: [opt('Not turning on', 0), opt('Running but not heating/cooling', 75), opt('Loud noise / vibration', 60), opt('Leaking water', 110), opt('Strange smell / burning', 140)] },
      { id: 'extras', name: 'Add-ons', label: 'Likely repairs', type: 'multi_select',
        options: [opt('Refrigerant top-up', 220), opt('Capacitor replacement', 175), opt('Thermostat replacement', 145), opt('System tune-up after fix', 95)] },
    ],
    calculations: [
      calc('Diagnostic & Trip', '[Time of Service]'),
      calc('System & Symptom', '[System] + [Symptom]'),
      calc('Likely Repairs', '[Add-ons]'),
      calc('Estimated Cost', '[Diagnostic & Trip] + [System & Symptom] + [Likely Repairs]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Emergency HVAC Estimate',
      show_breakdown: true,
      cta_label: 'Dispatch a Technician',
      footnote: 'Diagnostic fee credited toward the repair when work is performed the same visit. 1-year warranty on parts and labor.',
    },
  },

  /* ── Wave Y Batch 6 — Professional services category ── */

  /* ── 35. Web design quote ── */
  {
    id: 'web_design_quote', name: 'Web Design',
    description: 'Website design + build pricing by page count and feature scope.',
    category: 'Professional', trades: ['web_design'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Globe',
    header: { title: 'Get a Custom Website Quote in 60 Seconds', subtitle: '15+ years in business · 200+ launched sites · Free strategy call before you commit', align: 'left' },
    fields: [
      { id: 'pages', name: 'Pages', label: 'Number of pages', type: 'slider',
        min: 1, max: 50, step: 1, default_value: 8, unit: 'pages' },
      { id: 'tier', name: 'Design Tier', label: 'Design tier', type: 'radio',
        options: [opt('Template-based', 1.0), opt('Custom design', 1.8), opt('Premium custom + branding', 2.8)] },
      { id: 'features', name: 'Features', label: 'Features to include', type: 'multi_select',
        options: [opt('Contact form + CRM hookup', 280), opt('Blog / CMS', 450), opt('E-commerce (up to 50 products)', 1400), opt('Booking / scheduling', 380), opt('Multilingual (2 languages)', 850), opt('Member portal', 1200)] },
      { id: 'turnaround', name: 'Turnaround', label: 'Project turnaround', type: 'select',
        options: [opt('Standard (6-8 weeks)', 1.0), opt('Fast (3-4 weeks)', 1.25), opt('Rush (2 weeks)', 1.55)] },
    ],
    calculations: [
      calc('Design & Build', '[Pages] * 280 * [Design Tier] * [Turnaround]'),
      calc('Custom Features', '[Features]'),
      calc('Estimated Project Cost', '[Design & Build] + [Custom Features]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Web Design Estimate',
      show_breakdown: true,
      cta_label: 'Schedule a Strategy Call',
      footnote: 'Includes design, build, mobile responsive, 1 year of hosting, and 3 rounds of revisions. Fixed price — no surprises.',
    },
  },

  /* ── 36. Photography package ── */
  {
    id: 'photography_package', name: 'Photography Package',
    description: 'Event or session photography quote by type, hours and deliverables.',
    category: 'Professional', trades: ['photography'],
    layout: 'two-column', theme: 'magenta', defaultIcon: 'Camera',
    header: { title: 'Get a Photography Package Quote', subtitle: 'Published in 30+ magazines · 4.9★ from 400+ clients · 100% money-back if you hate the gallery', align: 'left' },
    fields: [
      { id: 'event_type', name: 'Event Type', label: 'What\'s the shoot for?', type: 'select',
        options: [opt('Portrait session', 250), opt('Family / lifestyle', 380), opt('Corporate event', 850), opt('Wedding', 2400), opt('Real estate listing', 320), opt('Product / e-commerce', 480)] },
      { id: 'hours', name: 'Hours', label: 'Hours of coverage', type: 'number',
        min: 1, max: 12, step: 1, default_value: 4, unit: 'hr' },
      { id: 'deliverables', name: 'Deliverables', label: 'Deliverables', type: 'multi_select',
        options: [opt('Edited digital gallery', 0), opt('Printed photo book', 240), opt('Highlight reel (2-min video)', 380), opt('Same-day sneak peek', 150), opt('RAW file delivery', 200)] },
      { id: 'second_shooter', name: 'Second Shooter', label: 'Add a second photographer', type: 'toggle', on_value: 550 },
    ],
    calculations: [
      calc('Session Base', '[Event Type] + [Hours] * 90'),
      calc('Deliverables', '[Deliverables]'),
      calc('Second Photographer', '[Second Shooter]'),
      calc('Estimated Quote', '[Session Base] + [Deliverables] + [Second Photographer]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Photography Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Date',
      footnote: 'Includes shoot, hand-edited gallery, and online delivery. 25% deposit holds your date — fully refundable up to 60 days out.',
    },
  },

  /* ── 37. Moving service ── */
  {
    id: 'moving_service', name: 'Moving Service',
    description: 'Local or long-distance moving quote by home size, distance and crew.',
    category: 'Professional', trades: ['moving_services'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'Truck',
    header: { title: 'Get a Door-to-Door Moving Quote in 60 Seconds', subtitle: 'Licensed & insured movers · Full-value protection available · 4.8★ from 2,500+ moves', align: 'left' },
    fields: [
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'select',
        options: [opt('Studio / 1 bed', 1.0), opt('2 bedroom', 1.5), opt('3 bedroom', 2.1), opt('4+ bedroom', 2.8)] },
      { id: 'distance', name: 'Distance', label: 'Move distance (miles)', type: 'slider',
        min: 5, max: 1500, step: 5, default_value: 35, unit: 'miles' },
      { id: 'crew', name: 'Crew', label: 'Crew size', type: 'radio',
        options: [opt('2-person crew', 1.0), opt('3-person crew (faster)', 1.35), opt('4-person crew (large homes)', 1.7)] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        options: [opt('Full packing service', 480), opt('Specialty item (piano / safe)', 320), opt('Storage (1 month)', 180), opt('Disassembly + reassembly', 220), opt('Insurance bump (full value)', 150)] },
      { id: 'day', name: 'Day', label: 'Moving day', type: 'select',
        options: [opt('Weekday', 1.0), opt('Saturday', 1.15), opt('Sunday / holiday', 1.3)] },
    ],
    calculations: [
      calc('Crew & Transport', '([Home Size] * 480 + [Distance] * 1.6) * [Crew] * [Day]'),
      calc('Optional Add-ons', '[Extras]'),
      calc('Estimated Cost', '[Crew & Transport] + [Optional Add-ons]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Moving Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Move',
      footnote: 'Local moves include first 60 miles. Long-distance includes blanket-wrap, tie-down, and standard liability. No deposit required.',
    },
  },

  /* ── 38. Home inspection ── */
  {
    id: 'home_inspection_quote', name: 'Home Inspection',
    description: 'Pre-purchase home inspection by sqft, home age and add-on tests.',
    category: 'Professional', trades: ['home_inspection'],
    layout: 'two-column', theme: 'light', defaultIcon: 'ClipboardCheck',
    header: { title: 'Book an Independent Home Inspection', subtitle: 'InterNACHI-certified inspectors · 2,000+ homes inspected · Same-day report available', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 8000, step: 100, default_value: 2200, unit: 'sqft' },
      { id: 'age', name: 'Home Age', label: 'Home age', type: 'select',
        options: [opt('Newer (under 10 yrs)', 1.0), opt('10-30 yrs', 1.1), opt('30-60 yrs', 1.2), opt('60+ yrs (heritage)', 1.35)] },
      { id: 'addons', name: 'Add-on Tests', label: 'Specialty add-on tests', type: 'multi_select',
        options: [opt('Radon test', 145), opt('Mold inspection', 220), opt('Termite / pest', 195), opt('Sewer scope camera', 280), opt('Pool / spa inspection', 175), opt('Thermal imaging scan', 260)] },
      { id: 'turnaround', name: 'Turnaround', label: 'Report turnaround', type: 'radio',
        options: [opt('Standard (48 hours)', 0), opt('Rush (next business day)', 95), opt('Same-day report', 180)] },
    ],
    calculations: [
      calc('Base Inspection', '[Home Size] * 0.18 * [Home Age]'),
      calc('Specialty Tests', '[Add-on Tests]'),
      calc('Rush Report', '[Turnaround]'),
      calc('Estimated Quote', '[Base Inspection] + [Specialty Tests] + [Rush Report]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Inspection Quote',
      show_breakdown: true,
      cta_label: 'Book My Inspection',
      footnote: 'Includes full visual inspection of 400+ items, photo report, and walk-through with the inspector. Buy-back guarantee available.',
    },
  },

  /* ── Wave Y Batch 7 — Specialty (6 templates) ── */

  /* ── 39. Solar panel installation ── */
  {
    id: 'solar_panel_install', name: 'Solar Panel Installation',
    description: 'Rooftop solar quote by system size, roof type and battery storage.',
    category: 'Renewable Energy', trades: ['solar_panel', 'solar_battery'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'Sun',
    header: { title: 'Go Solar — Free Install Quote + Tax Credit', subtitle: 'NABCEP-certified installers · 25-year production guarantee · 30% federal tax credit', align: 'left' },
    fields: [
      { id: 'system_size', name: 'System Size', label: 'System size (kW)', type: 'slider',
        min: 3, max: 25, step: 0.5, default_value: 8.5, unit: 'kW' },
      { id: 'roof_type', name: 'Roof Type', label: 'Roof type', type: 'select',
        options: [opt('Asphalt shingle', 1.0), opt('Tile (clay / concrete)', 1.18), opt('Metal standing seam', 1.1), opt('Flat / membrane', 1.12)] },
      { id: 'battery', name: 'Battery Storage', label: 'Battery storage', type: 'radio',
        options: [opt('No battery', 0), opt('Single battery (~13 kWh)', 12500), opt('Dual battery (~26 kWh)', 22500)] },
      { id: 'extras', name: 'Extras', label: 'Optional extras', type: 'multi_select',
        options: [opt('EV charger pre-wire', 380), opt('Critter guard', 240), opt('Monitoring app (premium)', 180), opt('Roof reinforcement', 850), opt('Permit + interconnect handling', 0)] },
    ],
    calculations: [
      calc('Panel System', '[System Size] * 2800 * [Roof Type]'),
      calc('Battery Storage', '[Battery Storage]'),
      calc('Optional Extras', '[Extras]'),
      calc('Estimated System Cost', '[Panel System] + [Battery Storage] + [Optional Extras]'),
    ],
    result_calc: 'Estimated System Cost',
    results: {
      heading: 'Your Solar System Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Site Survey',
      footnote: 'Eligible for the 30% federal tax credit + state and utility incentives. 25-year panel performance warranty + 10-year workmanship guarantee.',
    },
  },

  /* ── 40. Pool service ── */
  {
    id: 'pool_service_quote', name: 'Pool Service',
    description: 'Recurring pool maintenance by pool size and visit cadence.',
    category: 'Outdoor', trades: ['pool_service', 'pool_cleaning'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'Waves',
    header: { title: 'Crystal-Clear Pool — Get a Service Quote', subtitle: 'CPO-certified pool techs · All chemicals & equipment included · Pre-pay season saves 10%', align: 'left' },
    fields: [
      { id: 'pool_size', name: 'Pool Size', label: 'Pool size', type: 'select',
        options: [opt('Small (under 15,000 gal)', 1.0), opt('Medium (15-25,000 gal)', 1.3), opt('Large (25,000+ gal)', 1.7)] },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'radio',
        options: [opt('Weekly', 1.0), opt('Bi-weekly', 0.55), opt('Monthly', 0.30)] },
      { id: 'services', name: 'Services', label: 'Included per visit', type: 'multi_select',
        options: [opt('Skim + vacuum', 30), opt('Brush walls + tile line', 18), opt('Chemistry test + adjust', 22), opt('Filter rinse', 15), opt('Equipment check', 12)] },
      { id: 'chemicals', name: 'Chemicals', label: 'Chemical supply', type: 'radio',
        options: [opt('You supply', 0), opt('We supply standard', 45), opt('We supply premium (saltwater / mineral)', 75)] },
    ],
    calculations: [
      calc('Service & Cleaning', '[Services] * [Pool Size] * [Frequency]'),
      calc('Chemicals', '[Chemicals]'),
      calc('Per-Visit Cost', '[Service & Cleaning] + [Chemicals]'),
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Pool Quote',
      show_breakdown: true,
      cta_label: 'Start My Pool Service',
      footnote: 'CPO-certified techs, all equipment included. Pre-pay full season for 10% off. Cancel anytime with 30 days notice.',
    },
  },

  /* ── 41. Pest control ── */
  {
    id: 'pest_control_quote', name: 'Pest Control',
    description: 'Recurring pest control by home size and treatment scope.',
    category: 'Cleaning', trades: ['pest_control'],
    layout: 'two-column', theme: 'light', defaultIcon: 'Bug',
    header: { title: 'Get a Family-Safe Pest Control Quote', subtitle: 'Licensed pest pros · Pet- and kid-safe products · Free re-treatment between visits', align: 'left' },
    fields: [
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 6000, step: 100, default_value: 2000, unit: 'sqft' },
      { id: 'plan', name: 'Plan', label: 'Service plan', type: 'radio',
        options: [opt('One-time treatment', 1.0), opt('Quarterly (recommended)', 0.40), opt('Monthly (heavy issue)', 0.18)] },
      { id: 'pests', name: 'Pests', label: 'What are we treating?', type: 'multi_select',
        options: [opt('General (ants, spiders)', 35), opt('Roaches', 65), opt('Wasps / hornets', 75), opt('Mice / rats', 110), opt('Termites (inspection)', 145), opt('Bedbugs (per room)', 220)] },
      { id: 'scope', name: 'Scope', label: 'Treatment scope', type: 'select',
        options: [opt('Interior only', 0), opt('Exterior only', 0), opt('Interior + exterior (full perimeter)', 60)] },
    ],
    calculations: [
      calc('Treatment Base', '[Home Size] * 0.06 * [Plan]'),
      calc('Target Pests', '[Pests]'),
      calc('Treatment Scope', '[Scope]'),
      calc('Estimated Cost', '[Treatment Base] + [Target Pests] + [Treatment Scope]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Pest Control Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Treatment',
      footnote: 'Family- and pet-safe products. Quarterly plans include free re-treatment between visits if pests return. 30-day satisfaction guarantee.',
    },
  },

  /* ── 42. Roof replacement ── */
  {
    id: 'roof_replacement', name: 'Roof Replacement',
    description: 'Full roof replacement by sqft, material and complexity.',
    category: 'Construction', trades: ['roofing'],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Home',
    header: { title: 'Get Your Roof Replacement Quote in 60 Seconds', subtitle: 'GAF Master Elite & Owens Corning certified · 50-year material warranty · Free drone roof survey', align: 'left' },
    fields: [
      { id: 'roof_size', name: 'Roof Size', label: 'Roof size (sqft)', type: 'slider',
        min: 500, max: 5000, step: 50, default_value: 2200, unit: 'sqft' },
      { id: 'material', name: 'Material', label: 'Roofing material', type: 'select',
        options: [opt('3-tab shingle', 4.5), opt('Architectural shingle', 6.5), opt('Metal standing seam', 11), opt('Clay tile', 14), opt('Slate', 19)] },
      { id: 'complexity', name: 'Complexity', label: 'Roof complexity', type: 'radio',
        options: [opt('Simple (gable / hip)', 1.0), opt('Moderate (dormers, multiple slopes)', 1.18), opt('Complex (turrets, valleys, intersections)', 1.4)] },
      { id: 'tear_off', name: 'Tear-Off', label: 'Tear off existing layers', type: 'radio',
        options: [opt('No (overlay)', 0), opt('One layer', 1200), opt('Two layers', 2200)] },
      { id: 'extras', name: 'Extras', label: 'Performance add-ons', type: 'multi_select',
        options: [opt('Ice + water barrier upgrade', 580), opt('Ridge ventilation', 420), opt('New gutters', 1450), opt('Skylights (3-pack)', 1800)] },
    ],
    calculations: [
      calc('Materials & Labor', '[Roof Size] * [Material] * [Complexity]'),
      calc('Tear-Off & Disposal', '[Tear-Off]'),
      calc('Performance Add-ons', '[Extras]'),
      calc('Estimated Project Cost', '[Materials & Labor] + [Tear-Off & Disposal] + [Performance Add-ons]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Roof Replacement Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Inspection',
      footnote: 'Manufacturer warranty (25–50 years) + 10-year workmanship warranty. Insurance-claim documentation provided on storm-damage jobs.',
    },
  },

  /* ── 43. Garage door service ── */
  {
    id: 'garage_door_service', name: 'Garage Door Service',
    description: 'Install, repair or replace by door size and opener.',
    category: 'Mechanical', trades: ['garage_door'],
    layout: 'single-column', theme: 'forest', defaultIcon: 'DoorOpen',
    header: { title: 'Get Your Garage Door Quote in 60 Seconds', subtitle: 'IDEA-accredited technicians · Lifetime warranty on springs · Same-day service available', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What do you need?', type: 'radio',
        options: [opt('Repair only', 180), opt('New door install', 1400), opt('Door + opener replacement', 2200)] },
      { id: 'door_size', name: 'Door Size', label: 'Door size', type: 'select',
        options: [opt('Single (8-9 ft)', 1.0), opt('Double (16 ft)', 1.65), opt('Carriage / oversized', 2.1)] },
      { id: 'door_type', name: 'Door Style', label: 'Door style', type: 'select',
        options: [opt('Steel panel', 0), opt('Insulated steel', 380), opt('Wood / wood-look', 950), opt('Glass / modern', 1500)] },
      { id: 'opener', name: 'Opener', label: 'Opener (if installing)', type: 'radio',
        options: [opt('Chain drive', 280), opt('Belt drive (quieter)', 380), opt('Smart / Wi-Fi enabled', 520)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Battery backup', 120), opt('Keypad entry', 75), opt('Haul old door', 95), opt('New springs', 220)] },
    ],
    calculations: [
      calc('Service & Door', '[Service] * [Door Size] + [Door Style]'),
      calc('Opener', '[Opener]'),
      calc('Add-ons', '[Extras]'),
      calc('Estimated Cost', '[Service & Door] + [Opener] + [Add-ons]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Garage Door Quote',
      show_breakdown: true,
      cta_label: 'Book a Technician',
      footnote: 'Lifetime warranty on springs and openers. Most repairs completed in a single visit. Same-day appointments available.',
    },
  },

  /* ── 44. Appliance repair ── */
  {
    id: 'appliance_repair', name: 'Appliance Repair',
    description: 'Per-appliance repair estimate with diagnostic + parts modifiers.',
    category: 'Mechanical', trades: ['appliance_repair'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Refrigerator',
    header: { title: 'Get an Appliance Repair Quote in 60 Seconds', subtitle: 'Factory-trained technicians · Flat-rate pricing · 90-day parts & labor warranty', align: 'left' },
    fields: [
      { id: 'appliance', name: 'Appliance', label: 'Which appliance?', type: 'select',
        options: [opt('Refrigerator', 220), opt('Dishwasher', 180), opt('Washer / dryer', 195), opt('Range / oven', 210), opt('Microwave', 145), opt('Garbage disposal', 130)] },
      { id: 'age', name: 'Age', label: 'Appliance age', type: 'radio',
        options: [opt('Under 5 years', 1.0), opt('5-10 years', 1.15), opt('10+ years', 1.3)] },
      { id: 'symptom', name: 'Symptom', label: 'What\'s the symptom?', type: 'select',
        options: [opt('Won\'t turn on', 0), opt('Runs but not working', 40), opt('Strange noise', 35), opt('Leaking', 60), opt('Burning smell / sparking', 85)] },
      { id: 'parts', name: 'Parts', label: 'Likely parts needed', type: 'radio',
        options: [opt('Diagnostic only', 0), opt('Minor part (under $50)', 60), opt('Major part ($50-$200)', 175), opt('OEM/specialty part ($200+)', 320)] },
    ],
    calculations: [
      calc('Diagnostic & Labor', '[Appliance] * [Age]'),
      calc('Symptom Surcharge', '[Symptom]'),
      calc('Parts', '[Parts]'),
      calc('Estimated Cost', '[Diagnostic & Labor] + [Symptom Surcharge] + [Parts]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Appliance Repair Quote',
      show_breakdown: true,
      cta_label: 'Book a Repair',
      footnote: 'Diagnostic fee waived when repair is performed same visit. 90-day warranty on all parts and labor. Most repairs done in one visit.',
    },
  },

  /* ── 45. Junk Removal (sample — W-AH-1, styled — W-AS-1) ── */
  {
    id: 'junk_removal_quote', name: 'Junk Removal',
    description: 'Truck-load pricing with surcharges for stairs, distance, and same-day pickup.',
    category: 'Cleaning', trades: ['junk_removal'],
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Trash2',
    header: { title: 'Book a Junk Pickup in 60 Seconds', subtitle: 'We load, haul, and sweep up · Most items donated or recycled · Same-day pickup available', align: 'left' },
    // W-AS-1 — Action / Truck / Bold-Industrial visual identity.
    // W-AS-1b — extended with AO-6c Brand Studio fields: bgGradient body,
    // accent-tinted bold result panel. (Note: `animations` is not yet a
    // schema field on AdvStyle — wave-as1c will add it; for now the
    // identity comes from gradient + result-panel emphasis + accent border.)
    style: {
      accent: '#fb923c',        // orange-400 bold action
      secondary: '#facc15',     // yellow-400 high-energy
      background: '#0f172a',    // slate-900 deep base
      surface: '#1e293b',       // slate-800 card
      border: '#334155',        // slate-700
      text: '#f8fafc',          // slate-50
      resultsBg: '#1e293b',
      success: '#22c55e',
      error: '#ef4444',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 6,
      headingWeight: 800,
      bodyWeight: 500,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      // W-AS-1b — AO-6c Brand Studio: dark industrial diagonal gradient
      // body + bold orange-accented result panel.
      // W-AS-1c — direction promoted from clamped `'linear-down'` to true
      // diagonal `'to bottom right'`; border softened from full `'accent'`
      // to `'accent-tinted'`; per-template `animations` bundle added.
      bgMode: 'gradient',
      bgGradient: { from: '#0f172a', to: '#1e293b', direction: 'to bottom right' },
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#fb923c',
        emphasis: 'bold',
        border: 'accent-tinted',
        // W-BB-3 — junk removal has high cost variability (load size, access,
        // disposal). Range display ($2,300–$2,700) reduces buyer anxiety vs a
        // false-precision single value.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'slide-fade',
        duration_ms: 280,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'load_size', name: 'Load Size', label: 'How much junk do you have?', type: 'select',
        options: [opt('1/4 truck', 120), opt('1/2 truck', 220), opt('3/4 truck', 320), opt('Full truck', 425)] },
      { id: 'mattresses', name: 'Mattresses', label: 'Mattresses', type: 'number',
        min: 0, max: 5, step: 1, default_value: 1, unit: 'item' },
      { id: 'appliances', name: 'Appliances', label: 'Appliances (fridge, washer, etc.)', type: 'number',
        min: 0, max: 5, step: 1, default_value: 1, unit: 'item' },
      { id: 'stairs', name: 'Stairs', label: 'Items located up or down stairs', type: 'toggle', on_value: 50 },
      { id: 'distance', name: 'Distance', label: 'Distance to drop-off (miles)', type: 'slider',
        min: 0, max: 30, step: 1, default_value: 8, unit: 'miles' },
      { id: 'same_day', name: 'Same-day pickup', label: 'Same-day pickup', type: 'toggle', on_value: 75 },
    ],
    calculations: [
      calc('Load & Items', '[Load Size] + [Mattresses] * 25 + [Appliances] * 45'),
      calc('Access & Distance', '[Stairs] + [Distance] * 2'),
      calc('Same-day Pickup', '[Same-day pickup]'),
      calc('Total Removal Cost', '[Load & Items] + [Access & Distance] + [Same-day Pickup]'),
    ],
    result_calc: 'Total Removal Cost',
    results: {
      heading: 'Your Junk Removal Quote',
      show_breakdown: true,
      cta_label: 'Book My Pickup',
      footnote: 'Includes labor, disposal, and clean-up. We donate or recycle whenever possible. Hazardous materials quoted separately.',
    },
  },

  /* ── 46. Window Replacement (sample — W-AH-1, styled — W-AS-1) ── */
  {
    id: 'window_replacement_quote', name: 'Window Replacement',
    description: 'Per-window pricing by type, frame material, and energy rating.',
    category: 'Home Improvement', trades: ['window_replacement'],
    layout: 'two-column', theme: 'light', defaultIcon: 'RectangleHorizontal',
    header: { title: 'Get Your Window Replacement Quote', subtitle: 'ENERGY STAR-certified installers · Lifetime product warranty · Free in-home measurement', align: 'left' },
    // W-AS-1 — Clean / Glass / Professional visual identity.
    // W-AS-1b — extended with AO-6c Brand Studio fields: airy
    // sky-to-lavender gradient body + subtle indigo result panel.
    style: {
      accent: '#4f46e5',        // indigo-600 trustworthy
      secondary: '#6366f1',     // indigo-500
      background: '#f8fafc',    // slate-50 very light
      surface: '#ffffff',
      border: '#e2e8f0',        // slate-200 hairline
      text: '#0f172a',          // slate-900
      resultsBg: '#ffffff',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'jakarta',
      fieldStyle: 'outline',
      radius: 16,
      headingWeight: 600,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-center',
      logoSize: 'medium',
      // W-AS-1b — AO-6c Brand Studio: clean glass gradient body, normal
      // indigo-accented result panel with hairline border.
      // W-AS-1c — direction normalised to CSS-standard `'to bottom'`;
      // border stays `'subtle'` (already correct); animations bundle added
      // with a calm 220ms fade.
      bgMode: 'gradient',
      bgGradient: { from: '#f8fafc', to: '#e0e7ff', direction: 'to bottom' },
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#4f46e5',
        emphasis: 'normal',
        border: 'subtle',
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 220,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'count', name: 'Count', label: 'Number of windows', type: 'number',
        min: 1, max: 30, step: 1, default_value: 8, unit: 'windows' },
      { id: 'type', name: 'Type', label: 'Window type', type: 'select',
        options: [opt('Single hung', 250), opt('Double hung', 320), opt('Sliding', 290), opt('Picture', 410), opt('Bay', 780)] },
      { id: 'frame', name: 'Frame', label: 'Frame material', type: 'select',
        options: [opt('Vinyl', 0), opt('Fiberglass', 110), opt('Wood', 180), opt('Aluminum', 60)] },
      { id: 'glass', name: 'Glass', label: 'Glass package', type: 'select',
        options: [opt('Standard double-pane', 0), opt('Energy-efficient (Low-E)', 85), opt('Triple-pane', 180)] },
      { id: 'install', name: 'Professional installation per window', label: 'Pro installation per window', type: 'toggle', on_value: 145 },
      { id: 'disposal', name: 'Haul away old windows', label: 'Haul away the old windows', type: 'toggle', on_value: 60 },
    ],
    calculations: [
      calc('Windows & Installation', '[Count] * ([Type] + [Frame] + [Glass] + [Professional installation per window])'),
      calc('Removal & Disposal', '[Haul away old windows]'),
      calc('Total Window Replacement', '[Windows & Installation] + [Removal & Disposal]'),
    ],
    result_calc: 'Total Window Replacement',
    results: {
      heading: 'Your Window Replacement Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Measurement',
      footnote: 'Includes ENERGY STAR-rated windows, professional installation, and lifetime product warranty. Custom shapes or historic-property windows quoted separately.',
    },
  },

  /* ── 47. Mold Remediation (sample — W-AH-1, styled — W-AS-1) ── */
  {
    id: 'mold_remediation_quote', name: 'Mold Remediation',
    description: 'Severity-tiered remediation with containment, HVAC, and post-test add-ons.',
    category: 'Emergency', trades: ['mold_remediation'],
    layout: 'two-column', theme: 'forest', defaultIcon: 'Biohazard',
    header: { title: 'Get Your Mold Remediation Estimate', subtitle: 'IICRC-certified · EPA-protocol removal · Insurance documentation provided', align: 'left' },
    // W-AS-1 — Urgent / Warning / Trust visual identity.
    // W-AS-1b — extended with AO-6c Brand Studio fields: warm amber-to-peach
    // gradient body + bold red-accented result panel.
    style: {
      accent: '#dc2626',        // red-600 urgency
      secondary: '#f59e0b',     // amber-500 warning emphasis
      background: '#fef3c7',    // amber-50 warm pale yellow
      surface: '#fffbeb',       // amber-50 lighter card
      border: '#fcd34d',        // amber-300
      text: '#451a03',          // amber-950 deep brown
      resultsBg: '#fffbeb',
      success: '#16a34a',       // "you're safe now"
      error: '#b91c1c',
      fontFamily: 'plex',
      fieldStyle: 'filled',
      radius: 8,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      // W-AS-1b — AO-6c Brand Studio: warm urgent amber→peach gradient
      // body, bold red-accented result panel with accent border.
      // W-AS-1c — direction normalised to CSS-standard `'to bottom'`;
      // border softened from full `'accent'` to `'accent-tinted'` so the
      // red doesn't shout over the amber body; animations bundle added.
      bgMode: 'gradient',
      bgGradient: { from: '#fef3c7', to: '#fed7aa', direction: 'to bottom' },
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#dc2626',
        emphasis: 'bold',
        border: 'accent-tinted',
        // W-BB-3 — mold remediation severity / containment / HVAC scope drives
        // wide cost variance. Range display tracks the actual quote uncertainty.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'slide',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'area', name: 'Area', label: 'Affected area (sqft)', type: 'slider',
        min: 10, max: 2000, step: 10, default_value: 80, unit: 'sqft' },
      { id: 'severity', name: 'Severity', label: 'Mold severity', type: 'select',
        options: [opt('Surface mold (visible only)', 8), opt('Moderate (subsurface, no structural)', 14), opt('Severe (structural damage)', 26)] },
      { id: 'mold_type', name: 'Mold Type', label: 'Mold type (if known)', type: 'select',
        options: [opt('Common (Cladosporium / Penicillium)', 0), opt('Aspergillus', 300), opt('Stachybotrys / Black mold', 850)] },
      { id: 'containment', name: 'Containment & negative-air setup required', label: 'Add containment & negative-air setup', type: 'toggle', on_value: 800 },
      { id: 'hvac', name: 'HVAC/ductwork remediation', label: 'Include HVAC & ductwork remediation', type: 'toggle', on_value: 650 },
      { id: 'post_test', name: 'Third-party air-quality test after remediation', label: 'Independent air-quality clearance test', type: 'toggle', on_value: 425 },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'select',
        options: [opt('Standard scheduling', 0), opt('Within 48 hours', 350), opt('Emergency (24h)', 900)] },
    ],
    calculations: [
      calc('Remediation & Materials', '[Area] * [Severity] + [Mold Type]'),
      calc('Containment & HVAC', '[Containment & negative-air setup required] + [HVAC/ductwork remediation]'),
      calc('Testing & Urgency', '[Third-party air-quality test after remediation] + [Urgency]'),
      calc('Total Remediation Cost', '[Remediation & Materials] + [Containment & HVAC] + [Testing & Urgency]'),
    ],
    result_calc: 'Total Remediation Cost',
    results: {
      heading: 'Your Mold Remediation Estimate',
      show_breakdown: true,
      cta_label: 'Schedule Inspection',
      footnote: 'Lab analysis + EPA-protocol removal included. Written clearance on every job. Insurance documentation provided on request.',
    },
  },
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
 * Wave H5 — Style tab overrides.
 *
 * Composed on top of the resolved `WidgetTheme` at render time. Every field is
 * optional; absent fields fall through to the theme defaults so a calculator
 * without a Style customisation looks identical to its template. The shape is
 * intentionally narrow: it carries USER choices, not derivations (e.g.
 * accentTint is recomputed from `accent` at render time).
 *
 * `fieldStyle`, `radius` and `widgetWidth` are structural — the renderer
 * applies them via inline styles / data-attributes. They are PERSISTABLE: no
 * `__preview` flag here so a saved style survives a server round-trip.
 */
export type AdvFieldStyle = 'filled' | 'outline';
/**
 * Curated font families exposed in the Style tab.
 *
 * Wave L S3 — expanded with modern grotesks that fit the design system
 * (Satoshi, Geist, Plus Jakarta Sans, IBM Plex Sans, Outfit, Sora). The
 * resolved font-family stacks (client/src/components/wizard/elfsight/types.ts
 * → FONT_FAMILY_STACKS) all end with `system-ui, sans-serif` so a network
 * failure to load the webfont degrades gracefully.
 */
export type AdvFontFamily =
  | 'system' | 'inter' | 'manrope'
  | 'satoshi' | 'geist' | 'jakarta' | 'plex' | 'outfit' | 'sora';
export type AdvWidgetWidth = 'narrow' | 'wide' | 'full';
/** W-AO-6b — logo placement in the calculator header. */
export type AdvLogoPlacement = 'top-left' | 'top-center' | 'top-right' | 'hidden';
/** W-AO-6b — logo render size in pixels (small=24, medium=36, large=52). */
export type AdvLogoSize = 'small' | 'medium' | 'large';
/** W-AO-6b — heading & body font weights (segmented). */
export type AdvHeadingWeight = 500 | 600 | 700 | 800;
export type AdvBodyWeight = 400 | 500;
/** W-AO-6b — base font size token. */
export type AdvFontSize = 'small' | 'medium' | 'large';
export interface AdvStyle {
  /** Accent / CTA colour. Overrides theme.accent. */
  accent?: string;
  /** Calculator body background. Overrides theme.bg. */
  background?: string;
  /** Primary text colour. Overrides theme.text. */
  text?: string;
  /** Result-panel background. Overrides theme.result. */
  resultsBg?: string;
  /** W-AO-6b — secondary CTA / accent-variant colour. */
  secondary?: string;
  /** W-AO-6b — card / panel surface colour (distinct from body background). */
  surface?: string;
  /** W-AO-6b — input + container border colour. */
  border?: string;
  /** W-AO-6b — positive-state colour (quote confirmed, etc). */
  success?: string;
  /** W-AO-6b — error / validation-failure colour. */
  error?: string;
  fontFamily?: AdvFontFamily;
  fieldStyle?: AdvFieldStyle;
  /** Corner radius in pixels (0–24). */
  radius?: number;
  widgetWidth?: AdvWidgetWidth;
  /**
   * Wave AC-1 — per-viewport pixel widths. Optional; when set, override
   * the `widgetWidth` enum for the matching viewport. Clamped at the
   * renderer to safe ranges (desktop 320–800, mobile 320–440).
   */
  widgetWidthDesktop?: number;
  widgetWidthMobile?: number;
  /** W-AO-6b — logo placement in the header (top-left / center / right / hidden). */
  logoPlacement?: AdvLogoPlacement;
  /** W-AO-6b — logo size (small=24px / medium=36px / large=52px). */
  logoSize?: AdvLogoSize;
  /** W-AO-6b — heading font weight (500 / 600 / 700 / 800). */
  headingWeight?: AdvHeadingWeight;
  /** W-AO-6b — body font weight (400 / 500). */
  bodyWeight?: AdvBodyWeight;
  /** W-AO-6b — base font size (small=14px / medium=16px / large=18px). */
  fontSize?: AdvFontSize;

  /* ─── W-AO-6c — Brand Studio Wave 1 (Pro tier) ───────────────────
   *
   * All Brand Studio fields are OPTIONAL and server-side tier-gated: a
   * free-tier calculator's update is stripped of these keys before
   * persistence (calculatorRoutes.ts). The renderer ALSO ignores them
   * when `planTier !== 'pro'/'business'` — defense in depth.
   */

  /** Raw CSS injected inside a scoped `<style>` tag at the widget root.
   *  Author-supplied; never executed as JS. Scoped via the unique
   *  `.qq-widget-${calculatorId}` class so it doesn't escape into the
   *  host page. */
  customCss?: string;

  /** Background mode for the widget body. Defaults to `'solid'` (uses
   *  the existing `background` colour token). `'gradient'` reads
   *  `bgGradient`; `'image'` reads `bgImageUrl` + `bgImageTint`. */
  bgMode?: AdvBgMode;

  /** Two-stop gradient + direction used when `bgMode === 'gradient'`. */
  bgGradient?: AdvBgGradient;

  /** Data URL (or remote URL) of the background image used when
   *  `bgMode === 'image'`. Reuses the existing logo-upload pipeline. */
  bgImageUrl?: string;

  /** Tint overlay opacity for the image background, 0-50 (percent). The
   *  overlay tint uses the calculator's `background` colour so the brand
   *  shows through. */
  bgImageTint?: number;

  /** Result-panel overrides — colours / emphasis / border. Optional;
   *  every sub-field falls through to the resolved theme default. */
  resultPanel?: AdvResultPanel;

  /* ─── W-AO-6d — Brand Studio Wave 2 (Pro tier) ───────────────────
   *
   * Step / transition animations. Optional; server-side stripped for
   * non-Pro tiers and renderer-side ignored when `planTier` isn't
   * unlocked. Absent value → instant transition (pre-AO-6d behaviour).
   */
  animations?: AdvAnimations;
}

/** W-AO-6c — Brand Studio background mode. */
export type AdvBgMode = 'solid' | 'gradient' | 'image';

/** W-AO-6c — gradient direction shorthand consumed by the renderer.
 *  W-AS-1c — extended with standard CSS linear-gradient direction shorthands
 *  (`'to top'`, `'to bottom right'`, …) so templates can pick diagonals.
 *  The legacy `'linear-*'` values are retained for backwards-compat with
 *  any stored configs from AO-6c. */
export type AdvBgGradientDirection =
  | 'linear-up' | 'linear-down' | 'linear-left' | 'linear-right' | 'radial'
  | 'to top' | 'to top right' | 'to right' | 'to bottom right'
  | 'to bottom' | 'to bottom left' | 'to left' | 'to top left';

/** W-AO-6c — two-stop gradient + direction. */
export interface AdvBgGradient {
  from?: string;
  to?: string;
  direction?: AdvBgGradientDirection;
}

/** W-AO-6c — result-panel emphasis token. */
export type AdvResultEmphasis = 'subtle' | 'normal' | 'bold';

/** W-AO-6c — result-panel border treatment.
 *  W-AS-1c — `'accent-tinted'` added: a 1.5px accent border at ~22% opacity,
 *  midway between the hairline `'subtle'` and the full-strength `'accent'`. */
export type AdvResultBorder = 'none' | 'subtle' | 'accent' | 'accent-tinted';

/** W-BB-3 — range-pricing display mode. When `enabled`, the headline value
 *  renders as `$LOW – $HIGH` (±band_pct, rounded to $25). Industry-standard
 *  for trades quoting — lowers buyer commitment anxiety. Default off so
 *  existing 44 templates render identically. */
export interface AdvResultRangeMode {
  /** When true, headline renders as a range; false / absent → single value. */
  enabled: boolean;
  /** Band percentage (5–25). Default 8 → $2500 becomes $2300–$2700. */
  band_pct: number;
}

/** W-AO-6c — result-panel overrides. Every field optional; absent →
 *  the existing renderer defaults win. */
export interface AdvResultPanel {
  /** Override accent colour for the headline value + dividers. */
  accentOverride?: string;
  /** Override the result-panel background (defaults to `resultsBg`). */
  bgOverride?: string;
  /** Headline value emphasis — `'normal'` (default), `'subtle'` or `'bold'`. */
  emphasis?: AdvResultEmphasis;
  /** Border treatment — `'subtle'` (default), `'none'`, `'accent'`. */
  border?: AdvResultBorder;
  /** W-BB-3 — range-pricing display mode. Absent → single value (legacy). */
  range_mode?: AdvResultRangeMode;
}

/** W-AO-6d — step transition kinds. `none` = instant (legacy behaviour). */
export type AdvStepTransition = 'none' | 'fade' | 'slide' | 'slide-fade';

/** W-AO-6d — animations bundle. Every field optional; absent value →
 *  legacy instant transition. */
export interface AdvAnimations {
  step_transition?: AdvStepTransition;
  /** Transition duration in ms; clamped to 100..600 at render. */
  duration_ms?: number;
  /** When true (default), `prefers-reduced-motion: reduce` forces instant. */
  reduced_motion_respect?: boolean;
}

/**
 * W-AO-6c — list of Brand Studio fields used by the server-side tier
 * gate to strip free-tier patches before persistence. Kept here (not in
 * the route) so the shape stays the source of truth.
 *
 * W-AO-6d — `animations` added (Brand Studio Wave 2 step-transition bundle).
 */
export const BRAND_STUDIO_STYLE_KEYS = [
  'customCss',
  'bgMode',
  'bgGradient',
  'bgImageUrl',
  'bgImageTint',
  'resultPanel',
  'animations',
] as const;
export type BrandStudioStyleKey = (typeof BRAND_STUDIO_STYLE_KEYS)[number];

/**
 * Brand defaults — Wave H5. Used by the StyleTab and by
 * `buildBlankPreviewConfig` so the preview seeds with the user's brand instead
 * of the Elfsight default.
 */
/**
 * Wave AC-1 — `widgetWidthDesktop` / `widgetWidthMobile` are intentionally
 * absent from the defaults. They're per-viewport pixel overrides that only
 * apply when the user explicitly picks one in the Style tab; otherwise the
 * renderer falls back to the existing `widgetWidth` enum.
 */
/**
 * Wave AC-1 — `widgetWidthDesktop` / `widgetWidthMobile` are intentionally
 * absent from the defaults.
 *
 * W-AO-6b — `secondary`, `surface`, `border`, `success`, `error`,
 * `logoPlacement`, `logoSize`, `headingWeight`, `bodyWeight` and `fontSize`
 * are also intentionally absent. They are NEW optional tokens; when unset
 * the renderer falls through to the legacy behaviour (`theme.surface`,
 * `theme.border`, default 600/400 weights, 16px base). Adding them to the
 * defaults would force every existing config to render with the new values.
 */
type AdvStyleOptionalOnly =
  | 'widgetWidthDesktop' | 'widgetWidthMobile'
  | 'secondary' | 'surface' | 'border' | 'success' | 'error'
  | 'logoPlacement' | 'logoSize'
  | 'headingWeight' | 'bodyWeight' | 'fontSize'
  // W-AO-6c — Brand Studio fields. All Pro-tier only, all optional and
  // intentionally absent from `DEFAULT_ADV_STYLE` so a fresh calculator
  // renders identically to the pre-AO-6c build.
  | 'customCss' | 'bgMode' | 'bgGradient' | 'bgImageUrl' | 'bgImageTint'
  | 'resultPanel'
  // W-AO-6d — Brand Studio Wave 2 animations. Same rationale as 6c
  // fields: Pro-only, optional, absent → instant transition (legacy).
  | 'animations';

export const DEFAULT_ADV_STYLE: Required<Omit<AdvStyle, AdvStyleOptionalOnly>> = {
  accent: '#0d3cfc',
  background: '#ffffff',
  text: '#0f172a',
  resultsBg: '#ffffff',
  fontFamily: 'system',
  fieldStyle: 'filled',
  radius: 12,
  widgetWidth: 'wide',
};

/**
 * Number-format overrides — Wave H6. Drives the renderer's currency
 * formatting independent of the user's browser locale. Optional; absent slot
 * → pre-H6 en-US defaults.
 */
export interface AdvNumberFormat {
  thousands?: ',' | ' ' | '';
  decimal?: '.' | ',';
  /** ISO-4217 3-letter code. */
  currency?: string;
}

/**
 * The runtime `calculator_settings.advanced` shape — what the renderer and the
 * builder persist. Kept identical to the pre-refactor shape so no stored
 * calculator needs migration; only the catalogue module shape changed.
 *
 * Wave H5 widens it with the optional `style` slot — back-compatible (older
 * configs render unchanged because every style field is optional and falls
 * through to the resolved theme).
 * Wave H6 widens it again with the optional `numberFormat` slot — also
 * back-compatible (absent → pre-H6 en-US defaults).
 */
export interface AdvancedConfigShape {
  enabled: true;
  theme: string;
  /** Wave W-AH-2 — Lucide icon name used in the header's logo slot fallback. */
  defaultIcon?: string;
  layout: TemplateLayout;
  fields: TemplateField[];
  calculations: TemplateCalculation[];
  result_calc: string;
  header: TemplateHeader;
  results?: TemplateResults;
  /** Wave H5 — user-driven Style tab overrides. */
  style?: AdvStyle;
  /** Wave H6 — user-driven Settings tab number-format overrides. */
  numberFormat?: AdvNumberFormat;
}

/* ─── W-BB-2 — Per-category visual identity (derived at load time) ───
 *
 * The three AS-1c templates (junk_removal_quote, window_replacement_quote,
 * mold_remediation_quote) ship explicit `style:` blocks and KEEP them — the
 * derivation helper is only called as a fallback inside `toAdvancedConfig`
 * when `template.style` is absent.
 *
 * Palette table mirrors the visual treatment specified by Wave AP-1
 * (`client/src/lib/categoryStyles.ts`). It is duplicated here intentionally
 * — `shared/` cannot import from `client/`, and keeping the table in
 * `shared/` makes it the source of truth for the renderer; the client
 * gallery palette stays in sync via the cross-checked entries.
 */
export type DerivedCategoryId =
  | 'automotive' | 'construction' | 'cleaning' | 'home-improvement'
  | 'emergency' | 'outdoor' | 'professional' | 'default';

interface DerivedCategoryPalette {
  bgFromHex: string;
  bgToHex: string;
  accent: string;
  urgency: 'low' | 'medium' | 'high';
  animationStyle: AdvStepTransition;
  headingWeight: AdvHeadingWeight;
  fontFamily: AdvFontFamily;
}

const DERIVED_CATEGORY_PALETTES: Record<DerivedCategoryId, DerivedCategoryPalette> = {
  automotive: {
    bgFromHex: '#0f172a', bgToHex: '#1e293b', accent: '#fb923c',
    urgency: 'high', animationStyle: 'slide-fade',
    headingWeight: 800, fontFamily: 'geist',
  },
  construction: {
    bgFromHex: '#1c1917', bgToHex: '#292524', accent: '#f59e0b',
    urgency: 'medium', animationStyle: 'slide',
    headingWeight: 700, fontFamily: 'satoshi',
  },
  cleaning: {
    bgFromHex: '#ecfdf5', bgToHex: '#d1fae5', accent: '#10b981',
    urgency: 'low', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'jakarta',
  },
  'home-improvement': {
    bgFromHex: '#f0f9ff', bgToHex: '#dbeafe', accent: '#2563eb',
    urgency: 'medium', animationStyle: 'fade',
    headingWeight: 700, fontFamily: 'inter',
  },
  emergency: {
    bgFromHex: '#fef3c7', bgToHex: '#fed7aa', accent: '#dc2626',
    urgency: 'high', animationStyle: 'slide-fade',
    headingWeight: 800, fontFamily: 'manrope',
  },
  outdoor: {
    bgFromHex: '#f0fdf4', bgToHex: '#d1fae5', accent: '#16a34a',
    urgency: 'low', animationStyle: 'slide',
    headingWeight: 700, fontFamily: 'jakarta',
  },
  professional: {
    bgFromHex: '#faf5ff', bgToHex: '#ede9fe', accent: '#7c3aed',
    urgency: 'medium', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'satoshi',
  },
  default: {
    bgFromHex: '#f1f5f9', bgToHex: '#e2e8f0', accent: '#475569',
    urgency: 'low', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'system',
  },
};

/** Collapse the wider `category` string set down to one of the 7 visual
 *  families used by the live renderer. Mirrors the gallery's
 *  `getCategoryStyle()` in `client/src/lib/categoryStyles.ts`. */
export function resolveDerivedCategoryId(category: string | undefined): DerivedCategoryId {
  if (!category) return 'default';
  const c = category.toLowerCase();
  if (c.includes('automotive') || c.includes('moving') || c.includes('mechanical')) return 'automotive';
  if (c.includes('construction') || c.includes('driveway') || c.includes('renovation')) return 'construction';
  if (c.includes('cleaning')) return 'cleaning';
  if (c.includes('home improvement') || c.includes('hvac')) return 'home-improvement';
  if (c.includes('emergency') || c.includes('restoration') || c.includes('repair')) return 'emergency';
  if (c.includes('outdoor') || c.includes('renewable')) return 'outdoor';
  if (c.includes('professional') || c.includes('photography') || c.includes('specialty')) return 'professional';
  return 'default';
}

/** Fixed rotation so two templates within the same category don't read as
 *  identical. Indexed by template position within its category. */
const GRADIENT_DIRECTION_ROTATION: AdvBgGradientDirection[] = [
  'to bottom right', 'to bottom', 'to bottom left', 'radial',
];

/** Compute a deterministic in-category index for a given template id —
 *  by hashing the id into 0..N so a template always lands on the same
 *  gradient direction across reloads. */
function indexFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * W-BB-2 — derive a full `AdvStyle` from a template's `category` field.
 *
 * Called by `toAdvancedConfig` ONLY when the template doesn't carry its own
 * `style` block, so the 3 AS-1c templates remain untouched.
 *
 * Per-category palette + per-template gradient direction variation, so the
 * 44 derived templates feel distinctly different without hand-editing each
 * one.
 */
export function deriveStyleFromCategory(t: Pick<TemplateConfig, 'id' | 'category'>): AdvStyle {
  const palette = DERIVED_CATEGORY_PALETTES[resolveDerivedCategoryId(t.category)];
  const direction =
    GRADIENT_DIRECTION_ROTATION[indexFromId(t.id) % GRADIENT_DIRECTION_ROTATION.length];
  return {
    bgMode: 'gradient',
    bgGradient: { from: palette.bgFromHex, to: palette.bgToHex, direction },
    resultPanel: {
      accentOverride: palette.accent,
      emphasis: palette.urgency === 'high' ? 'bold' : 'normal',
      border: palette.urgency === 'high' ? 'accent-tinted' : 'subtle',
    },
    animations: {
      step_transition: palette.animationStyle,
      duration_ms: 250,
      reduced_motion_respect: true,
    },
    headingWeight: palette.headingWeight,
    fontFamily: palette.fontFamily,
  };
}

/** Produce a persistable `calculator_settings.advanced` object from a template. */
export function toAdvancedConfig(t: TemplateConfig): AdvancedConfigShape {
  // W-BB-2 — templates with their own `style` block (the 3 AS-1c samples)
  // KEEP that block verbatim; everything else gets a category-derived style
  // so the gallery isn't 44 identical-looking white cards.
  const style = t.style ?? deriveStyleFromCategory(t);
  return {
    enabled: true,
    theme: t.theme,
    layout: t.layout,
    fields: t.fields,
    calculations: t.calculations,
    result_calc: t.result_calc,
    header: t.header,
    ...(t.results ? { results: t.results } : {}),
    ...(t.defaultIcon ? { defaultIcon: t.defaultIcon } : {}),
    style,
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
    // Wave H5 — seed with brand defaults so the placeholder preview already
    // reads "on brand" and the Style tab starts from a known baseline.
    style: { ...DEFAULT_ADV_STYLE },
    __preview: true,
  } as AdvancedConfigShape & { __preview: true };
}
