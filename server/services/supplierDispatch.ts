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
import { storage } from "../storage";
import type { FulfillmentTask, Supplier } from "@shared/schema";

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
  const priorityColor = params.priority === "urgent" ? "#EF4444"
    : params.priority === "high" ? "#F59E0B"
    : "#66E8FA";
  const dueLine = params.dueAt
    ? `<tr><td style="padding:6px 0;color:#8B919A;font-size:13px;">Due</td><td style="padding:6px 0;color:#F0F0F0;font-size:13px;text-align:right;">${params.dueAt.toDateString()}</td></tr>`
    : "";

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:540px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades</span>
        </div>
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:${priorityColor};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">New task assigned · ${params.priority}</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 20px;line-height:1.3;">${params.taskTitle}</h1>
          ${params.taskDescription ? `<p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 20px;">${params.taskDescription}</p>` : ""}
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr><td style="padding:6px 0;color:#8B919A;font-size:13px;">Client</td><td style="padding:6px 0;color:#F0F0F0;font-size:13px;text-align:right;">${params.clientName}</td></tr>
            <tr><td style="padding:6px 0;color:#8B919A;font-size:13px;">Service</td><td style="padding:6px 0;color:#F0F0F0;font-size:13px;text-align:right;">${params.serviceName}</td></tr>
            ${dueLine}
          </table>
          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0;"></div>
          <p style="font-size:13px;color:#8B919A;margin:0;line-height:1.5;">
            Reply to this email to update the task or ask questions. WeFixTrades will track the reply against this client's file.
          </p>
        </div>
        <p style="font-size:11px;color:#555B63;text-align:center;margin:24px 0 0;line-height:1.5;">
          Sent by WeFixTrades ops · <a href="mailto:${params.adminContact}" style="color:#66E8FA;">${params.adminContact}</a>
        </p>
      </div>
    </div>
  `;
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
    console.warn(`[supplier-dispatch] Supplier #${supplier.id} (${supplier.name}) has no contact_email — skipping`);
    return { dispatched: false, reason: "supplier_no_email", supplier_id: supplier.id };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn(`[supplier-dispatch] SMTP not configured — skipping dispatch for task #${task.id}`);
    return { dispatched: false, reason: "smtp_not_configured", supplier_id: supplier.id };
  }

  const adminContact = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: supplier.contact_email,
      replyTo: adminContact,
      subject: `[${task.priority.toUpperCase()}] ${task.title} — ${clientName}`,
      html: buildEmailHtml({
        supplierName: supplier.name,
        taskTitle: task.title,
        taskDescription: task.description,
        priority: task.priority,
        dueAt: task.due_at,
        clientName,
        serviceName,
        adminContact,
      }),
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

    console.log(`[supplier-dispatch] Sent task #${task.id} "${task.title}" to ${supplier.contact_email}`);
    return { dispatched: true, supplier_id: supplier.id, supplier_email: supplier.contact_email };
  } catch (err: any) {
    console.error(`[supplier-dispatch] Failed to send task #${task.id}:`, err.message);
    return { dispatched: false, reason: `send_failed: ${err.message}`, supplier_id: supplier.id };
  }
}
