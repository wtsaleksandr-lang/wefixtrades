/**
 * Pure core of the multi-step agent loop (W-BA-0).
 *
 * This module has NO database imports and NO singleton dependencies — it
 * receives every collaborator (Anthropic client, gate check, usage logger,
 * spend recorder, action-tier lookup, cost estimator, circuit breaker) by
 * argument. That makes the loop directly unit-testable from a Playwright
 * pure-Node spec without DATABASE_URL.
 *
 * The wrapper `aiAgentLoop.ts` binds the real implementations from the
 * surrounding services (aiSystemGate, usageTracker, aiPricing, etc.) and
 * is the only entry point production code uses.
 */

import crypto from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { ActionRiskTier, ActionSurface } from "./copilotActionRegistry";
import type { ChatMessage } from "./aiService";

/* ─── Constants ─── */
export const DEFAULT_MAX_STEPS = 8;
export const DEFAULT_COST_CAP_CENTS = 100; // $1.00 hard ceiling per run
export const DEFAULT_MAX_TOKENS = 1024;

/* ─── Step / status types ─── */
export type AgentLoopStepType = "tool_use" | "tool_result" | "text" | "stop";

export interface AgentLoopStep {
  index: number;
  type: AgentLoopStepType;
  payload: any;
  cost_cents?: number;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: {
    userId?: number;
    clientId?: number;
    sessionId?: string;
    surface: string;
    loopRunId: string;
    stepIndex: number;
  },
) => Promise<unknown> | unknown;

export type AgentLoopStatus =
  | "text"
  | "pending_confirmation"
  | "loop_limit_exceeded"
  | "cost_cap_exceeded"
  | "gate_blocked"
  | "tool_executor_missing"
  | "error";

export interface AgentLoopResult {
  status: AgentLoopStatus;
  reply: string;
  steps: AgentLoopStep[];
  loopRunId: string;
  totalCostCents: number;
  pending?: {
    action_name: string;
    args: Record<string, unknown>;
    tool_use_id: string;
  };
  errorMessage?: string;
}

/* ─── Collaborator interfaces (injected by the wrapper) ─── */

export interface AgentLoopDeps {
  /** Anthropic client (or stub). Must expose `.messages.create(params)`. */
  client: { messages: { create: (params: any) => Promise<any> } };
  /** Resolve the model id for this run. */
  getModel: () => string;
  /** Surface-level kill switch + monthly budget check. */
  gate: (surface: string) => Promise<{ allowed: boolean; reason?: string }>;
  /** Log one Anthropic call to ai_usage_logs. Fire-and-forget. */
  logUsage: (params: {
    model: string;
    surface: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
    success: boolean;
    errorMessage?: string;
    userId?: number;
    sessionId?: string;
    loopRunId: string;
    stepIndex: number;
  }) => void;
  /** Add `cents` to the surface's monthly_spent_cents. Fire-and-forget. */
  recordSpend: (surface: string, cents: number) => void;
  /** Convert tokens to micro-cents (USD × 1,000,000). */
  estimateCostMicroCents: (model: string, inputTokens: number, outputTokens: number) => number;
  /** Resolve an action's risk tier. Undefined when the tool isn't registered. */
  getActionRiskTier: (surface: ActionSurface, name: string) => ActionRiskTier | undefined;
  /** Circuit breaker pre-call check — throws when open. */
  assertCircuitAllowsRequest: () => void;
  recordCircuitSuccess: () => void;
  recordCircuitFailure: () => void;
  /** Optional logger; falls back to no-op. */
  log?: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}

export interface AgentLoopInput {
  systemPrompt: string;
  conversationHistory: ChatMessage[];
  tools: Anthropic.Tool[];
  toolExecutors: Record<string, ToolExecutor>;
  surface: string;
  actionSurface?: ActionSurface;
  userId?: number;
  clientId?: number;
  sessionId?: string;
  maxSteps?: number;
  costCapCents?: number;
  modelOverride?: string;
  maxTokensPerStep?: number;
  onStep?: (step: AgentLoopStep) => void;
}

/* ─── Pure helpers ─── */

function microCentsToCents(microCents: number): number {
  return microCents / 10_000;
}

function buildCachedSystem(text: string) {
  return [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } } as any];
}

/**
 * Add cache_control: ephemeral to the LAST tool definition in the array.
 * Anthropic caches every block up through (and including) the last block
 * carrying a cache_control marker — so marking just the trailing tool
 * caches the entire tool schema. Saves ~15-25% input tokens on multi-turn
 * loops where the tools array is large and unchanged across steps.
 *
 * Returns a NEW array (does not mutate the caller's tool list).
 */
function withCachedTools(tools: Anthropic.Tool[] | undefined): any[] | undefined {
  if (!tools?.length) return tools as any;
  const out = tools.slice() as any[];
  const last = out[out.length - 1];
  out[out.length - 1] = { ...last, cache_control: { type: "ephemeral" as const } };
  return out;
}

export function extractToolUses(content: Array<{ type: string; [k: string]: any }>) {
  const out: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  for (const block of content) {
    if (block?.type === "tool_use") {
      out.push({
        id: String(block.id),
        name: String(block.name),
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return out;
}

export function extractText(content: Array<{ type: string; [k: string]: any }>): string {
  let text = "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }
  return text;
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/* ─── Core loop ─── */

export async function runAgentLoopCore(
  deps: AgentLoopDeps,
  input: AgentLoopInput,
): Promise<AgentLoopResult> {
  const loopRunId = crypto.randomUUID();
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const costCapCents = input.costCapCents ?? DEFAULT_COST_CAP_CENTS;
  const model = input.modelOverride || deps.getModel();
  const maxTokens = input.maxTokensPerStep ?? DEFAULT_MAX_TOKENS;
  const actionSurface: ActionSurface = input.actionSurface ?? "admin";
  const log = deps.log;

  const steps: AgentLoopStep[] = [];
  let totalCostCents = 0;
  let assistantReply = "";

  const initialGate = await deps.gate(input.surface);
  if (!initialGate.allowed) {
    log?.warn("loop blocked by gate at start", { surface: input.surface, reason: initialGate.reason });
    return {
      status: "gate_blocked",
      reply: "",
      steps,
      loopRunId,
      totalCostCents,
      errorMessage: initialGate.reason,
    };
  }

  const conversation: Anthropic.MessageParam[] = toAnthropicMessages(input.conversationHistory);

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    if (stepIndex > 0) {
      const gateMid = await deps.gate(input.surface);
      if (!gateMid.allowed) {
        log?.warn("loop blocked by gate mid-run", { surface: input.surface, stepIndex });
        steps.push({ index: stepIndex, type: "stop", payload: { reason: gateMid.reason } });
        return {
          status: "gate_blocked",
          reply: assistantReply,
          steps,
          loopRunId,
          totalCostCents,
          errorMessage: gateMid.reason,
        };
      }
    }

    if (totalCostCents >= costCapCents) {
      log?.warn("loop hit cost cap", { surface: input.surface, totalCostCents, costCapCents });
      steps.push({ index: stepIndex, type: "stop", payload: { reason: "cost_cap_exceeded", totalCostCents } });
      return {
        status: "cost_cap_exceeded",
        reply: assistantReply,
        steps,
        loopRunId,
        totalCostCents,
      };
    }

    deps.assertCircuitAllowsRequest();
    const tStart = Date.now();
    let response: any;
    try {
      response = await deps.client.messages.create({
        model,
        max_tokens: maxTokens,
        system: buildCachedSystem(input.systemPrompt),
        messages: conversation,
        tools: withCachedTools(input.tools) as any,
      });
      deps.recordCircuitSuccess();
    } catch (err: any) {
      deps.recordCircuitFailure();
      log?.error("loop anthropic call failed", { surface: input.surface, stepIndex, error: err?.message });
      deps.logUsage({
        model,
        surface: input.surface,
        latencyMs: Date.now() - tStart,
        success: false,
        errorMessage: err?.message?.slice(0, 500),
        userId: input.userId,
        sessionId: input.sessionId,
        loopRunId,
        stepIndex,
      });
      steps.push({ index: stepIndex, type: "stop", payload: { reason: "anthropic_error", error: err?.message } });
      return {
        status: "error",
        reply: assistantReply,
        steps,
        loopRunId,
        totalCostCents,
        errorMessage: err?.message || "Anthropic call failed",
      };
    }

    const usage = response.usage as any;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const microCents = deps.estimateCostMicroCents(model, inputTokens, outputTokens);
    const stepCostCents = microCentsToCents(microCents);
    totalCostCents += stepCostCents;

    deps.logUsage({
      model,
      surface: input.surface,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - tStart,
      success: true,
      userId: input.userId,
      sessionId: input.sessionId,
      loopRunId,
      stepIndex,
    });
    deps.recordSpend(input.surface, stepCostCents);

    const text = extractText(response.content);
    if (text) assistantReply += text;

    if (response.stop_reason !== "tool_use") {
      const step: AgentLoopStep = {
        index: stepIndex,
        type: "text",
        payload: { text, stop_reason: response.stop_reason },
        cost_cents: stepCostCents,
      };
      steps.push(step);
      input.onStep?.(step);
      return {
        status: "text",
        reply: assistantReply,
        steps,
        loopRunId,
        totalCostCents,
      };
    }

    const toolUses = extractToolUses(response.content);
    if (!toolUses.length) {
      steps.push({ index: stepIndex, type: "stop", payload: { reason: "tool_use_block_missing" } });
      return {
        status: "error",
        reply: assistantReply,
        steps,
        loopRunId,
        totalCostCents,
        errorMessage: "stop_reason was tool_use but no tool_use block found",
      };
    }

    conversation.push({ role: "assistant", content: response.content });

    const toolResultBlocks: any[] = [];
    for (const tu of toolUses) {
      const stepStart = stepIndex;
      const useStep: AgentLoopStep = {
        index: stepStart,
        type: "tool_use",
        payload: { id: tu.id, name: tu.name, input: tu.input },
        cost_cents: stepCostCents,
      };
      steps.push(useStep);
      input.onStep?.(useStep);

      const tier = deps.getActionRiskTier(actionSurface, tu.name);

      if (tier === "low" || tier === "draft") {
        log?.info("loop short-circuit — confirm-required action", { tool: tu.name, tier });
        steps.push({
          index: stepStart + 1,
          type: "stop",
          payload: { reason: "pending_confirmation", tool: tu.name, tier },
        });
        return {
          status: "pending_confirmation",
          reply: assistantReply,
          steps,
          loopRunId,
          totalCostCents,
          pending: { action_name: tu.name, args: tu.input, tool_use_id: tu.id },
        };
      }

      const executor = input.toolExecutors[tu.name];
      if (!executor) {
        log?.warn("loop tool has no executor", { tool: tu.name });
        steps.push({
          index: stepStart + 1,
          type: "stop",
          payload: { reason: "tool_executor_missing", tool: tu.name },
        });
        return {
          status: "tool_executor_missing",
          reply: assistantReply,
          steps,
          loopRunId,
          totalCostCents,
          errorMessage: `Tool "${tu.name}" has no registered executor.`,
        };
      }

      let toolResult: unknown;
      let isError = false;
      try {
        toolResult = await executor(tu.input, {
          userId: input.userId,
          clientId: input.clientId,
          sessionId: input.sessionId,
          surface: input.surface,
          loopRunId,
          stepIndex: stepStart,
        });
      } catch (err: any) {
        log?.error("loop tool executor threw", { tool: tu.name, error: err?.message });
        toolResult = { error: err?.message || "Tool execution failed" };
        isError = true;
      }

      const resultStep: AgentLoopStep = {
        index: stepStart,
        type: "tool_result",
        payload: { tool_use_id: tu.id, tool: tu.name, result: toolResult, is_error: isError },
      };
      steps.push(resultStep);
      input.onStep?.(resultStep);

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        ...(isError ? { is_error: true } : {}),
      });
    }

    conversation.push({ role: "user", content: toolResultBlocks });
  }

  log?.warn("loop hit max steps", { surface: input.surface, maxSteps, totalCostCents });
  steps.push({ index: maxSteps, type: "stop", payload: { reason: "loop_limit_exceeded", maxSteps } });
  return {
    status: "loop_limit_exceeded",
    reply: assistantReply,
    steps,
    loopRunId,
    totalCostCents,
  };
}
