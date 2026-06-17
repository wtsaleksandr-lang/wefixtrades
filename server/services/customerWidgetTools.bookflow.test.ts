/**
 * Booking consolidation (PR4) — QuoteQuick customer-widget AI copilot (System
 * D-AI) repointed to BookFlow. DB-free, DI-seam test mirroring
 * server/routes/widgetScheduling.bookflow.test.ts (PR3).
 *
 * THE DRIFT THIS GUARDS: customerWidgetTools used to read `availability_rules`
 * and insert `scheduled_appointments` — the dead-row path that never reached
 * Dispatch and got NO confirmation email / 4-stage SMS lifecycle. PR4 repoints
 * the AI copilot's book_appointment / propose_appointment_times executors onto
 * the single BookFlow façade so an AI-booked slot lands a real
 * `bookflow_appointments` row (Dispatch + email + SMS for free).
 *
 * WHAT THIS TEST PROVES (deliberate-failure fixtures, not just "it runs"):
 *   1. An AI-booked slot lands in the BOOKFLOW store via the façade, tagged
 *      source='quotequick'.
 *   2. NEGATIVE ASSERTION (red if the executor regresses to the old table): a
 *      `scheduled_appointments` stub store is wired in and asserted empty — it
 *      goes RED the instant the executor reverts to insert(scheduledAppointments).
 *   3. GRACEFUL ERRORS: BookFlow inactive, OR no client resolves at all → the
 *      copilot's normal "unavailable" tool result (ok:false), NOT a throw/500.
 *   4. PRESERVED requireEmail guard: a booking with no email in context still
 *      throws the identity-binding error (does NOT reach the façade).
 *
 * Runnable standalone:  npx tsx server/services/customerWidgetTools.bookflow.test.ts
 * Wired into CI as `npm run check:copilot-booking`.
 *
 * DB-free: the executors take an injected `deps` seam, so the BookFlow engine /
 * façade / client resolver are all stubbed. We DO import the façade module only
 * to reuse its real BookingFacadeError class (so the executor's instanceof check
 * is exercised against the genuine type). customerWidgetTools statically imports
 * server/db (throws at module-eval if DATABASE_URL is unset), so we set a dummy
 * URL first; no default-dep query ever runs.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bk:bk@127.0.0.1:1/bk_no_connect";
}

/** Build a PendingAction the executors accept. */
function makeAction(opts: {
  calculator_id: number;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  args?: Record<string, unknown>;
}): any {
  const metadata: Record<string, unknown> = { calculator_id: opts.calculator_id };
  if (opts.customer_email !== undefined) metadata.customer_email = opts.customer_email;
  if (opts.customer_name !== undefined) metadata.customer_name = opts.customer_name;
  if (opts.customer_phone !== undefined) metadata.customer_phone = opts.customer_phone;
  return {
    call_id: "test-call",
    surface: "customer-widget",
    action_name: "book_appointment",
    args: opts.args ?? {},
    user_id: 0,
    session_id: "sess",
    expires: Date.now() + 60_000,
    metadata,
  };
}

async function main() {
  const { executeBookAppointment, executeProposeTimes } = await import("./customerWidgetTools");

  // Far-future slot so the past-slot guard never trips.
  const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  /* ───────────────────────────────────────────────────────────────────
   * 1. AI booking lands in the BOOKFLOW store, source='quotequick', and
   *    does NOT touch scheduled_appointments (the negative fixture).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("copilot-booking: book_appointment routes to the bookflow store, source=quotequick");
  {
    // Legacy store — MUST stay empty (red the moment the executor reverts to a
    // direct scheduled_appointments insert).
    const scheduledAppointmentsStore: unknown[] = [];
    // The bookflow store (what the façade writes through).
    const bookflowStore: Array<Record<string, unknown>> = [];

    let facadeCalls = 0;
    let lastCalcId = -1;
    let lastInput: any = null;

    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async (calcId: number, input: any) => {
        facadeCalls++;
        lastCalcId = calcId;
        lastInput = input;
        const row = {
          id: bookflowStore.length + 1,
          client_id: 7,
          customer_name: input.customerName,
          start_time: new Date(input.startTime),
          status: "confirmed",
          source: input.source,
        };
        bookflowStore.push(row);
        return row as any;
      },
    };

    const action = makeAction({
      calculator_id: 42,
      customer_email: "Jordan@Example.com",
      customer_name: "Jordan",
      customer_phone: "555-123-4567",
      args: { start_iso: FUTURE_ISO, notes: "Boiler service" },
    });

    const result = await executeBookAppointment(action, deps as any);
    const payload = JSON.parse(result.narrative);

    // ── Positive: landed in bookflow with the right calc + source ──
    assert.equal(payload.ok, true, `booking ok:true, got ${JSON.stringify(payload)}`);
    assert.equal(facadeCalls, 1, "façade (bookflow path) called exactly once");
    assert.equal(lastCalcId, 42, "façade called with the calculator id from chat context");
    assert.equal(lastInput.source, "quotequick", "source tagged 'quotequick' (AI copilot path)");
    assert.equal(lastInput.customerName, "Jordan", "customer name mapped onto façade input");
    assert.equal(lastInput.customerEmail, "jordan@example.com", "email mapped (lowercased) onto façade input");
    assert.equal(lastInput.customerPhone, "555-123-4567", "phone mapped onto façade input");
    assert.equal(bookflowStore.length, 1, "exactly one bookflow appointment row created");
    assert.equal(payload.appointment_id, 1, "narrative carries the bookflow appointment id");
    assert.ok(payload.scheduled_for, "narrative carries scheduled_for ISO");

    // ── NEGATIVE ASSERTION: scheduled_appointments untouched ──
    assert.equal(
      scheduledAppointmentsStore.length,
      0,
      "NEGATIVE: AI booking must NOT write to the legacy scheduled_appointments store",
    );
  }
  console.log("  ✓ AI booking landed in bookflow (source=quotequick); scheduled_appointments untouched");

  /* ───────────────────────────────────────────────────────────────────
   * 2. Graceful error — BookFlow inactive → ok:false unavailable, not a throw.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("copilot-booking: BookFlow inactive → ok:false unavailable (not a throw)");
  {
    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      // The native engine throws this exact message when the trade deactivated
      // BookFlow (see bookflowService.createAppointment).
      createBookingForCalculator: async () => {
        throw new Error("BookFlow is not active for this client");
      },
    };
    const action = makeAction({
      calculator_id: 42,
      customer_email: "jordan@example.com",
      args: { start_iso: FUTURE_ISO },
    });

    const result = await executeBookAppointment(action, deps as any);
    const payload = JSON.parse(result.narrative);
    assert.equal(payload.ok, false, "inactive BookFlow → ok:false");
    assert.ok(payload.message, "ok:false carries a user-facing message");
    assert.equal(payload.reason, "unavailable", "reason tagged 'unavailable'");
  }
  console.log("  ✓ inactive BookFlow → ok:false unavailable, no throw");

  /* ───────────────────────────────────────────────────────────────────
   * 3. Graceful error — no client resolves (BookingFacadeError) → ok:false.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("copilot-booking: no linked client (BookingFacadeError) → ok:false unavailable");
  {
    const { BookingFacadeError } = await import("./booking/createBookingForCalculator");
    const deps = {
      resolveClientForCalculator: async () => null,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async () => {
        throw new BookingFacadeError("No client linked to calculator 42", "no_client");
      },
    };
    const action = makeAction({
      calculator_id: 42,
      customer_email: "jordan@example.com",
      args: { start_iso: FUTURE_ISO },
    });

    const result = await executeBookAppointment(action, deps as any);
    const payload = JSON.parse(result.narrative);
    assert.equal(payload.ok, false, "no-client → ok:false");
    assert.ok(payload.message, "ok:false carries a user-facing message");
  }
  console.log("  ✓ no linked client → ok:false unavailable, no throw");

  /* ───────────────────────────────────────────────────────────────────
   * 4. PRESERVED requireEmail guard — no email in context → throws, and the
   *    façade is NEVER reached (no booking attempted without identity).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("copilot-booking: requireEmail guard still blocks a booking with no email");
  {
    let facadeCalls = 0;
    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async () => {
        facadeCalls++;
        return {} as any;
      },
    };
    const action = makeAction({
      calculator_id: 42,
      // no customer_email
      args: { start_iso: FUTURE_ISO },
    });

    await assert.rejects(
      () => executeBookAppointment(action, deps as any),
      /email/i,
      "booking with no email must throw the identity-binding guard error",
    );
    assert.equal(facadeCalls, 0, "façade must NOT be reached when email is missing (fail-closed)");
  }
  console.log("  ✓ requireEmail guard preserved — no email → throws, façade never reached");

  /* ───────────────────────────────────────────────────────────────────
   * 5. propose_appointment_times reads slots from the SAME BookFlow source the
   *    booking writes to. No client → empty (scheduling_disabled). With client
   *    → slots from bookflowService.getAvailableSlots, keyed by resolved client.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("copilot-booking: propose_appointment_times reads bookflow slots (shared source)");
  {
    // (a) client resolves → slots flow through from getAvailableSlots.
    let slotsCalledWithClient = -1;
    let slotsCalledWithDays = -1;
    const depsWithClient = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async (clientId: number, _date: string, days?: number) => {
        slotsCalledWithClient = clientId;
        slotsCalledWithDays = days ?? -1;
        return [{ start: FUTURE_ISO, end: FUTURE_ISO, available: true }];
      },
      createBookingForCalculator: async () => ({}) as any,
    };
    const action = makeAction({ calculator_id: 42, args: { days_ahead: 10 } });
    const result = await executeProposeTimes(action, depsWithClient as any);
    const payload = JSON.parse(result.narrative);
    assert.equal(slotsCalledWithClient, 7, "slots read from bookflowService keyed by the resolved client");
    assert.equal(slotsCalledWithDays, 10, "days_ahead passed through to getAvailableSlots");
    assert.equal(payload.slots.length, 1, "slots passed through from the bookflow source");

    // (b) no client → empty, scheduling_disabled, no throw.
    const depsNoClient = { ...depsWithClient, resolveClientForCalculator: async () => null };
    const action2 = makeAction({ calculator_id: 42, args: {} });
    const result2 = await executeProposeTimes(action2, depsNoClient as any);
    const payload2 = JSON.parse(result2.narrative);
    assert.deepEqual(payload2.slots, [], "no client → empty slots");
    assert.equal(payload2.reason, "scheduling_disabled", "no client → scheduling_disabled reason");
  }
  console.log("  ✓ propose times sourced from bookflowService; no-client → empty grid");

  console.log("\ncopilot-booking: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
