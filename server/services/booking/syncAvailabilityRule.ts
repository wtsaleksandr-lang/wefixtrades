/**
 * Booking PR1 — project the wizard's `appearance.scheduling` blob into the
 * `availability_rules` table so the live scheduling picker actually has a row
 * to read.
 *
 * THE BUG THIS FIXES: the QuoteQuick wizard "Online booking" toggle persists
 * `settings.scheduling` flattened into
 * `calculator_settings.appearance.scheduling` (a JSONB blob). But
 * `widgetSchedulingRoutes.ts` reads the `availability_rules` TABLE — which
 * nothing ever writes — so it falls back to `DEFAULT_RULE { enabled:false }`
 * and live customers see NO slots. This service is the missing write path: on
 * calculator create/update we upsert one `availability_rules` row per
 * calculator from the scheduling blob.
 *
 * The persisted `appearance.scheduling` shape (WizardShell.tsx flatten step) is
 * already snake_cased to match the table columns:
 *   { enabled, working_days, working_hours_start, working_hours_end,
 *     slot_duration_minutes, buffer_minutes }
 * so `working_days` (numeric 0=Sun..6=Sat) maps directly onto the
 * `availability_rules.working_days` jsonb column without re-shaping.
 *
 * `timezone` is NOT part of the scheduling blob, so we never overwrite it here
 * — on insert the column default applies; on update we leave the existing
 * tenant-chosen timezone untouched.
 *
 * The DB writer is injectable (`deps`) so this is unit-testable without a
 * database — mirrors the dependency-injection seam used in
 * `server/services/tradelineBooking.test.ts` / `bookingTools.ts`.
 */

import { db } from "../../db";
import { eq } from "drizzle-orm";
import { availabilityRules } from "@shared/schemas/db";

/** The scheduling blob as persisted under `appearance.scheduling`. */
export interface SchedulingSettings {
  enabled?: boolean;
  working_days?: number[];
  working_hours_start?: string; // "HH:MM"
  working_hours_end?: string; // "HH:MM"
  slot_duration_minutes?: number;
  buffer_minutes?: number;
}

/** The row values we project onto `availability_rules` (timezone omitted). */
export interface AvailabilityRuleUpsert {
  calculator_id: number;
  enabled: boolean;
  working_days: number[];
  working_hours_start: string;
  working_hours_end: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
}

/**
 * The DB seam: given the projected row, upsert it keyed on calculator_id.
 * The default implementation writes to the real `availability_rules` table;
 * tests inject a recording stub instead.
 */
export type AvailabilityRuleWriter = (
  row: AvailabilityRuleUpsert,
) => Promise<void>;

export interface SyncAvailabilityRuleDeps {
  upsert: AvailabilityRuleWriter;
}

/** Column defaults — mirror the `availability_rules` schema defaults so a
 *  scheduling blob with missing fields still produces a complete row. */
const DEFAULTS = {
  working_days: [1, 2, 3, 4, 5] as number[],
  working_hours_start: "09:00",
  working_hours_end: "17:00",
  slot_duration_minutes: 30,
  buffer_minutes: 0,
};

/**
 * Real DB upsert: insert a row for this calculator, or update the existing one
 * on conflict (the table has one row per calculator_id). `updated_at` is
 * stamped so we can tell when the projection last ran.
 *
 * NOTE: `availability_rules` has no unique constraint declared on
 * `calculator_id` in the schema, so we do a read-then-insert-or-update rather
 * than `onConflictDoUpdate` (which needs a unique/exclusion target).
 */
const realUpsert: AvailabilityRuleWriter = async (row) => {
  const [existing] = await db
    .select({ id: availabilityRules.id })
    .from(availabilityRules)
    .where(eq(availabilityRules.calculator_id, row.calculator_id))
    .limit(1);

  if (existing) {
    await db
      .update(availabilityRules)
      .set({
        enabled: row.enabled,
        working_days: row.working_days,
        working_hours_start: row.working_hours_start,
        working_hours_end: row.working_hours_end,
        slot_duration_minutes: row.slot_duration_minutes,
        buffer_minutes: row.buffer_minutes,
        updated_at: new Date(),
      })
      .where(eq(availabilityRules.id, existing.id));
  } else {
    await db.insert(availabilityRules).values({
      calculator_id: row.calculator_id,
      enabled: row.enabled,
      working_days: row.working_days,
      working_hours_start: row.working_hours_start,
      working_hours_end: row.working_hours_end,
      slot_duration_minutes: row.slot_duration_minutes,
      buffer_minutes: row.buffer_minutes,
    });
  }
};

const defaultDeps: SyncAvailabilityRuleDeps = { upsert: realUpsert };

/**
 * Project `appearance.scheduling` onto an `availability_rules` upsert for the
 * given calculator. `enabled` is written explicitly (true OR false) so that
 * toggling booking OFF persists `enabled:false` rather than leaving a stale
 * `enabled:true` row.
 *
 * @param calculatorId  the calculator the rule belongs to
 * @param scheduling    the `appearance.scheduling` blob (may be undefined)
 * @param deps          injectable DB seam (defaults to the real writer)
 * @returns the projected row that was upserted, or `null` when `scheduling`
 *          was absent (nothing to sync).
 */
export async function upsertAvailabilityRuleFromSettings(
  calculatorId: number,
  scheduling: SchedulingSettings | null | undefined,
  deps: SyncAvailabilityRuleDeps = defaultDeps,
): Promise<AvailabilityRuleUpsert | null> {
  if (!scheduling || typeof scheduling !== "object") return null;

  const row: AvailabilityRuleUpsert = {
    calculator_id: calculatorId,
    enabled: scheduling.enabled === true,
    working_days:
      Array.isArray(scheduling.working_days) && scheduling.working_days.length > 0
        ? scheduling.working_days
        : DEFAULTS.working_days,
    working_hours_start:
      scheduling.working_hours_start || DEFAULTS.working_hours_start,
    working_hours_end:
      scheduling.working_hours_end || DEFAULTS.working_hours_end,
    slot_duration_minutes:
      typeof scheduling.slot_duration_minutes === "number"
        ? scheduling.slot_duration_minutes
        : DEFAULTS.slot_duration_minutes,
    buffer_minutes:
      typeof scheduling.buffer_minutes === "number"
        ? scheduling.buffer_minutes
        : DEFAULTS.buffer_minutes,
  };

  await deps.upsert(row);
  return row;
}
