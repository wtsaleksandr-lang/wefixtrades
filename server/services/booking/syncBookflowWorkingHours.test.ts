/**
 * Booking P0 fix — bookflow_settings.working_hours sync guard.
 *
 * THE BUG THIS GUARDS (audit P0-A, verified-CRITICAL): the live slot picker +
 * QuoteQuick copilot read available slots from `bookflow_settings.working_hours`
 * (via `bookflowService.getAvailableSlots`). That row is provisioned ONCE,
 * lazily, by `ensureBookflowSettings` — which early-returns when a row exists
 * and NEVER updates `working_hours`. So owner edits in the wizard ActionTab
 * (`appearance.scheduling`) never reach the table the picker reads → customers
 * see the WRONG/frozen slots (and the first provision is a hardcoded Mon–Fri
 * 9–5). `syncBookflowWorkingHours` is the missing UPSERT write path.
 *
 * WHAT THIS TEST PROVES (the fix is real, not lazy-once):
 *   Case A — scheduling.enabled=true with specific days/hours → the injected
 *     writer is CALLED with the correctly-projected named-day working_hours
 *     (Mon/Wed/Fri 08:30–16:00) + slot/buffer. NEGATIVE-capable: nothing wrote
 *     bookflow_settings from wizard hours before → red; the fix → green.
 *   Case B (DELIBERATE-FAILURE) — when a row ALREADY exists, the writer must
 *     UPDATE it (not skip). The recording writer reports update-vs-insert; we
 *     assert an UPDATE happened. A lazy-once implementation (return existing,
 *     never write) would never call the writer → red. This is the exact
 *     "frozen snapshot" bug the fix kills.
 *   Case C — the OTHER bookflow_settings fields are NOT clobbered: the upsert
 *     row carries ONLY working_hours / slot / buffer — never slug, is_active,
 *     deposit config, timezone, etc.
 *   Case D — enabled falsy / no client → no-op (no write at all).
 *
 * Runnable standalone:  npx tsx server/services/booking/syncBookflowWorkingHours.test.ts
 * Wired into CI as `npm run check:bookflow-hours-sync`.
 *
 * DB-free: the service transitively imports server/db (throws at module-eval if
 * DATABASE_URL is unset). We set a dummy URL FIRST, THEN dynamically import. The
 * real DB writer + resolver are never reached — we inject recording stubs via
 * the `deps` seam (mirrors syncAvailabilityRule.test.ts / tradelineBooking.test.ts).
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

// Must run before importing the service (which transitively pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bf:bf@127.0.0.1:1/bf_no_connect";
}

async function main() {
  const { syncBookflowWorkingHours } = await import("./syncBookflowWorkingHours");
  type Deps = NonNullable<Parameters<typeof syncBookflowWorkingHours>[2]>;
  type Upsert = Parameters<Deps["upsert"]>[0];

  /* ── Recording stubs (the DI seam). The writer can SIMULATE an existing row,
   *    returning true (updated) / false (inserted) — mirroring the real DB
   *    read-then-update-or-insert — so we can prove UPDATE-not-lazy-once. ── */
  function makeDeps(opts: {
    clientId: number | null;
    rowExists: boolean;
  }): { deps: Deps; writes: Upsert[]; resolved: number[]; lastWasUpdate: boolean | null } {
    const writes: Upsert[] = [];
    const resolved: number[] = [];
    const state = { lastWasUpdate: null as boolean | null };
    const deps: Deps = {
      resolveClient: async (calculatorId: number) => {
        resolved.push(calculatorId);
        return opts.clientId;
      },
      upsert: async (row: Upsert) => {
        writes.push(row);
        state.lastWasUpdate = opts.rowExists; // true => UPDATE existing, false => INSERT
        return opts.rowExists;
      },
    };
    return {
      deps,
      writes,
      resolved,
      get lastWasUpdate() {
        return state.lastWasUpdate;
      },
    } as any;
  }

  /* ── Case A: enabled=true with specific config → writer CALLED with the
   *    correctly-projected named-day working_hours + slot/buffer. ── */
  console.log("bookflow-hours-sync: enabled wizard hours project into a bookflow_settings working_hours upsert");
  const ctxA = makeDeps({ clientId: 42, rowExists: false });
  const schedulingOn = {
    enabled: true,
    working_days: [1, 3, 5], // Mon / Wed / Fri
    working_hours_start: "08:30",
    working_hours_end: "16:00",
    slot_duration_minutes: 45,
    buffer_minutes: 10,
  };

  const projectedA = await syncBookflowWorkingHours(101, schedulingOn, ctxA.deps);

  assert.equal(
    ctxA.writes.length,
    1,
    "NEGATIVE-ASSERTION: nothing projected wizard hours into bookflow_settings " +
      "(writes=" + ctxA.writes.length + "). That is the exact frozen-picker bug — the live " +
      "picker reads bookflow_settings.working_hours, which lazy-once provisioning never updates.",
  );
  const rowA = ctxA.writes[0];
  assert.equal(rowA.client_id, 42, "upsert is keyed on the resolved client id, not the calculator id");
  assert.deepEqual(rowA.working_hours.monday, { enabled: true, start: "08:30", end: "16:00" }, "Monday projected enabled 08:30–16:00");
  assert.deepEqual(rowA.working_hours.wednesday, { enabled: true, start: "08:30", end: "16:00" }, "Wednesday projected enabled 08:30–16:00");
  assert.deepEqual(rowA.working_hours.friday, { enabled: true, start: "08:30", end: "16:00" }, "Friday projected enabled 08:30–16:00");
  assert.equal(rowA.working_hours.tuesday.enabled, false, "Tuesday (not in working_days) projected disabled");
  assert.equal(rowA.working_hours.sunday.enabled, false, "Sunday (not in working_days) projected disabled");
  assert.equal(rowA.working_hours.saturday.enabled, false, "Saturday (not in working_days) projected disabled");
  assert.equal(rowA.slot_duration_minutes, 45, "slot length carries through onto bookflow_settings");
  assert.equal(rowA.buffer_minutes, 10, "buffer carries through onto bookflow_settings");
  assert.ok(projectedA && projectedA.client_id === 42, "returns the projected upsert row");
  assert.deepEqual(ctxA.resolved, [101], "resolved the client for the given calculator id exactly once");
  console.log("  ✓ enabled wizard hours projected onto a bookflow_settings working_hours upsert");

  /* ── Case B (DELIBERATE-FAILURE): an EXISTING row is UPDATED, not skipped ── */
  console.log("bookflow-hours-sync: an existing bookflow_settings row is UPDATED (not lazy-once frozen)");
  const ctxB = makeDeps({ clientId: 42, rowExists: true });
  await syncBookflowWorkingHours(101, schedulingOn, ctxB.deps);
  assert.equal(ctxB.writes.length, 1, "an existing row still issues an upsert — owner edits must propagate");
  assert.equal(
    ctxB.lastWasUpdate,
    true,
    "DELIBERATE-FAILURE GUARD: when a bookflow_settings row already exists the writer must UPDATE it " +
      "(not early-return like ensureBookflowSettings). A lazy-once implementation never writes → red. " +
      "This is the frozen-snapshot bug: the picker would keep serving stale hours forever.",
  );
  console.log("  ✓ existing row updated — wizard edits propagate, not frozen-once");

  /* ── Case C: the upsert touches ONLY working_hours / slot / buffer ── */
  console.log("bookflow-hours-sync: upsert does NOT clobber other bookflow_settings fields");
  const rowKeys = Object.keys(ctxA.writes[0]).sort();
  assert.deepEqual(
    rowKeys,
    ["buffer_minutes", "client_id", "slot_duration_minutes", "working_hours"],
    "the upsert row carries ONLY client_id + working_hours + slot + buffer — never slug, is_active, " +
      "deposit/payment config, timezone, services, auto_confirm, etc. (those are preserved on the existing row)",
  );
  console.log("  ✓ only working_hours / slot / buffer projected — other settings preserved");

  /* ── Case D: enabled falsy / absent / no client → no-op ── */
  console.log("bookflow-hours-sync: disabled / absent / no-client are no-ops");
  const ctxDisabled = makeDeps({ clientId: 42, rowExists: true });
  const disabledResult = await syncBookflowWorkingHours(101, { ...schedulingOn, enabled: false }, ctxDisabled.deps);
  assert.equal(ctxDisabled.writes.length, 0, "booking disabled → no write (we never touch the row)");
  assert.equal(disabledResult, null, "disabled scheduling returns null");

  const ctxAbsent = makeDeps({ clientId: 42, rowExists: true });
  const absentResult = await syncBookflowWorkingHours(101, undefined, ctxAbsent.deps);
  assert.equal(ctxAbsent.writes.length, 0, "absent scheduling → no write");
  assert.equal(absentResult, null, "absent scheduling returns null");

  const ctxNoClient = makeDeps({ clientId: null, rowExists: false });
  const noClientResult = await syncBookflowWorkingHours(101, schedulingOn, ctxNoClient.deps);
  assert.equal(ctxNoClient.writes.length, 0, "no client resolves → no write (graceful no-op, never a throw)");
  assert.equal(noClientResult, null, "unresolved client returns null");
  console.log("  ✓ disabled / absent / no-client all no-op gracefully");

  console.log("\nbookflow-hours-sync: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
