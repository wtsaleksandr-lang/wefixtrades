/**
 * Portal copilot actions.
 *
 * Action definitions + executors for the PORTAL (client) surface. They
 * register into the shared copilotActionRegistry — the framework
 * (pending-action store, single-use / TTL / user-binding, confirm flow)
 * lives there. This file holds only portal-specific actions.
 *
 * SEPARATION: every action here declares surface "portal". The portal
 * confirm endpoint only ever executes portal actions; the admin confirm
 * endpoint only admin actions. The two AI brains never share actions.
 *
 * DATA-SCOPING: an executor runs with the confirming user's id only. It
 * resolves that user to their OWN client record and may read/write that
 * client's data exclusively — never another tenant's, never admin data.
 *
 * Adding an action: define an ActionTool + executor, wrap them in a
 * CopilotAction with surface "portal", and registerCopilotAction() it.
 * The registry, the streaming route, and the confirm endpoint pick it up
 * with no further wiring.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { clients } from "@shared/schema";
import {
  notificationPreferencesSchema,
  parseNotificationPreferences,
  NOTIFICATION_CATEGORY_KEYS,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationPreferences,
  type NotificationCategoryKey,
} from "@shared/schemas/notificationPreferences";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import {
  registerCopilotAction,
  getCopilotActionsForSurface,
  type CopilotAction,
  type ActionTool,
  type PendingAction,
  type ActionExecutionResult,
} from "./copilotActionRegistry";

const log = createLogger("PortalTools");

/** Resolve the calling user to their OWN client_id. null if none linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/* ─── update_notification_preference ─── */

/* The customer controls two delivery channels and five categories. The
 * tool exposes them as one flat enum; the executor routes each key to the
 * right slot of the preferences blob. */
const CHANNEL_KEYS = ["email", "sms"] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];
const SETTING_KEYS: string[] = [...CHANNEL_KEYS, ...NOTIFICATION_CATEGORY_KEYS];

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  email: "Email notifications",
  sms: "SMS notifications",
};

function isChannelKey(setting: string): setting is ChannelKey {
  return (CHANNEL_KEYS as readonly string[]).includes(setting);
}

function settingLabel(setting: string): string {
  if (isChannelKey(setting)) return CHANNEL_LABELS[setting];
  return NOTIFICATION_CATEGORY_LABELS[setting as NotificationCategoryKey]?.label ?? setting;
}

const UPDATE_NOTIFICATION_PREFERENCE_TOOL: ActionTool = {
  name: "update_notification_preference",
  description:
    "Turn one of the customer's own notification settings on or off. " +
    "Call this ONLY when the customer explicitly asks to change a notification setting in this turn. " +
    "Delivery channels: 'email', 'sms'. Categories: 'billing', 'service_updates', 'leads', 'weekly_digest', 'marketing'. " +
    "Before calling this tool, briefly state in plain language the change you are about to make. " +
    "Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      setting: {
        type: "string",
        enum: SETTING_KEYS,
        description: "Which setting to change — a delivery channel or a notification category.",
      },
      enabled: {
        type: "boolean",
        description: "true to turn the setting on, false to turn it off.",
      },
    },
    required: ["setting", "enabled"],
  },
};

async function executeUpdateNotificationPreference(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;
  const setting = args.setting;
  const enabled = args.enabled;

  // Re-validate args before any write — executors never trust stored args.
  if (typeof setting !== "string" || !SETTING_KEYS.includes(setting)) {
    throw new Error(`Invalid notification setting: ${String(setting)}`);
  }
  if (typeof enabled !== "boolean") {
    throw new Error("Invalid 'enabled' value: must be true or false");
  }

  // Data-scoping: act ONLY on the confirming user's own client record.
  const clientId = await resolveClientId(confirmedByUserId);
  if (!clientId) {
    throw new Error("No client record is linked to your account.");
  }

  // Load current prefs, flip the one setting, leave everything else intact.
  const [client] = await db
    .select({ metadata: clients.metadata })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const current = parseNotificationPreferences(client?.metadata);

  const label = settingLabel(setting);
  const channelKey = isChannelKey(setting);
  const currentValue = channelKey
    ? current.channels[setting]
    : current.categories[setting as NotificationCategoryKey];

  // No-op guard: skip the write when the setting is already at the target.
  if (currentValue === enabled) {
    return {
      narrative: `No change made — ${label.toLowerCase()} ${enabled ? "already on" : "already off"}.`,
    };
  }

  const next: NotificationPreferences = {
    channels: { ...current.channels },
    categories: { ...current.categories },
  };
  if (channelKey) {
    next.channels[setting] = enabled;
  } else {
    next.categories[setting as NotificationCategoryKey] = enabled;
  }

  // Validate the full blob before persisting (defence in depth).
  const validated = notificationPreferencesSchema.safeParse(next);
  if (!validated.success) {
    throw new Error("Updated preferences failed validation");
  }

  const prevMetadata = (client?.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(clients)
    .set({
      metadata: { ...prevMetadata, notification_preferences: validated.data },
      updated_at: new Date(),
    })
    .where(eq(clients.id, clientId));

  // Audit trail — no client-facing activity log exists, so the change is
  // recorded against the client row in adminActivityLog with an ai_agent
  // actor (the confirming portal user).
  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "Portal Copilot",
    action: "ai_tool.executed",
    entity_type: "client",
    entity_id: clientId,
    summary: `Portal copilot turned ${label.toLowerCase()} ${enabled ? "on" : "off"}`,
    metadata: {
      tool_name: "update_notification_preference",
      args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return {
    narrative: `Done — ${label.toLowerCase()} ${enabled ? "turned on" : "turned off"}.`,
  };
}

const UPDATE_NOTIFICATION_PREFERENCE_ACTION: CopilotAction = {
  name: "update_notification_preference",
  surface: "portal",
  riskTier: "low",
  tool: UPDATE_NOTIFICATION_PREFERENCE_TOOL,
  execute: executeUpdateNotificationPreference,
};

/* ─── Register portal actions ─── */
registerCopilotAction(UPDATE_NOTIFICATION_PREFERENCE_ACTION);

/** Anthropic tool definitions for the portal surface — handed to the model. */
export const PORTAL_TOOLS: ActionTool[] = getCopilotActionsForSurface("portal").map((a) => a.tool);
