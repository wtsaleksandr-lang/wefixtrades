/**
 * Supplier dispatch — routes task briefs to suppliers based on their
 * `supplier_type`:
 *
 *   "email"  — sends an email brief to the supplier (original behavior)
 *   "fiverr" — sends an internal admin notification with Fiverr profile link
 *   "api"    — POST task payload to supplier's API endpoint (webhook)
 *   "manual" — logs the assignment, no dispatch (admin handles manually)
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
  dispatch_method?: string;
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

/* ─── Email supplier dispatch (enhanced) ─── */

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

  const descriptionBlock = params.taskDescription
    ? `<div style="font-size:13px;color:#374151;line-height:1.55;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;margin:0 0 14px;">
        <strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#6B7280;">Task Details</strong><br/>
        ${params.taskDescription}
      </div>`
    : "";

  return buildAdminAlertEmail({
    subjectForTitle: `[${params.priority.toUpperCase()}] ${params.taskTitle}`,
    alertType: `New task · ${params.priority}`,
    alertTone: priorityTone(params.priority),
    headline: params.taskTitle,
    detailRows,
    bodyHtml: `
      ${descriptionBlock}
      <div style="font-size:13px;color:#6B7280;line-height:1.55;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;">
        <strong>How to submit work:</strong> Reply to this email with your completed deliverables or status update. WeFixTrades will track the reply against this client's file.
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
    bodyText: "How to submit work: Reply to this email with your completed deliverables or status update. WeFixTrades will track the reply against this client's file.",
    footerNote: `Sent by WeFixTrades ops · ${params.adminContact}`,
  });
}

async function dispatchViaEmail(
  task: FulfillmentTask,
  supplier: Supplier,
  clientName: string,
  serviceName: string,
  adminContact: string,
): Promise<DispatchResult> {
  if (!supplier.contact_email) {
    log.warn(`Supplier #${supplier.id} (${supplier.name}) has no contact_email — skipping email dispatch`);
    return { dispatched: false, dispatch_method: "email", reason: "supplier_no_email", supplier_id: supplier.id };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn(`SMTP not configured — skipping email dispatch for task #${task.id}`);
    return { dispatched: false, dispatch_method: "email", reason: "smtp_not_configured", supplier_id: supplier.id };
  }

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

  log.info(`Sent email dispatch for task #${task.id} "${task.title}" to ${supplier.contact_email}`);
  return { dispatched: true, dispatch_method: "email", supplier_id: supplier.id, supplier_email: supplier.contact_email };
}

/* ─── Fiverr supplier dispatch (admin notification) ─── */

async function dispatchViaFiverr(
  task: FulfillmentTask,
  supplier: Supplier,
  clientName: string,
  serviceName: string,
  adminContact: string,
): Promise<DispatchResult> {
  const fiverrUrl = supplier.fiverr_profile_url || supplier.platform_url;
  if (!fiverrUrl) {
    log.warn(`Supplier #${supplier.id} (${supplier.name}) has no fiverr_profile_url — skipping Fiverr dispatch`);
    return { dispatched: false, dispatch_method: "fiverr_notification", reason: "no_fiverr_url", supplier_id: supplier.id };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn(`SMTP not configured — skipping Fiverr notification for task #${task.id}`);
    return { dispatched: false, dispatch_method: "fiverr_notification", reason: "smtp_not_configured", supplier_id: supplier.id };
  }

  const adminEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

  const suggestedMessage = [
    `Hi ${supplier.name},`,
    "",
    `I have a new task for you:`,
    "",
    `Title: ${task.title}`,
    task.description ? `Description: ${task.description}` : "",
    `Priority: ${task.priority.toUpperCase()}`,
    task.due_at ? `Due: ${task.due_at.toDateString()}` : "",
    `Client: ${clientName}`,
    "",
    "Please let me know your availability and estimated delivery time.",
  ].filter(Boolean).join("\n");

  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Supplier", value: supplier.name },
    { label: "Service", value: serviceName },
    { label: "Client", value: clientName },
    { label: "Priority", value: task.priority.toUpperCase() },
  ];
  if (task.due_at) detailRows.push({ label: "Due", value: task.due_at.toDateString() });

  const html = buildAdminAlertEmail({
    subjectForTitle: `Fiverr Order Needed: ${task.title}`,
    alertType: "Fiverr order required",
    alertTone: priorityTone(task.priority),
    headline: task.title,
    summary: task.description || undefined,
    detailRows,
    bodyHtml: `
      <div style="font-size:13px;color:#374151;line-height:1.55;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;margin:0 0 14px;">
        <strong style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#6B7280;">Suggested message to supplier</strong><br/>
        <pre style="white-space:pre-wrap;font-family:inherit;margin:6px 0 0;">${suggestedMessage}</pre>
      </div>`,
    cta: { label: "Place Order on Fiverr", url: fiverrUrl },
    footerNote: `Admin action required — place order manually on Fiverr`,
  });

  const text = buildAdminAlertPlainText({
    alertType: "Fiverr order required",
    headline: task.title,
    summary: task.description || undefined,
    detailRows,
    bodyText: `Suggested message:\n\n${suggestedMessage}\n\nFiverr Profile: ${fiverrUrl}`,
    footerNote: "Admin action required — place order manually on Fiverr",
  });

  await transporter.sendMail({
    from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
    to: adminEmail,
    subject: `[ACTION] Fiverr Order: ${task.title} — ${clientName}`,
    html,
    text,
  });

  log.info(`Sent Fiverr notification for task #${task.id} "${task.title}" to admin ${adminEmail}`);
  return { dispatched: true, dispatch_method: "fiverr_notification", supplier_id: supplier.id };
}

/* ─── API supplier dispatch (webhook) ─── */

async function dispatchViaApi(
  task: FulfillmentTask,
  supplier: Supplier,
  clientName: string,
  serviceName: string,
  adminContact: string,
): Promise<DispatchResult> {
  if (!supplier.api_endpoint) {
    log.warn(`Supplier #${supplier.id} (${supplier.name}) has no api_endpoint — falling back to email`);
    return dispatchViaEmail(task, supplier, clientName, serviceName, adminContact);
  }

  const appUrl = process.env.APP_URL
    || process.env.APP_PUBLIC_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

  const payload = {
    task_id: task.id,
    task_title: task.title,
    task_description: task.description,
    priority: task.priority,
    due_at: task.due_at?.toISOString() || null,
    client_business_name: clientName,
    callback_url: `${appUrl}/api/supplier/webhook/${task.id}`,
  };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (supplier.api_key) {
      headers["Authorization"] = `Bearer ${supplier.api_key}`;
    }

    const response = await fetch(supplier.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`API returned ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    log.info(`API dispatch succeeded for task #${task.id} to ${supplier.api_endpoint}`);
    return { dispatched: true, dispatch_method: "api", supplier_id: supplier.id };
  } catch (err: any) {
    log.error(`API dispatch failed for task #${task.id} to ${supplier.api_endpoint}: ${err.message}`);

    // Log the failure
    await storage.logAdminActivity({
      actor_type: "system",
      actor_name: "SupplierDispatch",
      action: "supplier.api_dispatch_failed",
      entity_type: "fulfillment_task",
      entity_id: task.id,
      summary: `API dispatch to "${supplier.name}" failed, falling back to email`,
      metadata: {
        supplier_id: supplier.id,
        api_endpoint: supplier.api_endpoint,
        error: err.message,
      },
    });

    // Fall back to email dispatch
    log.info(`Falling back to email dispatch for task #${task.id}`);
    return dispatchViaEmail(task, supplier, clientName, serviceName, adminContact);
  }
}

/* ─── Manual supplier — no dispatch ─── */

async function dispatchManual(
  task: FulfillmentTask,
  supplier: Supplier,
): Promise<DispatchResult> {
  log.info(`Manual supplier dispatch recorded for task #${task.id} — no automated dispatch`);
  return { dispatched: true, dispatch_method: "manual", supplier_id: supplier.id };
}

/* ─── Record dispatch metadata ─── */

async function recordDispatch(task: FulfillmentTask, dispatchMethod: string, supplierId: number, supplierEmail?: string): Promise<void> {
  const prevMeta = (task.metadata as any) || {};
  const newMeta = {
    ...prevMeta,
    supplier_dispatch: {
      last_status: task.status,
      dispatch_method: dispatchMethod,
      dispatched_at: new Date().toISOString(),
      supplier_id: supplierId,
      supplier_email: supplierEmail,
      history: [
        ...(prevMeta.supplier_dispatch?.history || []),
        { status: task.status, method: dispatchMethod, at: new Date().toISOString() },
      ].slice(-10), // keep last 10 dispatches
    },
  };
  await storage.updateFulfillmentTask(task.id, { metadata: newMeta });
}

/**
 * Dispatch a task to its assigned supplier. Safe to call multiple times —
 * short-circuits if the task isn't in a dispatchable state or already dispatched.
 *
 * Routes to the appropriate dispatch method based on supplier.supplier_type:
 *   "email"  — email brief to supplier
 *   "fiverr" — internal admin notification with Fiverr link
 *   "api"    — POST to supplier's webhook endpoint
 *   "manual" — log only, no automated dispatch
 *
 * Returns a DispatchResult describing what happened. Never throws on
 * failure — logs and returns { dispatched: false } so the API response isn't
 * blocked on vendor issues.
 */
export async function dispatchTaskToSupplier(taskId: number): Promise<DispatchResult> {
  // Reload the task from DB to ensure we have the latest state
  const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);

  if (!task) return { dispatched: false, reason: "task_not_found" };
  if (!shouldDispatch(task)) return { dispatched: false, reason: "not_dispatchable_state" };

  const { supplier, clientName, serviceName } = await loadContext(task);
  if (!supplier) return { dispatched: false, reason: "supplier_not_found" };

  const adminContact = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

  try {
    const supplierType = (supplier as any).supplier_type || "email";
    let result: DispatchResult;

    switch (supplierType) {
      case "fiverr":
        result = await dispatchViaFiverr(task, supplier, clientName, serviceName, adminContact);
        break;

      case "api":
        result = await dispatchViaApi(task, supplier, clientName, serviceName, adminContact);
        break;

      case "manual":
        result = await dispatchManual(task, supplier);
        break;

      case "email":
      default:
        result = await dispatchViaEmail(task, supplier, clientName, serviceName, adminContact);
        break;
    }

    // Record dispatch in task metadata if successful
    if (result.dispatched) {
      await recordDispatch(task, result.dispatch_method || supplierType, supplier.id, result.supplier_email);
    }

    return result;
  } catch (err: any) {
    log.error(`Dispatch failed for task #${task.id}: ${err.message}`);
    return { dispatched: false, reason: `dispatch_failed: ${err.message}`, supplier_id: supplier.id };
  }
}
