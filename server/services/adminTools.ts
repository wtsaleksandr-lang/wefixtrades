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
import { sendSupportEmail } from "../lib/supportEmail";
import { extractTier, canAccessFeature } from "@shared/reputationConfig";
import {
  registerCopilotAction,
  getCopilotActionsForSurface,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
  type ToolCallSummary,
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

/** Confirmation-card preview for update_task_status — resolves the task
 *  title + current status from page context so the card reads naturally. */
function summarizeUpdateTaskStatus(args: Record<string, unknown>, context?: unknown): ToolCallSummary {
  const pageCtx = context as PageContext | undefined;
  const taskId = typeof args.task_id === "number" ? args.task_id : undefined;
  const task = pageCtx?.topTasks?.find((t) => t.id === taskId);
  const taskTitle = task?.title ?? (taskId ? `Task #${taskId}` : "Unknown task");
  const currentStatus = task?.status ?? "unknown";
  const proposedStatus = typeof args.status === "string" ? args.status : "";
  const reason = typeof args.reason === "string" ? args.reason : undefined;

  const lines = [
    `Task: "${taskTitle}"`,
    currentStatus === "unknown"
      ? `Set to ${proposedStatus.replace(/_/g, " ")}`
      : `${currentStatus.replace(/_/g, " ")} → ${proposedStatus.replace(/_/g, " ")}`,
  ];
  if (reason) lines.push(`Reason: ${reason}`);

  return { title: "Update task status", lines, metadata: { current_status: currentStatus } };
}

const UPDATE_TASK_STATUS_ACTION: CopilotAction = {
  name: "update_task_status",
  surface: "admin",
  riskTier: "low",
  tool: UPDATE_TASK_STATUS_TOOL,
  execute: executeUpdateTaskStatus,
  summarize: summarizeUpdateTaskStatus,
};

/* ─── draft_review_reply ─── */
const DRAFT_REVIEW_REPLY_TOOL: ActionTool = {
  name: "draft_review_reply",
  description:
    "Save a draft reply to a monitored customer review. " +
    "Call this ONLY when the admin explicitly asks to draft or write a reply to a review in this turn. " +
    "The review_id MUST come from the [ID: N] values in the PAGE CONTEXT topReviews list — never invent an ID. " +
    "This SAVES A DRAFT only — it does NOT post anything publicly. The admin reviews, approves and posts " +
    "the reply through the existing review tools. " +
    "Before calling this tool, briefly state the reply you are about to draft. " +
    "Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      review_id: {
        type: "number",
        description: "Numeric database ID of the review. Must come from topReviews [ID: N] in page context.",
      },
      reply_text: {
        type: "string",
        description: "The owner reply to save as a draft. Write it in full, ready for the admin to review.",
      },
    },
    required: ["review_id", "reply_text"],
  },
};

async function executeDraftReviewReply(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const reviewId = args.review_id;
  const replyText = typeof args.reply_text === "string" ? args.reply_text.trim() : "";

  if (typeof reviewId !== "number" || !Number.isInteger(reviewId) || reviewId <= 0) {
    throw new Error("Invalid review_id: must be a positive integer");
  }
  if (!replyText) throw new Error("The reply text is empty.");
  if (replyText.length > 4000) throw new Error("The reply text is too long.");

  const review = await storage.getMonitoredReviewById(reviewId);
  if (!review) throw new Error(`Review #${reviewId} not found`);

  // Feature gate — drafting AI replies requires the client's plan to include
  // it, mirroring the manual draft-response endpoint.
  if (review.client_id) {
    const svc = await storage.getClientReputationService(review.client_id);
    const tier = svc ? extractTier(svc.serviceId) : null;
    if (!canAccessFeature(tier, "aiDrafts")) {
      throw new Error("This client's plan doesn't include AI review drafts.");
    }
  }

  // Draft tier: only PREPARE the draft. It stays "unreviewed" so the admin
  // still approves and posts it through the existing review tools.
  await storage.updateMonitoredReview(reviewId, {
    draft_response: replyText,
    draft_generated_at: new Date(),
    draft_model: "ai-copilot",
    approval_status: "unreviewed",
    requires_approval: true,
  });

  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "AI Copilot",
    action: "ai_tool.executed",
    entity_type: "monitored_review",
    entity_id: reviewId,
    summary: `AI drafted a reply to ${review.reviewer_name}'s ${review.rating}★ review`,
    metadata: {
      tool_name: "draft_review_reply",
      args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return {
    narrative:
      `Saved a draft reply to ${review.reviewer_name}'s review. ` +
      "It's awaiting your approval — review and post it from the review tools when you're happy with it.",
  };
}

/** Confirmation-card preview for draft_review_reply. */
function summarizeDraftReviewReply(args: Record<string, unknown>, context?: unknown): ToolCallSummary {
  const pageCtx = context as PageContext | undefined;
  const reviewId = typeof args.review_id === "number" ? args.review_id : undefined;
  const review = pageCtx?.topReviews?.find((r) => r.id === reviewId);
  const who = review ? `${review.reviewer}'s review` : reviewId ? `review #${reviewId}` : "a review";
  const replyText = typeof args.reply_text === "string" ? args.reply_text : "";
  const preview = replyText.length > 160 ? `${replyText.slice(0, 160)}…` : replyText;

  return {
    title: "Draft review reply",
    lines: [`Reply to ${who}`, preview ? `"${preview}"` : "(empty reply)"],
  };
}

const DRAFT_REVIEW_REPLY_ACTION: CopilotAction = {
  name: "draft_review_reply",
  surface: "admin",
  riskTier: "draft",
  tool: DRAFT_REVIEW_REPLY_TOOL,
  execute: executeDraftReviewReply,
  summarize: summarizeDraftReviewReply,
};

/* ─── send_support_email ─── */
const SEND_SUPPORT_EMAIL_TOOL: ActionTool = {
  name: "send_support_email",
  description:
    "Send a branded support email to the client currently in context. " +
    "Call this ONLY when the admin explicitly asks to email or message the client in this turn. " +
    "The client_id MUST come from the 'Client: <name> (ID: N)' line in PAGE CONTEXT — never invent an ID. " +
    "Write the subject and the full body. The body is plain text; blank lines separate paragraphs. " +
    "Do NOT add a signature, logo, or greeting boilerplate — the email is wrapped in the company template. " +
    "Before calling this tool, briefly state who you are emailing and the gist of the message. " +
    "Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      client_id: {
        type: "number",
        description: "Numeric database ID of the client. Must come from 'Client: ... (ID: N)' in page context.",
      },
      subject: {
        type: "string",
        description: "The email subject line.",
      },
      body: {
        type: "string",
        description: "The full email body in plain text. Blank lines separate paragraphs.",
      },
    },
    required: ["client_id", "subject", "body"],
  },
};

async function executeSendSupportEmail(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const clientId = args.client_id;
  const subject = typeof args.subject === "string" ? args.subject.trim() : "";
  const body = typeof args.body === "string" ? args.body.trim() : "";

  if (typeof clientId !== "number" || !Number.isInteger(clientId) || clientId <= 0) {
    throw new Error("Invalid client_id: must be a positive integer");
  }
  if (!subject) throw new Error("The email subject is empty.");
  if (subject.length > 200) throw new Error("The email subject is too long.");
  if (!body) throw new Error("The email body is empty.");
  if (body.length > 6000) throw new Error("The email body is too long.");

  const client = await storage.getClientById(clientId);
  if (!client) throw new Error(`Client #${clientId} not found`);
  if (!client.contact_email) {
    throw new Error(`${client.business_name} has no contact email on file — add one before sending.`);
  }

  await sendSupportEmail({ to: client.contact_email, subject, body });

  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "AI Copilot",
    action: "ai_tool.executed",
    entity_type: "client",
    entity_id: clientId,
    summary: `AI sent a support email to ${client.business_name}: "${subject}"`,
    metadata: {
      tool_name: "send_support_email",
      args: { client_id: clientId, subject },
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return {
    narrative:
      `Sent a support email to ${client.business_name} (${client.contact_email}) — "${subject}". ` +
      "It's on its way out through the email queue.",
  };
}

/** Confirmation-card preview for send_support_email. */
function summarizeSendSupportEmail(args: Record<string, unknown>, context?: unknown): ToolCallSummary {
  const pageCtx = context as PageContext | undefined;
  const clientName = pageCtx?.clientName ?? "this client";
  const subject = typeof args.subject === "string" ? args.subject : "";
  const body = typeof args.body === "string" ? args.body : "";
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;

  return {
    title: "Send support email",
    lines: [
      `To: ${clientName}`,
      `Subject: ${subject || "(no subject)"}`,
      preview ? `"${preview}"` : "(empty body)",
    ],
  };
}

const SEND_SUPPORT_EMAIL_ACTION: CopilotAction = {
  name: "send_support_email",
  surface: "admin",
  riskTier: "low",
  tool: SEND_SUPPORT_EMAIL_TOOL,
  execute: executeSendSupportEmail,
  summarize: summarizeSendSupportEmail,
};

/* ─── Register admin actions ─── */
registerCopilotAction(UPDATE_TASK_STATUS_ACTION);
registerCopilotAction(DRAFT_REVIEW_REPLY_ACTION);
registerCopilotAction(SEND_SUPPORT_EMAIL_ACTION);

/* ─── Admin tool-injection gate ─── */
const TOOL_CAPABLE_PAGES = ["client_detail", "inbox", "reviews"];

/**
 * All four criteria must be true to inject tools into the admin model call:
 * 1. ADMIN_TOOLS_ENABLED env var is set
 * 2. Page is in the tool-capable list
 * 3. Page context exists
 * 4. The page exposes at least one actionable entity — a task
 *    (update_task_status), a review (draft_review_reply), or a client
 *    (send_support_email)
 */
export function shouldInjectTools(pageContext?: PageContext): boolean {
  if (process.env.ADMIN_TOOLS_ENABLED !== "true") return false;
  if (!pageContext) return false;
  if (!TOOL_CAPABLE_PAGES.includes(pageContext.page)) return false;
  const hasTasks = pageContext.topTasks?.some((t) => typeof t.id === "number") ?? false;
  const hasReviews = pageContext.topReviews?.some((r) => typeof r.id === "number") ?? false;
  const hasClient = typeof pageContext.clientId === "number";
  return hasTasks || hasReviews || hasClient;
}

/** Anthropic tool definitions for the admin surface — handed to the model. */
export const ADMIN_TOOLS: ActionTool[] = getCopilotActionsForSurface("admin").map((a) => a.tool);
