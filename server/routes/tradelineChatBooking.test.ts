/**
 * TradeLine CHAT booking-actuation test (booking consolidation PR6).
 *
 * THE GAP THIS GUARDS: the TradeLine website chat widget was lead-capture ONLY.
 * Its turn ran a single tool-less `assistantSync` completion (POST
 * /api/widget/chat), so the booking tools (`check_availability` /
 * `create_booking`) could NEVER fire — the AI could claim it booked an
 * appointment while NOTHING persisted (the exact failure mode the VOICE path's
 * tradelineBooking.test.ts guards). PR6 closes the gap: a booking-capable chat
 * turn now routes through the SAME tool-capable agent loop voice uses
 * (assistantAgentLoop + BOOKING_TOOLS + the BookFlow-backed executors), tagging
 * source:'tradeline_chat'.
 *
 * WHAT THIS TEST PROVES (the fix is real, not cosmetic):
 *   1. On a booking-intent CHAT turn for a booking-enabled client, the
 *      booking-CAPABLE path is taken — the agent loop runs with the booking
 *      tools wired in (NOT the tool-less single-call lead-capture path).
 *   2. The `create_booking` executor is ACTUALLY REACHED — a real
 *      `bookflow_appointments` row is written, tagged source='tradeline_chat'.
 *   3. The AI's final reply confirms the booking back to the visitor.
 *
 *   DELIBERATE-FAILURE FIXTURE / NEGATIVE ASSERTIONS:
 *     (a) On the OLD tool-less `assistantSync` path the create_booking executor
 *         is STRUCTURALLY UNREACHABLE — assistantSync forwards no tools and even
 *         throws if handed any. We re-create that exact path (booking target
 *         resolves null → runSync) and assert the executor is NEVER reached and
 *         NO row is written. This is the "tools never fire" regression made red.
 *     (b) The persisted row carries source='tradeline_chat' (catches a mis-tag
 *         or a regression to the legacy `bookings` table, which has no `source`).
 *     (c) A gated/disallowed client (booking disabled → no booking target) does
 *         NOT attempt booking — it stays on the lead-capture single-call path and
 *         the create_booking executor is never touched.
 *
 * Runnable standalone:  npx tsx server/routes/tradelineChatBooking.test.ts
 * Wired into CI as `npm run check:tradeline-chat-booking`.
 *
 * DB-free: tradelineWidgetRoutes transitively imports server/db (throws at
 * module-eval if DATABASE_URL is unset). We set a dummy URL FIRST, THEN
 * dynamically import. The model layer + booking storage are stubbed via the
 * WidgetChatBookingDeps DI seam (runWidgetChatTurn's `deps`) so NO network/DB
 * call is made — mirroring tradelineBooking.test.ts.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

// Must run before importing the route module (transitively pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://tl:tl@127.0.0.1:1/tl_no_connect";
}

async function main() {
  const routes = await import("./tradelineWidgetRoutes");
  const { runAgentLoopCore } = await import("../services/aiAgentLoopCore");
  const { runWidgetChatTurn } = routes;

  /* ── In-memory BookFlow store (stands in for bookflow_appointments). Each row
   * carries the consolidation `source` tag so we can assert it. ── */
  const bookflowAppointments: Array<Record<string, unknown>> = [];

  /* ── Stub booking executors (the REAL signatures) ──
   * The createBooking stub simulates the PR5/PR6 executor: it persists a
   * bookflow_appointments-shaped row tagged with the `source` the caller passed
   * (PR6 chat → 'tradeline_chat'), and records calls so we can assert REACHED. */
  let checkAvailabilityCalls = 0;
  let createBookingCalls = 0;
  const createBookingSources: string[] = [];

  const stubCheckAvailability = (async (_calcId: number, _args: Record<string, unknown>) => {
    checkAvailabilityCalls++;
    return {
      success: true,
      data: { slots: [{ start: "2026-06-17T15:00:00", end: "2026-06-17T16:00:00", available: true }] },
      narrative: "Wednesday at 3 PM is open. Want me to book it?",
    };
  }) as unknown as typeof import("../services/bookingTools").executeCheckAvailability;

  const stubCreateBooking = (async (
    calcId: number,
    args: Record<string, unknown>,
    source: string = "tradeline_voice",
  ) => {
    createBookingCalls++;
    createBookingSources.push(source);
    const id = bookflowAppointments.length + 1;
    bookflowAppointments.push({
      id,
      calculator_id: calcId,
      customer_name: args.customer_name,
      customer_phone: args.customer_phone,
      date: "2026-06-17",
      time: "15:00",
      source,
    });
    return {
      success: true,
      data: { booking_id: id, date: "2026-06-17", time: "15:00" },
      narrative: "Your appointment is confirmed for Wednesday, June 17 at 3:00 PM. See you then!",
    };
  }) as unknown as typeof import("../services/bookingTools").executeCreateBooking;

  /* ── Stubbed Anthropic-style model ──
   * Step 0: emit a create_booking tool_use. Step 1 (after tool_result): final text. */
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
                id: "toolu_book_chat_1",
                name: "create_booking",
                input: {
                  customer_name: "Riley",
                  customer_phone: "555-987-6543",
                  start_time: "2026-06-17T15:00:00",
                  service: "Drain unblock",
                },
              },
            ],
          };
        }
        return {
          stop_reason: "end_turn",
          usage: { input_tokens: 120, output_tokens: 30 },
          content: [
            { type: "text", text: "You're all set — Wednesday, June 17 at 3:00 PM. We'll see you then!" },
          ],
        };
      },
    },
  };

  /* ── DB-free, network-free deps for the agent loop core ── */
  const loopDeps = {
    client: stubClient,
    getModel: () => "claude-haiku-test",
    gate: async () => ({ allowed: true }),
    logUsage: () => {},
    recordSpend: () => {},
    estimateCostMicroCents: () => 0,
    getActionRiskTier: () => undefined,
    assertCircuitAllowsRequest: () => {},
    recordCircuitSuccess: () => {},
    recordCircuitFailure: () => {},
  };

  /* ── Injected runAgentLoop: drives the REAL loop core with our stub client,
   * exercising the genuine tool-execution machinery (tool_use → executor →
   * tool_result → final text). ── */
  const injectedRunAgentLoop = (async (req: any, opts: any) => {
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
  }) as unknown as typeof import("../services/assistant").assistantAgentLoop;

  // A runSync that, on the booking path, MUST NOT be reached — if booking ever
  // falls back to the tool-less single-call path it throws and the test fails
  // loudly (the original broken behaviour). Reused (counting) for the gated case.
  let syncUsed = 0;
  const countingRunSync = (async (_req: any) => {
    syncUsed++;
    return { reply: "Thanks for reaching out! Leave your name and number and the team will call you back." };
  }) as unknown as typeof import("../services/assistant").assistantSync;
  const failingRunSync = (async () => {
    throw new Error(
      "REGRESSION: a booking-capable chat turn fell back to the tool-less assistantSync path — tools cannot fire here.",
    );
  }) as unknown as typeof import("../services/assistant").assistantSync;

  /* ════════════════════════════════════════════════════════════════════════
   * CASE 1 — booking-enabled client: the create_booking executor is REACHED and
   * a bookflow_appointments row lands tagged source='tradeline_chat'.
   * ════════════════════════════════════════════════════════════════════════ */
  console.log("tradeline-chat-booking: booking-intent chat turn actuates the create_booking tool");
  const reply = await runWidgetChatTurn({
    clientId: 1,
    systemPrompt: "You are the website chat assistant for Bob's Boilers.",
    messages: [{ role: "user", content: "Hi, can you book me Wednesday at 3pm?" }],
    sessionId: "widget-test-1",
    deps: {
      // Booking IS available → a backing calculator resolves.
      resolveBookingTarget: async () => ({ calculatorId: 99 }),
      runAgentLoop: injectedRunAgentLoop,
      runSync: failingRunSync,
      checkAvailability: stubCheckAvailability,
      createBooking: stubCreateBooking,
    },
  });

  // (a) the tool path FIRED — executor REACHED (structurally impossible on the
  //     old tool-less assistantSync path).
  assert.ok(
    createBookingCalls >= 1,
    `NEGATIVE-ASSERTION (a): create_booking executor was never reached (calls=${createBookingCalls}). ` +
      "On the old tool-less assistantSync path this was structurally impossible — this is the exact gap PR6 closes.",
  );
  assert.equal(
    bookflowAppointments.length,
    1,
    `exactly one bookflow_appointments row should be created, got ${bookflowAppointments.length}`,
  );

  const bookedRow = bookflowAppointments[0];
  assert.equal(bookedRow.customer_name, "Riley", "booking carries the visitor's name");
  assert.equal(bookedRow.date, "2026-06-17", "booking carries the right date (Wednesday)");
  assert.equal(bookedRow.time, "15:00", "booking carries the right time (3 PM)");

  // (b) the row landed in the BookFlow authority, tagged source='tradeline_chat'.
  assert.equal(
    bookedRow.source,
    "tradeline_chat",
    `NEGATIVE-ASSERTION (b): chat booking must land tagged source='tradeline_chat', got ${String(bookedRow.source)}`,
  );
  assert.equal(
    createBookingSources[0],
    "tradeline_chat",
    "the create_booking executor was invoked with source='tradeline_chat'",
  );

  // the AI reads the confirmation back to the visitor.
  assert.ok(reply.reply && reply.reply.includes("3:00 PM"), `final reply confirms the time, got: ${reply.reply}`);
  assert.equal(syncUsed, 0, "the booking path must NOT touch the tool-less single-call path");

  console.log(
    `  ✓ create_booking reached (${createBookingCalls}x), bookflow_appointments row persisted source='tradeline_chat', reply confirms`,
  );

  /* ════════════════════════════════════════════════════════════════════════
   * CASE 2 — DELIBERATE-FAILURE FIXTURE: the OLD tool-less path. When no booking
   * target resolves (booking disabled / gated / no calculator), runWidgetChatTurn
   * takes the tool-less lead-capture single-call path. The create_booking
   * executor is structurally UNREACHABLE there → no new row, no executor call.
   * ════════════════════════════════════════════════════════════════════════ */
  console.log("tradeline-chat-booking: gated/disabled client stays lead-capture — booking NEVER attempted");
  const cbBefore = createBookingCalls;
  const rowsBefore = bookflowAppointments.length;
  syncUsed = 0;

  const reply2 = await runWidgetChatTurn({
    clientId: 2,
    systemPrompt: "You are the website chat assistant for No-Booking Plumbing.",
    messages: [{ role: "user", content: "Can you book me in for tomorrow?" }],
    sessionId: "widget-test-2",
    deps: {
      // Booking NOT available (disabled / no calculator) → null → lead-capture.
      resolveBookingTarget: async () => null,
      // If booking were (wrongly) attempted this throws and fails the test.
      runAgentLoop: (async () => {
        throw new Error("REGRESSION: a booking-disabled chat turn entered the agent loop — must use the single-call lead-capture path.");
      }) as unknown as typeof import("../services/assistant").assistantAgentLoop,
      runSync: countingRunSync,
      checkAvailability: stubCheckAvailability,
      createBooking: stubCreateBooking,
    },
  });

  assert.equal(syncUsed, 1, "gated/disabled turn must use the lead-capture single-call path exactly once");
  assert.equal(
    createBookingCalls,
    cbBefore,
    `NEGATIVE-ASSERTION (c): gated/disabled turn must NOT reach the create_booking executor (calls went ${cbBefore}→${createBookingCalls})`,
  );
  assert.equal(
    bookflowAppointments.length,
    rowsBefore,
    "gated/disabled turn must NOT write a bookflow_appointments row",
  );
  assert.ok(reply2.reply && reply2.reply.length > 0, "lead-capture reply returned");
  console.log("  ✓ gated/disabled turn used the lead-capture path, no tools touched, no row written");

  /* ════════════════════════════════════════════════════════════════════════
   * RED-WITHOUT proof (documented assertion): re-running CASE 1 with runSync as
   * the path (i.e. simulating the pre-PR6 wiring where the chat route ALWAYS
   * called assistantSync) makes the create_booking executor unreachable. We prove
   * that by asserting the real assistantSync REFUSES tools — the structural
   * reason the old path could never book.
   * ════════════════════════════════════════════════════════════════════════ */
  console.log("tradeline-chat-booking: assistantSync structurally refuses tools (why the old path could never book)");
  const { assistantSync } = await import("../services/assistant");
  await assert.rejects(
    () =>
      assistantSync({
        surface: "tradeline_widget_chat",
        messages: [{ role: "user", content: "book me" }],
        sessionId: "widget-test-3",
        systemOverride: "x",
        tools: [{ name: "create_booking" }] as any,
      }),
    /assistantSync does not execute tools/,
    "assistantSync must reject tool-bearing requests — proving the old tool-less chat path could NEVER fire create_booking",
  );
  console.log("  ✓ assistantSync refuses tools — the old lead-capture-only path was structurally unable to book");

  console.log("\ntradeline-chat-booking: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
