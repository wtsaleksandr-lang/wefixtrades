/**
 * Multi-step agent loop (W-BA-0) — Phase 3 foundation.
 *
 * Production wrapper around `aiAgentLoopCore.ts`. The core is dependency-
 * injected and DB-free; this file binds the real Anthropic client, the
 * surface gate (aiSystemGate), the usage logger, the spend recorder, the
 * action registry tier lookup, the cost estimator, and the circuit breaker.
 *
 * Why split: the core needs to be unit-testable from a Playwright pure-Node
 * spec without DATABASE_URL. server/db.ts throws at import if the env var
 * is unset, which would block any test that imports the gate/logger chain.
 *
 * Algorithm (delegated to the core):
 *   1. Send system + history + tool definitions to Anthropic.
 *   2. While stop_reason === "tool_use":
 *      a. Look up the action's riskTier in copilotActionRegistry.
 *      b. low/draft → short-circuit (existing confirm flow runs).
 *      c. auto    → execute, append tool_result, loop again.
 *   3. stop_reason !== "tool_use" → return final reply.
 *
 * Safety rails:
 *   - maxSteps (default 8)
 *   - costCapCents (default 100 = $1.00 per loop)
 *   - aiGateAllowed() at start AND between iterations
 *
 * Observability — every Anthropic call writes to ai_usage_logs with
 * `loop_run_id` + `step_index` (W-BA-0 migration 0029).
 */

import crypto from "crypto";
import { getSharedClient, getModel, assertCircuitAllowsRequest, recordSuccess, recordFailure } from "./aiService";
import { aiGateAllowed, recordAiSpend } from "./aiSystemGate";
import { logUsage } from "./usageTracker";
import { estimateCostMicroCents } from "./aiPricing";
import { getCopilotAction, type ActionSurface, type PendingAction } from "./copilotActionRegistry";
import { runAgentLoopCore, type AgentLoopDeps, type AgentLoopInput, type AgentLoopResult, type ToolExecutor, type AgentLoopStep } from "./aiAgentLoopCore";
import type { ChatSurface } from "./promptBuilder";
import { createLogger } from "../lib/logger";

const log = createLogger("AgentLoop");

/* Re-exports for callers that don't need the core/wrapper split. */
export type {
  AgentLoopStep,
  AgentLoopStepType,
  AgentLoopStatus,
  AgentLoopResult,
  AgentLoopInput,
  ToolExecutor,
} from "./aiAgentLoopCore";

/* ─── Bound dependencies ─── */

function bindDeps(): AgentLoopDeps {
  return {
    client: getSharedClient(),
    getModel,
    gate: (surface) => aiGateAllowed(surface),
    logUsage: (params) => {
      logUsage({
        model: params.model,
        surface: params.surface as ChatSurface,
        provider: "anthropic",
        channel: "agent_loop",
        userId: params.userId,
        sessionId: params.sessionId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        latencyMs: params.latencyMs,
        success: params.success,
        errorMessage: params.errorMessage,
        loopRunId: params.loopRunId,
        stepIndex: params.stepIndex,
      }).catch(() => {});
    },
    recordSpend: (surface, cents) => {
      recordAiSpend(surface, cents).catch(() => {});
    },
    estimateCostMicroCents,
    getActionRiskTier: (surface, name) => getCopilotAction(surface, name)?.riskTier,
    assertCircuitAllowsRequest,
    recordCircuitSuccess: recordSuccess,
    recordCircuitFailure: recordFailure,
    log,
  };
}

/* ─── Public entry ─── */

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
  return runAgentLoopCore(bindDeps(), input);
}

/**
 * Convenience adapter: build a `ToolExecutor` from a registered CopilotAction.
 *
 * For `auto`-tier actions registered in copilotActionRegistry, this wraps the
 * existing action.execute() so the loop can call it the same way the confirm
 * flow does — synthesising a PendingAction shape under the hood. The action's
 * own audit logging + arg re-validation runs as normal.
 *
 * (As of W-BA-0 no action ships as `auto` — that's BA-1's job. This helper
 * exists so BA-1 doesn't need to touch the loop itself.)
 */
export function executorFromCopilotAction(
  actionName: string,
  actionSurface: ActionSurface,
): ToolExecutor {
  return async (args, ctx) => {
    const action = getCopilotAction(actionSurface, actionName);
    if (!action) throw new Error(`Action "${actionName}" not registered for surface "${actionSurface}"`);
    if (action.riskTier !== "auto") {
      throw new Error(`Action "${actionName}" is tier "${action.riskTier}" — must be "auto" to run inside the loop.`);
    }
    if (typeof ctx.userId !== "number") {
      throw new Error(`Action "${actionName}" requires a userId on the loop context.`);
    }
    const pending: PendingAction = {
      call_id: crypto.randomUUID(),
      surface: actionSurface,
      action_name: actionName,
      args,
      user_id: ctx.userId,
      session_id: ctx.sessionId ?? `loop_${ctx.loopRunId}`,
      expires: Date.now() + 5 * 60 * 1000,
    };
    const result = await action.execute(pending, ctx.userId);
    return { ok: true, narrative: result.narrative };
  };
}
