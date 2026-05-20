/**
 * @deprecated MARKETING-ONLY demo template definitions.
 *
 * This file powers the /templates and /demo/:templateId marketing pages only.
 * It is NOT the canonical template system.
 *
 * Canonical source of truth: shared/templateLibrary.ts (TemplateDefinition / TEMPLATE_LIBRARY)
 *
 * The `calculateEstimate()` in this file is a simplified marketing-demo formula.
 * The production pricing engine lives in shared/calculateEstimate.ts.
 *
 * Do NOT add new templates here. New trade templates should be added to
 * shared/templateLibrary.ts with proper TemplateDefinition structure.
 *
 * Phase 2+ will migrate these marketing demos to render from templateLibrary data.
 */
import { colors } from '@/theme/tokens';

export type FormulaType = "sqft" | "hourly" | "per_room" | "package" | "fixed_plus";

export interface InputOption {
  value: string;
  label: string;
  priceMultiplier: number;
}

export interface TemplateInput {
  id: string;
  label: string;
  type: "slider" | "select";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | string;
  options?: InputOption[];
}

export interface TemplateConfig {
  id: string;
  name: string;
  shortName: string;
  tag: "Single Page" | "Multi-Step" | "Package Cards" | "Estimate + Book";
  emoji: string;
  description: string;
  bestFor: string[];
  inputsSummary: string; // shown on template card (e.g. "sqft, scope, fixtures")
  inputs: TemplateInput[];
  formula: FormulaType;
  baseRateMin: number; // per unit (or per item for package/fixed)
  baseRateMax: number;
  primaryInputId: string; // the driving quantity input
  previewGradient: string; // CSS gradient for card thumbnail
  hasBooking: boolean;
  currency: string;
  resultUnit: string; // e.g. "total", "per visit", "per session"
}

/**
 * @deprecated Simplified marketing-demo formula engine.
 * Production pricing engine: shared/calculateEstimate.ts
 */
export function calculateEstimate(
  config: TemplateConfig,
  values: Record<string, number | string>
): { min: number; max: number } {
  const primary = Number(values[config.primaryInputId] ?? 0);
  let min = 0;
  let max = 0;

  switch (config.formula) {
    case "sqft":
      min = primary * config.baseRateMin;
      max = primary * config.baseRateMax;
      break;
    case "hourly":
      min = primary * config.baseRateMin;
      max = primary * config.baseRateMax;
      break;
    case "per_room":
      min = primary * config.baseRateMin;
      max = primary * config.baseRateMax;
      break;
    case "package":
    case "fixed_plus":
      min = config.baseRateMin;
      max = config.baseRateMax;
      break;
  }

  // Apply multipliers from select inputs
  config.inputs.forEach((input) => {
    if (input.type === "select" && input.options) {
      const selected = input.options.find((o) => o.value === values[input.id]);
      if (selected && selected.priceMultiplier !== 1) {
        min *= selected.priceMultiplier;
        max *= selected.priceMultiplier;
      }
    }
  });

  // Clamp to reasonable minimums
  return {
    min: Math.max(Math.round(min), Math.round(config.baseRateMin)),
    max: Math.max(Math.round(max), Math.round(config.baseRateMax)),
  };
}

/* ─── Template registry ─── */
export const TEMPLATES: TemplateConfig[] = [
  {
    id: "home-cleaning",
    name: "Home Cleaning Quote",
    shortName: "Home Cleaning",
    tag: "Estimate + Book",
    emoji: "🧹",
    description: "Sticky summary sidebar keeps the total visible as customers select rooms, extras, and frequency.",
    bestFor: ["Residential Cleaners", "Maids", "Housekeepers"],
    inputsSummary: "bedrooms, bathrooms, extras",
    formula: "per_room",
    baseRateMin: 45,
    baseRateMax: 70,
    primaryInputId: "bedrooms",
    previewGradient: "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
    hasBooking: true,
    currency: "$",
    resultUnit: "per visit",
    inputs: [
      { id: "bedrooms", label: "Bedrooms", type: "slider", unit: "rooms", min: 1, max: 7, step: 1, defaultValue: 3 },
      { id: "bathrooms", label: "Bathrooms", type: "slider", unit: "bathrooms", min: 1, max: 4, step: 1, defaultValue: 2 },
      {
        id: "clean_type",
        label: "Clean type",
        type: "select",
        defaultValue: "standard",
        options: [
          { value: "standard", label: "Standard clean", priceMultiplier: 1 },
          { value: "deep", label: "Deep clean", priceMultiplier: 1.55 },
          { value: "move_out", label: "Move-out clean", priceMultiplier: 2.0 },
        ],
      },
    ],
  },
  {
    id: "plumbing",
    name: "Plumbing Quote",
    shortName: "Plumbing",
    tag: "Single Page",
    emoji: "🔧",
    description: "Clean one-page form. Customer selects job type and urgency; instant estimate appears below.",
    bestFor: ["Plumbers", "Gas Fitters", "Drainage Specialists"],
    inputsSummary: "job type, hours, urgency",
    formula: "hourly",
    baseRateMin: 95,
    baseRateMax: 145,
    primaryInputId: "hours",
    previewGradient: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
    hasBooking: false,
    currency: "$",
    resultUnit: "total",
    inputs: [
      {
        id: "job_type",
        label: "Job type",
        type: "select",
        defaultValue: "repair",
        options: [
          { value: "repair", label: "Leak or repair", priceMultiplier: 1 },
          { value: "install", label: "Fixture installation", priceMultiplier: 1.2 },
          { value: "emergency", label: "Emergency call-out", priceMultiplier: 1.8 },
          { value: "inspection", label: "Full inspection", priceMultiplier: 1.1 },
        ],
      },
      { id: "hours", label: "Estimated hours", type: "slider", unit: "hrs", min: 1, max: 8, step: 0.5, defaultValue: 2 },
    ],
  },
  {
    id: "hvac",
    name: "HVAC Installation Quote",
    shortName: "HVAC",
    tag: "Multi-Step",
    emoji: "❄️",
    description: "Step-by-step with progress bar. Walks customers through system type, home size, and existing setup.",
    bestFor: ["HVAC Contractors", "Air Con Installers", "Heating Specialists"],
    inputsSummary: "unit type, sqft, home age",
    formula: "sqft",
    baseRateMin: 4.5,
    baseRateMax: 9.5,
    primaryInputId: "home_sqft",
    previewGradient: "linear-gradient(135deg, #EFF6FF, #E0F2FE)",
    hasBooking: true,
    currency: "$",
    resultUnit: "total",
    inputs: [
      {
        id: "unit_type",
        label: "System type",
        type: "select",
        defaultValue: "split",
        options: [
          { value: "split", label: "Split system (single room)", priceMultiplier: 1 },
          { value: "multi_split", label: "Multi-head split", priceMultiplier: 1.7 },
          { value: "ducted", label: "Ducted system", priceMultiplier: 2.8 },
          { value: "evaporative", label: "Evaporative cooling", priceMultiplier: 1.4 },
        ],
      },
      { id: "home_sqft", label: "Home size", type: "slider", unit: "sq ft", min: 400, max: 4000, step: 100, defaultValue: 1400 },
    ],
  },
  {
    id: "roofing",
    name: "Roofing Quote",
    shortName: "Roofing",
    tag: "Single Page",
    emoji: "🏠",
    description: "Shows a price range to anchor expectations, then gates the exact quote behind a lead form.",
    bestFor: ["Roofers", "Roof Restorers", "Metal Roofing"],
    inputsSummary: "roof sqft, material, slope",
    formula: "sqft",
    baseRateMin: 3.5,
    baseRateMax: 7.5,
    primaryInputId: "roof_sqft",
    previewGradient: "linear-gradient(135deg, #FFF7ED, #FFEDD5)",
    hasBooking: false,
    currency: "$",
    resultUnit: "total",
    inputs: [
      { id: "roof_sqft", label: "Roof area", type: "slider", unit: "sq ft", min: 800, max: 5000, step: 100, defaultValue: 1800 },
      {
        id: "material",
        label: "Roofing material",
        type: "select",
        defaultValue: "colorbond",
        options: [
          { value: "shingles", label: "Asphalt shingles", priceMultiplier: 1 },
          { value: "colorbond", label: "Colorbond steel", priceMultiplier: 1.3 },
          { value: "tile", label: "Concrete tile", priceMultiplier: 1.5 },
          { value: "metal", label: "Standing seam metal", priceMultiplier: 1.8 },
        ],
      },
    ],
  },
  {
    id: "landscaping",
    name: "Landscaping Quote",
    shortName: "Landscaping",
    tag: "Estimate + Book",
    emoji: "🌿",
    description: "Estimate first, then immediate booking CTA. Highest conversion for outdoor service businesses.",
    bestFor: ["Landscapers", "Garden Maintenance", "Lawn Services"],
    inputsSummary: "lot sqft, service type, frequency",
    formula: "sqft",
    baseRateMin: 0.08,
    baseRateMax: 0.22,
    primaryInputId: "lot_sqft",
    previewGradient: "linear-gradient(135deg, #F0FDF4, #D1FAE5)",
    hasBooking: true,
    currency: "$",
    resultUnit: "per visit",
    inputs: [
      { id: "lot_sqft", label: "Garden / lot size", type: "slider", unit: "sq ft", min: 500, max: 10000, step: 250, defaultValue: 3000 },
      {
        id: "service_type",
        label: "Service",
        type: "select",
        defaultValue: "mow_edge",
        options: [
          { value: "mow_edge", label: "Mow + Edge", priceMultiplier: 1 },
          { value: "full_garden", label: "Full garden tidy", priceMultiplier: 2.2 },
          { value: "hedge_trim", label: "Hedge + shrub trim", priceMultiplier: 1.6 },
          { value: "design_install", label: "Design + install", priceMultiplier: 8 },
        ],
      },
    ],
  },
  {
    id: "bathroom-reno",
    name: "Bathroom Renovation Quote",
    shortName: "Bathroom Reno",
    tag: "Multi-Step",
    emoji: "🛁",
    description: "Multi-step progressive flow. Customers reveal scope step-by-step for a premium feel and higher lead quality.",
    bestFor: ["Builders", "Renovation Specialists", "Tilers", "Plumbers"],
    inputsSummary: "sqft, scope, fixtures count",
    formula: "sqft",
    baseRateMin: 85,
    baseRateMax: 160,
    primaryInputId: "bathroom_sqft",
    previewGradient: "linear-gradient(135deg, #F8FAFC, #E2E8F0)",
    hasBooking: true,
    currency: "$",
    resultUnit: "total",
    inputs: [
      { id: "bathroom_sqft", label: "Bathroom size", type: "slider", unit: "sq ft", min: 30, max: 180, step: 5, defaultValue: 60 },
      {
        id: "scope",
        label: "Renovation scope",
        type: "select",
        defaultValue: "standard",
        options: [
          { value: "cosmetic", label: "Cosmetic update (paint, taps, vanity)", priceMultiplier: 0.6 },
          { value: "standard", label: "Standard renovation", priceMultiplier: 1 },
          { value: "full", label: "Full gut + retile", priceMultiplier: 1.55 },
          { value: "luxury", label: "Luxury fit-out", priceMultiplier: 2.4 },
        ],
      },
    ],
  },
  {
    id: "electrical",
    name: "Electrical Work Quote",
    shortName: "Electrical",
    tag: "Single Page",
    emoji: "⚡",
    description: "Job-type selector drives the estimate instantly. Simple, fast, and perfect for a varied scope of work.",
    bestFor: ["Electricians", "Electrical Contractors"],
    inputsSummary: "job type, property size",
    formula: "fixed_plus",
    baseRateMin: 220,
    baseRateMax: 420,
    primaryInputId: "home_rooms",
    previewGradient: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
    hasBooking: false,
    currency: "$",
    resultUnit: "total",
    inputs: [
      {
        id: "job_type",
        label: "Job type",
        type: "select",
        defaultValue: "powerpoint",
        options: [
          { value: "safety_check", label: "Safety inspection", priceMultiplier: 0.5 },
          { value: "powerpoint", label: "Power point / outlet", priceMultiplier: 1 },
          { value: "lights", label: "Light fixtures / downlights", priceMultiplier: 1.4 },
          { value: "switchboard", label: "Switchboard upgrade", priceMultiplier: 3.2 },
          { value: "rewire", label: "Full rewire", priceMultiplier: 7 },
        ],
      },
      { id: "home_rooms", label: "Number of rooms", type: "slider", unit: "rooms", min: 1, max: 8, step: 1, defaultValue: 4 },
    ],
  },
  {
    id: "painting",
    name: "Interior Painting Quote",
    shortName: "Painting",
    tag: "Single Page",
    emoji: "🎨",
    description: "Room count and paint quality drive the estimate. Clean layout with instant result and optional booking.",
    bestFor: ["Painters", "Decorators", "Property Managers"],
    inputsSummary: "rooms, wall condition, paint quality",
    formula: "per_room",
    baseRateMin: 280,
    baseRateMax: 420,
    primaryInputId: "rooms",
    previewGradient: "linear-gradient(135deg, #FDF4FF, #F3E8FF)",
    hasBooking: true,
    currency: "$",
    resultUnit: "total",
    inputs: [
      { id: "rooms", label: "Rooms to paint", type: "slider", unit: "rooms", min: 1, max: 10, step: 1, defaultValue: 3 },
      {
        id: "paint_quality",
        label: "Paint quality",
        type: "select",
        defaultValue: "standard",
        options: [
          { value: "budget", label: "Budget (builder grade)", priceMultiplier: 0.75 },
          { value: "standard", label: "Standard (trade quality)", priceMultiplier: 1 },
          { value: "premium", label: "Premium (washable low-VOC)", priceMultiplier: 1.35 },
        ],
      },
    ],
  },
  {
    id: "concrete",
    name: "Concrete & Paving Quote",
    shortName: "Concrete",
    tag: "Single Page",
    emoji: "🏗️",
    description: "Area-based pricing with finish type multiplier. Perfect for driveways, paths, and outdoor areas.",
    bestFor: ["Concreters", "Pavers", "Driveway Specialists"],
    inputsSummary: "sqft, finish type, thickness",
    formula: "sqft",
    baseRateMin: 6.5,
    baseRateMax: 12,
    primaryInputId: "sqft",
    previewGradient: "linear-gradient(135deg, #F8FAFC, #CBD5E1)",
    hasBooking: false,
    currency: "$",
    resultUnit: "total",
    inputs: [
      { id: "sqft", label: "Concrete area", type: "slider", unit: "sq ft", min: 50, max: 1500, step: 25, defaultValue: 300 },
      {
        id: "finish",
        label: "Finish type",
        type: "select",
        defaultValue: "plain",
        options: [
          { value: "plain", label: "Plain broom finish", priceMultiplier: 1 },
          { value: "exposed", label: "Exposed aggregate", priceMultiplier: 1.4 },
          { value: "coloured", label: "Coloured / pigmented", priceMultiplier: 1.3 },
          { value: "stencil", label: "Stencil / pattern", priceMultiplier: 1.7 },
        ],
      },
    ],
  },
  {
    id: "photography",
    name: "Photography Packages",
    shortName: "Photography",
    tag: "Package Cards",
    emoji: "📸",
    description: "Tiered package cards with Most Popular badge. Customer picks a session type and sees instant pricing.",
    bestFor: ["Photographers", "Videographers", "Event Studios"],
    inputsSummary: "session type, duration, extras",
    formula: "package",
    baseRateMin: 299,
    baseRateMax: 599,
    primaryInputId: "session_type",
    previewGradient: "linear-gradient(135deg, #FFF1F2, #FFE4E6)",
    hasBooking: true,
    currency: "$",
    resultUnit: "per session",
    inputs: [
      {
        id: "session_type",
        label: "Session type",
        type: "select",
        defaultValue: "portrait",
        options: [
          { value: "portrait", label: "Portrait (1 hour)", priceMultiplier: 0.5 },
          { value: "family", label: "Family session (2 hours)", priceMultiplier: 0.85 },
          { value: "half_day", label: "Half-day event (4 hours)", priceMultiplier: 1 },
          { value: "full_day", label: "Full-day event (8 hours)", priceMultiplier: 1.8 },
          { value: "wedding", label: "Wedding package", priceMultiplier: 3.5 },
        ],
      },
    ],
  },
];

export function getTemplate(id: string): TemplateConfig | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/* Tag styling */
export const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  "Single Page": { bg: "#EAF1FF", color: "#0d3cfc" },
  "Multi-Step": { bg: "#F0FDF4", color: colors.platform.accent },
  "Package Cards": { bg: "#FFF7ED", color: "#EA580C" },
  "Estimate + Book": { bg: colors.platform.accentLighter, color: colors.platform.accent },
};
