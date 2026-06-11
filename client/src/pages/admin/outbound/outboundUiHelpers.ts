/**
 * Pure UI helpers for the outbound admin pages (Lane OC).
 *
 * Kept free of React imports so they're unit-testable with the repo's
 * standalone `npx tsx` test pattern (see outboundUiHelpers.test.ts).
 */

/* ─── Sending-domain pool (mirrors Lane OA's outreach_sending_domains) ─── */

export type SendingDomainStatus = "warming" | "active" | "paused" | "burned";

/** One row of Lane OA's outreach_sending_domains (shared/schemas/outreachSending.ts). */
export interface SendingDomainRow {
  id: number | string;
  domain: string;
  status: SendingDomainStatus | string;
  warmup_started_at: string | null;
  daily_cap: number | null;
  bounce_rate: number | string | null;
  complaint_rate: number | string | null;
  paused_reason?: string | null;
}

/**
 * GET /api/admin/outbound/sending-domains responds { domains: [...] }
 * (Lane OA, merged via PR #1663). The bare-array fallback is kept so a
 * future envelope simplification can't blank the page.
 */
export function normalizeSendingRows(json: unknown): SendingDomainRow[] {
  if (Array.isArray(json)) return json as SendingDomainRow[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
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
 * Normalize a stored rate to PERCENT. Lane OA's columns are `real` storing
 * FRACTIONS (0.03 = 3% — confirmed in shared/schemas/outreachSending.ts),
 * so we always multiply by 100. String input survives a driver/serializer
 * change. Null/invalid → null.
 */
export function ratePercent(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const n = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n * 100;
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

/* ─── Global send budget (Lane OB ramp, read via /api/admin/outbound/budget/status) ─── */

export interface BudgetStatus {
  first_real_send_at: string | null;
  /** Full weeks since the first real send (0 before/at week one). */
  ramp_week: number;
  /** Ramp-derived cap: 50 + week × 25. */
  ramp_cap: number;
  /** OUTBOUND_GLOBAL_DAILY_CAP when set and valid, else null. */
  env_cap: number | null;
  /** min(ramp_cap, env_cap) — what the workers actually enforce today. */
  effective_cap: number;
  sent_today: number;
  remaining: number;
}

/** Budget consumption as 0–100 (clamped) for the progress bar. */
export function budgetUsedPercent(status: Pick<BudgetStatus, "effective_cap" | "sent_today"> | null | undefined): number {
  if (!status || !Number.isFinite(status.effective_cap) || status.effective_cap <= 0) return 0;
  const pct = (status.sent_today / status.effective_cap) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/* ─── Consent-gate block codes (Lane OB outboundSafety contract) ─── */

/**
 * Human label for every block code OB emits (ConsentBlockCode ∪ PushBlockCode
 * in server/services/outboundSafety.ts). Unknown codes prettify rather than
 * disappear, so a new server code is never rendered as raw snake_case.
 */
export function humanizeBlockCode(code: string | null | undefined): string {
  switch (code) {
    case "blocked_confidence": return "Contact confidence below minimum";
    case "blocked_consent_expired": return "Implied consent expired (CASL 2-year window)";
    case "blocked_casl_no_basis": return "No valid CASL consent basis";
    case "blocked_dnc": return "Marked do-not-contact";
    case "blocked_blacklist": return "Blacklisted";
    case "blocked_unsubscribed": return "Unsubscribed";
    default:
      if (!code) return "Blocked";
      return code.replace(/^blocked_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}

/** Per-campaign blocked-reason aggregate row (GET /campaigns/:id/blocked-reasons). */
export interface BlockedReasonRow {
  code: string;
  count: number;
}

/** Total held-back contacts across all reasons. */
export function blockedTotal(rows: BlockedReasonRow[] | null | undefined): number {
  if (!rows) return 0;
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.count) ? r.count : 0), 0);
}
