/**
 * Support storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: ai_conversations, support_tickets, ticket_messages,
 * ticket_events, sms_messages, leads (read-only for SMS threads), clients
 * (join for ticket list), users (join for ticket message author).
 *
 * Three sub-domains live here because they form the customer-support surface
 * and are always queried together by the admin support UI:
 *   - AI conversations: assistant session transcripts
 *   - Support tickets / messages / events: human-handled support inbox
 *   - SMS threads: per-lead conversation timeline
 */

import { db } from "../db";
import {
  aiConversations, supportTickets, ticketMessages, ticketEvents,
  smsMessages, leads, clients, users,
  type AiConversation, type InsertAiConversation,
  type SupportTicket, type InsertSupportTicket,
  type TicketMessage, type InsertTicketMessage,
  type TicketEvent, type InsertTicketEvent,
  type SmsMessage,
  type Lead,
} from "@shared/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════
// AI conversations
// ═══════════════════════════════════════════════

export async function createAiConversation(data: InsertAiConversation): Promise<AiConversation> {
  const [conv] = await db.insert(aiConversations).values(data).returning();
  return conv;
}

export async function updateAiConversation(id: number, updates: Partial<InsertAiConversation>): Promise<void> {
  await db.update(aiConversations).set(updates).where(eq(aiConversations.id, id));
}

export async function getAiConversationBySession(sessionId: string): Promise<AiConversation | undefined> {
  const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.session_id, sessionId)).limit(1);
  return conv;
}

// ═══════════════════════════════════════════════
// Support tickets
// ═══════════════════════════════════════════════

export async function createSupportTicket(
  data: Partial<InsertSupportTicket> & { description: string; subject: string; client_id: number },
): Promise<SupportTicket> {
  const [ticket] = await db.insert(supportTickets).values({
    client_id: data.client_id,
    subject: data.subject,
    description: data.description,
    status: data.status || "open",
    priority: data.priority || "normal",
    category: data.category || "general",
    source: data.source || "manual",
    assigned_to: data.assigned_to ?? null,
    calculator_id: data.calculator_id ?? null,
    ai_summary: data.ai_summary ?? null,
    ai_priority_hint: data.ai_priority_hint ?? null,
    transcript_json: data.transcript_json ?? [],
    admin_notified: data.admin_notified ?? false,
  }).returning();
  return ticket;
}

export async function updateSupportTicket(id: number, updates: Record<string, any>): Promise<SupportTicket | undefined> {
  const [ticket] = await db.update(supportTickets).set({ ...updates, updated_at: new Date() }).where(eq(supportTickets.id, id)).returning();
  return ticket;
}

export async function getSupportTicketById(id: number): Promise<SupportTicket | undefined> {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return ticket;
}

export async function listSupportTickets(
  opts?: { clientId?: number; status?: string; priority?: string; category?: string; search?: string; limit?: number; offset?: number },
): Promise<(SupportTicket & { client_name?: string | null })[]> {
  const conditions: any[] = [];
  if (opts?.clientId) conditions.push(eq(supportTickets.client_id, opts.clientId));
  if (opts?.status) conditions.push(eq(supportTickets.status, opts.status));
  if (opts?.priority) conditions.push(eq(supportTickets.priority, opts.priority));
  if (opts?.category) conditions.push(eq(supportTickets.category, opts.category));
  if (opts?.search) {
    conditions.push(
      or(
        ilike(supportTickets.subject, `%${opts.search}%`),
        ilike(supportTickets.description, `%${opts.search}%`),
      )
    );
  }

  const rows = await db
    .select({
      id: supportTickets.id,
      calculator_id: supportTickets.calculator_id,
      client_id: supportTickets.client_id,
      subject: supportTickets.subject,
      description: supportTickets.description,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      source: supportTickets.source,
      assigned_to: supportTickets.assigned_to,
      ai_summary: supportTickets.ai_summary,
      ai_priority_hint: supportTickets.ai_priority_hint,
      transcript_json: supportTickets.transcript_json,
      admin_notified: supportTickets.admin_notified,
      created_at: supportTickets.created_at,
      updated_at: supportTickets.updated_at,
      resolved_at: supportTickets.resolved_at,
      closed_at: supportTickets.closed_at,
      client_name: clients.business_name,
      last_message_preview: sql<string | null>`(
        SELECT substring(${ticketMessages.content} from 1 for 120)
        FROM ${ticketMessages}
        WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
        ORDER BY ${ticketMessages.created_at} DESC
        LIMIT 1
      )`,
      last_message_at: sql<string | null>`(
        SELECT ${ticketMessages.created_at}::text
        FROM ${ticketMessages}
        WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
        ORDER BY ${ticketMessages.created_at} DESC
        LIMIT 1
      )`,
      last_message_author: sql<string | null>`(
        SELECT ${ticketMessages.author_type}
        FROM ${ticketMessages}
        WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
        ORDER BY ${ticketMessages.created_at} DESC
        LIMIT 1
      )`,
    })
    .from(supportTickets)
    .leftJoin(clients, eq(supportTickets.client_id, clients.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportTickets.created_at))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);

  return rows;
}

export async function getSupportTicketCounts(clientId?: number): Promise<Record<string, number>> {
  const condition = clientId ? eq(supportTickets.client_id, clientId) : undefined;
  const rows = await db
    .select({
      status: supportTickets.status,
      count: sql<number>`count(*)::int`,
    })
    .from(supportTickets)
    .where(condition)
    .groupBy(supportTickets.status);

  const counts: Record<string, number> = { total: 0, open: 0, in_progress: 0, waiting_on_customer: 0, resolved: 0, closed: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
    counts.total += row.count;
  }
  return counts;
}

// ═══════════════════════════════════════════════
// Ticket messages
// ═══════════════════════════════════════════════

export async function createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
  const [msg] = await db.insert(ticketMessages).values(data).returning();
  return msg;
}

export async function listTicketMessages(
  ticketId: number,
  visibility?: "customer" | "all",
): Promise<(TicketMessage & { author_name?: string | null })[]> {
  const conditions: any[] = [eq(ticketMessages.ticket_id, ticketId)];
  if (visibility === "customer") {
    conditions.push(eq(ticketMessages.visibility, "customer"));
  }

  const rows = await db
    .select({
      id: ticketMessages.id,
      ticket_id: ticketMessages.ticket_id,
      author_id: ticketMessages.author_id,
      author_type: ticketMessages.author_type,
      visibility: ticketMessages.visibility,
      content: ticketMessages.content,
      metadata: ticketMessages.metadata,
      created_at: ticketMessages.created_at,
      author_name: users.name,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(ticketMessages.author_id, users.id))
    .where(and(...conditions))
    .orderBy(ticketMessages.created_at);

  return rows;
}

// ═══════════════════════════════════════════════
// Ticket events
// ═══════════════════════════════════════════════

export async function createTicketEvent(data: InsertTicketEvent): Promise<TicketEvent> {
  const [event] = await db.insert(ticketEvents).values(data).returning();
  return event;
}

// ═══════════════════════════════════════════════
// SMS threads (read-only aggregation across sms_messages + leads)
// ═══════════════════════════════════════════════

export async function getSmsThreads(calculatorId: number): Promise<{ lead: Lead; messages: SmsMessage[] }[]> {
  const threadLeads = await db
    .selectDistinct({ leadId: smsMessages.lead_id })
    .from(smsMessages)
    .where(eq(smsMessages.calculator_id, calculatorId));

  const leadIds = threadLeads.map(t => t.leadId).filter((id): id is number => !!id);
  if (leadIds.length === 0) return [];

  const leadRows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.calculator_id, calculatorId), sql`${leads.id} = ANY(${leadIds})`));

  const leadById = new Map<number, Lead>();
  for (const lead of leadRows) {
    leadById.set(lead.id, lead);
  }

  const messages = await db
    .select()
    .from(smsMessages)
    .where(and(eq(smsMessages.calculator_id, calculatorId), sql`${smsMessages.lead_id} = ANY(${leadIds})`))
    .orderBy(smsMessages.created_at);

  const messagesByLead = new Map<number, SmsMessage[]>();
  for (const msg of messages) {
    if (!msg.lead_id) continue;
    const arr = messagesByLead.get(msg.lead_id) || [];
    arr.push(msg);
    messagesByLead.set(msg.lead_id, arr);
  }

  const threads: { lead: Lead; messages: SmsMessage[] }[] = [];
  for (const leadId of leadIds) {
    const lead = leadById.get(leadId);
    if (!lead) continue;
    const msgs = messagesByLead.get(leadId) || [];
    threads.push({ lead, messages: msgs });
  }

  return threads;
}
