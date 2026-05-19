/**
 * Themed calculator templates for QuoteQuick. Each preset is a complete
 * `calculator_settings.advanced` config — fields, formulas, header, result
 * settings — plus a layout and a widget theme. Picking one in the wizard
 * drops the whole config into the builder, where every part stays editable.
 *
 * Templates rebuild, increment 3.
 */
import type { LayoutStyle } from './templateLibrary';

type FieldType =
  | 'number' | 'slider' | 'select' | 'radio'
  | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading';

interface POption { id: string; label: string; value: number; }
interface PField {
  id: string; name: string; label: string; type: FieldType;
  required?: boolean; default_value?: number; min?: number; max?: number;
  step?: number; unit?: string; on_value?: number; options?: POption[];
}
interface PCalc { id: string; name: string; formula: string; format: 'number' | 'currency' | 'percent'; }
interface PAdvanced {
  enabled: true;
  theme: string;
  fields: PField[];
  calculations: PCalc[];
  result_calc: string;
  header: { title: string; subtitle?: string; align: 'left' | 'center' | 'right' };
  results?: { heading?: string; footnote?: string; show_breakdown?: boolean };
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  layout: LayoutStyle;
  theme: string;
  advanced: PAdvanced;
}

/* Small helpers to keep the catalogue compact. */
const opt = (label: string, value: number): POption => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, value });
const calc = (name: string, formula: string, format: PCalc['format'] = 'currency'): PCalc =>
  ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, formula, format });

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  /* ── 1. Car towing ── */
  {
    id: 'car_towing', name: 'Car Towing', description: 'Distance-based tow pricing with add-on services.',
    layout: 'single_page', theme: 'midnight',
    advanced: {
      enabled: true, theme: 'midnight',
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
  },

  /* ── 2. Driveway paving ── */
  {
    id: 'driveway_paving', name: 'Driveway Paving', description: 'Area-based driveway paving estimate.',
    layout: 'single_page', theme: 'midnight',
    advanced: {
      enabled: true, theme: 'midnight',
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
  },

  /* ── 3. Property cleaning ── */
  {
    id: 'property_cleaning', name: 'Property Cleaning', description: 'Room-based cleaning quote with extras.',
    layout: 'two_column', theme: 'light',
    advanced: {
      enabled: true, theme: 'light',
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
  },

  /* ── 4. Energy efficiency upgrade ── */
  {
    id: 'energy_upgrade', name: 'Energy Upgrade', description: 'Home efficiency upgrade estimate.',
    layout: 'single_page', theme: 'midnight',
    advanced: {
      enabled: true, theme: 'midnight',
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
  },

  /* ── 5. Landscaping ── */
  {
    id: 'landscaping', name: 'Landscaping', description: 'Garden landscaping & maintenance quote.',
    layout: 'two_column', theme: 'forest',
    advanced: {
      enabled: true, theme: 'forest',
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
  },

  /* ── 6. Gutter cleaning ── */
  {
    id: 'gutter_cleaning', name: 'Gutter Cleaning', description: 'Length-based gutter cleaning quote.',
    layout: 'single_page', theme: 'forest',
    advanced: {
      enabled: true, theme: 'forest',
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
  },

  /* ── 7. Fence installation ── */
  {
    id: 'fence_installation', name: 'Fence Installation', description: 'Per-metre fencing install estimate.',
    layout: 'single_page', theme: 'forest',
    advanced: {
      enabled: true, theme: 'forest',
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
  },

  /* ── 8. Roof repair ── */
  {
    id: 'roof_repair', name: 'Roof Repair', description: 'Area + material roof repair estimate.',
    layout: 'two_column', theme: 'midnight',
    advanced: {
      enabled: true, theme: 'midnight',
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
  },

  /* ── 9. Solar panels ── */
  {
    id: 'solar_panels', name: 'Solar Panels', description: 'Solar install cost from system size.',
    layout: 'two_column', theme: 'light',
    advanced: {
      enabled: true, theme: 'light',
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
  },

  /* ── 10. Interior painting ── */
  {
    id: 'interior_painting', name: 'Interior Painting', description: 'Room + finish interior painting quote.',
    layout: 'two_column', theme: 'mint',
    advanced: {
      enabled: true, theme: 'mint',
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
  },

  /* ── 11. House renovation ── */
  {
    id: 'house_renovation', name: 'House Renovation', description: 'Area + labour renovation estimate.',
    layout: 'two_column', theme: 'light',
    advanced: {
      enabled: true, theme: 'light',
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
  },
];

export function getTemplatePreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find(t => t.id === id);
}

export function getPresetsByLayout(layout: LayoutStyle): TemplatePreset[] {
  return TEMPLATE_PRESETS.filter(t => t.layout === layout);
}
