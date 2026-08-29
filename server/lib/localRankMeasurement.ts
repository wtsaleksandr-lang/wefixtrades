/**
 * Real local-pack rank measurement + the spend ceiling that makes it safe to
 * run from a public, anonymous page.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `server/routes/mapSnapshotRoutes.ts` used to invent its rank grid from a
 * seeded RNG (`baseRank = 1 + distanceKm * 2.5 + noise`), persist it, and
 * render an audit narrative written around the invented numbers. This module
 * replaces that with real measurements taken through the existing multi-
 * provider SERP orchestrator (`server/lib/serpOrchestrator.ts`) — no new
 * vendor, no new key.
 *
 * THE THREE OUTCOMES — never collapse them
 * ----------------------------------------
 * Mirrors the evidence discipline in `server/services/citationTracker/monitor.ts`
 * and the four-state `CitationStatus` in `server/routes/freeToolsRoutes.ts`:
 *
 *   a) "ranked"      — the provider answered and the business IS in the pack.
 *                      `rank` is a real position (1..MAX_TRACKED_RANK).
 *   b) "not-found"   — the provider answered cleanly and the business is NOT
 *                      in the pack. This is a genuine measurement (a real
 *                      dead zone) and `rank` is null.
 *   c) "unavailable" — we could not check at all (quota gone, provider error,
 *                      timeout). This tells us NOTHING. `rank` is null, and
 *                      the cell must render with NO number, be excluded from
 *                      every average/percentage, and never be counted as a
 *                      ranking gap.
 *
 * There is deliberately no fourth "estimated" state. If we did not measure it,
 * we do not show a number.
 *
 * THE SPEND CEILING
 * -----------------
 * Callers are anonymous visitors on a free public tool, so the endpoint must
 * be incapable of running up a bill:
 *
 *   1. `freeTierOnly: true` on every request — the orchestrator then skips
 *      pay-as-you-go providers (DataForSEO, whose MONTHLY_LIMIT is 0 and
 *      whose quotaRemaining() is therefore Infinity). This path can spend
 *      free-tier credit only. It can never spend money.
 *   2. One SERP call per grid point (`google_maps` only — the Local Pack is
 *      the only thing a "map rank" snapshot claims to show). The sibling
 *      /api/tools/local-rank-grid handler fires two per point; we do not.
 *   3. A process-wide daily call ledger (`DAILY_CALL_BUDGET`). Once spent,
 *      further points come back "unavailable" instead of queuing more calls.
 *   4. The orchestrator's own 1-hour LRU cache (keyed on query + lat/lng at
 *      4dp) absorbs repeats for free.
 *
 * Combined free `google_maps` capacity is ~2,600/month (serper 2,500 +
 * scaleserp 100), shared with MapGuard monitoring and the local-rank-grid
 * tool. DAILY_CALL_BUDGET is sized so this public tool cannot eat that pool.
 */

import { createLogger } from "./logger";
import { searchSerp } from "./serpOrchestrator";

const log = createLogger("LocalRankMeasurement");

/* ─── Public contract ───────────────────────────────────────────────── */

/**
 * Per-point check state. See the header for the full evidence rules.
 * `"unavailable"` is NOT a ranking signal — exclude it from every statistic.
 */
export type RankCellStatus = "ranked" | "not-found" | "unavailable";

/** Deepest Local Pack position we look for. Beyond this we report not-found. */
export const MAX_TRACKED_RANK = 20;

export interface MeasuredRank {
  status: RankCellStatus;
  /** Real measured position. Non-null ONLY when status === "ranked". */
  rank: number | null;
  /** Why the point could not be checked. Set only when "unavailable". */
  reason?: string;
}

/* ─── Name matching ─────────────────────────────────────────────────── */

/**
 * Case/punctuation-insensitive normalisation so "Joe's Plumbing" and
 * "Joes Plumbing" compare equal.
 *
 * Apostrophes are DELETED before the rest of the punctuation collapses to
 * spaces. The older copy of this helper in freeToolsRoutes.ts collapses them
 * too, turning "Joe's" into "joe s" while a typed "Joes" becomes "joes" — the
 * two then fail to match and the point is reported as "not-found". Under this
 * module's contract a false "not-found" is a false claim (we would tell a
 * business it does not rank somewhere it does), so the apostrophe is stripped
 * rather than spaced.
 */
export function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/['‘’ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function looseIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return normName(haystack).includes(normName(needle));
}

/**
 * Find a business's position in an ordered Local Pack list.
 *
 * Exported pure so the CI guard can exercise it without a DB or a network.
 * Returns a 1-based position, or null when the business genuinely is not
 * present — the caller decides whether that means "not-found" (we checked)
 * or "unavailable" (we didn't).
 */
export function findLocalPackPosition(
  pack: Array<{ title?: string; position?: number }>,
  businessName: string,
): number | null {
  for (let i = 0; i < pack.length && i < MAX_TRACKED_RANK; i++) {
    if (looseIncludes(pack[i]?.title || "", businessName)) {
      // Prefer the provider's own position when it supplied one; fall back to
      // array index. Providers that paginate can start above 1.
      const supplied = pack[i]?.position;
      return typeof supplied === "number" && supplied > 0 ? supplied : i + 1;
    }
  }
  return null;
}

/* ─── Daily spend ledger ────────────────────────────────────────────── */

/**
 * Hard ceiling on SERP calls this module may spend per UTC day, across all
 * visitors. ~2,600 free google_maps queries exist per month and other
 * features share them, so a public lead-gen tool gets a slice, not the pool:
 * 180/day ≈ 5,400/month of headroom requested, but `freeTierOnly` means the
 * real free quota binds first and the spend simply stops when it is gone.
 *
 * In-memory and per-process (same limitation the existing `rateOk` limiter
 * carries). With N app instances the effective ceiling is N × this — still
 * bounded, and still incapable of billing because of `freeTierOnly`.
 */
export const DAILY_CALL_BUDGET = 180;

let ledgerDay = "";
let ledgerSpent = 0;

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function rollLedger(now: number): void {
  const day = utcDay(now);
  if (day !== ledgerDay) {
    ledgerDay = day;
    ledgerSpent = 0;
  }
}

/** Remaining SERP calls this module may make today. */
export function remainingDailyBudget(now = Date.now()): number {
  rollLedger(now);
  return Math.max(0, DAILY_CALL_BUDGET - ledgerSpent);
}

/**
 * Reserve up to `wanted` calls. Returns how many were actually granted —
 * possibly 0, and possibly fewer than asked. The caller MUST treat every
 * un-granted point as "unavailable" rather than filling it in some other way.
 */
export function reserveCalls(wanted: number, now = Date.now()): number {
  rollLedger(now);
  const granted = Math.max(0, Math.min(wanted, DAILY_CALL_BUDGET - ledgerSpent));
  ledgerSpent += granted;
  return granted;
}

/** Test-only: reset the ledger between cases. */
export function __resetRankBudget(): void {
  ledgerDay = "";
  ledgerSpent = 0;
}

/* ─── Measurement ───────────────────────────────────────────────────── */

const UNAVAILABLE: MeasuredRank = { status: "unavailable", rank: null };

/**
 * Measure one grid point's Local Pack rank for real.
 *
 * Every failure mode returns `"unavailable"` — never a guess, never a
 * fallback number. A clean provider answer that simply does not contain the
 * business returns `"not-found"`, which IS a measurement.
 */
export async function measureLocalPackRank(args: {
  businessName: string;
  keyword: string;
  location?: string;
  lat: number;
  lng: number;
  country?: string;
  language?: string;
}): Promise<MeasuredRank> {
  const { businessName, keyword, location, lat, lng } = args;
  if (!businessName || !keyword) {
    return { ...UNAVAILABLE, reason: "missing business name or keyword" };
  }
  try {
    const res = await searchSerp({
      query: keyword,
      location,
      country: args.country ?? "us",
      language: args.language ?? "en",
      latitude: lat,
      longitude: lng,
      num: MAX_TRACKED_RANK,
      engine: "google_maps",
      // Cost ceiling — see the header. Anonymous visitors never reach a
      // pay-as-you-go provider through this path.
      freeTierOnly: true,
    });
    const pack = res.localPack ?? [];
    if (pack.length === 0) {
      // An empty pack is ambiguous: a provider that ignored our geo hint and
      // returned nothing looks identical to a genuinely empty result. We
      // refuse to read it as "you don't rank here".
      return { ...UNAVAILABLE, reason: "provider returned an empty local pack" };
    }
    const position = findLocalPackPosition(pack, businessName);
    if (position == null) {
      return { status: "not-found", rank: null };
    }
    return { status: "ranked", rank: position };
  } catch (err: any) {
    const reason = err?.message ? String(err.message).slice(0, 160) : "provider call failed";
    log.debug("[rank] point unavailable", { reason });
    return { ...UNAVAILABLE, reason };
  }
}

/**
 * Measure a whole grid, honouring the daily budget.
 *
 * Points are measured newest-budget-first in a deterministic order supplied by
 * the caller (centre-outward, so a partially-funded scan still describes the
 * business's immediate area). Points beyond the granted budget are returned
 * "unavailable" WITHOUT a provider call.
 */
export async function measureRankGrid<T extends { lat: number; lng: number }>(
  points: T[],
  args: { businessName: string; keyword: string; location?: string },
): Promise<Array<T & MeasuredRank>> {
  const granted = reserveCalls(points.length);
  if (granted < points.length) {
    log.warn("[rank] daily SERP budget limits this scan", {
      requested: points.length,
      granted,
    });
  }
  // Measure the funded prefix in parallel; everything past it is unavailable.
  const funded = points.slice(0, granted);
  const measured = await Promise.all(
    funded.map(async (pt) => ({
      ...pt,
      ...(await measureLocalPackRank({ ...args, lat: pt.lat, lng: pt.lng })),
    })),
  );
  const starved = points.slice(granted).map((pt) => ({
    ...pt,
    ...UNAVAILABLE,
    reason: "daily measurement budget for this free tool is spent",
  }));
  return [...measured, ...starved];
}
