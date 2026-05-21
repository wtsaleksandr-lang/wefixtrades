/**
 * Wave W-BB-1 — customer-facing multi-step AI in the widget.
 *
 * Exercises `runAgentLoopCore` (the DI'd core under server/services/
 * aiAgentLoopCore.ts) with a stubbed Anthropic client that simulates a
 * full customer journey: compute quote → propose times → book → email
 * confirmation → final summary. No DATABASE_URL needed — the core is
 * deliberately DB-free and the tool executors are inline stubs.
 *
 * Also covers:
 *   - Non-auto-tier short-circuit: a `low` tier tool aborts the loop with
 *     `pending_confirmation` instead of executing (defence-in-depth for
 *     the customer surface).
 *   - 25¢ per-conversation cost cap honoured.
 */

import { test, expect } from '@playwright/test';
import {
  runAgentLoopCore,
  type AgentLoopDeps,
  type AgentLoopInput,
} from '../../server/services/aiAgentLoopCore';

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

test.describe('server — W-BB-1 customer-widget multi-step loop', () => {
  test('simulates a full customer journey: quote → propose → book → email → summary', async () => {
    // Stub Anthropic that walks through the customer's chained ask.
    let step = 0;
    const sequence: any[] = [
      // Customer: "what's my quote with an extra room?"
      {
        content: [{ type: 'tool_use', id: 'tu_1', name: 'update_my_quote_with_addons', input: { base_amount: 1200, addons: [{ label: 'Extra room', amount: 250 }] } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 30 },
      },
      // Customer: "can I book next Tuesday?"
      {
        content: [{ type: 'tool_use', id: 'tu_2', name: 'propose_appointment_times', input: { days_ahead: 7 } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 120, output_tokens: 30 },
      },
      // AI: picks the first available slot
      {
        content: [{ type: 'tool_use', id: 'tu_3', name: 'book_appointment', input: { start_iso: '2026-06-02T13:00:00.000Z' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 140, output_tokens: 30 },
      },
      // AI: send the customer their estimate
      {
        content: [{ type: 'tool_use', id: 'tu_4', name: 'send_quote_confirmation_email', input: { computed_total: 1450 } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 160, output_tokens: 30 },
      },
      // Final summary text.
      {
        content: [{ type: 'text', text: "All set — your $1,450 quote is in your inbox and you're booked for next Tuesday at 9 AM." }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 180, output_tokens: 50 },
      },
    ];

    const client = {
      messages: {
        create: async () => sequence[step++],
      },
    };

    const callsByTool: Record<string, unknown[]> = {};
    const stub = (name: string, payload: any) => async (args: unknown) => {
      (callsByTool[name] ||= []).push(args);
      return payload;
    };

    const input: AgentLoopInput = {
      systemPrompt: 'You are the customer-facing AI for Acme Plumbing.',
      conversationHistory: [{ role: 'user', content: 'help me book + email me my quote' }],
      tools: [
        { name: 'update_my_quote_with_addons', description: 'recompute', input_schema: { type: 'object' } as any },
        { name: 'propose_appointment_times', description: 'find slots', input_schema: { type: 'object' } as any },
        { name: 'book_appointment', description: 'book', input_schema: { type: 'object' } as any },
        { name: 'send_quote_confirmation_email', description: 'email', input_schema: { type: 'object' } as any },
      ] as any,
      toolExecutors: {
        update_my_quote_with_addons: stub('update_my_quote_with_addons', { new_total: 1450 }),
        propose_appointment_times: stub('propose_appointment_times', { slots: [{ start: '2026-06-02T13:00:00.000Z', end: '2026-06-02T13:30:00.000Z', available: true }] }),
        book_appointment: stub('book_appointment', { ok: true, appointment_id: 42 }),
        send_quote_confirmation_email: stub('send_quote_confirmation_email', { ok: true, sent_to: 'alex@example.com' }),
      },
      surface: 'quotequick_widget_ai',
      actionSurface: 'customer-widget',
      sessionId: 'test_sess',
      costCapCents: 25,
      maxSteps: 8,
    };

    const result = await runAgentLoopCore(baseDeps({ client }), input);

    expect(result.status).toBe('text');
    expect(result.reply).toMatch(/booked/i);
    // All four auto-tier tools were invoked exactly once in order.
    expect(callsByTool.update_my_quote_with_addons?.length).toBe(1);
    expect(callsByTool.propose_appointment_times?.length).toBe(1);
    expect(callsByTool.book_appointment?.length).toBe(1);
    expect(callsByTool.send_quote_confirmation_email?.length).toBe(1);
    // 4 tool_use + 4 tool_result + 1 final text == 9 steps.
    expect(result.steps.filter((s) => s.type === 'tool_use').length).toBe(4);
    expect(result.steps.filter((s) => s.type === 'tool_result').length).toBe(4);
    expect(result.steps.filter((s) => s.type === 'text').length).toBe(1);
  });

  test('short-circuits when the AI tries a non-auto-tier tool', async () => {
    // The model "tries" to call a tool registered as `low` tier — the loop
    // must abort with pending_confirmation rather than execute. This proves
    // the BA-0 safety contract still holds on the customer surface.
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: 'tool_use', id: 'tu_low', name: 'delete_account', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
      },
    };
    const result = await runAgentLoopCore(
      baseDeps({ client, getActionRiskTier: () => 'low' }),
      {
        systemPrompt: 's',
        conversationHistory: [{ role: 'user', content: 'do dangerous thing' }],
        tools: [{ name: 'delete_account', description: 'd', input_schema: { type: 'object' } as any }] as any,
        toolExecutors: {}, // none — short-circuit must fire BEFORE executor lookup
        surface: 'quotequick_widget_ai',
        actionSurface: 'customer-widget',
        costCapCents: 25,
      },
    );
    expect(result.status).toBe('pending_confirmation');
    expect(result.pending?.action_name).toBe('delete_account');
  });

  test('25¢ per-conversation cost cap halts the loop', async () => {
    let n = 0;
    const client = {
      messages: {
        create: async () => {
          n += 1;
          return {
            content: [{ type: 'tool_use', id: `tu_${n}`, name: 'propose_appointment_times', input: {} }],
            stop_reason: 'tool_use',
            // 30¢ per call after micro→cent conversion below.
            usage: { input_tokens: 300_000, output_tokens: 0 },
          };
        },
      },
    };
    const result = await runAgentLoopCore(
      baseDeps({ client, estimateCostMicroCents: (_m, inT) => inT * 1 }),
      {
        systemPrompt: 's',
        conversationHistory: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 'propose_appointment_times', description: 'd', input_schema: { type: 'object' } as any }] as any,
        toolExecutors: {
          propose_appointment_times: async () => ({ slots: [] }),
        },
        surface: 'quotequick_widget_ai',
        actionSurface: 'customer-widget',
        costCapCents: 25,
      },
    );
    // First call costs 30¢; second iteration sees totalCost >= 25 and stops.
    expect(result.status).toBe('cost_cap_exceeded');
    expect(n).toBe(1);
    expect(result.totalCostCents).toBeGreaterThanOrEqual(25);
  });
});
