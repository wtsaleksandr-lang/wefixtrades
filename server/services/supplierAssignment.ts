/**
 * Supplier auto-assignment service.
 *
 * When a fulfillment task has `handled_by = "supplier"` but no `supplier_id`,
 * this service matches the task's service to an active supplier whose
 * `supported_services` array contains a matching prefix, assigns them,
 * and fires the supplier dispatch email.
 *
 * Designed to be called fail-safe from task creation code paths.
 */

import { db } from "../db";
import { suppliers, clientServices } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { dispatchTaskToSupplier } from "./supplierDispatch";
import { createLogger } from "../lib/logger";
import type { FulfillmentTask } from "@shared/schema";

const log = createLogger("SupplierAssignment");

/**
 * Attempt to auto-assign a supplier to a fulfillment task.
 *
 * Returns true if a supplier was assigned, false otherwise.
 * Never throws — catches all errors internally so callers are not blocked.
 */
export async function autoAssignSupplier(task: FulfillmentTask): Promise<boolean> {
  try {
    // 1. Only supplier tasks
    if (task.handled_by !== "supplier") {
      return false;
    }

    // 2. Already assigned
    if (task.supplier_id) {
      return false;
    }

    // 3. Look up the client_service to get the service_id
    const cs = await db
      .select({ service_id: clientServices.service_id })
      .from(clientServices)
      .where(eq(clientServices.id, task.client_service_id))
      .limit(1);

    if (cs.length === 0) {
      log.warn(`No client_service found for task #${task.id} (cs_id=${task.client_service_id})`);
      return false;
    }

    const serviceId = cs[0].service_id;

    // 4. Query active suppliers and find one whose supported_services
    //    contains a prefix that matches the service_id.
    //    e.g. supplier with ["sitelaunch"] matches service_id "sitelaunch" or "sitelaunch-template"
    const activeSuppliers = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.is_active, true));

    const matchingSupplier = activeSuppliers.find((s) => {
      const services = (s.supported_services as string[]) || [];
      return services.some(
        (prefix) => serviceId === prefix || serviceId.startsWith(prefix + "-"),
      );
    });

    if (!matchingSupplier) {
      log.debug(`No matching supplier for service "${serviceId}" (task #${task.id})`);
      return false;
    }

    // 5. Update the task with supplier_id, optionally transition status
    const updates: Record<string, any> = {
      supplier_id: matchingSupplier.id,
    };
    if (task.status === "not_started") {
      updates.status = "submitted";
    }

    await storage.updateFulfillmentTask(task.id, updates);

    log.info(
      `Auto-assigned supplier "${matchingSupplier.name}" (#${matchingSupplier.id}) to task #${task.id} ("${task.title}")`,
    );

    // 6. Fire supplier dispatch email (sets status context for idempotent dispatch)
    //    Dispatch requires the task to be in "submitted" or "in_progress" state, which we set above.
    try {
      await dispatchTaskToSupplier(task.id);
    } catch (dispatchErr: any) {
      // Don't fail the assignment if dispatch fails — the task is still assigned
      log.warn(`Dispatch email failed for task #${task.id}: ${dispatchErr.message}`);
    }

    // 7. Log to admin activity log
    await storage.logAdminActivity({
      actor_type: "system",
      actor_name: "SupplierAssignment",
      action: "fulfillment.supplier_auto_assigned",
      entity_type: "fulfillment_task",
      entity_id: task.id,
      summary: `Auto-assigned supplier "${matchingSupplier.name}" to task "${task.title}"`,
      metadata: {
        supplier_id: matchingSupplier.id,
        supplier_name: matchingSupplier.name,
        service_id: serviceId,
      },
    });

    return true;
  } catch (err: any) {
    log.error(`Auto-assignment failed for task #${task.id}: ${err.message}`);
    return false;
  }
}
