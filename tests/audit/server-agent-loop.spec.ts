/**
 * Wave W-BA-0 — multi-step agent loop pure-Node tests.
 *
 * Exercises `runAgentLoopCore` (the DI'd core under server/services/
 * aiAgentLoopCore.ts) with a stubbed Anthropic client. No DATABASE_URL
 * needed — the core is deliberately DB-free so this spec runs under
 * Playwright's node-only fixtures.
 *
 * What we cover (Phase 3 PR sequence prereq 0):
 *   1. A 2-step loop: tool_use → tool_result → final text.
 *   2. The hard safety rails — max-steps cap + $1.00 cost cap.
 *   3. Gate enforcement at the start of the run.
 *   4. The `low`-tier short-circuit (pending_confirmation handoff).
 */

import { test, expect } from '@playwright/test';
import {
  runAgentLoopCore,
  DEFAULT_MAX_STEPS,
  DEFAULT_COST_CAP_CENTS,
  type AgentLoopDeps,
  type AgentLoopInput,
} from '../../server/services/aiAgentLoopCore';

/* ─── Helpers ─── */

function baseDeps(overrides: Partial<AgentLoopDeps> = {}): AgentLoopDeps {
  return {
    client: { messages: { create: async () => ({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } }) } },
    getModel: () => 'claude-haiku-4-5-20251001',
    gate: async () => ({ allowed: true }),
    logUsage: () => {},
    recordSpend: () => {},
    estimateCostMicroCents: () => 0,
    getActionRiskTier: () => 'auto',
    assertCircuitAllowsRequest: () => {},
    recordCircuitSuccess: () => {},
    recordCircuitFailure: () => {},
    ...overrides,
  };
}

function baseInput(overrides: Partial<AgentLoopInput> = {}): AgentLoopInput {
  return {
    systemPrompt: 'You are a helpful test assistant.',
    conversationHistory: [{ role: 'user', content: 'hi' }],
    tools: [
      {
        name: 'get_weather',
        description: 'Return the weather in a city',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
      } as any,
    ],
    toolExecutors: {
      get_weather: async (args) => ({ ok: true, narrative: `weather for ${args.city}: sunny` }),
    },
    surface: 'admin_assistant',
    actionSurface: 'admin',
    ...overrides,
  };
}

test.describe('server — W-BA-0 agent loop core', () => {
  test('runs a 2-step loop: tool_use → tool_result → final text', async () => {
    const calls: any[] = [];
    const client = {
      messages: {
        create: async (params: any) => {
          calls.push(params);
          if (calls.length === 1) {
            // Step 0 — model emits a tool_use.
            return {
              content: [
                { type: 'tool_use', id: 'tu_1', name: 'get_weather', input: { city: 'Boston' } },
              ],
              stop_reason: 'tool_use',
              usage: { input_tokens: 100, output_tokens: 20 },
            };
          }
          // Step 1 — model returns final text using the tool result.
          return {
            content: [{ type: 'text', text: 'It is sunny in Boston.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 150, output_tokens: 30 },
          };
        },
      },
    };

    const usageLogged: any[] = [];
    const spends: number[] = [];
    const result = await runAgentLoopCore(
      baseDeps({
        client,
        // 1 micro-cent / token → cheap and deterministic.
        estimateCostMicroCents: (_m, inT, outT) => (inT + outT) * 1,
        logUsage: (p) => { usageLogged.push(p); },
        recordSpend: (_s, c) => { spends.push(c); },
      }),
      baseInput(),
    );

    expect(result.status).toBe('text');
    expect(result.reply).toBe('It is sunny in Boston.');
    expect(calls.length).toBe(2); // 2 Anthropic calls
    // Steps emitted: tool_use + tool_result + final text
    const types = result.steps.map((s) => s.type);
    expect(types).toContain('tool_use');
    expect(types).toContain('tool_result');
    expect(types).toContain('text');
    // Observability: every call written with the same loop_run_id and a step_index.
    expect(usageLogged.length).toBe(2);
    expect(usageLogged.every((u) => u.loopRunId === result.loopRunId)).toBe(true);
    expect(usageLogged.map((u) => u.stepIndex)).toEqual([0, 1]);
    // Spend recorded once per Anthropic call.
    expect(spends.length).toBe(2);
  });

  test('hard cost cap stops the loop before the next Anthropic call', async () => {
    let n = 0;
    const client = {
      messages: {
        create: async () => {
          n += 1;
          return {
            content: [{ type: 'tool_use', id: `tu_${n}`, name: 'get_weather', input: { city: 'X' } }],
            stop_reason: 'tool_use',
            // 200 cents (=$2) per call after micro→cent conversion below.
            usage: { input_tokens: 2_000_000, output_tokens: 0 },
          };
        },
      },
    };
    const result = await runAgentLoopCore(
      baseDeps({
        client,
        // input_tokens=2,000,000 × 1 micro-cent each → 2_000_000 micro = 200 cents.
        estimateCostMicroCents: (_m, inT) => inT * 1,
      }),
      baseInput({ costCapCents: 100 }), // $1.00 cap
    );

    // First call costs $2; second iteration sees totalCost >= cap and stops.
    expect(result.status).toBe('cost_cap_exceeded');
    expect(n).toBe(1);
    expect(result.totalCostCents).toBeGreaterThanOrEqual(100);
  });

  test('max-steps cap stops a tool_use chain that never converges', async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: 'tool_use', id: 'tu', name: 'get_weather', input: { city: 'A' } }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    };
    const result = await runAgentLoopCore(
      baseDeps({ client }),
      baseInput({ maxSteps: 3 }),
    );
    expect(result.status).toBe('loop_limit_exceeded');
    // 3 Anthropic calls = 3 tool_use steps + 3 tool_result steps + 1 stop frame.
    expect(result.steps.filter((s) => s.type === 'tool_use').length).toBe(3);
  });

  test('gate=denied at start blocks the loop with no Anthropic call', async () => {
    let called = false;
    const client = {
      messages: { create: async () => { called = true; return { content: [], stop_reason: 'end_turn', usage: {} }; } },
    };
    const result = await runAgentLoopCore(
      baseDeps({ client, gate: async () => ({ allowed: false, reason: 'budget_exhausted' }) }),
      baseInput(),
    );
    expect(result.status).toBe('gate_blocked');
    expect(result.errorMessage).toBe('budget_exhausted');
    expect(called).toBe(false);
  });

  test('low-tier action short-circuits with pending_confirmation', async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: 'tool_use', id: 'tu_low', name: 'delete_user', input: { id: 5 } }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    };
    const result = await runAgentLoopCore(
      baseDeps({ client, getActionRiskTier: () => 'low' }),
      baseInput({
        tools: [{ name: 'delete_user', description: 'd', input_schema: { type: 'object' } } as any],
        toolExecutors: {}, // none — short-circuit must trigger BEFORE we look here.
      }),
    );
    expect(result.status).toBe('pending_confirmation');
    expect(result.pending?.action_name).toBe('delete_user');
    expect(result.pending?.args).toEqual({ id: 5 });
  });

  test('defaults: max 8 steps + $1.00 cost cap', () => {
    expect(DEFAULT_MAX_STEPS).toBe(8);
    expect(DEFAULT_COST_CAP_CENTS).toBe(100);
  });
});
