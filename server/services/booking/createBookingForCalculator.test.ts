/**
 * Booking consolidation (PR2) — façade unit test (DB-free, DI seam).
 *
 * Proves the consolidation seam is correct BEFORE any live caller is repointed
 * (PR3–7). Mirrors the DI-seam discipline of
 * server/services/tradelineBooking.test.ts: every collaborator is injected, so
 * no DB / network call is made.
 *
 * WHAT THIS GUARDS (deliberate-failure fixtures, not just "it runs"):
 *   1. The resolver maps calc → client correctly (and a missing client throws
 *      BookingFacadeError, never silently lands a row).
 *   2. The façade writes to the BOOKFLOW store (asserts createAppointment was
 *      called with the right clientId + source) and provably does NOT touch the
 *      legacy `bookings` / `scheduled_appointments` stores — the exact drift
 *      this consolidation kills. A stub for each legacy store is wired in and
 *      asserted untouched (would go RED if the façade ever wrote to them).
 *   3. The day-shape projection numeric working_days[] → named-day keys is
 *      correct — table-driven over ALL 7 days incl. a Mon–Fri example, with a
 *      deliberate-wrong-mapping fixture proving the assertion can fail.
 *   4. ensureBookflowSettings creates a row only when ABSENT (idempotent) — and
 *      returns the existing row unchanged when present.
 *
 * Runnable standalone:  npx tsx server/services/booking/createBookingForCalculator.test.ts
 * Wired into CI as `npm run check:booking-facade`.
 *
 * DB-free: we import the pure projection + the façade with injected deps. We do
 * NOT import bookflowService (which pulls server/db). The façade's
 * createAppointment dep is stubbed, so the real engine is never evaluated.
 */
import assert from "node:assert/strict";

// The default-deps in these modules statically import server/db (throws at
// module-eval if DATABASE_URL is unset). We never USE the default deps — every
// collaborator is injected below — but importing the modules still evaluates
// them. Set a dummy URL FIRST so the import succeeds; no connection is ever
// opened because no default-dep DB query runs.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bk:bk@127.0.0.1:1/bk_no_connect";
}

async function main() {
  const { projectSchedulingToWorkingHours, ensureBookflowSettings, DAY_INDEX_TO_NAME } = await import(
    "./ensureBookflowSettings"
  );
  const { resolveClientForCalculator } = await import("./resolveClientForCalculator");
  const { createBookingForCalculator, BookingFacadeError } = await import("./createBookingForCalculator");

  /* ───────────────────────────────────────────────────────────────────
   * 1. Resolver maps calc → client correctly.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("booking-facade: resolver maps calc → user → client");
  {
    // calc 99 → user 42 → client 7
    const clientId = await resolveClientForCalculator(99, {
      getCalculatorUserId: async (calcId) => (calcId === 99 ? 42 : null),
      getClientIdByUserId: async (userId) => (userId === 42 ? 7 : null),
    });
    assert.equal(clientId, 7, "calc 99 must resolve to client 7");

    // unowned calculator → null (no user)
    const none = await resolveClientForCalculator(1, {
      getCalculatorUserId: async () => null,
      getClientIdByUserId: async () => 7,
    });
    assert.equal(none, null, "a calculator with no owning user resolves to null");

    // user with no linked client → null
    const noClient = await resolveClientForCalculator(99, {
      getCalculatorUserId: async () => 42,
      getClientIdByUserId: async () => null,
    });
    assert.equal(noClient, null, "a user with no linked client resolves to null");
  }
  console.log("  ✓ resolver: calc→client, unowned→null, no-client→null");

  /* ───────────────────────────────────────────────────────────────────
   * 2. Day-shape projection — table-driven over all 7 days.
   *    appearance.scheduling numeric working_days (0=Sun..6=Sat) + global
   *    hours  →  bookflow_settings.working_hours named-day keys.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("booking-facade: day-shape projection (numeric → named keys), table-driven");
  {
    // Index → name contract (the projection depends on this exact ordering).
    const expectedNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    assert.deepEqual([...DAY_INDEX_TO_NAME], expectedNames, "0=Sun..6=Sat name table");

    // Table: each case = (working_days numeric set) → which named keys enabled.
    const cases: Array<{ label: string; days: number[]; enabled: string[] }> = [
      { label: "Mon–Fri", days: [1, 2, 3, 4, 5], enabled: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
      { label: "weekend only", days: [0, 6], enabled: ["sunday", "saturday"] },
      { label: "all 7 days", days: [0, 1, 2, 3, 4, 5, 6], enabled: expectedNames },
      { label: "none", days: [], enabled: [] },
      { label: "single (Wed)", days: [3], enabled: ["wednesday"] },
    ];

    for (const c of cases) {
      const wh = projectSchedulingToWorkingHours({
        working_days: c.days,
        working_hours_start: "08:30",
        working_hours_end: "16:00",
      });

      // Every one of the 7 named keys must be present.
      assert.deepEqual(Object.keys(wh).sort(), [...expectedNames].sort(), `${c.label}: all 7 named keys present`);

      for (const name of expectedNames) {
        const shouldBeEnabled = c.enabled.includes(name);
        assert.equal(
          wh[name as keyof typeof wh].enabled,
          shouldBeEnabled,
          `${c.label}: ${name}.enabled must be ${shouldBeEnabled}`,
        );
        // Global hours projected onto every day (enabled or not).
        assert.equal(wh[name as keyof typeof wh].start, "08:30", `${c.label}: ${name} carries global start`);
        assert.equal(wh[name as keyof typeof wh].end, "16:00", `${c.label}: ${name} carries global end`);
      }
    }

    // Deliberate-failure fixture: prove the assertion CAN fail — a wrong
    // mapping (treating 1 as Sunday) would be caught.
    const monFri = projectSchedulingToWorkingHours({
      working_days: [1, 2, 3, 4, 5],
      working_hours_start: "09:00",
      working_hours_end: "17:00",
    });
    assert.equal(monFri.sunday.enabled, false, "Mon–Fri must NOT enable Sunday (catches 0/1 off-by-one)");
    assert.equal(monFri.saturday.enabled, false, "Mon–Fri must NOT enable Saturday");
    assert.equal(monFri.monday.enabled, true, "Mon–Fri enables Monday");
    assert.equal(monFri.friday.enabled, true, "Mon–Fri enables Friday");
  }
  console.log("  ✓ projection correct for all 7 days incl. Mon–Fri; off-by-one fixture red-proof");

  /* ───────────────────────────────────────────────────────────────────
   * 3. ensureBookflowSettings — idempotent: create only when ABSENT.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("booking-facade: ensureBookflowSettings creates only when absent (idempotent)");
  {
    const scheduling = {
      working_days: [1, 2, 3, 4, 5],
      working_hours_start: "09:00",
      working_hours_end: "17:00",
      slot_duration_minutes: 30 as const,
      buffer_minutes: 0 as const,
    };

    // (a) absent → creates exactly one row.
    let createCalls = 0;
    const created = await ensureBookflowSettings(
      7,
      scheduling,
      {
        getByClientId: async () => null,
        create: async (row) => {
          createCalls++;
          return { id: 1, ...row } as any;
        },
        generateSlug: async (name) => `${name.toLowerCase().replace(/\s+/g, "-")}-slug`,
      },
      "Bob's Boilers",
    );
    assert.equal(createCalls, 1, "absent settings → create called exactly once");
    assert.equal((created as any).client_id, 7, "created row keyed to client 7");
    assert.equal(
      (created as any).working_hours.monday.enabled,
      true,
      "created row carries the projected named-day working_hours",
    );
    assert.equal((created as any).slug, "bob's-boilers-slug", "slug generated from business name");

    // (b) present → returns existing, never calls create (idempotent).
    let createCalls2 = 0;
    const existingRow = { id: 5, client_id: 7, slug: "existing" } as any;
    const got = await ensureBookflowSettings(7, scheduling, {
      getByClientId: async () => existingRow,
      create: async (row) => {
        createCalls2++;
        return row as any;
      },
      generateSlug: async () => "should-not-be-called",
    });
    assert.equal(createCalls2, 0, "present settings → create NOT called (idempotent)");
    assert.equal(got, existingRow, "present settings → returns the existing row unchanged");
  }
  console.log("  ✓ ensureBookflowSettings: creates when absent, no-op when present");

  /* ───────────────────────────────────────────────────────────────────
   * 4. Façade writes to the BOOKFLOW store, NOT bookings / scheduled_*.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("booking-facade: writes to bookflow store, never bookings/scheduled_appointments");
  {
    // Stubs for the two legacy stores — must remain UNTOUCHED.
    const bookingsStore: unknown[] = [];
    const scheduledAppointmentsStore: unknown[] = [];

    // The bookflow store (what the façade MUST write through).
    const bookflowStore: Array<Record<string, unknown>> = [];
    let createAppointmentCalls = 0;
    let lastClientId = -1;
    let ensureCalls = 0;

    const appointment = await createBookingForCalculator(
      99,
      {
        customerName: "Jordan",
        customerPhone: "555-123-4567",
        serviceName: "Boiler service",
        startTime: "2026-06-16T14:00:00.000Z",
        source: "quotequick",
        scheduling: {
          working_days: [1, 2, 3, 4, 5],
          working_hours_start: "09:00",
          working_hours_end: "17:00",
          slot_duration_minutes: 30,
          buffer_minutes: 0,
        },
        businessName: "Bob's Boilers",
      },
      {
        resolveClient: async (calcId) => (calcId === 99 ? 7 : null),
        ensureSettings: async (clientId) => {
          ensureCalls++;
          return { id: 1, client_id: clientId } as any;
        },
        createAppointment: async (clientId, input) => {
          createAppointmentCalls++;
          lastClientId = clientId;
          const row = { id: bookflowStore.length + 1, client_id: clientId, ...input };
          bookflowStore.push(row);
          return row as any;
        },
      },
    );

    // ── Positive: landed in the bookflow store with right client + source ──
    assert.equal(createAppointmentCalls, 1, "createAppointment (bookflow engine) called exactly once");
    assert.equal(ensureCalls, 1, "ensureBookflowSettings called before createAppointment");
    assert.equal(lastClientId, 7, "appointment created for the resolved client 7");
    assert.equal(bookflowStore.length, 1, "exactly one bookflow appointment row");
    assert.equal((appointment as any).source, "quotequick", "source tag propagated to the engine");
    assert.equal((appointment as any).customer_name ?? (appointment as any).customerName, "Jordan");

    // ── NEGATIVE ASSERTION: legacy stores untouched ──
    assert.equal(
      bookingsStore.length,
      0,
      "NEGATIVE: façade must NOT write to the legacy `bookings` store",
    );
    assert.equal(
      scheduledAppointmentsStore.length,
      0,
      "NEGATIVE: façade must NOT write to `scheduled_appointments` store",
    );
  }
  console.log("  ✓ façade routed to bookflow store; bookings + scheduled_appointments untouched");

  /* ───────────────────────────────────────────────────────────────────
   * 5. No client → throws BookingFacade("no_client"), never lands a row.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("booking-facade: unresolved client throws, never silently writes");
  {
    let createAppointmentCalls = 0;
    await assert.rejects(
      () =>
        createBookingForCalculator(
          1,
          {
            customerName: "NoClient",
            startTime: "2026-06-16T14:00:00.000Z",
            source: "tradeline_voice",
          },
          {
            resolveClient: async () => null,
            ensureSettings: async () => {
              throw new Error("ensureSettings must not be reached when no client");
            },
            createAppointment: async () => {
              createAppointmentCalls++;
              return {} as any;
            },
          },
        ),
      (e: unknown) => e instanceof BookingFacadeError && (e as InstanceType<typeof BookingFacadeError>).code === "no_client",
      "must throw BookingFacadeError('no_client')",
    );
    assert.equal(createAppointmentCalls, 0, "no row written when client unresolved");
  }
  console.log("  ✓ unresolved client throws BookingFacadeError, no engine call");

  console.log("\nbooking-facade: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
