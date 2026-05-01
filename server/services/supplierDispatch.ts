/**
 * Supplier dispatch — sends a templated email brief to a supplier
 * (white-label agency, freelancer, etc.) when a fulfillment task
 * assigned to them becomes actionable.
 *
 * Hooked into PATCH /api/admin/crm/fulfillment/:id so dispatch fires
 * automatically when admin moves a task into `in_progress` with
 * `handled_by: "supplier"` and a `supplier_id` set.
 *
 * Idempotent: dispatch is recorded in task.metadata.supplier_dispatch
 * so repeated PATCHes don't re-send emails.
 */

import { db } from "../db";
import { suppliers, clients, clientServices, serviceCatalog, fulfillmentTasks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME, type AlertTone } from "../lib/adminAlertShell";
import { storage } from "../storage";
import type { FulfillmentTask, Supplier } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("SupplierDispatch");

export interface DispatchResult {
  dispatched: boolean;
  reason?: string;
  supplier_id?: number;
  supplier_email?: string;
}

/**
 * Should this task trigger a supplier dispatch right now?
 * - handled_by must be "supplier"
 * - supplier_id must be set
 * - status must be a dispatchable state
 * - must not have been dispatched before for this state
 */
function shouldDispatch(task: FulfillmentTask): boolean {
  if (task.handled_by !== "supplier") return false;
  if (!task.supplier_id) return false;
  // Only dispatch when actively picked up or in progress
  if (task.status !== "in_progress" && task.status !== "submitted") return false;
  const meta = (task.metadata as any) || {};
  const prev = meta.supplier_dispatch?.last_status;
  if (prev === task.status) return false; // already dispatched for this state
  return true;
}

async function loadContext(task: FulfillmentTask): Promise<{
  supplier: Supplier | null;
  clientName: string;
  serviceName: string;
}> {
  const supplierRow = task.supplier_id
    ? (await db.select().from(suppliers).where(eq(suppliers.id, task.supplier_id)).limit(1))[0]
    : null;

  const clientRow = (await db.select({ business_name: clients.business_name })
    .from(clients).where(eq(clients.id, task.client_id)).limit(1))[0];

  const serviceRow = (await db.select({ name: serviceCatalog.name })
    .from(clientServices)
    .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(eq(clientServices.id, task.client_service_id))
    .limit(1))[0];

  return {
    supplier: supplierRow || null,
    clientName: clientRow?.business_name || `Client #${task.client_id}`,
    serviceName: serviceRow?.name || "Service",
  };
}

function priorityTone(priority: string): AlertTone {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "warning";
  if (priority === "low") return "info";
  return "info";
}

function buildEmailHtml(params: {
  supplierName: string;
  taskTitle: string;
  taskDescription: string | null;
  priority: string;
  dueAt: Date | null;
  clientName: string;
  serviceName: string;
  adminContact: string;
}): string {
  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Client", value: params.clientName },
    { label: "Service", value: params.serviceName },
    { label: "Priority", value: params.priority.toUpperCase() },
  ];
  if (params.dueAt) detailRows.push({ label: "Due", value: params.dueAt.toDateString() });

  return buildAdminAlertEmail({
    subjectForTitle: `[${params.priority.toUpperCase()}] ${params.taskTitle}`,
    alertType: `New task · ${params.priority}`,
    alertTone: priorityTone(params.priority),
    headline: params.taskTitle,
    summary: params.taskDescription || undefined,
    detailRows,
    bodyHtml: `
      <div style="font-size:13px;color:#6B7280;line-height:1.55;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;">
        Reply to this email to update the task or ask questions. WeFixTrades will track the reply against this client's file.
      </div>`,
    footerNote: `Sent by WeFixTrades ops · ${params.adminContact}`,
  });
}

function buildEmailPlainText(params: {
  supplierName: string;
  taskTitle: string;
  taskDescription: string | null;
  priority: string;
  dueAt: Date | null;
  clientName: string;
  serviceName: string;
  adminContact: string;
}): string {
  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Client", value: params.clientName },
    { label: "Service", value: params.serviceName },
    { label: "Priority", value: params.priority.toUpperCase() },
  ];
  if (params.dueAt) detailRows.push({ label: "Due", value: params.dueAt.toDateString() });

  return buildAdminAlertPlainText({
    alertType: `New task · ${params.priority}`,
    headline: params.taskTitle,
    summary: params.taskDescription || undefined,
    detailRows,
    bodyText: "Reply to this email to update the task or ask questions. WeFixTrades will track the reply against this client's file.",
    footerNote: `Sent by WeFixTrades ops · ${params.adminContact}`,
  });
}

/**
 * Dispatch a task to its assigned supplier. Safe to call multiple times —
 * short-circuits if the task isn't in a dispatchable state or already dispatched.
 *
 * Returns a DispatchResult describing what happened. Never throws on SMTP
 * failure — logs and returns { dispatched: false } so the API response isn't
 * blocked on vendor email issues.
 */
export async function dispatchTaskToSupplier(taskId: number): Promise<DispatchResult> {
  // Reload the task from DB to ensure we have the latest state
  const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);

  if (!task) return { dispatched: false, reason: "task_not_found" };
  if (!shouldDispatch(task)) return { dispatched: false, reason: "not_dispatchable_state" };

  const { supplier, clientName, serviceName } = await loadContext(task);
  if (!supplier) return { dispatched: false, reason: "supplier_not_found" };
  if (!supplier.contact_email) {
    log.warn(`[supplier-dispatch] Supplier #${supplier.id} (${supplier.name}) has no contact_email — skipping`);
    return { dispatched: false, reason: "supplier_no_email", supplier_id: supplier.id };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn(`[supplier-dispatch] SMTP not configured — skipping dispatch for task #${task.id}`);
    return { dispatched: false, reason: "smtp_not_configured", supplier_id: supplier.id };
  }

  const adminContact = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

  try {
    const emailParams = {
      supplierName: supplier.name,
      taskTitle: task.title,
      taskDescription: task.description,
      priority: task.priority,
      dueAt: task.due_at,
      clientName,
      serviceName,
      adminContact,
    };
    await transporter.sendMail({
      from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
      to: supplier.contact_email,
      replyTo: adminContact,
      subject: `[${task.priority.toUpperCase()}] ${task.title} — ${clientName}`,
      html: buildEmailHtml(emailParams),
      text: buildEmailPlainText(emailParams),
    });

    // Record dispatch in task metadata (idempotency key)
    const prevMeta = (task.metadata as any) || {};
    const newMeta = {
      ...prevMeta,
      supplier_dispatch: {
        last_status: task.status,
        dispatched_at: new Date().toISOString(),
        supplier_id: supplier.id,
        supplier_email: supplier.contact_email,
        history: [
          ...(prevMeta.supplier_dispatch?.history || []),
          { status: task.status, at: new Date().toISOString() },
        ].slice(-10), // keep last 10 dispatches
      },
    };
    await storage.updateFulfillmentTask(task.id, { metadata: newMeta });

    log.info(`[supplier-dispatch] Sent task #${task.id} "${task.title}" to ${supplier.contact_email}`);
    return { dispatched: true, supplier_id: supplier.id, supplier_email: supplier.contact_email };
  } catch (err: any) {
    log.error(`[supplier-dispatch] Failed to send task #${task.id}:`, err.message);
    return { dispatched: false, reason: `send_failed: ${err.message}`, supplier_id: supplier.id };
  }
}
