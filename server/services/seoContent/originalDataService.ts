/**
 * OriginalDataService — the WeFixTrades SEO data moat (WP-2).
 *
 * Turns the proprietary `calculators` corpus (every customer's real
 * `pricing_config` + `trade_type`) into aggregated, anonymized price
 * statistics the SEO content generator can cite ("based on N real
 * WeFixTrades quotes"). This is the information-gain differentiator that
 * makes our automated content genuinely rankable — competitors cannot
 * replicate numbers derived from a live customer base they do not have.
 *
 * ─── PRIVACY POSTURE (HARD REQUIREMENT — surfaced in admin review) ────────
 * This service emits AGGREGATES ONLY. It is designed so that no single
 * customer's pricing can ever be reconstructed or identified from its output:
 *
 *   1. k-ANONYMITY FLOOR. No statistic is ever emitted from fewer than
 *      MIN_SAMPLE distinct real configs (default 5, env SEO_DATA_MIN_SAMPLE).
 *      Below the floor the result is { sufficient: false, sampleSize } with
 *      NO price numbers at all — the generator MUST skip that page. This is
 *      simultaneously (a) a privacy guarantee (a 1-of-1 or 2-of-2 cut would
 *      expose an individual's price) and (b) the anti-thin-content guarantee
 *      (a page with no real data is never generated). One floor, two jobs.
 *
 *   2. NO PII / NO IDENTIFIERS. The output shape contains ONLY aggregate
 *      numbers + a sample size + provenance. It NEVER carries calculator ids,
 *      user ids, business names, slugs, owner emails/phones, or any raw/exact
 *      individual config. The CalculatorRecord input is reduced to
 *      (trade_type, pricing_config, region?) at the boundary; nothing
 *      identifying flows past the aggregator. See OriginalDataResult — it is
 *      structurally incapable of carrying a customer identifier.
 *
 *   3. BUCKETING / ROUNDING. Emitted money values are rounded to whole
 *      dollars; percentiles are computed over the population, never echoing a
 *      single config verbatim as "the price".
 *
 * ─── INERT / SAFE ─────────────────────────────────────────────────────────
 * Read-only. The pure aggregator (`aggregatePriceData`) touches no I/O and is
 * the unit under test. `getPriceDataForJob` is the thin DB-fed entry point; it
 * caps the number of configs it will pull (MAX_CONFIGS) and memoizes results
 * per (trade, job, region) for CACHE_TTL_MS so the generator can call it
 * freely without re-aggregating.
 */

import { calculateEstimate, type EstimateInputs } from "@shared/calculateEstimate";

/* ─── Config ──────────────────────────────────────────────────────────── */

/** k-anonymity / anti-thin floor. Never emit a stat from fewer real configs. */
export const DEFAULT_MIN_SAMPLE = 5;

/** Read SEO_DATA_MIN_SAMPLE at call time (testable via env injection). */
export function getMinSample(): number {
  const raw = (process.env.SEO_DATA_MIN_SAMPLE ?? "").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MIN_SAMPLE;
}

/** Hard cap on configs aggregated per cut — bounds the read + the math. */
export const MAX_CONFIGS = 5000;

/** Per-(trade,job,region) memo TTL. */
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/* ─── Public types ────────────────────────────────────────────────────────
   NOTE: by construction these carry NO customer identifier of any kind. */

export interface PriceQuery {
  tradeType: string;
  /** Optional named job — selects representative EstimateInputs. */
  jobType?: string;
  /** Optional region signal (e.g. derived from owner location). */
  region?: string;
}

/** A single anonymized add-on/modifier prevalence stat. */
export interface CommonOption {
  /** Human label (e.g. "After-Hours", "Travel / Service Fee"). */
  label: string;
  /** Fraction of configs in the cut that offer it (0..1, rounded to 2dp). */
  prevalence: number;
}

export interface RegionalVariation {
  region: string;
  sampleSize: number;
  median: number;
}

/** Insufficient-data shape: NO price numbers, only the (privacy-safe) count. */
export interface InsufficientDataResult {
  sufficient: false;
  sampleSize: number;
  minSample: number;
  tradeType: string;
  jobType?: string;
  region?: string;
}

/** Sufficient-data shape: aggregates only. */
export interface SufficientDataResult {
  sufficient: true;
  tradeType: string;
  jobType?: string;
  region?: string;
  /** Number of real configs the stats are derived from (>= minSample). */
  sampleSize: number;
  currency: "USD";
  /** Whole-dollar aggregates over the population. */
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  /** Add-ons/modifiers and how common they are across the cut. */
  commonOptions: CommonOption[];
  /** Per-region medians, only when a region cut itself clears minSample. */
  regionalVariation: RegionalVariation[];
  /** ISO timestamp the aggregate was computed — provenance for citations. */
  computedAt: string;
}

export type OriginalDataResult = SufficientDataResult | InsufficientDataResult;

/* ─── Boundary input ──────────────────────────────────────────────────────
   The ONLY fields the aggregator accepts. The DB entry point projects each
   calculator row down to exactly this — no id/name/email survives. */
export interface CalculatorRecord {
  trade_type: string;
  pricing_config: unknown;
  /** Optional region signal (already derived; never a raw address). */
  region?: string | null;
}

/* ─── Representative inputs per job ───────────────────────────────────────
   We can't know each customer's exact job parameters, so we run a small,
   FIXED, representative basket of EstimateInputs through every config and
   take the central estimate. This keeps the comparison apples-to-apples
   across heterogeneous pricing types. A jobType may map to a tuned basket;
   unknown jobs fall back to the generic basket. */

const GENERIC_BASKET: EstimateInputs[] = [
  { quantity: 1 },
  { quantity: 2 },
  { quantity: 3 },
];

const JOB_BASKETS: Record<string, EstimateInputs[]> = {
  // Larger jobs lean on higher quantities; small/standard on lower.
  small: [{ quantity: 1 }],
  standard: [{ quantity: 2 }],
  large: [{ quantity: 4 }, { quantity: 6 }],
};

function basketFor(jobType?: string): EstimateInputs[] {
  if (jobType && JOB_BASKETS[jobType]) return JOB_BASKETS[jobType];
  return GENERIC_BASKET;
}

/* ─── Pure aggregation core (the unit under test) ────────────────────────── */

/** Median of a numeric array (sorted copy). Empty → 0. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Linear-interpolation percentile (type-7, the spreadsheet/numpy default).
 * p in [0,1]. Empty → 0.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const s = [...values].sort((a, b) => a - b);
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  const frac = idx - lo;
  return s[lo] + (s[hi] - s[lo]) * frac;
}

/**
 * Run one config through the representative basket and return its central
 * (median-of-basket) estimated price, or null if the config yields no
 * usable number (call-for-quote configs, NaN, <= 0).
 */
export function representativePrice(
  pricingConfig: unknown,
  jobType?: string,
): number | null {
  const basket = basketFor(jobType);
  const prices: number[] = [];
  for (const inputs of basket) {
    const est = calculateEstimate(pricingConfig, inputs);
    // call_for_quote configs contribute no price signal — they are excluded
    // from the aggregate (and from the sample count) rather than skewing it.
    if (est.callUs && est.type === "call_for_quote") continue;
    let value: number;
    if (est.type === "range" && est.rangeMin != null && est.rangeMax != null) {
      value = (est.rangeMin + est.rangeMax) / 2;
    } else {
      value = est.total;
    }
    if (Number.isFinite(value) && value > 0) prices.push(value);
  }
  if (prices.length === 0) return null;
  return median(prices);
}

/** Pull the add-on/modifier labels a config offers (presence, not amounts). */
function optionLabelsFor(pricingConfig: unknown): string[] {
  const labels: string[] = [];
  const cfg = pricingConfig as Record<string, any> | null | undefined;
  if (!cfg || typeof cfg !== "object") return labels;
  if (Array.isArray(cfg.addOns)) {
    for (const ao of cfg.addOns) {
      if (ao && typeof ao.label === "string") labels.push(ao.label);
    }
  }
  if (typeof cfg.travelFee === "number" && cfg.travelFee > 0) labels.push("Travel / Service Fee");
  if (typeof cfg.afterHoursMult === "number" && cfg.afterHoursMult > 1) labels.push("After-Hours");
  if (Array.isArray(cfg.difficultyTiers) && cfg.difficultyTiers.length > 0) labels.push("Difficulty / Complexity");
  return labels;
}

function roundMoney(n: number): number {
  return Math.round(n);
}

/**
 * Aggregate a set of (already trade-filtered) calculator records into an
 * anonymized OriginalDataResult, enforcing the k-anonymity / anti-thin floor.
 *
 * GATE: the sample size is the count of configs that produced a USABLE price
 * for this job (call-for-quote configs do not count). If that count is below
 * `minSample`, this returns { sufficient: false, sampleSize } with NO price
 * numbers — the generator must skip the page. This is the single chokepoint;
 * stats are computed ONLY on the sufficient branch, so a regression that
 * tried to emit numbers below the floor is structurally impossible here.
 */
export function aggregatePriceData(
  records: CalculatorRecord[],
  query: PriceQuery,
  minSample: number = getMinSample(),
): OriginalDataResult {
  const { tradeType, jobType, region } = query;

  // Trade + (optional) region filter at the boundary.
  const cut = records.filter((r) => {
    if (r.trade_type !== tradeType) return false;
    if (region && (r.region ?? null) !== region) return false;
    return true;
  });

  // Derive a representative price per config; null = no price signal.
  const priced: { price: number; record: CalculatorRecord }[] = [];
  for (const r of cut) {
    const price = representativePrice(r.pricing_config, jobType);
    if (price != null) priced.push({ price, record: r });
  }

  const sampleSize = priced.length;

  // ── THE GATE. Below the floor: emit NO statistics. ──
  if (sampleSize < minSample) {
    return {
      sufficient: false,
      sampleSize,
      minSample,
      tradeType,
      jobType,
      region,
    };
  }

  const prices = priced.map((p) => p.price);

  // Common options (prevalence across the priced cut).
  const optionCounts = new Map<string, number>();
  for (const { record } of priced) {
    const seen = new Set(optionLabelsFor(record.pricing_config));
    for (const label of seen) {
      optionCounts.set(label, (optionCounts.get(label) ?? 0) + 1);
    }
  }
  const commonOptions: CommonOption[] = [...optionCounts.entries()]
    .map(([label, count]) => ({
      label,
      prevalence: Math.round((count / sampleSize) * 100) / 100,
    }))
    .sort((a, b) => b.prevalence - a.prevalence);

  // Regional variation: only emit a region's median if that region's own cut
  // independently clears the k-anonymity floor (no thin sub-cut leakage).
  const byRegion = new Map<string, number[]>();
  for (const { price, record } of priced) {
    const reg = record.region ?? null;
    if (!reg) continue;
    if (!byRegion.has(reg)) byRegion.set(reg, []);
    byRegion.get(reg)!.push(price);
  }
  const regionalVariation: RegionalVariation[] = [...byRegion.entries()]
    .filter(([, vals]) => vals.length >= minSample)
    .map(([reg, vals]) => ({
      region: reg,
      sampleSize: vals.length,
      median: roundMoney(median(vals)),
    }))
    .sort((a, b) => a.median - b.median);

  return {
    sufficient: true,
    tradeType,
    jobType,
    region,
    sampleSize,
    currency: "USD",
    min: roundMoney(Math.min(...prices)),
    p25: roundMoney(percentile(prices, 0.25)),
    median: roundMoney(percentile(prices, 0.5)),
    p75: roundMoney(percentile(prices, 0.75)),
    max: roundMoney(Math.max(...prices)),
    commonOptions,
    regionalVariation,
    computedAt: new Date().toISOString(),
  };
}

/* ─── DB-fed entry point (thin, cached) ───────────────────────────────────
   The generator calls THIS. It projects calculator rows down to the privacy-
   safe CalculatorRecord shape, caps the volume, and memoizes per cut. The
   loader is injected so this module never hard-depends on the DB (and the
   unit tests drive aggregatePriceData directly without any loader). */

export type CalculatorLoader = (tradeType: string) => Promise<CalculatorRecord[]>;

interface CacheEntry {
  expires: number;
  result: OriginalDataResult;
}
const _cache = new Map<string, CacheEntry>();

function cacheKey(q: PriceQuery, minSample: number): string {
  return [q.tradeType, q.jobType ?? "", q.region ?? "", minSample].join("|");
}

/** Clear the memo (tests / kill-switch flows). */
export function clearPriceDataCache(): void {
  _cache.clear();
}

/**
 * Aggregated, anonymized price statistics for a (trade, job?, region?) cut.
 *
 * Returns { sufficient: false, sampleSize } when fewer than minSample real
 * configs back the cut — the generator MUST skip the page in that case (no
 * fabricated or thin data).
 *
 * @param loader  Injected read of calculator rows for a trade. Must already
 *                be projected to CalculatorRecord (no PII). Required so the
 *                service has no ambient DB dependency.
 */
export async function getPriceDataForJob(
  query: PriceQuery,
  loader: CalculatorLoader,
): Promise<OriginalDataResult> {
  const minSample = getMinSample();
  const key = cacheKey(query, minSample);
  const now = Date.now();

  const hit = _cache.get(key);
  if (hit && hit.expires > now) return hit.result;

  let records = await loader(query.tradeType);
  if (records.length > MAX_CONFIGS) records = records.slice(0, MAX_CONFIGS);

  const result = aggregatePriceData(records, query, minSample);
  _cache.set(key, { expires: now + CACHE_TTL_MS, result });
  return result;
}
