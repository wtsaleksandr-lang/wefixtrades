/**
 * Booking consolidation (PR7) — legacy wizard BookingStep (System C-legacy)
 * repointed to BookFlow for the NON-DEPOSIT case. DB-free, DI-seam test
 * mirroring server/routes/widgetScheduling.bookflow.test.ts (PR3).
 *
 * THE DRIFT THIS GUARDS: the legacy wizard BookingStep used to POST
 * /api/bookings → storage.createBooking → the `bookings` table for EVERY
 * booking. That table never reached Dispatch and got NO confirmation email /
 * 4-stage SMS lifecycle. PR7 repoints the NO-DEPOSIT case onto the single
 * BookFlow façade so it lands a real `bookflow_appointments` row (Dispatch +
 * email + SMS for free) — while keeping the DEPOSIT case 100% on the existing
 * `bookings` table + Stripe flow (BookFlow's createAppointment does NOT do
 * deposit-on-booking; that's a deferred phase).
 *
 * WHAT THIS TEST PROVES (deliberate-failure fixtures, not just "it runs"):
 *   1. A NON-DEPOSIT booking lands in the BOOKFLOW store via the façade, tagged
 *      source='quotequick'. NEGATIVE ASSERTION (red the instant the handler
 *      reverts): storage.createBooking is wired as a stub that pushes a
 *      `bookings` store — asserted EMPTY for the no-deposit case.
 *   2. A DEPOSIT booking STILL uses the legacy `bookings` path: storage
 *      .createBooking IS called (bookings store gets the row), the façade is
 *      provably NOT called, and the response says requires_checkout:true. This
 *      proves PR7 did not break deposits.
 *   3. GRACEFUL ERRORS (no-deposit): BookFlow inactive / no client resolves →
 *      a clean 4xx "unavailable", NOT a 500, NOT a silent success.
 *   4. Availability reads from the SAME bookflowService source the no-deposit
 *      booking writes to, projected onto the legacy { slots:["HH:MM"] } shape.
 *
 * Runnable standalone:  npx tsx server/routes/bookingRoutes.bookflow.test.ts
 * Wired into CI as `npm run check:legacy-booking-bookflow`.
 *
 * DB-free: the handlers take an injected `deps` seam for the BookFlow
 * collaborators (resolveClient / getAvailableSlots / façade), and the
 * module-level `storage` singleton's methods are monkey-patched per-case so the
 * deposit path's storage.getCalculatorById / getConfirmedBookingsForDate /
 * createBooking never hit a DB. We DO import the façade module only to reuse its
 * real BookingFacadeError class (so the handler's instanceof check is exercised
 * against the genuine type). bookingRoutes statically imports server/db (throws
 * at module-eval if DATABASE_URL is unset), so we set a dummy URL first; no real
 * query ever runs.
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

/** Build calculator_settings.booking_settings for a deposit / non-deposit calc. */
function calcWith(bookingSettings: Record<string, unknown>) {
  return {
    id: 42,
    slug: "bobs-boilers",
    business_name: "Bob's Boilers",
    calculator_settings: { booking_settings: { enabled: true, ...bookingSettings } },
  };
}

async function main() {
  const { handlePostBooking, handleAvailability } = await import("./bookingRoutes");
  const { storage } = await import("../storage");

  // Far-future date/time so any past-date guard never trips.
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const FUTURE_DATE = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(
    future.getDate(),
  ).padStart(2, "0")}`;

  /* ───────────────────────────────────────────────────────────────────
   * 1. NON-DEPOSIT booking → bookflow store, source='quotequick', and does
   *    NOT write the legacy `bookings` table (the negative fixture).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("legacy-booking-bookflow: NON-DEPOSIT POST /api/bookings routes to the bookflow store, source=quotequick");
  {
    // Legacy `bookings` store — MUST stay empty for the no-deposit case.
    const bookingsStore: unknown[] = [];
    // The bookflow store (what the façade writes through).
    const bookflowStore: Array<Record<string, unknown>> = [];

    // No-deposit calc: require_deposit unset (so requiresDeposit === false).
    (storage as any).getCalculatorById = async () => calcWith({ require_deposit: false });
    // If the handler ever takes the deposit branch, these would run — wire them
    // so the negative assertion is meaningful (and so a regression is loud).
    (storage as any).getConfirmedBookingsForDate = async () => [];
    (storage as any).createBooking = async (data: any) => {
      const row = { id: bookingsStore.length + 1, ...data };
      bookingsStore.push(row);
      return row;
    };

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

    const req: any = {
      body: {
        calculator_id: 42,
        customer_name: "Jordan",
        customer_email: "jordan@example.com",
        customer_phone: "555-123-4567",
        date: FUTURE_DATE,
        time: "10:00",
        quote_amount: 250,
        notes: "Boiler service",
      },
    };
    const res = makeRes();
    await handlePostBooking(req, res, deps as any);

    // ── Positive: landed in bookflow with the right calc + source ──
    assert.equal(res.statusCode, 200, `no-deposit booking returns 200, got ${res.statusCode} (${JSON.stringify(res.body)})`);
    assert.equal(facadeCalls, 1, "façade (bookflow path) called exactly once");
    assert.equal(lastCalcId, 42, "façade called with the booking's calculator id");
    assert.equal(lastInput.source, "quotequick", "source tagged 'quotequick' (legacy wizard path)");
    assert.equal(lastInput.customerName, "Jordan", "customer name mapped onto façade input");
    assert.equal(lastInput.customerEmail, "jordan@example.com", "email mapped onto façade input");
    assert.equal(lastInput.customerPhone, "555-123-4567", "phone mapped onto façade input");
    assert.ok(typeof lastInput.startTime === "string" && lastInput.startTime.includes("T"), "startTime built as ISO from date+time");
    assert.equal(bookflowStore.length, 1, "exactly one bookflow appointment row created");
    assert.equal((res.body as any).requires_checkout, false, "no-deposit response: requires_checkout:false");
    assert.equal((res.body as any).deposit_amount, 0, "no-deposit response: deposit_amount 0");

    // ── NEGATIVE ASSERTION: bookings table untouched for no-deposit ──
    assert.equal(
      bookingsStore.length,
      0,
      "NEGATIVE: a NON-DEPOSIT booking must NOT write the legacy `bookings` table (storage.createBooking)",
    );
  }
  console.log("  ✓ non-deposit booking landed in bookflow (source=quotequick); `bookings` table untouched");

  /* ───────────────────────────────────────────────────────────────────
   * 2. DEPOSIT booking STILL uses the legacy `bookings` path (Stripe deferred).
   *    Proves PR7 did not break deposits: storage.createBooking IS called, the
   *    façade is NOT, and the response says requires_checkout:true.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("legacy-booking-bookflow: DEPOSIT POST /api/bookings STILL writes the `bookings` table (not bookflow)");
  {
    const bookingsStore: Array<Record<string, unknown>> = [];

    // Deposit calc: require_deposit + a connected Stripe account → requiresDeposit true.
    (storage as any).getCalculatorById = async () =>
      calcWith({
        require_deposit: true,
        stripe_account_id: "acct_123",
        deposit_type: "percentage",
        deposit_value: 20,
        slot_duration_minutes: 60,
      });
    (storage as any).getConfirmedBookingsForDate = async () => []; // no overlap
    (storage as any).createBooking = async (data: any) => {
      const row = { id: bookingsStore.length + 1, ...data };
      bookingsStore.push(row);
      return row;
    };

    let facadeCalls = 0;
    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async () => {
        facadeCalls++;
        return {} as any;
      },
    };

    const req: any = {
      body: {
        calculator_id: 42,
        customer_name: "Pat",
        customer_email: "pat@example.com",
        date: FUTURE_DATE,
        time: "11:00",
        quote_amount: 500,
      },
    };
    const res = makeRes();
    await handlePostBooking(req, res, deps as any);

    assert.equal(res.statusCode, 200, `deposit booking returns 200, got ${res.statusCode} (${JSON.stringify(res.body)})`);
    // ── Deposit path proof: bookings table written, façade NOT called ──
    assert.equal(bookingsStore.length, 1, "DEPOSIT: legacy `bookings` row created via storage.createBooking");
    assert.equal((bookingsStore[0] as any).status, "pending", "DEPOSIT: bookings row is status='pending' (awaiting Stripe)");
    assert.equal((bookingsStore[0] as any).deposit_amount, 100, "DEPOSIT: 20% of 500 = 100 deposit on the bookings row");
    assert.equal(facadeCalls, 0, "NEGATIVE: deposit booking must NOT go through the BookFlow façade");
    assert.equal((res.body as any).requires_checkout, true, "DEPOSIT: response says requires_checkout:true (Stripe flow next)");
    assert.equal((res.body as any).deposit_amount, 100, "DEPOSIT: response carries the deposit amount");
  }
  console.log("  ✓ deposit booking still on `bookings` + Stripe (status=pending, requires_checkout); façade untouched");

  /* ───────────────────────────────────────────────────────────────────
   * 3. Graceful error (no-deposit) — BookFlow inactive → 4xx, not 500.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("legacy-booking-bookflow: no-deposit + BookFlow inactive → clean 4xx unavailable (not 500)");
  {
    (storage as any).getCalculatorById = async () => calcWith({ require_deposit: false });

    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async () => [],
      // The native engine throws this exact message when BookFlow is deactivated.
      createBookingForCalculator: async () => {
        throw new Error("BookFlow is not active for this client");
      },
    };

    const req: any = {
      body: { calculator_id: 42, customer_name: "Jordan", date: FUTURE_DATE, time: "10:00" },
    };
    const res = makeRes();
    await handlePostBooking(req, res, deps as any);

    assert.ok(res.statusCode >= 400 && res.statusCode < 500, `inactive BookFlow returns a 4xx, got ${res.statusCode}`);
    assert.ok((res.body as any).error, "4xx carries a user-facing error message");
    assert.notEqual(res.statusCode, 500, "inactive BookFlow must NOT 500");
    assert.notEqual(res.statusCode, 200, "inactive BookFlow must NOT silently succeed");
  }
  console.log("  ✓ inactive BookFlow → 4xx with message, no 500, no silent success");

  /* ───────────────────────────────────────────────────────────────────
   * 4. Graceful error (no-deposit) — no client resolves (BookingFacadeError) → 4xx.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("legacy-booking-bookflow: no-deposit + no linked client (BookingFacadeError) → clean 4xx");
  {
    const { BookingFacadeError } = await import("../services/booking/createBookingForCalculator");
    (storage as any).getCalculatorById = async () => calcWith({ require_deposit: false });

    const deps = {
      resolveClientForCalculator: async () => null,
      getAvailableSlots: async () => [],
      createBookingForCalculator: async () => {
        throw new BookingFacadeError("No client linked to calculator 42", "no_client");
      },
    };

    const req: any = {
      body: { calculator_id: 42, customer_name: "Jordan", date: FUTURE_DATE, time: "10:00" },
    };
    const res = makeRes();
    await handlePostBooking(req, res, deps as any);

    assert.ok(res.statusCode >= 400 && res.statusCode < 500, `no-client returns a 4xx, got ${res.statusCode}`);
    assert.ok((res.body as any).error, "4xx carries a user-facing error message");
    assert.notEqual(res.statusCode, 500, "no-client must NOT 500");
  }
  console.log("  ✓ no linked client → 4xx with message");

  /* ───────────────────────────────────────────────────────────────────
   * 5. Availability reads from the SAME BookFlow source the no-deposit booking
   *    writes, projected onto the legacy { slots:["HH:MM"] } shape for `date`.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("legacy-booking-bookflow: availability reads bookflow slots (shared source), HH:MM shape");
  {
    (storage as any).getCalculatorById = async () => calcWith({ require_deposit: false });

    // Two available slots ON the requested date + one on a different day +
    // one unavailable → only the two same-day available ones surface as HH:MM.
    const slotStart = (h: number) => new Date(`${FUTURE_DATE}T${String(h).padStart(2, "0")}:00:00`).toISOString();
    const otherDay = new Date(future.getTime() + 24 * 60 * 60 * 1000);
    const otherDayStr = `${otherDay.getFullYear()}-${String(otherDay.getMonth() + 1).padStart(2, "0")}-${String(otherDay.getDate()).padStart(2, "0")}`;

    let slotsCalledWithClient = -1;
    let slotsCalledWithDays = -1;
    const deps = {
      resolveClientForCalculator: async () => 7,
      getAvailableSlots: async (clientId: number, _date: string, days?: number) => {
        slotsCalledWithClient = clientId;
        slotsCalledWithDays = days ?? -1;
        return [
          { start: slotStart(9), end: slotStart(10), available: true },
          { start: slotStart(14), end: slotStart(15), available: true },
          { start: slotStart(16), end: slotStart(17), available: false }, // filtered: not available
          { start: `${otherDayStr}T09:00:00.000Z`, end: `${otherDayStr}T10:00:00.000Z`, available: true }, // filtered: wrong day
        ];
      },
      createBookingForCalculator: async () => ({}) as any,
    };

    const req: any = { query: { calculator_id: "42", date: FUTURE_DATE } };
    const res = makeRes();
    await handleAvailability(req, res, deps as any);

    assert.equal(res.statusCode, 200, "availability returns 200");
    assert.equal(slotsCalledWithClient, 7, "slots read from bookflowService keyed by the resolved client");
    assert.equal(slotsCalledWithDays, 1, "availability scans just the requested day (days=1)");
    const slots = (res.body as any).slots as string[];
    assert.deepEqual(slots, ["09:00", "14:00"], "only same-day AVAILABLE slots surface, as HH:MM");

    // No client → stable empty grid, no throw.
    const depsNoClient = { ...deps, resolveClientForCalculator: async () => null };
    const res2 = makeRes();
    await handleAvailability(req, res2, depsNoClient as any);
    assert.equal(res2.statusCode, 200, "no-client availability still 200 (stable shape)");
    assert.deepEqual((res2.body as any).slots, [], "no client → empty slots");
  }
  console.log("  ✓ availability sourced from bookflowService (HH:MM, same-day, available-only); no-client → empty grid");

  console.log("\nlegacy-booking-bookflow: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
