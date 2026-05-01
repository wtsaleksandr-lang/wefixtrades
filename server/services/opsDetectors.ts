/**
 * Ops Detectors — deterministic signal detection layer.
 *
 * ARCHITECTURE CONTRACT:
 * - These functions query the DB using Drizzle ORM only.
 * - They contain ZERO AI logic, ZERO calls to aiService.
 * - Severity is assigned by hard rules below, never by AI.
 * - All output is typed OpsSignal[].
 * - These signals are the "system truth" layer consumed by opsEngine.ts.
 *
 * The signals produced here are also stored raw in opsSnapshots.raw_signals
 * so they can be reused by a future Rules & Routing Engine without touching AI.
 */

import { db } from "../db";
import {
  onboardingSubmissions,
  fulfillmentTasks,
  clientPayments,
  supportTickets,
  ticketMessages,
  clients,
} from "@shared/schema";
import { eq, and, or, lt, isNull, ne, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("OpsDetectors");

export const DETECTOR_VERSION = "detectors-v1";

/* ─── Signal cap: max signals per detector type to prevent prompt blowout ─── */
const MAX_SIGNALS_PER_DETECTOR = 20;

/* ─── OpsSignal type ─── */
export type OpsSignalSeverity = "low" | "medium" | "high" | "critical";

export interface OpsSignal {
  type: string;
  entity_type: string;
  entity_id: number;
  severity: OpsSignalSeverity;
  reason: string;
  detected_at: string; // ISO timestamp
  metadata?: Record<string, any>;
}

/* ─── Helpers ─── */
function now(): string {
  return new Date().toISOString();
}

function daysSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/* ═══════════════════════════════════════════════════════════════
   DETECTOR 1 — Onboarding Stalls
   Finds submissions stuck in sent/viewed/needs_followup states.

   Severity rules:
   - needs_followup                       → high (always needs action)
   - sent or viewed, idle 5+ days         → high
   - sent or viewed, idle 2–4 days        → medium
   - sent or viewed, idle < 2 days        → low (not yet stalled)
   ═══════════════════════════════════════════════════════════════ */
export async function detectOnboardingStalls(): Promise<OpsSignal[]> {
  const signals: OpsSignal[] = [];

  try {
    const rows = await db
      .select({
        id: onboardingSubmissions.id,
        client_id: onboardingSubmissions.client_id,
        status: onboardingSubmissions.status,
        sent_at: onboardingSubmissions.sent_at,
        updated_at: onboardingSubmissions.updated_at,
        business_name: clients.business_name,
      })
      .from(onboardingSubmissions)
      .leftJoin(clients, eq(onboardingSubmissions.client_id, clients.id))
      .where(
        inArray(onboardingSubmissions.status, ["sent", "viewed", "needs_followup"])
      )
      .limit(MAX_SIGNALS_PER_DETECTOR * 2); // over-fetch, then sort by severity

    const rawSignals: OpsSignal[] = [];

    for (const row of rows) {
      const referenceDate = row.sent_at ?? row.updated_at;
      const idleDays = daysSince(referenceDate);
      const clientName = row.business_name ?? `Client #${row.client_id}`;

      let severity: OpsSignalSeverity;
      let reason: string;

      if (row.status === "needs_followup") {
        severity = "high";
        reason = `Onboarding marked needs_followup for ${clientName}`;
      } else if (idleDays >= 5) {
        severity = "high";
        reason = `Onboarding ${row.status} for ${idleDays} days without progress — ${clientName}`;
      } else if (idleDays >= 2) {
        severity = "medium";
        reason = `Onboarding ${row.status} for ${idleDays} days — ${clientName}`;
      } else {
        severity = "low";
        reason = `Onboarding ${row.status} for ${idleDays} day(s) — ${clientName}`;
      }

      rawSignals.push({
        type: "onboarding_stall",
        entity_type: "onboarding_submission",
        entity_id: row.id,
        severity,
        reason,
        detected_at: now(),
        metadata: {
          client_id: row.client_id,
          client_name: clientName,
          onboarding_status: row.status,
          idle_days: idleDays,
        },
      });
    }

    // Sort by severity desc, cap to MAX
    const severityOrder: Record<OpsSignalSeverity, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    };
    rawSignals.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    signals.push(...rawSignals.slice(0, MAX_SIGNALS_PER_DETECTOR));
  } catch (err) {
    log.error("[opsDetectors] detectOnboardingStalls error:", { error: String(err) });
  }

  return signals;
}

/* ═══════════════════════════════════════════════════════════════
   DETECTOR 2 — Blocked / Overdue Fulfillment Tasks
   Finds tasks that are stuck, escalated, or past their due date.

   Severity rules:
   - escalation_flag = true                → critical
   - status = blocked                      → high
   - status = waiting AND past due_at      → high
   - status = waiting AND idle 5+ days     → medium
   - past due_at AND not delivered         → medium (baseline overdue)
   ═══════════════════════════════════════════════════════════════ */
export async function detectBlockedTasks(): Promise<OpsSignal[]> {
  const signals: OpsSignal[] = [];

  try {
    const now_ = new Date();

    const rows = await db
      .select({
        id: fulfillmentTasks.id,
        client_id: fulfillmentTasks.client_id,
        title: fulfillmentTasks.title,
        status: fulfillmentTasks.status,
        escalation_flag: fulfillmentTasks.escalation_flag,
        waiting_on: fulfillmentTasks.waiting_on,
        due_at: fulfillmentTasks.due_at,
        last_action_at: fulfillmentTasks.last_action_at,
        updated_at: fulfillmentTasks.updated_at,
        business_name: clients.business_name,
      })
      .from(fulfillmentTasks)
      .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
      .where(
        and(
          ne(fulfillmentTasks.status, "delivered"),
          ne(fulfillmentTasks.status, "cancelled"),
          or(
            eq(fulfillmentTasks.escalation_flag, true),
            eq(fulfillmentTasks.status, "blocked"),
            eq(fulfillmentTasks.status, "waiting"),
            lt(fulfillmentTasks.due_at, now_),
          )
        )
      )
      .limit(MAX_SIGNALS_PER_DETECTOR * 2);

    const rawSignals: OpsSignal[] = [];

    for (const row of rows) {
      const clientName = row.business_name ?? `Client #${row.client_id}`;
      const idleDays = daysSince(row.last_action_at ?? row.updated_at);
      const isOverdue = row.due_at ? row.due_at < now_ : false;

      let severity: OpsSignalSeverity;
      let reason: string;
      let type: string;

      if (row.escalation_flag) {
        severity = "critical";
        type = "task_escalated";
        reason = `Task escalated: "${row.title}" — ${clientName}`;
      } else if (row.status === "blocked") {
        severity = "high";
        type = "task_blocked";
        reason = `Task blocked: "${row.title}" — ${clientName}`;
      } else if (isOverdue) {
        severity = idleDays >= 5 ? "high" : "medium";
        type = "task_overdue";
        reason = `Task overdue (${idleDays}d idle): "${row.title}" — ${clientName}`;
      } else {
        // waiting, not overdue
        severity = idleDays >= 5 ? "medium" : "low";
        type = "task_waiting";
        reason = `Task waiting ${idleDays} day(s): "${row.title}" — ${clientName}`;
      }

      rawSignals.push({
        type,
        entity_type: "fulfillment_task",
        entity_id: row.id,
        severity,
        reason,
        detected_at: now(),
        metadata: {
          client_id: row.client_id,
          client_name: clientName,
          task_status: row.status,
          waiting_on: row.waiting_on,
          escalation_flag: row.escalation_flag,
          idle_days: idleDays,
          is_overdue: isOverdue,
        },
      });
    }

    const severityOrder: Record<OpsSignalSeverity, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    };
    rawSignals.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    signals.push(...rawSignals.slice(0, MAX_SIGNALS_PER_DETECTOR));
  } catch (err) {
    log.error("[opsDetectors] detectBlockedTasks error:", { error: String(err) });
  }

  return signals;
}

/* ═══════════════════════════════════════════════════════════════
   DETECTOR 3 — Overdue / Failed Payments
   Finds payments that are failed or overdue without resolution.

   Severity rules:
   - status = failed                       → critical
   - status = pending AND past due_at      → high (overdue >7d)
   - status = pending AND past due_at      → medium (overdue 1–7d)
   ═══════════════════════════════════════════════════════════════ */
export async function detectOverduePayments(): Promise<OpsSignal[]> {
  const signals: OpsSignal[] = [];

  try {
    const now_ = new Date();

    const rows = await db
      .select({
        id: clientPayments.id,
        client_id: clientPayments.client_id,
        amount_cents: clientPayments.amount_cents,
        status: clientPayments.status,
        type: clientPayments.type,
        due_at: clientPayments.due_at,
        business_name: clients.business_name,
      })
      .from(clientPayments)
      .leftJoin(clients, eq(clientPayments.client_id, clients.id))
      .where(
        or(
          eq(clientPayments.status, "failed"),
          and(
            eq(clientPayments.status, "pending"),
            lt(clientPayments.due_at, now_),
          )
        )
      )
      .limit(MAX_SIGNALS_PER_DETECTOR * 2);

    const rawSignals: OpsSignal[] = [];

    for (const row of rows) {
      const clientName = row.business_name ?? `Client #${row.client_id}`;
      const overdueDays = daysSince(row.due_at);
      const amountDollars = row.amount_cents ? (row.amount_cents / 100).toFixed(0) : "?";

      let severity: OpsSignalSeverity;
      let type: string;
      let reason: string;

      if (row.status === "failed") {
        severity = "critical";
        type = "payment_failed";
        reason = `Payment failed: $${amountDollars} — ${clientName}`;
      } else if (overdueDays > 7) {
        severity = "high";
        type = "payment_overdue";
        reason = `Payment overdue ${overdueDays} days: $${amountDollars} — ${clientName}`;
      } else {
        severity = "medium";
        type = "payment_overdue";
        reason = `Payment overdue ${overdueDays} day(s): $${amountDollars} — ${clientName}`;
      }

      rawSignals.push({
        type,
        entity_type: "client_payment",
        entity_id: row.id,
        severity,
        reason,
        detected_at: now(),
        metadata: {
          client_id: row.client_id,
          client_name: clientName,
          amount_cents: row.amount_cents,
          payment_status: row.status,
          payment_type: row.type,
          overdue_days: overdueDays,
        },
      });
    }

    const severityOrder: Record<OpsSignalSeverity, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    };
    rawSignals.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    signals.push(...rawSignals.slice(0, MAX_SIGNALS_PER_DETECTOR));
  } catch (err) {
    log.error("[opsDetectors] detectOverduePayments error:", { error: String(err) });
  }

  return signals;
}

/* ═══════════════════════════════════════════════════════════════
   DETECTOR 4 — Unanswered Support Tickets
   Finds tickets that haven't had an admin reply within threshold.
   Uses last admin message timestamp to determine response age.

   Severity rules:
   - priority=urgent AND last admin reply >24h (or never)  → critical
   - priority=high   AND last admin reply >48h (or never)  → high
   - priority=normal AND last admin reply >72h (or never)  → medium
   - priority=low    AND last admin reply >96h (or never)  → low
   ═══════════════════════════════════════════════════════════════ */
export async function detectUnansweredTickets(): Promise<OpsSignal[]> {
  const signals: OpsSignal[] = [];

  try {
    // Fetch all open/in_progress tickets (not resolved/closed)
    const openTickets = await db
      .select({
        id: supportTickets.id,
        client_id: supportTickets.client_id,
        subject: supportTickets.subject,
        priority: supportTickets.priority,
        status: supportTickets.status,
        created_at: supportTickets.created_at,
        updated_at: supportTickets.updated_at,
        business_name: clients.business_name,
      })
      .from(supportTickets)
      .leftJoin(clients, eq(supportTickets.client_id, clients.id))
      .where(
        inArray(supportTickets.status, ["open", "in_progress"])
      )
      .limit(MAX_SIGNALS_PER_DETECTOR * 2);

    if (!openTickets.length) return signals;

    // For each ticket, get the last admin message timestamp
    const ticketIds = openTickets.map((t) => t.id);
    const lastAdminMessages = await db
      .select({
        ticket_id: ticketMessages.ticket_id,
        last_admin_at: sql<Date>`MAX(${ticketMessages.created_at})`.as("last_admin_at"),
      })
      .from(ticketMessages)
      .where(
        and(
          inArray(ticketMessages.ticket_id, ticketIds),
          eq(ticketMessages.author_type, "admin"),
        )
      )
      .groupBy(ticketMessages.ticket_id);

    const lastAdminMap = new Map(lastAdminMessages.map((r) => [r.ticket_id, r.last_admin_at]));

    const rawSignals: OpsSignal[] = [];

    for (const ticket of openTickets) {
      const lastAdminAt = lastAdminMap.get(ticket.id) ?? null;
      // If no admin reply ever, use ticket creation as the reference
      const referenceDate = lastAdminAt ?? ticket.created_at;
      const hoursElapsed = referenceDate
        ? (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60)
        : 999;
      const clientName = ticket.business_name ?? `Client #${ticket.client_id}`;

      // Threshold map per priority
      const thresholdHours: Record<string, number> = {
        urgent: 24,
        high: 48,
        normal: 72,
        low: 96,
      };
      const threshold = thresholdHours[ticket.priority ?? "normal"] ?? 72;
      if (hoursElapsed < threshold) continue; // Not yet unanswered by our rules

      let severity: OpsSignalSeverity;
      if (ticket.priority === "urgent") severity = "critical";
      else if (ticket.priority === "high") severity = "high";
      else if (ticket.priority === "normal") severity = "medium";
      else severity = "low";

      const daysStr = (hoursElapsed / 24).toFixed(1);
      const hasAdminReply = !!lastAdminAt;

      rawSignals.push({
        type: "ticket_unanswered",
        entity_type: "support_ticket",
        entity_id: ticket.id,
        severity,
        reason: hasAdminReply
          ? `Ticket "${ticket.subject}" — last admin reply ${daysStr}d ago — ${clientName}`
          : `Ticket "${ticket.subject}" — no admin reply yet (${daysStr}d old) — ${clientName}`,
        detected_at: now(),
        metadata: {
          client_id: ticket.client_id,
          client_name: clientName,
          ticket_priority: ticket.priority,
          ticket_status: ticket.status,
          hours_without_admin_reply: Math.round(hoursElapsed),
          has_admin_reply: hasAdminReply,
        },
      });
    }

    const severityOrder: Record<OpsSignalSeverity, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    };
    rawSignals.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    signals.push(...rawSignals.slice(0, MAX_SIGNALS_PER_DETECTOR));
  } catch (err) {
    log.error("[opsDetectors] detectUnansweredTickets error:", { error: String(err) });
  }

  return signals;
}

/* ─── Run all detectors and return combined signals ─── */
export async function runAllDetectors(): Promise<OpsSignal[]> {
  const [onboarding, tasks, payments, tickets] = await Promise.all([
    detectOnboardingStalls(),
    detectBlockedTasks(),
    detectOverduePayments(),
    detectUnansweredTickets(),
  ]);

  return [...onboarding, ...tasks, ...payments, ...tickets];
}
