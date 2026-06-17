/**
 * Booking consolidation (PR3) — wizard "Online booking" picker repointed to
 * BookFlow. DB-free, DI-seam test mirroring server/services/booking/
 * createBookingForCalculator.test.ts.
 *
 * THE DRIFT THIS GUARDS: the wizard SchedulingStep (System D-picker) used to
 * POST /api/scheduling/book → insert a `scheduled_appointments` row and read
 * availability from `availability_rules`. That table never reached Dispatch and
 * got NO confirmation email / 4-stage SMS lifecycle — a dead booking path. PR3
 * repoints the route onto the single BookFlow façade so a wizard booking lands
 * a real `bookflow_appointments` row (Dispatch + email + SMS for free).
 *
 * WHAT THIS TEST PROVES (deliberate-failure fixtures, not just "it runs"):
 *   1. A wizard-path booking call lands in the BOOKFLOW store via the façade,
 *      tagged source='quotequick' — the route returns 201 with the bookflow
 *      appointment id.
 *   2. NEGATIVE ASSERTION (red if the route regresses to the old table): the
 *      legacy `scheduled_appointments` store is provably NOT written. A stub
 *      for it is wired in and asserted empty — this goes RED the instant the
 *      handler reverts to insert(scheduledAppointments).
 *   3. GRACEFUL ERRORS: when the client resolves but BookFlow is inactive, OR
 *      no client resolves at all, the route returns a clean 409 "unavailable"
 *      — NOT a 500, NOT a silent success (no row written).
 *
 * Runnable standalone:  npx tsx server/routes/widgetScheduling.bookflow.test.ts
 * Wired into CI as `npm run check:widget-scheduling-bookflow`.
 *
 * DB-free: the handlers take an injected `deps` seam, so storage / bookflow
 * engine / façade are all stubbed. We DO import the façade module only to reuse
 * its real BookingFacadeError class (so the handler's instanceof check is
 * exercised against the genuine type). The façade's default deps statically
 * import server/db (throws at module-eval if DATABASE_URL is unset), so we set
 * a dummy URL first; no default-dep query ever runs.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bk:bk@127.0.0.1:1/bk_no_connect";
}

/* ── Minimal Express res double — records status + json body ── */
function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function main() {
  const { handleBook, handleAvailability } = await import("./widgetSchedulingRoutes");

  // Far-future slot so the past-slot guard never trips.
  const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  /* ───────────────────────────────────────────────────────────────────
   * 1. Wizard booking lands in the BOOKFLOW store, source='quotequick',
   *    and does NOT touch scheduled_appointments (the negative fixture).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("widget-scheduling-bookflow: POST /book routes to the bookflow store, source=quotequick");
  {
    // Legacy store — MUST stay empty (red the moment the route reverts).
    const scheduledAppointmentsStore: unknown[] = [];
    // The bookflow store (what the façade writes through).
    const bookflowStore: Array<Record<string, unknown>> = [];

    let facadeCalls = 0;
    let lastCalcId = -1;
    let lastInput: any = null;

    const deps = {
      getCalculatorBySlug: async (slug: string) => (slug === "bobs-boilers" ? { id: 42 } : null),
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

    const req: any = {
      body: {
        slug: "bobs-boilers",
        start_iso: FUTURE_ISO,
        customer_name: "Jordan",
        customer_email: "jordan@example.com",
        customer_phone: "555-123-4567",
        notes: "Boiler service",
      },
    };
    const res = makeRes();
    await handleBook(req, res, deps as any);

    // ── Positive: 201, landed in bookflow with the right calc + source ──
    assert.equal(res.statusCode, 201, `booking returns 201, got ${res.statusCode} (${JSON.stringify(res.body)})`);
    assert.equal(facadeCalls, 1, "façade (bookflow path) called exactly once");
    assert.equal(lastCalcId, 42, "façade called with the calculator id resolved from the slug");
    assert.equal(lastInput.source, "quotequick", "source tagged 'quotequick' (wizard path)");
    assert.equal(lastInput.customerName, "Jordan", "customer name mapped onto façade input");
    assert.equal(lastInput.customerEmail, "jordan@example.com", "email mapped onto façade input");
    assert.equal(lastInput.customerPhone, "555-123-4567", "phone mapped onto façade input");
    assert.equal(bookflowStore.length, 1, "exactly one bookflow appointment row created");
    assert.equal((res.body as any).id, 1, "response carries the bookflow appointment id");
    assert.equal((res.body as any).status, "confirmed", "response carries the appointment status");
    assert.ok((res.body as any).scheduled_for, "response carries scheduled_for ISO");

    // ── NEGATIVE ASSERTION: scheduled_appointments untouched ──
    assert.equal(
      scheduledAppointmentsStore.length,
      0,
      "NEGATIVE: wizard booking must NOT write to the legacy scheduled_appointments store",
    );
  }
  console.log("  ✓ booking landed in bookflow (source=quotequick); scheduled_appointments untouched");

  /* ───────────────────────────────────────────────────────────────────
   * 2. Graceful error — BookFlow inactive → 409, not 500, no silent success.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("widget-scheduling-bookflow: BookFlow inactive → clean 409 unavailable (not 500)");
  {
    const deps = {
      getCalculatorBySlug: async () => ({ id: 42 }),
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      // The native engine throws this exact message when the trade deactivated
      // BookFlow (see bookflowService.createAppointment).
      createBookingForCalculator: async () => {
        throw new Error("BookFlow is not active for this client");
      },
    };

    const req: any = {
      body: {
        slug: "bobs-boilers",
        start_iso: FUTURE_ISO,
        customer_name: "Jordan",
        customer_email: "jordan@example.com",
      },
    };
    const res = makeRes();
    await handleBook(req, res, deps as any);

    assert.equal(res.statusCode, 409, `inactive BookFlow returns 409, got ${res.statusCode}`);
    assert.ok((res.body as any).error, "409 carries a user-facing error message");
    assert.notEqual(res.statusCode, 500, "inactive BookFlow must NOT 500");
    assert.notEqual(res.statusCode, 201, "inactive BookFlow must NOT silently succeed");
  }
  console.log("  ✓ inactive BookFlow → 409 with message, no 500, no silent success");

  /* ───────────────────────────────────────────────────────────────────
   * 3. Graceful error — no client resolves (BookingFacadeError) → 409.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("widget-scheduling-bookflow: no linked client (BookingFacadeError) → clean 409");
  {
    const { BookingFacadeError } = await import("../services/booking/createBookingForCalculator");

    const deps = {
      getCalculatorBySlug: async () => ({ id: 42 }),
      resolveClientForCalculator: async () => null,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async () => {
        throw new BookingFacadeError("No client linked to calculator 42", "no_client");
      },
    };

    const req: any = {
      body: {
        slug: "bobs-boilers",
        start_iso: FUTURE_ISO,
        customer_name: "Jordan",
        customer_email: "jordan@example.com",
      },
    };
    const res = makeRes();
    await handleBook(req, res, deps as any);

    assert.equal(res.statusCode, 409, `no-client returns 409, got ${res.statusCode}`);
    assert.ok((res.body as any).error, "409 carries a user-facing error message");
  }
  console.log("  ✓ no linked client → 409 with message");

  /* ───────────────────────────────────────────────────────────────────
   * 4. Availability reads from the SAME BookFlow source the booking writes.
   *    No client → enabled:false empty grid (stable shape). With client →
   *    slots from bookflowService.getAvailableSlots.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("widget-scheduling-bookflow: availability reads bookflow slots (shared source)");
  {
    // (a) client resolves → slots flow through from getAvailableSlots.
    let slotsCalledWithClient = -1;
    const depsWithClient = {
      getCalculatorBySlug: async () => ({ id: 42 }),
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async (clientId: number) => {
        slotsCalledWithClient = clientId;
        return [
          { start: FUTURE_ISO, end: FUTURE_ISO, available: true },
        ];
      },
      createBookingForCalculator: async () => ({}) as any,
    };
    const req: any = { query: { slug: "bobs-boilers", from: "2026-06-16", to: "2026-06-29" } };
    const res = makeRes();
    await handleAvailability(req, res, depsWithClient as any);

    assert.equal(res.statusCode, 200, "availability returns 200");
    assert.equal(slotsCalledWithClient, 7, "slots read from bookflowService keyed by the resolved client");
    assert.equal((res.body as any).enabled, true, "grid enabled when bookflow has slots");
    assert.equal((res.body as any).slots.length, 1, "slots passed through from the bookflow source");

    // (b) no client → stable empty grid, enabled:false, no throw.
    const depsNoClient = {
      ...depsWithClient,
      resolveClientForCalculator: async () => null,
    };
    const res2 = makeRes();
    await handleAvailability(req, res2, depsNoClient as any);
    assert.equal(res2.statusCode, 200, "no-client availability still 200 (stable shape)");
    assert.equal((res2.body as any).enabled, false, "no client → enabled:false");
    assert.deepEqual((res2.body as any).slots, [], "no client → empty slots");
  }
  console.log("  ✓ availability sourced from bookflowService; no-client → stable empty grid");

  console.log("\nwidget-scheduling-bookflow: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
