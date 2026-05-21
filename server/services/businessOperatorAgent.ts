/**
 * Business Operator AI — core decision loop (Wave W-AV-1).
 *
 * Hourly cron entrypoint (server/jobs/businessOperatorWorker.ts) calls
 * `runBusinessOperatorTick()`. For each playbook:
 *
 *   1. Run `detect()` to get DetectorSignal[].
 *   2. Upsert one admin_ai_actions row per signal (dedup by playbook,
 *      signal_id where status='pending').
 *   3. For each pending row without ai_reasoning, call Claude (Haiku 4.5)
 *      with a tight prompt. Two-attempt retry policy with 1s + 5s backoff.
 *   4. On Claude success: store proposed_action + reasoning + token usage.
 *      On Claude failure: status='claude_failed' + fire admin alert.
 *   5. Auto-execute check: only if playbook.auto_enabled AND
 *      consecutive_approvals >= 3 AND proposed_action passes allowlist.
 *      Otherwise status='escalated' (the admin must approve in the UI).
 *
 * Budget: cumulative monthly spend tracked in admin_ai_budget. When
 * spent_cents >= cap_cents, Claude calls are skipped — actions still
 * created but marked 'pending_no_ai_budget'.
 *
 * Kill switch: env `ADMIN_AI_KILL_SWITCH=1` halts the loop at tick start.
 */

import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  adminAiActions,
  adminAiBudget,
  adminAiPlaybookState,
  ADMIN_AI_PLAYBOOKS,
  ADMIN_AI_INPUT_USD_PER_M,
  ADMIN_AI_OUTPUT_USD_PER_M,
  ADMIN_AI_AUTO_UNLOCK_APPROVALS,
  type AdminAiAction,
  type AdminAiPlaybook,
} from "@shared/schema";
import { DETECTORS } from "./businessOperator/detectors";
import { EXECUTORS } from "./businessOperator/executors";
import type { DetectorSignal } from "./businessOperator/types";
import { fireAlert } from "./alertService";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";
import {
  assertCircuitAllowsRequest,
  getSharedClient,
  getModel,
  recordFailure,
  recordSuccess,
} from "./aiService";

const log = createLogger("BusinessOperatorAgent");

const KILL_SWITCH_ENV = "ADMIN_AI_KILL_SWITCH";
const RETRY_BACKOFFS_MS = [1000, 5000];
const MAX_TOKENS = 600;

interface TickResult {
  ranAt: string;
  killSwitchOn: boolean;
  budgetExhausted: boolean;
  signalsDetected: number;
  actionsInserted: number;
  claudeCalls: number;
  claudeFailures: number;
  autoExecuted: number;
  escalated: number;
  costCentsThisTick: number;
}

export function isKillSwitchOn(): boolean {
  return process.env[KILL_SWITCH_ENV] === "1" || process.env[KILL_SWITCH_ENV] === "true";
}

/** YYYY-MM in UTC. */
function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Cost in *cents* for one Claude call (input_tokens + output_tokens). */
function computeCostCents(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * ADMIN_AI_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * ADMIN_AI_OUTPUT_USD_PER_M;
  return Math.ceil(usd * 100);
}

/** Read or create the row for this month. */
async function getOrCreateBudget(): Promise<{ id: number; spent_cents: number; cap_cents: number; alerts_sent: string[] }> {
  const month = currentMonth();
  const existing = await db
    .select()
    .from(adminAiBudget)
    .where(eq(adminAiBudget.month, month))
    .limit(1);
  if (existing[0]) {
    return {
      id: existing[0].id,
      spent_cents: existing[0].spent_cents ?? 0,
      cap_cents: existing[0].cap_cents ?? 5000,
      alerts_sent: (existing[0].alerts_sent as string[] | null) ?? [],
    };
  }
  const inserted = await db
    .insert(adminAiBudget)
    .values({ month })
    .returning();
  return {
    id: inserted[0].id,
    spent_cents: inserted[0].spent_cents ?? 0,
    cap_cents: inserted[0].cap_cents ?? 5000,
    alerts_sent: (inserted[0].alerts_sent as string[] | null) ?? [],
  };
}

async function addToBudget(costCents: number): Promise<void> {
  const month = currentMonth();
  await db
    .update(adminAiBudget)
    .set({
      spent_cents: sql`${adminAiBudget.spent_cents} + ${costCents}`,
      updated_at: new Date(),
    })
    .where(eq(adminAiBudget.month, month));
}

async function maybeFireBudgetAlerts(beforeCents: number, afterCents: number, capCents: number, alertsSent: string[]): Promise<void> {
  const pct80 = capCents * 0.8;
  const pct100 = capCents;
  const month = currentMonth();
  const toFire: string[] = [];
  if (beforeCents < pct80 && afterCents >= pct80 && !alertsSent.includes("80pct")) {
    toFire.push("80pct");
    await fireAlert({
      severity: "warning",
      category: "business_operator_ai",
      title: `BO-AI budget at 80% for ${month}`,
      details: `Spent ${(afterCents / 100).toFixed(2)} / ${(capCents / 100).toFixed(2)} USD`,
    });
  }
  if (beforeCents < pct100 && afterCents >= pct100 && !alertsSent.includes("100pct")) {
    toFire.push("100pct");
    await fireAlert({
      severity: "critical",
      category: "business_operator_ai",
      title: `BO-AI budget cap hit for ${month}`,
      details: `Spent ${(afterCents / 100).toFixed(2)} / ${(capCents / 100).toFixed(2)} USD — Claude calls paused`,
    });
  }
  if (toFire.length > 0) {
    await db
      .update(adminAiBudget)
      .set({
        alerts_sent: [...alertsSent, ...toFire],
        updated_at: new Date(),
      })
      .where(eq(adminAiBudget.month, month));
  }
}

/** Upsert the per-playbook state row if missing. */
async function ensurePlaybookState(playbook: AdminAiPlaybook): Promise<typeof adminAiPlaybookState.$inferSelect> {
  const existing = await db.select().from(adminAiPlaybookState).where(eq(adminAiPlaybookState.playbook, playbook)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(adminAiPlaybookState)
    .values({ playbook })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  // Race: re-read.
  const reread = await db.select().from(adminAiPlaybookState).where(eq(adminAiPlaybookState.playbook, playbook)).limit(1);
  return reread[0];
}

/** Insert one admin_ai_action row, deduped on (playbook, signal_id where pending). */
async function upsertAction(playbook: AdminAiPlaybook, signal: DetectorSignal): Promise<AdminAiAction | null> {
  // Drizzle's onConflictDoNothing targets unique indexes on full columns;
  // our dedup is a partial unique index, so we use raw SQL ON CONFLICT.
  const id = randomUUID();
  const rows = await db.execute(sql`
    INSERT INTO ${adminAiActions} (id, playbook, signal_id, status, severity, summary, detail)
    VALUES (${id}, ${playbook}, ${signal.signal_id}, 'pending', ${signal.severity}, ${signal.summary}, ${JSON.stringify(signal.detail)}::jsonb)
    ON CONFLICT ON CONSTRAINT admin_ai_actions_dedup_idx DO NOTHING
    RETURNING *
  `) as unknown as { rows: AdminAiAction[] };
  return rows.rows[0] ?? null;
}

/** Pending rows without ai_reasoning, ordered oldest-first. */
async function listPendingActionsNeedingAi(): Promise<AdminAiAction[]> {
  return db
    .select()
    .from(adminAiActions)
    .where(and(eq(adminAiActions.status, "pending"), sql`${adminAiActions.ai_reasoning} IS NULL`))
    .orderBy(adminAiActions.created_at)
    .limit(50);
}

/** Build the Claude prompt for one action. */
function buildPrompt(action: AdminAiAction): { system: string; user: string } {
  const system =
    "You are the Business Operator AI for WeFixTrades. You receive one operational signal and must decide what action a human admin should take. " +
    "Be concise, decisive, and never invent facts. Output strict JSON only, matching: " +
    `{ "proposed_action": { "type": string, ...args }, "reasoning": string, "urgency": "low"|"medium"|"high"|"critical" }. ` +
    "Allowed action types per playbook: " +
    "stuck_submissions=['notify_admin','send_followup_email']; " +
    "past_due_subs=['notify_admin','escalate_dunning']; " +
    "unassigned_webfix=['notify_admin','assign_default_supplier']; " +
    "draft_calculators=['notify_admin','send_nudge_email']; " +
    "bot_submissions=['notify_admin','flag_for_review']. " +
    "If unsure, choose notify_admin.";
  const user = JSON.stringify({
    playbook: action.playbook,
    signal_id: action.signal_id,
    severity: action.severity,
    summary: action.summary,
    detail: action.detail,
  });
  return { system, user };
}

interface ClaudeResult {
  proposed_action: Record<string, unknown> | null;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
}

async function callClaude(action: AdminAiAction): Promise<ClaudeResult> {
  assertCircuitAllowsRequest();
  const client = getSharedClient();
  const { system, user } = buildPrompt(action);

  const resp = await client.messages.create({
    model: getModel(),
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });

  const usage = resp.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const block = resp.content?.[0];
  const text = block && block.type === "text" ? block.text : "";

  let parsed: { proposed_action?: Record<string, unknown>; reasoning?: string } = {};
  try {
    // Try direct parse first; some models wrap with ```json.
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: keep reasoning, no action.
    parsed = { reasoning: text };
  }

  return {
    proposed_action: parsed.proposed_action ?? null,
    reasoning: String(parsed.reasoning ?? text).slice(0, 4000),
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

/** Retry: 2 attempts total, exponential 1s / 5s. Throws after final failure. */
async function callClaudeWithRetry(action: AdminAiAction): Promise<{ result: ClaudeResult; attempts: number }> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      const result = await callClaude(action);
      recordSuccess();
      return { result, attempts: attempt + 1 };
    } catch (err: any) {
      lastErr = err;
      recordFailure();
      if (attempt < RETRY_BACKOFFS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFFS_MS[attempt]));
      }
    }
  }
  throw lastErr ?? new Error("Claude call failed");
}

async function maybeAutoExecute(action: AdminAiAction): Promise<boolean> {
  const playbook = action.playbook as AdminAiPlaybook;
  const state = await ensurePlaybookState(playbook);
  if (!state?.auto_enabled) return false;
  if ((state.consecutive_approvals ?? 0) < ADMIN_AI_AUTO_UNLOCK_APPROVALS) return false;

  const executor = EXECUTORS[playbook];
  if (!executor) return false;
  const result = await executor(action);
  if (!result.ok) {
    log.warn("Auto-execute refused by executor", { actionId: action.id, message: result.message });
    return false;
  }

  await db
    .update(adminAiActions)
    .set({
      status: "auto_executed",
      executed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(adminAiActions.id, action.id));

  await db
    .update(adminAiPlaybookState)
    .set({
      last_auto_executed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(adminAiPlaybookState.playbook, playbook));

  writeAudit({
    actorId: "cron",
    actorType: "system",
    action: "auto_execute",
    entityType: "admin_ai_action",
    entityId: action.id,
    metadata: { playbook, summary: action.summary, executor_message: result.message },
  });

  return true;
}

/** Mark a pending action as escalated (the default v1 path). */
async function escalateAction(action: AdminAiAction): Promise<void> {
  await db
    .update(adminAiActions)
    .set({ status: "escalated", updated_at: new Date() })
    .where(eq(adminAiActions.id, action.id));

  await fireAlert({
    severity: action.severity === "critical" ? "critical" : action.severity === "high" ? "warning" : "info",
    category: "business_operator_ai",
    title: `BO-AI escalation: ${action.summary}`,
    details: action.ai_reasoning ?? "(no reasoning)",
    metadata: { action_id: action.id, playbook: action.playbook },
  });

  writeAudit({
    actorId: "cron",
    actorType: "system",
    action: "escalate",
    entityType: "admin_ai_action",
    entityId: action.id,
    metadata: { playbook: action.playbook, summary: action.summary },
  });
}

/* ────────────────────────────────────────────────────────────────────── */

export async function runBusinessOperatorTick(): Promise<TickResult> {
  const ranAt = new Date().toISOString();
  if (isKillSwitchOn()) {
    log.warn("Kill switch ON — skipping tick");
    return {
      ranAt,
      killSwitchOn: true,
      budgetExhausted: false,
      signalsDetected: 0,
      actionsInserted: 0,
      claudeCalls: 0,
      claudeFailures: 0,
      autoExecuted: 0,
      escalated: 0,
      costCentsThisTick: 0,
    };
  }

  // 1. Detect signals + upsert action rows.
  let signalsDetected = 0;
  let actionsInserted = 0;
  for (const { playbook, detect } of DETECTORS) {
    try {
      const signals = await detect();
      signalsDetected += signals.length;
      for (const sig of signals) {
        const row = await upsertAction(playbook, sig);
        if (row) {
          actionsInserted++;
          writeAudit({
            actorId: "cron",
            actorType: "system",
            action: "create",
            entityType: "admin_ai_action",
            entityId: row.id,
            after: { playbook, signal_id: sig.signal_id, severity: sig.severity },
          });
        }
      }
    } catch (err: any) {
      log.error(`Detector ${playbook} failed`, { error: err.message });
      await fireAlert({
        severity: "warning",
        category: "business_operator_ai",
        title: `BO-AI detector "${playbook}" failed`,
        details: err.message,
      });
    }
  }

  // 2. Budget check.
  const budget = await getOrCreateBudget();
  const budgetExhausted = budget.spent_cents >= budget.cap_cents;

  // 3. For each pending row needing AI, call Claude.
  const pending = await listPendingActionsNeedingAi();
  let claudeCalls = 0;
  let claudeFailures = 0;
  let autoExecuted = 0;
  let escalated = 0;
  let costCentsThisTick = 0;

  for (const action of pending) {
    if (budgetExhausted) {
      await db
        .update(adminAiActions)
        .set({ status: "pending_no_ai_budget", updated_at: new Date() })
        .where(eq(adminAiActions.id, action.id));
      continue;
    }

    try {
      const { result, attempts } = await callClaudeWithRetry(action);
      claudeCalls++;
      const costCents = computeCostCents(result.inputTokens, result.outputTokens);
      costCentsThisTick += costCents;

      const updated = await db
        .update(adminAiActions)
        .set({
          proposed_action: result.proposed_action as any,
          ai_reasoning: result.reasoning,
          ai_model: getModel(),
          ai_input_tokens: result.inputTokens,
          ai_output_tokens: result.outputTokens,
          ai_cost_cents: costCents,
          ai_attempt_count: attempts,
          updated_at: new Date(),
        })
        .where(eq(adminAiActions.id, action.id))
        .returning();

      const refreshed = updated[0] ?? action;

      // Try auto-execute; if not, escalate.
      const didAuto = await maybeAutoExecute(refreshed);
      if (didAuto) {
        autoExecuted++;
      } else {
        await escalateAction(refreshed);
        escalated++;
      }
    } catch (err: any) {
      claudeFailures++;
      await db
        .update(adminAiActions)
        .set({
          status: "claude_failed",
          ai_last_error: String(err?.message ?? err).slice(0, 1000),
          ai_attempt_count: RETRY_BACKOFFS_MS.length + 1,
          updated_at: new Date(),
        })
        .where(eq(adminAiActions.id, action.id));

      await fireAlert({
        severity: "warning",
        category: "business_operator_ai",
        title: `BO-AI Claude unavailable for action ${action.id}`,
        details: String(err?.message ?? err),
        metadata: { action_id: action.id, playbook: action.playbook },
      });
    }
  }

  // 4. Apply tick cost to monthly budget + fire threshold alerts.
  if (costCentsThisTick > 0) {
    await addToBudget(costCentsThisTick);
    await maybeFireBudgetAlerts(
      budget.spent_cents,
      budget.spent_cents + costCentsThisTick,
      budget.cap_cents,
      budget.alerts_sent,
    );
  }

  const result: TickResult = {
    ranAt,
    killSwitchOn: false,
    budgetExhausted,
    signalsDetected,
    actionsInserted,
    claudeCalls,
    claudeFailures,
    autoExecuted,
    escalated,
    costCentsThisTick,
  };
  log.info("Business Operator tick complete", { result });
  return result;
}

/** Used by route handlers when admin approves/rejects an action. */
export async function recordPlaybookApproval(playbook: AdminAiPlaybook): Promise<void> {
  await ensurePlaybookState(playbook);
  await db
    .update(adminAiPlaybookState)
    .set({
      consecutive_approvals: sql`${adminAiPlaybookState.consecutive_approvals} + 1`,
      last_admin_action_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(adminAiPlaybookState.playbook, playbook));
}

export async function recordPlaybookRejection(playbook: AdminAiPlaybook): Promise<void> {
  await ensurePlaybookState(playbook);
  await db
    .update(adminAiPlaybookState)
    .set({
      consecutive_approvals: 0,
      auto_enabled: false,
      last_admin_action_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(adminAiPlaybookState.playbook, playbook));
}

export const _internals = {
  computeCostCents,
  currentMonth,
  buildPrompt,
  ADMIN_AI_PLAYBOOKS,
};
