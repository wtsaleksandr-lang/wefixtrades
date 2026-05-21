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

import crypto from "crypto";
import { db } from "../db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { clients, bookflowInvoices, clientServices, supportTickets } from "@shared/schema";
import { ALL_PRODUCTS } from "@shared/pricing";
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

/* ─── draft_invoice ─── */

/* Phase 2c (draft tier). The action only PREPARES a draft BookFlow invoice
 * (status "draft"); it never sends. The user reviews the draft and sends it
 * to their customer through the existing BookFlow UI. Drafting has no
 * outbound side-effect — it writes one DB row and nothing else. */

const MAX_INVOICE_DOLLARS = 1_000_000;

/** Next per-client invoice number: INV-001, INV-002, … (mirrors bookflowRoutes). */
async function nextInvoiceNumber(clientId: number): Promise<string> {
  const [latest] = await db
    .select({ invoice_number: bookflowInvoices.invoice_number })
    .from(bookflowInvoices)
    .where(eq(bookflowInvoices.client_id, clientId))
    .orderBy(desc(bookflowInvoices.id))
    .limit(1);
  if (!latest?.invoice_number) return "INV-001";
  const match = latest.invoice_number.match(/INV-(\d+)/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `INV-${String(next).padStart(3, "0")}`;
}

const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);
const formatDollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const DRAFT_INVOICE_TOOL: ActionTool = {
  name: "draft_invoice",
  description:
    "Draft an invoice in BookFlow for one of the user's own customers. " +
    "Call this only when the user explicitly asks to create or draft an invoice in this turn. " +
    "This creates a DRAFT only — it does NOT send anything to anyone. The user reviews the draft and " +
    "sends it to their customer themselves from the BookFlow invoices page. " +
    "Amounts are in dollars. Before calling this tool, state the invoice details (customer, work, " +
    "amount) in plain language. Do not call this tool more than once per turn.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: {
        type: "string",
        description: "Name of the customer being invoiced (one of the user's own customers).",
      },
      item_description: {
        type: "string",
        description: "Plain-language description of the work done or goods supplied.",
      },
      amount_dollars: {
        type: "number",
        description: "Total amount for the work, in dollars (e.g. 1500 for $1,500.00). Must be greater than 0.",
      },
      customer_email: {
        type: "string",
        description: "The customer's email (optional). Not needed to draft — only to send the invoice later.",
      },
      tax_dollars: {
        type: "number",
        description: "Tax amount in dollars (optional, defaults to 0).",
      },
      due_in_days: {
        type: "number",
        description: "How many days from today the invoice is due (optional, whole number 1–365).",
      },
      notes: {
        type: "string",
        description: "An optional note to show on the invoice.",
      },
    },
    required: ["customer_name", "item_description", "amount_dollars"],
  },
};

async function executeDraftInvoice(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const { args } = action;

  // Re-validate every arg before any write — executors never trust stored args.
  const customerName = typeof args.customer_name === "string" ? args.customer_name.trim() : "";
  if (!customerName) throw new Error("A customer name is required.");
  if (customerName.length > 200) throw new Error("Customer name is too long.");

  const itemDescription = typeof args.item_description === "string" ? args.item_description.trim() : "";
  if (!itemDescription) throw new Error("A description of the work is required.");
  if (itemDescription.length > 500) throw new Error("Item description is too long.");

  const amountDollars = args.amount_dollars;
  if (typeof amountDollars !== "number" || !Number.isFinite(amountDollars) || amountDollars <= 0) {
    throw new Error("The invoice amount must be a positive number of dollars.");
  }
  if (amountDollars > MAX_INVOICE_DOLLARS) {
    throw new Error("That invoice amount looks too large — please double-check it.");
  }

  let taxDollars = 0;
  const taxRaw = args.tax_dollars;
  if (taxRaw !== undefined && taxRaw !== null) {
    if (typeof taxRaw !== "number" || !Number.isFinite(taxRaw) || taxRaw < 0) {
      throw new Error("Tax must be a non-negative number of dollars.");
    }
    if (taxRaw > MAX_INVOICE_DOLLARS) {
      throw new Error("That tax amount looks too large — please double-check it.");
    }
    taxDollars = taxRaw;
  }

  let dueDate: Date | null = null;
  const dueRaw = args.due_in_days;
  if (dueRaw !== undefined && dueRaw !== null) {
    if (typeof dueRaw !== "number" || !Number.isInteger(dueRaw) || dueRaw < 1 || dueRaw > 365) {
      throw new Error("The due date must be a whole number of days between 1 and 365.");
    }
    dueDate = new Date(Date.now() + dueRaw * 24 * 60 * 60 * 1000);
  }

  const customerEmail =
    typeof args.customer_email === "string" && args.customer_email.trim()
      ? args.customer_email.trim().slice(0, 200)
      : null;
  const notes =
    typeof args.notes === "string" && args.notes.trim() ? args.notes.trim().slice(0, 1000) : null;

  // Data-scoping: draft the invoice ONLY in the confirming user's own BookFlow.
  const clientId = await resolveClientId(confirmedByUserId);
  if (!clientId) {
    throw new Error("No client record is linked to your account.");
  }

  const unitPriceCents = dollarsToCents(amountDollars);
  const taxCents = dollarsToCents(taxDollars);
  const subtotalCents = unitPriceCents;
  const totalCents = subtotalCents + taxCents;
  const invoiceNumber = await nextInvoiceNumber(clientId);

  const [invoice] = await db
    .insert(bookflowInvoices)
    .values({
      client_id: clientId,
      customer_name: customerName,
      customer_email: customerEmail,
      line_items: [{ description: itemDescription, quantity: 1, unit_price_cents: unitPriceCents }],
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      invoice_number: invoiceNumber,
      pay_link_token: crypto.randomBytes(16).toString("hex"),
      due_date: dueDate,
      notes,
      status: "draft",
    })
    .returning();

  // Audit trail — recorded against the invoice row with an ai_agent actor.
  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "Portal Copilot",
    action: "ai_tool.executed",
    entity_type: "bookflow_invoice",
    entity_id: invoice.id,
    summary: `Portal copilot drafted invoice ${invoiceNumber} for ${customerName} (${formatDollars(totalCents)})`,
    metadata: {
      tool_name: "draft_invoice",
      args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
      invoice_id: invoice.id,
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return {
    narrative:
      `Done — drafted invoice ${invoiceNumber} for ${customerName}, ${formatDollars(totalCents)}. ` +
      "It's saved as a draft — review it and send it to your customer from the BookFlow invoices page when you're ready.",
  };
}

const DRAFT_INVOICE_ACTION: CopilotAction = {
  name: "draft_invoice",
  surface: "portal",
  riskTier: "draft",
  tool: DRAFT_INVOICE_TOOL,
  execute: executeDraftInvoice,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * AUTO-TIER ACTIONS (W-BA-1, Phase 3a)
 *
 * Per docs/phase-3-plan.md §3, admission to the `auto` tier requires ALL
 * three of: (1) customer-satisfying, (2) within the product's allowed
 * customization, (3) structurally cannot cause company financial loss.
 *
 * Admission is decided per action at BUILD time and recorded inline with
 * each definition. The model never judges tiering at runtime. The agent
 * loop in aiAgentLoop.ts will execute these without confirmation; lower-
 * tier actions still short-circuit into the existing confirm flow.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─── look_up_product_info (auto) ───────────────────────────────────────────
 * Read-only documentation/FAQ lookup over WeFixTrades' own product catalog.
 *   1. Customer-satisfying — answers "what does X cost / include?".
 *   2. Within product customization — purely informational, no state change.
 *   3. Cannot cause financial loss — reads static pricing constants only.
 * ────────────────────────────────────────────────────────────────────────── */

const LOOK_UP_PRODUCT_INFO_TOOL: ActionTool = {
  name: "look_up_product_info",
  description:
    "Look up public information about one of WeFixTrades' products. " +
    "Returns the product's tagline, tiers, prices, and headline features straight from the " +
    "company's published catalog. Use this whenever the customer asks 'what does X cost', " +
    "'what's in the Pro tier', 'is Y included' etc. Read-only — does not change any account data.",
  input_schema: {
    type: "object",
    properties: {
      product_id: {
        type: "string",
        description:
          "Product identifier. Known ids include: sitelaunch, tradeline, quotequick, webcare, " +
          "mapguard, reputationshield, socialsync, webfix, rankflow, adflow, contentflow.",
      },
    },
    required: ["product_id"],
  },
};

async function executeLookUpProductInfo(
  action: PendingAction,
  _confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  const raw = typeof action.args.product_id === "string" ? action.args.product_id.trim().toLowerCase() : "";
  if (!raw) throw new Error("A product_id is required.");

  const product = ALL_PRODUCTS.find((p) => p.id.toLowerCase() === raw);
  if (!product) {
    const known = ALL_PRODUCTS.map((p) => p.id).join(", ");
    return {
      narrative: `No product matches "${raw}". Known products: ${known}.`,
    };
  }

  const tierLines = product.tiers.map((t) => {
    const price =
      t.billingPeriod === "one-time"
        ? `$${t.price.toLocaleString()} one-time`
        : `$${t.price.toLocaleString()}/mo`;
    const minutes = t.includedMins ? ` — ${t.includedMins} mins included` : "";
    return `  • ${t.name}: ${price}${minutes}`;
  });
  const lines = [
    `${product.name} — ${product.tagline}`,
    "Tiers:",
    ...tierLines,
  ];
  if (product.setup) lines.push(`Setup fee: $${product.setup.toLocaleString()}`);
  if (product.overageRate) lines.push(`Overage: $${product.overageRate}/min beyond the tier minutes`);

  return { narrative: lines.join("\n") };
}

const LOOK_UP_PRODUCT_INFO_ACTION: CopilotAction = {
  name: "look_up_product_info",
  surface: "portal",
  riskTier: "auto",
  tool: LOOK_UP_PRODUCT_INFO_TOOL,
  execute: executeLookUpProductInfo,
};

/* ─── check_order_status (auto) ─────────────────────────────────────────────
 * Read-only lookup of the authenticated portal user's OWN active services
 * and most recent support tickets. Identity is verified by the portal session
 * — the executor scopes every read to the caller's resolved client_id.
 *   1. Customer-satisfying — answers "where are we at with my onboarding?".
 *   2. Within product customization — read-only.
 *   3. Cannot cause financial loss — read-only.
 * ────────────────────────────────────────────────────────────────────────── */

const CHECK_ORDER_STATUS_TOOL: ActionTool = {
  name: "check_order_status",
  description:
    "Look up the customer's OWN active services and most recent support tickets. " +
    "Returns one short summary per service (e.g. 'TradeLine — onboarding') and per recent ticket. " +
    "Portal-only; identity is already verified by the signed-in session. Read-only.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

async function executeCheckOrderStatus(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  if (action.surface !== "portal") {
    throw new Error("check_order_status is portal-only.");
  }

  const clientId = await resolveClientId(confirmedByUserId);
  if (!clientId) {
    return { narrative: "No services found — your account is not linked to a client record yet." };
  }

  const services = await db
    .select({
      service_id: clientServices.service_id,
      status: clientServices.status,
      enabled: clientServices.enabled,
      started_at: clientServices.started_at,
    })
    .from(clientServices)
    .where(eq(clientServices.client_id, clientId));

  const tickets = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      created_at: supportTickets.created_at,
    })
    .from(supportTickets)
    .where(eq(supportTickets.client_id, clientId))
    .orderBy(desc(supportTickets.created_at))
    .limit(3);

  const serviceLines = services.length
    ? services.map((s) => `  • ${s.service_id}: ${s.status}${s.enabled ? "" : " (disabled)"}`)
    : ["  • (no services on this account)"];
  const ticketLines = tickets.length
    ? tickets.map((t) => `  • #${t.id} "${t.subject}" — ${t.status}`)
    : ["  • (no recent tickets)"];

  return {
    narrative: ["Your services:", ...serviceLines, "Recent support tickets:", ...ticketLines].join("\n"),
  };
}

const CHECK_ORDER_STATUS_ACTION: CopilotAction = {
  name: "check_order_status",
  surface: "portal",
  riskTier: "auto",
  tool: CHECK_ORDER_STATUS_TOOL,
  execute: executeCheckOrderStatus,
};

/* ─── set_notification_preference (auto) ────────────────────────────────────
 * Toggles the customer's OWN email/SMS notification opt-in/out flag. This is
 * a strict subset of `update_notification_preference` (the existing low-tier
 * action) — restricted to just the two channel keys (email, sms), no other
 * categories. By limiting to the channel toggles only, the action is bounded
 * tightly enough to admit as auto.
 *   1. Customer-satisfying — toggles their own opt-in preference.
 *   2. Within product customization — built-in account setting.
 *   3. Cannot cause financial loss — toggling notifications has no $ effect.
 * ────────────────────────────────────────────────────────────────────────── */

const SET_NOTIFICATION_PREFERENCE_TOOL: ActionTool = {
  name: "set_notification_preference",
  description:
    "Turn the customer's OWN email or SMS notification opt-in on or off. " +
    "Portal-only; identity is already verified by the signed-in session. " +
    "Only the 'email' and 'sms' channels can be toggled here — for other categories use " +
    "update_notification_preference instead.",
  input_schema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        enum: ["email", "sms"],
        description: "Which notification channel to toggle.",
      },
      enabled: {
        type: "boolean",
        description: "true to opt in, false to opt out.",
      },
    },
    required: ["channel", "enabled"],
  },
};

async function executeSetNotificationPreference(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  if (action.surface !== "portal") {
    throw new Error("set_notification_preference is portal-only.");
  }
  const channel = action.args.channel;
  const enabled = action.args.enabled;
  if (channel !== "email" && channel !== "sms") {
    throw new Error("channel must be 'email' or 'sms'.");
  }
  if (typeof enabled !== "boolean") {
    throw new Error("enabled must be true or false.");
  }

  const clientId = await resolveClientId(confirmedByUserId);
  if (!clientId) {
    throw new Error("No client record is linked to your account.");
  }

  const [client] = await db
    .select({ metadata: clients.metadata })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const current = parseNotificationPreferences(client?.metadata);

  if (current.channels[channel] === enabled) {
    return {
      narrative: `No change — ${channel} notifications already ${enabled ? "on" : "off"}.`,
    };
  }

  const next: NotificationPreferences = {
    channels: { ...current.channels, [channel]: enabled },
    categories: { ...current.categories },
  };
  const validated = notificationPreferencesSchema.safeParse(next);
  if (!validated.success) throw new Error("Updated preferences failed validation.");

  const prevMetadata = (client?.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(clients)
    .set({
      metadata: { ...prevMetadata, notification_preferences: validated.data },
      updated_at: new Date(),
    })
    .where(eq(clients.id, clientId));

  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "Portal Copilot",
    action: "ai_tool.executed",
    entity_type: "client",
    entity_id: clientId,
    summary: `Portal copilot (auto) turned ${channel} notifications ${enabled ? "on" : "off"}`,
    metadata: {
      tool_name: "set_notification_preference",
      args: action.args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
      risk_tier: "auto",
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return { narrative: `Done — ${channel} notifications ${enabled ? "turned on" : "turned off"}.` };
}

const SET_NOTIFICATION_PREFERENCE_ACTION: CopilotAction = {
  name: "set_notification_preference",
  surface: "portal",
  riskTier: "auto",
  tool: SET_NOTIFICATION_PREFERENCE_TOOL,
  execute: executeSetNotificationPreference,
};

/* ─── update_business_hours (auto) ──────────────────────────────────────────
 * Writes to the customer's OWN TradeLine business-hours config. Structural
 * change but bounded to the product's prebuilt customization surface — every
 * TradeLine customer sets their own hours. The executor refuses any client_id
 * other than the caller's, and refuses to touch anything outside
 * client_services.metadata.tradelineConfig.businessHours.
 *   1. Customer-satisfying — they want to set their hours of operation.
 *   2. Within product customization — prebuilt knob, not a structural override.
 *   3. Cannot cause financial loss — only affects when the assistant takes calls.
 * ────────────────────────────────────────────────────────────────────────── */

const TRADELINE_SERVICE_IDS = ["tradeline-starter", "tradeline-pro", "tradeline-elite"] as const;

const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24-hour
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

interface DaySchedule { open: string; close: string; closed?: boolean }

function parseSchedule(input: unknown): Record<DayKey, DaySchedule> {
  if (!input || typeof input !== "object") {
    throw new Error("schedule must be an object keyed by day (mon..sun).");
  }
  const out: Partial<Record<DayKey, DaySchedule>> = {};
  for (const day of DAY_KEYS) {
    const slot = (input as Record<string, unknown>)[day];
    if (!slot || typeof slot !== "object") {
      throw new Error(`schedule.${day} is required.`);
    }
    const s = slot as Record<string, unknown>;
    const closed = s.closed === true;
    const open = typeof s.open === "string" ? s.open : "";
    const close = typeof s.close === "string" ? s.close : "";
    if (!closed) {
      if (!HOURS_RE.test(open) || !HOURS_RE.test(close)) {
        throw new Error(`schedule.${day} open/close must be HH:MM (24-hour) or set closed: true.`);
      }
    }
    out[day] = { open: open || "09:00", close: close || "17:00", closed };
  }
  return out as Record<DayKey, DaySchedule>;
}

const UPDATE_BUSINESS_HOURS_TOOL: ActionTool = {
  name: "update_business_hours",
  description:
    "Update the customer's OWN TradeLine business hours (when the assistant takes calls). " +
    "Portal-only; identity is already verified by the signed-in session. " +
    "Provide a timezone IANA string (e.g. 'America/Toronto') and a 7-day schedule keyed by " +
    "mon|tue|wed|thu|fri|sat|sun. Each day takes either { open: 'HH:MM', close: 'HH:MM' } " +
    "(24-hour) or { closed: true }.",
  input_schema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone, e.g. 'America/Toronto'.",
      },
      schedule: {
        type: "object",
        description: "Map of day-of-week to { open, close } or { closed: true }.",
      },
    },
    required: ["timezone", "schedule"],
  },
};

async function executeUpdateBusinessHours(
  action: PendingAction,
  confirmedByUserId: number,
): Promise<ActionExecutionResult> {
  if (action.surface !== "portal") {
    throw new Error("update_business_hours is portal-only.");
  }

  const timezone = typeof action.args.timezone === "string" ? action.args.timezone.trim() : "";
  if (!timezone || timezone.length > 80 || !/^[A-Za-z]+\/[A-Za-z_]+/.test(timezone)) {
    throw new Error("timezone must be an IANA name like 'America/Toronto'.");
  }
  const schedule = parseSchedule(action.args.schedule);

  const clientId = await resolveClientId(confirmedByUserId);
  if (!clientId) throw new Error("No client record is linked to your account.");

  const patch = JSON.stringify({ businessHours: { timezone, schedule } });

  // Scoped JSONB merge — only affects this client's tradeline rows, and only
  // the businessHours subtree. Mirrors the pattern used by mobileApiRoutes.
  const result = await db
    .update(clientServices)
    .set({
      metadata: sql`jsonb_set(
        COALESCE(${clientServices.metadata}, '{}'::jsonb),
        '{tradelineConfig}',
        COALESCE(${clientServices.metadata}->'tradelineConfig', '{}'::jsonb) || ${patch}::jsonb
      )`,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(clientServices.client_id, clientId),
        inArray(clientServices.service_id, TRADELINE_SERVICE_IDS as unknown as string[]),
      ),
    )
    .returning({ id: clientServices.id });

  if (result.length === 0) {
    return { narrative: "No TradeLine service is active on your account — nothing to update." };
  }

  await storage.logAdminActivity({
    actor_type: "ai_agent",
    actor_id: confirmedByUserId,
    actor_name: "Portal Copilot",
    action: "ai_tool.executed",
    entity_type: "client_service",
    entity_id: result[0].id,
    summary: `Portal copilot (auto) updated TradeLine business hours (${timezone})`,
    metadata: {
      tool_name: "update_business_hours",
      args: action.args,
      session_id: action.session_id,
      confirmed_by_user_id: confirmedByUserId,
      risk_tier: "auto",
    },
  }).catch((err: Error) => log.error("logAdminActivity failed", { error: err.message }));

  return { narrative: `Done — TradeLine business hours updated for timezone ${timezone}.` };
}

const UPDATE_BUSINESS_HOURS_ACTION: CopilotAction = {
  name: "update_business_hours",
  surface: "portal",
  riskTier: "auto",
  tool: UPDATE_BUSINESS_HOURS_TOOL,
  execute: executeUpdateBusinessHours,
};

/* ─── Register portal actions ─── */
registerCopilotAction(UPDATE_NOTIFICATION_PREFERENCE_ACTION);
registerCopilotAction(DRAFT_INVOICE_ACTION);
// Auto-tier admissions (W-BA-1) — see admission rationale above each block.
registerCopilotAction(LOOK_UP_PRODUCT_INFO_ACTION);
registerCopilotAction(CHECK_ORDER_STATUS_ACTION);
registerCopilotAction(SET_NOTIFICATION_PREFERENCE_ACTION);
registerCopilotAction(UPDATE_BUSINESS_HOURS_ACTION);

/** Anthropic tool definitions for the portal surface — handed to the model. */
export const PORTAL_TOOLS: ActionTool[] = getCopilotActionsForSurface("portal").map((a) => a.tool);
