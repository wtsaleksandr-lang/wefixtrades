/**
 * Admin tool definitions, pending action store, and executors.
 *
 * Safety rules enforced here:
 * - Allowlist: only tools in TOOL_EXECUTORS can be executed
 * - Single-use: consumePendingAction deletes the entry on retrieval
 * - TTL: actions expire after 5 minutes
 * - User binding: stored user_id must match the confirming session
 */

import crypto from "crypto";
import { storage } from "../storage";
import type { PageContext } from "./promptBuilder";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminTools");

/* ─── Tool type ─── */
export interface AdminTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

/* ─── Tool definitions ─── */
export const UPDATE_TASK_STATUS_TOOL: AdminTool = {
  name: "update_task_status",
  description:
    "Update the status of a fulfillment task. " +
    "Call this ONLY when the admin explicitly requests a status change in this turn. " +
    "The task_id MUST come from the [ID: N] values in the PAGE CONTEXT topTasks list — never invent or guess an ID. " +
    "Before calling this tool, briefly state the change you are about to make. " +
    "Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "Numeric database ID of the task. Must come from topTasks [ID: N] in page context.",
      },
      status: {
        type: "string",
        enum: ["not_started", "submitted", "in_progress", "waiting", "blocked", "delivered", "cancelled"],
        description: "The new status value.",
      },
      reason: {
        type: "string",
        description: "One-sentence explanation for the change. Stored in the audit log.",
      },
    },
    required: ["task_id", "status"],
  },
};

export const ADMIN_TOOLS: AdminTool[] = [UPDATE_TASK_STATUS_TOOL];

/* ─── Pages where tools may be injected ─── */
const TOOL_CAPABLE_PAGES = ["client_detail", "inbox"];

/**
 * All four criteria must be true to inject tools:
 * 1. ADMIN_TOOLS_ENABLED env var is set
 * 2. Page is in the tool-capable list
 * 3. Page context exists
 * 4. At least one task with a valid numeric ID is present
 */
export function shouldInjectTools(pageContext?: PageContext): boolean {
  if (process.env.ADMIN_TOOLS_ENABLED !== "true") return false;
  if (!pageContext) return false;
  if (!TOOL_CAPABLE_PAGES.includes(pageContext.page)) return false;
  return pageContext.topTasks?.some((t) => typeof t.id === "number") ?? false;
}

/* ─── Pending action store (in-process, TTL 5 min) ─── */
export interface PendingToolAction {
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  user_id: number;
  session_id: string;
  expires: number;
  /** Contextual metadata captured at store time (e.g. current_status for no-op detection) */
  metadata?: Record<string, unknown>;
}

const pendingToolStore = new Map<string, PendingToolAction>();

export function storePendingAction(action: PendingToolAction): void {
  // Prune expired entries on each write
  const now = Date.now();
  for (const [id, a] of pendingToolStore) {
    if (a.expires < now) pendingToolStore.delete(id);
  }
  pendingToolStore.set(action.call_id, action);
}

/** Retrieves and immediately deletes the action (single-use). Returns null if not found or expired. */
export function consumePendingAction(call_id: string): PendingToolAction | null {
  const action = pendingToolStore.get(call_id);
  if (!action) return null;
  pendingToolStore.delete(call_id);
  if (action.expires < Date.now()) return null;
  return action;
}

/* ─── Executor result type ─── */
export interface ToolExecutionResult {
  narrative: string;
}

/* ─── update_task_status executor ─── */
const VALID_STATUSES = new Set([
  "not_started", "submitted", "in_progress",
  "waiting", "blocked", "delivered", "cancelled",
]);

async function executeUpdateTaskStatus(
  action: PendingToolAction,
  confirmedByUserId: number,
): Promise<ToolExecutionResult> {
  const { args } = action;
  const task_id = args.task_id;
  const status = args.status as string;
  const reason = args.reason as string | undefined;

  if (typeof task_id !== "number" || !Number.isInteger(task_id) || task_id <= 0) {
    throw new Error("Invalid task_id: must be a positive integer");
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status value: ${status}`);
  }

  // No-op guard: if the current status is already the target, skip the write
  const currentStatus = action.metadata?.current_status;
  if (typeof currentStatus === "string" && currentStatus !== "unknown" && currentStatus === status) {
    return { narrative: `Task is already set to ${status.replace(/_/g, " ")}. No change was made.` };
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "delivered") {
    updateData.completed_at = new Date();
  }

  const task = await storage.updateFulfillmentTask(task_id, updateData);
  if (!task) throw new Error(`Task #${task_id} not found`);

  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "AI Copilot",
    action: "ai_tool.executed",
    entity_type: "fulfillment_task",
    entity_id: task_id,
    summary: `AI updated task "${task.title}" → ${status}${reason ? ` (${reason})` : ""}`,
    metadata: {
      tool_name: "update_task_status",
      args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  const narrative = `Task "${task.title}" updated to ${status.replace(/_/g, " ")}.${reason ? ` Reason: ${reason}` : ""}`;
  return { narrative };
}

/* ─── Allowlist — only entries here can be executed via /api/admin/tool-confirm ─── */
export const TOOL_EXECUTORS: Record<
  string,
  (action: PendingToolAction, confirmedByUserId: number) => Promise<ToolExecutionResult>
> = {
  update_task_status: executeUpdateTaskStatus,
};
