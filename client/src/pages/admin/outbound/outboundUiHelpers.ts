/**
 * Pure UI helpers for the outbound admin pages (Lane OC).
 *
 * Kept free of React imports so they're unit-testable with the repo's
 * standalone `npx tsx` test pattern (see outboundUiHelpers.test.ts).
 */

/* ─── Sending-domain pool (mirrors Lane OA's outreach_sending_domains) ─── */

export type SendingDomainStatus = "warming" | "active" | "paused" | "burned";

export interface SendingDomainRow {
  id: number | string;
  domain: string;
  status: SendingDomainStatus | string;
  warmup_started_at: string | null;
  daily_cap: number | null;
  bounce_rate: number | string | null;
  complaint_rate: number | string | null;
  pause_reason?: string | null;
}

/**
 * MERGE WIRING (Lane OA): GET /api/admin/outbound/sending is Lane OA's CRUD.
 * Until its exact list envelope is merged we accept the three plausible
 * shapes — a bare array, { data: [...] }, or { domains: [...] } — and
 * normalize to SendingDomainRow[]. Tightening to the final shape at merge
 * is a one-line change here.
 */
export function normalizeSendingRows(json: unknown): SendingDomainRow[] {
  if (Array.isArray(json)) return json as SendingDomainRow[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as SendingDomainRow[];
    if (Array.isArray(o.domains)) return o.domains as SendingDomainRow[];
  }
  return [];
}

/** Whole days since warmup started; null when warmup hasn't started. */
export function warmupAgeDays(warmupStartedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!warmupStartedAt) return null;
  const started = new Date(warmupStartedAt);
  if (Number.isNaN(started.getTime())) return null;
  const ms = now.getTime() - started.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Normalize a stored rate to PERCENT. Postgres decimals arrive as strings;
 * values ≤ 1 are treated as fractions (0.023 → 2.3%), values > 1 as already
 * percent (2.3 → 2.3%). Null/invalid → null.
 * MERGE WIRING (Lane OA): once the column's unit is confirmed, collapse
 * this to a single branch.
 */
export function ratePercent(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const n = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n <= 1 ? n * 100 : n;
  // Round away float noise (0.023 * 100 === 2.3000000000000003).
  return Math.round(pct * 1000) / 1000;
}

/** "2.3%" / "—" display string for a stored rate. */
export function formatRate(rate: number | string | null | undefined): string {
  const pct = ratePercent(rate);
  if (pct === null) return "—";
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, "")}%`;
}

export type RateSeverity = "ok" | "warn" | "critical";

/** Severity against warn/critical thresholds (all in percent). */
export function rateSeverity(rate: number | string | null | undefined, warnAt: number, criticalAt: number): RateSeverity {
  const pct = ratePercent(rate);
  if (pct === null) return "ok";
  if (pct >= criticalAt) return "critical";
  if (pct >= warnAt) return "warn";
  return "ok";
}

/** Industry-standard cold-email health thresholds (percent). */
export const BOUNCE_WARN_PCT = 2;
export const BOUNCE_CRITICAL_PCT = 5;
export const COMPLAINT_WARN_PCT = 0.1;
export const COMPLAINT_CRITICAL_PCT = 0.3;

/** Count rows per status for the pool-health summary strip. */
export function statusCounts(rows: SendingDomainRow[]): Record<SendingDomainStatus, number> {
  const counts: Record<SendingDomainStatus, number> = { warming: 0, active: 0, paused: 0, burned: 0 };
  for (const r of rows) {
    if (r.status === "warming" || r.status === "active" || r.status === "paused" || r.status === "burned") {
      counts[r.status] += 1;
    }
  }
  return counts;
}
