/**
 * Booking P0 fix — project the wizard's `appearance.scheduling` blob into
 * `bookflow_settings.working_hours` so the LIVE slot picker reflects the
 * owner's latest wizard hours.
 *
 * THE BUG THIS FIXES (audit P0-A): after the booking consolidation the wizard
 * "Online booking" picker + the QuoteQuick copilot read available slots from
 * `bookflow_settings.working_hours` (via `bookflowService.getAvailableSlots`).
 * But that row is provisioned ONCE, lazily, on the first booking by
 * `ensureBookflowSettings` — which early-returns when a row already exists and
 * NEVER updates `working_hours`. So the owner edits hours in the wizard
 * ActionTab (`settings.scheduling` → `calculator_settings.appearance.scheduling`,
 * mirrored into `availability_rules` by PR1), but the live picker keeps serving
 * the frozen/hardcoded snapshot → customers see the WRONG slots.
 *
 * This service is the missing write path for the table the picker actually
 * reads. It is the ANALOGUE of `syncAvailabilityRule.ts` (PR1) but targets
 * `bookflow_settings` instead of `availability_rules`. On calculator
 * create/update we resolve calculator → client and UPSERT the
 * `working_hours` (+ slot length / buffer, which live on `bookflow_settings`)
 * projected from the scheduling blob — so owner edits propagate, NOT lazy-once.
 *
 * CONSERVATIVE by design:
 *   - Only syncs when `scheduling.enabled` is truthy (the owner is using wizard
 *     booking). Otherwise no-op — we never touch a row the wizard owner isn't
 *     driving.
 *   - When no client resolves, no-op gracefully (no calculator, or no linked
 *     client).
 *   - On an EXISTING row we UPDATE only `working_hours` / `slot_duration_minutes`
 *     / `buffer_minutes`. Every other field (slug, is_active, deposit/payment
 *     config, timezone, services, auto_confirm, …) is preserved untouched. We
 *     never clobber a standalone-portal-configured row's other settings.
 *
 * SHAPE: `appearance.scheduling` stores numeric `working_days` (0=Sun..6=Sat) +
 * a single global start/end; `bookflow_settings.working_hours` stores named-day
 * keys. We reuse the EXISTING `projectSchedulingToWorkingHours` projection from
 * `ensureBookflowSettings.ts` so both provision and sync agree on the shape.
 *
 * DB-free unit-testable: data access is injected via `deps` (mirrors the DI
 * seam in `syncAvailabilityRule.ts` / `resolveClientForCalculator.ts`).
 */
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { bookflowSettings } from "@shared/schema";
import {
  projectSchedulingToWorkingHours,
  type NamedWorkingHours,
} from "./ensureBookflowSettings";
import {
  resolveClientForCalculator,
  type ResolveClientDeps,
} from "./resolveClientForCalculator";
import type { SchedulingSettings } from "./syncAvailabilityRule";

/** The fields we project onto `bookflow_settings` for a wizard-driven owner. */
export interface BookflowWorkingHoursUpsert {
  client_id: number;
  working_hours: NamedWorkingHours;
  slot_duration_minutes: number;
  buffer_minutes: number;
}

/**
 * The DB seam: given the resolved client + projected working hours, UPDATE the
 * existing `bookflow_settings` row's working_hours (+ slot/buffer), or INSERT a
 * minimal row when none exists. Tests inject a recording stub instead.
 *
 * Returns `true` when an existing row was UPDATED, `false` when a new row was
 * inserted — so callers/tests can prove this is NOT lazy-once.
 */
export type BookflowWorkingHoursWriter = (
  row: BookflowWorkingHoursUpsert,
) => Promise<boolean>;

export interface SyncBookflowWorkingHoursDeps {
  /** Resolve calculator → owning client id. Reuses the shared resolver. */
  resolveClient: (calculatorId: number) => Promise<number | null>;
  /** Upsert working_hours (+ slot/buffer) for the resolved client. */
  upsert: BookflowWorkingHoursWriter;
}

/** Column defaults — mirror the `bookflow_settings` schema defaults so a
 *  scheduling blob with missing slot/buffer still produces complete values. */
const SLOT_DEFAULT = 60;
const BUFFER_DEFAULT = 15;

/**
 * Real DB upsert. We UPDATE only `working_hours` / `slot_duration_minutes` /
 * `buffer_minutes` on an existing row so the owner's other BookFlow config
 * (slug, is_active, deposit/payment, timezone, services, …) is preserved.
 *
 * `bookflow_settings.client_id` is UNIQUE; we read-then-update-or-insert
 * (rather than `onConflictDoUpdate`) to keep the update SET list scoped to
 * exactly the three fields — never touching the rest of the row.
 */
const realUpsert: BookflowWorkingHoursWriter = async (row) => {
  const [existing] = await db
    .select({ id: bookflowSettings.id })
    .from(bookflowSettings)
    .where(eq(bookflowSettings.client_id, row.client_id))
    .limit(1);

  if (existing) {
    await db
      .update(bookflowSettings)
      .set({
        working_hours: row.working_hours,
        slot_duration_minutes: row.slot_duration_minutes,
        buffer_minutes: row.buffer_minutes,
        updated_at: new Date(),
      })
      .where(eq(bookflowSettings.id, existing.id));
    return true;
  }

  await db.insert(bookflowSettings).values({
    client_id: row.client_id,
    working_hours: row.working_hours,
    slot_duration_minutes: row.slot_duration_minutes,
    buffer_minutes: row.buffer_minutes,
  });
  return false;
};

const defaultDeps: SyncBookflowWorkingHoursDeps = {
  resolveClient: (calculatorId: number) =>
    resolveClientForCalculator(calculatorId),
  upsert: realUpsert,
};

/**
 * Allow callers/tests to swap the resolver's own DI seam (for fully DB-free
 * tests) while keeping the default real resolver in production.
 */
export function makeDeps(
  resolveDeps: ResolveClientDeps,
  upsert: BookflowWorkingHoursWriter,
): SyncBookflowWorkingHoursDeps {
  return {
    resolveClient: (calculatorId: number) =>
      resolveClientForCalculator(calculatorId, resolveDeps),
    upsert,
  };
}

/**
 * Project `appearance.scheduling` onto `bookflow_settings.working_hours` for the
 * client that owns `calculatorId`. This is what makes the live picker reflect
 * the owner's latest wizard hours.
 *
 * No-op (returns `null`) when:
 *   - `scheduling` is absent / not an object, or `scheduling.enabled` is falsy
 *     (the owner isn't driving wizard booking), or
 *   - no client resolves for the calculator (no calculator / no linked client).
 *
 * @param calculatorId  the calculator whose owner's hours we're syncing
 * @param scheduling    the `appearance.scheduling` blob (may be undefined)
 * @param deps          injectable seam (defaults to the real resolver + writer)
 * @returns the projected upsert that was written, or `null` when nothing synced.
 */
export async function syncBookflowWorkingHours(
  calculatorId: number,
  scheduling: SchedulingSettings | null | undefined,
  deps: SyncBookflowWorkingHoursDeps = defaultDeps,
): Promise<BookflowWorkingHoursUpsert | null> {
  if (!scheduling || typeof scheduling !== "object") return null;
  // CONSERVATIVE: only sync when the owner is using wizard booking. We never
  // touch the bookflow_settings row for a calculator that has booking off.
  if (scheduling.enabled !== true) return null;

  const clientId = await deps.resolveClient(calculatorId);
  if (!clientId) return null; // unresolved → no-op gracefully

  const working_hours = projectSchedulingToWorkingHours({
    working_days: scheduling.working_days ?? [],
    working_hours_start: scheduling.working_hours_start ?? "09:00",
    working_hours_end: scheduling.working_hours_end ?? "17:00",
  });

  const row: BookflowWorkingHoursUpsert = {
    client_id: clientId,
    working_hours,
    slot_duration_minutes:
      typeof scheduling.slot_duration_minutes === "number"
        ? scheduling.slot_duration_minutes
        : SLOT_DEFAULT,
    buffer_minutes:
      typeof scheduling.buffer_minutes === "number"
        ? scheduling.buffer_minutes
        : BUFFER_DEFAULT,
  };

  await deps.upsert(row);
  return row;
}
