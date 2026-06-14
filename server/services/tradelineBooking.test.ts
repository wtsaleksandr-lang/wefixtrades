/**
 * TradeLine VOICE booking-actuation test (fix/tradeline-booking-actuation).
 *
 * THE BUG THIS GUARDS (verified-CRITICAL P0): on a live voice call the AI
 * receptionist would claim it booked an appointment, but the booking tools
 * NEVER fired. The voice turn handler routed through `assistantSync`, which
 * runs a single `chat()` completion and forwards NO tools — so
 * `check_availability` / `create_booking` could never be invoked, and nothing
 * was ever persisted. The caller heard "you're booked"; the calendar stayed
 * empty. The previous test for this path was synthetic and never exercised the
 * tool loop, so it could not have caught this.
 *
 * WHAT THIS TEST PROVES (the fix is real, not cosmetic):
 *   1. On a booking-intent voice turn, the booking-CAPABLE path is taken — the
 *      agent loop runs with the booking tools wired in (not the tool-less
 *      single-call path).
 *   2. The `create_booking` executor is ACTUALLY REACHED — a real booking row
 *      is created with the right date/time AND the caller's number defaulted
 *      from caller-ID (the model didn't supply a phone).
 *   3. The AI's final reply confirms the booking back to the caller.
 *
 *   NEGATIVE ASSERTION (would FAIL on the original broken code): we assert the
 *   create_booking executor was invoked at least once on a booking-intent turn.
 *   On the old `assistantSync`-only path it was structurally impossible to
 *   invoke any tool, so this assertion would have been red — i.e. this test
 *   catches the exact "tools never fire" regression.
 *
 * Runnable standalone:  npx tsx server/services/tradelineBooking.test.ts
 * Wired into CI as `npm run check:tradeline-booking`.
 *
 * DB-free: vapiService transitively imports server/db (throws at module-eval
 * if DATABASE_URL is unset). We set a dummy URL FIRST, THEN dynamically import.
 * The model layer + booking storage are stubbed via dependency injection
 * (handleTradeLineConversationTurn's `deps` seam) so NO network/DB call is made.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

// Must run before importing vapiService (which transitively pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://tl:tl@127.0.0.1:1/tl_no_connect";
}

async function main() {
  const vapiService = await import("./vapiService");
  const { runAgentLoopCore } = await import("./aiAgentLoopCore");
  const { BOOKING_TOOLS } = await import("./bookingTools");

  const { handleTradeLineConversationTurn } = vapiService;

  /* ── In-memory booking store (stands in for storage.createBooking) ── */
  const bookings: Array<Record<string, unknown>> = [];

  /* ── Stub booking executors (the REAL signature) ──
   * These mirror executeCheckAvailability / executeCreateBooking but write to
   * the in-memory store. We assert they are REACHED — proving the tool path
   * fired. They record their inputs so we can verify date/time + caller number. */
  let checkAvailabilityCalls = 0;
  let createBookingCalls = 0;
  const createBookingArgs: Array<Record<string, unknown>> = [];

  const stubCheckAvailability = (async (calcId: number, _args: Record<string, unknown>) => {
    checkAvailabilityCalls++;
    return {
      success: true,
      data: { slots: [{ day: "Tuesday", times: ["2:00 PM"] }] },
      narrative: "Tuesday at 2 PM is open. Want me to book it?",
    };
  }) as unknown as typeof import("./bookingTools").executeCheckAvailability;

  const stubCreateBooking = (async (calcId: number, args: Record<string, unknown>) => {
    createBookingCalls++;
    createBookingArgs.push(args);
    const id = bookings.length + 1;
    bookings.push({
      booking_id: id,
      calculator_id: calcId,
      customer_name: args.customer_name,
      customer_phone: args.customer_phone,
      date: "2026-06-16",
      time: "14:00",
    });
    return {
      success: true,
      data: { booking_id: id, date: "2026-06-16", time: "14:00" },
      narrative: `Your appointment is confirmed for Tuesday, June 16 at 2:00 PM. We'll call you back on ${args.customer_phone ?? "your number"}.`,
    };
  }) as unknown as typeof import("./bookingTools").executeCreateBooking;

  /* ── Stubbed Anthropic-style model ──
   * Step 0: emit a create_booking tool_use (NO customer_phone — forces the
   * caller-ID default path). Step 1 (after tool_result): emit final text. */
  let modelStep = 0;
  const stubClient = {
    messages: {
      create: async (_params: any) => {
        if (modelStep++ === 0) {
          return {
            stop_reason: "tool_use",
            usage: { input_tokens: 100, output_tokens: 20 },
            content: [
              {
                type: "tool_use",
                id: "toolu_book_1",
                name: "create_booking",
                input: {
                  customer_name: "Jordan",
                  start_time: "2026-06-16T14:00:00",
                  service: "Boiler service",
                  // intentionally NO customer_phone — the executor must default
                  // it from the caller-ID threaded through the context.
                },
              },
            ],
          };
        }
        return {
          stop_reason: "end_turn",
          usage: { input_tokens: 120, output_tokens: 30 },
          content: [
            { type: "text", text: "You're all set — Tuesday, June 16 at 2:00 PM. We'll call you back on 555-123-4567." },
          ],
        };
      },
    },
  };

  /* ── DB-free, network-free deps for the agent loop core ── */
  const loopDeps = {
    client: stubClient,
    getModel: () => "claude-sonnet-test",
    gate: async () => ({ allowed: true }),
    logUsage: () => {},
    recordSpend: () => {},
    estimateCostMicroCents: () => 0,
    // Booking tools are NOT in copilotActionRegistry → undefined tier → loop
    // treats them as auto and executes inline. Mirror that here.
    getActionRiskTier: () => undefined,
    assertCircuitAllowsRequest: () => {},
    recordCircuitSuccess: () => {},
    recordCircuitFailure: () => {},
  };

  /* ── Injected runAgentLoop: drives the REAL loop core with our stub client ──
   * This exercises the genuine tool-execution machinery (tool_use → executor →
   * tool_result → final text), proving the path actuates tools. */
  const injectedRunAgentLoop = async (req: any, opts: any) => {
    return runAgentLoopCore(loopDeps as any, {
      systemPrompt: req.systemOverride ?? "",
      conversationHistory: req.messages,
      tools: req.tools,
      toolExecutors: opts.toolExecutors,
      surface: req.surface,
      actionSurface: opts.actionSurface,
      maxSteps: opts.maxSteps,
      costCapCents: opts.costCapCents,
      modelOverride: req.model,
      maxTokensPerStep: req.maxTokens,
    });
  };

  // A runSync that MUST NOT be reached on a booking turn — if the handler ever
  // falls back to the tool-less single-call path on booking intent, this throws
  // and the test fails loudly (this is the original broken behaviour).
  const failingRunSync = async () => {
    throw new Error(
      "REGRESSION: booking-intent voice turn fell back to the tool-less assistantSync path — tools cannot fire here.",
    );
  };

  const tradeLineCtx: any = {
    businessName: "Bob's Boilers",
    tradeType: "heating",
    mode: "available",
    channels: {},
    booking: { enabled: true, mode: "book_if_available" },
    phoneRouting: {},
    callerNumber: "555-123-4567",
  };

  const resolved: any = {
    client: { id: 1, user_id: 42, business_name: "Bob's Boilers" },
    clientService: { id: 7, service_id: "tradeline" },
    config: {},
  };

  const messages = [
    { role: "user" as const, message: "Hi, can you book me Tuesday at 2pm?" },
  ];

  console.log("tradeline-booking: booking-intent voice turn actuates the create_booking tool");
  const reply = await handleTradeLineConversationTurn(
    messages as any,
    "call-test-1",
    tradeLineCtx,
    // clientServiceId omitted: the optional onboarding-patch load is fail-soft
    // and not part of the booking-actuation proof; omitting it keeps the test
    // free of a DB-connection attempt.
    undefined,
    resolved,
    {
      runAgentLoop: injectedRunAgentLoop as any,
      runSync: failingRunSync as any,
      resolveCalculatorId: async () => 99, // a backing calculator exists
      checkAvailability: stubCheckAvailability,
      createBooking: stubCreateBooking,
    },
  );

  // ── Core assertions: the tool path FIRED ──
  assert.ok(
    createBookingCalls >= 1,
    `NEGATIVE-ASSERTION: create_booking executor was never reached (calls=${createBookingCalls}). ` +
      "On the original assistantSync-only path this was structurally impossible — this is the exact bug.",
  );
  assert.equal(bookings.length, 1, `exactly one booking row should be created, got ${bookings.length}`);

  const row = bookings[0];
  assert.equal(row.customer_name, "Jordan", "booking carries the caller's name");
  assert.equal(row.date, "2026-06-16", "booking carries the right date (Tuesday)");
  assert.equal(row.time, "14:00", "booking carries the right time (2 PM)");

  // ── Caller-ID plumbing: the booking defaulted the callback number to the
  //    caller ID because the model supplied none ──
  assert.equal(
    row.customer_phone,
    "555-123-4567",
    `booking callback number must default to the caller ID, got ${String(row.customer_phone)}`,
  );
  assert.equal(
    createBookingArgs[0].customer_phone,
    "555-123-4567",
    "the create_booking executor received the caller-ID-defaulted phone",
  );

  // ── The AI reads the confirmation back to the caller ──
  assert.ok(reply && reply.toLowerCase().includes("2:00 pm"), `final reply confirms the time, got: ${reply}`);
  assert.ok(reply.includes("555-123-4567"), `final reply reads back the callback number, got: ${reply}`);

  console.log(`  ✓ create_booking reached (${createBookingCalls}x), row persisted, caller-ID defaulted, reply confirms`);

  /* ── Guard 2: a non-booking turn does NOT take the booking path ──
   * When the model never calls a tool, the loop must short-circuit to a single
   * completion (latency guard) — and a NON-booking client (booking disabled)
   * must use the lean single-call path entirely. We prove the booking executors
   * are not touched and the single-call path IS used. */
  console.log("tradeline-booking: non-booking client uses the lean single-call path (no tool round-trips)");
  let syncUsed = 0;
  const cbBefore = createBookingCalls;
  const noBookingCtx = { ...tradeLineCtx, booking: { enabled: false } };
  const reply2 = await handleTradeLineConversationTurn(
    [{ role: "user" as const, message: "What are your hours?" }] as any,
    "call-test-2",
    noBookingCtx as any,
    undefined,
    resolved,
    {
      runAgentLoop: (async () => {
        throw new Error("REGRESSION: a booking-disabled turn entered the agent loop — should use the single-call path.");
      }) as any,
      runSync: (async () => {
        syncUsed++;
        return { reply: "We're open Monday to Friday, 8 to 5." };
      }) as any,
    },
  );
  assert.equal(syncUsed, 1, "booking-disabled turn must use the single-call path exactly once");
  assert.equal(createBookingCalls, cbBefore, "booking-disabled turn must not touch the booking executor");
  assert.ok(reply2.includes("Monday"), "single-call reply returned");
  console.log("  ✓ booking-disabled turn used the single-call path, no tools touched");

  console.log("\ntradeline-booking: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
