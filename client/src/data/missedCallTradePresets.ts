/**
 * Trade presets for the Missed-Call Revenue Calculator.
 *
 * Sources (2025–2026 data):
 * - HomeAdvisor / Angi average project costs by category
 * - Invoca: home service businesses lose $300–$1,200 per missed call
 * - ServiceTitan / Jobber industry benchmarks
 * - Thumbtack average project pricing
 * - ConsumerAffairs industry statistics
 * - BLS occupational data
 *
 * Close-rate ranges reflect inbound-call conversion benchmarks:
 * - Home services average 25–46% on answered calls (Supply House Times)
 * - Varies by lead source and urgency of service
 *
 * All dollar values are approximate North American averages.
 * Ranges are intentionally broad to reflect real market variance.
 */

export interface TradePreset {
  id: string;
  label: string;
  category: 'mechanical' | 'cleaning' | 'construction' | 'outdoor' | 'specialty' | 'emergency';
  /** Typical missed calls/week for a small-to-mid operator */
  defaultMissedCallsPerWeek: number;
  /** Typical close rate on answered inbound calls (%) */
  defaultCloseRate: number;
  /** Low / mid / high average job values ($) */
  avgJobValueLow: number;
  avgJobValueMid: number;
  avgJobValueHigh: number;
  /** Slider bounds */
  sliderBounds: {
    missedCalls: { min: number; max: number; step: number };
    closeRate: { min: number; max: number; step: number };
    avgJobValue: { min: number; max: number; step: number };
  };
}

const defaultCallBounds = { min: 1, max: 50, step: 1 };
const defaultRateBounds = { min: 5, max: 70, step: 5 };

export const TRADE_PRESETS: TradePreset[] = [
  {
    id: 'plumbing',
    label: 'Plumbing',
    category: 'mechanical',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 35,
    avgJobValueLow: 200,
    avgJobValueMid: 450,
    avgJobValueHigh: 900,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 3000, step: 25 },
    },
  },
  {
    id: 'hvac',
    label: 'HVAC',
    category: 'mechanical',
    defaultMissedCallsPerWeek: 10,
    defaultCloseRate: 30,
    avgJobValueLow: 300,
    avgJobValueMid: 800,
    avgJobValueHigh: 3000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 100, max: 8000, step: 50 },
    },
  },
  {
    id: 'electrical',
    label: 'Electrical',
    category: 'mechanical',
    defaultMissedCallsPerWeek: 10,
    defaultCloseRate: 30,
    avgJobValueLow: 200,
    avgJobValueMid: 500,
    avgJobValueHigh: 1200,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 5000, step: 25 },
    },
  },
  {
    id: 'roofing',
    label: 'Roofing',
    category: 'construction',
    defaultMissedCallsPerWeek: 8,
    defaultCloseRate: 25,
    avgJobValueLow: 5000,
    avgJobValueMid: 12000,
    avgJobValueHigh: 25000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: { min: 5, max: 50, step: 5 },
      avgJobValue: { min: 1000, max: 40000, step: 500 },
    },
  },
  {
    id: 'landscaping',
    label: 'Landscaping',
    category: 'outdoor',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 35,
    avgJobValueLow: 150,
    avgJobValueMid: 400,
    avgJobValueHigh: 1500,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 5000, step: 25 },
    },
  },
  {
    id: 'house_cleaning',
    label: 'House Cleaning',
    category: 'cleaning',
    defaultMissedCallsPerWeek: 15,
    defaultCloseRate: 40,
    avgJobValueLow: 120,
    avgJobValueMid: 220,
    avgJobValueHigh: 400,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 1000, step: 10 },
    },
  },
  {
    id: 'pest_control',
    label: 'Pest Control',
    category: 'specialty',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 35,
    avgJobValueLow: 100,
    avgJobValueMid: 200,
    avgJobValueHigh: 500,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 2500, step: 25 },
    },
  },
  {
    id: 'painting',
    label: 'Painting',
    category: 'construction',
    defaultMissedCallsPerWeek: 8,
    defaultCloseRate: 30,
    avgJobValueLow: 600,
    avgJobValueMid: 2000,
    avgJobValueHigh: 6000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 200, max: 10000, step: 100 },
    },
  },
  {
    id: 'flooring',
    label: 'Flooring',
    category: 'construction',
    defaultMissedCallsPerWeek: 7,
    defaultCloseRate: 25,
    avgJobValueLow: 1500,
    avgJobValueMid: 3500,
    avgJobValueHigh: 8000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: { min: 5, max: 50, step: 5 },
      avgJobValue: { min: 500, max: 15000, step: 250 },
    },
  },
  {
    id: 'window_cleaning',
    label: 'Window Cleaning',
    category: 'cleaning',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 40,
    avgJobValueLow: 150,
    avgJobValueMid: 300,
    avgJobValueHigh: 600,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 1500, step: 25 },
    },
  },
  {
    id: 'junk_removal',
    label: 'Junk Removal',
    category: 'specialty',
    defaultMissedCallsPerWeek: 14,
    defaultCloseRate: 40,
    avgJobValueLow: 150,
    avgJobValueMid: 350,
    avgJobValueHigh: 700,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 2000, step: 25 },
    },
  },
  {
    id: 'garage_door',
    label: 'Garage Door Repair',
    category: 'mechanical',
    defaultMissedCallsPerWeek: 10,
    defaultCloseRate: 35,
    avgJobValueLow: 200,
    avgJobValueMid: 450,
    avgJobValueHigh: 1200,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 3000, step: 25 },
    },
  },
  {
    id: 'appliance_repair',
    label: 'Appliance Repair',
    category: 'mechanical',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 35,
    avgJobValueLow: 150,
    avgJobValueMid: 300,
    avgJobValueHigh: 600,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 1500, step: 25 },
    },
  },
  {
    id: 'locksmith',
    label: 'Locksmith',
    category: 'emergency',
    defaultMissedCallsPerWeek: 15,
    defaultCloseRate: 45,
    avgJobValueLow: 100,
    avgJobValueMid: 175,
    avgJobValueHigh: 300,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 1000, step: 10 },
    },
  },
  {
    id: 'handyman',
    label: 'Handyman',
    category: 'construction',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 35,
    avgJobValueLow: 175,
    avgJobValueMid: 400,
    avgJobValueHigh: 800,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 2000, step: 25 },
    },
  },
  {
    id: 'tree_service',
    label: 'Tree Service',
    category: 'outdoor',
    defaultMissedCallsPerWeek: 8,
    defaultCloseRate: 30,
    avgJobValueLow: 300,
    avgJobValueMid: 750,
    avgJobValueHigh: 2000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 100, max: 5000, step: 50 },
    },
  },
  {
    id: 'pressure_washing',
    label: 'Pressure Washing',
    category: 'cleaning',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 40,
    avgJobValueLow: 200,
    avgJobValueMid: 350,
    avgJobValueHigh: 600,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 2000, step: 25 },
    },
  },
  {
    id: 'pool_service',
    label: 'Pool Service',
    category: 'outdoor',
    defaultMissedCallsPerWeek: 10,
    defaultCloseRate: 35,
    avgJobValueLow: 150,
    avgJobValueMid: 350,
    avgJobValueHigh: 800,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 3000, step: 25 },
    },
  },
  {
    id: 'concrete',
    label: 'Concrete / Paving',
    category: 'construction',
    defaultMissedCallsPerWeek: 6,
    defaultCloseRate: 25,
    avgJobValueLow: 2000,
    avgJobValueMid: 5000,
    avgJobValueHigh: 15000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: { min: 5, max: 50, step: 5 },
      avgJobValue: { min: 500, max: 25000, step: 250 },
    },
  },
  {
    id: 'fencing',
    label: 'Fencing',
    category: 'outdoor',
    defaultMissedCallsPerWeek: 8,
    defaultCloseRate: 30,
    avgJobValueLow: 1500,
    avgJobValueMid: 3500,
    avgJobValueHigh: 7000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 500, max: 15000, step: 250 },
    },
  },
  {
    id: 'siding',
    label: 'Siding',
    category: 'construction',
    defaultMissedCallsPerWeek: 6,
    defaultCloseRate: 25,
    avgJobValueLow: 5000,
    avgJobValueMid: 10000,
    avgJobValueHigh: 20000,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: { min: 5, max: 50, step: 5 },
      avgJobValue: { min: 1000, max: 30000, step: 500 },
    },
  },
  {
    id: 'gutter_services',
    label: 'Gutter Services',
    category: 'outdoor',
    defaultMissedCallsPerWeek: 10,
    defaultCloseRate: 35,
    avgJobValueLow: 150,
    avgJobValueMid: 350,
    avgJobValueHigh: 800,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 75, max: 2000, step: 25 },
    },
  },
  {
    id: 'remodeling',
    label: 'Remodeling / Renovation',
    category: 'construction',
    defaultMissedCallsPerWeek: 6,
    defaultCloseRate: 20,
    avgJobValueLow: 8000,
    avgJobValueMid: 25000,
    avgJobValueHigh: 75000,
    sliderBounds: {
      missedCalls: { min: 1, max: 30, step: 1 },
      closeRate: { min: 5, max: 40, step: 5 },
      avgJobValue: { min: 2000, max: 100000, step: 1000 },
    },
  },
  {
    id: 'carpet_cleaning',
    label: 'Carpet Cleaning',
    category: 'cleaning',
    defaultMissedCallsPerWeek: 12,
    defaultCloseRate: 40,
    avgJobValueLow: 120,
    avgJobValueMid: 250,
    avgJobValueHigh: 500,
    sliderBounds: {
      missedCalls: defaultCallBounds,
      closeRate: defaultRateBounds,
      avgJobValue: { min: 50, max: 1500, step: 25 },
    },
  },
];

/** Generic fallback for trades not in presets (or "Other") */
export const GENERIC_PRESET: TradePreset = {
  id: 'other',
  label: 'Other / General',
  category: 'specialty',
  defaultMissedCallsPerWeek: 10,
  defaultCloseRate: 30,
  avgJobValueLow: 200,
  avgJobValueMid: 500,
  avgJobValueHigh: 1500,
  sliderBounds: {
    missedCalls: defaultCallBounds,
    closeRate: defaultRateBounds,
    avgJobValue: { min: 50, max: 10000, step: 50 },
  },
};

export function getPresetById(id: string): TradePreset {
  return TRADE_PRESETS.find(p => p.id === id) ?? GENERIC_PRESET;
}

export const CATEGORY_LABELS: Record<TradePreset['category'], string> = {
  mechanical: 'Mechanical & Systems',
  cleaning: 'Cleaning & Maintenance',
  construction: 'Construction & Renovation',
  outdoor: 'Outdoor & Property',
  specialty: 'Specialty Services',
  emergency: 'Emergency Services',
};
