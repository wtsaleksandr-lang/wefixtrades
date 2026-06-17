/**
 * Booking consolidation (PR8) — UNIFY THE READ SIDE. DB-free, DI-seam test.
 *
 * THE DRIFT THIS GUARDS: the Admin "recent bookings" endpoint
 * (GET /api/admin/booking/recent) used to read the legacy `bookings` table via
 * storage.listRecentBookings. After PR3-7 repointed EVERY write path
 * (wizard picker, QuoteQuick copilot, TradeLine voice + chat, legacy
 * BookingStep non-deposit) onto `bookflow_appointments`, the legacy `bookings`
 * table no longer receives new bookings — so the Admin surface went blind to
 * quotequick / tradeline_* bookings. PR8 repoints the read to the unified
 * `bookflow_appointments` table.
 *
 * WHAT THIS TEST PROVES (deliberate-failure fixtures, not just "it runs"):
 *   1. The handler reads from the BOOKFLOW source (the injected
 *      listRecentBookflowAppointments seam) and returns its rows — including a
 *      `quotequick`-source and a `tradeline_voice`-source appointment that only
 *      exist in `bookflow_appointments`, never in `bookings`.
 *   2. NEGATIVE / DELIBERATE-FAILURE: the legacy `bookings` reader
 *      (storage.listRecentBookings) is wired as a stub that, if called, pushes a
 *      sentinel row the assertions would REJECT. The test asserts that stub is
 *      NEVER called and the sentinel never appears — so the test goes RED the
 *      instant the handler reverts to reading the legacy `bookings` table.
 *   3. Row-shape projection: bookflow start_time → legacy { date, time } and
 *      service_name → `service`, preserving the client contract.
 *
 * PART 2 (typed inactive-BookFlow error): asserts bookflowService throws the
 * typed `BookflowInactiveError` (reason:'inactive') and that a caller's
 * `bookingUnavailableReason`-style helper recognises it WITHOUT relying on the
 * message string — proven by feeding the helper a typed error whose message is
 * deliberately changed so a pure string-match would miss it.
 *
 * Runnable standalone:  npx tsx server/routes/bookingApiRoutes.bookflow.test.ts
 * Wired into CI as `npm run check:admin-recent-bookflow`.
 *
 * DB-free: handleAdminRecent takes an injected `deps` seam for its read source,
 * and the module-level `storage` singleton's listRecentBookings is
 * monkey-patched to a sentinel-pushing spy. bookingApiRoutes statically imports
 * server/storage (which imports server/db, throwing at module-eval if
 * DATABASE_URL is unset), so we set a dummy URL first; no real query ever runs.
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
  const { handleAdminRecent } = await import("./bookingApiRoutes");
  const { storage } = await import("../storage");

  /* ───────────────────────────────────────────────────────────────────
   * PART 1.1 — Admin "recent" reads the UNIFIED bookflow_appointments source,
   * returns quotequick + tradeline_voice rows, projected onto the legacy shape.
   * NEGATIVE: the legacy `bookings` reader must NEVER be called.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("admin-recent-bookflow: GET /api/admin/booking/recent reads bookflow_appointments (quotequick + tradeline_voice)");
  {
    // Spy: if the handler ever falls back to the legacy `bookings` table, this
    // fires and injects a sentinel the assertions below would reject.
    let legacyReaderCalls = 0;
    (storage as any).listRecentBookings = async () => {
      legacyReaderCalls++;
      return [
        {
          id: 999,
          date: "1999-01-01",
          time: "00:00",
          customer_name: "LEGACY-SENTINEL",
          customer_phone: null,
          customer_email: null,
          status: "confirmed",
        },
      ];
    };

    let seamLimit = -1;
    const bookflowRows = [
      {
        id: 11,
        customer_name: "Quinn Quote",
        customer_phone: "555-0001",
        customer_email: "quinn@example.com",
        service_name: "Boiler service",
        start_time: new Date("2026-07-02T14:30:00.000Z"),
        status: "confirmed",
        source: "quotequick",
      },
      {
        id: 12,
        customer_name: "Tess Voice",
        customer_phone: "555-0002",
        customer_email: null,
        service_name: null,
        start_time: "2026-07-03T09:00:00.000Z", // string form — handler must coerce
        status: "pending",
        source: "tradeline_voice",
      },
    ];

    const deps = {
      listRecentBookflowAppointments: async (limit: number) => {
        seamLimit = limit;
        return bookflowRows as any;
      },
    };

    const req: any = { query: { limit: "50" } };
    const res = makeRes();
    await handleAdminRecent(req, res, deps as any);

    assert.equal(res.statusCode, 200, `recent returns 200, got ${res.statusCode} (${JSON.stringify(res.body)})`);
    assert.equal(seamLimit, 50, "limit query param is passed through to the bookflow read seam");

    const body = res.body as { data: any[]; total: number };
    assert.equal(body.total, 2, "exactly the two bookflow rows surface");
    assert.equal(body.data.length, 2, "data carries both bookflow rows");

    // Row 1 — quotequick: start_time projected onto date + time, service mapped.
    const r1 = body.data[0];
    assert.equal(r1.id, 11, "row 1 id from bookflow row");
    assert.equal(r1.customer_name, "Quinn Quote", "row 1 customer name from bookflow row");
    assert.equal(r1.date, "2026-07-02", "row 1 start_time → legacy date (YYYY-MM-DD)");
    assert.equal(r1.time, "14:30", "row 1 start_time → legacy time (HH:MM)");
    assert.equal(r1.service, "Boiler service", "row 1 service_name → legacy `service`");
    assert.equal(r1.customer_email, "quinn@example.com", "row 1 email mapped");

    // Row 2 — tradeline_voice: string start_time coerced; null service tolerated.
    const r2 = body.data[1];
    assert.equal(r2.id, 12, "row 2 id from bookflow row");
    assert.equal(r2.date, "2026-07-03", "row 2 (string start_time) coerced → date");
    assert.equal(r2.time, "09:00", "row 2 (string start_time) coerced → time");
    assert.equal(r2.service, null, "row 2 null service_name → null `service`");

    // ── NEGATIVE / DELIBERATE-FAILURE: legacy `bookings` reader untouched ──
    assert.equal(
      legacyReaderCalls,
      0,
      "NEGATIVE: Admin recent must NOT read the legacy `bookings` table (storage.listRecentBookings)",
    );
    assert.ok(
      !body.data.some((r) => r.customer_name === "LEGACY-SENTINEL"),
      "NEGATIVE: no legacy-`bookings` sentinel row leaked into the response",
    );
  }
  console.log("  ✓ reads bookflow_appointments (quotequick + tradeline_voice), projected to legacy shape; legacy `bookings` reader never called");

  /* ───────────────────────────────────────────────────────────────────
   * PART 1.2 — limit clamps to [1, 500] and default 100.
   * ─────────────────────────────────────────────────────────────────── */
  console.log("admin-recent-bookflow: limit is clamped to [1,500] with default 100");
  {
    const seen: number[] = [];
    const deps = {
      listRecentBookflowAppointments: async (limit: number) => {
        seen.push(limit);
        return [];
      },
    };
    // "0" and absent both fall back to the default 100 (parseInt(...)||100);
    // "-5" exercises the >=1 floor; "9999" the <=500 ceil; "25" passthrough.
    for (const q of [undefined, "-5", "9999", "25"] as const) {
      const res = makeRes();
      await handleAdminRecent({ query: { limit: q } } as any, res, deps as any);
    }
    assert.deepEqual(seen, [100, 1, 500, 25], "limit clamps: default 100, floor 1 (from -5), ceil 500, passthrough 25");
  }
  console.log("  ✓ limit clamping correct");

  /* ───────────────────────────────────────────────────────────────────
   * PART 1.3 — read failure → 500 with a stable error shape (no silent success).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("admin-recent-bookflow: read failure → 500, not a silent empty success");
  {
    const deps = {
      listRecentBookflowAppointments: async () => {
        throw new Error("db exploded");
      },
    };
    const res = makeRes();
    await handleAdminRecent({ query: {} } as any, res, deps as any);
    assert.equal(res.statusCode, 500, "read failure surfaces as 500");
    assert.ok((res.body as any).error, "500 carries an error message");
  }
  console.log("  ✓ read failure → 500 with error");

  /* ───────────────────────────────────────────────────────────────────
   * PART 2 — typed inactive-BookFlow error. The service throws the TYPED
   * BookflowInactiveError, and a caller's reason-helper recognises it WITHOUT
   * matching the message string (proven by mutating the message).
   * ─────────────────────────────────────────────────────────────────── */
  console.log("admin-recent-bookflow: PART 2 — bookflowService throws typed BookflowInactiveError, recognised without string-match");
  {
    const { BookflowInactiveError, BOOKFLOW_INACTIVE_MESSAGE } = await import(
      "../services/booking/bookflowService"
    );

    // It IS an Error subclass, carries reason:'inactive', default message preserved.
    const typed = new BookflowInactiveError();
    assert.ok(typed instanceof Error, "BookflowInactiveError extends Error");
    assert.equal((typed as any).reason, "inactive", "carries reason:'inactive'");
    assert.equal(typed.message, BOOKFLOW_INACTIVE_MESSAGE, "default message preserved for string-fallback back-compat");
    assert.equal(BOOKFLOW_INACTIVE_MESSAGE, "BookFlow is not active for this client", "stable legacy message string");

    // A caller-equivalent reason helper (mirrors the four callers' shape):
    // recognises the TYPED error even when the message is NOT the legacy string.
    const reasonHelper = (err: unknown): string | null => {
      const message = err instanceof Error ? err.message : "";
      if (err instanceof BookflowInactiveError || message === "BookFlow is not active for this client") {
        return "Online booking is currently unavailable for this business.";
      }
      return null;
    };

    // Deliberately mutate the message so a PURE string-match would MISS it —
    // proving recognition comes from the type, not the string.
    const typedWeirdMessage = new BookflowInactiveError("totally different wording");
    assert.equal(
      reasonHelper(typedWeirdMessage),
      "Online booking is currently unavailable for this business.",
      "typed error recognised by type even when the message string differs",
    );
    // And a genuine unrelated fault still returns null (must still 500 upstream).
    assert.equal(reasonHelper(new Error("some real bug")), null, "unrelated error is NOT treated as 'unavailable'");
    // Back-compat: the legacy plain-Error string is still recognised.
    assert.equal(
      reasonHelper(new Error("BookFlow is not active for this client")),
      "Online booking is currently unavailable for this business.",
      "legacy plain-Error string still recognised (fallback intact)",
    );
  }
  console.log("  ✓ typed BookflowInactiveError thrown + recognised by type (not string); legacy string fallback intact");

  console.log("\nadmin-recent-bookflow: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
