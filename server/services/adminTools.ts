/**
 * Admin copilot actions.
 *
 * Action definitions + executors for the ADMIN surface. They register into
 * the shared copilotActionRegistry — the framework (pending-action store,
 * single-use / TTL / user-binding, confirm flow) lives there. This file
 * holds only admin-specific actions and the admin tool-injection gate.
 */

import { storage } from "../storage";
import type { PageContext } from "./promptBuilder";
import { createLogger } from "../lib/logger";
import {
  registerCopilotAction,
  getCopilotActionsForSurface,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
} from "./copilotActionRegistry";

const log = createLogger("AdminTools");

/* ─── update_task_status ─── */
const UPDATE_TASK_STATUS_TOOL: ActionTool = {
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
        enum: ["not_started", "submitted", "in_progress", "waiting", "blocked", "qa_review", "revision_required", "delivered", "cancelled"],
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

const VALID_STATUSES = new Set([
  "not_started", "submitted", "in_progress",
  "waiting", "blocked", "qa_review", "revision_required",
  "delivered", "cancelled",
]);

async function executeUpdateTaskStatus(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
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

  // QA auto-transition: tasks with human_review_required auto-move to qa_review on submit
  let finalStatus = status;
  if (status === "submitted" && task.human_review_required) {
    await storage.updateFulfillmentTask(task_id, {
      status: "qa_review",
      last_action: "Auto-transitioned to QA review (human_review_required)",
      last_action_at: new Date(),
    } as any);
    finalStatus = "qa_review";
    log.info("Task auto-transitioned to QA review", { taskId: task_id, title: task.title });
    await storage.logAdminActivity({
      actor_type: "system",
      actor_id: null,
      actor_name: "QA Workflow",
      action: "fulfillment.qa_auto_transition",
      entity_type: "fulfillment_task",
      entity_id: task_id,
      summary: `Task "${task.title}" auto-transitioned to QA review`,
    }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));
  }

  const narrative = `Task "${task.title}" updated to ${finalStatus.replace(/_/g, " ")}.${reason ? ` Reason: ${reason}` : ""}`;
  return { narrative };
}

const UPDATE_TASK_STATUS_ACTION: CopilotAction = {
  name: "update_task_status",
  surface: "admin",
  riskTier: "low",
  tool: UPDATE_TASK_STATUS_TOOL,
  execute: executeUpdateTaskStatus,
};

/* ─── Register admin actions ─── */
registerCopilotAction(UPDATE_TASK_STATUS_ACTION);

/* ─── Admin tool-injection gate ─── */
const TOOL_CAPABLE_PAGES = ["client_detail", "inbox"];

/**
 * All four criteria must be true to inject tools into the admin model call:
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

/** Anthropic tool definitions for the admin surface — handed to the model. */
export const ADMIN_TOOLS: ActionTool[] = getCopilotActionsForSurface("admin").map((a) => a.tool);
