/**
 * Per-UTC-day call ledger for PUBLIC, anonymous tools that fan out into the
 * SERP orchestrator.
 *
 * WHY
 * ---
 * The orchestrator's default-deny cost gate (`allowPaidProviders`) already
 * makes an anonymous request incapable of spending money. What it does NOT
 * bound is the shared FREE pool: combined free `google_maps` capacity is only
 * ~2,600 queries/month (serper 2,500 + scaleserp 100), and MapGuard
 * monitoring, the audit report and the map snapshot all draw from it. One
 * public lead-magnet fanning out 50 calls per submit can drain a month of
 * that pool in an afternoon and leave the paying features unable to measure
 * anything.
 *
 * So each public tool gets a named daily slice, not the pool. Points beyond
 * the granted budget are reported "unavailable" — never estimated, never
 * filled in from a neighbouring cell. Same evidence discipline as
 * server/lib/localRankMeasurement.ts, which carries its own dedicated ledger
 * for the map-snapshot path.
 *
 * In-memory and per-process, matching the existing `rateOk` limiter in
 * server/routes/freeToolsRoutes.ts. With N app instances the effective
 * ceiling is N × the budget — still bounded, still $0.
 */

interface Ledger {
  day: string;
  spent: number;
}

const ledgers: Map<string, Ledger> = new Map();

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function ledgerFor(bucket: string, now: number): Ledger {
  const day = utcDay(now);
  let entry = ledgers.get(bucket);
  if (!entry) {
    entry = { day, spent: 0 };
    ledgers.set(bucket, entry);
  } else if (entry.day !== day) {
    entry.day = day;
    entry.spent = 0;
  }
  return entry;
}

/** Calls this bucket may still make today. */
export function remainingDailyCalls(bucket: string, dailyBudget: number, now = Date.now()): number {
  const entry = ledgerFor(bucket, now);
  return Math.max(0, dailyBudget - entry.spent);
}

/**
 * Reserve up to `wanted` calls for `bucket`. Returns how many were actually
 * granted — possibly 0, possibly fewer than asked.
 *
 * The caller MUST treat every un-granted unit as "unavailable" (no number, no
 * estimate, excluded from every average/percentage), exactly as it treats a
 * provider error.
 */
export function reserveDailyCalls(
  bucket: string,
  dailyBudget: number,
  wanted: number,
  now = Date.now(),
): number {
  const entry = ledgerFor(bucket, now);
  const granted = Math.max(0, Math.min(Math.max(0, wanted), dailyBudget - entry.spent));
  entry.spent += granted;
  return granted;
}

/** Test-only: clear every bucket. */
export function __resetPublicSerpBudget(): void {
  ledgers.clear();
}
