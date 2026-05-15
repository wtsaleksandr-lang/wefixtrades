/**
 * Copilot action registry — shared framework for both AI copilots.
 *
 * SEPARATION (critical): this is shared *plumbing only*. Every action
 * declares a `surface` ("admin" | "portal"); the admin copilot is only ever
 * offered admin actions, the portal copilot only portal actions. The
 * confirm endpoints re-check the surface. Copilot brains — routes, system
 * prompts, conversation memory, auth — stay fully separate per surface;
 * nothing here crosses that boundary.
 *
 * Safety model:
 *  - Allowlist     — only registered actions can execute.
 *  - Single-use    — consumePendingAction deletes the entry on retrieval.
 *  - TTL           — pending actions expire after 5 minutes.
 *  - User binding  — the confirming session user must match stored user_id.
 *  - Surface bind  — the confirm endpoint must match the action's surface.
 *  - Re-validation — executors re-validate args before any write.
 */

import crypto from "crypto";

export type ActionSurface = "admin" | "portal";

/**
 * Risk tier governs how autonomous an action may be:
 *  - "low":   may execute immediately after one human confirm click.
 *  - "draft": money / outbound / irreversible — the action only PREPARES a
 *             draft; a human still performs the final send/commit.
 */
export type ActionRiskTier = "low" | "draft";

/** Anthropic tool-use schema shape. */
export interface ActionTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ActionExecutionResult {
  narrative: string;
}

/**
 * A pending, awaiting-confirmation action. Stored server-side only; the
 * client ever only holds the opaque call_id.
 */
export interface PendingAction {
  call_id: string;
  surface: ActionSurface;
  action_name: string;
  args: Record<string, unknown>;
  user_id: number;
  session_id: string;
  expires: number;
  /** Context captured at store time (e.g. current_status for no-op checks). */
  metadata?: Record<string, unknown>;
}

export interface CopilotAction {
  name: string;
  surface: ActionSurface;
  riskTier: ActionRiskTier;
  /** The Anthropic tool definition handed to the model. */
  tool: ActionTool;
  /** Runs after the user confirms. MUST re-validate args before any write. */
  execute: (action: PendingAction, confirmedByUserId: number) => Promise<ActionExecutionResult>;
}

/* ─── Registry ─── */
const registry = new Map<string, CopilotAction>();
const key = (surface: ActionSurface, name: string) => `${surface}:${name}`;

export function registerCopilotAction(action: CopilotAction): void {
  registry.set(key(action.surface, action.name), action);
}

export function getCopilotAction(surface: ActionSurface, name: string): CopilotAction | undefined {
  return registry.get(key(surface, name));
}

export function getCopilotActionsForSurface(surface: ActionSurface): CopilotAction[] {
  return [...registry.values()].filter((a) => a.surface === surface);
}

/* ─── Pending-action store (in-process, single-use, TTL 5 min) ─── */
export const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;
const pendingStore = new Map<string, PendingAction>();

export function newCallId(): string {
  return crypto.randomUUID();
}

export function storePendingAction(action: PendingAction): void {
  // Prune expired entries on each write.
  const now = Date.now();
  for (const [id, a] of pendingStore) {
    if (a.expires < now) pendingStore.delete(id);
  }
  pendingStore.set(action.call_id, action);
}

/** Retrieves and immediately deletes the action (single-use). null if missing or expired. */
export function consumePendingAction(call_id: string): PendingAction | null {
  const action = pendingStore.get(call_id);
  if (!action) return null;
  pendingStore.delete(call_id);
  if (action.expires < Date.now()) return null;
  return action;
}
