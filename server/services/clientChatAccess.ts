/**
 * Customer-widget AI assistant access gate — PURE, dependency-injected.
 *
 * Extracted from the inline checks in POST /api/ai/client-chat (aiRoutes.ts)
 * so the gate logic is unit-testable without express/DB wiring (same
 * pattern as quoteWidgetDistanceRoutes.ts → processDistanceRequest).
 *
 * Gate order (mirrors the route's historical behaviour exactly, plus the
 * new per-calculator daily conversation cap):
 *   1. `enabled !== true`            → 403 (assistant off for this calculator)
 *   2. trial older than 14 days      → 403 `trial_expired` (DORMANT premium
 *      machinery — free activation never sets `trial`, but calculators that
 *      entered a trial before the free-included pivot keep the honest path;
 *      wire code unchanged for cached embed bundles in the wild)
 *   3. `subscription_status === 'inactive'` → 403
 *   4. NEW conversation over the per-calculator daily cap → 503 graceful
 *      "assistant unavailable right now" (the same honest soft-fail shape
 *      the budget gate uses; never a silent fail). Follow-up messages of an
 *      ongoing conversation are NOT counted — a customer mid-chat is never
 *      cut off.
 *
 * This module must stay import-light (types only) so the test can drive it
 * without DATABASE_URL.
 */

export const TRIAL_DAYS = 14;

/** Shape of `calculator_settings.ai_employee` as the gate consumes it. */
export interface AiEmployeeSettings {
  enabled?: boolean;
  subscription_status?: string;
  trial_started_at?: number | null;
  plan?: string | null;
}

export interface ClientChatGateDeps {
  /** Per-calculator daily conversation cap (rateLimiter singleton pattern). */
  convsPerCalcPerDayLimiter: { check(key: string): Promise<boolean> };
  /** Clock injection for trial-window tests. Defaults to Date.now. */
  now?: () => number;
}

export interface ClientChatGateInput {
  aiEmployee: AiEmployeeSettings;
  calculatorId: number;
  /**
   * True when this request STARTS a conversation (the bubble sends the full
   * history, so the first user message arrives as `messages.length === 1`).
   * Only conversation starts consume the daily cap.
   */
  isConversationStart: boolean;
}

export type ClientChatGateResult =
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      body: { error: string; message?: string };
    };

/** Key the daily cap on the calculator, not the visitor. */
export function convsCapKey(calculatorId: number): string {
  return `widget-ai-convs:calc:${calculatorId}`;
}

export async function checkClientChatAccess(
  deps: ClientChatGateDeps,
  input: ClientChatGateInput,
): Promise<ClientChatGateResult> {
  const { aiEmployee, calculatorId, isConversationStart } = input;
  const now = deps.now ?? Date.now;

  if (!aiEmployee.enabled) {
    return {
      allowed: false,
      status: 403,
      body: { error: "AI Employee is not enabled for this calculator" },
    };
  }

  const subscriptionStatus = aiEmployee.subscription_status || "inactive";
  if (subscriptionStatus === "trial" && aiEmployee.trial_started_at) {
    const trialDays = (now() - aiEmployee.trial_started_at) / (1000 * 60 * 60 * 24);
    if (trialDays > TRIAL_DAYS) {
      // Wire code keeps its legacy value — cached embed-widget bundles
      // in the wild still match on "trial_expired". The human-readable
      // message is the honest Pro-preview phrasing.
      return {
        allowed: false,
        status: 403,
        body: {
          error: "trial_expired",
          message:
            "The AI assistant's Pro preview has ended — upgrade to Pro to turn it back on",
        },
      };
    }
  } else if (subscriptionStatus === "inactive") {
    return {
      allowed: false,
      status: 403,
      body: { error: "AI Employee subscription is not active" },
    };
  }

  if (isConversationStart) {
    const underCap = await deps.convsPerCalcPerDayLimiter.check(convsCapKey(calculatorId));
    if (!underCap) {
      // Graceful, honest soft-fail — same 503 shape the budget/system gate
      // uses elsewhere in aiRoutes. The bubble renders it as an inline
      // error banner; the conversation history is preserved client-side.
      return {
        allowed: false,
        status: 503,
        body: {
          error: "The assistant is unavailable right now. Please try again shortly.",
        },
      };
    }
  }

  return { allowed: true };
}
