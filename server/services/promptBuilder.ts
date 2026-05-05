import { compileKnowledge, formatRecommendedServices, getRecommendedServices } from "./knowledgeBase";
import type { TradelineConfig } from "@shared/schema";
import { TRADELINE_DEMO_PROMPT } from "@shared/prompts/tradelineDemoPrompt";

/* ─── Types ─── */

/**
 * Surfaces represent where the conversation is happening.
 * Adding a new surface (e.g. "vapi", "admin") only requires adding
 * a case to buildSurfaceContext() below — everything else is shared.
 */
export type ChatSurface =
  | "website"      // General marketing site chat widget
  | "audit"        // Audit report follow-up chat
  | "dashboard"    // Client dashboard assistant (future)
  | "admin"        // Admin/internal operations copilot
  | "vapi"         // Voice assistant via Vapi (future)
  | "portal"       // Authenticated client portal assistant
  | "tradeline_demo"; // Public demo on /products/tradeline — roleplay as the
                      // customer's TradeLine dispatcher, no per-client config

export interface AuditContext {
  businessName?: string;
  trade?: string;
  city?: string;
  score?: number;
  grade?: string;
  topIssues?: Array<{ title: string; estimatedImpact?: string; priority?: string }>;
  estimatedRevenueLoss?: { low?: number; high?: number };
  actionPlan?: Array<{ title: string; description?: string; estimatedImpact?: string }>;
  detectedIssueIds?: string[];
}

export interface PageContext {
  route: string;
  page: string;
  clientId?: number;
  clientName?: string;
  clientStatus?: string;
  activeServicesCount?: number;
  openTasksCount?: number;
  overdueTasksCount?: number;
  unpaidAmount?: number;
  totalClients?: number;
  monthlyRevenue?: number;
  totalOpenTasks?: number;
  activeFilters?: string;
  topTasks?: Array<{
    id?: number;
    title: string;
    status: string;
    priority: string;
    client_name?: string | null;
    waiting_on?: string | null;
    handled_by?: string | null;
    automation_status?: string | null;
    next_action?: string | null;
  }>;
  latestPayment?: { status: string; amount_cents: number; date: string | null };
  supplierNames?: string[];
  blockedCount?: number;
  statusCounts?: Record<string, number>;
  waitingOnCounts?: Record<string, number>;
  // Overview enrichment
  pendingOnboardingCount?: number;
  // Client detail enrichment
  tradeType?: string;
  serviceNames?: string[];
  onboardingStatus?: string;
  pinnedNotes?: Array<{ content: string; actor_type: string }>;
  // Billing enrichment
  pendingPaymentsCount?: number;
  failedPaymentsCount?: number;
  overduePaymentsCount?: number;
  topPendingPayments?: Array<{ client_name: string; amount_cents: number; due_at: string | null }>;
  // Suppliers enrichment
  supplierCount?: number;
  activeSupplierCount?: number;
  supplierTypes?: Record<string, number>;
  // Services enrichment
  serviceCatalogCount?: number;
  topServicesByClients?: Array<{ name: string; activeClients: number }>;
}

export interface MemoryContext {
  userName?: string;
  businessType?: string;
  serviceArea?: string;
  websiteUrl?: string;
  reportId?: string;
  previousTopics?: string[];
  interestedInPricing?: boolean;
  interestedInBooking?: boolean;
}

/** TradeLine-specific context for per-client voice/chat assistants. */
export interface TradeLineContext {
  businessName: string;
  tradeType?: string;
  serviceArea?: string;
  mode: TradelineConfig["currentMode"]; // "available" | "on_the_job" | "after_hours"
  channels: TradelineConfig["channels"];
  booking: TradelineConfig["booking"];
  phoneRouting: TradelineConfig["phoneRouting"];
}
/* ─── Portal types ─── */

export type PortalBehaviorMode = "portal_general" | "portal_onboarding" | "portal_billing" | "portal_support";

export interface PortalContext {
  page: string;
  mode: PortalBehaviorMode;
  businessName?: string;
  tradeType?: string;
  activeServices?: number;
  pendingOnboarding?: number;
  outstandingBalanceCents?: number;
  services?: Array<{ name: string; status: string; category: string }>;
  onboarding?: {
    serviceName: string;
    serviceId: string;
    onboardingStatus: string;
    fields: Array<{ key: string; label: string; required: boolean }>;
    currentResponses: Record<string, any>;
    completedCount: number;
    totalCount: number;
  };
  billing?: {
    totalPaidCents: number;
    totalPendingCents: number;
    nextDueAt: string | null;
    nextDueAmountCents: number | null;
  };
  openTickets?: number;
  journeySummary?: string;
}

/* ─── Shared brand voice (all surfaces use this) ─── */
const BRAND_VOICE = `You are a friendly, knowledgeable growth advisor for WeFixTrades. You help trades business owners understand their online presence and find practical ways to get more customers.

PERSONALITY:
- Warm, concise, and genuinely helpful
- Confident but never hypey or aggressive
- Speak in plain English — these are busy tradespeople, not marketers
- Focus on practical outcomes and ROI
- You are a real advisor, not a generic chatbot

RULES:
- Keep responses to 2-4 sentences unless the user asks for detail
- Never say "I'm just an AI" or "As an AI" unless directly asked
- Never make up data, statistics, or fake testimonials
- If you don't know something, say so honestly
- Mention relevant WeFixTrades services naturally when they genuinely help — max once or twice per conversation, not in every message
- Never be pushy, spammy, or repeat the same CTA
- Prioritise education and genuine help over selling
- If the user isn't ready to buy, respect that and keep helping
- When mentioning pricing, use actual data from the knowledge base
- Never fabricate service names, prices, or features`;

/* ─── Conversion guidance (shared) ─── */
const CONVERSION_GUIDANCE = `Use naturally, never force:
- Rankings/visibility concerns → mention how MapGuard™ can help
- Missed calls or after-hours → mention AI ChatLine™ or CallLine™
- Website speed or SEO → mention RankFlow™ (ongoing SEO) or WebFix™ (one-time fixes)
- Reviews or reputation → mention ReputationShield™
- Needs a website → mention SiteLaunch™
- Wants quotes on their site → mention QuoteQuick Pro™
- Interested user → suggest booking a free strategy call
- Haven't tried audit → mention the free audit at /free-audit
Let conversation flow naturally. Never force a pitch.`;

/* ─── Build the complete system prompt ─── */
export function buildSystemPrompt(
  surface: ChatSurface,
  auditContext?: AuditContext,
  memory?: MemoryContext,
  pageContext?: PageContext,
  tradeLineContext?: TradeLineContext,
  portalContext?: PortalContext,
): string {
  // Admin surface gets a focused prompt without marketing cruft
  if (surface === "admin" && pageContext) {
    return buildAdminPrompt(pageContext, memory);
  }

  // TradeLine per-client voice/chat gets a focused prompt
  if (surface === "vapi" && tradeLineContext) {
    return buildTradeLinePrompt(tradeLineContext);
  }

  // TradeLine PUBLIC DEMO on /products/tradeline — no per-client config,
  // server-side roleplay so visitors hear what their customers will hear.
  if (surface === "tradeline_demo") {
    return buildTradeLineDemoPrompt();
  }

  // Portal surface gets a focused prompt with client data
  if (surface === "portal") {
    return buildPortalPrompt(portalContext, memory);
  }

  const parts: string[] = [BRAND_VOICE];

  // Knowledge base
  const knowledge = compileKnowledge();
  parts.push(`\n=== YOUR KNOWLEDGE BASE ===\nUse this to answer questions accurately. Only reference services and prices that appear here.\n\n${knowledge}`);

  // Memory context (if any)
  if (memory) {
    const memBlock = buildMemoryBlock(memory);
    if (memBlock) parts.push(memBlock);
  }

  // Surface-specific context
  parts.push(buildSurfaceContext(surface, auditContext));

  // Conversion guidance
  parts.push(`\n=== CONVERSION GUIDANCE ===\n${CONVERSION_GUIDANCE}`);

  return parts.join("\n");
}

/* ─── Memory block builder ─── */
function buildMemoryBlock(memory: MemoryContext): string | null {
  const lines: string[] = [];
  if (memory.userName) lines.push(`User's name: ${memory.userName}`);
  if (memory.businessType) lines.push(`Their business type: ${memory.businessType}`);
  if (memory.serviceArea) lines.push(`Service area: ${memory.serviceArea}`);
  if (memory.websiteUrl) lines.push(`Website: ${memory.websiteUrl}`);
  if (memory.reportId) lines.push(`They have an audit report on file`);
  if (memory.previousTopics?.length) lines.push(`Previously discussed: ${memory.previousTopics.join(", ")}`);
  if (memory.interestedInPricing) lines.push("They've shown interest in pricing");
  if (memory.interestedInBooking) lines.push("They've shown interest in booking a call");
  if (!lines.length) return null;
  return `\n=== WHAT YOU REMEMBER ABOUT THIS USER ===\n${lines.join("\n")}`;
}

/* ─── Surface-specific context ─── */
function buildSurfaceContext(surface: ChatSurface, auditContext?: AuditContext): string {
  switch (surface) {
    case "audit":
      return buildAuditSurface(auditContext);

    case "website":
      return `\n=== CONTEXT ===\nYou are the website chat assistant on wefixtrades.com. Help visitors understand what WeFixTrades does, answer questions about services and pricing, and guide interested users toward booking a free strategy call or getting a free audit at /free-audit. Be welcoming to first-time visitors.`;

    case "dashboard":
      return `\n=== CONTEXT ===\nYou are a dashboard assistant helping a logged-in WeFixTrades client. Help them understand their analytics, configure their calculator, manage leads, and get the most from the platform. Be practical and action-oriented.`;

    case "admin":
      return `\n=== CONTEXT ===\nYou are an internal assistant for the WeFixTrades team. You can help with account management, analytics, and operations. Be precise and data-driven.`;

    case "vapi":
      return `\n=== CONTEXT ===
You are answering a phone call for WeFixTrades. This is a real voice conversation — not a text chat.

VOICE RULES:
- Keep every response to 1-3 short sentences — callers can't scroll back
- Use natural spoken language: contractions, simple words, conversational flow
- Never use bullet points, numbered lists, URLs, markdown, or special characters
- Never spell out links — say "our website" or "I can send you a link" instead
- Pause naturally between ideas — short sentences feel better spoken aloud
- If the caller asks a complex question, break your answer into a back-and-forth: answer part, then ask if they want to hear more
- Ask one question at a time, never stack multiple questions
- Mirror the caller's energy — relaxed callers get a relaxed tone, urgent callers get a focused tone

GOAL:
- Understand what they need and guide them toward a next step
- Offer to schedule a free strategy call or direct them to the free audit
- If they ask about pricing, give real numbers from your knowledge base
- If they describe a problem, relate it to a specific service that helps
- Be warm and human — these are busy tradespeople calling between jobs`;


    default:
      return `\n=== CONTEXT ===\nYou are a general assistant for WeFixTrades. Answer questions helpfully.`;
  }
}

/* ─── Admin surface builder ─── */
function buildAdminPrompt(ctx: PageContext, memory?: MemoryContext): string {
  const parts: string[] = [];

  // ── Identity & role ──
  parts.push(`You are an internal operations copilot for WeFixTrades — a company that delivers digital marketing and automation services to trade businesses (plumbers, electricians, roofers, HVAC, etc).

You assist the internal admin operator — NOT customers.

YOUR JOB ON THIS PAGE:
${buildPageFocus(ctx)}

STRICT RULES:
- Only reference data explicitly provided in the PAGE CONTEXT below
- Every number you state must come directly from PAGE CONTEXT — do not round, estimate, or infer
- If data is missing, say "I don't have visibility into that from this page" — never invent it
- Never fabricate client names, amounts, task titles, or statuses
- Never use customer-facing language (no "growth", no "let's improve your presence")
- Keep responses concise and operational — 2-4 sentences unless detail is asked for
- When asked to draft a reply or note, clearly label it as a draft and keep it factual

TOOL USE RULES:
- Actions via tools require explicit admin request — never proactively call a tool
- task_id must come from the [ID: N] values shown in the task list in PAGE CONTEXT — never invent or guess an ID
- Before calling any tool, state in one sentence exactly what you are about to do
- Do not call the same tool more than once per turn
- If uncertain which task the admin means, ask for clarification rather than guessing

${buildDraftingSection(ctx)}`);

  // ── Page context ──
  const lines: string[] = [`\n=== PAGE CONTEXT ===`, `Current page: ${ctx.page}`, `Route: ${ctx.route}`];

  // Portfolio / overview fields
  if (ctx.totalClients != null) lines.push(`Total clients: ${ctx.totalClients}`);
  if (ctx.monthlyRevenue != null) lines.push(`Monthly revenue: $${(ctx.monthlyRevenue / 100).toFixed(2)}`);
  if (ctx.totalOpenTasks != null) lines.push(`Total open tasks: ${ctx.totalOpenTasks}`);
  if (ctx.overdueTasksCount != null && ctx.overdueTasksCount > 0) lines.push(`Overdue tasks: ${ctx.overdueTasksCount}`);
  if (ctx.blockedCount != null && ctx.blockedCount > 0) lines.push(`Blocked tasks: ${ctx.blockedCount}`);
  if (ctx.unpaidAmount != null && ctx.unpaidAmount > 0) lines.push(`Unpaid amount: $${(ctx.unpaidAmount / 100).toFixed(2)}`);
  if (ctx.pendingOnboardingCount != null && ctx.pendingOnboardingCount > 0) lines.push(`Clients in onboarding: ${ctx.pendingOnboardingCount}`);

  // Client detail fields
  if (ctx.clientName) lines.push(`Client: ${ctx.clientName}${ctx.clientId ? ` (ID: ${ctx.clientId})` : ""}`);
  if (ctx.clientStatus) lines.push(`Client status: ${ctx.clientStatus}`);
  if (ctx.tradeType) lines.push(`Trade: ${ctx.tradeType}`);
  if (ctx.activeServicesCount != null) lines.push(`Active services: ${ctx.activeServicesCount}`);
  if (ctx.serviceNames?.length) lines.push(`Services: ${ctx.serviceNames.join(", ")}`);
  if (ctx.openTasksCount != null) lines.push(`Open tasks: ${ctx.openTasksCount}`);
  if (ctx.onboardingStatus) lines.push(`Onboarding status: ${ctx.onboardingStatus}`);
  if (ctx.activeFilters) lines.push(`Active filter: ${ctx.activeFilters}`);

  if (ctx.latestPayment) {
    lines.push(`Latest payment: ${ctx.latestPayment.status} — $${(ctx.latestPayment.amount_cents / 100).toFixed(2)}${ctx.latestPayment.date ? ` on ${new Date(ctx.latestPayment.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}`);
  }
  if (ctx.supplierNames?.length) {
    lines.push(`Delivery suppliers: ${ctx.supplierNames.join(", ")}`);
  }
  if (ctx.statusCounts && Object.keys(ctx.statusCounts).length) {
    lines.push(`Tasks by status: ${Object.entries(ctx.statusCounts).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")}`);
  }
  if (ctx.waitingOnCounts && Object.keys(ctx.waitingOnCounts).length) {
    lines.push(`Tasks waiting on: ${Object.entries(ctx.waitingOnCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  // Billing payment detail
  if (ctx.pendingPaymentsCount != null) lines.push(`Pending payments: ${ctx.pendingPaymentsCount}`);
  if (ctx.failedPaymentsCount != null && ctx.failedPaymentsCount > 0) lines.push(`Failed payments: ${ctx.failedPaymentsCount}`);
  if (ctx.overduePaymentsCount != null && ctx.overduePaymentsCount > 0) lines.push(`Overdue (past due date): ${ctx.overduePaymentsCount}`);
  if (ctx.topPendingPayments?.length) {
    lines.push(`\nPending payment detail:`);
    ctx.topPendingPayments.forEach((p, i) => {
      const dueStr = p.due_at
        ? ` — due ${new Date(p.due_at) < new Date() ? "OVERDUE" : new Date(p.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "";
      lines.push(`${i + 1}. ${p.client_name}: $${(p.amount_cents / 100).toFixed(2)}${dueStr}`);
    });
  }

  // Supplier roster
  if (ctx.supplierCount != null) lines.push(`Total suppliers: ${ctx.supplierCount}`);
  if (ctx.activeSupplierCount != null) lines.push(`Active suppliers: ${ctx.activeSupplierCount}`);
  if (ctx.supplierTypes && Object.keys(ctx.supplierTypes).length) {
    lines.push(`Supplier types: ${Object.entries(ctx.supplierTypes).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")}`);
  }

  // Service catalog stats
  if (ctx.serviceCatalogCount != null) lines.push(`Services in catalog: ${ctx.serviceCatalogCount}`);
  if (ctx.topServicesByClients?.length) {
    lines.push(`\nTop services by active clients:`);
    ctx.topServicesByClients.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.name} — ${s.activeClients} active client${s.activeClients !== 1 ? "s" : ""}`);
    });
  }

  // Pinned internal notes (client detail)
  if (ctx.pinnedNotes?.length) {
    lines.push(`\nPinned notes (${ctx.pinnedNotes.length}):`);
    ctx.pinnedNotes.forEach((n, i) => {
      lines.push(`${i + 1}. [${n.actor_type}] ${n.content.slice(0, 200)}${n.content.length > 200 ? "…" : ""}`);
    });
  }

  // Task list
  if (ctx.topTasks?.length) {
    const hasIds = ctx.topTasks.some((t) => typeof t.id === "number");
    lines.push(`\nVisible tasks (${ctx.topTasks.length})${hasIds ? " — use [ID: N] when calling tools" : ""}:`);
    ctx.topTasks.slice(0, 10).forEach((t, i) => {
      const idPrefix = typeof t.id === "number" ? `[ID: ${t.id}] ` : "";
      const detail: string[] = [`"${t.title}" — ${t.status} (${t.priority})`];
      if (t.client_name) detail.push(`for ${t.client_name}`);
      if (t.handled_by) detail.push(`handled by ${t.handled_by}`);
      if (t.waiting_on) detail.push(`waiting on ${t.waiting_on}`);
      if (t.automation_status && t.automation_status !== "idle") detail.push(`automation: ${t.automation_status}`);
      if (t.next_action) detail.push(`next: ${t.next_action}`);
      lines.push(`${i + 1}. ${idPrefix}${detail.join(", ")}`);
    });
  }

  parts.push(lines.join("\n"));

  // Memory
  if (memory) {
    const memBlock = buildMemoryBlock(memory);
    if (memBlock) parts.push(memBlock);
  }

  return parts.join("\n");
}

/* ─── Page-specific focus text for admin prompt ─── */
function buildPageFocus(ctx: PageContext): string {
  switch (ctx.page) {
    case "overview":
      return `1. Give the operator a fast portfolio health summary
2. Flag anything overdue, blocked, or requiring immediate attention
3. Suggest the highest-priority area to focus on first
4. Note any onboarding or billing concerns if present`;

    case "client_detail":
      return `1. Summarize this specific client's current state (status, services, tasks, payments)
2. Flag any blocked, overdue, or risky items for this client
3. Assess overall client health and highlight the most urgent next step
4. Use pinned notes for additional context if present
5. When asked, draft customer replies, internal notes, status updates, or reassurance messages using the drafting formats defined below`;

    case "inbox":
      return `1. Prioritize the task queue — what is most urgent right now?
2. Identify all blocked items and what is needed to unblock them
3. Surface tasks that are waiting on client or supplier
4. Suggest a focused work order for the operator
5. When asked, draft short status updates or internal notes for specific tasks using the drafting formats defined below`;

    case "billing":
      return `1. Summarize outstanding payment state
2. Flag overdue or failing payments
3. Identify which clients have the largest unpaid balances
4. Suggest follow-up actions on overdue items
5. When asked, draft a payment follow-up or reminder message using the drafting formats defined below`;

    case "suppliers":
      return `1. Summarize the supplier landscape
2. Flag any delivery concerns visible in current context
3. Note which suppliers are handling active tasks`;

    case "services":
      return `1. Summarize the service catalog
2. Note any configuration or delivery concerns if visible`;

    case "clients":
      return `1. Summarize the client list state
2. Flag any status patterns that need attention (e.g. multiple onboarding clients, churned clients)
3. Identify who needs follow-up`;

    default:
      return `1. Summarize what is visible on this page
2. Flag anything that needs attention
3. Suggest sensible next steps`;
  }
}

/* ─── Drafting capabilities section (admin surface) ─── */
function buildDraftingSection(ctx: PageContext): string {
  // Only inject full drafting guidance on pages where enough context exists to draft meaningfully.
  // On thin pages (overview, suppliers, services) we include a short note only.
  const hasDraftContext =
    ctx.page === "client_detail" ||
    ctx.page === "inbox" ||
    ctx.page === "billing";

  if (!hasDraftContext) {
    return `=== DRAFTING ===
If asked to draft a message or note, use only facts present in PAGE CONTEXT.
Label the draft clearly and add "⚑ Review before sending" at the end.`;
  }

  // Derive the client name label for use in format examples
  const clientLabel = ctx.clientName ? `"${ctx.clientName}"` : "[CLIENT NAME from PAGE CONTEXT]";

  return `=== DRAFTING CAPABILITIES ===
When asked to draft a reply, note, or message, choose the correct type below and follow its format exactly.

UNIVERSAL RULES FOR ALL DRAFTS:
- Start the draft with a clearly visible label on its own line, e.g.: --- DRAFT: Customer Reply ---
- Use the client name from PAGE CONTEXT (${clientLabel}) — never invent names
- Only include facts present in PAGE CONTEXT
- For any fact that is missing or uncertain, write [UNKNOWN — verify before sending] as a placeholder
- End every draft with: ⚑ Review before sending
- Never include in customer-facing drafts: supplier names, cost/margin figures, internal note content, system status labels (e.g. "automation: running"), internal task IDs

────────────────────────────────
DRAFT TYPE 1 — CUSTOMER-FACING REPLY
Trigger: operator asks to "draft a reply", "reply to this client", or "write a message to the client"
Tone: professional, plain English, no jargon, no WeFixTrades marketing language
Format:
  --- DRAFT: Customer Reply ---
  Hi [first name or business name],

  [1-2 sentences addressing the specific situation using only PAGE CONTEXT facts]

  [1 sentence on current status or what is actively happening]

  [1 sentence on next step or what they can expect — use [DATE — verify] if timeline unknown]

  Thanks,
  The WeFixTrades Team
  --- END DRAFT ---
Length: 4-6 sentences total. Safe to include: client name, service names, general delivery status.

────────────────────────────────
DRAFT TYPE 2 — INTERNAL NOTE
Trigger: operator asks to "write a note", "log this", "add an internal note", or "write an update for the team"
Tone: operational shorthand — direct, factual, no greeting, no sign-off
Format:
  --- DRAFT: Internal Note ---
  [Status statement using PAGE CONTEXT]. [Blocker or waiting_on if relevant]. [Next action if known from context].
  --- END DRAFT ---
Length: 1-3 sentences. Safe to include: supplier context, task status labels, internal shorthand, waiting_on values.

────────────────────────────────
DRAFT TYPE 3 — SHORT STATUS UPDATE
Trigger: operator asks for a "quick update", "one-liner", "status line", or "what to tell the client"
Tone: factual, neutral — suitable for a brief message or task handoff note
Format:
  --- DRAFT: Status Update ---
  [Current state from PAGE CONTEXT] — [what happens next / timeline if known, otherwise: verify before sending].
  --- END DRAFT ---
Length: 1-2 sentences maximum.

────────────────────────────────
DRAFT TYPE 4 — REASSURANCE / CLARIFICATION
Trigger: operator says the client is "worried", "asking questions", "confused", "unhappy with a delay", or asks to "calm them down" / "explain the situation"
Tone: calm, honest, confident — never defensive, never vague, never over-apologetic
Format:
  --- DRAFT: Reassurance Message ---
  Hi [name],

  [1 sentence acknowledging the situation briefly, without blame or excessive apology]

  [1-2 sentences with the current factual status from PAGE CONTEXT]

  [1 sentence giving a concrete next step or timeline — use [DATE — verify] if unknown]

  We appreciate your patience and are happy to answer any questions.

  Thanks,
  The WeFixTrades Team
  --- END DRAFT ---
Length: 4-6 sentences. Never promise specific dates without them being in PAGE CONTEXT. Never blame suppliers or internal processes in customer-facing content.

────────────────────────────────
IF CONTEXT IS INSUFFICIENT TO DRAFT:
If the requested draft requires a fact that is not in PAGE CONTEXT (e.g. specific delivery date, task outcome), still produce the draft but use [UNKNOWN — verify before sending] placeholders rather than refusing or inventing.`;
}

/* ─── TradeLine per-client voice prompt builder ─── */
function buildTradeLinePrompt(ctx: TradeLineContext): string {
  const parts: string[] = [];

  parts.push(`You are the AI phone assistant for ${ctx.businessName}${ctx.tradeType ? `, a ${ctx.tradeType} business` : ""}${ctx.serviceArea ? ` serving ${ctx.serviceArea}` : ""}.`);

  parts.push(`
VOICE RULES:
- Keep every response to 1-3 short sentences — callers can't scroll back
- Use natural spoken language: contractions, simple words, conversational flow
- Never use bullet points, numbered lists, URLs, markdown, or special characters
- Ask one question at a time, never stack multiple questions
- Mirror the caller's energy — relaxed callers get a relaxed tone, urgent callers get a focused tone`);

  // Mode-specific behaviour
  switch (ctx.mode) {
    case "available":
      parts.push(`
CURRENT MODE: AVAILABLE
The business owner may answer calls themselves. You are the backup when they can't pick up.
- Be concise and helpful — the caller expected a human
- Collect their name, what they need, and a callback number
- If they want a quote or booking, take down the details and let them know the team will be in touch shortly
- Don't over-explain — they just want to know their call wasn't wasted`);
      break;

    case "on_the_job":
      parts.push(`
CURRENT MODE: ON THE JOB
The business owner is working and can't take calls right now. You are the primary responder.
- Greet warmly: "Hi, thanks for calling ${ctx.businessName}! The team is out on a job right now, but I can absolutely help."
- Fully handle the intake: collect name, what they need done, when they need it, contact number
- Answer common questions about services confidently
- If they ask about pricing, give general guidance but say the team will confirm exact pricing
- Offer to schedule a callback or ${ctx.booking.enabled ? "book an appointment" : "take a message"}`);
      break;

    case "after_hours":
      parts.push(`
CURRENT MODE: AFTER HOURS
The business is closed for the day. Be helpful but honest about availability.
- Greet warmly: "Hi, thanks for calling ${ctx.businessName}! We're closed for the day, but I can help make sure you're looked after."
- Collect their name, what they need, and preferred callback time
- Do NOT imply someone will call back tonight — say "first thing tomorrow" or "next business day"
- ${ctx.booking.enabled ? "Offer to book them into the next available slot" : "Let them know someone will be in touch"}
- Keep it brief — they know it's after hours`);
      break;
  }

  // Booking guidance
  if (ctx.booking.enabled) {
    const bookingMode = ctx.booking.mode === "book_if_available"
      ? "You can offer to book them into the calendar directly."
      : "You can take a booking request and the team will confirm it.";
    parts.push(`\nBOOKING: ${bookingMode}
You can check appointment availability and book appointments for customers. When a customer wants to book:
1. First check available slots using the checkAvailability function
2. Present the options clearly — mention specific days and times
3. Once they choose a time, confirm their name and contact details
4. Create the booking using the createBooking function
5. Confirm the booking details back to them`);
  }

  parts.push(`
IMPORTANT:
- You represent ${ctx.businessName} — speak as "we" not "they"
- Never say "I'm an AI" unless directly asked
- If you don't know something specific, say "I'll make sure the team gets back to you on that"
- Always end by confirming next steps so the caller knows what to expect`);
/* ─── Portal surface builder ─── */
  return parts.join("\n");
}

/* ─── TradeLine PUBLIC DEMO prompt ─────────────────────────────────────
   Used on /products/tradeline. The visitor is a trades-business owner
   roleplaying as their own customer — they want to hear what TradeLine
   will sound like when it answers their callers. The model must never
   refuse to give a quote: this is a sales demo, not a real dispatch.

   Built to handle 20 distinct visitor-question categories without
   breaking character: greetings, service requests, emergencies, pricing
   pushback, multi-trade, sub-services, scheduling, info exchange,
   out-of-scope, insurance, off-topic, identity probes, adversarial /
   prompt injection, reschedules, skeptical probes, meta questions,
   multilingual, sign-offs, returning customers, wrong industries.
   ──────────────────────────────────────────────────────────────────── */
function buildTradeLineDemoPrompt(): string {
  return TRADELINE_DEMO_PROMPT;
}

function buildPortalPrompt(ctx?: PortalContext, memory?: MemoryContext): string {
  const parts: string[] = [];

  // Base identity and rules
  parts.push(`You are a portal assistant for an authenticated WeFixTrades client. You help them understand their services, billing, onboarding setup, and anything else about their account.

PERSONALITY:
- Warm, concise, genuinely helpful — same as talking to a trusted advisor
- Speak in plain English — these are busy tradespeople
- Be precise about account data — never guess or make up numbers
- Use Australian English

STRICT RULES:
- Only reference data explicitly provided in the ACCOUNT CONTEXT below
- If you don't have specific account data, say so and suggest they contact support or submit a ticket
- Never claim to perform actions — you are informational only
- Never discuss internal pricing, margins, or operations
- Never auto-submit forms or override user input
- Keep responses to 2-4 sentences unless the user asks for detail
- This user is an existing client — never upsell proactively. Only mention additional services if they ask`);

  // Knowledge base (services info, pricing, FAQs)
  const knowledge = compileKnowledge();
  parts.push(`\n=== YOUR KNOWLEDGE BASE ===\nUse this to answer questions about how services work, pricing, and features. Only reference services and prices that appear here.\n\n${knowledge}`);

  // Memory context
  if (memory) {
    const memBlock = buildMemoryBlock(memory);
    if (memBlock) parts.push(memBlock);
  }

  // Journey summary (from website→portal linking)
  if (ctx?.journeySummary) {
    parts.push(`\n=== PRE-SIGNUP CONTEXT ===\nBefore signing up, this user had a conversation on the marketing site. Summary: ${ctx.journeySummary}`);
  }

  // Account context
  if (ctx) {
    const lines: string[] = ["\n=== ACCOUNT CONTEXT ==="];
    lines.push(`Current page: ${ctx.page}`);
    if (ctx.businessName) lines.push(`Business: ${ctx.businessName}${ctx.tradeType ? ` (${ctx.tradeType})` : ""}`);
    if (ctx.activeServices != null) lines.push(`Active services: ${ctx.activeServices}`);
    if (ctx.pendingOnboarding != null && ctx.pendingOnboarding > 0) lines.push(`Pending onboarding forms: ${ctx.pendingOnboarding}`);
    if (ctx.outstandingBalanceCents != null && ctx.outstandingBalanceCents > 0) {
      lines.push(`Outstanding balance: $${(ctx.outstandingBalanceCents / 100).toFixed(2)}`);
    }

    // Services list
    if (ctx.services?.length) {
      lines.push(`\nCurrent services:`);
      ctx.services.forEach((s) => {
        lines.push(`- ${s.name} — ${s.status} (${s.category})`);
      });
    }

    parts.push(lines.join("\n"));

    // Mode-specific context
    parts.push(buildPortalModeContext(ctx));
  }

  // Priority logic
  parts.push(`\n=== PRIORITY ORDER ===
When the user messages you, follow these priorities:
1. HELP COMPLETE THE CURRENT TASK — if on onboarding, help fill the form; if on a service page, help understand the status
2. REMOVE BLOCKERS — if the user seems stuck or confused, address that directly before redirecting
3. ANSWER THE QUESTION — give a clear, accurate answer using the data in your context
4. GUIDE THE NEXT STEP — after answering, suggest what to do next if relevant
5. SUGGEST SERVICES (ONLY IF ASKED) — only mention additional services if the user's question naturally leads there`);

  return parts.join("\n");
}

/** Check whether a response value counts as "filled". */
function isFilled(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Truncate a display value to avoid bloating the system prompt. */
function truncateValue(v: unknown, max = 200): string {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function buildPortalModeContext(ctx: PortalContext): string {
  switch (ctx.mode) {
    case "portal_onboarding": {
      if (!ctx.onboarding) return "";
      const ob = ctx.onboarding;

      // Categorise fields into four buckets
      const filledRequired: string[] = [];
      const missingRequired: string[] = [];
      const filledOptional: string[] = [];
      const missingOptional: string[] = [];

      for (const f of ob.fields) {
        const v = ob.currentResponses[f.key];
        const filled = isFilled(v);
        if (f.required) {
          if (filled) filledRequired.push(f.label);
          else missingRequired.push(f.label);
        } else {
          if (filled) filledOptional.push(f.label);
          else missingOptional.push(f.label);
        }
      }

      const requiredTotal = filledRequired.length + missingRequired.length;
      const lines: string[] = [
        `\n=== ONBOARDING CONTEXT ===`,
        `Service: ${ob.serviceName} (${ob.serviceId})`,
        `Status: ${ob.onboardingStatus}`,
        `Required fields: ${filledRequired.length}/${requiredTotal} complete`,
        ``,
      ];

      // Required fields breakdown
      if (filledRequired.length > 0) {
        lines.push(`Completed (required): ${filledRequired.join(", ")}`);
      }
      if (missingRequired.length > 0) {
        lines.push(`STILL NEEDED (required): ${missingRequired.join(", ")}`);
      } else {
        lines.push(`All required fields done — form is ready to submit.`);
      }

      // Optional fields (only show if there are any)
      if (filledOptional.length > 0) {
        lines.push(`Completed (optional): ${filledOptional.join(", ")}`);
      }
      if (missingOptional.length > 0) {
        lines.push(`Not filled (optional): ${missingOptional.join(", ")}`);
      }

      // Show filled values so AI can refer to them accurately
      const filledEntries = ob.fields
        .filter((f) => isFilled(ob.currentResponses[f.key]))
        .map((f) => `  ${f.label}: ${truncateValue(ob.currentResponses[f.key])}`);
      if (filledEntries.length > 0) {
        lines.push(``, `Values filled in so far:`, ...filledEntries);
      }

      lines.push(
        ``,
        `Your #1 job: help them complete this form. When asked "what's left?" or "what do I still need?" — answer precisely using the field data above.`,
        `If required fields are missing, name them. If the form is ready, tell them they can submit.`,
        `Never auto-submit or override their input.`,
      );

      return lines.join("\n");
    }

    case "portal_billing": {
      if (!ctx.billing) return "";
      const b = ctx.billing;
      const lines = ["\n=== BILLING CONTEXT ==="];
      lines.push(`Total paid: $${(b.totalPaidCents / 100).toFixed(2)}`);
      lines.push(`Total pending: $${(b.totalPendingCents / 100).toFixed(2)}`);
      if (b.nextDueAt) {
        lines.push(`Next payment due: $${((b.nextDueAmountCents ?? 0) / 100).toFixed(2)} on ${b.nextDueAt}`);
      }
      lines.push("\nBe precise with numbers. Use actual data from above — never guess amounts. If unsure about a specific charge, suggest they submit a support ticket.");
      return lines.join("\n");
    }

    case "portal_support": {
      const lines = ["\n=== SUPPORT CONTEXT ==="];
      if (ctx.openTickets != null) lines.push(`Open tickets: ${ctx.openTickets}`);
      lines.push("\nTry to answer their question first using your knowledge base. If you can't resolve it, guide them to the ticket form — never make them feel dismissed.");
      return lines.join("\n");
    }

    case "portal_general":
    default:
      return "\nHelp them understand their dashboard and services. If they have pending onboarding, mention it once. Be practical and action-oriented.";
  }
}

/* ─── Audit surface builder ─── */
function buildAuditSurface(ctx?: AuditContext): string {
  if (!ctx) {
    return `\n=== CONTEXT ===\nYou are chatting with someone who has used the WeFixTrades audit tool. Help them understand their results and what they can do to improve.`;
  }

  const lines: string[] = ["\n=== AUDIT REPORT CONTEXT ==="];
  lines.push(`You are chatting with the owner of ${ctx.businessName || "a local business"}, a ${ctx.trade || "trades"} business in ${ctx.city || "their area"}.`);
  lines.push(`Their audit score: ${ctx.score ?? "N/A"}/100 (Grade: ${ctx.grade || "N/A"}).`);

  if (ctx.estimatedRevenueLoss) {
    const low = ctx.estimatedRevenueLoss.low ?? 0;
    const high = ctx.estimatedRevenueLoss.high ?? 0;
    if (high > 0) {
      lines.push(`Estimated monthly revenue at risk: $${low.toLocaleString()}–$${high.toLocaleString()}.`);
    }
  }

  if (ctx.topIssues?.length) {
    lines.push("\nTop issues found:");
    ctx.topIssues.slice(0, 5).forEach((issue, i) => {
      lines.push(`${i + 1}. ${issue.title}${issue.estimatedImpact ? ` (impact: ${issue.estimatedImpact})` : ""}${issue.priority ? ` [${issue.priority}]` : ""}`);
    });
  }

  if (ctx.actionPlan?.length) {
    lines.push("\nRecommended actions:");
    ctx.actionPlan.slice(0, 5).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.title}${item.description ? ` — ${item.description}` : ""}`);
    });
  }

  // Recommend services based on detected issues
  if (ctx.detectedIssueIds?.length) {
    const recommended = getRecommendedServices(ctx.detectedIssueIds);
    if (recommended.length) {
      lines.push(`\nServices that directly address their issues:\n${formatRecommendedServices(recommended)}`);
    }
  }

  lines.push("\nAnswer their questions about the audit in plain English. Be specific to THEIR data — never give generic advice. Help them understand what each issue means and what they can do about it.");

  return lines.join("\n");
}
