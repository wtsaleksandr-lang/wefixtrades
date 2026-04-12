/**
 * Task Automation Registry
 *
 * Maps fulfillment task titles to automation handlers.
 * Two modes:
 *   - "auto"   → runs handler, marks task delivered on success
 *   - "assist" → runs handler, returns guidance text, does NOT change task status
 *
 * Tasks not matching any pattern are "manual" and cannot be processed.
 */

import { storage } from "../storage";
import type { FulfillmentTask } from "@shared/schema";

export interface TaskAutomationResult {
  success: boolean;
  message: string;
  output?: any;
}

export interface TaskAutomationDef {
  type: "auto" | "assist";
  action: string;
  handler: (task: FulfillmentTask) => Promise<TaskAutomationResult>;
}

/* ─── Automation Registry ─── */

const AUTOMATION_MAP: Array<{
  pattern: string;
  def: TaskAutomationDef;
}> = [
  {
    pattern: "Configure TradeLine assistant",
    def: {
      type: "auto",
      action: "build_assistant",
      handler: handleBuildAssistant,
    },
  },
  {
    pattern: "Configure notifications",
    def: {
      type: "auto",
      action: "setup_notifications",
      handler: handleSetupNotifications,
    },
  },
  {
    pattern: "Configure lead notifications",
    def: {
      type: "auto",
      action: "setup_notifications",
      handler: handleSetupNotifications,
    },
  },
  {
    pattern: "Configure notifications + callback flow",
    def: {
      type: "auto",
      action: "setup_notifications",
      handler: handleSetupNotifications,
    },
  },
  {
    pattern: "Prepare widget or hosted fallback",
    def: {
      type: "assist",
      action: "generate_install_instructions",
      handler: handleGenerateInstallInstructions,
    },
  },
  {
    pattern: "Prepare website widget or hosted fallback",
    def: {
      type: "assist",
      action: "generate_install_instructions",
      handler: handleGenerateInstallInstructions,
    },
  },
  {
    pattern: "Install widget / provision hosted link",
    def: {
      type: "assist",
      action: "generate_install_instructions",
      handler: handleGenerateInstallInstructions,
    },
  },
  {
    pattern: "Configure phone routing",
    def: {
      type: "assist",
      action: "generate_phone_setup_guide",
      handler: handleGeneratePhoneSetupGuide,
    },
  },
];

/**
 * Look up automation config for a task title.
 * Returns null for manual tasks.
 */
export function getTaskAutomation(title: string): TaskAutomationDef | null {
  // Strip monthly prefix like "[2026-04] " for matching
  const cleanTitle = title.replace(/^\[\d{4}-\d{2}\]\s*/, "");
  for (const entry of AUTOMATION_MAP) {
    if (cleanTitle.includes(entry.pattern) || entry.pattern.includes(cleanTitle)) {
      return entry.def;
    }
  }
  return null;
}

/**
 * Returns just the type for a task title (for client-side display logic).
 */
export function getTaskAutomationType(title: string): "auto" | "assist" | "manual" {
  const def = getTaskAutomation(title);
  return def?.type ?? "manual";
}

/* ─── Handlers ─── */

async function handleBuildAssistant(task: FulfillmentTask): Promise<TaskAutomationResult> {
  if (!task.client_service_id) {
    return { success: false, message: "Task has no client_service_id" };
  }

  const { provisionTradeLineAssistant } = await import("./vapiService");
  const result = await provisionTradeLineAssistant(task.client_service_id);

  if (result.error) {
    return { success: false, message: `Assistant build failed: ${result.error}` };
  }
  if (result.skipped) {
    return {
      success: true,
      message: result.skipReason || "Assistant build skipped (already up to date)",
      output: { assistantId: result.assistantId, skipped: true },
    };
  }

  return {
    success: true,
    message: `Assistant built successfully${result.assistantId ? ` (Vapi ID: ${result.assistantId})` : ""}`,
    output: { assistantId: result.assistantId },
  };
}

async function handleSetupNotifications(task: FulfillmentTask): Promise<TaskAutomationResult> {
  if (!task.client_service_id) {
    return { success: false, message: "Task has no client_service_id" };
  }

  const config = await storage.getTradeLineConfig(task.client_service_id);
  if (!config) {
    return { success: false, message: "No TradeLine config found for this service" };
  }

  // Check if notifications are already configured
  const existing = config.notifications;
  if (existing && ((existing.sms && existing.sms.length > 0) || (existing.email && existing.email.length > 0))) {
    return {
      success: true,
      message: `Notifications already configured (SMS: ${existing.sms?.length || 0}, Email: ${existing.email?.length || 0})`,
      output: existing,
    };
  }

  // Pull contact info from client record
  const client = await storage.getClientById(task.client_id);
  if (!client) {
    return { success: false, message: "Client not found" };
  }

  const smsRecipients: string[] = [];
  const emailRecipients: string[] = [];

  if (client.contact_phone) smsRecipients.push(client.contact_phone);
  if (client.contact_email) emailRecipients.push(client.contact_email);

  if (smsRecipients.length === 0 && emailRecipients.length === 0) {
    return { success: false, message: "Client has no phone or email on file — cannot auto-configure notifications" };
  }

  await storage.updateTradeLineConfig(task.client_service_id, {
    notifications: {
      sms: smsRecipients,
      email: emailRecipients,
    },
  });

  return {
    success: true,
    message: `Notifications configured (SMS: ${smsRecipients.length}, Email: ${emailRecipients.length})`,
    output: { sms: smsRecipients, email: emailRecipients },
  };
}

async function handleGenerateInstallInstructions(task: FulfillmentTask): Promise<TaskAutomationResult> {
  if (!task.client_service_id) {
    return { success: false, message: "Task has no client_service_id" };
  }

  const config = await storage.getTradeLineConfig(task.client_service_id);
  if (!config) {
    return { success: false, message: "No TradeLine config found" };
  }

  const website = config.website ?? {};
  const embedMode = website.embedMode || "none";
  const lines: string[] = [];

  if (embedMode === "none") {
    lines.push("Install path not yet decided.");
    lines.push("- If client can provide website access: use POST /install-path with mode=direct_embed");
    lines.push("- If no website access: use POST /install-path with mode=hosted_fallback");
  } else if (embedMode === "direct_embed") {
    lines.push("Mode: Direct Embed");
    lines.push("1. Get CMS/hosting access from client");
    lines.push("2. Add the widget script tag to the site footer");
    lines.push("3. Verify it loads on the live site");
    lines.push("Verify widget script is added to the site footer and loads correctly.");
  } else if (embedMode === "hosted_fallback") {
    lines.push("Mode: Hosted Fallback");
    lines.push(`Hosted URL: ${website.hostedUrl || "(not set)"}`);
    lines.push(`Domain status: ${website.domainStatus || "(not set)"}`);
    if (website.hostedUrl && website.domainStatus === "connected") {
      lines.push("Hosted page is live and accessible.");
    } else {
      lines.push("Hosted page needs provisioning or DNS verification.");
    }
  }

  return {
    success: true,
    message: lines.join("\n"),
    output: { embedMode, website },
  };
}

async function handleGeneratePhoneSetupGuide(task: FulfillmentTask): Promise<TaskAutomationResult> {
  if (!task.client_service_id) {
    return { success: false, message: "Task has no client_service_id" };
  }

  const config = await storage.getTradeLineConfig(task.client_service_id);
  if (!config) {
    return { success: false, message: "No TradeLine config found" };
  }

  const phone = config.phoneRouting ?? {};
  const lines: string[] = [];

  lines.push(`Primary business number: ${phone.primaryBusinessNumber || "(not set)"}`);
  lines.push(`Forwarding mode: ${phone.forwardingMode || "(not set)"}`);
  lines.push(`Ring timeout: ${phone.ringTimeoutSeconds ?? "(default)"}s`);

  if (!phone.primaryBusinessNumber) {
    lines.push("");
    lines.push("Next: Set primaryBusinessNumber in phone routing config from onboarding data.");
  }
  if (!phone.forwardingMode) {
    lines.push("Next: Set forwardingMode (no_answer | immediate | after_hours_only).");
  }

  if (phone.primaryBusinessNumber && phone.forwardingMode) {
    lines.push("");
    lines.push("Phone routing is configured. Verify with a test call.");
  }

  return {
    success: true,
    message: lines.join("\n"),
    output: { phoneRouting: phone },
  };
}
