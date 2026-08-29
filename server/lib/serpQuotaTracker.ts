/**
 * SERP provider quota tracker — Wave 6.5.
 *
 * In-memory monthly counter per provider, hydrated from `serp_quota_state`
 * on first read and persisted asynchronously (debounced) after each
 * successful call. The orchestrator queries `freeQuotaRemaining()` to decide
 * whether to skip a provider before the fetch.
 *
 * `freeQuotaRemaining()` reports FREE allowance only. A pay-as-you-go
 * provider (`MONTHLY_LIMIT <= 0`, see `isPayAsYouGo`) reports 0, not Infinity
 * — spending money is a separate, explicit decision made by the caller, not
 * something a quota number can grant.
 *
 * Roll-over is automatic: every call compares `resetAt` against the
 * current calendar month (UTC). If we've crossed into a new month, the
 * counter zeroes and `resetAt` advances to the first of the new month.
 *
 * Multi-instance deployments may briefly over-spend a provider's monthly
 * quota by a handful of calls; that's acceptable because the provider's
 * own 429 / quota response trips the per-provider error handling and
 * the orchestrator falls through to the next provider.
 *
 * Persistence is best-effort — a DB failure logs but does NOT propagate.
 * Worst case: counter resets to zero on the next restart and we burn a
 * few extra free-tier calls before the provider's own quota kicks in.
 */

import { db } from "../db";
import { serpQuotaState } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "./logger";

const log = createLogger("SerpQuotaTracker");

interface QuotaEntry {
  monthlyCount: number;
  monthlyLimit: number;
  resetAt: Date;
  lastUsedAt?: Date;
  lastError?: string;
  dirty: boolean;
}

const state: Map<string, QuotaEntry> = new Map();

/** Per-provider temporary cooldown (epoch ms until which the provider is
 *  skipped). Set when a provider signals credit/quota exhaustion (e.g. Serper
 *  "Not enough credits", any 429) so the orchestrator stops wasting a failing
 *  round-trip on that dead provider for every subsequent call. In-memory only
 *  — self-heals on restart or when the window elapses (credits refilled, or a
 *  higher-priority provider like Google CSE gets configured). */
const cooldowns: Map<string, number> = new Map();

let hydrated = false;
let persistTimer: NodeJS.Timeout | null = null;

const PERSIST_DEBOUNCE_MS = 5_000;

function firstOfNextMonthUtc(now = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // First day of (m+1).
  return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const rows = await db.select().from(serpQuotaState);
    const now = new Date();
    for (const row of rows) {
      const resetAt = row.reset_at ? new Date(row.reset_at) : firstOfNextMonthUtc(now);
      // If we're past reset_at, the persisted count is stale — start fresh.
      const expired = now.getTime() >= resetAt.getTime();
      state.set(row.id, {
        monthlyCount: expired ? 0 : row.monthly_count,
        monthlyLimit: row.monthly_limit,
        resetAt: expired ? firstOfNextMonthUtc(now) : resetAt,
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
        lastError: row.last_error ?? undefined,
        dirty: expired,
      });
    }
  } catch (err: any) {
    log.warn("[serp-quota] hydrate failed; starting empty", {
      error: err?.message ?? String(err),
    });
  }
}

function getOrInit(providerId: string, monthlyLimit: number): QuotaEntry {
  const existing = state.get(providerId);
  const now = new Date();
  if (!existing) {
    const entry: QuotaEntry = {
      monthlyCount: 0,
      monthlyLimit,
      resetAt: firstOfNextMonthUtc(now),
      dirty: false,
    };
    state.set(providerId, entry);
    return entry;
  }
  // Monthly rollover.
  if (now.getTime() >= existing.resetAt.getTime() || !sameMonth(existing.resetAt, firstOfNextMonthUtc(now))) {
    if (now.getTime() >= existing.resetAt.getTime()) {
      existing.monthlyCount = 0;
      existing.resetAt = firstOfNextMonthUtc(now);
      existing.dirty = true;
    }
  }
  // Update limit in case the provider registry changed.
  if (existing.monthlyLimit !== monthlyLimit) {
    existing.monthlyLimit = monthlyLimit;
    existing.dirty = true;
  }
  return existing;
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    const dirty: Array<[string, QuotaEntry]> = [];
    for (const [id, entry] of state.entries()) {
      if (entry.dirty) dirty.push([id, entry]);
    }
    if (dirty.length === 0) return;
    for (const [id, entry] of dirty) {
      try {
        await db
          .insert(serpQuotaState)
          .values({
            id,
            monthly_count: entry.monthlyCount,
            monthly_limit: entry.monthlyLimit,
            reset_at: entry.resetAt,
            last_used_at: entry.lastUsedAt ?? null,
            last_error: entry.lastError ?? null,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: serpQuotaState.id,
            set: {
              monthly_count: entry.monthlyCount,
              monthly_limit: entry.monthlyLimit,
              reset_at: entry.resetAt,
              last_used_at: entry.lastUsedAt ?? null,
              last_error: entry.lastError ?? null,
              updated_at: new Date(),
            },
          });
        entry.dirty = false;
      } catch (err: any) {
        log.warn("[serp-quota] persist failed", {
          provider: id,
          error: err?.message ?? String(err),
        });
      }
    }
  }, PERSIST_DEBOUNCE_MS);
  // Allow Node to exit cleanly — don't hold the event loop.
  if (typeof persistTimer.unref === "function") persistTimer.unref();
}

/** True if hydration completed at least once. Best-effort awaitable. */
export async function ensureHydrated(): Promise<void> {
  await hydrate();
}

/** Put a provider into a temporary cooldown so the orchestrator skips it on
 *  subsequent calls. Called when the provider signals credit/quota exhaustion
 *  (a hard, sticky failure) rather than a transient network error. */
export function markProviderCooldown(providerId: string, ms: number): void {
  cooldowns.set(providerId, Date.now() + ms);
}

/** True while a provider is inside its exhaustion cooldown window. Expired
 *  entries are cleaned up lazily so the provider is retried after the window. */
export function inCooldown(providerId: string): boolean {
  const until = cooldowns.get(providerId);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    cooldowns.delete(providerId);
    return false;
  }
  return true;
}

/**
 * Does this provider have a tracked FREE monthly allowance?
 *
 * A provider configured with `MONTHLY_LIMIT <= 0` has **no free allowance** —
 * it bills per call (pay-as-you-go). It does NOT have an unlimited one.
 *
 * This distinction used to be inverted: `quotaRemaining()` returned
 * `Infinity` for `monthlyLimit <= 0`, which made the orchestrator's
 * `remaining <= 0` gate structurally incapable of stopping the one provider
 * that costs money (DataForSEO). Every free provider was gated; the paid one
 * was not. See `isPayAsYouGo` + the cost gate in serpOrchestrator.ts.
 *
 * Default-deny on junk input: a NaN / undefined / negative limit is treated as
 * pay-as-you-go, so a mis-configured future provider is gated, not waved through.
 */
export function isPayAsYouGo(monthlyLimit: number): boolean {
  return !(Number.isFinite(monthlyLimit) && monthlyLimit > 0);
}

/**
 * Remaining FREE calls for the month.
 *
 * Returns 0 — never Infinity — for a pay-as-you-go provider: it has no free
 * allowance left because it never had one. Callers that legitimately want to
 * spend money must say so explicitly (`allowPaidProviders`), they must not
 * infer permission from an unbounded quota number.
 */
export function freeQuotaRemaining(providerId: string, monthlyLimit: number): number {
  const entry = getOrInit(providerId, monthlyLimit);
  if (isPayAsYouGo(entry.monthlyLimit)) return 0;
  return Math.max(0, entry.monthlyLimit - entry.monthlyCount);
}

/** Increment after a successful call. Persists async. */
export function recordSuccess(providerId: string, monthlyLimit: number): void {
  const entry = getOrInit(providerId, monthlyLimit);
  entry.monthlyCount += 1;
  entry.lastUsedAt = new Date();
  entry.lastError = undefined;
  entry.dirty = true;
  schedulePersist();
}

/** Record an error message (truncated). Does NOT increment count. */
export function recordError(providerId: string, monthlyLimit: number, message: string): void {
  const entry = getOrInit(providerId, monthlyLimit);
  entry.lastError = message.slice(0, 200);
  entry.dirty = true;
  schedulePersist();
}

export interface QuotaSnapshot {
  id: string;
  monthlyCount: number;
  monthlyLimit: number;
  resetAt: string;
  lastUsedAt?: string;
  lastError?: string;
}

/** Snapshot for the admin diagnostic endpoint. */
export function getSnapshot(): QuotaSnapshot[] {
  return Array.from(state.entries()).map(([id, entry]) => ({
    id,
    monthlyCount: entry.monthlyCount,
    monthlyLimit: entry.monthlyLimit,
    resetAt: entry.resetAt.toISOString(),
    lastUsedAt: entry.lastUsedAt?.toISOString(),
    lastError: entry.lastError,
  }));
}

/** Reset in-process state. Test-only. */
export function __resetQuotaTrackerState(): void {
  state.clear();
  cooldowns.clear();
  hydrated = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
