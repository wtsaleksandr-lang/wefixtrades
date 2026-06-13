/**
 * AI-employee FREE activation — customer-widget chat gate regression test.
 *
 * Drives the PURE dependency-injected gate (server/services/clientChatAccess.ts)
 * plus the DB-free agent-loop core with a mocked Anthropic client — no express
 * wiring, no DB, no network (pattern: quoteWidgetDistanceRoutes.test.ts):
 *
 *   1. enabled:false → 403 (assistant off — the widget bubble never gates in).
 *   2. enabled:true but subscription_status 'inactive' → 403 (honest default).
 *   3. FREE-ACTIVATED calculator ({enabled:true, subscription_status:'active',
 *      plan:'free_included'} — exactly what the one-click dashboard toggle
 *      PATCHes) → allowed, and the chat PROCEEDS end-to-end through the agent
 *      loop with a mocked LLM, pinned to the cheap model (CLAUDE_HAIKU beats
 *      the global getModel() default).
 *   4. Dormant trial machinery unchanged — in-window trial allowed; expired
 *      trial → 403 `trial_expired` (legacy wire code preserved).
 *   5. Per-calculator daily conversation cap — over-cap conversation START →
 *      graceful 503 "assistant unavailable" (same honest soft-fail shape the
 *      budget gate uses, never a silent fail); follow-up messages of an
 *      ongoing conversation are NOT counted/cut off; the cap keys on the
 *      calculator (another calculator still passes).
 *   6. DELIBERATE-FAILURE FIXTURE — a regressed gate that forgets the
 *      `enabled` check fails the real assertion red, proving this gate
 *      catches that regression class rather than merely running.
 *
 * Excluded from `tsc --noEmit` via the tsconfig *.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/services/clientChatAccess.test.ts
 *
 * Wired into CI as `npm run check:client-chat-access`.
 */
import assert from "node:assert/strict";

const { checkClientChatAccess, convsCapKey, TRIAL_DAYS } = await import("./clientChatAccess");
const { isAiAssistantActive } = await import("../../shared/schemas/calculator");
const { RateLimiter, MemoryRateLimitStore } = await import("./rateLimiter");
const { runAgentLoopCore } = await import("./aiAgentLoopCore");
const { CLAUDE_HAIKU } = await import("./aiModels");

type ClientChatGateDeps = import("./clientChatAccess").ClientChatGateDeps;
type ClientChatGateInput = import("./clientChatAccess").ClientChatGateInput;
type AgentLoopDeps = import("./aiAgentLoopCore").AgentLoopDeps;

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Fixtures ════════════════════════════════════════════════════════ */

const CALC_ID = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Exactly what the one-click dashboard toggle PATCHes onto the calculator. */
const FREE_ACTIVATED = {
  enabled: true,
  subscription_status: "active",
  plan: "free_included",
} as const;

function makeGateDeps(overrides: Partial<ClientChatGateDeps> = {}): ClientChatGateDeps {
  return {
    convsPerCalcPerDayLimiter: { check: async () => true },
    ...overrides,
  };
}

function makeGateInput(overrides: Partial<ClientChatGateInput> = {}): ClientChatGateInput {
  return {
    aiEmployee: { ...FREE_ACTIVATED },
    calculatorId: CALC_ID,
    isConversationStart: true,
    ...overrides,
  };
}

/* ═══ 1. enabled:false → 403 ══════════════════════════════════════════ */

await check("enabled:false → 403, assistant off", async () => {
  const result = await checkClientChatAccess(
    makeGateDeps(),
    makeGateInput({ aiEmployee: { enabled: false, subscription_status: "active" } }),
  );
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("unreachable");
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "AI Employee is not enabled for this calculator");
});

await check("ai_employee absent/defaults (never activated) → 403", async () => {
  const result = await checkClientChatAccess(makeGateDeps(), makeGateInput({ aiEmployee: {} }));
  assert.equal(result.allowed, false);
});

/* ═══ 2. enabled but inactive subscription → 403 ══════════════════════ */

await check("enabled:true + subscription_status:'inactive' → 403", async () => {
  const result = await checkClientChatAccess(
    makeGateDeps(),
    makeGateInput({ aiEmployee: { enabled: true, subscription_status: "inactive" } }),
  );
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("unreachable");
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "AI Employee subscription is not active");
});

/* ═══ 3. Free-activated → allowed; chat proceeds on the cheap model ═══ */

await check("free-activated ({enabled, active, free_included}) → allowed", async () => {
  const result = await checkClientChatAccess(makeGateDeps(), makeGateInput());
  assert.deepEqual(result, { allowed: true });
});

await check("free-activated chat PROCEEDS via agent loop, pinned to CLAUDE_HAIKU (mocked LLM)", async () => {
  // Gate first — same order as the route.
  const gate = await checkClientChatAccess(makeGateDeps(), makeGateInput());
  assert.equal(gate.allowed, true);

  const modelsSeen: string[] = [];
  const deps: AgentLoopDeps = {
    client: {
      messages: {
        create: async (params: any) => {
          modelsSeen.push(params.model);
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "Happy to help with your quote!" }],
            usage: { input_tokens: 120, output_tokens: 18 },
          };
        },
      },
    },
    // The GLOBAL default the surface used to follow — must NOT be used now.
    getModel: () => "global-env-model-MUST-NOT-BE-CALLED-FOR-WIDGET",
    gate: async () => ({ allowed: true }),
    logUsage: () => {},
    recordSpend: () => {},
    estimateCostMicroCents: () => 1_000, // 0.1¢/step — far under the 25¢ cap
    getActionRiskTier: () => "auto",
    assertCircuitAllowsRequest: () => {},
    recordCircuitSuccess: () => {},
    recordCircuitFailure: () => {},
  };

  const result = await runAgentLoopCore(deps, {
    systemPrompt: "You are the customer-widget assistant.",
    conversationHistory: [{ role: "user", content: "How much for a 2-zone sprinkler repair?" }],
    tools: [],
    toolExecutors: {},
    surface: "quotequick_widget_ai",
    actionSurface: "customer-widget",
    sessionId: "sess-free-1",
    costCapCents: 25,
    maxSteps: 8,
    // The route's pin (aiRoutes.ts client-chat agent-loop branch).
    modelOverride: CLAUDE_HAIKU,
  });

  assert.equal(result.status, "text", "chat must complete");
  assert.ok(result.reply.includes("Happy to help"), "mocked reply surfaced");
  assert.equal(modelsSeen.length, 1, "exactly one model call");
  assert.equal(modelsSeen[0], CLAUDE_HAIKU, "surface pinned to the cheap Haiku model");
  assert.ok(
    !modelsSeen.includes("global-env-model-MUST-NOT-BE-CALLED-FOR-WIDGET"),
    "global default model must not leak into the widget surface",
  );
});

/* ═══ 4. Dormant trial machinery unchanged ════════════════════════════ */

await check("in-window trial still allowed (dormant premium machinery intact)", async () => {
  const start = Date.now() - 3 * DAY_MS;
  const result = await checkClientChatAccess(
    makeGateDeps(),
    makeGateInput({
      aiEmployee: { enabled: true, subscription_status: "trial", trial_started_at: start },
    }),
  );
  assert.deepEqual(result, { allowed: true });
});

await check(`trial older than ${TRIAL_DAYS} days → 403 trial_expired (legacy wire code)`, async () => {
  const start = Date.now() - (TRIAL_DAYS + 1) * DAY_MS;
  const result = await checkClientChatAccess(
    makeGateDeps(),
    makeGateInput({
      aiEmployee: { enabled: true, subscription_status: "trial", trial_started_at: start },
    }),
  );
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("unreachable");
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "trial_expired", "wire code must stay legacy-compatible");
  assert.ok(result.body.message, "human-readable message present");
});

/* ═══ 5. Per-calculator daily conversation cap ════════════════════════ */

await check("over-cap conversation START → graceful 503 'assistant unavailable'", async () => {
  const limiter = new RateLimiter(new MemoryRateLimitStore(), 2, 60_000);
  const deps = makeGateDeps({ convsPerCalcPerDayLimiter: limiter });

  const c1 = await checkClientChatAccess(deps, makeGateInput());
  const c2 = await checkClientChatAccess(deps, makeGateInput());
  const c3 = await checkClientChatAccess(deps, makeGateInput());
  assert.equal(c1.allowed, true);
  assert.equal(c2.allowed, true);
  assert.equal(c3.allowed, false, "third conversation start must hit the cap");
  if (c3.allowed) throw new Error("unreachable");
  assert.equal(c3.status, 503, "soft-fail is a 503, matching the budget-gate path");
  assert.equal(
    c3.body.error,
    "The assistant is unavailable right now. Please try again shortly.",
    "honest user-facing copy — never a silent fail",
  );
});

await check("follow-up messages of an ongoing conversation are NOT counted or cut off", async () => {
  const limiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const deps = makeGateDeps({ convsPerCalcPerDayLimiter: limiter });

  const start = await checkClientChatAccess(deps, makeGateInput({ isConversationStart: true }));
  assert.equal(start.allowed, true);
  // Cap is now exhausted — but the same conversation keeps flowing.
  for (let i = 0; i < 5; i++) {
    const followUp = await checkClientChatAccess(deps, makeGateInput({ isConversationStart: false }));
    assert.equal(followUp.allowed, true, "mid-conversation message must never be cut off by the cap");
  }
  // A NEW conversation, however, is over the cap.
  const newConv = await checkClientChatAccess(deps, makeGateInput({ isConversationStart: true }));
  assert.equal(newConv.allowed, false);
});

await check("cap keys on the calculator — another calculator still passes", async () => {
  assert.notEqual(convsCapKey(1), convsCapKey(2), "distinct calculators get distinct keys");
  const limiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const deps = makeGateDeps({ convsPerCalcPerDayLimiter: limiter });

  const a1 = await checkClientChatAccess(deps, makeGateInput({ calculatorId: 1 }));
  const a2 = await checkClientChatAccess(deps, makeGateInput({ calculatorId: 1 }));
  const b1 = await checkClientChatAccess(deps, makeGateInput({ calculatorId: 2 }));
  assert.equal(a1.allowed, true);
  assert.equal(a2.allowed, false, "calc 1 over its cap");
  assert.equal(b1.allowed, true, "calc 2 unaffected by calc 1's cap");
});

/* ═══ 6. DELIBERATE-FAILURE FIXTURE ═══════════════════════════════════
 * A regressed gate that forgets the `enabled` check (only inspects
 * subscription_status) must turn the case-1 assertion red — proving the
 * gate test CATCHES this regression class instead of merely running.
 * (Repo deliberate-failure precedent: quoteWidgetDistanceRoutes.test.ts §7.)
 */

await check("DELIBERATE-FAILURE fixture — gate that skips `enabled` turns the test red", async () => {
  const regressedGate = async (
    _deps: ClientChatGateDeps,
    input: ClientChatGateInput,
  ): Promise<{ allowed: boolean }> => {
    // The regression under test: enabled flag ignored entirely.
    const status = input.aiEmployee.subscription_status || "inactive";
    return { allowed: status === "active" || status === "trial" };
  };

  const result = await regressedGate(
    makeGateDeps(),
    makeGateInput({ aiEmployee: { enabled: false, subscription_status: "active" } }),
  );

  let caught: unknown = null;
  try {
    assert.equal(result.allowed, false); // the REAL gate assertion from case 1
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "case-1 assertion must fail red against the regressed gate");
});

/* ═══ 7. UNIFIED-AI U4 — graceful HAND-OFF contract ═══════════════════
 * Every customer-facing blocked/limit state must convert to a warm 200 + SSE
 * hand-off (assistant text + a `done` frame carrying captureLead:true), NEVER
 * a 403/503/empty reply. These drive the PURE hand-off contract module +
 * re-drive the agent-loop core to prove a gate_blocked run produces the
 * hand-off shape rather than a silent empty reply.
 */

const {
  classifyGateBlock,
  classifyAccessGateBlock,
  handoffCopy,
  handoffTextFrame,
  handoffDoneFrame,
} = await import("./clientChatHandoff");

await check("access-gate bodies map to hand-off reasons (no 403/503 reaches the customer)", () => {
  // The exact bodies clientChatAccess.ts returns for each block.
  assert.equal(
    classifyAccessGateBlock({ error: "AI Employee is not enabled for this calculator" }),
    "gate_blocked",
  );
  assert.equal(
    classifyAccessGateBlock({ error: "AI Employee subscription is not active" }),
    "gate_blocked",
  );
  assert.equal(
    classifyAccessGateBlock({ error: "trial_expired", message: "…Pro preview has ended…" }),
    "trial_expired_midchat",
  );
  assert.equal(
    classifyAccessGateBlock({ error: "The assistant is unavailable right now. Please try again shortly." }),
    "daily_cap",
  );
});

await check("surface gate_blocked errorMessage maps to kill_switch / monthly_budget", () => {
  assert.equal(
    classifyGateBlock('AI surface "quotequick_widget_ai" is paused — admin kill switch is ON.'),
    "kill_switch",
  );
  assert.equal(
    classifyGateBlock('AI surface "quotequick_widget_ai" reached its monthly budget ($20.00). Resets on the 1st.'),
    "monthly_budget",
  );
  // Unknown reason still fails CLOSED to a warm hand-off, never an error.
  assert.equal(classifyGateBlock(undefined), "gate_blocked");
});

await check("hand-off copy is warm + never mentions Pro/upgrade/budget/kill switch", () => {
  for (const reason of [
    "gate_blocked",
    "daily_cap",
    "monthly_budget",
    "kill_switch",
    "trial_expired_midchat",
    "cost_cap",
  ] as const) {
    const copy = handoffCopy(reason, "Bright Plumbing");
    assert.ok(copy.length > 0, "copy present");
    assert.ok(
      !/upgrade|\bpro\b|budget|kill switch|unavailable|expired/i.test(copy),
      `copy for ${reason} must not leak a limitation: "${copy}"`,
    );
  }
  // Business name interpolated into the canonical line.
  assert.ok(handoffCopy("daily_cap", "Bright Plumbing").includes("Bright Plumbing"));
});

await check("done frame carries handoff.captureLead:true (the wire contract)", () => {
  const frame = handoffDoneFrame("monthly_budget");
  assert.ok(frame.startsWith("data: "), "SSE data: prefix");
  assert.ok(frame.endsWith("\n\n"), "SSE frame terminator");
  const parsed = JSON.parse(frame.slice(6).trim());
  assert.equal(parsed.done, true);
  assert.equal(parsed.handoff.captureLead, true);
  assert.equal(parsed.handoff.reason, "monthly_budget");
  // Text frame shape the bubble already consumes.
  const tf = JSON.parse(handoffTextFrame("hello").slice(6).trim());
  assert.equal(tf.text, "hello");
});

await check("agent-loop gate_blocked → status gate_blocked + EMPTY reply (the silent-fail the route converts)", async () => {
  // Proves the loop itself returns the gate_blocked status with an empty reply
  // (the worst "typing dots then silence" state). The route's U4 wiring turns
  // THIS into the warm hand-off above (text + captureLead) — verified by
  // classifyGateBlock mapping its errorMessage to a real reason.
  const deps: AgentLoopDeps = {
    client: { messages: { create: async () => { throw new Error("must not be called when gate blocks"); } } },
    getModel: () => CLAUDE_HAIKU,
    // Surface budget/kill switch is tripped — the customer-block state.
    gate: async () => ({ allowed: false, reason: 'AI surface "quotequick_widget_ai" reached its monthly budget ($20.00). Resets on the 1st.' }),
    logUsage: () => {},
    recordSpend: () => {},
    estimateCostMicroCents: () => 0,
    getActionRiskTier: () => "auto",
    assertCircuitAllowsRequest: () => {},
    recordCircuitSuccess: () => {},
    recordCircuitFailure: () => {},
  };

  const result = await runAgentLoopCore(deps, {
    systemPrompt: "customer widget",
    conversationHistory: [{ role: "user", content: "How much for a repair?" }],
    tools: [],
    toolExecutors: {},
    surface: "quotequick_widget_ai",
    actionSurface: "customer-widget",
    sessionId: "sess-gate-1",
    costCapCents: 25,
    maxSteps: 8,
    modelOverride: CLAUDE_HAIKU,
  });

  assert.equal(result.status, "gate_blocked", "loop reports the block");
  assert.equal(result.reply, "", "reply is empty — this is the silent-fail the route MUST convert");
  // The route's conversion: errorMessage → a concrete hand-off reason →
  // a 200 SSE warm capture (NOT a 403/503/empty).
  const reason = classifyGateBlock(result.errorMessage);
  assert.equal(reason, "monthly_budget");
  const doneFrame = JSON.parse(handoffDoneFrame(reason).slice(6).trim());
  assert.equal(doneFrame.handoff.captureLead, true);
});

await check("DELIBERATE-FAILURE — a route that 503s the daily cap (no captureLead) turns red", () => {
  // Simulate the OLD broken behaviour: the daily-cap block returns a raw 503
  // with no hand-off. The real contract assertion (captureLead present) must
  // fail red against it — proving this test catches a regression to the
  // broken state, not merely that the happy path runs.
  const brokenResponse = { status: 503, body: { error: "unavailable" }, handoff: undefined as any };
  let caught: unknown = null;
  try {
    // The REAL contract: a customer block is a 200 hand-off with captureLead.
    assert.notEqual(brokenResponse.status, 503, "customer block must never be a 503");
    assert.equal(brokenResponse.handoff?.captureLead, true, "must carry captureLead");
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "the broken 503-no-handoff path must fail the contract assertion red");
});

/* ═══ 8. U6 — isAiAssistantActive() agrees with the gate (drift guard) ══
 * The public-calculator payload computes one boolean (`aiAssistantActive`)
 * from shared `isAiAssistantActive()` so calculator.tsx renders the chat
 * bubble ONLY when the assistant is live — never the broken/upgrade state.
 * That predicate MUST agree with this route gate's allow/deny verdict on the
 * enabled/subscription/trial axis (the daily cap is server-only, so we test
 * with the cap open). If they ever drift, a deactivated assistant either
 * renders a bubble that then 403s, or hides a working one. This section pins
 * them together across the full truth table — incl. a deliberate-failure
 * fixture proving the agreement assertion can go red.
 */

const NOW = Date.now();
type AiCase = { label: string; ai: any };
const GATE_CASES: AiCase[] = [
  { label: "never activated (defaults)", ai: {} },
  { label: "enabled:false", ai: { enabled: false, subscription_status: "active" } },
  { label: "enabled + inactive", ai: { enabled: true, subscription_status: "inactive" } },
  { label: "free-activated (enabled + active)", ai: { enabled: true, subscription_status: "active", plan: "free_included" } },
  { label: "in-window trial", ai: { enabled: true, subscription_status: "trial", trial_started_at: NOW - 3 * DAY_MS } },
  { label: "expired trial", ai: { enabled: true, subscription_status: "trial", trial_started_at: NOW - (TRIAL_DAYS + 1) * DAY_MS } },
  { label: "trial w/o start timestamp", ai: { enabled: true, subscription_status: "trial", trial_started_at: null } },
];

for (const c of GATE_CASES) {
  await check(`U6 drift guard — isAiAssistantActive matches gate verdict: ${c.label}`, async () => {
    // Cap open so we isolate the enabled/subscription/trial axis.
    const gate = await checkClientChatAccess(makeGateDeps(), makeGateInput({ aiEmployee: c.ai }));
    const predicate = isAiAssistantActive(c.ai, NOW);
    assert.equal(
      predicate,
      gate.allowed,
      `bubble-render predicate (${predicate}) must equal route allow verdict (${gate.allowed}) for ${c.label}`,
    );
  });
}

await check("U6 DELIBERATE-FAILURE — a predicate that ignores `enabled` disagrees with the gate (red)", async () => {
  // Regressed predicate: forgets the enabled flag → would render a bubble for
  // a disabled assistant the route 403s.
  const regressed = (ai: any) => (ai.subscription_status || "inactive") !== "inactive";
  const ai = { enabled: false, subscription_status: "active" };
  const gate = await checkClientChatAccess(makeGateDeps(), makeGateInput({ aiEmployee: ai }));

  let caught: unknown = null;
  try {
    assert.equal(regressed(ai), gate.allowed); // would be true vs false → red
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "agreement assertion must fail red against the regressed predicate");
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\nclient-chat-access gate: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
