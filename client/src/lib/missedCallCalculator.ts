/**
 * Pure calculation logic for the Missed-Call Revenue Calculator.
 * All functions are deterministic and side-effect free.
 */

export interface CalcInputs {
  missedCallsPerWeek: number;
  closeRatePercent: number;
  avgJobValue: number;
}

export interface CalcResult {
  /** Lost jobs per week based on missed calls × close rate */
  lostJobsPerWeek: number;
  /** Lost opportunity per week */
  lostPerWeek: number;
  /** Lost opportunity per month (weekly × 4.33) */
  lostPerMonth: number;
  /** Lost opportunity per year (monthly × 12) */
  lostPerYear: number;
  /** Lost opportunity per day (yearly / 365) */
  lostPerDay: number;
  /** Lost jobs per month */
  lostJobsPerMonth: number;
}

export interface RangeResult {
  conservative: CalcResult;
  typical: CalcResult;
  high: CalcResult;
}

const WEEKS_PER_MONTH = 4.33; // 52 / 12 ≈ 4.333

/**
 * Core calculation: given exact inputs, produce an exact result.
 */
export function calculate(inputs: CalcInputs): CalcResult {
  const lostJobsPerWeek = inputs.missedCallsPerWeek * (inputs.closeRatePercent / 100);
  const lostPerWeek = lostJobsPerWeek * inputs.avgJobValue;
  const lostPerMonth = lostPerWeek * WEEKS_PER_MONTH;
  const lostPerYear = lostPerMonth * 12;
  const lostJobsPerMonth = lostJobsPerWeek * WEEKS_PER_MONTH;

  const lostPerDay = lostPerYear / 365;

  return {
    lostJobsPerWeek: round2(lostJobsPerWeek),
    lostPerWeek: Math.round(lostPerWeek),
    lostPerMonth: Math.round(lostPerMonth),
    lostPerYear: Math.round(lostPerYear),
    lostPerDay: Math.round(lostPerDay),
    lostJobsPerMonth: Math.round(lostJobsPerMonth),
  };
}

/**
 * Produce conservative / typical / high estimates by varying inputs.
 *
 * Approach:
 * - Conservative applies a 0.7× multiplier (not all missed calls were real leads)
 * - Typical uses the user's inputs as-is
 * - High applies a 1.2× multiplier (some jobs have upsell / repeat value)
 *
 * These multipliers are transparent and labeled in the UI.
 */
export function calculateRange(inputs: CalcInputs): RangeResult {
  return {
    conservative: calculate({
      ...inputs,
      missedCallsPerWeek: inputs.missedCallsPerWeek * 0.7,
    }),
    typical: calculate(inputs),
    high: calculate({
      ...inputs,
      missedCallsPerWeek: inputs.missedCallsPerWeek * 1.2,
    }),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format a number as compact USD: $1,234 or $12.3K or $1.2M */
export function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? Math.round(m).toLocaleString() : m.toFixed(1)}M`;
  }
  if (value >= 100_000) {
    return `$${Math.round(value / 1000)}K`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

/** Format as full USD with commas: $1,234 */
export function formatCurrencyFull(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
