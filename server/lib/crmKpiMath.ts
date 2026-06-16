/**
 * Pure CRM-KPI math helpers — no DB, no `this`, no side effects.
 *
 * Extracted so the period-over-period delta and churn-rate logic used by
 * storage.getCrmSubscriptionKpis() can be unit-tested without a database
 * (tests/crm-kpi-math.test.ts). Keep these byte-for-byte aligned with the
 * SQL aggregates that feed them.
 */

/**
 * Percent change of `cur` vs `prev`, rounded to a whole percent.
 *
 * Returns null when there is no prior-period baseline (`prev <= 0`) so the UI
 * can render "—" / "new" instead of a misleading "+100%" or a divide-by-zero.
 */
export function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Churn rate over a window = cancelled / (active + cancelled). Denominator is
 * "customers who could have churned" to avoid divide-by-zero and to produce a
 * meaningful ratio. Returns 0 when nobody was at risk.
 */
export function churnRate(cancelled: number, active: number): number {
  const denom = active + cancelled;
  if (denom <= 0) return 0;
  return cancelled / denom;
}
