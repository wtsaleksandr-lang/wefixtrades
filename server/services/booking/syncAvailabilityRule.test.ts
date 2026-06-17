/**
 * Booking PR1 — availability-rule projection guard.
 *
 * THE BUG THIS GUARDS (verified-CRITICAL): the QuoteQuick wizard "Online
 * booking" toggle persists `settings.scheduling` flattened into
 * `calculator_settings.appearance.scheduling`, but `widgetSchedulingRoutes.ts`
 * reads the `availability_rules` TABLE — which nothing ever wrote. With no row
 * it falls back to `DEFAULT_RULE { enabled:false }` and live customers see NO
 * slots. `upsertAvailabilityRuleFromSettings` is the missing write path.
 *
 * WHAT THIS TEST PROVES (the fix is real, not cosmetic):
 *   Case A — scheduling.enabled=true with specific days/hours/slot length →
 *     the injected DB writer is CALLED with an upsert carrying enabled:true and
 *     the configured working_days / hours / slot length. This is a
 *     NEGATIVE-capable assertion: on today's code (where NOTHING writes
 *     availability_rules) the writer is never called → red. With the fix it is
 *     called exactly once with the projected row → green.
 *   Case B — scheduling.enabled=false → upserts enabled:FALSE (not merely
 *     absent), so toggling booking off persists the disabled state instead of
 *     leaving a stale enabled:true row.
 *   Case C — scheduling absent → no write at all (nothing to sync).
 *
 * Runnable standalone:  npx tsx server/services/booking/syncAvailabilityRule.test.ts
 * Wired into CI as `npm run check:availability-sync`.
 *
 * DB-free: syncAvailabilityRule transitively imports server/db (throws at
 * module-eval if DATABASE_URL is unset). We set a dummy URL FIRST, THEN
 * dynamically import. The real DB writer is never reached — we inject a
 * recording stub via the `deps` seam (mirrors tradelineBooking.test.ts).
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

// Must run before importing the service (which transitively pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://av:av@127.0.0.1:1/av_no_connect";
}

async function main() {
  const { upsertAvailabilityRuleFromSettings } = await import("./syncAvailabilityRule");
  type Upsert = Parameters<
    NonNullable<Parameters<typeof upsertAvailabilityRuleFromSettings>[2]>["upsert"]
  >[0];

  /* ── Recording DB-writer stub (the DI seam) ── */
  const writes: Upsert[] = [];
  const recordingDeps = {
    upsert: async (row: Upsert) => {
      writes.push(row);
    },
  };

  /* ── Case A: enabled=true with specific config → writer CALLED with it ── */
  console.log("availability-sync: enabled toggle projects into an availability_rules upsert");
  const schedulingOn = {
    enabled: true,
    working_days: [1, 3, 5], // Mon / Wed / Fri
    working_hours_start: "08:30",
    working_hours_end: "16:00",
    slot_duration_minutes: 45,
    buffer_minutes: 15,
  };

  const writesBefore = writes.length;
  const projected = await upsertAvailabilityRuleFromSettings(101, schedulingOn, recordingDeps);

  // NEGATIVE-ASSERTION: on today's code NOTHING writes availability_rules, so
  // the writer is never called and this is red. The fix makes it green.
  assert.equal(
    writes.length,
    writesBefore + 1,
    `NEGATIVE-ASSERTION: the availability-rule writer was never called (writes=${writes.length}). ` +
      "Today nothing projects appearance.scheduling into availability_rules — this is the exact dead-toggle bug.",
  );

  const rowA = writes[writes.length - 1];
  assert.equal(rowA.calculator_id, 101, "upsert is keyed on the calculator id");
  assert.equal(rowA.enabled, true, "an enabled toggle upserts enabled:true");
  assert.deepEqual(
    rowA.working_days,
    [1, 3, 5],
    "working_days carry through as the same numeric shape (no re-mapping)",
  );
  assert.equal(rowA.working_hours_start, "08:30", "working_hours_start carries through");
  assert.equal(rowA.working_hours_end, "16:00", "working_hours_end carries through");
  assert.equal(rowA.slot_duration_minutes, 45, "slot length carries through");
  assert.equal(rowA.buffer_minutes, 15, "buffer carries through");
  // The function also returns the projected row for callers that want it.
  assert.ok(projected && projected.enabled === true, "returns the projected row");
  console.log("  ✓ enabled scheduling projected onto an upsert with the configured days/hours/slot");

  /* ── Case B: enabled=false → upserts enabled:FALSE (not absent) ── */
  console.log("availability-sync: disabling booking persists enabled:false (not a stale enabled:true row)");
  const writesBeforeB = writes.length;
  await upsertAvailabilityRuleFromSettings(101, {
    enabled: false,
    working_days: [1, 2, 3, 4, 5],
    working_hours_start: "09:00",
    working_hours_end: "17:00",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
  }, recordingDeps);

  assert.equal(writes.length, writesBeforeB + 1, "disabling still issues an upsert");
  const rowB = writes[writes.length - 1];
  assert.equal(
    rowB.enabled,
    false,
    "a disabled toggle upserts enabled:FALSE so the picker stops showing slots",
  );
  console.log("  ✓ disabled scheduling persists enabled:false");

  /* ── Case C: absent scheduling → no write ── */
  console.log("availability-sync: absent scheduling is a no-op (nothing to sync)");
  const writesBeforeC = writes.length;
  const noneResult = await upsertAvailabilityRuleFromSettings(101, undefined, recordingDeps);
  assert.equal(writes.length, writesBeforeC, "no scheduling blob → no upsert");
  assert.equal(noneResult, null, "returns null when there is nothing to sync");
  console.log("  ✓ absent scheduling performed no write");

  console.log("\navailability-sync: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
